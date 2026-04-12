<template>
  <ClientOnly>
    <div class="demo-container">
      <div v-if="error" class="demo-error">{{ error }}</div>
      <div ref="mapContainer" class="demo-map-compact"></div>
      <div class="demo-controls">
        <div class="demo-controls-row">
          <span class="demo-controls-label">Mode:</span>
          <button
            v-for="mode in modes"
            :key="mode"
            :class="['demo-btn', { 'demo-btn-active': currentMode === mode }]"
            @click="switchMode(mode)"
          >
            {{ mode }}
          </button>
        </div>
        <div class="demo-controls-row">
          <span class="demo-controls-label">Actions:</span>
          <button class="demo-btn" @click="addSamplePoint">Add Point</button>
          <button class="demo-btn" @click="addSamplePolygon">Add Polygon</button>
          <button class="demo-btn" @click="showFeatures">getFeatures()</button>
          <button class="demo-btn" @click="doUndo">undo()</button>
          <button class="demo-btn" @click="doRedo">redo()</button>
          <button class="demo-btn demo-btn-danger" @click="clearAll">Clear All</button>
        </div>
      </div>
      <div class="demo-log" ref="logContainer">
        <p v-if="logs.length === 0" class="demo-log-empty">
          Use the buttons above to call API methods...
        </p>
        <p
          v-for="(log, index) in logs"
          :key="index"
          class="demo-log-entry"
        >
          <span class="log-type">[{{ log.type }}]</span> {{ log.message }}
        </p>
      </div>
    </div>
  </ClientOnly>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue';

interface LogEntry {
  type: string;
  message: string;
}

const mapContainer = ref<HTMLDivElement | null>(null);
const logContainer = ref<HTMLDivElement | null>(null);
const logs = ref<LogEntry[]>([]);
const currentMode = ref('idle');
const modes = ['idle', 'draw-point', 'draw', 'select', 'split', 'setback'] as const;

const error = ref<string | null>(null);

let drawInstance: any = null;
let mapInstance: any = null;
let sampleCount = 0;

function addLog(type: string, message: string) {
  logs.value.push({ type, message });
  if (logs.value.length > 50) logs.value.shift();
  nextTick(() => {
    if (logContainer.value) {
      logContainer.value.scrollTop = logContainer.value.scrollHeight;
    }
  });
}

function switchMode(mode: string) {
  if (drawInstance) {
    drawInstance.setMode(mode);
  }
}

function describeFeature(feature: any): string {
  if (feature.geometry.type === 'Point') {
    const [lng, lat] = feature.geometry.coordinates;
    return `Point id=${feature.id.slice(0, 8)}... @ [${lng.toFixed(3)}, ${lat.toFixed(3)}]`;
  }

  return `Polygon id=${feature.id.slice(0, 8)}... vertices=${feature.geometry.coordinates[0].length - 1}`;
}

function addSamplePoint() {
  if (!drawInstance) return;
  const offset = sampleCount * 0.005;
  sampleCount++;
  drawInstance.addFeatures([{
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [139.69 + offset, 35.688 + offset],
    },
    properties: { name: `Point ${sampleCount}` },
  }]);
  addLog('api', `addFeatures() — added sample point #${sampleCount}`);
}

function addSamplePolygon() {
  if (!drawInstance) return;
  const offset = sampleCount * 0.005;
  sampleCount++;
  const baseLng = 139.690 + offset;
  const baseLat = 35.688 + offset;
  drawInstance.addFeatures([{
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [baseLng, baseLat],
        [baseLng + 0.005, baseLat],
        [baseLng + 0.005, baseLat + 0.004],
        [baseLng, baseLat + 0.004],
        [baseLng, baseLat],
      ]],
    },
    properties: { name: `Sample ${sampleCount}` },
  }]);
  addLog('api', `addFeatures() — added sample polygon #${sampleCount}`);
}

function showFeatures() {
  if (!drawInstance) return;
  const features = drawInstance.getFeatures();
  addLog('api', `getFeatures() — ${features.length} feature(s)`);
  if (features.length > 0) {
    for (const f of features) {
      addLog('result', `  ${describeFeature(f)}`);
    }
  }
}

function doUndo() {
  if (!drawInstance) return;
  const result = drawInstance.undo();
  addLog('api', `undo() → ${result}`);
}

function doRedo() {
  if (!drawInstance) return;
  const result = drawInstance.redo();
  addLog('api', `redo() → ${result}`);
}

function clearAll() {
  if (!drawInstance) return;
  drawInstance.setFeatures({ type: 'FeatureCollection', features: [] });
  sampleCount = 0;
  addLog('api', `setFeatures([]) — cleared all features`);
}

onMounted(async () => {
  try {
    await nextTick();
    if (!mapContainer.value) return;

    const maplibregl = await import('maplibre-gl');
    await import('maplibre-gl/dist/maplibre-gl.css');
    const { LibreDraw } = await import('@sindicum/libre-draw');

    const map = new maplibregl.Map({
      container: mapContainer.value,
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
        layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
      },
      center: [139.6917, 35.6895],
      zoom: 13,
    });

    mapInstance = map;

    const draw = new LibreDraw(map, { toolbar: false });
    drawInstance = draw;

    draw.on('modechange', (e: any) => {
      currentMode.value = e.mode;
      addLog('event', `modechange: ${e.previousMode} → ${e.mode}`);
    });

    draw.on('create', (e: any) => {
      addLog('event', `create: ${describeFeature(e.feature)}`);
    });

    draw.on('update', (e: any) => {
      addLog('event', `update: ${describeFeature(e.feature)}`);
    });

    draw.on('delete', (e: any) => {
      addLog('event', `delete: ${describeFeature(e.feature)}`);
    });

    draw.on('selectionchange', (e: any) => {
      addLog('event', `selectionchange: [${e.selectedIds.map((id: string) => id.slice(0, 8) + '...').join(', ')}]`);
    });
  } catch (e: any) {
    error.value = `Failed to initialize: ${e.message}`;
    console.error('ApiDemo init error:', e);
  }
});

onUnmounted(() => {
  if (drawInstance) drawInstance.destroy();
  if (mapInstance) mapInstance.remove();
});
</script>
