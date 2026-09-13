import type { OperationContext } from './OperationContext';
import type { OperationResult } from '../types/operations';
import type { Position } from '../types/features';
import { SplitAction } from '../types/features';
import { cloneFeature } from '../utils/featureSnapshot';
import { splitLine, splitPolygon } from '../utils/splitPolygon';
import { tryValidateFeature } from '../validation/geojson';

/**
 * Split a Polygon or LineString along the line through `line[0]` and
 * `line[1]` as one history step.
 *
 * A Polygon is cut where the (infinitely extended) line crosses its outer
 * ring exactly twice; a LineString is cut at its first crossing. The two
 * parts get fresh ids and a copy of the original's properties, exactly as
 * the split mode produces them. A geometric failure is reported with the
 * `SplitFailReason` code and, as in the mode, a `splitfailed` event; an
 * argument error (`not-found`, `not-splittable`) emits nothing.
 *
 * The two parts are validated like `addFeatures` input before anything is
 * written. Their vertices are the original vertices plus points on the
 * original edges, so this only fails on rounding at the coordinate limits;
 * that failure reports the validation message and emits no event, because
 * `SplitFailReason` has no code for it.
 *
 * @returns `created: [a, b], deleted: [original]` on success; otherwise
 *   `not-found`, `not-splittable`, a `SplitFailReason`, or the validation
 *   message.
 */
export function split(
  context: OperationContext,
  id: string,
  line: [Position, Position]
): OperationResult {
  const current = context.store.getById(id);
  if (!current) {
    return { ok: false, reason: 'not-found' };
  }
  if (current.geometry.type === 'Point') {
    return { ok: false, reason: 'not-splittable' };
  }

  const splitResult =
    current.geometry.type === 'LineString'
      ? splitLine(current, line[0], line[1])
      : splitPolygon(current, line[0], line[1]);
  if (splitResult.type === 'error') {
    context.events.emit('splitfailed', { reason: splitResult.reason, featureId: current.id });
    return { ok: false, reason: splitResult.reason };
  }

  const validatedA = tryValidateFeature(splitResult.features[0]);
  if (!validatedA.valid) {
    return { ok: false, reason: validatedA.reason };
  }
  const validatedB = tryValidateFeature(splitResult.features[1]);
  if (!validatedB.valid) {
    return { ok: false, reason: validatedB.reason };
  }
  const featureA = validatedA.feature;
  const featureB = validatedB.feature;

  context.store.remove(current.id);
  context.store.add(featureA);
  context.store.add(featureB);
  context.history.push(new SplitAction(current, featureA, featureB));
  context.events.emit('split', {
    originalFeature: cloneFeature(current),
    features: [cloneFeature(featureA), cloneFeature(featureB)],
  });

  return {
    ok: true,
    created: [cloneFeature(featureA), cloneFeature(featureB)],
    updated: [],
    deleted: [cloneFeature(current)],
  };
}
