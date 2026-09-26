import type { OperationContext } from './OperationContext';
import type { OperationResult } from '../types/operations';
import type { LibreDrawFeature, Position } from '../types/features';
import { CutAction } from '../types/features';
import { cloneFeature } from '../utils/featureSnapshot';
import { cutPolygon, normalizeCutterRing } from '../utils/cutPolygon';
import { tryValidateFeature } from '../validation/geojson';

/**
 * Cut the area of a polygon ring out of a Polygon as one history step.
 *
 * One remaining piece keeps the target's id and replaces it (a new hole,
 * or a notch in the outer ring): it is reported in `updated`. Several
 * pieces get fresh ids and a copy of the target's properties: they are
 * `created` and the target is `deleted`. Every piece is validated like
 * `addFeatures` input, holes included, before anything is written.
 *
 * A geometric failure is reported with the `CutFailReason` code and a
 * `cutfailed` event, as the cut mode reports it; an argument error
 * (`not-found`, `not-polygon`, `invalid-cutter`) emits nothing.
 *
 * @param cutter - The ring to cut out; its closing position may be omitted.
 * @returns `updated: [piece]` or `created: [...pieces], deleted: [target]`
 *   on success; otherwise `not-found`, `not-polygon`, `invalid-cutter`, or
 *   a `CutFailReason`.
 */
export function cut(context: OperationContext, id: string, cutter: Position[]): OperationResult {
  const current = context.store.getById(id);
  if (!current) {
    return { ok: false, reason: 'not-found' };
  }
  if (current.geometry.type !== 'Polygon') {
    return { ok: false, reason: 'not-polygon' };
  }
  const cutterRing = normalizeCutterRing(cutter);
  if (!cutterRing) {
    return { ok: false, reason: 'invalid-cutter' };
  }

  const cutResult = cutPolygon(current, cutterRing);
  if (cutResult.type === 'error') {
    context.events.emit('cutfailed', { reason: cutResult.reason, featureId: current.id });
    return { ok: false, reason: cutResult.reason };
  }

  const pieces: LibreDrawFeature[] = [];
  for (const piece of cutResult.features) {
    const validated = tryValidateFeature(piece);
    if (!validated.valid) {
      context.events.emit('cutfailed', { reason: 'invalid-result', featureId: current.id });
      return { ok: false, reason: 'invalid-result' };
    }
    pieces.push(validated.feature);
  }

  const action = new CutAction(current, pieces);
  action.apply(context.store);
  context.history.push(action);
  context.events.emit('cut', {
    originalFeature: cloneFeature(current),
    features: pieces.map(cloneFeature),
  });

  if (action.keepsId) {
    return { ok: true, created: [], updated: [cloneFeature(pieces[0])], deleted: [] };
  }
  return {
    ok: true,
    created: pieces.map(cloneFeature),
    updated: [],
    deleted: [cloneFeature(current)],
  };
}
