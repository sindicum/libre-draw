import maplibregl from 'maplibre-gl';
import type { StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { LibreDraw } from '../../../src';
import { startBridgeClient } from './bridge-client';
import { LogPanel } from './log-panel';
import { SAMPLE_FEATURES } from './sample';

// The server binds to 127.0.0.1 only; use the same literal so the browser
// does not try ::1 first.
const BRIDGE_URL = `ws://127.0.0.1:${import.meta.env.VITE_LIBREDRAW_BRIDGE_PORT ?? '8787'}`;

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
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

const map = new maplibregl.Map({
  container: 'map',
  style: osmStyle,
  center: [139.767, 35.684],
  zoom: 14,
});

const draw = new LibreDraw(map, { toolbar: { position: 'top-left' } });

const panel = new LogPanel(document.getElementById('log')!);
panel.observe(draw);

map.on('load', () => {
  draw.addFeatures(SAMPLE_FEATURES);
});

startBridgeClient(BRIDGE_URL, draw, {
  onStatus: (connected) => panel.status(connected),
  onCall: (tool, args, result) => panel.call(tool, args, result),
});

// Handy in the browser console.
(window as unknown as { draw: LibreDraw }).draw = draw;
