import type { MapInteractionConfig, Mode } from './Mode';
import type { NormalizedInputEvent } from '../types/input';
import type { LibreDrawFeature } from '../types/features';
import type { Action } from '../types/features';
import { BatchAction, DeleteAction, UpdateAction } from '../types/features';
import type { ModeContext } from '../core/ModeContext';
import { cloneFeature } from '../utils/featureSnapshot';
import { moveLine, movePolygon } from '../utils/geometry';
import { VertexEditor } from './VertexEditor';
import { PolygonDragger } from './PolygonDragger';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point as turfPoint } from '@turf/helpers';

/**
 * Hit threshold in pixels for selecting Point features.
 */
const POINT_HIT_THRESHOLD_PX = 20;

/**
 * Hit threshold in pixels for selecting LineString features.
 */
const LINE_HIT_THRESHOLD_PX = 20;

/**
 * Whether the pointer event carries a modifier that adds to / toggles the
 * selection instead of replacing it (Shift, Ctrl, or Cmd).
 */
function isAdditive(event: NormalizedInputEvent): boolean {
  const e = event.originalEvent as MouseEvent;
  return Boolean(e.shiftKey || e.ctrlKey || e.metaKey);
}

/** Move any feature by a longitude / latitude delta. */
function translateFeature(feature: LibreDrawFeature, dLng: number, dLat: number): LibreDrawFeature {
  if (feature.geometry.type === 'Point') {
    const [lng, lat] = feature.geometry.coordinates;
    return { ...feature, geometry: { type: 'Point', coordinates: [lng + dLng, lat + dLat] } };
  }
  if (feature.geometry.type === 'LineString') return moveLine(feature, dLng, dLat);
  return movePolygon(feature, dLng, dLat);
}

/**
 * Selection and editing mode for existing features.
 *
 * A plain click selects one feature; Shift / Ctrl / Cmd + click adds it to or
 * removes it from the shared selection. With one feature selected, its
 * vertices and body can be dragged; with several, a drag on any of them moves
 * them all by the same delta, and Delete removes them all as one history step.
 */
export class SelectMode implements Mode {
  private context: ModeContext;
  private onSelectionChangeCallback?: (selectedIds: string[]) => void;
  private vertexEditor: VertexEditor;
  private polygonDragger: PolygonDragger;
  private isActive = false;
  private pointDragState: {
    featureId: string;
    startFeature: LibreDrawFeature;
    startLngLat: { lng: number; lat: number };
  } | null = null;
  /** Whole-selection drag with two or more features selected. */
  private groupDragState: {
    startFeatures: LibreDrawFeature[];
    startLngLat: { lng: number; lat: number };
  } | null = null;

  constructor(context: ModeContext, onSelectionChange?: (selectedIds: string[]) => void) {
    this.context = context;
    this.onSelectionChangeCallback = onSelectionChange;
    this.vertexEditor = new VertexEditor(context);
    this.polygonDragger = new PolygonDragger(context, (feature) => {
      this.vertexEditor.renderHandles(feature);
    });
  }

  mapInteractions(): MapInteractionConfig {
    return {
      dragPan: true,
      doubleClickZoom: false,
      // Shift + click adds to the selection. With box zoom on, a click whose
      // release lands even 1px away from the press zooms to that tiny box.
      boxZoom: false,
    };
  }

  activate(): void {
    this.isActive = true;
  }

  deactivate(): void {
    this.isActive = false;
    this.forceClearSelectionState();
  }

  /**
   * Get the currently selected feature IDs.
   */
  getSelectedIds(): string[] {
    return this.context.selection.getSelectedIds();
  }

  /**
   * Bring handles and in-progress drags in line with the shared selection.
   * Runs after every selection change while this mode is active, whether the
   * change came from a click here or from the public API.
   */
  onSelectionChange(selectedIds: string[]): void {
    // This mode never changes the selection mid-drag, so a drag still in
    // progress here was interrupted from outside: undo its preview.
    this.abortInteraction();
    this.syncHandles();
    this.onSelectionChangeCallback?.(selectedIds);
  }

  /**
   * Programmatically select a feature by ID.
   */
  selectFeature(id: string): boolean {
    if (!this.isActive) return false;

    return this.selectFeatures([id]);
  }

