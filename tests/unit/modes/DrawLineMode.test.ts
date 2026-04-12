import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DrawLineMode } from '../../../src/modes/DrawLineMode';
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

describe('DrawLineMode', () => {
  let context: ModeContext;
  let mode: DrawLineMode;

  beforeEach(() => {
    context = createMockContext();
    mode = new DrawLineMode(context);
  });

  it('should not respond to events when inactive', () => {
    mode.onPointerDown(createPointerEvent(10, 20));
    expect(context.store.add).not.toHaveBeenCalled();
    expect(context.render.renderPreview).not.toHaveBeenCalled();
  });

  it('should add vertices on pointerDown and render preview', () => {
    mode.activate();
    mode.onPointerDown(createPointerEvent(0, 0));

    expect(context.render.renderPreview).toHaveBeenCalled();
    expect(context.store.add).not.toHaveBeenCalled(); // Not finalized yet
  });

  it('should finalize a LineString on double-click with 2+ vertices', () => {
    mode.activate();
    mode.onPointerDown(createPointerEvent(0, 0));
    mode.onPointerDown(createPointerEvent(10, 5));
    // Double-click adds a 3rd vertex via pointerDown, then onDoubleClick pops it
    mode.onPointerDown(createPointerEvent(10, 5));
    mode.onDoubleClick(createPointerEvent(10, 5));

    expect(context.store.add).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [[0, 0], [10, 5]],
        },
      }),
    );
    expect(context.history.push).toHaveBeenCalled();
    expect(context.events.emit).toHaveBeenCalledWith(
      'create',
      expect.objectContaining({
        feature: expect.objectContaining({
          geometry: expect.objectContaining({ type: 'LineString' }),
        }),
      }),
    );
  });

  it('should not finalize with fewer than 2 vertices', () => {
    mode.activate();
    mode.onPointerDown(createPointerEvent(0, 0));
    mode.onDoubleClick(createPointerEvent(0, 0));

    expect(context.store.add).not.toHaveBeenCalled();
  });

  it('should stay in mode after finalization for continuous drawing', () => {
    mode.activate();
    mode.onPointerDown(createPointerEvent(0, 0));
    mode.onPointerDown(createPointerEvent(10, 5));
    mode.onPointerDown(createPointerEvent(10, 5));
    mode.onDoubleClick(createPointerEvent(10, 5));

    expect(context.store.add).toHaveBeenCalledTimes(1);

    // Can start drawing again
    mode.onPointerDown(createPointerEvent(20, 20));
    mode.onPointerDown(createPointerEvent(30, 30));
    mode.onPointerDown(createPointerEvent(30, 30));
    mode.onDoubleClick(createPointerEvent(30, 30));

    expect(context.store.add).toHaveBeenCalledTimes(2);
  });

  it('should cancel drawing on Escape', () => {
    mode.activate();
    mode.onPointerDown(createPointerEvent(0, 0));
    mode.onPointerDown(createPointerEvent(10, 5));

    mode.onKeyDown('Escape', new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(context.render.clearPreview).toHaveBeenCalled();
    expect(context.render.clearSnapIndicator).toHaveBeenCalled();

    // After cancel, double-click should not finalize (no vertices)
    mode.onDoubleClick(createPointerEvent(10, 5));
    expect(context.store.add).not.toHaveBeenCalled();
  });

  it('should remove last vertex on long press', () => {
    mode.activate();
    mode.onPointerDown(createPointerEvent(0, 0));
    mode.onPointerDown(createPointerEvent(10, 5));
    mode.onPointerDown(createPointerEvent(20, 10));

    mode.onLongPress(createPointerEvent(20, 10));

    // Now should have 2 vertices, finalize should work
    mode.onPointerDown(createPointerEvent(20, 10));
    mode.onDoubleClick(createPointerEvent(20, 10));

    expect(context.store.add).toHaveBeenCalledWith(
      expect.objectContaining({
        geometry: {
          type: 'LineString',
          coordinates: [[0, 0], [10, 5]],
        },
      }),
    );
  });

  it('should clear preview and snap on deactivate', () => {
    mode.activate();
    mode.onPointerDown(createPointerEvent(0, 0));
    mode.deactivate();

    expect(context.render.clearPreview).toHaveBeenCalled();
    expect(context.render.clearSnapIndicator).toHaveBeenCalled();
  });

  it('should render preview as open line (not closed ring)', () => {
    mode.activate();
    mode.onPointerDown(createPointerEvent(0, 0));
    mode.onPointerDown(createPointerEvent(10, 5));

    // Check that renderPreview was called with coordinates (open line, no closing)
    const calls = vi.mocked(context.render.renderPreview).mock.calls;
    const lastCall = calls[calls.length - 1][0];
    // Should NOT have closing point (first === last)
    expect(lastCall[0]).not.toEqual(lastCall[lastCall.length - 1]);
  });

  it('should prevent default on double click', () => {
    mode.activate();
    mode.onPointerDown(createPointerEvent(0, 0));
    mode.onPointerDown(createPointerEvent(10, 5));

    const event = createPointerEvent(10, 5);
    vi.spyOn(event.originalEvent, 'preventDefault');
    vi.spyOn(event.originalEvent, 'stopPropagation');

    mode.onDoubleClick(event);

    expect(event.originalEvent.preventDefault).toHaveBeenCalled();
    expect(event.originalEvent.stopPropagation).toHaveBeenCalled();
  });
});
