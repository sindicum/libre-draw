import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LibreDraw } from '../../src/LibreDraw';
import { LibreDrawError } from '../../src/core/errors';
import type { ModeName } from '../../src/types/mode';
import type { SplitFailedEvent } from '../../src/types/events';
import { FakeMap } from './helpers/fakeMap';

// A split part can only fail validation by rounding at the coordinate
// limits, which no fixture reproduces; the facade path is exercised by
// rejecting the n-th validation call on demand (see `rejectValidation`).
const validation = vi.hoisted(() => ({ rejectCall: 0, calls: 0 }));
vi.mock('../../src/validation/geojson', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/validation/geojson')>();
  return {
    ...actual,
    tryValidateFeature: (feature: unknown) => {
      validation.calls += 1;
      return validation.calls === validation.rejectCall
        ? {
            valid: false,
            reason: 'Invalid longitude: 180.00000000000003. Must be between -180 and 180.',
          }
        : actual.tryValidateFeature(feature);
    },
  };
});

/** Make the `n`-th `tryValidateFeature` call from now fail. */
function rejectValidation(n: number): void {
  validation.calls = 0;
  validation.rejectCall = n;
}

/**
 * The boundary between exceptions and results: `LibreDrawError` is thrown
 * only for misuse of the instance (a call after `destroy()`, an unknown mode
 * name, an unsupported locale). Everything about the data a caller passes
 * comes back in the return value.
 */

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
        ],
      ],
    },
    properties: { name: id },
  };
}

/** An open ring: rejected by validation with a stable message. */
function makeBroken(id: string) {
  return {
    id,
    type: 'Feature' as const,
    geometry: {
      type: 'Polygon' as const,
      coordinates: [
        [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10],
        ],
      ],
    },
    properties: {},
  };
}

function collection(...features: unknown[]) {
  return { type: 'FeatureCollection', features };
}