  /**
   * Programmatically replace the selection with `ids`. Every id must exist.
   */
  selectFeatures(ids: string[]): boolean {
    if (!this.isActive) return false;
    if (ids.length === 0 || ids.some((id) => !this.context.store.getById(id))) return false;

    this.abortInteraction();
    if (!this.context.selection.set(ids)) {
      // Same selection: the handles were already right, but the abort above
      // dropped their highlight.
      this.syncHandles();
    }
    return true;
  }

  /**
   * Test if a click is within hit threshold of a LineString feature's segments.
   */
  private isLineHit(feature: LibreDrawFeature, event: NormalizedInputEvent): boolean {
    if (feature.geometry.type !== 'LineString') return false;
    const coords = feature.geometry.coordinates;
    const clickScreen = this.context.getScreenPoint(event.lngLat);

    for (let i = 0; i < coords.length - 1; i++) {
      const aScreen = this.context.getScreenPoint({
        lng: coords[i][0],
        lat: coords[i][1],
      });
      const bScreen = this.context.getScreenPoint({
        lng: coords[i + 1][0],
        lat: coords[i + 1][1],
      });
      const dist = this.distanceToSegment(clickScreen, aScreen, bScreen);
      if (dist <= LINE_HIT_THRESHOLD_PX) return true;
    }
    return false;
  }

