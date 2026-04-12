import { describe, it, expect } from 'vitest';
import { FeatureStore } from '../../src/core/FeatureStore';
import { HistoryManager } from '../../src/core/HistoryManager';
import {
  CreateAction,
  UpdateAction,
  DeleteAction,
} from '../../src/types/features';
import type { LibreDrawFeature } from '../../src/types/features';

function makeFeature(id: string): LibreDrawFeature {
  return {
    id,
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 0],
        ],
      ],
    },
    properties: {},
  };
}

describe('Undo/Redo Integration', () => {
  it('should undo a create action', () => {
    const store = new FeatureStore();
    const history = new HistoryManager();
    const feature = makeFeature('f1');

    // Create
    store.add(feature);
    history.push(new CreateAction(feature));
    expect(store.getAll()).toHaveLength(1);

    // Undo
    history.undo(store);
    expect(store.getAll()).toHaveLength(0);
  });

  it('should redo a create action after undo', () => {
    const store = new FeatureStore();
    const history = new HistoryManager();
    const feature = makeFeature('f1');

    store.add(feature);
    history.push(new CreateAction(feature));

    history.undo(store);
    expect(store.getAll()).toHaveLength(0);

    history.redo(store);
    expect(store.getAll()).toHaveLength(1);
    expect(store.getById('f1')).toBeDefined();
  });

  it('should undo a delete action', () => {
    const store = new FeatureStore();
    const history = new HistoryManager();
    const feature = makeFeature('f1');

    // Setup: add feature
    store.add(feature);

    // Delete
    store.remove('f1');
    history.push(new DeleteAction(feature));
    expect(store.getAll()).toHaveLength(0);

    // Undo: should restore the feature
    history.undo(store);
    expect(store.getAll()).toHaveLength(1);
    expect(store.getById('f1')).toBeDefined();
  });

  it('should undo an update action', () => {
    const store = new FeatureStore();
    const history = new HistoryManager();
    const original = makeFeature('f1');

    store.add(original);

    const updated: LibreDrawFeature = {
      ...original,
      properties: { name: 'Updated' },
    };
    const cloned = FeatureStore.cloneFeature(original);
    store.update('f1', updated);
    history.push(new UpdateAction('f1', cloned, updated));

    expect(store.getById('f1')?.properties.name).toBe('Updated');

    // Undo: should restore original properties
    history.undo(store);
    expect(store.getById('f1')?.properties.name).toBeUndefined();
  });

  it('should handle multiple undo/redo operations', () => {
    const store = new FeatureStore();
    const history = new HistoryManager();

    // Create 3 features
    for (let i = 1; i <= 3; i++) {
      const feature = makeFeature(`f${i}`);
      store.add(feature);
      history.push(new CreateAction(feature));
    }
    expect(store.getAll()).toHaveLength(3);

    // Undo all 3
    history.undo(store);
    expect(store.getAll()).toHaveLength(2);

    history.undo(store);
    expect(store.getAll()).toHaveLength(1);

    history.undo(store);
    expect(store.getAll()).toHaveLength(0);

    // Redo 2
    history.redo(store);
    expect(store.getAll()).toHaveLength(1);

    history.redo(store);
    expect(store.getAll()).toHaveLength(2);

    // Push new action should clear redo stack
    const newFeature = makeFeature('f-new');
    store.add(newFeature);
    history.push(new CreateAction(newFeature));

    expect(history.canRedo()).toBe(false);
    expect(store.getAll()).toHaveLength(3);
  });

  it('should respect history limit', () => {
    const store = new FeatureStore();
    const history = new HistoryManager(2); // limit to 2

    for (let i = 1; i <= 4; i++) {
      const feature = makeFeature(`f${i}`);
      store.add(feature);
      history.push(new CreateAction(feature));
    }

    // Should only undo 2 times (limit)
    expect(history.undo(store)).not.toBeNull();
    expect(history.undo(store)).not.toBeNull();
    expect(history.undo(store)).toBeNull();

    expect(store.getAll()).toHaveLength(2);
  });

  it('should keep undo/redo stable after mutating action constructor inputs', () => {
    const store = new FeatureStore();
    const history = new HistoryManager();

    const createInput = makeFeature('f1');
    const createAction = new CreateAction(createInput);
    createInput.geometry.coordinates[0][0][0] = 999;

    createAction.apply(store);
    history.push(createAction);
    expect(store.getById('f1')!.geometry.coordinates[0][0][0]).toBe(0);

    const oldFeature = store.getById('f1')!;
    const newFeature: LibreDrawFeature = {
      ...oldFeature,
      properties: { name: 'updated' },
    };
    const updateAction = new UpdateAction('f1', oldFeature, newFeature);
    oldFeature.properties.name = 'tampered-old';
    newFeature.properties.name = 'tampered-new';

    updateAction.apply(store);
    history.push(updateAction);
    expect(store.getById('f1')!.properties.name).toBe('updated');

    const deleteInput = store.getById('f1')!;
    const deleteAction = new DeleteAction(deleteInput);
    deleteInput.geometry.coordinates[0][0][0] = 777;

    deleteAction.apply(store);
    history.push(deleteAction);
    expect(store.getById('f1')).toBeUndefined();

    history.undo(store);
    expect(store.getById('f1')!.geometry.coordinates[0][0][0]).toBe(0);

    history.undo(store);
    expect(store.getById('f1')!.properties.name).toBeUndefined();
  });
});
