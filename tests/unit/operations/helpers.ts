import { vi } from 'vitest';
import type { OperationContext } from '../../../src/operations/OperationContext';
import type { LibreDrawFeature, Position } from '../../../src/types/features';

export function makeSquare(id: string, x = 0, y = 0, size = 10): LibreDrawFeature {
  return {
    id,
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [x, y],
          [x + size, y],
          [x + size, y + size],
          [x, y + size],
          [x, y],
        ],
      ],
    },
    properties: { name: id },
  };
}

export function makeSquareWithHole(id: string): LibreDrawFeature {
  const square = makeSquare(id);
  (square.geometry.coordinates as Position[][]).push([
    [4, 4],
    [6, 4],
    [6, 6],
    [4, 6],
    [4, 4],
  ]);
  return square;
}

export function makeLine(id: string): LibreDrawFeature {
  return {
    id,
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: [
        [0, 5],
        [10, 5],
      ],
    },
    properties: { name: id },
  };
}

export function makePoint(id: string): LibreDrawFeature {
  return {
    id,
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [5, 5] },
    properties: {},
  };
}

/** Shoelace area of a closed ring (absolute value). */
export function ringArea(ring: Position[]): number {
  let area = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return Math.abs(area / 2);
}

/**
 * An in-memory `OperationContext` whose store, history and event bus are
 * spies over a Map, so a test can assert both the outcome and the calls.
 */
export function createContext(initial: LibreDrawFeature[]) {
  const features = new Map<string, LibreDrawFeature>();
  for (const f of initial) features.set(f.id, f);
  const push = vi.fn();
  const emit = vi.fn();
  const add = vi.fn((f: LibreDrawFeature) => {
    features.set(f.id, f);
    return f;
  });
  const remove = vi.fn((id: string) => {
    const found = features.get(id);
    features.delete(id);
    return found;
  });
  const context: OperationContext = {
    store: {
      add,
      update: vi.fn((id: string, f: LibreDrawFeature) => {
        features.set(id, f);
      }),
      remove,
      getById: (id: string) => features.get(id),
    },
    history: { push },
    events: { emit },
  };
  return { context, features, push, emit, add, remove };
}
