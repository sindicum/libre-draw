import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DrawRectangleMode, buildRectangleRing } from '../../../src/modes/DrawRectangleMode';
import type { ModeContext } from '../../../src/core/ModeContext';
import type { NormalizedInputEvent } from '../../../src/types/input';
import type { LibreDrawFeature } from '../../../src/types/features';
import { CreateAction } from '../../../src/types/features';

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

/**
 * The mock `getScreenPoint` maps (lng, lat) -> (lng * 10, lat * 10), so the
 * screen point of an event follows the same scale. Two events one geographic
 * unit apart are therefore 10px apart: far beyond every click/tap tolerance.
 */
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
function click(mode: DrawRectangleMode, lng: number, lat: number): void {
  mode.onPointerDown(createPointerEvent(lng, lat));
  mode.onPointerUp(createPointerEvent(lng, lat));
}

/** A touch tap: touch start and end at the same position. */
function tap(mode: DrawRectangleMode, lng: number, lat: number): void {
  mode.onPointerDown(createPointerEvent(lng, lat, 'touch'));
  mode.onPointerUp(createPointerEvent(lng, lat, 'touch'));
}

/** A drag: down at the first position, move and release at the second. */
function drag(
  mode: DrawRectangleMode,
  from: [number, number],
  to: [number, number],
  inputType: 'mouse' | 'touch' = 'mouse'
): void {
  mode.onPointerDown(createPointerEvent(from[0], from[1], inputType));
  mode.onPointerMove(createPointerEvent(to[0], to[1], inputType));
  mode.onPointerUp(createPointerEvent(to[0], to[1], inputType));
}

describe('buildRectangleRing', () => {
  it('should build a closed counter-clockwise ring from min/max of both corners', () => {
    // Corners given "backwards" (top-right first) still normalize to min/max.
    const ring = buildRectangleRing([10, 20], [0, 5]);
    expect(ring).toEqual([
      [0, 5],
      [10, 5],
      [10, 20],
      [0, 20],
      [0, 5],
    ]);
  });

  it('should return null when corners share a longitude', () => {
    expect(buildRectangleRing([3, 0], [3, 10])).toBeNull();
  });

  it('should return null when corners share a latitude', () => {
    expect(buildRectangleRing([0, 7], [10, 7])).toBeNull();
  });

  it('should return null for identical corners', () => {
    expect(buildRectangleRing([4, 4], [4, 4])).toBeNull();
  });
});

