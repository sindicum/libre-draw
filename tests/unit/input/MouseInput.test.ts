import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Map as MaplibreMap } from 'maplibre-gl';
import { MouseInput } from '../../../src/input/MouseInput';

function createMapMock(canvas: HTMLElement): MaplibreMap {
  return {
    getCanvasContainer: () => canvas,
    unproject: ([x, y]: [number, number]) => ({ lng: x, lat: y }),
  } as unknown as MaplibreMap;
}

function createRect(): DOMRect {
  return {
    x: 0,
    y: 0,
    width: 500,
    height: 300,
    top: 0,
    left: 0,
    right: 500,
    bottom: 300,
    toJSON: () => ({}),
  } as DOMRect;
}

describe('MouseInput', () => {
  let canvas: HTMLDivElement;
  let input: MouseInput;
  let callbacks: {
    onPointerDown: ReturnType<typeof vi.fn>;
    onPointerMove: ReturnType<typeof vi.fn>;
    onPointerUp: ReturnType<typeof vi.fn>;
    onDoubleClick: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    canvas = document.createElement('div');
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(createRect());

    callbacks = {
      onPointerDown: vi.fn(),
      onPointerMove: vi.fn(),
      onPointerUp: vi.fn(),
      onDoubleClick: vi.fn(),
    };

    input = new MouseInput(createMapMock(canvas), callbacks);
    input.enable();
  });

  afterEach(() => {
    input.destroy();
    vi.restoreAllMocks();
  });

  it('should capture mouseup on window after dragging outside canvas', () => {
    canvas.dispatchEvent(
      new MouseEvent('mousedown', {
        clientX: 10,
        clientY: 20,
        bubbles: true,
      })
    );

    window.dispatchEvent(
      new MouseEvent('mouseup', {
        clientX: 250,
        clientY: 180,
        bubbles: true,
      })
    );

    expect(callbacks.onPointerUp).toHaveBeenCalledTimes(1);
    expect(callbacks.onPointerUp).toHaveBeenCalledWith(
      expect.objectContaining({
        point: { x: 250, y: 180 },
      })
    );
  });

  it('should track mousemove on window only while dragging', () => {
    canvas.dispatchEvent(
      new MouseEvent('mousedown', {
        clientX: 10,
        clientY: 10,
        bubbles: true,
      })
    );

    window.dispatchEvent(
      new MouseEvent('mousemove', {
        clientX: 100,
        clientY: 120,
        bubbles: true,
      })
    );
    expect(callbacks.onPointerMove).toHaveBeenCalledTimes(1);

    window.dispatchEvent(
      new MouseEvent('mouseup', {
        clientX: 100,
        clientY: 120,
        bubbles: true,
      })
    );

    window.dispatchEvent(
      new MouseEvent('mousemove', {
        clientX: 200,
        clientY: 220,
        bubbles: true,
      })
    );
    expect(callbacks.onPointerMove).toHaveBeenCalledTimes(1);
  });

  it('should continue hover move on canvas when not dragging', () => {
    canvas.dispatchEvent(
      new MouseEvent('mousemove', {
        clientX: 40,
        clientY: 60,
        bubbles: true,
      })
    );
    expect(callbacks.onPointerMove).toHaveBeenCalledTimes(1);

    window.dispatchEvent(
      new MouseEvent('mousemove', {
        clientX: 80,
        clientY: 90,
        bubbles: true,
      })
    );
    expect(callbacks.onPointerMove).toHaveBeenCalledTimes(1);
  });
});
