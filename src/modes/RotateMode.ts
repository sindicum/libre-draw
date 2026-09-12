import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point as turfPoint } from '@turf/helpers';
import type { Mode } from './Mode';
import type { ModeContext } from '../core/ModeContext';
import type { LibreDrawFeature } from '../types/features';
import { UpdateAction } from '../types/features';
import type { NormalizedInputEvent } from '../types/input';
import { clickTolerance, pointerTravel } from '../input/gestures';
import { cloneFeature } from '../utils/featureSnapshot';
import {
  angleBetween,
  getRotationCenter,
  isNoRotation,
  rotateFeature,
  snapAngle,
} from '../utils/rotate';

/**
 * Hit threshold in pixels for selecting LineString features.
 * Same value as SelectMode / SplitMode so a line is equally easy to grab in every mode.
 */
const LINE_HIT_THRESHOLD_PX = 20;

/**
 * Angle step in degrees used while Shift is held during a drag.
 * 15° divides a full turn into 24 stops and hits the angles people actually
 * want (30°, 45°, 90°) without making free rotation feel coarse.
 */
export const SHIFT_SNAP_STEP_DEG = 15;

/**
 * Largest absolute angle accepted from the numeric input.
 * One full turn in either direction; anything beyond it is a typo, not intent.
 */
export const MAX_INPUT_ANGLE_DEG = 360;

interface DragState {
  /** Rotation axis in screen pixels, fixed at drag start. */
  centerScreen: { x: number; y: number };
  /** Pointer position at drag start; the reference ray for the angle. */
  startPoint: { x: number; y: number };
  inputType: NormalizedInputEvent['inputType'];
  /** Angle currently previewed, so pointer up can commit exactly what is shown. */
  angle: number;
}

/**
 * Mode for rotating a Polygon or LineString around its centroid.
 *
 * Two inputs share one commit path: dragging on the selected feature, and the
 * numeric angle input on the toolbar. Both preview by writing the rotated
 * feature into the store and commit as one `UpdateAction`.
 */
export class RotateMode implements Mode {
  private context: ModeContext;
  private onSelectionChange?: (hasSelection: boolean) => void;
  private isActive = false;
  private selectedFeatureId: string | null = null;
  /** Committed shape of the selection; every preview is computed from this. */
  private baseFeature: LibreDrawFeature | null = null;
  private drag: DragState | null = null;
  /** Whether a numeric-input preview currently sits in the store. */
  private previewing = false;

  constructor(context: ModeContext, onSelectionChange?: (hasSelection: boolean) => void) {
    this.context = context;
    this.onSelectionChange = onSelectionChange;
  }

  mapInteractions(): { dragPan: boolean; doubleClickZoom: boolean } {
    // Panning stays on: only a drag that starts on the selected feature turns it off.
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
    this.cancelDrag();
    this.discardPreview();
    this.clearSelection();
  }

  /**
   * Whether a feature is currently selected for rotation.
   */
  hasSelection(): boolean {
    return this.selectedFeatureId !== null;
  }

  /**
   * ID of the feature selected for rotation, or `null`.
   */
  getSelectedId(): string | null {
    return this.selectedFeatureId;
  }

  /**
   * Re-read the selected feature from the store after an external change
   * (undo / redo / setFeatures). The stored shape becomes the new rotation
   * base so that the next relative rotation starts from what is on screen;
   * a feature that has disappeared drops the selection.
   */
  refreshFromStore(): void {
    if (!this.selectedFeatureId) return;

    // The store is now the truth: forget any drag or preview without writing
    // the old base back, or the external change would be overwritten.
    this.dropTransientState();

    const feature = this.context.store.getById(this.selectedFeatureId);
    if (!feature) {
      this.dropSelection();
      return;
    }
    this.baseFeature = cloneFeature(feature);
    this.renderRotationCenter();
  }

  /**
   * Clear the selection in response to a user action (Escape, click on empty
   * space, mode change): an uncommitted preview is restored to the committed
   * shape first.
   */
  clearSelection(): void {
    this.cancelDrag();
    this.discardPreview();
    this.dropSelection();
  }

