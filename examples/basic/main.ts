import maplibregl from 'maplibre-gl';
import { LibreDraw } from '../../src';

const map = new maplibregl.Map({
  container: 'map',
  style: {
    version: 8,
    sources: {
      osm: {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: '&copy; OpenStreetMap contributors',
      },
    },
    layers: [
      {
        id: 'osm',
        type: 'raster',
        source: 'osm',
      },
    ],
  },
  center: [139.6917, 35.6895],
  zoom: 12,
});

const draw = new LibreDraw(map, {
  toolbar: {
    position: 'top-left',
    controls: {
      draw: true,
      select: true,
      delete: true,
      undo: true,
      redo: true,
    },
  },
});

// Log events for debugging
draw.on('create', (e) => {
  console.log('Feature created:', e.feature);
});

draw.on('delete', (e) => {
  console.log('Feature deleted:', e.feature);
});

draw.on('modechange', (e) => {
  console.log(`Mode changed: ${e.previousMode} -> ${e.mode}`);
});

draw.on('selectionchange', (e) => {
  console.log('Selection changed:', e.selectedIds);
});

// Expose for debugging in console
(window as unknown as Record<string, unknown>).draw = draw;
(window as unknown as Record<string, unknown>).map = map;
