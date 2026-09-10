import { describe, it, expect } from 'vitest';
import { FeatureStore } from '../../../src/core/FeatureStore';
import type { LibreDrawFeature } from '../../../src/types/features';

function makeFeature(
  id: string,
  coords: [number, number][][] = [
    [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 0],
    ],
  ]
): LibreDrawFeature {
  return {
    id,
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: coords },
    properties: {},
  };
}

describe('FeatureStore', () => {
  it('should add a feature and retrieve it by id', () => {
    const store = new FeatureStore();
    const feature = makeFeature('f1');
    const stored = store.add(feature);

    expect(stored.id).toBe('f1');
    expect(store.getById('f1')).toEqual(stored);
  });

  it('should snapshot input on add', () => {
    const store = new FeatureStore();
    const input = makeFeature('f1');

    store.add(input);
    input.geometry.coordinates[0][0][0] = 999;
    input.properties.name = 'tampered';

    const stored = store.getById('f1')!;
    expect(stored.geometry.coordinates[0][0][0]).toBe(0);
    expect(stored.properties.name).toBeUndefined();
  });

  it('should generate an id if the feature has an empty id', () => {
    const store = new FeatureStore();
    const feature = makeFeature('');
    const stored = store.add(feature);

    expect(stored.id).toBeTruthy();
    expect(stored.id).not.toBe('');
  });

  it('should return all features', () => {
    const store = new FeatureStore();
    store.add(makeFeature('f1'));
    store.add(makeFeature('f2'));

    const all = store.getAll();
    expect(all).toHaveLength(2);
  });

  it('should update an existing feature', () => {
    const store = new FeatureStore();
    store.add(makeFeature('f1'));

    const updated = makeFeature('f1', [
      [
        [1, 1],
        [2, 2],
        [3, 3],
        [1, 1],
      ],
    ]);
    store.update('f1', updated);

    const result = store.getById('f1');
    expect(result!.geometry.coordinates[0][0]).toEqual([1, 1]);
  });

  it('should snapshot input on update', () => {
    const store = new FeatureStore();
    store.add(makeFeature('f1'));

    const updated = makeFeature('f1', [
      [
        [1, 1],
        [2, 2],
        [3, 3],
        [1, 1],
      ],
    ]);

    store.update('f1', updated);
    updated.geometry.coordinates[0][0][0] = 999;

    expect(store.getById('f1')!.geometry.coordinates[0][0][0]).toBe(1);
  });

  it('should not update a non-existent feature', () => {
    const store = new FeatureStore();
    const updated = makeFeature('nonexistent');
    store.update('nonexistent', updated);

    expect(store.getById('nonexistent')).toBeUndefined();
  });

  it('should remove a feature by id', () => {
    const store = new FeatureStore();
    store.add(makeFeature('f1'));
    const removed = store.remove('f1');

    expect(removed).toBeDefined();
    expect(removed!.id).toBe('f1');
    expect(store.getById('f1')).toBeUndefined();
  });

  it('should return undefined when removing non-existent feature', () => {
    const store = new FeatureStore();
    expect(store.remove('nonexistent')).toBeUndefined();
  });

  it('should clear all features', () => {
    const store = new FeatureStore();
    store.add(makeFeature('f1'));
    store.add(makeFeature('f2'));
    store.clear();

    expect(store.getAll()).toHaveLength(0);
  });

  it('should replace all features with setAll', () => {
    const store = new FeatureStore();
    store.add(makeFeature('old'));

    store.setAll([makeFeature('f1'), makeFeature('f2')]);

    expect(store.getAll()).toHaveLength(2);
    expect(store.getById('old')).toBeUndefined();
    expect(store.getById('f1')).toBeDefined();
    expect(store.getById('f2')).toBeDefined();
  });

  it('should snapshot input on setAll', () => {
    const store = new FeatureStore();
    const input = [makeFeature('f1'), makeFeature('f2')];

    store.setAll(input);
    input[0].geometry.coordinates[0][0][0] = 999;

    expect(store.getById('f1')!.geometry.coordinates[0][0][0]).toBe(0);
  });

  it('should export as GeoJSON FeatureCollection', () => {
    const store = new FeatureStore();
    store.add(makeFeature('f1'));
    store.add(makeFeature('f2'));

    const geojson = store.toGeoJSON();
    expect(geojson.type).toBe('FeatureCollection');
    expect(geojson.features).toHaveLength(2);
  });

  it('should return snapshots from getById', () => {
    const store = new FeatureStore();
    store.add(makeFeature('f1'));

    const feature = store.getById('f1')!;
    feature.geometry.coordinates[0][0][0] = 999;

    expect(store.getById('f1')!.geometry.coordinates[0][0][0]).toBe(0);
  });

  it('should return snapshots from getAll', () => {
    const store = new FeatureStore();
    store.add(makeFeature('f1'));

    const all = store.getAll();
    all[0].geometry.coordinates[0][0][0] = 999;

    expect(store.getById('f1')!.geometry.coordinates[0][0][0]).toBe(0);
  });

  it('should return snapshots from toGeoJSON', () => {
    const store = new FeatureStore();
    store.add(makeFeature('f1'));

    const geojson = store.toGeoJSON();
    geojson.features[0].geometry.coordinates[0][0][0] = 999;

    expect(store.getById('f1')!.geometry.coordinates[0][0][0]).toBe(0);
  });

  it('should deep clone a feature', () => {
    const original = makeFeature('f1');
    const clone = FeatureStore.cloneFeature(original);

    expect(clone).toEqual(original);
    expect(clone).not.toBe(original);
    expect(clone.geometry).not.toBe(original.geometry);
    expect(clone.geometry.coordinates[0]).not.toBe(original.geometry.coordinates[0]);

    // Mutating clone should not affect original
    clone.geometry.coordinates[0][0][0] = 999;
    expect(original.geometry.coordinates[0][0][0]).toBe(0);
  });
});
