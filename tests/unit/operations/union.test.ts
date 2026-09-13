import { describe, expect, it } from 'vitest';
import { union } from '../../../src/operations/union';
import { UnionAction } from '../../../src/types/features';
import type { Position } from '../../../src/types/features';
import { unionPolygons } from '../../../src/utils/unionPolygon';
import { createContext, makeLine, makeSquare, makeSquareWithHole, ringArea } from './helpers';

describe('union', () => {
  it('merges two touching squares into one polygon like unionPolygons, as one UnionAction', () => {
    const { context, features, push, emit, add, remove } = createContext([
      makeSquare('a', 0, 0, 10),
      makeSquare('b', 10, 0, 10),
    ]);
    const first = features.get('a')!;
    const second = features.get('b')!;

    const result = union(context, ['a', 'b']);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected success');
    expect(result.created).toHaveLength(1);
    expect(result.updated).toEqual([]);
    expect(result.deleted).toEqual([first, second]);
    const merged = result.created[0];
    if (merged.geometry.type !== 'Polygon') throw new Error('expected polygon');
    expect(ringArea(merged.geometry.coordinates[0] as Position[])).toBeCloseTo(200, 9);
    expect(merged.properties).toEqual({ name: 'a' });

    const reference = unionPolygons(makeSquare('a', 0, 0, 10), makeSquare('b', 10, 0, 10));
    if (reference.type !== 'success') throw new Error('reference union failed');
    expect(merged.geometry).toEqual(reference.feature.geometry);

    expect(remove).toHaveBeenCalledWith('a');
    expect(remove).toHaveBeenCalledWith('b');
    expect(add).toHaveBeenCalledTimes(1);
    expect(features.size).toBe(1);
    expect(features.get(merged.id)).toBeDefined();

    expect(push).toHaveBeenCalledTimes(1);
    const action = push.mock.calls[0][0] as UnionAction;
    expect(action).toBeInstanceOf(UnionAction);
    expect(action.featureA).toEqual(first);
    expect(action.featureB).toEqual(second);
    expect(action.resultFeature.id).toBe(merged.id);

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith('union', {
      originalFeatures: [first, second],
      feature: merged,
    });
  });

  it('keeps the properties of the first id, whatever the order', () => {
    const { context } = createContext([makeSquare('a', 0, 0, 10), makeSquare('b', 10, 0, 10)]);
    const result = union(context, ['b', 'a']);
    if (!result.ok) throw new Error('expected success');
    expect(result.created[0].properties).toEqual({ name: 'b' });
    expect(result.deleted.map((f) => f.id)).toEqual(['b', 'a']);
  });

  it('returns copies that do not alias the store', () => {
    const { context, features } = createContext([
      makeSquare('a', 0, 0, 10),
      makeSquare('b', 10, 0, 10),
    ]);
    const result = union(context, ['a', 'b']);
    if (!result.ok) throw new Error('expected success');
    (result.created[0].geometry.coordinates as Position[][])[0][0][0] = 999;
    const stored = features.get(result.created[0].id)!;
    expect((stored.geometry.coordinates as Position[][])[0][0][0]).not.toBe(999);
  });

  describe('failures leave the store, history and listeners untouched', () => {
    it.each([[[]], [['a']], [['a', 'b', 'c']], [['a', 'a']]])(
      'rejects %j as unsupported-count without an event',
      (ids) => {
        const { context, features, push, emit } = createContext([
          makeSquare('a', 0, 0, 10),
          makeSquare('b', 10, 0, 10),
          makeSquare('c', 20, 0, 10),
        ]);
        expect(union(context, ids)).toEqual({ ok: false, reason: 'unsupported-count' });
        expect(features.size).toBe(3);
        expect(push).not.toHaveBeenCalled();
        expect(emit).not.toHaveBeenCalled();
      }
    );

    it('rejects an unknown id as not-found without an event', () => {
      const { context, push, emit } = createContext([makeSquare('a')]);
      expect(union(context, ['a', 'missing'])).toEqual({ ok: false, reason: 'not-found' });
      expect(push).not.toHaveBeenCalled();
      expect(emit).not.toHaveBeenCalled();
    });

    it('reports disjoint polygons with a unionfailed event', () => {
      const { context, features, push, emit } = createContext([
        makeSquare('a', 0, 0, 10),
        makeSquare('b', 50, 50, 10),
      ]);
      expect(union(context, ['a', 'b'])).toEqual({ ok: false, reason: 'disjoint' });
      expect(features.size).toBe(2);
      expect(push).not.toHaveBeenCalled();
      expect(emit).toHaveBeenCalledTimes(1);
      expect(emit).toHaveBeenCalledWith('unionfailed', {
        reason: 'disjoint',
        featureIds: ['a', 'b'],
      });
    });

    it('reports a non-polygon and a polygon with holes with their codes', () => {
      const { context, emit } = createContext([
        makeSquare('a', 0, 0, 10),
        makeLine('ln'),
        makeSquareWithHole('h'),
      ]);
      expect(union(context, ['a', 'ln'])).toEqual({ ok: false, reason: 'not-polygon' });
      expect(union(context, ['a', 'h'])).toEqual({ ok: false, reason: 'has-holes' });
      expect(emit).toHaveBeenCalledTimes(2);
    });
  });
});
