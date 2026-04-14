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

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `map` | `maplibregl.Map` | Yes | The MapLibre GL JS map instance to draw on |
| `options` | [`LibreDrawOptions`](/api/types#libredrawoptions) | No | Configuration options. Defaults to toolbar enabled and 100-action history limit (with built-in default layer style) |

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
      draw: true,
      select: true,
      split: true,
      setback: true,
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
```

---

## Mode Management

### `setMode(mode)`

Set the active drawing mode.

Switching modes deactivates the current mode (clearing any in-progress state) and activates the new mode. A `modechange` event is emitted on every transition.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `mode` | [`ModeName`](/api/types#modename) | `'idle'`, `'draw-point'`, `'draw-line'`, `'draw'`, `'select'`, `'split'`, or `'setback'` |

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

**Returns:** [`ModeName`](/api/types#modename) — `'idle'`, `'draw-point'`, `'draw-line'`, `'draw'`, `'select'`, `'split'`, or `'setback'`.

**Throws:** [`LibreDrawError`](/api/types#libredrawerror) if this instance has been destroyed.

**Example:**

```ts
if (draw.getMode() === 'draw') {
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

Validates the input, clears the current store and history, and re-renders the map. **Undo/redo history is reset** after this call.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
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
        coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]],
      },
      properties: {},
    },
  ],
});
```

---

### `addFeatures(features)`

Add features to the store from an array of GeoJSON Feature objects.

Each feature is validated and added. Unlike [`setFeatures`](#setfeatures-geojson), this does **not** clear existing features or history.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `features` | `unknown[]` | An array of GeoJSON Feature objects with Point, LineString, and/or Polygon geometry |

**Returns:** `void`

**Throws:**
- [`LibreDrawError`](/api/types#libredrawerror) if this instance has been destroyed.
- [`LibreDrawError`](/api/types#libredrawerror) if any feature has invalid geometry.

**Example:**

```ts
draw.addFeatures([
  {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[[0, 0], [5, 0], [5, 5], [0, 5], [0, 0]]],
    },
    properties: { name: 'Zone A' },
  },
]);
```

---

### `getFeatureById(id)`

Get a feature by its ID.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
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

| Name | Type | Description |
|------|------|-------------|
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

### `selectFeature(id)`

Programmatically select a feature by its ID.

Switches to select mode if not already active. The feature must exist in the store.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
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

Returns selected IDs in select mode. In other modes, returns an empty array since selection is cleared on mode transition.

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

Deselects all features, removes vertex handles, and emits a `selectionchange` event. No-op if nothing is selected.

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

| Name | Type | Description |
|------|------|-------------|
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

Reverts the most recent action (`create`, `update`, `delete`, `split`, or `setback`) and updates the map rendering. If a feature is selected and its geometry changes, vertex handles are refreshed.

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

## Events

### `on(type, listener)`

Register an event listener.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `type` | `keyof` [`LibreDrawEventMap`](/api/events) | The event type to listen for |
| `listener` | `(payload) => void` | The callback to invoke when the event fires |

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
draw.on('selectionchange', (e) => console.log('Selected:', e.selectedIds));
draw.on('modechange', (e) => console.log(`${e.previousMode} → ${e.mode}`));
```

---

### `off(type, listener)`

Remove an event listener.

The listener must be the **same function reference** passed to [`on`](#on-type-listener).

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `type` | `keyof` [`LibreDrawEventMap`](/api/events) | The event type to stop listening for |
| `listener` | `(payload) => void` | The callback to remove |

**Returns:** `void`

**Throws:** [`LibreDrawError`](/api/types#libredrawerror) if this instance has been destroyed.

**Example:**

```ts
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
