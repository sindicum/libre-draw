import type { FeatureProperties, LibreDrawFeature, LibreDrawGeometry } from './features';
import type {
  CutFailReason,
  ReshapeFailReason,
  SetbackFailReason,
  SplitFailReason,
  UnionFailReason,
} from './events';

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
 * `reason` is always a failure code (for example a `SplitFailReason` such
 * as `'has-holes'`, or `'invalid-feature'`), so it can be compared without
 * parsing. `invalid-geojson`, `invalid-feature`, and a rotation refused
 * by validation also carry the validation message in `message`.
 */
export interface OperationFailure {
  ok: false;
  /** The failure code. */
  reason: string;
  /**
   * Validation message, present for `invalid-geojson`, `invalid-feature`,
   * and a rotation refused by validation.
   */
  message?: string;
}

/**
 * Discriminated result of an editing operation. Narrow on `ok`:
 *
 * ```ts
 * const result = draw.split(id, line);
 * if (result.ok) {
 *   result.created.forEach(save);
 * } else {
 *   console.warn(result.reason);
 * }
 * ```
 *
 * Operations never throw for a geometric or validation failure; they
 * return this instead. Returned by `setFeatures`, `updateFeature`,
 * `rotate`, `split`, `setback`, `union`, `cut`, and `reshape`.
 */
export type OperationResult = OperationSuccess | OperationFailure;

/**
 * Per-feature outcome of {@link LibreDraw.addFeatures}, in input order.
 *
 * For a valid feature `id` is the id it has in the store (generated when
 * the input had none). For an invalid feature `id` is the input id when
 * one was given, `reason` is the failure code, and `message` explains it:
 *
 * - `invalid-feature`: the feature failed validation
 * - `duplicate-id`: the id is already in the store or earlier in the input
 */
export type AddFeatureResult =
  | { valid: true; id: string }
  | { valid: false; id?: string; reason: string; message: string };

/**
 * Outcome of {@link LibreDraw.validateFeature}: the normalized feature when
 * the input is acceptable, otherwise the failure code `invalid-feature`
 * with the validation message. The same rules apply as for
 * `addFeatures` / `setFeatures`.
 */
export type FeatureValidationResult =
  | { valid: true; feature: LibreDrawFeature }
  | { valid: false; reason: string; message: string };

/**
 * What {@link LibreDraw.updateFeature} replaces on a feature. Each field is
 * a full replacement (properties are not merged); omit a field to keep it.
 */
export interface UpdateFeaturePatch {
  /** New geometry. Must be the same geometry type as the current one. */
  geometry?: LibreDrawGeometry;
  /** New properties object (replaces the old one entirely). */
  properties?: FeatureProperties;
}

/**
 * Failure codes of {@link LibreDraw.updateFeature}.
 *
 * - `not-found`: no feature has that id
 * - `geometry-type-mismatch`: the patch changes the geometry type
 * - `empty-patch`: neither `geometry` nor `properties` was given
 * - `invalid-feature`: the updated feature failed validation (the
 *   validation message is in `message`)
 */
export type UpdateFeatureFailReason =
  | 'not-found'
  | 'geometry-type-mismatch'
  | 'empty-patch'
  | 'invalid-feature';

/**
 * Failure codes of {@link LibreDraw.rotate}. A rotated shape that fails
 * validation is reported with the same code as its `editrejected` event,
 * and the validation message is in `message`.
 *
 * - `not-found`: no feature has that id
 * - `not-rotatable`: the feature is a Point
 * - `no-rotation`: the angle is 0, a multiple of 360, or not finite, or the
 *   rotated shape rounds back to the current one, so nothing would change
 * - `out-of-range`: the rotated shape would leave the coordinate range
 *   (near the antimeridian or the poles)
 * - `self-intersection` / `ring-intersection` / `hole-outside` /
 *   `hole-nested`: the rotated polygon's rings would become invalid
 * - `invalid-result`: the rotated shape failed validation for another reason,
 *   such as rounding to `coordinatePrecision` flattening it
 */
export type RotateFailReason =
  | 'not-found'
  | 'not-rotatable'
  | 'no-rotation'
  | 'out-of-range'
  | 'self-intersection'
  | 'ring-intersection'
  | 'hole-outside'
  | 'hole-nested'
  | 'invalid-result';

/**
 * Reference to one edge of a Polygon.
 *
 * `index` counts the edges of the ring without its closing position: edge
 * `i` runs from vertex `i` to vertex `i + 1`, and the last edge returns to
 * vertex `0`. This is the same numbering as `SetbackEvent.edgeIndex`.
 * `ring` selects the ring (`0` is the outer ring, the default). Setback
 * does not support polygons with holes, so any other value is rejected
 * with `has-holes`.
 */
export interface EdgeRef {
  /** Ring index. `0` (the outer ring) when omitted. */
  ring?: number;
  /** Edge index within the ring, `0 <= index < vertexCount`. */
  index: number;
}

/**
 * Failure codes of {@link LibreDraw.split}. Geometric failures reuse the
 * `SplitFailReason` codes of the `splitfailed` event and emit that event;
 * the argument errors below emit nothing.
 *
 * - `not-found`: no feature has that id
 * - `not-splittable`: the feature is a Point
 */
export type SplitOperationFailReason = 'not-found' | 'not-splittable' | SplitFailReason;

/**
 * Failure codes of {@link LibreDraw.setback}. Geometric failures reuse the
 * `SetbackFailReason` codes of the `setbackfailed` event and emit that
 * event; the argument errors below emit nothing.
 *
 * - `not-found`: no feature has that id
 * - `not-polygon`: the feature is not a Polygon
 * - `invalid-edge`: `edge.index` is not an integer in `[0, vertexCount)`
 * - `invalid-distance`: the distance is not a finite positive number
 */
export type SetbackOperationFailReason =
  | 'not-found'
  | 'not-polygon'
  | 'invalid-edge'
  | 'invalid-distance'
  | SetbackFailReason;

/**
 * Failure codes of {@link LibreDraw.union}. Geometric failures reuse the
 * `UnionFailReason` codes of the `unionfailed` event and emit that event;
 * the argument errors below emit nothing.
 *
 * - `not-found`: one of the ids has no feature
 * - `unsupported-count`: `ids` names fewer than two distinct features
 */
export type UnionOperationFailReason = 'not-found' | 'unsupported-count' | UnionFailReason;

/**
 * Failure codes of {@link LibreDraw.cut}. Geometric failures reuse the
 * `CutFailReason` codes of the `cutfailed` event and emit that event; the
 * argument errors below emit nothing.
 *
 * - `not-found`: no feature has that id
 * - `not-polygon`: the feature is not a Polygon
 * - `invalid-cutter`: the cutter ring has fewer than three distinct
 *   vertices, a non-numeric position, or a self-intersection
 */
export type CutOperationFailReason = 'not-found' | 'not-polygon' | 'invalid-cutter' | CutFailReason;

/**
 * Failure codes of {@link LibreDraw.reshape}. Geometric failures reuse the
 * `ReshapeFailReason` codes of the `reshapefailed` event and emit that
 * event; the argument errors below emit nothing.
 *
 * - `not-found`: no feature has that id
 * - `not-polygon`: the feature is not a Polygon
 * - `invalid-line`: the line has fewer than two positions, or a
 *   non-numeric position
 */
export type ReshapeOperationFailReason =
  | 'not-found'
  | 'not-polygon'
  | 'invalid-line'
  | ReshapeFailReason;
