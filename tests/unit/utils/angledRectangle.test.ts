import { describe, it, expect } from 'vitest';
import { buildAngledRectangleRing } from '../../../src/utils/angledRectangle';
import { fromMercator, toMercator, type PlanarPoint } from '../../../src/utils/rotate';
import type { Position } from '../../../src/types/features';

function sub(p: PlanarPoint, q: PlanarPoint): PlanarPoint {
  return { x: p.x - q.x, y: p.y - q.y };
}

function dot(p: PlanarPoint, q: PlanarPoint): number {
  return p.x * q.x + p.y * q.y;
}

function length(p: PlanarPoint): number {
  return Math.hypot(p.x, p.y);
}

/** Signed perpendicular distance from c to the line a→b, in Mercator units. */
function perpendicularDistance(a: Position, b: Position, c: Position): number {
  const u = sub(toMercator(b), toMercator(a));
  const v = sub(toMercator(c), toMercator(a));
  return (u.x * v.y - u.y * v.x) / length(u);
}

/**
 * Twice the signed area in lng/lat (positive = counter-clockwise), taken
 * relative to the first vertex so small rings far from (0, 0) keep precision.
 */
function signedArea(ring: Position[]): number {
  const [ox, oy] = ring[0];
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    sum += (ring[i][0] - ox) * (ring[i + 1][1] - oy) - (ring[i + 1][0] - ox) * (ring[i][1] - oy);
  }
  return sum;
}

/** Assert every corner of the ring is a right angle in Mercator space. */
function expectRightAngles(ring: Position[]): void {
  const corners = ring.slice(0, 4).map(toMercator);
  for (let i = 0; i < 4; i++) {
    const prev = corners[(i + 3) % 4];
    const here = corners[i];
    const next = corners[(i + 1) % 4];
    const e1 = sub(prev, here);
    const e2 = sub(next, here);
    // Cosine of the corner angle.
    expect(Math.abs(dot(e1, e2)) / (length(e1) * length(e2))).toBeLessThan(1e-9);
  }
}

describe('buildAngledRectangleRing', () => {
  it('should build a closed 5-position ring that starts at the first point', () => {
    const ring = buildAngledRectangleRing([0, 0], [1, 0], [0.5, 0.5]);
    expect(ring).not.toBeNull();
    expect(ring).toHaveLength(5);
    expect(ring![0]).toEqual([0, 0]);
    expect(ring![4]).toEqual(ring![0]);
  });

  it('should keep the base edge as one side of the rectangle', () => {
    const a: Position = [139.7, 35.6];
    const b: Position = [139.71, 35.605];
    const ring = buildAngledRectangleRing(a, b, [139.702, 35.61])!;
    const corners = ring.slice(0, 4);
    expect(corners).toContainEqual(a);
    expect(corners).toContainEqual(b);
  });

  it.each([
    ['horizontal', [0, 0], [1, 0], [0.3, 0.4]],
    ['vertical', [0, 0], [0, 1], [0.4, 0.3]],
    ['45 degrees', [0, 0], [1, 1], [0, 1]],
    ['oblique', [139.7, 35.6], [139.713, 35.604], [139.705, 35.615]],
    ['high latitude', [10, 60], [10.02, 60.01], [10.005, 60.02]],
  ] as const)('should make right angles in Mercator space (%s)', (_label, a, b, c) => {
    const ring = buildAngledRectangleRing([...a], [...b], [...c])!;
    expectRightAngles(ring);
  });

  it('should make the width equal to the perpendicular distance of the third point', () => {
    const a: Position = [139.7, 35.6];
    const b: Position = [139.713, 35.604];
    const c: Position = [139.705, 35.615];
    const ring = buildAngledRectangleRing(a, b, c)!;

    const width = Math.abs(perpendicularDistance(a, b, c));
    // The corner adjacent to a that is not b lies `width` away from a.
    const adjacent = ring[1][0] === b[0] && ring[1][1] === b[1] ? ring[3] : ring[1];
    expect(length(sub(toMercator(adjacent), toMercator(a)))).toBeCloseTo(width, 12);
  });

  it('should extend towards the side of the third point', () => {
    const a: Position = [0, 0];
    const b: Position = [1, 0];

    const north = buildAngledRectangleRing(a, b, [0.5, 0.5])!;
    expect(north.every((p) => p[1] >= 0)).toBe(true);
    expect(Math.max(...north.map((p) => p[1]))).toBeGreaterThan(0.49);

    const south = buildAngledRectangleRing(a, b, [0.5, -0.5])!;
    expect(south.every((p) => p[1] <= 0)).toBe(true);
    expect(Math.min(...south.map((p) => p[1]))).toBeLessThan(-0.49);
  });

  it('should produce a counter-clockwise ring on either side', () => {
    const a: Position = [139.7, 35.6];
    const b: Position = [139.713, 35.604];
    expect(signedArea(buildAngledRectangleRing(a, b, [139.705, 35.615])!)).toBeGreaterThan(0);
    expect(signedArea(buildAngledRectangleRing(a, b, [139.71, 35.59])!)).toBeGreaterThan(0);
    // Reversing the base edge flips the side but not the winding.
    expect(signedArea(buildAngledRectangleRing(b, a, [139.705, 35.615])!)).toBeGreaterThan(0);
  });

  it.each([
    ['clockwise side', [139.70004, 35.6], [139.700041, 35.6], [139.70004, 35.599999]],
    ['counter-clockwise side', [139.70004, 35.6], [139.700041, 35.6], [139.70004, 35.600001]],
    ['reversed base edge', [139.700041, 35.6], [139.70004, 35.6], [139.70004, 35.599999]],
  ] as const)(
    'should keep a small rectangle far from the origin counter-clockwise (%s)',
    (_label, a, b, c) => {
      // About 10 cm across: products of absolute lng/lat cancel out here.
      const ring = buildAngledRectangleRing([...a], [...b], [...c])!;
      expect(ring[0]).toEqual([...a]);
      expect(signedArea(ring)).toBeGreaterThan(0);
    }
  );

  it('should return null when the first two points coincide', () => {
    expect(buildAngledRectangleRing([1, 1], [1, 1], [2, 2])).toBeNull();
  });

  it('should return null when the third point is on the base line', () => {
    expect(buildAngledRectangleRing([0, 0], [1, 0], [0.5, 0])).toBeNull();
    // Beyond the segment but still on the line.
    expect(buildAngledRectangleRing([0, 0], [1, 0], [3, 0])).toBeNull();
    expect(buildAngledRectangleRing([0, 0], [1, 0], [0, 0])).toBeNull();
  });

  it('should return null when the third point is on an oblique base line up to rounding', () => {
    const a: Position = [139.7, 35.6];
    const b: Position = [139.713, 35.604];
    // The Mercator midpoint of a and b is on the line only up to floating-point error.
    const pa = toMercator(a);
    const pb = toMercator(b);
    const mid = fromMercator({ x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 });
    expect(buildAngledRectangleRing(a, b, mid)).toBeNull();
  });

  it('should accept a thin but non-zero width', () => {
    // About 1 m wide at the equator.
    const ring = buildAngledRectangleRing([0, 0], [0.01, 0], [0.005, 0.00001]);
    expect(ring).not.toBeNull();
    expectRightAngles(ring!);
  });
});
