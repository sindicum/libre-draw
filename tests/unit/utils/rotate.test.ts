import { describe, expect, it } from 'vitest';
import type { LibreDrawFeature, Position } from '../../../src/types/features';
import {
  angleBetween,
  fromMercator,
  getRotationCenter,
  isNoRotation,
  normalizeAngle,
  rotateFeature,
  snapAngle,
  toMercator,
} from '../../../src/utils/rotate';

// A 2° x 2° square centred on (10, 20). Small enough that Mercator distortion
// inside the square is negligible for the assertions below.
function makeSquare(): LibreDrawFeature {
  return {
    id: 'sq',
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [9, 19],
          [11, 19],
          [11, 21],
          [9, 21],
          [9, 19],
        ],
      ],
    },
    properties: { name: 'square' },
  };
}

function makeLine(): LibreDrawFeature {
  return {
    id: 'ln',
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: [
        [0, 0],
        [2, 0],
      ],
    },
    properties: {},
  };
}

// An L-shape: a 2x2 square with the north-east quadrant removed.
function makeLShape(): LibreDrawFeature {
  return {
    id: 'L',
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [2, 0],
          [2, 1],
          [1, 1],
          [1, 2],
          [0, 2],
          [0, 0],
        ],
      ],
    },
    properties: {},
  };
}

function makePoint(): LibreDrawFeature {
  return {
    id: 'pt',
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [1, 1] },
    properties: {},
  };
}

function ring(feature: LibreDrawFeature): Position[] {
  if (feature.geometry.type !== 'Polygon') throw new Error('not a polygon');
  return feature.geometry.coordinates[0];
}

function expectPositionClose(actual: Position, expected: Position, digits = 6): void {
  expect(actual[0]).toBeCloseTo(expected[0], digits);
  expect(actual[1]).toBeCloseTo(expected[1], digits);
}

describe('toMercator / fromMercator', () => {
  it('round-trips a position', () => {
    const original: Position = [139.6917, 35.6895];
    expectPositionClose(fromMercator(toMercator(original)), original, 9);
  });

  it('maps the origin to the center of the unit square', () => {
    expect(toMercator([0, 0])).toEqual({ x: 0.5, y: 0.5 });
  });

  it('grows y southwards', () => {
    expect(toMercator([0, -10]).y).toBeGreaterThan(toMercator([0, 10]).y);
  });
});

describe('getRotationCenter', () => {
  it('returns the centroid of a polygon (the center for a square)', () => {
    const center = getRotationCenter(makeSquare());
    expect(center.lng).toBeCloseTo(10, 9);
    // The Mercator centroid sits slightly off the lng/lat center in latitude.
    expect(center.lat).toBeCloseTo(20, 2);
  });

  it('returns the area centroid, not the bounding box center, for an L-shape', () => {
    const center = getRotationCenter(makeLShape());
    // Bounding box center would be (1, 1). Square (area 4, centroid (1, 1))
    // minus the removed quadrant (area 1, centroid (1.5, 1.5)) gives 2.5 / 3.
    // Loose tolerance: the shape spans 2° of latitude, where Mercator is not quite linear.
    expect(center.lng).toBeCloseTo(5 / 6, 4);
    expect(center.lat).toBeCloseTo(5 / 6, 3);
  });

  it('ignores holes when locating the centroid', () => {
    const withHole: LibreDrawFeature = {
      ...makeSquare(),
      geometry: {
        type: 'Polygon',
        coordinates: [
          ring(makeSquare()),
          [
            [10.2, 20.2],
            [10.8, 20.2],
            [10.8, 20.8],
            [10.2, 20.8],
            [10.2, 20.2],
          ],
        ],
      },
    };
    const center = getRotationCenter(withHole);
    expect(center.lng).toBeCloseTo(getRotationCenter(makeSquare()).lng, 9);
  });

  it('falls back to the vertex mean for a zero-area ring', () => {
    const flat: LibreDrawFeature = {
      ...makeSquare(),
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [2, 0],
            [4, 0],
            [0, 0],
          ],
        ],
      },
    };
    const center = getRotationCenter(flat);
    expect(center.lng).toBeCloseTo(2, 9);
    expect(center.lat).toBeCloseTo(0, 9);
  });

  it('returns the midpoint of a straight two-point line', () => {
    const center = getRotationCenter(makeLine());
    expect(center.lng).toBeCloseTo(1, 9);
    expect(center.lat).toBeCloseTo(0, 9);
  });

  it('weights line segments by length, not by vertex count', () => {
    // Segments of length 2 and 1: the centroid sits at x = (2*1 + 1*2) / 3.
    const bent: LibreDrawFeature = {
      ...makeLine(),
      geometry: {
        type: 'LineString',
        coordinates: [
          [0, 0],
          [2, 0],
          [2, 1],
        ],
      },
    };
    const center = getRotationCenter(bent);
    // Mercator stretches the 1° vertical segment slightly, hence the loose tolerance.
    expect(center.lng).toBeCloseTo(4 / 3, 4);
    expect(center.lat).toBeCloseTo(1 / 6, 3);
  });

  it('falls back to the vertex mean for a zero-length line', () => {
    const dot: LibreDrawFeature = {
      ...makeLine(),
      geometry: {
        type: 'LineString',
        coordinates: [
          [3, 4],
          [3, 4],
        ],
      },
    };
    const center = getRotationCenter(dot);
    expect(center.lng).toBeCloseTo(3, 9);
    expect(center.lat).toBeCloseTo(4, 9);
  });

  it('throws for a point', () => {
    expect(() => getRotationCenter(makePoint())).toThrow(/Point/);
  });
});

