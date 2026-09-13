import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LibreDraw } from '../../src/LibreDraw';
import { LibreDrawError } from '../../src/core/errors';
import { SOURCE_IDS } from '../../src/rendering/SourceManager';
import type {
  SetbackEvent,
  SplitEvent,
  SplitFailedEvent,
  UnionEvent,
} from '../../src/types/events';
import type { Position } from '../../src/types/features';
import { FakeMap } from './helpers/fakeMap';

function makeSquare(id: string, x = 10, y = 10, size = 20) {
  return {
    id,
    type: 'Feature' as const,
    geometry: {
      type: 'Polygon' as const,
      coordinates: [
        [
          [x, y],
          [x + size, y],
          [x + size, y + size],
          [x, y + size],
          [x, y],
        ] as Position[],
      ],
    },
    properties: { name: id },
  };
}

/** A click on the map canvas (mousedown on the canvas, mouseup on window). */
function clickAt(map: FakeMap, x: number, y: number): void {
  const canvas = map.getCanvasContainer();
  canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: x, clientY: y, button: 0 }));
  window.dispatchEvent(new MouseEvent('mouseup', { clientX: x, clientY: y, button: 0 }));
}

function ringOf(draw: LibreDraw, id: string): Position[] {
  const feature = draw.getFeatureById(id);
  if (!feature || feature.geometry.type !== 'Polygon') throw new Error(`no polygon ${id}`);
  return feature.geometry.coordinates[0];
}

function ids(draw: LibreDraw): string[] {
  return draw
    .getFeatures()
    .map((f) => f.id)
    .sort();
}

