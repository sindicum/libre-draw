import type { Map as MaplibreMap, GeoJSONSource } from 'maplibre-gl';

/**
 * The GeoJSON source IDs used by LibreDraw.
 */
export const SOURCE_IDS = {
  FEATURES: 'libre-draw-features',
  PREVIEW: 'libre-draw-preview',
  EDGE_HIGHLIGHT: 'libre-draw-edge-highlight',
  EDIT_VERTICES: 'libre-draw-edit-vertices',
  SNAP_INDICATOR: 'libre-draw-snap-indicator',
} as const;

/**
 * An empty GeoJSON FeatureCollection.
 */
const EMPTY_FC: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [],
};

/**
 * Manages MapLibre GeoJSON sources for the drawing layers.
 *
 * Provides methods to add, update, and remove the sources that
 * the RenderManager's layers read from.
 */
export class SourceManager {
  private map: MaplibreMap;
  private initialized = false;

  constructor(map: MaplibreMap) {
    this.map = map;
  }

  /**
   * Whether all required GeoJSON sources exist on the current style.
   */
  hasAllSources(): boolean {
    return Boolean(
      this.map.getSource(SOURCE_IDS.FEATURES) &&
        this.map.getSource(SOURCE_IDS.PREVIEW) &&
        this.map.getSource(SOURCE_IDS.EDGE_HIGHLIGHT) &&
        this.map.getSource(SOURCE_IDS.EDIT_VERTICES) &&
        this.map.getSource(SOURCE_IDS.SNAP_INDICATOR),
    );
  }

  /**
   * Initialize the GeoJSON sources on the map.
   * Should be called after the map style has loaded.
   */
  initialize(): void {
    if (this.initialized && this.hasAllSources()) return;

    if (!this.map.getSource(SOURCE_IDS.FEATURES)) {
      this.map.addSource(SOURCE_IDS.FEATURES, {
        type: 'geojson',
        data: EMPTY_FC,
      });
    }

    if (!this.map.getSource(SOURCE_IDS.PREVIEW)) {
      this.map.addSource(SOURCE_IDS.PREVIEW, {
        type: 'geojson',
        data: EMPTY_FC,
      });
    }

    if (!this.map.getSource(SOURCE_IDS.EDGE_HIGHLIGHT)) {
      this.map.addSource(SOURCE_IDS.EDGE_HIGHLIGHT, {
        type: 'geojson',
        data: EMPTY_FC,
      });
    }

    if (!this.map.getSource(SOURCE_IDS.EDIT_VERTICES)) {
      this.map.addSource(SOURCE_IDS.EDIT_VERTICES, {
        type: 'geojson',
        data: EMPTY_FC,
      });
    }

    if (!this.map.getSource(SOURCE_IDS.SNAP_INDICATOR)) {
      this.map.addSource(SOURCE_IDS.SNAP_INDICATOR, {
        type: 'geojson',
        data: EMPTY_FC,
      });
    }

    this.initialized = true;
  }

  /**
   * Update the features source with new GeoJSON data.
   * @param data - A GeoJSON FeatureCollection.
   */
  updateFeatures(data: GeoJSON.FeatureCollection): void {
    const source = this.map.getSource<GeoJSONSource>(SOURCE_IDS.FEATURES);
    if (source) {
      source.setData(data);
    }
  }

  /**
   * Update the preview source with new GeoJSON data.
   * @param data - A GeoJSON FeatureCollection.
   */
  updatePreview(data: GeoJSON.FeatureCollection): void {
    const source = this.map.getSource<GeoJSONSource>(SOURCE_IDS.PREVIEW);
    if (source) {
      source.setData(data);
    }
  }

  /**
   * Clear the preview source.
   */
  clearPreview(): void {
    this.updatePreview(EMPTY_FC);
  }

  /**
   * Update the edge highlight source with new GeoJSON data.
   * @param data - A GeoJSON FeatureCollection.
   */
  updateEdgeHighlight(data: GeoJSON.FeatureCollection): void {
    const source = this.map.getSource<GeoJSONSource>(SOURCE_IDS.EDGE_HIGHLIGHT);
    if (source) {
      source.setData(data);
    }
  }

  /**
   * Clear the edge highlight source.
   */
  clearEdgeHighlight(): void {
    this.updateEdgeHighlight(EMPTY_FC);
  }

  /**
   * Update the edit vertices source with new GeoJSON data.
   * @param data - A GeoJSON FeatureCollection of Point features.
   */
  updateEditVertices(data: GeoJSON.FeatureCollection): void {
    const source = this.map.getSource<GeoJSONSource>(SOURCE_IDS.EDIT_VERTICES);
    if (source) {
      source.setData(data);
    }
  }

  /**
   * Clear the edit vertices source.
   */
  clearEditVertices(): void {
    this.updateEditVertices(EMPTY_FC);
  }

  /**
   * Update the snap indicator source with new GeoJSON data.
   * @param data - A GeoJSON FeatureCollection of Point features.
   */
  updateSnapIndicator(data: GeoJSON.FeatureCollection): void {
    const source = this.map.getSource<GeoJSONSource>(SOURCE_IDS.SNAP_INDICATOR);
    if (source) {
      source.setData(data);
    }
  }

  /**
   * Clear the snap indicator source.
   */
  clearSnapIndicator(): void {
    this.updateSnapIndicator(EMPTY_FC);
  }

  /**
   * Remove all sources from the map.
   */
  destroy(): void {
    if (this.map.getSource(SOURCE_IDS.FEATURES)) {
      this.map.removeSource(SOURCE_IDS.FEATURES);
    }
    if (this.map.getSource(SOURCE_IDS.PREVIEW)) {
      this.map.removeSource(SOURCE_IDS.PREVIEW);
    }
    if (this.map.getSource(SOURCE_IDS.EDGE_HIGHLIGHT)) {
      this.map.removeSource(SOURCE_IDS.EDGE_HIGHLIGHT);
    }
    if (this.map.getSource(SOURCE_IDS.EDIT_VERTICES)) {
      this.map.removeSource(SOURCE_IDS.EDIT_VERTICES);
    }
    if (this.map.getSource(SOURCE_IDS.SNAP_INDICATOR)) {
      this.map.removeSource(SOURCE_IDS.SNAP_INDICATOR);
    }
    this.initialized = false;
  }
}
