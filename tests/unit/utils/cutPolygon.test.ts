import { describe, expect, it } from 'vitest';
import type { LibreDrawFeature, Position } from '../../../src/types/features';
import { cutPolygon, normalizeCutterRing } from '../../../src/utils/cutPolygon';
import { findPolygonRingError } from '../../../src/validation/intersection';
import { makeLine, makeSquare, makeSquareWithHole, ringArea } from '../operations/helpers';

function square(x: number, y: number, size: number): Position[] {
  return [
    [x, y],
    [x + size, y],
    [x + size, y + size],
    [x, y + size],
    [x, y],
  ];
}

function rings(feature: LibreDrawFeature): Position[][] {
  if (feature.geometry.type !== 'Polygon') throw new Error('expected Polygon');
  return feature.geometry.coordinates;
}

function area(feature: LibreDrawFeature): number {
  return rings(feature).reduce((sum, ring, i) => sum + (i === 0 ? 1 : -1) * ringArea(ring), 0);
}

describe('normalizeCutterRing', () => {
  it('closes an open ring and keeps a closed one', () => {
    const open: Position[] = [
      [0, 0],
      [1, 0],
      [1, 1],
    ];
    expect(normalizeCutterRing(open)).toEqual([...open, [0, 0]]);
    expect(normalizeCutterRing(square(0, 0, 1))).toEqual(square(0, 0, 1));
  });

  it('rejects fewer than three distinct vertices', () => {
    expect(
      normalizeCutterRing([
        [0, 0],
        [1, 0],
      ])
    ).toBeNull();
    expect(
      normalizeCutterRing([
        [0, 0],
        [1, 0],
        [1, 0],
        [0, 0],
      ])
    ).toBeNull();
  });

  it('rejects a self-intersecting ring', () => {
    expect(
      normalizeCutterRing([
        [0, 0],
        [2, 2],
        [2, 0],
        [0, 2],
      ])
    ).toBeNull();
  });

  it('rejects non-numeric positions and non-arrays', () => {
    expect(
      normalizeCutterRing([
        [0, 0],
        [1, Number.NaN],
        [1, 1],
      ])
    ).toBeNull();
    expect(normalizeCutterRing('ring' as unknown as Position[])).toBeNull();
    expect(normalizeCutterRing([[0, 0], 'x', [1, 1]] as unknown as Position[])).toBeNull();
  });
});

describe('cutPolygon', () => {
  it('makes a hole when the cutter is inside, keeping the id and properties', () => {
    const result = cutPolygon(makeSquare('sq'), square(2, 2, 3));

    if (result.type !== 'success') throw new Error(result.reason);
    expect(result.keepsId).toBe(true);
    expect(result.features).toHaveLength(1);
    const [piece] = result.features;
    expect(piece.id).toBe('sq');
    expect(piece.properties).toEqual({ name: 'sq' });
    expect(rings(piece)).toHaveLength(2);
    expect(area(piece)).toBeCloseTo(91, 9);
    expect(findPolygonRingError(rings(piece))).toBeNull();
  });

  it('notches the outer ring when the cutter crosses the boundary', () => {
    const result = cutPolygon(makeSquare('sq'), square(8, 8, 4));

    if (result.type !== 'success') throw new Error(result.reason);
    expect(result.keepsId).toBe(true);
    expect(rings(result.features[0])).toHaveLength(1);
    expect(area(result.features[0])).toBeCloseTo(96, 9);
  });

  it('splits into pieces with fresh ids and copied properties when cut apart', () => {
    const target = makeSquare('sq');
    const result = cutPolygon(target, [
      [4, -1],
      [6, -1],
      [6, 11],
      [4, 11],
      [4, -1],
    ]);

    if (result.type !== 'success') throw new Error(result.reason);
    expect(result.keepsId).toBe(false);
    expect(result.features).toHaveLength(2);
    for (const piece of result.features) {
      expect(piece.id).not.toBe('sq');
      expect(piece.geometry.type).toBe('Polygon');
      expect(piece.properties).toEqual({ name: 'sq' });
      expect(piece.properties).not.toBe(target.properties);
      expect(area(piece)).toBeCloseTo(40, 9);
    }
    expect(result.features[0].id).not.toBe(result.features[1].id);
  });

  it('keeps an existing hole in the piece it belongs to', () => {
    const result = cutPolygon(makeSquareWithHole('h'), [
      [8, -1],
      [9, -1],
      [9, 11],
      [8, 11],
      [8, -1],
    ]);

    if (result.type !== 'success') throw new Error(result.reason);
    const withHole = result.features.find((piece) => rings(piece).length === 2);
    expect(withHole).toBeDefined();
    expect(result.features).toHaveLength(2);
  });

  it('grows an existing hole when the cutter overlaps it', () => {
    const result = cutPolygon(makeSquareWithHole('h'), square(5, 5, 2));

    if (result.type !== 'success') throw new Error(result.reason);
    const piece = result.features[0];
    expect(rings(piece)).toHaveLength(2);
    // 100 - hole (4) - the cutter's part outside the hole (4 - 1).
    expect(area(piece)).toBeCloseTo(93, 9);
  });

  it('merges two holes bridged by the cutter', () => {
    const target = makeSquare('sq');
    (target.geometry.coordinates as Position[][]).push(square(1, 1, 2), square(6, 1, 2));

    const result = cutPolygon(target, square(2, 1.5, 5));

    if (result.type !== 'success') throw new Error(result.reason);
    expect(rings(result.features[0])).toHaveLength(2);
  });

  it('cuts a tiny hole the same way near the origin and at real longitudes', () => {
    // A 0.001° square and a 0.0000005° cutter inside it: the cutter removes
    // about 2.5e-7 of the area. Absolute-coordinate cross products at
    // (139.7, 35.66) round that away and reported no-overlap.
    for (const [x, y] of [
      [0, 0],
      [139.7, 35.66],
    ]) {
      const target: LibreDrawFeature = {
        id: 't',
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [square(x, y, 0.001)] },
        properties: {},
      };

      const result = cutPolygon(target, square(x + 0.0004, y + 0.0004, 0.0000005));

      if (result.type !== 'success') throw new Error(`${result.reason} at (${x}, ${y})`);
      expect(rings(result.features[0])).toHaveLength(2);
    }
  });

  it('reports empty-result when the cutter covers the polygon', () => {
    expect(cutPolygon(makeSquare('sq'), square(-1, -1, 12))).toEqual({
      type: 'error',
      reason: 'empty-result',
    });
  });

  it('reports no-overlap when the cutter misses, only touches, or lies in a hole', () => {
    const noOverlap = { type: 'error', reason: 'no-overlap' };
    expect(cutPolygon(makeSquare('sq'), square(20, 20, 2))).toEqual(noOverlap);
    expect(cutPolygon(makeSquare('sq'), square(10, 0, 5))).toEqual(noOverlap);
    expect(cutPolygon(makeSquareWithHole('h'), square(4.5, 4.5, 1))).toEqual(noOverlap);
  });

  it('reports invalid-result for a non-polygon target', () => {
    expect(cutPolygon(makeLine('l'), square(0, 0, 1))).toEqual({
      type: 'error',
      reason: 'invalid-result',
    });
  });
});
