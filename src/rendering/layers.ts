import type { ExpressionSpecification } from 'maplibre-gl';
import type { LibreDrawLayer } from '../types/layers';
import { BRAND_COLOR } from '../types/brand';

/**
 * The ids of the GeoJSON sources LibreDraw draws from. A layer definition
 * names one of them as its `source`.
 *
 * - `FEATURES`: the features. Each carries its own properties, plus
 *   `libre-draw:selected` (`true` while selected) and `libre-draw:id`.
 *   The feature-state `hover` is `true` on the feature a click would pick.
 * - `PREVIEW`: the line of a draft being drawn
 * - `EDGE_HIGHLIGHT`: the edge picked in setback mode
 * - `EDIT_VERTICES`: the handles of the selected feature. `libre-draw:handle`
 *   is `'vertex'` or `'midpoint'`; `libre-draw:highlighted` is `true` on the
 *   handle under the pointer
 * - `SNAP_INDICATOR`: the point a vertex would snap to
 * - `ROTATION_CENTER`: the pivot of rotate mode
 */
export const SOURCE_IDS = {
  FEATURES: 'libre-draw-features',
  PREVIEW: 'libre-draw-preview',
  EDGE_HIGHLIGHT: 'libre-draw-edge-highlight',
  EDIT_VERTICES: 'libre-draw-edit-vertices',
  SNAP_INDICATOR: 'libre-draw-snap-indicator',
  ROTATION_CENTER: 'libre-draw-rotation-center',
} as const;

/** Map image id of the crosshair drawn by the default rotation center layer. */
export const ROTATION_CENTER_IMAGE_ID = 'libre-draw-rotation-center-crosshair';

const SELECTED_COLOR = '#fbb03b';
const HIGHLIGHTED_COLOR = '#ff4444';
const HIGHLIGHTED_STROKE_COLOR = '#cc0000';

const selected: ExpressionSpecification = ['boolean', ['get', 'libre-draw:selected'], false];
const highlighted: ExpressionSpecification = ['boolean', ['get', 'libre-draw:highlighted'], false];

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

/**
 * The layers LibreDraw draws with when the `layers` option is omitted, in
 * drawing order. Frozen: copy a definition to change it.
 *
 * @example Green polygons, everything else unchanged:
 * ```ts
 * new LibreDraw(map, {
 *   layers: DEFAULT_LAYERS.map((layer) =>
 *     layer.id === 'libre-draw-fill' && layer.type === 'fill'
 *       ? { ...layer, paint: { ...layer.paint, 'fill-color': '#2a2' } }
 *       : layer
 *   ),
 * });
 * ```
 */
export const DEFAULT_LAYERS: readonly LibreDrawLayer[] = deepFreeze<LibreDrawLayer[]>([
  {
    id: 'libre-draw-fill',
    type: 'fill',
    source: SOURCE_IDS.FEATURES,
    filter: ['==', ['geometry-type'], 'Polygon'],
    paint: {
      'fill-color': ['case', selected, SELECTED_COLOR, BRAND_COLOR],
      'fill-opacity': ['case', selected, 0.4, 0.2],
    },
  },
  {
    id: 'libre-draw-outline',
    type: 'line',
    source: SOURCE_IDS.FEATURES,
    filter: ['==', ['geometry-type'], 'Polygon'],
    paint: {
      'line-color': ['case', selected, SELECTED_COLOR, BRAND_COLOR],
      'line-width': 2,
    },
  },
  {
    id: 'libre-draw-line',
    type: 'line',
    source: SOURCE_IDS.FEATURES,
    filter: ['==', ['geometry-type'], 'LineString'],
    paint: {
      'line-color': ['case', selected, SELECTED_COLOR, BRAND_COLOR],
      'line-width': ['case', selected, 3, 2],
    },
  },
  {
    id: 'libre-draw-point',
    type: 'circle',
    source: SOURCE_IDS.FEATURES,
    filter: ['==', ['geometry-type'], 'Point'],
    paint: {
      'circle-radius': ['case', selected, 8, 6],
      'circle-color': [
        'case',
        selected,
        SELECTED_COLOR,
        ['boolean', ['feature-state', 'hover'], false],
        SELECTED_COLOR,
        BRAND_COLOR,
      ],
      'circle-stroke-color': BRAND_COLOR,
      'circle-stroke-width': 2,
    },
  },
  {
    id: 'libre-draw-preview',
    type: 'line',
    source: SOURCE_IDS.PREVIEW,
    paint: {
      'line-color': BRAND_COLOR,
      'line-width': 2,
      'line-dasharray': [2, 2],
    },
  },
  {
    id: 'libre-draw-edge-highlight',
    type: 'line',
    source: SOURCE_IDS.EDGE_HIGHLIGHT,
    paint: {
      'line-color': SELECTED_COLOR,
      'line-width': 4,
    },
  },
  {
    id: 'libre-draw-edit-midpoints',
    type: 'circle',
    source: SOURCE_IDS.EDIT_VERTICES,
    filter: ['==', ['get', 'libre-draw:handle'], 'midpoint'],
    paint: {
      'circle-radius': ['case', highlighted, 7, 4],
      'circle-color': ['case', highlighted, HIGHLIGHTED_COLOR, BRAND_COLOR],
      'circle-opacity': ['case', highlighted, 1, 0.6],
      'circle-stroke-width': ['case', highlighted, 2, 0],
      'circle-stroke-color': ['case', highlighted, HIGHLIGHTED_STROKE_COLOR, 'transparent'],
    },
  },
  {
    id: 'libre-draw-snap-indicator',
    type: 'circle',
    source: SOURCE_IDS.SNAP_INDICATOR,
    paint: {
      'circle-radius': 6,
      'circle-color': 'rgba(255, 140, 0, 0.7)',
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 2,
    },
  },
  {
    id: 'libre-draw-rotation-center',
    type: 'symbol',
    source: SOURCE_IDS.ROTATION_CENTER,
    layout: {
      'icon-image': ROTATION_CENTER_IMAGE_ID,
      // The pivot must always show, even over dense features or map labels.
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
  },
  {
    id: 'libre-draw-edit-vertices',
    type: 'circle',
    source: SOURCE_IDS.EDIT_VERTICES,
    filter: ['==', ['get', 'libre-draw:handle'], 'vertex'],
    paint: {
      'circle-radius': ['case', highlighted, 7, 5],
      'circle-color': ['case', highlighted, HIGHLIGHTED_COLOR, '#ffffff'],
      'circle-stroke-color': ['case', highlighted, HIGHLIGHTED_STROKE_COLOR, BRAND_COLOR],
      'circle-stroke-width': 2,
    },
  },
]);
