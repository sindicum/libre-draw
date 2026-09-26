import type { Position } from '../types/features';

export const EPSILON = 1e-10;

/**
 * Compute the orientation of triplet (p, q, r).
 * @returns 0 if collinear, 1 if clockwise, 2 if counter-clockwise.
 */
function orientation(p: Position, q: Position, r: Position): number {
  const val = (q[1] - p[1]) * (r[0] - q[0]) - (q[0] - p[0]) * (r[1] - q[1]);
  if (Math.abs(val) < EPSILON) return 0; // collinear
  return val > 0 ? 1 : 2;
}

/**
 * Check if point q lies on segment pr, given that p, q, r are collinear.
 */
function onSegment(p: Position, q: Position, r: Position): boolean {
  return (
    q[0] <= Math.max(p[0], r[0]) &&
    q[0] >= Math.min(p[0], r[0]) &&
    q[1] <= Math.max(p[1], r[1]) &&
    q[1] >= Math.min(p[1], r[1])
  );
}

/**
 * Check if two positions are approximately equal.
 */
function posEqual(a: Position, b: Position): boolean {
  return Math.abs(a[0] - b[0]) < EPSILON && Math.abs(a[1] - b[1]) < EPSILON;
}

/**
 * Compute the intersection point of two line segments.
 * Returns null if they are parallel/collinear or do not intersect within segment bounds.
 */
export function computeIntersectionPoint(
  p1: Position,
  p2: Position,
  p3: Position,
  p4: Position
): Position | null {
  const rX = p2[0] - p1[0];
  const rY = p2[1] - p1[1];
  const sX = p4[0] - p3[0];
  const sY = p4[1] - p3[1];

  const denom = rX * sY - rY * sX;
  if (Math.abs(denom) < EPSILON) {
    return null;
  }

  const qmpX = p3[0] - p1[0];
  const qmpY = p3[1] - p1[1];

  const t = (qmpX * sY - qmpY * sX) / denom;
  const u = (qmpX * rY - qmpY * rX) / denom;

  if (t < -EPSILON || t > 1 + EPSILON || u < -EPSILON || u > 1 + EPSILON) {
    return null;
  }

  const clampedT = Math.max(0, Math.min(1, t));
  return [p1[0] + clampedT * rX, p1[1] + clampedT * rY];
}

/**
 * Check if two line segments (p1-p2) and (p3-p4) truly intersect.
 * Segments that share an endpoint are NOT considered intersecting.
 */
export function segmentsIntersect(p1: Position, p2: Position, p3: Position, p4: Position): boolean {
  // Skip if segments share an endpoint
  if (posEqual(p1, p3) || posEqual(p1, p4) || posEqual(p2, p3) || posEqual(p2, p4)) {
    return false;
  }

  const o1 = orientation(p1, p2, p3);
  const o2 = orientation(p1, p2, p4);
  const o3 = orientation(p3, p4, p1);
  const o4 = orientation(p3, p4, p2);

  // General case: segments straddle each other
  if (o1 !== o2 && o3 !== o4) {
    return true;
  }

  // Collinear special cases: check if points lie on segment
  if (o1 === 0 && onSegment(p1, p3, p2)) return true;
  if (o2 === 0 && onSegment(p1, p4, p2)) return true;
  if (o3 === 0 && onSegment(p3, p1, p4)) return true;
  if (o4 === 0 && onSegment(p3, p2, p4)) return true;

  return false;
}

/**
 * Check if a closed polygon ring has any self-intersections.
 * The ring should include the closing point (first === last).
 * @param ring - The polygon ring coordinates.
 * @returns True if the ring has self-intersections.
 */
