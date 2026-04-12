import type { LibreDrawFeature, Position } from '../types/features';
import { cloneProperties } from './featureSnapshot';
import { computeIntersectionPoint, hasRingSelfIntersection, EPSILON } from '../validation/intersection';

/**
 * Intersection of the split line with a polygon edge.
 * Stores the intersection point, the edge index, and the parametric position `t` along the edge.
 */
interface EdgeIntersection {
  point: Position;
  edgeIndex: number;
  t: number;
}

/**
 * A group of EdgeIntersection entries that share the same geometric point.
 * When a split line passes through a vertex shared by two edges, both edges
 * produce an intersection at the same location; this groups them together.
 */
interface UniqueIntersection {
  point: Position;
  occurrences: EdgeIntersection[];
}

/** Check if two numbers are approximately equal within EPSILON tolerance. */
function almostEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < EPSILON;
}

/** Check if two positions are approximately equal (component-wise). */
function positionsEqual(a: Position, b: Position): boolean {
  return almostEqual(a[0], b[0]) && almostEqual(a[1], b[1]);
}

/** Create a shallow copy of a position to prevent mutation of source data. */
function clonePosition(pos: Position): Position {
  return [pos[0], pos[1]];
}

/**
 * Compute the signed area of a closed ring using the shoelace formula.
 * Positive area indicates counter-clockwise winding; negative indicates clockwise.
 */
function signedArea(ring: Position[]): number {
  let area = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return area / 2;
}

/**
 * Compute the parametric position of a point along an edge (start → end).
 * Returns 0.0 at start, 1.0 at end. Uses the axis with greater extent for numerical stability.
 */
function edgeParameter(start: Position, end: Position, point: Position): number {
  const dX = end[0] - start[0];
  const dY = end[1] - start[1];

  if (Math.abs(dX) >= Math.abs(dY) && Math.abs(dX) > EPSILON) {
    return (point[0] - start[0]) / dX;
  }
  if (Math.abs(dY) > EPSILON) {
    return (point[1] - start[1]) / dY;
  }
  return 0;
}

/**
 * Normalize an open list of points into a valid closed polygon ring.
 * Deduplicates consecutive equal points, ensures at least 3 distinct vertices,
 * rejects zero-area rings, and enforces counter-clockwise winding order.
 * Returns null if the points cannot form a valid ring.
 */
function normalizeRing(openPoints: Position[]): Position[] | null {
  const deduped: Position[] = [];
  for (const point of openPoints) {
    if (
      deduped.length === 0 ||
      !positionsEqual(deduped[deduped.length - 1], point)
    ) {
      deduped.push(clonePosition(point));
    }
  }

  if (
    deduped.length >= 2 &&
    positionsEqual(deduped[0], deduped[deduped.length - 1])
  ) {
    deduped.pop();
  }

  if (deduped.length < 3) return null;

  const clockwiseClosed: Position[] = [...deduped, clonePosition(deduped[0])];
  const area = signedArea(clockwiseClosed);
  if (Math.abs(area) < EPSILON) return null;

  if (area > 0) {
    return clockwiseClosed;
  }

  const reversed = [...deduped].reverse();
  return [...reversed, clonePosition(reversed[0])];
}

/**
 * Extract a contiguous sub-path from a circular path between two indices.
 * Traverses forward from `start` to `end`, wrapping around if necessary.
 * Returns an empty array as a safety fallback if the loop exceeds path length.
 */
function buildPathSegment(path: Position[], start: number, end: number): Position[] {
  const result: Position[] = [];
  let i = start;

  while (true) {
    result.push(clonePosition(path[i]));
    if (i === end) {
      return result;
    }
    i = (i + 1) % path.length;
    if (result.length > path.length + 1) {
      return [];
    }
  }
}

/** Find the index of a target position in a path using approximate equality. */
function findPathIndex(path: Position[], target: Position): number {
  for (let i = 0; i < path.length; i++) {
    if (positionsEqual(path[i], target)) {
      return i;
    }
  }
  return -1;
}

/**
 * Reason why a split operation failed.
 */
export type SplitFailReason =
  | 'same-points'
  | 'insufficient-vertices'
  | 'has-holes'
  | 'invalid-intersection-count'
  | 'self-intersecting-result';

/**
 * Result of a split operation.
 * - `success`: the split produced two valid features.
 * - `error`: the split failed for a specific reason.
 */
