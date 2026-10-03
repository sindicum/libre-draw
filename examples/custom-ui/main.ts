// A toolbar built from the public API alone: every button calls a public
// method, and every enabled / pressed state is read back through the public
// methods after a `modechange`, `selectionchange`, `historychange` or
// `draftchange` event. See docs/guide/programmatic-api.md "Building your own UI"
// for what the built-in toolbar can do that this page cannot.
import * as maplibregl from 'maplibre-gl';
import type { StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { LibreDraw } from '../../src';
import type { ModeName } from '../../src';
import { deriveUiState, parseSetbackDistance } from './state';

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

// MapLibre 6 ships its worker as a separate module that a bundler has to
// hand over once. The glob matches nothing on MapLibre 5, whose worker is
// inside the bundle.
const workerUrls = import.meta.glob('../../node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs', {
  query: '?worker&url',
  import: 'default',
  eager: true,
}) as Record<string, string>;
for (const workerUrl of Object.values(workerUrls)) maplibregl.setWorkerUrl(workerUrl);

const map = new maplibregl.Map({
  container: 'map',
  style: osmStyle,
  center: [139.6917, 35.6895],
  zoom: 12,
});

const draw = new LibreDraw(map, { toolbar: false });

function $<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

const MODES: { name: ModeName; label: string }[] = [
  { name: 'draw-point', label: 'Point' },
  { name: 'draw-line', label: 'Line' },
  { name: 'draw-polygon', label: 'Polygon' },
  { name: 'draw-rectangle', label: 'Rectangle' },
  { name: 'draw-angled-rectangle', label: 'Angled rect' },
  { name: 'select', label: 'Select' },
  { name: 'split', label: 'Split' },
  { name: 'union', label: 'Union' },
  { name: 'setback', label: 'Setback' },
  { name: 'rotate', label: 'Rotate' },
  { name: 'cut', label: 'Cut' },
  { name: 'reshape', label: 'Reshape' },
];

const modeButtons = new Map<ModeName, HTMLButtonElement>();
for (const { name, label } of MODES) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  // Like the toolbar, clicking the active mode's button returns to idle.
  button.addEventListener('click', () => draw.setMode(draw.getMode() === name ? 'idle' : name));
  modeButtons.set(name, button);
  $('modes').appendChild(button);
}

$('input-method').addEventListener('click', () => {
  draw.setInputMethod(draw.getInputMethod() === 'tap' ? 'reticle' : 'tap');
  render();
});

$<HTMLInputElement>('fill-color').addEventListener('input', (event) => {
  draw.setStyle({ fill: { color: (event.target as HTMLInputElement).value } });
});

// The toolbar deletes the whole selection as one undo step; the public API
// deletes one feature per call, so this takes one step per feature.
$('delete').addEventListener('click', () => {
  for (const id of draw.getSelectedFeatureIds()) draw.deleteFeature(id);
});

$('undo').addEventListener('click', () => draw.undo());
$('redo').addEventListener('click', () => draw.redo());
$('finish').addEventListener('click', () => draw.finishDrawing());
$('cancel').addEventListener('click', () => draw.cancelDrawing());

$('union-execute').addEventListener('click', () => {
  const result = draw.union(draw.getSelectedFeatureIds());
  if (!result.ok) log(`union failed: ${result.reason}`);
});

const setbackDistance = $<HTMLInputElement>('setback-distance');
setbackDistance.value = String(draw.getSetbackDistance());
// The mode's preview follows this value, as it follows the toolbar's field.
// An invalid value is kept out, so the preview stays at the last accepted one.
setbackDistance.addEventListener('input', () => {
  const meters = parseSetbackDistance(setbackDistance.value);
  if (meters !== null) draw.setSetbackDistance(meters);
});

// Like the toolbar's execute button: apply the distance to the edge the
// person picked on the map (polygon, then edge). The field is re-read here:
// an empty or invalid field must not execute with the previously accepted
// distance.
$('setback-execute').addEventListener('click', () => {
  const [id] = draw.getSelectedFeatureIds();
  const edge = draw.getSetbackEdge();
  if (!id || !edge) {
    log('setback: click a polygon, then one of its edges');
    return;
  }
  const meters = parseSetbackDistance(setbackDistance.value);
  if (meters === null) {
    log('setback: enter a distance greater than zero');
    return;
  }
  const result = draw.setback(id, edge, meters);
  if (!result.ok) log(`setback failed: ${result.reason}`);
});

// `rotate()` commits at once; the toolbar's live preview of the angle has no
// API equivalent. Undo reverts a rotation that was not wanted.
$('rotate-execute').addEventListener('click', () => {
  const [id] = draw.getSelectedFeatureIds();
  if (!id) return;
  const angle = Number($<HTMLInputElement>('rotate-angle').value);
  const result = draw.rotate(id, angle);
  if (!result.ok) log(`rotate failed: ${result.reason}`);
});

function render(): void {
  const state = deriveUiState({
    mode: draw.getMode(),
    selectedCount: draw.getSelectedFeatureIds().length,
    canUndo: draw.canUndo(),
    canRedo: draw.canRedo(),
    draftVertexCount: draw.getDraftVertexCount(),
  });
  for (const [name, button] of modeButtons) {
    button.setAttribute('aria-pressed', String(name === state.activeMode));
  }
  $('input-method').textContent = `Input: ${draw.getInputMethod()}`;
  $<HTMLButtonElement>('delete').disabled = !state.deleteEnabled;
  $<HTMLButtonElement>('undo').disabled = !state.undoEnabled;
  $<HTMLButtonElement>('redo').disabled = !state.redoEnabled;
  $<HTMLButtonElement>('finish').disabled = !state.finishEnabled;
  $<HTMLButtonElement>('cancel').disabled = !state.cancelEnabled;
  $('union-row').hidden = !state.unionExecuteVisible;
  $('setback-row').hidden = !state.setbackInputVisible;
  $('rotate-row').hidden = !state.rotateInputVisible;
}

function log(line: string): void {
  const el = $('log');
  el.textContent = `${line}\n${el.textContent ?? ''}`.split('\n').slice(0, 20).join('\n');
}

// Every state the buttons depend on is announced by one of these events.
draw.on('modechange', render);
draw.on('selectionchange', render);
draw.on('historychange', render);
draw.on('draftchange', render);

// Events from this page's own buttons carry origin: 'api', the same as any
// program's calls; pointer input on the map and the keyboard shortcuts are 'user'.
draw.on('create', (e) => log(`create ${e.feature.id} (${e.origin})`));
draw.on('delete', (e) => log(`delete ${e.feature.id} (${e.origin})`));
draw.on('historychange', (e) => log(`history undo=${e.canUndo} redo=${e.canRedo} (${e.origin})`));

render();

const win = window as unknown as Record<string, unknown>;
win.draw = draw;
win.map = map;
