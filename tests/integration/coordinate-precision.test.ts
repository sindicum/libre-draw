import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LibreDraw } from '../../src/LibreDraw';
import { LibreDrawError } from '../../src/core/errors';
import type { CreateEvent, EditRejectedEvent } from '../../src/types/events';
import type { LibreDrawFeature, Position } from '../../src/types/features';
import { createCoordinateRounder } from '../../src/utils/precision';
import { FakeMap } from './helpers/fakeMap';

// Contract of the coordinatePrecision option: every stored coordinate is
// rounded before validation, reads return the stored value, and a shape
// that only rounding breaks is refused. FakeMap maps one pixel to one
// degree, so fractional client coordinates give off-grid positions.

const round8 = createCoordinateRounder(8);

function pressAt(map: FakeMap, x: number, y: number): void {
  map
    .getCanvasContainer()
    .dispatchEvent(new MouseEvent('mousedown', { clientX: x, clientY: y, button: 0 }));
}

function moveTo(x: number, y: number): void {
  window.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y, button: 0 }));
}

function releaseAt(x: number, y: number): void {
  window.dispatchEvent(new MouseEvent('mouseup', { clientX: x, clientY: y, button: 0 }));
}

function clickAt(map: FakeMap, x: number, y: number, modifiers: MouseEventInit = {}): void {
  map
    .getCanvasContainer()
    .dispatchEvent(
      new MouseEvent('mousedown', { clientX: x, clientY: y, button: 0, ...modifiers })
    );
  window.dispatchEvent(
    new MouseEvent('mouseup', { clientX: x, clientY: y, button: 0, ...modifiers })
  );
}

function polygon(id: string, ring: Position[]): GeoJSON.Feature {
  return {
    id,
    type: 'Feature',
    properties: {},
    geometry: { type: 'Polygon', coordinates: [[...ring, ring[0]]] },
  };
}

function point(id: string, position: Position): GeoJSON.Feature {
  return {
    id,
    type: 'Feature',
    properties: {},
    geometry: { type: 'Point', coordinates: position },
  };
}

function collection(...features: GeoJSON.Feature[]): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features };
}

/** Whether every coordinate of the feature is already rounded to 8 places. */
function isOnGrid(feature: LibreDrawFeature | undefined): boolean {
  return (
    feature !== undefined && JSON.stringify(round8.feature(feature)) === JSON.stringify(feature)
  );
}

function outerRing(draw: LibreDraw, id: string): Position[] {
  const feature = draw.getFeatureById(id);
  if (!feature || feature.geometry.type !== 'Polygon') throw new Error(`no polygon ${id}`);
  return feature.geometry.coordinates[0];
}

const SQUARE: Position[] = [
  [0, 0],
  [10, 0],
  [10, 10],
  [0, 10],
];

/** A triangle whose sides (1e-9 degrees) vanish at 8 decimal places. */
const TINY: Position[] = [
  [139.700000001, 35.6],
  [139.700000002, 35.6],
  [139.700000001, 35.600000001],
];

