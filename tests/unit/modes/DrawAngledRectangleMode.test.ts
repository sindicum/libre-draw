import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DrawAngledRectangleMode } from '../../../src/modes/DrawAngledRectangleMode';
import { buildAngledRectangleRing } from '../../../src/utils/angledRectangle';
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
function click(mode: DrawAngledRectangleMode, lng: number, lat: number): void {
  mode.onPointerDown(createPointerEvent(lng, lat));
  mode.onPointerUp(createPointerEvent(lng, lat));
}

/** A touch tap: touch start and end at the same position. */
function tap(mode: DrawAngledRectangleMode, lng: number, lat: number): void {
  mode.onPointerDown(createPointerEvent(lng, lat, 'touch'));
  mode.onPointerUp(createPointerEvent(lng, lat, 'touch'));
}

/** A drag: down at the first position, move and release at the second. */
function drag(
  mode: DrawAngledRectangleMode,
  from: [number, number],
  to: [number, number],
  inputType: 'mouse' | 'touch' = 'mouse'
): void {
  mode.onPointerDown(createPointerEvent(from[0], from[1], inputType));
  mode.onPointerMove(createPointerEvent(to[0], to[1], inputType));
  mode.onPointerUp(createPointerEvent(to[0], to[1], inputType));
}

function createdFeature(context: ModeContext): LibreDrawFeature {
  return vi.mocked(context.store.add).mock.calls[0][0];
}

function lastDraftCount(context: ModeContext): number | undefined {
  const calls = vi.mocked(context.events.emit).mock.calls.filter((c) => c[0] === 'draftchange');
  return (calls.at(-1)?.[1] as { vertexCount: number } | undefined)?.vertexCount;
}

