import type { OperationContext } from './OperationContext';
import type { EdgeRef, OperationResult } from '../types/operations';
import type { LibreDrawFeature, PolygonGeometry, Position } from '../types/features';
import { SetbackAction } from '../types/features';
import { cloneFeature } from '../utils/featureSnapshot';
import { getVertices } from '../utils/geometry';
import { computeEdgeOffsetLine, extendLine } from '../utils/setback';
import { splitPolygon } from '../utils/splitPolygon';
import { EPSILON } from '../validation/intersection';
import { tryValidateFeature } from '../validation/geojson';

/**
 * The offset line is extended by its own length on both ends so that it
 * crosses the ring even when the edge's neighbours lean outward.
 */
const EXTENDED_OFFSET_LINE_RATIO = 1.0;

/**
 * Move one edge of a Polygon inward by `distanceMeters` as one history
 * step: the ring is split along the offset line and the band on the edge's
 * side is discarded.
 *
 * The result gets a fresh id and a copy of the original's properties,
 * exactly as the setback mode produces it. A geometric failure is reported
 * with the `SetbackFailReason` code and, as in the mode, a `setbackfailed`
 * event; an argument error (`not-found`, `not-polygon`, `invalid-edge`,
 * `invalid-distance`) emits nothing. Only the outer ring can be set back
 * for now: a polygon with holes, or an `edge.ring` other than `0`, is
 * `has-holes`.
 *
 * The result is validated like `addFeatures` input before anything is
 * written; an unusable result is `invalid-split`.
 *
 * @returns `created: [result], deleted: [original]` on success; otherwise
 *   `not-found`, `not-polygon`, `invalid-edge`, `invalid-distance`,
 *   `has-holes`, or `invalid-split`.
 */
export function setback(
  context: OperationContext,
  id: string,
  edge: EdgeRef,
  distanceMeters: number
): OperationResult {
  const current = context.store.getById(id);
  if (!current) {
    return { ok: false, reason: 'not-found' };
  }
  if (current.geometry.type !== 'Polygon') {
    return { ok: false, reason: 'not-polygon' };
  }
  if (current.geometry.coordinates.length > 1 || (edge.ring ?? 0) !== 0) {
    context.events.emit('setbackfailed', { reason: 'has-holes', featureId: current.id });
    return { ok: false, reason: 'has-holes' };
  }

  const vertices = getVertices(current);
  const edgeIndex = edge.index;
  if (!Number.isInteger(edgeIndex) || edgeIndex < 0 || edgeIndex >= vertices.length) {
    return { ok: false, reason: 'invalid-edge' };
  }
  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) {
    return { ok: false, reason: 'invalid-distance' };
  }

  const remaining = computeSetbackResult(current, vertices, edgeIndex, distanceMeters);
  if (!remaining) {
    context.events.emit('setbackfailed', { reason: 'invalid-split', featureId: current.id });
    return { ok: false, reason: 'invalid-split' };
  }

  context.store.remove(current.id);
  context.store.add(remaining);
  context.history.push(new SetbackAction(current, remaining, edgeIndex, distanceMeters));
  context.events.emit('setback', {
    originalFeature: cloneFeature(current),
    feature: cloneFeature(remaining),
    edgeIndex,
    distance: distanceMeters,
  });

  return {
    ok: true,
    created: [cloneFeature(remaining)],
    updated: [],
    deleted: [cloneFeature(current)],
  };
}

/**
 * Split the polygon along the extended offset line and keep the part that
 * does not contain the original edge. `undefined` when the offset line
 * cannot be built, the split fails, or the kept part is not a valid
 * polygon.
 */
function computeSetbackResult(
  feature: LibreDrawFeature,
  vertices: Position[],
  edgeIndex: number,
  distanceMeters: number
): LibreDrawFeature | undefined {
  let extendedStart: Position;
  let extendedEnd: Position;
  try {
    const [offsetStart, offsetEnd] = computeEdgeOffsetLine(vertices, edgeIndex, distanceMeters);
    [extendedStart, extendedEnd] = extendLine(offsetStart, offsetEnd, EXTENDED_OFFSET_LINE_RATIO);
  } catch {
    return undefined;
  }

  const splitResult = splitPolygon(feature, extendedStart, extendedEnd);
  if (splitResult.type === 'error') {
    return undefined;
  }

  // The band is whichever part still contains the original edge's start
  // vertex; the other part is the setback result.
  const edgeStart = vertices[edgeIndex];
  const [featureA, featureB] = splitResult.features;
  const ringA = (featureA.geometry as PolygonGeometry).coordinates[0];
  const isASetbackBand = ringA.some(
    (v) => Math.abs(v[0] - edgeStart[0]) < EPSILON && Math.abs(v[1] - edgeStart[1]) < EPSILON
  );
  const validation = tryValidateFeature(isASetbackBand ? featureB : featureA);
  return validation.valid ? validation.feature : undefined;
}
