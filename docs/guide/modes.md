# Modes

LibreDraw uses a mode-based architecture. Only one mode is active at a time, and each mode defines how user interactions are interpreted.

## Overview

| Mode                    | Description                                                                | Activated by                                                         |
| ----------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `idle`                  | No drawing interaction. Map behaves normally.                              | Default / toolbar                                                    |
| `draw-point`            | Click to place a point feature.                                            | Toolbar draw-point button / `setMode('draw-point')`                  |
| `draw-line`             | Click to add vertices, click the last vertex to finalize line.             | Toolbar draw-line button / `setMode('draw-line')`                    |
| `draw-polygon`          | Click to add vertices, click the first or last vertex to close.            | Toolbar draw-polygon button / `setMode('draw-polygon')`              |
| `draw-rectangle`        | Click two opposite corners to create a rectangle.                          | Toolbar rectangle button / `setMode('draw-rectangle')`               |
| `draw-angled-rectangle` | Click a base edge, then a width point, to create a rectangle at any angle. | Toolbar angled rectangle button / `setMode('draw-angled-rectangle')` |
| `select`                | Click to select, drag to edit vertices or move point/line/polygon.         | Toolbar select button / `setMode('select')`                          |
| `split`                 | Split a polygon with a two-point line.                                     | Toolbar split button / `setMode('split')`                            |
| `cut`                   | Cut an area out of a polygon by drawing its outline.                       | Toolbar cut button / `setMode('cut')`                                |
| `union`                 | Merge two or more touching or overlapping polygons into one.               | Toolbar union button / `setMode('union')`                            |
| `setback`               | Apply inward edge setback with distance input.                             | Toolbar setback button / `setMode('setback')`                        |
| `rotate`                | Rotate a polygon or line by dragging or by entering an angle.              | Toolbar rotate button / `setMode('rotate')`                          |

### Try it

Use the buttons below to switch between modes. Place points in **draw-point** mode, draw lines in **draw-line** mode, draw polygons in **draw-polygon** mode, drop rectangles in **draw-rectangle** or **draw-angled-rectangle** mode, then switch to **select** mode to edit them or **rotate** mode to turn them.

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

## Draw Angled Rectangle Mode

In draw-angled-rectangle mode, you create a rectangle at any angle from three points: two along one side (the base edge), then one that sets the width. Use it to draw a plot along a road or an existing boundary in one go, without rotating an axis-aligned rectangle afterwards.

### Mouse Interaction

| Action     | Effect                                                                     |
| ---------- | -------------------------------------------------------------------------- |
| Click      | Place the first point of the base edge                                     |
| Move       | Preview the base edge to the cursor                                        |
| Click      | Place the second point of the base edge                                    |
| Move       | Preview the rectangle; its width follows the cursor's distance to the edge |
| Click      | Create the polygon                                                         |
| Drag       | Pan the map — never places a point                                         |
| Escape key | Discard the whole draft                                                    |

### Touch Interaction

| Action            | Effect                                                     |
| ----------------- | ---------------------------------------------------------- |
| Tap               | Place the first point of the base edge (marked with a dot) |
| Tap               | Place the second point; the base edge is drawn             |
| Tap               | Set the width and create the polygon                       |
| Drag (one finger) | Pan the map — never places a point                         |
| Long-press        | Remove the last placed point                               |

Touch has no hover, so the rectangle is not previewed before the third tap.

### Behavior

- The first two points are one side of the rectangle, at any angle. The third point only sets the width: the rectangle extends from the base edge towards it by its perpendicular distance to the base line, so its far corners are generally not at the third point
- Right angles are computed in Web Mercator, so the rectangle looks rectangular on the map at any latitude and bearing
- The result is a regular 4-vertex Polygon feature (no special properties), so it can be edited like any other polygon
- A second point on top of the first, or a third point on the base line (zero width), is ignored and the draft is kept
- Snap to existing vertices and edges applies to the first two points when enabled. The third point is never snapped, because it does not become a corner
- The mode stays active after creation for continuous drawing
- Double-click zoom is disabled during draw-angled-rectangle mode; map panning stays enabled
- `finishDrawing()` always returns `false` in this mode — only the third click creates the rectangle. `cancelDrawing()` discards the whole draft and `getDraftVertexCount()` returns the number of placed base-edge points (`0`, `1`, or `2`)

