# LibreDraw

[![npm version](https://img.shields.io/npm/v/%40sindicum%2Flibre-draw.svg)](https://www.npmjs.com/package/@sindicum/libre-draw)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![CI](https://github.com/sindicum/libre-draw/actions/workflows/ci.yml/badge.svg)](https://github.com/sindicum/libre-draw/actions/workflows/ci.yml)

A point, line, and polygon drawing and editing library for [MapLibre GL JS](https://maplibre.org/).

## Features

- **Zero-config** — `new LibreDraw(map)` gives you a full toolbar and drawing capabilities out of the box
- **Draw points** — Click/tap to place point features
- **Draw lines** — Click/tap to add vertices, click/tap the last vertex to finalize
- **Draw polygons** — Click/tap to place vertices, click/tap the first or last vertex to close
- **Draw rectangles** — Click/tap two opposite corners to create an axis-aligned rectangle
- **Draw angled rectangles** — Click/tap a base edge at any angle, then a point that sets the width
- **Select & edit** — Click a feature to select it, drag vertices to reshape, drag midpoints to add vertices
- **Feature drag** — Drag an entire selected point, line, or polygon to reposition it
- **Split polygon** — Cut a polygon into two polygons with a two-point split line
- **Union** — Merge two or more touching or overlapping polygons into one: click them to select, then press Enter or the execute button
- **Setback edge** — Offset a selected edge inward and remove the setback band
- **Rotate** — Turn a polygon or line by dragging it or by entering a relative angle
- **Snap** — Vertices snap to nearby existing vertices and edges during drawing and editing
- **Undo / Redo** — Full history support for all operations
- **GeoJSON in/out** — Import and export standard GeoJSON FeatureCollections (Point, LineString, Polygon)
- **Touch-first** — Designed for mobile with proper touch targets (44px+), long-press support, and gesture handling
- **Self-intersection prevention** — Invalid polygon geometries are rejected during editing
- **Framework-agnostic** — Works with vanilla JS, React, Vue, or any framework
- **TypeScript** — Full type definitions included
- **Headless mode** — Disable the toolbar and drive everything via API

## Quick Start

```bash
npm install @sindicum/libre-draw maplibre-gl
```

```typescript
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { LibreDraw } from '@sindicum/libre-draw';

const map = new maplibregl.Map({
  container: 'map',
  style: 'https://demotiles.maplibre.org/style.json',
  center: [0, 0],
  zoom: 2,
});

const draw = new LibreDraw(map);

draw.on('create', (e) => {
  console.log('Feature created:', e.feature.geometry.type, e.feature);
});

draw.on('update', (e) => {
  console.log('Feature updated:', e.feature.geometry.type, e.feature);
});
```

## API

### Constructor

```typescript
new LibreDraw(map: maplibregl.Map, options?: LibreDrawOptions)
```

### Methods

| Method                              | Description                                                                                                                                                                             |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `setMode(mode)`                     | Set active mode: `'idle'`, `'draw-point'`, `'draw-line'`, `'draw-polygon'`, `'draw-rectangle'`, `'draw-angled-rectangle'`, `'select'`, `'split'`, `'union'`, `'setback'`, or `'rotate'` |
| `getMode()`                         | Get the current mode                                                                                                                                                                    |
| `getFeatures()`                     | Get all features as an array                                                                                                                                                            |
| `toGeoJSON()`                       | Export all features as a GeoJSON FeatureCollection                                                                                                                                      |
| `getFeatureById(id)`                | Get a single feature by ID                                                                                                                                                              |
| `setFeatures(geojson)`              | Replace all features with a GeoJSON FeatureCollection (all or nothing, returns `{ ok, ... }`)                                                                                           |
| `addFeatures(features)`             | Add an array of GeoJSON Feature objects (undoable as one step). Returns one `{ valid, id, reason? }` per feature; invalid entries are reported there, never thrown                      |
| `validateFeature(feature)`          | Check an object against the same rules as `addFeatures` without adding it and without throwing                                                                                          |
| `deleteFeature(id)`                 | Delete a feature by ID (undoable)                                                                                                                                                       |
| `updateFeature(id, patch)`          | Replace a feature's geometry and/or properties (undoable, returns `{ ok, ... }`)                                                                                                        |
| `rotate(id, angleDeg)`              | Rotate a polygon or line around its centroid (undoable, returns `{ ok, ... }`)                                                                                                          |
| `split(id, line)`                   | Split a polygon or line along the line through two points (undoable, returns `{ ok, ... }`)                                                                                             |
| `setback(id, edge, distanceMeters)` | Move one edge of a polygon inward by a distance in meters (undoable, returns `{ ok, ... }`)                                                                                             |
| `union(ids)`                        | Merge two or more polygons into one (undoable, returns `{ ok, ... }`)                                                                                                                   |
| `selectFeature(id)`                 | Programmatically select a feature (returns `false` for an unknown id)                                                                                                                   |
| `selectFeatures(ids)`               | Select several features at once (returns `false` for an empty list or any unknown id)                                                                                                   |
| `clearSelection()`                  | Clear the current selection                                                                                                                                                             |
| `getSelectedFeatureIds()`           | Get IDs of selected features                                                                                                                                                            |
| `undo()`                            | Undo the last action                                                                                                                                                                    |
| `redo()`                            | Redo the last undone action                                                                                                                                                             |
| `on(event, callback)`               | Register an event listener                                                                                                                                                              |
| `off(event, callback)`              | Remove an event listener                                                                                                                                                                |
| `destroy()`                         | Clean up all resources                                                                                                                                                                  |

### Events

| Event             | Payload                                               | Description                                     |
| ----------------- | ----------------------------------------------------- | ----------------------------------------------- |
| `create`          | `{ feature }`                                         | A feature was created (point, line, or polygon) |
| `update`          | `{ feature, oldFeature }`                             | A feature was updated                           |
| `delete`          | `{ feature }`                                         | A feature was deleted                           |
| `split`           | `{ originalFeature, features: [featureA, featureB] }` | A polygon was split into two polygons           |
| `splitfailed`     | `{ reason, featureId }`                               | Split operation failed                          |
| `setback`         | `{ originalFeature, feature, edgeIndex, distance }`   | Setback operation succeeded                     |
| `setbackfailed`   | `{ reason, featureId }`                               | Setback operation failed                        |
| `union`           | `{ originalFeatures: [...features], feature }`        | Two or more polygons were merged into one       |
| `unionfailed`     | `{ reason, featureIds }`                              | Union operation failed                          |
| `rotate`          | `{ originalFeature, feature, angle }`                 | A polygon or line was rotated                   |
| `selectionchange` | `{ selectedIds }`                                     | Selection changed                               |
| `modechange`      | `{ mode, previousMode }`                              | Active mode changed                             |

Every payload also carries `origin: 'api' | 'user'`, so a listener can tell changes made through the API (its own `addFeatures()` / `deleteFeature()` / `undo()` …) from the user's pointer, toolbar, and keyboard input.

### Options

```typescript
interface LibreDrawOptions {
  toolbar?:
    | boolean
    | {
        position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
        controls?: {
          drawPoint?: boolean;
          drawLine?: boolean;
          drawPolygon?: boolean;
          drawRectangle?: boolean;
          drawAngledRectangle?: boolean;
          select?: boolean;
          split?: boolean;
          union?: boolean;
          setback?: boolean;
          rotate?: boolean;
          delete?: boolean;
          undo?: boolean;
          redo?: boolean;
        };
      };
  keyboard?: boolean | { undoRedo?: boolean }; // Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl+Y. Default: true
  historyLimit?: number; // Default: 100
  snap?: boolean | { enabled?: boolean; threshold?: number }; // Default: true
  locale?: 'en' | 'ja'; // UI language. Default: 'en'
  messages?: Partial<Messages>; // Override individual UI strings
}
```

Set `toolbar: false` for headless mode (API-only, no UI). Undo / redo keyboard shortcuts stay active in headless mode and only fire while the map has focus; set `keyboard: false` to turn them off.

## Documentation

Full documentation with interactive demos is available at:

**https://sindicum.github.io/libre-draw/**

Every method answers with a return value (`{ ok, ... }`, per-feature results, or a boolean) and throws only for misuse of the instance, so the same API serves your own code and an AI agent. See [Programmatic API](https://sindicum.github.io/libre-draw/guide/programmatic-api) for the return value / exception table and the `origin` rules. A reference MCP server for local use is available in [`examples/mcp`](./examples/mcp).

## Development

```bash
# Install dependencies
npm install

# Run dev server with example
npm run dev

# Run tests
npm test

# Lint
npm run lint

# Type check
npm run typecheck

# Build
npm run build

# Documentation site
npm run docs:dev

# Format (Prettier)
npm run format
```

`.git-blame-ignore-revs` lists commits that only reformat code. Run this once
per clone so `git blame` skips them and shows who actually wrote each line
(GitHub's blame view honours the file without any setup):

```bash
git config blame.ignoreRevsFile .git-blame-ignore-revs
```

## Requirements

- MapLibre GL JS >= 3.0.0, v3.x and v4.x supported (peer dependency)
- Modern browser with WebGL support

## License

[MIT](./LICENSE)
