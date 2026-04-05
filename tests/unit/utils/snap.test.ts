import { describe, expect, it } from 'vitest';
import type { LibreDrawFeature } from '../../../src/types/features';
import type { ViewportBounds } from '../../../src/utils/snap';
import {
  findSnapTarget,
  isFeatureInBounds,
  projectPointOnSegment,
} from '../../../src/utils/snap';

function makeFeature(
  id: string,
  ring: [number, number][] = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
    [0, 0],
  ],
): LibreDrawFeature {
  return {
    id,
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [ring] },
    properties: {},
  };
}

/**
 * Identity getScreenPoint: returns the same coordinates as screen pixels.
 * This simplifies test assertions by making screen space === geo space.
 */
const identityGetScreenPoint = (lngLat: { lng: number; lat: number }) => ({
  x: lngLat.lng,
  y: lngLat.lat,
});

describe('snap utils', () => {
  describe('projectPointOnSegment', () => {
    it('projects onto the midpoint of a horizontal segment', () => {
      const result = projectPointOnSegment(
        { x: 5, y: 5 },
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      );
      expect(result.x).toBeCloseTo(5, 5);
      expect(result.y).toBeCloseTo(0, 5);
    });

    it('clamps to start point when projection falls before segment', () => {
      const result = projectPointOnSegment(
        { x: -5, y: 0 },
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      );
      expect(result.x).toBeCloseTo(0, 5);
      expect(result.y).toBeCloseTo(0, 5);
    });

    it('clamps to end point when projection falls beyond segment', () => {
      const result = projectPointOnSegment(
        { x: 15, y: 0 },
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      );
      expect(result.x).toBeCloseTo(10, 5);
      expect(result.y).toBeCloseTo(0, 5);
    });

    it('computes perpendicular foot on a diagonal segment', () => {
      // Segment from (0,0) to (10,10). Point (10,0) projects to (5,5).
      const result = projectPointOnSegment(
        { x: 10, y: 0 },
        { x: 0, y: 0 },
        { x: 10, y: 10 },
      );
      expect(result.x).toBeCloseTo(5, 5);
      expect(result.y).toBeCloseTo(5, 5);
    });

    it('handles degenerate segment (zero length)', () => {
      const result = projectPointOnSegment(
        { x: 5, y: 5 },
        { x: 3, y: 3 },
        { x: 3, y: 3 },
      );
      expect(result.x).toBeCloseTo(3, 5);
      expect(result.y).toBeCloseTo(3, 5);
    });
  });

  describe('isFeatureInBounds', () => {
    const bounds: ViewportBounds = {
      west: -10,
      south: -10,
      east: 20,
      north: 20,
    };

    it('returns true when feature is inside viewport', () => {
      const feature = makeFeature('f1');
      expect(isFeatureInBounds(feature, bounds)).toBe(true);
    });

    it('returns false when feature is completely outside viewport', () => {
      const feature = makeFeature('f2', [
        [50, 50],
        [60, 50],
        [60, 60],
        [50, 60],
        [50, 50],
      ]);
      expect(isFeatureInBounds(feature, bounds)).toBe(false);
    });

    it('returns true when feature partially overlaps viewport', () => {
      const feature = makeFeature('f3', [
        [15, 15],
        [25, 15],
        [25, 25],
        [15, 25],
        [15, 15],
      ]);
      expect(isFeatureInBounds(feature, bounds)).toBe(true);
    });

    it('returns true when feature bbox touches viewport boundary', () => {
      const feature = makeFeature('f4', [
        [20, 0],
        [30, 0],
        [30, 10],
        [20, 10],
        [20, 0],
      ]);
      expect(isFeatureInBounds(feature, bounds)).toBe(true);
    });

    it('returns false for feature with empty ring', () => {
      const feature: LibreDrawFeature = {
        id: 'empty',
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [[]] },
        properties: {},
      };
      expect(isFeatureInBounds(feature, bounds)).toBe(false);
    });
  });

  describe('findSnapTarget - vertex snap', () => {
    it('snaps to a vertex within threshold', () => {
      const feature = makeFeature('f1');
      const result = findSnapTarget(
        { lng: 0.5, lat: 0.5 },
        [feature],
        identityGetScreenPoint,
        { threshold: 1 },
      );
      expect(result).not.toBeNull();
      expect(result!.type).toBe('vertex');
      expect(result!.position).toEqual([0, 0]);
      expect(result!.featureId).toBe('f1');
    });

    it('returns null when no vertex is within threshold', () => {
      const feature = makeFeature('f1');
      const result = findSnapTarget(
        { lng: 5, lat: 5 },
        [feature],
        identityGetScreenPoint,
        { threshold: 1 },
      );
      expect(result).toBeNull();
    });

    it('selects the nearest vertex among multiple candidates', () => {
      const feature = makeFeature('f1');
      // Point (0.3, 0.1) is closer to vertex (0,0) than (10,0)
      const result = findSnapTarget(
        { lng: 0.3, lat: 0.1 },
        [feature],
        identityGetScreenPoint,
        { threshold: 1 },
      );
      expect(result).not.toBeNull();
      expect(result!.position).toEqual([0, 0]);
    });

    it('excludes feature by excludeFeatureId', () => {
      const feature = makeFeature('f1');
      const result = findSnapTarget(
        { lng: 0.5, lat: 0.5 },
        [feature],
        identityGetScreenPoint,
        { threshold: 1, excludeFeatureId: 'f1' },
      );
      expect(result).toBeNull();
    });
  });

  describe('findSnapTarget - edge snap', () => {
    it('snaps to an edge when no vertex is close enough', () => {
      // Feature with vertices at (0,0),(100,0),(100,100),(0,100)
      // Point at (50,3) is 3px from the bottom edge, far from any vertex
      const feature = makeFeature('f1', [
        [0, 0],
        [100, 0],
        [100, 100],
        [0, 100],
        [0, 0],
      ]);
      const result = findSnapTarget(
        { lng: 50, lat: 3 },
        [feature],
        identityGetScreenPoint,
        { threshold: 5 },
      );
      expect(result).not.toBeNull();
      expect(result!.type).toBe('edge');
      expect(result!.position[0]).toBeCloseTo(50, 1);
      expect(result!.position[1]).toBeCloseTo(0, 1);
    });

    it('returns null when point is far from all edges', () => {
      const feature = makeFeature('f1', [
        [0, 0],
        [100, 0],
        [100, 100],
        [0, 100],
        [0, 0],
      ]);
      const result = findSnapTarget(
        { lng: 50, lat: 50 },
        [feature],
        identityGetScreenPoint,
        { threshold: 5 },
      );
      expect(result).toBeNull();
    });
  });

  describe('findSnapTarget - vertex priority over edge', () => {
    it('prefers vertex snap when both are within threshold', () => {
      // Large feature: vertex at (0,0), edge from (0,0)→(100,0)
      // Point at (0.3, 0.3) is near both the vertex (0,0) and the bottom edge
      const feature = makeFeature('f1', [
        [0, 0],
        [100, 0],
        [100, 100],
        [0, 100],
        [0, 0],
      ]);
      const result = findSnapTarget(
        { lng: 0.3, lat: 0.3 },
        [feature],
        identityGetScreenPoint,
        { threshold: 1 },
      );
      expect(result).not.toBeNull();
      expect(result!.type).toBe('vertex');
      expect(result!.position).toEqual([0, 0]);
    });
  });

  describe('findSnapTarget - viewport bounds filter', () => {
    it('excludes features outside viewport bounds', () => {
      const insideFeature = makeFeature('inside', [
        [0, 0],
        [5, 0],
        [5, 5],
        [0, 5],
        [0, 0],
      ]);
      const outsideFeature = makeFeature('outside', [
        [100, 100],
        [110, 100],
        [110, 110],
        [100, 110],
        [100, 100],
      ]);

      const result = findSnapTarget(
        { lng: 0.5, lat: 0.5 },
        [insideFeature, outsideFeature],
        identityGetScreenPoint,
        {
          threshold: 1,
          viewportBounds: { west: -10, south: -10, east: 20, north: 20 },
        },
      );

      expect(result).not.toBeNull();
      expect(result!.featureId).toBe('inside');
    });

    it('snaps correctly when all features are in viewport', () => {
      const feature = makeFeature('f1');
      const result = findSnapTarget(
        { lng: 0.5, lat: 0.5 },
        [feature],
        identityGetScreenPoint,
        {
          threshold: 1,
          viewportBounds: { west: -10, south: -10, east: 20, north: 20 },
        },
      );
      expect(result).not.toBeNull();
      expect(result!.type).toBe('vertex');
    });
  });
});
