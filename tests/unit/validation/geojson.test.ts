import { describe, it, expect } from 'vitest';
import {
  validateFeature,
  validateGeoJSON,
  tryValidateFeature,
  tryValidateGeoJSON,
} from '../../../src/validation/geojson';
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
    expect(result.geometry.coordinates[0]).not.toBe(feature.geometry.coordinates[0]);

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
      'Feature.type must be "Feature"'
    );
  });

  it('should reject feature with null geometry', () => {
    expect(() => validateFeature(makeFeature({ geometry: null }))).toThrow(
      'Feature.geometry must be a non-null object'
    );
  });

  it('should reject feature with wrong geometry type', () => {
    expect(() =>
      validateFeature(
        makeFeature({
          geometry: {
            type: 'MultiPoint',
            coordinates: [
              [0, 0],
              [1, 1],
            ],
          },
        })
      )
    ).toThrow('Feature.geometry.type must be "Point", "LineString", or "Polygon"');
  });

  it('should accept a valid LineString feature', () => {
    const feature = makeFeature({
      geometry: {
        type: 'LineString',
        coordinates: [
          [0, 0],
          [10, 5],
          [20, 0],
        ],
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
        })
      )
    ).toThrow('LineString must have at least 2 positions');
  });

  it('should reject LineString with invalid coordinates', () => {
    expect(() =>
      validateFeature(
        makeFeature({
          geometry: {
            type: 'LineString',
            coordinates: [
              [200, 0],
              [10, 5],
            ],
          },
        })
      )
    ).toThrow('Invalid longitude');
  });

  it('should reject polygon with no rings', () => {
    expect(() =>
      validateFeature(
        makeFeature({
          geometry: { type: 'Polygon', coordinates: [] },
        })
      )
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
        })
      )
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
        })
      )
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
        })
      )
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
        })
      )
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
        })
      )
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
      ).geometry.coordinates[0][0][0]
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
      'GeoJSON.type must be "FeatureCollection"'
    );
  });

  it('should reject non-array features', () => {
    expect(() => validateGeoJSON({ type: 'FeatureCollection', features: 'bad' })).toThrow(
      'GeoJSON.features must be an array'
    );
  });

  it('should report the index of an invalid feature', () => {
    const fc = {
      type: 'FeatureCollection',
      features: [makeFeature(), { type: 'Invalid' }],
    };
    expect(() => validateGeoJSON(fc)).toThrow('Invalid feature at index 1');
  });
});

describe('tryValidateFeature', () => {
  it('should return a normalized copy for a valid feature', () => {
    const feature = makeFeature();
    const result = tryValidateFeature(feature);

    expect(result.valid).toBe(true);
    if (!result.valid) throw new Error('expected valid');
    expect(result.feature).toEqual(feature);
    expect(result.feature).not.toBe(feature);
    expect(result.feature.geometry).not.toBe(feature.geometry);
  });

  it('should report the same message validateFeature throws', () => {
    const invalid = makeFeature({ geometry: { type: 'Point', coordinates: [200, 0] } });

    let thrown = '';
    try {
      validateFeature(invalid);
    } catch (err) {
      thrown = (err as Error).message;
    }
    const result = tryValidateFeature(invalid);

    expect(thrown).not.toBe('');
    expect(result).toEqual({ valid: false, reason: thrown });
  });

  it('should reject non-objects without throwing', () => {
    expect(tryValidateFeature(null)).toEqual({
      valid: false,
      reason: 'Feature must be a non-null object.',
    });
    expect(tryValidateFeature('feature').valid).toBe(false);
  });

  it('should let non-LibreDrawError exceptions propagate', () => {
    // A getter that throws stands in for a programming error inside validation.
    const hostile = {
      type: 'Feature',
      get geometry(): never {
        throw new TypeError('boom');
      },
      properties: {},
    };
    expect(() => tryValidateFeature(hostile)).toThrow(TypeError);
  });
});