describe('getRotationCenter at metre scales', () => {
  // The L-shape's area centroid is at (5/6, 5/6) of its size; the vertex
  // mean is at (1, 1). The tolerance of 1% of the size tells the two apart
  // and still allows for Mercator's slight nonlinearity.
  const places: [string, number, number][] = [
    ['near the origin', 0, 0],
    ['in Tokyo', 139.7, 35.66],
    ['far from the origin', 179.9, -80],
  ];

  it('keeps the centroid of a 1.1 m L-shape at its area centroid, not the vertex mean', () => {
    const s = 1e-5;
    for (const [, ox, oy] of places) {
      const feature: LibreDrawFeature = {
        ...makeLShape(),
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [ox, oy],
              [ox + 2 * s, oy],
              [ox + 2 * s, oy + s],
              [ox + s, oy + s],
              [ox + s, oy + 2 * s],
              [ox, oy + 2 * s],
              [ox, oy],
            ],
          ],
        },
      };
      const center = getRotationCenter(feature);
      expect(Math.abs(center.lng - (ox + (5 / 6) * s))).toBeLessThan(s / 100);
      expect(Math.abs(center.lat - (oy + (5 / 6) * s))).toBeLessThan(s / 100);
    }
  });
});

describe('rotateFeature', () => {
  it('returns the same vertices for 0°', () => {
    const rotated = rotateFeature(makeSquare(), 0);
    ring(rotated).forEach((pos, i) => expectPositionClose(pos, ring(makeSquare())[i], 9));
  });

  it('returns the same vertices for 360°', () => {
    const rotated = rotateFeature(makeSquare(), 360);
    ring(rotated).forEach((pos, i) => expectPositionClose(pos, ring(makeSquare())[i], 9));
  });

  it('rotates a line 90° clockwise around its center', () => {
    const rotated = rotateFeature(makeLine(), 90);
    if (rotated.geometry.type !== 'LineString') throw new Error('type changed');
    const [a, b] = rotated.geometry.coordinates;
    // Clockwise on screen: the west end moves north, the east end moves south.
    expect(a[0]).toBeCloseTo(1, 6);
    expect(a[1]).toBeGreaterThan(0.9);
    expect(b[0]).toBeCloseTo(1, 6);
    expect(b[1]).toBeLessThan(-0.9);
  });

  it('rotates a line -90° counter-clockwise', () => {
    const rotated = rotateFeature(makeLine(), -90);
    if (rotated.geometry.type !== 'LineString') throw new Error('type changed');
    const [a] = rotated.geometry.coordinates;
    expect(a[1]).toBeLessThan(-0.9);
  });

  it('maps 180° to the point reflection through the center', () => {
    const original = makeLine();
    const rotated = rotateFeature(original, 180);
    if (rotated.geometry.type !== 'LineString') throw new Error('type changed');
    expectPositionClose(rotated.geometry.coordinates[0], [2, 0], 6);
    expectPositionClose(rotated.geometry.coordinates[1], [0, 0], 6);
  });

  it('keeps the centroid at the middle of a square', () => {
    // The middle is taken in Mercator space, where the square is a
    // rectangle; in degrees it sits slightly north of latitude 20 because
    // Mercator stretches latitude more towards the pole, so the northern
    // half of the square is the taller one.
    const sw = toMercator([9, 19]);
    const ne = toMercator([11, 21]);
    const [lng, lat] = fromMercator({ x: (sw.x + ne.x) / 2, y: (sw.y + ne.y) / 2 });
    const after = getRotationCenter(rotateFeature(makeSquare(), 37));
    expect(after.lng).toBeCloseTo(lng, 6);
    expect(after.lat).toBeCloseTo(lat, 6);
  });

  it('keeps the centroid of an irregular shape at its known value across repeated turns', () => {
    // Three unit squares centred at (0.5, 0.5), (1.5, 0.5) and (0.5, 1.5):
    // area centroid (5/6, 5/6). Mercator distortion within 2° of the
    // equator shifts the latitude by well under 1e-3.
    let feature = makeLShape();
    for (let i = 0; i < 5; i++) {
      feature = rotateFeature(feature, 37);
      const after = getRotationCenter(feature);
      expect(after.lng).toBeCloseTo(5 / 6, 3);
      expect(after.lat).toBeCloseTo(5 / 6, 3);
    }
  });

  it('keeps the centroid fixed for a bent line', () => {
    const bent: LibreDrawFeature = {
      ...makeLine(),
      geometry: {
        type: 'LineString',
        coordinates: [
          [0, 0],
          [2, 0],
          [2, 1],
        ],
      },
    };
    const before = getRotationCenter(bent);
    const after = getRotationCenter(rotateFeature(bent, 70));
    expect(after.lng).toBeCloseTo(before.lng, 6);
    expect(after.lat).toBeCloseTo(before.lat, 6);
  });

  it('keeps the polygon ring closed', () => {
    const rotated = ring(rotateFeature(makeSquare(), 45));
    expect(rotated[0]).toEqual(rotated[rotated.length - 1]);
  });

  it('composes: 90° four times returns to the start', () => {
    let feature = makeSquare();
    for (let i = 0; i < 4; i++) {
      feature = rotateFeature(feature, 90);
    }
    ring(feature).forEach((pos, i) => expectPositionClose(pos, ring(makeSquare())[i], 6));
  });

  it('keeps id and properties and does not mutate the input', () => {
    const original = makeSquare();
    const snapshot = JSON.stringify(original);
    const rotated = rotateFeature(original, 30);
    expect(rotated.id).toBe('sq');
    expect(rotated.properties).toEqual({ name: 'square' });
    expect(JSON.stringify(original)).toBe(snapshot);
  });

  it('rotates every ring of a polygon with holes', () => {
    const withHole: LibreDrawFeature = {
      ...makeSquare(),
      geometry: {
        type: 'Polygon',
        coordinates: [
          ring(makeSquare()),
          [
            [9.5, 19.5],
            [10.5, 19.5],
            [10.5, 20.5],
            [9.5, 20.5],
            [9.5, 19.5],
          ],
        ],
      },
    };
    const rotated = rotateFeature(withHole, 180);
    if (rotated.geometry.type !== 'Polygon') throw new Error('type changed');
    expect(rotated.geometry.coordinates).toHaveLength(2);
    expect(rotated.geometry.coordinates[1][0][0]).toBeCloseTo(10.5, 6);
  });

  it('throws for a point', () => {
    expect(() => rotateFeature(makePoint(), 90)).toThrow(/Point/);
  });
});

