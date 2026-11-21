import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LibreDraw } from '../../src/LibreDraw';
import { LONG_PRESS_MS } from '../../src/input/gestures';
import type { EditRejectedEvent, UpdateEvent } from '../../src/types/events';
import type { LibreDrawOptions } from '../../src/types/options';
import type { Position } from '../../src/types/features';
import { FakeMap } from './helpers/fakeMap';

// Contract of the topologicalEditing option: editing a vertex of the
// selected polygon edits every other polygon with a vertex at exactly the
// same position, all or nothing, as one history step. FakeMap maps one pixel
// to one degree.

function pressAt(map: FakeMap, x: number, y: number): void {
  map
    .getCanvasContainer()
    .dispatchEvent(new MouseEvent('mousedown', { clientX: x, clientY: y, button: 0 }));
}

function moveTo(x: number, y: number): void {
  window.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y, button: 0 }));
}

function releaseAt(x: number, y: number): void {
  window.dispatchEvent(new MouseEvent('mouseup', { clientX: x, clientY: y, button: 0 }));
}

function dragFrom(map: FakeMap, from: [number, number], to: [number, number]): void {
  pressAt(map, ...from);
  moveTo(...to);
  releaseAt(...to);
}

function touchAt(map: FakeMap, type: 'touchstart' | 'touchend', x: number, y: number): void {
  const touch = { identifier: 0, clientX: x, clientY: y } as Touch;
  const event = new Event(type, { bubbles: true, cancelable: true }) as TouchEvent;
  Object.defineProperty(event, 'touches', { value: type === 'touchstart' ? [touch] : [] });
  Object.defineProperty(event, 'changedTouches', { value: [touch] });
  map.getCanvasContainer().dispatchEvent(event);
}

function longPressAt(map: FakeMap, x: number, y: number): void {
  touchAt(map, 'touchstart', x, y);
  vi.advanceTimersByTime(LONG_PRESS_MS);
  touchAt(map, 'touchend', x, y);
}

function polygon(id: string, ring: Position[]): GeoJSON.Feature {
  return {
    id,
    type: 'Feature',
    properties: {},
    geometry: { type: 'Polygon', coordinates: [[...ring, ring[0]]] },
  };
}

function ring(draw: LibreDraw, id: string): Position[] {
  const feature = draw.getFeatureById(id);
  if (!feature || feature.geometry.type !== 'Polygon') throw new Error(`no polygon ${id}`);
  return feature.geometry.coordinates[0];
}

// A and B share the edge (50, 10)–(50, 50).
const A: Position[] = [
  [10, 10],
  [50, 10],
  [50, 50],
  [10, 50],
];
const B: Position[] = [
  [50, 10],
  [90, 10],
  [90, 50],
  [50, 50],
];
const closed = (r: Position[]): Position[] => [...r, r[0]];

