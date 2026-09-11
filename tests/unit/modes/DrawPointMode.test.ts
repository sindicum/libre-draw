import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

/** Screen coordinates are 10px per degree, matching `getScreenPoint`. */
function createPointerEvent(
  lng: number,
  lat: number,
  inputType: 'mouse' | 'touch' = 'mouse'
): NormalizedInputEvent {
  return {
    lngLat: { lng, lat },
    point: { x: lng * 10, y: lat * 10 },
    originalEvent: new MouseEvent('click'),
    inputType,
  };
}

/** A mouse click: pointer down and up at the same position. */
function click(mode: DrawPointMode, lng: number, lat: number): void {
  mode.onPointerDown(createPointerEvent(lng, lat));
  mode.onPointerUp(createPointerEvent(lng, lat));
}

/** A touch tap: touch start and end at the same position. */
function tap(mode: DrawPointMode, lng: number, lat: number): void {
  mode.onPointerDown(createPointerEvent(lng, lat, 'touch'));
  mode.onPointerUp(createPointerEvent(lng, lat, 'touch'));
}

/** A drag: down at the first position, move and release at the second. */
function drag(
  mode: DrawPointMode,
  from: [number, number],
  to: [number, number],
  inputType: 'mouse' | 'touch' = 'mouse'
): void {
  mode.onPointerDown(createPointerEvent(from[0], from[1], inputType));
  mode.onPointerMove(createPointerEvent(to[0], to[1], inputType));
  mode.onPointerUp(createPointerEvent(to[0], to[1], inputType));
}

