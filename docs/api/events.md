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
  selectionchange: SelectionChangeEvent;
  modechange: ModeChangeEvent;
}
```

---

## `create`

Emitted when a new feature is created.
In `draw-point` mode this happens on each click/tap. In `draw` mode it happens when the polygon is completed.

### Payload: `CreateEvent`

```ts
interface CreateEvent {
  feature: LibreDrawFeature;
}
```

| Property | Type | Description |
|----------|------|-------------|
| `feature` | [`LibreDrawFeature`](/api/types#libredrawfeature) | The newly created Point or Polygon feature |

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
This includes polygon vertex edits, polygon dragging, and point dragging in select mode.

### Payload: `UpdateEvent`

```ts
interface UpdateEvent {
  feature: LibreDrawFeature;
  oldFeature: LibreDrawFeature;
}
```

| Property | Type | Description |
|----------|------|-------------|
| `feature` | [`LibreDrawFeature`](/api/types#libredrawfeature) | The updated Point or Polygon feature (new state) |
| `oldFeature` | [`LibreDrawFeature`](/api/types#libredrawfeature) | The feature before the update (previous state) |

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

Emitted when a feature is deleted (via toolbar button, Delete key, or `deleteFeature()` API).

### Payload: `DeleteEvent`

```ts
interface DeleteEvent {
  feature: LibreDrawFeature;
}
```

| Property | Type | Description |
|----------|------|-------------|
| `feature` | [`LibreDrawFeature`](/api/types#libredrawfeature) | The deleted Point or Polygon feature |

### Example

```ts
draw.on('delete', (e) => {
  console.log('Feature deleted:', e.feature.id, e.feature.geometry.type);
});
```

---

## `split`

Emitted when a polygon is successfully split into two polygons.

### Payload: `SplitEvent`

```ts
interface SplitEvent {
  originalFeature: LibreDrawFeature;
  features: [LibreDrawFeature, LibreDrawFeature];
}
```

| Property | Type | Description |
|----------|------|-------------|
| `originalFeature` | [`LibreDrawFeature`](/api/types#libredrawfeature) | The source polygon before split |
| `features` | <code>[LibreDrawFeature, LibreDrawFeature]</code> | The two resulting polygons |

### Example

```ts
draw.on('split', (e) => {
  console.log('Split source:', e.originalFeature.id);
  console.log('Result polygons:', e.features.map((f) => f.id));
});
```

---

## `splitfailed`

Emitted when split operation fails.

### Payload: `SplitFailedEvent`

```ts
type SplitFailReason =
  | 'same-points'
  | 'insufficient-vertices'
  | 'has-holes'
  | 'invalid-intersection-count'
  | 'self-intersecting-result';

interface SplitFailedEvent {
  reason: SplitFailReason;
  featureId: string;
}
```

| Property | Type | Description |
|----------|------|-------------|
| `reason` | `SplitFailReason` | Reason of split failure |
| `featureId` | `string` | Target feature ID |

### Example

```ts
draw.on('splitfailed', (e) => {
  console.warn('Split failed:', e.reason, e.featureId);
});
```

---

## `setback`

Emitted when a setback operation succeeds.

### Payload: `SetbackEvent`

```ts
interface SetbackEvent {
  originalFeature: LibreDrawFeature;
  feature: LibreDrawFeature;
  edgeIndex: number;
  distance: number;
}
```

| Property | Type | Description |
|----------|------|-------------|
| `originalFeature` | [`LibreDrawFeature`](/api/types#libredrawfeature) | The source polygon before setback |
| `feature` | [`LibreDrawFeature`](/api/types#libredrawfeature) | Result polygon after setback |
| `edgeIndex` | `number` | Applied edge index |
| `distance` | `number` | Setback distance in meters |

### Example

```ts
draw.on('setback', (e) => {
  console.log('Setback applied:', e.originalFeature.id, '->', e.feature.id);
  console.log('Edge:', e.edgeIndex, 'Distance(m):', e.distance);
});
```

---

## `setbackfailed`

Emitted when setback operation fails.

### Payload: `SetbackFailedEvent`

```ts
type SetbackFailReason = 'has-holes' | 'invalid-split';

interface SetbackFailedEvent {
  reason: SetbackFailReason;
  featureId: string;
}
```

| Property | Type | Description |
|----------|------|-------------|
| `reason` | `SetbackFailReason` | Reason of setback failure |
| `featureId` | `string` | Target feature ID |

### Example

```ts
draw.on('setbackfailed', (e) => {
  console.warn('Setback failed:', e.reason, e.featureId);
});
```

---

## `selectionchange`

Emitted when the set of selected features changes.

### Payload: `SelectionChangeEvent`

```ts
interface SelectionChangeEvent {
  selectedIds: string[];
}
```

| Property | Type | Description |
|----------|------|-------------|
| `selectedIds` | `string[]` | Array of currently selected feature IDs. Empty array when nothing is selected. |

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
  mode: ModeName;
  previousMode: ModeName;
}
```

| Property | Type | Description |
|----------|------|-------------|
| `mode` | [`ModeName`](/api/types#modename) | The new active mode (`'idle'`, `'draw-point'`, `'draw'`, `'select'`, `'split'`, or `'setback'`) |
| `previousMode` | [`ModeName`](/api/types#modename) | The previous mode |

### Example

```ts
draw.on('modechange', (e) => {
  console.log(`${e.previousMode} → ${e.mode}`);

  // Update your UI based on mode
  drawButton.classList.toggle('active', e.mode === 'draw');
  selectButton.classList.toggle('active', e.mode === 'select');
  splitButton.classList.toggle('active', e.mode === 'split');
  setbackButton.classList.toggle('active', e.mode === 'setback');
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
