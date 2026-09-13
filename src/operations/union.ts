import type { OperationContext } from './OperationContext';
import type { OperationResult } from '../types/operations';
import { UnionAction } from '../types/features';
import { cloneFeature } from '../utils/featureSnapshot';
import { unionPolygons } from '../utils/unionPolygon';
import { tryValidateFeature } from '../validation/geojson';

/**
 * Merge two Polygons into one as one history step.
 *
 * The merged polygon gets a fresh id and a copy of the first polygon's
 * properties, exactly as the union mode produces it. Only a single Polygon
 * without holes counts as success: a geometric failure is reported with
 * the `UnionFailReason` code and, as in the mode, a `unionfailed` event.
 * An argument error (`unsupported-count`, `not-found`) emits nothing.
 *
 * `ids` must name exactly two distinct features for now; merging more at
 * once is a planned extension, which is why the parameter is already an
 * array.
 *
 * @returns `created: [merged], deleted: [a, b]` on success; otherwise
 *   `unsupported-count`, `not-found`, or a `UnionFailReason`.
 */
export function union(context: OperationContext, ids: string[]): OperationResult {
  const distinct = Array.from(new Set(ids));
  if (distinct.length !== 2) {
    return { ok: false, reason: 'unsupported-count' };
  }

  const first = context.store.getById(distinct[0]);
  const second = context.store.getById(distinct[1]);
  if (!first || !second) {
    return { ok: false, reason: 'not-found' };
  }

  const unionResult = unionPolygons(first, second);
  if (unionResult.type === 'error') {
    context.events.emit('unionfailed', {
      reason: unionResult.reason,
      featureIds: [first.id, second.id],
    });
    return { ok: false, reason: unionResult.reason };
  }

  // The geometry engine's output is checked like `addFeatures` input; a
  // ring it produced that is not a usable polygon is `invalid-result`.
  const validation = tryValidateFeature(unionResult.feature);
  if (!validation.valid) {
    context.events.emit('unionfailed', {
      reason: 'invalid-result',
      featureIds: [first.id, second.id],
    });
    return { ok: false, reason: 'invalid-result' };
  }
  const merged = validation.feature;

  context.store.remove(first.id);
  context.store.remove(second.id);
  context.store.add(merged);
  context.history.push(new UnionAction(first, second, merged));
  context.events.emit('union', {
    originalFeatures: [cloneFeature(first), cloneFeature(second)],
    feature: cloneFeature(merged),
  });

  return {
    ok: true,
    created: [cloneFeature(merged)],
    updated: [],
    deleted: [cloneFeature(first), cloneFeature(second)],
  };
}
