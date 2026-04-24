import type { DraftCapableMode } from './Mode';
import type { NormalizedInputEvent } from '../types/input';
import type { LibreDrawFeature, Position } from '../types/features';
import { CreateAction } from '../types/features';
import { cloneFeature } from '../utils/featureSnapshot';
import type { ModeContext } from '../core/ModeContext';
import { findSnapTarget } from '../utils/snap';

/**
 * Minimum number of vertices required to form a valid LineString.
 */
const MIN_VERTICES = 2;

/**
 * Drawing mode for creating new LineString features.
 *
 * Users click to add vertices. The line is finalized when:
 * - The user double-clicks (with at least 2 vertices), or
 * - `finishDrawing()` is called programmatically.
 *
 * Long press removes the last vertex (undo last point).
 * Escape or `cancelDrawing()` cancels the entire drawing.
 */
export class DrawLineMode implements DraftCapableMode {
  private vertices: Position[] = [];
  private isActive = false;
  private context: ModeContext;

  constructor(context: ModeContext) {
    this.context = context;
  }

  mapInteractions(): { dragPan: boolean; doubleClickZoom: boolean } {
    return {
      dragPan: false,
      doubleClickZoom: false,
    };
  }

  activate(): void {
    this.isActive = true;
    this.vertices = [];
  }

  deactivate(): void {
    this.isActive = false;
    this.vertices = [];
    this.context.render.clearPreview();
    this.context.render.clearSnapIndicator();
    // Notify listeners regardless of prior state so UIs can reset on exit.
    this.context.events.emit('draftchange', { vertexCount: 0 });
  }

  onPointerDown(event: NormalizedInputEvent): void {
    if (!this.isActive) return;

    const snappedPos = this.applySnap(event.lngLat);
    const newVertex: Position = [snappedPos.lng, snappedPos.lat];

    this.vertices.push(newVertex);
    const previewCoords = this.buildPreviewCoordinates(newVertex);
    this.context.render.renderPreview(previewCoords);
    this.emitDraftChange();
  }

  onPointerMove(event: NormalizedInputEvent): void {
    if (!this.isActive || this.vertices.length === 0) return;

    const snapTarget = this.findSnap(event.lngLat);
    if (snapTarget) {
      this.context.render.renderSnapIndicator(snapTarget.position);
      const previewCoords = this.buildPreviewCoordinates(snapTarget.position);
      this.context.render.renderPreview(previewCoords);
    } else {
      this.context.render.clearSnapIndicator();
      this.updatePreview(event);
    }
  }

  onPointerUp(_event: NormalizedInputEvent): void {
    // No-op for draw mode; action happens on pointer down
  }

  onDoubleClick(event: NormalizedInputEvent): void {
    if (!this.isActive) return;

    // Remove the last vertex added by the double-click's second pointerdown
    if (this.vertices.length > MIN_VERTICES) {
      this.vertices.pop();
      this.emitDraftChange();
    }

    this.tryFinalize();

    // Prevent the double click from being handled by the map
    event.originalEvent.preventDefault();
    event.originalEvent.stopPropagation();
  }

  onLongPress(_event: NormalizedInputEvent): void {
    if (!this.isActive) return;

    // Remove the last vertex (undo last point)
    if (this.vertices.length > 0) {
      this.vertices.pop();
      if (this.vertices.length === 0) {
        this.context.render.clearPreview();
      } else {
        this.context.render.renderPreview(this.buildPreviewCoordinates());
      }
      this.emitDraftChange();
    }
  }

  onKeyDown(key: string, _event: KeyboardEvent): void {
    if (!this.isActive) return;

    if (key === 'Escape') {
      this.cancelDrawing();
    }
  }

  /**
   * Finalize the current draft into a LineString feature.
   *
   * Succeeds when the mode is active and vertices >= 2.
   * Self-intersection is allowed (LineString has no ring-closing constraint).
   */
  finishDrawing(): boolean {
    if (!this.isActive) return false;
    return this.tryFinalize();
  }

  /**
   * Discard the current draft. Mode remains active.
   */
  cancelDrawing(): void {
    if (!this.isActive) return;
    this.vertices = [];
    this.context.render.clearPreview();
    this.context.render.clearSnapIndicator();
    this.emitDraftChange();
  }

  /**
   * @returns The number of vertices in the current draft (0 when inactive).
   */
  getDraftVertexCount(): number {
    return this.isActive ? this.vertices.length : 0;
  }

  /**
   * Build the preview coordinates for rendering.
   * Unlike polygon preview, this does NOT close the ring.
   */
  private buildPreviewCoordinates(cursorPos?: Position): Position[] {
    const coords = [...this.vertices];
    if (cursorPos) {
      coords.push(cursorPos);
    }
    return coords;
  }

  /**
   * Update the preview rendering with the current cursor position.
   */
  private updatePreview(event: NormalizedInputEvent): void {
    const cursorPos: Position = [event.lngLat.lng, event.lngLat.lat];
    const previewCoords = this.buildPreviewCoordinates(cursorPos);
    this.context.render.renderPreview(previewCoords);
  }

  /**
   * Attempt to finalize the current draft.
   * @returns `true` when a feature was created, `false` on validation failure.
   */
  private tryFinalize(): boolean {
    if (this.vertices.length < MIN_VERTICES) return false;

    const feature: LibreDrawFeature = {
      id: crypto.randomUUID(),
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [...this.vertices],
      },
      properties: {},
    };

    const stored = this.context.store.add(feature);
    const action = new CreateAction(stored);
    this.context.history.push(action);
    this.context.events.emit('create', { feature: cloneFeature(stored) });
    this.context.render.renderFeatures();

    // Reset state for next drawing and notify listeners.
    this.vertices = [];
    this.context.render.clearPreview();
    this.context.render.clearSnapIndicator();
    this.emitDraftChange();
    return true;
  }

  /**
   * Emit a draftchange event reflecting the current vertex count.
   */
  private emitDraftChange(): void {
    this.context.events.emit('draftchange', {
      vertexCount: this.vertices.length,
    });
  }

  /**
   * Find a snap target for the given position.
   */
  private findSnap(
    lngLat: { lng: number; lat: number },
  ): ReturnType<typeof findSnapTarget> {
    const snapConfig = this.context.getSnapConfig();
    if (!snapConfig.enabled) return null;

    return findSnapTarget(
      lngLat,
      this.context.store.getAll(),
      this.context.getScreenPoint,
      {
        threshold: snapConfig.threshold ?? 10,
        viewportBounds: this.context.getViewportBounds(),
      },
    );
  }

  /**
   * Apply snap to a position and return the (possibly snapped) geographic coordinates.
   */
  private applySnap(
    lngLat: { lng: number; lat: number },
  ): { lng: number; lat: number } {
    const snapTarget = this.findSnap(lngLat);
    if (snapTarget) {
      this.context.render.renderSnapIndicator(snapTarget.position);
      return { lng: snapTarget.position[0], lat: snapTarget.position[1] };
    }
    this.context.render.clearSnapIndicator();
    return lngLat;
  }
}
