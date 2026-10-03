import type { Map as MaplibreMap } from 'maplibre-gl';
import type { LibreDrawFeature, Position } from '../types/features';
import type { LibreDrawLayer } from '../types/layers';
import { SourceManager } from './SourceManager';
import { DEFAULT_LAYERS, ROTATION_CENTER_IMAGE_ID, SOURCE_IDS } from './layers';
import { createCrosshairImage, CROSSHAIR_PIXEL_RATIO } from './crosshairImage';

/**
 * Manages the rendering layers for LibreDraw.
 *
 * Adds the layer definitions (the defaults, or the ones given through the
 * `layers` option / `setLayers()`) on top of the map's layers, writes the
 * sources they read, and keeps the feature-state `hover` on the feature
 * a click would pick.
 *
 * Uses requestAnimationFrame for batch updates to avoid
 * redundant re-renders within a single frame.
 */
export class RenderManager {
  private map: MaplibreMap;
  private sourceManager: SourceManager;
  private selectedIds: Set<string> = new Set();
  private pendingRender = false;
  private pendingFeatures: LibreDrawFeature[] | null = null;
  private initialized = false;
  private layers: LibreDrawLayer[];
  // Ids of the layers this instance added to the current style. A
  // definition MapLibre refused (a bad definition, an id already on the
  // map) is not here, so it is not retried on every `styledata`, and a map
  // layer that already had the id is never removed.
  private addedLayerIds: string[] = [];
  private hoveredId: string | null = null;

  constructor(
    map: MaplibreMap,
    sourceManager: SourceManager,
    layers: readonly LibreDrawLayer[] = DEFAULT_LAYERS
  ) {
    this.map = map;
    this.sourceManager = sourceManager;
    this.layers = structuredClone([...layers]);
  }

  /**
   * Whether the sources and the layers this instance added are on the
   * current style. A style swap drops both.
   */
  isReadyForCurrentStyle(): boolean {
    return (
      this.initialized &&
      this.sourceManager.hasAllSources() &&
      this.addedLayerIds.every((id) => this.map.getLayer(id))
    );
  }

  /**
   * Add the sources, the rotation center image, and the layers to the
   * current style.
   */
  initialize(): void {
    if (this.isReadyForCurrentStyle()) return;

    this.sourceManager.initialize();
    // A style swap drops map images and feature states.
    if (!this.map.hasImage(ROTATION_CENTER_IMAGE_ID)) {
      this.map.addImage(ROTATION_CENTER_IMAGE_ID, createCrosshairImage(), {
        pixelRatio: CROSSHAIR_PIXEL_RATIO,
      });
    }
    if (this.hoveredId !== null) {
      this.hoveredId = null;
      this.map.getCanvas().style.cursor = '';
    }
    this.addLayers();
    this.initialized = true;
  }

  /**
   * Replace the layer definitions. The previous layers leave the map; the
   * new ones are added at once when the style is ready, otherwise when it
   * loads.
   * @param layers - The new definitions, drawn in array order.
   */
  setLayers(layers: readonly LibreDrawLayer[]): void {
    this.removeLayers();
    this.layers = structuredClone([...layers]);
    if (this.initialized && this.sourceManager.hasAllSources()) {
      this.addLayers();
    }
  }

  /**
   * Put the feature-state `hover` on one feature, taking it off the
   * previous one.
   * @param id - The feature to hover, or `undefined` for none.
   */
  setHovered(id: string | undefined): void {
    const next = id ?? null;
    if (next === this.hoveredId) return;
    if (!this.sourceManager.hasAllSources()) {
      this.hoveredId = null;
      return;
    }
    if (this.hoveredId !== null) {
      this.map.setFeatureState(
        { source: SOURCE_IDS.FEATURES, id: this.hoveredId },
        { hover: false }
      );
    }
    this.hoveredId = next;
    if (next !== null) {
      this.map.setFeatureState({ source: SOURCE_IDS.FEATURES, id: next }, { hover: true });
    }
    this.map.getCanvas().style.cursor = next !== null ? 'pointer' : '';
  }

  /**
   * Render features to the map. Uses requestAnimationFrame
   * to batch multiple render calls within a single frame.
   * @param features - The features to render.
   */
  render(features: LibreDrawFeature[]): void {
    this.pendingFeatures = features;
    if (!this.pendingRender) {
      this.pendingRender = true;
      requestAnimationFrame(() => {
        this.performRender();
        this.pendingRender = false;
      });
    }
  }

