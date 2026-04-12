# Getting Started

## Installation

Install LibreDraw alongside MapLibre GL JS:

```bash
npm install @sindicum/libre-draw maplibre-gl
```

## Basic Usage

```ts
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { LibreDraw } from '@sindicum/libre-draw';

// Create a MapLibre map
const map = new maplibregl.Map({
  container: 'map',
  style: 'https://demotiles.maplibre.org/style.json',
  center: [139.6917, 35.6895],
  zoom: 12,
});

// Attach LibreDraw — toolbar appears automatically
const draw = new LibreDraw(map);
```

That's it! A toolbar with draw-point, draw-line, draw, select, split, setback, delete, undo, and redo buttons appears on the map. Use draw-point to place points, draw-line to draw lines, or draw to create polygons.

> **Note:** LibreDraw does not require a separate CSS import. All styles (toolbar, map layers) are applied programmatically via JavaScript. Only `maplibre-gl.css` is needed for the base map.

### Try it

<BasicDemo />

## With Options

```ts
const draw = new LibreDraw(map, {
  toolbar: {
    position: 'top-right', // 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
    controls: {
      drawPoint: true,
      drawLine: true,
      draw: true,
      select: true,
      split: true,
      setback: true,
      delete: true,
      undo: true,
      redo: true,
    },
  },
  historyLimit: 50, // max undo/redo steps (default: 100)
});
```

## Headless Mode

If you want to control everything programmatically without the toolbar:

```ts
const draw = new LibreDraw(map, { toolbar: false });

// Control modes via API
draw.setMode('draw-point');
draw.setMode('draw-line');
draw.setMode('draw');
draw.setMode('select');
draw.setMode('idle');
```

## Listening to Events

```ts
draw.on('create', (e) => {
  console.log('Feature created:', e.feature.geometry.type, e.feature);
});

draw.on('update', (e) => {
  console.log('Feature updated:', e.feature.geometry.type, e.feature);
  console.log('Previous state:', e.oldFeature);
});

draw.on('delete', (e) => {
  console.log('Feature deleted:', e.feature.geometry.type, e.feature);
});

draw.on('split', (e) => {
  console.log('Polygon split:', e.originalFeature.id, '->', e.features.map(f => f.id));
});

draw.on('setback', (e) => {
  console.log('Setback applied:', e.originalFeature.id, 'edge:', e.edgeIndex, 'distance:', e.distance);
});

draw.on('selectionchange', (e) => {
  console.log('Selected IDs:', e.selectedIds);
});

draw.on('modechange', (e) => {
  console.log(`Mode: ${e.previousMode} → ${e.mode}`);
});
```

## Working with GeoJSON

### Export

```ts
// Recommended — returns a GeoJSON FeatureCollection directly
const geojson = draw.toGeoJSON();
// { type: 'FeatureCollection', features: [...] }
```

If you need individual features as an array:

```ts
const features = draw.getFeatures();
// Returns: LibreDrawFeature[]
```

### Import

```ts
// Replace all features
draw.setFeatures({
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [139.69, 35.69],
            [139.70, 35.69],
            [139.70, 35.68],
            [139.69, 35.68],
            [139.69, 35.69],
          ],
        ],
      },
      properties: {},
    },
  ],
});

// Add without clearing existing
draw.addFeatures([feature1, feature2]);
```

## Cleanup

Always destroy the instance when you're done:

```ts
draw.destroy();
// After this, all methods will throw LibreDrawError
```

## Next Steps

- Learn about [Modes](/guide/modes) (Idle, Draw Point, Draw Line, Draw, Select, Split, Setback)
- See the full [API Reference](/api/)
- Try the [Live Demo](/examples/)
