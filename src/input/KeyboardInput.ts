import type { Map as MaplibreMap } from 'maplibre-gl';

/**
 * Callback for keyboard key events.
 */
export interface KeyboardInputCallbacks {
  onKeyDown(key: string, event: KeyboardEvent): void;
}

/**
 * Callbacks for application-level keyboard shortcuts.
 *
 * Passing these enables shortcut detection; omitting them disables it.
 * Each callback returns whether it actually did something, so the key
 * event is only consumed (`preventDefault`) when the library acted on it.
 * A shortcut with nothing to do is left to the host page.
 */
export interface KeyboardShortcutCallbacks {
  /** Ctrl+Z / Cmd+Z. @returns `true` if an action was undone. */
  onUndo(): boolean;
  /** Ctrl+Shift+Z / Cmd+Shift+Z / Ctrl+Y. @returns `true` if an action was redone. */
  onRedo(): boolean;
}

/** A shortcut recognised by {@link resolveShortcut}. */
export type KeyboardShortcut = 'undo' | 'redo';

/**
 * Classify a keydown event as an undo / redo shortcut.
 *
 * Accepts Ctrl (Windows / Linux) or Cmd (macOS `metaKey`) as the modifier
 * for Z. Ctrl+Y is the conventional redo on Windows / Linux and is accepted
 * too, but Cmd+Y is not: macOS browsers (Chrome, Edge, Safari) reserve it
 * for the history page. Alt combinations are ignored so that OS-level
 * bindings are not hijacked. `event.key` is compared case-insensitively
 * because browsers report `'Z'` while Shift is held.
 *
 * @returns The matched shortcut, or `null` if the event is not one.
 */
export function resolveShortcut(event: KeyboardEvent): KeyboardShortcut | null {
  if (event.altKey) return null;
  const key = event.key.toLowerCase();
  if (key === 'z' && (event.ctrlKey || event.metaKey)) {
    return event.shiftKey ? 'redo' : 'undo';
  }
  if (key === 'y' && event.ctrlKey && !event.metaKey) return 'redo';
  return null;
}

/**
 * @returns `true` when the event target is a text-editing element, in which
 *   case shortcuts must be left to the element (undoing typed text).
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  // happy-dom and older engines may not implement isContentEditable.
  const attr = target.getAttribute('contenteditable');
  return attr !== null && attr.toLowerCase() !== 'false';
}

/**
 * Handles keyboard input events for the drawing interface.
 *
 * Listens for key events on the map container, so keys are only handled
 * while the map (or one of its controls) has focus. MapLibre gives its
 * canvas `tabindex="0"`, so clicking the map focuses it; this mirrors
 * MapLibre's own keyboard handler and keeps the library from hijacking
 * keys meant for the rest of the page.
 *
 * Relevant keys (Escape, Delete, Backspace) are dispatched to the active
 * mode. When shortcut callbacks are provided, undo / redo key combinations
 * are routed to them unless a text-editing element has focus, and the
 * browser default is suppressed only when the callback reports success.
 */
export class KeyboardInput {
  private target: HTMLElement;
  private callbacks: KeyboardInputCallbacks;
  private shortcuts: KeyboardShortcutCallbacks | undefined;

  /** The set of keys that this handler cares about. */
  private static readonly RELEVANT_KEYS = new Set(['Escape', 'Delete', 'Backspace']);

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (KeyboardInput.RELEVANT_KEYS.has(e.key)) {
      this.callbacks.onKeyDown(e.key, e);
      return;
    }

    if (!this.shortcuts || isEditableTarget(e.target)) return;

    const shortcut = resolveShortcut(e);
    if (shortcut === null) return;

    const handled = shortcut === 'undo' ? this.shortcuts.onUndo() : this.shortcuts.onRedo();
    if (handled) {
      e.preventDefault();
    }
  };

  /**
   * @param map - The map whose container receives key events.
   * @param callbacks - Receives Escape / Delete / Backspace for the active mode.
   * @param shortcuts - Undo / redo callbacks. Omit to disable shortcut handling.
   */
  constructor(
    map: MaplibreMap,
    callbacks: KeyboardInputCallbacks,
    shortcuts?: KeyboardShortcutCallbacks
  ) {
    this.target = map.getContainer();
    this.callbacks = callbacks;
    this.shortcuts = shortcuts;
  }

  /**
   * Start listening for keyboard events.
   */
  enable(): void {
    this.target.addEventListener('keydown', this.handleKeyDown);
  }

  /**
   * Stop listening for keyboard events.
   */
  disable(): void {
    this.target.removeEventListener('keydown', this.handleKeyDown);
  }

  /**
   * Destroy the keyboard input handler and remove all listeners.
   */
  destroy(): void {
    this.disable();
  }
}
