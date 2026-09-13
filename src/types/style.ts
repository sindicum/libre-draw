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
 *
 * @deprecated Has no effect: the layer it styled was removed in v0.9.1
 * (it had rendered nothing since v0.5.2). Accepted for compatibility and
 * removed in v1.0. Draft and edit vertices are styled by {@link EditVertexStyle}.
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
 * Style for Point geometry features.
 */
export interface PointStyle {
  color: string;
  radius: number;
  selectedColor: string;
  selectedRadius: number;
  hoverColor: string;
  strokeColor: string;
  strokeWidth: number;
}

/**
 * Full render style configuration.
 */
export interface StyleConfig {
  fill: FillStyle;
  outline: OutlineStyle;
  /** @deprecated Has no effect. See {@link VertexStyle}. */
  vertex: VertexStyle;
  preview: PreviewStyle;
  editVertex: EditVertexStyle;
  midpoint: MidpointStyle;
  point: PointStyle;
}

/**
 * Partial style overrides accepted from user options.
 */
export interface PartialStyleConfig {
  fill?: Partial<FillStyle>;
  outline?: Partial<OutlineStyle>;
  /** @deprecated Has no effect. See {@link VertexStyle}. */
  vertex?: Partial<VertexStyle>;
  preview?: Partial<PreviewStyle>;
  editVertex?: Partial<EditVertexStyle>;
  midpoint?: Partial<MidpointStyle>;
  point?: Partial<PointStyle>;
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
  point: {
    color: '#3bb2d0',
    radius: 6,
    selectedColor: '#fbb03b',
    selectedRadius: 8,
    hoverColor: '#fbb03b',
    strokeColor: '#3bb2d0',
    strokeWidth: 2,
  },
};

/**
 * Merge user style overrides onto a base style.
 *
 * Returns a new config: neither `base` nor `overrides` is mutated, and the
 * preview dasharray is copied so arrays are never shared with the caller.
 *
 * @param overrides - Partial overrides to apply.
 * @param base - The style to apply them to. Defaults to
 *   {@link DEFAULT_STYLE_CONFIG}; `setStyle()` passes the current style so
 *   partial updates accumulate instead of resetting other sections.
 */
export function mergeStyleConfig(
  overrides?: PartialStyleConfig,
  base: StyleConfig = DEFAULT_STYLE_CONFIG
): StyleConfig {
  return {
    fill: {
      ...base.fill,
      ...overrides?.fill,
    },
    outline: {
      ...base.outline,
      ...overrides?.outline,
    },
    vertex: {
      ...base.vertex,
      ...overrides?.vertex,
    },
    preview: {
      ...base.preview,
      ...overrides?.preview,
      dasharray: [...(overrides?.preview?.dasharray ?? base.preview.dasharray)],
    },
    editVertex: {
      ...base.editVertex,
      ...overrides?.editVertex,
    },
    midpoint: {
      ...base.midpoint,
      ...overrides?.midpoint,
    },
    point: {
      ...base.point,
      ...overrides?.point,
    },
  };
}
