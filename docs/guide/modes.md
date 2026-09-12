# Modes

LibreDraw uses a mode-based architecture. Only one mode is active at a time, and each mode defines how user interactions are interpreted.

## Overview

| Mode             | Description                                                        | Activated by                                            |
| ---------------- | ------------------------------------------------------------------ | ------------------------------------------------------- |
| `idle`           | No drawing interaction. Map behaves normally.                      | Default / toolbar                                       |
| `draw-point`     | Click to place a point feature.                                    | Toolbar draw-point button / `setMode('draw-point')`     |
| `draw-line`      | Click to add vertices, click the last vertex to finalize line.     | Toolbar draw-line button / `setMode('draw-line')`       |
| `draw-polygon`   | Click to add vertices, click the first or last vertex to close.    | Toolbar draw-polygon button / `setMode('draw-polygon')` |
| `draw-rectangle` | Click two opposite corners to create a rectangle.                  | Toolbar rectangle button / `setMode('draw-rectangle')`  |
| `select`         | Click to select, drag to edit vertices or move point/line/polygon. | Toolbar select button / `setMode('select')`             |
| `split`          | Split a polygon with a two-point line.                             | Toolbar split button / `setMode('split')`               |
| `union`          | Merge two touching or overlapping polygons into one.               | Toolbar union button / `setMode('union')`               |
| `setback`        | Apply inward edge setback with distance input.                     | Toolbar setback button / `setMode('setback')`           |
| `rotate`         | Rotate a polygon or line by dragging or by entering an angle.      | Toolbar rotate button / `setMode('rotate')`             |

### Try it

Use the buttons below to switch between modes. Place points in **draw-point** mode, draw lines in **draw-line** mode, draw polygons in **draw-polygon** mode, drop rectangles in **draw-rectangle** mode, then switch to **select** mode to edit them or **rotate** mode to turn them.

<ModesDemo />

## Idle Mode

The default mode. No drawing or editing interactions are active. The map behaves normally — pan, zoom, and all standard MapLibre interactions work.

```ts
draw.setMode('idle');
```

## Draw Point Mode

In draw-point mode, you place point features on the map. Each click or tap — a press and release at the same spot — creates a Point feature.

### Mouse Interaction

| Action     | Effect               |
| ---------- | -------------------- |
| Click      | Place a point        |
| Drag       | Pan the map          |
| Escape key | Clear snap indicator |

### Touch Interaction

| Action     | Effect        |
| ---------- | ------------- |
| Tap        | Place a point |
| Drag       | Pan the map   |
| Long press | Nothing       |

### Behavior

- One click = one Point feature (no multi-step workflow)
- Points are placed on release, not on press. A drag is left to the map, so you can pan while drawing — on touch, a one-finger drag is the only way to move the map
- A long press does not place a point
- The mode stays active for continuous placement — you can place multiple points without switching modes
- Snap to existing vertices is supported when enabled, and applies to the position where the point is placed
- Map panning remains enabled during draw-point mode
- Double-click zoom is disabled to prevent accidental zoom

```ts
draw.setMode('draw-point');

draw.on('create', (e) => {
  console.log('New point:', e.feature);
  // Remains in draw-point mode for continuous placement
});
```

## Draw Line Mode

In draw-line mode, you create new LineString features by clicking on the map.

### Mouse Interaction

| Action                | Effect                                 |
| --------------------- | -------------------------------------- |
| Click                 | Add a vertex                           |
| Click the last vertex | Finalize the line (minimum 2 vertices) |
| Escape key            | Cancel the current drawing             |

### Touch Interaction

| Action              | Effect            |
| ------------------- | ----------------- |
| Tap                 | Add a vertex      |
| Tap the last vertex | Finalize the line |
| Long-press          | Undo last vertex  |

### Behavior