  /**
   * Render the preview line of an in-progress draft.
   * @param coordinates - The preview coordinates.
   */
  renderPreview(coordinates: Position[]): void {
    if (coordinates.length < 2) {
      this.clearPreview();
      return;
    }

    const geojsonCoords = coordinates.map((pos) => [pos[0], pos[1]] as [number, number]);

    const previewGeoJSON: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: geojsonCoords,
          },
        },
      ],
    };

    this.sourceManager.updatePreview(previewGeoJSON);
  }

  /**
   * Clear the drawing preview.
   */
  clearPreview(): void {
    this.sourceManager.clearPreview();
  }

  /**
   * Render highlighted edge line (for setback edge selection).
   * @param coordinates - Two-point line coordinates.
   */
  renderEdgeHighlight(coordinates: Position[]): void {
    if (coordinates.length < 2) {
      this.clearEdgeHighlight();
      return;
    }

    const geojsonCoords = coordinates.map((pos) => [pos[0], pos[1]] as [number, number]);

    this.sourceManager.updateEdgeHighlight({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: geojsonCoords,
          },
        },
      ],
    });
  }

  /**
   * Clear highlighted edge line.
   */
  clearEdgeHighlight(): void {
    this.sourceManager.clearEdgeHighlight();
  }

  /**
   * Render vertex and midpoint markers for editing a selected polygon.
   * @param vertices - The polygon vertex positions.
   * @param midpoints - The edge midpoint positions.
   * @param highlightIndex - Optional index of the vertex to highlight.
   */
  renderVertices(
    vertices: Position[],
    midpoints: Position[],
    highlightIndex?: number,
    midpointHighlightIndex?: number
  ): void {
    const features: GeoJSON.Feature[] = [];

    for (let i = 0; i < vertices.length; i++) {
      const v = vertices[i];
      features.push({
        type: 'Feature',
        properties: {
          'libre-draw:handle': 'vertex',
          'libre-draw:highlighted': i === highlightIndex,
        },
        geometry: { type: 'Point', coordinates: [v[0], v[1]] },
      });
    }

    for (let i = 0; i < midpoints.length; i++) {
      const m = midpoints[i];
      features.push({
        type: 'Feature',
        properties: {
          'libre-draw:handle': 'midpoint',
          'libre-draw:highlighted': i === midpointHighlightIndex,
        },
        geometry: { type: 'Point', coordinates: [m[0], m[1]] },
      });
    }

    this.sourceManager.updateEditVertices({
      type: 'FeatureCollection',
      features,
    });
  }

  /**
   * Render a snap indicator at the given position.
   * @param position - The geographic position to display the indicator.
   */
  renderSnapIndicator(position: Position): void {
    this.sourceManager.updateSnapIndicator({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Point',
            coordinates: [position[0], position[1]],
          },
        },
      ],
    });
  }

  /**
   * Clear the snap indicator.
   */
  clearSnapIndicator(): void {
    this.sourceManager.clearSnapIndicator();
  }

  /**
   * Render the rotation center marker (the pivot of rotate mode).
   * @param position - The pivot position.
   */
  renderRotationCenter(position: Position): void {
    this.sourceManager.updateRotationCenter({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Point',
            coordinates: [position[0], position[1]],
          },
        },
      ],
    });
  }

  /**
   * Clear the rotation center marker.
   */
  clearRotationCenter(): void {
    this.sourceManager.clearRotationCenter();
  }

  /**
   * Clear the vertex/midpoint markers.
   */
  clearVertices(): void {
    this.sourceManager.clearEditVertices();
  }

  /**
   * Set the IDs of selected features for visual highlighting.
   * @param ids - The selected feature IDs.
   */
  setSelectedIds(ids: string[]): void {
    this.selectedIds = new Set(ids);
  }

  /**
   * Remove all layers and sources from the map.
   */
  destroy(): void {
    this.removeLayers();
    if (this.map.hasImage(ROTATION_CENTER_IMAGE_ID)) {
      this.map.removeImage(ROTATION_CENTER_IMAGE_ID);
    }
    this.sourceManager.destroy();
    this.hoveredId = null;
    this.initialized = false;
  }

  /**
   * Perform the actual render, converting features to GeoJSON
   * with selection state embedded in properties.
   */
  private performRender(): void {
    if (!this.pendingFeatures) return;

    const geojsonFeatures: GeoJSON.Feature[] = this.pendingFeatures.map((feature) => ({
      type: 'Feature' as const,
      id: feature.id,
      properties: {
        ...feature.properties,
        // The source promotes this to the feature id (see SourceManager).
        'libre-draw:id': feature.id,
        'libre-draw:selected': this.selectedIds.has(feature.id),
      },
      geometry: feature.geometry,
    }));

    const featureCollection: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: geojsonFeatures,
    };

    this.sourceManager.updateFeatures(featureCollection);
    this.pendingFeatures = null;
  }

  /**
   * Add every definition on top, in order. Layers this instance added
   * before are taken off first so the order holds. A definition is passed
   * to MapLibre even when its id is already on the map, so MapLibre reports
   * the clash with its `error` event like any other bad definition.
   */
  private addLayers(): void {
    this.removeLayers();
    for (const layer of this.layers) {
      const existed = this.map.getLayer(layer.id) !== undefined;
      this.map.addLayer(layer);
      if (!existed && this.map.getLayer(layer.id)) this.addedLayerIds.push(layer.id);
    }
  }

  /** Remove the layers this instance added. */
  private removeLayers(): void {
    for (const id of this.addedLayerIds) {
      if (this.map.getLayer(id)) this.map.removeLayer(id);
    }
    this.addedLayerIds = [];
  }
}