describe('DrawPointMode', () => {
  let context: ModeContext;
  let mode: DrawPointMode;

  beforeEach(() => {
    context = createMockContext();
    mode = new DrawPointMode(context);
  });

  it('should not respond to events when inactive', () => {
    click(mode, 10, 20);
    expect(context.store.add).not.toHaveBeenCalled();
  });

  it('should keep dragPan enabled and disable doubleClickZoom', () => {
    // Points are placed by clicks/taps, so dragging stays free for panning.
    expect(mode.mapInteractions()).toEqual({ dragPan: true, doubleClickZoom: false });
  });

  it('should create a Point feature on click when active', () => {
    mode.activate();
    click(mode, 139.7, 35.6);

    expect(context.store.add).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [139.7, 35.6],
        },
      })
    );
    expect(context.events.emit).toHaveBeenCalledWith(
      'create',
      expect.objectContaining({
        feature: expect.objectContaining({
          geometry: { type: 'Point', coordinates: [139.7, 35.6] },
        }),
      })
    );
    // One click is one feature, one history step, one event, one render.
    expect(context.store.add).toHaveBeenCalledTimes(1);
    expect(context.history.push).toHaveBeenCalledTimes(1);
    expect(context.events.emit).toHaveBeenCalledTimes(1);
    expect(context.render.renderFeatures).toHaveBeenCalledTimes(1);
  });

  it('should not create a Point feature on pointer down alone', () => {
    mode.activate();
    mode.onPointerDown(createPointerEvent(139.7, 35.6));

    expect(context.store.add).not.toHaveBeenCalled();
  });

  it('should create a Point feature on tap when active', () => {
    mode.activate();
    tap(mode, 1, 2);

    expect(context.store.add).toHaveBeenCalledWith(
      expect.objectContaining({
        geometry: { type: 'Point', coordinates: [1, 2] },
      })
    );
  });

  it('should stay in mode after creating a point (continuous placement)', () => {
    mode.activate();
    click(mode, 0, 0);
    click(mode, 10, 10);

    expect(context.store.add).toHaveBeenCalledTimes(2);
  });

  describe('drag is left to the map', () => {
    it('should not create a point when the mouse is dragged', () => {
      mode.activate();
      // 10px of travel, well beyond the 3px mouse click tolerance.
      drag(mode, [0, 0], [1, 0]);

      expect(context.store.add).not.toHaveBeenCalled();
    });

    it('should not create a point when a finger is dragged', () => {
      mode.activate();
      // 100px of travel, well beyond the 12px tap tolerance.
      drag(mode, [0, 0], [10, 0], 'touch');

      expect(context.store.add).not.toHaveBeenCalled();
    });

    it('should not create a point when the mouse travels a finger-sized distance', () => {
      mode.activate();
      // 12px is within the tap tolerance but well beyond the mouse one.
      drag(mode, [0, 0], [1.2, 0]);

      expect(context.store.add).not.toHaveBeenCalled();
    });

    it('should still create a point when a finger wobbles within the tap tolerance', () => {
      mode.activate();
      // 10px of travel: a drag for a mouse, still a tap for a finger.
      drag(mode, [0, 0], [1, 0], 'touch');

      expect(context.store.add).toHaveBeenCalledWith(
        expect.objectContaining({
          geometry: { type: 'Point', coordinates: [1, 0] },
        })
      );
    });

    it('should still create a point when the mouse wobbles within the click tolerance', () => {
      mode.activate();
      // 2px of travel, within the 3px mouse click tolerance.
      drag(mode, [0, 0], [0.2, 0]);

      expect(context.store.add).toHaveBeenCalledWith(
        expect.objectContaining({
          geometry: { type: 'Point', coordinates: [0.2, 0] },
        })
      );
    });

    it('should not create a point from a pointer up without a pointer down', () => {
      mode.activate();
      // The mode was entered while the pointer was already held down.
      mode.onPointerUp(createPointerEvent(5, 5));

      expect(context.store.add).not.toHaveBeenCalled();
    });

    it('should forget a pending pointer down when the mode is deactivated', () => {
      mode.activate();
      mode.onPointerDown(createPointerEvent(5, 5));
      mode.deactivate();
      mode.activate();
      mode.onPointerUp(createPointerEvent(5, 5));

      expect(context.store.add).not.toHaveBeenCalled();
    });
  });

  describe('long press', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should not create a point from the pointer up that precedes a long press', () => {
      mode.activate();

      // TouchInput emits onPointerUp first, then onLongPress.
      mode.onPointerDown(createPointerEvent(10, 10, 'touch'));
      vi.advanceTimersByTime(600);
      mode.onPointerUp(createPointerEvent(10, 10, 'touch'));

      expect(context.store.add).not.toHaveBeenCalled();
    });

    it('should still create a point for a tap held briefly', () => {
      mode.activate();

      mode.onPointerDown(createPointerEvent(0, 0, 'touch'));
      vi.advanceTimersByTime(120);
      mode.onPointerUp(createPointerEvent(0, 0, 'touch'));

      expect(context.store.add).toHaveBeenCalledTimes(1);
    });
  });

  it('should clear snap indicator on deactivate', () => {
    mode.activate();
    mode.deactivate();

    expect(context.render.clearSnapIndicator).toHaveBeenCalled();
  });

  it('should clear snap indicator on Escape', () => {
    mode.activate();
    mode.onKeyDown('Escape', new KeyboardEvent('keydown', { key: 'Escape' }));

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

  describe('snap', () => {
    const existingFeature: LibreDrawFeature = {
      id: 'existing',
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
      properties: {},
    };

    function createSnapContext(): ModeContext {
      const snapContext = createMockContext();
      snapContext.getSnapConfig = () => ({ enabled: true, threshold: 10 });
      vi.mocked(snapContext.store.getAll).mockReturnValue([existingFeature]);
      return snapContext;
    }

    it('should show snap indicator on pointer move when snap is enabled', () => {
      const snapContext = createSnapContext();
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

    it('should not update the snap indicator while the pointer is held down', () => {
      const snapContext = createSnapContext();
      const snapMode = new DrawPointMode(snapContext);
      snapMode.activate();

      snapMode.onPointerDown(createPointerEvent(50, 50));
      vi.mocked(snapContext.render.renderSnapIndicator).mockClear();
      vi.mocked(snapContext.render.clearSnapIndicator).mockClear();

      // Dragging over a snap target must not light it up: the map is panning.
      snapMode.onPointerMove(createPointerEvent(0.05, 0.05));

      expect(snapContext.render.renderSnapIndicator).not.toHaveBeenCalled();
      expect(snapContext.render.clearSnapIndicator).not.toHaveBeenCalled();
    });

    it('should snap the created point to a nearby vertex', () => {
      const snapContext = createSnapContext();
      const snapMode = new DrawPointMode(snapContext);
      snapMode.activate();

      click(snapMode, 0.05, 0.05);

      expect(snapContext.store.add).toHaveBeenCalledWith(
        expect.objectContaining({
          geometry: { type: 'Point', coordinates: [0, 0] },
        })
      );
    });
  });
});
