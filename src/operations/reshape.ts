import type { OperationContext } from './OperationContext';
import type { OperationResult } from '../types/operations';
import type { Position } from '../types/features';
import { UpdateAction } from '../types/features';
import { cloneFeature } from '../utils/featureSnapshot';
import { normalizeReshapeLine, reshapePolygon } from '../utils/reshape';
import { tryValidateFeature } from '../validation/geojson';

/**
 * Replace the part of a Polygon's outer ring between the two points where
 * `line` crosses it with the line, as one history step.
 *
 * A line running outside the polygon adds area and one running inside
 * removes it (see {@link reshapePolygon}). The polygon keeps its id and
 * holes, and the history records a plain update, so undo and redo report
 * `update` events. The result is validated like `addFeatures` input before
 * anything is written.
 *
 * A geometric failure is reported with the `ReshapeFailReason` code and a
 * `reshapefailed` event, as the reshape mode reports it; an argument error
 * (`not-found`, `not-polygon`, `invalid-line`) emits nothing.
 *
 * @param line - At least two positions; it must cross the outer ring
 *   exactly twice.
 * @returns `updated: [reshaped]` on success; otherwise `not-found`,
 *   `not-polygon`, `invalid-line`, or a `ReshapeFailReason`.
 */
export function reshape(context: OperationContext, id: string, line: Position[]): OperationResult {
  const current = context.store.getById(id);
  if (!current) {
    return { ok: false, reason: 'not-found' };
  }
  if (current.geometry.type !== 'Polygon') {
    return { ok: false, reason: 'not-polygon' };
  }
  const normalizedLine = normalizeReshapeLine(line);
  if (!normalizedLine) {
    return { ok: false, reason: 'invalid-line' };
  }

  const result = reshapePolygon(current, normalizedLine);
  if (result.type === 'error') {
    context.events.emit('reshapefailed', { reason: result.reason, featureId: current.id });
    return { ok: false, reason: result.reason };
  }

  const validation = tryValidateFeature(result.feature);
  if (!validation.valid) {
    context.events.emit('reshapefailed', { reason: 'invalid-result', featureId: current.id });
    return { ok: false, reason: 'invalid-result' };
  }
  const reshaped = validation.feature;

  context.store.update(id, reshaped);
  context.history.push(new UpdateAction(id, current, reshaped));
  context.events.emit('reshape', {
    originalFeature: cloneFeature(current),
    feature: cloneFeature(reshaped),
  });

  return { ok: true, created: [], updated: [cloneFeature(reshaped)], deleted: [] };
}
