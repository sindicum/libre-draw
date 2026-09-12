import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Map as MaplibreMap } from 'maplibre-gl';
import { RenderManager, LAYER_IDS } from '../../../src/rendering/RenderManager';
import { SourceManager, SOURCE_IDS } from '../../../src/rendering/SourceManager';
import type { LibreDrawFeature } from '../../../src/types/features';

type LayerHandler = (event: { features?: Array<{ id?: string | number }> }) => void;

/** Stand-in for a MapLibre GeoJSON source: only `setData` is exercised. */
class FakeSource {
  constructor(public data: GeoJSON.FeatureCollection) {}

  setData(data: GeoJSON.FeatureCollection): void {
    this.data = data;
  }
}

/**
 * Minimal map stand-in.
 *
 * `setFeatureState` mirrors MapLibre and throws on a missing id, so a
 * regression that drops the feature id surfaces as a failing test rather
 * than a silently swallowed call.
 */
class FakeMap {
  readonly featureState = new Map<string | number, Record<string, unknown>>();
  readonly setFeatureState = vi.fn(
    (target: { source: string; id?: string | number }, state: Record<string, unknown>) => {
      if (target.id === undefined || target.id === null) {
        throw new Error('The feature id parameter must be provided.');
      }
      this.featureState.set(target.id, { ...this.featureState.get(target.id), ...state });
    }
  );

  private sources = new Map<string, FakeSource>();
  private layers = new Map<string, unknown>();
  private layerHandlers = new Map<string, LayerHandler>();
  private canvas = { style: { cursor: '' } };

  getSource<T>(id: string): T | undefined {
    return this.sources.get(id) as T | undefined;
  }

  addSource(id: string, options: { data: GeoJSON.FeatureCollection }): void {
    this.sources.set(id, new FakeSource(options.data));
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

  setPaintProperty(): void {}

  getCanvas(): { style: { cursor: string } } {
    return this.canvas;
  }

  on(event: string, layerOrHandler: string | LayerHandler, handler?: LayerHandler): void {
    if (typeof layerOrHandler === 'string' && handler) {
      this.layerHandlers.set(`${event}:${layerOrHandler}`, handler);
    }
  }

  /** Fire a layer-scoped handler registered through `on(event, layer, fn)`. */
  fire(
    event: string,
    layer: string,
    payload: { features?: Array<{ id?: string | number }> }
  ): void {
    this.layerHandlers.get(`${event}:${layer}`)?.(payload);
  }

  sourceData(id: string): GeoJSON.FeatureCollection | undefined {
    return this.sources.get(id)?.data;
  }
}

function makePoint(id: string, lng = 0, lat = 0): LibreDrawFeature {
  return {
    id,
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [lng, lat] },
    properties: {},
  };
}

const ID_A = '3c8da699-670c-4c77-a52b-3baf0c365c5a';
const ID_B = '9f1e2d3c-4b5a-6978-8a9b-0c1d2e3f4a5b';

describe('RenderManager', () => {
  let map: FakeMap;
  let manager: RenderManager;

  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', ((cb: FrameRequestCallback): number => {
      cb(0);
      return 1;
    }) as typeof requestAnimationFrame);

    map = new FakeMap();
    const sourceManager = new SourceManager(map as unknown as MaplibreMap);
    manager = new RenderManager(map as unknown as MaplibreMap, sourceManager);
    manager.initialize();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('performRender', () => {
    it('should carry the feature id into the promoted _id property', () => {
      manager.render([makePoint(ID_A)]);

      const features = map.sourceData(SOURCE_IDS.FEATURES)?.features ?? [];
      expect(features).toHaveLength(1);
      expect(features[0].properties?._id).toBe(ID_A);
      expect(features[0].id).toBe(ID_A);
    });

    it('should mark points so the vertices layer can exclude them', () => {
      manager.render([makePoint(ID_A)]);

      const features = map.sourceData(SOURCE_IDS.FEATURES)?.features ?? [];
      expect(features[0].properties?._isPoint).toBe(true);
    });
  });

  describe('point hover', () => {
    it('should set hover state using the string feature id', () => {
      map.fire('mousemove', LAYER_IDS.POINT, { features: [{ id: ID_A }] });

      expect(map.setFeatureState).toHaveBeenCalledWith(
        { source: SOURCE_IDS.FEATURES, id: ID_A },
        { hover: true }
      );
      expect(map.featureState.get(ID_A)).toEqual({ hover: true });
    });

    it('should clear the previous feature when hover moves to another point', () => {
      map.fire('mousemove', LAYER_IDS.POINT, { features: [{ id: ID_A }] });
      map.fire('mousemove', LAYER_IDS.POINT, { features: [{ id: ID_B }] });

      expect(map.featureState.get(ID_A)).toEqual({ hover: false });
      expect(map.featureState.get(ID_B)).toEqual({ hover: true });
    });

    it('should not re-clear the same feature while the pointer stays on it', () => {
      map.fire('mousemove', LAYER_IDS.POINT, { features: [{ id: ID_A }] });
      map.setFeatureState.mockClear();

      map.fire('mousemove', LAYER_IDS.POINT, { features: [{ id: ID_A }] });

      expect(map.setFeatureState).toHaveBeenCalledTimes(1);
      expect(map.setFeatureState).toHaveBeenCalledWith(
        { source: SOURCE_IDS.FEATURES, id: ID_A },
        { hover: true }
      );
    });

    it('should clear hover state on mouseleave', () => {
      map.fire('mousemove', LAYER_IDS.POINT, { features: [{ id: ID_A }] });

      map.fire('mouseleave', LAYER_IDS.POINT, {});

      expect(map.featureState.get(ID_A)).toEqual({ hover: false });
    });

    it('should ignore a mousemove that carries no features', () => {
      map.fire('mousemove', LAYER_IDS.POINT, { features: [] });

      expect(map.setFeatureState).not.toHaveBeenCalled();
    });

    it('should ignore a feature without an id instead of throwing', () => {
      // A source rebuilt without promoteId yields undefined ids; hover colour
      // is lost but the handler must not throw from setFeatureState.
      expect(() => map.fire('mousemove', LAYER_IDS.POINT, { features: [{}] })).not.toThrow();
      expect(map.setFeatureState).not.toHaveBeenCalled();
    });

    it('should keep the previous hover when an id-less feature arrives', () => {
      map.fire('mousemove', LAYER_IDS.POINT, { features: [{ id: ID_A }] });
      map.setFeatureState.mockClear();

      map.fire('mousemove', LAYER_IDS.POINT, { features: [{}] });

      expect(map.setFeatureState).not.toHaveBeenCalled();
      expect(map.featureState.get(ID_A)).toEqual({ hover: true });
    });

    it('should do nothing on mouseleave when nothing was hovered', () => {
      map.fire('mouseleave', LAYER_IDS.POINT, {});

      expect(map.setFeatureState).not.toHaveBeenCalled();
    });
  });
});
