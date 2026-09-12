import { describe, expect, it } from 'vitest';
import { FeatureStore } from '../../../src/core/FeatureStore';
import { SetbackAction } from '../../../src/types/features';
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

describe('SetbackAction', () => {
  it('apply should remove original and add setback result feature', () => {
    const store = new FeatureStore();

    const original = makeFeature('orig', [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ]);
    const result = makeFeature('result', [
      [0, 2],
      [10, 2],
      [10, 10],
      [0, 10],
      [0, 2],
    ]);

    store.add(original);

    const action = new SetbackAction(original, result);
    action.apply(store);

    expect(store.getById('orig')).toBeUndefined();
    expect(store.getById('result')).toBeDefined();
  });

  it('revert should remove setback result and restore original', () => {
    const store = new FeatureStore();

    const original = makeFeature('orig', [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ]);
    const result = makeFeature('result', [
      [0, 2],
      [10, 2],
      [10, 10],
      [0, 10],
      [0, 2],
    ]);

    const action = new SetbackAction(original, result);
    store.add(original);
    action.apply(store);
    action.revert(store);

    expect(store.getById('orig')).toBeDefined();
    expect(store.getById('result')).toBeUndefined();
  });

  it('should keep constructor snapshots immutable', () => {
    const store = new FeatureStore();

    const original = makeFeature('orig', [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ]);
    const result = makeFeature('result', [
      [0, 2],
      [10, 2],
      [10, 10],
      [0, 10],
      [0, 2],
    ]);

    const action = new SetbackAction(original, result);

    original.properties.tag = 'tampered-original';
    result.properties.tag = 'tampered-result';

    store.add(original);
    action.apply(store);

    expect(store.getById('result')?.properties.tag).toBe('result');
  });
  it('should keep the edge index and distance for redo events', () => {
    const original = makeFeature('orig', [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ]);
    const result = makeFeature('result', [
      [0, 2],
      [10, 2],
      [10, 10],
      [0, 10],
      [0, 2],
    ]);
    const action = new SetbackAction(original, result, 2, 12.5);

    expect(action.edgeIndex).toBe(2);
    expect(action.distance).toBe(12.5);
  });

  it('should default the edge index and distance when not given', () => {
    const original = makeFeature('orig', [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ]);
    const result = makeFeature('result', [
      [0, 2],
      [10, 2],
      [10, 10],
      [0, 10],
      [0, 2],
    ]);
    const action = new SetbackAction(original, result);

    expect(action.edgeIndex).toBe(-1);
    expect(action.distance).toBe(0);
  });
});