describe('coordinatePrecision', () => {
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

  describe('option', () => {
    it.each([-1, 16, 1.5, Number.NaN, true, '8', null])('rejects %s', (value) => {
      expect(
        () =>
          new LibreDraw(new FakeMap().asMap(), {
            toolbar: false,
            coordinatePrecision: value as number,
          })
      ).toThrow(LibreDrawError);
    });

    it.each([0, 15, false] as const)('accepts %s', (value) => {
      const draw = new LibreDraw(new FakeMap().asMap(), {
        toolbar: false,
        coordinatePrecision: value,
      });
      draw.destroy();
    });
  });

  describe('API input', () => {
    it('stores 8 decimal places by default and returns the stored value from every read', () => {
      const draw = new LibreDraw(new FakeMap().asMap(), { toolbar: false });
      const created: CreateEvent[] = [];
      draw.on('create', (e) => created.push(e));

      const [result] = draw.addFeatures([point('p', [139.123456789, 35.000000004])]);

      const expected = { type: 'Point', coordinates: [139.12345679, 35] };
      expect(result).toEqual({ valid: true, id: 'p' });
      expect(draw.getFeatureById('p')?.geometry).toEqual(expected);
      expect(draw.getFeatures()[0].geometry).toEqual(expected);
      expect(draw.toGeoJSON().features[0].geometry).toEqual(expected);
      expect(created[0].feature.geometry).toEqual(expected);
    });

    it('rounds setFeatures, updateFeature and validateFeature the same way', () => {
      const draw = new LibreDraw(new FakeMap().asMap(), { toolbar: false });

      const set = draw.setFeatures(collection(point('p', [1.000000006, 2])));
      expect(set.ok && set.created[0].geometry).toEqual({
        type: 'Point',
        coordinates: [1.00000001, 2],
      });

      const updated = draw.updateFeature('p', {
        geometry: { type: 'Point', coordinates: [3.123456784, 4] },
      });
      expect(updated.ok && updated.updated[0].geometry).toEqual({
        type: 'Point',
        coordinates: [3.12345678, 4],
      });
      expect(draw.getFeatureById('p')?.geometry).toEqual({
        type: 'Point',
        coordinates: [3.12345678, 4],
      });

      const validated = draw.validateFeature(point('q', [5.555555557, 6]));
      expect(validated.valid && validated.feature.geometry).toEqual({
        type: 'Point',
        coordinates: [5.55555556, 6],
      });
    });

    it('keeps coordinates as given with false, and rounds to the given places otherwise', () => {
      const raw = new LibreDraw(new FakeMap().asMap(), {
        toolbar: false,
        coordinatePrecision: false,
      });
      raw.addFeatures([point('p', [139.123456789123, 35.1])]);
      expect(raw.getFeatureById('p')?.geometry).toEqual({
        type: 'Point',
        coordinates: [139.123456789123, 35.1],
      });

      const coarse = new LibreDraw(new FakeMap().asMap(), {
        toolbar: false,
        coordinatePrecision: 3,
      });
      coarse.addFeatures([point('p', [139.12345, -35.0004])]);
      expect(coarse.getFeatureById('p')?.geometry).toEqual({
        type: 'Point',
        coordinates: [139.123, -35],
      });
    });

    it('refuses a shape that rounding collapses, leaving the store and history untouched', () => {
      const draw = new LibreDraw(new FakeMap().asMap(), { toolbar: false });
      draw.setFeatures(collection(polygon('keep', SQUARE)));

      const [added] = draw.addFeatures([polygon('tiny', TINY)]);
      expect(added).toMatchObject({ valid: false, id: 'tiny', reason: 'invalid-feature' });
      expect(!added.valid && added.message).toMatch(/^Invalid after rounding the coordinates: /);

      const set = draw.setFeatures(collection(polygon('tiny', TINY)));
      expect(set).toMatchObject({ ok: false, reason: 'invalid-geojson' });
      expect(!set.ok && set.message).toMatch(
        /^Invalid feature at index 0: Invalid after rounding the coordinates: /
      );

      const updated = draw.updateFeature('keep', {
        geometry: { type: 'Polygon', coordinates: [[...TINY, TINY[0]]] },
      });
      expect(updated).toMatchObject({ ok: false, reason: 'invalid-feature' });

      expect(draw.validateFeature(polygon('tiny', TINY))).toMatchObject({
        valid: false,
        reason: 'invalid-feature',
      });
      expect(draw.getFeatures().map((f) => f.id)).toEqual(['keep']);
      expect(outerRing(draw, 'keep')).toEqual([...SQUARE, SQUARE[0]]);
      expect(draw.canUndo()).toBe(false);
    });

    it('accepts the same tiny shape when coordinates are not rounded', () => {
      const draw = new LibreDraw(new FakeMap().asMap(), {
        toolbar: false,
        coordinatePrecision: false,
      });
      expect(draw.addFeatures([polygon('tiny', TINY)])).toEqual([{ valid: true, id: 'tiny' }]);
    });

    it('rejects input that is invalid before rounding even if rounding would repair it', () => {
      const draw = new LibreDraw(new FakeMap().asMap(), { toolbar: false });
      const unclosed: GeoJSON.Feature = {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'Polygon',
          coordinates: [[...SQUARE, [0, 1e-12]]],
        },
      };

      const [result] = draw.addFeatures([unclosed]);

      expect(result).toEqual({
        valid: false,
        reason: 'invalid-feature',
        message: 'Ring is not closed. The first and last positions must be identical.',
      });
    });
  });

  describe('operations', () => {
    let draw: LibreDraw;

    beforeEach(() => {
      draw = new LibreDraw(new FakeMap().asMap(), { toolbar: false });
      draw.addFeatures([polygon('a', SQUARE)]);
    });

    it.each([
      ['rotate', (d: LibreDraw) => d.rotate('a', 30)],
      [
        'split',
        (d: LibreDraw) =>
          d.split('a', [
            [3.3333333333, -1],
            [6.6666666667, 11],
          ]),
      ],
      ['setback', (d: LibreDraw) => d.setback('a', { index: 0 }, 123.456)],
      [
        'cut',
        (d: LibreDraw) =>
          d.cut('a', [
            [2.123456789, 2],
            [5, 2.000000003],
            [3.333333333, 4],
          ]),
      ],
      [
        'reshape',
        (d: LibreDraw) =>
          d.reshape('a', [
            [-1, 5.123456789],
            [5, 6.987654321],
            [11, 5.5],
          ]),
      ],
    ])('%s stores and returns rounded coordinates', (_name, run) => {
      const result = run(draw);

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('expected success');
      const written = [...result.created, ...result.updated];
      expect(written.length).toBeGreaterThan(0);
      for (const feature of written) {
        expect(isOnGrid(feature)).toBe(true);
        expect(draw.getFeatureById(feature.id)).toEqual(feature);
      }
    });

    it('union stores and returns rounded coordinates', () => {
      draw.addFeatures([
        polygon('b', [
          [5.123456789, 5],
          [15, 5],
          [15, 15],
          [5.123456789, 15],
        ]),
      ]);

      const result = draw.union(['a', 'b']);

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('expected success');
      expect(isOnGrid(result.created[0])).toBe(true);
    });
  });

  describe('on the map', () => {
    let map: FakeMap;

    beforeEach(() => {
      map = new FakeMap();
    });

    const TRIANGLE: Position[] = [
      [10, 10],
      [70, 10],
      [40, 60],
    ];

    it('rounds a drawn polygon when it is closed', () => {
      const draw = new LibreDraw(map.asMap(), { toolbar: false });
      draw.setMode('draw-polygon');
      clickAt(map, 10.123456789, 10.987654321);
      clickAt(map, 50.000000004, 10);
      clickAt(map, 30, 50.555555557);
      clickAt(map, 10.123456789, 10.987654321);

      const [feature] = draw.getFeatures();
      expect(feature.geometry).toEqual({
        type: 'Polygon',
        coordinates: [
          [
            [10.12345679, 10.98765432],
            [50, 10],
            [30, 50.55555556],
            [10.12345679, 10.98765432],
          ],
        ],
      });
    });

    it('rounds a drawn point and a drawn line', () => {
      const draw = new LibreDraw(map.asMap(), { toolbar: false });
      draw.setMode('draw-point');
      clickAt(map, 20.123456789, 20);
      draw.setMode('draw-line');
      clickAt(map, 30, 30.000000004);
      clickAt(map, 40.987654321, 30);
      draw.finishDrawing();

      expect(draw.getFeatures().map((f) => f.geometry)).toEqual([
        { type: 'Point', coordinates: [20.12345679, 20] },
        {
          type: 'LineString',
          coordinates: [
            [30, 30],
            [40.98765432, 30],
          ],
        },
      ]);
    });

    it('refuses to close a polygon that rounding flattens and keeps the draft', () => {
      const draw = new LibreDraw(map.asMap(), { toolbar: false, coordinatePrecision: 0 });
      const rejected: EditRejectedEvent[] = [];
      draw.on('editrejected', (e) => rejected.push(e));
      draw.setMode('draw-polygon');
      clickAt(map, 10, 10);
      clickAt(map, 30, 10.4);
      clickAt(map, 50, 10);
      clickAt(map, 10, 10);

      expect(rejected).toEqual([{ action: 'close', reason: 'invalid-result', origin: 'user' }]);
      expect(draw.getFeatures()).toEqual([]);
      expect(draw.getDraftVertexCount()).toBe(3);
    });

    it('refuses a rectangle that rounding flattens and keeps the first corner', () => {
      const draw = new LibreDraw(map.asMap(), { toolbar: false, coordinatePrecision: 0 });
      const rejected: EditRejectedEvent[] = [];
      draw.on('editrejected', (e) => rejected.push(e));
      draw.setMode('draw-rectangle');
      clickAt(map, 10, 10);
      clickAt(map, 30, 10.4);

      expect(rejected).toEqual([{ action: 'close', reason: 'invalid-result', origin: 'user' }]);
      expect(draw.getFeatures()).toEqual([]);
      expect(draw.getDraftVertexCount()).toBe(1);
    });

    it('refuses an angled rectangle that rounding flattens and keeps the base edge', () => {
      const draw = new LibreDraw(map.asMap(), { toolbar: false, coordinatePrecision: 0 });
      const rejected: EditRejectedEvent[] = [];
      draw.on('editrejected', (e) => rejected.push(e));
      draw.setMode('draw-angled-rectangle');
      clickAt(map, 10, 10);
      clickAt(map, 50, 10);
      clickAt(map, 30, 10.4);

      expect(rejected).toEqual([{ action: 'close', reason: 'invalid-result', origin: 'user' }]);
      expect(draw.getFeatures()).toEqual([]);
      expect(draw.getDraftVertexCount()).toBe(2);
    });

    it('rounds a dragged vertex only when the drag ends', () => {
      const draw = new LibreDraw(map.asMap(), { toolbar: false });
      draw.addFeatures([polygon('t', TRIANGLE)]);
      draw.setMode('select');
      clickAt(map, 40, 30);

      pressAt(map, 40, 60);
      moveTo(45.123456789, 65.000000004);
      expect(outerRing(draw, 't')[2]).toEqual([45.123456789, 65.000000004]);
      releaseAt(45.123456789, 65.000000004);

      expect(outerRing(draw, 't')[2]).toEqual([45.12345679, 65]);
      expect(draw.canUndo()).toBe(true);
    });

    it('puts a vertex back when rounding would flatten the polygon', () => {
      const draw = new LibreDraw(map.asMap(), { toolbar: false, coordinatePrecision: 0 });
      draw.setFeatures(collection(polygon('t', TRIANGLE)));
      const rejected: EditRejectedEvent[] = [];
      draw.on('editrejected', (e) => rejected.push(e));
      draw.setMode('select');
      clickAt(map, 40, 30);

      pressAt(map, 40, 60);
      moveTo(40, 10.4);
      releaseAt(40, 10.4);

      expect(rejected).toEqual([
        { action: 'move-vertex', reason: 'invalid-result', featureId: 't', origin: 'user' },
      ]);
      expect(outerRing(draw, 't')[2]).toEqual([40, 60]);
      expect(draw.canUndo()).toBe(false);
    });

    it('moves a dragged feature by the rounded delta, keeping its exact shape', () => {
      const draw = new LibreDraw(map.asMap(), { toolbar: false, coordinatePrecision: 2 });
      draw.addFeatures([polygon('t', TRIANGLE)]);
      draw.setMode('select');
      clickAt(map, 40, 30);

      pressAt(map, 40, 30);
      moveTo(50.123456, 30.987654);
      releaseAt(50.123456, 30.987654);

      expect(outerRing(draw, 't')).toEqual([
        [20.12, 10.99],
        [80.12, 10.99],
        [50.12, 60.99],
        [20.12, 10.99],
      ]);
    });

    it('rounds a dragged point when the drag ends', () => {
      const draw = new LibreDraw(map.asMap(), { toolbar: false, coordinatePrecision: 2 });
      draw.addFeatures([point('p', [20, 20])]);
      draw.setMode('select');
      clickAt(map, 20, 20);

      pressAt(map, 20, 20);
      moveTo(25.123, 25.987);
      releaseAt(25.123, 25.987);

      expect(draw.getFeatureById('p')?.geometry).toEqual({
        type: 'Point',
        coordinates: [25.12, 25.99],
      });
    });

    it('moves a multi-selection by one rounded delta', () => {
      const draw = new LibreDraw(map.asMap(), { toolbar: false, coordinatePrecision: 2 });
      draw.addFeatures([polygon('t', TRIANGLE), point('p', [70, 70])]);
      draw.setMode('select');
      clickAt(map, 40, 30);
      clickAt(map, 70, 70, { shiftKey: true });
      expect(draw.getSelectedFeatureIds()).toEqual(['t', 'p']);

      pressAt(map, 40, 30);
      moveTo(50.123456, 30.987654);
      releaseAt(50.123456, 30.987654);

      expect(outerRing(draw, 't')[0]).toEqual([20.12, 10.99]);
      expect(draw.getFeatureById('p')?.geometry).toEqual({
        type: 'Point',
        coordinates: [80.12, 70.99],
      });
    });

    it('rounds a rotation only when it is committed', () => {
      const draw = new LibreDraw(map.asMap(), { toolbar: false });
      draw.addFeatures([
        polygon(
          'a',
          SQUARE.map(([x, y]) => [x * 2 + 20, y * 2 + 20])
        ),
      ]);
      draw.setMode('rotate');
      clickAt(map, 30, 30);

      pressAt(map, 40, 30);
      moveTo(35, 40);
      expect(isOnGrid(draw.getFeatureById('a'))).toBe(false);
      releaseAt(35, 40);

      expect(isOnGrid(draw.getFeatureById('a'))).toBe(true);
    });
  });
});
