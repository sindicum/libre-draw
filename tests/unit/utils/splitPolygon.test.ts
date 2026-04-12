import { describe, expect, it } from 'vitest';
import type { LibreDrawFeature, Position } from '../../../src/types/features';
import { splitPolygon, splitLine } from '../../../src/utils/splitPolygon';

function makeFeature(
  id: string,
  ring: Position[],
  properties: Record<string, unknown> = {},
): LibreDrawFeature {
  return {
    id,
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [ring],
    },
    properties,
  };
}

function makeFeatureWithHoles(
  id: string,
  outerRing: Position[],
  holes: Position[][],
): LibreDrawFeature {
  return {
    id,
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [outerRing, ...holes],
    },
    properties: {},
  };
}

function signedArea(ring: Position[]): number {
  let area = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return area / 2;
}

function isClosed(ring: Position[]): boolean {
  const first = ring[0];
  const last = ring[ring.length - 1];
  return first[0] === last[0] && first[1] === last[1];
}

describe('splitPolygon', () => {
  it('should split a square into two polygons with equal area', () => {
    const feature = makeFeature('square', [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ]);

    const result = splitPolygon(feature, [5, -5], [5, 15]);
    expect(result.type).toBe('success');

    if (result.type !== 'success') return;
    const [a, b] = result.features;
    const areaA = Math.abs(signedArea(a.geometry.coordinates[0]));
    const areaB = Math.abs(signedArea(b.geometry.coordinates[0]));

    expect(areaA).toBeCloseTo(50, 8);
    expect(areaB).toBeCloseTo(50, 8);
    expect(isClosed(a.geometry.coordinates[0])).toBe(true);
    expect(isClosed(b.geometry.coordinates[0])).toBe(true);
  });

  it('should return error when split line does not intersect polygon', () => {
    const feature = makeFeature('square', [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ]);

    const result = splitPolygon(feature, [20, 20], [30, 30]);
    expect(result).toEqual({ type: 'error', reason: 'invalid-intersection-count' });
  });

  it('should return error when split line intersects polygon in more than two points', () => {
    const feature = makeFeature('concave', [
      [0, 0],
      [10, 0],
      [10, 10],
      [7, 10],
      [7, 3],
      [3, 3],
      [3, 10],
      [0, 10],
      [0, 0],
    ]);

    const result = splitPolygon(feature, [-1, 4], [11, 4]);
    expect(result).toEqual({ type: 'error', reason: 'invalid-intersection-count' });
  });

  it('should allow split line passing through polygon vertices', () => {
    const feature = makeFeature('square', [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ]);

    const result = splitPolygon(feature, [0, 0], [10, 10]);
    expect(result.type).toBe('success');

    if (result.type !== 'success') return;
    const [a, b] = result.features;
    expect(Math.abs(signedArea(a.geometry.coordinates[0]))).toBeCloseTo(50, 8);
    expect(Math.abs(signedArea(b.geometry.coordinates[0]))).toBeCloseTo(50, 8);
  });

  it('should copy properties and assign new IDs to both output features', () => {
    const feature = makeFeature(
      'origin',
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 0],
      ],
      {
        name: 'zone',
        meta: {
          level: 2,
        },
      },
    );

    const result = splitPolygon(feature, [5, -5], [5, 15]);
    expect(result.type).toBe('success');

    if (result.type !== 'success') return;
    const [a, b] = result.features;
    expect(a.id).not.toBe('origin');
    expect(b.id).not.toBe('origin');
    expect(a.id).not.toBe(b.id);

    expect(a.properties).toEqual(feature.properties);
    expect(b.properties).toEqual(feature.properties);

    (a.properties.meta as { level: number }).level = 999;
    expect((feature.properties.meta as { level: number }).level).toBe(2);
    expect((b.properties.meta as { level: number }).level).toBe(2);
  });

  it('should return CCW rings for resulting polygons', () => {
    const feature = makeFeature('square', [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ]);

    const result = splitPolygon(feature, [5, -5], [5, 15]);
    expect(result.type).toBe('success');

    if (result.type !== 'success') return;
    const [a, b] = result.features;
    expect(signedArea(a.geometry.coordinates[0])).toBeGreaterThan(0);
    expect(signedArea(b.geometry.coordinates[0])).toBeGreaterThan(0);
  });

  it('should return error with reason "has-holes" for polygon with holes', () => {
    const feature = makeFeatureWithHoles(
      'with-hole',
      [
        [0, 0],
        [20, 0],
        [20, 20],
        [0, 20],
        [0, 0],
      ],
      [
        [
          [5, 5],
          [5, 15],
          [15, 15],
          [15, 5],
          [5, 5],
        ],
      ],
    );

    const result = splitPolygon(feature, [10, -5], [10, 25]);
    expect(result).toEqual({ type: 'error', reason: 'has-holes' });
  });

  it('should return error with reason "same-points" when split points are identical', () => {
    const feature = makeFeature('square', [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ]);

    const result = splitPolygon(feature, [5, 5], [5, 5]);
    expect(result).toEqual({ type: 'error', reason: 'same-points' });
  });

  it('should successfully split a concave polygon with 2 intersection points', () => {
    // L-shaped concave polygon
    const feature = makeFeature('concave-L', [
      [0, 0],
      [10, 0],
      [10, 5],
      [5, 5],
      [5, 10],
      [0, 10],
      [0, 0],
    ]);

    // Vertical split at x=2 crosses top and bottom edges
    const result = splitPolygon(feature, [2, -1], [2, 11]);
    expect(result.type).toBe('success');

    if (result.type !== 'success') return;
    const [a, b] = result.features;
    const totalArea = Math.abs(signedArea(a.geometry.coordinates[0])) +
      Math.abs(signedArea(b.geometry.coordinates[0]));
    // Original L-shape area = 10*5 + 5*5 = 75
    expect(totalArea).toBeCloseTo(75, 8);
  });

  it('should return specific reason in SplitResult for each failure case', () => {
    const square = makeFeature('sq', [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ]);

    // Same points
    const r1 = splitPolygon(square, [5, 5], [5, 5]);
    expect(r1.type).toBe('error');
    if (r1.type === 'error') expect(r1.reason).toBe('same-points');

    // No intersection
    const r2 = splitPolygon(square, [20, 20], [30, 30]);
    expect(r2.type).toBe('error');
    if (r2.type === 'error') expect(r2.reason).toBe('invalid-intersection-count');

    // Polygon with hole
    const withHole = makeFeatureWithHoles(
      'h',
      [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
      [[[2, 2], [2, 8], [8, 8], [8, 2], [2, 2]]],
    );
    const r3 = splitPolygon(withHole, [5, -1], [5, 11]);
    expect(r3.type).toBe('error');
    if (r3.type === 'error') expect(r3.reason).toBe('has-holes');
  });
});

