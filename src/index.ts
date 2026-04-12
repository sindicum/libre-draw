// LibreDraw - MapLibre GL JS polygon drawing and editing library
export { LibreDraw } from './LibreDraw';

// Public types
export type {
  Position,
  PointGeometry,
  PolygonGeometry,
  LibreDrawGeometry,
  FeatureProperties,
  LibreDrawFeature,
  FeatureCollection,
  ActionType,
  Action,
} from './types';

export type {
  LibreDrawEventMap,
  CreateEvent,
  UpdateEvent,
  DeleteEvent,
  SplitEvent,
  SplitFailedEvent,
  SetbackEvent,
  SetbackFailedEvent,
  SetbackFailReason,
  SelectionChangeEvent,
  ModeChangeEvent,
} from './types';

export type {
  LibreDrawOptions,
  ToolbarOptions,
  ToolbarPosition,
  ToolbarControls,
  StyleConfig,
  PartialStyleConfig,
} from './types';

export type {
  NormalizedInputEvent,
  InputType,
} from './types';

// Mode name type
export type { ModeName } from './types';

// Error class
export { LibreDrawError } from './core/errors';

// Style helpers
export {
  DEFAULT_STYLE_CONFIG,
  mergeStyleConfig,
} from './types';

// Split history action
export { SplitAction } from './types';

// Setback history action
export { SetbackAction } from './types';