describe('tryValidateGeoJSON', () => {
  it('should return the normalized features for a valid FeatureCollection', () => {
    const fc = { type: 'FeatureCollection', features: [makeFeature(), makeFeature({ id: 'b' })] };
    const result = tryValidateGeoJSON(fc);

    expect(result.valid).toBe(true);
    if (!result.valid) throw new Error('expected valid');
    expect(result.features.map((f) => f.id)).toEqual(['test-1', 'b']);
    expect(result.features[0]).not.toBe(fc.features[0]);
  });

  it('should report the same message validateGeoJSON throws, with the index prefix', () => {
    const fc = {
      type: 'FeatureCollection',
      features: [
        makeFeature(),
        makeFeature({ geometry: { type: 'Point', coordinates: [200, 0] } }),
      ],
    };

    let thrown = '';
    try {
      validateGeoJSON(fc);
    } catch (err) {
      thrown = (err as Error).message;
    }

    expect(thrown).toMatch(/^Invalid feature at index 1: /);
    expect(tryValidateGeoJSON(fc)).toEqual({ valid: false, reason: thrown });
  });

  it('should reject a value that is not a FeatureCollection without throwing', () => {
    expect(tryValidateGeoJSON(null)).toEqual({
      valid: false,
      reason: 'GeoJSON must be a non-null object.',
    });
    expect(tryValidateGeoJSON({ type: 'Feature' })).toEqual({
      valid: false,
      reason: 'GeoJSON.type must be "FeatureCollection", got "Feature".',
    });
    expect(tryValidateGeoJSON({ type: 'FeatureCollection', features: 'x' })).toEqual({
      valid: false,
      reason: 'GeoJSON.features must be an array.',
    });
  });

  it('should let non-LibreDrawError exceptions propagate', () => {
    const hostile = {
      type: 'FeatureCollection',
      get features(): never {
        throw new TypeError('boom');
      },
    };
    expect(() => tryValidateGeoJSON(hostile)).toThrow(TypeError);
  });
});

describe('validateFeature with holes', () => {
  const outer = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
    [0, 0],
  ];
  const square = (x: number, y: number, size: number) => [
    [x, y],
    [x, y + size],
    [x + size, y + size],
    [x + size, y],
    [x, y],
  ];
  const holed = (...holes: number[][][]) =>
    makeFeature({ geometry: { type: 'Polygon', coordinates: [outer, ...holes] } });

  it('accepts a hole inside the outer ring', () => {
    const feature = validateFeature(holed(square(3, 3, 3)));
    expect(feature.geometry.type === 'Polygon' && feature.geometry.coordinates).toHaveLength(2);
  });

  it('rejects a hole crossing the outer ring', () => {
    expect(() => validateFeature(holed(square(8, 8, 4)))).toThrow('Polygon rings intersect');
  });

  it('rejects a hole outside the outer ring', () => {
    expect(() => validateFeature(holed(square(20, 20, 2)))).toThrow('outside the outer ring');
  });

  it('rejects a hole inside another hole', () => {
    expect(() => validateFeature(holed(square(1, 1, 6), square(3, 3, 2)))).toThrow(
      'inside another hole'
    );
  });

  it.each([
    ['near the origin', 0, 0],
    ['in Tokyo', 139.7, 35.66],
  ])('accepts a 1.1 m square with a hole %s', (_where, ox, oy) => {
    // Edges this short must still be told apart from collinear ones.
    const s = 1e-5;
    const tinyOuter = square(ox, oy, s).reverse();
    const tinyHole = square(ox + s * 0.25, oy + s * 0.25, s * 0.5);
    const feature = validateFeature(
      makeFeature({ geometry: { type: 'Polygon', coordinates: [tinyOuter, tinyHole] } })
    );
    expect(feature.geometry.type === 'Polygon' && feature.geometry.coordinates).toHaveLength(2);
  });

  it('reports the message through tryValidateFeature', () => {
    const result = tryValidateFeature(holed(square(20, 20, 2)));
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toMatch('outside the outer ring');
  });
});

describe('coordinate validity', () => {
  const point = (coordinates: unknown) => makeFeature({ geometry: { type: 'Point', coordinates } });

  it.each([
    [NaN, 0],
    [0, NaN],
    [Infinity, 0],
    [0, -Infinity],
  ])('rejects the non-finite Point coordinate [%s, %s]', (lng, lat) => {
    expect(() => validateFeature(point([lng, lat]))).toThrow('Invalid coordinate');
  });

  it('rejects a non-finite coordinate inside a LineString and a Polygon ring', () => {
    expect(() =>
      validateFeature(
        makeFeature({
          geometry: {
            type: 'LineString',
            coordinates: [
              [0, 0],
              [NaN, 1],
            ],
          },
        })
      )
    ).toThrow('Invalid coordinate');
    expect(() =>
      validateFeature(
        makeFeature({
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [0, 0],
                [10, Infinity],
                [10, 10],
                [0, 0],
              ],
            ],
          },
        })
      )
    ).toThrow('Invalid coordinate');
  });

  it('reports a finite value outside the range as a range error, not a finite one', () => {
    expect(() => validateFeature(point([1e308, 0]))).toThrow('Invalid longitude');
    expect(() => validateFeature(point([0, -1e308]))).toThrow('Invalid latitude');
  });

  it.each([
    [180, 90],
    [-180, -90],
  ])('accepts the boundary coordinate [%s, %s]', (lng, lat) => {
    expect(validateFeature(point([lng, lat])).geometry.coordinates).toEqual([lng, lat]);
  });
});

