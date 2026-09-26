import type { LibreDrawFeature } from './features';
import type { ModeName } from './mode';

/**
 * Where a change came from.
 *
 * - `'api'`: a public `LibreDraw` method was running (application code, an
 *   AI / MCP bridge, a script). Includes everything those methods trigger,
 *   such as `finishDrawing()` completing a draft.
 * - `'user'`: pointer, touch, toolbar, or keyboard input on the map.
 *
 * Every event payload carries this so a listener that mirrors changes to an
 * external store can skip the ones it caused itself.
 */
export type EventOrigin = 'api' | 'user';

/**
 * Payload as passed by an emitter: the event without `origin`, which the
 * event bus attaches on delivery.
 */
export type EventInput<K extends keyof LibreDrawEventMap> = Omit<LibreDrawEventMap[K], 'origin'>;

/**
 * Event payload for feature creation.
 */
export interface CreateEvent {
  /** Where the change came from. See {@link EventOrigin}. */
  origin: EventOrigin;
  feature: LibreDrawFeature;
}

/**
 * Event payload for feature update.
 */
export interface UpdateEvent {
  /** Where the change came from. See {@link EventOrigin}. */
  origin: EventOrigin;
  feature: LibreDrawFeature;
  oldFeature: LibreDrawFeature;
}

/**
 * Event payload for feature deletion.
 */
export interface DeleteEvent {
  /** Where the change came from. See {@link EventOrigin}. */
  origin: EventOrigin;
  feature: LibreDrawFeature;
}

/**
 * Event payload for split operation.
 */
export interface SplitEvent {
  /** Where the change came from. See {@link EventOrigin}. */
  origin: EventOrigin;
  originalFeature: LibreDrawFeature;
  features: [LibreDrawFeature, LibreDrawFeature];
}

/**
 * Reason why a split operation failed.
 *
 * - `same-points`: the two points of the split line coincide
 * - `insufficient-vertices`: the target has too few vertices to split
 * - `has-holes`: the target Polygon has an inner ring
 * - `invalid-intersection-count`: the line does not cross the outer ring exactly twice
 * - `self-intersecting-result`: a part would be self-intersecting
 * - `invalid-result`: a part failed validation (rounding at the coordinate limits)
 */
export type SplitFailReason =
  | 'same-points'
  | 'insufficient-vertices'
  | 'has-holes'
  | 'invalid-intersection-count'
  | 'self-intersecting-result'
  | 'invalid-result';

/**
 * Event payload for a failed split operation.
 */
export interface SplitFailedEvent {
  /** Where the change came from. See {@link EventOrigin}. */
  origin: EventOrigin;
  reason: SplitFailReason;
  featureId: string;
}

export type SetbackFailReason = 'has-holes' | 'invalid-split';

/**
 * Event payload for successful setback operation.
 */
export interface SetbackEvent {
  /** Where the change came from. See {@link EventOrigin}. */
  origin: EventOrigin;
  originalFeature: LibreDrawFeature;
  feature: LibreDrawFeature;
  edgeIndex: number;
  distance: number;
}

/**
 * Event payload for failed setback operation.
 */
export interface SetbackFailedEvent {
  /** Where the change came from. See {@link EventOrigin}. */
  origin: EventOrigin;
  reason: SetbackFailReason;
  featureId: string;
}

/**
 * Reasons a union operation can fail.
 *
 * - `not-polygon`: one of the targets is not a Polygon
 * - `has-holes`: a target has an inner ring, or the merged shape would enclose a hole
 * - `disjoint`: the targets do not all connect, so the result would be a MultiPolygon
 * - `invalid-result`: the geometry engine produced no usable polygon
 */
export type UnionFailReason = 'not-polygon' | 'has-holes' | 'disjoint' | 'invalid-result';

/**
 * Event payload for a successful union operation.
 *
 * `originalFeatures` are the source polygons (two or more) in the order
 * they were given; the result inherits the properties of the first one.
 */
export interface UnionEvent {
  /** Where the change came from. See {@link EventOrigin}. */
  origin: EventOrigin;
  originalFeatures: LibreDrawFeature[];
  feature: LibreDrawFeature;
}

/**
 * Event payload for a failed union operation.
 */
export interface UnionFailedEvent {
  /** Where the change came from. See {@link EventOrigin}. */
  origin: EventOrigin;
  reason: UnionFailReason;
  /** The ids of every polygon that was to be merged, in the order given. */
  featureIds: string[];
}

/**
 * Event payload for a successful cut.
 *
 * `features` are the pieces that remain. When there is one piece it keeps
 * the original's id (a new hole or a notch), so `features[0].id` equals
 * `originalFeature.id`; when the cut split the polygon apart, each piece
 * has a fresh id and a copy of the original's properties.
 */
export interface CutEvent {
  /** Where the change came from. See {@link EventOrigin}. */
  origin: EventOrigin;
  originalFeature: LibreDrawFeature;
  features: LibreDrawFeature[];
}

/**
 * Reasons a cut can fail.
 *
 * - `no-overlap`: the cutter does not overlap the polygon (it misses it,
 *   only touches it, or lies inside one of its holes)
 * - `empty-result`: the cutter covers the whole polygon
 * - `invalid-result`: the geometry engine failed, or a piece failed validation
 */
export type CutFailReason = 'no-overlap' | 'empty-result' | 'invalid-result';

/**
 * Event payload for a failed cut.
 */
export interface CutFailedEvent {
  /** Where the change came from. See {@link EventOrigin}. */
  origin: EventOrigin;
  reason: CutFailReason;
  featureId: string;
}

/**
 * Event payload for a committed rotation.
 *
 * `angle` is the rotation applied by this step in degrees, positive clockwise
 * on screen. Undo and redo of a rotation report plain `update` events,
 * because the history stores it as a 1 -> 1 feature replacement.
 */
export interface RotateEvent {
  /** Where the change came from. See {@link EventOrigin}. */
  origin: EventOrigin;
  originalFeature: LibreDrawFeature;
  feature: LibreDrawFeature;
  angle: number;
}

/**
 * Event payload for selection changes.
 */
export interface SelectionChangeEvent {
  /** Where the change came from. See {@link EventOrigin}. */
  origin: EventOrigin;
  selectedIds: string[];
}

/**
 * Event payload for mode changes.
 */
export interface ModeChangeEvent {
  /** Where the change came from. See {@link EventOrigin}. */
  origin: EventOrigin;
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
  /** Where the change came from. See {@link EventOrigin}. */
  origin: EventOrigin;
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
  cut: CutEvent;
  cutfailed: CutFailedEvent;
  rotate: RotateEvent;
  selectionchange: SelectionChangeEvent;
  modechange: ModeChangeEvent;
  draftchange: DraftChangeEvent;
}
