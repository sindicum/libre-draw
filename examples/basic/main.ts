import maplibregl from 'maplibre-gl';
import type { StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { LibreDraw } from '../../src';

// `?e2e` turns this page into the Playwright fixture: no tile requests, so
// the run does not depend on the network, plus a minimal frame-time probe.
const isE2E = new URLSearchParams(window.location.search).has('e2e');

const osmStyle: StyleSpecification = {
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
};

// No sources (so no tile requests); a flat background keeps the canvas from
// looking blank when the run is watched in headed / UI mode.
const emptyStyle: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#e9edf1' } }],
};

const map = new maplibregl.Map({
  container: 'map',
  style: isE2E ? emptyStyle : osmStyle,
  center: [139.6917, 35.6895],
  zoom: 12,
});

const draw = new LibreDraw(map, {
  toolbar: {
    position: 'top-left',
    controls: {
      drawPolygon: true,
      drawRectangle: true,
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

// Expose for debugging in console (and for the E2E tests)
const win = window as unknown as Record<string, unknown>;
win.draw = draw;
win.map = map;

if (isE2E) {
  // Frame-time probe: the gap between consecutive render events while the
  // map is busy. Summarised once per idle so a benchmark can pick it up
  // from the console later; no threshold is enforced here.
  const frameTimes: number[] = [];
  let last: number | null = null;
  map.on('render', () => {
    const now = performance.now();
    if (last !== null) frameTimes.push(now - last);
    last = now;
  });
  map.on('idle', () => {
    last = null;
    if (frameTimes.length === 0) return;
    const avg = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
    const max = Math.max(...frameTimes);
    console.log(
      `[e2e] frames=${frameTimes.length} avg=${avg.toFixed(1)}ms max=${max.toFixed(1)}ms`
    );
    frameTimes.length = 0;
  });
  win.__frameTimes = frameTimes;
}