- Each placed vertex is marked with a dot, so every click or tap has feedback of its own
- A preview line follows the cursor while drawing (mouse only — touch has no hover)
- Finishing is position-based, not timing-based: clicking or tapping on the last placed vertex finalizes the line. A double-click at a new spot places one vertex and lands on it, so it finalizes too. There is no double-tap timing window to miss
- The finish radius follows the snap threshold (default 10px) and is widened by 12px for touch. Hovering near the last vertex shows the snap indicator on it
- Clicking or tapping the last vertex with only one vertex placed does nothing (no duplicate vertex)
- On mobile you can also finish from your own UI with [`finishDrawing()`](/api/libre-draw#finishdrawing)
- Unlike polygon drawing, the line is **not closed** — it remains an open path
- Minimum 2 vertices are required to finalize
- The mode stays active after finalization for continuous drawing
- Snap to existing vertices and edges is supported when enabled
- Map panning is disabled during draw-line mode to prevent accidental panning
- Double-click zoom is disabled during draw-line mode

```ts
draw.setMode('draw-line');

draw.on('create', (e) => {
  console.log('New line:', e.feature);
  // Remains in draw-line mode for continuous drawing
});
```

## Draw Polygon Mode

In draw-polygon mode, you create new polygons by clicking on the map.

### Mouse Interaction

| Action                         | Effect                                 |
| ------------------------------ | -------------------------------------- |
| Click                          | Add a vertex                           |
| Click the first or last vertex | Close the polygon (minimum 3 vertices) |
| Escape key                     | Cancel the current drawing             |

### Touch Interaction

| Action                       | Effect            |
| ---------------------------- | ----------------- |
| Tap                          | Add a vertex      |
| Tap the first or last vertex | Close the polygon |
| Long-press                   | Undo last vertex  |

### Behavior

- Each placed vertex is marked with a dot, so every click or tap has feedback of its own
- A preview line follows the cursor while drawing (mouse only — touch has no hover)
- A semi-transparent polygon preview shows the current shape
- Closing is position-based, not timing-based: clicking or tapping on the first vertex or on the last placed vertex closes the polygon. A double-click at a new spot places one vertex and lands on it, so it closes too. There is no double-tap timing window to miss
- The finish radius follows the snap threshold (default 10px) and is widened by 12px for touch. Hovering near the first or last vertex shows the snap indicator on it
- Clicking or tapping the first or last vertex with fewer than 3 vertices placed does nothing (no duplicate vertex)
- On mobile you can also finish from your own UI with [`finishDrawing()`](/api/libre-draw#finishdrawing)
- Map panning is disabled during draw-polygon mode
- Double-click zoom is disabled during draw-polygon mode
- Self-intersecting polygons are automatically rejected

```ts
draw.setMode('draw-polygon');

draw.on('create', (e) => {
  console.log('New polygon:', e.feature);
  // Remains in draw-polygon mode for continuous drawing
});
```

## Draw Rectangle Mode

In draw-rectangle mode, you create a rectangular polygon from two opposite corners.

### Mouse Interaction

| Action     | Effect                                                           |
| ---------- | ---------------------------------------------------------------- |
| Click      | Place the first corner                                           |
| Move       | Preview the rectangle spanned by the first corner and the cursor |
| Click      | Place the opposite corner and create the polygon                 |
| Drag       | Pan the map — never places a corner                              |
| Escape key | Discard the first corner                                         |

### Touch Interaction

| Action            | Effect                                           |
| ----------------- | ------------------------------------------------ |
| Tap               | Place the first corner (marked with a dot)       |
| Tap               | Place the opposite corner and create the polygon |
| Drag (one finger) | Pan the map — never places a corner              |
| Long-press        | Discard the first corner                         |

Touch has no hover, so there is no rubber-band preview between the two taps.
The dot on the first corner is the feedback that it has been placed.

### Behavior

- Both corners are placed by a click or tap — a press and release at the same spot. A drag is left to the map, so you can pan while drawing
- The rectangle is aligned to the longitude/latitude axes; use the rotate mode to turn it afterwards
- The result is a regular 4-vertex Polygon feature (no special properties), so it can be edited like any other polygon
- A second corner on the same longitude or latitude as the first (zero width or height) is ignored and the first corner is kept
- Snap to existing vertices and edges applies to both corners when enabled
- The mode stays active after creation for continuous drawing
- Double-click zoom is disabled during draw-rectangle mode; map panning stays enabled
- `finishDrawing()` always returns `false` in this mode — the rectangle is only defined once the second corner is clicked. `cancelDrawing()` discards the first corner and `getDraftVertexCount()` returns `1` while it is placed

```ts
draw.setMode('draw-rectangle');

draw.on('create', (e) => {
  console.log('New rectangle:', e.feature);
  // Remains in draw-rectangle mode for continuous drawing
});
```

## Select Mode

In select mode, you can select existing features (points, lines, and polygons) and edit them.

### Selecting

| Action           | Effect                                                  |
| ---------------- | ------------------------------------------------------- |
| Click on polygon | Select it (shows vertex handles)                        |
| Click near line  | Select it (within 20px threshold, shows vertex handles) |
| Click near point | Select it (within 20px threshold)                       |
| Click outside    | Deselect                                                |
| Delete key       | Delete selected feature                                 |

### Point Editing

When a point is selected:

| Action         | Effect                    |
| -------------- | ------------------------- |
| Drag the point | Move it to a new position |

### Line Editing

When a line is selected, vertex handles appear:

| Action                | Effect                                   |
| --------------------- | ---------------------------------------- |
| Drag a vertex         | Move the vertex                          |
| Drag a midpoint       | Insert a new vertex and drag it          |
| Double-click a vertex | Delete the vertex (minimum 2 maintained) |
| Drag near the line    | Move the entire line                     |

### Vertex Editing

When a polygon is selected, vertex handles appear:

| Action              | Effect                                   |
| ------------------- | ---------------------------------------- |
| Drag a vertex       | Move the vertex                          |
| Drag a midpoint     | Insert a new vertex and drag it          |
| Long-press a vertex | Delete the vertex (minimum 3 maintained) |

### Polygon Dragging

| Action              | Effect                  |
| ------------------- | ----------------------- |
| Drag inside polygon | Move the entire polygon |

### Behavior

- Double-click zoom is disabled during select mode
- Map panning is temporarily disabled during vertex/polygon/line/point drag
- Self-intersection is prevented during polygon editing (not enforced for lines)
- Undo/redo works for all edit operations

```ts
draw.setMode('select');

// Or programmatically select a feature
draw.selectFeature('feature-id');

draw.on('update', (e) => {
  console.log('Polygon edited:', e.feature);
});

draw.on('selectionchange', (e) => {
  console.log('Selection:', e.selectedIds);
});
```

## Split Mode

In split mode, you split one polygon into two polygons.

| Action             | Effect                           |
| ------------------ | -------------------------------- |
| Click on polygon   | Select split target              |
| Click first point  | Set split-line start             |
| Click second point | Execute split                    |
| Escape key         | Cancel current split interaction |

```ts
draw.setMode('split');
draw.on('split', (e) => console.log(e.originalFeature.id, e.features));
draw.on('splitfailed', (e) => console.warn(e.reason));
```

## Union Mode

In union mode, you merge two touching or overlapping polygons into one polygon.

| Action                           | Effect                                     |
| -------------------------------- | ------------------------------------------ |
| Click / tap a polygon            | Select the first polygon                   |
| Click / tap another polygon      | Merge it with the selected polygon         |
| Click / tap the selected polygon | Keep the selection (nothing happens)       |
| Click / tap empty space          | Clear the selection                        |
| Drag                             | Pan the map (the selection is unchanged)   |
| Escape key                       | Clear the selection and stay in union mode |

```ts
draw.setMode('union');
draw.on('union', (e) =>
  console.log(
    e.originalFeatures.map((f) => f.id),
    '->',
    e.feature.id
  )
);
draw.on('unionfailed', (e) => console.warn(e.reason));
```

**Notes:**

- Only polygons can be merged; points and lines are ignored
- The merged polygon gets a new id and inherits the properties of the first selected polygon
- Each union is one undo step. Undoing it restores both source polygons
- The union succeeds only when the result is a single polygon without holes. Polygons that do not touch (`disjoint`), polygons with holes, and merges that would enclose a hole (`has-holes`) emit [`unionfailed`](/api/events#unionfailed) and keep the first polygon selected
- Map panning stays enabled so the second polygon can be off screen when you start

## Setback Mode

In setback mode, you select an edge and apply inward offset by distance.

| Action                 | Effect                |
| ---------------------- | --------------------- |
| Click on polygon       | Select setback target |
| Click edge             | Start preview         |
| Change distance        | Update preview line   |
| Enter / execute button | Apply setback         |
| Escape key             | Cancel and reset      |

```ts
draw.setMode('setback');
draw.on('setback', (e) => console.log(e.edgeIndex, e.distance));
draw.on('setbackfailed', (e) => console.warn(e.reason));
```

## Rotate Mode

In rotate mode, you rotate a polygon or line around its centroid (the area centroid of a polygon, the length-weighted centroid of a line). Points cannot be rotated.

| Action                          | Effect                                                        |
| ------------------------------- | ------------------------------------------------------------- |
| Click / tap a polygon or line   | Select the rotation target and show its pivot marker          |
| Drag on the selected feature    | Rotate it to follow the pointer; release to commit            |
| Shift + drag                    | Snap the rotation to 15° steps                                |
| Change the angle input          | Preview a relative rotation by the entered angle              |
| Enter / execute button          | Commit the entered angle (repeat to rotate again by the same) |
| Escape during a drag            | Restore the shape and keep the selection                      |
| Escape otherwise                | Discard the preview and clear the selection                   |
| Click empty space / drag off it | Clear the selection; dragging off the feature pans the map    |

The angle input next to the rotate button is shown only while a feature is selected. Its value is a relative angle in degrees: positive turns clockwise, negative counter-clockwise, in the range -360 to 360. Angles that leave the shape unchanged (0, ±360) are ignored and never reach the history.

Every committed rotation is one undo step and emits a [`rotate`](/api/events#rotate) event. Undoing or redoing it emits a plain `update` event.

```ts
draw.setMode('rotate');
draw.on('rotate', (e) => console.log(`${e.originalFeature.id} rotated by ${e.angle}°`));
```

**Notes:**

- The rotation is performed in screen (Web Mercator) space, so the shape keeps its on-screen proportions at any latitude
- While a target is selected, a crosshair marks the pivot (the centroid). The pivot does not move when the shape turns, so repeated rotations spin around the same point; the marker is hidden when the selection is cleared
- Vertex snapping is not applied while rotating
- Map panning stays enabled; only a drag that starts on the selected feature is captured

## Mode Transitions

```
                setMode('draw-point')
           ┌─────────────────────────┐
           │                         ▼
           │                   ┌────────────┐
           │                   │ draw-point │
           │                   └────────────┘
           │                         │
           ├─────────────────────────┘
           │   setMode('draw-line')
           ├─────────────────────────┐
           │                         ▼
           │                   ┌────────────┐
           │                   │ draw-line  │
           │                   └────────────┘
           │                         │
           ├─────────────────────────┘
           │    setMode('draw-polygon')
           ├─────────────────────────┐
           │                         ▼
        ┌──────┐               ┌──────────┐
        │ idle │               │   draw   │
        └──────┘               └──────────┘
           ▲                         │
           │     polygon created     │
           └─────────────────────────┘
           │
           │  setMode('draw-rectangle')
           ├─────────────────────────┐
           │                         ▼
           │                   ┌────────────────┐
           │                   │ draw-rectangle │
           │                   └────────────────┘
           │                         │
           ├─────────────────────────┘
           │    setMode('select')
           ├─────────────────────────┐
           │                         ▼
           │                   ┌──────────┐
           │                   │  select  │
           │                   └──────────┘
           │                         │
           ├─────────────────────────┘
           │    setMode('split')
           ├─────────────────────────┐
           │                         ▼
           │                   ┌──────────┐
           │                   │  split   │
           │                   └──────────┘
           │                         │
           ├─────────────────────────┘
           │    setMode('union')
           ├─────────────────────────┐
           │                         ▼
           │                   ┌──────────┐
           │                   │  union   │
           │                   └──────────┘
           │                         │
           ├─────────────────────────┘
           │    setMode('setback')
           ├─────────────────────────┐
           │                         ▼
           │                   ┌──────────┐
           │                   │ setback  │
           │                   └──────────┘
           │                         │
           ├─────────────────────────┘
           │    setMode('rotate')
           ├─────────────────────────┐
           │                         ▼
           │                   ┌──────────┐
           │                   │  rotate  │
           │                   └──────────┘
           │                         │
           └─────────────────────────┘
                  setMode('idle')
```

Every mode transition emits a `modechange` event:

```ts
draw.on('modechange', (e) => {
  console.log(`${e.previousMode} → ${e.mode}`);
});
```
