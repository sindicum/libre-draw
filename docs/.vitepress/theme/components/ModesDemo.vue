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
        <div class="demo-controls-status">
          Current mode: <strong>{{ currentMode }}</strong>
        </div>
      </div>
      <div class="demo-log" ref="logContainer">
        <p v-if="logs.length === 0" class="demo-log-empty">
          Switch modes and interact with the map...
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

function describeFeature(feature: any): string {
  if (feature.geometry.type === 'Point') {
    return `Point ${feature.id.slice(0, 8)}...`;
  }

  return `Polygon ${feature.id.slice(0, 8)}... (${feature.geometry.coordinates[0].length - 1} vertices)`;
}

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
      addLog('modechange', `${e.previousMode} → ${e.mode}`);
    });

    draw.on('create', (e: any) => {
      addLog('create', `${describeFeature(e.feature)} created`);
    });

    draw.on('update', (e: any) => {
      addLog('update', `${describeFeature(e.feature)} updated`);
    });

    draw.on('delete', (e: any) => {
      addLog('delete', `${describeFeature(e.feature)} deleted`);
    });

    draw.on('split', (e: any) => {
      addLog('split', `${e.originalFeature.id.slice(0, 8)}... split into ${e.features.length} features`);
    });

    draw.on('setback', (e: any) => {
      addLog('setback', `${e.originalFeature.id.slice(0, 8)}... edge ${e.edgeIndex} setback ${e.distance}`);
    });

    draw.on('selectionchange', (e: any) => {
      if (e.selectedIds.length > 0) {
        addLog('selectionchange', `Selected ${e.selectedIds.length} feature(s)`);
      } else {
        addLog('selectionchange', 'Selection cleared');
      }
    });
  } catch (e: any) {
    error.value = `Failed to initialize: ${e.message}`;
    console.error('ModesDemo init error:', e);
  }
});

onUnmounted(() => {
  if (drawInstance) drawInstance.destroy();
  if (mapInstance) mapInstance.remove();
});
</script>
