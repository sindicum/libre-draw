import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Map as MaplibreMap } from 'maplibre-gl';
import { TouchInput } from '../../../src/input/TouchInput';

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

function createTouchLike(identifier: number, clientX: number, clientY: number): Touch {
  return {
    identifier,
    clientX,
    clientY,
  } as Touch;
}

function dispatchTouchEvent(
  target: HTMLElement,
  type: 'touchstart' | 'touchmove' | 'touchend' | 'touchcancel',
  touches: Touch[],
  changedTouches: Touch[]
): void {
  const event = new Event(type, { bubbles: true, cancelable: true }) as TouchEvent;
  Object.defineProperty(event, 'touches', {
    value: touches,
    configurable: true,
  });
  Object.defineProperty(event, 'changedTouches', {
    value: changedTouches,
    configurable: true,
  });
  target.dispatchEvent(event as unknown as Event);
}

describe('TouchInput', () => {
  let canvas: HTMLDivElement;
  let input: TouchInput;
  let callbacks: {
    onPointerDown: ReturnType<typeof vi.fn>;
    onPointerMove: ReturnType<typeof vi.fn>;
    onPointerUp: ReturnType<typeof vi.fn>;
    onDoubleClick: ReturnType<typeof vi.fn>;
    onLongPress: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    canvas = document.createElement('div');
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(createRect());

    callbacks = {
      onPointerDown: vi.fn(),
      onPointerMove: vi.fn(),
      onPointerUp: vi.fn(),
      onDoubleClick: vi.fn(),
      onLongPress: vi.fn(),
    };

    input = new TouchInput(createMapMock(canvas), callbacks);
    input.enable();
  });

  afterEach(() => {
    input.destroy();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should end pointer interaction on long press and suppress double tap in same series', () => {
    const touch = createTouchLike(1, 10, 10);

    dispatchTouchEvent(canvas, 'touchstart', [touch], [touch]);
    expect(callbacks.onPointerDown).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(500);
    expect(callbacks.onLongPress).toHaveBeenCalledTimes(1);
    expect(callbacks.onPointerUp).toHaveBeenCalledTimes(1);

    dispatchTouchEvent(canvas, 'touchend', [], [touch]);

    expect(callbacks.onPointerUp).toHaveBeenCalledTimes(1);
    expect(callbacks.onDoubleClick).not.toHaveBeenCalled();
  });

  it('should end active pointer when switching from single touch to pinch', () => {
    const first = createTouchLike(1, 10, 10);
    const second = createTouchLike(2, 20, 20);

    dispatchTouchEvent(canvas, 'touchstart', [first], [first]);
    expect(callbacks.onPointerDown).toHaveBeenCalledTimes(1);

    dispatchTouchEvent(canvas, 'touchstart', [first, second], [second]);
    expect(callbacks.onPointerUp).toHaveBeenCalledTimes(1);
  });

  it('should end pointer on touchcancel and clear pending long press', () => {
    const touch = createTouchLike(1, 30, 40);

    dispatchTouchEvent(canvas, 'touchstart', [touch], [touch]);
    dispatchTouchEvent(canvas, 'touchcancel', [], [touch]);

    expect(callbacks.onPointerUp).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(500);
    expect(callbacks.onLongPress).not.toHaveBeenCalled();
  });
});
