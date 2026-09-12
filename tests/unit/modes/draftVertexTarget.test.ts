import { describe, it, expect } from 'vitest';
import { finishRadius, findDraftVertexTarget } from '../../../src/modes/draftVertexTarget';
import type { Position } from '../../../src/types/features';

// Screen space is lng*10, lat*10 so pixel distances are easy to reason about.
const getScreenPoint = (lngLat: { lng: number; lat: number }) => ({
  x: lngLat.lng * 10,
  y: lngLat.lat * 10,
});

describe('finishRadius', () => {
  it('uses the snap threshold as-is for mouse input', () => {
    expect(finishRadius('mouse', 10)).toBe(10);
    expect(finishRadius('mouse', 25)).toBe(25);
  });

  it('adds the touch tap tolerance for touch input', () => {
    expect(finishRadius('touch', 10)).toBe(22);
  });

  it('falls back to 10px when the threshold is undefined', () => {
    expect(finishRadius('mouse', undefined)).toBe(10);
    expect(finishRadius('touch', undefined)).toBe(22);
  });
});

describe('findDraftVertexTarget', () => {
  const square: Position[] = [
    [0, 0],
    [10, 0],
    [10, 10],
  ];

  it('returns null for an empty draft', () => {
    expect(
      findDraftVertexTarget({ x: 0, y: 0 }, [], getScreenPoint, 10, { includeFirst: true })
    ).toBe(null);
  });

  it('hits the last vertex within the radius', () => {
    // Last vertex (10,10) is at screen (100,100); pointer 6px away.
    const target = findDraftVertexTarget({ x: 106, y: 100 }, square, getScreenPoint, 10, {
      includeFirst: false,
    });
    expect(target).toEqual({ index: 2, position: [10, 10], distance: 6 });
  });

  it('does not hit a vertex just outside the radius', () => {
    const target = findDraftVertexTarget({ x: 111, y: 100 }, square, getScreenPoint, 10, {
      includeFirst: false,
    });
    expect(target).toBeNull();
  });

  it('hits a vertex exactly on the radius boundary', () => {
    const target = findDraftVertexTarget({ x: 110, y: 100 }, square, getScreenPoint, 10, {
      includeFirst: false,
    });
    expect(target?.index).toBe(2);
  });

  it('hits the first vertex only when includeFirst is set', () => {
    const point = { x: 3, y: 4 }; // 5px from (0,0)
    expect(
      findDraftVertexTarget(point, square, getScreenPoint, 10, { includeFirst: false })
    ).toBeNull();
    expect(
      findDraftVertexTarget(point, square, getScreenPoint, 10, { includeFirst: true })
    ).toEqual({ index: 0, position: [0, 0], distance: 5 });
  });

  it('ignores middle vertices', () => {
    // (10,0) is the middle vertex at screen (100,0).
    const target = findDraftVertexTarget({ x: 100, y: 0 }, square, getScreenPoint, 10, {
      includeFirst: true,
    });
    expect(target).toBeNull();
  });

  it('prefers the nearer vertex when both first and last are within the radius', () => {
    const tiny: Position[] = [
      [0, 0],
      [0.5, 0],
      [1, 0],
    ]; // first at (0,0), last at (10,0)
    const nearLast = findDraftVertexTarget({ x: 7, y: 0 }, tiny, getScreenPoint, 20, {
      includeFirst: true,
    });
    expect(nearLast?.index).toBe(2);

    const nearFirst = findDraftVertexTarget({ x: 3, y: 0 }, tiny, getScreenPoint, 20, {
      includeFirst: true,
    });
    expect(nearFirst?.index).toBe(0);
  });

  it('treats a single vertex as both first and last', () => {
    const target = findDraftVertexTarget({ x: 0, y: 0 }, [[0, 0]], getScreenPoint, 10, {
      includeFirst: false,
    });
    expect(target?.index).toBe(0);
  });
});
