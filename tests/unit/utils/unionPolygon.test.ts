import { describe, expect, it } from 'vitest';
import { unionPolygons } from '../../../src/utils/unionPolygon';
import type { LibreDrawFeature, Position } from '../../../src/types/features';

function polygon(id: string, rings: Position[][], properties: Record<string, unknown> = {}) {
  return {
    id,
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: rings },
    properties,
  } as LibreDrawFeature;
}

function square(id: string, x: number, y: number, size: number, properties = {}) {
  return polygon(
    id,
    [
      [
        [x, y],
        [x + size, y],
        [x + size, y + size],
        [x, y + size],
        [x, y],
      ],
    ],
    properties
  );
}

function signedArea(ring: Position[]): number {
  let area = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return area / 2;
}

describe('unionPolygons', () => {
  describe('when the polygons overlap', () => {
    it('returns one polygon whose area covers both inputs', () => {
      const result = unionPolygons(square('a', 0, 0, 10), square('b', 5, 5, 10));

      expect(result.type).toBe('success');
      if (result.type !== 'success') return;

      expect(result.feature.geometry.type).toBe('Polygon');
      expect(result.feature.geometry.coordinates).toHaveLength(1);
      // 100 + 100 - 25 (overlap)
      const ring = result.feature.geometry.coordinates[0] as Position[];
      expect(Math.abs(signedArea(ring))).toBeCloseTo(175, 6);
    });

    it('returns a closed counter-clockwise outer ring', () => {
      const result = unionPolygons(square('a', 0, 0, 10), square('b', 5, 5, 10));
      if (result.type !== 'success') throw new Error('expected success');

      const ring = result.feature.geometry.coordinates[0] as Position[];
      expect(ring[0]).toEqual(ring[ring.length - 1]);
      expect(signedArea(ring)).toBeGreaterThan(0);
    });

    it('assigns a fresh id and copies the first polygon properties', () => {
      const first = square('a', 0, 0, 10, { name: 'first', tags: ['x'] });
      const second = square('b', 5, 5, 10, { name: 'second' });

      const result = unionPolygons(first, second);
      if (result.type !== 'success') throw new Error('expected success');

      expect(result.feature.id).not.toBe('a');
      expect(result.feature.id).not.toBe('b');
      expect(result.feature.properties).toEqual({ name: 'first', tags: ['x'] });
      expect(result.feature.properties.tags).not.toBe(first.properties.tags);
    });

    it('does not mutate the input features', () => {
      const first = square('a', 0, 0, 10);
      const second = square('b', 5, 5, 10);
      const firstSnapshot = JSON.stringify(first);
      const secondSnapshot = JSON.stringify(second);

      unionPolygons(first, second);

      expect(JSON.stringify(first)).toBe(firstSnapshot);
      expect(JSON.stringify(second)).toBe(secondSnapshot);
    });
  });

  describe('when the polygons share an edge', () => {
    it('merges them into one rectangle without the shared edge', () => {
      const result = unionPolygons(square('a', 0, 0, 10), square('b', 10, 0, 10));

      expect(result.type).toBe('success');
      if (result.type !== 'success') return;

      const ring = result.feature.geometry.coordinates[0] as Position[];
      expect(Math.abs(signedArea(ring))).toBeCloseTo(200, 6);
      // The merged outline is a 20 x 10 rectangle: 4 corners + closing point.
      expect(ring).toHaveLength(5);
    });

    it('merges a polygon that shares only part of an edge', () => {
      const result = unionPolygons(square('a', 0, 0, 10), square('b', 10, 5, 10));

      expect(result.type).toBe('success');
      if (result.type !== 'success') return;

      const ring = result.feature.geometry.coordinates[0] as Position[];
      expect(Math.abs(signedArea(ring))).toBeCloseTo(200, 6);
    });
  });

  describe('when the polygons do not touch', () => {
    it('fails with disjoint instead of producing a MultiPolygon', () => {
      const result = unionPolygons(square('a', 0, 0, 10), square('b', 20, 20, 10));

      expect(result).toEqual({ type: 'error', reason: 'disjoint' });
    });
  });

  describe('when the merged shape would enclose a hole', () => {
    it('fails with has-holes', () => {
      // A "C" shape whose open side is closed off by the second polygon.
      const cShape = polygon('c', [
        [
          [0, 0],
          [30, 0],
          [30, 10],
          [10, 10],
          [10, 20],
          [30, 20],
          [30, 30],
          [0, 30],
          [0, 0],
        ],
      ]);
      const lid = polygon('lid', [
        [
          [25, 5],
          [35, 5],
          [35, 25],
          [25, 25],
          [25, 5],
        ],
      ]);

      const result = unionPolygons(cShape, lid);

      expect(result).toEqual({ type: 'error', reason: 'has-holes' });
    });
  });

  describe('when an input already has a hole', () => {
    it('fails with has-holes before calling the engine', () => {
      const holed = polygon('h', [
        [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10],
          [0, 0],
        ],
        [
          [2, 2],
          [2, 4],
          [4, 4],
          [4, 2],
          [2, 2],
        ],
      ]);

      expect(unionPolygons(holed, square('b', 5, 5, 10))).toEqual({
        type: 'error',
        reason: 'has-holes',
      });
      expect(unionPolygons(square('b', 5, 5, 10), holed)).toEqual({
        type: 'error',
        reason: 'has-holes',
      });
    });
  });

  describe('when an input is not a polygon', () => {
    it('fails with not-polygon for a point or a line', () => {
      const point = {
        id: 'p',
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [1, 1] },
        properties: {},
      } as LibreDrawFeature;
      const line = {
        id: 'l',
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [
            [0, 0],
            [5, 5],
          ],
        },
        properties: {},
      } as LibreDrawFeature;

      expect(unionPolygons(point, square('b', 0, 0, 10))).toEqual({
        type: 'error',
        reason: 'not-polygon',
      });
      expect(unionPolygons(square('a', 0, 0, 10), line)).toEqual({
        type: 'error',
        reason: 'not-polygon',
      });
    });
  });

  describe('when the engine cannot build a polygon', () => {
    it('fails with invalid-result instead of throwing on a degenerate ring', () => {
      // Three positions cannot form a valid polygon ring; @turf/helpers throws.
      const degenerate = polygon('d', [
        [
          [0, 0],
          [10, 0],
          [0, 0],
        ],
      ]);

      expect(() => unionPolygons(degenerate, square('b', 0, 0, 10))).not.toThrow();
      expect(unionPolygons(degenerate, square('b', 0, 0, 10))).toEqual({
        type: 'error',
        reason: 'invalid-result',
      });
    });
  });
});
