import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point as turfPoint } from '@turf/helpers';
import type { Mode } from './Mode';
import type { ModeContext } from '../core/ModeContext';
import type { LibreDrawFeature, Position } from '../types/features';
import { UnionAction } from '../types/features';
import type { NormalizedInputEvent } from '../types/input';
import { LONG_PRESS_MS, clickTolerance, pointerTravel } from '../input/gestures';
import { cloneFeature } from '../utils/featureSnapshot';
import { unionPolygons } from '../utils/unionPolygon';

/**
 * Mode for merging two polygons into one.
 *
 * The first click or tap on a polygon selects it; the second click on a
 * different polygon runs the union. A successful union replaces both
 * polygons with the merged one as a single history step and emits `union`.
 * A failed union leaves the store untouched, emits `unionfailed`, and keeps
 * the first polygon selected so another partner can be picked.
 *
 * Map panning stays enabled because the second polygon may be off screen:
 * a pointer that travels beyond the click tolerance is treated as a pan,
 * not as a selection, and a finger held for a long press is not a tap.
 */
export class UnionMode implements Mode {
  private context: ModeContext;
  private isActive = false;
  private selectedFeatureId: string | null = null;
  private pointerDown: { x: number; y: number; time: number } | null = null;
  private isDragging = false;

  constructor(context: ModeContext) {
    this.context = context;
  }

  mapInteractions(): { dragPan: boolean; doubleClickZoom: boolean } {
    return {
      dragPan: true,
      doubleClickZoom: false,
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
    if (key !== 'Escape') return;

    this.resetInteractionState();
  }

  /** Pick the first target, or merge the selected target with the clicked one. */
  private handleClick(event: NormalizedInputEvent): void {
    const hit = this.hitTest([event.lngLat.lng, event.lngLat.lat]);
    if (!hit) {
      this.clearSelection();
      return;
    }

    if (!this.selectedFeatureId) {
      this.selectFeature(hit.id);
      return;
    }

    if (hit.id === this.selectedFeatureId) return;

    this.executeUnion(hit);
  }

  /** Merge the selected polygon with `second`, recording one history step. */
  private executeUnion(second: LibreDrawFeature): void {
    if (!this.selectedFeatureId) return;

    const first = this.context.store.getById(this.selectedFeatureId);
    if (!first) {
      this.resetInteractionState();
      return;
    }

    const result = unionPolygons(first, second);
    if (result.type === 'error') {
      this.context.events.emit('unionfailed', {
        reason: result.reason,
        featureIds: [first.id, second.id],
      });
      return;
    }

    const merged = result.feature;
    this.context.store.remove(first.id);
    this.context.store.remove(second.id);
    this.context.store.add(merged);

    this.context.history.push(new UnionAction(first, second, merged));
    this.context.events.emit('union', {
      originalFeatures: [cloneFeature(first), cloneFeature(second)],
      feature: cloneFeature(merged),
    });

    this.clearSelection();
    this.context.render.renderFeatures();
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

  /** Highlight a feature as the first union target and notify listeners. */
  private selectFeature(id: string): void {
    this.selectedFeatureId = id;
    this.context.render.setSelectedIds([id]);
    this.context.events.emit('selectionchange', { selectedIds: [id] });
    this.context.render.renderFeatures();
  }

  /** Remove the current selection highlight and notify listeners. */
  private clearSelection(): void {
    if (!this.selectedFeatureId) return;
    this.selectedFeatureId = null;
    this.context.render.setSelectedIds([]);
    this.context.events.emit('selectionchange', { selectedIds: [] });
    this.context.render.renderFeatures();
  }

  /** Forget the pending pointer and drop the selection; the mode stays active. */
  private resetInteractionState(): void {
    this.pointerDown = null;
    this.isDragging = false;
    this.clearSelection();
  }
}
