import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '../../src/core/EventBus';
import { FeatureStore } from '../../src/core/FeatureStore';
import { HistoryManager } from '../../src/core/HistoryManager';
import { ModeManager } from '../../src/core/ModeManager';
import type { ModeContext } from '../../src/core/ModeContext';
import { IdleMode } from '../../src/modes/IdleMode';
import { DrawMode } from '../../src/modes/DrawMode';
import { DrawLineMode } from '../../src/modes/DrawLineMode';
import { SelectMode } from '../../src/modes/SelectMode';
import type { NormalizedInputEvent } from '../../src/types/input';
import type {
  CreateEvent,
  DeleteEvent,
  DraftChangeEvent,
  UpdateEvent,
} from '../../src/types/events';

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

describe('Draw Flow Integration', () => {
  function createDrawingSystem() {
    const eventBus = new EventBus();
    const store = new FeatureStore();
    const history = new HistoryManager();
    const modeManager = new ModeManager();
    const modeContext: ModeContext = {
      store: {
        add: (feature) => store.add(feature),
        update: (id, feature) => store.update(id, feature),
        remove: (id) => store.remove(id),
        getById: (id) => store.getById(id),
        getAll: () => store.getAll(),
      },
      history: {
        push: (action) => history.push(action),
      },
      events: {
        emit: (type, payload) => eventBus.emit(type, payload),
      },
      render: {
        renderFeatures: vi.fn(),
        renderPreview: vi.fn(),
        clearPreview: vi.fn(),
        renderEdgeHighlight: vi.fn(),
        clearEdgeHighlight: vi.fn(),
        renderVertices: vi.fn(),
        clearVertices: vi.fn(),
        setSelectedIds: vi.fn(),
        renderSnapIndicator: vi.fn(),
        clearSnapIndicator: vi.fn(),
      },
      getScreenPoint: (lngLat) => ({
        x: lngLat.lng * 10,
        y: lngLat.lat * 10,
      }),
      setDragPan: vi.fn(),
      getSetbackDistance: () => 10,
      getSnapConfig: () => ({ enabled: false, threshold: 10 }),
      getViewportBounds: () => ({ west: -180, south: -90, east: 180, north: 90 }),
    };

    const drawMode = new DrawMode(modeContext);
    const drawLineMode = new DrawLineMode(modeContext);
    const selectMode = new SelectMode(modeContext, vi.fn());

    modeManager.registerMode('idle', new IdleMode());
    modeManager.registerMode('draw', drawMode);
    modeManager.registerMode('draw-line', drawLineMode);
    modeManager.registerMode('select', selectMode);

    return {
      eventBus,
      store,
      history,
      modeManager,
      drawMode,
      drawLineMode,
      selectMode,
    };
  }

  it('should draw a polygon, select it, and delete it', () => {
    const { eventBus, store, history, modeManager, selectMode } =
      createDrawingSystem();

    const createListener = vi.fn();
    const deleteListener = vi.fn();
    eventBus.on('create', createListener);
    eventBus.on('delete', deleteListener);

    // Switch to draw mode
    modeManager.setMode('draw');
    const drawMode = modeManager.getCurrentMode()!;

    // Draw a triangle
    drawMode.onPointerDown(createPointerEvent(0, 0));
    drawMode.onPointerDown(createPointerEvent(10, 0));
    drawMode.onPointerDown(createPointerEvent(10, 10));

    // Add an extra vertex from the first click of the double-click
    drawMode.onPointerDown(createPointerEvent(5, 5));

    // Finalize with double click
    const dblEvt = createPointerEvent(5, 5);
    vi.spyOn(dblEvt.originalEvent, 'preventDefault').mockImplementation(() => {});
    vi.spyOn(dblEvt.originalEvent, 'stopPropagation').mockImplementation(() => {});
    drawMode.onDoubleClick(dblEvt);

    // Verify feature was created
    expect(store.getAll()).toHaveLength(1);
    expect(createListener).toHaveBeenCalledOnce();
    expect(history.canUndo()).toBe(true);

    // Switch to select mode
    modeManager.setMode('select');

    // Select the polygon by clicking inside it
    const selectModeImpl = modeManager.getCurrentMode()!;
    selectModeImpl.onPointerDown(createPointerEvent(5, 3));

    expect(selectMode.getSelectedIds()).toHaveLength(1);

    // Delete with keyboard
    selectModeImpl.onKeyDown(
      'Delete',
      new KeyboardEvent('keydown', { key: 'Delete' }),
    );

    expect(store.getAll()).toHaveLength(0);
    expect(deleteListener).toHaveBeenCalledOnce();
  });

  it('should isolate create/update/delete payload mutations from internal state', () => {
    const { eventBus, store, history, modeManager } = createDrawingSystem();

    let createPayload: CreateEvent | undefined;
    let updatePayload: UpdateEvent | undefined;
    let deletePayload: DeleteEvent | undefined;

    eventBus.on('create', (payload) => {
      createPayload = payload;
    });
    eventBus.on('update', (payload) => {
      updatePayload = payload;
    });
    eventBus.on('delete', (payload) => {
      deletePayload = payload;
    });

    // Draw
    modeManager.setMode('draw');
    const drawMode = modeManager.getCurrentMode()!;
    drawMode.onPointerDown(createPointerEvent(0, 0));
    drawMode.onPointerDown(createPointerEvent(10, 0));
    drawMode.onPointerDown(createPointerEvent(10, 10));
    drawMode.onPointerDown(createPointerEvent(5, 5));

    const dblEvt = createPointerEvent(5, 5);
    vi.spyOn(dblEvt.originalEvent, 'preventDefault').mockImplementation(() => {});
    vi.spyOn(dblEvt.originalEvent, 'stopPropagation').mockImplementation(() => {});
    drawMode.onDoubleClick(dblEvt);

    const featureId = store.getAll()[0].id;
    expect(createPayload).toBeDefined();

    createPayload!.feature.geometry.coordinates[0][0][0] = 999;
    createPayload!.feature.properties.mutated = true;

    expect(store.getById(featureId)!.geometry.coordinates[0][0][0]).toBe(0);
    expect(store.getById(featureId)!.properties.mutated).toBeUndefined();

    // Update (vertex drag)
    modeManager.setMode('select');
    const selectMode = modeManager.getCurrentMode()!;
    selectMode.onPointerDown(createPointerEvent(5, 3)); // select polygon
    selectMode.onPointerDown(createPointerEvent(0, 0)); // start vertex drag
    selectMode.onPointerMove(createPointerEvent(2, 2));
    selectMode.onPointerUp(createPointerEvent(2, 2));

    expect(updatePayload).toBeDefined();
    updatePayload!.feature.geometry.coordinates[0][0][0] = 777;
    updatePayload!.oldFeature.geometry.coordinates[0][0][0] = 888;

    expect(store.getById(featureId)!.geometry.coordinates[0][0][0]).toBe(2);

    // Delete
    selectMode.onKeyDown(
      'Delete',
      new KeyboardEvent('keydown', { key: 'Delete' }),
    );
    expect(deletePayload).toBeDefined();

    deletePayload!.feature.geometry.coordinates[0][0][0] = 555;

    // Undo should restore the non-tampered snapshot
    history.undo(store);
    expect(store.getById(featureId)!.geometry.coordinates[0][0][0]).toBe(2);
  });

  it('should undo the creation after drawing', () => {
    const { store, history, modeManager } = createDrawingSystem();

    modeManager.setMode('draw');
    const drawMode = modeManager.getCurrentMode()!;

    // Draw a triangle
    drawMode.onPointerDown(createPointerEvent(0, 0));
    drawMode.onPointerDown(createPointerEvent(10, 0));
    drawMode.onPointerDown(createPointerEvent(10, 10));
    drawMode.onPointerDown(createPointerEvent(5, 5));

    const dblEvt = createPointerEvent(5, 5);
    vi.spyOn(dblEvt.originalEvent, 'preventDefault').mockImplementation(() => {});
    vi.spyOn(dblEvt.originalEvent, 'stopPropagation').mockImplementation(() => {});
    drawMode.onDoubleClick(dblEvt);

    expect(store.getAll()).toHaveLength(1);

    // Undo
    history.undo(store);
    expect(store.getAll()).toHaveLength(0);

    // Redo
    history.redo(store);
    expect(store.getAll()).toHaveLength(1);
  });

  it('should cancel drawing with Escape', () => {
    const { store, modeManager } = createDrawingSystem();

    modeManager.setMode('draw');
    const drawMode = modeManager.getCurrentMode()!;

    drawMode.onPointerDown(createPointerEvent(0, 0));
    drawMode.onPointerDown(createPointerEvent(10, 0));

    drawMode.onKeyDown('Escape', new KeyboardEvent('keydown', { key: 'Escape' }));

    // No feature should be created
    expect(store.getAll()).toHaveLength(0);
  });

  it('should switch between modes correctly', () => {
    const { modeManager } = createDrawingSystem();
    const modeChangeListener = vi.fn();

    modeManager.setOnModeChange(modeChangeListener);

    modeManager.setMode('draw');
    expect(modeManager.getMode()).toBe('draw');

    modeManager.setMode('select');
    expect(modeManager.getMode()).toBe('select');

    modeManager.setMode('idle');
    expect(modeManager.getMode()).toBe('idle');

    expect(modeChangeListener).toHaveBeenCalledTimes(3);
  });

  describe('draft control API (DrawMode)', () => {
    it('should finalize a polygon via finishDrawing() and emit events in order', () => {
      const { eventBus, store, modeManager, drawMode } = createDrawingSystem();
      const events: string[] = [];
      const createListener = vi.fn(() => events.push('create'));
      const draftListener = vi.fn((e: DraftChangeEvent) =>
        events.push(`draft:${e.vertexCount}`),
      );
      eventBus.on('create', createListener);
      eventBus.on('draftchange', draftListener);

      modeManager.setMode('draw');
      drawMode.onPointerDown(createPointerEvent(0, 0));
      drawMode.onPointerDown(createPointerEvent(10, 0));
      drawMode.onPointerDown(createPointerEvent(10, 10));

      expect(drawMode.getDraftVertexCount()).toBe(3);

      const result = drawMode.finishDrawing();

      expect(result).toBe(true);
      expect(store.getAll()).toHaveLength(1);
      expect(createListener).toHaveBeenCalledOnce();
      expect(drawMode.getDraftVertexCount()).toBe(0);

      // Order: vertex-adds (draft:1, 2, 3) -> create -> draft:0
      expect(events).toEqual([
        'draft:1',
        'draft:2',
        'draft:3',
        'create',
        'draft:0',
      ]);
    });

    it('should return false from finishDrawing() with fewer than 3 vertices', () => {
      const { eventBus, store, modeManager, drawMode } = createDrawingSystem();
      const createListener = vi.fn();
      eventBus.on('create', createListener);

      modeManager.setMode('draw');
      drawMode.onPointerDown(createPointerEvent(0, 0));
      drawMode.onPointerDown(createPointerEvent(10, 0));

      expect(drawMode.finishDrawing()).toBe(false);
      expect(store.getAll()).toHaveLength(0);
      expect(createListener).not.toHaveBeenCalled();
      // Draft is preserved on failure
      expect(drawMode.getDraftVertexCount()).toBe(2);
    });

    it('should return false from finishDrawing() when closing would self-intersect', () => {
      const { eventBus, store, modeManager, drawMode } = createDrawingSystem();
      const createListener = vi.fn();
      eventBus.on('create', createListener);

      modeManager.setMode('draw');
      // Bowtie / figure-8 pattern: closing the ring crosses an existing edge
      drawMode.onPointerDown(createPointerEvent(0, 0));
      drawMode.onPointerDown(createPointerEvent(10, 0));
      drawMode.onPointerDown(createPointerEvent(0, 10));
      drawMode.onPointerDown(createPointerEvent(10, 10));

      expect(drawMode.finishDrawing()).toBe(false);
      expect(store.getAll()).toHaveLength(0);
      expect(createListener).not.toHaveBeenCalled();
      expect(drawMode.getDraftVertexCount()).toBe(4);
    });

    it('should cancelDrawing() and preserve draw mode', () => {
      const { eventBus, store, modeManager, drawMode } = createDrawingSystem();
      const draftListener = vi.fn();
      eventBus.on('draftchange', draftListener);

      modeManager.setMode('draw');
      drawMode.onPointerDown(createPointerEvent(0, 0));
      drawMode.onPointerDown(createPointerEvent(10, 0));

      draftListener.mockClear();
      drawMode.cancelDrawing();

      expect(store.getAll()).toHaveLength(0);
      expect(drawMode.getDraftVertexCount()).toBe(0);
      expect(modeManager.getMode()).toBe('draw');
      expect(draftListener).toHaveBeenCalledWith({ vertexCount: 0 });
    });

    it('should emit draftchange when long-press removes a vertex', () => {
      const { eventBus, modeManager, drawMode } = createDrawingSystem();
      const draftListener = vi.fn();
      eventBus.on('draftchange', draftListener);

      modeManager.setMode('draw');
      drawMode.onPointerDown(createPointerEvent(0, 0));
      drawMode.onPointerDown(createPointerEvent(10, 0));

      draftListener.mockClear();
      drawMode.onLongPress(createPointerEvent(10, 0));

      expect(draftListener).toHaveBeenCalledWith({ vertexCount: 1 });
      expect(drawMode.getDraftVertexCount()).toBe(1);
    });

    it('should emit draftchange(0) when exiting draw mode to any other mode', () => {
      const { eventBus, modeManager, drawMode } = createDrawingSystem();
      const draftListener = vi.fn();
      eventBus.on('draftchange', draftListener);

      modeManager.setMode('draw');
      drawMode.onPointerDown(createPointerEvent(0, 0));
      drawMode.onPointerDown(createPointerEvent(10, 0));
      draftListener.mockClear();

      modeManager.setMode('select');

      expect(draftListener).toHaveBeenCalledWith({ vertexCount: 0 });
    });

    it('should return 0 from getDraftVertexCount() in non-drawing modes', () => {
      const { modeManager, drawMode } = createDrawingSystem();

      modeManager.setMode('idle');
      expect(drawMode.getDraftVertexCount()).toBe(0);

      modeManager.setMode('select');
      expect(drawMode.getDraftVertexCount()).toBe(0);
    });

    it('should return false from finishDrawing() when mode is inactive', () => {
      const { store, modeManager, drawMode } = createDrawingSystem();

      // idle by default — drawMode.activate() has not been called
      expect(drawMode.finishDrawing()).toBe(false);
      expect(store.getAll()).toHaveLength(0);

      modeManager.setMode('idle');
      expect(drawMode.finishDrawing()).toBe(false);

      modeManager.setMode('select');
      expect(drawMode.finishDrawing()).toBe(false);
      expect(store.getAll()).toHaveLength(0);
    });
  });

  describe('draft control API (DrawLineMode)', () => {
    it('should finalize a line via finishDrawing() with 2 vertices', () => {
      const { eventBus, store, modeManager, drawLineMode } =
        createDrawingSystem();
      const events: string[] = [];
      const createListener = vi.fn(() => events.push('create'));
      const draftListener = vi.fn((e: DraftChangeEvent) =>
        events.push(`draft:${e.vertexCount}`),
      );
      eventBus.on('create', createListener);
      eventBus.on('draftchange', draftListener);

      modeManager.setMode('draw-line');
      drawLineMode.onPointerDown(createPointerEvent(0, 0));
      drawLineMode.onPointerDown(createPointerEvent(10, 10));

      expect(drawLineMode.getDraftVertexCount()).toBe(2);

      const result = drawLineMode.finishDrawing();

      expect(result).toBe(true);
      expect(store.getAll()).toHaveLength(1);
      expect(store.getAll()[0].geometry.type).toBe('LineString');
      expect(drawLineMode.getDraftVertexCount()).toBe(0);
      expect(events).toEqual(['draft:1', 'draft:2', 'create', 'draft:0']);
    });

    it('should return false from finishDrawing() with a single vertex', () => {
      const { store, modeManager, drawLineMode } = createDrawingSystem();

      modeManager.setMode('draw-line');
      drawLineMode.onPointerDown(createPointerEvent(0, 0));

      expect(drawLineMode.finishDrawing()).toBe(false);
      expect(store.getAll()).toHaveLength(0);
      expect(drawLineMode.getDraftVertexCount()).toBe(1);
    });

    it('should cancelDrawing() clear the draft without creating a feature', () => {
      const { eventBus, store, modeManager, drawLineMode } =
        createDrawingSystem();
      const draftListener = vi.fn();
      eventBus.on('draftchange', draftListener);

      modeManager.setMode('draw-line');
      drawLineMode.onPointerDown(createPointerEvent(0, 0));
      drawLineMode.onPointerDown(createPointerEvent(10, 10));

      draftListener.mockClear();
      drawLineMode.cancelDrawing();

      expect(store.getAll()).toHaveLength(0);
      expect(drawLineMode.getDraftVertexCount()).toBe(0);
      expect(modeManager.getMode()).toBe('draw-line');
      expect(draftListener).toHaveBeenCalledWith({ vertexCount: 0 });
    });
  });
});
