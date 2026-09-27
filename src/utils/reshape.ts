import type { LibreDrawFeature, Position } from '../types/features';
import type { ReshapeFailReason } from '../types/events';
import {
  computeIntersectionPoint,
  findRingRelationError,
  hasRingSelfIntersection,
  EPSILON,
} from '../validation/intersection';
import { cloneProperties } from './featureSnapshot';
import { buildPathSegment, edgeParameter, findPathIndex, positionsEqual } from './splitPolygon';

/**
 * Outcome of {@link reshapePolygon}: the reshaped polygon (same id), or
 * why the reshape could not be made.
 */
export type ReshapeResult =
  | { type: 'success'; feature: LibreDrawFeature }
  | { type: 'error'; reason: ReshapeFailReason };

/**
 * A crossing of the line with the outer ring. `linePosition` is the
 * position along the line: segment index plus the parameter within it.
 */
interface Crossing {
  point: Position;
  linePosition: number;
  edges: { edgeIndex: number; t: number }[];
}

/**
 * Check a reshape line and copy it: at least two positions, all numeric.
 * @returns The copied line, or `null` if it is not usable.
 */
export function normalizeReshapeLine(line: readonly Position[]): Position[] | null {
  if (!Array.isArray(line) || line.length < 2) return null;
  for (const position of line) {
    if (
      !Array.isArray(position) ||
      !Number.isFinite(position[0]) ||
      !Number.isFinite(position[1])
    ) {
      return null;
    }
  }
  return line.map((position) => [position[0], position[1]]);
}

/**
 * Signed planar shoelace area of a closed ring, in squared degrees (only
 * compared). Computed relative to the ring's first vertex: cross products
 * of absolute longitudes and latitudes lose the area of a small ring far
 * from the origin to rounding.
 */
function signedRingArea(ring: readonly Position[]): number {
  if (ring.length < 4) return 0;
  const [originX, originY] = ring[0];
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const ax = ring[i][0] - originX;
    const ay = ring[i][1] - originY;
    const bx = ring[i + 1][0] - originX;
    const by = ring[i + 1][1] - originY;
    sum += ax * by - bx * ay;
  }
  return sum / 2;
}

/** Drop consecutive positions that coincide (within EPSILON). */
function dedupe(path: Position[]): Position[] {
  const result: Position[] = [];
  for (const position of path) {
    if (result.length === 0 || !positionsEqual(result[result.length - 1], position)) {
      result.push([position[0], position[1]]);
    }
  }
  return result;
}

/**
 * Whether a closed ring passes through the same position twice. A simple
 * ring never does, but {@link hasRingSelfIntersection} does not see two
 * stretches crossing at a shared vertex (it skips segments that share an
 * endpoint), which a line through one of its own vertices produces.
 */
function revisitsVertex(ring: Position[]): boolean {
  const vertices = ring.slice(0, -1);
  return vertices.some((position, i) =>
    vertices.slice(0, i).some((previous) => positionsEqual(previous, position))
  );
}

/**
 * Every point where the line meets the outer ring, merged by position: a
 * line through a ring vertex meets two edges there, and a line vertex on
 * the ring lies on two line segments.
 */
function findCrossings(vertices: Position[], line: Position[]): Crossing[] {
  const crossings: Crossing[] = [];
  for (let j = 0; j < line.length - 1; j++) {
    for (let i = 0; i < vertices.length; i++) {
      const a = vertices[i];
      const b = vertices[(i + 1) % vertices.length];
      const point = computeIntersectionPoint(a, b, line[j], line[j + 1]);
      if (!point) continue;

      const t = edgeParameter(a, b, point);
      const u = Math.max(0, Math.min(1, edgeParameter(line[j], line[j + 1], point)));
      const linePosition = j + u;
      const existing = crossings.find((crossing) => positionsEqual(crossing.point, point));
      if (existing) {
        existing.edges.push({ edgeIndex: i, t });
        existing.linePosition = Math.min(existing.linePosition, linePosition);
      } else {
        crossings.push({ point: [point[0], point[1]], linePosition, edges: [{ edgeIndex: i, t }] });
      }
    }
  }
  return crossings;
}

/**
 * The outer ring's vertices with the crossings inserted on their edges,
 * in ring order (two crossings on one edge are ordered along it).
 */
function buildRingPath(vertices: Position[], crossings: Crossing[]): Position[] {
  const inserts = new Map<number, { point: Position; t: number }[]>();
  for (const crossing of crossings) {
    for (const { edgeIndex, t } of crossing.edges) {
      // A crossing at a vertex is already on the path. Compared by position,
      // as the path is searched later, not by the parameter along the edge.
      const start = vertices[edgeIndex];
      const end = vertices[(edgeIndex + 1) % vertices.length];
      if (positionsEqual(crossing.point, start) || positionsEqual(crossing.point, end)) continue;
      const list = inserts.get(edgeIndex) ?? [];
      list.push({ point: crossing.point, t });
      inserts.set(edgeIndex, list);
    }
  }

  const path: Position[] = [];
  for (let i = 0; i < vertices.length; i++) {
    path.push([vertices[i][0], vertices[i][1]]);
    const list = inserts.get(i);
    if (!list) continue;
    list.sort((a, b) => a.t - b.t);
    for (const { point } of list) {
      if (!positionsEqual(path[path.length - 1], point)) path.push([point[0], point[1]]);
    }
  }
  return path;
}

