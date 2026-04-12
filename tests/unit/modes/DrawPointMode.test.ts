import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DrawPointMode } from '../../../src/modes/DrawPointMode';
import type { ModeContext } from '../../../src/core/ModeContext';
import type { NormalizedInputEvent } from '../../../src/types/input';
import type { LibreDrawFeature } from '../../../src/types/features';

function createMockContext(): ModeContext {
  return {
    store: {
      add: vi.fn((f: LibreDrawFeature) => f),
      update: vi.fn(),
      remove: vi.fn(),
      getById: vi.fn(),
      getAll: vi.fn(() => []),
    },
    history: {
      push: vi.fn(),
    },
    events: {
      emit: vi.fn(),
    },
    render: {
      renderPreview: vi.fn(),
      clearPreview: vi.fn(),
      renderEdgeHighlight: vi.fn(),
      clearEdgeHighlight: vi.fn(),
      renderFeatures: vi.fn(),
      renderVertices: vi.fn(),
      clearVertices: vi.fn(),
      setSelectedIds: vi.fn(),
      renderSnapIndicator: vi.fn(),
      clearSnapIndicator: vi.fn(),
    },
    getScreenPoint: vi.fn((lngLat) => ({
      x: lngLat.lng * 10,
      y: lngLat.lat * 10,
    })),
    setDragPan: vi.fn(),
    getSetbackDistance: () => 10,
    getSnapConfig: () => ({ enabled: false, threshold: 10 }),
    getViewportBounds: () => ({
      west: -180,
      south: -90,
      east: 180,
      north: 90,
    }),
  };
}

function createPointerEvent(
  lng: number,
  lat: number,
): NormalizedInputEvent {
  return {
    lngLat: { lng, lat },
    point: { x: lng * 10, y: lat * 10 },
    originalEvent: new MouseEvent('click'),
    inputType: 'mouse',
  };
}

describe('DrawPointMode', () => {
  let context: ModeContext;
  let mode: DrawPointMode;

  beforeEach(() => {
    context = createMockContext();
    mode = new DrawPointMode(context);
  });

  it('should not respond to events when inactive', () => {
    mode.onPointerDown(createPointerEvent(10, 20));
    expect(context.store.add).not.toHaveBeenCalled();
  });

  it('should create a Point feature on pointerDown when active', () => {
    mode.activate();
    mode.onPointerDown(createPointerEvent(139.7, 35.6));

    expect(context.store.add).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [139.7, 35.6],
        },
      }),
    );
    expect(context.history.push).toHaveBeenCalled();
    expect(context.events.emit).toHaveBeenCalledWith(
      'create',
      expect.objectContaining({
        feature: expect.objectContaining({
          geometry: { type: 'Point', coordinates: [139.7, 35.6] },
        }),
      }),
    );
    expect(context.render.renderFeatures).toHaveBeenCalled();
  });

  it('should stay in mode after creating a point (continuous placement)', () => {
    mode.activate();
    mode.onPointerDown(createPointerEvent(0, 0));
    mode.onPointerDown(createPointerEvent(10, 10));

    expect(context.store.add).toHaveBeenCalledTimes(2);
  });

  it('should clear snap indicator on deactivate', () => {
    mode.activate();
    mode.deactivate();

    expect(context.render.clearSnapIndicator).toHaveBeenCalled();
  });

  it('should clear snap indicator on Escape', () => {
    mode.activate();
    mode.onKeyDown(
      'Escape',
      new KeyboardEvent('keydown', { key: 'Escape' }),
    );

    expect(context.render.clearSnapIndicator).toHaveBeenCalled();
  });

  it('should prevent default on double click', () => {
    mode.activate();
    const event = createPointerEvent(5, 5);
    vi.spyOn(event.originalEvent, 'preventDefault');
    vi.spyOn(event.originalEvent, 'stopPropagation');

    mode.onDoubleClick(event);

    expect(event.originalEvent.preventDefault).toHaveBeenCalled();
    expect(event.originalEvent.stopPropagation).toHaveBeenCalled();
  });

  it('should show snap indicator on pointer move when snap is enabled', () => {
    const snapContext = createMockContext();
    snapContext.getSnapConfig = () => ({ enabled: true, threshold: 10 });

    const existingFeature: LibreDrawFeature = {
      id: 'existing',
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]],
      },
      properties: {},
    };
    vi.mocked(snapContext.store.getAll).mockReturnValue([existingFeature]);

    const snapMode = new DrawPointMode(snapContext);
    snapMode.activate();

    // Move near (0,0) which is a vertex of the existing polygon
    snapMode.onPointerMove(createPointerEvent(0.05, 0.05));

    expect(snapContext.render.renderSnapIndicator).toHaveBeenCalled();
  });

  it('should clear snap indicator on pointer move when no snap target', () => {
    const snapContext = createMockContext();
    snapContext.getSnapConfig = () => ({ enabled: true, threshold: 10 });
    vi.mocked(snapContext.store.getAll).mockReturnValue([]);

    const snapMode = new DrawPointMode(snapContext);
    snapMode.activate();

    snapMode.onPointerMove(createPointerEvent(50, 50));

    expect(snapContext.render.clearSnapIndicator).toHaveBeenCalled();
  });
});
