import type { DraftCapableMode } from './Mode';
import type { NormalizedInputEvent } from '../types/input';
import type { LibreDrawFeature, Position } from '../types/features';
import { CreateAction } from '../types/features';
import {
  wouldNewVertexCauseIntersection,
  wouldClosingCauseIntersection,
} from '../validation/intersection';
import { cloneFeature } from '../utils/featureSnapshot';
import type { ModeContext } from '../core/ModeContext';
import { findSnapTarget } from '../utils/snap';
import { createFeatureId } from '../utils/id';
import { LONG_PRESS_MS, clickTolerance, pointerTravel } from '../input/gestures';
import { findDraftVertexTarget, finishRadius } from './draftVertexTarget';

/**
 * Minimum number of unique vertices required to form a valid polygon.
 */
const MIN_VERTICES = 3;

/**
 * Drawing mode for creating new polygons.
 *
 * Users click to add vertices. The polygon is finalized when:
 * - The user clicks or taps on the first vertex or on the last placed vertex
 *   (with at least 3 vertices), or
 * - `finishDrawing()` is called programmatically.
 *
 * Finishing is position-based rather than timing-based: a double click at a
 * new location places one vertex and then lands on it, so it finishes too,
 * while two slow taps on the same spot finish instead of stacking vertices.
 *
 * Long press removes the last vertex (undo last point).
 * Escape or `cancelDrawing()` cancels the entire drawing.
 */
export class DrawPolygonMode implements DraftCapableMode {
  private vertices: Position[] = [];
  private isActive = false;
  private context: ModeContext;

