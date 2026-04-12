import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DrawMode } from '../../../src/modes/DrawMode';
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
    getScreenPoint: vi.fn((lngLat) => ({ x: lngLat.lng * 10, y: lngLat.lat * 10 })),
    setDragPan: vi.fn(),
    getSetbackDistance: () => 10,
    getSnapConfig: () => ({ enabled: false, threshold: 10 }),
    getViewportBounds: () => ({ west: -180, south: -90, east: 180, north: 90 }),
  };
}

function createPointerEvent(
  lng: number,
  lat: number,
  x?: number,
  y?: number,
): NormalizedInputEvent {
  return {
    lngLat: { lng, lat },
    point: { x: x ?? lng * 10, y: y ?? lat * 10 },
    originalEvent: new MouseEvent('click'),
    inputType: 'mouse',
  };
}

describe('DrawMode', () => {
  let context: ModeContext;
  let drawMode: DrawMode;

  beforeEach(() => {
    context = createMockContext();
    drawMode = new DrawMode(context);
  });

  it('should not respond to events when inactive', () => {
    drawMode.onPointerDown(createPointerEvent(0, 0));
    expect(context.render.renderPreview).not.toHaveBeenCalled();
  });

  it('should add vertices on pointerDown when active', () => {
    drawMode.activate();
    drawMode.onPointerDown(createPointerEvent(0, 0));

    expect(context.render.renderPreview).toHaveBeenCalled();
  });

  it('should update preview on pointer move after first vertex', () => {
    drawMode.activate();
    drawMode.onPointerDown(createPointerEvent(0, 0));
    drawMode.onPointerMove(createPointerEvent(5, 5));

    expect(context.render.renderPreview).toHaveBeenCalledTimes(2);
  });

  it('should not update preview on pointer move with no vertices', () => {
    drawMode.activate();
    drawMode.onPointerMove(createPointerEvent(5, 5));

    expect(context.render.renderPreview).not.toHaveBeenCalled();
  });

  it('should finalize polygon on double click with 3+ vertices', () => {
    drawMode.activate();

    // Add 4 vertices (the 4th is from the double-click's first click)
    drawMode.onPointerDown(createPointerEvent(0, 0));
    drawMode.onPointerDown(createPointerEvent(10, 0));
    drawMode.onPointerDown(createPointerEvent(10, 10));
    drawMode.onPointerDown(createPointerEvent(5, 5)); // extra from dblclick

    const dblClickEvent = createPointerEvent(5, 5);
    vi.spyOn(dblClickEvent.originalEvent, 'preventDefault');
    vi.spyOn(dblClickEvent.originalEvent, 'stopPropagation');

    drawMode.onDoubleClick(dblClickEvent);

    expect(context.store.add).toHaveBeenCalled();
    expect(context.history.push).toHaveBeenCalled();
    expect(context.events.emit).toHaveBeenCalledWith(
      'create',
      expect.objectContaining({
        feature: expect.objectContaining({ type: 'Feature' }),
      }),
    );
    expect(context.render.clearPreview).toHaveBeenCalled();
    expect(dblClickEvent.originalEvent.preventDefault).toHaveBeenCalled();
  });

  it('should cancel drawing on Escape key', () => {
    drawMode.activate();
    drawMode.onPointerDown(createPointerEvent(0, 0));
    drawMode.onPointerDown(createPointerEvent(10, 0));

    drawMode.onKeyDown('Escape', new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(context.render.clearPreview).toHaveBeenCalled();
  });

  it('should remove last vertex on long press', () => {
    drawMode.activate();
    drawMode.onPointerDown(createPointerEvent(0, 0));
    drawMode.onPointerDown(createPointerEvent(10, 0));

    drawMode.onLongPress(createPointerEvent(0, 0));

    // Should render preview with remaining vertex
    expect(context.render.renderPreview).toHaveBeenCalled();
  });

  it('should clear preview when long press removes last vertex', () => {
    drawMode.activate();
    drawMode.onPointerDown(createPointerEvent(0, 0));

    // Clear previous calls
    vi.mocked(context.render.clearPreview).mockClear();

    drawMode.onLongPress(createPointerEvent(0, 0));

    expect(context.render.clearPreview).toHaveBeenCalled();
  });

  it('should clear preview and reset on deactivate', () => {
    drawMode.activate();
    drawMode.onPointerDown(createPointerEvent(0, 0));

    vi.mocked(context.render.clearPreview).mockClear();
    drawMode.deactivate();

    expect(context.render.clearPreview).toHaveBeenCalled();
  });

  it('should close polygon when clicking near first vertex', () => {
    drawMode.activate();

    // getScreenPoint: lng*10, lat*10
    drawMode.onPointerDown(createPointerEvent(0, 0)); // first vertex at screen (0, 0)
    drawMode.onPointerDown(createPointerEvent(10, 0));
    drawMode.onPointerDown(createPointerEvent(10, 10));

    // Click near first vertex (within 10px threshold)
    // First vertex screen point: (0, 0), clicking at screen (1, 1) → distance ~1.4px
    drawMode.onPointerDown(createPointerEvent(0.1, 0.1, 1, 1));

    expect(context.store.add).toHaveBeenCalled();
  });

  it('should use snapped position for preview after vertex addition', () => {
    // Create a new context with snap enabled
    const snapContext = createMockContext();
    const snapFeature: LibreDrawFeature = {
      id: 'snap-target',
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[[5, 5], [15, 5], [15, 15], [5, 15], [5, 5]]],
      },
      properties: {},
    };
    vi.mocked(snapContext.store.getAll).mockReturnValue([snapFeature]);
    snapContext.getSnapConfig = () => ({ enabled: true, threshold: 20 });

    const snapDrawMode = new DrawMode(snapContext);
    snapDrawMode.activate();

    // First vertex (no snap, far from target)
    snapDrawMode.onPointerDown(createPointerEvent(0, 0));

    // Second vertex near snap target vertex (5,5) - the mock getScreenPoint
    // returns (lng*10, lat*10), so (5,5) -> screen (50,50)
    // Clicking at (4.5, 4.5) -> screen (45,45), distance to (50,50) = ~7px < 20px threshold
    vi.mocked(snapContext.render.renderPreview).mockClear();
    snapDrawMode.onPointerDown(createPointerEvent(4.5, 4.5));

    // Preview should have been called with snapped vertex coordinates [5,5], not [4.5,4.5]
    const previewCall = vi.mocked(snapContext.render.renderPreview).mock.calls[0];
    const previewCoords = previewCall[0];
    const addedVertex = previewCoords[1]; // second vertex (the one just added)
    expect(addedVertex[0]).toBe(5);
    expect(addedVertex[1]).toBe(5);
  });

  // --- Self-intersection prevention ---

  describe('self-intersection prevention', () => {
    it('should reject vertex that would create self-intersecting edge', () => {
      drawMode.activate();

      // Draw an L-shape: (0,0) → (10,0) → (10,5) → (5,5)
      drawMode.onPointerDown(createPointerEvent(0, 0));
      drawMode.onPointerDown(createPointerEvent(10, 0));
      drawMode.onPointerDown(createPointerEvent(10, 5));
      drawMode.onPointerDown(createPointerEvent(5, 5));

      const previewCallCount = vi.mocked(context.render.renderPreview).mock.calls.length;

      // Adding (5,-5) would create edge (5,5)→(5,-5) which crosses (0,0)→(10,0)
      drawMode.onPointerDown(createPointerEvent(5, -5));

      // Preview should NOT have been updated (vertex rejected)
      expect(vi.mocked(context.render.renderPreview).mock.calls.length).toBe(previewCallCount);
    });

    it('should allow vertex that does not create intersection', () => {
      drawMode.activate();

      drawMode.onPointerDown(createPointerEvent(0, 0));
      drawMode.onPointerDown(createPointerEvent(10, 0));
      drawMode.onPointerDown(createPointerEvent(10, 10));

      const previewCallCount = vi.mocked(context.render.renderPreview).mock.calls.length;

      // Adding (0,10) is fine — no intersection
      drawMode.onPointerDown(createPointerEvent(0, 10));

      expect(vi.mocked(context.render.renderPreview).mock.calls.length).toBe(previewCallCount + 1);
    });

    it('should reject double-click finalization that would cause closing intersection', () => {
      drawMode.activate();

      // Create vertices where closing would cause intersection:
      // (0,0) → (10,0) → (5,10) → (15,5)
      drawMode.onPointerDown(createPointerEvent(0, 0));
      drawMode.onPointerDown(createPointerEvent(10, 0));
      drawMode.onPointerDown(createPointerEvent(5, 10));
      drawMode.onPointerDown(createPointerEvent(15, 5));

      // Extra click from double-click
      drawMode.onPointerDown(createPointerEvent(12, 4));

      const dblClickEvent = createPointerEvent(12, 4);
      vi.spyOn(dblClickEvent.originalEvent, 'preventDefault').mockImplementation(() => {});
      vi.spyOn(dblClickEvent.originalEvent, 'stopPropagation').mockImplementation(() => {});

      drawMode.onDoubleClick(dblClickEvent);

      // Polygon should NOT have been created
      expect(context.store.add).not.toHaveBeenCalled();
    });

    it('should reject click-to-close that would cause closing intersection', () => {
      drawMode.activate();

      // (0,0) → (10,0) → (5,10) → (15,5)
      // Closing (15,5)→(0,0) would cross (10,0)→(5,10)
      drawMode.onPointerDown(createPointerEvent(0, 0));
      drawMode.onPointerDown(createPointerEvent(10, 0));
      drawMode.onPointerDown(createPointerEvent(5, 10));
      drawMode.onPointerDown(createPointerEvent(15, 5));

      // Click near first vertex to close
      drawMode.onPointerDown(createPointerEvent(0, 0, 0, 0));

      // Polygon should NOT have been created (closing would self-intersect)
      expect(context.store.add).not.toHaveBeenCalled();
    });

    it('should allow valid polygon creation via double-click', () => {
      drawMode.activate();

      // Simple square
      drawMode.onPointerDown(createPointerEvent(0, 0));
      drawMode.onPointerDown(createPointerEvent(10, 0));
      drawMode.onPointerDown(createPointerEvent(10, 10));
      drawMode.onPointerDown(createPointerEvent(5, 5)); // extra from dblclick

      const dblClickEvent = createPointerEvent(5, 5);
      vi.spyOn(dblClickEvent.originalEvent, 'preventDefault').mockImplementation(() => {});
      vi.spyOn(dblClickEvent.originalEvent, 'stopPropagation').mockImplementation(() => {});

      drawMode.onDoubleClick(dblClickEvent);

      expect(context.store.add).toHaveBeenCalled();
    });
  });
});
