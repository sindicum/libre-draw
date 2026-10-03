// LibreDraw - MapLibre GL JS point, line and polygon drawing and editing library
export { LibreDraw } from './LibreDraw';

// Public types
export type {
  Position,
  PointGeometry,
  LineStringGeometry,
  PolygonGeometry,
  LibreDrawGeometry,
  FeatureProperties,
  LibreDrawFeature,
  FeatureCollection,
} from './types';

export type {
  LibreDrawEventMap,
  CreateEvent,
  UpdateEvent,
  DeleteEvent,
  SplitEvent,
  SplitFailedEvent,
  SplitFailReason,
  SetbackEvent,
  SetbackFailedEvent,
  SetbackFailReason,
  UnionEvent,
  UnionFailedEvent,
  UnionFailReason,
  CutEvent,
  CutFailedEvent,
  CutFailReason,
  ReshapeEvent,
  ReshapeFailedEvent,
  ReshapeFailReason,
  RotateEvent,
  SelectionChangeEvent,
  ModeChangeEvent,
  DraftChangeEvent,
  HistoryChangeEvent,
  EditRejectedEvent,
  EditRejectedAction,
  EditRejectedReason,
  EventOrigin,
} from './types';

// Structured results of the public API
export type {
  OperationSuccess,
  OperationFailure,
  OperationResult,
  AddFeatureResult,
  FeatureValidationResult,
  UpdateFeaturePatch,
  UpdateFeatureFailReason,
  RotateFailReason,
  EdgeRef,
  SplitOperationFailReason,
  SetbackOperationFailReason,
  UnionOperationFailReason,
  CutOperationFailReason,
  ReshapeOperationFailReason,
} from './types';

export type {
  LibreDrawOptions,
  ToolbarOptions,
  ToolbarPosition,
  ToolbarControls,
  KeyboardOptions,
  SnapConfig,
  InputMethod,
  StyleConfig,
  PartialStyleConfig,
  PointStyle,
  FillStyle,
  OutlineStyle,
  PreviewStyle,
  EditVertexStyle,
  MidpointStyle,
} from './types';

// UI strings (i18n)
export type { Locale, Messages } from './types';

// Mode name type
export type { ModeName } from './types';

// Error class
export { LibreDrawError } from './core/errors';

// Style helpers
export { DEFAULT_STYLE_CONFIG, mergeStyleConfig } from './types';
