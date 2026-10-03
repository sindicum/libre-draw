# Getting Started

## Installation

Install LibreDraw alongside MapLibre GL JS v5 or v6 (`>=5.0.0 <7.0.0`, a peer dependency):

```bash
npm install @sindicum/libre-draw maplibre-gl
```

## Basic Usage

```ts
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { LibreDraw } from '@sindicum/libre-draw';

// MapLibre GL JS v6 loads its worker from a URL you give it once
// (on v5 the worker is inside the bundle: drop this call and the import above)
maplibregl.setWorkerUrl(workerUrl);

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

That's it! A toolbar with draw-point, draw-line, draw-polygon, draw-rectangle, draw-angled-rectangle, the input method toggle, select, split, cut, reshape, union, setback, rotate, delete, undo, and redo buttons appears on the map. Use draw-point to place points, draw-line to draw lines, draw-polygon to create polygons, draw-rectangle to drop a rectangle with two clicks, or draw-angled-rectangle to draw one at any angle with three clicks.

> **Note:** LibreDraw does not require a separate CSS import. All styles (toolbar, map layers) are applied programmatically via JavaScript. Only `maplibre-gl.css` is needed for the base map.

> **Note:** The `?worker&url` import is Vite's way of getting the worker URL on MapLibre v6. Other bundlers have their own; see [MapLibre's installation guide](https://maplibre.org/maplibre-gl-js/docs/#installation). MapLibre v6 requires WebGL2; v5 does not need the worker setup.

### Try it

The map below shows only the basic buttons. The full toolbar is on the [Live Demo](/examples/) page.

<BasicDemo />

## With Options

```ts
const draw = new LibreDraw(map, {
  toolbar: {
    position: 'top-right', // 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
    controls: {
      drawPoint: true,
      drawLine: true,
      drawPolygon: true,
      select: true,
      split: true,
      union: true,
      setback: true,
      delete: true,
      undo: true,
      redo: true,
    },
  },
  historyLimit: 50, // max undo/redo steps (default: 100)
});
```

## Customizing the Look

LibreDraw draws with ordinary MapLibre layers. Pass your own layer definitions as `layers` (or later with `setLayers()`) to replace the defaults. Start from `DEFAULT_LAYERS` and change what you need:

```ts
import { LibreDraw, DEFAULT_LAYERS } from '@sindicum/libre-draw';

const draw = new LibreDraw(map, {
  layers: DEFAULT_LAYERS.map((layer) =>
    layer.id === 'libre-draw-fill' && layer.type === 'fill'
      ? {
          ...layer,
          paint: {
            ...layer.paint,
            // Orange while selected, otherwise the feature's own `color` property
            'fill-color': [
              'case',
              ['boolean', ['get', 'libre-draw:selected'], false],
              '#fbb03b',
              ['coalesce', ['get', 'color'], '#285daa'],
            ],
          },
        }
      : layer
  ),
});
```

Each definition reads one of the six sources in `SOURCE_IDS`. In expressions, a feature's own properties keep their names; `libre-draw:selected` tells whether it is selected, and the feature-state `hover` marks the feature a click would pick. See [Layer Types](/api/types#layer-types) for every source, state, and default layer.

## Localization

The toolbar and its popups are in English by default. Pass `locale: 'ja'` for the bundled Japanese strings, and `messages` to override individual strings on top of either locale:

```ts
const draw = new LibreDraw(map, {
  locale: 'ja',
  messages: { setbackExecute: '適用' },
});
```

Every string is listed under [`Messages`](/api/types#messages). An unknown `locale` throws a `LibreDrawError`.

## Headless Mode

If you want to control everything programmatically without the toolbar:

```ts
const draw = new LibreDraw(map, { toolbar: false });

// Control modes via API
draw.setMode('draw-point');
draw.setMode('draw-line');
draw.setMode('draw-polygon');
draw.setMode('draw-rectangle');
draw.setMode('draw-angled-rectangle');
draw.setMode('select');
draw.setMode('idle');

// Edit without any pointer input. Each call is one undo step and returns a
// structured result instead of throwing.
const rotated = draw.rotate(featureId, 90);
if (!rotated.ok) console.warn(rotated.reason); // e.g. 'not-rotatable' for a Point

draw.updateFeature(featureId, { properties: { crop: 'wheat' } });
draw.undo(); // properties back, still rotated

// The geometry operations of the split / setback / union / cut / reshape
// modes are API calls too, so a headless page (or an AI agent) can run them.
const halves = draw.split(featureId, [
  [139.7, 35.65],
  [139.72, 35.67],
]);
if (halves.ok) draw.union(halves.created.map((f) => f.id)); // and back together
draw.setback(featureId, { index: 0 }, 10); // edge 0, 10 m inward
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
  console.log(
    'Polygon split:',
    e.originalFeature.id,
    '->',
    e.features.map((f) => f.id)
  );
});

draw.on('setback', (e) => {
  console.log(
    'Setback applied:',
    e.originalFeature.id,
    'edge:',
    e.edgeIndex,
    'distance:',
    e.distance
  );
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
            [139.7, 35.69],
            [139.7, 35.68],
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
// After this, every method except destroy() throws LibreDrawError
```

## Next Steps

- Learn about [Modes](/guide/modes) (Idle, Draw Point, Draw Line, Draw Polygon, Draw Rectangle, Draw Angled Rectangle, Select, Split, Cut, Reshape, Union, Setback, Rotate)
- Drive it from your own code or an AI agent: [Programmatic API](/guide/programmatic-api)
- See the full [API Reference](/api/)
- Try the [Live Demo](/examples/)
