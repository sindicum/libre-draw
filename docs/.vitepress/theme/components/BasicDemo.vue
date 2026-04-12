<template>
  <ClientOnly>
    <div class="demo-container">
      <div v-if="error" class="demo-error">{{ error }}</div>
      <div ref="mapContainer" class="demo-map-compact"></div>
      <div class="demo-hint">
        Click <strong>draw-point</strong> to place a point, or <strong>draw</strong> to add polygon vertices and double-click to finish.
      </div>
    </div>
  </ClientOnly>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue';

const mapContainer = ref<HTMLDivElement | null>(null);
const error = ref<string | null>(null);

let drawInstance: any = null;
let mapInstance: any = null;

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
  } catch (e: any) {
    error.value = `Failed to initialize: ${e.message}`;
    console.error('BasicDemo init error:', e);
  }
});

onUnmounted(() => {
  if (drawInstance) drawInstance.destroy();
  if (mapInstance) mapInstance.remove();
});
</script>
