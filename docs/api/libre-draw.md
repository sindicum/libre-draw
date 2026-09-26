# LibreDraw Class

The main facade class that provides point, line, and polygon drawing and editing functionality. Create an instance by passing a MapLibre GL JS map.

## Interactive Playground

Try the API methods directly. Use the mode buttons and action buttons to call LibreDraw methods and see the results in the log.

<ApiDemo />

## Constructor

### `new LibreDraw(map, options?)`

Create a new LibreDraw instance attached to a MapLibre GL JS map.

Initializes all internal modules and sets up map integration. The instance is ready to use once the map's style is loaded.

**Parameters:**

| Name      | Type                                              | Required | Description                                                                                                                                                                |
| --------- | ------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `map`     | `maplibregl.Map`                                  | Yes      | The MapLibre GL JS map instance to draw on                                                                                                                                 |
| `options` | [`LibreDrawOptions`](/api/types#libredrawoptions) | No       | Configuration options. Defaults: toolbar enabled, 100-action history limit, built-in layer style, snapping enabled (10 px), keyboard shortcuts enabled, English UI strings |

**Example:**

```ts
import maplibregl from 'maplibre-gl';
import { LibreDraw } from '@sindicum/libre-draw';

const map = new maplibregl.Map({
  container: 'map',
  style: 'https://demotiles.maplibre.org/style.json',
  center: [0, 0],
  zoom: 2,
});

// Default — toolbar enabled, 100 history limit
const draw = new LibreDraw(map);

// With options
const draw = new LibreDraw(map, {
  toolbar: {
    position: 'top-right',
    controls: {
      drawPoint: true,
      drawLine: true,
      drawPolygon: true,
      select: true,
      split: true,
      cut: true,
      union: true,
      setback: true,
      rotate: true,
      settings: true,
      delete: true,
      undo: true,
      redo: true,
    },
  },
  historyLimit: 50,
  style: {
    fill: { color: '#1f78b4', selectedColor: '#e76f51' },
    preview: { dasharray: [4, 1] },
  },
});

// Headless mode (no toolbar)
const draw = new LibreDraw(map, { toolbar: false });

// Keep the toolbar but turn off the undo / redo keyboard shortcuts
const draw = new LibreDraw(map, { keyboard: false });

// Japanese UI strings, with one label overridden
const draw = new LibreDraw(map, { locale: 'ja', messages: { setbackExecute: '適用' } });

// Place points with the center reticle instead of taps
const draw = new LibreDraw(map, { inputMethod: 'reticle' });
```

**Throws:** [`LibreDrawError`](/api/types#libredrawerror) if `options.locale` is not `'en'` or `'ja'`, or if `options.inputMethod` is not `'tap'` or `'reticle'`.

---

## Mode Management

### `setMode(mode)`

Set the active drawing mode.

Switching modes deactivates the current mode (clearing any in-progress state) and activates the new mode, emitting a `modechange` event. Passing the mode that is already active is a no-op: nothing is cleared and no event is emitted.

**Parameters:**

| Name   | Type                              | Description                                                                                                                                                                     |
| ------ | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mode` | [`ModeName`](/api/types#modename) | `'idle'`, `'draw-point'`, `'draw-line'`, `'draw-polygon'`, `'draw-rectangle'`, `'draw-angled-rectangle'`, `'select'`, `'split'`, `'union'`, `'setback'`, `'rotate'`, or `'cut'` |

**Returns:** `void`

**Throws:**

- [`LibreDrawError`](/api/types#libredrawerror) if this instance has been destroyed.
- [`LibreDrawError`](/api/types#libredrawerror) if `mode` is not one of the names above (`Unknown mode: <name>`). The current mode stays active and no `modechange` is emitted.

**Example:**

```ts
draw.setMode('draw-point');

draw.on('modechange', (e) => {
  console.log(`${e.previousMode} → ${e.mode}`);
});
```

---

### `getMode()`

Get the current drawing mode.

**Returns:** [`ModeName`](/api/types#modename) — `'idle'`, `'draw-point'`, `'draw-line'`, `'draw-polygon'`, `'draw-rectangle'`, `'draw-angled-rectangle'`, `'select'`, `'split'`, `'union'`, `'setback'`, `'rotate'`, or `'cut'`.

**Throws:** [`LibreDrawError`](/api/types#libredrawerror) if this instance has been destroyed.

**Example:**

```ts
if (draw.getMode() === 'draw-polygon') {
  console.log('Currently drawing');
}
```

---

## Input Method

### `setInputMethod(method)`

Choose how the drawing modes (`'draw-point'`, `'draw-line'`, `'draw-polygon'`, `'draw-rectangle'`, `'draw-angled-rectangle'`) take a point.

- `'tap'` (default): a click or tap on the map places the point.
- `'reticle'`: while a drawing mode is active, a crosshair is shown at the center of the map and an **Add point** button at the bottom. The map pans freely (also in `'draw-polygon'` / `'draw-line'`), clicks and taps on it place nothing, and the button places a point at the crosshair under the same rules as a tap: snapping applies, and adding on the first or last vertex finishes the polygon or line. The preview and the snap indicator follow the crosshair as the map moves. In `'cut'` mode the target is picked by click or tap, and the crosshair drafts the cutter once a target is selected. Other modes keep working with clicks and taps and show no crosshair.

The setting is kept across mode changes, and changing it while drawing keeps the draft. The toolbar's input method toggle calls the same switch and shows the current method as pressed, also after a call to this method. The crosshair and the action bar (**Undo point**, **Add point**, **Finish**) do not depend on the toolbar, so they are also shown with `toolbar: false`. See [Input methods](/guide/modes#input-methods).

**Parameters:**

| Name     | Type                                    | Description            |
| -------- | --------------------------------------- | ---------------------- |
| `method` | [`InputMethod`](/api/types#inputmethod) | `'tap'` or `'reticle'` |

**Returns:** `void`

**Throws:**

- [`LibreDrawError`](/api/types#libredrawerror) if this instance has been destroyed.
- [`LibreDrawError`](/api/types#libredrawerror) if `method` is not `'tap'` or `'reticle'` (`Unsupported input method: <value>`). The current method stays.

**Example:**

```ts
draw.setInputMethod('reticle');
draw.setMode('draw-polygon');
```

---

### `getInputMethod()`

Get how the drawing modes take a point.

**Returns:** [`InputMethod`](/api/types#inputmethod) — `'tap'` or `'reticle'`.

**Throws:** [`LibreDrawError`](/api/types#libredrawerror) if this instance has been destroyed.

---

## Feature Operations

### `getFeatures()`

Get all features as an array.

Returns a snapshot of all features (points, lines, and polygons) currently in the store.

**Returns:** [`LibreDrawFeature[]`](/api/types#libredrawfeature)

**Throws:** [`LibreDrawError`](/api/types#libredrawerror) if this instance has been destroyed.

**Example:**

```ts
const features = draw.getFeatures();
console.log(`${features.length} features on the map`);
```

---

### `toGeoJSON()`

Export all features as a GeoJSON FeatureCollection.

Returns a standard GeoJSON FeatureCollection containing all features (points, lines, and polygons) currently in the store, suitable for serialization or integration with other GeoJSON-compatible tools.

**Returns:** [`FeatureCollection`](/api/types#featurecollection)

**Throws:** [`LibreDrawError`](/api/types#libredrawerror) if this instance has been destroyed.

**Example:**

```ts
const geojson = draw.toGeoJSON();
console.log(JSON.stringify(geojson));
// { "type": "FeatureCollection", "features": [...] }

// Save to server
fetch('/api/polygons', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(geojson),
});
```

---

### `setFeatures(geojson)`

Replace all features in the store with the given GeoJSON FeatureCollection.

Validates the whole input first (all or nothing), then clears the current store, history, and selection (vertex handles and previews are removed; a `selectionchange` event fires if something was selected), and re-renders the map. **Undo/redo history is reset** after this call. No `create` / `delete` events are emitted for the replaced features: this is a reload, not an edit.

**Parameters:**

| Name      | Type      | Description                                                                       |
| --------- | --------- | --------------------------------------------------------------------------------- |
| `geojson` | `unknown` | A GeoJSON FeatureCollection containing Point, LineString, and/or Polygon features |

**Returns:** [`OperationResult`](/api/types#operationresult) — `{ ok: true, created, updated: [], deleted }` with the new features in `created` and the previous ones in `deleted`, or `{ ok: false, reason }` when the input is not a FeatureCollection or one of its features fails validation (`Invalid feature at index i: …`). Nothing changes on failure.

**Throws:** [`LibreDrawError`](/api/types#libredrawerror) if this instance has been destroyed.

**Example:**

```ts
const result = draw.setFeatures({
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [10, 0],
            [10, 10],
            [0, 10],
            [0, 0],
          ],
        ],
      },
      properties: {},
    },
  ],
});
if (!result.ok) console.warn(result.reason);
```

---

### `addFeatures(features)`

Add features to the store from an array of GeoJSON Feature objects.

Every feature is validated first and reported individually: invalid entries come back as `{ valid: false, reason }` and only the valid ones are added. Nothing is thrown for the input. The added features form a **single undoable step** (one [`undo()`](#undo) removes every feature added by the call), and a `'create'` event fires for each added feature. Unlike [`setFeatures`](#setfeatures-geojson), existing features and history are kept. There is no all-or-nothing option: to get one, check each input with [`validateFeature`](#validatefeature-feature) (geometry) and [`getFeatureById`](#getfeaturebyid-id) (a duplicate id, also against the other inputs) before calling.

**Parameters:**

| Name       | Type        | Description                                                                                                                         |
| ---------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `features` | `unknown[]` | An array of GeoJSON Feature objects with Point, LineString, and/or Polygon geometry. Features without an `id` get a generated UUID. |

**Returns:** [`AddFeatureResult[]`](/api/types#addfeatureresult) — one entry per input feature, in input order. Valid entries carry the id the feature has in the store; invalid entries carry the rejection `reason` (and the input `id`, if it had one). A duplicate id (already in the store, or repeated earlier in the array) counts as invalid; the first occurrence within the array is the one that gets added.

**Throws:** [`LibreDrawError`](/api/types#libredrawerror) if this instance has been destroyed.

**Example:**

```ts
draw.addFeatures([
  {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [5, 0],
          [5, 5],
          [0, 5],
          [0, 0],
        ],
      ],
    },
    properties: { name: 'Zone A' },
  },
]);

