import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Map as MaplibreMap } from 'maplibre-gl';
import { KeyboardInput } from '../../../src/input/KeyboardInput';
import { InputHandler } from '../../../src/input/InputHandler';
import type { Mode } from '../../../src/modes/Mode';

// KeyboardInput is exercised directly below because it has the simplest DOM
// interaction. MouseInput and TouchInput need a map, so the InputHandler
// suite further down builds a minimal mock of the two methods they call.

describe('KeyboardInput', () => {
  let onKeyDown: ReturnType<typeof vi.fn>;
  let keyboardInput: KeyboardInput;
  let canvas: HTMLElement;

  beforeEach(() => {
    onKeyDown = vi.fn();
    canvas = document.createElement('div');
    keyboardInput = new KeyboardInput(createMapMock(canvas), { onKeyDown });
    keyboardInput.enable();
  });

  afterEach(() => {
    keyboardInput.destroy();
  });

  it('should call onKeyDown when a key is pressed', () => {
    const event = new KeyboardEvent('keydown', { key: 'Escape' });
    canvas.dispatchEvent(event);

    expect(onKeyDown).toHaveBeenCalledWith('Escape', event);
  });

  it('should not call onKeyDown when disabled', () => {
    keyboardInput.disable();
    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(onKeyDown).not.toHaveBeenCalled();
  });

  it('should handle Delete key', () => {
    const event = new KeyboardEvent('keydown', { key: 'Delete' });
    canvas.dispatchEvent(event);

    expect(onKeyDown).toHaveBeenCalledWith('Delete', event);
  });

  it('should handle Backspace key', () => {
    const event = new KeyboardEvent('keydown', { key: 'Backspace' });
    canvas.dispatchEvent(event);

    expect(onKeyDown).toHaveBeenCalledWith('Backspace', event);
  });

  it('should stop receiving events after destroy', () => {
    keyboardInput.destroy();
    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(onKeyDown).not.toHaveBeenCalled();
  });

  it('should re-enable after disable', () => {
    keyboardInput.disable();
    keyboardInput.enable();

    const event = new KeyboardEvent('keydown', { key: 'Escape' });
    canvas.dispatchEvent(event);

    expect(onKeyDown).toHaveBeenCalled();
  });
});

function createMapMock(canvas: HTMLElement): MaplibreMap {
  return {
    getCanvasContainer: () => canvas,
    getContainer: () => canvas,
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

function dispatchTouchEvent(
  target: HTMLElement,
  type: 'touchstart' | 'touchmove' | 'touchend',
  clientX: number,
  clientY: number
): void {
  const touch = { identifier: 0, clientX, clientY } as Touch;
  const event = new Event(type, { bubbles: true, cancelable: true }) as TouchEvent;
  Object.defineProperty(event, 'touches', {
    value: type === 'touchend' ? [] : [touch],
    configurable: true,
  });
  Object.defineProperty(event, 'changedTouches', {
    value: [touch],
    configurable: true,
  });
  target.dispatchEvent(event as unknown as Event);
}

/**
 * A tap as a mobile browser delivers it: the touch sequence, then the
 * compatibility mouse events the browser synthesizes at (roughly) the same
 * position. The mouse coordinates are rounded, so they never match exactly.
 */
function dispatchTap(canvas: HTMLElement, clientX: number, clientY: number): void {
  dispatchTouchEvent(canvas, 'touchstart', clientX, clientY);
  dispatchTouchEvent(canvas, 'touchend', clientX, clientY);
  canvas.dispatchEvent(
    new MouseEvent('mousedown', {
      bubbles: true,
      clientX: Math.round(clientX),
      clientY: Math.round(clientY),
    })
  );
  window.dispatchEvent(
    new MouseEvent('mouseup', {
      bubbles: true,
      clientX: Math.round(clientX),
      clientY: Math.round(clientY),
    })
  );
}

describe('InputHandler', () => {
  let canvas: HTMLDivElement;
  let handler: InputHandler;
  let mode: {
    onPointerDown: ReturnType<typeof vi.fn>;
    onPointerMove: ReturnType<typeof vi.fn>;
    onPointerUp: ReturnType<typeof vi.fn>;
    onDoubleClick: ReturnType<typeof vi.fn>;
    onLongPress: ReturnType<typeof vi.fn>;
    onKeyDown: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    canvas = document.createElement('div');
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(createRect());
    document.body.appendChild(canvas);

    mode = {
      onPointerDown: vi.fn(),
      onPointerMove: vi.fn(),
      onPointerUp: vi.fn(),
      onDoubleClick: vi.fn(),
      onLongPress: vi.fn(),
      onKeyDown: vi.fn(),
    };

    handler = new InputHandler(createMapMock(canvas), () => mode as unknown as Mode);
    handler.enable();
  });

  afterEach(() => {
    handler.destroy();
    canvas.remove();
    vi.useRealTimers();
  });

  it('should dispatch a tap to the mode exactly once', () => {
    // Regression: the compatibility mouse events a mobile browser fires after
    // a tap used to reach the mode as a second, independent interaction.
    dispatchTap(canvas, 100.4, 50.6);

    expect(mode.onPointerDown).toHaveBeenCalledOnce();
    expect(mode.onPointerUp).toHaveBeenCalledOnce();
    expect(vi.mocked(mode.onPointerDown).mock.calls[0][0].inputType).toBe('touch');
    expect(vi.mocked(mode.onPointerUp).mock.calls[0][0].inputType).toBe('touch');
  });

  it('should dispatch two taps as exactly two interactions', () => {
    dispatchTap(canvas, 100.4, 50.6);
    vi.advanceTimersByTime(800);
    dispatchTap(canvas, 200.4, 120.6);

    expect(mode.onPointerDown).toHaveBeenCalledTimes(2);
    expect(mode.onPointerUp).toHaveBeenCalledTimes(2);
  });

  it('should suppress a touch move echoed as a mouse move', () => {
    dispatchTouchEvent(canvas, 'touchstart', 10, 10);
    dispatchTouchEvent(canvas, 'touchmove', 40, 40);
    canvas.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 40, clientY: 40 }));

    expect(mode.onPointerMove).toHaveBeenCalledOnce();
    expect(vi.mocked(mode.onPointerMove).mock.calls[0][0].inputType).toBe('touch');
  });

  it('should let mouse input through once the suppression window has passed', () => {
    dispatchTap(canvas, 100.4, 50.6);
    vi.mocked(mode.onPointerDown).mockClear();

    vi.advanceTimersByTime(800);
    canvas.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 10, clientY: 10 }));

    expect(mode.onPointerDown).toHaveBeenCalledOnce();
    expect(vi.mocked(mode.onPointerDown).mock.calls[0][0].inputType).toBe('mouse');
  });

  it('should not suppress mouse input on a device that never touches', () => {
    canvas.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 10, clientY: 10 }));
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 10, clientY: 10 }));

    expect(mode.onPointerDown).toHaveBeenCalledOnce();
    expect(mode.onPointerUp).toHaveBeenCalledOnce();
  });

  it('should still dispatch the long press of a held finger', () => {
    dispatchTouchEvent(canvas, 'touchstart', 10, 10);
    vi.advanceTimersByTime(600);

    expect(mode.onLongPress).toHaveBeenCalledOnce();
  });
});
