import type { Map as MaplibreMap } from 'maplibre-gl';
import type { LibreDrawFeature, Position } from '../types/features';
import type { PartialStyleConfig, StyleConfig } from '../types/style';
import { mergeStyleConfig } from '../types/style';
import { SourceManager, SOURCE_IDS } from './SourceManager';

/**
 * Layer IDs used by LibreDraw for rendering.
 */
export const LAYER_IDS = {
  FILL: 'libre-draw-fill',
  OUTLINE: 'libre-draw-outline',
  VERTICES: 'libre-draw-vertices',
  LINE: 'libre-draw-line',
  POINT: 'libre-draw-point',
  PREVIEW: 'libre-draw-preview',
  EDGE_HIGHLIGHT: 'libre-draw-edge-highlight',
  EDIT_VERTICES: 'libre-draw-edit-vertices',
  EDIT_MIDPOINTS: 'libre-draw-edit-midpoints',
  SNAP_INDICATOR: 'libre-draw-snap-indicator',
} as const;

/**
 * Manages the rendering layers for LibreDraw.
 *
 * Creates and manages MapLibre layers for:
 * - Fill: polygon fill rendering
 * - Outline: polygon border rendering
 * - Vertices: vertex point rendering
 * - Preview: in-progress drawing preview
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
  private style: StyleConfig;

  constructor(
    map: MaplibreMap,
    sourceManager: SourceManager,
    style?: PartialStyleConfig,
  ) {
    this.map = map;
    this.sourceManager = sourceManager;
    this.style = mergeStyleConfig(style);
  }

  /**
   * Whether render layers and sources are ready on the current style.
   */
  isReadyForCurrentStyle(): boolean {
    return this.sourceManager.hasAllSources() && this.hasAllLayers();
  }

  /**
   * Initialize rendering layers on the map.
   * Should be called after the map style and sources are ready.
   */
  initialize(): void {
    if (this.initialized && this.isReadyForCurrentStyle()) return;

    this.sourceManager.initialize();
    if (this.hasAllLayers()) {
      this.initialized = true;
      return;
    }

    // Feature fill layer (Polygon only — LineString must not be filled)
    if (!this.map.getLayer(LAYER_IDS.FILL)) {
      this.map.addLayer({
        id: LAYER_IDS.FILL,
        type: 'fill',
        source: SOURCE_IDS.FEATURES,
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: {
          'fill-color': [
            'case',
            ['boolean', ['get', '_selected'], false],
            this.style.fill.selectedColor,
            this.style.fill.color,
          ],
          'fill-opacity': [
            'case',
            ['boolean', ['get', '_selected'], false],
            this.style.fill.selectedOpacity,
            this.style.fill.opacity,
          ],
        },
      });
    }

    // Feature outline layer (Polygon only)
    if (!this.map.getLayer(LAYER_IDS.OUTLINE)) {
      this.map.addLayer({
        id: LAYER_IDS.OUTLINE,
        type: 'line',
        source: SOURCE_IDS.FEATURES,
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: {
          'line-color': [
            'case',
            ['boolean', ['get', '_selected'], false],
            this.style.outline.selectedColor,
            this.style.outline.color,
          ],
          'line-width': this.style.outline.width,
        },
      });
    }

    // LineString feature layer
    if (!this.map.getLayer(LAYER_IDS.LINE)) {
      this.map.addLayer({
        id: LAYER_IDS.LINE,
        type: 'line',
        source: SOURCE_IDS.FEATURES,
        filter: ['==', ['geometry-type'], 'LineString'],
        paint: {
          'line-color': [
            'case',
            ['boolean', ['get', '_selected'], false],
            this.style.outline.selectedColor,
            this.style.outline.color,
          ],
          'line-width': [
            'case',
            ['boolean', ['get', '_selected'], false],
            this.style.outline.width + 1,
            this.style.outline.width,
          ],
        },
      });
    }

    // Feature vertices layer (circle markers at each vertex)
    // Excludes Point features to avoid double-drawing with the POINT layer
    if (!this.map.getLayer(LAYER_IDS.VERTICES)) {
      this.map.addLayer({
        id: LAYER_IDS.VERTICES,
        type: 'circle',
        source: SOURCE_IDS.FEATURES,
        filter: ['all', ['==', '$type', 'Point'], ['!=', '_isPoint', true]],
        paint: {
          'circle-radius': this.style.vertex.radius,
          'circle-color': this.style.vertex.color,
          'circle-stroke-color': this.style.vertex.strokeColor,
          'circle-stroke-width': this.style.vertex.strokeWidth,
        },
      });
    }

    // Point feature layer (circle markers for Point geometry)
    if (!this.map.getLayer(LAYER_IDS.POINT)) {
      this.map.addLayer({
        id: LAYER_IDS.POINT,
        type: 'circle',
        source: SOURCE_IDS.FEATURES,
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-radius': [
            'case',
            ['boolean', ['get', '_selected'], false],
            8,
            6,
          ],
          'circle-color': [
            'case',
            ['boolean', ['get', '_selected'], false],
            this.style.fill.selectedColor,
            this.style.fill.color,
          ],
          'circle-stroke-color': [
            'case',
            ['boolean', ['get', '_selected'], false],
            this.style.outline.selectedColor,
            this.style.outline.color,
          ],
          'circle-stroke-width': this.style.outline.width,
        },
      });
    }

    // Preview layer (dashed outline for in-progress drawing)
    if (!this.map.getLayer(LAYER_IDS.PREVIEW)) {
      this.map.addLayer({
        id: LAYER_IDS.PREVIEW,
        type: 'line',
        source: SOURCE_IDS.PREVIEW,
        paint: {
          'line-color': this.style.preview.color,
          'line-width': this.style.preview.width,
          'line-dasharray': this.style.preview.dasharray,
        },
      });
    }

    // Edge highlight layer (solid thicker line for selected edge in setback mode)
    if (!this.map.getLayer(LAYER_IDS.EDGE_HIGHLIGHT)) {
      this.map.addLayer({
        id: LAYER_IDS.EDGE_HIGHLIGHT,
        type: 'line',
        source: SOURCE_IDS.EDGE_HIGHLIGHT,
        paint: {
          'line-color': this.style.outline.selectedColor,
          'line-width': this.style.outline.width + 2,
        },
      });
    }

    // Edit midpoints layer (semi-transparent small circles at edge midpoints)
    // Highlighted midpoints grow larger and become opaque to indicate interactivity
    if (!this.map.getLayer(LAYER_IDS.EDIT_MIDPOINTS)) {
      this.map.addLayer({
        id: LAYER_IDS.EDIT_MIDPOINTS,
        type: 'circle',
        source: SOURCE_IDS.EDIT_VERTICES,
        filter: ['==', ['get', '_type'], 'midpoint'],
        paint: {
          'circle-radius': [
            'case',
            ['boolean', ['get', '_highlighted'], false],
            this.style.editVertex.highlightedRadius,
            this.style.midpoint.radius,
          ],
          'circle-color': [
            'case',
            ['boolean', ['get', '_highlighted'], false],
            this.style.editVertex.highlightedColor,
            this.style.midpoint.color,
          ],
          'circle-opacity': [
            'case',
            ['boolean', ['get', '_highlighted'], false],
            1,
            this.style.midpoint.opacity,
          ],
          'circle-stroke-width': [
            'case',
            ['boolean', ['get', '_highlighted'], false],
            this.style.editVertex.strokeWidth,
            0,
          ],
          'circle-stroke-color': [
            'case',
            ['boolean', ['get', '_highlighted'], false],
            this.style.editVertex.highlightedStrokeColor,
            'transparent',
          ],
        },
      });
    }

    // Snap indicator layer (orange circle at snap target location)
    if (!this.map.getLayer(LAYER_IDS.SNAP_INDICATOR)) {
      this.map.addLayer({
        id: LAYER_IDS.SNAP_INDICATOR,
        type: 'circle',
        source: SOURCE_IDS.SNAP_INDICATOR,
        paint: {
          'circle-radius': 6,
          'circle-color': 'rgba(255, 140, 0, 0.7)',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
        },
      });
    }

    // Edit vertices layer (white circles with blue stroke at polygon vertices)
    // Uses data-driven styling to highlight the nearest vertex
    if (!this.map.getLayer(LAYER_IDS.EDIT_VERTICES)) {
      this.map.addLayer({
        id: LAYER_IDS.EDIT_VERTICES,
        type: 'circle',
        source: SOURCE_IDS.EDIT_VERTICES,
        filter: ['==', ['get', '_type'], 'vertex'],
        paint: {
          'circle-radius': [
            'case',
            ['boolean', ['get', '_highlighted'], false],
            this.style.editVertex.highlightedRadius,
            this.style.editVertex.radius,
          ],
          'circle-color': [
            'case',
            ['boolean', ['get', '_highlighted'], false],
            this.style.editVertex.highlightedColor,
            this.style.editVertex.color,
          ],
          'circle-stroke-color': [
            'case',
            ['boolean', ['get', '_highlighted'], false],
            this.style.editVertex.highlightedStrokeColor,
            this.style.editVertex.strokeColor,
          ],
          'circle-stroke-width': this.style.editVertex.strokeWidth,
        },
      });
    }

    this.initialized = true;
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
   * Render a polygon preview for in-progress drawing.
   * @param coordinates - The preview polygon coordinates (ring).
   */
  renderPreview(coordinates: Position[]): void {
    if (coordinates.length < 2) {
      this.clearPreview();
      return;
    }

    const geojsonCoords = coordinates.map(
      (pos) => [pos[0], pos[1]] as [number, number],
    );

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

    const geojsonCoords = coordinates.map(
      (pos) => [pos[0], pos[1]] as [number, number],
    );

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
    midpointHighlightIndex?: number,
  ): void {
    const features: GeoJSON.Feature[] = [];

    for (let i = 0; i < vertices.length; i++) {
      const v = vertices[i];
      features.push({
        type: 'Feature',
        properties: {
          _type: 'vertex',
          _highlighted: i === highlightIndex,
        },
        geometry: { type: 'Point', coordinates: [v[0], v[1]] },
      });
    }

    for (let i = 0; i < midpoints.length; i++) {
      const m = midpoints[i];
      features.push({
        type: 'Feature',
        properties: {
          _type: 'midpoint',
          _highlighted: i === midpointHighlightIndex,
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
    const layerIds = [
      LAYER_IDS.EDIT_VERTICES,
      LAYER_IDS.EDIT_MIDPOINTS,
      LAYER_IDS.SNAP_INDICATOR,
      LAYER_IDS.EDGE_HIGHLIGHT,
      LAYER_IDS.PREVIEW,
      LAYER_IDS.POINT,
      LAYER_IDS.LINE,
      LAYER_IDS.VERTICES,
      LAYER_IDS.OUTLINE,
      LAYER_IDS.FILL,
    ];

    for (const id of layerIds) {
      if (this.map.getLayer(id)) {
        this.map.removeLayer(id);
      }
    }

    this.sourceManager.destroy();
    this.initialized = false;
  }

  /**
   * Perform the actual render, converting features to GeoJSON
   * with selection state embedded in properties.
   */
  private performRender(): void {
    if (!this.pendingFeatures) return;

    const geojsonFeatures: GeoJSON.Feature[] = this.pendingFeatures.map(
      (feature) => ({
        type: 'Feature' as const,
        id: feature.id as unknown as number,
        properties: {
          ...feature.properties,
          _id: feature.id,
          _selected: this.selectedIds.has(feature.id),
          _isPoint: feature.geometry.type === 'Point',
        },
        geometry: feature.geometry,
      }),
    );

    const featureCollection: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: geojsonFeatures,
    };

    this.sourceManager.updateFeatures(featureCollection);
    this.pendingFeatures = null;
  }

  /**
   * Whether all draw layers exist on the current style.
   */
  private hasAllLayers(): boolean {
    return Boolean(
      this.map.getLayer(LAYER_IDS.FILL) &&
        this.map.getLayer(LAYER_IDS.OUTLINE) &&
        this.map.getLayer(LAYER_IDS.VERTICES) &&
        this.map.getLayer(LAYER_IDS.POINT) &&
        this.map.getLayer(LAYER_IDS.LINE) &&
        this.map.getLayer(LAYER_IDS.PREVIEW) &&
        this.map.getLayer(LAYER_IDS.EDGE_HIGHLIGHT) &&
        this.map.getLayer(LAYER_IDS.EDIT_MIDPOINTS) &&
        this.map.getLayer(LAYER_IDS.EDIT_VERTICES) &&
        this.map.getLayer(LAYER_IDS.SNAP_INDICATOR),
    );
  }
}
