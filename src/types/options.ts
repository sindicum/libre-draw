import type { PartialStyleConfig } from './style';

/**
 * Configuration for snap behavior.
 */
export interface SnapConfig {
  /** Whether snapping is enabled. Defaults to true. */
  enabled?: boolean;
  /** Snap distance threshold in pixels. Defaults to 10. */
  threshold?: number;
}

/**
 * Position of the toolbar control on the map.
 */
export type ToolbarPosition =
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right';

/**
 * Configuration for which toolbar controls to display.
 */
export interface ToolbarControls {
  drawPoint?: boolean;
  drawLine?: boolean;
  draw?: boolean;
  select?: boolean;
  split?: boolean;
  setback?: boolean;
  delete?: boolean;
  undo?: boolean;
  redo?: boolean;
}

/**
 * Configuration options for the toolbar.
 */
export interface ToolbarOptions {
  position?: ToolbarPosition;
  controls?: ToolbarControls;
}

/**
 * Options for creating a LibreDraw instance.
 */
export interface LibreDrawOptions {
  /** Whether to show the toolbar, or toolbar configuration options. */
  toolbar?: boolean | ToolbarOptions;
  /** Maximum number of undo/redo history entries. Defaults to 100. */
  historyLimit?: number;
  /** Partial style overrides for map layer rendering. */
  style?: PartialStyleConfig;
  /** Whether to enable snapping, or snap configuration options. Defaults to true. */
  snap?: boolean | SnapConfig;
}