describe('angleBetween', () => {
  const center = { x: 0, y: 0 };

  it('returns 0 for the same direction', () => {
    expect(angleBetween(center, { x: 1, y: 0 }, { x: 2, y: 0 })).toBe(0);
  });

  it('returns +90 for a clockwise quarter turn in a y-down frame', () => {
    expect(angleBetween(center, { x: 1, y: 0 }, { x: 0, y: 1 })).toBeCloseTo(90);
  });

  it('returns -90 for a counter-clockwise quarter turn', () => {
    expect(angleBetween(center, { x: 1, y: 0 }, { x: 0, y: -1 })).toBeCloseTo(-90);
  });

  it('normalizes across the ±180 seam', () => {
    // From just below the negative x axis to just above it: a small clockwise move.
    expect(angleBetween(center, { x: -1, y: -0.01 }, { x: -1, y: 0.01 })).toBeCloseTo(-1.146, 2);
  });

  it('ignores the radius', () => {
    expect(angleBetween(center, { x: 10, y: 0 }, { x: 0, y: 0.5 })).toBeCloseTo(90);
  });
});

describe('normalizeAngle', () => {
  it('maps values into (-180, 180]', () => {
    expect(normalizeAngle(180)).toBe(180);
    expect(normalizeAngle(-180)).toBe(180);
    expect(normalizeAngle(190)).toBe(-170);
    expect(normalizeAngle(-190)).toBe(170);
    expect(normalizeAngle(720)).toBe(0);
  });
});

describe('snapAngle', () => {
  it('rounds to the nearest step', () => {
    expect(snapAngle(7, 15)).toBe(0);
    expect(snapAngle(8, 15)).toBe(15);
    expect(snapAngle(-22, 15)).toBe(-15);
    expect(snapAngle(-23, 15)).toBe(-30);
  });
});

describe('isNoRotation', () => {
  it('is true only for multiples of 360', () => {
    expect(isNoRotation(0)).toBe(true);
    expect(isNoRotation(360)).toBe(true);
    expect(isNoRotation(-360)).toBe(true);
    expect(isNoRotation(720)).toBe(true);
    expect(isNoRotation(90)).toBe(false);
    expect(isNoRotation(359.9)).toBe(false);
  });
});

