import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LibreDraw } from '../../src/LibreDraw';
import { SOURCE_IDS } from '../../src/rendering/layers';
import { FakeMap } from './helpers/fakeMap';

const SQUARE = {
  type: 'Feature' as const,
  id: 'sq',
  geometry: {
    type: 'Polygon' as const,
    coordinates: [
      [
        [10, 10],
        [70, 10],
        [70, 70],
        [10, 70],
        [10, 10],
      ],
    ],
  },
  properties: {},
};

function clickAt(map: FakeMap, x: number, y: number): void {
  map
    .getCanvasContainer()
    .dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: x, clientY: y }));
  window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: x, clientY: y }));
}

describe('LibreDraw created before the map style has loaded', () => {
  let map: FakeMap;
  let draw: LibreDraw;

  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', ((cb: FrameRequestCallback): number => {
      cb(0);
      return 1;
    }) as typeof requestAnimationFrame);
    map = new FakeMap({ styleLoaded: false });
    document.body.appendChild(map.getContainer());
    draw = new LibreDraw(map.asMap(), { toolbar: false, snap: false });
  });

  afterEach(() => {
    draw.destroy();
    map.getContainer().remove();
    vi.unstubAllGlobals();
  });

  it('adds nothing to the map until the style loads', () => {
    expect(map.hasSource('libre-draw-features')).toBe(false);
    expect(map.hasLayer('libre-draw-fill')).toBe(false);
  });

  it('runs the API, events, and history at once, and draws the store once loaded', () => {
    const created: string[] = [];
    draw.on('create', (e) => created.push(e.feature.id));

    expect(draw.addFeatures([SQUARE])).toEqual([{ valid: true, id: 'sq' }]);
    expect(created).toEqual(['sq']);
    expect(draw.rotate('sq', 90).ok).toBe(true);
    expect(draw.undo()).toBe(true);
    expect(draw.getFeatures().map((f) => f.id)).toEqual(['sq']);

    map.finishLoading();

    expect(map.getSourceData('libre-draw-features')?.features.map((f) => f.id)).toEqual(['sq']);
  });

  it('adds the layers set before the load when the style loads', () => {
    draw.setLayers([{ id: 'parcels', type: 'fill', source: SOURCE_IDS.FEATURES }]);
    expect(map.layerIds()).toEqual([]);

    map.finishLoading();

    expect(map.layerIds()).toEqual(['parcels']);
  });

  it('ignores pointer input until the style loads', () => {
    draw.setMode('draw-point');

    clickAt(map, 20, 20);
    expect(draw.getFeatures()).toEqual([]);

    map.finishLoading();
    clickAt(map, 20, 20);
    expect(draw.getFeatures()).toHaveLength(1);
  });
});
