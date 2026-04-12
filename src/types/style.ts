/**
 * Style for polygon fill rendering.
 */
export interface FillStyle {
  color: string;
  opacity: number;
  selectedColor: string;
  selectedOpacity: number;
}

/**
 * Style for polygon outline rendering.
 */
export interface OutlineStyle {
  color: string;
  width: number;
  selectedColor: string;
}

/**
 * Style for feature vertex markers.
 */
export interface VertexStyle {
  color: string;
  strokeColor: string;
  strokeWidth: number;
  radius: number;
}

/**
 * Style for draw preview line.
 */
export interface PreviewStyle {
  color: string;
  width: number;
  dasharray: number[];
}

/**
 * Style for edit vertex handles.
 */
export interface EditVertexStyle {
  color: string;
  strokeColor: string;
  strokeWidth: number;
  radius: number;
  highlightedColor: string;
  highlightedStrokeColor: string;
  highlightedRadius: number;
}

/**
 * Style for midpoint handles.
 */
export interface MidpointStyle {
  color: string;
  opacity: number;
  radius: number;
}

/**
 * Full render style configuration.
 */
export interface StyleConfig {
  fill: FillStyle;
  outline: OutlineStyle;
  vertex: VertexStyle;
  preview: PreviewStyle;
  editVertex: EditVertexStyle;
  midpoint: MidpointStyle;
}

/**
 * Partial style overrides accepted from user options.
 */
export interface PartialStyleConfig {
  fill?: Partial<FillStyle>;
  outline?: Partial<OutlineStyle>;
  vertex?: Partial<VertexStyle>;
  preview?: Partial<PreviewStyle>;
  editVertex?: Partial<EditVertexStyle>;
  midpoint?: Partial<MidpointStyle>;
}

/**
 * Built-in default style used when options.style is omitted.
 */
export const DEFAULT_STYLE_CONFIG: StyleConfig = {
  fill: {
    color: '#3bb2d0',
    opacity: 0.2,
    selectedColor: '#fbb03b',
    selectedOpacity: 0.4,
  },
  outline: {
    color: '#3bb2d0',
    width: 2,
    selectedColor: '#fbb03b',
  },
  vertex: {
    color: '#ffffff',
    strokeColor: '#3bb2d0',
    strokeWidth: 2,
    radius: 4,
  },
  preview: {
    color: '#3bb2d0',
    width: 2,
    dasharray: [2, 2],
  },
  editVertex: {
    color: '#ffffff',
    strokeColor: '#3bb2d0',
    strokeWidth: 2,
    radius: 5,
    highlightedColor: '#ff4444',
    highlightedStrokeColor: '#cc0000',
    highlightedRadius: 7,
  },
  midpoint: {
    color: '#3bb2d0',
    opacity: 0.6,
    radius: 4,
  },
};

/**
 * Merge user style overrides with defaults.
 */
export function mergeStyleConfig(overrides?: PartialStyleConfig): StyleConfig {
  return {
    fill: {
      ...DEFAULT_STYLE_CONFIG.fill,
      ...overrides?.fill,
    },
    outline: {
      ...DEFAULT_STYLE_CONFIG.outline,
      ...overrides?.outline,
    },
    vertex: {
      ...DEFAULT_STYLE_CONFIG.vertex,
      ...overrides?.vertex,
    },
    preview: {
      ...DEFAULT_STYLE_CONFIG.preview,
      ...overrides?.preview,
      dasharray: [
        ...(overrides?.preview?.dasharray ?? DEFAULT_STYLE_CONFIG.preview.dasharray),
      ],
    },
    editVertex: {
      ...DEFAULT_STYLE_CONFIG.editVertex,
      ...overrides?.editVertex,
    },
    midpoint: {
      ...DEFAULT_STYLE_CONFIG.midpoint,
      ...overrides?.midpoint,
    },
  };
}
