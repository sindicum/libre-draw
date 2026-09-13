import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Map as MaplibreMap } from 'maplibre-gl';
import { LibreDraw } from '../../src/LibreDraw';
import type { DraftChangeEvent } from '../../src/types/events';

class FakeGeoJSONSource {
  constructor(public data: GeoJSON.FeatureCollection) {}

  setData(data: GeoJSON.FeatureCollection): void {
    this.data = data;
  }
}

/**
 * Minimal map double: enough surface for LibreDraw to construct, render
 * into GeoJSON sources, and receive canvas mouse events.
 */
class FakeMap {
  private canvas: HTMLDivElement;
  private sources: Map<string, FakeGeoJSONSource> = new Map();
  private layers: Map<string, unknown> = new Map();
  private images: Map<string, unknown> = new Map();
  private listeners: Map<string, Set<(...args: unknown[]) => void>> = new Map();

  public dragPan = { enable: vi.fn(), disable: vi.fn() };
  public doubleClickZoom = { enable: vi.fn(), disable: vi.fn() };

  constructor() {
    this.canvas = document.createElement('div');
    document.body.appendChild(this.canvas);
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
    return true;
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

  getBounds(): { getWest(): number; getSouth(): number; getEast(): number; getNorth(): number } {
    return { getWest: () => 0, getSouth: () => 0, getEast: () => 1000, getNorth: () => 600 };
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

function keydown(init: KeyboardEventInit): KeyboardEvent {
  return new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
}

/** Press a key with the map focused (events bubble from the canvas to the map container). */
function pressOnMap(map: FakeMap, init: KeyboardEventInit): KeyboardEvent {
  const event = keydown(init);
  map.getCanvasContainer().dispatchEvent(event);
  return event;
}

/** Simulate a click on the map canvas at the given screen position. */
function clickCanvas(canvas: HTMLElement, x: number, y: number): void {
  canvas.dispatchEvent(
    new MouseEvent('mousedown', { bubbles: true, clientX: x, clientY: y, button: 0 })
  );
  window.dispatchEvent(
    new MouseEvent('mouseup', { bubbles: true, clientX: x, clientY: y, button: 0 })
  );
}

describe('Keyboard shortcuts integration', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', ((cb: FrameRequestCallback): number => {
      cb(0);
      return 1;
    }) as typeof requestAnimationFrame);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });

  it('should undo with Ctrl+Z and redo with Ctrl+Shift+Z through the facade', () => {
    const map = new FakeMap();
    const draw = new LibreDraw(map.asMap(), { toolbar: false });
    // Undoing a create emits 'delete'; redoing it emits 'create' again.
    const deleteListener = vi.fn();
    const createListener = vi.fn();
    draw.on('delete', deleteListener);
    draw.on('create', createListener);

    draw.addFeatures([makeFeature('f1')]);
    expect(draw.getFeatures()).toHaveLength(1);
    expect(createListener).toHaveBeenCalledTimes(1);

    const undoEvent = pressOnMap(map, { key: 'z', ctrlKey: true });
    expect(draw.getFeatures()).toHaveLength(0);
    expect(deleteListener).toHaveBeenCalledTimes(1);
    expect(undoEvent.defaultPrevented).toBe(true);

    const redoEvent = pressOnMap(map, { key: 'Z', ctrlKey: true, shiftKey: true });
    expect(draw.getFeatures()).toHaveLength(1);
    expect(createListener).toHaveBeenCalledTimes(2);
    expect(redoEvent.defaultPrevented).toBe(true);

    draw.destroy();
  });

  it('should accept Cmd+Z / Cmd+Shift+Z on macOS but leave Cmd+Y to the browser', () => {
    const map = new FakeMap();
    const draw = new LibreDraw(map.asMap(), { toolbar: false });

    draw.addFeatures([makeFeature('f1')]);
    pressOnMap(map, { key: 'z', metaKey: true });
    expect(draw.getFeatures()).toHaveLength(0);

    // Cmd+Y opens the history page in macOS browsers; it must not redo.
    const cmdY = pressOnMap(map, { key: 'y', metaKey: true });
    expect(draw.getFeatures()).toHaveLength(0);
    expect(cmdY.defaultPrevented).toBe(false);

    pressOnMap(map, { key: 'Z', metaKey: true, shiftKey: true });
    expect(draw.getFeatures()).toHaveLength(1);

    draw.destroy();
  });

  it('should leave the event to the host page when the history is empty', () => {
    const map = new FakeMap();
    const draw = new LibreDraw(map.asMap(), { toolbar: false });
    const deleteListener = vi.fn();
    draw.on('delete', deleteListener);

    let undoEvent: KeyboardEvent | undefined;
    let redoEvent: KeyboardEvent | undefined;
    expect(() => {
      undoEvent = pressOnMap(map, { key: 'z', ctrlKey: true });
      redoEvent = pressOnMap(map, { key: 'y', ctrlKey: true });
    }).not.toThrow();
    expect(deleteListener).not.toHaveBeenCalled();
    expect(draw.getFeatures()).toHaveLength(0);
    // Nothing was undone, so the browser / host default must not be blocked.
    expect(undoEvent?.defaultPrevented).toBe(false);
    expect(redoEvent?.defaultPrevented).toBe(false);

    draw.destroy();
  });

  it('should ignore shortcuts while a text input inside the map has focus', () => {
    const map = new FakeMap();
    const draw = new LibreDraw(map.asMap(), { toolbar: false });
    draw.addFeatures([makeFeature('f1')]);

    // e.g. the toolbar's distance field, which lives inside the map container
    const input = document.createElement('input');
    map.getContainer().appendChild(input);
    const event = keydown({ key: 'z', ctrlKey: true });
    input.dispatchEvent(event);

    expect(draw.getFeatures()).toHaveLength(1);
    expect(event.defaultPrevented).toBe(false);

    draw.destroy();
  });

  it('should ignore keys pressed outside the map', () => {
    const map = new FakeMap();
    const draw = new LibreDraw(map.asMap(), { toolbar: false });
    draw.addFeatures([makeFeature('f1')]);

    const outside = document.createElement('button');
    document.body.appendChild(outside);
    const event = keydown({ key: 'z', ctrlKey: true });
    outside.dispatchEvent(event);
    document.dispatchEvent(keydown({ key: 'z', ctrlKey: true }));

    expect(draw.getFeatures()).toHaveLength(1);
    expect(event.defaultPrevented).toBe(false);

    draw.destroy();
  });

  it('should be enabled by default with the toolbar shown', () => {
    const map = new FakeMap();
    const draw = new LibreDraw(map.asMap());
    draw.addFeatures([makeFeature('f1')]);

    pressOnMap(map, { key: 'z', ctrlKey: true });

    expect(draw.getFeatures()).toHaveLength(0);

    draw.destroy();
  });

  it.each([
    ['keyboard: false', { keyboard: false } as const],
    ['keyboard: { undoRedo: false }', { keyboard: { undoRedo: false } } as const],
  ])('should disable shortcuts with %s but keep mode key dispatch', (_label, options) => {
    const map = new FakeMap();
    const draw = new LibreDraw(map.asMap(), { toolbar: false, ...options });
    draw.addFeatures([makeFeature('f1')]);

    const event = pressOnMap(map, { key: 'z', ctrlKey: true });
    expect(draw.getFeatures()).toHaveLength(1);
    expect(event.defaultPrevented).toBe(false);

    // Escape still reaches the active mode: a started line is cancelled.
    const drafts: DraftChangeEvent[] = [];
    draw.on('draftchange', (e) => drafts.push(e));
    draw.setMode('draw-line');
    clickCanvas(map.getCanvasContainer(), 100, 100);
    expect(drafts.at(-1)?.vertexCount).toBe(1);

    pressOnMap(map, { key: 'Escape' });
    expect(drafts.at(-1)?.vertexCount).toBe(0);

    draw.destroy();
  });

  it('should treat keyboard: { } and keyboard: true as enabled', () => {
    for (const keyboard of [true, {}] as const) {
      const map = new FakeMap();
      const draw = new LibreDraw(map.asMap(), { toolbar: false, keyboard });
      draw.addFeatures([makeFeature('f1')]);

      pressOnMap(map, { key: 'z', ctrlKey: true });
      expect(draw.getFeatures()).toHaveLength(0);

      draw.destroy();
    }
  });

  it('should stop responding after destroy', () => {
    const map = new FakeMap();
    const draw = new LibreDraw(map.asMap(), { toolbar: false });
    draw.addFeatures([makeFeature('f1')]);
    draw.destroy();

    let event: KeyboardEvent | undefined;
    expect(() => {
      event = pressOnMap(map, { key: 'z', ctrlKey: true });
    }).not.toThrow();
    expect(event?.defaultPrevented).toBe(false);
  });
});
