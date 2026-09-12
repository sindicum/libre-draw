import { union } from '@turf/union';
import { featureCollection, polygon as turfPolygon } from '@turf/helpers';
import type { LibreDrawFeature, Position } from '../types/features';
import type { UnionFailReason } from '../types/events';
import { cloneProperties } from './featureSnapshot';
import { createFeatureId } from './id';

/**
 * Outcome of {@link unionPolygons}: a merged polygon, or the reason no
 * single hole-free polygon could be produced.
 */
export type UnionResult =
  | { type: 'success'; feature: LibreDrawFeature }
  | { type: 'error'; reason: UnionFailReason };

function fail(reason: UnionFailReason): UnionResult {
  return { type: 'error', reason };
}

/** Copy a ring into fresh `Position` tuples, closing it if the engine left it open. */
function normalizeRing(ring: number[][]): Position[] {
  const positions: Position[] = ring.map((coordinate) => [coordinate[0], coordinate[1]]);
  const first = positions[0];
  const last = positions[positions.length - 1];
  if (first && last && (first[0] !== last[0] || first[1] !== last[1])) {
    positions.push([first[0], first[1]]);
  }
  return positions;
}

/**
 * Merge two polygons into one.
 *
 * Only a result that is a single Polygon without holes counts as success:
 * polygons that do not touch would produce a MultiPolygon (`disjoint`), and
 * polygons that enclose an area between them would produce an inner ring
 * (`has-holes`). Inputs that already have holes are rejected up front.
 *
 * The result gets a fresh id and a deep copy of `first`'s properties.
 * Never throws: engine failures are reported as `invalid-result`.
 */
export function unionPolygons(first: LibreDrawFeature, second: LibreDrawFeature): UnionResult {
  if (first.geometry.type !== 'Polygon' || second.geometry.type !== 'Polygon') {
    return fail('not-polygon');
  }
  if (first.geometry.coordinates.length > 1 || second.geometry.coordinates.length > 1) {
    return fail('has-holes');
  }

  let merged: ReturnType<typeof union>;
  try {
    merged = union(
      featureCollection([
        turfPolygon(first.geometry.coordinates),
        turfPolygon(second.geometry.coordinates),
      ])
    );
  } catch {
    return fail('invalid-result');
  }

  if (!merged) {
    return fail('invalid-result');
  }
  if (merged.geometry.type === 'MultiPolygon') {
    return fail('disjoint');
  }

  const rings = merged.geometry.coordinates;
  if (rings.length > 1) {
    return fail('has-holes');
  }
  if (rings.length === 0) {
    return fail('invalid-result');
  }

  const ring = normalizeRing(rings[0]);
  if (ring.length < 4) {
    return fail('invalid-result');
  }

  return {
    type: 'success',
    feature: {
      id: createFeatureId(),
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [ring] },
      properties: cloneProperties(first.properties),
    },
  };
}