draw.undo(); // removes the feature added above

// Per-feature outcomes:
const results = draw.addFeatures(features);
results.forEach((r, i) => {
  if (!r.valid) console.warn(`feature ${i} rejected: ${r.reason}`);
});
```

---

### `validateFeature(feature)`

Check whether an object would be accepted by [`addFeatures`](#addfeatures-features) / [`setFeatures`](#setfeatures-geojson), without adding it and without throwing.

Applies the same rules (Feature envelope, geometry type, coordinate ranges, ring closure, self-intersection, holes inside the outer ring without crossing or nesting). Duplicate ids are not checked here because they depend on the store's contents at add time.

**Parameters:**

| Name      | Type      | Description            |
| --------- | --------- | ---------------------- |
| `feature` | `unknown` | The object to validate |

**Returns:** [`FeatureValidationResult`](/api/types#featurevalidationresult) — `{ valid: true, feature }` with a normalized copy, or `{ valid: false, reason }` with the same message `addFeatures` would throw.

**Throws:** [`LibreDrawError`](/api/types#libredrawerror) if this instance has been destroyed.

**Example:**

```ts
const result = draw.validateFeature(candidate);
if (!result.valid) {
  showError(result.reason);
}
```

---

### `getFeatureById(id)`

Get a feature by its ID.

**Parameters:**

| Name | Type     | Description                          |
| ---- | -------- | ------------------------------------ |
| `id` | `string` | The unique identifier of the feature |

**Returns:** [`LibreDrawFeature`](/api/types#libredrawfeature) `| undefined`

**Throws:** [`LibreDrawError`](/api/types#libredrawerror) if this instance has been destroyed.

**Example:**

```ts
const feature = draw.getFeatureById('abc-123');
if (feature) {
  console.log(feature.geometry.coordinates);
}
```

---

### `deleteFeature(id)`

Delete a feature by its ID.

Removes the feature from the store, records a delete action in the history (making it **undoable**), and emits a `delete` event. If the feature is currently selected, the selection is also cleared.

**Parameters:**

| Name | Type     | Description                                    |
| ---- | -------- | ---------------------------------------------- |
| `id` | `string` | The unique identifier of the feature to delete |

**Returns:** [`LibreDrawFeature`](/api/types#libredrawfeature) `| undefined` — the deleted feature, or `undefined` if not found.

**Throws:** [`LibreDrawError`](/api/types#libredrawerror) if this instance has been destroyed.

**Example:**

```ts
const deleted = draw.deleteFeature('abc-123');
if (deleted) {
  console.log('Deleted:', deleted.id);
  draw.undo(); // restores the deleted feature
}
```

---

## Selection

### `updateFeature(id, patch)`

Replace a feature's geometry and/or properties.

The change is validated like [`addFeatures`](#addfeatures-features) input, recorded as **one undoable step**, and reported with an [`update`](/api/events#update) event (`origin: 'api'`). `properties` is a full replacement, not a merge. A selected feature keeps its selection; vertex handles and the rotation base follow the new shape.

**Parameters:**

| Name    | Type                                                  | Description                                                                          |
| ------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `id`    | `string`                                              | The feature to change                                                                |
| `patch` | [`UpdateFeaturePatch`](/api/types#updatefeaturepatch) | `{ geometry?, properties? }`. Omit a field to keep it; `geometry` must keep its type |

**Returns:** [`OperationResult`](/api/types#operationresult) — `{ ok: true, updated: [feature] }`, or `{ ok: false, reason }` with `'not-found'`, `'geometry-type-mismatch'`, `'empty-patch'`, or the validation message (see [`UpdateFeatureFailReason`](/api/types#updatefeaturefailreason)). Nothing changes on failure.

**Throws:** [`LibreDrawError`](/api/types#libredrawerror) if this instance has been destroyed.

**Example:**

```ts
const result = draw.updateFeature('abc-123', { properties: { crop: 'wheat' } });
if (!result.ok) console.warn(result.reason);

