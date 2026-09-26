import { afterEach, describe, expect, it, vi } from 'vitest';
import { LibreDraw } from '../../src/LibreDraw';
import { LibreDrawError } from '../../src/core/errors';
import { SOURCE_IDS } from '../../src/rendering/SourceManager';
import type { ModeName } from '../../src/types/mode';
import type { CreateEvent, DraftChangeEvent } from '../../src/types/events';
import { FakeMap } from './helpers/fakeMap';

/**
 * The FakeMap canvas is 1000 x 600, so the reticle sits at screen (500, 300)
 * and marks (500 + dx, 300 + dy) after `map.panTo(dx, dy)`.
 */
const CENTER = { x: 500, y: 300 };

function setup(options: ConstructorParameters<typeof LibreDraw>[1] = {}) {
  const map = new FakeMap();
  document.body.appendChild(map.getContainer());
  const draw = new LibreDraw(map.asMap(), { toolbar: false, inputMethod: 'reticle', ...options });
  const creates: CreateEvent[] = [];
  const drafts: DraftChangeEvent[] = [];
  draw.on('create', (e) => creates.push(e));
  draw.on('draftchange', (e) => drafts.push(e));

  const container = map.getContainer();
  const reticle = () => container.querySelector<HTMLDivElement>('.libre-draw-reticle')!;
  const bar = () => container.querySelector<HTMLDivElement>('.libre-draw-reticle-bar')!;
  const button = (label: string) =>
    bar().querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
  const addPoint = () => button('Add point').click();
  /** Aim the reticle at (lng, lat) and press "Add point". */
  const addPointAt = (lng: number, lat: number) => {
    map.panTo(lng - CENTER.x, lat - CENTER.y);
    addPoint();
  };
  const click = (x: number, y: number) => {
    const canvas = map.getCanvasContainer();
    canvas.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: x, clientY: y }));
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: x, clientY: y }));
  };
  return { map, draw, creates, drafts, reticle, bar, button, addPoint, addPointAt, click };
}

