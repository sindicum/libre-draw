import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LibreDraw } from '../../src/LibreDraw';
import type { LibreDrawEventMap } from '../../src/types/events';
import type { Position } from '../../src/types/features';
import { findPolygonRingError } from '../../src/validation/intersection';
import { FakeMap } from './helpers/fakeMap';

// The fake map projects identically, so a pixel equals a degree. Its canvas
// is 1000 x 600: the reticle sits at (500, 300) and marks
// (500 + dx, 300 + dy) after `map.panTo(dx, dy)`.
const CENTER = { x: 500, y: 300 };

function square(x: number, y: number, size: number): Position[] {
  return [
    [x, y],
    [x + size, y],
    [x + size, y + size],
    [x, y + size],
    [x, y],
  ];
}

function makeSquare(id: string, x = 10, y = 10, size = 60) {
  return {
    id,
    type: 'Feature' as const,
    geometry: { type: 'Polygon' as const, coordinates: [square(x, y, size)] },
    properties: { name: id },
  };
}

function clickAt(map: FakeMap, x: number, y: number): void {
  map
    .getCanvasContainer()
    .dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: x, clientY: y }));
  window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: x, clientY: y }));
}

/** Planar area of a closed ring. */
function area(ring: Position[]): number {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    sum += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return Math.abs(sum / 2);
}

// Dips into the bottom edge of 'p' (10..70) between x = 30 and 50.
const NOTCH: Position[] = [
  [30, 0],
  [30, 30],
  [50, 30],
  [50, 0],
];

