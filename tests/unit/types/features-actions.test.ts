import { describe, expect, it } from 'vitest';
import { FeatureStore } from '../../../src/core/FeatureStore';
import {
  BatchAction,
  CreateAction,
  DeleteAction,
  UpdateAction,
} from '../../../src/types/features';
import type { Action } from '../../../src/types/features';
import type { LibreDrawFeature } from '../../../src/types/features';

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

describe('Feature actions snapshot behavior', () => {
  it('CreateAction should snapshot constructor input', () => {
    const store = new FeatureStore();
    const source = makeFeature('f1');
    const action = new CreateAction(source);

    source.geometry.coordinates[0][0][0] = 999;
    source.properties.name = 'tampered';

    action.apply(store);

    const stored = store.getById('f1')!;
    expect(stored.geometry.coordinates[0][0][0]).toBe(0);
    expect(stored.properties.name).toBeUndefined();
  });

  it('UpdateAction should snapshot old/new constructor inputs', () => {
    const store = new FeatureStore();
    store.add(makeFeature('f1'));

    const oldFeature = makeFeature('f1');
    const newFeature = {
      ...makeFeature('f1'),
      properties: { name: 'updated' },
    };
    const action = new UpdateAction('f1', oldFeature, newFeature);

    oldFeature.properties.name = 'tampered-old';
    newFeature.properties.name = 'tampered-new';

    action.apply(store);
    expect(store.getById('f1')!.properties.name).toBe('updated');

    action.revert(store);
    expect(store.getById('f1')!.properties.name).toBeUndefined();
  });

  it('DeleteAction should snapshot constructor input', () => {
    const store = new FeatureStore();
    const source = makeFeature('f1');
    store.add(source);

    const action = new DeleteAction(source);
    source.geometry.coordinates[0][0][0] = 999;

    store.remove('f1');
    action.revert(store);

    const restored = store.getById('f1')!;
    expect(restored.geometry.coordinates[0][0][0]).toBe(0);
  });
});

describe('BatchAction', () => {
  it('should apply child actions in order and revert them in reverse order', () => {
    const store = new FeatureStore();
    const calls: string[] = [];
    const makeAction = (name: string): Action => ({
      type: 'create',
      apply: () => {
        calls.push(`apply:${name}`);
      },
      revert: () => {
        calls.push(`revert:${name}`);
      },
    });

    const batch = new BatchAction([makeAction('a'), makeAction('b'), makeAction('c')]);

    batch.apply(store);
    expect(calls).toEqual(['apply:a', 'apply:b', 'apply:c']);

    calls.length = 0;
    batch.revert(store);
    expect(calls).toEqual(['revert:c', 'revert:b', 'revert:a']);
  });

  it('should add and remove all features as one step', () => {
    const store = new FeatureStore();
    const batch = new BatchAction([
      new CreateAction(makeFeature('f1')),
      new CreateAction(makeFeature('f2')),
    ]);

    batch.apply(store);
    expect(store.getAll().map((f) => f.id)).toEqual(['f1', 'f2']);

    batch.revert(store);
    expect(store.getAll()).toHaveLength(0);

    batch.apply(store);
    expect(store.getAll().map((f) => f.id)).toEqual(['f1', 'f2']);
  });

  it('should expose type "batch" and tolerate an empty action list', () => {
    const store = new FeatureStore();
    const batch = new BatchAction([]);

    expect(batch.type).toBe('batch');
    expect(() => batch.apply(store)).not.toThrow();
    expect(() => batch.revert(store)).not.toThrow();
    expect(store.getAll()).toHaveLength(0);
  });

  it('should copy the action list so later mutation does not affect the batch', () => {
    const store = new FeatureStore();
    const actions: Action[] = [new CreateAction(makeFeature('f1'))];
    const batch = new BatchAction(actions);

    actions.push(new CreateAction(makeFeature('f2')));

    batch.apply(store);
    expect(store.getAll().map((f) => f.id)).toEqual(['f1']);
    expect(batch.actions).toHaveLength(1);
  });
});