export type SplitResult =
  | { type: 'success'; features: [LibreDrawFeature, LibreDrawFeature] }
  | { type: 'error'; reason: SplitFailReason };

/**
 * Split a polygon by a line segment defined by two points.
 * Returns a SplitResult indicating success or failure with reason.
 */
export function splitPolygon(
  feature: LibreDrawFeature,
  lineStart: Position,
  lineEnd: Position,
): SplitResult {
  if (positionsEqual(lineStart, lineEnd)) {
    return { type: 'error', reason: 'same-points' };
  }

  if (feature.geometry.type !== 'Polygon') {
    return { type: 'error', reason: 'insufficient-vertices' };
  }

  if (feature.geometry.coordinates.length > 1) {
    return { type: 'error', reason: 'has-holes' };
  }

  const ring = feature.geometry.coordinates[0];
  const vertices = ring.slice(0, ring.length - 1);
  if (vertices.length < 3) {
    return { type: 'error', reason: 'insufficient-vertices' };
  }

  const candidates: EdgeIntersection[] = [];

  for (let i = 0; i < vertices.length; i++) {
    const next = (i + 1) % vertices.length;
    const a = vertices[i];
    const b = vertices[next];

    const point = computeIntersectionPoint(a, b, lineStart, lineEnd);
    if (!point) continue;

    const t = edgeParameter(a, b, point);
    if (t < -EPSILON || t > 1 + EPSILON) continue;

    candidates.push({
      point: clonePosition(point),
      edgeIndex: i,
      t,
    });
  }

  const uniqueIntersections: UniqueIntersection[] = [];
  for (const intersection of candidates) {
    const existing = uniqueIntersections.find((entry) =>
      positionsEqual(entry.point, intersection.point),
    );

    if (existing) {
      existing.occurrences.push(intersection);
    } else {
      uniqueIntersections.push({
        point: clonePosition(intersection.point),
        occurrences: [intersection],
      });
    }
  }

  if (uniqueIntersections.length !== 2) {
    return { type: 'error', reason: 'invalid-intersection-count' };
  }

  const pointsOnEdge = new Map<number, EdgeIntersection[]>();
  for (const intersection of uniqueIntersections) {
    for (const occ of intersection.occurrences) {
      if (occ.t > EPSILON && occ.t < 1 - EPSILON) {
        const list = pointsOnEdge.get(occ.edgeIndex) ?? [];
        list.push(occ);
        pointsOnEdge.set(occ.edgeIndex, list);
      }
    }
  }

  for (const list of pointsOnEdge.values()) {
    list.sort((a, b) => a.t - b.t);
  }

  const path: Position[] = [];
  for (let i = 0; i < vertices.length; i++) {
    path.push(clonePosition(vertices[i]));

    const inserts = pointsOnEdge.get(i);
    if (!inserts) continue;

    for (const insert of inserts) {
      if (!positionsEqual(path[path.length - 1], insert.point)) {
        path.push(clonePosition(insert.point));
      }
    }
  }

  const indexA = findPathIndex(path, uniqueIntersections[0].point);
  const indexB = findPathIndex(path, uniqueIntersections[1].point);
  if (indexA < 0 || indexB < 0 || indexA === indexB) {
    return { type: 'error', reason: 'invalid-intersection-count' };
  }

  const chainAB = buildPathSegment(path, indexA, indexB);
  const chainBA = buildPathSegment(path, indexB, indexA);
  if (chainAB.length === 0 || chainBA.length === 0) {
    return { type: 'error', reason: 'invalid-intersection-count' };
  }

  const ringA = normalizeRing(chainAB);
  const ringB = normalizeRing(chainBA);
  if (!ringA || !ringB) {
    return { type: 'error', reason: 'invalid-intersection-count' };
  }

  if (hasRingSelfIntersection(ringA) || hasRingSelfIntersection(ringB)) {
    return { type: 'error', reason: 'self-intersecting-result' };
  }

  const featureA: LibreDrawFeature = {
    id: crypto.randomUUID(),
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [ringA],
    },
    properties: cloneProperties(feature.properties),
  };

  const featureB: LibreDrawFeature = {
    id: crypto.randomUUID(),
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [ringB],
    },
    properties: cloneProperties(feature.properties),
  };

  return { type: 'success', features: [featureA, featureB] };
}
