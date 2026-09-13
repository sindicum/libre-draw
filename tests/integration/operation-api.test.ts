import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LibreDraw } from '../../src/LibreDraw';
import { LibreDrawError } from '../../src/core/errors';
import { SOURCE_IDS } from '../../src/rendering/SourceManager';
import type { RotateEvent, UpdateEvent } from '../../src/types/events';
import type { Position } from '../../src/types/features';
import { rotateFeature } from '../../src/utils/rotate';
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

function ring(draw: LibreDraw, id: string): Position[] {
  const feature = draw.getFeatureById(id);
  if (!feature || feature.geometry.type !== 'Polygon') throw new Error(`no polygon ${id}`);
  return feature.geometry.coordinates[0];
}

describe('operation API (updateFeature / rotate)', () => {
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

  describe('updateFeature()', () => {
    it('replaces the geometry, emits update with origin api, and is undoable', () => {
      const draw = new LibreDraw(new FakeMap().asMap(), { toolbar: false });
      draw.addFeatures([makeSquare('a')]);
      const updateListener = vi.fn();
      draw.on('update', updateListener);
      const bigger = makeSquare('a', 10, 10, 40).geometry;

      const result = draw.updateFeature('a', { geometry: bigger });

      expect(result.ok).toBe(true);
      expect(ring(draw, 'a')).toEqual(bigger.coordinates[0]);
      expect(updateListener).toHaveBeenCalledTimes(1);
      const event = updateListener.mock.calls[0][0] as UpdateEvent;
      expect(event.origin).toBe('api');
      expect(event.feature.geometry).toEqual(bigger);
      expect(event.oldFeature.geometry).toEqual(makeSquare('a').geometry);

      expect(draw.undo()).toBe(true);
      expect(ring(draw, 'a')).toEqual(makeSquare('a').geometry.coordinates[0]);
      expect(draw.redo()).toBe(true);
      expect(ring(draw, 'a')).toEqual(bigger.coordinates[0]);
    });

    it('replaces properties without touching the geometry', () => {
      const draw = new LibreDraw(new FakeMap().asMap(), { toolbar: false });
      draw.addFeatures([makeSquare('a')]);

      const result = draw.updateFeature('a', { properties: { crop: 'wheat' } });

      expect(result.ok).toBe(true);
      expect(draw.getFeatureById('a')?.properties).toEqual({ crop: 'wheat' });
      expect(ring(draw, 'a')).toEqual(makeSquare('a').geometry.coordinates[0]);
      draw.undo();
      expect(draw.getFeatureById('a')?.properties).toEqual({ name: 'a' });
    });

    it('returns a failure and changes nothing for an invalid patch', () => {
      const draw = new LibreDraw(new FakeMap().asMap(), { toolbar: false });
      draw.addFeatures([makeSquare('a')]);
      const updateListener = vi.fn();
      draw.on('update', updateListener);

      expect(draw.updateFeature('missing', { properties: {} })).toEqual({
        ok: false,
        reason: 'not-found',
      });
      expect(draw.updateFeature('a', {})).toEqual({ ok: false, reason: 'empty-patch' });
      expect(draw.updateFeature('a', { geometry: { type: 'Point', coordinates: [0, 0] } })).toEqual(
        { ok: false, reason: 'geometry-type-mismatch' }
      );
      const invalid = draw.updateFeature('a', {
        geometry: { type: 'Polygon', coordinates: [[[0, 0] as Position]] },
      });
      expect(invalid.ok).toBe(false);

      expect(updateListener).not.toHaveBeenCalled();
      expect(draw.undo()).toBe(true); // only the addFeatures step exists
      expect(draw.undo()).toBe(false);
    });

    it('moves the vertex handles of a selected feature to the new shape', () => {
      const map = new FakeMap();
      const draw = new LibreDraw(map.asMap(), { toolbar: false });
      draw.addFeatures([makeSquare('a')]);
      draw.selectFeature('a');

      const handlesBefore = map.getSourceData(SOURCE_IDS.EDIT_VERTICES)?.features ?? [];
      expect(handlesBefore.length).toBeGreaterThan(0);

      const bigger = makeSquare('a', 10, 10, 40).geometry;
      draw.updateFeature('a', { geometry: bigger });

      expect(draw.getSelectedFeatureIds()).toEqual(['a']);
      const handles = map.getSourceData(SOURCE_IDS.EDIT_VERTICES)?.features ?? [];
      const handleCoords = handles
        .map((f) => (f.geometry as GeoJSON.Point).coordinates)
        .map(([x, y]) => `${x},${y}`);
      expect(handleCoords).toContain('50,50'); // the new far corner
      expect(handleCoords).not.toContain('30,30'); // the old far corner is gone
    });

    it('throws after destroy()', () => {
      const draw = new LibreDraw(new FakeMap().asMap(), { toolbar: false });
      draw.destroy();
      expect(() => draw.updateFeature('a', { properties: {} })).toThrow(LibreDrawError);
    });
  });

  describe('rotate()', () => {
    it('rotates like the mode, emits rotate with origin api, and undoes as update', () => {
      const draw = new LibreDraw(new FakeMap().asMap(), { toolbar: false });
      draw.addFeatures([makeSquare('a')]);
      const rotateListener = vi.fn();
      const updateListener = vi.fn();
      draw.on('rotate', rotateListener);
      draw.on('update', updateListener);
      const expected = rotateFeature(draw.getFeatureById('a')!, 90);

      const result = draw.rotate('a', 90);

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('expected success');
      expect(result.updated[0]).toEqual(expected);
      expect(draw.getFeatureById('a')).toEqual(expected);
      expect(rotateListener).toHaveBeenCalledTimes(1);
      const event = rotateListener.mock.calls[0][0] as RotateEvent;
      expect(event.origin).toBe('api');
      expect(event.angle).toBe(90);
      expect(updateListener).not.toHaveBeenCalled();

      expect(draw.undo()).toBe(true);
      expect(draw.getFeatureById('a')?.geometry).toEqual(makeSquare('a').geometry);
      expect(updateListener).toHaveBeenCalledTimes(1);
      expect((updateListener.mock.calls[0][0] as UpdateEvent).origin).toBe('api');
    });

    it('produces the same coordinates as the toolbar angle input', () => {
      const map = new FakeMap();
      const draw = new LibreDraw(map.asMap()); // toolbar on: the UI path exists
      // Two identical squares at the same place; the last one added is on
      // top, so the click selects 'ui' and 'api' is only touched by the API.
      draw.addFeatures([makeSquare('api'), makeSquare('ui')]);

      // UI path: select in rotate mode, then execute 90° from the input.
      draw.setMode('rotate');
      clickAt(map, 20, 20);
      expect(draw.getSelectedFeatureIds()).toEqual(['ui']);
      const rotateMode = (draw as unknown as { rotateMode: { executeFromUi(a: number): void } })
        .rotateMode;
      rotateMode.executeFromUi(90);

      // API path on the identical square.
      expect(draw.rotate('api', 90).ok).toBe(true);

      const uiRing = ring(draw, 'ui');
      const apiRing = ring(draw, 'api');
      expect(apiRing).toHaveLength(uiRing.length);
      uiRing.forEach((p, i) => {
        expect(p[0]).toBeCloseTo(apiRing[i][0], 9);
        expect(p[1]).toBeCloseTo(apiRing[i][1], 9);
      });
    });

    it('re-bases a rotate-mode selection so the next UI rotation stacks on the API one', () => {
      const map = new FakeMap();
      const draw = new LibreDraw(map.asMap());
      draw.addFeatures([makeSquare('a')]);
      draw.setMode('rotate');
      clickAt(map, 20, 20);
      expect(draw.getSelectedFeatureIds()).toEqual(['a']);

      draw.rotate('a', 45);
      const afterApi = draw.getFeatureById('a')!;
      const rotateMode = (draw as unknown as { rotateMode: { executeFromUi(a: number): void } })
        .rotateMode;
      rotateMode.executeFromUi(45);

      // The UI rotation started from the API result, not from the original.
      expect(draw.getFeatureById('a')).toEqual(rotateFeature(afterApi, 45));
      expect(draw.getSelectedFeatureIds()).toEqual(['a']);
      // Two history steps: undo twice returns to the original.
      draw.undo();
      draw.undo();
      expect(draw.getFeatureById('a')?.geometry).toEqual(makeSquare('a').geometry);
    });

    it('returns a failure and changes nothing for a bad request', () => {
      const draw = new LibreDraw(new FakeMap().asMap(), { toolbar: false });
      draw.addFeatures([
        makeSquare('a'),
        makeSquare('edge', 170, 80, 9), // a 90° turn pushes a corner past lng 180
        {
          id: 'p',
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [1, 1] },
          properties: {},
        },
      ]);
      const rotateListener = vi.fn();
      draw.on('rotate', rotateListener);

      expect(draw.rotate('missing', 90)).toEqual({ ok: false, reason: 'not-found' });
      expect(draw.rotate('p', 90)).toEqual({ ok: false, reason: 'not-rotatable' });
      expect(draw.rotate('a', 360)).toEqual({ ok: false, reason: 'no-rotation' });
      const outOfRange = draw.rotate('edge', 90);
      expect(outOfRange.ok).toBe(false);
      if (outOfRange.ok) throw new Error('expected failure');
      expect(outOfRange.reason).toContain('longitude');
      expect(draw.getFeatureById('edge')?.geometry).toEqual(
        makeSquare('edge', 170, 80, 9).geometry
      );

      expect(rotateListener).not.toHaveBeenCalled();
      expect(draw.getFeatureById('a')?.geometry).toEqual(makeSquare('a').geometry);
      expect(draw.undo()).toBe(true); // only the addFeatures step
      expect(draw.undo()).toBe(false);
    });
  });
});
