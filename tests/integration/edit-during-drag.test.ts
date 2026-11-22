import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import turfArea from '@turf/area';
import { LibreDraw } from '../../src/LibreDraw';
import { SOURCE_IDS } from '../../src/rendering/layers';
import type { LibreDrawEventMap } from '../../src/types/events';
import type { LibreDrawOptions } from '../../src/types/options';
import type { Position } from '../../src/types/features';
import { FakeMap } from './helpers/fakeMap';

// A public call that changes the store while a drag or preview is in
// progress cancels it first: every dragged feature goes back to its shape at
// drag start, without history or events, and only then does the call run.
// FakeMap maps one pixel to one degree.

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

function polygon(id: string, ring: Position[]): GeoJSON.Feature {
  return {
    id,
    type: 'Feature',
    properties: {},
    geometry: { type: 'Polygon', coordinates: [[...ring, ring[0]]] },
  };
}

function point(id: string, position: Position): GeoJSON.Feature {
  return {
    id,
    type: 'Feature',
    properties: {},
    geometry: { type: 'Point', coordinates: position },
  };
}

const closed = (r: Position[]): Position[] => [...r, r[0]];

// A and B share the edge (50, 10)–(50, 50); C stands apart.
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
const C: Position[] = [
  [100, 60],
  [140, 60],
  [140, 85],
  [100, 85],
];

type Recorded = { type: keyof LibreDrawEventMap; id?: string };

