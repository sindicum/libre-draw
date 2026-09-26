import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LibreDrawFeature, Position } from '../../../src/types/features';

// The engine's odd outputs (a throw, an empty MultiPolygon, an open ring)
// cannot be produced from valid input, so @turf/difference is replaced with
// a stub that returns them on demand.
const engine = vi.hoisted(() => ({ result: undefined as unknown, useStub: false, fail: false }));
vi.mock('@turf/difference', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@turf/difference')>();
  return {
    ...actual,
    difference: (...args: Parameters<typeof actual.difference>) => {
      if (engine.fail) throw new Error('engine failure');
      return engine.useStub ? engine.result : actual.difference(...args);
    },
  };
});

const { cutPolygon } = await import('../../../src/utils/cutPolygon');

const TARGET: LibreDrawFeature = {
  id: 't',
  type: 'Feature',
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 0],
      ],
    ],
  },
  properties: {},
};

const CUTTER: Position[] = [
  [2, 2],
  [4, 2],
  [4, 4],
  [2, 4],
  [2, 2],
];

describe('cutPolygon engine edge cases', () => {
  afterEach(() => {
    engine.useStub = false;
    engine.fail = false;
  });

  it('reports invalid-result when the engine throws', () => {
    engine.fail = true;
    expect(cutPolygon(TARGET, CUTTER)).toEqual({ type: 'error', reason: 'invalid-result' });
  });

  it('reports empty-result for an empty MultiPolygon', () => {
    engine.useStub = true;
    engine.result = { type: 'Feature', geometry: { type: 'MultiPolygon', coordinates: [] } };
    expect(cutPolygon(TARGET, CUTTER)).toEqual({ type: 'error', reason: 'empty-result' });
  });

  it('closes a ring the engine left open', () => {
    engine.useStub = true;
    engine.result = {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [10, 0],
            [10, 10],
            [5, 10],
          ],
        ],
      },
    };

    const result = cutPolygon(TARGET, CUTTER);

    if (result.type !== 'success') throw new Error(result.reason);
    const geometry = result.features[0].geometry;
    if (geometry.type !== 'Polygon') throw new Error('expected Polygon');
    expect(geometry.coordinates[0].at(-1)).toEqual([0, 0]);
  });
});
