import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import turfArea from '@turf/area';
import { LibreDraw } from '../../src/LibreDraw';
import { LibreDrawError } from '../../src/core/errors';
import type { PolygonGeometry, Position } from '../../src/types/features';
import { FakeMap } from './helpers/fakeMap';

function ring(x: number, y: number, size: number): Position[] {
  return [
    [x, y],
    [x + size, y],
    [x + size, y + size],
    [x, y + size],
    [x, y],
  ];
}

function polygon(id: string, rings: Position[][]): GeoJSON.Feature {
  return { id, type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: rings } };
}

function create(options: ConstructorParameters<typeof LibreDraw>[1] = {}): LibreDraw {
  return new LibreDraw(new FakeMap().asMap(), { toolbar: false, ...options });
}

describe('getArea()', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', ((cb: FrameRequestCallback): number => {
      cb(0);
      return 1;
    }) as typeof requestAnimationFrame);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns the @turf/area value of a known square by default', () => {
    const draw = create();
    const square = polygon('sq', [ring(0, 0, 0.001)]);
    draw.addFeatures([square]);
    expect(draw.getArea('sq')).toBe(turfArea(square));
    expect(draw.getArea('sq')).toBeCloseTo(12364.4, 0);
  });

  it('subtracts holes', () => {
    const draw = create();
    const outer = ring(0, 0, 0.002);
    const hole = ring(0.0005, 0.0005, 0.001).reverse();
    draw.addFeatures([polygon('outer', [outer]), polygon('holed', [outer, hole])]);
    const holeArea = turfArea(polygon('h', [hole]));
    expect(draw.getArea('holed')).toBeCloseTo(draw.getArea('outer')! - holeArea, 6);
  });

  it('returns undefined for an unknown id, a LineString and a Point', () => {
    const draw = create();
    draw.addFeatures([
      {
        id: 'l',
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: [
            [0, 0],
            [1, 1],
          ],
        },
      },
      {
        id: 'pt',
        type: 'Feature',
        properties: {},
        geometry: { type: 'Point', coordinates: [0, 0] },
      },
    ]);
    expect(draw.getArea('missing')).toBeUndefined();
    expect(draw.getArea('l')).toBeUndefined();
    expect(draw.getArea('pt')).toBeUndefined();
  });

  it('follows updates and undo / redo', () => {
    const draw = create();
    draw.addFeatures([polygon('sq', [ring(0, 0, 0.001)])]);
    const before = draw.getArea('sq')!;
    draw.updateFeature('sq', { geometry: { type: 'Polygon', coordinates: [ring(0, 0, 0.002)] } });
    expect(draw.getArea('sq')).toBeCloseTo(before * 4, 0);
    draw.undo();
    expect(draw.getArea('sq')).toBe(before);
    draw.redo();
    expect(draw.getArea('sq')).toBeCloseTo(before * 4, 0);
  });

  it('throws after destroy()', () => {
    const draw = create();
    draw.destroy();
    expect(() => draw.getArea('sq')).toThrow(LibreDrawError);
  });

  describe('measureArea option', () => {
    it('returns what measureArea returns, called with a copy of the stored (rounded) geometry', () => {
      const received: PolygonGeometry[] = [];
      const draw = create({
        coordinatePrecision: 2,
        measureArea: (geometry) => {
          received.push(geometry);
          geometry.coordinates[0][0] = [99, 99];
          return 7;
        },
      });
      draw.addFeatures([polygon('sq', [ring(0.001, 0.001, 1)])]);
      const stored = draw.getFeatureById('sq')!.geometry;
      expect(draw.getArea('sq')).toBe(7);
      expect(received).toHaveLength(1);
      expect(received[0].coordinates[0].slice(1)).toEqual(
        (stored as PolygonGeometry).coordinates[0].slice(1)
      );
      expect((stored as PolygonGeometry).coordinates[0][0]).toEqual([0, 0]);
      // Mutating the argument does not change the store.
      expect(draw.getFeatureById('sq')!.geometry).toEqual(stored);
    });

    it('is not called for non-polygons', () => {
      const measureArea = vi.fn(() => 1);
      const draw = create({ measureArea });
      draw.addFeatures([
        {
          id: 'pt',
          type: 'Feature',
          properties: {},
          geometry: { type: 'Point', coordinates: [0, 0] },
        },
      ]);
      expect(draw.getArea('pt')).toBeUndefined();
      expect(measureArea).not.toHaveBeenCalled();
    });

    it('lets an exception from measureArea propagate', () => {
      const error = new Error('boom');
      const draw = create({
        measureArea: () => {
          throw error;
        },
      });
      draw.addFeatures([polygon('sq', [ring(0, 0, 1)])]);
      expect(() => draw.getArea('sq')).toThrow(error);
    });

    it.each([null, 1, 'area', {}])('rejects %s', (value) => {
      expect(() => create({ measureArea: value as never })).toThrow(LibreDrawError);
    });
  });
});
