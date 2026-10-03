import { describe, expect, it, vi } from 'vitest';
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

function rowOf(list: HTMLElement, id: string): HTMLElement {
  return list.querySelector(`[data-libre-draw-button="${id}"]`)!.parentElement!;
}

function visiblePopups(frame: HTMLElement, list: HTMLElement): HTMLElement[] {
  return [...frame.children].filter(
    (el): el is HTMLElement => el !== list && (el as HTMLElement).style.display !== 'none'
  );
}

describe('Toolbar layout', () => {
  it('scrolls the button list inside the frame and keeps the popups outside it', () => {
    const { frame, list, toolbar } = createToolbar();

    expect(list.parentElement).toBe(frame);
    expect(list.style.overflowY).toBe('auto');
    expect(frame.style.overflowY).toBe('');
    expect(list.querySelectorAll('button[data-libre-draw-button]')).toHaveLength(17);

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
