import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LibreDraw } from '../../src/LibreDraw';
import type { CreateEvent, UpdateEvent } from '../../src/types/events';
import type { Position } from '../../src/types/features';
import { FakeMap } from './helpers/fakeMap';

function square(id: string, x: number, y: number, size: number): GeoJSON.Feature {
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

function clickAt(map: FakeMap, x: number, y: number): void {
  map
    .getCanvasContainer()
    .dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: x, clientY: y }));
  window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: x, clientY: y }));
}

/**
 * Each test pins one sentence of docs/api that no other test holds.
 * FakeMap projects 1:1, so a difference in degrees is the same number of
 * screen pixels.
 */
describe('docs/api contracts', () => {
  let draw: LibreDraw;

  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', ((cb: FrameRequestCallback): number => {
      cb(0);
      return 1;
    }) as typeof requestAnimationFrame);
  });

  afterEach(() => {
    draw.destroy();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // events.md, `update`: feature / oldFeature describe the direction of the change.
  it('undo of updateFeature() emits update with feature = restored shape and oldFeature = the undone one', () => {
    draw = new LibreDraw(new FakeMap().asMap(), { toolbar: false });
    const original = square('a', 10, 10, 20);
    const bigger = square('a', 10, 10, 40).geometry;
    draw.addFeatures([original]);
    expect(draw.updateFeature('a', { geometry: bigger }).ok).toBe(true);

    const updates: UpdateEvent[] = [];
    draw.on('update', (e) => updates.push(e));

    expect(draw.undo()).toBe(true);

    expect(updates).toHaveLength(1);
    expect(updates[0].feature.geometry).toEqual(original.geometry);
    expect(updates[0].oldFeature.geometry).toEqual(bigger);
  });

  // events.md, `delete` / `split`: redoing a split deletes the original before split fires again.
  it('redo of a split emits delete for the original and then split', () => {
    draw = new LibreDraw(new FakeMap().asMap(), { toolbar: false });
    draw.addFeatures([square('a', 10, 10, 20)]);
    const line: [Position, Position] = [
      [20, 0],
      [20, 40],
    ];
    expect(draw.split('a', line).ok).toBe(true);
    expect(draw.undo()).toBe(true);

    const sequence: string[] = [];
    draw.on('delete', (e) => sequence.push(`delete:${e.feature.id}`));
    draw.on('split', (e) => sequence.push(`split:${e.originalFeature.id}`));

    expect(draw.redo()).toBe(true);

    expect(sequence).toEqual(['delete:a', 'split:a']);
  });

  // types.md, LibreDrawOptions.snap: false disables snapping.
  it('snap: false places a point where it was clicked, even 3px from a vertex', () => {
    const map = new FakeMap();
    draw = new LibreDraw(map.asMap(), { toolbar: false, snap: false });
    draw.addFeatures([square('s', 43, 20, 40)]);
    const creates: CreateEvent[] = [];
    draw.on('create', (e) => creates.push(e));
    draw.setMode('draw-point');

    clickAt(map, 40, 20);

    expect(creates).toHaveLength(1);
    expect(creates[0].feature.geometry).toEqual({ type: 'Point', coordinates: [40, 20] });
  });

  // types.md, SnapConfig.threshold: values below 1 are clamped to 1.
  it('snap.threshold: 0 still snaps within 1px', () => {
    const map = new FakeMap();
    draw = new LibreDraw(map.asMap(), { toolbar: false, snap: { threshold: 0 } });
    draw.addFeatures([square('s', 43, 20, 40)]);
    const creates: CreateEvent[] = [];
    draw.on('create', (e) => creates.push(e));
    draw.setMode('draw-point');

    clickAt(map, 42.5, 20);

    expect(creates).toHaveLength(1);
    expect(creates[0].feature.geometry).toEqual({ type: 'Point', coordinates: [43, 20] });
  });
});