// Move a polygon by rewriting its ring (same geometry type required):
const feature = draw.getFeatureById('abc-123');
if (feature?.geometry.type === 'Polygon') {
  const shifted = feature.geometry.coordinates.map((ring) =>
    ring.map(([lng, lat]) => [lng + 0.001, lat] as [number, number])
  );
  draw.updateFeature('abc-123', { geometry: { type: 'Polygon', coordinates: shifted } });
}
```

---

### `rotate(id, angleDeg)`

Rotate a Polygon or LineString around its area centroid.

Same computation as the [`rotate` mode](/guide/modes#rotate) (screen-space rotation in Web Mercator, positive angles clockwise). Recorded as one undoable step and reported with a [`rotate`](/api/events#rotate) event (`origin: 'api'`); undo and redo report [`update`](/api/events#update). If the feature is selected in rotate mode, the next interactive rotation starts from the new shape.

**Parameters:**

| Name       | Type     | Description                                   |
| ---------- | -------- | --------------------------------------------- |
| `id`       | `string` | The feature to rotate                         |
| `angleDeg` | `number` | Relative angle in degrees, positive clockwise |

**Returns:** [`OperationResult`](/api/types#operationresult) — `{ ok: true, updated: [feature] }`, or `{ ok: false, reason }` with `'not-found'`, `'not-rotatable'` (a Point), `'no-rotation'` (0, a multiple of 360, or a non-finite angle; see [`RotateFailReason`](/api/types#rotatefailreason)), or the validation message when the rotated shape would leave the coordinate range (near the antimeridian or the poles). Nothing changes on failure.

**Throws:** [`LibreDrawError`](/api/types#libredrawerror) if this instance has been destroyed.

**Example:**

```ts
draw.rotate('abc-123', 90);
draw.rotate('abc-123', 90); // stacks: now 180° from the original
draw.undo(); // back to 90°
```

---

### `split(id, line)`

Split a Polygon or LineString along the line through two points.

Same computation as the [`split` mode](/guide/modes#split): a Polygon is cut where the extended line crosses its outer ring exactly twice, a LineString at its first crossing. The two parts get fresh ids and a copy of the original's properties. Recorded as **one undoable step** and reported with a [`split`](/api/events#split) event (`origin: 'api'`); a geometric failure also emits [`splitfailed`](/api/events#splitfailed), as the mode does. If the original is selected, the selection is dropped.

**Parameters:**

| Name   | Type                                              | Description                                          |
| ------ | ------------------------------------------------- | ---------------------------------------------------- |
| `id`   | `string`                                          | The feature to split                                 |
| `line` | `[`[`Position`](/api/types#position)`, Position]` | Two positions `[start, end]` defining the split line |

**Returns:** [`OperationResult`](/api/types#operationresult) — `{ ok: true, created: [a, b], deleted: [original] }`, or `{ ok: false, reason }` with `'not-found'`, `'not-splittable'` (a Point), a [`SplitFailReason`](/api/events#payload-splitfailedevent), or a validation message (see [`SplitOperationFailReason`](/api/types#splitoperationfailreason)). Nothing changes on failure.

**Throws:** [`LibreDrawError`](/api/types#libredrawerror) if this instance has been destroyed.

**Example:**

```ts
const result = draw.split('abc-123', [
  [139.7, 35.65],
  [139.72, 35.67],
]);
if (result.ok) {
  console.log(result.created.map((f) => f.id)); // two new ids
} else {
  console.warn(result.reason); // e.g. 'invalid-intersection-count'
}
```

---

### `setback(id, edge, distanceMeters)`

Move one edge of a Polygon inward by a distance in meters.

Same computation as the [`setback` mode](/guide/modes#setback): the ring is split along the offset line and the band on the edge's side is discarded. The result gets a fresh id and a copy of the original's properties. Recorded as **one undoable step** and reported with a [`setback`](/api/events#setback) event (`origin: 'api'`); a geometric failure also emits [`setbackfailed`](/api/events#setbackfailed), as the mode does. Works without the toolbar: the distance is a parameter, not the input field's value.

**Parameters:**

| Name             | Type                            | Description                                                                                                     |
| ---------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `id`             | `string`                        | The Polygon to set back                                                                                         |
| `edge`           | [`EdgeRef`](/api/types#edgeref) | The edge to move (`{ index }`, counted like `SetbackEvent.edgeIndex`). Only the outer ring is supported for now |
| `distanceMeters` | `number`                        | Offset distance in meters, greater than zero                                                                    |

**Returns:** [`OperationResult`](/api/types#operationresult) — `{ ok: true, created: [result], deleted: [original] }`, or `{ ok: false, reason }` with `'not-found'`, `'not-polygon'`, `'invalid-edge'`, `'invalid-distance'`, `'has-holes'`, or `'invalid-split'` (see [`SetbackOperationFailReason`](/api/types#setbackoperationfailreason)). Nothing changes on failure.

**Throws:** [`LibreDrawError`](/api/types#libredrawerror) if this instance has been destroyed.

**Example:**

```ts
draw.setback('abc-123', { index: 2 }, 10); // edge 2, 10 m inward
draw.undo();
```

---

### `union(ids)`

Merge two or more Polygons into one.

Same computation as the [`union` mode](/guide/modes#union): all polygons are merged at once, the merged polygon gets a fresh id and a copy of the first polygon's properties, and only a single Polygon without holes counts as success. If any polygon does not connect to the others, nothing is merged. Recorded as **one undoable step** and reported with a [`union`](/api/events#union) event (`origin: 'api'`); a geometric failure also emits [`unionfailed`](/api/events#unionfailed), as the mode does.

**Parameters:**

| Name  | Type       | Description                                                                                                   |
| ----- | ---------- | ------------------------------------------------------------------------------------------------------------- |
| `ids` | `string[]` | Two or more distinct feature ids (duplicates are ignored), in the order that decides whose properties survive |

**Returns:** [`OperationResult`](/api/types#operationresult) — `{ ok: true, created: [merged], deleted: [...sources] }`, or `{ ok: false, reason }` with `'unsupported-count'`, `'not-found'`, or a [`UnionFailReason`](/api/events#payload-unionfailedevent) (see [`UnionOperationFailReason`](/api/types#unionoperationfailreason)). Nothing changes on failure.

**Throws:** [`LibreDrawError`](/api/types#libredrawerror) if this instance has been destroyed.

**Example:**

```ts
const result = draw.union(['a', 'b', 'c']);
if (!result.ok) console.warn(result.reason); // e.g. 'disjoint'
```

---

### `cut(id, cutter)`

Cut the area of a ring out of a Polygon.

Same computation as the [`cut` mode](/guide/modes#cut-mode): a cutter inside the polygon makes a hole, one across its boundary makes a notch, and one that cuts it apart leaves several pieces. One remaining piece keeps the polygon's id; several pieces get fresh ids and a copy of its properties each. Existing holes are kept, and grow or merge where the cutter meets them. Recorded as **one undoable step** and reported with a [`cut`](/api/events#cut) event (`origin: 'api'`); a geometric failure also emits [`cutfailed`](/api/events#cutfailed), as the mode does. If the polygon is selected, the selection is dropped when it is replaced.

**Parameters:**

| Name     | Type                                  | Description                                                                                                          |
| -------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `id`     | `string`                              | The Polygon to cut                                                                                                   |
| `cutter` | [`Position`](/api/types#position)`[]` | The ring to cut out. The closing position may be omitted. It needs three distinct vertices and must not cross itself |

**Returns:** [`OperationResult`](/api/types#operationresult) — `{ ok: true, updated: [piece] }` when one piece remains, `{ ok: true, created: [...pieces], deleted: [original] }` when the polygon was cut apart, or `{ ok: false, reason }` with `'not-found'`, `'not-polygon'`, `'invalid-cutter'`, or a [`CutFailReason`](/api/events#payload-cutfailedevent) (see [`CutOperationFailReason`](/api/types#cutoperationfailreason)). Nothing changes on failure.

**Throws:** [`LibreDrawError`](/api/types#libredrawerror) if this instance has been destroyed.

**Example:**

```ts
const result = draw.cut('abc-123', [
  [139.7, 35.66],
  [139.702, 35.66],
  [139.702, 35.662],
  [139.7, 35.662],
]);
if (result.ok) console.log(result.updated[0]?.geometry.coordinates.length); // 2: a hole
```

---

### `selectFeature(id)`

Programmatically select a feature by its ID.

Switches to select mode if not already active. When no feature has that id nothing happens: the mode and the selection stay as they are and no event is emitted.

**Parameters:**

| Name | Type     | Description                                    |
| ---- | -------- | ---------------------------------------------- |
| `id` | `string` | The unique identifier of the feature to select |

**Returns:** `boolean` — `true` if the feature was selected, `false` if no feature has that id.

**Throws:** [`LibreDrawError`](/api/types#libredrawerror) if this instance has been destroyed.

**Example:**

```ts
if (draw.selectFeature('abc-123')) {
  console.log(draw.getSelectedFeatureIds()); // ['abc-123']
  console.log(draw.getMode()); // 'select'
}
```

---

### `selectFeatures(ids)`

Programmatically select several features at once.

Switches to select mode if not already active and replaces the selection with `ids` (duplicates are ignored). Point, LineString and Polygon features can be mixed. With more than one feature selected no vertex handles are shown; a drag moves them all and Delete removes them all, each as one undo step. When `ids` is empty or any id is unknown nothing happens: the mode and the selection stay as they are and no event is emitted.

**Parameters:**

| Name  | Type       | Description                                      |
| ----- | ---------- | ------------------------------------------------ |
| `ids` | `string[]` | The unique identifiers of the features to select |

**Returns:** `boolean` — `true` if the features were selected, `false` if `ids` is empty or contains an id with no feature.

**Throws:** [`LibreDrawError`](/api/types#libredrawerror) if this instance has been destroyed.

**Example:**

```ts
if (draw.selectFeatures(['a', 'b'])) {
  console.log(draw.getSelectedFeatureIds()); // ['a', 'b']
}
```

---

### `getSelectedFeatureIds()`

Get the IDs of currently selected features.

Every mode shares one selection: select mode may hold several features, union the polygons picked for the merge, rotate / split / setback / cut at most their one target, and drawing modes none (switching modes clears the selection). IDs are returned in the order they were selected.

**Returns:** `string[]`

**Throws:** [`LibreDrawError`](/api/types#libredrawerror) if this instance has been destroyed.

**Example:**

```ts
draw.on('selectionchange', (e) => {
  const ids = draw.getSelectedFeatureIds();
  console.log('Selected:', ids);
});
```

---

### `clearSelection()`

Clear the current feature selection.

Deselects all features, removes vertex handles, and emits a `selectionchange` event. In rotate mode this also discards any uncommitted rotation preview, and in split / setback mode the half-finished operation on the target. No-op if nothing is selected.

**Returns:** `void`

**Throws:** [`LibreDrawError`](/api/types#libredrawerror) if this instance has been destroyed.

**Example:**

```ts
draw.selectFeature('abc-123');
draw.clearSelection();
console.log(draw.getSelectedFeatureIds()); // []
```

---

## Style

### `setStyle(style)`

Update the global render style at runtime.

Merges the given partial overrides with the current style and applies changes to all map layers immediately. This affects how all features (polygons, lines, points) and editing handles are displayed.

**Parameters:**

| Name    | Type                                                  | Description                      |
| ------- | ----------------------------------------------------- | -------------------------------- |
| `style` | [`PartialStyleConfig`](/api/types#partialstyleconfig) | Partial style overrides to apply |

**Returns:** `void`

**Throws:** [`LibreDrawError`](/api/types#libredrawerror) if this instance has been destroyed.

**Example:**

```ts
// Change polygon fill color and opacity
draw.setStyle({
  fill: { color: '#ff0000', opacity: 0.5 },
});

