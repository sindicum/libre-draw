import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point as turfPoint } from '@turf/helpers';
import type { Mode } from './Mode';
import type { ModeContext } from '../core/ModeContext';
import type { LibreDrawFeature, Position } from '../types/features';
import { SplitAction } from '../types/features';
import type { NormalizedInputEvent } from '../types/input';
import { cloneFeature } from '../utils/featureSnapshot';
import { splitPolygon } from '../utils/splitPolygon';
import type { SplitResult } from '../utils/splitPolygon';

type SplitState = 'idle' | 'first-point' | 'second-point';

/**
 * Mode for splitting a selected polygon with a two-point line.
 */
export class SplitMode implements Mode {
  private context: ModeContext;
  private isActive = false;
  private state: SplitState = 'idle';
  private selectedFeatureId: string | null = null;
  private lineStart: Position | null = null;

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
    this.resetInteractionState(false);
  }

  deactivate(): void {
    this.isActive = false;
    this.resetInteractionState(true);
  }

  onPointerDown(event: NormalizedInputEvent): void {
    if (!this.isActive) return;

    if (this.state === 'idle') {
      this.handleTargetSelection(event);
      return;
    }

    if (this.state === 'first-point') {
      this.lineStart = [event.lngLat.lng, event.lngLat.lat];
      this.state = 'second-point';
      this.context.render.renderPreview([this.lineStart, this.lineStart]);
      return;
    }

    this.executeSplit([event.lngLat.lng, event.lngLat.lat]);
  }

  onPointerMove(event: NormalizedInputEvent): void {
    if (!this.isActive) return;
    if (this.state !== 'second-point' || !this.lineStart) return;

    const lineEnd: Position = [event.lngLat.lng, event.lngLat.lat];
    this.context.render.renderPreview([this.lineStart, lineEnd]);
  }

  onPointerUp(_event: NormalizedInputEvent): void {
    // No-op
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

    this.resetInteractionState(true);
  }

  /** Perform a hit-test at the pointer position and select the target polygon. */
  private handleTargetSelection(event: NormalizedInputEvent): void {
    const hit = this.hitTest([event.lngLat.lng, event.lngLat.lat]);
    if (!hit) {
      this.clearSelection();
      this.context.render.clearPreview();
      return;
    }

    this.selectFeature(hit.id);
    this.state = 'first-point';
    this.lineStart = null;
    this.context.render.clearPreview();
  }

  /** Execute the split operation using the stored first point and the given second point. */
  private executeSplit(lineEnd: Position): void {
    if (!this.selectedFeatureId || !this.lineStart) {
      this.resetInteractionState(true);
      return;
    }

    const feature = this.context.store.getById(this.selectedFeatureId);
    if (!feature) {
      this.resetInteractionState(true);
      return;
    }

    const splitResult: SplitResult = splitPolygon(feature, this.lineStart, lineEnd);
    if (splitResult.type === 'error') {
      this.context.events.emit('splitfailed', {
        reason: splitResult.reason,
        featureId: feature.id,
      });
      this.state = 'first-point';
      this.lineStart = null;
      this.context.render.clearPreview();
      return;
    }

    const [featureA, featureB] = splitResult.features;

    this.context.store.remove(feature.id);
    this.context.store.add(featureA);
    this.context.store.add(featureB);

    const action = new SplitAction(feature, featureA, featureB);
    this.context.history.push(action);
    this.context.events.emit('split', {
      originalFeature: cloneFeature(feature),
      features: [cloneFeature(featureA), cloneFeature(featureB)],
    });

    this.clearSelection();
    this.context.render.clearPreview();
    this.context.render.renderFeatures();

    this.state = 'idle';
    this.lineStart = null;
  }

  /** Find the topmost polygon that contains the given position. */
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

  /** Highlight a feature as the split target and notify listeners. */
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

  /** Reset the mode to idle state, optionally clearing the active selection. */
  private resetInteractionState(clearSelection: boolean): void {
    this.state = 'idle';
    this.lineStart = null;
    this.context.render.clearPreview();

    if (clearSelection) {
      this.clearSelection();
    }
  }
}
