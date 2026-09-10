import type { DraftCapableMode } from './Mode';
import type { NormalizedInputEvent } from '../types/input';
import type { LibreDrawFeature, Position } from '../types/features';
import { CreateAction } from '../types/features';
import { cloneFeature } from '../utils/featureSnapshot';
import type { ModeContext } from '../core/ModeContext';
import { findSnapTarget } from '../utils/snap';
import { LONG_PRESS_MS } from '../input/gestures';

/**
 * Maximum pointer travel, in pixels, between pointer down and pointer up
 * that still counts as a mouse click rather than a drag.
 */
const MOUSE_CLICK_TOLERANCE_PX = 3;

/**
 * Maximum finger travel, in pixels, between touch start and touch end that
 * still counts as a tap. Larger than the mouse tolerance because a finger
 * always wobbles a few pixels on a deliberate tap.
 */
const TOUCH_TAP_TOLERANCE_PX = 12;

/**
 * Build a closed, counter-clockwise rectangle ring from two opposite corners.
 *
 * The rectangle is aligned to the geographic (lng / lat) axes so that the
 * same two corners always yield the same polygon regardless of the map's
 * bearing. Rotated rectangles are produced by the rotate mode instead.
 *
 * @returns The 5-position ring, or `null` when the corners share a
 *   longitude or latitude (zero width or height).
 */
export function buildRectangleRing(a: Position, b: Position): Position[] | null {
  const minLng = Math.min(a[0], b[0]);
  const maxLng = Math.max(a[0], b[0]);
  const minLat = Math.min(a[1], b[1]);
  const maxLat = Math.max(a[1], b[1]);

  if (minLng === maxLng || minLat === maxLat) return null;

  return [
    [minLng, minLat],
    [maxLng, minLat],
    [maxLng, maxLat],
    [minLng, maxLat],
    [minLng, minLat],
  ];
}

/**
 * Drawing mode for creating axis-aligned rectangles from two corners.
 *
 * Both corners are placed by a **click or tap** — a pointer down followed by
 * a pointer up that has not travelled beyond the per-input-type tolerance:
 *
 * - First click/tap places the first corner, marked with a vertex dot.
 * - With a mouse, moving the cursor previews the rectangle spanned by the
 *   first corner and the cursor. Touch has no hover, so between two taps the
 *   corner dot is the only feedback and no preview is drawn.
 * - Second click/tap places the opposite corner and finalizes the polygon.
 *
 * A drag never places a corner: it is left to the map so the user can pan
 * while drawing (hence `dragPan: true`). This matters most on touch, where
 * dragging is the only way to move the map with one finger.
 *
 * A second corner that would produce a zero-width or zero-height rectangle
 * is silently ignored and the first corner is kept.
 * Long press, Escape, or `cancelDrawing()` discards the first corner.
 * `finishDrawing()` always returns `false`: the draft never holds enough
 * information to finalize without the second click.
 */
