import type { Position } from '../types/features';
import { fromMercator, toMercator } from './rotate';

/**
 * Relative tolerance below which the width is treated as zero: the third
 * point lies on the base line up to floating-point noise.
 */
const ZERO_WIDTH_RATIO = 1e-9;

/**
 * Build a closed, counter-clockwise rectangle ring with an arbitrary
 * orientation from three points.
 *
 * `a` → `b` is one side of the rectangle (the base edge). `c` only sets the
 * width: the rectangle extends from the base edge, on the side where `c`
 * lies, by the perpendicular distance from `c` to the line through `a` and
 * `b`. The rectangle's far corners therefore do not coincide with `c` in
 * general.
 *
 * The right angles are computed in Web Mercator space, which is conformal,
 * so the rectangle looks rectangular on screen at any latitude and bearing
 * (the same frame the rotate mode uses).
 *
 * @returns The 5-position ring starting at `a`, or `null` when `a` and `b`
 *   coincide or `c` lies on the base line (zero width).
 */
export function buildAngledRectangleRing(a: Position, b: Position, c: Position): Position[] | null {
  const pa = toMercator(a);
  const pb = toMercator(b);
  const pc = toMercator(c);

  const ux = pb.x - pa.x;
  const uy = pb.y - pa.y;
  const baseLength = Math.hypot(ux, uy);
  if (baseLength === 0) return null;

  // Signed perpendicular distance from c to the base line. Its sign picks
  // the side, so offsetting along the unit normal (-uy, ux) lands on c's side.
  const width = (ux * (pc.y - pa.y) - uy * (pc.x - pa.x)) / baseLength;
  if (Math.abs(width) <= baseLength * ZERO_WIDTH_RATIO) return null;

  const ox = (-uy / baseLength) * width;
  const oy = (ux / baseLength) * width;

  const start: Position = [a[0], a[1]];
  const next: Position = [b[0], b[1]];
  const far = fromMercator({ x: pb.x + ox, y: pb.y + oy });
  const back = fromMercator({ x: pa.x + ox, y: pa.y + oy });

  // Mercator y grows south, so the winding in lng/lat depends on c's side.
  // Keep the exterior ring counter-clockwise like `buildRectangleRing`,
  // still starting at `a`.
  const ring: Position[] =
    signedArea([start, next, far, back]) >= 0 ? [start, next, far, back] : [start, back, far, next];
  ring.push([start[0], start[1]]);
  return ring;
}

/**
 * Twice the signed area of an open ring in lng/lat (positive = counter-clockwise).
 *
 * Coordinates are taken relative to the first vertex: products of absolute
 * lng/lat values cancel out for small rings far from (0, 0) and can flip or
 * zero the sign.
 */
function signedArea(ring: Position[]): number {
  const [ox, oy] = ring[0];
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % ring.length];
    sum += (p[0] - ox) * (q[1] - oy) - (q[0] - ox) * (p[1] - oy);
  }
  return sum;
}