  /**
   * Calculate the distance from a point to a line segment in screen pixels.
   */
  private distanceToSegment(
    p: { x: number; y: number },
    a: { x: number; y: number },
    b: { x: number; y: number }
  ): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) {
      const ddx = p.x - a.x;
      const ddy = p.y - a.y;
      return Math.sqrt(ddx * ddx + ddy * ddy);
    }
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
    const projX = a.x + t * dx;
    const projY = a.y + t * dy;
    const ddx = p.x - projX;
    const ddy = p.y - projY;
    return Math.sqrt(ddx * ddx + ddy * ddy);
  }

  /**
   * Programmatically clear the current selection.
   * Public API keeps the active-mode guard.
   */
  clearSelection(): void {
    if (!this.isActive) return;
    if (this.context.selection.size === 0) return;

    this.forceClearSelectionState();
  }

  onPointerDown(event: NormalizedInputEvent): void {
    if (!this.isActive) return;

    if (isAdditive(event)) {
      this.toggleAt(event);
      return;
    }

    const selectedId = this.context.selection.getSingleId();
    if (selectedId) {
      const feature = this.context.store.getById(selectedId);
      if (feature) {
        // Point feature: start drag if clicked near it
        if (feature.geometry.type === 'Point') {
          if (this.isPointHit(feature, event)) {
            this.pointDragState = {
              featureId: selectedId,
              startFeature: cloneFeature(feature),
              startLngLat: event.lngLat,
            };
            this.context.setDragPan(false);
            return;
          }
        } else if (feature.geometry.type === 'LineString') {
          if (this.vertexEditor.tryStartVertexDragOrInsert(feature, selectedId, event)) {
            return;
          }
          // Drag entire line if clicked near it
          if (this.isLineHit(feature, event)) {
            this.polygonDragger.startDrag(feature, event.lngLat);
            return;
          }
        } else {
          if (this.vertexEditor.tryStartVertexDragOrInsert(feature, selectedId, event)) {
            return;
          }

          const bodyClick = turfPoint([event.lngLat.lng, event.lngLat.lat]);
          if (booleanPointInPolygon(bodyClick, feature.geometry)) {
            this.polygonDragger.startDrag(feature, event.lngLat);
            return;
          }
        }
      }
    }

    this.vertexEditor.clearHighlight();

    const features = this.context.store.getAll();
    const hitFeature = this.findHitFeature(features, event);
    const selection = this.context.selection;

    if (hitFeature && selection.size > 1 && selection.has(hitFeature.id)) {
      this.startGroupDrag(event);
      return;
    }

    if (hitFeature) {
      if (selection.has(hitFeature.id)) {
        selection.remove(hitFeature.id);
      } else {
        selection.set([hitFeature.id]);
      }
    } else {
      selection.clear();
    }
  }

  onPointerMove(event: NormalizedInputEvent): void {
    if (!this.isActive) return;

    // Handle point dragging
    if (this.pointDragState) {
      const feature = this.context.store.getById(this.pointDragState.featureId);
      if (feature && feature.geometry.type === 'Point') {
        const updated: LibreDrawFeature = {
          ...feature,
          geometry: {
            type: 'Point',
            coordinates: [event.lngLat.lng, event.lngLat.lat],
          },
        };
        this.context.store.update(this.pointDragState.featureId, updated);
        this.context.render.renderFeatures();
      }
      return;
    }

    if (this.groupDragState) {
      const { startFeatures, startLngLat } = this.groupDragState;
      const dLng = event.lngLat.lng - startLngLat.lng;
      const dLat = event.lngLat.lat - startLngLat.lat;
      for (const start of startFeatures) {
        this.context.store.update(start.id, translateFeature(start, dLng, dLat));
      }
      this.context.render.renderFeatures();
      return;
    }

    const selectedId = this.context.selection.getSingleId();
    if (!selectedId) return;

    if (this.vertexEditor.handleDragMove(selectedId, event)) return;
    if (this.polygonDragger.handleDragMove(selectedId, event)) return;

    const feature = this.context.store.getById(selectedId);
    if (!feature) return;

    if (feature.geometry.type !== 'Point') {
      this.vertexEditor.updateHighlightIfNeeded(feature, event);
    }
  }

  onPointerUp(_event: NormalizedInputEvent): void {
    if (!this.isActive) return;

    // Handle point drag end
    if (this.pointDragState) {
      this.commitDragUpdate(this.pointDragState.featureId, this.pointDragState.startFeature);
      this.pointDragState = null;
      this.context.setDragPan(true);
      return;
    }

    if (this.groupDragState) {
      this.commitGroupDrag(this.groupDragState.startFeatures);
      this.groupDragState = null;
      this.context.setDragPan(true);
      return;
    }

    const vertexDragging = this.vertexEditor.isDragging();
    const polygonDragging = this.polygonDragger.isDragging();
    if (!vertexDragging && !polygonDragging) return;

    const selectedId = this.context.selection.getSingleId();
    if (!selectedId) {
      this.vertexEditor.endDrag();
      this.polygonDragger.endDrag();
      return;
    }

    if (vertexDragging) {
      this.commitDragUpdate(selectedId, this.vertexEditor.getDragStartFeature());
      this.vertexEditor.endDrag();
      return;
    }

    if (polygonDragging) {
      this.commitDragUpdate(selectedId, this.polygonDragger.getDragStartFeature());
      this.polygonDragger.endDrag();
    }
  }

  onDoubleClick(event: NormalizedInputEvent): void {
    if (!this.isActive) return;

    const selectedId = this.context.selection.getSingleId();
    if (!selectedId) return;

    const feature = this.context.store.getById(selectedId);
    if (!feature) return;

    if (this.vertexEditor.deleteVertexAtPointer(selectedId, feature, event)) {
      event.originalEvent.preventDefault();
      event.originalEvent.stopPropagation();
    }
  }

  onLongPress(event: NormalizedInputEvent): void {
    if (!this.isActive) return;

    const selectedId = this.context.selection.getSingleId();
    if (!selectedId) return;

    const feature = this.context.store.getById(selectedId);
    if (!feature) return;

    this.vertexEditor.deleteVertexAtPointer(selectedId, feature, event);
  }

  onKeyDown(key: string, _event: KeyboardEvent): void {
    if (!this.isActive) return;

    if (key === 'Delete' || key === 'Backspace') {
      this.deleteSelected();
    }
  }

  /**
   * Re-read the selection after the store changed behind this mode's back
   * (undo / redo, API operations, a style reload): drop ids that left the
   * store and redraw the handles from the current shape.
   */
  refreshFromStore(): void {
    if (!this.isActive) return;

    // The store is now the truth: drop any drag without writing its start
    // shape back, or the external change would be overwritten.
    this.resetInteractionState();

    const store = this.context.store;
    // A shrinking selection redraws the handles through onSelectionChange.
    if (!this.context.selection.retain((id) => store.getById(id) !== undefined)) {
      this.syncHandles();
    }
  }

  /**
   * Refresh vertex/midpoint handles after external geometry changes.
   */
  refreshVertexHandles(): void {
    this.refreshFromStore();
  }

  /**
   * Delete every selected feature: one `DeleteAction` for a single feature,
   * one `BatchAction` for several, and a `delete` event per feature.
   */
  deleteSelected(): void {
    if (!this.isActive) return;
    const selection = this.context.selection;
    if (selection.size === 0) return;

    // Undo a drag preview first, so the history records the committed shapes.
    this.abortInteraction();
    const actions: Action[] = [];
    for (const id of selection.getSelectedIds()) {
      const feature = this.context.store.getById(id);
      if (!feature) continue;

      this.context.store.remove(id);
      actions.push(new DeleteAction(feature));
      this.context.events.emit('delete', { feature: cloneFeature(feature) });
    }
    if (actions.length === 1) {
      this.context.history.push(actions[0]);
    } else if (actions.length > 1) {
      this.context.history.push(new BatchAction(actions));
    }

    selection.clear();
  }

  /** Shift / Ctrl / Cmd + click: add the hit feature to the selection, or take it out. */
  private toggleAt(event: NormalizedInputEvent): void {
    const hitFeature = this.findHitFeature(this.context.store.getAll(), event);
    if (!hitFeature) return;

    this.abortInteraction();
    this.context.selection.toggle(hitFeature.id);
  }

  private startGroupDrag(event: NormalizedInputEvent): void {
    const startFeatures: LibreDrawFeature[] = [];
    for (const id of this.context.selection.getSelectedIds()) {
      const feature = this.context.store.getById(id);
      if (feature) startFeatures.push(feature);
    }
    this.groupDragState = { startFeatures, startLngLat: event.lngLat };
    this.context.setDragPan(false);
  }

  /**
   * Record a whole-selection drag as one `BatchAction` of `UpdateAction`s,
   * with an `update` event per moved feature. A drag that moved nothing
   * leaves the history untouched.
   */
  private commitGroupDrag(startFeatures: LibreDrawFeature[]): void {
    const actions: Action[] = [];
    for (const start of startFeatures) {
      const current = this.context.store.getById(start.id);
      if (!current || !this.hasGeometryChanged(start, current)) continue;

      actions.push(new UpdateAction(start.id, start, cloneFeature(current)));
      this.context.events.emit('update', {
        feature: cloneFeature(current),
        oldFeature: cloneFeature(start),
      });
    }
    if (actions.length > 0) {
      this.context.history.push(new BatchAction(actions));
    }
  }

  /** Vertex handles are shown for exactly one selected LineString / Polygon. */
  private syncHandles(): void {
    const id = this.context.selection.getSingleId();
    const feature = id !== undefined ? this.context.store.getById(id) : undefined;
    if (feature && feature.geometry.type !== 'Point') {
      this.vertexEditor.renderHandles(feature);
    } else {
      this.context.render.clearVertices();
    }
  }

  /**
   * Cancel an in-progress drag: put every dragged feature back to its shape
   * at drag start (the preview lives in the store), then forget the drag.
   * Nothing reaches the history or the event stream.
   */
  private abortInteraction(): void {
    const starts: LibreDrawFeature[] = [];
    if (this.pointDragState) starts.push(this.pointDragState.startFeature);
    if (this.groupDragState) starts.push(...this.groupDragState.startFeatures);
    const vertexStart = this.vertexEditor.isDragging()
      ? this.vertexEditor.getDragStartFeature()
      : null;
    if (vertexStart) starts.push(vertexStart);
    const bodyStart = this.polygonDragger.isDragging()
      ? this.polygonDragger.getDragStartFeature()
      : null;
    if (bodyStart) starts.push(bodyStart);

    this.resetInteractionState();

    const store = this.context.store;
    const restored = starts.filter((start) => store.getById(start.id) !== undefined);
    for (const start of restored) {
      store.update(start.id, cloneFeature(start));
    }
    if (restored.length > 0) {
      this.context.render.renderFeatures();
    }
  }

  /** Forget every in-progress drag without touching the store. */
  private resetInteractionState(): void {
    if (this.pointDragState || this.groupDragState) {
      this.context.setDragPan(true);
    }
    this.pointDragState = null;
    this.groupDragState = null;
    this.vertexEditor.resetInteractionState();
    this.polygonDragger.resetInteractionState();
  }

  /**
   * Test if a click is within hit threshold of a Point feature.
   */
  private isPointHit(feature: LibreDrawFeature, event: NormalizedInputEvent): boolean {
    if (feature.geometry.type !== 'Point') return false;
    const coords = feature.geometry.coordinates;
    const featureScreen = this.context.getScreenPoint({
      lng: coords[0],
      lat: coords[1],
    });
    const clickScreen = this.context.getScreenPoint(event.lngLat);
    const dx = clickScreen.x - featureScreen.x;
    const dy = clickScreen.y - featureScreen.y;
    return Math.sqrt(dx * dx + dy * dy) <= POINT_HIT_THRESHOLD_PX;
  }

  /**
   * Find the topmost feature hit by a click/tap.
   * Supports both Point (distance-based) and Polygon (point-in-polygon) features.
   */
  private findHitFeature(
    features: LibreDrawFeature[],
    event: NormalizedInputEvent
  ): LibreDrawFeature | undefined {
    // Iterate from top (last) to bottom (first) for correct z-order
    for (let i = features.length - 1; i >= 0; i--) {
      const feature = features[i];
      if (feature.geometry.type === 'Point') {
        if (this.isPointHit(feature, event)) return feature;
      } else if (feature.geometry.type === 'LineString') {
        if (this.isLineHit(feature, event)) return feature;
      } else {
        const clickPoint = turfPoint([event.lngLat.lng, event.lngLat.lat]);
        if (booleanPointInPolygon(clickPoint, feature.geometry)) return feature;
      }
    }
    return undefined;
  }

  private forceClearSelectionState(): void {
    this.abortInteraction();
    this.context.selection.clear();
  }

  private commitDragUpdate(selectedId: string, startFeature: LibreDrawFeature | null): void {
    if (!startFeature) return;

    const currentFeature = this.context.store.getById(selectedId);
    if (!currentFeature || !this.hasGeometryChanged(startFeature, currentFeature)) {
      return;
    }

    const action = new UpdateAction(selectedId, startFeature, cloneFeature(currentFeature));
    this.context.history.push(action);
    this.context.events.emit('update', {
      feature: cloneFeature(currentFeature),
      oldFeature: cloneFeature(startFeature),
    });
  }

  private hasGeometryChanged(before: LibreDrawFeature, after: LibreDrawFeature): boolean {
    if (before.geometry.type !== after.geometry.type) return true;

    if (before.geometry.type === 'Point' && after.geometry.type === 'Point') {
      return (
        before.geometry.coordinates[0] !== after.geometry.coordinates[0] ||
        before.geometry.coordinates[1] !== after.geometry.coordinates[1]
      );
    }

    if (before.geometry.type === 'LineString' && after.geometry.type === 'LineString') {
      const beforeCoords = before.geometry.coordinates;
      const afterCoords = after.geometry.coordinates;
      if (beforeCoords.length !== afterCoords.length) return true;
      for (let i = 0; i < beforeCoords.length; i++) {
        if (beforeCoords[i][0] !== afterCoords[i][0] || beforeCoords[i][1] !== afterCoords[i][1]) {
          return true;
        }
      }
      return false;
    }

    if (before.geometry.type === 'Polygon' && after.geometry.type === 'Polygon') {
      const beforeCoords = before.geometry.coordinates;
      const afterCoords = after.geometry.coordinates;

      if (beforeCoords.length !== afterCoords.length) return true;

      for (let ringIndex = 0; ringIndex < beforeCoords.length; ringIndex++) {
        const beforeRing = beforeCoords[ringIndex];
        const afterRing = afterCoords[ringIndex];
        if (beforeRing.length !== afterRing.length) return true;

        for (let positionIndex = 0; positionIndex < beforeRing.length; positionIndex++) {
          if (
            beforeRing[positionIndex][0] !== afterRing[positionIndex][0] ||
            beforeRing[positionIndex][1] !== afterRing[positionIndex][1]
          ) {
            return true;
          }
        }
      }
    }

    return false;
  }
}
