import type { ModeContext } from '../core/ModeContext';
import type { LibreDrawFeature, PolygonGeometry, Position } from '../types/features';
import type { NormalizedInputEvent } from '../types/input';
import { BatchAction, UpdateAction } from '../types/features';
import type { Action } from '../types/features';
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
import { findPolygonRingError, type PolygonRingError } from '../validation/intersection';
import { roundingRejection } from '../validation/geojson';
import { findSnapTarget } from '../utils/snap';
import { findSharedVertices, insertOnSharedEdges, type VertexRef } from '../utils/sharedVertices';

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

/**
 * A polygon that a topological edit changes along with the selected one:
 * its shape before the edit (for undo), the shape the edit starts from
 * (after a midpoint insert), and its vertices at the edited position.
 */
interface LinkedFeature {
  start: LibreDrawFeature;
  base: LibreDrawFeature;
  refs: VertexRef[];
}

/** The feature with each of `refs` moved to `position`. */
function moveRefs(base: LibreDrawFeature, refs: VertexRef[], position: Position): LibreDrawFeature {
  return refs.reduce((f, ref) => moveVertex(f, ref.index, position, ref.ring), base);
}

/** The feature with each of `refs` removed, later indices first. */
function removeRefs(base: LibreDrawFeature, refs: VertexRef[]): LibreDrawFeature {
  const ordered = [...refs].sort((a, b) => a.ring - b.ring || b.index - a.index);
  return ordered.reduce((f, ref) => removeVertex(f, ref.index, ref.ring), base);
}

