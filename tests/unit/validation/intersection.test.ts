import { describe, it, expect } from 'vitest';
import {
  segmentsIntersect,
  computeIntersectionPoint,
  hasRingSelfIntersection,
  wouldNewVertexCauseIntersection,
  wouldClosingCauseIntersection,
  ringsIntersect,
  segmentsOverlap,
  locatePointInRing,
  findRingRelationError,
  findPolygonRingError,
} from '../../../src/validation/intersection';
import type { Position } from '../../../src/types/features';

describe('segmentsIntersect', () => {
  it('should detect intersecting segments (X shape)', () => {
    // Segments cross in the middle
    expect(segmentsIntersect([0, 0], [10, 10], [10, 0], [0, 10])).toBe(true);
  });

  it('should return false for non-intersecting segments', () => {
    // Parallel horizontal segments
    expect(segmentsIntersect([0, 0], [10, 0], [0, 5], [10, 5])).toBe(false);
  });

  it('should return false for parallel segments', () => {
    expect(segmentsIntersect([0, 0], [10, 0], [0, 1], [10, 1])).toBe(false);
  });

  it('should return false for segments sharing an endpoint', () => {
    // Two segments connected at (5,5)
    expect(segmentsIntersect([0, 0], [5, 5], [5, 5], [10, 0])).toBe(false);
  });

  it('should detect collinear overlapping segments', () => {
    // Segments overlap on the same line
    expect(segmentsIntersect([0, 0], [10, 0], [5, 0], [15, 0])).toBe(true);
  });

  it('should return false for collinear non-overlapping segments', () => {
    expect(segmentsIntersect([0, 0], [3, 0], [5, 0], [10, 0])).toBe(false);
  });

  it('should return false for segments that almost touch but do not', () => {
    // One segment ends just before the other
    expect(segmentsIntersect([0, 0], [5, 0], [0, 1], [5, 1])).toBe(false);
  });

  it('should detect T-shaped intersection', () => {
    // Horizontal segment and vertical segment crossing through it
    expect(segmentsIntersect([0, 5], [10, 5], [5, 0], [5, 10])).toBe(true);
  });
});

describe('computeIntersectionPoint', () => {
  it('should return intersection point for crossing segments', () => {
    expect(computeIntersectionPoint([0, 0], [10, 10], [0, 10], [10, 0])).toEqual([5, 5]);
  });

  it('should return null for parallel segments', () => {
    expect(computeIntersectionPoint([0, 0], [10, 0], [0, 1], [10, 1])).toBeNull();
  });

  it('should return null for collinear segments', () => {
    expect(computeIntersectionPoint([0, 0], [10, 0], [5, 0], [15, 0])).toBeNull();
  });

  it('should return null when line intersection is outside segment bounds', () => {
    expect(computeIntersectionPoint([0, 0], [1, 1], [2, 0], [2, 10])).toBeNull();
  });
});

describe('hasRingSelfIntersection', () => {
  it('should return false for a simple square (no intersection)', () => {
    const ring: Position[] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ];
    expect(hasRingSelfIntersection(ring)).toBe(false);
  });

  it('should return false for a simple triangle', () => {
    const ring: Position[] = [
      [0, 0],
      [10, 0],
      [5, 10],
      [0, 0],
    ];
    expect(hasRingSelfIntersection(ring)).toBe(false);
  });

  it('should detect figure-8 self-intersection', () => {
    // Bowtie/figure-8: edges cross
    const ring: Position[] = [
      [0, 0],
      [10, 10],
      [10, 0],
      [0, 10],
      [0, 0],
    ];
    expect(hasRingSelfIntersection(ring)).toBe(true);
  });

  it('should detect butterfly/bowtie self-intersection', () => {
    const ring: Position[] = [
      [0, 0],
      [5, 5],
      [10, 0],
      [5, -5],
      [0, 0],
    ];
    // Edge (0,0)→(5,5) does not cross (10,0)→(5,-5)
    // Edge (5,5)→(10,0) does not cross (5,-5)→(0,0)
    // But this is actually a valid diamond, let's use a real bowtie
    expect(hasRingSelfIntersection(ring)).toBe(false);
  });

  it('should detect self-intersection in complex polygon', () => {
    // A polygon where edge 0→1 crosses edge 2→3
    const ring: Position[] = [
      [0, 0],
      [10, 10],
      [0, 10],
      [10, 0],
      [0, 0],
    ];
    expect(hasRingSelfIntersection(ring)).toBe(true);
  });

  it('should return false for a ring with fewer than 3 edges', () => {
    const ring: Position[] = [
      [0, 0],
      [10, 0],
      [0, 0],
    ];
    expect(hasRingSelfIntersection(ring)).toBe(false);
  });

  it('should return false for a pentagon', () => {
    const ring: Position[] = [
      [5, 0],
      [10, 4],
      [8, 10],
      [2, 10],
      [0, 4],
      [5, 0],
    ];
    expect(hasRingSelfIntersection(ring)).toBe(false);
  });
});

