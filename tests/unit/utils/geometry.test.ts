import { describe, expect, it } from 'vitest';
import type { LibreDrawFeature, Position } from '../../../src/types/features';
import {
  computeLineMidpoints,
  computeMidpoints,
  getLineVertices,
  insertLineVertex,
  moveLine,
  moveLineVertex,
  removeLineVertex,
  getRingVertices,
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

describe('geometry utils with holes', () => {
  const outer: Position[] = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
    [0, 0],
  ];
  const hole: Position[] = [
    [3, 3],
    [3, 6],
    [6, 6],
    [6, 3],
    [3, 3],
  ];

  function makeHoled(): LibreDrawFeature {
    return {
      id: 'h1',
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [outer, hole] },
      properties: {},
    };
  }

  function rings(feature: LibreDrawFeature): Position[][] {
    if (feature.geometry.type !== 'Polygon') throw new Error('expected Polygon');
    return feature.geometry.coordinates;
  }

  it('getRingVertices lists every ring without its closing point', () => {
    expect(getRingVertices(makeHoled())).toEqual([outer.slice(0, 4), hole.slice(0, 4)]);
  });

  it('getVertices still returns only the outer ring', () => {
    expect(getVertices(makeHoled())).toEqual(outer.slice(0, 4));
  });

  it('moveVertex moves a hole vertex and keeps the outer ring', () => {
    const moved = moveVertex(makeHoled(), 2, [7, 7], 1);

    expect(rings(moved)[0]).toEqual(outer);
    expect(rings(moved)[1][2]).toEqual([7, 7]);
  });

  it('moveVertex on vertex 0 of a hole also moves its closing point', () => {
    const moved = moveVertex(makeHoled(), 0, [2, 2], 1);

    expect(rings(moved)[1][0]).toEqual([2, 2]);
    expect(rings(moved)[1][4]).toEqual([2, 2]);
  });

  it('moveVertex on the outer ring keeps the hole', () => {
    const moved = moveVertex(makeHoled(), 1, [12, 0]);

    expect(rings(moved)[0][1]).toEqual([12, 0]);
    expect(rings(moved)[1]).toEqual(hole);
  });

  it('movePolygon translates every ring', () => {
    const moved = movePolygon(makeHoled(), 1, 2);

    expect(rings(moved)[0][0]).toEqual([1, 2]);
    expect(rings(moved)[1][0]).toEqual([4, 5]);
    expect(rings(moved)[1]).toHaveLength(5);
  });

  it('insertVertex inserts into a hole and keeps the outer ring', () => {
    const inserted = insertVertex(makeHoled(), 1, [3, 4.5], 1);

    expect(rings(inserted)[0]).toEqual(outer);
    expect(rings(inserted)[1]).toHaveLength(6);
    expect(rings(inserted)[1][1]).toEqual([3, 4.5]);
  });

  it('removeVertex removes from a hole and re-closes it', () => {
    const removed = removeVertex(makeHoled(), 0, 1);

    expect(rings(removed)[0]).toEqual(outer);
    expect(rings(removed)[1]).toEqual([
      [3, 6],
      [6, 6],
      [6, 3],
      [3, 6],
    ]);
  });

  it('removeVertex on the outer ring keeps the hole', () => {
    const fivePoint: LibreDrawFeature = {
      ...makeHoled(),
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [5, -1],
            [10, 0],
            [10, 10],
            [0, 10],
            [0, 0],
          ],
          hole,
        ],
      },
    };

    const removed = removeVertex(fivePoint, 1);

    expect(rings(removed)[0]).toEqual(outer);
    expect(rings(removed)[1]).toEqual(hole);
  });
});

describe('geometry utils for LineString', () => {
  function makeLine(): LibreDrawFeature {
    return {
      id: 'l1',
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [
          [0, 0],
          [10, 0],
          [10, 10],
        ],
      },
      properties: {},
    };
  }

  function coords(feature: LibreDrawFeature): Position[] {
    if (feature.geometry.type !== 'LineString') throw new Error('expected LineString');
    return feature.geometry.coordinates;
  }

  it('getLineVertices returns a copy of every vertex', () => {
    const line = makeLine();
    const vertices = getLineVertices(line);

    expect(vertices).toEqual(coords(line));
    vertices[0][0] = 99;
    expect(coords(line)[0][0]).toBe(0);
  });

  it('computeLineMidpoints does not close the line', () => {
    expect(computeLineMidpoints(coords(makeLine()))).toEqual([
      [5, 0],
      [10, 5],
    ]);
  });

  it('moveLineVertex moves one vertex', () => {
    expect(coords(moveLineVertex(makeLine(), 1, [12, 0]))[1]).toEqual([12, 0]);
  });

  it('moveLine translates every vertex', () => {
    expect(coords(moveLine(makeLine(), 1, 2))).toEqual([
      [1, 2],
      [11, 2],
      [11, 12],
    ]);
  });

  it('insertLineVertex inserts at the index', () => {
    expect(coords(insertLineVertex(makeLine(), 1, [5, 0]))).toEqual([
      [0, 0],
      [5, 0],
      [10, 0],
      [10, 10],
    ]);
  });

  it('removeLineVertex removes a vertex and keeps at least two', () => {
    const removed = removeLineVertex(makeLine(), 1);
    expect(coords(removed)).toEqual([
      [0, 0],
      [10, 10],
    ]);
    expect(() => removeLineVertex(removed, 0)).toThrow('at least 2 vertices');
  });

  it('rejects the wrong geometry type', () => {
    const polygon: LibreDrawFeature = {
      id: 'p',
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 0],
          ],
        ],
      },
      properties: {},
    };
    expect(() => getLineVertices(polygon)).toThrow('Expected LineString');
    expect(() => getVertices(makeLine())).toThrow('Expected Polygon');
  });
});
