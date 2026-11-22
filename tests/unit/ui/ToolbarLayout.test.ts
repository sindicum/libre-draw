import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Map as MaplibreMap } from 'maplibre-gl';
import { Toolbar, type ToolbarCallbacks } from '../../../src/ui/Toolbar';

// happy-dom does no layout, so the sizes the toolbar reads are stubbed.
function stub(el: Element, prop: string, value: number): void {
  Object.defineProperty(el, prop, { configurable: true, get: () => value });
}

function createMap(height: number) {
  const container = document.createElement('div');
  const corner = document.createElement('div');
  corner.className = 'maplibregl-ctrl-top-right';
  container.appendChild(corner);
  let mapHeight = height;
  Object.defineProperty(container, 'clientHeight', { get: () => mapHeight });

  const listeners = new Map<string, Set<() => void>>();
  const map = {
    getContainer: () => container,
    on: vi.fn((type: string, fn: () => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    }),
    off: vi.fn((type: string, fn: () => void) => {
      listeners.get(type)?.delete(fn);
    }),
  };
  return {
    map: map as unknown as MaplibreMap,
    corner,
    setHeight(value: number) {
      mapHeight = value;
    },
    fire(type: string) {
      for (const fn of listeners.get(type) ?? []) fn();
    },
    listenerCount: (type: string) => listeners.get(type)?.size ?? 0,
  };
}

const callbacks = new Proxy({}, { get: () => vi.fn() }) as ToolbarCallbacks;

function createToolbar(mapHeight = 600) {
  const env = createMap(mapHeight);
  const toolbar = new Toolbar(env.map, callbacks);
  const frame = env.corner.querySelector<HTMLDivElement>('.libre-draw-toolbar')!;
  const list = frame.querySelector<HTMLDivElement>('.libre-draw-toolbar-buttons')!;
  return { ...env, toolbar, frame, list };
}

function columns(list: HTMLElement): HTMLElement[] {
  return [...list.children] as HTMLElement[];
}

/** Ids of the buttons in each column, outer column first. */
function idsByColumn(list: HTMLElement): string[][] {
  return columns(list).map((column) =>
    [...column.querySelectorAll('[data-libre-draw-button]')].map((b) =>
      b.getAttribute('data-libre-draw-button')!
    )
  );
}

function firstRow(list: HTMLElement): HTMLElement {
  return columns(list)[0].firstElementChild as HTMLElement;
}

const ORDER = [
  'draw-point',
  'draw-line',
  'draw-polygon',
  'draw-rectangle',
  'draw-angled-rectangle',
  'input-method',
  'select',
  'split',
  'cut',
  'reshape',
  'union',
  'setback',
  'rotate',
  'delete',
  'undo',
  'redo',
];

function rowOf(list: HTMLElement, id: string): HTMLElement {
  return list.querySelector(`[data-libre-draw-button="${id}"]`)!.parentElement!;
}

function visiblePopups(frame: HTMLElement, list: HTMLElement): HTMLElement[] {
  return [...frame.children].filter(
    (el): el is HTMLElement => el !== list && (el as HTMLElement).style.display !== 'none'
  );
}

/** Map containers put in the document, removed after each test. */
const attached: HTMLElement[] = [];

/** Put the map in the document: focus needs the button there. */
function attach(map: MaplibreMap): void {
  const container = map.getContainer();
  document.body.appendChild(container);
  attached.push(container);
}

