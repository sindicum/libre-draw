import type { EventInput, LibreDrawEventMap } from '../types/events';
import type { Action, LibreDrawFeature } from '../types/features';

/**
 * The smallest set of dependencies an editing operation needs: read and
 * write the store, record one history step, and emit events.
 *
 * Rendering is deliberately absent. An operation changes the store and
 * reports what it did; the caller (facade or mode) redraws and re-syncs
 * any selection afterwards. `ModeContext` satisfies this structurally, so
 * a mode can hand over its own context.
 */
export interface OperationContext {
  store: {
    add(feature: LibreDrawFeature): LibreDrawFeature;
    update(id: string, feature: LibreDrawFeature): void;
    remove(id: string): LibreDrawFeature | undefined;
    getById(id: string): LibreDrawFeature | undefined;
  };
  history: {
    push(action: Action): void;
  };
  events: {
    emit<K extends keyof LibreDrawEventMap>(type: K, payload: EventInput<K>): void;
  };
}