  /**
   * Forget the selection without touching the store. For callers that have
   * replaced the store contents (setFeatures), where restoring the old base
   * would clobber the new data.
   */
  dropSelection(): void {
    this.dropTransientState();
    if (!this.selectedFeatureId) return;

    this.selectedFeatureId = null;
    this.baseFeature = null;
    this.context.render.setSelectedIds([]);
    this.context.render.clearRotationCenter();
    this.context.events.emit('selectionchange', { selectedIds: [] });
    this.context.render.renderFeatures();
    this.onSelectionChange?.(false);
  }

  onPointerDown(event: NormalizedInputEvent): void {
    if (!this.isActive) return;

    const selected = this.getSelectedFeature();
    if (selected && this.isHit(selected, event)) {
      this.startDrag(event);
      return;
    }

    const hit = this.hitTest(event);
    if (hit) {
      this.selectFeature(hit);
    } else {
      this.clearSelection();
    }
  }

  onPointerMove(event: NormalizedInputEvent): void {
    if (!this.isActive || !this.drag || !this.baseFeature || !this.selectedFeatureId) return;

    let angle = angleBetween(this.drag.centerScreen, this.drag.startPoint, event.point);
    if (event.originalEvent.shiftKey) {
      angle = snapAngle(angle, SHIFT_SNAP_STEP_DEG);
    }
    this.drag.angle = angle;
    this.applyPreview(angle);
  }

  onPointerUp(event: NormalizedInputEvent): void {
    if (!this.isActive || !this.drag) return;

    const drag = this.drag;
    this.drag = null;
    this.context.setDragPan(true);

    // A press without meaningful travel is a click, not a rotation: leave
    // the shape and the history untouched.
    if (pointerTravel(drag.startPoint, event.point) < clickTolerance(drag.inputType)) {
      this.restoreBase();
      return;
    }

    this.commit(drag.angle);
  }

  onDoubleClick(_event: NormalizedInputEvent): void {
    // No-op
  }

  onLongPress(_event: NormalizedInputEvent): void {
    // No-op
  }

  onKeyDown(key: string, _event: KeyboardEvent): void {
    if (!this.isActive || key !== 'Escape') return;

    if (this.drag) {
      // Abort the drag but keep the target selected so the user can retry.
      this.cancelDrag();
      return;
    }

    this.clearSelection();
  }

  /**
   * Called by the toolbar while the angle input changes: live preview.
   * Ignored during a drag so the two inputs never fight over the store.
   */
  onAngleChange(angle: number): void {
    if (!this.isActive || this.drag || !this.selectedFeatureId) return;
    if (!this.isAcceptableInputAngle(angle)) return;

    if (isNoRotation(angle)) {
      this.discardPreview();
      return;
    }

    this.previewing = true;
    this.applyPreview(angle);
  }

  /**
   * Called by the toolbar on Enter / execute: commit a relative rotation.
   * Repeated calls stack on top of each other, one history step per call.
   */
  executeFromUi(angle: number): void {
    if (!this.isActive || this.drag || !this.selectedFeatureId) return;
    if (!this.isAcceptableInputAngle(angle)) return;

    this.previewing = false;
    this.commit(angle);
  }

  /** Select a feature and remember its committed shape as the rotation base. */
  private selectFeature(feature: LibreDrawFeature): void {
    this.discardPreview();
    this.selectedFeatureId = feature.id;
    this.baseFeature = cloneFeature(feature);
    this.context.render.setSelectedIds([feature.id]);
    this.renderRotationCenter();
    this.context.events.emit('selectionchange', { selectedIds: [feature.id] });
    this.context.render.renderFeatures();
    this.onSelectionChange?.(true);
  }

  private startDrag(event: NormalizedInputEvent): void {
    if (!this.baseFeature) return;

    // A pending numeric preview is not committed; the drag starts from the base.
    this.discardPreview();

    const centerScreen = this.context.getScreenPoint(getRotationCenter(this.baseFeature));
    this.drag = {
      centerScreen,
      startPoint: { x: event.point.x, y: event.point.y },
      inputType: event.inputType,
      angle: 0,
    };
    this.context.setDragPan(false);
  }

  /** Forget an in-progress drag and a pending preview without writing to the store. */
  private dropTransientState(): void {
    if (this.drag) {
      this.drag = null;
      this.context.setDragPan(true);
    }
    this.previewing = false;
  }

