import { describe, expect, it, vi } from 'vitest';
import { TOOL_NAMES, dispatch } from '../../../examples/mcp/page/dispatch';
import type { DrawApi } from '../../../examples/mcp/page/dispatch';
import { LibreDrawError } from '../../../src/core/errors';

const feature = {
  id: 'a',
  type: 'Feature' as const,
  geometry: { type: 'Point' as const, coordinates: [0, 0] as [number, number] },
  properties: {},
};
const success = { ok: true as const, created: [], updated: [], deleted: [] };

function fakeDraw(): DrawApi & Record<keyof DrawApi, ReturnType<typeof vi.fn>> {
  return {
    toGeoJSON: vi.fn(() => ({ type: 'FeatureCollection' as const, features: [feature] })),
    getFeatureById: vi.fn((id: string) => (id === 'a' ? feature : undefined)),
    addFeatures: vi.fn(() => [{ valid: true as const, id: 'a' }]),
    updateFeature: vi.fn(() => success),
    deleteFeature: vi.fn((id: string) => (id === 'a' ? feature : undefined)),
    split: vi.fn(() => success),
    setback: vi.fn(() => ({ ok: false as const, reason: 'invalid-distance' })),
    rotate: vi.fn(() => success),
    union: vi.fn(() => success),
    selectFeature: vi.fn((id: string) => {
      if (id !== 'a') throw new LibreDrawError(`Feature not found: ${id}`);
    }),
    undo: vi.fn(() => true),
    redo: vi.fn(() => false),
  } as unknown as DrawApi & Record<keyof DrawApi, ReturnType<typeof vi.fn>>;
}

describe('dispatch', () => {
  it('covers every tool name', () => {
    const draw = fakeDraw();
    for (const tool of TOOL_NAMES) {
      const result = dispatch(draw, tool, { id: 'a', ids: ['a', 'b'], features: [] });
      expect(result, tool).not.toEqual({ ok: false, reason: 'unknown-tool' });
    }
  });

  it('reads features and single features', () => {
    const draw = fakeDraw();
    expect(dispatch(draw, 'get_features', undefined)).toEqual({
      type: 'FeatureCollection',
      features: [feature],
    });
    expect(dispatch(draw, 'get_feature', { id: 'a' })).toEqual(feature);
    expect(dispatch(draw, 'get_feature', { id: 'missing' })).toBeNull();
  });

  it('passes operation arguments through unchanged and returns the result as is', () => {
    const draw = fakeDraw();
    const line = [
      [1, 2],
      [3, 4],
    ];
    expect(dispatch(draw, 'split', { id: 'a', line })).toBe(success);
    expect(draw.split).toHaveBeenCalledWith('a', line);

    expect(dispatch(draw, 'setback', { id: 'a', edge: { index: 2 }, distanceMeters: 10 })).toEqual({
      ok: false,
      reason: 'invalid-distance',
    });
    expect(draw.setback).toHaveBeenCalledWith('a', { index: 2 }, 10);

    dispatch(draw, 'rotate', { id: 'a', angleDeg: 90 });
    expect(draw.rotate).toHaveBeenCalledWith('a', 90);

    dispatch(draw, 'union', { ids: ['a', 'b'] });
    expect(draw.union).toHaveBeenCalledWith(['a', 'b']);

    dispatch(draw, 'update_feature', { id: 'a', properties: { crop: 'wheat' } });
    expect(draw.updateFeature).toHaveBeenCalledWith('a', {
      geometry: undefined,
      properties: { crop: 'wheat' },
    });

    dispatch(draw, 'add_features', { features: [feature], strict: false });
    expect(draw.addFeatures).toHaveBeenCalledWith([feature], { strict: false });
  });

  it('returns null for a delete that found nothing and booleans for undo / redo', () => {
    const draw = fakeDraw();
    expect(dispatch(draw, 'delete_feature', { id: 'a' })).toEqual(feature);
    expect(dispatch(draw, 'delete_feature', { id: 'missing' })).toBeNull();
    expect(dispatch(draw, 'undo', {})).toBe(true);
    expect(dispatch(draw, 'redo', {})).toBe(false);
  });

  it('turns a thrown LibreDrawError into { ok: false, reason }', () => {
    const draw = fakeDraw();
    expect(dispatch(draw, 'select_feature', { id: 'a' })).toEqual({ ok: true });
    expect(dispatch(draw, 'select_feature', { id: 'missing' })).toEqual({
      ok: false,
      reason: 'Feature not found: missing',
    });
  });

  it('rejects an unknown tool without calling anything', () => {
    const draw = fakeDraw();
    expect(dispatch(draw, 'explode', {})).toEqual({ ok: false, reason: 'unknown-tool' });
    expect(draw.toGeoJSON).not.toHaveBeenCalled();
  });
});
