import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ModeContext } from '../../../src/core/ModeContext';
import { SetbackMode } from '../../../src/modes/SetbackMode';
import type { LibreDrawFeature } from '../../../src/types/features';
import type { NormalizedInputEvent } from '../../../src/types/input';

function makeSquare(id: string): LibreDrawFeature {
  return {
    id,
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10],
          [0, 0],
        ],
      ],
    },
    properties: { name: id },
  };
}

function makeSquareWithHole(id: string): LibreDrawFeature {
  return {
    id,
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10],
          [0, 0],
        ],
        [
          [4, 4],
          [6, 4],
          [6, 6],
          [4, 6],
          [4, 4],
        ],
      ],
    },
    properties: { name: id },
  };
}

function pointerEvent(lng: number, lat: number): NormalizedInputEvent {
  return {
    lngLat: { lng, lat },
    point: { x: lng * 10, y: lat * 10 },
    originalEvent: new MouseEvent('click'),
    inputType: 'mouse',
  };
}

interface Harness {
  context: ModeContext;
  features: Map<string, LibreDrawFeature>;
  setDistance(value: number): void;
  mocks: {
    add: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
    getById: ReturnType<typeof vi.fn>;
    getAll: ReturnType<typeof vi.fn>;
    push: ReturnType<typeof vi.fn>;
    emit: ReturnType<typeof vi.fn>;
    renderFeatures: ReturnType<typeof vi.fn>;
    renderPreview: ReturnType<typeof vi.fn>;
    clearPreview: ReturnType<typeof vi.fn>;
    renderEdgeHighlight: ReturnType<typeof vi.fn>;
    clearEdgeHighlight: ReturnType<typeof vi.fn>;
    renderVertices: ReturnType<typeof vi.fn>;
    clearVertices: ReturnType<typeof vi.fn>;
    setSelectedIds: ReturnType<typeof vi.fn>;
    setDragPan: ReturnType<typeof vi.fn>;
  };
}

function createHarness(
  feature: LibreDrawFeature = makeSquare('f1'),
): Harness {
  const features = new Map<string, LibreDrawFeature>();
  features.set(feature.id, feature);

  let setbackDistance = 10;

  const add = vi.fn((f: LibreDrawFeature) => {
    features.set(f.id, f);
    return f;
  });
  const update = vi.fn((id: string, f: LibreDrawFeature) => {
    features.set(id, f);
  });
  const remove = vi.fn((id: string) => {
    const found = features.get(id);
    features.delete(id);
    return found;
  });
  const getById = vi.fn((id: string) => features.get(id));
  const getAll = vi.fn(() => Array.from(features.values()));

  const push = vi.fn();
  const emit = vi.fn();
  const renderFeatures = vi.fn();
  const renderPreview = vi.fn();
  const clearPreview = vi.fn();
  const renderEdgeHighlight = vi.fn();
  const clearEdgeHighlight = vi.fn();
  const renderVertices = vi.fn();
  const clearVertices = vi.fn();
  const setSelectedIds = vi.fn();
  const setDragPan = vi.fn();

  const context: ModeContext = {
    store: {
      add,
      update,
      remove,
      getById,
      getAll,
    },
    history: { push },
    events: { emit },
    render: {
      renderFeatures,
      renderPreview,
      clearPreview,
      renderEdgeHighlight,
      clearEdgeHighlight,
      renderVertices,
      clearVertices,
      setSelectedIds,
      renderSnapIndicator: vi.fn(),
      clearSnapIndicator: vi.fn(),
    },
    getScreenPoint: ({ lng, lat }) => ({ x: lng * 10, y: lat * 10 }),
    setDragPan,
    getSetbackDistance: () => setbackDistance,
    getSnapConfig: () => ({ enabled: false, threshold: 10 }),
    getViewportBounds: () => ({ west: -180, south: -90, east: 180, north: 90 }),
  };

  return {
    context,
    features,
    setDistance: (value: number) => {
      setbackDistance = value;
    },
    mocks: {
      add,
      update,
      remove,
      getById,
      getAll,
      push,
      emit,
      renderFeatures,
      renderPreview,
      clearPreview,
      renderEdgeHighlight,
      clearEdgeHighlight,
      renderVertices,
      clearVertices,
      setSelectedIds,
      setDragPan,
    },
  };
}

