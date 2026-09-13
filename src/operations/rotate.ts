import type { OperationContext } from './OperationContext';
import type { OperationResult } from '../types/operations';
import { UpdateAction } from '../types/features';
import { isNoRotation, rotateFeature } from '../utils/rotate';
import { cloneFeature } from '../utils/featureSnapshot';
import { tryValidateFeature } from '../validation/geojson';

/**
 * Rotate a Polygon or LineString around its area centroid by `angleDeg`
 * (positive clockwise on screen) as one history step.
 *
 * The rotation starts from whatever shape the store currently holds, so a
 * caller that shows a preview in the store must write the committed shape
 * back first. Points have no orientation and are rejected; an angle that
 * would not change the shape (0, a multiple of 360, or a non-finite value)
 * is rejected too, so the history never records a no-op. The rotated shape
 * goes through the same validation as `addFeatures` input: near the
 * antimeridian or the poles a valid feature can rotate out of the
 * coordinate range, and that result is refused rather than stored.
 *
 * @returns `updated: [rotated]` on success; otherwise `not-found`,
 *   `not-rotatable`, `no-rotation`, or the validation message.
 */
export function rotate(context: OperationContext, id: string, angleDeg: number): OperationResult {
  const current = context.store.getById(id);
  if (!current) {
    return { ok: false, reason: 'not-found' };
  }
  if (current.geometry.type === 'Point') {
    return { ok: false, reason: 'not-rotatable' };
  }
  if (!Number.isFinite(angleDeg) || isNoRotation(angleDeg)) {
    return { ok: false, reason: 'no-rotation' };
  }

  const validation = tryValidateFeature(rotateFeature(current, angleDeg));
  if (!validation.valid) {
    return { ok: false, reason: validation.reason };
  }
  const rotated = validation.feature;

  context.store.update(id, rotated);
  context.history.push(new UpdateAction(id, current, rotated));
  context.events.emit('rotate', {
    originalFeature: cloneFeature(current),
    feature: cloneFeature(rotated),
    angle: angleDeg,
  });

  return { ok: true, created: [], updated: [cloneFeature(rotated)], deleted: [] };
}
