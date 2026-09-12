import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Map as MaplibreMap } from 'maplibre-gl';
import { LibreDraw } from '../../src/LibreDraw';
import { SOURCE_IDS } from '../../src/rendering/SourceManager';
import { LAYER_IDS } from '../../src/rendering/RenderManager';
import { LibreDrawError } from '../../src/core/errors';

class FakeGeoJSONSource {
  public data: GeoJSON.FeatureCollection;

  constructor(initialData: GeoJSON.FeatureCollection) {
    this.data = initialData;
  }

  setData(data: GeoJSON.FeatureCollection): void {
    this.data = data;
  }
}

class FakeMap {
  private styleLoaded = true;
  private canvas: HTMLDivElement;
  private sources: Map<string, FakeGeoJSONSource> = new Map();
  private layers: Map<string, unknown> = new Map();
  private images: Map<string, unknown> = new Map();
  private listeners: Map<string, Set<(...args: unknown[]) => void>> = new Map();

  public dragPan = {
    enable: vi.fn(),
    disable: vi.fn(),
  };

  public doubleClickZoom = {
    enable: vi.fn(),
    disable: vi.fn(),
  };

  constructor() {
    this.canvas = document.createElement('div');
    vi.spyOn(this.canvas, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      width: 1000,
      height: 600,
      top: 0,
      left: 0,
      right: 1000,
      bottom: 600,
      toJSON: () => ({}),
    } as DOMRect);
  }

  asMap(): MaplibreMap {
    return this as unknown as MaplibreMap;
  }

  emit(event: string, ...args: unknown[]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const listener of set) {
      listener(...args);
    }
  }

  on(event: string, listener: (...args: unknown[]) => void): void {
    const set = this.listeners.get(event) ?? new Set();
    set.add(listener);
    this.listeners.set(event, set);
  }

  off(event: string, listener: (...args: unknown[]) => void): void {
    this.listeners.get(event)?.delete(listener);
  }

  once(event: string, listener: (...args: unknown[]) => void): void {
    const wrapped = (...args: unknown[]): void => {
      this.off(event, wrapped);
      listener(...args);
    };
    this.on(event, wrapped);
  }

  isStyleLoaded(): boolean {
    return this.styleLoaded;
  }

  setStyle(_style: string): void {
    this.styleLoaded = false;
    this.sources.clear();
    this.layers.clear();
    this.images.clear();
    this.emit('styledata');
    this.styleLoaded = true;
    this.emit('styledata');
  }

  getCanvasContainer(): HTMLDivElement {
    return this.canvas;
  }

  getContainer(): HTMLDivElement {
    return this.canvas;
  }

  unproject(point: [number, number]): { lng: number; lat: number } {
    return { lng: point[0], lat: point[1] };
  }

  project(point: [number, number]): { x: number; y: number } {
    return { x: point[0], y: point[1] };
  }

  getSource<T>(id: string): T | undefined {
    return this.sources.get(id) as T | undefined;
  }

  addSource(id: string, source: { type: 'geojson'; data: GeoJSON.FeatureCollection }): void {
    this.sources.set(id, new FakeGeoJSONSource(source.data));
  }

  removeSource(id: string): void {
    this.sources.delete(id);
  }

  getLayer(id: string): unknown {
    return this.layers.get(id);
  }

  addLayer(layer: { id: string }): void {
    this.layers.set(layer.id, layer);
  }

  removeLayer(id: string): void {
    this.layers.delete(id);
  }

  hasImage(id: string): boolean {
    return this.images.has(id);
  }

  addImage(id: string, image: unknown): void {
    this.images.set(id, image);
  }

  removeImage(id: string): void {
    this.images.delete(id);
  }

  hasSource(id: string): boolean {
    return this.sources.has(id);
  }

  hasLayer(id: string): boolean {
    return this.layers.has(id);
  }

  getSourceData(id: string): GeoJSON.FeatureCollection | undefined {
    return this.sources.get(id)?.data;
  }
}

function makeFeature(id: string): GeoJSON.Feature {
  return {
    id,
    type: 'Feature',
    properties: {},
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
  };
}