```ts
draw.setMode('draw-angled-rectangle');

draw.on('create', (e) => {
  console.log('New angled rectangle:', e.feature);
  // Remains in draw-angled-rectangle mode for continuous drawing
});
```

## Select Mode

In select mode, you can select existing features (points, lines, and polygons) and edit them.

### Selecting

| Action                                  | Effect                                                    |
| --------------------------------------- | --------------------------------------------------------- |
| Click on polygon                        | Select it (shows vertex handles)                          |
| Click near line                         | Select it (within 20px threshold, shows vertex handles)   |
| Click near point                        | Select it (within 20px threshold)                         |
| Shift / Ctrl / Cmd + click on a feature | Add it to the selection, or remove it if already selected |
| Click outside                           | Deselect                                                  |
| Delete key                              | Delete every selected feature                             |

### Multiple Selection

Shift, Ctrl, or Cmd + click builds a selection of several features; points, lines, and polygons can be mixed. `selectFeatures(ids)` does the same from code. While more than one feature is selected:

| Action                      | Effect                                                                 |
| --------------------------- | ---------------------------------------------------------------------- |
| Drag any selected feature   | Move all of them by the same offset (one undo step, one `update` each) |
| Delete key / toolbar delete | Delete all of them (one undo step, one `delete` each)                  |
| Click an unselected feature | Select only that feature                                               |

Vertex and midpoint handles are shown only while exactly one feature is selected. On touch devices there is no modifier key, so a tap always selects a single feature; use `selectFeatures(ids)` to select several.

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

A polygon with holes shows handles on every ring, and a hole's vertices are moved, inserted, and deleted the same way as the outer ring's. The minimum of 3 vertices applies to each ring. Clicking inside a hole does not hit the polygon.

### Polygon Dragging

| Action              | Effect                                  |
| ------------------- | --------------------------------------- |
| Drag inside polygon | Move the entire polygon, holes included |

### Behavior

- Double-click zoom is disabled during select mode
- MapLibre's box zoom (Shift + drag) is disabled during select mode, so a Shift + click never zooms the map. It is restored to the map's own setting when you leave the mode
- Map panning is temporarily disabled during vertex/polygon/line/point drag
- A polygon edit is refused if a ring would cross itself or another ring, or a hole would leave the outer ring (not enforced for lines)
- Undo/redo works for all edit operations

```ts
draw.setMode('select');

// Or programmatically select one feature, or several
draw.selectFeature('feature-id');
draw.selectFeatures(['feature-a', 'feature-b']);

draw.on('update', (e) => {
  console.log('Polygon edited:', e.feature);
});

draw.on('selectionchange', (e) => {
  console.log('Selection:', e.selectedIds);
});
```

## Split Mode

In split mode, you split one polygon into two polygons.

| Action             | Effect                                                  |
| ------------------ | ------------------------------------------------------- |
| Click on polygon   | Select split target                                     |
| Click first point  | Set split-line start (marked with a dot, also on touch) |
| Click second point | Execute split                                           |
| Escape key         | Cancel current split interaction                        |

```ts
draw.setMode('split');
draw.on('split', (e) => console.log(e.originalFeature.id, e.features));
draw.on('splitfailed', (e) => console.warn(e.reason));
```

## Cut Mode

In cut mode, you remove an area from a polygon: tap the polygon, then draw the outline of the area to remove, the same way as in draw-polygon mode.

| Action                         | Effect                                               |
| ------------------------------ | ---------------------------------------------------- |
| Click on polygon               | Select the cut target (inside a hole does not count) |
| Click                          | Add a vertex of the cutter                           |
| Click the first or last vertex | Close the cutter and cut                             |
| Long-press (touch)             | Take back the last cutter vertex                     |
| Escape key                     | Discard the cutter and the target                    |

The result depends on where the cutter lies:

| Cutter                       | Result                                                                       |
| ---------------------------- | ---------------------------------------------------------------------------- |
| Inside the polygon           | The polygon gets a hole. It keeps its id                                     |
| Across its boundary          | The outer ring gets a notch. It keeps its id                                 |
| Across it, cutting it apart  | One new polygon per piece, each with a fresh id and a copy of the properties |
| Covering it                  | Nothing changes; `cutfailed` with `'empty-result'`                           |
| Outside it, or inside a hole | Nothing changes; `cutfailed` with `'no-overlap'`                             |

```ts
draw.setMode('cut');
draw.on('cut', (e) => console.log(e.originalFeature.id, e.features));
draw.on('cutfailed', (e) => console.warn(e.reason));
```

### Behavior

- Snapping, the finish radius, and the rules against a self-crossing outline are those of draw-polygon mode
- After a successful cut the target is deselected and the mode waits for the next target. After a failed cut the target stays selected and only the outline is discarded, so you can draw another one
- `finishDrawing()`, `cancelDrawing()`, `getDraftVertexCount()`, `undoLastVertex()` and `draftchange` work on the cutter once a target is selected. `cancelDrawing()` keeps the target
- Existing holes are kept. A cutter that overlaps a hole makes it larger, and one that bridges two holes merges them
- Each cut is one undo step, and redo reports a `cut` event again

## Union Mode

In union mode, you select two or more touching or overlapping polygons and merge them into one polygon.

| Action                         | Effect                                                          |
| ------------------------------ | --------------------------------------------------------------- |
| Click / tap a polygon          | Add it to the selection (no modifier key needed, also on touch) |
| Click / tap a selected polygon | Remove it from the selection                                    |
| Click / tap empty space        | Clear the selection                                             |
| Enter / execute button         | Merge the selected polygons (needs at least two)                |
| Drag                           | Pan the map (the selection is unchanged)                        |
| Escape key                     | Clear the selection and stay in union mode                      |