  /**
   * A pointer down that landed on a draft vertex. The finish happens on the
   * matching pointer up so that a long press on that vertex still reads as
   * "undo last point" rather than "finish".
   */
  private pendingFinish: { point: { x: number; y: number }; time: number } | null = null;

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
    this.pendingFinish = null;
  }

  deactivate(): void {
    this.isActive = false;
    this.vertices = [];
    this.pendingFinish = null;
    this.context.render.clearPreview();
    this.context.render.clearVertices();
    this.context.render.clearSnapIndicator();
    // Notify listeners regardless of prior state so UIs can reset on exit.
    this.context.events.emit('draftchange', { vertexCount: 0 });
  }

  onPointerDown(event: NormalizedInputEvent): void {
    if (!this.isActive) return;

    // Landing on the first or last draft vertex is the finish gesture.
    // Never place a vertex there, even when the draft is too short to
    // finish: a duplicate or a spike back onto the start is never wanted.
    if (this.findDraftTarget(event)) {
      this.pendingFinish = { point: event.point, time: Date.now() };
      return;
    }
    this.pendingFinish = null;

    // Apply snap to the input position
    const snappedPos = this.applySnap(event.lngLat);
    const newVertex: Position = [snappedPos.lng, snappedPos.lat];

    // Reject vertex if it would cause self-intersection
    if (wouldNewVertexCauseIntersection(this.vertices, newVertex)) return;

    this.vertices.push(newVertex);
    const previewCoords = this.buildPreviewCoordinates(newVertex);
    this.context.render.renderPreview(previewCoords);
    this.renderDraftVertices();
    this.emitDraftChange();
  }

  onPointerMove(event: NormalizedInputEvent): void {
    if (!this.isActive || this.vertices.length === 0) return;

    // A draft vertex under the pointer takes priority over store snapping:
    // it shows where a click would finish the polygon.
    const draftTarget = this.findDraftTarget(event);
    if (draftTarget) {
      this.context.render.renderSnapIndicator(draftTarget.position);
      this.context.render.renderPreview(this.buildPreviewCoordinates(draftTarget.position));
      return;
    }

    // Apply snap and show/hide indicator
    const snapTarget = this.findSnap(event.lngLat);
    if (snapTarget) {
      this.context.render.renderSnapIndicator(snapTarget.position);
      const snappedPos: Position = snapTarget.position;
      const previewCoords = this.buildPreviewCoordinates(snappedPos);
      this.context.render.renderPreview(previewCoords);
    } else {
      this.context.render.clearSnapIndicator();
      this.updatePreview(event);
    }
  }

  onPointerUp(event: NormalizedInputEvent): void {
    if (!this.isActive) return;

    const pending = this.pendingFinish;
    this.pendingFinish = null;
    if (!pending) return;

    // A drag off the vertex is not a click on it.
    if (pointerTravel(pending.point, event.point) > clickTolerance(event.inputType)) return;
    // TouchInput fires pointer up right before a long press; that release
    // belongs to the long press (undo last point), not to a tap.
    if (event.inputType === 'touch' && Date.now() - pending.time >= LONG_PRESS_MS) return;

    this.tryFinalize();
  }

  onDoubleClick(event: NormalizedInputEvent): void {
    if (!this.isActive) return;

    // Finishing is handled by the second click landing on the vertex the
    // first click placed (see onPointerDown / onPointerUp). Only keep the
    // map from handling the double click.
    event.originalEvent.preventDefault();
    event.originalEvent.stopPropagation();
  }

  onLongPress(_event: NormalizedInputEvent): void {
    if (!this.isActive) return;
    this.pendingFinish = null;

    // Remove the last vertex (undo last point)
    if (this.vertices.length > 0) {
      this.vertices.pop();
      if (this.vertices.length === 0) {
        this.context.render.clearPreview();
      } else {
        this.context.render.renderPreview(this.buildPreviewCoordinates());
      }
      this.renderDraftVertices();
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
   * Finalize the current draft into a polygon feature.
   *
   * Succeeds when: mode is active, vertices >= 3, and closing
   * the ring would not produce a self-intersection.
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
    this.pendingFinish = null;
    this.context.render.clearPreview();
    this.context.render.clearVertices();
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
   * Build the preview coordinate ring for rendering,
   * including cursor position if available.
   */
  private buildPreviewCoordinates(cursorPos?: Position): Position[] {
    const coords = [...this.vertices];
    if (cursorPos) {
      coords.push(cursorPos);
    }
    // Close the ring for preview
    if (coords.length > 0) {
      coords.push([...coords[0]] as Position);
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
    if (wouldClosingCauseIntersection(this.vertices)) return false;

    // Close the ring
    const ring: Position[] = [...this.vertices, [...this.vertices[0]] as Position];

    const feature: LibreDrawFeature = {
      id: createFeatureId(),
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [ring],
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
    this.pendingFinish = null;
    this.context.render.clearPreview();
    this.context.render.clearVertices();
    this.context.render.clearSnapIndicator();
    this.emitDraftChange();
    return true;
  }

  /**
   * Render the placed vertices as dots. Each click or tap gets visible
   * feedback of its own, which is the only feedback on touch: there is no
   * hover to drive the rubber-band preview.
   */
  private renderDraftVertices(): void {
    if (this.vertices.length === 0) {
      this.context.render.clearVertices();
      return;
    }
    this.context.render.renderVertices(this.vertices, []);
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
   * Find the first or last draft vertex under the pointer. Uses the raw
   * pointer position and works regardless of the snap `enabled` flag; only
   * the snap threshold feeds the radius.
   */
  private findDraftTarget(event: NormalizedInputEvent): ReturnType<typeof findDraftVertexTarget> {
    const radius = finishRadius(event.inputType, this.context.getSnapConfig().threshold);
    return findDraftVertexTarget(event.point, this.vertices, this.context.getScreenPoint, radius, {
      includeFirst: true,
    });
  }

  /**
   * Find a snap target for the given position (excluding drawing-in-progress vertices).
   */
  private findSnap(lngLat: { lng: number; lat: number }): ReturnType<typeof findSnapTarget> {
    const snapConfig = this.context.getSnapConfig();
    if (!snapConfig.enabled) return null;

    return findSnapTarget(lngLat, this.context.store.getAll(), this.context.getScreenPoint, {
      threshold: snapConfig.threshold ?? 10,
      viewportBounds: this.context.getViewportBounds(),
    });
  }

  /**
   * Apply snap to a position and return the (possibly snapped) geographic coordinates.
   */
  private applySnap(lngLat: { lng: number; lat: number }): { lng: number; lat: number } {
    const snapTarget = this.findSnap(lngLat);
    if (snapTarget) {
      this.context.render.renderSnapIndicator(snapTarget.position);
      return { lng: snapTarget.position[0], lat: snapTarget.position[1] };
    }
    this.context.render.clearSnapIndicator();
    return lngLat;
  }
}
