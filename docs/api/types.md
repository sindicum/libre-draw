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
type ActionType = 'create' | 'update' | 'delete' | 'split' | 'setback';
```

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
