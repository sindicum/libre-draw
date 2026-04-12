import type { Mode } from './Mode';
import type { NormalizedInputEvent } from '../types/input';
import type { LibreDrawFeature } from '../types/features';
import { DeleteAction, UpdateAction } from '../types/features';
import type { ModeContext } from '../core/ModeContext';
import { cloneFeature } from '../utils/featureSnapshot';
import { SelectionManager } from './SelectionManager';
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
 * Selection and editing mode for existing polygons.
 */
export class SelectMode implements Mode {
  private context: ModeContext;
  private selection: SelectionManager;
  private vertexEditor: VertexEditor;
  private polygonDragger: PolygonDragger;
  private isActive = false;
  private pointDragState: {
    featureId: string;
    startFeature: LibreDrawFeature;
    startLngLat: { lng: number; lat: number };
  } | null = null;

  constructor(
    context: ModeContext,
    onSelectionChange?: (selectedIds: string[]) => void,
  ) {
    this.context = context;
    this.selection = new SelectionManager(context, onSelectionChange);
    this.vertexEditor = new VertexEditor(context);
    this.polygonDragger = new PolygonDragger(context, (feature) => {
      this.vertexEditor.renderHandles(feature);
    });
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
    this.forceClearSelectionState();
  }

  /**
   * Get the currently selected feature IDs.
   */
  getSelectedIds(): string[] {
    return this.selection.getSelectedIds();
  }

  /**
   * Programmatically select a feature by ID.
   */
  selectFeature(id: string): boolean {
    if (!this.isActive) return false;

    const feature = this.context.store.getById(id);
    if (!feature) return false;

    this.pointDragState = null;
    this.vertexEditor.resetInteractionState();
    this.polygonDragger.resetInteractionState();

    this.selection.selectOnly(id);
    if (feature.geometry.type !== 'Point') {
      this.vertexEditor.renderHandles(feature);
    }
    this.selection.notify();
    this.context.render.renderFeatures();
    return true;
  }

  /**
   * Test if a click is within hit threshold of a LineString feature's segments.
   */
  private isLineHit(
    feature: LibreDrawFeature,
    event: NormalizedInputEvent,
  ): boolean {
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
    b: { x: number; y: number },
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
    if (!this.selection.hasSelection()) return;

    this.forceClearSelectionState();
    this.context.render.renderFeatures();
  }

  onPointerDown(event: NormalizedInputEvent): void {
    if (!this.isActive) return;

    const selectedId = this.selection.getFirstSelectedId();
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
          if (
            this.vertexEditor.tryStartVertexDragOrInsert(feature, selectedId, event)
          ) {
            return;
          }
          // Drag entire line if clicked near it
          if (this.isLineHit(feature, event)) {
            this.polygonDragger.startDrag(feature, event.lngLat);
            return;
          }
        } else {
          if (
            this.vertexEditor.tryStartVertexDragOrInsert(feature, selectedId, event)
          ) {
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

    if (hitFeature) {
      if (this.selection.has(hitFeature.id)) {
        this.selection.remove(hitFeature.id);
        this.context.render.clearVertices();
      } else {
        this.selection.selectOnly(hitFeature.id);
        if (hitFeature.geometry.type !== 'Point') {
          this.vertexEditor.renderHandles(hitFeature);
        }
      }
    } else {
      this.selection.clear();
      this.context.render.clearVertices();
    }

    this.selection.notify();
    this.context.render.renderFeatures();
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

    const selectedId = this.selection.getFirstSelectedId();
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
      this.commitDragUpdate(
        this.pointDragState.featureId,
        this.pointDragState.startFeature,
      );
      this.pointDragState = null;
      this.context.setDragPan(true);
      return;
    }

    const vertexDragging = this.vertexEditor.isDragging();
    const polygonDragging = this.polygonDragger.isDragging();
    if (!vertexDragging && !polygonDragging) return;

    const selectedId = this.selection.getFirstSelectedId();
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
      this.commitDragUpdate(
        selectedId,
        this.polygonDragger.getDragStartFeature(),
      );
      this.polygonDragger.endDrag();
    }
  }

  onDoubleClick(event: NormalizedInputEvent): void {
    if (!this.isActive) return;

    const selectedId = this.selection.getFirstSelectedId();
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

    const selectedId = this.selection.getFirstSelectedId();
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
   * Refresh vertex/midpoint handles after external geometry changes.
   */
  refreshVertexHandles(): void {
    if (!this.isActive) return;

    const selectedId = this.selection.getFirstSelectedId();
    if (!selectedId) return;

    const feature = this.context.store.getById(selectedId);
    if (feature) {
      if (feature.geometry.type !== 'Point') {
        this.vertexEditor.renderHandles(feature);
      }
    } else {
      this.selection.remove(selectedId);
      this.context.render.clearVertices();
      this.selection.notify();
    }
  }

  /**
   * Test if a click is within hit threshold of a Point feature.
   */
  private isPointHit(
    feature: LibreDrawFeature,
    event: NormalizedInputEvent,
  ): boolean {
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
    event: NormalizedInputEvent,
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
    this.pointDragState = null;
    this.vertexEditor.resetInteractionState();
    this.polygonDragger.resetInteractionState();

    if (this.selection.clearAndNotify()) {
      this.context.render.clearVertices();
    }
  }

  private commitDragUpdate(
    selectedId: string,
    startFeature: LibreDrawFeature | null,
  ): void {
    if (!startFeature) return;

    const currentFeature = this.context.store.getById(selectedId);
    if (!currentFeature || !this.hasGeometryChanged(startFeature, currentFeature)) {
      return;
    }

    const action = new UpdateAction(
      selectedId,
      startFeature,
      cloneFeature(currentFeature),
    );
    this.context.history.push(action);
    this.context.events.emit('update', {
      feature: cloneFeature(currentFeature),
      oldFeature: cloneFeature(startFeature),
    });
  }

  private deleteSelected(): void {
    if (!this.selection.hasSelection()) return;

    const idsToDelete = this.selection.getSelectedIds();
    for (const id of idsToDelete) {
      const feature = this.context.store.getById(id);
      if (!feature) continue;

      this.context.store.remove(id);
      const action = new DeleteAction(feature);
      this.context.history.push(action);
      this.context.events.emit('delete', { feature: cloneFeature(feature) });
    }

    this.selection.clear();
    this.context.render.clearVertices();
    this.selection.notify();
    this.context.render.renderFeatures();
  }

  private hasGeometryChanged(
    before: LibreDrawFeature,
    after: LibreDrawFeature,
  ): boolean {
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
        if (
          beforeCoords[i][0] !== afterCoords[i][0] ||
          beforeCoords[i][1] !== afterCoords[i][1]
        ) {
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

        for (
          let positionIndex = 0;
          positionIndex < beforeRing.length;
          positionIndex++
        ) {
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
