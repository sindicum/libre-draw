import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LibreDraw } from '../../src/LibreDraw';
import { SOURCE_IDS } from '../../src/rendering/layers';
import type { ModeName } from '../../src/types/mode';
import { FakeMap } from './helpers/fakeMap';

// Contract of docs/api/types.md (SOURCE_IDS): the feature-state `hover` is
// on the feature a click would pick. FakeMap projects pixels 1:1 to lng/lat.

function square(id: string, x: number, y: number, size = 20): GeoJSON.Feature {
  return {
    id,
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [x, y],
          [x + size, y],
          [x + size, y + size],
          [x, y + size],
          [x, y],
        ],
      ],
    },
  };
}

function moveTo(map: FakeMap, x: number, y: number): void {
  map.getCanvasContainer().dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y }));
}

function clickAt(map: FakeMap, x: number, y: number): void {
  const canvas = map.getCanvasContainer();
  canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: x, clientY: y, button: 0 }));
  window.dispatchEvent(new MouseEvent('mouseup', { clientX: x, clientY: y, button: 0 }));
}

function hovered(map: FakeMap, ids: string[]): string[] {
  return ids.filter(
    (id) => map.getFeatureState({ source: SOURCE_IDS.FEATURES, id }).hover === true
  );
}

describe('hover', () => {
  let map: FakeMap;
  let draw: LibreDraw;

  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', ((cb: FrameRequestCallback): number => {
      cb(0);
      return 1;
    }) as typeof requestAnimationFrame);
    map = new FakeMap();
    draw = new LibreDraw(map.asMap(), { toolbar: false });
    // 'top' overlaps 'bottom' at (25..30, 25..30) and is drawn above it.
    draw.addFeatures([square('bottom', 10, 10), square('top', 25, 25)]);
  });

  afterEach(() => {
    draw.destroy();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each<ModeName>(['select', 'rotate', 'union', 'split', 'setback', 'cut', 'reshape'])(
    'is on the feature a click picks in %s mode',
    (mode) => {
      draw.setMode(mode);

      moveTo(map, 27, 27);
      expect(hovered(map, ['bottom', 'top'])).toEqual(['top']);
      expect(map.getCanvas().style.cursor).toBe('pointer');

      moveTo(map, 200, 200);
      expect(hovered(map, ['bottom', 'top'])).toEqual([]);
      expect(map.getCanvas().style.cursor).toBe('');

      clickAt(map, 27, 27);
      expect(draw.getSelectedFeatureIds()).toEqual(['top']);
    }
  );

  it('is never set while drawing', () => {
    draw.setMode('draw-polygon');
    moveTo(map, 15, 15);
    expect(hovered(map, ['bottom', 'top'])).toEqual([]);
  });

  it('stops once cut mode drafts its cutter', () => {
    draw.setMode('cut');
    clickAt(map, 15, 15); // picks 'bottom' and starts the cutter
    moveTo(map, 27, 27);
    expect(hovered(map, ['bottom', 'top'])).toEqual([]);
  });

  it('is cleared during a drag in select mode', () => {
    draw.setMode('select');
    clickAt(map, 15, 15);
    moveTo(map, 15, 15);
    expect(hovered(map, ['bottom'])).toEqual(['bottom']);

    map
      .getCanvasContainer()
      .dispatchEvent(new MouseEvent('mousedown', { clientX: 15, clientY: 15, button: 0 }));
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 18, clientY: 18 }));
    moveTo(map, 18, 18); // still inside 'bottom', which is being dragged

    expect(draw.getFeatureById('bottom')?.geometry).not.toEqual(square('bottom', 10, 10).geometry);
    expect(hovered(map, ['bottom', 'top'])).toEqual([]);
  });

  it('is cleared while dragging a point or a whole multi-selection', () => {
    draw.addFeatures([
      {
        id: 'pt',
        type: 'Feature',
        properties: {},
        geometry: { type: 'Point', coordinates: [60, 60] },
      },
    ]);
    draw.setMode('select');
    const canvas = map.getCanvasContainer();
    const dragFrom = (x: number, y: number, toX: number, toY: number) => {
      canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: x, clientY: y, button: 0 }));
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: toX, clientY: toY }));
      moveTo(map, toX, toY);
    };

    clickAt(map, 60, 60);
    dragFrom(60, 60, 15, 15); // the point passes over 'bottom'
    expect(hovered(map, ['bottom', 'top', 'pt'])).toEqual([]);
    window.dispatchEvent(new MouseEvent('mouseup', { clientX: 15, clientY: 15, button: 0 }));

    draw.selectFeatures(['bottom', 'top']);
    dragFrom(27, 27, 70, 70); // the dragged squares are now under the pointer
    expect(hovered(map, ['bottom', 'top', 'pt'])).toEqual([]);
  });

  it('applies only the last mouse move of a frame', () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', ((cb: FrameRequestCallback): number => {
      frames.push(cb);
      return frames.length;
    }) as typeof requestAnimationFrame);
    draw.setMode('select');

    moveTo(map, 27, 27); // over 'top'
    moveTo(map, 15, 15); // over 'bottom'
    expect(frames).toHaveLength(1);
    frames.shift()!(0);

    expect(hovered(map, ['bottom', 'top'])).toEqual(['bottom']);
    expect(map.getFeatureState({ source: SOURCE_IDS.FEATURES, id: 'top' })).toEqual({});
  });

  it('is cleared when the mode changes and when the mouse leaves the map', () => {
    draw.setMode('select');
    moveTo(map, 15, 15);
    draw.setMode('rotate');
    expect(hovered(map, ['bottom'])).toEqual([]);

    moveTo(map, 15, 15);
    map.emit('mouseout');
    expect(hovered(map, ['bottom'])).toEqual([]);
  });

  it('comes back after a style swap', () => {
    draw.setMode('select');
    moveTo(map, 15, 15);
    map.setStyle('new-style');

    moveTo(map, 15, 15);
    expect(hovered(map, ['bottom'])).toEqual(['bottom']);
  });
});
