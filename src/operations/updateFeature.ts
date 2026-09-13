import type { OperationContext } from './OperationContext';
import type { OperationResult, UpdateFeaturePatch } from '../types/operations';
import { UpdateAction } from '../types/features';
import { tryValidateFeature } from '../validation/geojson';
import { cloneFeature } from '../utils/featureSnapshot';

/**
 * Replace a feature's geometry and/or properties as one history step.
 *
 * Every check runs before anything is written, so a failure leaves the
 * store, the history, and the listeners untouched. The candidate goes
 * through the same validation as `addFeatures`, and a rejected geometry
 * reports that validation message as the reason.
 *
 * @returns `updated: [feature]` on success; otherwise `not-found`,
 *   `geometry-type-mismatch`, `empty-patch`, or the validation message.
 */
export function updateFeature(
  context: OperationContext,
  id: string,
  patch: UpdateFeaturePatch
): OperationResult {
  if (patch.geometry === undefined && patch.properties === undefined) {
    return { ok: false, reason: 'empty-patch' };
  }

  const current = context.store.getById(id);
  if (!current) {
    return { ok: false, reason: 'not-found' };
  }

  if (patch.geometry !== undefined && patch.geometry.type !== current.geometry.type) {
    return { ok: false, reason: 'geometry-type-mismatch' };
  }

  // Validation also normalizes: it returns a deep copy with the coordinates
  // and properties detached from the caller's objects.
  const validation = tryValidateFeature({
    type: 'Feature',
    id,
    geometry: patch.geometry ?? current.geometry,
    properties: patch.properties ?? current.properties,
  });
  if (!validation.valid) {
    return { ok: false, reason: validation.reason };
  }
  const next = validation.feature;

  context.store.update(id, next);
  context.history.push(new UpdateAction(id, current, next));
  context.events.emit('update', {
    feature: cloneFeature(next),
    oldFeature: cloneFeature(current),
  });

  return { ok: true, created: [], updated: [cloneFeature(next)], deleted: [] };
}
