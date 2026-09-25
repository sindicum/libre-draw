import type { OperationContext } from './OperationContext';
import type { OperationResult } from '../types/operations';
import { UnionAction } from '../types/features';
import type { LibreDrawFeature } from '../types/features';
import { cloneFeature } from '../utils/featureSnapshot';
import { unionPolygons } from '../utils/unionPolygon';
import { tryValidateFeature } from '../validation/geojson';

/**
 * Merge two or more Polygons into one as one history step.
 *
 * All polygons are merged at once, so the outcome does not depend on their
 * order; the order only decides whose properties survive (the first's).
 * The merged polygon gets a fresh id, exactly as the union mode produces
 * it. Only a single Polygon without holes counts as success: a geometric
 * failure is reported with the `UnionFailReason` code and, as in the mode,
 * a `unionfailed` event, and nothing is merged. An argument error
 * (`unsupported-count`, `not-found`) emits nothing.
 *
 * @returns `created: [merged], deleted: [...sources]` on success; otherwise
 *   `unsupported-count`, `not-found`, or a `UnionFailReason`.
 */
export function union(context: OperationContext, ids: string[]): OperationResult {
  const distinct = Array.from(new Set(ids));
  if (distinct.length < 2) {
    return { ok: false, reason: 'unsupported-count' };
  }

  const sources: LibreDrawFeature[] = [];
  for (const id of distinct) {
    const feature = context.store.getById(id);
    if (!feature) {
      return { ok: false, reason: 'not-found' };
    }
    sources.push(feature);
  }
  const sourceIds = sources.map((feature) => feature.id);

  const unionResult = unionPolygons(sources);
  if (unionResult.type === 'error') {
    context.events.emit('unionfailed', {
      reason: unionResult.reason,
      featureIds: sourceIds,
    });
    return { ok: false, reason: unionResult.reason };
  }

  // The geometry engine's output is checked like `addFeatures` input; a
  // ring it produced that is not a usable polygon is `invalid-result`.
  const validation = tryValidateFeature(unionResult.feature);
  if (!validation.valid) {
    context.events.emit('unionfailed', {
      reason: 'invalid-result',
      featureIds: sourceIds,
    });
    return { ok: false, reason: 'invalid-result' };
  }
  const merged = validation.feature;

  for (const feature of sources) {
    context.store.remove(feature.id);
  }
  context.store.add(merged);
  context.history.push(new UnionAction(sources, merged));
  context.events.emit('union', {
    originalFeatures: sources.map(cloneFeature),
    feature: cloneFeature(merged),
  });

  return {
    ok: true,
    created: [cloneFeature(merged)],
    updated: [],
    deleted: sources.map(cloneFeature),
  };
}
