# Modes

LibreDraw uses a mode-based architecture. Only one mode is active at a time, and each mode defines how user interactions are interpreted.

## Overview

| Mode | Description | Activated by |
|------|-------------|--------------|
| `idle` | No drawing interaction. Map behaves normally. | Default / toolbar |
| `draw-point` | Click to place a point feature. | Toolbar draw-point button / `setMode('draw-point')` |
| `draw-line` | Click to add vertices, double-click to finalize line. | Toolbar draw-line button / `setMode('draw-line')` |
| `draw` | Click to add vertices, double-click to close polygon. | Toolbar draw button / `setMode('draw')` |
| `select` | Click to select, drag to edit vertices or move point/line/polygon. | Toolbar select button / `setMode('select')` |
| `split` | Split a polygon with a two-point line. | Toolbar split button / `setMode('split')` |
| `setback` | Apply inward edge setback with distance input. | Toolbar setback button / `setMode('setback')` |

### Try it

Use the buttons below to switch between modes. Place points in **draw-point** mode, draw lines in **draw-line** mode, draw polygons in **draw** mode, then switch to **select** mode to edit them.

<ModesDemo />

## Idle Mode

The default mode. No drawing or editing interactions are active. The map behaves normally — pan, zoom, and all standard MapLibre interactions work.

```ts
draw.setMode('idle');
```

## Draw Point Mode

In draw-point mode, you place point features on the map. Each click/tap instantly creates a Point feature.

### Mouse Interaction

| Action | Effect |
|--------|--------|
| Click | Place a point |
| Escape key | Clear snap indicator |

### Touch Interaction

| Action | Effect |
|--------|--------|
| Tap | Place a point |

### Behavior

- One click = one Point feature (instant creation, no multi-step workflow)
- The mode stays active for continuous placement — you can place multiple points without switching modes
- Snap to existing vertices is supported when enabled
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

| Action | Effect |
|--------|--------|
| Click | Add a vertex |
| Double-click | Finalize the line (minimum 2 vertices) |
| Escape key | Cancel the current drawing |

### Touch Interaction

| Action | Effect |
|--------|--------|
| Tap | Add a vertex |
| Double-tap | Finalize the line |
| Long-press | Undo last vertex |

### Behavior

- A preview line follows the cursor while drawing
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

## Draw Mode

In draw mode, you create new polygons by clicking on the map.

### Mouse Interaction

| Action | Effect |
|--------|--------|
| Click | Add a vertex |
| Double-click | Close the polygon (minimum 3 vertices) |
| Escape key | Cancel the current drawing |

### Touch Interaction

| Action | Effect |
|--------|--------|
| Tap | Add a vertex |
| Double-tap | Close the polygon |
| Long-press | Undo last vertex |

### Behavior

- A preview line follows the cursor while drawing
- A semi-transparent polygon preview shows the current shape
- Map panning is disabled during draw mode
- Double-click zoom is disabled during draw mode
- Self-intersecting polygons are automatically rejected

```ts
draw.setMode('draw');

draw.on('create', (e) => {
  console.log('New polygon:', e.feature);
  // Remains in draw mode for continuous drawing
});
```

## Select Mode

In select mode, you can select existing features (points, lines, and polygons) and edit them.

### Selecting

| Action | Effect |
|--------|--------|
| Click on polygon | Select it (shows vertex handles) |
| Click near line | Select it (within 20px threshold, shows vertex handles) |
| Click near point | Select it (within 20px threshold) |
| Click outside | Deselect |
| Delete key | Delete selected feature |

### Point Editing

When a point is selected:

| Action | Effect |
|--------|--------|
| Drag the point | Move it to a new position |

### Line Editing

When a line is selected, vertex handles appear:

| Action | Effect |
|--------|--------|
| Drag a vertex | Move the vertex |
| Drag a midpoint | Insert a new vertex and drag it |
| Double-click a vertex | Delete the vertex (minimum 2 maintained) |
| Drag near the line | Move the entire line |

### Vertex Editing

When a polygon is selected, vertex handles appear:

| Action | Effect |
|--------|--------|
| Drag a vertex | Move the vertex |
| Drag a midpoint | Insert a new vertex and drag it |
| Long-press a vertex | Delete the vertex (minimum 3 maintained) |

### Polygon Dragging

| Action | Effect |
|--------|--------|
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

| Action | Effect |
|--------|--------|
| Click on polygon | Select split target |
| Click first point | Set split-line start |
| Click second point | Execute split |
| Escape key | Cancel current split interaction |

```ts
draw.setMode('split');
draw.on('split', (e) => console.log(e.originalFeature.id, e.features));
draw.on('splitfailed', (e) => console.warn(e.reason));
```

## Setback Mode

In setback mode, you select an edge and apply inward offset by distance.

| Action | Effect |
|--------|--------|
| Click on polygon | Select setback target |
| Click edge | Start preview |
| Change distance | Update preview line |
| Enter / execute button | Apply setback |
| Escape key | Cancel and reset |

```ts
draw.setMode('setback');
draw.on('setback', (e) => console.log(e.edgeIndex, e.distance));
draw.on('setbackfailed', (e) => console.warn(e.reason));
```

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
           │    setMode('draw')
           ├─────────────────────────┐
           │                         ▼
        ┌──────┐               ┌──────────┐
        │ idle │               │   draw   │
        └──────┘               └──────────┘
           ▲                         │
           │     polygon created     │
           └─────────────────────────┘
           │
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
           │    setMode('setback')
           ├─────────────────────────┐
           │                         ▼
           │                   ┌──────────┐
           │                   │ setback  │
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
