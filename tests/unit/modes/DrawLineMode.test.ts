import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DrawLineMode } from '../../../src/modes/DrawLineMode';
import type { ModeContext } from '../../../src/core/ModeContext';
import type { NormalizedInputEvent, InputType } from '../../../src/types/input';
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
      renderRotationCenter: vi.fn(),
      clearRotationCenter: vi.fn(),
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
  inputType: InputType = 'mouse'
): NormalizedInputEvent {
  return {
    lngLat: { lng, lat },
    point: { x: lng * 10, y: lat * 10 },
    originalEvent: new MouseEvent('click'),
    inputType,
  };
}

/** A click or tap: pointer down and up at the same position. */
function clickAt(
  mode: DrawLineMode,
  lng: number,
  lat: number,
  inputType: InputType = 'mouse'
): void {
  mode.onPointerDown(createPointerEvent(lng, lat, inputType));
  mode.onPointerUp(createPointerEvent(lng, lat, inputType));
}

describe('DrawLineMode', () => {
  let context: ModeContext;
  let mode: DrawLineMode;

  beforeEach(() => {
    context = createMockContext();
    mode = new DrawLineMode(context);
  });

  afterEach(() => {
    vi.useRealTimers();
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

  it('should finalize a LineString by clicking the last vertex with 2+ vertices', () => {
    mode.activate();
    clickAt(mode, 0, 0);
    clickAt(mode, 10, 5);
    clickAt(mode, 10, 5);

    expect(context.store.add).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [
            [0, 0],
            [10, 5],
          ],
        },
      })
    );
    expect(context.history.push).toHaveBeenCalled();
    expect(context.events.emit).toHaveBeenCalledWith(
      'create',
      expect.objectContaining({
        feature: expect.objectContaining({
          geometry: expect.objectContaining({ type: 'LineString' }),
        }),
      })
    );
  });

  it('should not finalize with fewer than 2 vertices', () => {
    mode.activate();
    clickAt(mode, 0, 0);
    clickAt(mode, 0, 0);

    expect(context.store.add).not.toHaveBeenCalled();
  });

  it('should not add a duplicate vertex when clicking the only vertex', () => {
    mode.activate();
    clickAt(mode, 0, 0);
    vi.mocked(context.events.emit).mockClear();

    clickAt(mode, 0, 0);

    expect(mode.getDraftVertexCount()).toBe(1);
    expect(context.events.emit).not.toHaveBeenCalled();
  });

  it('should finish a mouse double click at a new spot without leaving an extra vertex', () => {
    mode.activate();
    clickAt(mode, 0, 0);

    // Browser order for a double click: down/up, down/up, dblclick.
    clickAt(mode, 10, 5); // places the 2nd vertex
    clickAt(mode, 10, 5); // lands on it → finish
    const dblClickEvent = createPointerEvent(10, 5);
    vi.spyOn(dblClickEvent.originalEvent, 'preventDefault');
    vi.spyOn(dblClickEvent.originalEvent, 'stopPropagation');
    mode.onDoubleClick(dblClickEvent);

    expect(context.store.add).toHaveBeenCalledTimes(1);
    expect(vi.mocked(context.store.add).mock.calls[0][0].geometry.coordinates).toEqual([
      [0, 0],
      [10, 5],
    ]);
  });

  it('should not pop a vertex or finish on double click alone', () => {
    mode.activate();
    clickAt(mode, 0, 0);
    clickAt(mode, 10, 5);
    clickAt(mode, 20, 10);
    vi.mocked(context.events.emit).mockClear();

    mode.onDoubleClick(createPointerEvent(20, 10));

    expect(context.store.add).not.toHaveBeenCalled();
    expect(mode.getDraftVertexCount()).toBe(3);
    expect(context.events.emit).not.toHaveBeenCalled();
  });

  it('should not treat the first vertex as a finish target', () => {
    mode.activate();
    clickAt(mode, 0, 0);
    clickAt(mode, 10, 5);

    // Clicking back on the first vertex adds a vertex there (open path).
    clickAt(mode, 0, 0);

    expect(context.store.add).not.toHaveBeenCalled();
    expect(mode.getDraftVertexCount()).toBe(3);
  });

  it('should not finish when the pointer drags off the vertex before release', () => {
    mode.activate();
    clickAt(mode, 0, 0);
    clickAt(mode, 10, 5);

    mode.onPointerDown(createPointerEvent(10, 5));
    mode.onPointerUp(createPointerEvent(10.5, 5)); // 5px > mouse tolerance

    expect(context.store.add).not.toHaveBeenCalled();
    expect(mode.getDraftVertexCount()).toBe(2);
  });

  it('should use the snap threshold as the mouse radius and widen it for touch', () => {
    mode.activate();
    clickAt(mode, 0, 0);
    clickAt(mode, 10, 5);

    // 20px away: outside the 10px mouse radius → new vertex.
    clickAt(mode, 12, 5);
    expect(mode.getDraftVertexCount()).toBe(3);

    // 20px away with touch: inside the 22px radius → finish.
    clickAt(mode, 14, 5, 'touch');
    expect(context.store.add).toHaveBeenCalledTimes(1);
  });

  it('should finish on two slow touch taps at the same spot', () => {
    vi.useFakeTimers();
    mode.activate();
    clickAt(mode, 0, 0, 'touch');
    clickAt(mode, 10, 5, 'touch');

    vi.advanceTimersByTime(1000); // well past any double-tap window
    clickAt(mode, 10, 5, 'touch');

    expect(context.store.add).toHaveBeenCalledTimes(1);
  });

  it('should place two vertices on two quick touch taps at different spots', () => {
    mode.activate();
    clickAt(mode, 0, 0, 'touch');
    clickAt(mode, 10, 5, 'touch');
    clickAt(mode, 20, 10, 'touch');

    expect(context.store.add).not.toHaveBeenCalled();
    expect(mode.getDraftVertexCount()).toBe(3);
  });

  it('should treat a touch release after the long-press delay as the long press', () => {
    vi.useFakeTimers();
    mode.activate();
    clickAt(mode, 0, 0, 'touch');
    clickAt(mode, 10, 5, 'touch');

    mode.onPointerDown(createPointerEvent(10, 5, 'touch'));
    vi.advanceTimersByTime(500);
    mode.onPointerUp(createPointerEvent(10, 5, 'touch'));
    mode.onLongPress(createPointerEvent(10, 5, 'touch'));

    expect(context.store.add).not.toHaveBeenCalled();
    expect(mode.getDraftVertexCount()).toBe(1);
  });

  it('should show the snap indicator on the last vertex and snap the preview to it', () => {
    mode.activate();
    clickAt(mode, 0, 0);
    clickAt(mode, 10, 5);
    vi.mocked(context.render.renderSnapIndicator).mockClear();
    vi.mocked(context.render.renderPreview).mockClear();

    mode.onPointerMove(createPointerEvent(10.5, 5));

    expect(context.render.renderSnapIndicator).toHaveBeenCalledWith([10, 5]);
    expect(vi.mocked(context.render.renderPreview).mock.calls[0][0]).toEqual([
      [0, 0],
      [10, 5],
      [10, 5],
    ]);
  });

  it('should stay in mode after finalization for continuous drawing', () => {
    mode.activate();
    clickAt(mode, 0, 0);
    clickAt(mode, 10, 5);
    clickAt(mode, 10, 5);

    expect(context.store.add).toHaveBeenCalledTimes(1);

    // Can start drawing again
    clickAt(mode, 20, 20);
    clickAt(mode, 30, 30);
    clickAt(mode, 30, 30);

    expect(context.store.add).toHaveBeenCalledTimes(2);
  });

  it('should cancel drawing on Escape', () => {
    mode.activate();
    mode.onPointerDown(createPointerEvent(0, 0));
    mode.onPointerDown(createPointerEvent(10, 5));

    mode.onKeyDown('Escape', new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(context.render.clearPreview).toHaveBeenCalled();
    expect(context.render.clearSnapIndicator).toHaveBeenCalled();

    // After cancel, a click where the last vertex was starts a new draft
    clickAt(mode, 10, 5);
    expect(context.store.add).not.toHaveBeenCalled();
    expect(mode.getDraftVertexCount()).toBe(1);
  });

  it('should remove last vertex on long press', () => {
    mode.activate();
    mode.onPointerDown(createPointerEvent(0, 0));
    mode.onPointerDown(createPointerEvent(10, 5));
    mode.onPointerDown(createPointerEvent(20, 10));

    mode.onLongPress(createPointerEvent(20, 10));

    // Now should have 2 vertices, clicking the last one finalizes
    clickAt(mode, 10, 5);

    expect(context.store.add).toHaveBeenCalledWith(
      expect.objectContaining({
        geometry: {
          type: 'LineString',
          coordinates: [
            [0, 0],
            [10, 5],
          ],
        },
      })
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

  it('should use snapped position for preview after vertex addition', () => {
    const snapContext = createMockContext();
    const snapFeature: LibreDrawFeature = {
      id: 'snap-target',
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [5, 5],
            [15, 5],
            [15, 15],
            [5, 15],
            [5, 5],
          ],
        ],
      },
      properties: {},
    };
    vi.mocked(snapContext.store.getAll).mockReturnValue([snapFeature]);
    snapContext.getSnapConfig = () => ({ enabled: true, threshold: 20 });

    const snapMode = new DrawLineMode(snapContext);
    snapMode.activate();
    snapMode.onPointerDown(createPointerEvent(0, 0));

    vi.mocked(snapContext.render.renderPreview).mockClear();
    // Click near snap target vertex (5,5)
    snapMode.onPointerDown(createPointerEvent(4.5, 4.5));

    const previewCall = vi.mocked(snapContext.render.renderPreview).mock.calls[0];
    const previewCoords = previewCall[0];
    // Second vertex should be snapped to (5,5)
    const addedVertex = previewCoords[1];
    expect(addedVertex[0]).toBe(5);
    expect(addedVertex[1]).toBe(5);
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

  describe('draft vertex markers', () => {
    it('should render a dot for each placed vertex', () => {
      mode.activate();
      mode.onPointerDown(createPointerEvent(0, 0));

      expect(context.render.renderVertices).toHaveBeenLastCalledWith([[0, 0]], []);

      mode.onPointerDown(createPointerEvent(10, 0));

      expect(context.render.renderVertices).toHaveBeenLastCalledWith(
        [
          [0, 0],
          [10, 0],
        ],
        []
      );
    });

    it('should not add a dot for the hovered cursor position', () => {
      mode.activate();
      mode.onPointerDown(createPointerEvent(0, 0));
      vi.mocked(context.render.renderVertices).mockClear();

      mode.onPointerMove(createPointerEvent(5, 5));

      // Only placed vertices get a dot; the cursor is shown by the preview.
      expect(context.render.renderVertices).not.toHaveBeenCalled();
    });

    it('should drop the dot of the vertex removed by a long press', () => {
      mode.activate();
      mode.onPointerDown(createPointerEvent(0, 0));
      mode.onPointerDown(createPointerEvent(10, 0));

      mode.onLongPress(createPointerEvent(10, 0));

      expect(context.render.renderVertices).toHaveBeenLastCalledWith([[0, 0]], []);
    });

    it('should clear the dots once the last vertex is removed', () => {
      mode.activate();
      mode.onPointerDown(createPointerEvent(0, 0));

      mode.onLongPress(createPointerEvent(0, 0));

      expect(context.render.clearVertices).toHaveBeenCalled();
    });

    it('should clear the dots on cancelDrawing()', () => {
      mode.activate();
      mode.onPointerDown(createPointerEvent(0, 0));
      vi.mocked(context.render.clearVertices).mockClear();

      mode.cancelDrawing();

      expect(context.render.clearVertices).toHaveBeenCalled();
    });

    it('should clear the dots on deactivate()', () => {
      mode.activate();
      mode.onPointerDown(createPointerEvent(0, 0));
      vi.mocked(context.render.clearVertices).mockClear();

      mode.deactivate();

      expect(context.render.clearVertices).toHaveBeenCalled();
    });
  });
});