// Metres per degree at a latitude, close enough to turn a coordinate
// difference into a distance for a tolerance check.
function metresBetween(a: { lng: number; lat: number }, b: Position): number {
  const dx = (a.lng - b[0]) * 111320 * Math.cos((b[1] * Math.PI) / 180);
  const dy = (a.lat - b[1]) * 110574;
  return Math.hypot(dx, dy);
}

function squareAt(lng: number, lat: number, sideDeg: number): LibreDrawFeature {
  return {
    id: 'sq',
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [lng, lat],
          [lng + sideDeg, lat],
          [lng + sideDeg, lat + sideDeg],
          [lng, lat + sideDeg],
          [lng, lat],
        ],
      ],
    },
    properties: {},
  };
}

describe('getRotationCenter / rotateFeature at metre scales', () => {
  // 1e-3° is about 111 m, 1e-5° about 1.1 m.
  const places: [string, number, number][] = [
    ['near the origin', 0.001, 0.001],
    ['in Tokyo', 139.7, 35.66],
  ];
  const sides = [1e-3, 1e-4, 1e-5];

  for (const [where, lng, lat] of places) {
    for (const side of sides) {
      it(`puts the centre of a ${side}° square ${where} within 1 cm of its middle`, () => {
        const center = getRotationCenter(squareAt(lng, lat, side));
        expect(metresBetween(center, [lng + side / 2, lat + side / 2])).toBeLessThan(0.01);
      });

      it(`returns a ${side}° square ${where} to its start after four 90° turns`, () => {
        let feature = squareAt(lng, lat, side);
        for (let i = 0; i < 4; i++) feature = rotateFeature(feature, 90);
        const original = ring(squareAt(lng, lat, side));
        ring(feature).forEach((position, i) => {
          expect(metresBetween({ lng: position[0], lat: position[1] }, original[i])).toBeLessThan(
            0.01
          );
        });
      });
    }
  }

  it('moves a corner by about the side length for a quarter turn', () => {
    const side = 1e-4; // about 11 m
    const before = ring(squareAt(139.7, 35.66, side))[0];
    const after = ring(rotateFeature(squareAt(139.7, 35.66, side), 90))[0];
    const moved = metresBetween({ lng: after[0], lat: after[1] }, before);
    expect(moved).toBeGreaterThan(5);
    expect(moved).toBeLessThan(15);
  });
});

describe('getRotationCenter degenerate rings', () => {
  const polygon = (ring: Position[]): LibreDrawFeature => ({
    id: 'p',
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [ring] },
    properties: {},
  });

  it('falls back to the vertex mean for a ring whose area is tiny but not zero', () => {
    // Four nearly collinear points whose vertex mean (lng 0.45) differs from
    // their area centroid (lng 0.6): the area is 3.6e-10 deg², far below
    // EPSILON × extent², so the mean must be returned. A triangle would not
    // do here, because its two centroids coincide.
    const center = getRotationCenter(
      polygon([
        [1.8, 0],
        [-3.6, 1e-10],
        [0, 1e-10],
        [3.6, 1e-10],
        [1.8, 0],
      ])
    );
    expect(center.lng).toBeCloseTo(0.45, 9);
    expect(center.lat).toBeCloseTo(0, 9);
  });

  it('uses the area centroid once the area is no longer negligible', () => {
    // The same four points opened up to a real quadrilateral: the vertex
    // mean would still be lng 0.45, the area centroid is not.
    const center = getRotationCenter(
      polygon([
        [1.8, 0],
        [-3.6, 1],
        [0, 1],
        [3.6, 1],
        [1.8, 0],
      ])
    );
    expect(center.lng).not.toBeCloseTo(0.45, 3);
    expect(center.lng).toBeCloseTo(0.6, 3);
  });

  it('does not depend on which vertex the ring starts from', () => {
    // An ordinary L-shape and a sliver right at the degenerate threshold:
    // every cyclic shift of the vertices must give the same centre.
    const h = 1.080010747500637e-9;
    const shapes: Position[][] = [
      ring(makeLShape()).slice(0, -1),
      [
        [1.8, 0],
        [-3.6, h],
        [0, h],
        [3.6, h],
      ],
    ];
    for (const open of shapes) {
      const centers = open.map((_, k) => {
        const shifted = [...open.slice(k), ...open.slice(0, k)];
        return getRotationCenter(polygon([...shifted, shifted[0]]));
      });
      for (const c of centers) {
        expect(c.lng).toBeCloseTo(centers[0].lng, 9);
        expect(c.lat).toBeCloseTo(centers[0].lat, 9);
      }
    }
  });
});