describe('geometry operation API (split / setback / union)', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', ((cb: FrameRequestCallback): number => {
      cb(0);
      return 1;
    }) as typeof requestAnimationFrame);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('split()', () => {
    it('splits into two features, emits split with origin api, and undoes as one step', () => {
      const draw = new LibreDraw(new FakeMap().asMap(), { toolbar: false });
      draw.addFeatures([makeSquare('a')]);
      const splitListener = vi.fn();
      draw.on('split', splitListener);

      const result = draw.split('a', [
        [20, 0],
        [20, 40],
      ]);

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('expected success');
      expect(result.created).toHaveLength(2);
      expect(result.deleted.map((f) => f.id)).toEqual(['a']);
      expect(draw.getFeatureById('a')).toBeUndefined();
      expect(ids(draw)).toEqual(result.created.map((f) => f.id).sort());

      expect(splitListener).toHaveBeenCalledTimes(1);
      const event = splitListener.mock.calls[0][0] as SplitEvent;
      expect(event.origin).toBe('api');
      expect(event.originalFeature.id).toBe('a');
      expect(event.features.map((f) => f.id)).toEqual(result.created.map((f) => f.id));

      expect(draw.undo()).toBe(true);
      expect(ids(draw)).toEqual(['a']);
      expect(ringOf(draw, 'a')).toEqual(makeSquare('a').geometry.coordinates[0]);
      expect(draw.redo()).toBe(true);
      expect(ids(draw)).toEqual(result.created.map((f) => f.id).sort());
    });

    it('produces the same geometry as the split mode', () => {
      const map = new FakeMap();
      const draw = new LibreDraw(map.asMap(), { toolbar: false });
      // Two identical squares; the last one added is on top, so the clicks
      // hit 'ui' and 'api' is only touched by the API.
      draw.addFeatures([makeSquare('api'), makeSquare('ui')]);

      draw.setMode('split');
      clickAt(map, 20, 20); // select the target
      clickAt(map, 20, 0); // first point
      clickAt(map, 20, 40); // second point: commit
      expect(draw.getFeatureById('ui')).toBeUndefined();
      const uiParts = draw.getFeatures().filter((f) => f.properties.name === 'ui');
      expect(uiParts).toHaveLength(2);

      const result = draw.split('api', [
        [20, 0],
        [20, 40],
      ]);
      if (!result.ok) throw new Error('expected success');
      expect(result.created.map((f) => f.geometry)).toEqual(uiParts.map((f) => f.geometry));
    });

    it('drops a select-mode selection of the original feature', () => {
      const map = new FakeMap();
      const draw = new LibreDraw(map.asMap(), { toolbar: false });
      draw.addFeatures([makeSquare('a')]);
      draw.selectFeature('a');
      expect(map.getSourceData(SOURCE_IDS.EDIT_VERTICES)?.features.length).toBeGreaterThan(0);

      draw.split('a', [
        [20, 0],
        [20, 40],
      ]);

      expect(draw.getSelectedFeatureIds()).toEqual([]);
      expect(map.getSourceData(SOURCE_IDS.EDIT_VERTICES)?.features ?? []).toHaveLength(0);
    });

    it('returns a failure, emits splitfailed with origin api, and changes nothing', () => {
      const draw = new LibreDraw(new FakeMap().asMap(), { toolbar: false });
      draw.addFeatures([makeSquare('a')]);
      const failedListener = vi.fn();
      draw.on('splitfailed', failedListener);

      expect(
        draw.split('missing', [
          [0, 0],
          [1, 1],
        ])
      ).toEqual({ ok: false, reason: 'not-found' });
      expect(
        draw.split('a', [
          [100, 0],
          [100, 40],
        ])
      ).toEqual({ ok: false, reason: 'invalid-intersection-count' });

      expect(failedListener).toHaveBeenCalledTimes(1);
      expect((failedListener.mock.calls[0][0] as SplitFailedEvent).origin).toBe('api');
      expect(ids(draw)).toEqual(['a']);
      expect(draw.undo()).toBe(true); // only the addFeatures step
      expect(draw.undo()).toBe(false);
    });

    it('throws after destroy()', () => {
      const draw = new LibreDraw(new FakeMap().asMap(), { toolbar: false });
      draw.destroy();
      expect(() =>
        draw.split('a', [
          [0, 0],
          [1, 1],
        ])
      ).toThrow(LibreDrawError);
    });
  });

  describe('setback()', () => {
    it('completes without a toolbar, emits setback with origin api, and is undoable', () => {
      const draw = new LibreDraw(new FakeMap().asMap(), { toolbar: false });
      draw.addFeatures([makeSquare('a')]);
      const setbackListener = vi.fn();
      draw.on('setback', setbackListener);

      const result = draw.setback('a', { index: 0 }, 100_000);

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('expected success');
      expect(result.created).toHaveLength(1);
      expect(result.deleted.map((f) => f.id)).toEqual(['a']);
      const remaining = result.created[0];
      expect(ids(draw)).toEqual([remaining.id]);
      // The bottom edge (lat 10) moved north.
      expect(ringOf(draw, remaining.id).every(([, lat]) => lat > 10.5)).toBe(true);

      expect(setbackListener).toHaveBeenCalledTimes(1);
      const event = setbackListener.mock.calls[0][0] as SetbackEvent;
      expect(event.origin).toBe('api');
      expect(event.edgeIndex).toBe(0);
      expect(event.distance).toBe(100_000);

      expect(draw.undo()).toBe(true);
      expect(ids(draw)).toEqual(['a']);
      expect(ringOf(draw, 'a')).toEqual(makeSquare('a').geometry.coordinates[0]);
    });

    it('rotate() also completes without a toolbar', () => {
      const draw = new LibreDraw(new FakeMap().asMap(), { toolbar: false });
      draw.addFeatures([makeSquare('a')]);
      const before = ringOf(draw, 'a').map((p) => [...p]);

      expect(draw.rotate('a', 45).ok).toBe(true);
      expect(ringOf(draw, 'a')).not.toEqual(before);
      expect(draw.undo()).toBe(true);
      expect(ringOf(draw, 'a')).toEqual(before);
    });

    it('returns a failure and changes nothing for a bad request', () => {
      const draw = new LibreDraw(new FakeMap().asMap(), { toolbar: false });
      draw.addFeatures([makeSquare('a')]);
      const failedListener = vi.fn();
      draw.on('setbackfailed', failedListener);

      expect(draw.setback('a', { index: 0 }, 0)).toEqual({
        ok: false,
        reason: 'invalid-distance',
      });
      expect(draw.setback('a', { index: 9 }, 10)).toEqual({ ok: false, reason: 'invalid-edge' });
      expect(draw.setback('a', { ring: 1, index: 0 }, 10)).toEqual({
        ok: false,
        reason: 'has-holes',
      });

      expect(failedListener).toHaveBeenCalledTimes(1); // only has-holes is an event
      expect(ringOf(draw, 'a')).toEqual(makeSquare('a').geometry.coordinates[0]);
      expect(draw.undo()).toBe(true);
      expect(draw.undo()).toBe(false);
    });
  });

  describe('union()', () => {
    it('merges two features, emits union with origin api, and undoes as one step', () => {
      const draw = new LibreDraw(new FakeMap().asMap(), { toolbar: false });
      draw.addFeatures([makeSquare('a', 10, 10, 20), makeSquare('b', 30, 10, 20)]);
      const unionListener = vi.fn();
      draw.on('union', unionListener);

      const result = draw.union(['a', 'b']);

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('expected success');
      expect(result.created).toHaveLength(1);
      expect(result.deleted.map((f) => f.id)).toEqual(['a', 'b']);
      const merged = result.created[0];
      expect(ids(draw)).toEqual([merged.id]);
      expect(merged.properties).toEqual({ name: 'a' });

      expect(unionListener).toHaveBeenCalledTimes(1);
      const event = unionListener.mock.calls[0][0] as UnionEvent;
      expect(event.origin).toBe('api');
      expect(event.originalFeatures.map((f) => f.id)).toEqual(['a', 'b']);

      expect(draw.undo()).toBe(true);
      expect(ids(draw)).toEqual(['a', 'b']);
      expect(draw.redo()).toBe(true);
      expect(ids(draw)).toEqual([merged.id]);
    });

    it('produces the same geometry as the union mode', () => {
      const map = new FakeMap();
      const draw = new LibreDraw(map.asMap(), { toolbar: false });
      draw.addFeatures([makeSquare('a', 10, 10, 20), makeSquare('b', 30, 10, 20)]);

      draw.setMode('union');
      clickAt(map, 20, 20); // first polygon
      clickAt(map, 40, 20); // second polygon: commit
      const uiMerged = draw.getFeatures();
      expect(uiMerged).toHaveLength(1);
      draw.undo();

      const result = draw.union(['a', 'b']);
      if (!result.ok) throw new Error('expected success');
      expect(result.created[0].geometry).toEqual(uiMerged[0].geometry);
    });

    it('returns a failure and changes nothing for a bad request', () => {
      const draw = new LibreDraw(new FakeMap().asMap(), { toolbar: false });
      draw.addFeatures([makeSquare('a', 10, 10, 20), makeSquare('far', 100, 50, 20)]);
      const failedListener = vi.fn();
      draw.on('unionfailed', failedListener);

      expect(draw.union(['a'])).toEqual({ ok: false, reason: 'unsupported-count' });
      expect(draw.union(['a', 'missing'])).toEqual({ ok: false, reason: 'not-found' });
      expect(draw.union(['a', 'far'])).toEqual({ ok: false, reason: 'disjoint' });

      expect(failedListener).toHaveBeenCalledTimes(1);
      expect(ids(draw)).toEqual(['a', 'far']);
      expect(draw.undo()).toBe(true);
      expect(draw.undo()).toBe(false);
    });
  });
});
