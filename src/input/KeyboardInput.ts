/**
 * Callback for keyboard key events.
 */
export interface KeyboardInputCallbacks {
  onKeyDown(key: string, event: KeyboardEvent): void;
}

/**
 * Handles keyboard input events for the drawing interface.
 *
 * Listens for key events on the document and dispatches
 * relevant keys (Escape, Delete, Backspace) to the active mode.
 */
export class KeyboardInput {
  private callbacks: KeyboardInputCallbacks;

  /** The set of keys that this handler cares about. */
  private static readonly RELEVANT_KEYS = new Set(['Escape', 'Delete', 'Backspace']);

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (KeyboardInput.RELEVANT_KEYS.has(e.key)) {
      this.callbacks.onKeyDown(e.key, e);
    }
  };

  constructor(callbacks: KeyboardInputCallbacks) {
    this.callbacks = callbacks;
  }

  /**
   * Start listening for keyboard events.
   */
  enable(): void {
    document.addEventListener('keydown', this.handleKeyDown);
  }

  /**
   * Stop listening for keyboard events.
   */
  disable(): void {
    document.removeEventListener('keydown', this.handleKeyDown);
  }

  /**
   * Destroy the keyboard input handler and remove all listeners.
   */
  destroy(): void {
    this.disable();
  }
}