describe('a store change from outside during a drag', () => {
  let map: FakeMap;
  let draw: LibreDraw;
  let events: Recorded[];

  function setUp(
    options: LibreDrawOptions = {},
    features = [polygon('A', A), polygon('B', B), polygon('C', C)]
  ): void {
    map = new FakeMap();
    draw = new LibreDraw(map.asMap(), { toolbar: false, snap: false, ...options });
    expect(draw.setFeatures({ type: 'FeatureCollection', features }).ok).toBe(true);
    events = [];
    for (const type of ['create', 'update', 'delete', 'rotate'] as const) {
      draw.on(type, (e) => events.push({ type, id: 'feature' in e ? e.feature.id : undefined }));
    }
  }

  function shape(id: string): Position[] | Position | undefined {
    const feature = draw.getFeatureById(id);
    if (!feature) return undefined;
    if (feature.geometry.type === 'Polygon') return feature.geometry.coordinates[0];
    return feature.geometry.coordinates as Position;
  }

  /** Positions of the vertex handles drawn on the map. */
  function handlePositions(): Position[] {
    return (map.getSourceData(SOURCE_IDS.EDIT_VERTICES)?.features ?? [])
      .filter((f) => f.geometry.type === 'Point')
      .map((f) => (f.geometry as GeoJSON.Point).coordinates as Position);
  }

  /** Start dragging the shared vertex of A (and, linked, of B) to (60, 5). */
  function dragSharedVertex(): void {
    draw.setMode('select');
    draw.selectFeature('A');
    pressAt(map, 50, 10);
    moveTo(60, 5);
    expect(shape('A')).toContainEqual([60, 5]); // the preview is in the store
  }

  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', ((cb: FrameRequestCallback): number => {
      cb(0);
      return 1;
    }) as typeof requestAnimationFrame);
  });

  afterEach(() => {
    draw.destroy();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('records the drag-start shape as the old shape of an update to the dragged feature', () => {
    setUp({ topologicalEditing: true });
    dragSharedVertex();
    const updates: GeoJSON.Feature[] = [];
    draw.on('update', (e) => updates.push(e.oldFeature));

    const result = draw.updateFeature('A', { properties: { crop: 'wheat' } });
    releaseAt(60, 5);

    expect(result.ok).toBe(true);
    expect((updates[0].geometry as GeoJSON.Polygon).coordinates[0]).toEqual(closed(A));
    expect(shape('A')).toEqual(closed(A));
    // The linked polygon is back too, with nothing recorded for it.
    expect(shape('B')).toEqual(closed(B));
    expect(events).toEqual([{ type: 'update', id: 'A' }]);

    draw.undo();
    expect(shape('A')).toEqual(closed(A));
    expect(draw.getFeatureById('A')!.properties).toEqual({});
    expect(draw.canUndo()).toBe(false);
  });

  it('puts the dragged features back when another feature is updated, leaving no trace', () => {
    setUp({ topologicalEditing: true });
    dragSharedVertex();

    draw.updateFeature('C', { properties: { name: 'c' } });
    moveTo(70, 0);
    releaseAt(70, 0);

    expect(shape('A')).toEqual(closed(A));
    expect(shape('B')).toEqual(closed(B));
    expect(events).toEqual([{ type: 'update', id: 'C' }]);
    draw.undo();
    expect(draw.canUndo()).toBe(false);
  });

  it('puts a whole-body drag back on addFeatures', () => {
    setUp();
    draw.setMode('select');
    draw.selectFeature('C');
    pressAt(map, 120, 72);
    moveTo(125, 77);
    expect(shape('C')).toContainEqual([105, 65]);

    draw.addFeatures([point('P', [0, 0])]);
    releaseAt(130, 80);

    expect(shape('C')).toEqual(closed(C));
    expect(events).toEqual([{ type: 'create', id: 'P' }]);
  });

  it('puts a multi-selection drag back on undo, then undoes the last step', () => {
    setUp();
    draw.updateFeature('C', { properties: { name: 'c' } });
    events = [];
    draw.setMode('select');
    draw.selectFeatures(['A', 'B']);
    pressAt(map, 30, 30);
    moveTo(33, 33);
    expect(shape('A')).toContainEqual([13, 13]);

    expect(draw.undo()).toBe(true);
    releaseAt(36, 36);

    expect(shape('A')).toEqual(closed(A));
    expect(shape('B')).toEqual(closed(B));
    expect(draw.getFeatureById('C')!.properties).toEqual({});
    expect(events).toEqual([{ type: 'update', id: 'C' }]); // the undo's own event
    expect(draw.canUndo()).toBe(false);
  });

  it('puts a point drag back on redo', () => {
    setUp({}, [point('P', [20, 20]), polygon('C', C)]);
    draw.updateFeature('C', { properties: { name: 'c' } });
    draw.undo();
    events = [];
    draw.setMode('select');
    draw.selectFeature('P');
    pressAt(map, 20, 20);
    moveTo(25, 25);
    expect(shape('P')).toEqual([25, 25]);

    expect(draw.redo()).toBe(true);
    releaseAt(25, 25);

    expect(shape('P')).toEqual([20, 20]);
    expect(events).toEqual([{ type: 'update', id: 'C' }]);
  });

  it('keeps the drag when undo or redo has nothing to do', () => {
    setUp();
    draw.setMode('select');
    draw.selectFeature('C');
    pressAt(map, 120, 72);
    moveTo(125, 77);

    expect(draw.undo()).toBe(false);
    expect(draw.redo()).toBe(false);
    releaseAt(125, 77);

    expect(shape('C')).toContainEqual([105, 65]);
    expect(events).toEqual([{ type: 'update', id: 'C' }]);
  });

  it.each<[string, (draw: LibreDraw) => unknown]>([
    ['updateFeature', (d) => d.updateFeature('C', { properties: { n: 1 } })],
    ['rotate', (d) => d.rotate('C', 90)],
    [
      'split',
      (d) =>
        d.split('C', [
          [120, 50],
          [120, 90],
        ]),
    ],
    ['setback', (d) => d.setback('C', { index: 0 }, 1000)],
    ['union', (d) => d.union(['A', 'B'])],
    [
      'cut',
      (d) =>
        d.cut('C', [
          [110, 65],
          [130, 65],
          [130, 80],
          [110, 80],
        ]),
    ],
    [
      'reshape',
      (d) =>
        d.reshape('C', [
          [120, 50],
          [120, 70],
          [150, 70],
        ]),
    ],
    ['deleteFeature', (d) => d.deleteFeature('C')],
    ['addFeatures', (d) => d.addFeatures([point('P', [0, 0])])],
  ])('%s cancels a vertex drag of another feature, leaving nothing to commit', (_, call) => {
    setUp({ topologicalEditing: true });
    dragSharedVertex();

    call(draw);
    const before = events.length;
    moveTo(70, 0);
    releaseAt(70, 0);

    if (draw.getFeatureById('A')) {
      expect(shape('A')).toEqual(closed(A));
      expect(shape('B')).toEqual(closed(B));
    } else {
      // Union replaced A and B: it merged their start shapes, not the preview.
      const merged = draw.getFeatures().find((f) => f.id !== 'C')!;
      const ring = (merged.geometry as GeoJSON.Polygon).coordinates[0];
      expect(ring).not.toContainEqual([60, 5]);
      expect(ring).toContainEqual([10, 10]);
      expect(ring).toContainEqual([90, 10]);
    }
    // Neither the call nor the release recorded the abandoned drag.
    expect(events.slice(before)).toEqual([]);
    expect(events.filter((e) => e.type === 'update' && (e.id === 'A' || e.id === 'B'))).toEqual([]);
  });

  it.each<[string, (draw: LibreDraw) => unknown]>([
    ['addFeatures', (d) => d.addFeatures([point('P', [0, 0])])],
    ['deleteFeature of another feature', (d) => d.deleteFeature('C')],
    ['a failing updateFeature', (d) => d.updateFeature('missing', { properties: {} })],
  ])('%s puts the vertex handles back with the shape', (_, call) => {
    setUp();
    dragSharedVertex();
    expect(handlePositions()).toContainEqual([60, 5]);

    call(draw);

    expect(shape('A')).toEqual(closed(A));
    expect(handlePositions()).not.toContainEqual([60, 5]);
    expect(handlePositions()).toContainEqual([50, 10]);
  });

  it.each<[string, (draw: LibreDraw) => unknown]>([
    ['updateFeature of an unknown id', (d) => d.updateFeature('missing', { properties: {} })],
    ['setFeatures with invalid input', (d) => d.setFeatures({ type: 'nope' })],
    ['addFeatures with only invalid entries', (d) => d.addFeatures([{ type: 'nope' }])],
    ['deleteFeature of an unknown id', (d) => d.deleteFeature('missing')],
  ])('%s cancels the drag although it changes nothing', (_, call) => {
    setUp({ topologicalEditing: true });
    dragSharedVertex();

    call(draw);
    moveTo(70, 0);
    releaseAt(70, 0);

    expect(shape('A')).toEqual(closed(A));
    expect(shape('B')).toEqual(closed(B));
    expect(events).toEqual([]);
    expect(draw.canUndo()).toBe(false);
  });

  it('getArea during a vertex drag measures the unrounded shape on screen, then the committed one', () => {
    setUp({ coordinatePrecision: 0 });
    const start = draw.getArea('A')!;
    draw.setMode('select');
    draw.selectFeature('A');
    pressAt(map, 50, 10);
    moveTo(60.4, 5.4);

    // The preview is not rounded yet, and getArea follows it.
    const preview = draw.getFeatureById('A')!;
    expect(shape('A')).toContainEqual([60.4, 5.4]);
    expect(draw.getArea('A')).toBe(turfArea(preview));
    expect(draw.getArea('A')).not.toBe(start);

    releaseAt(60.4, 5.4);
    // Dropped: rounded to whole degrees, and the area of the stored shape.
    expect(shape('A')).toContainEqual([60, 5]);
    expect(draw.getArea('A')).toBe(turfArea(draw.getFeatureById('A')!));
  });

  it('setFeatures reports the drag-start shape as the deleted feature', () => {
    setUp({ topologicalEditing: true });
    dragSharedVertex();

    const result = draw.setFeatures({ type: 'FeatureCollection', features: [polygon('C', C)] });
    releaseAt(60, 5);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const deletedA = result.deleted.find((f) => f.id === 'A')!;
    expect((deletedA.geometry as GeoJSON.Polygon).coordinates[0]).toEqual(closed(A));
    const deletedB = result.deleted.find((f) => f.id === 'B')!;
    expect((deletedB.geometry as GeoJSON.Polygon).coordinates[0]).toEqual(closed(B));
  });

  it('drops a typed-angle preview from the toolbar when features are added', () => {
    map = new FakeMap();
    draw = new LibreDraw(map.asMap(), { toolbar: true, snap: false });
    draw.setFeatures({ type: 'FeatureCollection', features: [polygon('C', C)] });
    events = [];
    draw.on('update', (e) => events.push({ type: 'update', id: e.feature.id }));
    draw.on('rotate', (e) => events.push({ type: 'rotate', id: e.feature.id }));
    draw.setMode('rotate');
    pressAt(map, 120, 72); // a click picks the rotation target
    releaseAt(120, 72);
    expect(draw.getMode()).toBe('rotate');
    const control = map.getContainer().querySelector<HTMLDivElement>('.libre-draw-rotate-input')!;
    const input = control.querySelector('input')!;
    input.value = '45';
    input.dispatchEvent(new Event('input'));
    expect(shape('C')).not.toEqual(closed(C)); // the typed-angle preview

    draw.addFeatures([point('P', [0, 0])]);

    expect(shape('C')).toEqual(closed(C));
    expect(draw.getSelectedFeatureIds()).toEqual(['C']);
    expect(events).toEqual([]);
    // The preview was the only change: one undo takes back the addFeatures.
    draw.undo();
    expect(draw.canUndo()).toBe(false);
    expect(shape('C')).toEqual(closed(C));
  });

  it('puts a rotate drag back when the target is updated', () => {
    setUp();
    draw.setMode('rotate');
    // A click picks the rotation target (selectFeature would switch to select mode).
    pressAt(map, 120, 72);
    releaseAt(120, 72);
    expect(draw.getMode()).toBe('rotate');
    const olds: GeoJSON.Feature[] = [];
    draw.on('update', (e) => olds.push(e.oldFeature));
    pressAt(map, 135, 72);
    moveTo(120, 82);
    expect(shape('C')).not.toEqual(closed(C)); // the rotated preview

    draw.updateFeature('C', { properties: { name: 'c' } });
    moveTo(105, 72);
    releaseAt(105, 72);

    expect((olds[0].geometry as GeoJSON.Polygon).coordinates[0]).toEqual(closed(C));
    expect(shape('C')).toEqual(closed(C));
    expect(events).toEqual([{ type: 'update', id: 'C' }]);
  });
});
