import type { ModeContext } from '../core/ModeContext';
import type { LibreDrawFeature } from '../types/features';
import type { NormalizedInputEvent } from '../types/input';
import { cloneFeature } from '../utils/featureSnapshot';
import { moveLine, movePolygon } from '../utils/geometry';

/**
 * Handles whole-polygon drag interactions.
 */
export class PolygonDragger {
  private context: ModeContext;
  private onFeatureMoved: (feature: LibreDrawFeature) => void;
  private dragging = false;
  private dragStartFeature: LibreDrawFeature | null = null;
  private dragStartLngLat: { lng: number; lat: number } | null = null;

  constructor(
    context: ModeContext,
    onFeatureMoved: (feature: LibreDrawFeature) => void,
  ) {
    this.context = context;
    this.onFeatureMoved = onFeatureMoved;
  }

  isDragging(): boolean {
    return this.dragging;
  }

  getDragStartFeature(): LibreDrawFeature | null {
    return this.dragStartFeature;
  }

  startDrag(
    feature: LibreDrawFeature,
    startLngLat: { lng: number; lat: number },
  ): void {
    this.dragging = true;
    this.dragStartFeature = cloneFeature(feature);
    this.dragStartLngLat = startLngLat;
    this.context.setDragPan(false);
  }

  handleDragMove(selectedId: string, event: NormalizedInputEvent): boolean {
    if (!this.dragging) return false;
    if (!this.dragStartFeature || !this.dragStartLngLat) return true;

    const dLng = event.lngLat.lng - this.dragStartLngLat.lng;
    const dLat = event.lngLat.lat - this.dragStartLngLat.lat;
    const updatedFeature = this.dragStartFeature.geometry.type === 'LineString'
      ? moveLine(this.dragStartFeature, dLng, dLat)
      : movePolygon(this.dragStartFeature, dLng, dLat);

    this.context.store.update(selectedId, updatedFeature);
    this.context.render.renderFeatures();
    this.onFeatureMoved(updatedFeature);
    return true;
  }

  endDrag(): void {
    if (this.dragging) {
      this.context.setDragPan(true);
    }
    this.dragging = false;
    this.dragStartFeature = null;
    this.dragStartLngLat = null;
  }

  resetInteractionState(): void {
    this.endDrag();
  }
}
