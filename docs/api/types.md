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
  KeyboardOptions,
  SnapConfig,
  InputMethod,
  ToolbarOptions,
  ToolbarPosition,
  ToolbarControls,
  LibreDrawLayer,
  ModeName,
  Locale,
  Messages,
  OperationResult,
  OperationSuccess,
  OperationFailure,
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
} from '@sindicum/libre-draw';
```

Event payload types (`CreateEvent`, `LibreDrawEventMap`, `EventOrigin`, the `*FailReason` unions, …) are documented on the [Events](/api/events) page and exported the same way. Runtime values (`LibreDrawError`, `SOURCE_IDS`, `DEFAULT_LAYERS`) use a plain `import`.

---

## Feature Types

### `Position`

A geographic coordinate pair `[longitude, latitude]`.

```ts
type Position = [number, number];
```

| Index | Range       | Description |
| ----- | ----------- | ----------- |
| `0`   | -180 to 180 | Longitude   |
| `1`   | -90 to 90   | Latitude    |

---

### `PointGeometry`

GeoJSON Point geometry.

```ts
interface PointGeometry {
  type: 'Point';
  coordinates: Position;
}
```

| Property      | Type       | Description                                 |
| ------------- | ---------- | ------------------------------------------- |
| `type`        | `'Point'`  | Always `'Point'`                            |
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

| Property      | Type           | Description                                                                 |
| ------------- | -------------- | --------------------------------------------------------------------------- |
| `type`        | `'LineString'` | Always `'LineString'`                                                       |
| `coordinates` | `Position[]`   | Array of `[longitude, latitude]` coordinates. Minimum 2 positions required. |

---

### `PolygonGeometry`

GeoJSON Polygon geometry.

```ts
interface PolygonGeometry {
  type: 'Polygon';
  coordinates: Position[][];
}
```

| Property      | Type           | Description                                                                                                                                                                                                                                                                                                                                     |
| ------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`        | `'Polygon'`    | Always `'Polygon'`                                                                                                                                                                                                                                                                                                                              |
| `coordinates` | `Position[][]` | Array of linear rings. The first ring is the outer boundary and any further rings are holes. Each ring must be closed (first position === last position) and must not cross itself. Holes must lie inside the outer ring, must not cross or run along it or each other, and must not lie inside another hole; rings may touch at single points. |

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

