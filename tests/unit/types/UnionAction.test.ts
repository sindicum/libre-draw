import { describe, expect, it } from 'vitest';
import { FeatureStore } from '../../../src/core/FeatureStore';
import { UnionAction } from '../../../src/types/features';
import type { LibreDrawFeature } from '../../../src/types/features';

function makeFeature(id: string, coordinates: number[][]): LibreDrawFeature {
  return {
    id,
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [coordinates as [number, number][]],
    },
    properties: { tag: id },
  };
}

const left = () =>
  makeFeature('left', [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
    [0, 0],
  ]);
const right = () =>
  makeFeature('right', [
    [10, 0],
    [20, 0],
    [20, 10],
    [10, 10],
    [10, 0],
  ]);
const merged = () =>
  makeFeature('merged', [
    [0, 0],
    [20, 0],
    [20, 10],
    [0, 10],
    [0, 0],
  ]);

describe('UnionAction', () => {
  it('has the union action type', () => {
    expect(new UnionAction(left(), right(), merged()).type).toBe('union');
  });

  it('apply removes both sources and adds the merged feature', () => {
    const store = new FeatureStore();
    store.add(left());
    store.add(right());

    new UnionAction(left(), right(), merged()).apply(store);

    expect(store.getById('left')).toBeUndefined();
    expect(store.getById('right')).toBeUndefined();
    expect(store.getById('merged')).toBeDefined();
    expect(store.getAll()).toHaveLength(1);
  });

  it('revert removes the merged feature and restores both sources', () => {
    const store = new FeatureStore();
    store.add(left());
    store.add(right());

    const action = new UnionAction(left(), right(), merged());
    action.apply(store);
    action.revert(store);

    expect(store.getById('merged')).toBeUndefined();
    expect(store.getById('left')).toEqual(left());
    expect(store.getById('right')).toEqual(right());
    expect(store.getAll()).toHaveLength(2);
  });

  it('snapshots its inputs so later mutation does not leak into the history', () => {
    const a = left();
    const b = right();
    const result = merged();
    const action = new UnionAction(a, b, result);

    a.properties.tag = 'changed';
    b.geometry.coordinates[0][0] = [99, 99];
    result.properties.tag = 'changed';

    expect(action.featureA.properties.tag).toBe('left');
    expect(action.featureB.geometry.coordinates[0][0]).toEqual([10, 0]);
    expect(action.resultFeature.properties.tag).toBe('merged');
  });
});