export class DrawRectangleMode implements DraftCapableMode {
  private firstCorner: Position | null = null;
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
      // Corners are placed by clicks and taps, never by drags, so panning
      // stays available. On touch it is the only single-finger map gesture.
      dragPan: true,
      doubleClickZoom: false,
    };
  }

  activate(): void {
    this.isActive = true;
    this.firstCorner = null;
    this.resetPointer();
  }

  deactivate(): void {
    this.isActive = false;
    this.firstCorner = null;
    this.resetPointer();
    this.context.render.clearPreview();
    this.context.render.clearVertices();
    this.context.render.clearSnapIndicator();
    // Notify listeners regardless of prior state so UIs can reset on exit.
    this.context.events.emit('draftchange', { vertexCount: 0 });
  }

  onPointerDown(event: NormalizedInputEvent): void {
    if (!this.isActive) return;

    // Corners are placed on pointer up so that a drag can pan the map.
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
      // Leave the preview untouched so no stale rectangle is left behind.
      if (this.travelFrom(this.pointerDown, event) > this.tolerance(event)) {
        this.isDragging = true;
      }
      return;
    }

    // Hover preview. Touch has no hover, and a touch move without a pointer
    // down can only be a stray event after a long press, so ignore it.
    if (event.inputType !== 'mouse') return;
    if (this.firstCorner === null) return;

    const snapTarget = this.findSnap(event.lngLat);
    if (snapTarget) {
      this.context.render.renderSnapIndicator(snapTarget.position);
      this.context.render.renderPreview(this.buildPreviewCoordinates(snapTarget.position));
    } else {
      this.context.render.clearSnapIndicator();
      this.context.render.renderPreview(
        this.buildPreviewCoordinates([event.lngLat.lng, event.lngLat.lat])
      );
    }
  }

  onPointerUp(event: NormalizedInputEvent): void {
    if (!this.isActive) return;

    const down = this.pointerDown;
    const wasDragging = this.isDragging;
    this.resetPointer();

    if (down === null) return;
    // The pointer moved: the map handled it as a pan.
    if (wasDragging || this.travelFrom(down, event) > this.tolerance(event)) return;
    // TouchInput emits a pointer up before it emits the long press. Treat a
    // held finger as a long press, not as a tap, so it cannot place a corner.
    if (event.inputType === 'touch' && Date.now() - down.time >= LONG_PRESS_MS) return;

    this.placeCorner(event);
  }

  onDoubleClick(event: NormalizedInputEvent): void {
    if (!this.isActive) return;
    // Both corners are placed by the two clicks of a double click, so there
    // is nothing left to do here except keep the map from handling it.
    event.originalEvent.preventDefault();
    event.originalEvent.stopPropagation();
  }

  onLongPress(_event: NormalizedInputEvent): void {
    if (!this.isActive) return;
    // Touch equivalent of "undo last point": discard the first corner.
    this.cancelDrawing();
  }

  onKeyDown(key: string, _event: KeyboardEvent): void {
    if (!this.isActive) return;

    if (key === 'Escape') {
      this.cancelDrawing();
    }
  }

  /**
   * Rectangles can only be finalized by the second corner click, so the
   * draft never holds enough information to finish programmatically.
   * @returns Always `false`.
   */
  finishDrawing(): boolean {
    return false;
  }

  /**
   * Discard the first corner. Mode remains active.
   */
  cancelDrawing(): void {
    if (!this.isActive) return;
    this.firstCorner = null;
    this.resetPointer();
    this.context.render.clearPreview();
    this.context.render.clearVertices();
    this.context.render.clearSnapIndicator();
    // Always notify (even without a draft) so external UIs can reset,
    // matching DrawPolygonMode / DrawLineMode and the facade's TSDoc.
    this.emitDraftChange();
  }

  /**
   * @returns `1` while the first corner is placed, otherwise `0`.
   */
  getDraftVertexCount(): number {
    return this.isActive && this.firstCorner !== null ? 1 : 0;
  }

  /**
   * Place a corner at the (possibly snapped) position of a click or tap.
   */
  private placeCorner(event: NormalizedInputEvent): void {
    const snappedPos = this.applySnap(event.lngLat);
    const corner: Position = [snappedPos.lng, snappedPos.lat];

    if (this.firstCorner === null) {
      this.firstCorner = corner;
      // The dot is the only feedback a touch user gets before the second
      // tap, because there is no hover to drive a rubber-band preview.
      this.context.render.renderVertices([corner], []);
      this.emitDraftChange();
      return;
    }

    this.tryFinalize(corner);
  }

  /** Forget the current pointer interaction. */
  private resetPointer(): void {
    this.pointerDown = null;
    this.isDragging = false;
  }

  /** Screen-space distance in pixels from the pointer down position. */
  private travelFrom(down: { x: number; y: number }, event: NormalizedInputEvent): number {
    const dx = event.point.x - down.x;
    const dy = event.point.y - down.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /** Click/tap travel tolerance for the event's input type. */
  private tolerance(event: NormalizedInputEvent): number {
    return event.inputType === 'touch' ? TOUCH_TAP_TOLERANCE_PX : MOUSE_CLICK_TOLERANCE_PX;
  }

  /**
   * Build the preview ring spanned by the first corner and the cursor.
   * Degenerate spans (shared lng or lat) are drawn as a collapsed ring so
   * the preview still tracks the cursor.
   */
  private buildPreviewCoordinates(cursorPos: Position): Position[] {
    if (this.firstCorner === null) return [];
    const ring = buildRectangleRing(this.firstCorner, cursorPos);
    if (ring) return ring;
    const a = this.firstCorner;
    return [[...a] as Position, [...cursorPos] as Position, [...a] as Position];
  }

  /**
   * Attempt to finalize the rectangle with the given opposite corner.
   * @returns `true` when a feature was created, `false` for a degenerate span.
   */
  private tryFinalize(secondCorner: Position): boolean {
    if (this.firstCorner === null) return false;
    const ring = buildRectangleRing(this.firstCorner, secondCorner);
    if (!ring) return false;

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

    this.firstCorner = null;
    this.context.render.clearPreview();
    this.context.render.clearVertices();
    this.context.render.clearSnapIndicator();
    this.emitDraftChange();
    return true;
  }

  private emitDraftChange(): void {
    this.context.events.emit('draftchange', {
      vertexCount: this.getDraftVertexCount(),
    });
  }

  /**
   * Find a snap target for the given position.
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
   * Apply snap to a position and return the (possibly snapped) coordinates.
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
