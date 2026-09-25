import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LibreDrawFeature } from '../../../src/types/features';

// The engine's odd outputs (nothing, an open ring, an empty or degenerate
// polygon) cannot be produced from valid input, so @turf/union is replaced
// with a stub that returns them on demand.
const engine = vi.hoisted(() => ({ result: undefined as unknown, useStub: false }));
vi.mock('@turf/union', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@turf/union')>();
  return {
    ...actual,
    union: (...args: Parameters<typeof actual.union>) =>
      engine.useStub ? engine.result : actual.union(...args),
  };
});

const { unionPolygons } = await import('../../../src/utils/unionPolygon');

function square(id: string, x: number): LibreDrawFeature {
  return {
    id,
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [x, 0],
          [x + 10, 0],
          [x + 10, 10],
          [x, 10],
          [x, 0],
        ],
      ],
    },
    properties: {},
  };
}

function engineReturns(coordinates: number[][][] | null): void {
  engine.useStub = true;
  engine.result =
    coordinates === null
      ? null
      : { type: 'Feature', geometry: { type: 'Polygon', coordinates }, properties: {} };
}

describe('unionPolygons with unusual engine output', () => {
  afterEach(() => {
    engine.useStub = false;
    engine.result = undefined;
  });

  it('fails with invalid-result when the engine returns nothing', () => {
    engineReturns(null);
    expect(unionPolygons([square('a', 0), square('b', 10)])).toEqual({
      type: 'error',
      reason: 'invalid-result',
    });
  });

  it('fails with invalid-result when the engine returns a polygon without rings', () => {
    engineReturns([]);
    expect(unionPolygons([square('a', 0), square('b', 10)])).toEqual({
      type: 'error',
      reason: 'invalid-result',
    });
  });

  it('fails with invalid-result when the returned ring has fewer than four positions', () => {
    engineReturns([
      [
        [0, 0],
        [20, 0],
        [0, 0],
      ],
    ]);
    expect(unionPolygons([square('a', 0), square('b', 10)])).toEqual({
      type: 'error',
      reason: 'invalid-result',
    });
  });

  it('closes a ring the engine left open', () => {
    engineReturns([
      [
        [0, 0],
        [20, 0],
        [20, 10],
        [0, 10],
      ],
    ]);
    const result = unionPolygons([square('a', 0), square('b', 10)]);

    expect(result.type).toBe('success');
    if (result.type !== 'success') return;
    expect(result.feature.geometry.coordinates).toEqual([
      [
        [0, 0],
        [20, 0],
        [20, 10],
        [0, 10],
        [0, 0],
      ],
    ]);
  });
});
