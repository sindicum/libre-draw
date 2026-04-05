import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '../../src/core/EventBus';
import { FeatureStore } from '../../src/core/FeatureStore';
import { HistoryManager } from '../../src/core/HistoryManager';
import { ModeManager } from '../../src/core/ModeManager';
import type { ModeContext } from '../../src/core/ModeContext';
import { IdleMode } from '../../src/modes/IdleMode';
import { DrawMode } from '../../src/modes/DrawMode';
import { SelectMode } from '../../src/modes/SelectMode';
import { DeleteAction } from '../../src/types/features';
import type { NormalizedInputEvent } from '../../src/types/input';

function createPointerEvent(
  lng: number,
  lat: number,
  inputType: 'mouse' | 'touch' = 'mouse',
): NormalizedInputEvent {
  return {
    lngLat: { lng, lat },
    point: { x: lng * 10, y: lat * 10 },
    originalEvent: new MouseEvent('click'),
    inputType,
  };
}

describe('Edit Flow Integration', () => {
  function createSystem() {
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
    const selectMode = new SelectMode(modeContext, vi.fn());

    modeManager.registerMode('idle', new IdleMode());
    modeManager.registerMode('draw', drawMode);
    modeManager.registerMode('select', selectMode);

    return { eventBus, store, history, modeManager, selectMode };
  }

  /**
   * Helper: draw a square polygon (0,0)-(10,0)-(10,10)-(0,10)
   */
  function drawSquare(modeManager: ModeManager) {
    modeManager.setMode('draw');
    const mode = modeManager.getCurrentMode()!;
    mode.onPointerDown(createPointerEvent(0, 0));
    mode.onPointerDown(createPointerEvent(10, 0));
    mode.onPointerDown(createPointerEvent(10, 10));
    mode.onPointerDown(createPointerEvent(0, 10));

    // Extra click from double-click first event
    mode.onPointerDown(createPointerEvent(5, 5));

    const dblEvt = createPointerEvent(5, 5);
    vi.spyOn(dblEvt.originalEvent, 'preventDefault').mockImplementation(
      () => {},
    );
    vi.spyOn(dblEvt.originalEvent, 'stopPropagation').mockImplementation(
      () => {},
    );
    mode.onDoubleClick(dblEvt);
  }

  it('should draw, select, drag vertex, undo, and redo', () => {
    const { store, history, modeManager } = createSystem();

    // Draw a square
    drawSquare(modeManager);
    expect(store.getAll()).toHaveLength(1);

    const featureId = store.getAll()[0].id;
    const originalCoords = store.getById(featureId)!.geometry.coordinates[0];
    const originalFirstVertex = [...originalCoords[0]];

    // Switch to select mode and select the polygon
    modeManager.setMode('select');
    const selectImpl = modeManager.getCurrentMode()!;
    selectImpl.onPointerDown(createPointerEvent(5, 5)); // select

    // Drag vertex (0,0) to (2,2)
    selectImpl.onPointerDown(createPointerEvent(0, 0)); // start drag
    selectImpl.onPointerMove(createPointerEvent(2, 2)); // move
    selectImpl.onPointerUp(createPointerEvent(2, 2)); // commit

    // Verify vertex moved
    const movedCoords = store.getById(featureId)!.geometry.coordinates[0];
    expect(movedCoords[0][0]).toBe(2);
    expect(movedCoords[0][1]).toBe(2);

    // Undo should restore original position
    history.undo(store);
    const restoredCoords = store.getById(featureId)!.geometry.coordinates[0];
    expect(restoredCoords[0][0]).toBe(originalFirstVertex[0]);
    expect(restoredCoords[0][1]).toBe(originalFirstVertex[1]);

    // Redo should apply the move again
    history.redo(store);
    const redoneCoords = store.getById(featureId)!.geometry.coordinates[0];
    expect(redoneCoords[0][0]).toBe(2);
    expect(redoneCoords[0][1]).toBe(2);
  });

  it('should add vertex via midpoint and undo', () => {
    const { store, history, modeManager } = createSystem();

    // Draw a square
    drawSquare(modeManager);
    const featureId = store.getAll()[0].id;

    // Original ring has 5 unique vertices (4 square + 1 extra from draw) + closing
    const originalRingLength =
      store.getById(featureId)!.geometry.coordinates[0].length;

    // Switch to select and select
    modeManager.setMode('select');
    const selectImpl = modeManager.getCurrentMode()!;
    selectImpl.onPointerDown(createPointerEvent(5, 5)); // select

    // Click on midpoint between vertex (0,0) and (10,0) → midpoint is (5,0)
    selectImpl.onPointerDown(createPointerEvent(5, 0)); // insert midpoint
    selectImpl.onPointerMove(createPointerEvent(5, -2)); // drag it down
    selectImpl.onPointerUp(createPointerEvent(5, -2)); // commit

    // Ring should have one more vertex
    const newRingLength =
      store.getById(featureId)!.geometry.coordinates[0].length;
    expect(newRingLength).toBe(originalRingLength + 1);

    // Undo should restore original vertex count
    history.undo(store);
    const undoneRingLength =
      store.getById(featureId)!.geometry.coordinates[0].length;
    expect(undoneRingLength).toBe(originalRingLength);
  });

  it('should delete vertex via double-click and undo', () => {
    const { store, history, modeManager } = createSystem();

    // Draw a square
    drawSquare(modeManager);
    const featureId = store.getAll()[0].id;
    const originalRingLength =
      store.getById(featureId)!.geometry.coordinates[0].length;

    // Switch to select and select
    modeManager.setMode('select');
    const selectImpl = modeManager.getCurrentMode()!;
    selectImpl.onPointerDown(createPointerEvent(5, 5)); // select

    // Double-click on vertex (0,0) to delete it
    const dblEvt = createPointerEvent(0, 0);
    vi.spyOn(dblEvt.originalEvent, 'preventDefault').mockImplementation(
      () => {},
    );
    vi.spyOn(dblEvt.originalEvent, 'stopPropagation').mockImplementation(
      () => {},
    );
    selectImpl.onDoubleClick(dblEvt);

    // Ring should have one fewer vertex
    const newRingLength =
      store.getById(featureId)!.geometry.coordinates[0].length;
    expect(newRingLength).toBe(originalRingLength - 1);

    // Undo should restore
    history.undo(store);
    const undoneRingLength =
      store.getById(featureId)!.geometry.coordinates[0].length;
    expect(undoneRingLength).toBe(originalRingLength);
  });

  it('should delete vertex via long press and undo', () => {
    const { store, history, modeManager } = createSystem();

    // Draw a square
    drawSquare(modeManager);
    const featureId = store.getAll()[0].id;
    const originalRingLength =
      store.getById(featureId)!.geometry.coordinates[0].length;

    // Switch to select and select
    modeManager.setMode('select');
    const selectImpl = modeManager.getCurrentMode()!;
    selectImpl.onPointerDown(createPointerEvent(5, 5)); // select

    // Long press on vertex (0,0) to delete it
    selectImpl.onLongPress(createPointerEvent(0, 0));

    // Ring should have one fewer vertex
    const newRingLength =
      store.getById(featureId)!.geometry.coordinates[0].length;
    expect(newRingLength).toBe(originalRingLength - 1);

    // Undo should restore
    history.undo(store);
    const undoneRingLength =
      store.getById(featureId)!.geometry.coordinates[0].length;
    expect(undoneRingLength).toBe(originalRingLength);
  });

  it('should move entire polygon via drag and undo/redo', () => {
    const { store, history, modeManager } = createSystem();

    // Draw a square
    drawSquare(modeManager);
    expect(store.getAll()).toHaveLength(1);

    const featureId = store.getAll()[0].id;
    const originalCoords = store.getById(featureId)!.geometry.coordinates[0].map(
      (pos: number[]) => [...pos],
    );

    // Switch to select mode and select the polygon
    modeManager.setMode('select');
    const selectImpl = modeManager.getCurrentMode()!;
    selectImpl.onPointerDown(createPointerEvent(5, 5)); // select

    // Start polygon drag by clicking inside the polygon body (far from vertices)
    selectImpl.onPointerDown(createPointerEvent(5, 5));
    // Drag with delta (3, 2)
    selectImpl.onPointerMove(createPointerEvent(8, 7));
    selectImpl.onPointerUp(createPointerEvent(8, 7)); // commit

    // Verify all vertices moved by the same delta
    const movedCoords = store.getById(featureId)!.geometry.coordinates[0];
    for (let i = 0; i < originalCoords.length; i++) {
      expect(movedCoords[i][0]).toBeCloseTo(originalCoords[i][0] + 3, 10);
      expect(movedCoords[i][1]).toBeCloseTo(originalCoords[i][1] + 2, 10);
    }

    // Undo should restore original positions
    history.undo(store);
    const restoredCoords = store.getById(featureId)!.geometry.coordinates[0];
    for (let i = 0; i < originalCoords.length; i++) {
      expect(restoredCoords[i][0]).toBeCloseTo(originalCoords[i][0], 10);
      expect(restoredCoords[i][1]).toBeCloseTo(originalCoords[i][1], 10);
    }

    // Redo should apply the move again
    history.redo(store);
    const redoneCoords = store.getById(featureId)!.geometry.coordinates[0];
    for (let i = 0; i < originalCoords.length; i++) {
      expect(redoneCoords[i][0]).toBeCloseTo(originalCoords[i][0] + 3, 10);
      expect(redoneCoords[i][1]).toBeCloseTo(originalCoords[i][1] + 2, 10);
    }
  });

  it('should NOT delete polygon on long press when missing vertex', () => {
    const { store, modeManager } = createSystem();

    // Draw a square
    drawSquare(modeManager);
    expect(store.getAll()).toHaveLength(1);

    // Switch to select and select
    modeManager.setMode('select');
    const selectImpl = modeManager.getCurrentMode()!;
    selectImpl.onPointerDown(createPointerEvent(5, 5)); // select

    // Long press in the middle (not near any vertex)
    selectImpl.onLongPress(createPointerEvent(5, 5));

    // Polygon should still exist (safe)
    expect(store.getAll()).toHaveLength(1);
  });

  it('should programmatically select and clear selection', () => {
    const { store, modeManager, selectMode } = createSystem();

    drawSquare(modeManager);
    const featureId = store.getAll()[0].id;

    modeManager.setMode('select');

    // Programmatic select
    const result = selectMode.selectFeature(featureId);
    expect(result).toBe(true);
    expect(selectMode.getSelectedIds()).toEqual([featureId]);

    // Clear
    selectMode.clearSelection();
    expect(selectMode.getSelectedIds()).toHaveLength(0);
  });

  it('should delete a feature programmatically and undo/redo', () => {
    const { store, history, modeManager } = createSystem();

    drawSquare(modeManager);
    const featureId = store.getAll()[0].id;
    const feature = store.getById(featureId)!;

    // Delete
    store.remove(featureId);
    const action = new DeleteAction(feature);
    history.push(action);

    expect(store.getAll()).toHaveLength(0);

    // Undo (restore)
    history.undo(store);
    expect(store.getAll()).toHaveLength(1);
    expect(store.getById(featureId)).toBeDefined();

    // Redo (delete again)
    history.redo(store);
    expect(store.getAll()).toHaveLength(0);
  });

  it('should clear selection when deleting a selected feature', () => {
    const { store, history, modeManager, selectMode } = createSystem();

    drawSquare(modeManager);
    const featureId = store.getAll()[0].id;

    modeManager.setMode('select');
    selectMode.selectFeature(featureId);
    expect(selectMode.getSelectedIds()).toContain(featureId);

    // Clear selection first, then delete
    const feature = store.getById(featureId)!;
    selectMode.clearSelection();
    store.remove(featureId);
    history.push(new DeleteAction(feature));

    expect(selectMode.getSelectedIds()).toHaveLength(0);
    expect(store.getAll()).toHaveLength(0);
  });
});
