import { describe, expect, it } from 'vitest';
import type { LibreDrawFeature, Position } from '../../../src/types/features';
import { findSharedVertices, insertOnSharedEdges } from '../../../src/utils/sharedVertices';

function polygon(id: string, ...rings: Position[][]): LibreDrawFeature {
  return {
    id,
    type: 'Feature',
    properties: {},
    geometry: { type: 'Polygon', coordinates: rings.map((r) => [...r, r[0]]) },
  };
}

const square = polygon('S', [
  [0, 0],
  [10, 0],
  [10, 10],
  [0, 10],
]);

describe('findSharedVertices', () => {
  it('lists the exact matches of other polygons, holes included, once per vertex', () => {
    const holed = polygon(
      'H',
      [
        [-20, -20],
        [20, -20],
        [20, 20],
        [-20, 20],
      ],
      [
        [0, 0],
        [5, -5],
        [-5, -5],
      ]
    );
    const near = polygon('N', [
      [1e-9, 0],
      [5, 5],
      [0, 5],
    ]);

    const shared = findSharedVertices([square, holed, near], 'S', [0, 0]);

    expect([...shared]).toEqual([['H', [{ ring: 1, index: 0 }]]]);
  });

  it('ignores lines and points', () => {
    const line: LibreDrawFeature = {
      id: 'L',
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: [
          [0, 0],
          [1, 1],
        ],
      },
    };
    expect(findSharedVertices([square, line], 'X', [0, 0]).has('L')).toBe(false);
  });
});

describe('insertOnSharedEdges', () => {
  it('inserts into a matching edge in either direction, including the closing edge', () => {
    const forward = insertOnSharedEdges(square, [10, 0], [10, 10], [10, 5]);
    expect(forward?.geometry.coordinates).toEqual([
      [
        [0, 0],
        [10, 0],
        [10, 5],
        [10, 10],
        [0, 10],
        [0, 0],
      ],
    ]);

    const closing = insertOnSharedEdges(square, [0, 0], [0, 10], [0, 5]);
    expect(closing?.geometry.coordinates).toEqual([
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 5],
        [0, 0],
      ],
    ]);
  });

  it('inserts into both edges of a ring that repeats the edge', () => {
    const spike = polygon('P', [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 5],
      [-5, 5],
      [0, 5],
    ]);

    const result = insertOnSharedEdges(spike, [0, 5], [-5, 5], [-2.5, 5]);

    expect(result?.geometry.coordinates).toEqual([
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 5],
        [-2.5, 5],
        [-5, 5],
        [-2.5, 5],
        [0, 5],
        [0, 0],
      ],
    ]);
  });

  it('returns undefined when no edge has both ends', () => {
    expect(insertOnSharedEdges(square, [0, 0], [10, 10], [5, 5])).toBeUndefined();
  });
});
