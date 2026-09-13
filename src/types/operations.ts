import type { LibreDrawFeature } from './features';

/**
 * Result of a successful editing operation.
 *
 * All three arrays are always present so a caller can read "what appeared,
 * what changed, what disappeared" without knowing which operation ran.
 * An array is empty when the operation did not touch that category
 * (a rotation only fills `updated`, a split fills `created` and `deleted`).
 */
export interface OperationSuccess {
  ok: true;
  /** Features that were added to the store. */
  created: LibreDrawFeature[];
  /** Features whose geometry or properties changed (post-change snapshots). */
  updated: LibreDrawFeature[];
  /** Features that were removed from the store. */
  deleted: LibreDrawFeature[];
}

/**
 * Result of an editing operation that did not change the store.
 *
 * `reason` carries the operation's failure code (for example a
 * `SplitFailReason` such as `'has-holes'`) or a validation message.
 */
export interface OperationFailure {
  ok: false;
  reason: string;
}

/**
 * Discriminated result of an editing operation. Narrow on `ok`:
 *
 * ```ts
 * const result = draw.split(id, line);
 * if (!result.ok) {
 *   console.warn(result.reason);
 *   return;
 * }
 * result.created.forEach(save);
 * ```
 *
 * Operations never throw for a geometric failure; they return this instead.
 */
export type OperationResult = OperationSuccess | OperationFailure;

/**
 * Options for {@link LibreDraw.addFeatures}.
 */
export interface AddFeaturesOptions {
  /**
   * When `true` (the default), one invalid feature makes the whole call
   * throw a `LibreDrawError` and nothing is added. When `false`, invalid
   * features are reported in the returned array and only the valid ones
   * are added, still as a single undo step.
   */
  strict?: boolean;
}

/**
 * Per-feature outcome of {@link LibreDraw.addFeatures}, in input order.
 *
 * For a valid feature `id` is the id it has in the store (generated when
 * the input had none). For an invalid feature `id` is the input id when
 * one was given, and `reason` explains why it was rejected.
 */
export type AddFeatureResult =
  | { valid: true; id: string }
  | { valid: false; id?: string; reason: string };

/**
 * Outcome of {@link LibreDraw.validateFeature}: the normalized feature when
 * the input is acceptable, otherwise the rejection reason. The same rules
 * apply as for `addFeatures` / `setFeatures`, but nothing is thrown.
 */
export type FeatureValidationResult =
  | { valid: true; feature: LibreDrawFeature }
  | { valid: false; reason: string };