describe('Toolbar layout', () => {
  afterEach(() => {
    for (const container of attached.splice(0)) container.remove();
  });

  it('scrolls the button list inside the frame and keeps the popups outside it', () => {
    const { frame, list, toolbar } = createToolbar();

    expect(list.parentElement).toBe(frame);
    expect(list.style.overflowY).toBe('auto');
    expect(frame.style.overflowY).toBe('');
    expect(list.querySelectorAll('button[data-libre-draw-button]')).toHaveLength(16);

    toolbar.setActiveMode('setback');
    const [setbackPopup] = visiblePopups(frame, list);
    expect(setbackPopup.parentElement).toBe(frame);
    expect(list.contains(setbackPopup)).toBe(false);
  });

  it('caps the frame at the map height on creation', () => {
    const { frame } = createToolbar(600);

    expect(frame.style.maxHeight).toBe('600px');
  });

  it('leaves room for the other controls in the same corner', () => {
    const { frame, corner, fire } = createToolbar(600);
    // A control of 50px above the toolbar and one of 40px below it.
    stub(frame, 'offsetTop', 50);
    stub(frame, 'offsetHeight', 300);
    stub(corner, 'clientHeight', 390);

    fire('resize');

    expect(frame.style.maxHeight).toBe('510px');
  });

  it('leaves room for the controls below it in a bottom corner', () => {
    const env = createMap(600);
    env.corner.className = 'maplibregl-ctrl-bottom-left';
    new Toolbar(env.map, callbacks, { position: 'bottom-left' });
    const frame = env.corner.querySelector<HTMLDivElement>('.libre-draw-toolbar')!;
    // The attribution control of 30px sits below the toolbar.
    stub(frame, 'offsetTop', 0);
    stub(frame, 'offsetHeight', 300);
    stub(env.corner, 'clientHeight', 330);

    env.fire('resize');

    expect(frame.style.maxHeight).toBe('570px');
  });

  it('follows the map height on resize and stops on destroy', () => {
    const { frame, toolbar, fire, setHeight, listenerCount } = createToolbar(600);

    setHeight(400);
    fire('resize');
    expect(frame.style.maxHeight).toBe('400px');

    toolbar.destroy();
    expect(listenerCount('resize')).toBe(0);
  });

  it('does not cap the frame before the map has a height', () => {
    const { frame } = createToolbar(0);

    expect(frame.style.maxHeight).toBe('');
  });

  it('lays out one painted column while every button fits', () => {
    const { frame, list, fire } = createToolbar(772);
    stub(firstRow(list), 'offsetHeight', 44);
    fire('resize');

    expect(idsByColumn(list)).toEqual([ORDER, []]);
    const [outer, inner] = columns(list);
    expect(inner.style.display).toBe('none');
    expect(outer.style.backgroundColor).not.toBe('');
    expect(outer.style.borderTopLeftRadius).toBe('4px');
    expect(outer.style.borderBottomLeftRadius).toBe('4px');
    // Only the painted column takes pointer input.
    expect(frame.style.backgroundColor).toBe('');
    expect(frame.style.pointerEvents).toBe('none');
    expect(outer.style.pointerEvents).toBe('auto');
  });

  it.each([
    ['top-right', 'row-reverse'],
    ['bottom-right', 'row-reverse'],
    ['top-left', 'row'],
    ['bottom-left', 'row'],
  ] as const)(
    'in %s, fills the outer column and moves the rest to an inner column on the map side',
    (position, direction) => {
      const env = createMap(500);
      env.corner.className = `maplibregl-ctrl-${position}`;
      new Toolbar(env.map, callbacks, { position });
      const list = env.corner.querySelector<HTMLDivElement>('.libre-draw-toolbar-buttons')!;
      stub(firstRow(list), 'offsetHeight', 44);
      env.fire('resize');

      // 500px holds 10 rows: the outer column is full and the other 6 move over.
      expect(idsByColumn(list)).toEqual([ORDER.slice(0, 10), ORDER.slice(10)]);
      expect(list.style.flexDirection).toBe(direction);
      expect(columns(list)[1].style.display).toBe('flex');
    }
  );

  it('cuts the background to the columns: square where they meet, round where the outer sticks out', () => {
    const env = createMap(500);
    env.corner.className = 'maplibregl-ctrl-top-left';
    const toolbar = new Toolbar(env.map, callbacks, { position: 'top-left' });
    const frame = env.corner.querySelector<HTMLDivElement>('.libre-draw-toolbar')!;
    const list = frame.querySelector<HTMLDivElement>('.libre-draw-toolbar-buttons')!;
    stub(firstRow(list), 'offsetHeight', 44);
    env.fire('resize');
    const [outer, inner] = columns(list);

    // Left corner: the outer column is on the left, the inner one on its right.
    expect(outer.style.borderTopLeftRadius).toBe('4px');
    expect(outer.style.borderBottomLeftRadius).toBe('4px');
    expect(outer.style.borderTopRightRadius).toBe('0px');
    expect(outer.style.borderBottomRightRadius).toBe('4px');
    expect(inner.style.borderTopLeftRadius).toBe('0px');
    expect(inner.style.borderBottomLeftRadius).toBe('0px');
    expect(inner.style.borderTopRightRadius).toBe('4px');
    expect(inner.style.borderBottomRightRadius).toBe('4px');
    expect(inner.style.paddingLeft).toBe('0px');
    expect(inner.style.paddingRight).toBe('4px');
    // The unpainted corner below the inner column passes clicks to the map.
    expect(list.style.pointerEvents).toBe('none');
    expect(list.style.filter).toContain('drop-shadow');

    // Two equal columns (scrolling): the bottom where they meet is square too.
    env.setHeight(300);
    env.fire('resize');
    expect(idsByColumn(list).map((ids) => ids.length)).toEqual([8, 8]);
    expect(outer.style.borderBottomRightRadius).toBe('0px');
    toolbar.destroy();
  });

  it('in a right corner, mirrors the corners and the padding between the columns', () => {
    const env = createMap(500);
    env.corner.className = 'maplibregl-ctrl-top-right';
    new Toolbar(env.map, callbacks, { position: 'top-right' });
    const list = env.corner.querySelector<HTMLDivElement>('.libre-draw-toolbar-buttons')!;
    stub(firstRow(list), 'offsetHeight', 44);
    env.fire('resize');
    const [outer, inner] = columns(list);

    // Right corner: the outer column is on the right, the inner one on its left.
    expect(outer.style.borderTopRightRadius).toBe('4px');
    expect(outer.style.borderBottomRightRadius).toBe('4px');
    expect(outer.style.borderTopLeftRadius).toBe('0px');
    expect(outer.style.borderBottomLeftRadius).toBe('4px');
    expect(inner.style.borderTopRightRadius).toBe('0px');
    expect(inner.style.borderBottomRightRadius).toBe('0px');
    expect(inner.style.borderTopLeftRadius).toBe('4px');
    expect(inner.style.borderBottomLeftRadius).toBe('4px');
    expect(inner.style.paddingRight).toBe('0px');
    expect(inner.style.paddingLeft).toBe('4px');
  });

  it('keeps the focus on a button that stays in its column when the other rows move', () => {
    const { map, list, fire, setHeight } = createToolbar(1000);
    attach(map);
    stub(firstRow(list), 'offsetHeight', 44);
    fire('resize');
    const point = list.querySelector<HTMLButtonElement>('[data-libre-draw-button="draw-point"]')!;
    point.focus();

    // One column to two: the last six rows move over, draw-point stays.
    setHeight(500);
    fire('resize');
    expect(idsByColumn(list)).toEqual([ORDER.slice(0, 10), ORDER.slice(10)]);
    expect(document.activeElement).toBe(point);

    // And back: the moved rows return, draw-point stays.
    setHeight(1000);
    fire('resize');
    expect(idsByColumn(list)).toEqual([ORDER, []]);
    expect(document.activeElement).toBe(point);
  });

  it('keeps the focus on a button when a resize does not change the layout', () => {
    const { map, list, fire } = createToolbar(500);
    attach(map);
    stub(firstRow(list), 'offsetHeight', 44);
    fire('resize');
    const redo = list.querySelector<HTMLButtonElement>('[data-libre-draw-button="redo"]')!;
    redo.focus();
    expect(document.activeElement).toBe(redo);

    fire('resize');

    expect(document.activeElement).toBe(redo);
  });

  it('lets the list take pointer input while it scrolls, for its scrollbar', () => {
    const { list, fire } = createToolbar(300);
    stub(firstRow(list), 'offsetHeight', 44);
    stub(list, 'scrollHeight', 388);
    stub(list, 'clientHeight', 300);
    fire('resize');

    expect(list.style.pointerEvents).toBe('auto');
  });

  it('keeps the button order when the map shrinks in steps', () => {
    // 720px holds 14 rows: undo and redo move over first.
    const { list, fire, setHeight } = createToolbar(720);
    stub(firstRow(list), 'offsetHeight', 44);
    fire('resize');
    expect(idsByColumn(list)).toEqual([ORDER.slice(0, 14), ORDER.slice(14)]);

    setHeight(500);
    fire('resize');
    expect(idsByColumn(list)).toEqual([ORDER.slice(0, 10), ORDER.slice(10)]);
  });

  it('keeps the button order when the map grows in steps and stays two columns', () => {
    // 500px holds 10 rows, 720px holds 14: four rows come back from the
    // front of the inner column.
    const { list, fire, setHeight } = createToolbar(500);
    stub(firstRow(list), 'offsetHeight', 44);
    fire('resize');
    expect(idsByColumn(list)).toEqual([ORDER.slice(0, 10), ORDER.slice(10)]);

    setHeight(720);
    fire('resize');
    expect(idsByColumn(list)).toEqual([ORDER.slice(0, 14), ORDER.slice(14)]);
  });

  it('keeps the focus on a button that stays in the inner column when rows enter or leave it', () => {
    const { map, list, fire, setHeight } = createToolbar(500);
    attach(map);
    stub(firstRow(list), 'offsetHeight', 44);
    fire('resize');
    const redo = list.querySelector<HTMLButtonElement>('[data-libre-draw-button="redo"]')!;
    redo.focus();

    // 483px holds 9 rows: one row enters the front of the inner column.
    setHeight(483);
    fire('resize');
    expect(idsByColumn(list)).toEqual([ORDER.slice(0, 9), ORDER.slice(9)]);
    expect(document.activeElement).toBe(redo);

    // Back to 500px: that row leaves the front of the inner column.
    setHeight(500);
    fire('resize');
    expect(idsByColumn(list)).toEqual([ORDER.slice(0, 10), ORDER.slice(10)]);
    expect(document.activeElement).toBe(redo);
  });

  it('goes back to one column when the map grows, keeping the button order', () => {
    const { list, fire, setHeight } = createToolbar(300);
    stub(firstRow(list), 'offsetHeight', 44);
    fire('resize');
    expect(idsByColumn(list)).toEqual([ORDER.slice(0, 8), ORDER.slice(8)]);

    setHeight(1000);
    fire('resize');
    expect(idsByColumn(list)).toEqual([ORDER, []]);
    expect(columns(list)[1].style.display).toBe('none');
  });

  it('aligns a popup with its row, minus the scroll, kept inside the frame', () => {
    const { frame, list, toolbar } = createToolbar();
    stub(rowOf(list, 'setback'), 'offsetTop', 300);
    stub(frame, 'clientHeight', 400);
    toolbar.setActiveMode('setback');
    const [popup] = visiblePopups(frame, list);
    stub(popup, 'offsetHeight', 54);

    list.scrollTop = 120;
    list.dispatchEvent(new Event('scroll'));
    expect(popup.style.top).toBe('180px');

    // The row scrolled below the frame: the popup stays at the bottom edge.
    list.scrollTop = 0;
    stub(frame, 'clientHeight', 200);
    list.dispatchEvent(new Event('scroll'));
    expect(popup.style.top).toBe('146px');

    // The row scrolled above the frame: the popup stays at the top edge.
    list.scrollTop = 400;
    list.dispatchEvent(new Event('scroll'));
    expect(popup.style.top).toBe('0px');
  });
});
