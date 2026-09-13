import { describe, expect, it } from 'vitest';
import { setback } from '../../../src/operations/setback';
import { SetbackAction } from '../../../src/types/features';
import type { LibreDrawFeature, Position } from '../../../src/types/features';
import { createContext, makeLine, makeSquare, makeSquareWithHole, ringArea } from './helpers';

function polygonRing(feature: LibreDrawFeature): Position[] {
  if (feature.geometry.type !== 'Polygon') throw new Error('expected polygon');
  return feature.geometry.coordinates[0];
}

describe('setback', () => {
  it('moves the edge inward, discards the band, and records one SetbackAction', () => {
    const { context, features, push, emit, add, remove } = createContext([makeSquare('sq')]);
    const original = features.get('sq')!;

    // Edge 0 is the bottom edge (0,0)→(10,0); 100 km inward is roughly one degree.
    const result = setback(context, 'sq', { index: 0 }, 100_000);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected success');
    expect(result.created).toHaveLength(1);
    expect(result.updated).toEqual([]);
    expect(result.deleted).toEqual([original]);
    const remaining = result.created[0];
    const ring = polygonRing(remaining);
    // The band along the bottom edge is gone: no vertex is left on lat 0,
    // and the polygon is smaller.
    expect(ring.every(([, lat]) => lat > 0.5)).toBe(true);
    expect(ringArea(ring)).toBeLessThan(100);
    expect(ringArea(ring)).toBeGreaterThan(80);
    expect(remaining.id).not.toBe('sq');
    expect(remaining.properties).toEqual({ name: 'sq' });

    expect(remove).toHaveBeenCalledWith('sq');
    expect(add).toHaveBeenCalledTimes(1);
    expect(features.size).toBe(1);

    expect(push).toHaveBeenCalledTimes(1);
    const action = push.mock.calls[0][0] as SetbackAction;
    expect(action).toBeInstanceOf(SetbackAction);
    expect(action.originalFeature).toEqual(original);
    expect(action.resultFeature.id).toBe(remaining.id);
    expect(action.edgeIndex).toBe(0);
    expect(action.distance).toBe(100_000);

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith('setback', {
      originalFeature: original,
      feature: remaining,
      edgeIndex: 0,
      distance: 100_000,
    });
  });

  it('treats an omitted ring as the outer ring and accepts every edge index', () => {
    for (const index of [0, 1, 2, 3]) {
      const { context } = createContext([makeSquare('sq')]);
      const result = setback(context, 'sq', { ring: 0, index }, 100_000);
      expect(result.ok, `edge ${index}`).toBe(true);
    }
  });

  it('returns copies that do not alias the store', () => {
    const { context, features } = createContext([makeSquare('sq')]);
    const result = setback(context, 'sq', { index: 0 }, 100_000);
    if (!result.ok) throw new Error('expected success');
    polygonRing(result.created[0])[0][0] = 999;
    expect(polygonRing(features.get(result.created[0].id)!)[0][0]).not.toBe(999);
  });

  describe('failures leave the store, history and listeners untouched', () => {
    it('rejects an unknown id as not-found without an event', () => {
      const { context, push, emit } = createContext([makeSquare('sq')]);
      expect(setback(context, 'missing', { index: 0 }, 10)).toEqual({
        ok: false,
        reason: 'not-found',
      });
      expect(push).not.toHaveBeenCalled();
      expect(emit).not.toHaveBeenCalled();
    });

    it('rejects a LineString as not-polygon without an event', () => {
      const { context, emit } = createContext([makeLine('ln')]);
      expect(setback(context, 'ln', { index: 0 }, 10)).toEqual({
        ok: false,
        reason: 'not-polygon',
      });
      expect(emit).not.toHaveBeenCalled();
    });

    it.each([-1, 4, 1.5, Number.NaN])('rejects edge index %s as invalid-edge', (index) => {
      const { context, push, emit } = createContext([makeSquare('sq')]);
      expect(setback(context, 'sq', { index }, 10)).toEqual({ ok: false, reason: 'invalid-edge' });
      expect(push).not.toHaveBeenCalled();
      expect(emit).not.toHaveBeenCalled();
    });

    it.each([0, -5, Number.NaN, Number.POSITIVE_INFINITY])(
      'rejects distance %s as invalid-distance',
      (distance) => {
        const { context, push, emit } = createContext([makeSquare('sq')]);
        expect(setback(context, 'sq', { index: 0 }, distance)).toEqual({
          ok: false,
          reason: 'invalid-distance',
        });
        expect(push).not.toHaveBeenCalled();
        expect(emit).not.toHaveBeenCalled();
      }
    );

    it('reports a polygon with holes as has-holes with a setbackfailed event', () => {
      const { context, features, push, emit } = createContext([makeSquareWithHole('h')]);
      expect(setback(context, 'h', { index: 0 }, 10)).toEqual({ ok: false, reason: 'has-holes' });
      expect(features.size).toBe(1);
      expect(push).not.toHaveBeenCalled();
      expect(emit).toHaveBeenCalledWith('setbackfailed', { reason: 'has-holes', featureId: 'h' });
    });

    it('reports an inner-ring reference as has-holes', () => {
      const { context, emit } = createContext([makeSquare('sq')]);
      expect(setback(context, 'sq', { ring: 1, index: 0 }, 10)).toEqual({
        ok: false,
        reason: 'has-holes',
      });
      expect(emit).toHaveBeenCalledWith('setbackfailed', { reason: 'has-holes', featureId: 'sq' });
    });

    it('reports an offset that leaves nothing to keep as invalid-split', () => {
      const { context, features, push, emit } = createContext([makeSquare('sq')]);
      // 3000 km is far beyond the 10-degree square: the offset line misses it.
      expect(setback(context, 'sq', { index: 0 }, 3_000_000)).toEqual({
        ok: false,
        reason: 'invalid-split',
      });
      expect(features.size).toBe(1);
      expect(push).not.toHaveBeenCalled();
      expect(emit).toHaveBeenCalledWith('setbackfailed', {
        reason: 'invalid-split',
        featureId: 'sq',
      });
    });
  });
});