| Property     | Type                                      | Description                            |
| ------------ | ----------------------------------------- | -------------------------------------- |
| `id`         | `string`                                  | UUID v4 unique identifier              |
| `type`       | `'Feature'`                               | Always `'Feature'`                     |
| `geometry`   | [`LibreDrawGeometry`](#libredrawgeometry) | Point, LineString, or Polygon geometry |
| `properties` | [`FeatureProperties`](#featureproperties) | Arbitrary metadata                     |

---

### `FeatureCollection`

A GeoJSON FeatureCollection containing LibreDraw features (points, lines, and polygons). Returned by [`toGeoJSON()`](/api/libre-draw#togeojson).

```ts
interface FeatureCollection {
  type: 'FeatureCollection';
  features: LibreDrawFeature[];
}
```

| Property   | Type                                      | Description                                |
| ---------- | ----------------------------------------- | ------------------------------------------ |
| `type`     | `'FeatureCollection'`                     | Always `'FeatureCollection'`               |
| `features` | [`LibreDrawFeature[]`](#libredrawfeature) | Array of point, line, and polygon features |

---

## Configuration Types

### `LibreDrawOptions`

Options for creating a LibreDraw instance.

```ts
interface LibreDrawOptions {
  toolbar?: boolean | ToolbarOptions;
  keyboard?: boolean | KeyboardOptions;
  historyLimit?: number;
  layers?: LibreDrawLayer[];
  snap?: boolean | SnapConfig;
  locale?: Locale;
  messages?: Partial<Messages>;
  inputMethod?: InputMethod;
}
```

| Property       | Type                                  | Default                             | Description                                                                                                                                |
| -------------- | ------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `toolbar`      | `boolean \| ToolbarOptions`           | `true`                              | Whether to show the toolbar, or toolbar configuration. Set to `false` for headless mode.                                                   |
| `keyboard`     | `boolean \| KeyboardOptions`          | `true`                              | Whether to enable keyboard shortcuts, or shortcut configuration. See [`KeyboardOptions`](#keyboardoptions).                                |
| `historyLimit` | `number`                              | `100`                               | Maximum number of undo/redo history entries                                                                                                |
| `layers`       | [`LibreDrawLayer[]`](#libredrawlayer) | [`DEFAULT_LAYERS`](#default-layers) | MapLibre layer definitions to draw with. They replace the defaults entirely and survive `map.setStyle()`. See [Layer Types](#layer-types). |
| `snap`         | `boolean \| SnapConfig`               | `true`                              | Whether to enable snapping, or snap configuration ([`SnapConfig`](#snapconfig)). Set to `false` to disable.                                |
| `locale`       | [`Locale`](#locale)                   | `'en'`                              | Language of the toolbar and its popups. Throws `LibreDrawError` for an unknown value.                                                      |
| `messages`     | `Partial<Messages>`                   | `{}`                                | Overrides for individual UI strings, merged onto the selected locale. See [`Messages`](#messages).                                         |
| `inputMethod`  | [`InputMethod`](#inputmethod)         | `'tap'`                             | How the drawing modes take a point. Throws `LibreDrawError` for an unknown value.                                                          |

---

### `InputMethod`

How the drawing modes (`draw-point`, `draw-line`, `draw-polygon`, `draw-rectangle`, `draw-angled-rectangle`) take a point, and the `cut` and `reshape` modes once their target is picked by tap. Set with the `inputMethod` option or [`setInputMethod()`](/api/libre-draw#setinputmethod-method).

```ts
type InputMethod = 'tap' | 'reticle';
```

| Value       | Description                                                                                                                                                                                                                                           |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `'tap'`     | A click or tap on the map places the point (default).                                                                                                                                                                                                 |
| `'reticle'` | A crosshair is fixed at the center of the map and an action bar (**Undo point**, **Add point**, **Finish**) at the bottom. The map pans underneath the crosshair; the button places the point there. See [Input methods](/guide/modes#input-methods). |

---

### `SnapConfig`

Configuration for vertex snapping while drawing and editing.

```ts
interface SnapConfig {
  enabled?: boolean;
  threshold?: number;
}
```

| Property    | Type      | Default | Description                                                   |
| ----------- | --------- | ------- | ------------------------------------------------------------- |
| `enabled`   | `boolean` | `true`  | Whether snapping is enabled                                   |
| `threshold` | `number`  | `10`    | Snap distance in pixels (values below `1` are clamped to `1`) |

---

### `KeyboardOptions`

Configuration for keyboard shortcuts. Shortcuts only fire while the map has focus (clicking the map focuses it). See the [shortcut list](/guide/modes#keyboard-shortcuts) for the keys.

```ts
interface KeyboardOptions {
  undoRedo?: boolean;
}
```

| Property   | Type      | Default | Description                                                                                                                                                                                                                                          |
| ---------- | --------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `undoRedo` | `boolean` | `true`  | Whether Ctrl/Cmd+Z (undo), Ctrl/Cmd+Shift+Z and Ctrl+Y (redo) are handled. Escape / Delete / Backspace / Enter handling inside modes is not affected; while a text field inside the map has focus, Delete, Backspace and Enter belong to that field. |

---

### `ToolbarOptions`

Configuration options for the toolbar.

```ts
interface ToolbarOptions {
  position?: ToolbarPosition;
  controls?: ToolbarControls;
}
```

| Property   | Type                                  | Default       | Description                           |
| ---------- | ------------------------------------- | ------------- | ------------------------------------- |
| `position` | [`ToolbarPosition`](#toolbarposition) | `'top-right'` | Where to place the toolbar on the map |
| `controls` | [`ToolbarControls`](#toolbarcontrols) | All `true`    | Which buttons to display              |

---

### `ToolbarPosition`

Position of the toolbar control on the map.

```ts
type ToolbarPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
```

---

### `ToolbarControls`

Configuration for which toolbar controls to display.

```ts
interface ToolbarControls {
  drawPoint?: boolean;
  drawLine?: boolean;
  drawPolygon?: boolean;
  drawRectangle?: boolean;
  drawAngledRectangle?: boolean;
  inputMethod?: boolean;
  select?: boolean;
  split?: boolean;
  setback?: boolean;
  union?: boolean;
  rotate?: boolean;
  cut?: boolean;
  reshape?: boolean;
  delete?: boolean;
  undo?: boolean;
  redo?: boolean;
}
```

| Property              | Type      | Default | Description                                        |
| --------------------- | --------- | ------- | -------------------------------------------------- |
| `drawPoint`           | `boolean` | `true`  | Show draw-point mode toggle button                 |
| `drawLine`            | `boolean` | `true`  | Show draw-line mode toggle button                  |
| `drawPolygon`         | `boolean` | `true`  | Show draw-polygon mode toggle button               |
| `drawRectangle`       | `boolean` | `true`  | Show draw-rectangle mode toggle button             |
| `drawAngledRectangle` | `boolean` | `true`  | Show draw-angled-rectangle mode toggle button      |
| `inputMethod`         | `boolean` | `true`  | Show the tap / center reticle input method toggle  |
| `select`              | `boolean` | `true`  | Show select mode toggle button                     |
| `split`               | `boolean` | `true`  | Show split mode toggle button                      |
| `setback`             | `boolean` | `true`  | Show setback mode toggle button and distance input |
| `union`               | `boolean` | `true`  | Show union mode toggle button                      |
| `rotate`              | `boolean` | `true`  | Show rotate mode toggle button and angle input     |
| `cut`                 | `boolean` | `true`  | Show cut mode toggle button                        |
| `reshape`             | `boolean` | `true`  | Show reshape mode toggle button                    |
| `delete`              | `boolean` | `true`  | Show delete button                                 |
| `undo`                | `boolean` | `true`  | Show undo button                                   |
| `redo`                | `boolean` | `true`  | Show redo button                                   |

---

## Localization Types

### `Locale`

Bundled UI languages.

```ts
type Locale = 'en' | 'ja';
```

---

### `Messages`

Every user-visible string of the toolbar and its popups. All keys are required in the bundled tables; pass a `Partial<Messages>` as `messages` to override a subset.

```ts
interface Messages {
  // Toolbar button titles (also used as aria-label)
  toolbarDrawPoint: string;
  toolbarDrawLine: string;
  toolbarDrawPolygon: string;
  toolbarDrawRectangle: string;
  toolbarDrawAngledRectangle: string;
  toolbarInputMethod: string;
  toolbarSelect: string;
  toolbarSplit: string;
  toolbarUnion: string;
  toolbarSetback: string;
  toolbarRotate: string;
  toolbarCut: string;
  toolbarReshape: string;
  toolbarDelete: string;
  toolbarUndo: string;
  toolbarRedo: string;
  // Setback distance popup
  setbackDistanceInput: string; // aria-label of the field
  setbackExecute: string; // visible text of the execute button
  setbackExecuteLabel: string; // aria-label of the execute button
  // Rotation angle popup
  rotateAngleInput: string;
  rotateExecute: string;
  rotateExecuteLabel: string;
  // Union execute popup
  unionExecute: string;
  unionExecuteLabel: string;
  // Center reticle action bar
  reticleAddPoint: string; // visible text and aria-label of the "Add point" button
  reticleUndoVertex: string; // ... of the "Undo point" button
  reticleFinish: string; // ... of the "Finish" button
}
```

```ts
// Japanese UI with one label changed
const draw = new LibreDraw(map, {
  locale: 'ja',
  messages: { setbackExecute: '適用' },
});
```

---

## Mode Types

### `ModeName`

The available drawing mode names.

```ts
type ModeName =
  | 'idle'
  | 'draw-point'
  | 'draw-line'
  | 'draw-polygon'
  | 'draw-rectangle'
  | 'draw-angled-rectangle'
  | 'select'
  | 'split'
  | 'setback'
  | 'union'
  | 'rotate'
  | 'cut'
  | 'reshape';
```

| Value                     | Description                                                                                                 |
| ------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `'idle'`                  | No drawing interaction. Map behaves normally.                                                               |
| `'draw-point'`            | Place point features by clicking/tapping.                                                                   |
| `'draw-line'`             | Create lines by clicking/tapping vertices, click the last one to finalize.                                  |
| `'draw-polygon'`          | Create polygons by clicking/tapping vertices, click the first or last one.                                  |
| `'draw-rectangle'`        | Create an axis-aligned rectangle by clicking/tapping two opposite corners.                                  |
| `'draw-angled-rectangle'` | Create a rectangle at any angle: click/tap two points of a base edge, then a point that sets the width.     |
| `'select'`                | Select and edit existing features (points, lines, and polygons).                                            |
| `'split'`                 | Split a polygon or line into two with a two-point line.                                                     |
| `'union'`                 | Merge two or more touching or overlapping polygons into one: click them, then press Enter or execute.       |
| `'setback'`               | Apply inward edge setback with distance input and preview.                                                  |
| `'rotate'`                | Rotate a polygon or line around its center by dragging or angle input.                                      |
| `'cut'`                   | Cut an area out of a polygon: click the polygon, then draw the outline of the area to remove.               |
| `'reshape'`               | Redraw part of a polygon's boundary: click the polygon, then draw a line that crosses its outer ring twice. |

---

## Operation Result Types

Structured outcomes returned by the public API. None of them is thrown; narrow on the discriminant (`ok` / `valid`) to read the rest. `LibreDraw` throws only for misuse of the instance (a call after `destroy()`, an unknown mode name, an unsupported locale or input method); see [Programmatic API](/guide/programmatic-api#return-values-and-exceptions) for the full table.

### `OperationResult`

The result of an operation that changes the store ([`setFeatures`](/api/libre-draw#setfeatures-geojson), [`updateFeature`](/api/libre-draw#updatefeature-id-patch), [`rotate`](/api/libre-draw#rotate-id-angledeg), [`split`](/api/libre-draw#split-id-line), [`setback`](/api/libre-draw#setback-id-edge-distancemeters), [`union`](/api/libre-draw#union-ids), [`cut`](/api/libre-draw#cut-id-cutter), and [`reshape`](/api/libre-draw#reshape-id-line)).

```ts
interface OperationSuccess {
  ok: true;
  created: LibreDrawFeature[];
  updated: LibreDrawFeature[];
  deleted: LibreDrawFeature[];
}

interface OperationFailure {
  ok: false;
  reason: string;
}

type OperationResult = OperationSuccess | OperationFailure;
```

| Property  | Type                                      | Description                                                                                              |
| --------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `ok`      | `boolean`                                 | `true` when the store changed, `false` when the operation was rejected and nothing changed               |
| `created` | [`LibreDrawFeature[]`](#libredrawfeature) | Features added by the operation (empty when none)                                                        |
| `updated` | [`LibreDrawFeature[]`](#libredrawfeature) | Features whose geometry or properties changed, as they are after the change (empty when none)            |
| `deleted` | [`LibreDrawFeature[]`](#libredrawfeature) | Features removed by the operation (empty when none)                                                      |
| `reason`  | `string`                                  | Why the operation was rejected: an operation's failure code (e.g. `'has-holes'`) or a validation message |

All three arrays are always present on success, so a caller can read "what appeared, what changed, what disappeared" without knowing which operation ran. The features in them are deep copies.

```ts
const result = draw.rotate(id, 90);
if (result.ok) {
  result.updated.forEach(save);
} else {
  console.warn(result.reason);
}
```

---

### `AddFeatureResult`

One entry per input feature of [`addFeatures()`](/api/libre-draw#addfeatures-features), in input order.

```ts
type AddFeatureResult = { valid: true; id: string } | { valid: false; id?: string; reason: string };
```

| Property | Type      | Description                                                                                                          |
| -------- | --------- | -------------------------------------------------------------------------------------------------------------------- |
| `valid`  | `boolean` | Whether the feature was added                                                                                        |
| `id`     | `string`  | Valid: the id the feature has in the store (generated when the input had none). Invalid: the input id, if it had one |
| `reason` | `string`  | Invalid only: the rejection message (the same wording `validateFeature` reports)                                     |

---

### `FeatureValidationResult`

Returned by [`validateFeature()`](/api/libre-draw#validatefeature-feature).

```ts
type FeatureValidationResult =
  | { valid: true; feature: LibreDrawFeature }
  | { valid: false; reason: string };
```

| Property  | Type                                    | Description                                                                |
| --------- | --------------------------------------- | -------------------------------------------------------------------------- |
| `valid`   | `boolean`                               | Whether the object would be accepted by `addFeatures()`                    |
| `feature` | [`LibreDrawFeature`](#libredrawfeature) | Valid only: a normalized copy (ids and properties as they would be stored) |
| `reason`  | `string`                                | Invalid only: the rejection message                                        |

---

### `UpdateFeaturePatch`

What [`updateFeature()`](/api/libre-draw#updatefeature-id-patch) replaces on a feature. Each field is a full replacement; omit a field to keep it.

```ts
interface UpdateFeaturePatch {
  geometry?: LibreDrawGeometry;
  properties?: FeatureProperties;
}
```

| Property     | Type                                      | Description                                                     |
| ------------ | ----------------------------------------- | --------------------------------------------------------------- |
| `geometry`   | [`LibreDrawGeometry`](#libredrawgeometry) | New geometry. Must have the same `type` as the current geometry |
| `properties` | [`FeatureProperties`](#featureproperties) | New properties object. Replaces the old one entirely (no merge) |

---

### `UpdateFeatureFailReason`

Failure codes of [`updateFeature()`](/api/libre-draw#updatefeature-id-patch). A geometry that fails validation reports the validation message instead of a code.

```ts
type UpdateFeatureFailReason = 'not-found' | 'geometry-type-mismatch' | 'empty-patch';
```

| Value                      | Meaning                                       |
| -------------------------- | --------------------------------------------- |
| `'not-found'`              | No feature has that id                        |
| `'geometry-type-mismatch'` | The patch would change the geometry type      |
| `'empty-patch'`            | Neither `geometry` nor `properties` was given |

---

### `RotateFailReason`

Failure codes of [`rotate()`](/api/libre-draw#rotate-id-angledeg). A rotated shape that fails validation (it would leave the coordinate range near the antimeridian or the poles) reports the validation message instead of a code.

```ts
type RotateFailReason = 'not-found' | 'not-rotatable' | 'no-rotation';
```

| Value             | Meaning                                                                   |
| ----------------- | ------------------------------------------------------------------------- |
| `'not-found'`     | No feature has that id                                                    |
| `'not-rotatable'` | The feature is a Point                                                    |
| `'no-rotation'`   | The angle is 0, a multiple of 360, or not finite, so nothing would change |

---

### `EdgeRef`

A reference to one edge of a Polygon, used by [`setback()`](/api/libre-draw#setback-id-edge-distancemeters).

```ts
interface EdgeRef {
  ring?: number;
  index: number;
}
```

| Property | Type     | Description                                                                                                                                                                                            |
| -------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ring`   | `number` | Ring index; `0` (the outer ring) when omitted. Setback does not support polygons with holes, so any other value is rejected with `'has-holes'`                                                         |
| `index`  | `number` | Edge index within the ring, counted without the closing position: edge `i` runs from vertex `i` to vertex `i + 1`, and the last edge returns to vertex `0`. Same numbering as `SetbackEvent.edgeIndex` |

---

### `SplitOperationFailReason`

Failure codes of [`split()`](/api/libre-draw#split-id-line). The geometric codes are the [`SplitFailReason`](/api/events#payload-splitfailedevent) values of the `splitfailed` event, which is emitted alongside (a part that fails validation is `'invalid-result'`); the argument errors below emit no event.

```ts
type SplitOperationFailReason = 'not-found' | 'not-splittable' | SplitFailReason;
```

| Value              | Meaning                |
| ------------------ | ---------------------- |
| `'not-found'`      | No feature has that id |
| `'not-splittable'` | The feature is a Point |

---

### `SetbackOperationFailReason`

Failure codes of [`setback()`](/api/libre-draw#setback-id-edge-distancemeters). The geometric codes are the [`SetbackFailReason`](/api/events#payload-setbackfailedevent) values of the `setbackfailed` event, which is emitted alongside; the argument errors below emit no event.

```ts
type SetbackOperationFailReason =
  | 'not-found'
  | 'not-polygon'
  | 'invalid-edge'
  | 'invalid-distance'
  | SetbackFailReason;
```

| Value                | Meaning                                               |
| -------------------- | ----------------------------------------------------- |
| `'not-found'`        | No feature has that id                                |
| `'not-polygon'`      | The feature is not a Polygon                          |
| `'invalid-edge'`     | `edge.index` is not an integer in `[0, vertexCount)`  |
| `'invalid-distance'` | The distance is not a finite number greater than zero |

---

### `UnionOperationFailReason`

Failure codes of [`union()`](/api/libre-draw#union-ids). The geometric codes are the [`UnionFailReason`](/api/events#payload-unionfailedevent) values of the `unionfailed` event, which is emitted alongside; the argument errors below emit no event.

```ts
type UnionOperationFailReason = 'not-found' | 'unsupported-count' | UnionFailReason;
```

| Value                 | Meaning                                      |
| --------------------- | -------------------------------------------- |
| `'not-found'`         | One of the ids has no feature                |
| `'unsupported-count'` | `ids` names fewer than two distinct features |

---

### `CutOperationFailReason`

Failure codes of [`cut()`](/api/libre-draw#cut-id-cutter). The geometric codes are the [`CutFailReason`](/api/events#payload-cutfailedevent) values of the `cutfailed` event, which is emitted alongside; the argument errors below emit no event.

```ts
type CutOperationFailReason = 'not-found' | 'not-polygon' | 'invalid-cutter' | CutFailReason;
```

| Value              | Meaning                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------- |
| `'not-found'`      | No feature has that id                                                                            |
| `'not-polygon'`    | The feature is not a Polygon                                                                      |
| `'invalid-cutter'` | The cutter ring has fewer than three distinct vertices, a non-numeric position, or crosses itself |

---

### `ReshapeOperationFailReason`

Failure codes of [`reshape()`](/api/libre-draw#reshape-id-line). The geometric codes are the [`ReshapeFailReason`](/api/events#payload-reshapefailedevent) values of the `reshapefailed` event, which is emitted alongside; the argument errors below emit no event.

```ts
type ReshapeOperationFailReason = 'not-found' | 'not-polygon' | 'invalid-line' | ReshapeFailReason;
```

| Value            | Meaning                                                     |
| ---------------- | ----------------------------------------------------------- |
| `'not-found'`    | No feature has that id                                      |
| `'not-polygon'`  | The feature is not a Polygon                                |
| `'invalid-line'` | The line has fewer than two positions, or a non-numeric one |

---

## Layer Types

LibreDraw draws through MapLibre layers that read six GeoJSON sources it owns. The look is a list of ordinary MapLibre layer definitions: pass your own as the [`layers`](#libredrawoptions) option or to [`setLayers()`](/api/libre-draw#setlayers-layers), and use MapLibre expressions to style features by their properties or by zoom.

### `LibreDrawLayer`

```ts
type LibreDrawLayer = LayerSpecification; // from maplibre-gl
```

A MapLibre layer definition whose `source` is one of [`SOURCE_IDS`](#source-ids). LibreDraw adds the definitions as given, on top of the map's layers, in array order. It does not check them: MapLibre reports a bad definition (an unknown source, an id already on the map or used twice, a wrong paint property) with its `error` event and leaves that layer out.

### `SOURCE_IDS`

```ts
const SOURCE_IDS: {
  FEATURES: 'libre-draw-features';
  PREVIEW: 'libre-draw-preview';
  EDGE_HIGHLIGHT: 'libre-draw-edge-highlight';
  EDIT_VERTICES: 'libre-draw-edit-vertices';
  SNAP_INDICATOR: 'libre-draw-snap-indicator';
  ROTATION_CENTER: 'libre-draw-rotation-center';
};
```

| Source            | Contents                                            | Properties and state                                                                                                                                                                              |
| ----------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FEATURES`        | Every feature (Point, LineString, Polygon)          | The feature's own properties under their own names, plus `libre-draw:selected` (`true` while selected) and `libre-draw:id`. The feature-state `hover` is `true` on the feature a click would pick |
| `PREVIEW`         | The line of the draft being drawn                   | —                                                                                                                                                                                                 |
| `EDGE_HIGHLIGHT`  | The edge picked in `setback` mode                   | —                                                                                                                                                                                                 |
| `EDIT_VERTICES`   | Vertex and midpoint handles of the selected feature | `libre-draw:handle` (`'vertex'` or `'midpoint'`), `libre-draw:highlighted` (`true` on the handle under the pointer)                                                                               |
| `SNAP_INDICATOR`  | The point a vertex would snap to                    | —                                                                                                                                                                                                 |
| `ROTATION_CENTER` | The pivot of `rotate` mode                          | —                                                                                                                                                                                                 |

Property names starting with `libre-draw:` are reserved for LibreDraw: `libre-draw:id` and `libre-draw:selected` replace feature properties of the same name in the rendered data (the stored feature keeps them). `hover` is a feature-state, so read it with `['feature-state', 'hover']`; MapLibre does not allow feature-state in a `filter`. Hover follows the mouse only (touch has no hover) and is set in the modes that pick a feature by clicking: `select`, `rotate`, `union`, and `split` / `setback` / `cut` / `reshape` while picking the target.

### `DEFAULT_LAYERS`

```ts
const DEFAULT_LAYERS: readonly LibreDrawLayer[];
```

The layers used when the `layers` option is omitted, bottom to top:

| Layer id                     | Type     | Source            | Draws                                                    |
| ---------------------------- | -------- | ----------------- | -------------------------------------------------------- |
| `libre-draw-fill`            | `fill`   | `FEATURES`        | Polygon fill; brighter while selected                    |
| `libre-draw-outline`         | `line`   | `FEATURES`        | Polygon outline                                          |
| `libre-draw-line`            | `line`   | `FEATURES`        | LineStrings; thicker while selected                      |
| `libre-draw-point`           | `circle` | `FEATURES`        | Points; larger while selected, highlighted while hovered |
| `libre-draw-preview`         | `line`   | `PREVIEW`         | Dashed draft line                                        |
| `libre-draw-edge-highlight`  | `line`   | `EDGE_HIGHLIGHT`  | The picked setback edge                                  |
| `libre-draw-edit-midpoints`  | `circle` | `EDIT_VERTICES`   | Midpoint handles                                         |
| `libre-draw-snap-indicator`  | `circle` | `SNAP_INDICATOR`  | Snap target                                              |
| `libre-draw-rotation-center` | `symbol` | `ROTATION_CENTER` | Crosshair at the rotation pivot                          |
| `libre-draw-edit-vertices`   | `circle` | `EDIT_VERTICES`   | Vertex handles                                           |

The array and every definition in it are frozen: copy a definition to change it.

```ts
import { LibreDraw, DEFAULT_LAYERS, SOURCE_IDS } from '@sindicum/libre-draw';

// Color polygons by a property, keep every other default layer.
const draw = new LibreDraw(map, {
  layers: DEFAULT_LAYERS.map((layer) =>
    layer.id === 'libre-draw-fill' && layer.type === 'fill'
      ? {
          ...layer,
          paint: {
            ...layer.paint,
            'fill-color': [
              'case',
              ['boolean', ['get', 'libre-draw:selected'], false],
              '#fbb03b',
              ['coalesce', ['get', 'color'], '#285daa'],
            ],
          },
        }
      : layer
  ),
});
```

The rotation center layer uses the map image `'libre-draw-rotation-center-crosshair'`, which LibreDraw adds to every style it draws on; a replacement layer may use it too.

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

Thrown only for misuse of the instance:

- A method other than `destroy()` is called on a destroyed instance
- [`setMode`](/api/libre-draw#setmode-mode) receives a mode name that does not exist
- The constructor receives a `locale` that is not `'en'` or `'ja'`
- The constructor or [`setInputMethod`](/api/libre-draw#setinputmethod-method) receives an input method that is not `'tap'` or `'reticle'`

Problems with the data you pass (invalid GeoJSON or geometry, a duplicate or unknown id, a line that misses the polygon) are not thrown: they come back in the return value, such as [`OperationResult`](#operationresult) or [`AddFeatureResult`](#addfeatureresult). See [Programmatic API](/guide/programmatic-api#return-values-and-exceptions) for every method.

```ts
import { LibreDrawError, type ModeName } from '@sindicum/libre-draw';

try {
  draw.setMode(userInput as ModeName);
} catch (e) {
  if (e instanceof LibreDrawError) {
    console.error('LibreDraw error:', e.message); // Unknown mode: ...
  }
}
```