describe('reshape (F-026)', () => {
  let map: FakeMap;
  let draw: LibreDraw;
  let events: Array<{ type: string; payload: unknown }>;

  function record<K extends keyof LibreDrawEventMap>(...types: K[]): void {
    for (const type of types) {
      draw.on(type, (payload) => events.push({ type, payload }));
    }
  }

  function rings(id: string): Position[][] {
    const feature = draw.getFeatureById(id);
    if (!feature || feature.geometry.type !== 'Polygon') throw new Error(`no polygon ${id}`);
    return feature.geometry.coordinates;
  }

  function start(options: ConstructorParameters<typeof LibreDraw>[1] = {}): void {
    map = new FakeMap();
    document.body.appendChild(map.getContainer());
    draw = new LibreDraw(map.asMap(), { toolbar: false, snap: false, ...options });
    draw.addFeatures([makeSquare('p')]);
    events = [];
    record('create', 'update', 'delete', 'reshape', 'reshapefailed');
  }

  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', ((cb: FrameRequestCallback): number => {
      cb(0);
      return 1;
    }) as typeof requestAnimationFrame);
  });

  afterEach(() => {
    draw.destroy();
    map.getContainer().remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('reshape() API', () => {
    beforeEach(() => start());

    it('removes area, reports reshape with origin api, and undoes / redoes it as updates', () => {
      const result = draw.reshape('p', NOTCH);

      if (!result.ok) throw new Error(result.reason);
      expect(result.updated[0].id).toBe('p');
      expect(area(rings('p')[0])).toBeCloseTo(3200);
      expect(events.map((e) => e.type)).toEqual(['reshape']);
      expect(events[0].payload).toMatchObject({ origin: 'api' });

      events = [];
      expect(draw.undo()).toBe(true);
      expect(rings('p')).toEqual([square(10, 10, 60)]);
      expect(events.map((e) => e.type)).toEqual(['update']);

      events = [];
      expect(draw.redo()).toBe(true);
      expect(area(rings('p')[0])).toBeCloseTo(3200);
      expect(events.map((e) => e.type)).toEqual(['update']);
    });

    it('adds area with a line outside the polygon', () => {
      const result = draw.reshape('p', [
        [60, 30],
        [90, 30],
        [90, 50],
        [60, 50],
      ]);

      if (!result.ok) throw new Error(result.reason);
      expect(area(rings('p')[0])).toBeCloseTo(3600 + 20 * 20);
    });

    it('keeps a hole and refuses a line that would leave it outside', () => {
      draw.cut('p', square(50, 50, 10));

      const kept = draw.reshape('p', NOTCH);
      if (!kept.ok) throw new Error(kept.reason);
      expect(rings('p')).toHaveLength(2);
      expect(findPolygonRingError(rings('p'))).toBeNull();

      events = [];
      expect(
        draw.reshape('p', [
          [45, 0],
          [45, 65],
          [65, 65],
          [65, 0],
        ])
      ).toEqual({ ok: false, reason: 'hole-outside' });
      expect(events).toEqual([
        {
          type: 'reshapefailed',
          payload: { reason: 'hole-outside', featureId: 'p', origin: 'api' },
        },
      ]);
    });

    it('fails with invalid-intersection-count, emitting reshapefailed', () => {
      const line: Position[] = [
        [40, 40],
        [90, 40],
      ];
      expect(draw.reshape('p', line)).toEqual({
        ok: false,
        reason: 'invalid-intersection-count',
      });
      expect(events.map((e) => e.type)).toEqual(['reshapefailed']);
      expect(rings('p')).toEqual([square(10, 10, 60)]);
    });

    it('rejects arguments without emitting', () => {
      expect(draw.reshape('nope', NOTCH)).toEqual({ ok: false, reason: 'not-found' });
      expect(draw.reshape('p', [[30, 0]])).toEqual({ ok: false, reason: 'invalid-line' });
      expect(events).toEqual([]);
    });

    it('keeps the mode target when an API reshape changes it in place', () => {
      draw.setMode('reshape');
      clickAt(map, 20, 20);
      expect(draw.getSelectedFeatureIds()).toEqual(['p']);

      const result = draw.reshape('p', NOTCH);

      // The id is kept, so the target stays and a line can still be drawn on it.
      expect(result.ok).toBe(true);
      expect(draw.getSelectedFeatureIds()).toEqual(['p']);
      clickAt(map, 20, 0);
      expect(draw.getDraftVertexCount()).toBe(1);
    });
  });

  describe('reshape mode', () => {
    beforeEach(() => start());

    it('picks the target by click, drafts the line, and reshapes on the last vertex', () => {
      draw.setMode('reshape');
      clickAt(map, 20, 20);

      for (const [x, y] of NOTCH) clickAt(map, x, y);
      expect(draw.getDraftVertexCount()).toBe(4);
      clickAt(map, 50, 0);

      expect(area(rings('p')[0])).toBeCloseTo(3200);
      expect(events.map((e) => e.type)).toEqual(['reshape']);
      expect(events[0].payload).toMatchObject({ origin: 'user' });
      expect(draw.getSelectedFeatureIds()).toEqual([]);
      expect(draw.getMode()).toBe('reshape');
    });

    it('finishes the line with finishDrawing()', () => {
      draw.setMode('reshape');
      clickAt(map, 20, 20);
      for (const [x, y] of NOTCH) clickAt(map, x, y);

      expect(draw.finishDrawing()).toBe(true);
      expect(area(rings('p')[0])).toBeCloseTo(3200);
      expect(events[0].payload).toMatchObject({ origin: 'api' });
    });

    it('keeps the target after a failed line so another can be drawn', () => {
      draw.setMode('reshape');
      clickAt(map, 20, 20);
      clickAt(map, 40, 40);
      clickAt(map, 90, 40);

      expect(draw.finishDrawing()).toBe(false);
      expect(events.map((e) => e.type)).toEqual(['reshapefailed']);
      expect(draw.getSelectedFeatureIds()).toEqual(['p']);
      expect(draw.getDraftVertexCount()).toBe(0);
    });
  });

  describe('reshape mode with the center reticle', () => {
    beforeEach(() => start({ inputMethod: 'reticle' }));

    const reticle = () => map.getContainer().querySelector<HTMLDivElement>('.libre-draw-reticle')!;
    const addPointAt = (lng: number, lat: number) => {
      map.panTo(lng - CENTER.x, lat - CENTER.y);
      map
        .getContainer()
        .querySelector<HTMLButtonElement>('.libre-draw-reticle-bar button[aria-label="Add point"]')!
        .click();
    };

    it('shows no reticle until a target is picked by tap, then drafts with it', () => {
      draw.setMode('reshape');
      expect(reticle().style.display).toBe('none');

      clickAt(map, 20, 20);
      expect(draw.getSelectedFeatureIds()).toEqual(['p']);
      expect(reticle().style.display).not.toBe('none');

      for (const [x, y] of NOTCH) addPointAt(x, y);
      expect(draw.getDraftVertexCount()).toBe(4);
      addPointAt(50, 0);

      expect(area(rings('p')[0])).toBeCloseTo(3200);
      expect(events[0].payload).toMatchObject({ origin: 'user' });
      expect(reticle().style.display).toBe('none');
    });
  });
});
