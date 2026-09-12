import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DrawPolygonMode } from '../../../src/modes/DrawPolygonMode';
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
    // Screen space is lng*10 / lat*10: one unit of lng is 10px.
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
  options: { x?: number; y?: number; inputType?: InputType } = {}
): NormalizedInputEvent {
  return {
    lngLat: { lng, lat },
    point: { x: options.x ?? lng * 10, y: options.y ?? lat * 10 },
    originalEvent: new MouseEvent('click'),
    inputType: options.inputType ?? 'mouse',
  };
}

/** A click or tap: pointer down and up at the same position. */
function clickAt(
  mode: DrawPolygonMode,
  lng: number,
  lat: number,
  options: { x?: number; y?: number; inputType?: InputType } = {}
): void {
  mode.onPointerDown(createPointerEvent(lng, lat, options));
  mode.onPointerUp(createPointerEvent(lng, lat, options));
}

describe('DrawPolygonMode', () => {
  let context: ModeContext;
  let drawPolygonMode: DrawPolygonMode;

  beforeEach(() => {
    context = createMockContext();
    drawPolygonMode = new DrawPolygonMode(context);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Place a triangle (0,0) → (10,0) → (10,10) with plain clicks. */
  function placeTriangle(inputType: InputType = 'mouse'): void {
    clickAt(drawPolygonMode, 0, 0, { inputType });
    clickAt(drawPolygonMode, 10, 0, { inputType });
    clickAt(drawPolygonMode, 10, 10, { inputType });
  }

  it('should not respond to events when inactive', () => {
    clickAt(drawPolygonMode, 0, 0);
    expect(context.render.renderPreview).not.toHaveBeenCalled();
  });

  it('should add vertices on click when active', () => {
    drawPolygonMode.activate();
    clickAt(drawPolygonMode, 0, 0);

    expect(context.render.renderPreview).toHaveBeenCalled();
  });

  it('should update preview on pointer move after first vertex', () => {
    drawPolygonMode.activate();
    clickAt(drawPolygonMode, 0, 0);
    drawPolygonMode.onPointerMove(createPointerEvent(5, 5));

    expect(context.render.renderPreview).toHaveBeenCalledTimes(2);
  });

  it('should not update preview on pointer move with no vertices', () => {
    drawPolygonMode.activate();
    drawPolygonMode.onPointerMove(createPointerEvent(5, 5));

    expect(context.render.renderPreview).not.toHaveBeenCalled();
  });

  it('should cancel drawing on Escape key', () => {
    drawPolygonMode.activate();
    clickAt(drawPolygonMode, 0, 0);
    clickAt(drawPolygonMode, 10, 0);

    drawPolygonMode.onKeyDown('Escape', new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(context.render.clearPreview).toHaveBeenCalled();
  });

  it('should remove last vertex on long press', () => {
    drawPolygonMode.activate();
    clickAt(drawPolygonMode, 0, 0);
    clickAt(drawPolygonMode, 10, 0);

    drawPolygonMode.onLongPress(createPointerEvent(0, 0));

    // Should render preview with remaining vertex
    expect(context.render.renderPreview).toHaveBeenCalled();
  });

  it('should clear preview when long press removes last vertex', () => {
    drawPolygonMode.activate();
    clickAt(drawPolygonMode, 0, 0);

    // Clear previous calls
    vi.mocked(context.render.clearPreview).mockClear();

    drawPolygonMode.onLongPress(createPointerEvent(0, 0));

    expect(context.render.clearPreview).toHaveBeenCalled();
  });

  it('should clear preview and reset on deactivate', () => {
    drawPolygonMode.activate();
    clickAt(drawPolygonMode, 0, 0);

    vi.mocked(context.render.clearPreview).mockClear();
    drawPolygonMode.deactivate();

    expect(context.render.clearPreview).toHaveBeenCalled();
  });

  it('should use snapped position for preview after vertex addition', () => {
    // Create a new context with snap enabled
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

    const snapDrawPolygonMode = new DrawPolygonMode(snapContext);
    snapDrawPolygonMode.activate();

    // First vertex (no snap, far from target)
    clickAt(snapDrawPolygonMode, 0, 0);

    // Second vertex near snap target vertex (5,5) - the mock getScreenPoint
    // returns (lng*10, lat*10), so (5,5) -> screen (50,50)
    // Clicking at (4.5, 4.5) -> screen (45,45), distance to (50,50) = ~7px < 20px threshold
    vi.mocked(snapContext.render.renderPreview).mockClear();
    clickAt(snapDrawPolygonMode, 4.5, 4.5);

    // Preview should have been called with snapped vertex coordinates [5,5], not [4.5,4.5]
    const previewCall = vi.mocked(snapContext.render.renderPreview).mock.calls[0];
    const previewCoords = previewCall[0];
    const addedVertex = previewCoords[1]; // second vertex (the one just added)
    expect(addedVertex[0]).toBe(5);
    expect(addedVertex[1]).toBe(5);
  });

  // --- Position-based finishing ---

  describe('finishing on a draft vertex', () => {
    it('should close the polygon by clicking the first vertex with 3+ vertices', () => {
      drawPolygonMode.activate();
      placeTriangle();

      // First vertex is at screen (0,0); clicking at (1,1) is ~1.4px away.
      clickAt(drawPolygonMode, 0.1, 0.1, { x: 1, y: 1 });

      expect(context.store.add).toHaveBeenCalledWith(
        expect.objectContaining({
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [0, 0],
                [10, 0],
                [10, 10],
                [0, 0],
              ],
            ],
          },
        })
      );
      expect(context.history.push).toHaveBeenCalled();
      expect(context.events.emit).toHaveBeenCalledWith(
        'create',
        expect.objectContaining({ feature: expect.objectContaining({ type: 'Feature' }) })
      );
      expect(context.render.clearPreview).toHaveBeenCalled();
    });

    it('should close the polygon by clicking the last placed vertex with 3+ vertices', () => {
      drawPolygonMode.activate();
      placeTriangle();

      clickAt(drawPolygonMode, 10, 10);

      expect(context.store.add).toHaveBeenCalledTimes(1);
      expect(context.events.emit).toHaveBeenLastCalledWith('draftchange', { vertexCount: 0 });
    });

    it('should finish a mouse double click at a new spot without leaving an extra vertex', () => {
      drawPolygonMode.activate();
      placeTriangle();

      // Browser order for a double click: down/up, down/up, dblclick.
      clickAt(drawPolygonMode, 5, 15); // places the 4th vertex
      clickAt(drawPolygonMode, 5, 15); // lands on it → finish

      const dblClickEvent = createPointerEvent(5, 15);
      vi.spyOn(dblClickEvent.originalEvent, 'preventDefault');
      vi.spyOn(dblClickEvent.originalEvent, 'stopPropagation');
      drawPolygonMode.onDoubleClick(dblClickEvent);

      expect(context.store.add).toHaveBeenCalledTimes(1);
      const ring = vi.mocked(context.store.add).mock.calls[0][0].geometry.coordinates[0];
      expect(ring).toEqual([
        [0, 0],
        [10, 0],
        [10, 10],
        [5, 15],
        [0, 0],
      ]);
      expect(dblClickEvent.originalEvent.preventDefault).toHaveBeenCalled();
      expect(dblClickEvent.originalEvent.stopPropagation).toHaveBeenCalled();
    });

    it('should not pop a vertex or finish on double click alone', () => {
      drawPolygonMode.activate();
      placeTriangle();
      vi.mocked(context.events.emit).mockClear();

      drawPolygonMode.onDoubleClick(createPointerEvent(5, 5));

      expect(context.store.add).not.toHaveBeenCalled();
      expect(context.events.emit).not.toHaveBeenCalledWith('draftchange', expect.anything());
      expect(drawPolygonMode.getDraftVertexCount()).toBe(3);
    });

    it('should not add a vertex when clicking the last vertex with fewer than 3 vertices', () => {
      drawPolygonMode.activate();
      clickAt(drawPolygonMode, 0, 0);
      clickAt(drawPolygonMode, 10, 0);
      vi.mocked(context.events.emit).mockClear();

      clickAt(drawPolygonMode, 10, 0);

      expect(drawPolygonMode.getDraftVertexCount()).toBe(2);
      expect(context.store.add).not.toHaveBeenCalled();
      expect(context.events.emit).not.toHaveBeenCalled();
    });

    it('should not add a vertex when clicking the first vertex with fewer than 3 vertices', () => {
      drawPolygonMode.activate();
      clickAt(drawPolygonMode, 0, 0);
      clickAt(drawPolygonMode, 10, 0);

      clickAt(drawPolygonMode, 0, 0);

      expect(drawPolygonMode.getDraftVertexCount()).toBe(2);
      expect(context.store.add).not.toHaveBeenCalled();
    });

    it('should not finish when the pointer drags off the vertex before release', () => {
      drawPolygonMode.activate();
      placeTriangle();

      drawPolygonMode.onPointerDown(createPointerEvent(10, 10));
      drawPolygonMode.onPointerUp(createPointerEvent(10.5, 10)); // 5px > mouse tolerance

      expect(context.store.add).not.toHaveBeenCalled();
      expect(drawPolygonMode.getDraftVertexCount()).toBe(3);
    });

    it('should ignore a pointer up with no pending finish', () => {
      drawPolygonMode.activate();
      placeTriangle();

      drawPolygonMode.onPointerUp(createPointerEvent(10, 10));

      expect(context.store.add).not.toHaveBeenCalled();
    });

    it('should use the snap threshold as the mouse radius', () => {
      drawPolygonMode.activate();
      placeTriangle();

      // 10px from the last vertex is on the boundary → finish.
      clickAt(drawPolygonMode, 11, 10);
      expect(context.store.add).toHaveBeenCalledTimes(1);
    });

    it('should place a new vertex just outside the mouse radius', () => {
      drawPolygonMode.activate();
      placeTriangle();

      // 11px from the last vertex → a new vertex, not a finish.
      clickAt(drawPolygonMode, 11.1, 10);

      expect(context.store.add).not.toHaveBeenCalled();
      expect(drawPolygonMode.getDraftVertexCount()).toBe(4);
    });

    it('should widen the radius by the tap tolerance for touch', () => {
      drawPolygonMode.activate();
      placeTriangle('touch');

      // 20px from the last vertex: outside the 10px mouse radius, inside
      // the 22px touch radius.
      clickAt(drawPolygonMode, 12, 10, { inputType: 'touch' });

      expect(context.store.add).toHaveBeenCalledTimes(1);
    });

    it('should still finish when snapping is disabled', () => {
      context.getSnapConfig = () => ({ enabled: false, threshold: 15 });
      drawPolygonMode.activate();
      placeTriangle();

      clickAt(drawPolygonMode, 11.5, 10); // 15px away

      expect(context.store.add).toHaveBeenCalledTimes(1);
    });

    it('should reject a finish on the first vertex that would cause a closing intersection', () => {
      drawPolygonMode.activate();

      // (0,0) → (10,0) → (5,10) → (15,5)
      // Closing (15,5)→(0,0) would cross (10,0)→(5,10)
      clickAt(drawPolygonMode, 0, 0);
      clickAt(drawPolygonMode, 10, 0);
      clickAt(drawPolygonMode, 5, 10);
      clickAt(drawPolygonMode, 15, 5);

      clickAt(drawPolygonMode, 0, 0);

      expect(context.store.add).not.toHaveBeenCalled();
      expect(drawPolygonMode.getDraftVertexCount()).toBe(4);
    });

    it('should reject a finish on the last vertex that would cause a closing intersection', () => {
      drawPolygonMode.activate();

      clickAt(drawPolygonMode, 0, 0);
      clickAt(drawPolygonMode, 10, 0);
      clickAt(drawPolygonMode, 5, 10);
      clickAt(drawPolygonMode, 15, 5);

      clickAt(drawPolygonMode, 15, 5);

      expect(context.store.add).not.toHaveBeenCalled();
      expect(drawPolygonMode.getDraftVertexCount()).toBe(4);
    });
  });

  describe('touch taps', () => {
    it('should finish on two slow taps at the same spot (no double-tap window)', () => {
      vi.useFakeTimers();
      drawPolygonMode.activate();
      clickAt(drawPolygonMode, 0, 0, { inputType: 'touch' });
      clickAt(drawPolygonMode, 10, 0, { inputType: 'touch' });
      clickAt(drawPolygonMode, 10, 10, { inputType: 'touch' });

      vi.advanceTimersByTime(1000); // well past any double-tap window
      clickAt(drawPolygonMode, 10, 10, { inputType: 'touch' });

      expect(context.store.add).toHaveBeenCalledTimes(1);
    });

    it('should place two vertices on two quick taps at different spots', () => {
      drawPolygonMode.activate();
      clickAt(drawPolygonMode, 0, 0, { inputType: 'touch' });
      clickAt(drawPolygonMode, 10, 0, { inputType: 'touch' });

      // Same instant, 10 units (100px) apart: two vertices, no finish.
      clickAt(drawPolygonMode, 10, 10, { inputType: 'touch' });
      clickAt(drawPolygonMode, 0, 10, { inputType: 'touch' });

      expect(context.store.add).not.toHaveBeenCalled();
      expect(drawPolygonMode.getDraftVertexCount()).toBe(4);
    });

    it('should treat a release after the long-press delay as the long press, not a finish', () => {
      vi.useFakeTimers();
      drawPolygonMode.activate();
      placeTriangle('touch');

      // Hold on the last vertex. TouchInput fires pointer up right before
      // the long press.
      drawPolygonMode.onPointerDown(createPointerEvent(10, 10, { inputType: 'touch' }));
      vi.advanceTimersByTime(500);
      drawPolygonMode.onPointerUp(createPointerEvent(10, 10, { inputType: 'touch' }));
      drawPolygonMode.onLongPress(createPointerEvent(10, 10, { inputType: 'touch' }));

      expect(context.store.add).not.toHaveBeenCalled();
      expect(drawPolygonMode.getDraftVertexCount()).toBe(2);
    });
  });

  describe('tap placement', () => {
    it('should not place a vertex on pointer down alone', () => {
      drawPolygonMode.activate();

      drawPolygonMode.onPointerDown(createPointerEvent(0, 0));

      expect(drawPolygonMode.getDraftVertexCount()).toBe(0);
      expect(context.events.emit).not.toHaveBeenCalled();
    });

    it('should not place a vertex when the pointer drags before release', () => {
      drawPolygonMode.activate();

      drawPolygonMode.onPointerDown(createPointerEvent(0, 0));
      drawPolygonMode.onPointerMove(createPointerEvent(2, 2)); // 28px > mouse tolerance
      drawPolygonMode.onPointerUp(createPointerEvent(0.1, 0)); // back near the start

      expect(drawPolygonMode.getDraftVertexCount()).toBe(0);
    });

    it('should not place a vertex on a release that drifted past the tolerance', () => {
      drawPolygonMode.activate();

      drawPolygonMode.onPointerDown(createPointerEvent(0, 0));
      drawPolygonMode.onPointerUp(createPointerEvent(0.5, 0)); // 5px > mouse tolerance

      expect(drawPolygonMode.getDraftVertexCount()).toBe(0);
    });

    it('should not update the preview while the pointer is held down', () => {
      drawPolygonMode.activate();
      placeTriangle();
      vi.mocked(context.render.renderPreview).mockClear();

      drawPolygonMode.onPointerDown(createPointerEvent(5, 15));
      drawPolygonMode.onPointerMove(createPointerEvent(6, 16));

      expect(context.render.renderPreview).not.toHaveBeenCalled();
    });

    it('should place the vertex at the release position', () => {
      drawPolygonMode.activate();

      drawPolygonMode.onPointerDown(createPointerEvent(0, 0));
      drawPolygonMode.onPointerUp(createPointerEvent(0.2, 0)); // 2px, within tolerance

      expect(context.render.renderVertices).toHaveBeenLastCalledWith([[0.2, 0]], []);
    });

    describe('long press (touch) removes only the last vertex', () => {
      // TouchInput order: touchstart → pointer down; 500ms later → pointer up, then long press.
      function longPressAt(lng: number, lat: number): void {
        drawPolygonMode.onPointerDown(createPointerEvent(lng, lat, { inputType: 'touch' }));
        vi.advanceTimersByTime(500);
        drawPolygonMode.onPointerUp(createPointerEvent(lng, lat, { inputType: 'touch' }));
        drawPolygonMode.onLongPress(createPointerEvent(lng, lat, { inputType: 'touch' }));
      }

      // (0,0) → (10,0) → (10,10) → (5,5): concave, so some spots would self-intersect.
      function placeConcave(): void {
        placeTriangle('touch');
        clickAt(drawPolygonMode, 5, 5, { inputType: 'touch' });
      }

      it('in open space', () => {
        vi.useFakeTimers();
        drawPolygonMode.activate();
        placeConcave();

        longPressAt(0, 10);

        expect(drawPolygonMode.getDraftVertexCount()).toBe(3);
        expect(context.render.renderVertices).toHaveBeenLastCalledWith(
          [
            [0, 0],
            [10, 0],
            [10, 10],
          ],
          []
        );
      });

      it('where a new vertex would have self-intersected', () => {
        vi.useFakeTimers();
        drawPolygonMode.activate();
        placeConcave();

        longPressAt(5, -5); // edge (5,5)→(5,-5) would cross (0,0)→(10,0)

        expect(drawPolygonMode.getDraftVertexCount()).toBe(3);
      });

      it('on the first vertex', () => {
        vi.useFakeTimers();
        drawPolygonMode.activate();
        placeConcave();

        longPressAt(0, 0);

        expect(drawPolygonMode.getDraftVertexCount()).toBe(3);
        expect(context.store.add).not.toHaveBeenCalled();
      });

      it('on the last vertex', () => {
        vi.useFakeTimers();
        drawPolygonMode.activate();
        placeConcave();

        longPressAt(5, 5);

        expect(drawPolygonMode.getDraftVertexCount()).toBe(3);
        expect(context.store.add).not.toHaveBeenCalled();
      });
    });
  });

  describe('finish indicator on pointer move', () => {
    it('should show the snap indicator on the first vertex and snap the preview to it', () => {
      drawPolygonMode.activate();
      placeTriangle();
      vi.mocked(context.render.renderSnapIndicator).mockClear();
      vi.mocked(context.render.renderPreview).mockClear();

      drawPolygonMode.onPointerMove(createPointerEvent(0.3, 0.4)); // 5px from (0,0)

      expect(context.render.renderSnapIndicator).toHaveBeenCalledWith([0, 0]);
      const preview = vi.mocked(context.render.renderPreview).mock.calls[0][0];
      expect(preview).toEqual([
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 0],
        [0, 0],
      ]);
    });

    it('should show the snap indicator on the last vertex', () => {
      drawPolygonMode.activate();
      placeTriangle();
      vi.mocked(context.render.renderSnapIndicator).mockClear();

      drawPolygonMode.onPointerMove(createPointerEvent(10.5, 10));

      expect(context.render.renderSnapIndicator).toHaveBeenCalledWith([10, 10]);
    });

    it('should clear the indicator once the pointer leaves the draft vertex', () => {
      drawPolygonMode.activate();
      placeTriangle();

      drawPolygonMode.onPointerMove(createPointerEvent(10.5, 10));
      vi.mocked(context.render.clearSnapIndicator).mockClear();
      drawPolygonMode.onPointerMove(createPointerEvent(5, 5));

      expect(context.render.clearSnapIndicator).toHaveBeenCalled();
    });

    it('should prefer the draft vertex over a store snap target at the same spot', () => {
      const storeFeature: LibreDrawFeature = {
        id: 'existing',
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [10.2, 10] },
        properties: {},
      };
      context.getSnapConfig = () => ({ enabled: true, threshold: 10 });
      drawPolygonMode.activate();
      placeTriangle();
      // The store target appears only after the draft is placed, so the
      // triangle itself did not snap to it.
      vi.mocked(context.store.getAll).mockReturnValue([storeFeature]);
      vi.mocked(context.render.renderSnapIndicator).mockClear();

      drawPolygonMode.onPointerMove(createPointerEvent(10.1, 10));

      expect(context.render.renderSnapIndicator).toHaveBeenLastCalledWith([10, 10]);
    });
  });

  // --- Self-intersection prevention ---

  describe('self-intersection prevention', () => {
    it('should reject vertex that would create self-intersecting edge', () => {
      drawPolygonMode.activate();

      // Draw an L-shape: (0,0) → (10,0) → (10,5) → (5,5)
      clickAt(drawPolygonMode, 0, 0);
      clickAt(drawPolygonMode, 10, 0);
      clickAt(drawPolygonMode, 10, 5);
      clickAt(drawPolygonMode, 5, 5);

      const previewCallCount = vi.mocked(context.render.renderPreview).mock.calls.length;

      // Adding (5,-5) would create edge (5,5)→(5,-5) which crosses (0,0)→(10,0)
      clickAt(drawPolygonMode, 5, -5);

      // Preview should NOT have been updated (vertex rejected)
      expect(vi.mocked(context.render.renderPreview).mock.calls.length).toBe(previewCallCount);
    });

    it('should allow vertex that does not create intersection', () => {
      drawPolygonMode.activate();

      clickAt(drawPolygonMode, 0, 0);
      clickAt(drawPolygonMode, 10, 0);
      clickAt(drawPolygonMode, 10, 10);

      const previewCallCount = vi.mocked(context.render.renderPreview).mock.calls.length;

      // Adding (0,10) is fine — no intersection
      clickAt(drawPolygonMode, 0, 10);

      expect(vi.mocked(context.render.renderPreview).mock.calls.length).toBe(previewCallCount + 1);
    });

    it('should allow valid polygon creation via a click on the last vertex', () => {
      drawPolygonMode.activate();

      // Simple square
      clickAt(drawPolygonMode, 0, 0);
      clickAt(drawPolygonMode, 10, 0);
      clickAt(drawPolygonMode, 10, 10);
      clickAt(drawPolygonMode, 0, 10);

      clickAt(drawPolygonMode, 0, 10);

      expect(context.store.add).toHaveBeenCalled();
    });
  });

  describe('draft vertex markers', () => {
    it('should render a dot for each placed vertex', () => {
      drawPolygonMode.activate();
      clickAt(drawPolygonMode, 0, 0);

      expect(context.render.renderVertices).toHaveBeenLastCalledWith([[0, 0]], []);

      clickAt(drawPolygonMode, 10, 0);

      expect(context.render.renderVertices).toHaveBeenLastCalledWith(
        [
          [0, 0],
          [10, 0],
        ],
        []
      );
    });

    it('should not add a dot for the hovered cursor position', () => {
      drawPolygonMode.activate();
      clickAt(drawPolygonMode, 0, 0);
      vi.mocked(context.render.renderVertices).mockClear();

      drawPolygonMode.onPointerMove(createPointerEvent(5, 5));

      // Only placed vertices get a dot; the cursor is shown by the preview.
      expect(context.render.renderVertices).not.toHaveBeenCalled();
    });

    it('should drop the dot of the vertex removed by a long press', () => {
      drawPolygonMode.activate();
      clickAt(drawPolygonMode, 0, 0);
      clickAt(drawPolygonMode, 10, 0);

      drawPolygonMode.onLongPress(createPointerEvent(10, 0));

      expect(context.render.renderVertices).toHaveBeenLastCalledWith([[0, 0]], []);
    });

    it('should clear the dots once the last vertex is removed', () => {
      drawPolygonMode.activate();
      clickAt(drawPolygonMode, 0, 0);

      drawPolygonMode.onLongPress(createPointerEvent(0, 0));

      expect(context.render.clearVertices).toHaveBeenCalled();
    });

    it('should clear the dots on cancelDrawing()', () => {
      drawPolygonMode.activate();
      clickAt(drawPolygonMode, 0, 0);
      vi.mocked(context.render.clearVertices).mockClear();

      drawPolygonMode.cancelDrawing();

      expect(context.render.clearVertices).toHaveBeenCalled();
    });

    it('should clear the dots on deactivate()', () => {
      drawPolygonMode.activate();
      clickAt(drawPolygonMode, 0, 0);
      vi.mocked(context.render.clearVertices).mockClear();

      drawPolygonMode.deactivate();

      expect(context.render.clearVertices).toHaveBeenCalled();
    });
  });
});
