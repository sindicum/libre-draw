import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Map as MaplibreMap } from 'maplibre-gl';
import { RenderManager } from '../../../src/rendering/RenderManager';
import { SourceManager } from '../../../src/rendering/SourceManager';
import {
  DEFAULT_LAYERS,
  ROTATION_CENTER_IMAGE_ID,
  SOURCE_IDS,
} from '../../../src/rendering/layers';
import type { LibreDrawFeature } from '../../../src/types/features';
import type { LibreDrawLayer } from '../../../src/types/layers';

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
 * `setFeatureState` mirrors MapLibre and throws on a missing id. Like
 * MapLibre, `addLayer` refuses (without throwing) a layer whose id is
 * already on the style or whose source is missing.
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

  readonly addLayer = vi.fn((layer: { id: string; source?: string }) => {
    if (this.layers.has(layer.id)) return;
    if (layer.source && !this.sources.has(layer.source)) return;
    this.layers.set(layer.id, layer);
  });

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

  getCanvas(): { style: { cursor: string } } {
    return this.canvas;
  }

  sourceData(id: string): GeoJSON.FeatureCollection | undefined {
    return this.sources.get(id)?.data;
  }

  layerIds(): string[] {
    return [...this.layers.keys()];
  }

  /** Drop every source, layer, image and feature state, as `map.setStyle()` does. */
  swapStyle(): void {
    this.sources.clear();
    this.layers.clear();
    this.images.clear();
    this.featureState.clear();
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

  function create(layers?: LibreDrawLayer[]): RenderManager {
    map = new FakeMap();
    const created = new RenderManager(
      map as unknown as MaplibreMap,
      new SourceManager(map as unknown as MaplibreMap),
      layers
    );
    created.initialize();
    return created;
  }

  describe('layers', () => {
    it('adds the default layers in order', () => {
      expect(map.layerIds()).toEqual(DEFAULT_LAYERS.map((layer) => layer.id));
    });

    it('replaces the defaults with the given definitions', () => {
      create([{ id: 'parcels', type: 'fill', source: SOURCE_IDS.FEATURES }]);
      expect(map.layerIds()).toEqual(['parcels']);
    });

    it('swaps its own layers on setLayers', () => {
      manager.setLayers([{ id: 'parcels', type: 'fill', source: SOURCE_IDS.FEATURES }]);
      expect(map.layerIds()).toEqual(['parcels']);

      manager.setLayers([]);
      expect(map.layerIds()).toEqual([]);
    });

    it('passes a clashing id to MapLibre and never removes the map layer that had it', () => {
      map.addLayer({ id: 'parcels' }); // the host's own layer
      map.addLayer.mockClear();
      const clash: LibreDrawLayer = { id: 'parcels', type: 'fill', source: SOURCE_IDS.FEATURES };
      manager.setLayers([clash]);
      expect(map.addLayer).toHaveBeenCalledWith(clash);

      manager.setLayers([]);
      manager.destroy();

      expect(map.layerIds()).toEqual(['parcels']);
    });

    it('leaves the second of two definitions with one id to MapLibre, which refuses it', () => {
      const first: LibreDrawLayer = { id: 'parcels', type: 'fill', source: SOURCE_IDS.FEATURES };
      const second: LibreDrawLayer = { id: 'parcels', type: 'line', source: SOURCE_IDS.FEATURES };
      const duplicated = create([first, second]);

      expect(map.addLayer).toHaveBeenCalledTimes(2);
      expect(map.getLayer('parcels')).toEqual(first);
      duplicated.setLayers([]);
      expect(map.layerIds()).toEqual([]);
    });

    it('does not retry a definition MapLibre refused', () => {
      const refused = create([
        { id: 'parcels', type: 'fill', source: SOURCE_IDS.FEATURES },
        { id: 'stray', type: 'fill', source: 'not-a-source' },
      ]);
      expect(map.layerIds()).toEqual(['parcels']);
      expect(refused.isReadyForCurrentStyle()).toBe(true);

      map.addLayer.mockClear();
      refused.initialize();
      expect(map.addLayer).not.toHaveBeenCalled();
    });

    it('re-adds the layers after a style swap', () => {
      map.swapStyle();
      expect(manager.isReadyForCurrentStyle()).toBe(false);

      manager.initialize();
      expect(map.layerIds()).toEqual(DEFAULT_LAYERS.map((layer) => layer.id));
    });
  });

  describe('feature properties', () => {
    it('keeps the feature properties and adds libre-draw:id and libre-draw:selected', () => {
      const feature = makePoint(ID_A);
      feature.properties = { name: 'well', selected: 'mine' };
      manager.setSelectedIds([ID_A]);
      manager.render([feature]);

      const [rendered] = map.sourceData(SOURCE_IDS.FEATURES)?.features ?? [];
      expect(rendered.id).toBe(ID_A);
      expect(rendered.properties).toEqual({
        name: 'well',
        selected: 'mine',
        'libre-draw:id': ID_A,
        'libre-draw:selected': true,
      });
    });

    it('marks handles with libre-draw:handle and libre-draw:highlighted', () => {
      manager.renderVertices(
        [
          [0, 0],
          [1, 0],
        ],
        [[0.5, 0]],
        1,
        0
      );

      const properties = (map.sourceData(SOURCE_IDS.EDIT_VERTICES)?.features ?? []).map(
        (feature) => feature.properties
      );
      expect(properties).toEqual([
        { 'libre-draw:handle': 'vertex', 'libre-draw:highlighted': false },
        { 'libre-draw:handle': 'vertex', 'libre-draw:highlighted': true },
        { 'libre-draw:handle': 'midpoint', 'libre-draw:highlighted': true },
      ]);
    });
  });

  describe('setHovered', () => {
    it('sets hover on the feature by its string id and shows the pointer cursor', () => {
      manager.setHovered(ID_A);

      expect(map.setFeatureState).toHaveBeenCalledWith(
        { source: SOURCE_IDS.FEATURES, id: ID_A },
        { hover: true }
      );
      expect(map.getCanvas().style.cursor).toBe('pointer');
    });

    it('moves hover from one feature to the next', () => {
      manager.setHovered(ID_A);
      manager.setHovered(ID_B);

      expect(map.featureState.get(ID_A)).toEqual({ hover: false });
      expect(map.featureState.get(ID_B)).toEqual({ hover: true });
    });

    it('does nothing while the same feature stays hovered', () => {
      manager.setHovered(ID_A);
      map.setFeatureState.mockClear();

      manager.setHovered(ID_A);

      expect(map.setFeatureState).not.toHaveBeenCalled();
    });

    it('clears hover and the cursor with undefined', () => {
      manager.setHovered(ID_A);
      manager.setHovered(undefined);

      expect(map.featureState.get(ID_A)).toEqual({ hover: false });
      expect(map.getCanvas().style.cursor).toBe('');
    });

    it('forgets the hovered feature after a style swap instead of clearing a lost state', () => {
      manager.setHovered(ID_A);
      map.swapStyle();
      manager.initialize();
      map.setFeatureState.mockClear();

      manager.setHovered(ID_B);

      expect(map.setFeatureState).toHaveBeenCalledTimes(1);
      expect(map.setFeatureState).toHaveBeenCalledWith(
        { source: SOURCE_IDS.FEATURES, id: ID_B },
        { hover: true }
      );
    });
  });

  describe('rotation center', () => {
    it('registers the crosshair image on initialize and removes it on destroy', () => {
      expect(map.hasImage(ROTATION_CENTER_IMAGE_ID)).toBe(true);

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
});