The execute button appears next to the union toolbar button while two or more polygons are selected.

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
- All selected polygons are merged at once, so a polygon that only touches the others through a third one still joins; the selection order only decides whose properties survive
- Each union is one undo step. Undoing it restores every source polygon
- The union succeeds only when the result is a single polygon without holes. If any selected polygon does not connect to the others (`disjoint`), a polygon has holes, or the merge would enclose a hole (`has-holes`), nothing is merged, [`unionfailed`](/api/events#unionfailed) is emitted, and the selection is kept so you can adjust it
- Map panning stays enabled so polygons off screen can be added to the selection
- MapLibre's box zoom (Shift + drag) is disabled during union mode, so a Shift + click (as in select mode) never zooms the map. It is restored to the map's own setting when you leave the mode

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
- MapLibre's box zoom (Shift + drag) is disabled during rotate mode so that Shift + drag only snaps the angle

## Input Methods

The drawing modes (`draw-point`, `draw-line`, `draw-polygon`, `draw-rectangle`, `draw-angled-rectangle`) take points in one of two ways. The choice is an input method, not a mode: it is kept when you switch modes.

| Input method      | How a point is placed                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------ |
| `'tap'` (default) | Click or tap the map, as described for each mode above.                                                |
| `'reticle'`       | Move the map until the crosshair at its center is on the spot, then press **Add point** at the bottom. |

Switch with the input method toggle in the toolbar (next to the drawing mode buttons; pressed while the reticle is in use), with the `inputMethod` option, or with `setInputMethod()`. Hide the toggle with `toolbar: { controls: { inputMethod: false } }`.

The center reticle is meant for fingers on a phone in the field: a finger hides the spot it taps and cannot hit it precisely, while the crosshair stays visible and the map can be positioned exactly.

```ts
// From the start
const draw = new LibreDraw(map, { inputMethod: 'reticle' });

// Or at any time, also while drawing (the draft is kept)
draw.setInputMethod('reticle');
draw.getInputMethod(); // 'reticle'
```

While the reticle is in use in a drawing mode (or in cut mode once the target is selected):

- A crosshair is shown at the center of the map and an action bar at the bottom center with three buttons (44 px touch targets). Both are shown with `toolbar: false` too.
- The map always pans with drag and zooms with pinch — also in `draw-polygon` and `draw-line`, where dragging does not pan with tap input. Clicks and taps on the map place nothing.
- **Add point** follows the same rules as a tap at the crosshair: it snaps to nearby vertices and edges, and adding on the first vertex (polygon) or the last vertex (polygon, line) finishes the drawing. Two points make a rectangle, three an angled rectangle.
- The preview and the snap indicator follow the crosshair as the map moves, so you see the next edge before adding the point.
- `finishDrawing()`, `cancelDrawing()` and Escape work as with tap input.

| Button         | Action                                                                                                                                                  | Enabled when                                                                                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Undo point** | Takes back the last point, like a long press with tap input: the last vertex, a rectangle's first corner, or an angled rectangle's last base-edge point | The draft has a point                                                                                                                                                                              |
| **Add point**  | Places a point at the crosshair                                                                                                                         | Always                                                                                                                                                                                             |
| **Finish**     | Finishes the drawing, like `finishDrawing()`                                                                                                            | A polygon has 3+ vertices and would not cross itself when closed, or a line has 2+ vertices. Never in `draw-point`, `draw-rectangle` and `draw-angled-rectangle`, which finish on their last point |

In cut mode the target is picked with a click or tap as usual; the crosshair appears once a target is selected and drafts the cutter, and disappears after the cut. Other modes (`select`, `split`, `union`, `setback`, `rotate`) show no crosshair and keep working with clicks and taps.

## Keyboard Shortcuts

Undo / redo shortcuts work in every mode and do not depend on the toolbar (they are available in headless mode too). Like MapLibre's own keyboard navigation, they only fire while the map has focus: clicking the map focuses its canvas, and keys pressed elsewhere on the page are left alone. They are also ignored while an `<input>`, `<textarea>`, `<select>` or `contenteditable` element has focus, so typing into the toolbar's distance / angle fields is never interrupted. The browser default is suppressed only when something was actually undone or redone; with an empty history the key event passes through to your page.

| Shortcut                   | Action                                                                   |
| -------------------------- | ------------------------------------------------------------------------ |
| Ctrl+Z / Cmd+Z             | Undo                                                                     |
| Ctrl+Shift+Z / Cmd+Shift+Z | Redo                                                                     |
| Ctrl+Y                     | Redo (Windows / Linux convention; Cmd+Y is left to the browser on macOS) |

Disable them with the `keyboard` option:

```ts
const draw = new LibreDraw(map, { keyboard: false });
// or, equivalently for the undo / redo pair:
const draw = new LibreDraw(map, { keyboard: { undoRedo: false } });
```

The keys below are handled by the active mode, likewise only while the map has focus, and are not affected by the `keyboard` option:

| Key                | Mode                     | Action                                                                                                          |
| ------------------ | ------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Escape             | draw-point               | Clear snap indicator                                                                                            |
| Escape             | draw-line / draw-polygon | Cancel the current drawing                                                                                      |
| Escape             | draw-rectangle           | Discard the first corner                                                                                        |
| Escape             | draw-angled-rectangle    | Discard the whole draft                                                                                         |
| Escape             | split                    | Cancel current split interaction                                                                                |
| Escape             | cut                      | Discard the cutter and the target                                                                               |
| Escape             | union                    | Clear the selection and stay in union mode                                                                      |
| Enter              | union                    | Merge the selected polygons (two or more)                                                                       |
| Enter              | setback                  | Apply the setback being previewed                                                                               |
| Escape             | setback                  | Cancel and reset                                                                                                |
| Escape             | rotate                   | During a drag: restore the shape and keep the selection. Otherwise: discard the preview and clear the selection |
| Delete / Backspace | select                   | Delete selected feature                                                                                         |

## Mode Transitions

Every mode is entered from `idle` with `setMode(name)` (`select` also with `selectFeature()`) and left with `setMode('idle')`. `setMode()` can also switch directly between any two modes; the previous mode discards its in-progress state.

Every mode transition emits a `modechange` event:

```ts
draw.on('modechange', (e) => {
  console.log(`${e.previousMode} → ${e.mode}`);
});
```
