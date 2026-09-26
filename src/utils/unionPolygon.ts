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
 * Merge two or more polygons into one.
 *
 * All inputs are merged in a single pass, so whether the merge succeeds
 * does not depend on their order: a polygon that only touches the others
 * through a third one still joins. Only a result that is a single Polygon
 * without holes counts as success: polygons that do not all connect would
 * produce a MultiPolygon (`disjoint`), and polygons that enclose an area
 * between them would produce an inner ring (`has-holes`). Inputs that
 * already have holes are rejected up front.
 *
 * The result gets a fresh id and a deep copy of the first feature's
 * properties. Never throws: engine failures (and fewer than two inputs)
 * are reported as `invalid-result`.
 */
export function unionPolygons(features: readonly LibreDrawFeature[]): UnionResult {
  if (features.length < 2) {
    return fail('invalid-result');
  }

  const rings: Position[][][] = [];
  for (const feature of features) {
    if (feature.geometry.type !== 'Polygon') {
      return fail('not-polygon');
    }
    rings.push(feature.geometry.coordinates);
  }
  if (rings.some((polygon) => polygon.length > 1)) {
    return fail('has-holes');
  }

  let merged: ReturnType<typeof union>;
  try {
    merged = union(featureCollection(rings.map((polygon) => turfPolygon(polygon))));
  } catch {
    return fail('invalid-result');
  }

  if (!merged) {
    return fail('invalid-result');
  }
  if (merged.geometry.type === 'MultiPolygon') {
    return fail('disjoint');
  }

  const resultRings = merged.geometry.coordinates;
  if (resultRings.length > 1) {
    return fail('has-holes');
  }
  if (resultRings.length === 0) {
    return fail('invalid-result');
  }

  const ring = normalizeRing(resultRings[0]);
  if (ring.length < 4) {
    return fail('invalid-result');
  }

  return {
    type: 'success',
    feature: {
      id: createFeatureId(),
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [ring] },
      properties: cloneProperties(features[0].properties),
    },
  };
}
