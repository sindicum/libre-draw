import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Map as MaplibreMap } from 'maplibre-gl';
import { ReticleInput } from '../../../src/input/ReticleInput';
import type { Mode } from '../../../src/modes/Mode';
import type { NormalizedInputEvent } from '../../../src/types/input';

function createMap() {
  const listeners = new Map<string, Set<() => void>>();
  const container = document.createElement('div');
  Object.defineProperty(container, 'clientWidth', { value: 400 });
  Object.defineProperty(container, 'clientHeight', { value: 300 });
  const map = {
    getContainer: () => container,
    // Pretend the map is panned by (1000, 2000).
    unproject: ([x, y]: [number, number]) => ({ lng: x + 1000, lat: y + 2000 }),
    on: vi.fn((type: string, fn: () => void) => {
      const set = listeners.get(type) ?? new Set();
      set.add(fn);
      listeners.set(type, set);
    }),
    off: vi.fn((type: string, fn: () => void) => listeners.get(type)?.delete(fn)),
  };
  const emit = (type: string) => listeners.get(type)?.forEach((fn) => fn());
  return { map: map as unknown as MaplibreMap, raw: map, emit };
}

function createMode() {
  return {
    onPointerDown: vi.fn(),
    onPointerMove: vi.fn(),
    onPointerUp: vi.fn(),
  };
}

describe('ReticleInput', () => {
  let active: boolean;
  let mode: ReturnType<typeof createMode>;
  let setup: ReturnType<typeof createMap>;
  let reticle: ReticleInput;

  beforeEach(() => {
    active = true;
    mode = createMode();
    setup = createMap();
    reticle = new ReticleInput(
      setup.map,
      () => mode as unknown as Mode,
      () => active
    );
  });

  it('places a point as a mouse click at the center of the map container', () => {
    reticle.addPoint();

    expect(mode.onPointerDown).toHaveBeenCalledOnce();
    expect(mode.onPointerUp).toHaveBeenCalledOnce();
    const event: NormalizedInputEvent = mode.onPointerDown.mock.calls[0][0];
    expect(event.point).toEqual({ x: 200, y: 150 });
    expect(event.lngLat).toEqual({ lng: 1200, lat: 2150 });
    expect(event.inputType).toBe('mouse');
    expect(event.originalEvent).toBeInstanceOf(MouseEvent);
    expect(mode.onPointerUp.mock.calls[0][0]).toEqual(event);
  });

  it('uses the layout size, not the on-screen size of a CSS-scaled map', () => {
    // transform: scale(0.5) halves the on-screen box but not the layout size
    // MapLibre projects with, so the center must come from the latter.
    vi.spyOn(setup.map.getContainer(), 'getBoundingClientRect').mockReturnValue({
      width: 200,
      height: 150,
    } as DOMRect);

    reticle.addPoint();

    expect(mode.onPointerDown.mock.calls[0][0].point).toEqual({ x: 200, y: 150 });
  });

  it('hovers at the center right after placing, in order down → up → move', () => {
    const order: string[] = [];
    mode.onPointerDown.mockImplementation(() => order.push('down'));
    mode.onPointerUp.mockImplementation(() => order.push('up'));
    mode.onPointerMove.mockImplementation(() => order.push('move'));

    reticle.addPoint();

    expect(order).toEqual(['down', 'up', 'move']);
  });

  it('hovers at the center on every map move once enabled', () => {
    setup.emit('move');
    expect(mode.onPointerMove).not.toHaveBeenCalled();

    reticle.enable();
    setup.emit('move');
    setup.emit('move');

    expect(mode.onPointerMove).toHaveBeenCalledTimes(2);
    expect(mode.onPointerMove.mock.calls[0][0].point).toEqual({ x: 200, y: 150 });
  });

  it('registers the move listener once however often it is enabled', () => {
    reticle.enable();
    reticle.enable();

    expect(setup.raw.on).toHaveBeenCalledOnce();
  });

  it('stops following the map after disable and destroy', () => {
    reticle.enable();
    reticle.disable();
    setup.emit('move');
    reticle.enable();
    reticle.destroy();
    setup.emit('move');

    expect(mode.onPointerMove).not.toHaveBeenCalled();
    expect(setup.raw.off).toHaveBeenCalledTimes(2);
  });

  it('removes the listener only once when disabled repeatedly or before enable', () => {
    reticle.disable();
    expect(setup.raw.off).not.toHaveBeenCalled();

    reticle.enable();
    reticle.disable();
    reticle.disable();
    expect(setup.raw.off).toHaveBeenCalledOnce();
  });

  it('does nothing while inactive', () => {
    active = false;
    reticle.enable();

    reticle.addPoint();
    reticle.syncPreview();
    setup.emit('move');

    expect(mode.onPointerDown).not.toHaveBeenCalled();
    expect(mode.onPointerUp).not.toHaveBeenCalled();
    expect(mode.onPointerMove).not.toHaveBeenCalled();
  });

  it('does nothing without an active mode', () => {
    const noMode = new ReticleInput(
      setup.map,
      () => undefined,
      () => true
    );

    expect(() => {
      noMode.addPoint();
      noMode.syncPreview();
    }).not.toThrow();
  });
});
