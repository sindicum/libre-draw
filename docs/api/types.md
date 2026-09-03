# Types

All types are exported as TypeScript type-only exports from `@sindicum/libre-draw`.

```ts
import type {
  LibreDrawFeature,
  FeatureCollection,
  PointGeometry,
  LineStringGeometry,
  PolygonGeometry,
  LibreDrawGeometry,
  Position,
  FeatureProperties,
  LibreDrawOptions,
  ToolbarOptions,
  ToolbarPosition,
  ToolbarControls,
  StyleConfig,
  PartialStyleConfig,
  FillStyle,
  OutlineStyle,
  VertexStyle,
  PreviewStyle,
  EditVertexStyle,
  MidpointStyle,
  PointStyle,
  ModeName,
  Action,
  ActionType,
  NormalizedInputEvent,
  InputType,
} from '@sindicum/libre-draw';
```

---

## Feature Types

### `Position`

A geographic coordinate pair `[longitude, latitude]`.

```ts
type Position = [number, number];
```

| Index | Range | Description |
|-------|-------|-------------|
| `0` | -180 to 180 | Longitude |
| `1` | -90 to 90 | Latitude |

---

### `PointGeometry`

GeoJSON Point geometry.

```ts
interface PointGeometry {
  type: 'Point';
  coordinates: Position;
}
```

| Property | Type | Description |
|----------|------|-------------|
| `type` | `'Point'` | Always `'Point'` |
| `coordinates` | `Position` | A single `[longitude, latitude]` coordinate |

---

### `LineStringGeometry`

GeoJSON LineString geometry.

```ts
interface LineStringGeometry {
  type: 'LineString';
  coordinates: Position[];
}
```

| Property | Type | Description |
|----------|------|-------------|
| `type` | `'LineString'` | Always `'LineString'` |
| `coordinates` | `Position[]` | Array of `[longitude, latitude]` coordinates. Minimum 2 positions required. |

---

### `PolygonGeometry`

GeoJSON Polygon geometry.

```ts
interface PolygonGeometry {
  type: 'Polygon';
  coordinates: Position[][];
}
```

| Property | Type | Description |
|----------|------|-------------|
| `type` | `'Polygon'` | Always `'Polygon'` |
| `coordinates` | `Position[][]` | Array of linear rings. The first ring is the outer boundary. Each ring must be closed (first position === last position). |

---

### `LibreDrawGeometry`

Union of supported GeoJSON geometry types.

```ts
type LibreDrawGeometry = PointGeometry | LineStringGeometry | PolygonGeometry;
```

---

### `FeatureProperties`

Arbitrary key-value properties attached to a feature.

```ts
interface FeatureProperties {
  [key: string]: unknown;
}
```

---

### `LibreDrawFeature`

A GeoJSON Feature used by LibreDraw. Supports Point, LineString, and Polygon geometry types.

```ts
interface LibreDrawFeature {
  id: string;
  type: 'Feature';
  geometry: LibreDrawGeometry;
  properties: FeatureProperties;
}
```

