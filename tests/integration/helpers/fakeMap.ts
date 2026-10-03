import { vi } from 'vitest';
import type { Map as MaplibreMap } from 'maplibre-gl';

/**
 * Shared map double for facade-level integration tests: enough surface for
 * LibreDraw to construct, render into GeoJSON sources, swap styles, and
 * receive canvas mouse events.
 */
export class FakeGeoJSONSource {
  public data: GeoJSON.FeatureCollection;

  constructor(initialData: GeoJSON.FeatureCollection) {
    this.data = initialData;
  }

  setData(data: GeoJSON.FeatureCollection): void {
    this.data = data;
  }
}

function fakeHandler() {
  let enabled = true;
  return {
    enable: vi.fn(() => {
      enabled = true;
    }),
    disable: vi.fn(() => {
      enabled = false;
    }),
    isEnabled: vi.fn(() => enabled),
  };
}

export class FakeMap {
  private styleLoaded = true;
  private canvas: HTMLDivElement;
  private sources: Map<string, FakeGeoJSONSource> = new Map();
  private layers: Map<string, unknown> = new Map();
  private images: Map<string, unknown> = new Map();
  private featureStates: Map<string, Record<string, unknown>> = new Map();
  private listeners: Map<string, Set<(...args: unknown[]) => void>> = new Map();
  /**
   * Geographic offset of the view: screen (x, y) shows (x + dx, y + dy).
   * Zero by default, which keeps project / unproject the identity.
   */
  private offset = { dx: 0, dy: 0 };

  /** Each handler keeps a real on / off state so tests can create a map with it disabled. */
  public dragPan = fakeHandler();
  public doubleClickZoom = fakeHandler();
  public boxZoom = fakeHandler();

  /** Runtime style updates are applied per layer; record them instead of rendering. */
  public setPaintProperty = vi.fn();
  public setLayoutProperty = vi.fn();

  /**
   * @param options.styleLoaded - `false` starts the map before its style
   *   has loaded, as right after `new maplibregl.Map()`; call
   *   {@link finishLoading} to complete the load.
   */
  constructor(options: { styleLoaded?: boolean } = {}) {
    this.styleLoaded = options.styleLoaded ?? true;
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
    // Layout size, which MapLibre (and the center reticle) sizes the view by.
    Object.defineProperty(this.canvas, 'clientWidth', { value: 1000 });
    Object.defineProperty(this.canvas, 'clientHeight', { value: 600 });
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
    this.featureStates.clear();
    this.emit('styledata');
    this.styleLoaded = true;
    this.emit('styledata');
  }

  /** Finish the initial style load: emit `styledata` and `load` as MapLibre does. */
  finishLoading(): void {
    this.styleLoaded = true;
    this.emit('styledata');
    this.emit('load');
  }

  getCanvas(): HTMLDivElement {
    return this.canvas;
  }

  getCanvasContainer(): HTMLDivElement {
    return this.canvas;
  }

  getContainer(): HTMLDivElement {
    return this.canvas;
  }

  unproject(point: [number, number]): { lng: number; lat: number } {
    return { lng: point[0] + this.offset.dx, lat: point[1] + this.offset.dy };
  }

  project(point: [number, number]): { x: number; y: number } {
    return { x: point[0] - this.offset.dx, y: point[1] - this.offset.dy };
  }

  /**
   * Pan the view so that screen (x, y) shows (x + dx, y + dy), and emit
   * `move` as a real map does while it pans.
   */
  panTo(dx: number, dy: number): void {
    this.offset = { dx, dy };
    this.emit('move');
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

  /** Like MapLibre, a layer whose id is already on the style is refused. */
  addLayer(layer: { id: string }): void {
    if (this.layers.has(layer.id)) return;
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

  setFeatureState(
    target: { source: string; id: string | number },
    state: Record<string, unknown>
  ): void {
    const key = `${target.source}/${target.id}`;
    this.featureStates.set(key, { ...this.featureStates.get(key), ...state });
  }

  getFeatureState(target: { source: string; id: string | number }): Record<string, unknown> {
    return this.featureStates.get(`${target.source}/${target.id}`) ?? {};
  }

  /** Ids of the layers on the style, bottom to top. */
  layerIds(): string[] {
    return [...this.layers.keys()];
  }

  getSourceData(id: string): GeoJSON.FeatureCollection | undefined {
    return this.sources.get(id)?.data;
  }
}
