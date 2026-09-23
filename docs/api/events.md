# Events

LibreDraw emits events during drawing and editing operations. Subscribe and unsubscribe using the [`on`](/api/libre-draw#on-type-listener) and [`off`](/api/libre-draw#off-type-listener) methods.

## Event Map

```ts
interface LibreDrawEventMap {
  create: CreateEvent;
  update: UpdateEvent;
  delete: DeleteEvent;
  split: SplitEvent;
  splitfailed: SplitFailedEvent;
  setback: SetbackEvent;
  setbackfailed: SetbackFailedEvent;
  union: UnionEvent;
  unionfailed: UnionFailedEvent;
  rotate: RotateEvent;
  selectionchange: SelectionChangeEvent;
  modechange: ModeChangeEvent;
  draftchange: DraftChangeEvent;
}
```

## Event origin

Every payload carries an `origin` telling you who caused the change:

```ts
type EventOrigin = 'api' | 'user';
```

| Value    | Meaning                                                                                                                                                                                                                 |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `'api'`  | A public `LibreDraw` method was running: `addFeatures()`, `deleteFeature()`, `setMode()`, `selectFeature()`, `clearSelection()`, `finishDrawing()`, `cancelDrawing()`, `undo()`, `redo()`, … and anything they trigger. |
| `'user'` | Pointer or touch input on the map, a toolbar button (including its Undo / Redo / Delete buttons), or a keyboard shortcut.                                                                                               |

Use it to keep a sync loop from reacting to its own changes:

```ts
draw.on('delete', (e) => {
  if (e.origin === 'api') return; // we did this ourselves, no need to echo it
  api.deleteParcel(e.feature.id);
});
```

The value is decided by the call path, not by the kind of change: the same `delete` is `'api'` from `deleteFeature()` and `'user'` from the Delete key. A public method invoked from inside a `'user'` listener stamps only its own events; the surrounding user-originated events keep `'user'`.

---

## `create`

Emitted when a new feature is created.
In `draw-point` mode this happens on each click/tap. In `draw-line` mode it happens when the line is finalized. In `draw-polygon` mode it happens when the polygon is completed. In `draw-rectangle` mode it happens on the second corner click, and in `draw-angled-rectangle` mode on the third click (the width point).

It also fires once per feature from [`addFeatures()`](/api/libre-draw#addfeatures-features), and from history: redoing a `create` emits it again, and undoing a `delete`, `split`, `setback`, or `union` emits `create` for every feature that comes back.

### Payload: `CreateEvent`

```ts
interface CreateEvent {
  origin: EventOrigin;
  feature: LibreDrawFeature;
}
```

| Property  | Type                                              | Description                                             |
| --------- | ------------------------------------------------- | ------------------------------------------------------- |
| `origin`  | [`EventOrigin`](#event-origin)                    | Who caused the change: `'api'` or `'user'`              |
| `feature` | [`LibreDrawFeature`](/api/types#libredrawfeature) | The newly created Point, LineString, or Polygon feature |

### Example

```ts
draw.on('create', (e) => {
  console.log('New feature:', e.feature.id, e.feature.geometry.type);

  if (e.feature.geometry.type === 'Polygon') {
    console.log('Vertices:', e.feature.geometry.coordinates[0].length - 1);
  }
});
```

---

## `update`

Emitted when an existing feature is modified.
This includes vertex edits and dragging of polygons and lines, and point dragging in select mode. Undo and redo of any `update` (including rotations, see [`rotate`](#rotate)) emit it as well, with `feature` / `oldFeature` describing the direction of the change.

### Payload: `UpdateEvent`

```ts
interface UpdateEvent {
  origin: EventOrigin;
  feature: LibreDrawFeature;
  oldFeature: LibreDrawFeature;
}
```

| Property     | Type                                              | Description                                                   |
| ------------ | ------------------------------------------------- | ------------------------------------------------------------- |
| `origin`     | [`EventOrigin`](#event-origin)                    | Who caused the change: `'api'` or `'user'`                    |
| `feature`    | [`LibreDrawFeature`](/api/types#libredrawfeature) | The updated Point, LineString, or Polygon feature (new state) |
| `oldFeature` | [`LibreDrawFeature`](/api/types#libredrawfeature) | The feature before the update (previous state)                |

### Example

```ts
draw.on('update', (e) => {
  console.log('Feature updated:', e.feature.id, e.feature.geometry.type);
  console.log('Old coordinates:', e.oldFeature.geometry.coordinates);
  console.log('New coordinates:', e.feature.geometry.coordinates);
});
```

---

## `delete`

Emitted when a feature is deleted (via toolbar button, Delete key, or `deleteFeature()` API). History emits it too: undoing a `create` (or a batch from `addFeatures()`, children in reverse order), undoing a `split` (two deletes), `setback`, or `union`, and redoing a `delete` or a `split` (the original polygon is deleted before `split` fires again).

### Payload: `DeleteEvent`

```ts
interface DeleteEvent {
  origin: EventOrigin;
  feature: LibreDrawFeature;
}
```

| Property  | Type                                              | Description                                       |
| --------- | ------------------------------------------------- | ------------------------------------------------- |
| `origin`  | [`EventOrigin`](#event-origin)                    | Who caused the change: `'api'` or `'user'`        |
| `feature` | [`LibreDrawFeature`](/api/types#libredrawfeature) | The deleted Point, LineString, or Polygon feature |

### Example

```ts
draw.on('delete', (e) => {
  console.log('Feature deleted:', e.feature.id, e.feature.geometry.type);
});
```

---

## `split`

Emitted when a polygon or line is successfully split into two, in `split` mode or through [`split()`](/api/libre-draw#split-id-line) (`origin` tells which). Undoing a split emits a [`delete`](#delete) for each half and a [`create`](#create) for the original; redoing it emits a `delete` for the original followed by `split` again.

### Payload: `SplitEvent`

```ts
interface SplitEvent {
  origin: EventOrigin;
  originalFeature: LibreDrawFeature;
  features: [LibreDrawFeature, LibreDrawFeature];
}
```

| Property          | Type                                              | Description                                |
| ----------------- | ------------------------------------------------- | ------------------------------------------ |
| `origin`          | [`EventOrigin`](#event-origin)                    | Who caused the change: `'api'` or `'user'` |
| `originalFeature` | [`LibreDrawFeature`](/api/types#libredrawfeature) | The source polygon before split            |
| `features`        | <code>[LibreDrawFeature, LibreDrawFeature]</code> | The two resulting polygons                 |

### Example

```ts
draw.on('split', (e) => {
  console.log('Split source:', e.originalFeature.id);
  console.log(
    'Result polygons:',
    e.features.map((f) => f.id)
  );
});
```

---

## `splitfailed`

Emitted when a split fails for a geometric reason, in `split` mode or through [`split()`](/api/libre-draw#split-id-line). Argument errors of the API (`'not-found'`, `'not-splittable'`) are only returned, not emitted. `'invalid-result'` means a part failed validation, which only happens by rounding at the coordinate limits.

### Payload: `SplitFailedEvent`

```ts
type SplitFailReason =
  | 'same-points'
  | 'insufficient-vertices'
  | 'has-holes'
  | 'invalid-intersection-count'
  | 'self-intersecting-result'
  | 'invalid-result';

interface SplitFailedEvent {
  origin: EventOrigin;
  reason: SplitFailReason;
  featureId: string;
}
```

| Property    | Type                           | Description                                |
| ----------- | ------------------------------ | ------------------------------------------ |
| `origin`    | [`EventOrigin`](#event-origin) | Who caused the change: `'api'` or `'user'` |
| `reason`    | `SplitFailReason`              | Reason of split failure                    |
| `featureId` | `string`                       | Target feature ID                          |

### Example

```ts
draw.on('splitfailed', (e) => {
  console.warn('Split failed:', e.reason, e.featureId);
});
```

---

## `setback`

Emitted when a setback succeeds, in `setback` mode or through [`setback()`](/api/libre-draw#setback-id-edge-distancemeters). Undoing it emits a [`delete`](#delete) for the result and a [`create`](#create) for the original; redoing it emits `setback` again.

### Payload: `SetbackEvent`

```ts
interface SetbackEvent {
  origin: EventOrigin;
  originalFeature: LibreDrawFeature;
  feature: LibreDrawFeature;
  edgeIndex: number;
  distance: number;
}
```

| Property          | Type                                              | Description                                |
| ----------------- | ------------------------------------------------- | ------------------------------------------ |
| `origin`          | [`EventOrigin`](#event-origin)                    | Who caused the change: `'api'` or `'user'` |
| `originalFeature` | [`LibreDrawFeature`](/api/types#libredrawfeature) | The source polygon before setback          |
| `feature`         | [`LibreDrawFeature`](/api/types#libredrawfeature) | Result polygon after setback               |
| `edgeIndex`       | `number`                                          | Applied edge index                         |
| `distance`        | `number`                                          | Setback distance in meters                 |

### Example

```ts
draw.on('setback', (e) => {
  console.log('Setback applied:', e.originalFeature.id, '->', e.feature.id);
  console.log('Edge:', e.edgeIndex, 'Distance(m):', e.distance);
});
```

---

## `setbackfailed`

Emitted when a setback fails for a geometric reason, in `setback` mode or through [`setback()`](/api/libre-draw#setback-id-edge-distancemeters). Argument errors of the API (`'not-found'`, `'not-polygon'`, `'invalid-edge'`, `'invalid-distance'`) are only returned, not emitted.

### Payload: `SetbackFailedEvent`

```ts
type SetbackFailReason = 'has-holes' | 'invalid-split';

interface SetbackFailedEvent {
  origin: EventOrigin;
  reason: SetbackFailReason;
  featureId: string;
}
```

| Property    | Type                           | Description                                |
| ----------- | ------------------------------ | ------------------------------------------ |
| `origin`    | [`EventOrigin`](#event-origin) | Who caused the change: `'api'` or `'user'` |
| `reason`    | `SetbackFailReason`            | Reason of setback failure                  |
| `featureId` | `string`                       | Target feature ID                          |

### Example

```ts
draw.on('setbackfailed', (e) => {
  console.warn('Setback failed:', e.reason, e.featureId);
});
```

---

## `union`

Emitted when two polygons are merged into one, in `union` mode or through [`union()`](/api/libre-draw#union-ids). The merge is one history step: undoing it emits a [`delete`](#delete) for the merged polygon and a [`create`](#create) for each source polygon, and redoing it emits `union` again.

### Payload: `UnionEvent`

```ts
interface UnionEvent {
  origin: EventOrigin;
  originalFeatures: [LibreDrawFeature, LibreDrawFeature];
  feature: LibreDrawFeature;
}
```

| Property           | Type                                              | Description                                                                |
| ------------------ | ------------------------------------------------- | -------------------------------------------------------------------------- |
| `origin`           | [`EventOrigin`](#event-origin)                    | Who caused the change: `'api'` or `'user'`                                 |
| `originalFeatures` | <code>[LibreDrawFeature, LibreDrawFeature]</code> | The two source polygons in selection order                                 |
| `feature`          | [`LibreDrawFeature`](/api/types#libredrawfeature) | The merged polygon. It has a new id and the properties of the first source |

### Example

```ts
draw.on('union', (e) => {
  console.log(
    'Merged:',
    e.originalFeatures.map((f) => f.id),
    '->',
    e.feature.id
  );
});
```

---

## `unionfailed`

Emitted when a union fails for a geometric reason, in `union` mode or through [`union()`](/api/libre-draw#union-ids). The store is left untouched; in the mode the first polygon stays selected so another partner can be picked. Argument errors of the API (`'not-found'`, `'unsupported-count'`) are only returned, not emitted.

### Payload: `UnionFailedEvent`

```ts
type UnionFailReason = 'not-polygon' | 'has-holes' | 'disjoint' | 'invalid-result';

interface UnionFailedEvent {
  origin: EventOrigin;
  reason: UnionFailReason;
  featureIds: [string, string];
}
```

| Property     | Type                           | Description                                       |
| ------------ | ------------------------------ | ------------------------------------------------- |
| `origin`     | [`EventOrigin`](#event-origin) | Who caused the change: `'api'` or `'user'`        |
| `reason`     | `UnionFailReason`              | Reason of union failure                           |
| `featureIds` | `[string, string]`             | IDs of the two target polygons in selection order |

| Reason             | Meaning                                                          |
| ------------------ | ---------------------------------------------------------------- |
| `'disjoint'`       | The polygons do not touch, so the result would be a MultiPolygon |
| `'has-holes'`      | A target has a hole, or the merged outline would enclose a hole  |
| `'not-polygon'`    | A target is not a Polygon                                        |
| `'invalid-result'` | The geometry engine could not produce a usable polygon           |

### Example

```ts
draw.on('unionfailed', (e) => {
  console.warn('Union failed:', e.reason, e.featureIds);
});
```

---

## `rotate`

Emitted when a rotation is committed in `rotate` mode, either by releasing a drag or by executing the angle input. Each commit is one history step.

Undo and redo of a rotation emit [`update`](#update) events rather than `rotate`, because the history stores a rotation as a plain feature replacement.

### Payload: `RotateEvent`

```ts
interface RotateEvent {
  origin: EventOrigin;
  originalFeature: LibreDrawFeature;
  feature: LibreDrawFeature;
  angle: number;
}
```

| Property          | Type                                              | Description                                                   |
| ----------------- | ------------------------------------------------- | ------------------------------------------------------------- |
| `origin`          | [`EventOrigin`](#event-origin)                    | Who caused the change: `'api'` or `'user'`                    |
| `originalFeature` | [`LibreDrawFeature`](/api/types#libredrawfeature) | The feature before this rotation                              |
| `feature`         | [`LibreDrawFeature`](/api/types#libredrawfeature) | The feature after this rotation                               |
| `angle`           | `number`                                          | Angle applied by this step in degrees, positive for clockwise |

### Example

```ts
draw.on('rotate', (e) => {
  console.log(`${e.originalFeature.id} rotated by ${e.angle}°`);
});
```

---

## `selectionchange`

Emitted when the set of selected features changes.

### Payload: `SelectionChangeEvent`

```ts
interface SelectionChangeEvent {
  origin: EventOrigin;
  selectedIds: string[];
}
```

| Property      | Type                           | Description                                                                    |
| ------------- | ------------------------------ | ------------------------------------------------------------------------------ |
| `origin`      | [`EventOrigin`](#event-origin) | Who caused the change: `'api'` or `'user'`                                     |
| `selectedIds` | `string[]`                     | Array of currently selected feature IDs. Empty array when nothing is selected. |

### Example

```ts
draw.on('selectionchange', (e) => {
  if (e.selectedIds.length > 0) {
    console.log('Selected:', e.selectedIds);
    // Enable delete button in your UI
    deleteButton.disabled = false;
  } else {
    console.log('Selection cleared');
    deleteButton.disabled = true;
  }
});
```

---

## `modechange`

Emitted when the active mode changes.

### Payload: `ModeChangeEvent`

```ts
interface ModeChangeEvent {
  origin: EventOrigin;
  mode: ModeName;
  previousMode: ModeName;
}
```

| Property       | Type                              | Description                                                                                                                                                                                  |
| -------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `origin`       | [`EventOrigin`](#event-origin)    | Who caused the change: `'api'` or `'user'`                                                                                                                                                   |
| `mode`         | [`ModeName`](/api/types#modename) | The new active mode (`'idle'`, `'draw-point'`, `'draw-line'`, `'draw-polygon'`, `'draw-rectangle'`, `'draw-angled-rectangle'`, `'select'`, `'split'`, `'setback'`, `'union'`, or `'rotate'`) |
| `previousMode` | [`ModeName`](/api/types#modename) | The previous mode                                                                                                                                                                            |

### Example

```ts
draw.on('modechange', (e) => {
  console.log(`${e.previousMode} → ${e.mode}`);

  // Update your UI based on mode
  drawButton.classList.toggle('active', e.mode === 'draw-polygon');
  selectButton.classList.toggle('active', e.mode === 'select');
  splitButton.classList.toggle('active', e.mode === 'split');
  setbackButton.classList.toggle('active', e.mode === 'setback');
});
```

---

## `draftchange`

Emitted whenever the in-progress draft of a drawing mode (`'draw-polygon'`, `'draw-line'`, `'draw-rectangle'`, or `'draw-angled-rectangle'`) changes.

Fires when:

1. A vertex is added by a click or tap (pointer down and up without dragging)
2. A vertex is removed (long-press)
3. The draft is finalized — via a click or tap on the first (polygon only) or last draft vertex, or [`finishDrawing()`](/api/libre-draw#finishdrawing) — with `vertexCount: 0`
4. The draft is discarded — via Escape or [`cancelDrawing()`](/api/libre-draw#canceldrawing) — with `vertexCount: 0`
5. The active mode transitions away from a drawing mode (deactivation), with `vertexCount: 0`

In `'draw-rectangle'` mode the draft holds at most the first corner: `vertexCount` is `1` after the first click and returns to `0` when the second corner creates the polygon or the corner is discarded.

In `'draw-angled-rectangle'` mode the draft holds the base edge: `vertexCount` is `1` and then `2` as its two points are placed, drops by one on a long press, and returns to `0` when the third click creates the polygon or the draft is discarded.

### Payload: `DraftChangeEvent`

```ts
interface DraftChangeEvent {
  origin: EventOrigin;
  vertexCount: number;
}
```

| Property      | Type                           | Description                                                                                      |
| ------------- | ------------------------------ | ------------------------------------------------------------------------------------------------ |
| `origin`      | [`EventOrigin`](#event-origin) | Who caused the change: `'api'` or `'user'`                                                       |
| `vertexCount` | `number`                       | The number of vertices in the current draft (`0` after finalization, cancellation, or mode exit) |

### Example

```ts
draw.on('draftchange', (e) => {
  // Enable a finish button once the polygon has enough vertices
  finishBtn.disabled = e.vertexCount < 3;
  vertexCountLabel.textContent = `Vertices: ${e.vertexCount}`;
});
```

---

## Removing Listeners

Use [`off`](/api/libre-draw#off-type-listener) with the same function reference to remove a listener:

```ts
const onCreateHandler = (e: CreateEvent) => {
  console.log(e.feature);
};

// Subscribe
draw.on('create', onCreateHandler);

// Unsubscribe
draw.off('create', onCreateHandler);
```

::: warning
Arrow functions defined inline cannot be removed. Always store a reference:

```ts
// This CANNOT be removed later
draw.on('create', (e) => console.log(e));

// This CAN be removed later
const handler = (e: CreateEvent) => console.log(e);
draw.on('create', handler);
draw.off('create', handler);
```

:::
