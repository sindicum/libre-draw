import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point as turfPoint } from '@turf/helpers';
import type { MapInteractionConfig, Mode } from './Mode';
import type { ModeContext } from '../core/ModeContext';
import type { LibreDrawFeature, Position } from '../types/features';
import type { NormalizedInputEvent } from '../types/input';
import { LONG_PRESS_MS, clickTolerance, pointerTravel } from '../input/gestures';
import { union } from '../operations/union';

/**
 * Mode for merging two or more polygons into one.
 *
 * A click or tap on a polygon adds it to the selection, or removes it if
 * it is already selected; no modifier key is needed, so touch works the
 * same as a mouse. Clicking empty space clears the selection. Enter or the
 * toolbar's execute button ({@link UnionMode.execute}) merges the selected
 * polygons once at least two are selected. A successful union replaces
 * them with the merged one as a single history step and emits `union`.
 * A failed union leaves the store untouched, emits `unionfailed`, and keeps
 * the selection so it can be adjusted and run again.
 *
 * Map panning stays enabled because the second polygon may be off screen:
 * a pointer that travels beyond the click tolerance is treated as a pan,
 * not as a selection, and a finger held for a long press is not a tap.
 */
export class UnionMode implements Mode {
  private context: ModeContext;
  private isActive = false;
  private pointerDown: { x: number; y: number; time: number } | null = null;
  private isDragging = false;

  constructor(context: ModeContext) {
    this.context = context;
  }

  mapInteractions(): MapInteractionConfig {
    return {
      dragPan: true,
      doubleClickZoom: false,
      // Clicks here build a selection, and Shift + click is how select mode
      // does that, so users hold Shift out of habit. With box zoom on, a
      // click whose release lands even 1px away from the press zooms to
      // that tiny box.
      boxZoom: false,
    };
  }

  activate(): void {
    this.isActive = true;
    this.resetInteractionState();
  }

  deactivate(): void {
    this.isActive = false;
    this.resetInteractionState();
  }

  onPointerDown(event: NormalizedInputEvent): void {
    if (!this.isActive) return;
    // Targets are picked on pointer up so that a drag can pan the map.
    this.pointerDown = { x: event.point.x, y: event.point.y, time: Date.now() };
    this.isDragging = false;
  }

  onPointerMove(event: NormalizedInputEvent): void {
    if (!this.isActive || !this.pointerDown || this.isDragging) return;
    // Once the pointer has left the click tolerance this is a pan, even if
    // it comes back to the start before release.
    if (pointerTravel(this.pointerDown, event.point) > clickTolerance(event.inputType)) {
      this.isDragging = true;
    }
  }

  onPointerUp(event: NormalizedInputEvent): void {
    if (!this.isActive) return;

    const down = this.pointerDown;
    const wasDragging = this.isDragging;
    this.pointerDown = null;
    this.isDragging = false;
    if (!down) return;
    if (wasDragging || pointerTravel(down, event.point) > clickTolerance(event.inputType)) return;
    // TouchInput emits a pointer up before it emits the long press. Treat a
    // held finger as a long press, not as a tap, so it cannot pick a target.
    if (event.inputType === 'touch' && Date.now() - down.time >= LONG_PRESS_MS) return;

    this.handleClick(event);
  }

  onDoubleClick(_event: NormalizedInputEvent): void {
    // No-op
  }

  onLongPress(_event: NormalizedInputEvent): void {
    // No-op
  }

  onKeyDown(key: string, _event: KeyboardEvent): void {
    if (!this.isActive) return;

    if (key === 'Escape') {
      this.resetInteractionState();
      return;
    }

    if (key === 'Enter') {
      this.execute();
    }
  }

  /**
   * Merge the selected polygons, in selection order, through the `union`
   * operation (one UnionAction, one `union` or `unionfailed` event). Called
   * for Enter and by the toolbar's execute button. Does nothing with fewer
   * than two polygons selected. A failure keeps the selection.
   */
  execute(): void {
    if (!this.isActive) return;

    const ids = this.context.selection.getSelectedIds();
    if (ids.length < 2) return;

    const result = union(this.context, ids);
    if (!result.ok) {
      if (result.reason === 'not-found') this.resetInteractionState();
      return;
    }

    this.clearSelection();
    this.context.render.renderFeatures();
  }

  /** Toggle the clicked polygon in the selection; empty space clears it. */
  private handleClick(event: NormalizedInputEvent): void {
    const hit = this.hitTest([event.lngLat.lng, event.lngLat.lat]);
    if (!hit) {
      this.clearSelection();
      return;
    }

    this.context.selection.toggle(hit.id);
  }

  /** Find the topmost polygon at the given position. Points and lines are ignored. */
  private hitTest(position: Position): LibreDrawFeature | undefined {
    const clickPoint = turfPoint([position[0], position[1]]);
    const features = this.context.store.getAll();

    for (let i = features.length - 1; i >= 0; i--) {
      const f = features[i];
      if (f.geometry.type === 'Polygon' && booleanPointInPolygon(clickPoint, f.geometry)) {
        return f;
      }
    }

    return undefined;
  }

  /** Remove the current selection highlight and notify listeners. */
  private clearSelection(): void {
    this.context.selection.clear();
  }

  /** Forget the pending pointer and drop the selection; the mode stays active. */
  private resetInteractionState(): void {
    this.pointerDown = null;
    this.isDragging = false;
    this.clearSelection();
  }
}
