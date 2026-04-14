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
            this.style.point.selectedRadius,
            this.style.point.radius,
          ],
          'circle-color': [
            'case',
            ['boolean', ['get', '_selected'], false],
            this.style.point.selectedColor,
            ['case',
              ['boolean', ['feature-state', 'hover'], false],
              this.style.point.hoverColor,
              this.style.point.color,
            ],
          ],
          'circle-stroke-color': this.style.point.strokeColor,
          'circle-stroke-width': this.style.point.strokeWidth,
        },
      });
      this.setupPointHover();
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
   * Get the current style configuration.
   */
  getStyle(): StyleConfig {
    return { ...this.style };
  }

  /**
   * Update the global render style at runtime using setPaintProperty.
   * @param style - The new full style configuration.
   */
  updateStyle(style: StyleConfig): void {
    this.style = style;
    if (!this.initialized) return;

    const m = this.map;
    const set = (
      layer: string,
      prop: string,
      value: unknown,
    ): void => {
      if (m.getLayer(layer)) {
        m.setPaintProperty(layer, prop, value);
      }
    };

    // FILL
    set(LAYER_IDS.FILL, 'fill-color', [
      'case', ['boolean', ['get', '_selected'], false],
      style.fill.selectedColor, style.fill.color,
    ]);
    set(LAYER_IDS.FILL, 'fill-opacity', [
      'case', ['boolean', ['get', '_selected'], false],
      style.fill.selectedOpacity, style.fill.opacity,
    ]);

    // OUTLINE
    set(LAYER_IDS.OUTLINE, 'line-color', [
      'case', ['boolean', ['get', '_selected'], false],
      style.outline.selectedColor, style.outline.color,
    ]);
    set(LAYER_IDS.OUTLINE, 'line-width', style.outline.width);

    // LINE
    set(LAYER_IDS.LINE, 'line-color', [
      'case', ['boolean', ['get', '_selected'], false],
      style.outline.selectedColor, style.outline.color,
    ]);
    set(LAYER_IDS.LINE, 'line-width', [
      'case', ['boolean', ['get', '_selected'], false],
      style.outline.width + 1, style.outline.width,
    ]);

    // VERTICES
    set(LAYER_IDS.VERTICES, 'circle-radius', style.vertex.radius);
    set(LAYER_IDS.VERTICES, 'circle-color', style.vertex.color);
    set(
      LAYER_IDS.VERTICES,
      'circle-stroke-color',
      style.vertex.strokeColor,
    );
    set(
      LAYER_IDS.VERTICES,
      'circle-stroke-width',
      style.vertex.strokeWidth,
    );

    // POINT
    set(LAYER_IDS.POINT, 'circle-radius', [
      'case', ['boolean', ['get', '_selected'], false],
      style.point.selectedRadius, style.point.radius,
    ]);
    set(LAYER_IDS.POINT, 'circle-color', [
      'case', ['boolean', ['get', '_selected'], false],
      style.point.selectedColor,
      ['case', ['boolean', ['feature-state', 'hover'], false],
        style.point.hoverColor, style.point.color],
    ]);
    set(
      LAYER_IDS.POINT,
      'circle-stroke-color',
      style.point.strokeColor,
    );
    set(
      LAYER_IDS.POINT,
      'circle-stroke-width',
      style.point.strokeWidth,
    );

    // PREVIEW
    set(LAYER_IDS.PREVIEW, 'line-color', style.preview.color);
    set(LAYER_IDS.PREVIEW, 'line-width', style.preview.width);
    set(
      LAYER_IDS.PREVIEW,
      'line-dasharray',
      style.preview.dasharray,
    );

    // EDGE_HIGHLIGHT
    set(
      LAYER_IDS.EDGE_HIGHLIGHT,
      'line-color',
      style.outline.selectedColor,
    );
    set(
      LAYER_IDS.EDGE_HIGHLIGHT,
      'line-width',
      style.outline.width + 2,
    );

    // EDIT_VERTICES
    set(LAYER_IDS.EDIT_VERTICES, 'circle-radius', [
      'case', ['boolean', ['get', '_highlighted'], false],
      style.editVertex.highlightedRadius, style.editVertex.radius,
    ]);
    set(LAYER_IDS.EDIT_VERTICES, 'circle-color', [
      'case', ['boolean', ['get', '_highlighted'], false],
      style.editVertex.highlightedColor, style.editVertex.color,
    ]);
    set(LAYER_IDS.EDIT_VERTICES, 'circle-stroke-color', [
      'case', ['boolean', ['get', '_highlighted'], false],
      style.editVertex.highlightedStrokeColor,
      style.editVertex.strokeColor,
    ]);
    set(
      LAYER_IDS.EDIT_VERTICES,
      'circle-stroke-width',
      style.editVertex.strokeWidth,
    );

    // EDIT_MIDPOINTS
    set(LAYER_IDS.EDIT_MIDPOINTS, 'circle-radius', [
      'case', ['boolean', ['get', '_highlighted'], false],
      style.editVertex.highlightedRadius, style.midpoint.radius,
    ]);
    set(LAYER_IDS.EDIT_MIDPOINTS, 'circle-color', [
      'case', ['boolean', ['get', '_highlighted'], false],
      style.editVertex.highlightedColor, style.midpoint.color,
    ]);
    set(LAYER_IDS.EDIT_MIDPOINTS, 'circle-opacity', [
      'case', ['boolean', ['get', '_highlighted'], false],
      1, style.midpoint.opacity,
    ]);
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
   * Register mouse handlers for Point feature hover color.
   */
  private setupPointHover(): void {
    let hoveredId: number | null = null;

    this.map.on('mouseenter', LAYER_IDS.POINT, () => {
      this.map.getCanvas().style.cursor = 'pointer';
    });

    this.map.on('mousemove', LAYER_IDS.POINT, (e) => {
      if (!e.features || e.features.length === 0) return;
      const f = e.features[0];
      const numericId = f.id as number;

      if (hoveredId !== null && hoveredId !== numericId) {
        this.map.setFeatureState(
          { source: SOURCE_IDS.FEATURES, id: hoveredId },
          { hover: false },
        );
      }
      hoveredId = numericId;
      this.map.setFeatureState(
        { source: SOURCE_IDS.FEATURES, id: hoveredId },
        { hover: true },
      );
    });

    this.map.on('mouseleave', LAYER_IDS.POINT, () => {
      this.map.getCanvas().style.cursor = '';
      if (hoveredId !== null) {
        this.map.setFeatureState(
          { source: SOURCE_IDS.FEATURES, id: hoveredId },
          { hover: false },
        );
        hoveredId = null;
      }
    });
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