describe('DrawRectangleMode', () => {
  let context: ModeContext;
  let mode: DrawRectangleMode;

  beforeEach(() => {
    context = createMockContext();
    mode = new DrawRectangleMode(context);
  });

  it('should keep dragPan enabled and disable doubleClickZoom', () => {
    // Corners are placed by clicks/taps, so dragging stays free for panning.
    expect(mode.mapInteractions()).toEqual({ dragPan: true, doubleClickZoom: false });
  });

  it('should not respond to events when inactive', () => {
    click(mode, 0, 0);
    mode.onPointerMove(createPointerEvent(5, 5));
    expect(context.store.add).not.toHaveBeenCalled();
    expect(context.render.renderPreview).not.toHaveBeenCalled();
    expect(context.render.renderVertices).not.toHaveBeenCalled();
    expect(mode.getDraftVertexCount()).toBe(0);
  });

  it('should not place a corner on pointer down alone', () => {
    mode.activate();
    mode.onPointerDown(createPointerEvent(0, 0));

    expect(mode.getDraftVertexCount()).toBe(0);
    expect(context.render.renderVertices).not.toHaveBeenCalled();
    expect(context.events.emit).not.toHaveBeenCalled();
  });

  it('should place the first corner on click, mark it, and emit draftchange(1)', () => {
    mode.activate();
    click(mode, 0, 0);

    expect(mode.getDraftVertexCount()).toBe(1);
    // A vertex dot, not a preview: a collapsed ring would be invisible.
    expect(context.render.renderVertices).toHaveBeenCalledWith([[0, 0]], []);
    expect(context.render.renderPreview).not.toHaveBeenCalled();
    expect(context.events.emit).toHaveBeenCalledWith('draftchange', { vertexCount: 1 });
    expect(context.store.add).not.toHaveBeenCalled();
  });

  it('should not render a preview on pointer move before the first corner', () => {
    mode.activate();
    mode.onPointerMove(createPointerEvent(5, 5));
    expect(context.render.renderPreview).not.toHaveBeenCalled();
  });

  it('should preview the rectangle spanned by the first corner and the cursor', () => {
    mode.activate();
    click(mode, 0, 0);

    mode.onPointerMove(createPointerEvent(10, 20));

    expect(context.render.renderPreview).toHaveBeenCalledWith([
      [0, 0],
      [10, 0],
      [10, 20],
      [0, 20],
      [0, 0],
    ]);
  });

  it('should keep the preview tracking the cursor along a degenerate span', () => {
    mode.activate();
    click(mode, 0, 0);

    mode.onPointerMove(createPointerEvent(10, 0));

    // Collapsed ring: still rendered so the user sees the cursor is tracked.
    expect(context.render.renderPreview).toHaveBeenCalledWith([
      [0, 0],
      [10, 0],
      [0, 0],
    ]);
  });

  it('should create an axis-aligned polygon on the second corner click', () => {
    mode.activate();
    click(mode, 10, 20);
    click(mode, 0, 5);

    expect(context.store.add).toHaveBeenCalledOnce();
    const feature = vi.mocked(context.store.add).mock.calls[0][0];
    expect(feature.geometry.type).toBe('Polygon');
    expect(feature.geometry.coordinates).toEqual([
      [
        [0, 5],
        [10, 5],
        [10, 20],
        [0, 20],
        [0, 5],
      ],
    ]);
    expect(feature.properties).toEqual({});

    expect(context.history.push).toHaveBeenCalledOnce();
    expect(vi.mocked(context.history.push).mock.calls[0][0]).toBeInstanceOf(CreateAction);
    expect(context.events.emit).toHaveBeenCalledWith(
      'create',
      expect.objectContaining({ feature: expect.objectContaining({ id: feature.id }) })
    );
    expect(context.render.renderFeatures).toHaveBeenCalledOnce();
    expect(context.render.clearPreview).toHaveBeenCalled();
    expect(context.render.clearVertices).toHaveBeenCalled();
    expect(context.events.emit).toHaveBeenLastCalledWith('draftchange', { vertexCount: 0 });
    expect(mode.getDraftVertexCount()).toBe(0);
  });

  it('should emit draftchange in order: 1 (first corner) -> create -> 0', () => {
    mode.activate();
    click(mode, 0, 0);
    click(mode, 10, 10);

    const calls = vi
      .mocked(context.events.emit)
      .mock.calls.map(([type, payload]) =>
        type === 'draftchange' ? `draft:${(payload as { vertexCount: number }).vertexCount}` : type
      );
    expect(calls).toEqual(['draft:1', 'create', 'draft:0']);
  });

  it('should stay in the mode for continuous drawing after finalizing', () => {
    mode.activate();
    click(mode, 0, 0);
    click(mode, 10, 10);
    click(mode, 20, 20);
    click(mode, 30, 30);

    expect(context.store.add).toHaveBeenCalledTimes(2);
  });

  describe('drag is left to the map', () => {
    it('should not place a corner when the mouse is dragged', () => {
      mode.activate();
      drag(mode, [0, 0], [10, 10]);

      expect(mode.getDraftVertexCount()).toBe(0);
      expect(context.render.renderVertices).not.toHaveBeenCalled();
      expect(context.store.add).not.toHaveBeenCalled();
    });

    it('should not place a corner when a finger is dragged', () => {
      mode.activate();
      drag(mode, [0, 0], [10, 10], 'touch');

      expect(mode.getDraftVertexCount()).toBe(0);
      expect(context.store.add).not.toHaveBeenCalled();
    });

    it('should leave no preview behind after a touch drag', () => {
      mode.activate();
      tap(mode, 0, 0);

      // Panning the map after the first tap must not draw (or strand) a
      // rubber-band rectangle: touch has no hover to drive one.
      drag(mode, [5, 5], [10, 10], 'touch');

      expect(context.render.renderPreview).not.toHaveBeenCalled();
      expect(context.store.add).not.toHaveBeenCalled();
      // The first corner survives the pan.
      expect(mode.getDraftVertexCount()).toBe(1);
    });

    it('should tolerate the small wobble of a deliberate tap', () => {
      mode.activate();
      // 5px of travel: below the touch tap tolerance, above the mouse one.
      mode.onPointerDown({ ...createPointerEvent(0, 0, 'touch'), point: { x: 0, y: 0 } });
      mode.onPointerUp({ ...createPointerEvent(0, 0, 'touch'), point: { x: 3, y: 4 } });

      expect(mode.getDraftVertexCount()).toBe(1);
    });
  });

  describe('touch', () => {
    it('should place the first corner on tap and mark it for the user', () => {
      mode.activate();
      tap(mode, 0, 0);

      expect(mode.getDraftVertexCount()).toBe(1);
      expect(context.render.renderVertices).toHaveBeenCalledWith([[0, 0]], []);
    });

    it('should finalize on the second tap', () => {
      mode.activate();
      tap(mode, 0, 0);
      tap(mode, 10, 20);

      expect(context.store.add).toHaveBeenCalledOnce();
      const feature = vi.mocked(context.store.add).mock.calls[0][0];
      expect(feature.geometry.coordinates).toEqual([
        [
          [0, 0],
          [10, 0],
          [10, 20],
          [0, 20],
          [0, 0],
        ],
      ]);
      expect(mode.getDraftVertexCount()).toBe(0);
    });

    it('should ignore a touch move that arrives without a pointer down', () => {
      mode.activate();
      tap(mode, 0, 0);

      mode.onPointerMove(createPointerEvent(10, 10, 'touch'));

      expect(context.render.renderPreview).not.toHaveBeenCalled();
    });

    describe('long press', () => {
      beforeEach(() => {
        vi.useFakeTimers();
      });

      afterEach(() => {
        vi.useRealTimers();
      });

      it('should not finalize from the pointer up that precedes a long press', () => {
        mode.activate();
        tap(mode, 0, 0);

        // TouchInput emits onPointerUp first, then onLongPress.
        mode.onPointerDown(createPointerEvent(10, 10, 'touch'));
        vi.advanceTimersByTime(600);
        mode.onPointerUp(createPointerEvent(10, 10, 'touch'));

        expect(context.store.add).not.toHaveBeenCalled();

        mode.onLongPress(createPointerEvent(10, 10, 'touch'));
        expect(mode.getDraftVertexCount()).toBe(0);
      });

      it('should still place a corner for a tap held briefly', () => {
        mode.activate();

        mode.onPointerDown(createPointerEvent(0, 0, 'touch'));
        vi.advanceTimersByTime(120);
        mode.onPointerUp(createPointerEvent(0, 0, 'touch'));

        expect(mode.getDraftVertexCount()).toBe(1);
      });
    });
  });

  describe('degenerate second corner', () => {
    it.each([
      ['identical point', 0, 0],
      ['same longitude', 0, 10],
      ['same latitude', 10, 0],
    ])('should ignore %s and keep the first corner', (_label, lng, lat) => {
      mode.activate();
      click(mode, 0, 0);
      vi.mocked(context.events.emit).mockClear();

      click(mode, lng, lat);

      expect(context.store.add).not.toHaveBeenCalled();
      expect(context.history.push).not.toHaveBeenCalled();
      expect(context.events.emit).not.toHaveBeenCalledWith('create', expect.anything());
      expect(mode.getDraftVertexCount()).toBe(1);

      // A valid corner afterwards still finalizes from the kept first corner.
      click(mode, 5, 5);
      expect(context.store.add).toHaveBeenCalledOnce();
      const feature = vi.mocked(context.store.add).mock.calls[0][0];
      expect(feature.geometry.coordinates[0][0]).toEqual([0, 0]);
      expect(feature.geometry.coordinates[0][2]).toEqual([5, 5]);
    });
  });

  describe('snap', () => {
    function createSnapContext(): ModeContext {
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
      // getScreenPoint maps (lng, lat) -> (lng*10, lat*10): (4.5, 4.5) is ~7px from (5, 5).
      snapContext.getSnapConfig = () => ({ enabled: true, threshold: 20 });
      return snapContext;
    }

    it('should snap the first corner and show the indicator', () => {
      const snapContext = createSnapContext();
      const snapMode = new DrawRectangleMode(snapContext);
      snapMode.activate();

      click(snapMode, 4.5, 4.5);

      expect(snapContext.render.renderSnapIndicator).toHaveBeenCalledWith([5, 5]);
      expect(snapContext.render.renderVertices).toHaveBeenCalledWith([[5, 5]], []);
      click(snapMode, 50, 50);
      const feature = vi.mocked(snapContext.store.add).mock.calls[0][0];
      expect(feature.geometry.coordinates[0][0]).toEqual([5, 5]);
    });

    it('should snap the second corner', () => {
      const snapContext = createSnapContext();
      const snapMode = new DrawRectangleMode(snapContext);
      snapMode.activate();

      click(snapMode, 50, 50);
      click(snapMode, 15.4, 15.4); // ~5.7px from (15, 15)

      const feature = vi.mocked(snapContext.store.add).mock.calls[0][0];
      expect(feature.geometry.coordinates[0]).toEqual([
        [15, 15],
        [50, 15],
        [50, 50],
        [15, 50],
        [15, 15],
      ]);
    });

    it('should show the snap indicator and snapped preview while moving', () => {
      const snapContext = createSnapContext();
      const snapMode = new DrawRectangleMode(snapContext);
      snapMode.activate();
      click(snapMode, 50, 50);

      snapMode.onPointerMove(createPointerEvent(4.5, 4.5));

      expect(snapContext.render.renderSnapIndicator).toHaveBeenLastCalledWith([5, 5]);
      const previewCoords = vi.mocked(snapContext.render.renderPreview).mock.calls[0][0];
      expect(previewCoords[0]).toEqual([5, 5]);
    });

    it('should clear the snap indicator when moving away from targets', () => {
      const snapContext = createSnapContext();
      const snapMode = new DrawRectangleMode(snapContext);
      snapMode.activate();
      click(snapMode, 50, 50);

      snapMode.onPointerMove(createPointerEvent(80, 80));

      expect(snapContext.render.clearSnapIndicator).toHaveBeenCalled();
    });
  });

  describe('draft control API', () => {
    it('should always return false from finishDrawing()', () => {
      expect(mode.finishDrawing()).toBe(false);

      mode.activate();
      expect(mode.finishDrawing()).toBe(false);

      click(mode, 0, 0);
      expect(mode.finishDrawing()).toBe(false);
      expect(context.store.add).not.toHaveBeenCalled();
      // The draft is preserved.
      expect(mode.getDraftVertexCount()).toBe(1);
    });

    it('should discard the first corner on cancelDrawing() and emit draftchange(0)', () => {
      mode.activate();
      click(mode, 0, 0);
      vi.mocked(context.events.emit).mockClear();

      mode.cancelDrawing();

      expect(mode.getDraftVertexCount()).toBe(0);
      expect(context.render.clearPreview).toHaveBeenCalled();
      expect(context.render.clearVertices).toHaveBeenCalled();
      expect(context.render.clearSnapIndicator).toHaveBeenCalled();
      expect(context.events.emit).toHaveBeenCalledWith('draftchange', { vertexCount: 0 });
    });

    it('should still emit draftchange(0) on cancelDrawing() without a draft', () => {
      mode.activate();
      mode.cancelDrawing();
      expect(context.events.emit).toHaveBeenCalledWith('draftchange', { vertexCount: 0 });
    });

    it('should ignore cancelDrawing() when inactive', () => {
      mode.cancelDrawing();
      expect(context.render.clearPreview).not.toHaveBeenCalled();
      expect(context.events.emit).not.toHaveBeenCalled();
    });

    it('should return 0 from getDraftVertexCount() when inactive', () => {
      mode.activate();
      click(mode, 0, 0);
      mode.deactivate();
      expect(mode.getDraftVertexCount()).toBe(0);
    });
  });

  it('should discard the first corner on Escape and keep accepting input', () => {
    mode.activate();
    click(mode, 0, 0);

    mode.onKeyDown('Escape', new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(mode.getDraftVertexCount()).toBe(0);
    expect(context.render.clearPreview).toHaveBeenCalled();
    expect(context.render.clearVertices).toHaveBeenCalled();

    // Still active: the next click starts a new draft.
    click(mode, 1, 1);
    expect(mode.getDraftVertexCount()).toBe(1);
  });

  it('should ignore keys other than Escape', () => {
    mode.activate();
    click(mode, 0, 0);

    mode.onKeyDown('Enter', new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(mode.getDraftVertexCount()).toBe(1);
  });

  it('should discard the first corner on long press', () => {
    mode.activate();
    click(mode, 0, 0);
    vi.mocked(context.events.emit).mockClear();

    mode.onLongPress(createPointerEvent(0, 0, 'touch'));

    expect(mode.getDraftVertexCount()).toBe(0);
    expect(context.events.emit).toHaveBeenCalledWith('draftchange', { vertexCount: 0 });
  });

  it('should stop the double click from reaching the map without touching the draft', () => {
    mode.activate();
    click(mode, 0, 0);
    click(mode, 10, 10);

    const dblEvt = createPointerEvent(10, 10);
    const preventDefault = vi.spyOn(dblEvt.originalEvent, 'preventDefault');
    const stopPropagation = vi.spyOn(dblEvt.originalEvent, 'stopPropagation');
    mode.onDoubleClick(dblEvt);

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(context.store.add).toHaveBeenCalledOnce();
    expect(mode.getDraftVertexCount()).toBe(0);
  });

  it('should ignore double click when inactive', () => {
    const dblEvt = createPointerEvent(10, 10);
    const preventDefault = vi.spyOn(dblEvt.originalEvent, 'preventDefault');
    mode.onDoubleClick(dblEvt);
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it('should clear preview, reset the draft, and emit draftchange(0) on deactivate', () => {
    mode.activate();
    click(mode, 0, 0);
    vi.mocked(context.events.emit).mockClear();

    mode.deactivate();

    expect(context.render.clearPreview).toHaveBeenCalled();
    expect(context.render.clearVertices).toHaveBeenCalled();
    expect(context.render.clearSnapIndicator).toHaveBeenCalled();
    expect(context.events.emit).toHaveBeenCalledWith('draftchange', { vertexCount: 0 });

    // Re-activating starts from an empty draft.
    mode.activate();
    expect(mode.getDraftVertexCount()).toBe(0);
  });
});
