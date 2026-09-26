import type { ModeContext } from '../core/ModeContext';
import type { LibreDrawFeature, PolygonGeometry, Position } from '../types/features';
import type { NormalizedInputEvent } from '../types/input';
import { UpdateAction } from '../types/features';
import { cloneFeature } from '../utils/featureSnapshot';
import {
  computeMidpoints,
  computeLineMidpoints,
  getRingVertices,
  getLineVertices,
  insertVertex,
  insertLineVertex,
  moveVertex,
  moveLineVertex,
  removeVertex,
  removeLineVertex,
} from '../utils/geometry';
import { findPolygonRingError } from '../validation/intersection';
import { findSnapTarget } from '../utils/snap';

const HIT_THRESHOLD_MOUSE_PX = 10;
const HIT_THRESHOLD_TOUCH_PX = 24;
const MIN_VERTICES = 3;
const MIN_LINE_VERTICES = 2;

/**
 * A vertex (or, for midpoints, an edge) of a feature: the ring it belongs to
 * and its index within that ring. A LineString has only ring 0.
 */
interface RingRef {
  ring: number;
  index: number;
}

/**
 * The handles of one feature. Every ring's vertices (and midpoints) are
 * concatenated in ring order into one flat list, which is what the render
 * layer draws and what the highlight indices point into; the parallel
 * `*Refs` arrays map a flat index back to its ring and index.
 */
interface HandleLayout {
  vertices: Position[];
  vertexRefs: RingRef[];
  midpoints: Position[];
  midpointRefs: RingRef[];
}

function buildHandleLayout(feature: LibreDrawFeature): HandleLayout {
  if (feature.geometry.type === 'LineString') {
    const vertices = getLineVertices(feature);
    const midpoints = computeLineMidpoints(vertices);
    return {
      vertices,
      vertexRefs: vertices.map((_, index) => ({ ring: 0, index })),
      midpoints,
      midpointRefs: midpoints.map((_, index) => ({ ring: 0, index })),
    };
  }

  const layout: HandleLayout = { vertices: [], vertexRefs: [], midpoints: [], midpointRefs: [] };
  getRingVertices(feature).forEach((ringVertices, ring) => {
    ringVertices.forEach((vertex, index) => {
      layout.vertices.push(vertex);
      layout.vertexRefs.push({ ring, index });
    });
    computeMidpoints(ringVertices).forEach((midpoint, index) => {
      layout.midpoints.push(midpoint);
      layout.midpointRefs.push({ ring, index });
    });
  });
  return layout;
}

/** Whether a polygon's rings are valid together (no crossings, holes inside). */
function hasValidRings(feature: LibreDrawFeature): boolean {
  return findPolygonRingError((feature.geometry as PolygonGeometry).coordinates) === null;
}

/**
 * Handles vertex/midpoint interactions for the selected LineString or
 * Polygon, on every ring of a polygon (holes included).
 */
