import { describe, expect, it, vi } from 'vitest';
import turfArea from '@turf/area';
import type { LibreDrawFeature, Position } from '../../../src/types/features';
import { featureArea, sphericalArea } from '../../../src/utils/area';

const EARTH_RADIUS = 6371008.8;

function ring(x: number, y: number, size: number): Position[] {
  return [
    [x, y],
    [x + size, y],
    [x + size, y + size],
    [x, y + size],
    [x, y],
  ];
}

function polygon(rings: Position[][]): LibreDrawFeature {
  return {
    id: 'p',
    type: 'Feature',
    properties: {},
    geometry: { type: 'Polygon', coordinates: rings },
  };
}

describe('sphericalArea', () => {
  it('matches @turf/area for a 0.001 degree square at the equator', () => {
    const geometry = polygon([ring(0, 0, 0.001)]).geometry;
    const area = sphericalArea(geometry as never);
    expect(area).toBe(turfArea(geometry as never));
    // A 0.001 degree square at the equator is about (R * 0.001 * pi / 180)^2.
    const side = (EARTH_RADIUS * 0.001 * Math.PI) / 180;
    expect(area).toBeCloseTo(side * side, 0);
  });

  it('subtracts holes', () => {
    const outer = ring(0, 0, 0.002);
    const hole = ring(0.0005, 0.0005, 0.001).reverse();
    const whole = sphericalArea({ type: 'Polygon', coordinates: [outer] });
    const holeArea = sphericalArea({ type: 'Polygon', coordinates: [hole] });
    const withHole = sphericalArea({ type: 'Polygon', coordinates: [outer, hole] });
    expect(withHole).toBeCloseTo(whole - holeArea, 6);
    expect(withHole).toBeLessThan(whole);
  });
});

describe('featureArea', () => {
  it('passes the polygon geometry to the measure and returns its value unchanged', () => {
    const feature = polygon([ring(0, 0, 1)]);
    const measure = vi.fn(() => -42);
    expect(featureArea(feature, measure)).toBe(-42);
    expect(measure).toHaveBeenCalledWith(feature.geometry);
  });

  it('returns undefined for no feature, a LineString, and a Point without measuring', () => {
    const measure = vi.fn(() => 1);
    expect(featureArea(undefined, measure)).toBeUndefined();
    expect(
      featureArea(
        {
          id: 'l',
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: [
              [0, 0],
              [1, 1],
            ],
          },
        },
        measure
      )
    ).toBeUndefined();
    expect(
      featureArea(
        {
          id: 'pt',
          type: 'Feature',
          properties: {},
          geometry: { type: 'Point', coordinates: [0, 0] },
        },
        measure
      )
    ).toBeUndefined();
    expect(measure).not.toHaveBeenCalled();
  });

  it('lets an exception from the measure propagate', () => {
    const error = new Error('boom');
    expect(() =>
      featureArea(polygon([ring(0, 0, 1)]), () => {
        throw error;
      })
    ).toThrow(error);
  });
});
