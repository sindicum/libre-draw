import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ModeContext } from '../../../src/core/ModeContext';
import { SplitMode } from '../../../src/modes/SplitMode';
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

function pointerEvent(lng: number, lat: number): NormalizedInputEvent {
  return {
    lngLat: { lng, lat },
    point: { x: lng * 10, y: lat * 10 },
    originalEvent: new MouseEvent('click'),
    inputType: 'mouse',
  };
}

interface TestHarness {
  context: ModeContext;
  features: Map<string, LibreDrawFeature>;
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

function createHarness(): TestHarness {
  const features = new Map<string, LibreDrawFeature>();
  features.set('f1', makeSquare('f1'));

  const add = vi.fn((feature: LibreDrawFeature) => {
    features.set(feature.id, feature);
    return feature;
  });
  const update = vi.fn((id: string, feature: LibreDrawFeature) => {
    features.set(id, feature);
  });
  const remove = vi.fn((id: string) => {
    const existing = features.get(id);
    features.delete(id);
    return existing;
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
    history: {
      push,
    },
    events: {
      emit,
    },
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
    getSetbackDistance: () => 10,
    getSnapConfig: () => ({ enabled: false, threshold: 10 }),
    getViewportBounds: () => ({ west: -180, south: -90, east: 180, north: 90 }),
  };

  return {
    context,
    features,
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

describe('SplitMode', () => {
  let harness: TestHarness;
  let mode: SplitMode;

  beforeEach(() => {
    harness = createHarness();
    mode = new SplitMode(harness.context);
  });

  it('should declare map interactions for precise splitting', () => {
    expect(mode.mapInteractions()).toEqual({
      dragPan: false,
      doubleClickZoom: false,
    });
  });

  it('should select polygon and enter first-point state on hit', () => {
    mode.activate();
    mode.onPointerDown(pointerEvent(5, 5));

    expect(harness.mocks.setSelectedIds).toHaveBeenCalledWith(['f1']);
    expect(harness.mocks.emit).toHaveBeenCalledWith('selectionchange', {
      selectedIds: ['f1'],
    });
  });

  it('should render split preview while choosing second point', () => {
    mode.activate();
    mode.onPointerDown(pointerEvent(5, 5)); // select target
    mode.onPointerDown(pointerEvent(2, 2)); // first split point

    harness.mocks.renderPreview.mockClear();
    mode.onPointerMove(pointerEvent(8, 8));

    expect(harness.mocks.renderPreview).toHaveBeenCalledWith([
      [2, 2],
      [8, 8],
    ]);
  });

  it('should execute valid split and push history/event', () => {
    mode.activate();
    mode.onPointerDown(pointerEvent(5, 5)); // select target
    mode.onPointerDown(pointerEvent(5, -1)); // first split point
    mode.onPointerDown(pointerEvent(5, 11)); // second split point

    expect(harness.mocks.remove).toHaveBeenCalledWith('f1');
    expect(harness.mocks.add).toHaveBeenCalledTimes(2);
    expect(harness.features.size).toBe(2);
    expect(harness.mocks.push).toHaveBeenCalledTimes(1);
    expect(harness.mocks.emit).toHaveBeenCalledWith(
      'split',
      expect.objectContaining({
        originalFeature: expect.objectContaining({ id: 'f1' }),
        features: expect.any(Array),
      }),
    );
    expect(harness.mocks.setSelectedIds).toHaveBeenCalledWith([]);
    expect(harness.mocks.clearPreview).toHaveBeenCalled();
  });

  it('should emit splitfailed event and return to first-point on invalid split', () => {
    mode.activate();
    mode.onPointerDown(pointerEvent(5, 5)); // select target
    mode.onPointerDown(pointerEvent(20, 20)); // first split point
    mode.onPointerDown(pointerEvent(30, 30)); // invalid split

    expect(harness.mocks.remove).not.toHaveBeenCalled();
    expect(harness.mocks.push).not.toHaveBeenCalled();
    expect(harness.mocks.emit).toHaveBeenCalledWith(
      'splitfailed',
      expect.objectContaining({
        reason: 'invalid-intersection-count',
        featureId: 'f1',
      }),
    );

    // Should return to first-point state (can set a new first point)
    harness.mocks.renderPreview.mockClear();
    mode.onPointerDown(pointerEvent(6, 6));
    expect(harness.mocks.renderPreview).toHaveBeenCalledWith([
      [6, 6],
      [6, 6],
    ]);
  });

  it('should reset interaction state on Escape', () => {
    mode.activate();
    mode.onPointerDown(pointerEvent(5, 5)); // select target
    mode.onPointerDown(pointerEvent(2, 2)); // first split point

    harness.mocks.clearPreview.mockClear();

    mode.onKeyDown('Escape', new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(harness.mocks.clearPreview).toHaveBeenCalled();
    expect(harness.mocks.setSelectedIds).toHaveBeenCalledWith([]);
    expect(harness.mocks.emit).toHaveBeenCalledWith('selectionchange', {
      selectedIds: [],
    });
  });
});
