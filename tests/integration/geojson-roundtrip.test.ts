import { describe, it, expect } from 'vitest';
import { FeatureStore } from '../../src/core/FeatureStore';
import { validateGeoJSON } from '../../src/validation/geojson';
import type { LibreDrawFeature, FeatureCollection } from '../../src/types/features';

describe('GeoJSON Roundtrip Integration', () => {
  const sampleFeatures: LibreDrawFeature[] = [
    {
      id: 'polygon-1',
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [10, 0],
            [10, 10],
            [0, 10],
            [0, 0],
          ],
        ],
      },
      properties: { name: 'Area A' },
    },
    {
      id: 'polygon-2',
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [20, 20],
            [30, 20],
            [30, 30],
            [20, 30],
            [20, 20],
          ],
        ],
      },
      properties: { name: 'Area B' },
    },
  ];

  it('should export features as GeoJSON and re-import them', () => {
    const store = new FeatureStore();

    // Add features
    for (const f of sampleFeatures) {
      store.add(f);
    }

    // Export to GeoJSON
    const geojson = store.toGeoJSON();
    expect(geojson.type).toBe('FeatureCollection');
    expect(geojson.features).toHaveLength(2);

    // Validate the exported GeoJSON
    const validated = validateGeoJSON(geojson);
    expect(validated.features).toHaveLength(2);

    // Re-import into a new store
    const store2 = new FeatureStore();
    store2.setAll(validated.features);

    expect(store2.getAll()).toHaveLength(2);
    expect(store2.getById('polygon-1')).toBeDefined();
    expect(store2.getById('polygon-2')).toBeDefined();
  });

  it('should preserve feature properties through roundtrip', () => {
    const store = new FeatureStore();
    store.add(sampleFeatures[0]);

    const geojson = store.toGeoJSON();
    const validated = validateGeoJSON(geojson);

    const store2 = new FeatureStore();
    store2.setAll(validated.features);

    const feature = store2.getById('polygon-1');
    expect(feature?.properties.name).toBe('Area A');
  });

  it('should preserve geometry coordinates through roundtrip', () => {
    const store = new FeatureStore();
    store.add(sampleFeatures[0]);

    const geojson = store.toGeoJSON();
    const validated = validateGeoJSON(geojson);

    const store2 = new FeatureStore();
    store2.setAll(validated.features);

    const feature = store2.getById('polygon-1');
    expect(feature?.geometry.coordinates[0]).toEqual([
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ]);
  });

  it('should handle empty FeatureCollection', () => {
    const store = new FeatureStore();
    const geojson = store.toGeoJSON();

    expect(geojson.features).toHaveLength(0);

    const validated = validateGeoJSON(geojson);
    expect(validated.features).toHaveLength(0);
  });

  it('should reject invalid GeoJSON on import', () => {
    expect(() =>
      validateGeoJSON({
        type: 'FeatureCollection',
        features: [{ type: 'Invalid' }],
      })
    ).toThrow();
  });

  describe('toGeoJSON() facade contract', () => {
    it('should return a valid FeatureCollection from toGeoJSON()', () => {
      const store = new FeatureStore();
      for (const f of sampleFeatures) {
        store.add(f);
      }

      const geojson: FeatureCollection = store.toGeoJSON();

      expect(geojson.type).toBe('FeatureCollection');
      expect(geojson.features).toHaveLength(2);
      expect(geojson.features[0].type).toBe('Feature');
      expect(geojson.features[0].geometry.type).toBe('Polygon');
      expect(geojson.features[1].id).toBe('polygon-2');
    });

    it('should return an empty FeatureCollection when no features exist', () => {
      const store = new FeatureStore();
      const geojson: FeatureCollection = store.toGeoJSON();

      expect(geojson.type).toBe('FeatureCollection');
      expect(geojson.features).toHaveLength(0);
    });

    it('should roundtrip toGeoJSON() output through setFeatures()', () => {
      const store = new FeatureStore();
      for (const f of sampleFeatures) {
        store.add(f);
      }

      // Export
      const exported = store.toGeoJSON();

      // Validate (as setFeatures would)
      const validated = validateGeoJSON(exported);

      // Re-import into new store
      const store2 = new FeatureStore();
      store2.setAll(validated.features);

      // Re-export and compare
      const reExported = store2.toGeoJSON();
      expect(reExported.features).toHaveLength(exported.features.length);
      expect(reExported.features[0].id).toBe(exported.features[0].id);
      expect(reExported.features[0].geometry.coordinates).toEqual(
        exported.features[0].geometry.coordinates
      );
      expect(reExported.features[0].properties).toEqual(exported.features[0].properties);
    });

    it('should reflect feature additions in toGeoJSON() output', () => {
      const store = new FeatureStore();
      store.add(sampleFeatures[0]);

      let geojson = store.toGeoJSON();
      expect(geojson.features).toHaveLength(1);

      store.add(sampleFeatures[1]);

      geojson = store.toGeoJSON();
      expect(geojson.features).toHaveLength(2);
    });

    it('should reflect feature removals in toGeoJSON() output', () => {
      const store = new FeatureStore();
      for (const f of sampleFeatures) {
        store.add(f);
      }

      store.remove('polygon-1');

      const geojson = store.toGeoJSON();
      expect(geojson.features).toHaveLength(1);
      expect(geojson.features[0].id).toBe('polygon-2');
    });
  });
});
