# LibreDraw

[![npm version](https://img.shields.io/npm/v/%40sindicum%2Flibre-draw.svg)](https://www.npmjs.com/package/@sindicum/libre-draw)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

A point, line, and polygon drawing and editing library for [MapLibre GL JS](https://maplibre.org/).

## Features

- **Zero-config** — `new LibreDraw(map)` gives you a full toolbar and drawing capabilities out of the box
- **Draw points** — Click/tap to place point features
- **Draw lines** — Click/tap to add vertices, double-click/double-tap to finalize
- **Draw polygons** — Click/tap to place vertices, double-click/double-tap to close
- **Select & edit** — Click a feature to select it, drag vertices to reshape, drag midpoints to add vertices
- **Feature drag** — Drag an entire selected point, line, or polygon to reposition it
- **Split polygon** — Cut a polygon into two polygons with a two-point split line
- **Setback edge** — Offset a selected edge inward and remove the setback band
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

| Method                    | Description                                           |
| ------------------------- | ----------------------------------------------------- |
| `setMode(mode)`           | Set active mode: `'idle'`, `'draw-point'`, `'draw-line'`, `'draw'`, `'select'`, `'split'`, or `'setback'` |
| `getMode()`               | Get the current mode                                  |
| `getFeatures()`           | Get all features as an array                          |
| `toGeoJSON()`             | Export all features as a GeoJSON FeatureCollection    |
| `getFeatureById(id)`      | Get a single feature by ID                            |
| `setFeatures(geojson)`    | Replace all features with a GeoJSON FeatureCollection |
| `addFeatures(features)`   | Add an array of GeoJSON Feature objects (undoable as one step) |
| `deleteFeature(id)`       | Delete a feature by ID (undoable)                     |
| `selectFeature(id)`       | Programmatically select a feature                     |
| `clearSelection()`        | Clear the current selection                           |
| `getSelectedFeatureIds()` | Get IDs of selected features                          |
| `undo()`                  | Undo the last action                                  |
| `redo()`                  | Redo the last undone action                           |
| `on(event, callback)`     | Register an event listener                            |
| `off(event, callback)`    | Remove an event listener                              |
| `destroy()`               | Clean up all resources                                |

### Events

| Event             | Payload                                            | Description                          |
| ----------------- | -------------------------------------------------- | ------------------------------------ |
| `create`          | `{ feature }`                                      | A feature was created (point, line, or polygon) |
| `update`          | `{ feature, oldFeature }`                          | A feature was updated                |
| `delete`          | `{ feature }`                                      | A feature was deleted                |
| `split`           | `{ originalFeature, features: [featureA, featureB] }` | A polygon was split into two polygons |
| `splitfailed`     | `{ reason, featureId }`                            | Split operation failed               |
| `setback`         | `{ originalFeature, feature, edgeIndex, distance }` | Setback operation succeeded          |
| `setbackfailed`   | `{ reason, featureId }`                            | Setback operation failed             |
| `selectionchange` | `{ selectedIds }`                                  | Selection changed                    |
| `modechange`      | `{ mode, previousMode }`                           | Active mode changed                  |

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
          draw?: boolean;
          select?: boolean;
          split?: boolean;
          setback?: boolean;
          delete?: boolean;
          undo?: boolean;
          redo?: boolean;
        };
      };
  historyLimit?: number; // Default: 100
  snap?: boolean | { enabled?: boolean; threshold?: number }; // Default: true
}
```

Set `toolbar: false` for headless mode (API-only, no UI).

## Documentation

Full documentation with interactive demos is available at:

**https://sindicum.github.io/libre-draw/**

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
```

## Requirements

- MapLibre GL JS >= 3.0.0, v3.x and v4.x supported (peer dependency)
- Modern browser with WebGL support

## License

[MIT](./LICENSE)