function makeLineFeature(
  id: string,
  coords: Position[],
  properties: Record<string, unknown> = {},
): LibreDrawFeature {
  return {
    id,
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: coords },
    properties,
  };
}

describe('splitLine', () => {
  it('should split a horizontal line at the intersection point', () => {
    const feature = makeLineFeature('line1', [[0, 0], [10, 0]]);
    const result = splitLine(feature, [5, -5], [5, 5]);

    expect(result.type).toBe('success');
    if (result.type !== 'success') return;

    const [a, b] = result.features;
    expect(a.geometry.type).toBe('LineString');
    expect(b.geometry.type).toBe('LineString');

    if (a.geometry.type !== 'LineString' || b.geometry.type !== 'LineString') return;
    expect(a.geometry.coordinates).toEqual([[0, 0], [5, 0]]);
    expect(b.geometry.coordinates).toEqual([[5, 0], [10, 0]]);
  });

  it('should split a multi-segment line at the first intersection', () => {
    const feature = makeLineFeature('line2', [[0, 0], [10, 0], [10, 10], [0, 10]]);
    const result = splitLine(feature, [5, -5], [5, 5]);

    expect(result.type).toBe('success');
    if (result.type !== 'success') return;

    const [a, b] = result.features;
    if (a.geometry.type !== 'LineString' || b.geometry.type !== 'LineString') return;
    expect(a.geometry.coordinates).toEqual([[0, 0], [5, 0]]);
    expect(b.geometry.coordinates).toEqual([[5, 0], [10, 0], [10, 10], [0, 10]]);
  });

  it('should return error when split line does not intersect', () => {
    const feature = makeLineFeature('line3', [[0, 0], [10, 0]]);
    const result = splitLine(feature, [20, 20], [30, 30]);
    expect(result).toEqual({ type: 'error', reason: 'invalid-intersection-count' });
  });

  it('should return error when split points are identical', () => {
    const feature = makeLineFeature('line4', [[0, 0], [10, 0]]);
    const result = splitLine(feature, [5, 5], [5, 5]);
    expect(result).toEqual({ type: 'error', reason: 'same-points' });
  });

  it('should copy properties and assign new IDs', () => {
    const feature = makeLineFeature('origin', [[0, 0], [10, 0]], { name: 'road' });
    const result = splitLine(feature, [5, -5], [5, 5]);

    expect(result.type).toBe('success');
    if (result.type !== 'success') return;

    const [a, b] = result.features;
    expect(a.id).not.toBe('origin');
    expect(b.id).not.toBe('origin');
    expect(a.id).not.toBe(b.id);
    expect(a.properties).toEqual({ name: 'road' });
    expect(b.properties).toEqual({ name: 'road' });
  });

  it('should handle split at a vertex of the line', () => {
    const feature = makeLineFeature('line5', [[0, 0], [5, 0], [10, 0]]);
    // Split line passes through vertex (5,0)
    const result = splitLine(feature, [5, -5], [5, 5]);

    expect(result.type).toBe('success');
    if (result.type !== 'success') return;

    const [a, b] = result.features;
    if (a.geometry.type !== 'LineString' || b.geometry.type !== 'LineString') return;
    expect(a.geometry.coordinates.length).toBeGreaterThanOrEqual(2);
    expect(b.geometry.coordinates.length).toBeGreaterThanOrEqual(2);
  });
});
