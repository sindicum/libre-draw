import type { Map as MaplibreMap } from 'maplibre-gl';
import type { NormalizedInputEvent } from '../types/input';
import type { GetActiveModeCallback } from './InputHandler';

/**
 * Feeds the active drawing mode from the center reticle instead of the
 * pointer.
 *
 * The reticle stands still at the center of the map while the map moves
 * underneath it, so its center is "where the pointer is". This class turns
 * that into the same normalized events a mouse would produce, which lets
 * every drawing mode apply its usual rules (snapping, position-based
 * finishing) without knowing about the reticle:
 *
 * - each map `move` is a hover at the center (`onPointerMove`), so the
 *   preview and the snap indicator follow the map;
 * - "Add point" is a click at the center (`onPointerDown` + `onPointerUp`),
 *   followed by a hover so the indicator shows what a second press would do.
 *
 * Events are dispatched as `'mouse'`: like a mouse, the reticle hovers and
 * lands exactly where it points, so neither the long-press check nor the
 * finger tolerance that `'touch'` adds applies.
 */
export class ReticleInput {
  private map: MaplibreMap;
  private getActiveMode: GetActiveModeCallback;
  private isActive: () => boolean;
  private enabled = false;

  /**
   * @param map - The map whose center the reticle marks.
   * @param getActiveMode - Returns the mode that should receive events.
   * @param isActive - Whether the reticle currently drives the active mode
   *   (reticle input method and a drawing mode). Checked on every event.
   */
  constructor(map: MaplibreMap, getActiveMode: GetActiveModeCallback, isActive: () => boolean) {
    this.map = map;
    this.getActiveMode = getActiveMode;
    this.isActive = isActive;
  }

  /**
   * Start following map movement.
   */
  enable(): void {
    if (this.enabled) return;
    this.enabled = true;
    this.map.on('move', this.handleMove);
  }

  /**
   * Stop following map movement.
   */
  disable(): void {
    if (!this.enabled) return;
    this.enabled = false;
    this.map.off('move', this.handleMove);
  }

  /**
   * Remove the map listener.
   */
  destroy(): void {
    this.disable();
  }

  /**
   * Place a point at the reticle, as a click there would. No-op while the
   * reticle is not driving a drawing mode.
   */
  addPoint(): void {
    if (!this.isActive()) return;
    const mode = this.getActiveMode();
    if (!mode) return;
    const event = this.centerEvent();
    mode.onPointerDown(event);
    mode.onPointerUp(event);
    mode.onPointerMove(event);
  }

  /**
   * Move the preview to the reticle, as a hover there would. Used when the
   * reticle starts driving a mode, before the map has moved.
   */
  syncPreview(): void {
    if (!this.isActive()) return;
    this.getActiveMode()?.onPointerMove(this.centerEvent());
  }

  private handleMove = (): void => {
    this.syncPreview();
  };

  /**
   * A normalized mouse event at the center of the map container, where the
   * reticle is drawn.
   *
   * Uses the layout size (`clientWidth` / `clientHeight`), which is what
   * MapLibre sizes its transform by, not the on-screen size: under a CSS
   * `transform: scale()` the two differ and only the former hits the center.
   */
  private centerEvent(): NormalizedInputEvent {
    const container = this.map.getContainer();
    const point = { x: container.clientWidth / 2, y: container.clientHeight / 2 };
    const lngLat = this.map.unproject([point.x, point.y]);
    return {
      lngLat: { lng: lngLat.lng, lat: lngLat.lat },
      point,
      originalEvent: new MouseEvent('mousemove'),
      inputType: 'mouse',
    };
  }
}