export function hasRingSelfIntersection(ring: Position[]): boolean {
  const n = ring.length - 1; // number of edges (exclude closing point)
  if (n < 3) return false;

  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      // Skip adjacent edges that share a vertex (first and last edge are adjacent)
      if (i === 0 && j === n - 1) continue;

      if (segmentsIntersect(ring[i], ring[i + 1], ring[j], ring[j + 1])) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Check if adding a new vertex to the current drawing vertices would cause
 * the new edge to intersect any existing edge.
 * @param vertices - Current vertices (NOT closed, no closing point).
 * @param newVertex - The vertex to add.
 * @returns True if adding the vertex would cause an intersection.
 */
export function wouldNewVertexCauseIntersection(
  vertices: Position[],
  newVertex: Position
): boolean {
  // Need at least 2 existing vertices to have an edge to check against
  if (vertices.length < 2) return false;

  const lastVertex = vertices[vertices.length - 1];

  // Check new edge (lastVertex → newVertex) against all existing edges
  // except the last edge (which shares lastVertex)
  for (let i = 0; i < vertices.length - 2; i++) {
    if (segmentsIntersect(lastVertex, newVertex, vertices[i], vertices[i + 1])) {
      return true;
    }
  }

  return false;
}

/**
 * Check if closing the polygon (connecting last vertex to first) would cause
 * the closing edge to intersect any existing edge.
 * @param vertices - Current vertices (NOT closed, no closing point).
 * @returns True if closing would cause an intersection.
 */
export function wouldClosingCauseIntersection(vertices: Position[]): boolean {
  // Need at least 3 vertices to form a polygon
  if (vertices.length < 3) return false;

  const first = vertices[0];
  const last = vertices[vertices.length - 1];

  // Check closing edge (last → first) against all edges except
  // the first edge (shares first vertex) and the last edge (shares last vertex)
  for (let i = 1; i < vertices.length - 2; i++) {
    if (segmentsIntersect(last, first, vertices[i], vertices[i + 1])) {
      return true;
    }
  }

  return false;
}

/**
 * Why a polygon's rings are invalid together, from {@link findPolygonRingError}.
 * - `self-intersection`: a ring crosses itself.
 * - `ring-intersection`: two rings cross each other.
 * - `hole-outside`: a hole lies outside the outer ring.
 * - `hole-nested`: a hole lies inside another hole.
 */
export type PolygonRingError =
  | 'self-intersection'
  | 'ring-intersection'
  | 'hole-outside'
  | 'hole-nested';

/**
 * Check whether two segments lie on the same line and share a stretch of
 * positive length (touching at a single point does not count).
 */
export function segmentsOverlap(p1: Position, p2: Position, p3: Position, p4: Position): boolean {
  if (orientation(p1, p2, p3) !== 0 || orientation(p1, p2, p4) !== 0) return false;
  // Compare along the segment's dominant axis.
  const axis = Math.abs(p2[0] - p1[0]) >= Math.abs(p2[1] - p1[1]) ? 0 : 1;
  const start = Math.max(Math.min(p1[axis], p2[axis]), Math.min(p3[axis], p4[axis]));
  const end = Math.min(Math.max(p1[axis], p2[axis]), Math.max(p3[axis], p4[axis]));
  return end - start > EPSILON;
}

/**
 * Check whether two closed rings cross or overlap each other. Rings that
 * only touch at single points do not count: segments sharing just an
 * endpoint are skipped, as in {@link segmentsIntersect}, while edges that
 * run along each other for some length do count. A ring passing through the
 * other at a shared vertex is not detected here; {@link findPolygonRingError}
 * catches it by locating the ring's points.
 */
export function ringsIntersect(a: Position[], b: Position[]): boolean {
  for (let i = 0; i < a.length - 1; i++) {
    for (let j = 0; j < b.length - 1; j++) {
      if (
        segmentsIntersect(a[i], a[i + 1], b[j], b[j + 1]) ||
        segmentsOverlap(a[i], a[i + 1], b[j], b[j + 1])
      ) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Locate a point against a closed ring by ray casting.
 */
export function locatePointInRing(
  point: Position,
  ring: Position[]
): 'inside' | 'outside' | 'boundary' {
  let inside = false;
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i];
    const b = ring[i + 1];
    if (orientation(a, b, point) === 0 && onSegment(a, point, b)) return 'boundary';
    if (a[1] > point[1] !== b[1] > point[1]) {
      const x = a[0] + ((point[1] - a[1]) * (b[0] - a[0])) / (b[1] - a[1]);
      if (point[0] < x) inside = !inside;
    }
  }
  return inside ? 'inside' : 'outside';
}

/**
 * Where `ring` lies relative to `container`, for rings whose edges do not
 * cross or overlap. Every vertex and edge midpoint of `ring` is located:
 * points on the container's boundary (shared vertices) are ignored, and the
 * rest must agree. `'crossing'` when some are inside and some outside (the
 * ring passes through the container at a shared vertex) or when every point
 * is on the boundary.
 */
function locateRing(ring: Position[], container: Position[]): 'inside' | 'outside' | 'crossing' {
  const probes: Position[] = ring.slice(0, ring.length - 1);
  for (let i = 0; i < ring.length - 1; i++) {
    probes.push([(ring[i][0] + ring[i + 1][0]) / 2, (ring[i][1] + ring[i + 1][1]) / 2]);
  }
  let inside = false;
  let outside = false;
  for (const probe of probes) {
    const location = locatePointInRing(probe, container);
    if (location === 'inside') inside = true;
    if (location === 'outside') outside = true;
  }
  if (inside === outside) return 'crossing';
  return inside ? 'inside' : 'outside';
}

/**
 * Validate the rings of a polygon together: each ring must be free of
 * self-intersections, no two rings may cross, every hole must lie inside
 * the outer ring, and no hole may lie inside another hole. Rings must be
 * closed (first position repeated at the end).
 * @param rings - The polygon's rings, outer ring first.
 * @returns The first problem found, or `null` if the rings are valid.
 */
export function findPolygonRingError(rings: Position[][]): PolygonRingError | null {
  if (rings.some((ring) => hasRingSelfIntersection(ring))) return 'self-intersection';
  return findRingRelationError(rings);
}

/**
 * The part of {@link findPolygonRingError} that relates the rings to each
 * other, for callers that have already checked each ring on its own.
 * @param rings - The polygon's rings, outer ring first; each must be closed
 *   and free of self-intersections.
 * @returns The first problem found, or `null` if the rings fit together.
 */
export function findRingRelationError(
  rings: Position[][]
): Exclude<PolygonRingError, 'self-intersection'> | null {
  for (let i = 0; i < rings.length; i++) {
    for (let j = i + 1; j < rings.length; j++) {
      if (ringsIntersect(rings[i], rings[j])) return 'ring-intersection';
    }
  }

  const [outer, ...holes] = rings;
  for (const hole of holes) {
    const location = locateRing(hole, outer);
    if (location === 'crossing') return 'ring-intersection';
    if (location === 'outside') return 'hole-outside';
  }

  for (let i = 0; i < holes.length; i++) {
    for (let j = 0; j < holes.length; j++) {
      if (i === j) continue;
      const location = locateRing(holes[i], holes[j]);
      if (location === 'crossing') return 'ring-intersection';
      if (location === 'inside') return 'hole-nested';
    }
  }

  return null;
}
