import type { Mode } from './Mode';
import type { NormalizedInputEvent } from '../types/input';
import type { LibreDrawFeature, Position } from '../types/features';
import { CreateAction } from '../types/features';
import { cloneFeature } from '../utils/featureSnapshot';
import type { ModeContext } from '../core/ModeContext';
import { findSnapTarget } from '../utils/snap';
import { LONG_PRESS_MS, clickTolerance, pointerTravel } from '../input/gestures';

/**
 * Drawing mode for placing point features.
 *
 * Each **click or tap** — a pointer down followed by a pointer up that has
 * not travelled beyond the per-input-type tolerance — creates a Point
 * feature at that coordinate. The mode stays active for continuous placement.
 *
 * A drag never places a point: it is left to the map so the user can pan
 * while drawing (hence `dragPan: true`). This matters most on touch, where
 * dragging is the only way to move the map with one finger.
 *
 * Escape clears the snap indicator; the mode remains active.
 */
export class DrawPointMode implements Mode {
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
    this.resetPointer();
  }

  deactivate(): void {
    this.isActive = false;
    this.resetPointer();
    this.context.render.clearSnapIndicator();
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
      // Leave the snap indicator untouched so it does not follow the pan.
      if (pointerTravel(this.pointerDown, event.point) > clickTolerance(event.inputType)) {
        this.isDragging = true;
      }
      return;
    }

    const snapTarget = this.findSnap(event.lngLat);
    if (snapTarget) {
      this.context.render.renderSnapIndicator(snapTarget.position);
    } else {
      this.context.render.clearSnapIndicator();
    }
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
    // Prevent map zoom on double-click
    event.originalEvent.preventDefault();
    event.originalEvent.stopPropagation();
  }

  onLongPress(_event: NormalizedInputEvent): void {
    // No-op
  }

  onKeyDown(key: string, _event: KeyboardEvent): void {
    if (!this.isActive) return;

    if (key === 'Escape') {
      this.context.render.clearSnapIndicator();
    }
  }

  /**
   * Create a Point feature at the (possibly snapped) position of a click or tap.
   */
  private placePoint(event: NormalizedInputEvent): void {
    const snappedPos = this.applySnap(event.lngLat);
    const coordinate: Position = [snappedPos.lng, snappedPos.lat];

    const feature: LibreDrawFeature = {
      id: crypto.randomUUID(),
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: coordinate,
      },
      properties: {},
    };

    const stored = this.context.store.add(feature);
    const action = new CreateAction(stored);
    this.context.history.push(action);
    this.context.events.emit('create', { feature: cloneFeature(stored) });
    this.context.render.renderFeatures();
    this.context.render.clearSnapIndicator();
  }

  /** Forget the current pointer interaction. */
  private resetPointer(): void {
    this.pointerDown = null;
    this.isDragging = false;
  }

  private findSnap(lngLat: { lng: number; lat: number }): ReturnType<typeof findSnapTarget> {
    const snapConfig = this.context.getSnapConfig();
    if (!snapConfig.enabled) return null;

    return findSnapTarget(lngLat, this.context.store.getAll(), this.context.getScreenPoint, {
      threshold: snapConfig.threshold ?? 10,
      viewportBounds: this.context.getViewportBounds(),
    });
  }

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
