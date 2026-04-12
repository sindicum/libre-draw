import type { Action, FeatureStoreInterface } from '../types/features';

/**
 * Manages undo/redo history using an action-based stack.
 *
 * Each action knows how to apply and revert itself on the feature store.
 * A configurable limit prevents unbounded memory growth.
 */
export class HistoryManager {
  private undoStack: Action[] = [];
  private redoStack: Action[] = [];
  private readonly limit: number;

  /**
   * Create a new HistoryManager.
   * @param limit - Maximum number of actions to retain. Defaults to 100.
   */
  constructor(limit: number = 100) {
    this.limit = limit;
  }

  /**
   * Push a new action onto the history stack.
   * Clears the redo stack since a new action invalidates any redo history.
   * @param action - The action to record.
   */
  push(action: Action): void {
    this.undoStack.push(action);
    this.redoStack = [];
    if (this.undoStack.length > this.limit) {
      this.undoStack.shift();
    }
  }

  /**
   * Undo the most recent action.
   * @param store - The feature store to revert the action on.
   * @returns The reverted action, or null if the stack was empty.
   */
  undo(store: FeatureStoreInterface): Action | null {
    const action = this.undoStack.pop();
    if (!action) {
      return null;
    }
    action.revert(store);
    this.redoStack.push(action);
    return action;
  }

  /**
   * Redo the most recently undone action.
   * @param store - The feature store to re-apply the action on.
   * @returns The re-applied action, or null if the stack was empty.
   */
  redo(store: FeatureStoreInterface): Action | null {
    const action = this.redoStack.pop();
    if (!action) {
      return null;
    }
    action.apply(store);
    this.undoStack.push(action);
    return action;
  }

  /**
   * Whether there are actions that can be undone.
   */
  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  /**
   * Whether there are actions that can be redone.
   */
  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /**
   * Clear all history.
   */
  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}
