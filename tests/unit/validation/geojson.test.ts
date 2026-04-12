import { describe, it, expect } from 'vitest';
import { validateFeature, validateGeoJSON } from '../../../src/validation/geojson';
import { LibreDrawError } from '../../../src/core/errors';

function makeFeature(overrides: Record<string, unknown> = {}) {
  return {
    id: 'test-1',
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 0],
        ],
      ],
    },
    properties: {},
    ...overrides,
  };
}

describe('validateFeature', () => {
  it('should accept a valid polygon feature', () => {
    const feature = makeFeature();
    const result = validateFeature(feature);
    expect(result).toEqual(feature);
  });

  it('should return a normalized copy instead of input reference', () => {
    const feature = makeFeature();
    const result = validateFeature(feature);

    expect(result).not.toBe(feature);
    expect(result.geometry).not.toBe(feature.geometry);
    expect(result.geometry.coordinates[0]).not.toBe(
      feature.geometry.coordinates[0],
    );

    result.geometry.coordinates[0][0][0] = 999;
    result.properties.name = 'tampered';

    expect(feature.geometry.coordinates[0][0][0]).toBe(0);
    expect((feature.properties as Record<string, unknown>).name).toBeUndefined();
  });

  it('should reject null', () => {
    expect(() => validateFeature(null)).toThrow(LibreDrawError);
  });

  it('should reject undefined', () => {
    expect(() => validateFeature(undefined)).toThrow(LibreDrawError);
  });

  it('should reject non-object', () => {
    expect(() => validateFeature('string')).toThrow(LibreDrawError);
  });

  it('should reject feature with wrong type', () => {
    expect(() => validateFeature(makeFeature({ type: 'Point' }))).toThrow(
      'Feature.type must be "Feature"',
    );
  });

  it('should reject feature with null geometry', () => {
    expect(() => validateFeature(makeFeature({ geometry: null }))).toThrow(
      'Feature.geometry must be a non-null object',
    );
  });

  it('should reject feature with wrong geometry type', () => {
    expect(() =>
      validateFeature(
        makeFeature({
          geometry: { type: 'MultiPoint', coordinates: [[0, 0], [1, 1]] },
        }),
      ),
    ).toThrow('Feature.geometry.type must be "Point", "LineString", or "Polygon"');
  });

  it('should accept a valid LineString feature', () => {
    const feature = makeFeature({
      geometry: {
        type: 'LineString',
        coordinates: [[0, 0], [10, 5], [20, 0]],
      },
    });
    const result = validateFeature(feature);
    expect(result.geometry.type).toBe('LineString');
    if (result.geometry.type === 'LineString') {
      expect(result.geometry.coordinates).toHaveLength(3);
    }
  });

  it('should reject LineString with fewer than 2 positions', () => {
    expect(() =>
      validateFeature(
        makeFeature({
          geometry: { type: 'LineString', coordinates: [[0, 0]] },
        }),
      ),
    ).toThrow('LineString must have at least 2 positions');
  });

  it('should reject LineString with invalid coordinates', () => {
    expect(() =>
      validateFeature(
        makeFeature({
          geometry: { type: 'LineString', coordinates: [[200, 0], [10, 5]] },
        }),
      ),
    ).toThrow('Invalid longitude');
  });

  it('should reject polygon with no rings', () => {
    expect(() =>
      validateFeature(
        makeFeature({
          geometry: { type: 'Polygon', coordinates: [] },
        }),
      ),
    ).toThrow('Polygon must have at least one ring');
  });

  it('should reject ring with fewer than 4 positions', () => {
    expect(() =>
      validateFeature(
        makeFeature({
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [0, 0],
                [10, 0],
                [0, 0],
              ],
            ],
          },
        }),
      ),
    ).toThrow('Ring must have at least 4 positions');
  });

  it('should reject unclosed ring', () => {
    expect(() =>
      validateFeature(
        makeFeature({
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [0, 0],
                [10, 0],
                [10, 10],
                [5, 5],
              ],
            ],
          },
        }),
      ),
    ).toThrow('Ring is not closed');
  });

  it('should reject invalid longitude', () => {
    expect(() =>
      validateFeature(
        makeFeature({
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [200, 0],
                [10, 0],
                [10, 10],
                [200, 0],
              ],
            ],
          },
        }),
      ),
    ).toThrow('Invalid longitude');
  });

  it('should reject invalid latitude', () => {
    expect(() =>
      validateFeature(
        makeFeature({
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [0, 100],
                [10, 0],
                [10, 10],
                [0, 100],
              ],
            ],
          },
        }),
      ),
    ).toThrow('Invalid latitude');
  });

  it('should reject a self-intersecting polygon', () => {
    // Bowtie: edges cross each other
    expect(() =>
      validateFeature(
        makeFeature({
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [0, 0],
                [10, 10],
                [10, 0],
                [0, 10],
                [0, 0],
              ],
            ],
          },
        }),
      ),
    ).toThrow('self-intersections');
  });

  it('should accept a valid non-self-intersecting polygon', () => {
    const feature = makeFeature({
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
    });
    expect(() => validateFeature(feature)).not.toThrow();
  });
});

describe('validateGeoJSON', () => {
  it('should accept a valid FeatureCollection', () => {
    const fc = {
      type: 'FeatureCollection',
      features: [makeFeature()],
    };
    const result = validateGeoJSON(fc);
    expect(result.type).toBe('FeatureCollection');
    expect(result.features).toHaveLength(1);
  });

  it('should return feature copies from FeatureCollection validation', () => {
    const fc = {
      type: 'FeatureCollection',
      features: [makeFeature()],
    };
    const result = validateGeoJSON(fc);

    expect(result.features[0]).not.toBe(fc.features[0]);
    result.features[0].geometry.coordinates[0][0][0] = 999;

    expect(
      (
        fc.features[0] as {
          geometry: { coordinates: [number, number][][] };
        }
      ).geometry.coordinates[0][0][0],
    ).toBe(0);
  });

  it('should accept an empty FeatureCollection', () => {
    const fc = {
      type: 'FeatureCollection',
      features: [],
    };
    const result = validateGeoJSON(fc);
    expect(result.features).toHaveLength(0);
  });

  it('should reject null', () => {
    expect(() => validateGeoJSON(null)).toThrow(LibreDrawError);
  });

  it('should reject wrong type', () => {
    expect(() => validateGeoJSON({ type: 'Feature', features: [] })).toThrow(
      'GeoJSON.type must be "FeatureCollection"',
    );
  });

  it('should reject non-array features', () => {
    expect(() =>
      validateGeoJSON({ type: 'FeatureCollection', features: 'bad' }),
    ).toThrow('GeoJSON.features must be an array');
  });

  it('should report the index of an invalid feature', () => {
    const fc = {
      type: 'FeatureCollection',
      features: [makeFeature(), { type: 'Invalid' }],
    };
    expect(() => validateGeoJSON(fc)).toThrow('Invalid feature at index 1');
  });
});
