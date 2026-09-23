import type { DraftCapableMode } from './Mode';
import type { NormalizedInputEvent } from '../types/input';
import type { LibreDrawFeature, Position } from '../types/features';
import { CreateAction } from '../types/features';
import { cloneFeature } from '../utils/featureSnapshot';
import type { ModeContext } from '../core/ModeContext';
import { findSnapTarget } from '../utils/snap';
import { buildAngledRectangleRing } from '../utils/angledRectangle';
import { LONG_PRESS_MS, clickTolerance, pointerTravel } from '../input/gestures';
import { createFeatureId } from '../utils/id';

/**
 * Drawing mode for creating rectangles at any angle from three points.
 *
 * Every point is placed by a **click or tap** — a pointer down followed by a
 * pointer up that has not travelled beyond the per-input-type tolerance:
 *
 * - The first and second points define the base edge, one side of the
 *   rectangle, at any angle. Both snap to nearby vertices and edges.
 * - The third point sets the width: the rectangle extends from the base edge
 *   towards the point by its perpendicular distance to the base line. It is
 *   never snapped, because it does not become a corner.
 *
 * With a mouse, the base edge and then the rectangle follow the cursor.
 * Touch has no hover, so the placed points and, once both are placed, the
 * base edge are the only feedback between taps.
 *
 * A drag never places a point: it is left to the map so the user can pan
 * while drawing (hence `dragPan: true`), as in the rectangle mode.
 *
 * A second point on top of the first, or a third point on the base line
 * (zero width), is silently ignored and the draft is kept.
 * Long press removes the last point. Escape or `cancelDrawing()` discards
 * the whole draft. `finishDrawing()` always returns `false`: only the third
 * click can finalize.
 */
export class DrawAngledRectangleMode implements DraftCapableMode {
  /** The placed points of the base edge: none, `[a]`, or `[a, b]`. */
  private points: Position[] = [];
  private isActive = false;
  private context: ModeContext;

  /**
   * Where and when the current pointer interaction started, or `null` when
   * no pointer is down. Used to tell a click/tap from a drag.
   */
  private pointerDown: {
    x: number;
    y: number;
    time: number;
  } | null = null;

  /** Set once the pointer has travelled beyond the click/tap tolerance. */
  private isDragging = false;

  constructor(context: ModeContext) {
    this.context = context;
  }

  mapInteractions(): { dragPan: boolean; doubleClickZoom: boolean } {
    return {
      // Points are placed by clicks and taps, never by drags, so panning
      // stays available. On touch it is the only single-finger map gesture.
      dragPan: true,
      doubleClickZoom: false,
    };
  }

  activate(): void {
    this.isActive = true;
    this.points = [];
    this.resetPointer();
  }

  deactivate(): void {
    this.isActive = false;
    this.points = [];
    this.resetPointer();
    this.clearDraftRendering();
    // Notify listeners regardless of prior state so UIs can reset on exit.
    this.context.events.emit('draftchange', { vertexCount: 0 });
  }

  onPointerDown(event: NormalizedInputEvent): void {
    if (!this.isActive) return;

    // Points are placed on pointer up so that a drag can pan the map.
    this.pointerDown = {
      x: event.point.x,
      y: event.point.y,
      time: Date.now(),
    };
    this.isDragging = false;
  }

  onPointerMove(event: NormalizedInputEvent): void {
    if (!this.isActive) return;

    if (this.pointerDown !== null) {
      // The pointer is held down: this is a drag (map pan), not a hover.
      if (pointerTravel(this.pointerDown, event.point) > clickTolerance(event.inputType)) {
        this.isDragging = true;
      }
      return;
    }

    // Hover preview. Touch has no hover, and a touch move without a pointer
    // down can only be a stray event after a long press, so ignore it.
    if (event.inputType !== 'mouse') return;
    if (this.points.length === 0) return;

    if (this.points.length === 1) {
      const cursor = this.applySnap(event.lngLat);
      this.context.render.renderPreview([this.points[0], cursor]);
      return;
    }

    // The third point only sets the width, so it is never snapped.
    this.context.render.renderPreview(
      this.buildPreviewCoordinates([event.lngLat.lng, event.lngLat.lat])
    );
  }

  onPointerUp(event: NormalizedInputEvent): void {
    if (!this.isActive) return;

    const down = this.pointerDown;
    const wasDragging = this.isDragging;
    this.resetPointer();

    if (down === null) return;
    // The pointer moved: the map handled it as a pan.
    if (wasDragging || pointerTravel(down, event.point) > clickTolerance(event.inputType)) return;
    // TouchInput emits a pointer up before it emits the long press. Treat a
    // held finger as a long press, not as a tap, so it cannot place a point.
    if (event.inputType === 'touch' && Date.now() - down.time >= LONG_PRESS_MS) return;

    this.placePoint(event);
  }

