import { describe, expect, it } from 'vitest';
import type { LibreDrawFeature, Position } from '../../../src/types/features';
import { normalizeReshapeLine, reshapePolygon } from '../../../src/utils/reshape';
import { findPolygonRingError } from '../../../src/validation/intersection';
import { makeSquare, makeSquareWithHole, ringArea } from '../operations/helpers';

function rings(feature: LibreDrawFeature): Position[][] {
  if (feature.geometry.type !== 'Polygon') throw new Error('expected Polygon');
  return feature.geometry.coordinates;
}

function outerArea(feature: LibreDrawFeature): number {
  return ringArea(rings(feature)[0]);
}

/** Relative to the first vertex, so real coordinates keep their precision. */
function signedArea(ring: Position[]): number {
  const [ox, oy] = ring[0];
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    sum += (ring[i][0] - ox) * (ring[i + 1][1] - oy) - (ring[i + 1][0] - ox) * (ring[i][1] - oy);
  }
  return sum / 2;
}

function reshaped(target: LibreDrawFeature, line: Position[]): LibreDrawFeature {
  const result = reshapePolygon(target, line);
  if (result.type === 'error') throw new Error(result.reason);
  const outer = rings(result.feature)[0];
  // Every success is a closed, valid polygon.
  expect(outer[0]).toEqual(outer[outer.length - 1]);
  expect(findPolygonRingError(rings(result.feature))).toBeNull();
  return result.feature;
}

function failure(target: LibreDrawFeature, line: Position[]): string {
  const result = reshapePolygon(target, line);
  if (result.type === 'success') throw new Error('expected a failure');
  return result.reason;
}

// Dips into the bottom edge of the 10 x 10 square between x = 2 and 5.
const NOTCH: Position[] = [
  [2, -1],
  [2, 2],
  [5, 2],
  [5, -1],
];

// Pushes the right edge out to x = 11 between y = 2 and 8.
const BULGE: Position[] = [
  [9, 2],
  [11, 2],
  [11, 8],
  [9, 8],
];

describe('normalizeReshapeLine', () => {
  it('copies a line of two or more numeric positions', () => {
    const line: Position[] = [
      [0, 0],
      [1, 1],
    ];
    const normalized = normalizeReshapeLine(line);
    expect(normalized).toEqual(line);
    expect(normalized).not.toBe(line);
    expect(normalized![0]).not.toBe(line[0]);
  });

  it('rejects fewer than two positions, non-numeric positions, and non-arrays', () => {
    expect(normalizeReshapeLine([[0, 0]])).toBeNull();
    expect(normalizeReshapeLine([])).toBeNull();
    expect(
      normalizeReshapeLine([
        [0, 0],
        [1, Number.NaN],
      ])
    ).toBeNull();
    expect(normalizeReshapeLine('line' as unknown as Position[])).toBeNull();
    expect(normalizeReshapeLine([[0, 0], 'x'] as unknown as Position[])).toBeNull();
  });
});

