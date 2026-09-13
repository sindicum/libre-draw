import type { Map as MaplibreMap } from 'maplibre-gl';
import type { NormalizedInputEvent } from '../types/input';
import type { Mode } from '../modes/Mode';
import { MouseInput } from './MouseInput';
import { TouchInput } from './TouchInput';
import { KeyboardInput } from './KeyboardInput';
import type { KeyboardShortcutCallbacks } from './KeyboardInput';

/**
 * Callback to retrieve the currently active mode.
 */
export type GetActiveModeCallback = () => Mode | undefined;

/**
 * How long mouse input is ignored after the last touch event.
 *
 * Mobile browsers follow a tap with *compatibility mouse events*
 * (mousedown / mouseup / click / dblclick) synthesized at roughly the same
 * position. Both handlers listen on the same canvas, so without this guard a
 * single tap reaches the active mode twice — once as touch, once as mouse —
 * and the two positions differ by a fraction of a pixel because touch
 * coordinates are fractional while the synthesized mouse ones are rounded.
 * The window only needs to outlast the browser's own tap delay.
 */
const MOUSE_AFTER_TOUCH_SUPPRESSION_MS = 700;

/**
 * Orchestrates all input handlers (mouse, touch, keyboard) and
 * dispatches events to the currently active drawing mode.
 */
export class InputHandler {
  private mouseInput: MouseInput;
  private touchInput: TouchInput;
  private keyboardInput: KeyboardInput;
  private getActiveMode: GetActiveModeCallback;

  /** Timestamp of the last touch event, used to drop compatibility mouse events. */
  private lastTouchAt = 0;

  /**
   * @param map - The map whose canvas receives pointer input.
   * @param getActiveMode - Returns the mode that should receive events.
   * @param shortcuts - Undo / redo shortcut callbacks (each returns whether
   *   it acted). Omit to disable shortcut handling (mode key dispatch is
   *   unaffected).
   */
  constructor(
    map: MaplibreMap,
    getActiveMode: GetActiveModeCallback,
    shortcuts?: KeyboardShortcutCallbacks
  ) {
    this.getActiveMode = getActiveMode;

    // Touch wins: every touch event stamps the clock, and mouse events that
    // land inside the suppression window are the browser's echo of it.
    const touchCallbacks = {
      onPointerDown: (event: NormalizedInputEvent) => {
        this.markTouch();
        this.getActiveMode()?.onPointerDown(event);
      },
      onPointerMove: (event: NormalizedInputEvent) => {
        this.markTouch();
        this.getActiveMode()?.onPointerMove(event);
      },
      onPointerUp: (event: NormalizedInputEvent) => {
        this.markTouch();
        this.getActiveMode()?.onPointerUp(event);
      },
      onDoubleClick: (event: NormalizedInputEvent) => {
        this.markTouch();
        this.getActiveMode()?.onDoubleClick(event);
      },
      onLongPress: (event: NormalizedInputEvent) => {
        this.markTouch();
        this.getActiveMode()?.onLongPress(event);
      },
    };

    const mouseCallbacks = {
      onPointerDown: (event: NormalizedInputEvent) => {
        if (this.isTouchEcho()) return;
        this.getActiveMode()?.onPointerDown(event);
      },
      onPointerMove: (event: NormalizedInputEvent) => {
        if (this.isTouchEcho()) return;
        this.getActiveMode()?.onPointerMove(event);
      },
      onPointerUp: (event: NormalizedInputEvent) => {
        if (this.isTouchEcho()) return;
        this.getActiveMode()?.onPointerUp(event);
      },
      onDoubleClick: (event: NormalizedInputEvent) => {
        if (this.isTouchEcho()) return;
        this.getActiveMode()?.onDoubleClick(event);
      },
    };

    this.mouseInput = new MouseInput(map, mouseCallbacks);
    this.touchInput = new TouchInput(map, touchCallbacks);
    this.keyboardInput = new KeyboardInput(
      map,
      {
        onKeyDown: (key: string, event: KeyboardEvent) => {
          this.getActiveMode()?.onKeyDown(key, event);
        },
      },
      shortcuts
    );
  }

  /**
   * Record that a touch event was just handled.
   */
  private markTouch(): void {
    this.lastTouchAt = Date.now();
  }

  /**
   * @returns `true` when a mouse event is the browser's compatibility echo
   *   of a touch that was already dispatched.
   */
  private isTouchEcho(): boolean {
    return Date.now() - this.lastTouchAt < MOUSE_AFTER_TOUCH_SUPPRESSION_MS;
  }

  /**
   * Enable all input handlers.
   */
  enable(): void {
    this.mouseInput.enable();
    this.touchInput.enable();
    this.keyboardInput.enable();
  }

  /**
   * Disable all input handlers.
   */
  disable(): void {
    this.mouseInput.disable();
    this.touchInput.disable();
    this.keyboardInput.disable();
    this.lastTouchAt = 0;
  }

  /**
   * Destroy all input handlers and remove event listeners.
   */
  destroy(): void {
    this.mouseInput.destroy();
    this.touchInput.destroy();
    this.keyboardInput.destroy();
  }
}
