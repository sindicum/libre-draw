import type { Mode } from './Mode';
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
 * - The user double-clicks (with at least 2 vertices).
 *
 * Long press removes the last vertex (undo last point).
 * Escape cancels the entire drawing.
 */
export class DrawLineMode implements Mode {
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

    const snappedPos = this.applySnap(event.lngLat);
    const newVertex: Position = [snappedPos.lng, snappedPos.lat];

    this.vertices.push(newVertex);
    this.updatePreview(event);
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
    }

    if (this.vertices.length >= MIN_VERTICES) {
      this.finalizeLine();
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
   * Finalize the line: create the feature, push to history, emit event.
   */
  private finalizeLine(): void {
    if (this.vertices.length < MIN_VERTICES) return;

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
