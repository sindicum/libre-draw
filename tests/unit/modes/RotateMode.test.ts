import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ModeContext } from '../../../src/core/ModeContext';
import { RotateMode, SHIFT_SNAP_STEP_DEG } from '../../../src/modes/RotateMode';
import { UpdateAction } from '../../../src/types/features';
import type { LibreDrawFeature, Position } from '../../../src/types/features';
import type { NormalizedInputEvent } from '../../../src/types/input';
import { getRotationCenter } from '../../../src/utils/rotate';

// The harness maps lng/lat to screen as (lng * 10, lat * 10). Features sit
// near the equator so Mercator distortion is negligible in the assertions.
const SCREEN_SCALE = 10;

function makeSquare(id = 'sq'): LibreDrawFeature {
  return {
    id,
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [4, 0],
          [4, 4],
          [0, 4],
          [0, 0],
        ],
      ],
    },
    properties: { name: id },
  };
}

function makeLine(id = 'ln'): LibreDrawFeature {
  return {
    id,
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: [
        [10, 0],
        [14, 0],
      ],
    },
    properties: {},
  };
}

function makePoint(id = 'pt'): LibreDrawFeature {
  return {
    id,
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [20, 0] },
    properties: {},
  };
}

function pointerEvent(
  lng: number,
  lat: number,
  options: { shiftKey?: boolean; inputType?: 'mouse' | 'touch' } = {}
): NormalizedInputEvent {
  return {
    lngLat: { lng, lat },
    point: { x: lng * SCREEN_SCALE, y: lat * SCREEN_SCALE },
    originalEvent: new MouseEvent('mousedown', { shiftKey: options.shiftKey ?? false }),
    inputType: options.inputType ?? 'mouse',
  };
}

/** Screen position at a given angle (degrees, clockwise, y-down) and radius around a center. */
function around(
  center: { lng: number; lat: number },
  angleDeg: number,
  radiusDeg: number,
  options: { shiftKey?: boolean; inputType?: 'mouse' | 'touch' } = {}
): NormalizedInputEvent {
  const rad = (angleDeg * Math.PI) / 180;
  return pointerEvent(
    center.lng + radiusDeg * Math.cos(rad),
    center.lat + radiusDeg * Math.sin(rad),
    options
  );
}

interface Harness {
  context: ModeContext;
  features: Map<string, LibreDrawFeature>;
  mocks: {
    update: ReturnType<typeof vi.fn>;
    push: ReturnType<typeof vi.fn>;
    emit: ReturnType<typeof vi.fn>;
    renderFeatures: ReturnType<typeof vi.fn>;
    setSelectedIds: ReturnType<typeof vi.fn>;
    setDragPan: ReturnType<typeof vi.fn>;
    renderRotationCenter: ReturnType<typeof vi.fn>;
    clearRotationCenter: ReturnType<typeof vi.fn>;
  };
}

function createHarness(initial: LibreDrawFeature[] = [makeSquare()]): Harness {
  const features = new Map<string, LibreDrawFeature>();
  for (const f of initial) features.set(f.id, f);

  const update = vi.fn((id: string, f: LibreDrawFeature) => {
    features.set(id, f);
  });
  const push = vi.fn();
  const emit = vi.fn();
  const renderFeatures = vi.fn();
  const setSelectedIds = vi.fn();
  const setDragPan = vi.fn();
  const renderRotationCenter = vi.fn();
  const clearRotationCenter = vi.fn();

  const context: ModeContext = {
    store: {
      add: vi.fn((f: LibreDrawFeature) => {
        features.set(f.id, f);
        return f;
      }),
      update,
      remove: vi.fn((id: string) => {
        const found = features.get(id);
        features.delete(id);
        return found;
      }),
      getById: (id: string) => features.get(id),
      getAll: () => Array.from(features.values()),
    },
    history: { push },
    events: { emit },
    render: {
      renderFeatures,
      renderPreview: vi.fn(),
      clearPreview: vi.fn(),
      renderEdgeHighlight: vi.fn(),
      clearEdgeHighlight: vi.fn(),
      renderVertices: vi.fn(),
      clearVertices: vi.fn(),
      setSelectedIds,
      renderSnapIndicator: vi.fn(),
      clearSnapIndicator: vi.fn(),
      renderRotationCenter,
      clearRotationCenter,
    },
    getScreenPoint: ({ lng, lat }) => ({ x: lng * SCREEN_SCALE, y: lat * SCREEN_SCALE }),
    setDragPan,
    getSetbackDistance: () => 10,
    getSnapConfig: () => ({ enabled: true, threshold: 10 }),
    getViewportBounds: () => ({ west: -180, south: -90, east: 180, north: 90 }),
  };

  return {
    context,
    features,
    mocks: {
      update,
      push,
      emit,
      renderFeatures,
      setSelectedIds,
      setDragPan,
      renderRotationCenter,
      clearRotationCenter,
    },
  };
}

