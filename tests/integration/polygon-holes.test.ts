import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LibreDraw } from '../../src/LibreDraw';
import type { ModeName } from '../../src/types/modes';
import type { Position } from '../../src/types/features';
import { findPolygonRingError } from '../../src/validation/intersection';
import { FakeMap } from './helpers/fakeMap';

// The fake map projects identically, so a pixel equals a degree.
const OUTER: Position[] = [
  [10, 10],
  [70, 10],
  [70, 70],
  [10, 70],
  [10, 10],
];
const HOLE: Position[] = [
  [30, 30],
  [30, 50],
  [50, 50],
  [50, 30],
  [30, 30],
];

function makeHoled(id: string, hole: Position[] = HOLE) {
  return {
    id,
    type: 'Feature' as const,
    geometry: { type: 'Polygon' as const, coordinates: [OUTER, hole] },
    properties: {},
  };
}

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

function clickAt(map: FakeMap, x: number, y: number): void {
  pressAt(map, x, y);
  releaseAt(x, y);
}

function dragFrom(map: FakeMap, from: [number, number], to: [number, number]): void {
  pressAt(map, ...from);
  moveTo(...to);
  releaseAt(...to);
}

function ringsOf(draw: LibreDraw, id: string): Position[][] {
  const feature = draw.getFeatureById(id);
  if (!feature || feature.geometry.type !== 'Polygon') throw new Error(`no polygon ${id}`);
  return feature.geometry.coordinates;
}

describe('polygons with holes (F-024)', () => {
  let map: FakeMap;
  let draw: LibreDraw;

  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', ((cb: FrameRequestCallback): number => {
      cb(0);
      return 1;
    }) as typeof requestAnimationFrame);
    map = new FakeMap();
    draw = new LibreDraw(map.asMap(), { toolbar: false, snap: false });
    draw.addFeatures([makeHoled('p')]);
  });

  afterEach(() => {
    draw.destroy();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('edits a hole vertex in select mode and undoes / redoes it as one step', () => {
    const onUpdate = vi.fn();
    draw.on('update', onUpdate);
    draw.setMode('select');
    clickAt(map, 20, 20); // select via the body

    dragFrom(map, [30, 30], [25, 25]);

    expect(ringsOf(draw, 'p')[1][0]).toEqual([25, 25]);
    expect(ringsOf(draw, 'p')[0]).toEqual(OUTER);
    expect(onUpdate).toHaveBeenCalledTimes(1);

    expect(draw.undo()).toBe(true);
    expect(ringsOf(draw, 'p')[1]).toEqual(HOLE);
    expect(draw.redo()).toBe(true);
    expect(ringsOf(draw, 'p')[1][0]).toEqual([25, 25]);
  });

  it('inserts a vertex from a hole midpoint and undoes it as one step', () => {
    // Edges of 40px keep each midpoint beyond the 10px vertex hit radius.
    const wide: Position[] = [
      [20, 20],
      [20, 60],
      [60, 60],
      [60, 20],
      [20, 20],
    ];
    draw.setFeatures({ type: 'FeatureCollection', features: [makeHoled('p', wide)] });
    draw.setMode('select');
    clickAt(map, 15, 15);

    dragFrom(map, [20, 40], [15, 40]);

    expect(ringsOf(draw, 'p')[1]).toHaveLength(6);
    expect(ringsOf(draw, 'p')[1][1]).toEqual([15, 40]);
    expect(draw.undo()).toBe(true);
    expect(ringsOf(draw, 'p')).toEqual([OUTER, wide]);
  });

  it('refuses a drag that would move the hole across the outer ring', () => {
    draw.setMode('select');
    clickAt(map, 20, 20);

    dragFrom(map, [50, 50], [80, 50]);

    expect(ringsOf(draw, 'p')[1]).toEqual(HOLE);
    expect(draw.undo()).toBe(true); // only the addFeatures step is in the history
    expect(draw.getFeatures()).toHaveLength(0);
  });

  it('moves the hole with the body and restores both rings on undo', () => {
    draw.setMode('select');
    clickAt(map, 20, 20);

    dragFrom(map, [20, 20], [25, 22]);

    expect(ringsOf(draw, 'p')[0][0]).toEqual([15, 12]);
    expect(ringsOf(draw, 'p')[1][0]).toEqual([35, 32]);
    draw.undo();
    expect(ringsOf(draw, 'p')).toEqual([OUTER, HOLE]);
  });

  it('rotates the hole together with the outer ring', () => {
    const result = draw.rotate('p', 30);

    expect(result.ok).toBe(true);
    const rings = ringsOf(draw, 'p');
    expect(rings).toHaveLength(2);
    expect(rings[1]).not.toEqual(HOLE);
    expect(findPolygonRingError(rings)).toBeNull();
  });

  it.each<ModeName>(['select', 'split', 'setback', 'rotate', 'union'])(
    '%s mode does not hit the polygon inside its hole',
    (mode) => {
      draw.setMode(mode);

      clickAt(map, 40, 40);
      expect(draw.getSelectedFeatureIds()).toEqual([]);

      clickAt(map, 20, 20);
      expect(draw.getSelectedFeatureIds()).toEqual(['p']);
    }
  );

  it('keeps rejecting split, setback, and union on a polygon with a hole', () => {
    draw.addFeatures([
      {
        id: 'q',
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [70, 10],
              [80, 10],
              [80, 70],
              [70, 70],
              [70, 10],
            ],
          ],
        },
        properties: {},
      },
    ]);

    expect(
      draw.split('p', [
        [40, 0],
        [40, 80],
      ])
    ).toEqual({ ok: false, reason: 'has-holes' });
    expect(draw.setback('p', { index: 0 }, 1)).toEqual({ ok: false, reason: 'has-holes' });
    expect(draw.union(['p', 'q'])).toEqual({ ok: false, reason: 'has-holes' });
  });

  it('rejects input whose hole is outside the outer ring or crosses it', () => {
    const outside = draw.addFeatures([
      makeHoled('out', [
        [80, 30],
        [80, 40],
        [85, 40],
        [85, 30],
        [80, 30],
      ]),
    ]);
    expect(outside[0]).toMatchObject({ valid: false });

    const result = draw.updateFeature('p', {
      geometry: {
        type: 'Polygon',
        coordinates: [
          OUTER,
          [
            [60, 60],
            [60, 80],
            [80, 80],
            [80, 60],
            [60, 60],
          ],
        ],
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch('Polygon rings intersect');
  });
});
