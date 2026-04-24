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
 * Event payload for a failed split operation.
 */
export interface SplitFailedEvent {
  reason: import('../utils/splitPolygon').SplitFailReason;
  featureId: string;
}

export type SetbackFailReason =
  | 'has-holes'
  | 'invalid-split';

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
 * vertex added, vertex removed (long-press / double-click auto-pop),
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
  selectionchange: SelectionChangeEvent;
  modechange: ModeChangeEvent;
  draftchange: DraftChangeEvent;
}