  /** Abort an in-progress drag: restore the base shape and re-enable panning. */
  private cancelDrag(): void {
    if (!this.drag) return;
    this.drag = null;
    this.context.setDragPan(true);
    this.restoreBase();
  }

  /** Drop a numeric-input preview from the store, if one is showing. */
  private discardPreview(): void {
    if (!this.previewing) return;
    this.previewing = false;
    this.restoreBase();
  }

  /** Write the rotated base into the store as a preview. */
  private applyPreview(angle: number): void {
    if (!this.baseFeature || !this.selectedFeatureId) return;
    this.context.store.update(this.selectedFeatureId, rotateFeature(this.baseFeature, angle));
    this.context.render.renderFeatures();
  }

  /** Put the committed shape back into the store. */
  private restoreBase(): void {
    if (!this.baseFeature || !this.selectedFeatureId) return;
    this.context.store.update(this.selectedFeatureId, cloneFeature(this.baseFeature));
    this.context.render.renderFeatures();
  }

  /**
   * Commit a rotation of the base by `angle`: one UpdateAction, one `rotate`
   * event, and the result becomes the new base for the next rotation.
   */
  private commit(angle: number): void {
    if (!this.baseFeature || !this.selectedFeatureId) return;

    if (isNoRotation(angle)) {
      this.restoreBase();
      return;
    }

    const rotated = rotateFeature(this.baseFeature, angle);
    this.context.store.update(this.selectedFeatureId, rotated);
    this.context.history.push(new UpdateAction(this.selectedFeatureId, this.baseFeature, rotated));
    this.context.events.emit('rotate', {
      originalFeature: cloneFeature(this.baseFeature),
      feature: cloneFeature(rotated),
      angle,
    });
    this.baseFeature = cloneFeature(rotated);
    this.context.render.renderFeatures();
  }

  /** Draw the pivot marker at the centroid of the base shape. */
  private renderRotationCenter(): void {
    if (!this.baseFeature) return;
    const { lng, lat } = getRotationCenter(this.baseFeature);
    this.context.render.renderRotationCenter([lng, lat]);
  }

  private isAcceptableInputAngle(angle: number): boolean {
    return Number.isFinite(angle) && Math.abs(angle) <= MAX_INPUT_ANGLE_DEG;
  }

  private getSelectedFeature(): LibreDrawFeature | undefined {
    if (!this.selectedFeatureId) return undefined;
    const feature = this.context.store.getById(this.selectedFeatureId);
    if (!feature) {
      // The feature left the store behind our back (setFeatures, delete, undo).
      this.dropSelection();
    }
    return feature;
  }

  /** Find the topmost rotatable feature under the pointer. Points never hit. */
  private hitTest(event: NormalizedInputEvent): LibreDrawFeature | undefined {
    const features = this.context.store.getAll();
    for (let i = features.length - 1; i >= 0; i--) {
      if (this.isHit(features[i], event)) return features[i];
    }
    return undefined;
  }

  private isHit(feature: LibreDrawFeature, event: NormalizedInputEvent): boolean {
    if (feature.geometry.type === 'Polygon') {
      return booleanPointInPolygon(
        turfPoint([event.lngLat.lng, event.lngLat.lat]),
        feature.geometry
      );
    }
    if (feature.geometry.type === 'LineString') {
      return this.isLineHit(feature.geometry.coordinates, event.point);
    }
    return false;
  }

  private isLineHit(coords: [number, number][], clickScreen: { x: number; y: number }): boolean {
    for (let i = 0; i < coords.length - 1; i++) {
      const a = this.context.getScreenPoint({ lng: coords[i][0], lat: coords[i][1] });
      const b = this.context.getScreenPoint({ lng: coords[i + 1][0], lat: coords[i + 1][1] });
      if (distanceToSegment(clickScreen, a, b) <= LINE_HIT_THRESHOLD_PX) return true;
    }
    return false;
  }
}

/** Distance from a point to a segment in screen pixels. */
function distanceToSegment(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number }
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  const t =
    lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  const px = a.x + t * dx - p.x;
  const py = a.y + t * dy - p.y;
  return Math.sqrt(px * px + py * py);
}