describe('topological editing', () => {
  let map: FakeMap;
  let draw: LibreDraw;
  let updates: UpdateEvent[];
  let rejected: EditRejectedEvent[];

  function setUp(options: LibreDrawOptions, features: GeoJSON.Feature[]): void {
    map = new FakeMap();
    draw = new LibreDraw(map.asMap(), { toolbar: false, snap: false, ...options });
    draw.setFeatures({ type: 'FeatureCollection', features });
    updates = [];
    rejected = [];
    draw.on('update', (e) => updates.push(e));
    draw.on('editrejected', (e) => rejected.push(e));
    draw.setMode('select');
    draw.selectFeature('A');
  }

  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', ((cb: FrameRequestCallback): number => {
      cb(0);
      return 1;
    }) as typeof requestAnimationFrame);
  });

  afterEach(() => {
    draw.destroy();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('is off by default and reports the setting', () => {
    setUp({}, [polygon('A', A), polygon('B', B)]);
    expect(draw.getTopologicalEditing()).toBe(false);

    dragFrom(map, [50, 10], [60, 5]);

    expect(ring(draw, 'A')[1]).toEqual([60, 5]);
    expect(ring(draw, 'B')).toEqual(closed(B));
    expect(updates.map((e) => e.feature.id)).toEqual(['A']);
  });

  it('moves a shared vertex in both polygons and undoes them in one step', () => {
    setUp({ topologicalEditing: true }, [polygon('A', A), polygon('B', B)]);
    expect(draw.getTopologicalEditing()).toBe(true);

    dragFrom(map, [50, 10], [60, 5]);

    expect(ring(draw, 'A')[1]).toEqual([60, 5]);
    expect(ring(draw, 'B')[0]).toEqual([60, 5]);
    expect(ring(draw, 'B')[4]).toEqual([60, 5]);
    expect(updates.map((e) => e.feature.id)).toEqual(['A', 'B']);
    expect(updates.every((e) => e.origin === 'user')).toBe(true);

    expect(draw.undo()).toBe(true);
    expect(ring(draw, 'A')).toEqual(closed(A));
    expect(ring(draw, 'B')).toEqual(closed(B));
    expect(draw.canUndo()).toBe(false);
  });

  it('inserts a vertex on a shared edge in both polygons', () => {
    setUp({ topologicalEditing: true }, [polygon('A', A), polygon('B', B)]);

    dragFrom(map, [50, 30], [55, 30]);

    expect(ring(draw, 'A')).toEqual(
      closed([
        [10, 10],
        [50, 10],
        [55, 30],
        [50, 50],
        [10, 50],
      ])
    );
    expect(ring(draw, 'B')).toEqual(
      closed([
        [50, 10],
        [90, 10],
        [90, 50],
        [50, 50],
        [55, 30],
      ])
    );

    draw.undo();
    expect(ring(draw, 'A')).toEqual(closed(A));
    expect(ring(draw, 'B')).toEqual(closed(B));
  });

  it('deletes a shared vertex from both polygons', () => {
    vi.useFakeTimers();
    setUp({ topologicalEditing: true }, [polygon('A', A), polygon('B', B)]);

    longPressAt(map, 50, 10);

    expect(ring(draw, 'A')).toEqual(
      closed([
        [10, 10],
        [50, 50],
        [10, 50],
      ])
    );
    expect(ring(draw, 'B')).toEqual(
      closed([
        [90, 10],
        [90, 50],
        [50, 50],
      ])
    );
    expect(updates.map((e) => e.feature.id)).toEqual(['A', 'B']);

    draw.undo();
    expect(ring(draw, 'A')).toEqual(closed(A));
    expect(ring(draw, 'B')).toEqual(closed(B));
  });

  it('refuses a move that would make the other polygon invalid', () => {
    setUp({ topologicalEditing: true }, [polygon('A', A), polygon('B', B)]);

    dragFrom(map, [50, 10], [95, 30]);

    expect(rejected).toEqual([
      { action: 'move-vertex', reason: 'self-intersection', featureId: 'B', origin: 'user' },
    ]);
    expect(ring(draw, 'A')).toEqual(closed(A));
    expect(ring(draw, 'B')).toEqual(closed(B));
    expect(draw.canUndo()).toBe(false);
  });

  it('refuses a delete that would leave the other polygon too few vertices', () => {
    vi.useFakeTimers();
    const triangle: Position[] = [
      [50, 10],
      [90, 30],
      [50, 50],
    ];
    setUp({ topologicalEditing: true }, [polygon('A', A), polygon('B', triangle)]);

    longPressAt(map, 50, 10);

    expect(rejected).toEqual([
      { action: 'delete-vertex', reason: 'invalid-result', featureId: 'B', origin: 'user' },
    ]);
    expect(ring(draw, 'A')).toEqual(closed(A));
    expect(ring(draw, 'B')).toEqual(closed(triangle));
    expect(draw.canUndo()).toBe(false);
  });

  it('leaves a vertex that is off by any amount, and lines, alone', () => {
    const offB: Position[] = [
      [50, 10.000001],
      [90, 10],
      [90, 50],
      [50, 50],
    ];
    const line: GeoJSON.Feature = {
      id: 'L',
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: [
          [50, 10],
          [50, 0],
        ],
      },
    };
    setUp({ topologicalEditing: true }, [polygon('A', A), polygon('B', offB), line]);

    dragFrom(map, [50, 10], [60, 5]);

    expect(ring(draw, 'A')[1]).toEqual([60, 5]);
    expect(ring(draw, 'B')).toEqual(closed(offB));
    expect(draw.getFeatureById('L')?.geometry.coordinates).toEqual([
      [50, 10],
      [50, 0],
    ]);
  });

  it('does not link moving the whole polygon or API edits', () => {
    setUp({ topologicalEditing: true }, [polygon('A', A), polygon('B', B)]);

    dragFrom(map, [30, 30], [25, 30]);
    expect(ring(draw, 'A')[1]).toEqual([45, 10]);
    expect(ring(draw, 'B')).toEqual(closed(B));

    const moved: Position[] = [
      [10, 10],
      [40, 10],
      [50, 50],
      [10, 50],
    ];
    draw.updateFeature('A', { geometry: { type: 'Polygon', coordinates: [closed(moved)] } });
    expect(ring(draw, 'B')).toEqual(closed(B));
  });

  it('applies a toggle from the next drag, not to one in progress', () => {
    setUp({}, [polygon('A', A), polygon('B', B)]);

    draw.setTopologicalEditing(true);
    pressAt(map, 50, 10);
    draw.setTopologicalEditing(false);
    moveTo(60, 5);
    releaseAt(60, 5);
    expect(ring(draw, 'B')[0]).toEqual([60, 5]);

    dragFrom(map, [60, 5], [65, 5]);
    expect(ring(draw, 'A')[1]).toEqual([65, 5]);
    expect(ring(draw, 'B')[0]).toEqual([60, 5]);
  });

  it('puts both polygons back when the drag is interrupted', () => {
    setUp({ topologicalEditing: true }, [polygon('A', A), polygon('B', B)]);

    pressAt(map, 50, 10);
    moveTo(60, 5);
    expect(ring(draw, 'B')[0]).toEqual([60, 5]);
    draw.clearSelection();
    releaseAt(60, 5);

    expect(ring(draw, 'A')).toEqual(closed(A));
    expect(ring(draw, 'B')).toEqual(closed(B));
    expect(updates).toEqual([]);
  });

  it('does not snap the dragged vertex to the polygons that move with it', () => {
    setUp({ topologicalEditing: true, snap: true }, [polygon('A', A), polygon('B', B)]);

    dragFrom(map, [50, 10], [55, 12]);

    expect(ring(draw, 'A')[1]).toEqual([55, 12]);
    expect(ring(draw, 'B')[0]).toEqual([55, 12]);
  });

  it('refuses a delete that would make the other polygon cross itself', () => {
    vi.useFakeTimers();
    const notched: Position[] = [
      [50, 10],
      [90, 10],
      [70, 20],
      [90, 50],
      [50, 50],
    ];
    setUp({ topologicalEditing: true }, [polygon('A', A), polygon('B', notched)]);

    longPressAt(map, 50, 10);

    expect(rejected).toEqual([
      { action: 'delete-vertex', reason: 'self-intersection', featureId: 'B', origin: 'user' },
    ]);
    expect(ring(draw, 'A')).toEqual(closed(A));
    expect(ring(draw, 'B')).toEqual(closed(notched));
    expect(draw.canUndo()).toBe(false);
  });

  it('puts both polygons back when rounding at the drop breaks only the other one', () => {
    const thin: Position[] = [
      [50, 10],
      [60, 10],
      [60, 20],
      [51, 11],
    ];
    setUp({ topologicalEditing: true, coordinatePrecision: 0 }, [
      polygon('A', A),
      polygon('B', thin),
    ]);

    dragFrom(map, [50, 10], [50.6, 10.6]);

    expect(rejected).toEqual([
      { action: 'move-vertex', reason: 'invalid-result', featureId: 'B', origin: 'user' },
    ]);
    expect(ring(draw, 'A')).toEqual(closed(A));
    expect(ring(draw, 'B')).toEqual(closed(thin));
    expect(draw.canUndo()).toBe(false);
  });

  it('rounds the shared vertex to the same value in both polygons', () => {
    setUp({ topologicalEditing: true, coordinatePrecision: 3 }, [polygon('A', A), polygon('B', B)]);

    dragFrom(map, [50, 10], [60.123456, 5.987654]);

    expect(ring(draw, 'A')[1]).toEqual([60.123, 5.988]);
    expect(ring(draw, 'B')[0]).toEqual([60.123, 5.988]);
    expect(ring(draw, 'B')[4]).toEqual([60.123, 5.988]);
  });

  it('deletes the other polygon mid-drag with its committed shape', () => {
    setUp({ topologicalEditing: true, coordinatePrecision: 3 }, [polygon('A', A), polygon('B', B)]);
    const deleted: GeoJSON.Feature[] = [];
    draw.on('delete', (e) => deleted.push(e.feature));

    pressAt(map, 50, 10);
    moveTo(60.12345, 5.12345);
    const removed = draw.deleteFeature('B');
    releaseAt(60.12345, 5.12345);

    expect((removed?.geometry as GeoJSON.Polygon).coordinates[0]).toEqual(closed(B));
    expect((deleted[0].geometry as GeoJSON.Polygon).coordinates[0]).toEqual(closed(B));
    expect(ring(draw, 'A')).toEqual(closed(A));
    expect(draw.undo()).toBe(true);
    expect(ring(draw, 'B')).toEqual(closed(B));
    expect(updates).toEqual([]);
  });

  it('keeps the drag when an unrelated polygon is deleted mid-drag', () => {
    const C: Position[] = [
      [100, 60],
      [120, 60],
      [120, 80],
    ];
    setUp({ topologicalEditing: true }, [polygon('A', A), polygon('B', B), polygon('C', C)]);

    pressAt(map, 50, 10);
    moveTo(60, 5);
    draw.deleteFeature('C');
    releaseAt(60, 5);

    expect(ring(draw, 'A')[1]).toEqual([60, 5]);
    expect(ring(draw, 'B')[0]).toEqual([60, 5]);
    expect(updates.map((e) => e.feature.id)).toEqual(['A', 'B']);
    expect(draw.undo()).toBe(true);
    expect(ring(draw, 'A')).toEqual(closed(A));
    expect(ring(draw, 'B')).toEqual(closed(B));
  });
});
