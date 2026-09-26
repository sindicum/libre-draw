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

describe('cut (F-025)', () => {
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
    record('create', 'update', 'delete', 'cut', 'cutfailed');
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

  describe('cut() API', () => {
    beforeEach(() => start());

    it('cuts a hole, reports cut with origin api, and undoes / redoes it as one step', () => {
      const result = draw.cut('p', square(30, 30, 20).slice(0, 4));

      if (!result.ok) throw new Error(result.reason);
      expect(result.updated[0].id).toBe('p');
      expect(rings('p')).toHaveLength(2);
      expect(findPolygonRingError(rings('p'))).toBeNull();
      expect(events.map((e) => e.type)).toEqual(['cut']);
      expect(events[0].payload).toMatchObject({ origin: 'api' });

      events = [];
      expect(draw.undo()).toBe(true);
      expect(rings('p')).toEqual([square(10, 10, 60)]);
      expect(events.map((e) => e.type)).toEqual(['update']);

      events = [];
      expect(draw.redo()).toBe(true);
      expect(rings('p')).toHaveLength(2);
      expect(events.map((e) => e.type)).toEqual(['cut']);
    });

    it('notches the outer ring in place', () => {
      const result = draw.cut('p', square(60, 60, 20));

      if (!result.ok) throw new Error(result.reason);
      expect(result.updated[0].id).toBe('p');
      expect(rings('p')).toHaveLength(1);
      expect(draw.undo()).toBe(true);
      expect(rings('p')).toEqual([square(10, 10, 60)]);
    });

    it('cuts the polygon apart into new features and restores it on undo', () => {
      const result = draw.cut('p', [
        [35, 0],
        [45, 0],
        [45, 80],
        [35, 80],
      ]);

      if (!result.ok) throw new Error(result.reason);
      expect(result.created).toHaveLength(2);
      expect(draw.getFeatureById('p')).toBeUndefined();
      expect(draw.getFeatures()).toHaveLength(2);
      for (const piece of result.created) expect(piece.properties).toEqual({ name: 'p' });

      events = [];
      expect(draw.undo()).toBe(true);
      expect(draw.getFeatures().map((f) => f.id)).toEqual(['p']);
      expect(events.map((e) => e.type)).toEqual(['delete', 'delete', 'create']);

      events = [];
      expect(draw.redo()).toBe(true);
      expect(draw.getFeatures()).toHaveLength(2);
      expect(events.map((e) => e.type)).toEqual(['cut']);
    });

    it('cuts a polygon that already has a hole', () => {
      draw.cut('p', square(20, 20, 10));
      const result = draw.cut('p', square(50, 50, 10));

      if (!result.ok) throw new Error(result.reason);
      expect(rings('p')).toHaveLength(3);
      expect(findPolygonRingError(rings('p'))).toBeNull();
    });

    it('fails with empty-result, emitting cutfailed, when the cutter covers the polygon', () => {
      expect(draw.cut('p', square(0, 0, 80))).toEqual({ ok: false, reason: 'empty-result' });
      expect(events).toEqual([
        {
          type: 'cutfailed',
          payload: { reason: 'empty-result', featureId: 'p', origin: 'api' },
        },
      ]);
      expect(rings('p')).toEqual([square(10, 10, 60)]);
    });

    it('rejects arguments without emitting', () => {
      expect(draw.cut('nope', square(20, 20, 10))).toEqual({ ok: false, reason: 'not-found' });
      expect(
        draw.cut('p', [
          [20, 20],
          [30, 30],
        ])
      ).toEqual({ ok: false, reason: 'invalid-cutter' });
      expect(events).toEqual([]);
    });

    it('drops the target selection when the cut replaces it', () => {
      draw.setMode('cut');
      clickAt(map, 20, 20);
      expect(draw.getSelectedFeatureIds()).toEqual(['p']);

      draw.cut('p', [
        [35, 0],
        [45, 0],
        [45, 80],
        [35, 80],
      ]);

      expect(draw.getSelectedFeatureIds()).toEqual([]);
    });
  });

  describe('cut mode', () => {
    beforeEach(() => start());

    it('picks the target by click, drafts the cutter, and cuts on the first vertex', () => {
      draw.setMode('cut');
      clickAt(map, 20, 20);

      for (const [x, y] of square(30, 30, 20).slice(0, 4)) clickAt(map, x, y);
      expect(draw.getDraftVertexCount()).toBe(4);
      clickAt(map, 30, 30);

      expect(rings('p')).toHaveLength(2);
      expect(events.map((e) => e.type)).toEqual(['cut']);
      expect(events[0].payload).toMatchObject({ origin: 'user' });
      expect(draw.getSelectedFeatureIds()).toEqual([]);
      expect(draw.getMode()).toBe('cut');
    });

    it('finishes the cutter with finishDrawing()', () => {
      draw.setMode('cut');
      clickAt(map, 20, 20);
      for (const [x, y] of square(30, 30, 20).slice(0, 3)) clickAt(map, x, y);

      expect(draw.finishDrawing()).toBe(true);
      expect(rings('p')).toHaveLength(2);
      expect(events[0].payload).toMatchObject({ origin: 'api' });
    });

    it('does not pick the polygon inside its hole', () => {
      draw.cut('p', square(30, 30, 20));
      draw.setMode('cut');

      clickAt(map, 40, 40);
      expect(draw.getSelectedFeatureIds()).toEqual([]);
    });
  });

  describe('cut mode with the center reticle', () => {
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
      draw.setMode('cut');
      expect(reticle().style.display).toBe('none');

      clickAt(map, 20, 20);
      expect(draw.getSelectedFeatureIds()).toEqual(['p']);
      expect(reticle().style.display).not.toBe('none');

      for (const [x, y] of square(30, 30, 20).slice(0, 4)) addPointAt(x, y);
      expect(draw.getDraftVertexCount()).toBe(4);
      addPointAt(30, 30);

      expect(rings('p')).toHaveLength(2);
      expect(events[0].payload).toMatchObject({ origin: 'user' });
      expect(reticle().style.display).toBe('none');
    });

    it('lets the map pan while drafting and hides the reticle again on Escape', () => {
      draw.setMode('cut');
      map.dragPan.enable.mockClear();
      clickAt(map, 20, 20);
      // The reticle is aimed by moving the map, so picking the target lets it pan.
      expect(map.dragPan.enable).toHaveBeenCalled();
      map.dragPan.disable.mockClear();

      map
        .getCanvasContainer()
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

      expect(draw.getSelectedFeatureIds()).toEqual([]);
      expect(reticle().style.display).toBe('none');
      expect(map.dragPan.disable).toHaveBeenCalled();
    });
  });
});
