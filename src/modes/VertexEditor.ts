import type { ModeContext } from '../core/ModeContext';
import type { LibreDrawFeature, PolygonGeometry, Position } from '../types/features';
import type { NormalizedInputEvent } from '../types/input';
import { UpdateAction } from '../types/features';
import { cloneFeature } from '../utils/featureSnapshot';
import {
  computeMidpoints,
  computeLineMidpoints,
  getVertices,
  getLineVertices,
  insertVertex,
  insertLineVertex,
  moveVertex,
  moveLineVertex,
  removeVertex,
  removeLineVertex,
} from '../utils/geometry';
import { hasRingSelfIntersection } from '../validation/intersection';
import { findSnapTarget } from '../utils/snap';

const HIT_THRESHOLD_MOUSE_PX = 10;
const HIT_THRESHOLD_TOUCH_PX = 24;
const MIN_VERTICES = 3;
const MIN_LINE_VERTICES = 2;

/**
 * Handles vertex/midpoint interactions for selected polygons.
 */
export class VertexEditor {
  private context: ModeContext;
  private dragging = false;
  private dragVertexIndex = -1;
  private dragStartFeature: LibreDrawFeature | null = null;
  private highlightedVertexIndex = -1;
  private highlightedMidpointIndex = -1;

  constructor(context: ModeContext) {
    this.context = context;
  }

  isDragging(): boolean {
    return this.dragging;
  }

  getDragStartFeature(): LibreDrawFeature | null {
    return this.dragStartFeature;
  }

  resetInteractionState(): void {
    this.endDrag();
    this.highlightedVertexIndex = -1;
    this.highlightedMidpointIndex = -1;
  }

  clearHighlight(): void {
    this.highlightedVertexIndex = -1;
    this.highlightedMidpointIndex = -1;
  }

  tryStartVertexDragOrInsert(
    feature: LibreDrawFeature,
    selectedId: string,
    event: NormalizedInputEvent,
  ): boolean {
    const isLine = feature.geometry.type === 'LineString';
    const vertices = isLine ? getLineVertices(feature) : getVertices(feature);
    const threshold = this.getThreshold(event);

    const vertexIdx = this.findNearestVertex(vertices, event.point, threshold);
    if (vertexIdx >= 0) {
      this.startDrag(feature, vertexIdx);
      return true;
    }

    const midpoints = isLine ? computeLineMidpoints(vertices) : computeMidpoints(vertices);
    const midIdx = this.findNearestPoint(midpoints, event.point, threshold);
    if (midIdx >= 0) {
      const beforeInsert = cloneFeature(feature);
      const newFeature = isLine
        ? insertLineVertex(feature, midIdx + 1, midpoints[midIdx])
        : insertVertex(feature, midIdx + 1, midpoints[midIdx]);
      this.context.store.update(selectedId, newFeature);
      // Set highlight to the newly inserted vertex before rendering
      this.highlightedVertexIndex = midIdx + 1;
      this.highlightedMidpointIndex = -1;
      this.renderHandles(newFeature);
      this.startDrag(newFeature, midIdx + 1, beforeInsert);
      return true;
    }

    return false;
  }

  handleDragMove(selectedId: string, event: NormalizedInputEvent): boolean {
    if (!this.dragging) return false;

    const feature = this.context.store.getById(selectedId);
    if (!feature) return true;

    // Apply snap to the drag position
    const snappedPos = this.applySnapForDrag(event.lngLat, selectedId);
    const newPos: Position = [snappedPos.lng, snappedPos.lat];

    // LineString: no self-intersection check needed
    if (feature.geometry.type === 'LineString') {
      const updatedFeature = moveLineVertex(feature, this.dragVertexIndex, newPos);
      this.context.store.update(selectedId, updatedFeature);
      this.context.render.renderFeatures();
      this.renderHandles(updatedFeature);
      return true;
    }

    const updatedFeature = moveVertex(feature, this.dragVertexIndex, newPos);

    if (hasRingSelfIntersection((updatedFeature.geometry as PolygonGeometry).coordinates[0])) {
      // If snap caused intersection, try without snap
      if (snappedPos.lng !== event.lngLat.lng || snappedPos.lat !== event.lngLat.lat) {
        const unsnappedPos: Position = [event.lngLat.lng, event.lngLat.lat];
        const unsnappedFeature = moveVertex(feature, this.dragVertexIndex, unsnappedPos);
        if (!hasRingSelfIntersection((unsnappedFeature.geometry as PolygonGeometry).coordinates[0])) {
          this.context.render.clearSnapIndicator();
          this.context.store.update(selectedId, unsnappedFeature);
          this.context.render.renderFeatures();
          this.renderHandles(unsnappedFeature);
          return true;
        }
      }
      return true;
    }

    this.context.store.update(selectedId, updatedFeature);
    this.context.render.renderFeatures();
    this.renderHandles(updatedFeature);
    return true;
  }

