import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point as turfPoint } from '@turf/helpers';
import type { DraftCapableMode, MapInteractionConfig } from './Mode';
import type { ModeContext } from '../core/ModeContext';
import type { LibreDrawFeature, Position } from '../types/features';
import type { NormalizedInputEvent } from '../types/input';
import { DrawLineMode } from './DrawLineMode';
import { reshape } from '../operations/reshape';

/**
 * Mode for reshaping the outer ring of a polygon with a line.
 *
 * A click or tap on a polygon makes it the target (the shared selection).
 * The line is then drafted exactly like a new line in draw-line mode —
 * same snapping, same position-based finish on the last vertex, same long
 * press to take back a point — by an inner {@link DrawLineMode} whose
 * finish runs the `reshape` operation instead of creating a feature. A
 * successful reshape clears the target; a failed one keeps it and discards
 * only the draft, so the user can draw another line.
 *
 * The draft API (`finishDrawing`, `cancelDrawing`, `getDraftVertexCount`,
 * `undoLastVertex`, `canFinishDrawing`) works on the line while a target
 * is set and is inert before that.
 */
export class ReshapeMode implements DraftCapableMode {
  private context: ModeContext;
  private isActive = false;
  /** Whether a target is set and the line is being drafted. */
  private drafting = false;
  private draft: DrawLineMode;

  constructor(context: ModeContext) {
    this.context = context;
    this.draft = new DrawLineMode(context, {
      onComplete: (line) => this.executeReshape(line),
    });
  }

  /**
   * Whether a target is set and the line is being drafted. The facade
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
   * feature): abandon the line on the old target.
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

  /** @returns The polygon a click would pick as the target, before the line is drawn. */
  hoverTarget(event: NormalizedInputEvent): string | undefined {
    if (!this.isActive || this.drafting) return undefined;
    return this.hitTest([event.lngLat.lng, event.lngLat.lat])?.id;
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
    // Escape gives up on the target as well as the draft.
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
   * Run the reshape for a finished line. On success the target is changed
   * and deselected; on failure it stays selected. The inner draft clears
   * itself after this returns.
   */
  private executeReshape(line: Position[]): boolean {
    const targetId = this.targetId;
    if (targetId === null) return false;

    const result = reshape(this.context, targetId, line);
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
