import { describe, expect, it, vi } from 'vitest';
import { updateFeature } from '../../../src/operations/updateFeature';
import type { OperationContext } from '../../../src/operations/OperationContext';
import { UpdateAction } from '../../../src/types/features';
import type { LibreDrawFeature } from '../../../src/types/features';
import { validateFeature } from '../../../src/validation/geojson';

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
    properties: { name: id, area: 16 },
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

function createContext(initial: LibreDrawFeature[]) {
  const features = new Map<string, LibreDrawFeature>();
  for (const f of initial) features.set(f.id, f);
  const update = vi.fn((id: string, f: LibreDrawFeature) => {
    features.set(id, f);
  });
  const push = vi.fn();
  const emit = vi.fn();
  const context: OperationContext = {
    store: {
      add: vi.fn((f: LibreDrawFeature) => {
        features.set(f.id, f);
        return f;
      }),
      update,
      remove: vi.fn((id: string) => {
        const found = features.get(id);
        features.delete(id);
        return found;
      }),
      getById: (id: string) => features.get(id),
    },
    history: { push },
    events: { emit },
  };
  return { context, features, update, push, emit };
}

const NEW_RING: [number, number][] = [
  [0, 0],
  [8, 0],
  [8, 8],
  [0, 8],
  [0, 0],
];

