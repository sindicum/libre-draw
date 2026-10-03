import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LibreDraw } from '../../src/LibreDraw';
import { LibreDrawError } from '../../src/core/errors';
import { SOURCE_IDS } from '../../src/rendering/layers';
import type { HistoryChangeEvent } from '../../src/types/events';
import { FakeMap } from './helpers/fakeMap';

// Contracts of docs/api/libre-draw.md (canUndo / canRedo, setSetbackDistance /
// getSetbackDistance) and docs/api/events.md (historychange): what a UI built
// on the public API alone can rely on.

function square(id: string): GeoJSON.Feature {
  return {
    id,
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [10, 10],
          [50, 10],
          [50, 50],
          [10, 50],
          [10, 10],
        ],
      ],
    },
  };
}

function clickAt(map: FakeMap, x: number, y: number): void {
  const canvas = map.getCanvasContainer();
  canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: x, clientY: y, button: 0 }));
  window.dispatchEvent(new MouseEvent('mouseup', { clientX: x, clientY: y, button: 0 }));
}

function pressEnter(map: FakeMap): void {
  map
    .getCanvasContainer()
    .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
}

describe('history state for a custom UI', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', ((cb: FrameRequestCallback): number => {
      cb(0);
      return 1;
    }) as typeof requestAnimationFrame);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('canUndo() / canRedo() follow the history without changing it', () => {
    const draw = new LibreDraw(new FakeMap().asMap(), { toolbar: false });

    expect(draw.canUndo()).toBe(false);
    expect(draw.canRedo()).toBe(false);

    draw.addFeatures([square('a')]);
    expect(draw.canUndo()).toBe(true);
    expect(draw.canRedo()).toBe(false);

    draw.undo();
    expect(draw.canUndo()).toBe(false);
    expect(draw.canRedo()).toBe(true);

    // Reading twice gives the same answer: nothing was moved.
    expect(draw.canRedo()).toBe(true);
    draw.redo();
    expect(draw.canUndo()).toBe(true);
    expect(draw.canRedo()).toBe(false);

    draw.destroy();
  });

  it('emits historychange with the new availability on every change of the stacks', () => {
    const draw = new LibreDraw(new FakeMap().asMap(), { toolbar: false });
    const events: HistoryChangeEvent[] = [];
    draw.on('historychange', (e) => events.push(e));

    draw.addFeatures([square('a')]);
    draw.deleteFeature('a');
    draw.undo();
    draw.redo();
    draw.setFeatures({ type: 'FeatureCollection', features: [] });

    expect(events.map((e) => [e.canUndo, e.canRedo])).toEqual([
      [true, false], // addFeatures
      [true, false], // deleteFeature
      [true, true], // undo
      [true, false], // redo
      [false, false], // setFeatures resets the history
    ]);
    // The payload is what the methods return at that moment.
    expect([draw.canUndo(), draw.canRedo()]).toEqual([false, false]);

    draw.destroy();
  });

  it('emits historychange for an action recorded by a mode and by an editing method', () => {
    const map = new FakeMap();
    const draw = new LibreDraw(map.asMap(), { toolbar: false });
    draw.addFeatures([square('sq')]);
    const events: HistoryChangeEvent[] = [];
    draw.on('historychange', (e) => events.push(e));

    // A point placed on the map is recorded by the mode, not by the facade.
    draw.setMode('draw-point');
    clickAt(map, 200, 200);
    // An editing method records through the operation layer.
    const rotated = draw.rotate('sq', 90);

    expect(rotated.ok).toBe(true);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ canUndo: true, canRedo: false, origin: 'user' });
    expect(events[1]).toMatchObject({ canUndo: true, canRedo: false, origin: 'api' });

    draw.destroy();
  });

  it('does not emit historychange when nothing changed', () => {
    const draw = new LibreDraw(new FakeMap().asMap(), { toolbar: false });
    const listener = vi.fn();
    draw.on('historychange', listener);

    expect(draw.undo()).toBe(false);
    expect(draw.redo()).toBe(false);
    draw.addFeatures([{ type: 'Feature', properties: {}, geometry: null } as never]);
    expect(draw.deleteFeature('missing')).toBeUndefined();

    expect(listener).not.toHaveBeenCalled();

    draw.destroy();
  });

  it('stamps the origin by the call path: undo() is api, the toolbar button is user', () => {
    const map = new FakeMap();
    const draw = new LibreDraw(map.asMap());
    const origins: string[] = [];
    draw.on('historychange', (e) => origins.push(e.origin));

    draw.addFeatures([square('a')]);
    draw.undo();
    const redoButton = map
      .getContainer()
      .querySelector('button[data-libre-draw-button="redo"]') as HTMLButtonElement;
    redoButton.click();

    expect(origins).toEqual(['api', 'api', 'user']);

    draw.destroy();
  });

  it('throws after destroy like every other method', () => {
    const draw = new LibreDraw(new FakeMap().asMap(), { toolbar: false });
    draw.destroy();

    expect(() => draw.canUndo()).toThrow(LibreDrawError);
    expect(() => draw.canRedo()).toThrow(LibreDrawError);
    expect(() => draw.getSetbackDistance()).toThrow(LibreDrawError);
    expect(() => draw.setSetbackDistance(5)).toThrow(LibreDrawError);
    expect(() => draw.getSetbackEdge()).toThrow(LibreDrawError);
    expect(() => draw.setLayers([])).toThrow(LibreDrawError);
  });
});

