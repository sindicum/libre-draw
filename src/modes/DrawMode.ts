import type { Mode } from './Mode';
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

/**
 * Threshold in pixels: if a click is within this distance of the first
 * vertex, the polygon is automatically closed.
 */
const CLOSE_THRESHOLD_PX = 10;

/**
 * Minimum number of unique vertices required to form a valid polygon.
 */
const MIN_VERTICES = 3;

/**
 * Drawing mode for creating new polygons.
 *
 * Users click to add vertices. The polygon is finalized when:
 * - The user double-clicks (with at least 3 vertices), or
 * - The user clicks within 10px of the first vertex (closing the ring).
 *
 * Long press removes the last vertex (undo last point).
 * Escape cancels the entire drawing.
 */
export class DrawMode implements Mode {
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
  }

  onPointerDown(event: NormalizedInputEvent): void {
    if (!this.isActive) return;

    // Apply snap to the input position
    const snappedPos = this.applySnap(event.lngLat);
    const newVertex: Position = [snappedPos.lng, snappedPos.lat];

    // Check if this click is close to the first vertex (closing the polygon)
    if (this.vertices.length >= MIN_VERTICES) {
      const firstVertex = this.vertices[0];
      const firstScreenPt = this.context.getScreenPoint({
        lng: firstVertex[0],
        lat: firstVertex[1],
      });
      const clickScreenPt = this.context.getScreenPoint(snappedPos);
      const dx = clickScreenPt.x - firstScreenPt.x;
      const dy = clickScreenPt.y - firstScreenPt.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= CLOSE_THRESHOLD_PX) {
        // Reject closing if it would cause self-intersection
        if (wouldClosingCauseIntersection(this.vertices)) return;
        this.finalizePolygon();
        return;
      }
    }

    // Reject vertex if it would cause self-intersection
    if (wouldNewVertexCauseIntersection(this.vertices, newVertex)) return;

    this.vertices.push(newVertex);
    const previewCoords = this.buildPreviewCoordinates(newVertex);
    this.context.render.renderPreview(previewCoords);
  }

  onPointerMove(event: NormalizedInputEvent): void {
    if (!this.isActive || this.vertices.length === 0) return;

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

  onPointerUp(_event: NormalizedInputEvent): void {
    // No-op for draw mode; action happens on pointer down
  }

  onDoubleClick(event: NormalizedInputEvent): void {
    if (!this.isActive) return;

    // Remove the last vertex added by the double-click's second pointerdown
    // (it would have been added in onPointerDown before onDoubleClick fires)
    if (this.vertices.length > MIN_VERTICES) {
      this.vertices.pop();
    }

    if (this.vertices.length >= MIN_VERTICES) {
      // Reject closing if it would cause self-intersection
      if (!wouldClosingCauseIntersection(this.vertices)) {
        this.finalizePolygon();
      }
    }

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
    }
  }

  onKeyDown(key: string, _event: KeyboardEvent): void {
    if (!this.isActive) return;

    if (key === 'Escape') {
      this.cancelDrawing();
    }
  }

  /**
   * Build the preview coordinate ring for rendering,
   * including cursor position if available.
   */
  private buildPreviewCoordinates(
    cursorPos?: Position,
  ): Position[] {
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
   * Finalize the polygon: create the feature, push to history, emit event.
   */
  private finalizePolygon(): void {
    if (this.vertices.length < MIN_VERTICES) return;

    // Close the ring
    const ring: Position[] = [
      ...this.vertices,
      [...this.vertices[0]] as Position,
    ];

    const feature: LibreDrawFeature = {
      id: crypto.randomUUID(),
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

    // Reset state for next drawing
    this.vertices = [];
    this.context.render.clearPreview();
    this.context.render.clearSnapIndicator();
  }

  /**
   * Cancel the current drawing operation.
   */
  private cancelDrawing(): void {
    this.vertices = [];
    this.context.render.clearPreview();
    this.context.render.clearSnapIndicator();
  }

  /**
   * Find a snap target for the given position (excluding drawing-in-progress vertices).
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