describe('SetbackMode', () => {
  let harness: Harness;
  let mode: SetbackMode;

  beforeEach(() => {
    harness = createHarness();
    mode = new SetbackMode(harness.context);
  });

  it('should declare draw-like map interactions', () => {
    expect(mode.mapInteractions()).toEqual({
      dragPan: false,
      doubleClickZoom: false,
    });
  });

  it('should select polygon and enter edge-selection phase', () => {
    mode.activate();
    mode.onPointerDown(pointerEvent(5, 5));

    expect(harness.mocks.setSelectedIds).toHaveBeenCalledWith(['f1']);
    expect(harness.mocks.emit).toHaveBeenCalledWith('selectionchange', {
      selectedIds: ['f1'],
    });
  });

  it('should highlight hovered edge while selecting edge', () => {
    mode.activate();
    mode.onPointerDown(pointerEvent(5, 5));
    mode.onPointerMove(pointerEvent(5, 0));

    expect(harness.mocks.renderEdgeHighlight).toHaveBeenCalled();
  });

  it('should clear edge highlight when pointer moves away from all edges', () => {
    mode.activate();
    mode.onPointerDown(pointerEvent(5, 5));

    harness.mocks.clearEdgeHighlight.mockClear();
    mode.onPointerMove(pointerEvent(50, 50));

    expect(harness.mocks.clearEdgeHighlight).toHaveBeenCalled();
  });

  it('should allow mouse edge selection up to 18px threshold', () => {
    mode.activate();
    mode.onPointerDown(pointerEvent(5, 5)); // select polygon

    harness.mocks.renderPreview.mockClear();
    mode.onPointerDown(pointerEvent(5, 1.6)); // 16px away from top edge

    expect(harness.mocks.renderPreview).toHaveBeenCalled();
  });

  it('should execute setback on Enter key in previewing state', () => {
    harness.setDistance(1000);

    mode.activate();
    mode.onPointerDown(pointerEvent(5, 5));
    mode.onPointerDown(pointerEvent(5, 0));
    mode.onKeyDown('Enter', new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(harness.mocks.emit).toHaveBeenCalledWith(
      'setback',
      expect.objectContaining({
        edgeIndex: 0,
        distance: 1000,
      }),
    );
  });

  it('should reset interaction state on Escape key', () => {
    mode.activate();
    mode.onPointerDown(pointerEvent(5, 5));
    mode.onPointerDown(pointerEvent(5, 0));

    harness.mocks.emit.mockClear();
    harness.mocks.setSelectedIds.mockClear();
    harness.mocks.clearPreview.mockClear();
    harness.mocks.clearEdgeHighlight.mockClear();

    mode.onKeyDown('Escape', new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(harness.mocks.setSelectedIds).toHaveBeenCalledWith([]);
    expect(harness.mocks.emit).toHaveBeenCalledWith('selectionchange', {
      selectedIds: [],
    });
    expect(harness.mocks.clearPreview).toHaveBeenCalled();
    expect(harness.mocks.clearEdgeHighlight).toHaveBeenCalled();
  });

  it('should clear interaction artifacts on deactivate', () => {
    mode.activate();
    mode.onPointerDown(pointerEvent(5, 5));
    mode.onPointerDown(pointerEvent(5, 0));

    harness.mocks.clearPreview.mockClear();
    harness.mocks.clearEdgeHighlight.mockClear();
    harness.mocks.setSelectedIds.mockClear();

    mode.deactivate();

    expect(harness.mocks.clearPreview).toHaveBeenCalled();
    expect(harness.mocks.clearEdgeHighlight).toHaveBeenCalled();
    expect(harness.mocks.setSelectedIds).toHaveBeenCalledWith([]);
  });

  it('should execute setback and emit setback event', () => {
    harness.setDistance(0);

    mode.activate();
    mode.onPointerDown(pointerEvent(5, 5));
    mode.onPointerDown(pointerEvent(5, 0));
    mode.executeFromUi(1000);

    expect(harness.mocks.remove).toHaveBeenCalledWith('f1');
    expect(harness.mocks.add).toHaveBeenCalledTimes(1);
    expect(harness.features.size).toBe(1);
    expect(harness.mocks.push).toHaveBeenCalledTimes(1);
    expect(harness.mocks.emit).toHaveBeenCalledWith(
      'setback',
      expect.objectContaining({
        originalFeature: expect.objectContaining({ id: 'f1' }),
        feature: expect.any(Object),
        edgeIndex: 0,
        distance: 1000,
      }),
    );
  });

  it('should use distance argument on onDistanceChange for preview updates', () => {
    harness.setDistance(0);

    mode.activate();
    mode.onPointerDown(pointerEvent(5, 5));
    mode.onPointerDown(pointerEvent(5, 0));
    harness.mocks.renderPreview.mockClear();

    mode.onDistanceChange(1000);

    expect(harness.mocks.renderPreview).toHaveBeenCalled();
  });

  it('should emit setbackfailed(has-holes) for polygon with holes', () => {
    harness = createHarness(makeSquareWithHole('h1'));
    mode = new SetbackMode(harness.context);

    mode.activate();
    mode.onPointerDown(pointerEvent(2, 2));
    mode.onPointerDown(pointerEvent(5, 0));
    mode.executeFromUi(10);

    expect(harness.mocks.emit).toHaveBeenCalledWith('setbackfailed', {
      reason: 'has-holes',
      featureId: 'h1',
    });
    expect(harness.mocks.remove).not.toHaveBeenCalled();
  });

  it('should emit setbackfailed(invalid-split) when offset split fails', () => {
    harness.setDistance(3000000);

    mode.activate();
    mode.onPointerDown(pointerEvent(5, 5));
    mode.onPointerDown(pointerEvent(5, 0));
    mode.executeFromUi(3000000);

    expect(harness.mocks.emit).toHaveBeenCalledWith('setbackfailed', {
      reason: 'invalid-split',
      featureId: 'f1',
    });
  });

  it('should clear selection when clicking outside polygon in previewing state', () => {
    mode.activate();
    mode.onPointerDown(pointerEvent(5, 5)); // select polygon
    mode.onPointerDown(pointerEvent(5, 0)); // choose first edge -> previewing

    harness.mocks.emit.mockClear();
    harness.mocks.setSelectedIds.mockClear();

    mode.onPointerDown(pointerEvent(50, 50)); // outside polygon

    expect(harness.mocks.setSelectedIds).toHaveBeenCalledWith([]);
    expect(harness.mocks.emit).toHaveBeenCalledWith('selectionchange', {
      selectedIds: [],
    });
  });

  it('should switch selected edge when clicking another edge in previewing state', () => {
    harness.setDistance(1000);

    mode.activate();
    mode.onPointerDown(pointerEvent(5, 5)); // select polygon
    mode.onPointerDown(pointerEvent(5, 0)); // edge 0

    mode.onPointerDown(pointerEvent(10, 5)); // switch to right edge (edge 1)
    mode.executeFromUi(1000);

    expect(harness.mocks.emit).toHaveBeenCalledWith(
      'setback',
      expect.objectContaining({
        edgeIndex: 1,
      }),
    );
  });

  it('should keep correct polygon when setback is applied to opposite edges consecutively', () => {
    harness.setDistance(1000);

    mode.activate();

    // First setback: select polygon, choose bottom edge (edge 0), execute
    mode.onPointerDown(pointerEvent(5, 5));
    mode.onPointerDown(pointerEvent(5, 0));
    mode.executeFromUi(1000);

    // After first setback, one feature was removed and a new one added
    expect(harness.features.size).toBe(1);
    const firstResult = Array.from(harness.features.values())[0];
    const firstVertices = firstResult.geometry.coordinates[0];

    // The result should NOT contain the original bottom edge y=0 vertices
    // (those belong to the band that was removed)
    const hasOriginalBottomEdge = firstVertices.some(
      (v: number[]) => Math.abs(v[1]) < 0.001,
    );
    expect(hasOriginalBottomEdge).toBe(false);

    // Second setback: select the result polygon, choose top edge, execute
    // Need to re-create mode to reset state
    mode = new SetbackMode(harness.context);
    mode.activate();

    // Click inside the result polygon (it's shifted upward from y=0)
    const midY =
      firstVertices.reduce((sum: number, v: number[]) => sum + v[1], 0) /
      firstVertices.length;
    const midX =
      firstVertices.reduce((sum: number, v: number[]) => sum + v[0], 0) /
      firstVertices.length;
    mode.onPointerDown(pointerEvent(midX, midY)); // select polygon

    // Click near top edge (y=10)
    mode.onPointerDown(pointerEvent(5, 10));
    mode.executeFromUi(1000);

    expect(harness.features.size).toBe(1);
    const secondResult = Array.from(harness.features.values())[0];
    const secondVertices = secondResult.geometry.coordinates[0];

    // The result should NOT contain the original top edge y=10 vertices
    const hasOriginalTopEdge = secondVertices.some(
      (v: number[]) => Math.abs(v[1] - 10) < 0.001,
    );
    expect(hasOriginalTopEdge).toBe(false);

    // The result should still be a valid polygon (at least 4 points including closing)
    expect(secondVertices.length).toBeGreaterThanOrEqual(4);
  });

  it('should switch selected edge even when clicking slightly outside polygon', () => {
    harness.setDistance(1000);

    mode.activate();
    mode.onPointerDown(pointerEvent(5, 5)); // select polygon
    mode.onPointerDown(pointerEvent(5, 0)); // edge 0

    mode.onPointerDown(pointerEvent(10.6, 5)); // outside near right edge
    mode.executeFromUi(1000);

    expect(harness.mocks.emit).toHaveBeenCalledWith(
      'setback',
      expect.objectContaining({
        edgeIndex: 1,
      }),
    );
  });
});