describe('Center reticle input (F-028)', () => {
  let current: ReturnType<typeof setup> | null = null;
  const start = (options?: ConstructorParameters<typeof LibreDraw>[1]) => {
    current = setup(options);
    return current;
  };

  afterEach(() => {
    current?.draw.destroy();
    current?.map.getContainer().remove();
    current = null;
  });

  it('defaults to tap input and shows no reticle', () => {
    const { draw, reticle } = start({ inputMethod: undefined });
    draw.setMode('draw-polygon');

    expect(draw.getInputMethod()).toBe('tap');
    expect(reticle().style.display).toBe('none');
  });

  it('draws a polygon by panning and adding points, finishing on the first vertex', () => {
    const { draw, creates, addPointAt } = start();
    expect(draw.getInputMethod()).toBe('reticle');
    draw.setMode('draw-polygon');

    addPointAt(10, 10);
    addPointAt(60, 10);
    addPointAt(35, 60);
    expect(draw.getDraftVertexCount()).toBe(3);

    addPointAt(10, 10);

    expect(creates).toHaveLength(1);
    expect(creates[0].feature.geometry).toEqual({
      type: 'Polygon',
      coordinates: [
        [
          [10, 10],
          [60, 10],
          [35, 60],
          [10, 10],
        ],
      ],
    });
    expect(creates[0].origin).toBe('user');
    expect(draw.getDraftVertexCount()).toBe(0);

    expect(draw.undo()).toBe(true);
    expect(draw.getFeatures()).toHaveLength(0);
  });

  it('places a point in draw-point mode', () => {
    const { draw, creates, addPointAt } = start();
    draw.setMode('draw-point');

    addPointAt(20, 30);

    expect(creates).toHaveLength(1);
    expect(creates[0].feature.geometry).toEqual({ type: 'Point', coordinates: [20, 30] });
  });

  it('finishes a line when adding again on the last vertex', () => {
    const { draw, creates, addPointAt, addPoint } = start();
    draw.setMode('draw-line');

    addPointAt(10, 10);
    addPointAt(60, 40);
    addPoint(); // the reticle still sits on the last vertex

    expect(creates).toHaveLength(1);
    expect(creates[0].feature.geometry).toEqual({
      type: 'LineString',
      coordinates: [
        [10, 10],
        [60, 40],
      ],
    });
  });

  it('draws a rectangle from two points', () => {
    const { draw, creates, addPointAt } = start();
    draw.setMode('draw-rectangle');

    addPointAt(10, 10);
    expect(draw.getDraftVertexCount()).toBe(1);
    addPointAt(60, 50);

    expect(creates).toHaveLength(1);
    expect(creates[0].feature.geometry.type).toBe('Polygon');
  });

  it('draws an angled rectangle from three points', () => {
    const { draw, creates, addPointAt } = start();
    draw.setMode('draw-angled-rectangle');

    addPointAt(10, 10);
    addPointAt(60, 35);
    expect(draw.getDraftVertexCount()).toBe(2);
    addPointAt(50, 80);

    expect(creates).toHaveLength(1);
    expect(creates[0].feature.geometry.type).toBe('Polygon');
  });

  it('keeps the map pannable in drawing modes', () => {
    const { map, draw } = start();
    map.dragPan.enable.mockClear();
    map.dragPan.disable.mockClear();

    // draw-polygon and draw-line disable dragPan with tap input.
    draw.setMode('draw-polygon');
    expect(map.dragPan.enable).toHaveBeenCalled();
    expect(map.dragPan.disable).not.toHaveBeenCalled();

    draw.setMode('draw-line');
    expect(map.dragPan.disable).not.toHaveBeenCalled();
  });

  it('switches dragPan back to the mode setting when tap input is chosen', () => {
    const { map, draw } = start();
    draw.setMode('draw-polygon');
    map.dragPan.disable.mockClear();

    draw.setInputMethod('tap');

    expect(map.dragPan.disable).toHaveBeenCalledOnce();
  });

  it('ignores clicks on the map while drawing', () => {
    const { draw, drafts, click } = start();
    draw.setMode('draw-polygon');
    drafts.length = 0;

    click(100, 100);
    click(200, 100);

    expect(draw.getDraftVertexCount()).toBe(0);
    expect(drafts).toHaveLength(0);
  });

  it('snaps the added point to a nearby vertex and shows the indicator while aiming', () => {
    const { map, draw, creates, addPointAt } = start();
    draw.addFeatures([
      {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [43, 20],
              [80, 20],
              [80, 60],
              [43, 20],
            ],
          ],
        },
      },
    ]);
    creates.length = 0;
    draw.setMode('draw-point');

    map.panTo(40 - CENTER.x, 20 - CENTER.y); // reticle at (40, 20), 3px from the vertex
    expect(map.getSourceData(SOURCE_IDS.SNAP_INDICATOR)?.features).toHaveLength(1);

    addPointAt(40, 20);

    expect(creates).toHaveLength(1);
    expect(creates[0].feature.geometry).toEqual({ type: 'Point', coordinates: [43, 20] });
  });

  it('moves the draft preview with the map', () => {
    const { map, draw, addPointAt } = start();
    draw.setMode('draw-line');
    addPointAt(10, 10);

    map.panTo(60 - CENTER.x, 40 - CENTER.y);

    const preview = map.getSourceData(SOURCE_IDS.PREVIEW)?.features[0];
    expect(preview?.geometry).toEqual({
      type: 'LineString',
      coordinates: [
        [10, 10],
        [60, 40],
      ],
    });
  });

  it('keeps the draft when the input method changes while drawing', () => {
    const { draw, creates, addPointAt, click } = start();
    draw.setMode('draw-polygon');
    addPointAt(10, 10);
    addPointAt(60, 10);

    draw.setInputMethod('tap');
    expect(draw.getDraftVertexCount()).toBe(2);
    // A tap on (35, 60): the last aim left the view panned so that the
    // center shows (60, 10), and screen = lng / lat - offset.
    click(35 - (60 - CENTER.x), 60 - (10 - CENTER.y));
    expect(draw.getDraftVertexCount()).toBe(3);

    draw.setInputMethod('reticle');
    addPointAt(10, 10);

    expect(creates).toHaveLength(1);
  });

  it('shows the reticle only in drawing modes and leaves other modes on taps', () => {
    const { draw, reticle, bar, click } = start();
    const shown = (mode: ModeName) => {
      draw.setMode(mode);
      return reticle().style.display !== 'none' && bar().style.display !== 'none';
    };

    expect(shown('draw-point')).toBe(true);
    expect(shown('draw-line')).toBe(true);
    expect(shown('draw-polygon')).toBe(true);
    expect(shown('draw-rectangle')).toBe(true);
    expect(shown('draw-angled-rectangle')).toBe(true);
    expect(shown('select')).toBe(false);
    expect(shown('rotate')).toBe(false);
    expect(shown('idle')).toBe(false);

    draw.addFeatures([
      {
        id: 'p',
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [10, 10],
              [60, 10],
              [60, 60],
              [10, 10],
            ],
          ],
        },
      },
    ]);
    draw.setMode('select');
    click(50, 20);
    expect(draw.getSelectedFeatureIds()).toEqual(['p']);
  });

  it('hides the reticle when tap input is chosen and shows it again', () => {
    const { draw, reticle } = start();
    draw.setMode('draw-polygon');

    draw.setInputMethod('tap');
    expect(reticle().style.display).toBe('none');
    draw.setInputMethod('reticle');
    expect(reticle().style.display).toBe('block');
  });

  it('works with the toolbar shown as well', () => {
    const { draw, creates, addPointAt } = start({ toolbar: true });
    draw.setMode('draw-point');

    addPointAt(20, 30);

    expect(creates).toHaveLength(1);
  });

  it('rejects an unknown input method from the option and from the method', () => {
    const map = new FakeMap();
    expect(
      () => new LibreDraw(map.asMap(), { inputMethod: 'crosshair' as unknown as 'tap' })
    ).toThrow(LibreDrawError);

    const { draw } = start();
    expect(() => draw.setInputMethod('touch' as unknown as 'tap')).toThrow(
      'Unsupported input method: touch'
    );
    expect(draw.getInputMethod()).toBe('reticle');
  });

  describe('undo point and finish (item X)', () => {
    it('finishes a polygon with the finish button, as finishDrawing() does', () => {
      const { draw, creates, button, addPointAt } = start();
      draw.setMode('draw-polygon');
      addPointAt(10, 10);
      addPointAt(60, 10);
      addPointAt(35, 60);

      button('Finish').click();

      expect(creates).toHaveLength(1);
      expect(creates[0].origin).toBe('user');
      expect(creates[0].feature.geometry.type).toBe('Polygon');
      expect(draw.getDraftVertexCount()).toBe(0);
    });

    it('takes back the last point with the undo button and emits draftchange', () => {
      const { draw, drafts, button, addPointAt } = start();
      draw.setMode('draw-polygon');
      addPointAt(10, 10);
      addPointAt(60, 10);
      drafts.length = 0;

      button('Undo point').click();

      expect(draw.getDraftVertexCount()).toBe(1);
      expect(drafts).toEqual([{ vertexCount: 1, origin: 'user' }]);
    });

    it('leaves no indicator on a removed vertex and points the preview at the reticle', () => {
      const { map, draw, button, addPointAt } = start();
      const indicator = () => map.getSourceData(SOURCE_IDS.SNAP_INDICATOR)?.features ?? [];
      const preview = () => map.getSourceData(SOURCE_IDS.PREVIEW)?.features[0]?.geometry;

      draw.setMode('draw-line');
      addPointAt(10, 10);
      addPointAt(60, 40);
      // The reticle sits on the last vertex, so the indicator marks it.
      expect(indicator()).toHaveLength(1);

      button('Undo point').click();
      // The reticle (still at (60, 40)) is back to being the hover point.
      expect(preview()).toEqual({
        type: 'LineString',
        coordinates: [
          [10, 10],
          [60, 40],
        ],
      });
      map.panTo(30 - CENTER.x, 50 - CENTER.y);
      expect(indicator()).toHaveLength(0);

      addPointAt(10, 10);
      button('Undo point').click();
      button('Undo point').click();
      expect(draw.getDraftVertexCount()).toBe(0);
      expect(indicator()).toHaveLength(0);
    });

    it('re-aims the preview after undoLastVertex() too', () => {
      const { map, draw, addPointAt } = start();
      draw.setMode('draw-line');
      addPointAt(10, 10);
      addPointAt(60, 40);
      map.panTo(30 - CENTER.x, 50 - CENTER.y);

      draw.undoLastVertex();

      expect(map.getSourceData(SOURCE_IDS.PREVIEW)?.features[0]?.geometry).toEqual({
        type: 'LineString',
        coordinates: [
          [10, 10],
          [30, 50],
        ],
      });
    });

    it('enables the buttons as the polygon draft grows and shrinks', () => {
      const { draw, button, addPointAt } = start();
      const state = () => [button('Undo point').disabled, button('Finish').disabled];
      draw.setMode('draw-polygon');
      expect(state()).toEqual([true, true]);

      addPointAt(10, 10);
      expect(state()).toEqual([false, true]);
      addPointAt(60, 10);
      expect(state()).toEqual([false, true]);
      addPointAt(35, 60);
      expect(state()).toEqual([false, false]);

      button('Undo point').click();
      expect(state()).toEqual([false, true]);

      addPointAt(35, 60);
      button('Finish').click();
      expect(state()).toEqual([true, true]);
    });

    it('enables finish for a line from two points', () => {
      const { draw, creates, button, addPointAt } = start();
      draw.setMode('draw-line');
      addPointAt(10, 10);
      expect(button('Finish').disabled).toBe(true);
      addPointAt(60, 40);
      expect(button('Finish').disabled).toBe(false);

      button('Finish').click();

      expect(creates).toHaveLength(1);
      expect(creates[0].feature.geometry.type).toBe('LineString');
    });

    it('never enables finish in point and rectangle modes, and undoes their draft points', () => {
      const { draw, button, addPointAt } = start();

      draw.setMode('draw-point');
      addPointAt(20, 30);
      expect(button('Finish').disabled).toBe(true);
      expect(button('Undo point').disabled).toBe(true);

      draw.setMode('draw-rectangle');
      addPointAt(10, 10);
      expect(button('Finish').disabled).toBe(true);
      expect(button('Undo point').disabled).toBe(false);
      button('Undo point').click();
      expect(draw.getDraftVertexCount()).toBe(0);
      expect(button('Undo point').disabled).toBe(true);

      draw.setMode('draw-angled-rectangle');
      addPointAt(10, 10);
      addPointAt(60, 35);
      expect(button('Finish').disabled).toBe(true);
      button('Undo point').click();
      expect(draw.getDraftVertexCount()).toBe(1);
      button('Undo point').click();
      expect(draw.getDraftVertexCount()).toBe(0);
      expect(button('Undo point').disabled).toBe(true);
    });

    it('resets the buttons when the mode changes and when the reticle comes back', () => {
      const { draw, button, addPointAt } = start();
      draw.setMode('draw-polygon');
      addPointAt(10, 10);
      addPointAt(60, 10);
      addPointAt(35, 60);

      draw.setMode('draw-line');
      expect(button('Undo point').disabled).toBe(true);
      expect(button('Finish').disabled).toBe(true);

      addPointAt(10, 10);
      addPointAt(60, 40);
      draw.setInputMethod('tap');
      draw.setInputMethod('reticle');
      expect(button('Undo point').disabled).toBe(false);
      expect(button('Finish').disabled).toBe(false);
    });
  });

  describe('undoLastVertex() (item X)', () => {
    it('takes back the last polygon point, stamped origin api', () => {
      const { draw, drafts, addPointAt } = start({ inputMethod: 'tap' });
      draw.setMode('draw-polygon');
      draw.setInputMethod('reticle');
      addPointAt(10, 10);
      addPointAt(60, 10);
      drafts.length = 0;

      expect(draw.undoLastVertex()).toBe(true);
      expect(draw.getDraftVertexCount()).toBe(1);
      expect(drafts).toEqual([{ vertexCount: 1, origin: 'api' }]);

      expect(draw.undoLastVertex()).toBe(true);
      expect(draw.undoLastVertex()).toBe(false);
    });

    it('returns false in modes without a draft', () => {
      const { draw } = start();

      draw.setMode('draw-point');
      expect(draw.undoLastVertex()).toBe(false);
      draw.setMode('select');
      expect(draw.undoLastVertex()).toBe(false);
      draw.setMode('idle');
      expect(draw.undoLastVertex()).toBe(false);
    });
  });

  describe('toolbar toggle (item X)', () => {
    const toggle = (map: FakeMap) =>
      map
        .getContainer()
        .querySelector<HTMLButtonElement>('button[data-libre-draw-button="input-method"]');

    it('switches the input method and shows it as pressed', () => {
      const { map, draw, reticle } = start({ toolbar: true, inputMethod: 'tap' });
      draw.setMode('draw-polygon');
      const button = toggle(map)!;
      expect(button.getAttribute('aria-pressed')).toBe('false');

      button.click();
      expect(draw.getInputMethod()).toBe('reticle');
      expect(button.getAttribute('aria-pressed')).toBe('true');
      expect(reticle().style.display).toBe('block');

      button.click();
      expect(draw.getInputMethod()).toBe('tap');
      expect(button.getAttribute('aria-pressed')).toBe('false');
      expect(reticle().style.display).toBe('none');
    });

    it('follows changes made through the public method and the option', () => {
      const { map, draw } = start({ toolbar: true });
      const button = toggle(map)!;
      expect(button.getAttribute('aria-pressed')).toBe('true');

      draw.setInputMethod('tap');
      expect(button.getAttribute('aria-pressed')).toBe('false');
    });

    it('can be hidden with controls, leaving the option and methods working', () => {
      const { map, draw } = start({ toolbar: { controls: { inputMethod: false } } });

      expect(toggle(map)).toBeNull();
      expect(draw.getInputMethod()).toBe('reticle');
      draw.setInputMethod('tap');
      expect(draw.getInputMethod()).toBe('tap');
    });

    it('is labelled from the locale and the messages option', () => {
      const ja = start({ toolbar: true, locale: 'ja' });
      expect(toggle(ja.map)!.getAttribute('aria-label')).toBe('中央十字で打点');
      expect(ja.button('完了')).not.toBeNull();
      expect(ja.button('1 つ戻す')).not.toBeNull();
      ja.draw.destroy();
      ja.map.getContainer().remove();
      current = null;

      const custom = start({
        toolbar: true,
        messages: { toolbarInputMethod: 'Crosshair', reticleFinish: 'Done' },
      });
      expect(toggle(custom.map)!.title).toBe('Crosshair');
      expect(custom.button('Done')).not.toBeNull();
    });
  });

  it('removes the reticle and stops following the map on destroy', () => {
    const { map, draw } = start();
    draw.setMode('draw-line');
    const container = map.getContainer();

    draw.destroy();
    current = null;

    expect(container.querySelector('.libre-draw-reticle')).toBeNull();
    expect(container.querySelector('.libre-draw-reticle-bar')).toBeNull();
    expect(() => map.panTo(10, 10)).not.toThrow();
    expect(() => draw.getInputMethod()).toThrow(LibreDrawError);
    expect(() => draw.setInputMethod('tap')).toThrow(LibreDrawError);
    vi.restoreAllMocks();
  });
});
