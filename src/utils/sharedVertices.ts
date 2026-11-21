import type { LibreDrawFeature, Position } from '../types/features';
import { getRingVertices, insertVertex, samePosition } from './geometry';

/** A vertex of a polygon: its ring and its index among the ring's vertices. */
export interface VertexRef {
  ring: number;
  index: number;
}

/**
 * The vertices of other polygons that sit exactly at `position`, by feature
 * id. The closing position of a ring is not listed separately.
 */
export function findSharedVertices(
  features: readonly LibreDrawFeature[],
  excludeId: string,
  position: Position
): Map<string, VertexRef[]> {
  const shared = new Map<string, VertexRef[]>();
  for (const feature of features) {
    if (feature.id === excludeId || feature.geometry.type !== 'Polygon') continue;
    const refs: VertexRef[] = [];
    getRingVertices(feature).forEach((vertices, ring) => {
      vertices.forEach((vertex, index) => {
        if (samePosition(vertex, position)) refs.push({ ring, index });
      });
    });
    if (refs.length > 0) shared.set(feature.id, refs);
  }
  return shared;
}

/**
 * Insert `midpoint` into every edge of the polygon whose two ends are `a`
 * and `b` (in either direction). Returns `undefined` when no edge matches.
 */
export function insertOnSharedEdges(
  feature: LibreDrawFeature,
  a: Position,
  b: Position,
  midpoint: Position
): LibreDrawFeature | undefined {
  if (feature.geometry.type !== 'Polygon') return undefined;
  let result = feature;
  let inserted = false;
  getRingVertices(feature).forEach((vertices, ring) => {
    const n = vertices.length;
    // From the last edge back: a ring that repeats the edge gets every insert
    // at the position computed before any of them.
    for (let i = n - 1; i >= 0; i--) {
      const from = vertices[i];
      const to = vertices[(i + 1) % n];
      if (
        (samePosition(from, a) && samePosition(to, b)) ||
        (samePosition(from, b) && samePosition(to, a))
      ) {
        result = insertVertex(result, i + 1, midpoint, ring);
        inserted = true;
      }
    }
  });
  return inserted ? result : undefined;
}