| Property | Type | Description |
|----------|------|-------------|
| `id` | `string` | UUID v4 unique identifier |
| `type` | `'Feature'` | Always `'Feature'` |
| `geometry` | [`LibreDrawGeometry`](#libredrawgeometry) | Point, LineString, or Polygon geometry |
| `properties` | [`FeatureProperties`](#featureproperties) | Arbitrary metadata |

---

### `FeatureCollection`

A GeoJSON FeatureCollection containing LibreDraw features (points, lines, and polygons). Returned by [`toGeoJSON()`](/api/libre-draw#togeojson).

```ts
interface FeatureCollection {
  type: 'FeatureCollection';
  features: LibreDrawFeature[];
}
```

| Property | Type | Description |
|----------|------|-------------|
| `type` | `'FeatureCollection'` | Always `'FeatureCollection'` |
| `features` | [`LibreDrawFeature[]`](#libredrawfeature) | Array of point and polygon features |

---

## Configuration Types

### `LibreDrawOptions`

Options for creating a LibreDraw instance.

```ts
interface LibreDrawOptions {
  toolbar?: boolean | ToolbarOptions;
  historyLimit?: number;
  style?: PartialStyleConfig;
  snap?: boolean | SnapConfig;
}
```

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `toolbar` | `boolean \| ToolbarOptions` | `true` | Whether to show the toolbar, or toolbar configuration. Set to `false` for headless mode. |
| `historyLimit` | `number` | `100` | Maximum number of undo/redo history entries |
| `style` | `PartialStyleConfig` | `default style` | Partial overrides for map layer styling (fill/outline/vertices/preview/edit handles). |
| `snap` | `boolean \| SnapConfig` | `true` | Whether to enable snapping, or snap configuration. Set to `false` to disable. |

---

### `ToolbarOptions`

Configuration options for the toolbar.

```ts
interface ToolbarOptions {
  position?: ToolbarPosition;
  controls?: ToolbarControls;
}
```

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `position` | [`ToolbarPosition`](#toolbarposition) | `'top-right'` | Where to place the toolbar on the map |
| `controls` | [`ToolbarControls`](#toolbarcontrols) | All `true` | Which buttons to display |

---

### `ToolbarPosition`

Position of the toolbar control on the map.

```ts
type ToolbarPosition =
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right';
```

---

### `ToolbarControls`

Configuration for which toolbar controls to display.

```ts
interface ToolbarControls {
  drawPoint?: boolean;
  drawLine?: boolean;
  draw?: boolean;
  select?: boolean;
  split?: boolean;
  setback?: boolean;
  settings?: boolean;
  delete?: boolean;
  undo?: boolean;
  redo?: boolean;
}
```

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `drawPoint` | `boolean` | `true` | Show draw-point mode toggle button |
| `drawLine` | `boolean` | `true` | Show draw-line mode toggle button |
| `draw` | `boolean` | `true` | Show draw mode toggle button |
| `select` | `boolean` | `true` | Show select mode toggle button |
| `split` | `boolean` | `true` | Show split mode toggle button |
| `setback` | `boolean` | `true` | Show setback mode toggle button and distance input |
| `settings` | `boolean` | `true` | Show style settings button and panel |
| `delete` | `boolean` | `true` | Show delete button |
| `undo` | `boolean` | `true` | Show undo button |
| `redo` | `boolean` | `true` | Show redo button |

---

## Mode Types

### `ModeName`

The available drawing mode names.

```ts
type ModeName = 'idle' | 'draw-point' | 'draw-line' | 'draw' | 'select' | 'split' | 'setback';
```

| Value | Description |
|-------|-------------|
| `'idle'` | No drawing interaction. Map behaves normally. |
| `'draw-point'` | Place point features by clicking/tapping. |
| `'draw-line'` | Create lines by clicking/tapping vertices, double-click to finalize. |
| `'draw'` | Create polygons by clicking/tapping vertices. |
| `'select'` | Select and edit existing features (points, lines, and polygons). |
| `'split'` | Split a polygon into two polygons with a two-point line. |
| `'setback'` | Apply inward edge setback with distance input and preview. |

---

## Action Types

### `ActionType`

The type of history action.

```ts
type ActionType = 'create' | 'update' | 'delete' | 'split' | 'setback' | 'batch';
```

`'batch'` is used by [`BatchAction`](#batchaction), which groups several actions into one history step (for example, one [`addFeatures()`](/api/libre-draw#addfeatures-features) call).

---

### `Action`

A reversible action that can be applied and reverted on a FeatureStore.

```ts
interface Action {
  type: ActionType;
  apply(store: FeatureStoreInterface): void;
  revert(store: FeatureStoreInterface): void;
}
```

| Property | Type | Description |
|----------|------|-------------|
| `type` | [`ActionType`](#actiontype) | The kind of action |
| `apply` | `(store) => void` | Apply the action to the store |
| `revert` | `(store) => void` | Revert the action from the store |

---

### `BatchAction`

An [`Action`](#action) that groups multiple child actions into a single undo/redo step. `apply` runs the children in order; `revert` runs them in reverse order. Exported so that history-aware integrations can recognise batched steps.

```ts
class BatchAction implements Action {
  readonly type: 'batch';
  readonly actions: readonly Action[];
  constructor(actions: readonly Action[]);
}
```

---

### `FeatureStoreInterface`

Minimal interface for the FeatureStore used by actions. This avoids circular imports between types and core modules.

```ts
interface FeatureStoreInterface {
  add(feature: LibreDrawFeature): void;
  update(id: string, feature: LibreDrawFeature): void;
  remove(id: string): void;
  getById(id: string): LibreDrawFeature | undefined;
}
```

---

## Input Types

### `InputType`

The type of input device that generated an event.

```ts
type InputType = 'mouse' | 'touch';
```

---

### `NormalizedInputEvent`

A normalized input event shared across mouse and touch handlers.

```ts
interface NormalizedInputEvent {
  lngLat: { lng: number; lat: number };
  point: { x: number; y: number };
  originalEvent: MouseEvent | TouchEvent;
  inputType: InputType;
}
```

| Property | Type | Description |
|----------|------|-------------|
| `lngLat` | `{ lng: number; lat: number }` | The geographic coordinate at the event location |
| `point` | `{ x: number; y: number }` | The screen pixel coordinate at the event location |
| `originalEvent` | `MouseEvent \| TouchEvent` | The original DOM event |
| `inputType` | [`InputType`](#inputtype) | The input device type that generated this event |

---

## Style Types

### `StyleConfig`

Full render style configuration. Returned by [`getStyle()`](/api/libre-draw#getstyle).

```ts
interface StyleConfig {
  fill: FillStyle;
  outline: OutlineStyle;
  vertex: VertexStyle;
  preview: PreviewStyle;
  editVertex: EditVertexStyle;
  midpoint: MidpointStyle;
  point: PointStyle;
}
```

| Property | Type | Description |
|----------|------|-------------|
| `fill` | [`FillStyle`](#fillstyle) | Polygon fill rendering |
| `outline` | [`OutlineStyle`](#outlinestyle) | Polygon/line outline rendering |
| `vertex` | [`VertexStyle`](#vertexstyle) | Vertex markers on features |
| `preview` | [`PreviewStyle`](#previewstyle) | Draw preview / guide line |
| `editVertex` | [`EditVertexStyle`](#editvertexstyle) | Edit vertex handles (selected features) |
| `midpoint` | [`MidpointStyle`](#midpointstyle) | Midpoint handles (selected features) |
| `point` | [`PointStyle`](#pointstyle) | Point geometry features |

---

### `PartialStyleConfig`

Partial style overrides accepted by the constructor `style` option and [`setStyle()`](/api/libre-draw#setstyle-style). All sections and properties are optional — unset values retain their current or default value.

```ts
interface PartialStyleConfig {
  fill?: Partial<FillStyle>;
  outline?: Partial<OutlineStyle>;
  vertex?: Partial<VertexStyle>;
  preview?: Partial<PreviewStyle>;
  editVertex?: Partial<EditVertexStyle>;
  midpoint?: Partial<MidpointStyle>;
  point?: Partial<PointStyle>;
}
```

---

### `FillStyle`

Style for polygon fill rendering.

```ts
interface FillStyle {
  color: string;
  opacity: number;
  selectedColor: string;
  selectedOpacity: number;
}
```

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `color` | `string` | `'#3bb2d0'` | Fill color |
| `opacity` | `number` | `0.2` | Fill opacity (0–1) |
| `selectedColor` | `string` | `'#fbb03b'` | Fill color when selected |
| `selectedOpacity` | `number` | `0.4` | Fill opacity when selected |

---

### `OutlineStyle`

Style for polygon/line outline rendering.

```ts
interface OutlineStyle {
  color: string;
  width: number;
  selectedColor: string;
}
```

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `color` | `string` | `'#3bb2d0'` | Line color |
| `width` | `number` | `2` | Line width in pixels |
| `selectedColor` | `string` | `'#fbb03b'` | Line color when selected |

---

### `VertexStyle`

Style for feature vertex markers displayed on all features.

```ts
interface VertexStyle {
  color: string;
  strokeColor: string;
  strokeWidth: number;
  radius: number;
}
```

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `color` | `string` | `'#ffffff'` | Vertex fill color |
| `strokeColor` | `string` | `'#3bb2d0'` | Vertex stroke color |
| `strokeWidth` | `number` | `2` | Vertex stroke width |
| `radius` | `number` | `4` | Vertex radius in pixels |

---

### `PreviewStyle`

Style for draw preview and guide lines (split, setback).

```ts
interface PreviewStyle {
  color: string;
  width: number;
  dasharray: number[];
}
```

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `color` | `string` | `'#3bb2d0'` | Dash line color |
| `width` | `number` | `2` | Dash line width |
| `dasharray` | `number[]` | `[2, 2]` | Dash pattern |

---

### `EditVertexStyle`

Style for edit vertex handles on selected features.

```ts
interface EditVertexStyle {
  color: string;
  strokeColor: string;
  strokeWidth: number;
  radius: number;
  highlightedColor: string;
  highlightedStrokeColor: string;
  highlightedRadius: number;
}
```

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `color` | `string` | `'#ffffff'` | Handle fill color |
| `strokeColor` | `string` | `'#3bb2d0'` | Handle stroke color |
| `strokeWidth` | `number` | `2` | Handle stroke width |
| `radius` | `number` | `5` | Handle radius |
| `highlightedColor` | `string` | `'#ff4444'` | Hover/highlight fill color |
| `highlightedStrokeColor` | `string` | `'#cc0000'` | Hover/highlight stroke color |
| `highlightedRadius` | `number` | `7` | Hover/highlight radius |

---

### `MidpointStyle`

Style for midpoint handles on selected features.

```ts
interface MidpointStyle {
  color: string;
  opacity: number;
  radius: number;
}
```

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `color` | `string` | `'#3bb2d0'` | Midpoint fill color |
| `opacity` | `number` | `0.6` | Midpoint opacity |
| `radius` | `number` | `4` | Midpoint radius |

---

### `PointStyle`

Style for Point geometry features.

```ts
interface PointStyle {
  color: string;
  radius: number;
  selectedColor: string;
  selectedRadius: number;
  hoverColor: string;
  strokeColor: string;
  strokeWidth: number;
}
```

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `color` | `string` | `'#3bb2d0'` | Point fill color |
| `radius` | `number` | `6` | Point radius in pixels |
| `selectedColor` | `string` | `'#fbb03b'` | Point color when selected |
| `selectedRadius` | `number` | `8` | Point radius when selected |
| `hoverColor` | `string` | `'#fbb03b'` | Point color on mouse hover |
| `strokeColor` | `string` | `'#3bb2d0'` | Point stroke color |
| `strokeWidth` | `number` | `2` | Point stroke width |

---

## Error Class

### `LibreDrawError`

Base error class for all LibreDraw errors. Extends the native `Error` class.

```ts
class LibreDrawError extends Error {
  constructor(message: string);
  name: 'LibreDrawError';
}
```

Thrown when:
- A method is called on a destroyed instance
- Invalid GeoJSON is passed to `setFeatures` or `addFeatures`
- `selectFeature` is called with a non-existent feature ID
- Invalid polygon geometry (self-intersecting, out-of-bounds coordinates, etc.)

```ts
import { LibreDrawError } from '@sindicum/libre-draw';

try {
  draw.setFeatures({ invalid: 'data' });
} catch (e) {
  if (e instanceof LibreDrawError) {
    console.error('LibreDraw error:', e.message);
  }
}
```
