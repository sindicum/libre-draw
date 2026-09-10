import { describe, expect, it } from 'vitest';
import type { LibreDrawFeature, Position } from '../../../src/types/features';
import {
  computeMidpoints,
  getVertices,
  insertVertex,
  movePolygon,
  moveVertex,
  removeVertex,
} from '../../../src/utils/geometry';

function makeFeature(
  id: string,
  ring: Position[] = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
    [0, 0],
  ]
): LibreDrawFeature {
  return {
    id,
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [ring],
    },
    properties: {},
  };
}

describe('geometry utils', () => {
  describe('getVertices', () => {
    it('should exclude the closing point', () => {
      const feature = makeFeature('f1');

      expect(getVertices(feature)).toEqual([
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ]);
    });
  });

  describe('computeMidpoints', () => {
    it('should compute edge midpoints for all edges', () => {
      const vertices: Position[] = [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ];

      expect(computeMidpoints(vertices)).toEqual([
        [5, 0],
        [10, 5],
        [5, 10],
        [0, 5],
      ]);
    });
  });

  describe('moveVertex', () => {
    it('should update first vertex and sync closing point', () => {
      const feature = makeFeature('f1');

      const moved = moveVertex(feature, 0, [2, 3]);

      expect(moved.geometry.coordinates[0]).toEqual([
        [2, 3],
        [10, 0],
        [10, 10],
        [0, 10],
        [2, 3],
      ]);
      expect(feature.geometry.coordinates[0]).toEqual([
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 0],
      ]);
    });

    it('should update closing point and sync first vertex', () => {
      const feature = makeFeature('f1');

      const moved = moveVertex(feature, 4, [6, 7]);

      expect(moved.geometry.coordinates[0]).toEqual([
        [6, 7],
        [10, 0],
        [10, 10],
        [0, 10],
        [6, 7],
      ]);
      expect(feature.geometry.coordinates[0]).toEqual([
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 0],
      ]);
    });
  });

  describe('movePolygon', () => {
    it('should translate all positions by the given delta', () => {
      const feature = makeFeature('f1');

      const moved = movePolygon(feature, 3, -2);

      expect(moved.geometry.coordinates[0]).toEqual([
        [3, -2],
        [13, -2],
        [13, 8],
        [3, 8],
        [3, -2],
      ]);
    });
  });

  describe('insertVertex', () => {
    it('should insert vertex at the requested index', () => {
      const feature = makeFeature('f1');

      const updated = insertVertex(feature, 2, [8, 4]);

      expect(updated.geometry.coordinates[0]).toEqual([
        [0, 0],
        [10, 0],
        [8, 4],
        [10, 10],
        [0, 10],
        [0, 0],
      ]);
    });
  });

  describe('removeVertex', () => {
    it('should remove vertex and keep ring closed', () => {
      const feature = makeFeature('f1');

      const updated = removeVertex(feature, 1);

      expect(updated.geometry.coordinates[0]).toEqual([
        [0, 0],
        [10, 10],
        [0, 10],
        [0, 0],
      ]);
    });

    it('should keep ring closed when removing first vertex', () => {
      const feature = makeFeature('f1');

      const updated = removeVertex(feature, 0);

      expect(updated.geometry.coordinates[0]).toEqual([
        [10, 0],
        [10, 10],
        [0, 10],
        [10, 0],
      ]);
    });
  });
});
