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
  private listeners: Map<string, Set<(...args: unknown[]) => void>> =
    new Map();

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

  addSource(
    id: string,
    source: { type: 'geojson'; data: GeoJSON.FeatureCollection },
  ): void {
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
    vi.stubGlobal(
      'requestAnimationFrame',
      ((cb: FrameRequestCallback): number => {
        cb(0);
        return 1;
      }) as typeof requestAnimationFrame,
    );
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
    expect(map.hasLayer(LAYER_IDS.VERTICES)).toBe(true);
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

    draw.setMode('draw');
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

  it('should not double-render Point features in VERTICES and POINT layers', () => {
    const map = new FakeMap();
    const draw = new LibreDraw(map.asMap(), { toolbar: false });

    const verticesLayer = map.getLayer(LAYER_IDS.VERTICES) as {
      filter: unknown[];
    };
    // VERTICES layer should exclude Point features via _isPoint property
    expect(verticesLayer.filter).toEqual([
      'all',
      ['==', '$type', 'Point'],
      ['!=', '_isPoint', true],
    ]);

    // Point features should have _isPoint property set
    draw.addFeatures([{
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [1, 2] },
      properties: {},
    } as unknown as ReturnType<typeof makeFeature>]);

    const sourceData = map.getSourceData(SOURCE_IDS.FEATURES);
    const pointFeature = sourceData?.features.find(
      (f) => f.geometry.type === 'Point',
    );
    expect(pointFeature?.properties?._isPoint).toBe(true);

    draw.destroy();
  });

  it('should emit delete event on undo of create action', () => {
    const map = new FakeMap();
    const draw = new LibreDraw(map.asMap(), { toolbar: false });

    draw.setMode('draw');

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
      }),
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
      }),
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

    draw.setMode('draw');
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

    const verticesLayer = map.getLayer(LAYER_IDS.VERTICES) as {
      paint: Record<string, unknown>;
    };
    expect(verticesLayer.paint['circle-stroke-width']).toBe(4);

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
      draw.addFeatures([makeFeature('b'), { type: 'Feature', geometry: null, properties: {} }]),
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
      /already exists: a/,
    );
    expect(draw.getFeatures().map((f) => f.id)).toEqual(['a']);

    expect(() => draw.addFeatures([makeFeature('b'), makeFeature('b')])).toThrow(
      /already exists: b/,
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
});
