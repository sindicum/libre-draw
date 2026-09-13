import type { EventInput, EventOrigin, LibreDrawEventMap } from '../types/events';

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
 * defined in LibreDrawEventMap. Every delivered payload carries an
 * `origin` obtained from the provider given at construction, so emitters
 * (modes, the facade) never have to know who triggered the change.
 */
export class EventBus {
  private listeners: Map<string, Set<AnyListener>> = new Map();
  private readonly originProvider: () => EventOrigin;

  /**
   * Create a new EventBus.
   * @param originProvider - Called on every emit to stamp the payload's
   *   `origin`. Defaults to `'user'`, which is right for a bus that is
   *   only ever driven by map input.
   */
  constructor(originProvider: () => EventOrigin = () => 'user') {
    this.originProvider = originProvider;
  }

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
   *
   * The delivered object is a new one with `origin` attached; the emitter's
   * payload is left untouched.
   * @param type - The event type to emit.
   * @param payload - The event payload without `origin`.
   */
  emit<K extends keyof LibreDrawEventMap>(type: K, payload: EventInput<K>): void {
    const set = this.listeners.get(type as string);
    if (!set || set.size === 0) return;
    const delivered = { ...payload, origin: this.originProvider() } as LibreDrawEventMap[K];
    for (const listener of set) {
      listener(delivered);
    }
  }

  /**
   * Remove all listeners for all event types.
   */
  removeAllListeners(): void {
    this.listeners.clear();
  }
}
