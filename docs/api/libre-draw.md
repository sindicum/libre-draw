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
```

**Throws:** [`LibreDrawError`](/api/types#libredrawerror) if `options.locale` is not `'en'` or `'ja'`.

---

## Mode Management

### `setMode(mode)`

Set the active drawing mode.

Switching modes deactivates the current mode (clearing any in-progress state) and activates the new mode, emitting a `modechange` event. Passing the mode that is already active is a no-op: nothing is cleared and no event is emitted.

**Parameters:**

| Name   | Type                              | Description                                                                                                                                 |
| ------ | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `mode` | [`ModeName`](/api/types#modename) | `'idle'`, `'draw-point'`, `'draw-line'`, `'draw-polygon'`, `'draw-rectangle'`, `'select'`, `'split'`, `'union'`, `'setback'`, or `'rotate'` |

**Returns:** `void`

**Throws:** [`LibreDrawError`](/api/types#libredrawerror) if this instance has been destroyed.

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

**Returns:** [`ModeName`](/api/types#modename) — `'idle'`, `'draw-point'`, `'draw-line'`, `'draw-polygon'`, `'draw-rectangle'`, `'select'`, `'split'`, `'union'`, `'setback'`, or `'rotate'`.

**Throws:** [`LibreDrawError`](/api/types#libredrawerror) if this instance has been destroyed.

**Example:**

```ts
if (draw.getMode() === 'draw-polygon') {
  console.log('Currently drawing');
}
```

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

Validates the input, clears the current store, history, and selection (vertex handles and previews are removed; a `selectionchange` event fires if something was selected), and re-renders the map. **Undo/redo history is reset** after this call.

**Parameters:**

| Name      | Type      | Description                                                                       |
| --------- | --------- | --------------------------------------------------------------------------------- |
| `geojson` | `unknown` | A GeoJSON FeatureCollection containing Point, LineString, and/or Polygon features |

**Returns:** `void`

**Throws:**

- [`LibreDrawError`](/api/types#libredrawerror) if this instance has been destroyed.
- [`LibreDrawError`](/api/types#libredrawerror) if the input is not a valid FeatureCollection or contains invalid Point, LineString, or Polygon geometries.

**Example:**

```ts
draw.setFeatures({
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
```

---

### `addFeatures(features, options?)`

Add features to the store from an array of GeoJSON Feature objects.

Every feature is validated first. With `strict: true` (the default) one invalid entry makes the call throw and leaves the store untouched; with `strict: false` the invalid entries are reported in the returned array and only the valid ones are added. Either way the added features form a **single undoable step** (one [`undo()`](#undo) removes every feature added by the call), and a `'create'` event fires for each added feature. Unlike [`setFeatures`](#setfeatures-geojson), existing features and history are kept.

**Parameters:**

| Name       | Type                                                  | Description                                                                                                                         |
| ---------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `features` | `unknown[]`                                           | An array of GeoJSON Feature objects with Point, LineString, and/or Polygon geometry. Features without an `id` get a generated UUID. |
| `options`  | [`AddFeaturesOptions`](/api/types#addfeaturesoptions) | Optional. `{ strict }`, default `{ strict: true }`.                                                                                 |

**Returns:** [`AddFeatureResult[]`](/api/types#addfeatureresult) — one entry per input feature, in input order. Valid entries carry the id the feature has in the store; invalid entries carry the rejection `reason` (and the input `id`, if it had one). A duplicate id (already in the store, or repeated within the array) counts as invalid in both modes.

**Throws:**

- [`LibreDrawError`](/api/types#libredrawerror) if this instance has been destroyed.
- [`LibreDrawError`](/api/types#libredrawerror) in strict mode, if any feature has invalid geometry.
- [`LibreDrawError`](/api/types#libredrawerror) in strict mode, if a feature `id` already exists in the store or appears more than once in the array.

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

// Report per-feature problems instead of throwing:
const results = draw.addFeatures(features, { strict: false });
results.forEach((r, i) => {
  if (!r.valid) console.warn(`feature ${i} rejected: ${r.reason}`);
});
```

---

### `validateFeature(feature)`

Check whether an object would be accepted by [`addFeatures`](#addfeatures-features-options) / [`setFeatures`](#setfeatures-geojson), without adding it and without throwing.

Applies the same rules (Feature envelope, geometry type, coordinate ranges, ring closure, self-intersection). Duplicate ids are not checked here because they depend on the store's contents at add time.

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

The change is validated like [`addFeatures`](#addfeatures-features-options) input, recorded as **one undoable step**, and reported with an [`update`](/api/events#update) event (`origin: 'api'`). `properties` is a full replacement, not a merge. A selected feature keeps its selection; vertex handles and the rotation base follow the new shape.

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

### `selectFeature(id)`

Programmatically select a feature by its ID.

Switches to select mode if not already active. The feature must exist in the store.

**Parameters:**

| Name | Type     | Description                                    |
| ---- | -------- | ---------------------------------------------- |
| `id` | `string` | The unique identifier of the feature to select |

**Returns:** `void`

**Throws:**

- [`LibreDrawError`](/api/types#libredrawerror) if this instance has been destroyed.
- [`LibreDrawError`](/api/types#libredrawerror) if no feature with the given ID exists.

**Example:**

```ts
draw.selectFeature('abc-123');
console.log(draw.getSelectedFeatureIds()); // ['abc-123']
console.log(draw.getMode()); // 'select'
```

---

### `getSelectedFeatureIds()`

Get the IDs of currently selected features.

Returns selected IDs in select mode, and the rotation target in rotate mode. In other modes, returns an empty array since selection is cleared on mode transition.

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

Deselects all features, removes vertex handles, and emits a `selectionchange` event. In rotate mode this also discards any uncommitted rotation preview. No-op if nothing is selected.

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

Reverts the most recent action (`create`, `update`, `delete`, `split`, `setback`, `union`, or a `batch` recorded by [`addFeatures`](#addfeatures-features-options)) and updates the map rendering. If a feature is selected and its geometry changes, vertex handles are refreshed.

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

Programmatically control the in-progress draft of the `'draw-polygon'` (polygon), `'draw-line'` (linestring), and `'draw-rectangle'` modes. Useful for implementing custom finish/cancel buttons or showing the current vertex count in a UI.

### `finishDrawing()`

Finalize the in-progress draft of the active drawing mode.

On success, a feature is added to the store, a [`create`](/api/events#create) event fires, and a [`draftchange`](/api/events#draftchange) event with `vertexCount: 0` is emitted. The mode remains active so the user can start a new draft.

**Returns:** `boolean` — `true` if the draft was finalized, `false` if it could not be (non-drawing mode, insufficient vertices, or a polygon whose closing would produce a self-intersection). In `'draw-rectangle'` mode this always returns `false`: the rectangle is only defined once the second corner is clicked.

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

**Returns:** `number` — The draft vertex count for the active drawing mode, or `0` when no drawing mode is active. In `draw-rectangle` mode the count is `1` while the first corner is placed and `0` otherwise.

**Throws:** [`LibreDrawError`](/api/types#libredrawerror) if this instance has been destroyed.

**Example:**

```ts
draw.on('draftchange', () => {
  const count = draw.getDraftVertexCount();
  finishBtn.disabled = count < 3; // polygon requires 3+ vertices
});
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