describe('updateFeature', () => {
  describe('geometry', () => {
    it('replaces the geometry, records one UpdateAction and emits update', () => {
      const { context, features, push, emit } = createContext([makeSquare()]);
      const before = features.get('sq')!;

      const result = updateFeature(context, 'sq', {
        geometry: { type: 'Polygon', coordinates: [NEW_RING] },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('expected success');
      expect(result.updated).toHaveLength(1);
      expect(result.created).toEqual([]);
      expect(result.deleted).toEqual([]);
      expect(result.updated[0].geometry.coordinates).toEqual([NEW_RING]);
      // Properties are kept when the patch does not mention them.
      expect(result.updated[0].properties).toEqual({ name: 'sq', area: 16 });

      expect(features.get('sq')!.geometry.coordinates).toEqual([NEW_RING]);
      expect(push).toHaveBeenCalledTimes(1);
      const action = push.mock.calls[0][0] as UpdateAction;
      expect(action).toBeInstanceOf(UpdateAction);
      expect(action.oldFeature).toEqual(before);
      expect(action.newFeature.geometry.coordinates).toEqual([NEW_RING]);

      expect(emit).toHaveBeenCalledTimes(1);
      expect(emit).toHaveBeenCalledWith('update', {
        feature: expect.objectContaining({ id: 'sq' }),
        oldFeature: before,
      });
    });

    it('stores a copy detached from the caller and from the result', () => {
      const { context, features } = createContext([makeSquare()]);
      const ring = NEW_RING.map((p) => [...p] as [number, number]);

      const result = updateFeature(context, 'sq', {
        geometry: { type: 'Polygon', coordinates: [ring] },
      });
      if (!result.ok) throw new Error('expected success');

      ring[0][0] = 99;
      result.updated[0].geometry.coordinates[0][1][0] = 77;
      const stored = features.get('sq')!.geometry.coordinates as number[][][];
      expect(stored[0][0][0]).toBe(0);
      expect(stored[0][1][0]).toBe(8);
    });

    it('updates a LineString as well', () => {
      const { context, features } = createContext([makeLine()]);
      const result = updateFeature(context, 'ln', {
        geometry: {
          type: 'LineString',
          coordinates: [
            [10, 0],
            [12, 2],
            [14, 0],
          ],
        },
      });
      expect(result.ok).toBe(true);
      expect(features.get('ln')!.geometry.coordinates).toHaveLength(3);
    });

    it('rejects a change of geometry type', () => {
      const { context, features, push, emit } = createContext([makeSquare()]);
      const before = features.get('sq');

      const result = updateFeature(context, 'sq', {
        geometry: { type: 'LineString', coordinates: [NEW_RING[0], NEW_RING[1]] },
      });

      expect(result).toEqual({ ok: false, reason: 'geometry-type-mismatch' });
      expect(features.get('sq')).toBe(before);
      expect(push).not.toHaveBeenCalled();
      expect(emit).not.toHaveBeenCalled();
    });

    it('rejects a self-intersecting polygon with the validation message', () => {
      const { context, push } = createContext([makeSquare()]);
      const bowtie = {
        type: 'Polygon' as const,
        coordinates: [
          [
            [0, 0],
            [4, 4],
            [4, 0],
            [0, 4],
            [0, 0],
          ] as [number, number][],
        ],
      };
      let expected = '';
      try {
        validateFeature({ type: 'Feature', id: 'sq', geometry: bowtie, properties: {} });
      } catch (err) {
        expected = (err as Error).message;
      }

      const result = updateFeature(context, 'sq', { geometry: bowtie });

      expect(expected).not.toBe('');
      expect(result).toEqual({ ok: false, reason: expected });
      expect(push).not.toHaveBeenCalled();
    });

    it('rejects coordinates out of range with the validation message', () => {
      const { context } = createContext([makeLine()]);
      const result = updateFeature(context, 'ln', {
        geometry: {
          type: 'LineString',
          coordinates: [
            [200, 0],
            [14, 0],
          ],
        },
      });
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('expected failure');
      expect(result.reason).toContain('longitude');
    });
  });

  describe('properties', () => {
    it('replaces the properties object without merging', () => {
      const { context, features, push, emit } = createContext([makeSquare()]);

      const result = updateFeature(context, 'sq', { properties: { crop: 'wheat' } });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('expected success');
      expect(result.updated[0].properties).toEqual({ crop: 'wheat' }); // name / area are gone
      expect(features.get('sq')!.properties).toEqual({ crop: 'wheat' });
      expect(features.get('sq')!.geometry).toEqual(makeSquare().geometry);
      expect(push).toHaveBeenCalledTimes(1);
      expect(emit).toHaveBeenCalledWith('update', expect.objectContaining({}));
    });

    it('accepts an empty object to clear all properties', () => {
      const { context, features } = createContext([makeSquare()]);
      expect(updateFeature(context, 'sq', { properties: {} }).ok).toBe(true);
      expect(features.get('sq')!.properties).toEqual({});
    });

    it('replaces geometry and properties together as one step', () => {
      const { context, features, push } = createContext([makeSquare()]);
      const result = updateFeature(context, 'sq', {
        geometry: { type: 'Polygon', coordinates: [NEW_RING] },
        properties: { crop: 'rice' },
      });
      expect(result.ok).toBe(true);
      expect(features.get('sq')!.geometry.coordinates).toEqual([NEW_RING]);
      expect(features.get('sq')!.properties).toEqual({ crop: 'rice' });
      expect(push).toHaveBeenCalledTimes(1);
    });
  });

  describe('failures', () => {
    it('rejects an empty patch', () => {
      const { context, push, emit } = createContext([makeSquare()]);
      expect(updateFeature(context, 'sq', {})).toEqual({ ok: false, reason: 'empty-patch' });
      expect(push).not.toHaveBeenCalled();
      expect(emit).not.toHaveBeenCalled();
    });

    it('rejects an unknown id', () => {
      const { context, push } = createContext([makeSquare()]);
      expect(updateFeature(context, 'missing', { properties: {} })).toEqual({
        ok: false,
        reason: 'not-found',
      });
      expect(push).not.toHaveBeenCalled();
    });

    it('checks the patch before the id, so an empty patch on a missing id is empty-patch', () => {
      const { context } = createContext([]);
      expect(updateFeature(context, 'missing', {})).toEqual({ ok: false, reason: 'empty-patch' });
    });
  });
});