  onDoubleClick(event: NormalizedInputEvent): void {
    if (!this.isActive) return;
    // The two clicks of a double click already placed points, so there is
    // nothing left to do here except keep the map from zooming.
    event.originalEvent.preventDefault();
    event.originalEvent.stopPropagation();
  }

  onLongPress(_event: NormalizedInputEvent): void {
    if (!this.isActive) return;
    this.resetPointer();
    // Touch equivalent of "undo last point", as in the polygon and line modes.
    if (this.points.length === 0) return;
    this.points.pop();
    this.context.render.clearPreview();
    this.context.render.clearSnapIndicator();
    this.renderPoints();
    this.emitDraftChange();
  }

  onKeyDown(key: string, _event: KeyboardEvent): void {
    if (!this.isActive) return;

    if (key === 'Escape') {
      this.cancelDrawing();
    }
  }

  /**
   * The rectangle is only defined once the third point is clicked, so the
   * draft never holds enough information to finish programmatically.
   * @returns Always `false`.
   */
  finishDrawing(): boolean {
    return false;
  }

  /**
   * Discard the whole draft. Mode remains active.
   */
  cancelDrawing(): void {
    if (!this.isActive) return;
    this.points = [];
    this.resetPointer();
    this.clearDraftRendering();
    // Always notify (even without a draft) so external UIs can reset,
    // matching the other drawing modes and the facade's TSDoc.
    this.emitDraftChange();
  }

  /**
   * @returns The number of placed base-edge points (`0`, `1`, or `2`).
   */
  getDraftVertexCount(): number {
    return this.isActive ? this.points.length : 0;
  }

  /**
   * The first two points snap and become the base edge. The third is used
   * as clicked: it only sets the width and never becomes a corner.
   */
  private placePoint(event: NormalizedInputEvent): void {
    if (this.points.length === 2) {
      const [a, b] = this.points;
      this.tryFinalize(a, b, [event.lngLat.lng, event.lngLat.lat]);
      return;
    }

    const snapped = this.applySnap(event.lngLat);

    if (this.points.length === 1) {
      const first = this.points[0];
      // A zero-length base edge has no direction; keep the first point.
      if (snapped[0] === first[0] && snapped[1] === first[1]) return;
      this.points.push(snapped);
      // From here on nothing snaps, so drop the indicator, and draw the base
      // edge: on touch it is the only hint of the direction until the third tap.
      this.context.render.clearSnapIndicator();
      this.context.render.renderPreview([first, snapped]);
    } else {
      this.points.push(snapped);
    }

    this.renderPoints();
    this.emitDraftChange();
  }

  /**
   * Create the rectangle on base edge `a`→`b` whose width is set by
   * `widthPoint`. A zero width is ignored and the base edge is kept.
   */
  private tryFinalize(a: Position, b: Position, widthPoint: Position): void {
    const ring = buildAngledRectangleRing(a, b, widthPoint);
    if (!ring) return;

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
    this.context.history.push(new CreateAction(stored));
    this.context.events.emit('create', { feature: cloneFeature(stored) });
    this.context.render.renderFeatures();

    this.points = [];
    this.clearDraftRendering();
    this.emitDraftChange();
  }

  /**
   * Build the preview for a cursor after the base edge is placed: the
   * rectangle, or the base edge alone while the width is zero.
   */
  private buildPreviewCoordinates(cursor: Position): Position[] {
    const [a, b] = this.points;
    return buildAngledRectangleRing(a, b, cursor) ?? [a, b];
  }

  private renderPoints(): void {
    if (this.points.length === 0) {
      this.context.render.clearVertices();
    } else {
      this.context.render.renderVertices(this.points, []);
    }
  }

  private clearDraftRendering(): void {
    this.context.render.clearPreview();
    this.context.render.clearVertices();
    this.context.render.clearSnapIndicator();
  }

  private resetPointer(): void {
    this.pointerDown = null;
    this.isDragging = false;
  }

  private emitDraftChange(): void {
    this.context.events.emit('draftchange', {
      vertexCount: this.getDraftVertexCount(),
    });
  }

  /**
   * Snap a position to a nearby vertex or edge when snapping is enabled,
   * updating the snap indicator to match.
   */
  private applySnap(lngLat: { lng: number; lat: number }): Position {
    const snapConfig = this.context.getSnapConfig();
    const snapTarget = snapConfig.enabled
      ? findSnapTarget(lngLat, this.context.store.getAll(), this.context.getScreenPoint, {
          threshold: snapConfig.threshold ?? 10,
          viewportBounds: this.context.getViewportBounds(),
        })
      : null;
    if (snapTarget) {
      this.context.render.renderSnapIndicator(snapTarget.position);
      return [snapTarget.position[0], snapTarget.position[1]];
    }
    this.context.render.clearSnapIndicator();
    return [lngLat.lng, lngLat.lat];
  }
}
