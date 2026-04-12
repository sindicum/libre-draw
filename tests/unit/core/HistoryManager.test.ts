import { describe, it, expect, vi } from 'vitest';
import { HistoryManager } from '../../../src/core/HistoryManager';
import type {
  Action,
  FeatureStoreInterface,
} from '../../../src/types/features';

function createMockStore(): FeatureStoreInterface {
  return {
    add: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    getById: vi.fn(),
  };
}

function createMockAction(): Action {
  return {
    type: 'create',
    apply: vi.fn(),
    revert: vi.fn(),
  };
}

describe('HistoryManager', () => {
  it('should push an action and report canUndo', () => {
    const history = new HistoryManager();
    expect(history.canUndo()).toBe(false);

    history.push(createMockAction());
    expect(history.canUndo()).toBe(true);
  });

  it('should undo an action', () => {
    const history = new HistoryManager();
    const store = createMockStore();
    const action = createMockAction();

    history.push(action);
    const result = history.undo(store);

    expect(result).toBe(action);
    expect(action.revert).toHaveBeenCalledWith(store);
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(true);
  });

  it('should redo an undone action', () => {
    const history = new HistoryManager();
    const store = createMockStore();
    const action = createMockAction();

    history.push(action);
    history.undo(store);
    const result = history.redo(store);

    expect(result).toBe(action);
    expect(action.apply).toHaveBeenCalledWith(store);
    expect(history.canUndo()).toBe(true);
    expect(history.canRedo()).toBe(false);
  });

  it('should return null when undoing empty stack', () => {
    const history = new HistoryManager();
    const store = createMockStore();
    expect(history.undo(store)).toBeNull();
  });

  it('should return null when redoing empty stack', () => {
    const history = new HistoryManager();
    const store = createMockStore();
    expect(history.redo(store)).toBeNull();
  });

  it('should clear redo stack when a new action is pushed', () => {
    const history = new HistoryManager();
    const store = createMockStore();

    history.push(createMockAction());
    history.undo(store);
    expect(history.canRedo()).toBe(true);

    history.push(createMockAction());
    expect(history.canRedo()).toBe(false);
  });

  it('should enforce the history limit', () => {
    const history = new HistoryManager(3);
    const store = createMockStore();

    for (let i = 0; i < 5; i++) {
      history.push(createMockAction());
    }

    // Should only be able to undo 3 times
    expect(history.undo(store)).not.toBeNull();
    expect(history.undo(store)).not.toBeNull();
    expect(history.undo(store)).not.toBeNull();
    expect(history.undo(store)).toBeNull();
  });

  it('should clear all history', () => {
    const history = new HistoryManager();
    const store = createMockStore();

    history.push(createMockAction());
    history.push(createMockAction());
    history.undo(store);

    history.clear();
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(false);
  });
});
