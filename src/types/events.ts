import type { LibreDrawFeature } from './features';
import type { ModeName } from './mode';

/**
 * Event payload for feature creation.
 */
export interface CreateEvent {
  feature: LibreDrawFeature;
}

/**
 * Event payload for feature update.
 */
export interface UpdateEvent {
  feature: LibreDrawFeature;
  oldFeature: LibreDrawFeature;
}

/**
 * Event payload for feature deletion.
 */
export interface DeleteEvent {
  feature: LibreDrawFeature;
}

/**
 * Event payload for split operation.
 */
export interface SplitEvent {
  originalFeature: LibreDrawFeature;
  features: [LibreDrawFeature, LibreDrawFeature];
}

/**
 * Reason why a split operation failed.
 */
export type SplitFailReason =
  | 'same-points'
  | 'insufficient-vertices'
  | 'has-holes'
  | 'invalid-intersection-count'
  | 'self-intersecting-result';

/**
 * Event payload for a failed split operation.
 */
export interface SplitFailedEvent {
  reason: SplitFailReason;
  featureId: string;
}

export type SetbackFailReason = 'has-holes' | 'invalid-split';

/**
 * Event payload for successful setback operation.
 */
export interface SetbackEvent {
  originalFeature: LibreDrawFeature;
  feature: LibreDrawFeature;
  edgeIndex: number;
  distance: number;
}

/**
 * Event payload for failed setback operation.
 */
export interface SetbackFailedEvent {
  reason: SetbackFailReason;
  featureId: string;
}

/**
 * Reasons a union operation can fail.
 *
 * - `not-polygon`: one of the targets is not a Polygon
 * - `has-holes`: a target has an inner ring, or the merged shape would enclose a hole
 * - `disjoint`: the targets do not touch, so the result would be a MultiPolygon
 * - `invalid-result`: the geometry engine produced no usable polygon
 */
export type UnionFailReason = 'not-polygon' | 'has-holes' | 'disjoint' | 'invalid-result';

/**
 * Event payload for a successful union operation.
 *
 * `originalFeatures` are the two source polygons in selection order; the
 * result inherits the properties of the first one.
 */
export interface UnionEvent {
  originalFeatures: [LibreDrawFeature, LibreDrawFeature];
  feature: LibreDrawFeature;
}

/**
 * Event payload for a failed union operation.
 */
export interface UnionFailedEvent {
  reason: UnionFailReason;
  featureIds: [string, string];
}

/**
 * Event payload for a committed rotation.
 *
 * `angle` is the rotation applied by this step in degrees, positive clockwise
 * on screen. Undo and redo of a rotation report plain `update` events,
 * because the history stores it as a 1 -> 1 feature replacement.
 */
export interface RotateEvent {
  originalFeature: LibreDrawFeature;
  feature: LibreDrawFeature;
  angle: number;
}

/**
 * Event payload for selection changes.
 */
export interface SelectionChangeEvent {
  selectedIds: string[];
}

/**
 * Event payload for mode changes.
 */
export interface ModeChangeEvent {
  mode: ModeName;
  previousMode: ModeName;
}

/**
 * Event payload for draft (in-progress drawing) vertex count changes.
 *
 * Fires whenever the active drawing mode's draft state mutates:
 * vertex added, vertex removed (long-press auto-pop),
 * draft finalized, draft cancelled, or mode exited.
 */
export interface DraftChangeEvent {
  vertexCount: number;
}

/**
 * Map of all LibreDraw event types to their payloads.
 */
export interface LibreDrawEventMap {
  create: CreateEvent;
  update: UpdateEvent;
  delete: DeleteEvent;
  split: SplitEvent;
  splitfailed: SplitFailedEvent;
  setback: SetbackEvent;
  setbackfailed: SetbackFailedEvent;
  union: UnionEvent;
  unionfailed: UnionFailedEvent;
  rotate: RotateEvent;
  selectionchange: SelectionChangeEvent;
  modechange: ModeChangeEvent;
  draftchange: DraftChangeEvent;
}