// Change multiple style categories at once
draw.setStyle({
  fill: { color: '#1f78b4', selectedColor: '#e76f51' },
  outline: { color: '#1f78b4', width: 3 },
  point: { color: '#e76f51', radius: 8 },
  preview: { color: '#999999', width: 1 },
});
```

---

### `getStyle()`

Get the current global render style.

Returns the full style configuration currently in use, including any overrides applied via the constructor `style` option or [`setStyle`](#setstyle-style).

**Returns:** [`StyleConfig`](/api/types#styleconfig)

**Throws:** [`LibreDrawError`](/api/types#libredrawerror) if this instance has been destroyed.

**Example:**

```ts
const style = draw.getStyle();
console.log('Fill color:', style.fill.color);
console.log('Point radius:', style.point.radius);
```

---

## History

### `undo()`

Undo the last action.

Reverts the most recent action (`create`, `update`, `delete`, `split`, `setback`, `union`, `cut`, or a `batch` recorded by [`addFeatures`](#addfeatures-features)) and updates the map rendering. If a feature is selected and its geometry changes, vertex handles are refreshed.

**Returns:** `boolean` — `true` if an action was undone, `false` if nothing to undo.

**Throws:** [`LibreDrawError`](/api/types#libredrawerror) if this instance has been destroyed.

**Example:**

```ts
if (draw.undo()) {
  console.log('Action undone');
}
```

---

### `redo()`

Redo the last undone action.

Re-applies the most recently undone action. The redo stack is cleared whenever a new action is performed.

**Returns:** `boolean` — `true` if an action was redone, `false` if nothing to redo.

**Throws:** [`LibreDrawError`](/api/types#libredrawerror) if this instance has been destroyed.

**Example:**

```ts
draw.undo();
draw.redo(); // re-applies the undone action
```

---

## Draft Control

Programmatically control the in-progress draft of the `'draw-polygon'` (polygon), `'draw-line'` (linestring), `'draw-rectangle'`, and `'draw-angled-rectangle'` modes, and of the cutter in `'cut'` mode once a target is selected. Useful for implementing custom finish/cancel buttons or showing the current vertex count in a UI.

### `finishDrawing()`

Finalize the in-progress draft of the active drawing mode.

On success, a feature is added to the store, a [`create`](/api/events#create) event fires, and a [`draftchange`](/api/events#draftchange) event with `vertexCount: 0` is emitted. The mode remains active so the user can start a new draft.

In `'cut'` mode, finishing closes the cutter and runs the cut instead of adding a feature: a [`cut`](/api/events#cut) event fires on success, a [`cutfailed`](/api/events#cutfailed) event on failure (the target stays selected and the cutter is discarded either way).

**Returns:** `boolean` — `true` if the draft was finalized (in `'cut'` mode: if the cut succeeded), `false` if it could not be (non-drawing mode, insufficient vertices, or a polygon whose closing would produce a self-intersection). In `'draw-rectangle'` and `'draw-angled-rectangle'` modes this always returns `false`: the rectangle is only defined once its last point (the second corner, or the third point that sets the width) is clicked.

**Throws:** [`LibreDrawError`](/api/types#libredrawerror) if this instance has been destroyed.

**Example:**

```ts
draw.setMode('draw-polygon');
// ... user clicks to add vertices ...
if (draw.finishDrawing()) {
  draw.setMode('idle');
}
```

---

### `cancelDrawing()`

Discard the in-progress draft of the active drawing mode.

Clears the preview, resets the vertex list, and emits a [`draftchange`](/api/events#draftchange) event with `vertexCount: 0`. The mode remains active; call [`setMode`](#setmode-mode) afterwards to exit drawing entirely. In non-drawing modes this is a no-op.

**Returns:** `void`

**Throws:** [`LibreDrawError`](/api/types#libredrawerror) if this instance has been destroyed.

**Example:**

```ts
draw.cancelDrawing(); // discard in-progress polygon / line
```

---

### `getDraftVertexCount()`

Get the number of vertices in the current draft.

**Returns:** `number` — The draft vertex count for the active drawing mode, or `0` when no drawing mode is active. In `draw-rectangle` mode the count is `1` while the first corner is placed and `0` otherwise. In `draw-angled-rectangle` mode it is the number of placed base-edge points (`0`, `1`, or `2`).

**Throws:** [`LibreDrawError`](/api/types#libredrawerror) if this instance has been destroyed.

**Example:**

```ts
draw.on('draftchange', () => {
  const count = draw.getDraftVertexCount();
  finishBtn.disabled = count < 3; // polygon requires 3+ vertices
});
```

---

### `undoLastVertex()`

Take back the last placed point of the in-progress draft, as a touch long press does. The center reticle's **Undo point** button does the same.

- `'draw-polygon'` / `'draw-line'` / `'cut'`: removes the last vertex.
- `'draw-rectangle'`: discards the first corner.
- `'draw-angled-rectangle'`: removes the last base-edge point (`2` → `1` → `0`).

Emits a [`draftchange`](/api/events#draftchange) event when a point was removed. The mode remains active.

**Returns:** `boolean` — `true` if a point was removed, `false` if the draft is empty or no drawing mode with a draft is active.

**Throws:** [`LibreDrawError`](/api/types#libredrawerror) if this instance has been destroyed.

**Example:**

```ts
undoButton.addEventListener('click', () => draw.undoLastVertex());
```

---

## Events

### `on(type, listener)`

Register an event listener.

**Parameters:**

| Name       | Type                                       | Description                                 |
| ---------- | ------------------------------------------ | ------------------------------------------- |
| `type`     | `keyof` [`LibreDrawEventMap`](/api/events) | The event type to listen for                |
| `listener` | `(payload) => void`                        | The callback to invoke when the event fires |

**Returns:** `void`

**Throws:** [`LibreDrawError`](/api/types#libredrawerror) if this instance has been destroyed.

**Example:**

```ts
draw.on('create', (e) => console.log('Created:', e.feature.id));
draw.on('update', (e) => console.log('Updated:', e.feature.id));
draw.on('delete', (e) => console.log('Deleted:', e.feature.id));
draw.on('split', (e) => console.log('Split:', e.originalFeature.id, e.features));
draw.on('splitfailed', (e) => console.log('Split failed:', e.reason, e.featureId));
draw.on('setback', (e) => console.log('Setback:', e.originalFeature.id, e.feature.id));
draw.on('setbackfailed', (e) => console.log('Setback failed:', e.reason, e.featureId));
draw.on('union', (e) =>
  console.log(
    'Union:',
    e.originalFeatures.map((f) => f.id),
    e.feature.id
  )
);
draw.on('unionfailed', (e) => console.log('Union failed:', e.reason, e.featureIds));
draw.on('cut', (e) => console.log('Cut:', e.originalFeature.id, e.features));
draw.on('cutfailed', (e) => console.log('Cut failed:', e.reason, e.featureId));
draw.on('rotate', (e) => console.log('Rotated:', e.feature.id, e.angle));
draw.on('selectionchange', (e) => console.log('Selected:', e.selectedIds));
draw.on('modechange', (e) => console.log(`${e.previousMode} → ${e.mode}`));
draw.on('draftchange', (e) => console.log('Draft vertices:', e.vertexCount));
```

---

### `off(type, listener)`

Remove an event listener.

The listener must be the **same function reference** passed to [`on`](#on-type-listener).

**Parameters:**

| Name       | Type                                       | Description                          |
| ---------- | ------------------------------------------ | ------------------------------------ |
| `type`     | `keyof` [`LibreDrawEventMap`](/api/events) | The event type to stop listening for |
| `listener` | `(payload) => void`                        | The callback to remove               |

**Returns:** `void`

**Throws:** [`LibreDrawError`](/api/types#libredrawerror) if this instance has been destroyed.

**Example:**

```ts
import type { CreateEvent } from '@sindicum/libre-draw';

const handler = (e: CreateEvent) => console.log(e.feature);
draw.on('create', handler);
draw.off('create', handler);
```

---

## Lifecycle

### `destroy()`

Destroy the LibreDraw instance, cleaning up all resources.

Switches to idle mode, removes all map layers/sources, clears the event bus, history, and feature store, and removes the toolbar. After calling `destroy`, all other methods will throw [`LibreDrawError`](/api/types#libredrawerror). Calling `destroy` on an already-destroyed instance is a no-op.

**Returns:** `void`

**Example:**

```ts
draw.destroy();
// draw.getFeatures(); // throws LibreDrawError
```
