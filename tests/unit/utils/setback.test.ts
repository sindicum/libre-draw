import { describe, expect, it } from 'vitest';
import type { Position } from '../../../src/types/features';
import {
  computeEdgeOffsetLine,
  computeInwardNormal,
  computeOffsetLine,
  extendLine,
  findNearestEdge,
} from '../../../src/utils/setback';

describe('setback utils', () => {
  it('findNearestEdge should return nearest edge within threshold', () => {
    const vertices: Position[] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ];

    const hit = findNearestEdge(vertices, { x: 50, y: 2 }, 10, ({ lng, lat }) => ({
      x: lng * 10,
      y: lat * 10,
    }));

    expect(hit).not.toBeNull();
    expect(hit?.edgeIndex).toBe(0);
  });

  it('findNearestEdge should return null when all edges are outside threshold', () => {
    const vertices: Position[] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ];

    const hit = findNearestEdge(vertices, { x: 200, y: 200 }, 5, ({ lng, lat }) => ({
      x: lng * 10,
      y: lat * 10,
    }));

    expect(hit).toBeNull();
  });

  it('computeInwardNormal should return CCW inward normal', () => {
    const bottomEdgeNormal = computeInwardNormal([0, 0], [1, 0]);
    expect(bottomEdgeNormal[0]).toBeCloseTo(0, 8);
    expect(bottomEdgeNormal[1]).toBeCloseTo(1, 8);

    const rightEdgeNormal = computeInwardNormal([1, 0], [1, 1]);
    expect(rightEdgeNormal[0]).toBeCloseTo(-1, 8);
    expect(rightEdgeNormal[1]).toBeCloseTo(0, 8);
  });

  it('computeInwardNormal should flip direction for clockwise polygons', () => {
    const clockwiseSquare: Position[] = [
      [0, 0],
      [0, 10],
      [10, 10],
      [10, 0],
    ];

    const normal = computeInwardNormal(clockwiseSquare[0], clockwiseSquare[1], clockwiseSquare);

    // Left edge of CW square should point to +x (inside)
    expect(normal[0]).toBeGreaterThan(0);
    expect(Math.abs(normal[1])).toBeLessThan(1e-8);
  });

  it('computeOffsetLine should move edge toward inward normal by meters', () => {
    const [offsetStart, offsetEnd] = computeOffsetLine([0, 0], [0.01, 0], 1000, [0, 1]);

    // Move north from equator by ~1km
    expect(offsetStart[1]).toBeGreaterThan(0);
    expect(offsetEnd[1]).toBeGreaterThan(0);
  });

  it('extendLine should extend both directions by ratio', () => {
    const [extendedStart, extendedEnd] = extendLine([1, 1], [3, 1], 1);

    expect(extendedStart).toEqual([-1, 1]);
    expect(extendedEnd).toEqual([5, 1]);
  });
});

describe('computeEdgeOffsetLine', () => {
  const square: Position[] = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
  ];

  it('offsets the edge inward by the distance in meters', () => {
    const [start, end] = computeEdgeOffsetLine(square, 0, 100_000);
    // Edge 0 runs along lat 0; inward is north, about 0.9 degrees for 100 km.
    expect(start[0]).toBeCloseTo(0, 6);
    expect(end[0]).toBeCloseTo(10, 6);
    expect(start[1]).toBeCloseTo(0.9, 1);
    expect(end[1]).toBeCloseTo(0.9, 1);
  });

  it('wraps the last edge back to the first vertex', () => {
    const [start, end] = computeEdgeOffsetLine(square, 3, 100_000);
    // Edge 3 runs from (0,10) down to (0,0); inward is east.
    expect(start[0]).toBeCloseTo(0.9, 1);
    expect(end[0]).toBeCloseTo(0.9, 1);
    expect(start[1]).toBeCloseTo(10, 1);
    expect(end[1]).toBeCloseTo(0, 6);
  });

  it('throws for a degenerate edge', () => {
    const degenerate: Position[] = [
      [0, 0],
      [0, 0],
      [10, 10],
    ];
    expect(() => computeEdgeOffsetLine(degenerate, 0, 10)).toThrow();
  });
});
