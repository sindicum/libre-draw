import { afterEach, describe, expect, it, vi } from 'vitest';
import { split } from '../../../src/operations/split';
import { SplitAction } from '../../../src/types/features';
import type { LibreDrawFeature, Position } from '../../../src/types/features';
import { splitLine, splitPolygon } from '../../../src/utils/splitPolygon';
import { createContext, makeLine, makePoint, makeSquare, ringArea } from './helpers';

// The parts of a split are the original vertices plus points on its edges,
// so real input cannot make them fail validation except by rounding at the
// coordinate limits. The rejection path is exercised by failing validation
// on demand instead.
const validation = vi.hoisted(() => ({ rejectWith: null as string | null }));
vi.mock('../../../src/validation/geojson', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/validation/geojson')>();
  return {
    ...actual,
    tryValidateFeature: (feature: unknown) =>
      validation.rejectWith === null
        ? actual.tryValidateFeature(feature)
        : { valid: false, reason: validation.rejectWith },
  };
});

const VERTICAL_LINE: [Position, Position] = [
  [5, -1],
  [5, 11],
];

function polygonRing(feature: LibreDrawFeature): Position[] {
  if (feature.geometry.type !== 'Polygon') throw new Error('expected polygon');
  return feature.geometry.coordinates[0];
}

describe('split', () => {
  it('splits a polygon into two halves like splitPolygon, as one SplitAction', () => {
    const { context, features, push, emit, add, remove } = createContext([makeSquare('sq')]);
    const original = features.get('sq')!;

    const result = split(context, 'sq', VERTICAL_LINE);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected success');
    expect(result.created).toHaveLength(2);
    expect(result.updated).toEqual([]);
    expect(result.deleted).toEqual([original]);
    expect(ringArea(polygonRing(result.created[0]))).toBeCloseTo(50, 9);
    expect(ringArea(polygonRing(result.created[1]))).toBeCloseTo(50, 9);
    expect(result.created[0].properties).toEqual({ name: 'sq' });

    // Same geometry as the pure utility (ids differ because they are generated).
    const reference = splitPolygon(makeSquare('sq'), VERTICAL_LINE[0], VERTICAL_LINE[1]);
    if (reference.type !== 'success') throw new Error('reference split failed');
    expect(result.created[0].geometry).toEqual(reference.features[0].geometry);
    expect(result.created[1].geometry).toEqual(reference.features[1].geometry);

    expect(remove).toHaveBeenCalledWith('sq');
    expect(add).toHaveBeenCalledTimes(2);
    expect(features.has('sq')).toBe(false);
    expect(features.size).toBe(2);

    expect(push).toHaveBeenCalledTimes(1);
    const action = push.mock.calls[0][0] as SplitAction;
    expect(action).toBeInstanceOf(SplitAction);
    expect(action.originalFeature).toEqual(original);
    expect(action.featureA.id).toBe(result.created[0].id);
    expect(action.featureB.id).toBe(result.created[1].id);

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith('split', {
      originalFeature: original,
      features: [result.created[0], result.created[1]],
    });
  });

  it('splits a LineString at its first crossing like splitLine', () => {
    const { context, features } = createContext([makeLine('ln')]);
    const result = split(context, 'ln', VERTICAL_LINE);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected success');
    const reference = splitLine(makeLine('ln'), VERTICAL_LINE[0], VERTICAL_LINE[1]);
    if (reference.type !== 'success') throw new Error('reference split failed');
    expect(result.created[0].geometry).toEqual(reference.features[0].geometry);
    expect(result.created[1].geometry).toEqual(reference.features[1].geometry);
    expect(features.has('ln')).toBe(false);
  });

  it('returns copies that do not alias the store', () => {
    const { context, features } = createContext([makeSquare('sq')]);
    const result = split(context, 'sq', VERTICAL_LINE);
    if (!result.ok) throw new Error('expected success');

    polygonRing(result.created[0])[0][0] = 999;
    const stored = features.get(result.created[0].id)!;
    expect(polygonRing(stored)[0][0]).not.toBe(999);
  });

  describe('failures leave the store, history and listeners untouched', () => {
    afterEach(() => {
      validation.rejectWith = null;
    });

    it('reports a part that fails validation as invalid-result with a splitfailed event', () => {
      const { context, features, push, emit } = createContext([makeSquare('sq')]);
      const before = features.get('sq');
      validation.rejectWith =
        'Invalid longitude: 180.00000000000003. Must be between -180 and 180.';

      const result = split(context, 'sq', VERTICAL_LINE);

      // The validation message is not surfaced: the code is the contract, as
      // for union's invalid-result.
      expect(result).toEqual({ ok: false, reason: 'invalid-result' });
      expect(features.get('sq')).toBe(before);
      expect(features.size).toBe(1);
      expect(push).not.toHaveBeenCalled();
      expect(emit).toHaveBeenCalledTimes(1);
      expect(emit).toHaveBeenCalledWith('splitfailed', {
        reason: 'invalid-result',
        featureId: 'sq',
      });
    });

    it('rejects an unknown id as not-found without an event', () => {
      const { context, features, push, emit } = createContext([makeSquare('sq')]);
      expect(split(context, 'missing', VERTICAL_LINE)).toEqual({
        ok: false,
        reason: 'not-found',
      });
      expect(features.size).toBe(1);
      expect(push).not.toHaveBeenCalled();
      expect(emit).not.toHaveBeenCalled();
    });

    it('rejects a Point as not-splittable without an event', () => {
      const { context, push, emit } = createContext([makePoint('pt')]);
      expect(split(context, 'pt', VERTICAL_LINE)).toEqual({
        ok: false,
        reason: 'not-splittable',
      });
      expect(push).not.toHaveBeenCalled();
      expect(emit).not.toHaveBeenCalled();
    });

    it('reports a geometric failure with its SplitFailReason and a splitfailed event', () => {
      const { context, features, push, emit } = createContext([makeSquare('sq')]);
      const before = features.get('sq');

      // A line that misses the square crosses it zero times.
      const result = split(context, 'sq', [
        [20, -1],
        [20, 11],
      ]);

      expect(result).toEqual({ ok: false, reason: 'invalid-intersection-count' });
      expect(features.get('sq')).toBe(before);
      expect(push).not.toHaveBeenCalled();
      expect(emit).toHaveBeenCalledTimes(1);
      expect(emit).toHaveBeenCalledWith('splitfailed', {
        reason: 'invalid-intersection-count',
        featureId: 'sq',
      });
    });

    it('reports two identical points as same-points', () => {
      const { context, emit } = createContext([makeSquare('sq')]);
      expect(
        split(context, 'sq', [
          [5, 5],
          [5, 5],
        ])
      ).toEqual({ ok: false, reason: 'same-points' });
      expect(emit).toHaveBeenCalledWith('splitfailed', { reason: 'same-points', featureId: 'sq' });
    });
  });
});
