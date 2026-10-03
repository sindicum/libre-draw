import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Map as MaplibreMap } from 'maplibre-gl';
import {
  RenderManager,
  LAYER_IDS,
  ROTATION_CENTER_IMAGE_ID,
} from '../../../src/rendering/RenderManager';
import { SourceManager, SOURCE_IDS } from '../../../src/rendering/SourceManager';
import type { LibreDrawFeature } from '../../../src/types/features';
import type { StyleConfig } from '../../../src/types/style';

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
 * `setFeatureState` mirrors MapLibre and throws on a missing id.
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

  readonly images = new Map<string, unknown>();
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

  readonly setPaintProperty = vi.fn<(layer: string, prop: string, value: unknown) => void>();

  hasImage(id: string): boolean {
    return this.images.has(id);
  }

  addImage(id: string, image: unknown): void {
    this.images.set(id, image);
  }

  removeImage(id: string): void {
    this.images.delete(id);
  }

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

  /** The `paint` each layer was added with, keyed by layer id. */
  layerPaints(): Map<string, Record<string, unknown> | undefined> {
    const paints = new Map<string, Record<string, unknown> | undefined>();
    for (const [id, layer] of this.layers) {
      paints.set(id, (layer as { paint?: Record<string, unknown> }).paint);
    }
    return paints;
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

    it('should not add rendering-only flags besides _id and _selected', () => {
      manager.render([makePoint(ID_A)]);

      const features = map.sourceData(SOURCE_IDS.FEATURES)?.features ?? [];
      expect(Object.keys(features[0].properties ?? {}).sort()).toEqual(['_id', '_selected']);
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

  describe('rotation center', () => {
    it('adds a crosshair symbol layer on its own source', () => {
      const layer = map.getLayer(LAYER_IDS.ROTATION_CENTER) as { type: string; layout: unknown };
      expect(layer.type).toBe('symbol');
      expect(layer.layout).toMatchObject({ 'icon-image': ROTATION_CENTER_IMAGE_ID });
      expect(map.getSource(SOURCE_IDS.ROTATION_CENTER)).toBeDefined();
      expect(map.hasImage(ROTATION_CENTER_IMAGE_ID)).toBe(true);
    });

    it('registers the crosshair image on initialize and removes it on destroy', () => {
      manager.initialize();
      expect(map.images.size).toBe(1);

      manager.destroy();
      expect(map.hasImage(ROTATION_CENTER_IMAGE_ID)).toBe(false);
    });

    it('writes the pivot as a single point and clears it', () => {
      manager.renderRotationCenter([12, 34]);
      const source = map.getSource(SOURCE_IDS.ROTATION_CENTER) as FakeSource;
      expect(source.data.features).toHaveLength(1);
      expect(source.data.features[0].geometry).toEqual({ type: 'Point', coordinates: [12, 34] });

      manager.clearRotationCenter();
      expect(source.data.features).toHaveLength(0);
    });
  });

  describe('updateStyle', () => {
    // Every field differs from the default so that a paint property left out
    // of updateStyle shows up as a mismatch against initialize.
    const next: StyleConfig = {
      fill: { color: '#111111', opacity: 0.3, selectedColor: '#222222', selectedOpacity: 0.5 },
      outline: { color: '#333333', width: 3, selectedColor: '#444444' },
      preview: { color: '#777777', width: 3, dasharray: [4, 4] },
      editVertex: {
        color: '#888888',
        strokeColor: '#999999',
        strokeWidth: 3,
        radius: 6,
        highlightedColor: '#aaaaaa',
        highlightedStrokeColor: '#bbbbbb',
        highlightedRadius: 8,
      },
      midpoint: { color: '#cccccc', opacity: 0.7, radius: 5 },
      point: {
        color: '#dddddd',
        radius: 7,
        selectedColor: '#eeeeee',
        selectedRadius: 9,
        hoverColor: '#ff00ff',
        strokeColor: '#00ffff',
        strokeWidth: 3,
      },
    };

    function paintAfterInitialize(style?: StyleConfig) {
      const m = new FakeMap();
      const rm = new RenderManager(
        m as unknown as MaplibreMap,
        new SourceManager(m as unknown as MaplibreMap),
        style
      );
      rm.initialize();
      return m.layerPaints();
    }

    function recordedUpdates(): Map<string, Record<string, unknown>> {
      const updated = new Map<string, Record<string, unknown>>();
      for (const [layer, prop, value] of map.setPaintProperty.mock.calls) {
        updated.set(layer, { ...updated.get(layer), [prop]: value });
      }
      return updated;
    }

    it('sets every style-derived paint property to what initialize would use', () => {
      const before = paintAfterInitialize();
      const expected = paintAfterInitialize(next);

      manager.updateStyle(next);
      const updated = recordedUpdates();

      expect(expected.size).toBeGreaterThan(0);
      for (const [layer, paint] of expected) {
        if (JSON.stringify(paint) === JSON.stringify(before.get(layer))) {
          // Constant paint, or none: there is nothing for updateStyle to do.
          expect(updated.has(layer), layer).toBe(false);
        } else {
          expect(updated.get(layer), layer).toEqual(paint);
        }
      }
    });

    it('refreshes the highlighted midpoint stroke from editVertex', () => {
      manager.updateStyle(next);
      const midpoints = recordedUpdates().get(LAYER_IDS.EDIT_MIDPOINTS);

      expect(midpoints?.['circle-stroke-width']).toEqual([
        'case',
        ['boolean', ['get', '_highlighted'], false],
        3,
        0,
      ]);
      expect(midpoints?.['circle-stroke-color']).toEqual([
        'case',
        ['boolean', ['get', '_highlighted'], false],
        '#bbbbbb',
        'transparent',
      ]);
    });

    it('only stores the style before initialize', () => {
      const m = new FakeMap();
      const rm = new RenderManager(
        m as unknown as MaplibreMap,
        new SourceManager(m as unknown as MaplibreMap)
      );

      rm.updateStyle(next);

      expect(m.setPaintProperty).not.toHaveBeenCalled();
      expect(rm.getStyle()).toEqual(next);
    });
  });
});
