import type { Mode } from './Mode';
import type { NormalizedInputEvent } from '../types/input';
import type { LibreDrawFeature, Position } from '../types/features';
import { CreateAction } from '../types/features';
import { cloneFeature } from '../utils/featureSnapshot';
import type { ModeContext } from '../core/ModeContext';
import { findSnapTarget } from '../utils/snap';

/**
 * Drawing mode for placing point features.
 *
 * Each click/tap instantly creates a Point feature at the clicked
 * coordinate. The mode stays active for continuous placement.
 * Escape cancels (returns to idle).
 */
export class DrawPointMode implements Mode {
  private isActive = false;
  private context: ModeContext;

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
  }

  deactivate(): void {
    this.isActive = false;
    this.context.render.clearSnapIndicator();
  }

  onPointerDown(event: NormalizedInputEvent): void {
    if (!this.isActive) return;

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

  onPointerMove(event: NormalizedInputEvent): void {
    if (!this.isActive) return;

    const snapTarget = this.findSnap(event.lngLat);
    if (snapTarget) {
      this.context.render.renderSnapIndicator(snapTarget.position);
    } else {
      this.context.render.clearSnapIndicator();
    }
  }

  onPointerUp(_event: NormalizedInputEvent): void {
    // No-op
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