describe('ring validity', () => {
  const polygon = (ring: unknown[]) =>
    makeFeature({ geometry: { type: 'Polygon', coordinates: [ring] } });

  it('reports a null position as a rejection instead of throwing', () => {
    expect(tryValidateFeature(polygon([null, [0, 0], [10, 0], [10, 10]]))).toEqual({
      valid: false,
      reason: 'Each position in a ring must be an array of at least 2 numbers.',
    });
  });

  it('reports a non-array and a non-numeric position as rejections', () => {
    expect(tryValidateFeature(polygon([[0, 0], 'x', [10, 10], [0, 0]]))).toEqual({
      valid: false,
      reason: 'Each position in a ring must be an array of at least 2 numbers.',
    });
    expect(
      tryValidateFeature(
        polygon([
          [0, 0],
          ['x', 0],
          [10, 10],
          [0, 0],
        ])
      )
    ).toEqual({
      valid: false,
      reason: 'Invalid coordinate: expected [number, number], got [string, number]',
    });
  });

  it('rejects a ring whose positions are all identical', () => {
    expect(() =>
      validateFeature(
        polygon([
          [1, 1],
          [1, 1],
          [1, 1],
          [1, 1],
        ])
      )
    ).toThrow('requires 3 unique vertices');
  });

  it('rejects a collinear ring', () => {
    expect(() =>
      validateFeature(
        polygon([
          [0, 0],
          [1, 0],
          [2, 0],
          [0, 0],
        ])
      )
    ).toThrow('requires 3 unique vertices');
  });

  it('names the degenerate shape before the overlapping edges it also has', () => {
    expect(() =>
      validateFeature(
        polygon([
          [0, 0],
          [1, 0],
          [2, 0],
          [3, 0],
          [0, 0],
        ])
      )
    ).toThrow('requires 3 unique vertices');
  });

  it('accepts a triangle about a metre across', () => {
    const feature = validateFeature(
      polygon([
        [139.7, 35.66],
        [139.70001, 35.66],
        [139.700005, 35.660008],
        [139.7, 35.66],
      ])
    );
    expect(feature.geometry.type).toBe('Polygon');
  });
});

describe('geometry envelope rejections', () => {
  it('rejects a LineString position with non-numeric coordinates', () => {
    expect(() =>
      validateFeature(
        makeFeature({
          geometry: {
            type: 'LineString',
            coordinates: [
              [0, 0],
              ['x', 1],
            ],
          },
        })
      )
    ).toThrow('must contain numeric coordinates');
  });

  it('rejects Polygon coordinates that are not an array', () => {
    expect(() =>
      validateFeature(makeFeature({ geometry: { type: 'Polygon', coordinates: 'x' } }))
    ).toThrow('Feature.geometry.coordinates must be an array.');
  });

  it.each([
    ['Point', 'x', 'Feature.geometry.coordinates must be an array.'],
    ['Point', [1], 'Point coordinates must be [longitude, latitude].'],
    ['LineString', 'x', 'Feature.geometry.coordinates must be an array.'],
    ['LineString', [[0, 0], 1], 'Each position in a LineString must be an array'],
    ['Polygon', ['x'], 'Ring must be an array of positions.'],
  ])('rejects malformed %s coordinates %j', (type, coordinates, message) => {
    expect(() => validateFeature(makeFeature({ geometry: { type, coordinates } }))).toThrow(
      message
    );
  });

  it('lets a non-LibreDrawError thrown by a feature propagate out of validateGeoJSON', () => {
    const hostile = {
      type: 'Feature',
      get geometry(): never {
        throw new TypeError('boom');
      },
      properties: {},
    };
    expect(() => validateGeoJSON({ type: 'FeatureCollection', features: [hostile] })).toThrow(
      TypeError
    );
  });
});