describe('setback distance for a custom UI', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', ((cb: FrameRequestCallback): number => {
      cb(0);
      return 1;
    }) as typeof requestAnimationFrame);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('starts at 10 m and accepts a finite positive number', () => {
    const draw = new LibreDraw(new FakeMap().asMap(), { toolbar: false });

    expect(draw.getSetbackDistance()).toBe(10);
    expect(draw.setSetbackDistance(25.5)).toBe(true);
    expect(draw.getSetbackDistance()).toBe(25.5);

    draw.destroy();
  });

  it.each([0, -3, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects %s and keeps the current distance',
    (value) => {
      const draw = new LibreDraw(new FakeMap().asMap(), { toolbar: false });
      draw.setSetbackDistance(20);

      expect(draw.setSetbackDistance(value)).toBe(false);
      expect(draw.getSetbackDistance()).toBe(20);

      draw.destroy();
    }
  );

  it('is the distance the setback mode applies without the toolbar', () => {
    const map = new FakeMap();
    const draw = new LibreDraw(map.asMap(), { toolbar: false });
    draw.addFeatures([square('sq')]);
    const setbackListener = vi.fn();
    draw.on('setback', setbackListener);
    draw.setSetbackDistance(25);

    draw.setMode('setback');
    clickAt(map, 30, 30); // select the polygon
    clickAt(map, 30, 12); // pick the top edge (index 0)
    pressEnter(map);

    expect(setbackListener).toHaveBeenCalledTimes(1);
    expect(setbackListener.mock.calls[0][0]).toMatchObject({ edgeIndex: 0, distance: 25 });

    draw.destroy();
  });

  it('redraws the preview of a picked edge when the distance changes', () => {
    const map = new FakeMap();
    const draw = new LibreDraw(map.asMap(), { toolbar: false });
    draw.addFeatures([square('sq')]);
    const previewLine = () =>
      (map.getSourceData(SOURCE_IDS.PREVIEW)?.features[0]?.geometry as GeoJSON.LineString)
        .coordinates;

    draw.setMode('setback');
    clickAt(map, 30, 30); // select the polygon
    clickAt(map, 30, 12); // pick the top edge: the preview shows the 10 m offset
    const at10 = previewLine();

    draw.setSetbackDistance(40);

    const at40 = previewLine();
    expect(at40).not.toEqual(at10);
    // The offset line moves inward (toward larger y) with the larger distance.
    expect(at40[0][1]).toBeGreaterThan(at10[0][1]);

    draw.destroy();
  });

  it('exposes the picked edge only while the setback mode previews it', () => {
    const map = new FakeMap();
    const draw = new LibreDraw(map.asMap(), { toolbar: false });
    draw.addFeatures([square('sq')]);

    expect(draw.getSetbackEdge()).toBeUndefined(); // idle
    draw.setMode('setback');
    expect(draw.getSetbackEdge()).toBeUndefined(); // nothing picked
    clickAt(map, 30, 30); // select the polygon
    expect(draw.getSetbackEdge()).toBeUndefined(); // polygon, no edge yet
    clickAt(map, 30, 12); // pick the top edge
    expect(draw.getSetbackEdge()).toEqual({ index: 0 });
    clickAt(map, 48, 30); // pick the right edge instead
    expect(draw.getSetbackEdge()).toEqual({ index: 1 });

    draw.setMode('select');
    expect(draw.getSetbackEdge()).toBeUndefined(); // outside setback mode

    draw.destroy();
  });

  it('lets a custom UI apply the picked edge with setback(), as the toolbar does', () => {
    const map = new FakeMap();
    const draw = new LibreDraw(map.asMap(), { toolbar: false });
    draw.addFeatures([square('sq')]);
    const setbackListener = vi.fn();
    draw.on('setback', setbackListener);

    draw.setMode('setback');
    clickAt(map, 30, 30);
    clickAt(map, 48, 30); // the right edge, so a getter stuck on edge 0 would show
    const edge = draw.getSetbackEdge();
    const [id] = draw.getSelectedFeatureIds();
    const result = draw.setback(id, edge!, draw.getSetbackDistance());

    expect(result.ok).toBe(true);
    expect(setbackListener.mock.calls[0][0]).toMatchObject({
      edgeIndex: 1,
      distance: 10,
      origin: 'api',
    });
    // The original is gone, so the pick is over; the mode is ready for the next polygon.
    expect(draw.getSetbackEdge()).toBeUndefined();
    expect(draw.getMode()).toBe('setback');

    draw.destroy();
  });

  it('shares one value with the toolbar field in both directions', () => {
    const map = new FakeMap();
    const draw = new LibreDraw(map.asMap());
    const field = map
      .getContainer()
      .querySelector('.libre-draw-setback-input input') as HTMLInputElement;

    draw.setSetbackDistance(25);
    expect(field.value).toBe('25');

    field.value = '40';
    field.dispatchEvent(new Event('input'));
    expect(draw.getSetbackDistance()).toBe(40);

    // A value the field rejects (empty, zero) leaves the last valid one.
    field.value = '';
    field.dispatchEvent(new Event('input'));
    expect(draw.getSetbackDistance()).toBe(40);

    draw.destroy();
  });
});