describe('LibreDraw lifecycle integration', () => {
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

  it('should clear selection and vertex handles after setFeatures', () => {
    const map = new FakeMap();
    const draw = new LibreDraw(map.asMap(), { toolbar: false });

    draw.addFeatures([makeFeature('f1')]);
    draw.setMode('select');
    draw.selectFeature('f1');

    expect(draw.getSelectedFeatureIds()).toEqual(['f1']);
    expect(map.getSourceData(SOURCE_IDS.EDIT_VERTICES)?.features.length).toBeGreaterThan(0);

    draw.setFeatures({
      type: 'FeatureCollection',
      features: [makeFeature('f2')],
    });

    expect(draw.getSelectedFeatureIds()).toEqual([]);
    expect(map.getSourceData(SOURCE_IDS.EDIT_VERTICES)?.features).toHaveLength(0);

    draw.destroy();
  });

  it('should recover layers/sources and keep interactions working after setStyle', () => {
    const map = new FakeMap();
    const draw = new LibreDraw(map.asMap(), { toolbar: false });

    draw.addFeatures([makeFeature('f1')]);
    expect(map.hasSource(SOURCE_IDS.FEATURES)).toBe(true);
    expect(map.hasLayer(LAYER_IDS.FILL)).toBe(true);

    map.setStyle('new-style');

    expect(map.hasSource(SOURCE_IDS.FEATURES)).toBe(true);
    expect(map.hasSource(SOURCE_IDS.PREVIEW)).toBe(true);
    expect(map.hasSource(SOURCE_IDS.EDIT_VERTICES)).toBe(true);
    expect(map.hasLayer(LAYER_IDS.FILL)).toBe(true);
    expect(map.hasLayer(LAYER_IDS.OUTLINE)).toBe(true);
    expect(map.hasLayer(LAYER_IDS.POINT)).toBe(true);
    expect(map.getSourceData(SOURCE_IDS.FEATURES)?.features).toHaveLength(1);

    draw.setMode('select');
    draw.selectFeature('f1');
    expect(draw.getSelectedFeatureIds()).toEqual(['f1']);

    draw.deleteFeature('f1');
    expect(draw.getFeatures()).toHaveLength(0);

    expect(draw.undo()).toBe(true);
    expect(draw.getFeatures()).toHaveLength(1);

    expect(draw.redo()).toBe(true);
    expect(draw.getFeatures()).toHaveLength(0);

    draw.destroy();
  });

  it('should apply map interactions from mode declarations on mode changes', () => {
    const map = new FakeMap();
    const draw = new LibreDraw(map.asMap(), { toolbar: false });

    vi.mocked(map.dragPan.enable).mockClear();
    vi.mocked(map.dragPan.disable).mockClear();
    vi.mocked(map.doubleClickZoom.enable).mockClear();
    vi.mocked(map.doubleClickZoom.disable).mockClear();

    draw.setMode('draw-polygon');
    expect(map.dragPan.disable).toHaveBeenCalledTimes(1);
    expect(map.doubleClickZoom.disable).toHaveBeenCalledTimes(1);

    draw.setMode('select');
    expect(map.dragPan.enable).toHaveBeenCalledTimes(1);
    expect(map.doubleClickZoom.disable).toHaveBeenCalledTimes(2);

    draw.setMode('split');
    expect(map.dragPan.disable).toHaveBeenCalledTimes(2);
    expect(map.doubleClickZoom.disable).toHaveBeenCalledTimes(3);

    draw.setMode('setback');
    expect(map.dragPan.disable).toHaveBeenCalledTimes(3);
    expect(map.doubleClickZoom.disable).toHaveBeenCalledTimes(4);

    draw.setMode('idle');
    expect(map.dragPan.enable).toHaveBeenCalledTimes(2);
    expect(map.doubleClickZoom.enable).toHaveBeenCalledTimes(1);

    draw.destroy();
  });

  it('should create toolbar by default when no options are given', () => {
    const map = new FakeMap();
    const container = map.getContainer();
    const draw = new LibreDraw(map.asMap());

    const toolbar = container.querySelector('.libre-draw-toolbar');
    expect(toolbar).not.toBeNull();

    draw.destroy();
  });

  it('should not create toolbar when toolbar option is false', () => {
    const map = new FakeMap();
    const container = map.getContainer();
    const draw = new LibreDraw(map.asMap(), { toolbar: false });

    const toolbar = container.querySelector('.libre-draw-toolbar');
    expect(toolbar).toBeNull();

    draw.destroy();
  });

  it('should create toolbar when toolbar option is an object', () => {
    const map = new FakeMap();
    const container = map.getContainer();
    const draw = new LibreDraw(map.asMap(), { toolbar: { position: 'top-right' } });

    const toolbar = container.querySelector('.libre-draw-toolbar');
    expect(toolbar).not.toBeNull();

    draw.destroy();
  });

  it('should render Point features through the POINT layer only', () => {
    const map = new FakeMap();
    const draw = new LibreDraw(map.asMap(), { toolbar: false });

    // The former vertices layer rendered nothing and is gone.
    expect(map.hasLayer('libre-draw-vertices')).toBe(false);
    expect(map.hasLayer(LAYER_IDS.POINT)).toBe(true);

    draw.addFeatures([
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [1, 2] },
        properties: {},
      } as unknown as ReturnType<typeof makeFeature>,
    ]);

    const sourceData = map.getSourceData(SOURCE_IDS.FEATURES);
    const pointFeature = sourceData?.features.find((f) => f.geometry.type === 'Point');
    expect(pointFeature).toBeDefined();
    expect(pointFeature?.properties?._isPoint).toBeUndefined();

    draw.destroy();
  });

  it('should emit delete event on undo of create action', () => {
    const map = new FakeMap();
    const draw = new LibreDraw(map.asMap(), { toolbar: false });

    draw.setMode('draw-polygon');

    // Manually add and create a feature to get a history entry
    draw.addFeatures([makeFeature('f1')]);
    // deleteFeature pushes a DeleteAction to history
    draw.deleteFeature('f1');

    const createListener = vi.fn();
    draw.on('create', createListener);

    // Undo the delete → should emit 'create' event
    draw.undo();

    expect(createListener).toHaveBeenCalledWith(
      expect.objectContaining({
        feature: expect.objectContaining({ id: 'f1' }),
      })
    );

    draw.destroy();
  });

  it('should emit delete event on redo of delete action', () => {
    const map = new FakeMap();
    const draw = new LibreDraw(map.asMap(), { toolbar: false });

    draw.addFeatures([makeFeature('f1')]);
    draw.deleteFeature('f1');

    draw.undo(); // restore f1

    const deleteListener = vi.fn();
    draw.on('delete', deleteListener);

    // Redo the delete → should emit 'delete' event
    draw.redo();

    expect(deleteListener).toHaveBeenCalledWith(
      expect.objectContaining({
        feature: expect.objectContaining({ id: 'f1' }),
      })
    );

    draw.destroy();
  });

  it('should expose draft control API through the facade', () => {
    const map = new FakeMap();
    const draw = new LibreDraw(map.asMap(), { toolbar: false });

    // Non-drawing modes: all draft API calls are no-ops / return defaults
    expect(draw.getDraftVertexCount()).toBe(0);
    expect(draw.finishDrawing()).toBe(false);
    draw.cancelDrawing(); // must not throw

    draw.setMode('draw-polygon');
    expect(draw.getDraftVertexCount()).toBe(0);

    // Simulate three pointer-downs via the mode directly is internal;
    // instead verify finishDrawing fails before enough vertices exist.
    expect(draw.finishDrawing()).toBe(false);

    const draftListener = vi.fn();
    draw.on('draftchange', draftListener);

    draw.cancelDrawing();
    expect(draftListener).toHaveBeenCalledWith({ vertexCount: 0 });

    draw.setMode('draw-line');
    expect(draw.getDraftVertexCount()).toBe(0);
    expect(draw.finishDrawing()).toBe(false); // no vertices yet

    draw.destroy();
  });

  it('should apply custom style options to layer paint definitions', () => {
    const map = new FakeMap();
    const draw = new LibreDraw(map.asMap(), {
      toolbar: false,
      style: {
        fill: {
          color: '#123456',
          selectedColor: '#abcdef',
        },
        preview: {
          dasharray: [4, 1],
          width: 3,
        },
        vertex: {
          strokeWidth: 4,
        },
        editVertex: {
          color: '#00aa00',
          highlightedColor: '#ff00ff',
        },
      },
    });

    const fillLayer = map.getLayer(LAYER_IDS.FILL) as {
      paint: Record<string, unknown>;
    };
    const fillColorExpr = fillLayer.paint['fill-color'] as unknown[];
    expect(fillColorExpr[2]).toBe('#abcdef');
    expect(fillColorExpr[3]).toBe('#123456');

    const previewLayer = map.getLayer(LAYER_IDS.PREVIEW) as {
      paint: Record<string, unknown>;
    };
    expect(previewLayer.paint['line-dasharray']).toEqual([4, 1]);
    expect(previewLayer.paint['line-width']).toBe(3);

    // The deprecated `vertex` section is accepted and ignored.
    expect(map.hasLayer('libre-draw-vertices')).toBe(false);

    const editVerticesLayer = map.getLayer(LAYER_IDS.EDIT_VERTICES) as {
      paint: Record<string, unknown>;
    };
    const editColorExpr = editVerticesLayer.paint['circle-color'] as unknown[];
    expect(editColorExpr[2]).toBe('#ff00ff');
    expect(editColorExpr[3]).toBe('#00aa00');

    draw.destroy();
  });

  it('should undo the addFeatures step instead of an earlier action (Issue #3)', () => {
    const map = new FakeMap();
    const draw = new LibreDraw(map.asMap(), { toolbar: false });

    draw.setFeatures({
      type: 'FeatureCollection',
      features: [makeFeature('x'), makeFeature('a')],
    });
    draw.deleteFeature('x'); // earlier history entry
    expect(draw.getFeatures().map((f) => f.id)).toEqual(['a']);

    draw.addFeatures([makeFeature('b')]);
    expect(draw.getFeatures().map((f) => f.id)).toEqual(['a', 'b']);

    expect(draw.undo()).toBe(true);
    expect(draw.getFeatures().map((f) => f.id)).toEqual(['a']);

    draw.destroy();
  });

  it('should undo and redo a multi-feature addFeatures call as one step', () => {
    const map = new FakeMap();
    const draw = new LibreDraw(map.asMap(), { toolbar: false });

    draw.addFeatures([makeFeature('b'), makeFeature('c')]);
    expect(draw.getFeatures().map((f) => f.id)).toEqual(['b', 'c']);

    expect(draw.undo()).toBe(true);
    expect(draw.getFeatures()).toHaveLength(0);
    expect(draw.undo()).toBe(false);

    expect(draw.redo()).toBe(true);
    expect(draw.getFeatures().map((f) => f.id)).toEqual(['b', 'c']);
    expect(draw.redo()).toBe(false);

    draw.destroy();
  });

  it('should emit a create event per feature added by addFeatures with a detached payload', () => {
    const map = new FakeMap();
    const draw = new LibreDraw(map.asMap(), { toolbar: false });

    const createListener = vi.fn();
    draw.on('create', createListener);

    draw.addFeatures([makeFeature('b'), makeFeature('c')]);

    expect(createListener).toHaveBeenCalledTimes(2);
    expect(createListener.mock.calls[0][0].feature.id).toBe('b');
    expect(createListener.mock.calls[1][0].feature.id).toBe('c');

    // Mutating the payload must not leak into the store.
    createListener.mock.calls[0][0].feature.properties.name = 'tampered';
    expect(draw.getFeatureById('b')!.properties.name).toBeUndefined();

    draw.destroy();
  });

  it('should emit delete events on undo and create events on redo of addFeatures', () => {
    const map = new FakeMap();
    const draw = new LibreDraw(map.asMap(), { toolbar: false });

    draw.addFeatures([makeFeature('b'), makeFeature('c')]);

    const deleteListener = vi.fn();
    const createListener = vi.fn();
    draw.on('delete', deleteListener);
    draw.on('create', createListener);

    draw.undo();
    expect(deleteListener).toHaveBeenCalledTimes(2);
    expect(deleteListener.mock.calls.map((c) => c[0].feature.id)).toEqual(['c', 'b']);
    expect(createListener).not.toHaveBeenCalled();

    draw.redo();
    expect(createListener).toHaveBeenCalledTimes(2);
    expect(createListener.mock.calls.map((c) => c[0].feature.id)).toEqual(['b', 'c']);

    draw.destroy();
  });

  it('should not record history or emit events for an empty addFeatures call', () => {
    const map = new FakeMap();
    const draw = new LibreDraw(map.asMap(), { toolbar: false });

    const createListener = vi.fn();
    draw.on('create', createListener);

    draw.addFeatures([]);

    expect(createListener).not.toHaveBeenCalled();
    expect(draw.undo()).toBe(false);

    draw.destroy();
  });

  it('should add nothing and record nothing when addFeatures receives an invalid feature', () => {
    const map = new FakeMap();
    const draw = new LibreDraw(map.asMap(), { toolbar: false });

    const createListener = vi.fn();
    draw.on('create', createListener);

    expect(() =>
      draw.addFeatures([makeFeature('b'), { type: 'Feature', geometry: null, properties: {} }])
    ).toThrow(LibreDrawError);

    expect(draw.getFeatures()).toHaveLength(0);
    expect(createListener).not.toHaveBeenCalled();
    expect(draw.undo()).toBe(false);

    draw.destroy();
  });

  it('should reject addFeatures when an id already exists or repeats within the call', () => {
    const map = new FakeMap();
    const draw = new LibreDraw(map.asMap(), { toolbar: false });

    draw.addFeatures([makeFeature('a')]);

    expect(() => draw.addFeatures([makeFeature('b'), makeFeature('a')])).toThrow(
      /already exists: a/
    );
    expect(draw.getFeatures().map((f) => f.id)).toEqual(['a']);

    expect(() => draw.addFeatures([makeFeature('b'), makeFeature('b')])).toThrow(
      /already exists: b/
    );
    expect(draw.getFeatures().map((f) => f.id)).toEqual(['a']);

    // Only the original addFeatures step is in the history.
    expect(draw.undo()).toBe(true);
    expect(draw.getFeatures()).toHaveLength(0);
    expect(draw.undo()).toBe(false);

    draw.destroy();
  });

  it('should still reset history when setFeatures follows addFeatures', () => {
    const map = new FakeMap();
    const draw = new LibreDraw(map.asMap(), { toolbar: false });

    draw.addFeatures([makeFeature('a')]);
    draw.setFeatures({ type: 'FeatureCollection', features: [makeFeature('b')] });

    expect(draw.undo()).toBe(false);
    expect(draw.getFeatures().map((f) => f.id)).toEqual(['b']);

    draw.destroy();
  });

  it('should enable the toolbar undo button after addFeatures', () => {
    const map = new FakeMap();
    const container = map.getContainer();
    const draw = new LibreDraw(map.asMap());

    const undoButton = container.querySelector<HTMLButtonElement>('button[title="Undo"]');
    expect(undoButton).not.toBeNull();
    expect(undoButton!.disabled).toBe(true);

    draw.addFeatures([makeFeature('a')]);
    expect(undoButton!.disabled).toBe(false);

    draw.undo();
    expect(undoButton!.disabled).toBe(true);

    draw.destroy();
  });

  describe('draw-rectangle toolbar button', () => {
    it('should show the draw-rectangle button by default and toggle the mode', () => {
      const map = new FakeMap();
      const container = map.getContainer();
      const draw = new LibreDraw(map.asMap());

      const button = container.querySelector<HTMLButtonElement>('button[title="Draw rectangle"]');
      expect(button).not.toBeNull();
      expect(button!.dataset.libreDrawButton).toBe('draw-rectangle');

      const modeListener = vi.fn();
      draw.on('modechange', modeListener);

      button!.click();
      expect(draw.getMode()).toBe('draw-rectangle');
      expect(button!.getAttribute('aria-pressed')).toBe('true');
      expect(modeListener).toHaveBeenLastCalledWith({
        mode: 'draw-rectangle',
        previousMode: 'idle',
      });

      // Pressing the active button again returns to idle.
      button!.click();
      expect(draw.getMode()).toBe('idle');
      expect(button!.getAttribute('aria-pressed')).toBe('false');

      draw.destroy();
    });

    it('should reflect setMode("draw-rectangle") in the toolbar and keep dragPan enabled', () => {
      const map = new FakeMap();
      const container = map.getContainer();
      const draw = new LibreDraw(map.asMap());
      const button = container.querySelector<HTMLButtonElement>('button[title="Draw rectangle"]')!;
      const drawButton = container.querySelector<HTMLButtonElement>(
        'button[title="Draw polygon"]'
      )!;

      draw.setMode('draw-rectangle');
      expect(button.getAttribute('aria-pressed')).toBe('true');
      expect(drawButton.getAttribute('aria-pressed')).toBe('false');
      // Corners are placed by clicks/taps, so a drag stays free to pan the
      // map -- the only single-finger map gesture available on touch.
      expect(map.dragPan.enable).toHaveBeenCalled();
      expect(map.dragPan.disable).not.toHaveBeenCalled();
      expect(map.doubleClickZoom.disable).toHaveBeenCalled();

      draw.setMode('draw-polygon');
      expect(button.getAttribute('aria-pressed')).toBe('false');
      expect(drawButton.getAttribute('aria-pressed')).toBe('true');

      draw.destroy();
    });

    it('should hide the draw-rectangle button when controls.drawRectangle is false', () => {
      const map = new FakeMap();
      const container = map.getContainer();
      const draw = new LibreDraw(map.asMap(), {
        toolbar: { controls: { drawRectangle: false } },
      });

      expect(container.querySelector('button[title="Draw rectangle"]')).toBeNull();
      // Other buttons are unaffected.
      expect(container.querySelector('button[title="Draw polygon"]')).not.toBeNull();

      draw.destroy();
    });
  });

  describe('setback undo / redo', () => {
    /** Click on the canvas; FakeMap projects screen pixels 1:1 to lng/lat. */
    function clickAt(map: FakeMap, x: number, y: number): void {
      const canvas = map.getCanvasContainer();
      canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: x, clientY: y, button: 0 }));
      window.dispatchEvent(new MouseEvent('mouseup', { clientX: x, clientY: y, button: 0 }));
    }

    it('re-emits the original edge index and distance on redo()', () => {
      const map = new FakeMap();
      // The toolbar's setback input is the only way to execute a setback
      // (KeyboardInput does not forward Enter), so keep the toolbar on.
      const draw = new LibreDraw(map.asMap());
      draw.addFeatures([
        {
          id: 'sq',
          type: 'Feature',
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
          properties: {},
        },
      ]);
      const setbackListener = vi.fn();
      draw.on('setback', setbackListener);

      draw.setMode('setback');
      clickAt(map, 30, 30); // select the polygon
      clickAt(map, 30, 12); // pick the top edge (index 0)
      const execute = map
        .getContainer()
        .querySelector('button[aria-label="Execute setback"]') as HTMLButtonElement;
      execute.click(); // default distance of 10 m

      expect(setbackListener).toHaveBeenCalledTimes(1);
      const first = setbackListener.mock.calls[0][0];
      expect(first.edgeIndex).toBe(0);
      expect(first.distance).toBe(10);

      draw.undo();
      draw.redo();

      expect(setbackListener).toHaveBeenCalledTimes(2);
      expect(setbackListener.mock.calls[1][0]).toMatchObject({ edgeIndex: 0, distance: 10 });

      draw.destroy();
    });
  });

  describe('union mode', () => {
    function makeSquare(id: string, x: number, y: number, size: number) {
      return {
        id,
        type: 'Feature' as const,
        geometry: {
          type: 'Polygon' as const,
          coordinates: [
            [
              [x, y],
              [x + size, y],
              [x + size, y + size],
              [x, y + size],
              [x, y],
            ],
          ],
        },
        properties: { name: id },
      };
    }

    /** Click on the canvas; FakeMap projects screen pixels 1:1 to lng/lat. */
    function clickAt(map: FakeMap, x: number, y: number): void {
      const canvas = map.getCanvasContainer();
      canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: x, clientY: y, button: 0 }));
      window.dispatchEvent(new MouseEvent('mouseup', { clientX: x, clientY: y, button: 0 }));
    }

    it('enters union mode from setMode() and the toolbar button', () => {
      const map = new FakeMap();
      const draw = new LibreDraw(map.asMap());
      const container = map.getContainer();

      draw.setMode('union');
      expect(draw.getMode()).toBe('union');
      expect(map.dragPan.enable).toHaveBeenCalled();

      draw.setMode('idle');
      const button = container.querySelector('button[title="Union polygons"]') as HTMLButtonElement;
      expect(button).not.toBeNull();
      button.click();
      expect(draw.getMode()).toBe('union');
      button.click();
      expect(draw.getMode()).toBe('idle');

      draw.destroy();
    });

    it('hides the union button when controls.union is false', () => {
      const map = new FakeMap();
      const draw = new LibreDraw(map.asMap(), { toolbar: { controls: { union: false } } });

      expect(map.getContainer().querySelector('button[title="Union polygons"]')).toBeNull();

      draw.destroy();
    });

    it('merges two polygons as one history step and re-emits union on redo()', () => {
      const map = new FakeMap();
      const draw = new LibreDraw(map.asMap(), { toolbar: false });
      draw.addFeatures([makeSquare('a', 10, 10, 40), makeSquare('b', 30, 30, 40)]);

      const unionListener = vi.fn();
      const createListener = vi.fn();
      const deleteListener = vi.fn();
      draw.on('union', unionListener);
      draw.on('create', createListener);
      draw.on('delete', deleteListener);

      draw.setMode('union');
      clickAt(map, 15, 15); // select 'a'
      clickAt(map, 65, 65); // click 'b' (outside 'a')

      expect(unionListener).toHaveBeenCalledTimes(1);
      const merged = unionListener.mock.calls[0][0].feature;
      expect(draw.getFeatures().map((f) => f.id)).toEqual([merged.id]);
      expect(merged.properties).toEqual({ name: 'a' });

      expect(draw.undo()).toBe(true);
      expect(
        draw
          .getFeatures()
          .map((f) => f.id)
          .sort()
      ).toEqual(['a', 'b']);
      expect(deleteListener).toHaveBeenCalledWith({
        feature: expect.objectContaining({ id: merged.id }),
      });
      expect(createListener).toHaveBeenCalledWith({
        feature: expect.objectContaining({ id: 'a' }),
      });
      expect(createListener).toHaveBeenCalledWith({
        feature: expect.objectContaining({ id: 'b' }),
      });

      expect(draw.redo()).toBe(true);
      expect(draw.getFeatures().map((f) => f.id)).toEqual([merged.id]);
      expect(unionListener).toHaveBeenCalledTimes(2);
      expect(unionListener.mock.calls[1][0]).toMatchObject({
        originalFeatures: [{ id: 'a' }, { id: 'b' }],
        feature: { id: merged.id },
      });
      expect(draw.undo()).toBe(true);
      expect(
        draw
          .getFeatures()
          .map((f) => f.id)
          .sort()
      ).toEqual(['a', 'b']);

      draw.destroy();
    });

    it('emits unionfailed for polygons that do not touch and leaves the store intact', () => {
      const map = new FakeMap();
      const draw = new LibreDraw(map.asMap(), { toolbar: false });
      draw.addFeatures([makeSquare('a', 10, 10, 20), makeSquare('b', 60, 60, 20)]);

      const failedListener = vi.fn();
      draw.on('unionfailed', failedListener);

      draw.setMode('union');
      clickAt(map, 15, 15);
      clickAt(map, 70, 70);

      expect(failedListener).toHaveBeenCalledWith({ reason: 'disjoint', featureIds: ['a', 'b'] });
      expect(draw.getFeatures()).toHaveLength(2);
      // Nothing was pushed: the only undoable step is the addFeatures() call.
      expect(draw.undo()).toBe(true);
      expect(draw.getFeatures()).toHaveLength(0);

      draw.destroy();
    });
  });

  describe('rotate mode', () => {
    function makeSquare(id: string) {
      return {
        id,
        type: 'Feature' as const,
        geometry: {
          type: 'Polygon' as const,
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
        properties: {},
      };
    }

    /** Click on the canvas; FakeMap projects screen pixels 1:1 to lng/lat. */
    function clickAt(map: FakeMap, x: number, y: number): void {
      const canvas = map.getCanvasContainer();
      canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: x, clientY: y, button: 0 }));
      window.dispatchEvent(new MouseEvent('mouseup', { clientX: x, clientY: y, button: 0 }));
    }

    it('exposes the rotation target through getSelectedFeatureIds() and clearSelection()', () => {
      const map = new FakeMap();
      const draw = new LibreDraw(map.asMap(), { toolbar: false });
      draw.addFeatures([makeSquare('sq')]);
      draw.setMode('rotate');

      clickAt(map, 30, 30);
      expect(draw.getSelectedFeatureIds()).toEqual(['sq']);

      const selectionListener = vi.fn();
      draw.on('selectionchange', selectionListener);
      draw.clearSelection();

      expect(draw.getSelectedFeatureIds()).toEqual([]);
      expect(selectionListener).toHaveBeenCalledWith({ selectedIds: [] });

      draw.destroy();
    });

    it('rotates relative to the current shape after undo()', () => {
      const map = new FakeMap();
      const draw = new LibreDraw(map.asMap(), { toolbar: false });
      draw.addFeatures([makeSquare('sq')]);
      draw.setMode('rotate');
      clickAt(map, 30, 30);

      const rotateListener = vi.fn();
      draw.on('rotate', rotateListener);

      // Drive the numeric input path through the toolbar callback surface:
      // the facade wires onRotateExecute -> rotateMode.executeFromUi, and the
      // mode is reachable only via the toolbar, so call the mode as the toolbar would.
      const rotateMode = (draw as unknown as { rotateMode: { executeFromUi(a: number): void } })
        .rotateMode;
      rotateMode.executeFromUi(45);
      expect(rotateListener).toHaveBeenCalledTimes(1);
      const afterFirst = draw.getFeatureById('sq')!.geometry.coordinates;

      expect(draw.undo()).toBe(true);
      expect(draw.getFeatureById('sq')!.geometry.coordinates).toEqual(
        makeSquare('sq').geometry.coordinates
      );

      // The next relative rotation starts from the undone (original) shape.
      rotateMode.executeFromUi(45);
      const afterSecond = draw.getFeatureById('sq')!.geometry.coordinates as number[][][];
      (afterFirst as number[][][])[0].forEach((pos, i) => {
        expect(afterSecond[0][i][0]).toBeCloseTo(pos[0], 6);
        expect(afterSecond[0][i][1]).toBeCloseTo(pos[1], 6);
      });
      expect(rotateListener.mock.calls[1][0].originalFeature.geometry.coordinates).toEqual(
        makeSquare('sq').geometry.coordinates
      );

      draw.destroy();
    });

    it('keeps the undone shape when undo() lands during a pending preview', () => {
      const map = new FakeMap();
      const draw = new LibreDraw(map.asMap(), { toolbar: false });
      draw.addFeatures([makeSquare('sq')]);
      draw.setMode('rotate');
      clickAt(map, 30, 30);

      const rotateMode = (
        draw as unknown as {
          rotateMode: { executeFromUi(a: number): void; onAngleChange(a: number): void };
        }
      ).rotateMode;
      rotateMode.executeFromUi(90);
      rotateMode.onAngleChange(30); // pending, uncommitted preview

      expect(draw.undo()).toBe(true);

      // The store shows the original square and the next rotation starts from it.
      expect(draw.getFeatureById('sq')!.geometry.coordinates).toEqual(
        makeSquare('sq').geometry.coordinates
      );
      const rotateListener = vi.fn();
      draw.on('rotate', rotateListener);
      rotateMode.executeFromUi(45);
      expect(rotateListener.mock.calls[0][0].originalFeature.geometry.coordinates).toEqual(
        makeSquare('sq').geometry.coordinates
      );

      draw.destroy();
    });

    it('does not clobber setFeatures() data with a stale rotation preview', () => {
      const map = new FakeMap();
      const draw = new LibreDraw(map.asMap(), { toolbar: false });
      draw.addFeatures([makeSquare('sq')]);
      draw.setMode('rotate');
      clickAt(map, 30, 30);

      const rotateMode = (draw as unknown as { rotateMode: { onAngleChange(a: number): void } })
        .rotateMode;
      rotateMode.onAngleChange(30); // pending preview

      const replacement = {
        ...makeSquare('sq'),
        geometry: {
          type: 'Polygon' as const,
          coordinates: [
            [
              [60, 60],
              [70, 60],
              [70, 70],
              [60, 70],
              [60, 60],
            ],
          ],
        },
      };
      draw.setFeatures({ type: 'FeatureCollection', features: [replacement] });

      expect(draw.getFeatureById('sq')!.geometry.coordinates).toEqual(
        replacement.geometry.coordinates
      );
      expect(draw.getSelectedFeatureIds()).toEqual([]);

      draw.destroy();
    });

    it('shows the rotate button and the angle input only while a target is selected', () => {
      const map = new FakeMap();
      const draw = new LibreDraw(map.asMap(), { toolbar: true });
      const container = map.getContainer();
      draw.addFeatures([makeSquare('sq')]);

      const button = container.querySelector<HTMLButtonElement>('button[title="Rotate feature"]');
      const input = container.querySelector<HTMLDivElement>('.libre-draw-rotate-input');
      expect(button).not.toBeNull();
      expect(input).not.toBeNull();
      expect(input!.style.display).toBe('none');

      button!.click();
      expect(draw.getMode()).toBe('rotate');
      expect(button!.getAttribute('aria-pressed')).toBe('true');
      expect(input!.style.display).toBe('none');

      clickAt(map, 30, 30);
      expect(input!.style.display).toBe('inline-flex');

      draw.clearSelection();
      expect(input!.style.display).toBe('none');

      clickAt(map, 30, 30);
      expect(input!.style.display).toBe('inline-flex');
      draw.setMode('select');
      expect(input!.style.display).toBe('none');
      expect(button!.getAttribute('aria-pressed')).toBe('false');

      draw.destroy();
    });

    it('hides the rotate control with controls.rotate: false', () => {
      const map = new FakeMap();
      const draw = new LibreDraw(map.asMap(), { toolbar: { controls: { rotate: false } } });
      const container = map.getContainer();

      expect(container.querySelector('button[title="Rotate feature"]')).toBeNull();
      expect(container.querySelector('.libre-draw-rotate-input')).toBeNull();

      draw.destroy();
    });

    it('redraws the pivot marker after a style swap', () => {
      const map = new FakeMap();
      const draw = new LibreDraw(map.asMap(), { toolbar: false });
      draw.addFeatures([makeSquare('sq')]);
      draw.setMode('rotate');
      clickAt(map, 30, 30);
      expect(map.getSourceData(SOURCE_IDS.ROTATION_CENTER)!.features).toHaveLength(1);

      // A style swap rebuilds every source empty; the marker must come back.
      map.setStyle('new-style');

      expect(draw.getSelectedFeatureIds()).toEqual(['sq']);
      expect(map.getSourceData(SOURCE_IDS.ROTATION_CENTER)!.features).toHaveLength(1);

      draw.destroy();
    });

    it('drops the rotation selection when undo() removes the feature', () => {
      const map = new FakeMap();
      const draw = new LibreDraw(map.asMap(), { toolbar: false });
      draw.addFeatures([makeSquare('sq')]);
      draw.setMode('rotate');
      clickAt(map, 30, 30);
      expect(draw.getSelectedFeatureIds()).toEqual(['sq']);

      draw.undo(); // undoes addFeatures: the feature is gone

      expect(draw.getFeatureById('sq')).toBeUndefined();
      expect(draw.getSelectedFeatureIds()).toEqual([]);

      draw.destroy();
    });
  });
});
