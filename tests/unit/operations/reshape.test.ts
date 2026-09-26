import { afterEach, describe, expect, it, vi } from 'vitest';
import { reshape } from '../../../src/operations/reshape';
import { UpdateAction } from '../../../src/types/features';
import type { Position } from '../../../src/types/features';
import { createContext, makeLine, makePoint, makeSquare, ringArea } from './helpers';

// The result is valid geometry; the validation rejection path is exercised
// by failing validation on demand.
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

const NOTCH: Position[] = [
  [2, -1],
  [2, 2],
  [5, 2],
  [5, -1],
];

describe('reshape', () => {
  afterEach(() => {
    validation.rejectWith = null;
  });

  it('replaces the polygon in place as one UpdateAction and reports it as updated', () => {
    const { context, features, push, emit, add, remove } = createContext([makeSquare('sq')]);
    const original = features.get('sq')!;

    const result = reshape(context, 'sq', NOTCH);

    if (!result.ok) throw new Error(result.reason);
    expect(result.created).toEqual([]);
    expect(result.deleted).toEqual([]);
    expect(result.updated).toHaveLength(1);
    const updated = result.updated[0];
    expect(updated.id).toBe('sq');
    if (updated.geometry.type !== 'Polygon') throw new Error('expected Polygon');
    expect(ringArea(updated.geometry.coordinates[0])).toBeCloseTo(94);
    expect(features.get('sq')).toEqual(updated);
    expect(remove).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();

    expect(push).toHaveBeenCalledTimes(1);
    const action = push.mock.calls[0][0] as UpdateAction;
    expect(action).toBeInstanceOf(UpdateAction);
    expect(action.oldFeature).toEqual(original);
    expect(action.newFeature).toEqual(updated);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith('reshape', { originalFeature: original, feature: updated });
  });

  it('returns snapshots detached from the store', () => {
    const { context, features } = createContext([makeSquare('sq')]);

    const result = reshape(context, 'sq', NOTCH);

    if (!result.ok) throw new Error(result.reason);
    expect(result.updated[0]).not.toBe(features.get('sq'));
  });

  it.each([
    [
      'invalid-intersection-count',
      [
        [5, 5],
        [15, 5],
      ],
    ],
    [
      'self-intersecting-result',
      [
        [2, -1],
        [2, 2],
        [4, 4],
        [6, 6],
        [2, 6],
        [4, 4],
        [6, 2],
        [8, -1],
      ],
    ],
  ])('reports %s with a reshapefailed event and changes nothing', (reason, line) => {
    const { context, features, push, emit } = createContext([makeSquare('sq')]);
    const original = features.get('sq');

    expect(reshape(context, 'sq', line as Position[])).toEqual({ ok: false, reason });

    expect(emit).toHaveBeenCalledWith('reshapefailed', { reason, featureId: 'sq' });
    expect(push).not.toHaveBeenCalled();
    expect(features.get('sq')).toBe(original);
  });

  it('reports invalid-result when the result fails validation', () => {
    validation.rejectWith = 'bad ring';
    const { context, features, push, emit } = createContext([makeSquare('sq')]);
    const original = features.get('sq');

    expect(reshape(context, 'sq', NOTCH)).toEqual({ ok: false, reason: 'invalid-result' });

    expect(emit).toHaveBeenCalledWith('reshapefailed', {
      reason: 'invalid-result',
      featureId: 'sq',
    });
    expect(push).not.toHaveBeenCalled();
    expect(features.get('sq')).toBe(original);
  });

  it.each([
    ['not-found', 'missing', NOTCH],
    ['not-polygon', 'line', NOTCH],
    ['not-polygon', 'point', NOTCH],
    ['invalid-line', 'sq', [[2, -1]]],
    [
      'invalid-line',
      'sq',
      [
        [2, -1],
        [2, Number.NaN],
      ],
    ],
  ])('returns %s for %s without emitting', (reason, id, line) => {
    const { context, push, emit } = createContext([
      makeSquare('sq'),
      makeLine('line'),
      makePoint('point'),
    ]);

    expect(reshape(context, id, line as Position[])).toEqual({ ok: false, reason });

    expect(emit).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });
});
