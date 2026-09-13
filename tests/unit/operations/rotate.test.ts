import { describe, expect, it, vi } from 'vitest';
import { rotate } from '../../../src/operations/rotate';
import type { OperationContext } from '../../../src/operations/OperationContext';
import { UpdateAction } from '../../../src/types/features';
import type { LibreDrawFeature } from '../../../src/types/features';
import { rotateFeature } from '../../../src/utils/rotate';

function makeSquare(id = 'sq'): LibreDrawFeature {
  return {
    id,
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [4, 0],
          [4, 4],
          [0, 4],
          [0, 0],
        ],
      ],
    },
    properties: { name: id },
  };
}

function makeLine(id = 'ln'): LibreDrawFeature {
  return {
    id,
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: [
        [10, 0],
        [14, 0],
      ],
    },
    properties: {},
  };
}

function makePoint(id = 'pt'): LibreDrawFeature {
  return {
    id,
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [20, 0] },
    properties: {},
  };
}

function createContext(initial: LibreDrawFeature[]) {
  const features = new Map<string, LibreDrawFeature>();
  for (const f of initial) features.set(f.id, f);
  const push = vi.fn();
  const emit = vi.fn();
  const context: OperationContext = {
    store: {
      add: vi.fn((f: LibreDrawFeature) => {
        features.set(f.id, f);
        return f;
      }),
      update: vi.fn((id: string, f: LibreDrawFeature) => {
        features.set(id, f);
      }),
      remove: vi.fn(),
      getById: (id: string) => features.get(id),
    },
    history: { push },
    events: { emit },
  };
  return { context, features, push, emit };
}

describe('rotate', () => {
  it('rotates a polygon exactly like rotateFeature and records one UpdateAction', () => {
    const { context, features, push, emit } = createContext([makeSquare()]);
    const before = features.get('sq')!;
    const expected = rotateFeature(before, 90);

    const result = rotate(context, 'sq', 90);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected success');
    expect(result.updated).toEqual([expected]);
    expect(result.created).toEqual([]);
    expect(result.deleted).toEqual([]);
    expect(features.get('sq')).toEqual(expected);

    expect(push).toHaveBeenCalledTimes(1);
    const action = push.mock.calls[0][0] as UpdateAction;
    expect(action).toBeInstanceOf(UpdateAction);
    expect(action.oldFeature).toEqual(before);
    expect(action.newFeature).toEqual(expected);

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith('rotate', {
      originalFeature: before,
      feature: expected,
      angle: 90,
    });
  });

  it('rotates a LineString', () => {
    const { context, features } = createContext([makeLine()]);
    const expected = rotateFeature(features.get('ln')!, -30);
    const result = rotate(context, 'ln', -30);
    expect(result.ok).toBe(true);
    expect(features.get('ln')).toEqual(expected);
  });

  it('starts from the current store shape, so calls stack', () => {
    const { context, features } = createContext([makeSquare()]);
    rotate(context, 'sq', 45);
    rotate(context, 'sq', 45);
    const twice = rotateFeature(rotateFeature(makeSquare(), 45), 45);
    expect(features.get('sq')).toEqual(twice);
  });

  it('returns copies that do not alias the store', () => {
    const { context, features } = createContext([makeSquare()]);
    const result = rotate(context, 'sq', 10);
    if (!result.ok) throw new Error('expected success');
    result.updated[0].geometry.coordinates[0][0][0] = 999;
    expect((features.get('sq')!.geometry.coordinates as number[][][])[0][0][0]).not.toBe(999);
  });

  describe('failures leave the store, history and listeners untouched', () => {
    it.each([0, 360, -720, 720])('rejects angle %s as no-rotation', (angle) => {
      const { context, features, push, emit } = createContext([makeSquare()]);
      const before = features.get('sq');
      expect(rotate(context, 'sq', angle)).toEqual({ ok: false, reason: 'no-rotation' });
      expect(features.get('sq')).toBe(before);
      expect(push).not.toHaveBeenCalled();
      expect(emit).not.toHaveBeenCalled();
    });

    it('rejects a non-finite angle as no-rotation', () => {
      const { context, push } = createContext([makeSquare()]);
      expect(rotate(context, 'sq', Number.NaN)).toEqual({ ok: false, reason: 'no-rotation' });
      expect(push).not.toHaveBeenCalled();
    });

    it('rejects a Point as not-rotatable', () => {
      const { context, push, emit } = createContext([makePoint()]);
      expect(rotate(context, 'pt', 90)).toEqual({ ok: false, reason: 'not-rotatable' });
      expect(push).not.toHaveBeenCalled();
      expect(emit).not.toHaveBeenCalled();
    });

    it('rejects an unknown id as not-found', () => {
      const { context, push } = createContext([makeSquare()]);
      expect(rotate(context, 'missing', 90)).toEqual({ ok: false, reason: 'not-found' });
      expect(push).not.toHaveBeenCalled();
    });

    it('rejects a rotation that leaves the coordinate range with the validation message', () => {
      // Near the antimeridian at high latitude a 90° turn pushes a corner past 180°.
      const edge: LibreDrawFeature = {
        id: 'edge',
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [170, 80],
              [179, 80],
              [179, 85],
              [170, 85],
              [170, 80],
            ],
          ],
        },
        properties: {},
      };
      const { context, features, push, emit } = createContext([edge]);
      const before = features.get('edge');

      const result = rotate(context, 'edge', 90);

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('expected failure');
      expect(result.reason).toContain('longitude');
      expect(features.get('edge')).toBe(before);
      expect(push).not.toHaveBeenCalled();
      expect(emit).not.toHaveBeenCalled();
    });

    it('checks the id before the angle', () => {
      const { context } = createContext([]);
      expect(rotate(context, 'missing', 0)).toEqual({ ok: false, reason: 'not-found' });
    });
  });
});