function ring(feature: LibreDrawFeature | undefined): Position[] {
  if (!feature || feature.geometry.type !== 'Polygon') throw new Error('not a polygon');
  return feature.geometry.coordinates[0];
}

function expectRing(actual: Position[], expected: Position[], digits = 4): void {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((pos, i) => {
    expect(pos[0]).toBeCloseTo(expected[i][0], digits);
    expect(pos[1]).toBeCloseTo(expected[i][1], digits);
  });
}

/** Compare polygon rings as vertex sets: a 90° turn of a square keeps the shape but shifts the order. */
function expectSameVertices(actual: Position[], expected: Position[], digits = 2): void {
  // Round first so that -0.000001 and 0 print the same.
  const round = (n: number) => Number(n.toFixed(digits)) + 0;
  const key = (pos: Position) => `${round(pos[0])},${round(pos[1])}`;
  const normalize = (r: Position[]) =>
    r
      .slice(0, r.length - 1)
      .map(key)
      .sort();
  expect(normalize(actual)).toEqual(normalize(expected));
}

function rotateEvents(harness: Harness) {
  return harness.mocks.emit.mock.calls.filter(([type]) => type === 'rotate');
}

describe('RotateMode', () => {
  let harness: Harness;
  let mode: RotateMode;
  let onSelectionChange: ReturnType<typeof vi.fn>;
  const squareCenter = getRotationCenter(makeSquare());

  beforeEach(() => {
    harness = createHarness();
    onSelectionChange = vi.fn();
    mode = new RotateMode(harness.context, onSelectionChange);
    mode.activate();
  });

  it('keeps map panning enabled and disables double-click zoom', () => {
    expect(mode.mapInteractions()).toEqual({ dragPan: true, doubleClickZoom: false });
  });

  describe('selection', () => {
    it('selects a polygon on click and notifies', () => {
      mode.onPointerDown(pointerEvent(2, 2));

      expect(mode.getSelectedId()).toBe('sq');
      expect(harness.mocks.setSelectedIds).toHaveBeenCalledWith(['sq']);
      expect(harness.mocks.emit).toHaveBeenCalledWith('selectionchange', { selectedIds: ['sq'] });
      expect(onSelectionChange).toHaveBeenCalledWith(true);
    });

    it('selects a line when clicking near a segment', () => {
      harness = createHarness([makeLine()]);
      mode = new RotateMode(harness.context, onSelectionChange);
      mode.activate();

      mode.onPointerDown(pointerEvent(12, 0.5));

      expect(mode.getSelectedId()).toBe('ln');
    });

    it('does not select a line when clicking far from it', () => {
      harness = createHarness([makeLine()]);
      mode = new RotateMode(harness.context, onSelectionChange);
      mode.activate();

      mode.onPointerDown(pointerEvent(12, 5));

      expect(mode.getSelectedId()).toBeNull();
    });

    it('never selects a point', () => {
      harness = createHarness([makePoint()]);
      mode = new RotateMode(harness.context, onSelectionChange);
      mode.activate();

      mode.onPointerDown(pointerEvent(20, 0));

      expect(mode.getSelectedId()).toBeNull();
      expect(onSelectionChange).not.toHaveBeenCalled();
    });

    it('clears the selection when clicking empty space', () => {
      mode.onPointerDown(pointerEvent(2, 2));
      mode.onPointerDown(pointerEvent(50, 50));

      expect(mode.getSelectedId()).toBeNull();
      expect(harness.mocks.setSelectedIds).toHaveBeenLastCalledWith([]);
      expect(onSelectionChange).toHaveBeenLastCalledWith(false);
    });

    it('switches selection to another feature', () => {
      harness = createHarness([makeSquare(), makeLine()]);
      mode = new RotateMode(harness.context, onSelectionChange);
      mode.activate();

      mode.onPointerDown(pointerEvent(2, 2));
      mode.onPointerDown(pointerEvent(12, 0));

      expect(mode.getSelectedId()).toBe('ln');
    });

    it('ignores input while inactive', () => {
      mode.deactivate();
      mode.onPointerDown(pointerEvent(2, 2));

      expect(mode.getSelectedId()).toBeNull();
    });
  });

  describe('drag rotation', () => {
    beforeEach(() => {
      mode.onPointerDown(pointerEvent(2, 2));
      harness.mocks.update.mockClear();
      harness.mocks.setDragPan.mockClear();
    });

    it('disables panning while dragging on the selection and restores it after', () => {
      mode.onPointerDown(around(squareCenter, 0, 1));
      expect(harness.mocks.setDragPan).toHaveBeenLastCalledWith(false);

      mode.onPointerMove(around(squareCenter, 45, 1));
      mode.onPointerUp(around(squareCenter, 45, 1));
      expect(harness.mocks.setDragPan).toHaveBeenLastCalledWith(true);
    });

    it('previews the rotation on move and commits it on release', () => {
      mode.onPointerDown(around(squareCenter, 0, 1));
      mode.onPointerMove(around(squareCenter, 90, 1));

      // Preview: the square is rotated in the store but nothing is in history yet.
      expect(harness.mocks.update).toHaveBeenCalled();
      expect(harness.mocks.push).not.toHaveBeenCalled();

      mode.onPointerUp(around(squareCenter, 90, 1));

      expect(harness.mocks.push).toHaveBeenCalledTimes(1);
      const action = harness.mocks.push.mock.calls[0][0] as UpdateAction;
      expect(action).toBeInstanceOf(UpdateAction);
      expect(action.id).toBe('sq');
      expectRing(ring(action.oldFeature), ring(makeSquare()));
      // A 90° turn of an axis-aligned square yields the same square.
      expectSameVertices(ring(harness.features.get('sq')), ring(makeSquare()));

      const [, payload] = rotateEvents(harness)[0];
      expect(payload.angle).toBeCloseTo(90, 6);
      expect(payload.originalFeature.id).toBe('sq');
      expect(payload.feature.id).toBe('sq');
    });

    it('rotates counter-clockwise for a counter-clockwise drag', () => {
      mode.onPointerDown(around(squareCenter, 0, 1));
      mode.onPointerMove(around(squareCenter, -30, 1));
      mode.onPointerUp(around(squareCenter, -30, 1));

      expect(rotateEvents(harness)[0][1].angle).toBeCloseTo(-30, 6);
    });

    it('snaps to 15° steps while Shift is held', () => {
      mode.onPointerDown(around(squareCenter, 0, 1));
      mode.onPointerMove(around(squareCenter, 37, 1, { shiftKey: true }));
      mode.onPointerUp(around(squareCenter, 37, 1, { shiftKey: true }));

      expect(rotateEvents(harness)[0][1].angle).toBe(SHIFT_SNAP_STEP_DEG * 2);
    });

    it('treats a press without travel as a click: no history, shape restored', () => {
      mode.onPointerDown(around(squareCenter, 0, 1));
      mode.onPointerMove(pointerEvent(squareCenter.lng + 1.0001, squareCenter.lat));
      mode.onPointerUp(pointerEvent(squareCenter.lng + 1.0001, squareCenter.lat));

      expect(harness.mocks.push).not.toHaveBeenCalled();
      expect(rotateEvents(harness)).toHaveLength(0);
      expectRing(ring(harness.features.get('sq')), ring(makeSquare()), 9);
      expect(mode.getSelectedId()).toBe('sq');
    });

    it('uses the wider tap tolerance for touch', () => {
      // 0.5° = 5px at this scale: beyond the mouse tolerance, inside the touch tolerance.
      mode.onPointerDown(around(squareCenter, 0, 1, { inputType: 'touch' }));
      mode.onPointerMove(pointerEvent(squareCenter.lng + 1, squareCenter.lat + 0.5));
      mode.onPointerUp(pointerEvent(squareCenter.lng + 1, squareCenter.lat + 0.5));

      expect(harness.mocks.push).not.toHaveBeenCalled();
    });

    it('restores the shape and keeps the selection on Escape during a drag', () => {
      mode.onPointerDown(around(squareCenter, 0, 1));
      mode.onPointerMove(around(squareCenter, 60, 1));
      mode.onKeyDown('Escape', new KeyboardEvent('keydown'));

      expectRing(ring(harness.features.get('sq')), ring(makeSquare()), 9);
      expect(harness.mocks.push).not.toHaveBeenCalled();
      expect(harness.mocks.setDragPan).toHaveBeenLastCalledWith(true);
      expect(mode.getSelectedId()).toBe('sq');

      // The aborted drag must not commit on a later pointer up.
      mode.onPointerUp(around(squareCenter, 60, 1));
      expect(harness.mocks.push).not.toHaveBeenCalled();
    });

    it('clears the selection on Escape outside a drag', () => {
      mode.onKeyDown('Escape', new KeyboardEvent('keydown'));

      expect(mode.getSelectedId()).toBeNull();
      expect(onSelectionChange).toHaveBeenLastCalledWith(false);
    });

    it('does not start a drag from a press outside the selection', () => {
      mode.onPointerDown(pointerEvent(50, 50));
      mode.onPointerMove(pointerEvent(60, 60));
      mode.onPointerUp(pointerEvent(60, 60));

      expect(harness.mocks.setDragPan).not.toHaveBeenCalledWith(false);
      expect(harness.mocks.push).not.toHaveBeenCalled();
    });

    it('stacks a second drag on the committed result', () => {
      mode.onPointerDown(around(squareCenter, 0, 1));
      mode.onPointerMove(around(squareCenter, 45, 1));
      mode.onPointerUp(around(squareCenter, 45, 1));

      mode.onPointerDown(around(squareCenter, 0, 1));
      mode.onPointerMove(around(squareCenter, 45, 1));
      mode.onPointerUp(around(squareCenter, 45, 1));

      expect(harness.mocks.push).toHaveBeenCalledTimes(2);
      const second = harness.mocks.push.mock.calls[1][0] as UpdateAction;
      // The second step starts where the first one ended, not at the original square.
      expectRing(ring(second.oldFeature), ring(harness.mocks.push.mock.calls[0][0].newFeature), 9);
      expectSameVertices(ring(harness.features.get('sq')), ring(makeSquare()));
    });
  });

  describe('numeric input', () => {
    beforeEach(() => {
      mode.onPointerDown(pointerEvent(2, 2));
      harness.mocks.update.mockClear();
    });

    it('previews on angle change without touching history', () => {
      mode.onAngleChange(45);

      expect(harness.mocks.update).toHaveBeenCalledTimes(1);
      expect(harness.mocks.push).not.toHaveBeenCalled();
      expect(rotateEvents(harness)).toHaveLength(0);
    });

    it('commits a relative rotation on execute', () => {
      mode.executeFromUi(90);

      expect(harness.mocks.push).toHaveBeenCalledTimes(1);
      expect(rotateEvents(harness)[0][1].angle).toBe(90);
    });

    it('stacks repeated executes: three steps, then three undos restore the shape', () => {
      mode.executeFromUi(30);
      mode.executeFromUi(30);
      mode.executeFromUi(30);

      expect(harness.mocks.push).toHaveBeenCalledTimes(3);
      const actions = harness.mocks.push.mock.calls.map((c) => c[0] as UpdateAction);
      expectRing(ring(actions[1].oldFeature), ring(actions[0].newFeature), 9);
      expectRing(ring(actions[2].oldFeature), ring(actions[1].newFeature), 9);

      // Reverting the three steps in reverse order lands on the original square.
      for (const action of [...actions].reverse()) {
        action.revert(harness.context.store);
      }
      expectRing(ring(harness.features.get('sq')), ring(makeSquare()), 6);
    });

    it('rotates the other way for a negative angle', () => {
      mode.executeFromUi(90);
      const clockwise = ring(harness.features.get('sq'));
      mode.executeFromUi(-90);
      expectRing(ring(harness.features.get('sq')), ring(makeSquare()), 6);
      expect(clockwise).not.toEqual(ring(makeSquare()));
    });

    it('ignores 0 and multiples of 360 on execute', () => {
      mode.executeFromUi(0);
      mode.executeFromUi(360);
      mode.executeFromUi(-360);

      expect(harness.mocks.push).not.toHaveBeenCalled();
      expect(rotateEvents(harness)).toHaveLength(0);
    });

    it('shows the unrotated shape when the preview angle becomes 0', () => {
      mode.onAngleChange(45);
      mode.onAngleChange(0);

      expectRing(ring(harness.features.get('sq')), ring(makeSquare()), 9);
    });

    it('rejects out-of-range and non-finite angles', () => {
      mode.onAngleChange(361);
      mode.onAngleChange(Number.NaN);
      mode.executeFromUi(-361);
      mode.executeFromUi(Number.POSITIVE_INFINITY);

      expect(harness.mocks.update).not.toHaveBeenCalled();
      expect(harness.mocks.push).not.toHaveBeenCalled();
    });

    it('ignores input while a drag is in progress', () => {
      mode.onPointerDown(around(squareCenter, 0, 1));
      harness.mocks.update.mockClear();

      mode.onAngleChange(45);
      mode.executeFromUi(45);

      expect(harness.mocks.update).not.toHaveBeenCalled();
      expect(harness.mocks.push).not.toHaveBeenCalled();
    });

    it('ignores input when nothing is selected', () => {
      mode.clearSelection();
      harness.mocks.update.mockClear();

      mode.onAngleChange(45);
      mode.executeFromUi(45);

      expect(harness.mocks.update).not.toHaveBeenCalled();
      expect(harness.mocks.push).not.toHaveBeenCalled();
    });

    it('discards a pending preview and clears the selection on Escape', () => {
      mode.onAngleChange(45);
      mode.onKeyDown('Escape', new KeyboardEvent('keydown'));

      expectRing(ring(harness.features.get('sq')), ring(makeSquare()), 9);
      expect(mode.getSelectedId()).toBeNull();
      expect(harness.mocks.push).not.toHaveBeenCalled();
    });

    it('discards a pending preview when a drag starts', () => {
      mode.onAngleChange(45);
      mode.onPointerDown(around(squareCenter, 0, 1));

      expectRing(ring(harness.features.get('sq')), ring(makeSquare()), 9);
    });

    it('commits exactly the previewed angle on execute after a preview', () => {
      mode.onAngleChange(45);
      mode.executeFromUi(45);

      expect(harness.mocks.push).toHaveBeenCalledTimes(1);
      const action = harness.mocks.push.mock.calls[0][0] as UpdateAction;
      expectRing(ring(action.oldFeature), ring(makeSquare()), 9);
    });
  });

  describe('rotation center marker', () => {
    it('draws the marker at the centroid on select', () => {
      mode.onPointerDown(pointerEvent(2, 2));

      expect(harness.mocks.renderRotationCenter).toHaveBeenCalledTimes(1);
      const [pos] = harness.mocks.renderRotationCenter.mock.calls[0][0];
      expect(pos).toBeCloseTo(squareCenter.lng, 9);
      expect(harness.mocks.renderRotationCenter.mock.calls[0][0][1]).toBeCloseTo(
        squareCenter.lat,
        9
      );
    });

    it('never draws a marker for a point', () => {
      harness = createHarness([makePoint()]);
      mode = new RotateMode(harness.context, onSelectionChange);
      mode.activate();

      mode.onPointerDown(pointerEvent(20, 0));

      expect(harness.mocks.renderRotationCenter).not.toHaveBeenCalled();
    });

    it('clears the marker when the selection is cleared', () => {
      mode.onPointerDown(pointerEvent(2, 2));
      mode.onKeyDown('Escape', new KeyboardEvent('keydown'));

      expect(harness.mocks.clearRotationCenter).toHaveBeenCalled();
    });

    it('keeps the marker in place after a commit of an asymmetric shape', () => {
      // The centroid is invariant under rotation about itself, so the pivot must not drift.
      const triangle: LibreDrawFeature = {
        id: 'tri',
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [0, 0],
              [4, 0],
              [0, 2],
              [0, 0],
            ],
          ],
        },
        properties: {},
      };
      harness = createHarness([triangle]);
      mode = new RotateMode(harness.context, onSelectionChange);
      mode.activate();
      mode.onPointerDown(pointerEvent(1, 0.5));
      const first = harness.mocks.renderRotationCenter.mock.calls[0][0];

      mode.executeFromUi(90);
      mode.executeFromUi(90);

      // No redraw is needed: the centroid of the rotated shape is where it was.
      expect(harness.mocks.renderRotationCenter).toHaveBeenCalledTimes(1);
      const after = getRotationCenter(harness.features.get('tri')!);
      expect(after.lng).toBeCloseTo(first[0], 6);
      expect(after.lat).toBeCloseTo(first[1], 6);
    });

    it('does not move the marker during a drag preview', () => {
      mode.onPointerDown(pointerEvent(2, 2));
      mode.onPointerDown(around(squareCenter, 0, 1));
      mode.onPointerMove(around(squareCenter, 30, 1));

      expect(harness.mocks.renderRotationCenter).toHaveBeenCalledTimes(1);
    });

    it('redraws the marker from the store on refresh', () => {
      mode.onPointerDown(pointerEvent(2, 2));
      mode.refreshFromStore();

      expect(harness.mocks.renderRotationCenter).toHaveBeenCalledTimes(2);
    });

    it('clears the marker on deactivate', () => {
      mode.onPointerDown(pointerEvent(2, 2));
      mode.deactivate();

      expect(harness.mocks.clearRotationCenter).toHaveBeenCalled();
    });
  });

  describe('lifecycle', () => {
    it('restores a pending preview and clears the selection on deactivate', () => {
      mode.onPointerDown(pointerEvent(2, 2));
      mode.onAngleChange(45);

      mode.deactivate();

      expectRing(ring(harness.features.get('sq')), ring(makeSquare()), 9);
      expect(mode.getSelectedId()).toBeNull();
      expect(harness.mocks.setSelectedIds).toHaveBeenLastCalledWith([]);
      expect(onSelectionChange).toHaveBeenLastCalledWith(false);
    });

    it('aborts an in-progress drag on deactivate', () => {
      mode.onPointerDown(pointerEvent(2, 2));
      mode.onPointerDown(around(squareCenter, 0, 1));
      mode.onPointerMove(around(squareCenter, 90, 1));

      mode.deactivate();

      expect(harness.mocks.push).not.toHaveBeenCalled();
      expect(harness.mocks.setDragPan).toHaveBeenLastCalledWith(true);
      expectRing(ring(harness.features.get('sq')), ring(makeSquare()), 9);
    });

    it('drops the selection when the feature disappears from the store', () => {
      mode.onPointerDown(pointerEvent(2, 2));
      harness.features.delete('sq');

      mode.onPointerDown(pointerEvent(2, 2));

      expect(mode.getSelectedId()).toBeNull();
      expect(onSelectionChange).toHaveBeenLastCalledWith(false);
    });

    it('rebases on the stored shape after an external change (undo / redo)', () => {
      mode.onPointerDown(pointerEvent(2, 2));
      mode.executeFromUi(90);
      const committed = harness.mocks.push.mock.calls[0][0] as UpdateAction;

      // Simulate the facade undoing the rotation: only the store changes.
      committed.revert(harness.context.store);
      mode.refreshFromStore();

      mode.executeFromUi(90);

      const next = harness.mocks.push.mock.calls[1][0] as UpdateAction;
      // The second rotation starts from the undone (original) shape, not from the stale base.
      expectRing(ring(next.oldFeature), ring(makeSquare()), 9);
    });

    it('adopts the stored shape as the new base and forgets a pending preview on refresh', () => {
      mode.onPointerDown(pointerEvent(2, 2));
      mode.onAngleChange(45);
      const stored = ring(harness.features.get('sq'));
      harness.mocks.update.mockClear();

      mode.refreshFromStore();

      // No write: whatever the store holds is the truth and becomes the base...
      expect(harness.mocks.update).not.toHaveBeenCalled();
      expect(mode.getSelectedId()).toBe('sq');
      // ...so a later Escape has nothing to restore and leaves the store as is.
      mode.onKeyDown('Escape', new KeyboardEvent('keydown'));
      expect(harness.mocks.update).not.toHaveBeenCalled();
      expect(ring(harness.features.get('sq'))).toEqual(stored);
    });

    it('clears the selection on refresh when the feature is gone', () => {
      mode.onPointerDown(pointerEvent(2, 2));
      harness.features.delete('sq');

      mode.refreshFromStore();

      expect(mode.getSelectedId()).toBeNull();
      expect(onSelectionChange).toHaveBeenLastCalledWith(false);
    });

    it('keeps the undone shape when refreshed during a numeric preview', () => {
      mode.onPointerDown(pointerEvent(2, 2));
      mode.executeFromUi(90);
      const committed = harness.mocks.push.mock.calls[0][0] as UpdateAction;
      mode.onAngleChange(30);

      // Facade undo: the store goes back to the original square while a preview is pending.
      committed.revert(harness.context.store);
      harness.mocks.update.mockClear();
      mode.refreshFromStore();

      // The refresh must not write the stale base (the 90° shape) back.
      expect(harness.mocks.update).not.toHaveBeenCalled();
      expectRing(ring(harness.features.get('sq')), ring(makeSquare()), 9);

      mode.executeFromUi(45);
      const next = harness.mocks.push.mock.calls[1][0] as UpdateAction;
      expectRing(ring(next.oldFeature), ring(makeSquare()), 9);
    });

    it('keeps the undone shape when refreshed during a drag', () => {
      mode.onPointerDown(pointerEvent(2, 2));
      mode.executeFromUi(90);
      const committed = harness.mocks.push.mock.calls[0][0] as UpdateAction;
      mode.onPointerDown(around(squareCenter, 0, 1));
      mode.onPointerMove(around(squareCenter, 30, 1));

      committed.revert(harness.context.store);
      harness.mocks.update.mockClear();
      harness.mocks.setDragPan.mockClear();
      mode.refreshFromStore();

      expect(harness.mocks.update).not.toHaveBeenCalled();
      expect(harness.mocks.setDragPan).toHaveBeenLastCalledWith(true);
      expectRing(ring(harness.features.get('sq')), ring(makeSquare()), 9);

      // The abandoned drag must not commit on a later pointer up.
      mode.onPointerUp(around(squareCenter, 30, 1));
      expect(harness.mocks.push).toHaveBeenCalledTimes(1);
    });

    it('dropSelection forgets the selection without writing to the store', () => {
      mode.onPointerDown(pointerEvent(2, 2));
      mode.onAngleChange(45);
      const previewed = ring(harness.features.get('sq'));
      harness.mocks.update.mockClear();

      mode.dropSelection();

      expect(harness.mocks.update).not.toHaveBeenCalled();
      expect(ring(harness.features.get('sq'))).toEqual(previewed);
      expect(mode.getSelectedId()).toBeNull();
      expect(harness.mocks.emit).toHaveBeenLastCalledWith('selectionchange', { selectedIds: [] });
      expect(onSelectionChange).toHaveBeenLastCalledWith(false);
    });

    it('refresh is a no-op without a selection', () => {
      mode.refreshFromStore();

      expect(harness.mocks.update).not.toHaveBeenCalled();
    });

    it('clearSelection is a no-op without a selection', () => {
      mode.clearSelection();

      expect(harness.mocks.emit).not.toHaveBeenCalled();
      expect(onSelectionChange).not.toHaveBeenCalled();
    });
  });
});
