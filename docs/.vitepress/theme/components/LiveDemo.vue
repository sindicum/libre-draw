<template>
  <ClientOnly>
    <div class="demo-container">
      <div v-if="error" class="demo-error">{{ error }}</div>
      <div
        ref="mapContainer"
        :class="fullsize ? 'demo-map-fullsize' : 'demo-map'"
      ></div>
      <div class="demo-log" ref="logContainer">
        <p v-if="logs.length === 0" class="demo-log-empty">
          Place a point or draw a polygon to see events here...
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
import { ref, onMounted, onUnmounted, nextTick, type PropType } from 'vue';

defineProps({
  fullsize: {
    type: Boolean as PropType<boolean>,
    default: false,
  },
});

interface LogEntry {
  type: string;
  message: string;
}

function describeFeature(feature: any): string {
  if (feature.geometry.type === 'Point') {
    return `Point ${feature.id.slice(0, 8)}...`;
  }
  if (feature.geometry.type === 'LineString') {
    return `Line ${feature.id.slice(0, 8)}... (${feature.geometry.coordinates.length} vertices)`;
  }

  return `Polygon ${feature.id.slice(0, 8)}... (${feature.geometry.coordinates[0].length - 1} vertices)`;
}

const mapContainer = ref<HTMLDivElement | null>(null);
const logContainer = ref<HTMLDivElement | null>(null);
const logs = ref<LogEntry[]>([]);
const error = ref<string | null>(null);

let drawInstance: any = null;
let mapInstance: any = null;

function addLog(type: string, message: string) {
  logs.value.push({ type, message });
  if (logs.value.length > 50) {
    logs.value.shift();
  }
  nextTick(() => {
    if (logContainer.value) {
      logContainer.value.scrollTop = logContainer.value.scrollHeight;
    }
  });
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

    mapInstance = map;

    const draw = new LibreDraw(map, {
      toolbar: {
        position: 'top-right',
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
    });

    drawInstance = draw;

    draw.on('create', (e) => {
      addLog('create', `${describeFeature(e.feature)} created`);
    });

    draw.on('update', (e) => {
      addLog('update', `${describeFeature(e.feature)} updated`);
    });

    draw.on('delete', (e) => {
      addLog('delete', `${describeFeature(e.feature)} deleted`);
    });

    draw.on('split', (e) => {
      addLog(
        'split',
        `${e.originalFeature.id.slice(0, 8)}... -> ${e.features.map((f) => f.id.slice(0, 8) + '...').join(', ')}`,
      );
    });

    draw.on('splitfailed', (e) => {
      addLog('splitfailed', `${e.reason} (${e.featureId.slice(0, 8)}...)`);
    });

    draw.on('setback', (e) => {
      addLog(
        'setback',
        `${e.originalFeature.id.slice(0, 8)}... edge ${e.edgeIndex} distance ${e.distance}`,
      );
    });

    draw.on('setbackfailed', (e) => {
      addLog('setbackfailed', `${e.reason} (${e.featureId.slice(0, 8)}...)`);
    });

    draw.on('selectionchange', (e) => {
      if (e.selectedIds.length > 0) {
        addLog(
          'selectionchange',
          `Selected: ${e.selectedIds.map((id) => id.slice(0, 8) + '...').join(', ')}`,
        );
      } else {
        addLog('selectionchange', 'Selection cleared');
      }
    });

    draw.on('modechange', (e) => {
      addLog('modechange', `${e.previousMode} → ${e.mode}`);
    });
  } catch (e: any) {
    error.value = `Failed to initialize: ${e.message}`;
    console.error('LiveDemo init error:', e);
  }
});

onUnmounted(() => {
  if (drawInstance) drawInstance.destroy();
  if (mapInstance) mapInstance.remove();
});
</script>