export class VertexEditor {
  private context: ModeContext;
  private dragging = false;
  private dragVertex: RingRef | null = null;
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
    event: NormalizedInputEvent
  ): boolean {
    const isLine = feature.geometry.type === 'LineString';
    const layout = buildHandleLayout(feature);
    const threshold = this.getThreshold(event);

    const vertexIdx = this.findNearestVertex(layout.vertices, event.point, threshold);
    if (vertexIdx >= 0) {
      this.startDrag(feature, layout.vertexRefs[vertexIdx], vertexIdx);
      return true;
    }

    const midIdx = this.findNearestPoint(layout.midpoints, event.point, threshold);
    if (midIdx >= 0) {
      const beforeInsert = cloneFeature(feature);
      const { ring, index } = layout.midpointRefs[midIdx];
      const inserted: RingRef = { ring, index: index + 1 };
      const midpoint = layout.midpoints[midIdx];
      const newFeature = isLine
        ? insertLineVertex(feature, inserted.index, midpoint)
        : insertVertex(feature, inserted.index, midpoint, ring);
      this.context.store.update(selectedId, newFeature);
      // Set highlight to the newly inserted vertex before rendering
      const insertedFlatIdx = buildHandleLayout(newFeature).vertexRefs.findIndex(
        (ref) => ref.ring === inserted.ring && ref.index === inserted.index
      );
      this.highlightedVertexIndex = insertedFlatIdx;
      this.highlightedMidpointIndex = -1;
      this.renderHandles(newFeature);
      this.startDrag(newFeature, inserted, insertedFlatIdx, beforeInsert);
      return true;
    }

    return false;
  }

  handleDragMove(selectedId: string, event: NormalizedInputEvent): boolean {
    if (!this.dragging || !this.dragVertex) return false;
    const { ring, index } = this.dragVertex;

    const feature = this.context.store.getById(selectedId);
    if (!feature) return true;

    // Apply snap to the drag position
    const snappedPos = this.applySnapForDrag(event.lngLat, selectedId);
    const newPos: Position = [snappedPos.lng, snappedPos.lat];

    // LineString: no self-intersection check needed
    if (feature.geometry.type === 'LineString') {
      const updatedFeature = moveLineVertex(feature, index, newPos);
      this.context.store.update(selectedId, updatedFeature);
      this.context.render.renderFeatures();
      this.renderHandles(updatedFeature);
      return true;
    }

    const updatedFeature = moveVertex(feature, index, newPos, ring);

    // A move that makes a ring cross itself or another ring, or puts a hole
    // outside the outer ring, is refused: the vertex stays where it was.
    if (!hasValidRings(updatedFeature)) {
      // If snap caused intersection, try without snap
      if (snappedPos.lng !== event.lngLat.lng || snappedPos.lat !== event.lngLat.lat) {
        const unsnappedPos: Position = [event.lngLat.lng, event.lngLat.lat];
        const unsnappedFeature = moveVertex(feature, index, unsnappedPos, ring);
        if (hasValidRings(unsnappedFeature)) {
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

  updateHighlightIfNeeded(feature: LibreDrawFeature, event: NormalizedInputEvent): void {
    const layout = buildHandleLayout(feature);
    const threshold = this.getThreshold(event);

    // Check vertices first (higher priority)
    const nearVertexIdx = this.findNearestVertex(layout.vertices, event.point, threshold);

    // Check midpoints only if no vertex is near
    let nearMidIdx = -1;
    if (nearVertexIdx < 0) {
      nearMidIdx = this.findNearestPoint(layout.midpoints, event.point, threshold);
    }

    if (
      nearVertexIdx !== this.highlightedVertexIndex ||
      nearMidIdx !== this.highlightedMidpointIndex
    ) {
      this.highlightedVertexIndex = nearVertexIdx;
      this.highlightedMidpointIndex = nearMidIdx;
      this.renderHandles(feature);
    }
  }

  deleteVertexAtPointer(
    selectedId: string,
    feature: LibreDrawFeature,
    event: NormalizedInputEvent
  ): boolean {
    if (feature.geometry.type === 'Point') return false;
    const isLine = feature.geometry.type === 'LineString';
    const layout = buildHandleLayout(feature);
    const threshold = this.getThreshold(event);
    const vertexIdx = this.findNearestVertex(layout.vertices, event.point, threshold);
    if (vertexIdx < 0) return false;

    // The minimum vertex count applies per ring.
    const { ring, index } = layout.vertexRefs[vertexIdx];
    const ringVertexCount = layout.vertexRefs.filter((ref) => ref.ring === ring).length;
    if (ringVertexCount <= (isLine ? MIN_LINE_VERTICES : MIN_VERTICES)) {
      return false;
    }

    const updatedFeature = isLine
      ? removeLineVertex(feature, index)
      : removeVertex(feature, index, ring);
    // Removing a vertex can make an edge cut across its ring or another ring.
    if (!isLine && !hasValidRings(updatedFeature)) {
      return false;
    }

    const oldFeature = cloneFeature(feature);

    this.context.store.update(selectedId, updatedFeature);

    const action = new UpdateAction(selectedId, oldFeature, cloneFeature(updatedFeature));
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
    const { vertices, midpoints } = buildHandleLayout(feature);
    this.context.render.renderVertices(
      vertices,
      midpoints,
      this.highlightedVertexIndex >= 0 ? this.highlightedVertexIndex : undefined,
      this.highlightedMidpointIndex >= 0 ? this.highlightedMidpointIndex : undefined
    );
  }

  endDrag(): void {
    if (this.dragging) {
      this.context.setDragPan(true);
      this.context.render.clearSnapIndicator();
    }
    this.dragging = false;
    this.dragVertex = null;
    this.dragStartFeature = null;
  }

  private startDrag(
    feature: LibreDrawFeature,
    vertex: RingRef,
    // Index of the vertex in the flat handle list, for the highlight.
    flatIndex: number,
    // Midpoint insertion passes the pre-insert snapshot so undo restores original shape.
    startFeatureSnapshot: LibreDrawFeature = cloneFeature(feature)
  ): void {
    this.dragging = true;
    this.dragVertex = vertex;
    this.dragStartFeature = startFeatureSnapshot;
    // Show dragged vertex as highlighted, clear midpoint highlight
    this.highlightedVertexIndex = flatIndex;
    this.highlightedMidpointIndex = -1;
    this.context.setDragPan(false);
  }

  private getThreshold(event: NormalizedInputEvent): number {
    return event.inputType === 'touch' ? HIT_THRESHOLD_TOUCH_PX : HIT_THRESHOLD_MOUSE_PX;
  }

  private findNearestVertex(
    vertices: Position[],
    clickPoint: { x: number; y: number },
    threshold?: number
  ): number {
    return this.findNearestPoint(vertices, clickPoint, threshold);
  }

  private findNearestPoint(
    points: Position[],
    clickPoint: { x: number; y: number },
    threshold: number = HIT_THRESHOLD_MOUSE_PX
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
    excludeFeatureId: string
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
      }
    );

    if (snapTarget) {
      this.context.render.renderSnapIndicator(snapTarget.position);
      return { lng: snapTarget.position[0], lat: snapTarget.position[1] };
    }

    this.context.render.clearSnapIndicator();
    return lngLat;
  }
}
