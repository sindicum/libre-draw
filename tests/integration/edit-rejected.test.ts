import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LibreDraw } from '../../src/LibreDraw';
import type { EditRejectedEvent } from '../../src/types/events';
import { FakeMap } from './helpers/fakeMap';

// Contract of docs/api/events.md (editrejected): the origin follows the call
// path, like every other event.

function clickAt(map: FakeMap, x: number, y: number): void {
  const canvas = map.getCanvasContainer();
  canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: x, clientY: y, button: 0 }));
  window.dispatchEvent(new MouseEvent('mouseup', { clientX: x, clientY: y, button: 0 }));
}

/** A square near the antimeridian: a 90° turn pushes a corner past 180°. */
function edgeSquare(): GeoJSON.Feature {
  return {
    id: 'edge',
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [170, 80],
          [179, 80],
          [179, 85],
          [170, 85],
          [170, 80],
        ],
      ],
    },
  };
}

/** Draw a bowtie draft: the closing edge crosses the second edge. */
function drawBowtie(map: FakeMap): void {
  clickAt(map, 100, 100);
  clickAt(map, 300, 100);
  clickAt(map, 100, 300);
  clickAt(map, 300, 300);
}

describe('editrejected', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', ((cb: FrameRequestCallback): number => {
      cb(0);
      return 1;
    }) as typeof requestAnimationFrame);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('reports a refused close on the map as user and from finishDrawing() as api', () => {
    const map = new FakeMap();
    const draw = new LibreDraw(map.asMap(), { toolbar: false });
    const events: EditRejectedEvent[] = [];
    draw.on('editrejected', (e) => events.push(e));
    draw.setMode('draw-polygon');
    drawBowtie(map);

    clickAt(map, 300, 300); // a click on the last vertex finishes
    draw.finishDrawing();

    expect(events).toEqual([
      { action: 'close', reason: 'self-intersection', origin: 'user' },
      { action: 'close', reason: 'self-intersection', origin: 'api' },
    ]);
    expect(draw.getFeatures()).toHaveLength(0);

    draw.destroy();
  });

  it('reports a rotate() that leaves the coordinate range as api', () => {
    const draw = new LibreDraw(new FakeMap().asMap(), { toolbar: false });
    draw.addFeatures([edgeSquare()]);
    const events: EditRejectedEvent[] = [];
    draw.on('editrejected', (e) => events.push(e));

    expect(draw.rotate('edge', 90).ok).toBe(false);
    expect(events).toEqual([
      { action: 'rotate', reason: 'out-of-range', featureId: 'edge', origin: 'api' },
    ]);

    draw.destroy();
  });

  it('reports a rotation from the toolbar angle input as user and keeps the shape', () => {
    const map = new FakeMap();
    const draw = new LibreDraw(map.asMap(), { toolbar: true });
    draw.addFeatures([edgeSquare()]);
    const before = draw.getFeatureById('edge');
    const events: EditRejectedEvent[] = [];
    draw.on('editrejected', (e) => events.push(e));
    draw.setMode('rotate');
    clickAt(map, 175, 82); // FakeMap projects lng / lat to the same pixels

    const control = map.getContainer().querySelector<HTMLDivElement>('.libre-draw-rotate-input')!;
    const input = control.querySelector('input')!;
    input.value = '90';
    input.dispatchEvent(new Event('input'));
    control.querySelector('button')!.click();

    expect(events).toEqual([
      { action: 'rotate', reason: 'out-of-range', featureId: 'edge', origin: 'user' },
    ]);
    expect(draw.getFeatureById('edge')).toEqual(before);
    // Nothing was recorded: one undo takes back the addFeatures step.
    draw.undo();
    expect(draw.getFeatures()).toHaveLength(0);

    draw.destroy();
  });
});