describe('reshapePolygon', () => {
  it('removes area when the line runs inside, keeping the id and properties', () => {
    const target = makeSquare('sq');
    const feature = reshaped(target, NOTCH);

    expect(feature.id).toBe('sq');
    expect(feature.properties).toEqual({ name: 'sq' });
    expect(feature.properties).not.toBe(target.properties);
    expect(outerArea(feature)).toBeCloseTo(94);
    expect(rings(feature)[0]).toEqual(
      expect.arrayContaining([
        [2, 2],
        [5, 2],
      ])
    );
    // The ends beyond the crossings are dropped.
    expect(rings(feature)[0]).not.toContainEqual([2, -1]);
  });

  it('adds area when the line runs outside, dropping the ends inside', () => {
    const feature = reshaped(makeSquare('sq'), BULGE);

    expect(outerArea(feature)).toBeCloseTo(106);
    expect(rings(feature)[0]).toEqual(
      expect.arrayContaining([
        [11, 2],
        [11, 8],
      ])
    );
    expect(rings(feature)[0]).not.toContainEqual([9, 2]);
  });

  it('gives the same result whichever way the line is drawn', () => {
    const forward = reshaped(makeSquare('sq'), NOTCH);
    const backward = reshaped(makeSquare('sq'), [...NOTCH].reverse());
    expect(outerArea(backward)).toBeCloseTo(outerArea(forward));
    expect(rings(backward)[0]).toEqual(
      expect.arrayContaining([
        [2, 2],
        [5, 2],
      ])
    );
  });

  it('keeps the larger piece when an inside line cuts the polygon in two', () => {
    const feature = reshaped(makeSquare('sq'), [
      [7, -1],
      [7, 11],
    ]);
    expect(outerArea(feature)).toBeCloseTo(70);
    expect(rings(feature)[0].every(([x]) => x <= 7)).toBe(true);
  });

  it('replaces the arc followed from the first crossing on an exact tie', () => {
    // Both halves are 50: the arc from (5, 0) to (5, 10) along the ring
    // (the right half) is replaced, so the left half remains.
    const feature = reshaped(makeSquare('sq'), [
      [5, -1],
      [5, 11],
    ]);
    expect(outerArea(feature)).toBeCloseTo(50);
    expect(rings(feature)[0].every(([x]) => x <= 5)).toBe(true);
  });

  it('accepts line ends that lie exactly on the ring', () => {
    const feature = reshaped(makeSquare('sq'), [
      [10, 2],
      [12, 2],
      [12, 8],
      [10, 8],
    ]);
    expect(outerArea(feature)).toBeCloseTo(112);
  });

  it('accepts line ends on ring vertices, replacing the whole edge between them', () => {
    const feature = reshaped(makeSquare('sq'), [
      [10, 0],
      [12, 5],
      [10, 10],
    ]);
    expect(outerArea(feature)).toBeCloseTo(110);
    expect(rings(feature)[0]).toContainEqual([12, 5]);
  });

  it('counts a line through a ring vertex as one crossing there', () => {
    // Enters at the corner (0, 0), leaves through the bottom edge at x = 3.
    const feature = reshaped(makeSquare('sq'), [
      [-1, -1],
      [3, 3],
      [3, -1],
    ]);
    expect(outerArea(feature)).toBeCloseTo(95.5);
  });

  it('inserts a crossing that lies just off a ring vertex', () => {
    // (5e-10, 0) is a fraction of 5e-11 along the bottom edge, yet a
    // distinct position from the corner (0, 0).
    const feature = reshaped(makeSquare('sq'), [
      [5e-10, -1],
      [5e-10, 2],
      [5, 2],
      [5, -1],
    ]);
    expect(outerArea(feature)).toBeCloseTo(90);
  });

  it('keeps the ring orientation of the target', () => {
    const ccw = makeSquare('sq');
    const cw = makeSquare('cw');
    rings(cw)[0].reverse();

    expect(signedArea(rings(reshaped(ccw, NOTCH))[0])).toBeGreaterThan(0);
    expect(signedArea(rings(reshaped(cw, NOTCH))[0])).toBeLessThan(0);
    expect(signedArea(rings(reshaped(cw, BULGE))[0])).toBeLessThan(0);
  });

  it('works on real coordinates far from the origin', () => {
    const target = makeSquare('real', 139.7, 35.66, 0.001);
    const feature = reshaped(target, [
      [139.7002, 35.6599],
      [139.7002, 35.6602],
      [139.7005, 35.6602],
      [139.7005, 35.6599],
    ]);
    // 0.0003 x 0.0002 notch out of 0.001 x 0.001.
    expect(Math.abs(signedArea(rings(feature)[0]))).toBeCloseTo(1e-6 - 6e-8, 15);
  });

  describe('crossing count', () => {
    it('fails when the line misses the ring', () => {
      expect(
        failure(makeSquare('sq'), [
          [11, 0],
          [12, 5],
        ])
      ).toBe('invalid-intersection-count');
    });

    it('fails when the line crosses once', () => {
      expect(
        failure(makeSquare('sq'), [
          [5, 5],
          [15, 5],
        ])
      ).toBe('invalid-intersection-count');
    });

    it('fails when the line crosses three times', () => {
      expect(
        failure(makeSquare('sq'), [
          [-1, 5],
          [11, 5],
          [11, 7],
          [5, 7],
          [5, 12],
        ])
      ).toBe('invalid-intersection-count');
    });

    it('fails when the line lies inside without reaching the ring', () => {
      expect(
        failure(makeSquare('sq'), [
          [2, 2],
          [8, 8],
        ])
      ).toBe('invalid-intersection-count');
    });
  });

  it('fails when the line crosses itself', () => {
    expect(
      failure(makeSquare('sq'), [
        [2, -1],
        [2, 4],
        [6, 2],
        [1, 2],
        [5, -1],
      ])
    ).toBe('self-intersecting-result');
  });

  it('fails when the line crosses itself at one of its own vertices', () => {
    // The line passes (4, 4) twice, so the new outer ring crosses itself there.
    expect(
      failure(makeSquare('sq'), [
        [2, -1],
        [2, 2],
        [4, 4],
        [6, 6],
        [2, 6],
        [4, 4],
        [6, 2],
        [8, -1],
      ])
    ).toBe('self-intersecting-result');
  });

  it.each([1e-5, 1e-7])(
    'finds the crossings of a small polygon on real coordinates (scale %s)',
    (scale) => {
      // A 10 x 10 square of 'scale' degrees (about 1 m, then 1 cm): the
      // crossing edges are too short for a fixed cross-product threshold.
      const toReal = ([x, y]: Position): Position => [139.7 + x * scale, 35.66 + y * scale];
      const target = makeSquare('small');
      target.geometry.coordinates = [rings(target)[0].map(toReal)];

      const feature = reshaped(target, NOTCH.map(toReal));
      expect(Math.abs(signedArea(rings(feature)[0])) / (94 * scale * scale)).toBeCloseTo(1, 6);
    }
  );

  describe('holes', () => {
    it('keeps a hole the new outer ring still contains', () => {
      const feature = reshaped(makeSquareWithHole('sq'), NOTCH);
      expect(rings(feature)).toHaveLength(2);
      expect(rings(feature)[1]).toEqual(rings(makeSquareWithHole('x'))[1]);
    });

    it('fails when the removed area takes the hole with it', () => {
      expect(
        failure(makeSquareWithHole('sq'), [
          [3, -1],
          [3, 7],
          [7, 7],
          [7, -1],
        ])
      ).toBe('hole-outside');
    });

    it('fails when the line runs through the hole', () => {
      expect(
        failure(makeSquareWithHole('sq'), [
          [5, -1],
          [5, 11],
        ])
      ).toBe('ring-intersection');
    });
  });

  it('fails on a feature that is not a Polygon', () => {
    const line: LibreDrawFeature = {
      id: 'l',
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [
          [0, 0],
          [1, 1],
        ],
      },
      properties: {},
    };
    expect(failure(line, NOTCH)).toBe('invalid-result');
  });
});