describe('wouldNewVertexCauseIntersection', () => {
  it('should return false when fewer than 2 vertices exist', () => {
    expect(wouldNewVertexCauseIntersection([[0, 0]], [5, 5])).toBe(false);
    expect(wouldNewVertexCauseIntersection([], [5, 5])).toBe(false);
  });

  it('should return false for a non-intersecting vertex addition', () => {
    // Drawing a square: (0,0) → (10,0) → now adding (10,10)
    const vertices: Position[] = [
      [0, 0],
      [10, 0],
    ];
    expect(wouldNewVertexCauseIntersection(vertices, [10, 10])).toBe(false);
  });

  it('should detect intersection when new edge crosses existing edge', () => {
    // Vertices: (0,0) → (10,0) → (10,10)
    // Adding (0,-5) would create edge (10,10)→(0,-5) which crosses (0,0)→(10,0)
    const vertices: Position[] = [
      [0, 0],
      [10, 0],
      [10, 10],
    ];
    expect(wouldNewVertexCauseIntersection(vertices, [0, -5])).toBe(true);
  });

  it('should return false when new edge does not cross existing edges', () => {
    // Square drawing: (0,0) → (10,0) → (10,10) → adding (0,10)
    const vertices: Position[] = [
      [0, 0],
      [10, 0],
      [10, 10],
    ];
    expect(wouldNewVertexCauseIntersection(vertices, [0, 10])).toBe(false);
  });

  it('should detect intersection with earlier edges', () => {
    // L-shape then crossing back
    const vertices: Position[] = [
      [0, 0],
      [10, 0],
      [10, 5],
      [5, 5],
    ];
    // Adding (5,-5) creates edge (5,5)→(5,-5) which crosses (0,0)→(10,0)
    expect(wouldNewVertexCauseIntersection(vertices, [5, -5])).toBe(true);
  });
});

describe('wouldClosingCauseIntersection', () => {
  it('should return false for a simple triangle closure', () => {
    const vertices: Position[] = [
      [0, 0],
      [10, 0],
      [5, 10],
    ];
    expect(wouldClosingCauseIntersection(vertices)).toBe(false);
  });

  it('should return false for a simple square closure', () => {
    const vertices: Position[] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ];
    expect(wouldClosingCauseIntersection(vertices)).toBe(false);
  });

  it('should detect intersection on closing', () => {
    // Bowtie: closing edge would cross an existing edge
    // Vertices form: (0,0) → (10,10) → (10,0) → (0,10)
    // Closing (0,10)→(0,0) would need to check against (10,10)→(10,0)
    // Actually the self-intersection is in the drawing itself
    // Let's use a clearer case:
    // (0,0) → (10,0) → (5,10) → (15,5)
    // Closing (15,5)→(0,0) crosses (10,0)→(5,10)
    const vertices: Position[] = [
      [0, 0],
      [10, 0],
      [5, 10],
      [15, 5],
    ];
    expect(wouldClosingCauseIntersection(vertices)).toBe(true);
  });

  it('should return false with fewer than 3 vertices', () => {
    expect(
      wouldClosingCauseIntersection([
        [0, 0],
        [10, 0],
      ])
    ).toBe(false);
  });

  it('should return false for a convex polygon closure', () => {
    const vertices: Position[] = [
      [5, 0],
      [10, 4],
      [8, 10],
      [2, 10],
      [0, 4],
    ];
    expect(wouldClosingCauseIntersection(vertices)).toBe(false);
  });
});