/**
 * The part of the line from its first crossing A to its second crossing
 * B; whatever sticks out beyond them is dropped.
 */
function lineBetween(line: Position[], a: Crossing, b: Crossing): Position[] {
  const interior = line.slice(Math.floor(a.linePosition) + 1, Math.ceil(b.linePosition));
  return dedupe([a.point, ...interior, b.point]);
}

/**
 * Replace the part of a polygon's outer ring between the two points where
 * `line` crosses it with the line itself.
 *
 * The two crossings divide the outer ring into two arcs, and replacing
 * either one gives a candidate ring. The larger candidate is kept. The
 * line between the crossings lies wholly inside or wholly outside the
 * polygon, so this adds area when the line runs outside (the candidate
 * that still contains the polygon) and removes area when it runs inside
 * (the larger of the two pieces), whichever arc the line starts from. On a
 * tie the arc followed from the first crossing to the second is replaced.
 *
 * The line's ends may stick out beyond the crossings (they are dropped) or
 * lie exactly on the ring. Holes are kept unchanged and must still fit the
 * new outer ring. The result keeps the target's id, properties, and ring
 * orientation. Never throws.
 *
 * @param line - At least two positions (see {@link normalizeReshapeLine}).
 */
export function reshapePolygon(target: LibreDrawFeature, line: Position[]): ReshapeResult {
  // The operation rejects other geometries as 'not-polygon' before calling
  // this; the guard only narrows the type for callers that skip that check.
  if (target.geometry.type !== 'Polygon') {
    return { type: 'error', reason: 'invalid-result' };
  }
  const [outer, ...holes] = target.geometry.coordinates;
  const vertices = outer.slice(0, outer.length - 1);

  const crossings = findCrossings(vertices, line);
  if (crossings.length !== 2) {
    return { type: 'error', reason: 'invalid-intersection-count' };
  }
  const [a, b] = [...crossings].sort((x, y) => x.linePosition - y.linePosition);

  const path = buildRingPath(vertices, crossings);
  const indexA = findPathIndex(path, a.point);
  const indexB = findPathIndex(path, b.point);
  // Defensive: each crossing is either a ring vertex or inserted into the
  // path by the same position comparison, so both are found.
  if (indexA < 0 || indexB < 0 || indexA === indexB) {
    return { type: 'error', reason: 'invalid-intersection-count' };
  }

  const replacement = lineBetween(line, a, b);
  const arcAB = buildPathSegment(path, indexA, indexB);
  const arcBA = buildPathSegment(path, indexB, indexA);
  // Replace arc A -> B: the line A -> B, then the ring B -> A.
  const withoutArcAB = dedupe([...replacement, ...arcBA.slice(1)]);
  // Replace arc B -> A: the ring A -> B, then the line back B -> A.
  const withoutArcBA = dedupe([...arcAB, ...[...replacement].reverse().slice(1)]);

  // Both candidates follow the kept arc in ring order, with the polygon's
  // interior on the same side of it, so either keeps the target's orientation.
  const ring =
    Math.abs(signedRingArea(withoutArcAB)) >= Math.abs(signedRingArea(withoutArcBA))
      ? withoutArcAB
      : withoutArcBA;

  const distinct = new Set(ring.slice(0, -1).map((position) => `${position[0]},${position[1]}`));
  // Defensive: the larger candidate only degenerates for a target that
  // would not pass store validation.
  if (distinct.size < 3 || Math.abs(signedRingArea(ring)) <= EPSILON * EPSILON) {
    return { type: 'error', reason: 'invalid-result' };
  }

  if (revisitsVertex(ring) || hasRingSelfIntersection(ring)) {
    return { type: 'error', reason: 'self-intersecting-result' };
  }
  const rings = [ring, ...holes.map((hole) => hole.map((p): Position => [p[0], p[1]]))];
  const relationError = holes.length > 0 ? findRingRelationError(rings) : null;
  if (relationError === 'hole-outside') {
    return { type: 'error', reason: 'hole-outside' };
  }
  if (relationError !== null) {
    // 'hole-nested' cannot arise from unchanged holes of a valid polygon.
    return { type: 'error', reason: 'ring-intersection' };
  }

  return {
    type: 'success',
    feature: {
      id: target.id,
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: rings },
      properties: cloneProperties(target.properties),
    },
  };
}
