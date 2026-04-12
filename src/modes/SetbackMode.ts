import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point as turfPoint } from '@turf/helpers';
import type { Mode } from './Mode';
import type { ModeContext } from '../core/ModeContext';
import type { LibreDrawFeature, PolygonGeometry, Position } from '../types/features';
import { SetbackAction } from '../types/features';
import type { NormalizedInputEvent } from '../types/input';
import { cloneFeature } from '../utils/featureSnapshot';
import { getVertices } from '../utils/geometry';
import { splitPolygon } from '../utils/splitPolygon';
import {
  computeInwardNormal,
  computeOffsetLine,
  extendLine,
  findNearestEdge,
} from '../utils/setback';
import { EPSILON } from '../validation/intersection';

type SetbackState = 'idle' | 'selecting-edge' | 'previewing';

const HIT_THRESHOLD_MOUSE_PX = 18;
const HIT_THRESHOLD_TOUCH_PX = 24;
// Expand edge hit area when clicking slightly outside polygon in preview state.
const OUTSIDE_EDGE_HIT_BONUS_PX = 12;
const EXTENDED_OFFSET_LINE_RATIO = 1.0;
const DEFAULT_SETBACK_DISTANCE_METERS = 10;

/**
 * Mode for edge setback operation.
 */
export class SetbackMode implements Mode {
  private context: ModeContext;
  private isActive = false;
  private state: SetbackState = 'idle';
  private selectedFeatureId: string | null = null;
  private selectedEdgeIndex = -1;

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
      this.handlePolygonSelection(event);
      return;
    }

    if (this.state === 'selecting-edge') {
      this.handleEdgeSelection(event);
      return;
    }

    if (this.state === 'previewing') {
      this.handlePreviewingClick(event);
    }
  }

  onPointerMove(event: NormalizedInputEvent): void {
    if (!this.isActive) return;

    if (this.state === 'selecting-edge') {
      this.updateHoveredEdgeHighlight(event);
    }
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

    if (key === 'Escape') {
      this.resetInteractionState(true);
      return;
    }

    if (key === 'Enter') {
      this.executeSetback();
    }
  }

  /**
   * Called by UI when setback distance changes.
   */
  onDistanceChange(distance: number): void {
    if (!this.isActive || this.state !== 'previewing') return;
    this.updateOffsetPreview(distance);
  }

  /**
   * Called by UI execute button.
   */
  executeFromUi(distance: number): void {
    this.executeSetback(distance);
  }

  /** Select the target polygon at the pointer location and enter edge-selection state. */
  private handlePolygonSelection(event: NormalizedInputEvent): void {
    const hit = this.hitTest([event.lngLat.lng, event.lngLat.lat]);
    if (!hit) {
      this.resetInteractionState(true);
      return;
    }

    this.selectFeature(hit.id);
    this.state = 'selecting-edge';
  }

  /** Choose an edge under the pointer and switch to previewing state. */
  private handleEdgeSelection(event: NormalizedInputEvent): void {
    const feature = this.getSelectedFeature();
    if (!feature) {
      this.resetInteractionState(true);
      return;
    }

    const vertices = getVertices(feature);
    const threshold = this.getThreshold(event);
    const hit = findNearestEdge(
      vertices,
      event.point,
      threshold,
      this.context.getScreenPoint,
    );

    if (!hit) return;

    this.selectedEdgeIndex = hit.edgeIndex;
    this.state = 'previewing';

    this.renderSelectedEdgeHighlight(feature, this.selectedEdgeIndex);
    this.updateOffsetPreview();
  }

  /** Update hovered edge highlight while waiting for edge selection. */
  private updateHoveredEdgeHighlight(event: NormalizedInputEvent): void {
    const feature = this.getSelectedFeature();
    if (!feature) return;

    const vertices = getVertices(feature);
    const threshold = this.getThreshold(event);
    const hit = findNearestEdge(
      vertices,
      event.point,
      threshold,
      this.context.getScreenPoint,
    );

    if (!hit) {
      this.context.render.clearEdgeHighlight();
      return;
    }

    this.renderSelectedEdgeHighlight(feature, hit.edgeIndex);
  }

  /** Handle clicks in previewing state (edge switch or outside-click reset). */
  private handlePreviewingClick(event: NormalizedInputEvent): void {
    const feature = this.getSelectedFeature();
    if (!feature) {
      this.resetInteractionState(true);
      return;
    }

    const vertices = getVertices(feature);
    const clickPoint = turfPoint([event.lngLat.lng, event.lngLat.lat]);
    const insidePolygon = booleanPointInPolygon(clickPoint, feature.geometry as PolygonGeometry);
    const threshold = this.getThreshold(event) + (insidePolygon ? 0 : OUTSIDE_EDGE_HIT_BONUS_PX);

    const hit = findNearestEdge(
      vertices,
      event.point,
      threshold,
      this.context.getScreenPoint,
    );
    if (hit) {
      this.selectedEdgeIndex = hit.edgeIndex;
      this.renderSelectedEdgeHighlight(feature, this.selectedEdgeIndex);
      this.updateOffsetPreview();
      return;
    }

    if (!insidePolygon) {
      this.resetInteractionState(true);
      return;
    }
  }

  /** Render the offset preview line using current or overridden setback distance. */
  private updateOffsetPreview(distanceOverride?: number): void {
    const feature = this.getSelectedFeature();
    if (!feature || this.selectedEdgeIndex < 0) return;

    const distance = distanceOverride ?? this.getSetbackDistance();
    if (distance <= 0) return;

    const vertices = getVertices(feature);
    const [edgeStart, edgeEnd] = this.getEdgeCoordinates(feature, this.selectedEdgeIndex);

    try {
      const inwardNormal = computeInwardNormal(edgeStart, edgeEnd, vertices);
      const [offsetStart, offsetEnd] = computeOffsetLine(
        edgeStart,
        edgeEnd,
        distance,
        inwardNormal,
      );
      this.context.render.renderPreview([offsetStart, offsetEnd]);
    } catch {
      this.context.render.clearPreview();
    }
  }

  /** Execute the setback operation and commit history/event updates on success. */
  private executeSetback(distanceOverride?: number): void {
    if (!this.isActive || this.state !== 'previewing') return;

    const feature = this.getSelectedFeature();
    if (!feature || this.selectedEdgeIndex < 0) {
      this.resetInteractionState(true);
      return;
    }

    if (feature.geometry.type !== 'Polygon' || feature.geometry.coordinates.length > 1) {
      this.emitSetbackFailed('has-holes', feature.id);
      this.state = 'selecting-edge';
      this.selectedEdgeIndex = -1;
      this.context.render.clearPreview();
      this.context.render.clearEdgeHighlight();
      return;
    }

    const distance = distanceOverride ?? this.getSetbackDistance();
    if (distance <= 0) return;

    const vertices = getVertices(feature);
    const [edgeStart, edgeEnd] = this.getEdgeCoordinates(feature, this.selectedEdgeIndex);

    let extendedStart: Position;
    let extendedEnd: Position;
    try {
      const inwardNormal = computeInwardNormal(edgeStart, edgeEnd, vertices);
      const [offsetStart, offsetEnd] = computeOffsetLine(
        edgeStart,
        edgeEnd,
        distance,
        inwardNormal,
      );
      [extendedStart, extendedEnd] = extendLine(
        offsetStart,
        offsetEnd,
        EXTENDED_OFFSET_LINE_RATIO,
      );
    } catch {
      this.emitSetbackFailed('invalid-split', feature.id);
      return;
    }

    const splitResult = splitPolygon(feature, extendedStart, extendedEnd);
    if (splitResult.type === 'error') {
      this.emitSetbackFailed('invalid-split', feature.id);
      this.state = 'selecting-edge';
      this.selectedEdgeIndex = -1;
      this.context.render.clearPreview();
      this.context.render.clearEdgeHighlight();
      return;
    }

    const [featureA, featureB] = splitResult.features;
    const verticesA = (featureA.geometry as PolygonGeometry).coordinates[0];
    const isASetbackBand = verticesA.some(
      (v) =>
        Math.abs(v[0] - edgeStart[0]) < EPSILON &&
        Math.abs(v[1] - edgeStart[1]) < EPSILON,
    );

    const resultFeature = isASetbackBand ? featureB : featureA;

    this.context.store.remove(feature.id);
    this.context.store.add(resultFeature);

    const action = new SetbackAction(feature, resultFeature);
    this.context.history.push(action);
    this.context.events.emit('setback', {
      originalFeature: cloneFeature(feature),
      feature: cloneFeature(resultFeature),
      edgeIndex: this.selectedEdgeIndex,
      distance,
    });

    this.context.render.renderFeatures();
    this.resetInteractionState(true);
  }

  /** Find the topmost polygon that contains the given geographic position. */
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

  /** Mark a feature as selected and notify render/event layers. */
  private selectFeature(id: string): void {
    this.selectedFeatureId = id;
    this.context.render.setSelectedIds([id]);
    this.context.events.emit('selectionchange', { selectedIds: [id] });
    this.context.render.renderFeatures();
  }

  /** Clear current feature selection and notify render/event layers. */
  private clearSelection(): void {
    if (!this.selectedFeatureId) return;
    this.selectedFeatureId = null;
    this.context.render.setSelectedIds([]);
    this.context.events.emit('selectionchange', { selectedIds: [] });
    this.context.render.renderFeatures();
  }

  /** Get the currently selected feature from the store. */
  private getSelectedFeature(): LibreDrawFeature | undefined {
    if (!this.selectedFeatureId) return undefined;
    return this.context.store.getById(this.selectedFeatureId);
  }

  /** Resolve edge endpoints from a feature and edge index. */
  private getEdgeCoordinates(
    feature: LibreDrawFeature,
    edgeIndex: number,
  ): [Position, Position] {
    const vertices = getVertices(feature);
    const next = (edgeIndex + 1) % vertices.length;
    return [vertices[edgeIndex], vertices[next]];
  }

  /** Render highlight for the given edge index. */
  private renderSelectedEdgeHighlight(feature: LibreDrawFeature, edgeIndex: number): void {
    const [start, end] = this.getEdgeCoordinates(feature, edgeIndex);
    this.context.render.renderEdgeHighlight([start, end]);
  }

  /** Emit a normalized setback failure event. */
  private emitSetbackFailed(reason: 'has-holes' | 'invalid-split', featureId: string): void {
    this.context.events.emit('setbackfailed', {
      reason,
      featureId,
    });
  }

  /** Read setback distance from context with numeric safety fallback. */
  private getSetbackDistance(): number {
    const distance = this.context.getSetbackDistance();
    return Number.isFinite(distance) ? distance : DEFAULT_SETBACK_DISTANCE_METERS;
  }

  /** Return pointer hit threshold by input device type. */
  private getThreshold(event: NormalizedInputEvent): number {
    return event.inputType === 'touch'
      ? HIT_THRESHOLD_TOUCH_PX
      : HIT_THRESHOLD_MOUSE_PX;
  }

  /** Reset mode interaction state and optionally clear feature selection. */
  private resetInteractionState(clearSelection: boolean): void {
    this.state = 'idle';
    this.selectedEdgeIndex = -1;
    this.context.render.clearPreview();
    this.context.render.clearEdgeHighlight();

    if (clearSelection) {
      this.clearSelection();
    }
  }
}