/** Why a polygon's rings are invalid together, or `null` when they are valid. */
function ringError(feature: LibreDrawFeature): PolygonRingError | null {
  return findPolygonRingError((feature.geometry as PolygonGeometry).coordinates);
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
  // Other polygons that move with the dragged vertex, by id.
  private linked = new Map<string, LinkedFeature>();
  // Whether this drag already reported an `editrejected`: one per drag.
  private dragRejectionReported = false;
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

  /** Shapes at drag start of the other polygons the drag moves. */
  getLinkedStartFeatures(): LibreDrawFeature[] {
    return [...this.linked.values()].map((link) => link.start);
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
      const linked = this.collectLinked(feature, layout.vertices[vertexIdx]);
      this.startDrag(
        feature,
        layout.vertexRefs[vertexIdx],
        vertexIdx,
        cloneFeature(feature),
        linked
      );
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
      const sharedStarts = isLine ? [] : this.insertOnSharedEdges(feature, ring, index, midpoint);
      this.context.store.update(selectedId, newFeature);
      // Set highlight to the newly inserted vertex before rendering
      const insertedFlatIdx = buildHandleLayout(newFeature).vertexRefs.findIndex(
        (ref) => ref.ring === inserted.ring && ref.index === inserted.index
      );
      this.highlightedVertexIndex = insertedFlatIdx;
      this.highlightedMidpointIndex = -1;
      this.renderHandles(newFeature);
      const linked = this.collectLinked(newFeature, midpoint, sharedStarts);
      if (sharedStarts.length > 0) this.context.render.renderFeatures();
      this.startDrag(newFeature, inserted, insertedFlatIdx, beforeInsert, linked);
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

    // A move that makes a ring cross itself or another ring, or puts a hole
    // outside the outer ring, is refused: the vertex stays where it was. With
    // topological editing the same holds for every polygon that moves along.
    let moved = this.moveWithLinked(selectedId, feature, ring, index, newPos);
    if (
      'error' in moved &&
      (snappedPos.lng !== event.lngLat.lng || snappedPos.lat !== event.lngLat.lat)
    ) {
      // If snap caused intersection, try without snap
      const unsnapped = this.moveWithLinked(selectedId, feature, ring, index, [
        event.lngLat.lng,
        event.lngLat.lat,
      ]);
      if (!('error' in unsnapped)) {
        this.context.render.clearSnapIndicator();
        moved = unsnapped;
      }
    }
    if ('error' in moved) {
      if (!this.dragRejectionReported) {
        this.dragRejectionReported = true;
        this.context.events.emit('editrejected', {
          action: 'move-vertex',
          reason: moved.error,
          featureId: moved.featureId,
        });
      }
      return true;
    }

    for (const [id, shape] of moved.shapes) {
      this.context.store.update(id, shape);
    }
    this.context.render.renderFeatures();
    this.renderHandles(moved.shapes.get(selectedId) as LibreDrawFeature);
    return true;
  }

  /**
   * The selected polygon and its linked polygons with the dragged vertex at
   * `position`, or the first of them that would be invalid.
   */
  private moveWithLinked(
    selectedId: string,
    feature: LibreDrawFeature,
    ring: number,
    index: number,
    position: Position
  ): { shapes: Map<string, LibreDrawFeature> } | { error: PolygonRingError; featureId: string } {
    const shapes = new Map<string, LibreDrawFeature>();
    shapes.set(selectedId, moveVertex(feature, index, position, ring));
    for (const [id, link] of this.linked) {
      shapes.set(id, moveRefs(link.base, link.refs, position));
    }
    for (const [id, shape] of shapes) {
      const error = ringError(shape);
      if (error) return { error, featureId: id };
    }
    return { shapes };
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
    const error = isLine ? null : ringError(updatedFeature);
    if (error) {
      this.context.events.emit('editrejected', {
        action: 'delete-vertex',
        reason: error,
        featureId: selectedId,
      });
      return false;
    }

    // With topological editing the vertex goes from every polygon that
    // shares it, or from none of them.
    const changes: Array<{ id: string; before: LibreDrawFeature; after: LibreDrawFeature }> = [
      { id: selectedId, before: feature, after: updatedFeature },
    ];
    const linked = isLine
      ? new Map<string, LinkedFeature>()
      : this.collectLinked(feature, layout.vertices[vertexIdx]);
    for (const [id, link] of linked) {
      const vertices = getRingVertices(link.base);
      const tooFew = link.refs.some(
        (ref) =>
          vertices[ref.ring].length - link.refs.filter((r) => r.ring === ref.ring).length <
          MIN_VERTICES
      );
      const after = tooFew ? null : removeRefs(link.base, link.refs);
      const linkedError = after ? ringError(after) : 'invalid-result';
      if (linkedError || !after) {
        this.context.events.emit('editrejected', {
          action: 'delete-vertex',
          reason: linkedError ?? 'invalid-result',
          featureId: id,
        });
        return false;
      }
      changes.push({ id, before: link.start, after });
    }

    const actions: Action[] = [];
    for (const change of changes) {
      this.context.store.update(change.id, change.after);
      actions.push(
        new UpdateAction(change.id, cloneFeature(change.before), cloneFeature(change.after))
      );
    }
    this.context.history.push(actions.length === 1 ? actions[0] : new BatchAction(actions));
    for (const change of changes) {
      this.context.events.emit('update', {
        feature: cloneFeature(change.after),
        oldFeature: cloneFeature(change.before),
      });
    }

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

  /**
   * Round the dragged shape in the store for the commit. When rounding alone
   * makes it invalid, the shape at drag start goes back into the store and
   * the refusal is reported (still at most once per drag), so the commit
   * finds nothing changed.
   */
  roundDraggedShape(selectedId: string): void {
    const current = this.context.store.getById(selectedId);
    if (!current) return;
    const dragged = new Map<string, LibreDrawFeature>([[selectedId, current]]);
    for (const id of this.linked.keys()) {
      const shape = this.context.store.getById(id);
      if (shape) dragged.set(id, shape);
    }

    for (const [id, shape] of dragged) {
      const rejection = roundingRejection(shape, this.context.round);
      if (!rejection) continue;
      // One shape that rounding breaks puts every dragged shape back.
      if (this.dragStartFeature) {
        this.context.store.update(selectedId, cloneFeature(this.dragStartFeature));
      }
      for (const [linkedId, link] of this.linked) {
        this.context.store.update(linkedId, cloneFeature(link.start));
      }
      if (!this.dragRejectionReported) {
        this.dragRejectionReported = true;
        this.context.events.emit('editrejected', {
          action: 'move-vertex',
          reason: rejection.reason,
          featureId: id,
        });
      }
      return;
    }

    for (const [id, shape] of dragged) {
      this.context.store.update(id, this.context.round.feature(shape));
    }
  }

  endDrag(): void {
    if (this.dragging) {
      this.context.setDragPan(true);
      this.context.render.clearSnapIndicator();
    }
    this.dragging = false;
    this.dragVertex = null;
    this.dragStartFeature = null;
    this.linked = new Map();
  }

  private startDrag(
    feature: LibreDrawFeature,
    vertex: RingRef,
    // Index of the vertex in the flat handle list, for the highlight.
    flatIndex: number,
    // Midpoint insertion passes the pre-insert snapshot so undo restores original shape.
    startFeatureSnapshot: LibreDrawFeature,
    linked: Map<string, LinkedFeature>
  ): void {
    this.dragging = true;
    this.dragRejectionReported = false;
    this.dragVertex = vertex;
    this.dragStartFeature = startFeatureSnapshot;
    this.linked = linked;
    // Show dragged vertex as highlighted, clear midpoint highlight
    this.highlightedVertexIndex = flatIndex;
    this.highlightedMidpointIndex = -1;
    this.context.setDragPan(false);
  }

  /**
   * The other polygons with a vertex exactly at `position`, when topological
   * editing is on and `feature` is a polygon. `starts` gives the shapes
   * before a midpoint insert, for the polygons it changed.
   */
  private collectLinked(
    feature: LibreDrawFeature,
    position: Position,
    starts: LibreDrawFeature[] = []
  ): Map<string, LinkedFeature> {
    const linked = new Map<string, LinkedFeature>();
    if (feature.geometry.type !== 'Polygon' || !this.context.isTopologicalEditing?.()) {
      return linked;
    }
    const all = this.context.store.getAll();
    for (const [id, refs] of findSharedVertices(all, feature.id, position)) {
      const base = all.find((f) => f.id === id) as LibreDrawFeature;
      const start = starts.find((f) => f.id === id) ?? base;
      linked.set(id, { start: cloneFeature(start), base: cloneFeature(base), refs });
    }
    return linked;
  }

  /**
   * Put `midpoint` into the edges of other polygons that match the edge
   * `index` of `ring` in `feature`, when topological editing is on. Returns
   * the changed polygons as they were before.
   */
  private insertOnSharedEdges(
    feature: LibreDrawFeature,
    ring: number,
    index: number,
    midpoint: Position
  ): LibreDrawFeature[] {
    if (!this.context.isTopologicalEditing?.()) return [];
    const vertices = getRingVertices(feature)[ring];
    const a = vertices[index];
    const b = vertices[(index + 1) % vertices.length];
    const starts: LibreDrawFeature[] = [];
    for (const other of this.context.store.getAll()) {
      if (other.id === feature.id) continue;
      const updated = insertOnSharedEdges(other, a, b, midpoint);
      if (!updated) continue;
      starts.push(cloneFeature(other));
      this.context.store.update(other.id, updated);
    }
    return starts;
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

    // Polygons that move with the drag are not targets: their vertex at the
    // dragged position would hold the drag in place.
    const snapTarget = findSnapTarget(
      lngLat,
      this.context.store.getAll().filter((f) => !this.linked.has(f.id)),
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
