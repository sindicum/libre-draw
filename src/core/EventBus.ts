import type { LibreDrawEventMap } from '../types/events';

/**
 * A listener callback for a given event type.
 */
type Listener<T> = (payload: T) => void;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyListener = Listener<any>;

/**
 * Type-safe event bus for LibreDraw events.
 *
 * Supports registering, removing, and emitting events
 * defined in LibreDrawEventMap.
 */
export class EventBus {
  private listeners: Map<string, Set<AnyListener>> = new Map();

  /**
   * Register a listener for a specific event type.
   * @param type - The event type to listen for.
   * @param listener - The callback to invoke when the event fires.
   */
  on<K extends keyof LibreDrawEventMap>(type: K, listener: Listener<LibreDrawEventMap[K]>): void {
    let set = this.listeners.get(type as string);
    if (!set) {
      set = new Set();
      this.listeners.set(type as string, set);
    }
    set.add(listener as AnyListener);
  }

  /**
   * Remove a listener for a specific event type.
   * @param type - The event type to stop listening for.
   * @param listener - The callback to remove.
   */
  off<K extends keyof LibreDrawEventMap>(type: K, listener: Listener<LibreDrawEventMap[K]>): void {
    const set = this.listeners.get(type as string);
    if (set) {
      set.delete(listener as AnyListener);
    }
  }

  /**
   * Emit an event, invoking all registered listeners.
   * @param type - The event type to emit.
   * @param payload - The event payload.
   */
  emit<K extends keyof LibreDrawEventMap>(type: K, payload: LibreDrawEventMap[K]): void {
    const set = this.listeners.get(type as string);
    if (set) {
      for (const listener of set) {
        listener(payload);
      }
    }
  }

  /**
   * Remove all listeners for all event types.
   */
  removeAllListeners(): void {
    this.listeners.clear();
  }
}