describe('exception / result boundary', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', ((cb: FrameRequestCallback): number => {
      cb(0);
      return 1;
    }) as typeof requestAnimationFrame);
  });

  afterEach(() => {
    validation.rejectCall = 0;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('selectFeature()', () => {
    it('returns false for an unknown id and changes nothing', () => {
      const draw = new LibreDraw(new FakeMap().asMap(), { toolbar: false });
      draw.addFeatures([makeSquare('a')]);
      const modeListener = vi.fn();
      const selectionListener = vi.fn();
      draw.on('modechange', modeListener);
      draw.on('selectionchange', selectionListener);

      expect(draw.selectFeature('missing')).toBe(false);

      expect(draw.getMode()).toBe('idle');
      expect(draw.getSelectedFeatureIds()).toEqual([]);
      expect(modeListener).not.toHaveBeenCalled();
      expect(selectionListener).not.toHaveBeenCalled();
    });

    it('returns true, switches to select mode, and selects a known id', () => {
      const draw = new LibreDraw(new FakeMap().asMap(), { toolbar: false });
      draw.addFeatures([makeSquare('a')]);
      const selectionListener = vi.fn();
      draw.on('selectionchange', selectionListener);

      expect(draw.selectFeature('a')).toBe(true);

      expect(draw.getMode()).toBe('select');
      expect(draw.getSelectedFeatureIds()).toEqual(['a']);
      expect(selectionListener).toHaveBeenCalledWith({ selectedIds: ['a'], origin: 'api' });
    });

    it('keeps the current selection when the id is unknown', () => {
      const draw = new LibreDraw(new FakeMap().asMap(), { toolbar: false });
      draw.addFeatures([makeSquare('a')]);
      draw.selectFeature('a');

      expect(draw.selectFeature('missing')).toBe(false);
      expect(draw.getSelectedFeatureIds()).toEqual(['a']);
    });
  });

  describe('setFeatures()', () => {
    it('returns the new features as created and the previous ones as deleted', () => {
      const draw = new LibreDraw(new FakeMap().asMap(), { toolbar: false });
      draw.addFeatures([makeSquare('old')]);
      const createListener = vi.fn();
      const deleteListener = vi.fn();
      draw.on('create', createListener);
      draw.on('delete', deleteListener);

      const result = draw.setFeatures(collection(makeSquare('a'), makeSquare('b', 50, 50)));

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('expected success');
      expect(result.created.map((f) => f.id)).toEqual(['a', 'b']);
      expect(result.updated).toEqual([]);
      expect(result.deleted.map((f) => f.id)).toEqual(['old']);
      expect(draw.getFeatures().map((f) => f.id)).toEqual(['a', 'b']);

      // A reload, not an edit: no events, and the history starts over.
      expect(createListener).not.toHaveBeenCalled();
      expect(deleteListener).not.toHaveBeenCalled();
      expect(draw.undo()).toBe(false);
    });

    it('returns copies that do not alias the store', () => {
      const draw = new LibreDraw(new FakeMap().asMap(), { toolbar: false });
      const result = draw.setFeatures(collection(makeSquare('a')));
      if (!result.ok) throw new Error('expected success');

      result.created[0].properties.name = 'changed';
      expect(draw.getFeatureById('a')?.properties.name).toBe('a');
    });

    it('reports an invalid feature with its index and changes nothing', () => {
      const draw = new LibreDraw(new FakeMap().asMap(), { toolbar: false });
      draw.addFeatures([makeSquare('keep')]);
      draw.selectFeature('keep');
      const selectionListener = vi.fn();
      draw.on('selectionchange', selectionListener);

      const result = draw.setFeatures(collection(makeSquare('a'), makeBroken('b')));

      expect(result).toEqual({
        ok: false,
        reason:
          'Invalid feature at index 1: Ring is not closed. The first and last positions must be identical.',
      });
      expect(draw.getFeatures().map((f) => f.id)).toEqual(['keep']);
      expect(draw.getSelectedFeatureIds()).toEqual(['keep']);
      expect(selectionListener).not.toHaveBeenCalled();
      expect(draw.undo()).toBe(true); // the earlier addFeatures step is still there
    });

    it('reports a value that is not a FeatureCollection', () => {
      const draw = new LibreDraw(new FakeMap().asMap(), { toolbar: false });
      expect(draw.setFeatures(42)).toEqual({
        ok: false,
        reason: 'GeoJSON must be a non-null object.',
      });
      expect(draw.setFeatures({ type: 'Feature' })).toEqual({
        ok: false,
        reason: 'GeoJSON.type must be "FeatureCollection", got "Feature".',
      });
    });
  });

  describe('setMode()', () => {
    it('throws LibreDrawError for an unknown name and keeps the current mode', () => {
      const draw = new LibreDraw(new FakeMap().asMap(), { toolbar: false });
      draw.setMode('draw-polygon');
      const modeListener = vi.fn();
      draw.on('modechange', modeListener);

      expect(() => draw.setMode('nope' as ModeName)).toThrow(LibreDrawError);
      expect(() => draw.setMode('nope' as ModeName)).toThrow('Unknown mode: nope');

      expect(draw.getMode()).toBe('draw-polygon');
      expect(modeListener).not.toHaveBeenCalled();
    });
  });

  describe('split()', () => {
    it.each([
      ['first', 1],
      ['second', 2],
    ])(
      'reports a %s part that fails validation as invalid-result and changes nothing',
      (_which, call) => {
        const draw = new LibreDraw(new FakeMap().asMap(), { toolbar: false });
        draw.addFeatures([makeSquare('sq')]);
        draw.selectFeature('sq');
        const splitListener = vi.fn();
        const failedListener = vi.fn();
        draw.on('split', splitListener);
        draw.on('splitfailed', failedListener);
        rejectValidation(call);

        const result = draw.split('sq', [
          [20, 5],
          [20, 35],
        ]);

        expect(result).toEqual({ ok: false, reason: 'invalid-result' });
        expect(splitListener).not.toHaveBeenCalled();
        expect(failedListener).toHaveBeenCalledTimes(1);
        expect(failedListener.mock.calls[0][0] as SplitFailedEvent).toEqual({
          reason: 'invalid-result',
          featureId: 'sq',
          origin: 'api',
        });
        expect(draw.getFeatures().map((f) => f.id)).toEqual(['sq']);
        expect(draw.getSelectedFeatureIds()).toEqual(['sq']);
        expect(draw.undo()).toBe(true); // only the addFeatures step is recorded
        expect(draw.getFeatures()).toHaveLength(0);
      }
    );
  });

  describe('data never throws', () => {
    it('answers every data-related failure with a return value', () => {
      const draw = new LibreDraw(new FakeMap().asMap(), { toolbar: false });
      draw.addFeatures([makeSquare('a')]);

      // Each call is fed input the method rejects. None may throw.
      expect(draw.addFeatures([null, 42, {}, makeBroken('x')]).every((r) => !r.valid)).toBe(true);
      expect(draw.setFeatures(null).ok).toBe(false);
      expect(draw.validateFeature('nope').valid).toBe(false);
      expect(draw.updateFeature('missing', { properties: {} }).ok).toBe(false);
      expect(draw.updateFeature('a', {}).ok).toBe(false);
      expect(draw.updateFeature('a', { geometry: makeBroken('a').geometry }).ok).toBe(false);
      expect(draw.rotate('a', Number.NaN).ok).toBe(false);
      expect(
        draw.split('a', [
          [100, 100],
          [101, 101],
        ]).ok
      ).toBe(false);
      expect(draw.setback('a', { index: -1 }, 5).ok).toBe(false);
      expect(draw.setback('a', { index: 0 }, -5).ok).toBe(false);
      expect(draw.union(['a']).ok).toBe(false);
      expect(draw.union(['a', 'missing']).ok).toBe(false);
      expect(draw.selectFeature('missing')).toBe(false);
      expect(draw.deleteFeature('missing')).toBeUndefined();
      expect(draw.getFeatureById('missing')).toBeUndefined();

      expect(draw.getFeatures().map((f) => f.id)).toEqual(['a']);
    });

    it('still throws for a call after destroy()', () => {
      const draw = new LibreDraw(new FakeMap().asMap(), { toolbar: false });
      draw.destroy();

      expect(() => draw.selectFeature('a')).toThrow(LibreDrawError);
      expect(() => draw.setFeatures(collection())).toThrow(LibreDrawError);
      expect(() => draw.addFeatures([])).toThrow(LibreDrawError);
      expect(() => draw.setMode('idle')).toThrow(LibreDrawError);
    });
  });
});