describe('DrawAngledRectangleMode', () => {
  let context: ModeContext;
  let mode: DrawAngledRectangleMode;

  beforeEach(() => {
    context = createMockContext();
    mode = new DrawAngledRectangleMode(context);
  });

  it('should keep dragPan enabled and disable doubleClickZoom', () => {
    expect(mode.mapInteractions()).toEqual({ dragPan: true, doubleClickZoom: false });
  });

  it('should not respond to events when inactive', () => {
    click(mode, 0, 0);
    click(mode, 10, 0);
    click(mode, 5, 5);
    mode.onPointerMove(createPointerEvent(5, 5));
    mode.onDoubleClick(createPointerEvent(5, 5));
    mode.onLongPress(createPointerEvent(5, 5, 'touch'));
    mode.onKeyDown('Escape', new KeyboardEvent('keydown', { key: 'Escape' }));
    mode.cancelDrawing();

    expect(context.store.add).not.toHaveBeenCalled();
    expect(mode.getDraftVertexCount()).toBe(0);
    expect(context.events.emit).not.toHaveBeenCalled();
    expect(context.render.renderPreview).not.toHaveBeenCalled();
    expect(context.render.clearPreview).not.toHaveBeenCalled();
  });

  describe('drawing', () => {
    beforeEach(() => {
      mode.activate();
    });

    it('should create a polygon from the base edge and the width point on the third click', () => {
      click(mode, 0, 0);
      click(mode, 10, 0);
      expect(context.store.add).not.toHaveBeenCalled();
      click(mode, 5, 4);

      expect(context.store.add).toHaveBeenCalledTimes(1);
      const feature = createdFeature(context);
      expect(feature.geometry.type).toBe('Polygon');
      expect(feature.properties).toEqual({});
      expect(feature.geometry.coordinates[0]).toEqual(
        buildAngledRectangleRing([0, 0], [10, 0], [5, 4])
      );
      expect(context.history.push).toHaveBeenCalledWith(expect.any(CreateAction));
      expect(context.events.emit).toHaveBeenCalledWith('create', { feature });
      expect(context.render.renderFeatures).toHaveBeenCalled();
    });

    it('should reset the draft after creating so the next rectangle can start', () => {
      click(mode, 0, 0);
      click(mode, 10, 0);
      click(mode, 5, 4);

      expect(mode.getDraftVertexCount()).toBe(0);
      expect(context.render.clearPreview).toHaveBeenCalled();
      expect(context.render.clearVertices).toHaveBeenCalled();

      click(mode, 20, 20);
      expect(mode.getDraftVertexCount()).toBe(1);
    });

    it('should mark placed points with vertex dots', () => {
      click(mode, 0, 0);
      expect(context.render.renderVertices).toHaveBeenLastCalledWith([[0, 0]], []);
      click(mode, 10, 3);
      expect(context.render.renderVertices).toHaveBeenLastCalledWith(
        [
          [0, 0],
          [10, 3],
        ],
        []
      );
    });

    it('should draw the base edge as the preview once the second point is placed', () => {
      click(mode, 0, 0);
      click(mode, 10, 3);
      expect(context.render.renderPreview).toHaveBeenLastCalledWith([
        [0, 0],
        [10, 3],
      ]);
    });

    it('should ignore a second point on top of the first', () => {
      click(mode, 2, 2);
      click(mode, 2, 2);
      expect(mode.getDraftVertexCount()).toBe(1);
      click(mode, 12, 2);
      expect(mode.getDraftVertexCount()).toBe(2);
    });

    it('should ignore a third point on the base line and keep the base edge', () => {
      click(mode, 0, 0);
      click(mode, 10, 0);
      click(mode, 20, 0);

      expect(context.store.add).not.toHaveBeenCalled();
      expect(mode.getDraftVertexCount()).toBe(2);

      click(mode, 5, -3);
      expect(context.store.add).toHaveBeenCalledTimes(1);
    });

    it('should not place a point when the pointer is dragged (map pan)', () => {
      drag(mode, [0, 0], [5, 5]);
      expect(mode.getDraftVertexCount()).toBe(0);

      click(mode, 0, 0);
      click(mode, 10, 0);
      drag(mode, [5, 5], [6, 6]);
      expect(context.store.add).not.toHaveBeenCalled();
    });

    it('should still place a point when the pointer wobbles within the click tolerance', () => {
      // 0.2 geographic units = 2px with the mock projection: under the 3px mouse tolerance.
      mode.onPointerDown(createPointerEvent(0, 0));
      mode.onPointerMove(createPointerEvent(0.2, 0));
      mode.onPointerUp(createPointerEvent(0.2, 0));
      expect(mode.getDraftVertexCount()).toBe(1);
    });

    it('should ignore a pointer up without a preceding pointer down', () => {
      mode.onPointerUp(createPointerEvent(0, 0));
      expect(mode.getDraftVertexCount()).toBe(0);
      expect(context.events.emit).not.toHaveBeenCalled();
    });

    it('should keep the draft on keys other than Escape', () => {
      click(mode, 0, 0);
      click(mode, 10, 0);
      mode.onKeyDown('Enter', new KeyboardEvent('keydown', { key: 'Enter' }));
      expect(mode.getDraftVertexCount()).toBe(2);
      expect(context.store.add).not.toHaveBeenCalled();
    });

    it('should suppress the dblclick default so the map does not zoom', () => {
      const event = createPointerEvent(0, 0);
      const preventDefault = vi.spyOn(event.originalEvent, 'preventDefault');
      mode.onDoubleClick(event);
      expect(preventDefault).toHaveBeenCalled();
    });
  });

  describe('hover preview', () => {
    beforeEach(() => {
      mode.activate();
    });

    it('should not preview before the first point', () => {
      mode.onPointerMove(createPointerEvent(5, 5));
      expect(context.render.renderPreview).not.toHaveBeenCalled();
    });

    it('should preview the base edge to the cursor after the first point', () => {
      click(mode, 0, 0);
      mode.onPointerMove(createPointerEvent(10, 3));
      expect(context.render.renderPreview).toHaveBeenLastCalledWith([
        [0, 0],
        [10, 3],
      ]);
    });

    it('should preview the rectangle after the second point', () => {
      click(mode, 0, 0);
      click(mode, 10, 0);
      mode.onPointerMove(createPointerEvent(5, 4));
      expect(context.render.renderPreview).toHaveBeenLastCalledWith(
        buildAngledRectangleRing([0, 0], [10, 0], [5, 4])
      );
    });

    it('should preview only the base edge while the cursor is on the base line', () => {
      click(mode, 0, 0);
      click(mode, 10, 0);
      mode.onPointerMove(createPointerEvent(4, 0));
      expect(context.render.renderPreview).toHaveBeenLastCalledWith([
        [0, 0],
        [10, 0],
      ]);
    });

    it('should not preview on touch moves (no hover)', () => {
      click(mode, 0, 0);
      vi.mocked(context.render.renderPreview).mockClear();
      mode.onPointerMove(createPointerEvent(10, 3, 'touch'));
      expect(context.render.renderPreview).not.toHaveBeenCalled();
    });
  });

  describe('touch', () => {
    beforeEach(() => {
      mode.activate();
    });

    it('should create the rectangle with three taps', () => {
      tap(mode, 0, 0);
      tap(mode, 10, 0);
      tap(mode, 5, 4);
      expect(context.store.add).toHaveBeenCalledTimes(1);
    });

    it('should not place a point when the finger was held for a long press', () => {
      vi.useFakeTimers();
      try {
        mode.onPointerDown(createPointerEvent(0, 0, 'touch'));
        vi.advanceTimersByTime(600);
        mode.onPointerUp(createPointerEvent(0, 0, 'touch'));
        expect(mode.getDraftVertexCount()).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });

    it('should remove the last point on long press', () => {
      tap(mode, 0, 0);
      tap(mode, 10, 0);

      mode.onLongPress(createPointerEvent(5, 5, 'touch'));
      expect(mode.getDraftVertexCount()).toBe(1);
      expect(context.render.renderVertices).toHaveBeenLastCalledWith([[0, 0]], []);
      expect(lastDraftCount(context)).toBe(1);

      mode.onLongPress(createPointerEvent(5, 5, 'touch'));
      expect(mode.getDraftVertexCount()).toBe(0);
      expect(context.render.clearVertices).toHaveBeenCalled();
      expect(lastDraftCount(context)).toBe(0);
    });

    it('should do nothing on long press without a draft', () => {
      mode.onLongPress(createPointerEvent(5, 5, 'touch'));
      expect(context.events.emit).not.toHaveBeenCalled();
    });
  });

  describe('snapping', () => {
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

    it('should snap the first and second points', () => {
      const snapContext = createSnapContext();
      const snapMode = new DrawAngledRectangleMode(snapContext);
      snapMode.activate();

      click(snapMode, 4.5, 4.5);
      expect(snapContext.render.renderSnapIndicator).toHaveBeenCalledWith([5, 5]);
      click(snapMode, 15.4, 4.6);
      click(snapMode, 10, 30);

      const ring = createdFeature(snapContext).geometry.coordinates[0] as number[][];
      expect(ring[0]).toEqual([5, 5]);
      expect(ring.slice(0, 4)).toContainEqual([15, 5]);
    });

    it('should fall back to a 10px threshold when none is configured', () => {
      const snapContext = createSnapContext();
      snapContext.getSnapConfig = () => ({ enabled: true });
      const snapMode = new DrawAngledRectangleMode(snapContext);
      snapMode.activate();

      // ~7px from (5, 5): inside the 10px default.
      click(snapMode, 4.5, 4.5);
      expect(snapContext.render.renderVertices).toHaveBeenLastCalledWith([[5, 5]], []);
      // ~14px from (5, 5): outside it.
      snapMode.cancelDrawing();
      click(snapMode, 4, 4);
      expect(snapContext.render.renderVertices).toHaveBeenLastCalledWith([[4, 4]], []);
    });

    it('should snap the hover preview of the base edge', () => {
      const snapContext = createSnapContext();
      const snapMode = new DrawAngledRectangleMode(snapContext);
      snapMode.activate();
      click(snapMode, 50, 50);

      snapMode.onPointerMove(createPointerEvent(4.5, 4.5));

      expect(snapContext.render.renderSnapIndicator).toHaveBeenLastCalledWith([5, 5]);
      expect(snapContext.render.renderPreview).toHaveBeenLastCalledWith([
        [50, 50],
        [5, 5],
      ]);
    });

    it('should not snap the third point and hide the indicator after the second point', () => {
      const snapContext = createSnapContext();
      const snapMode = new DrawAngledRectangleMode(snapContext);
      snapMode.activate();
      click(snapMode, 40, 0);
      click(snapMode, 40, 30);
      vi.mocked(snapContext.render.renderSnapIndicator).mockClear();

      snapMode.onPointerMove(createPointerEvent(15.4, 14.6));
      click(snapMode, 15.4, 14.6); // ~5.7px from the vertex (15, 15)

      expect(snapContext.render.renderSnapIndicator).not.toHaveBeenCalled();
      expect(snapContext.render.clearSnapIndicator).toHaveBeenCalled();
      expect(createdFeature(snapContext).geometry.coordinates[0]).toEqual(
        buildAngledRectangleRing([40, 0], [40, 30], [15.4, 14.6])
      );
    });
  });

  describe('draft control API', () => {
    beforeEach(() => {
      mode.activate();
    });

    it('should report 0, 1, and 2 placed points', () => {
      expect(mode.getDraftVertexCount()).toBe(0);
      click(mode, 0, 0);
      expect(mode.getDraftVertexCount()).toBe(1);
      click(mode, 10, 0);
      expect(mode.getDraftVertexCount()).toBe(2);
    });

    it('should always return false from finishDrawing()', () => {
      expect(mode.finishDrawing()).toBe(false);
      click(mode, 0, 0);
      click(mode, 10, 0);
      mode.onPointerMove(createPointerEvent(5, 4));
      expect(mode.finishDrawing()).toBe(false);
      expect(context.store.add).not.toHaveBeenCalled();
      expect(mode.getDraftVertexCount()).toBe(2);
    });

    it('should discard the whole draft on cancelDrawing() and keep the mode active', () => {
      click(mode, 0, 0);
      click(mode, 10, 0);
      mode.cancelDrawing();

      expect(mode.getDraftVertexCount()).toBe(0);
      expect(context.render.clearPreview).toHaveBeenCalled();
      expect(context.render.clearVertices).toHaveBeenCalled();
      expect(context.render.clearSnapIndicator).toHaveBeenCalled();
      expect(lastDraftCount(context)).toBe(0);

      click(mode, 1, 1);
      expect(mode.getDraftVertexCount()).toBe(1);
    });

    it('should discard the whole draft on Escape', () => {
      click(mode, 0, 0);
      click(mode, 10, 0);
      mode.onKeyDown('Escape', new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(mode.getDraftVertexCount()).toBe(0);
      expect(lastDraftCount(context)).toBe(0);
    });

    it('should emit draftchange when a point is placed and when the rectangle is created', () => {
      click(mode, 0, 0);
      expect(lastDraftCount(context)).toBe(1);
      click(mode, 10, 0);
      expect(lastDraftCount(context)).toBe(2);
      click(mode, 5, 4);
      expect(lastDraftCount(context)).toBe(0);
    });

    it('should emit draftchange 0 on cancelDrawing() without a draft', () => {
      mode.cancelDrawing();
      expect(context.events.emit).toHaveBeenCalledWith('draftchange', { vertexCount: 0 });
    });

    it('should clear the draft and notify on deactivate', () => {
      click(mode, 0, 0);
      mode.deactivate();
      expect(mode.getDraftVertexCount()).toBe(0);
      expect(context.render.clearPreview).toHaveBeenCalled();
      expect(lastDraftCount(context)).toBe(0);
    });
  });
});

describe('DrawAngledRectangleMode undoLastVertex / canFinishDrawing', () => {
  let context: ModeContext;
  let mode: DrawAngledRectangleMode;

  beforeEach(() => {
    context = createMockContext();
    mode = new DrawAngledRectangleMode(context);
  });

  it('steps the base edge back 2 → 1 → 0, emitting draftchange each time', () => {
    mode.activate();
    click(mode, 0, 0);
    click(mode, 10, 0);

    expect(mode.undoLastVertex()).toBe(true);
    expect(lastDraftCount(context)).toBe(1);
    expect(mode.undoLastVertex()).toBe(true);
    expect(lastDraftCount(context)).toBe(0);
    expect(mode.getDraftVertexCount()).toBe(0);
  });

  it('returns false when the draft is empty or the mode is inactive', () => {
    expect(mode.undoLastVertex()).toBe(false);
    mode.activate();
    expect(mode.undoLastVertex()).toBe(false);
  });

  it('never offers a finish: the width point finishes', () => {
    mode.activate();
    click(mode, 0, 0);
    click(mode, 10, 0);
    expect(mode.canFinishDrawing()).toBe(false);
  });
});
