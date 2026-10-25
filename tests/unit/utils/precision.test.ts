import { describe, expect, it } from 'vitest';
import {
  createCoordinateRounder,
  isCoordinatePrecision,
  MAX_COORDINATE_PRECISION,
} from '../../../src/utils/precision';
import type { LibreDrawFeature } from '../../../src/types/features';

describe('isCoordinatePrecision', () => {
  it('accepts false and the integers from 0 to the maximum', () => {
    expect(isCoordinatePrecision(false)).toBe(true);
    expect(isCoordinatePrecision(0)).toBe(true);
    expect(isCoordinatePrecision(MAX_COORDINATE_PRECISION)).toBe(true);
  });

  it.each([-1, 16, 1.5, Number.NaN, Infinity, true, '8', null, undefined])('rejects %s', (v) => {
    expect(isCoordinatePrecision(v)).toBe(false);
  });
});

describe('createCoordinateRounder', () => {
  it('rounds both values of a position to the given places', () => {
    const round = createCoordinateRounder(8);
    expect(round.position([139.123456789, -35.000000006])).toEqual([139.12345679, -35.00000001]);
    expect(createCoordinateRounder(0).position([139.5, -0.4])).toEqual([140, 0]);
  });

  it('turns a negative zero into 0', () => {
    const [lng, lat] = createCoordinateRounder(3).position([-0.0001, -0]);
    expect(Object.is(lng, 0)).toBe(true);
    expect(Object.is(lat, 0)).toBe(true);
  });

  it.each([3, 8, 15])('returns an already rounded value unchanged at %i places', (places) => {
    const round = createCoordinateRounder(places);
    // 4.0025988456909545 drifts by one unit in the last place when scaled by 10 ** 15.
    const values = [
      179.999999999999,
      -89.12345678901234,
      0.1 + 0.2,
      1e-9,
      139.7,
      4.0025988456909545,
    ];
    for (const value of values) {
      const once = round.position([value, value]);
      expect(round.position(once)).toEqual(once);
    }
  });

  it('returns positions and features unchanged for false', () => {
    const round = createCoordinateRounder(false);
    const position: [number, number] = [139.123456789123, 35.1];
    expect(round.position(position)).toBe(position);
  });

  it('rounds every position of each geometry type without touching the input', () => {
    const round = createCoordinateRounder(1);
    const polygon: LibreDrawFeature = {
      id: 'a',
      type: 'Feature',
      properties: { name: 'x' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [0.04, 0.06],
            [1.04, 0],
            [0, 1.06],
            [0.04, 0.06],
          ],
        ],
      },
    };
    const line: LibreDrawFeature = {
      id: 'b',
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: [
          [0.04, 0],
          [1, 1.06],
        ],
      },
    };
    const point: LibreDrawFeature = {
      id: 'c',
      type: 'Feature',
      properties: {},
      geometry: { type: 'Point', coordinates: [0.04, 0.06] },
    };
    const before = JSON.stringify([polygon, line, point]);

    expect(round.feature(polygon)).toEqual({
      ...polygon,
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0.1],
            [1, 0],
            [0, 1.1],
            [0, 0.1],
          ],
        ],
      },
    });
    expect(round.feature(line).geometry).toEqual({
      type: 'LineString',
      coordinates: [
        [0, 0],
        [1, 1.1],
      ],
    });
    expect(round.feature(point).geometry).toEqual({ type: 'Point', coordinates: [0, 0.1] });
    expect(JSON.stringify([polygon, line, point])).toBe(before);
  });
});