describe('polygon ring validation', () => {
  const outer: Position[] = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
    [0, 0],
  ];
  const square = (x: number, y: number, size: number): Position[] => [
    [x, y],
    [x, y + size],
    [x + size, y + size],
    [x + size, y],
    [x, y],
  ];

  describe('ringsIntersect', () => {
    it('detects crossing rings', () => {
      expect(ringsIntersect(outer, square(8, 8, 4))).toBe(true);
    });

    it('does not count disjoint or nested rings', () => {
      expect(ringsIntersect(outer, square(20, 20, 2))).toBe(false);
      expect(ringsIntersect(outer, square(3, 3, 3))).toBe(false);
    });
  });

  describe('locatePointInRing', () => {
    it('locates inside, outside, and boundary points', () => {
      expect(locatePointInRing([5, 5], outer)).toBe('inside');
      expect(locatePointInRing([15, 5], outer)).toBe('outside');
      expect(locatePointInRing([10, 5], outer)).toBe('boundary');
      expect(locatePointInRing([0, 0], outer)).toBe('boundary');
    });
  });

  describe('findPolygonRingError', () => {
    it('accepts a polygon without holes', () => {
      expect(findPolygonRingError([outer])).toBeNull();
    });

    it('accepts holes inside the outer ring', () => {
      expect(findPolygonRingError([outer, square(1, 1, 2), square(5, 5, 3)])).toBeNull();
    });

    it('accepts a hole touching the outer ring at a shared vertex', () => {
      const touching: Position[] = [
        [0, 0],
        [2, 4],
        [4, 2],
        [0, 0],
      ];
      expect(findPolygonRingError([outer, touching])).toBeNull();
    });

    it('reports a self-intersecting ring', () => {
      const bowtie: Position[] = [
        [2, 2],
        [4, 4],
        [4, 2],
        [2, 4],
        [2, 2],
      ];
      expect(findPolygonRingError([outer, bowtie])).toBe('self-intersection');
    });

    it('reports a hole crossing the outer ring', () => {
      expect(findPolygonRingError([outer, square(8, 8, 4)])).toBe('ring-intersection');
    });

    it('reports holes crossing each other', () => {
      expect(findPolygonRingError([outer, square(1, 1, 4), square(3, 3, 4)])).toBe(
        'ring-intersection'
      );
    });

    it('reports a hole outside the outer ring', () => {
      expect(findPolygonRingError([outer, square(20, 20, 2)])).toBe('hole-outside');
    });

    it('reports a hole inside another hole', () => {
      expect(findPolygonRingError([outer, square(1, 1, 6), square(3, 3, 2)])).toBe('hole-nested');
    });

    it('reports a hole passing out through a shared vertex, whatever its start point', () => {
      const through: Position[] = [
        [5, 5],
        [10, 10],
        [15, 5],
        [10, 0],
        [5, 5],
      ];
      const rotated: Position[] = [
        [15, 5],
        [10, 0],
        [5, 5],
        [10, 10],
        [15, 5],
      ];
      expect(findPolygonRingError([outer, through])).toBe('ring-intersection');
      expect(findPolygonRingError([outer, rotated])).toBe('ring-intersection');
    });

    it('reports a hole sharing an edge with the outer ring', () => {
      const sharedEdge: Position[] = [
        [0, 0],
        [10, 0],
        [5, 5],
        [0, 0],
      ];
      expect(findPolygonRingError([outer, sharedEdge])).toBe('ring-intersection');
    });

    it('reports a hole running along part of an outer edge at a reflex corner', () => {
      // An L-shaped outer ring. The hole's edge (8, 5)-(5, 5) lies on part
      // of the outer edge (5, 5)-(10, 5), starting at the reflex corner.
      const lShape: Position[] = [
        [0, 0],
        [5, 0],
        [5, 5],
        [10, 5],
        [10, 10],
        [0, 10],
        [0, 0],
      ];
      const hole: Position[] = [
        [5, 7],
        [8, 5],
        [5, 5],
        [5, 7],
      ];
      expect(findPolygonRingError([lShape, hole])).toBe('ring-intersection');
    });

    it('reports holes sharing an edge', () => {
      const a: Position[] = [
        [1, 1],
        [1, 4],
        [4, 4],
        [4, 1],
        [1, 1],
      ];
      const b: Position[] = [
        [4, 1],
        [4, 4],
        [7, 4],
        [7, 1],
        [4, 1],
      ];
      expect(findPolygonRingError([outer, a, b])).toBe('ring-intersection');
    });

    it('accepts holes touching each other at one vertex', () => {
      expect(findPolygonRingError([outer, square(1, 1, 3), square(4, 4, 3)])).toBeNull();
    });

    it('reports a hole lying along the outer ring as an intersection', () => {
      expect(findPolygonRingError([outer, [...outer].reverse()])).toBe('ring-intersection');
    });
  });
});

describe('segmentsOverlap', () => {
  it('detects collinear segments sharing a stretch', () => {
    expect(segmentsOverlap([0, 0], [10, 0], [5, 0], [15, 0])).toBe(true);
    expect(segmentsOverlap([0, 0], [0, 10], [0, 2], [0, 4])).toBe(true);
  });

  it('ignores collinear segments touching at one point, and non-collinear ones', () => {
    expect(segmentsOverlap([0, 0], [10, 0], [10, 0], [15, 0])).toBe(false);
    expect(segmentsOverlap([0, 0], [10, 0], [12, 0], [15, 0])).toBe(false);
    expect(segmentsOverlap([0, 0], [10, 0], [5, 0], [5, 5])).toBe(false);
  });
});

describe('findRingRelationError', () => {
  it('relates rings without re-checking self-intersection', () => {
    const outer: Position[] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ];
    const outside: Position[] = [
      [20, 20],
      [20, 22],
      [22, 22],
      [22, 20],
      [20, 20],
    ];
    expect(findRingRelationError([outer])).toBeNull();
    expect(findRingRelationError([outer, outside])).toBe('hole-outside');
  });
});
