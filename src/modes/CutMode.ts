import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point as turfPoint } from '@turf/helpers';
import type { DraftCapableMode, MapInteractionConfig } from './Mode';
import type { ModeContext } from '../core/ModeContext';
import type { LibreDrawFeature, Position } from '../types/features';
import type { NormalizedInputEvent } from '../types/input';
import { DrawPolygonMode } from './DrawPolygonMode';
import { cut } from '../operations/cut';

/**
 * Mode for cutting an area out of a polygon.
 *
 * A click or tap on a polygon makes it the target (the shared selection).
 * The cutter is then drafted exactly like a new polygon in draw-polygon
 * mode — same snapping, same position-based finish, same long press to take
 * back a point — by an inner {@link DrawPolygonMode} whose finish runs the
 * `cut` operation instead of creating a feature. A successful cut clears
 * the target; a failed one keeps it and discards only the draft, so the
 * user can draw another cutter.
 *
 * The draft API (`finishDrawing`, `cancelDrawing`, `getDraftVertexCount`,
 * `undoLastVertex`, `canFinishDrawing`) works on the cutter while a target
 * is set and is inert before that.
 */
export class CutMode implements DraftCapableMode {
  private context: ModeContext;
  private isActive = false;
  /** Whether a target is set and the cutter is being drafted. */
  private drafting = false;
  private draft: DrawPolygonMode;

  constructor(context: ModeContext) {
    this.context = context;
    this.draft = new DrawPolygonMode(context, {
      onComplete: (ring) => this.executeCut(ring),
    });
  }

  /**
   * Whether a target is set and the cutter is being drafted. The facade
   * lets the center reticle drive the mode only then.
   */
  isDrafting(): boolean {
    return this.isActive && this.drafting;
  }

  mapInteractions(): MapInteractionConfig {
    return {
      dragPan: false,
      doubleClickZoom: false,
    };
  }

  activate(): void {
    this.isActive = true;
    this.drafting = false;
  }

  deactivate(): void {
    this.isActive = false;
    this.drafting = false;
    this.draft.deactivate();
    this.context.selection.clear();
  }

  /**
   * The shared selection was cleared from outside (public API, a deleted
   * feature): abandon the cutter on the old target.
   */
  onSelectionChange(selectedIds: string[]): void {
    if (selectedIds.length === 0 && this.drafting) {
      this.stopDrafting();
    }
  }

  /** The target may have left the store (undo, an API call). */
  refreshFromStore(): void {
    if (!this.isActive || !this.drafting) return;
    const targetId = this.targetId;
    if (targetId === null || !this.context.store.getById(targetId)) {
      this.stopDrafting();
      this.context.selection.clear();
    }
  }

  onPointerDown(event: NormalizedInputEvent): void {
    if (!this.isActive) return;
    if (this.drafting) {
      this.draft.onPointerDown(event);
      return;
    }
    this.selectTargetAt([event.lngLat.lng, event.lngLat.lat]);
  }

  onPointerMove(event: NormalizedInputEvent): void {
    if (this.isActive && this.drafting) this.draft.onPointerMove(event);
  }

  onPointerUp(event: NormalizedInputEvent): void {
    if (this.isActive && this.drafting) this.draft.onPointerUp(event);
  }

  onDoubleClick(event: NormalizedInputEvent): void {
    if (this.isActive && this.drafting) this.draft.onDoubleClick(event);
  }

  onLongPress(event: NormalizedInputEvent): void {
    if (this.isActive && this.drafting) this.draft.onLongPress(event);
  }

  onKeyDown(key: string, _event: KeyboardEvent): void {
    if (!this.isActive || key !== 'Escape') return;
    // Escape gives up on the target as well as the draft, as in split mode.
    this.stopDrafting();
    this.context.selection.clear();
  }

  finishDrawing(): boolean {
    return this.isDrafting() ? this.draft.finishDrawing() : false;
  }

  cancelDrawing(): void {
    if (this.isDrafting()) this.draft.cancelDrawing();
  }

  getDraftVertexCount(): number {
    return this.isDrafting() ? this.draft.getDraftVertexCount() : 0;
  }

  undoLastVertex(): boolean {
    return this.isDrafting() ? this.draft.undoLastVertex() : false;
  }

  canFinishDrawing(): boolean {
    return this.isDrafting() && this.draft.canFinishDrawing();
  }

  private get targetId(): string | null {
    return this.context.selection.getSingleId() ?? null;
  }

  /** Make the topmost polygon under the pointer the target, or clear it. */
  private selectTargetAt(position: Position): void {
    const hit = this.hitTest(position);
    if (!hit) {
      this.context.selection.clear();
      return;
    }
    // Enter drafting before selecting, so whoever reacts to the selection
    // change (the facade showing the reticle) already sees the draft state.
    this.drafting = true;
    this.draft.activate();
    this.context.selection.set([hit.id]);
  }

  /**
   * Run the cut for a finished cutter ring. On success the target is gone
   * or changed and is deselected; on failure it stays selected. The inner
   * draft clears itself after this returns.
   */
  private executeCut(ring: Position[]): boolean {
    const targetId = this.targetId;
    if (targetId === null) return false;

    const result = cut(this.context, targetId, ring);
    if (!result.ok) return false;

    this.drafting = false;
    this.context.selection.clear();
    this.context.render.renderFeatures();
    return true;
  }

  private stopDrafting(): void {
    if (!this.drafting) return;
    this.drafting = false;
    this.draft.cancelDrawing();
  }

  /** The topmost polygon containing the position (holes excluded). */
  private hitTest(position: Position): LibreDrawFeature | undefined {
    const clickPoint = turfPoint(position);
    const features = this.context.store.getAll();
    for (let i = features.length - 1; i >= 0; i--) {
      const f = features[i];
      if (f.geometry.type === 'Polygon' && booleanPointInPolygon(clickPoint, f.geometry)) {
        return f;
      }
    }
    return undefined;
  }
}