  updateHighlightIfNeeded(
    feature: LibreDrawFeature,
    event: NormalizedInputEvent,
  ): void {
    const isLine = feature.geometry.type === 'LineString';
    const vertices = isLine ? getLineVertices(feature) : getVertices(feature);
    const threshold = this.getThreshold(event);

    // Check vertices first (higher priority)
    const nearVertexIdx = this.findNearestVertex(vertices, event.point, threshold);

    // Check midpoints only if no vertex is near
    let nearMidIdx = -1;
    if (nearVertexIdx < 0) {
      const midpoints = isLine ? computeLineMidpoints(vertices) : computeMidpoints(vertices);
      nearMidIdx = this.findNearestPoint(midpoints, event.point, threshold);
    }

    if (nearVertexIdx !== this.highlightedVertexIndex || nearMidIdx !== this.highlightedMidpointIndex) {
      this.highlightedVertexIndex = nearVertexIdx;
      this.highlightedMidpointIndex = nearMidIdx;
      this.renderHandles(feature);
    }
  }

  deleteVertexAtPointer(
    selectedId: string,
    feature: LibreDrawFeature,
    event: NormalizedInputEvent,
  ): boolean {
    if (feature.geometry.type === 'Point') return false;
    const isLine = feature.geometry.type === 'LineString';
    const vertices = isLine ? getLineVertices(feature) : getVertices(feature);
    const minVerts = isLine ? MIN_LINE_VERTICES : MIN_VERTICES;
    const threshold = this.getThreshold(event);
    const vertexIdx = this.findNearestVertex(vertices, event.point, threshold);

    if (vertexIdx < 0 || vertices.length <= minVerts) {
      return false;
    }

    const oldFeature = cloneFeature(feature);
    const updatedFeature = isLine
      ? removeLineVertex(feature, vertexIdx)
      : removeVertex(feature, vertexIdx);

    this.context.store.update(selectedId, updatedFeature);

    const action = new UpdateAction(
      selectedId,
      oldFeature,
      cloneFeature(updatedFeature),
    );
    this.context.history.push(action);
    this.context.events.emit('update', {
      feature: cloneFeature(updatedFeature),
      oldFeature: cloneFeature(oldFeature),
    });

    this.context.render.renderFeatures();
    this.renderHandles(updatedFeature);
    return true;
  }

  renderHandles(feature: LibreDrawFeature): void {
    const isLine = feature.geometry.type === 'LineString';
    const vertices = isLine ? getLineVertices(feature) : getVertices(feature);
    const midpoints = isLine ? computeLineMidpoints(vertices) : computeMidpoints(vertices);
    this.context.render.renderVertices(
      vertices,
      midpoints,
      this.highlightedVertexIndex >= 0 ? this.highlightedVertexIndex : undefined,
      this.highlightedMidpointIndex >= 0 ? this.highlightedMidpointIndex : undefined,
    );
  }

  endDrag(): void {
    if (this.dragging) {
      this.context.setDragPan(true);
      this.context.render.clearSnapIndicator();
    }
    this.dragging = false;
    this.dragVertexIndex = -1;
    this.dragStartFeature = null;
  }

  private startDrag(
    feature: LibreDrawFeature,
    vertexIndex: number,
    // Midpoint insertion passes the pre-insert snapshot so undo restores original shape.
    startFeatureSnapshot: LibreDrawFeature = cloneFeature(feature),
  ): void {
    this.dragging = true;
    this.dragVertexIndex = vertexIndex;
    this.dragStartFeature = startFeatureSnapshot;
    // Show dragged vertex as highlighted, clear midpoint highlight
    this.highlightedVertexIndex = vertexIndex;
    this.highlightedMidpointIndex = -1;
    this.context.setDragPan(false);
  }

  private getThreshold(event: NormalizedInputEvent): number {
    return event.inputType === 'touch'
      ? HIT_THRESHOLD_TOUCH_PX
      : HIT_THRESHOLD_MOUSE_PX;
  }

  private findNearestVertex(
    vertices: Position[],
    clickPoint: { x: number; y: number },
    threshold?: number,
  ): number {
    return this.findNearestPoint(vertices, clickPoint, threshold);
  }

  private findNearestPoint(
    points: Position[],
    clickPoint: { x: number; y: number },
    threshold: number = HIT_THRESHOLD_MOUSE_PX,
  ): number {
    let minDist = Infinity;
    let minIdx = -1;

    for (let i = 0; i < points.length; i++) {
      const screenPt = this.context.getScreenPoint({
        lng: points[i][0],
        lat: points[i][1],
      });
      const dx = clickPoint.x - screenPt.x;
      const dy = clickPoint.y - screenPt.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= threshold && dist < minDist) {
        minDist = dist;
        minIdx = i;
      }
    }

    return minIdx;
  }

  /**
   * Apply snap to a drag position, excluding the currently edited feature.
   */
  private applySnapForDrag(
    lngLat: { lng: number; lat: number },
    excludeFeatureId: string,
  ): { lng: number; lat: number } {
    const snapConfig = this.context.getSnapConfig();
    if (!snapConfig.enabled) return lngLat;

    const snapTarget = findSnapTarget(
      lngLat,
      this.context.store.getAll(),
      this.context.getScreenPoint,
      {
        threshold: snapConfig.threshold ?? 10,
        excludeFeatureId,
        viewportBounds: this.context.getViewportBounds(),
      },
    );

    if (snapTarget) {
      this.context.render.renderSnapIndicator(snapTarget.position);
      return { lng: snapTarget.position[0], lat: snapTarget.position[1] };
    }

    this.context.render.clearSnapIndicator();
    return lngLat;
  }
}
