import { describe, expect, it } from 'vitest';
import { DEFAULT_LAYERS, SOURCE_IDS } from '../../../src/rendering/layers';

// Contracts of docs/api/types.md (DEFAULT_LAYERS, SOURCE_IDS).

describe('DEFAULT_LAYERS', () => {
  it('reads only the six LibreDraw sources, each layer under its own id', () => {
    const sources = new Set<string>(Object.values(SOURCE_IDS));
    for (const layer of DEFAULT_LAYERS) {
      expect(sources.has((layer as { source: string }).source)).toBe(true);
    }
    const ids = DEFAULT_LAYERS.map((layer) => layer.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('draws every source', () => {
    const drawn = new Set(DEFAULT_LAYERS.map((layer) => (layer as { source: string }).source));
    expect([...drawn].sort()).toEqual(Object.values(SOURCE_IDS).sort());
  });

  it('is frozen down to the paint values, so a caller copies before changing', () => {
    const fill = DEFAULT_LAYERS[0] as { paint: Record<string, unknown> };
    expect(Object.isFrozen(DEFAULT_LAYERS)).toBe(true);
    expect(Object.isFrozen(fill.paint)).toBe(true);
    expect(() => {
      fill.paint['fill-color'] = '#000';
    }).toThrow(TypeError);
  });
});
