import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LibreDraw } from '../../src/LibreDraw';
import { LibreDrawError } from '../../src/core/errors';
import type { CreateEvent, DeleteEvent, EventOrigin } from '../../src/types/events';
import { FakeMap } from './helpers/fakeMap';

function makeSquare(id: string | undefined, x = 10, y = 10, size = 20) {
  return {
    ...(id === undefined ? {} : { id }),
    type: 'Feature' as const,
    geometry: {
      type: 'Polygon' as const,
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
    properties: { name: id ?? 'anonymous' },
  };
}

/** An open ring: rejected by validation with a stable message. */
function makeBroken(id: string) {
  return {
    id,
    type: 'Feature' as const,
    geometry: {
      type: 'Polygon' as const,
      coordinates: [
        [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10],
        ],
      ],
    },
    properties: {},
  };
}

/** A click on the map canvas (mousedown on the canvas, mouseup on window). */
function clickAt(map: FakeMap, x: number, y: number): void {
  const canvas = map.getCanvasContainer();
  canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: x, clientY: y, button: 0 }));
  window.dispatchEvent(new MouseEvent('mouseup', { clientX: x, clientY: y, button: 0 }));
}

/** A keydown with the map focused (bubbles from the canvas to the container). */
function pressOnMap(map: FakeMap, init: KeyboardEventInit): void {
  map
    .getCanvasContainer()
    .dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));
}

function button(map: FakeMap, title: string): HTMLButtonElement {
  const el = map.getContainer().querySelector<HTMLButtonElement>(`button[title="${title}"]`);
  if (!el) throw new Error(`toolbar button not found: ${title}`);
  return el;
}

describe('structured results and event origin', () => {
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

  describe('addFeatures() in strict mode (default)', () => {
    it('returns one valid result per feature and fills in generated ids', () => {
      const draw = new LibreDraw(new FakeMap().asMap(), { toolbar: false });

      const results = draw.addFeatures([makeSquare('a'), makeSquare(undefined)]);

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({ valid: true, id: 'a' });
      expect(results[1].valid).toBe(true);
      const generated = results[1].valid ? results[1].id : '';
      expect(generated).not.toBe('');
      expect(draw.getFeatureById(generated)?.properties).toEqual({ name: 'anonymous' });
    });

    it('returns an empty array for empty input without touching history', () => {
      const draw = new LibreDraw(new FakeMap().asMap(), { toolbar: false });
      expect(draw.addFeatures([])).toEqual([]);
      expect(draw.undo()).toBe(false);
    });

    it('throws on the first invalid feature and adds nothing', () => {
      const draw = new LibreDraw(new FakeMap().asMap(), { toolbar: false });
      const createListener = vi.fn();
      draw.on('create', createListener);

      expect(() => draw.addFeatures([makeSquare('a'), makeBroken('b')])).toThrow(LibreDrawError);
      expect(draw.getFeatures()).toHaveLength(0);
      expect(draw.undo()).toBe(false);
      expect(createListener).not.toHaveBeenCalled();
    });

    it('throws on a duplicate id, whether in the store or within the array', () => {
      const draw = new LibreDraw(new FakeMap().asMap(), { toolbar: false });
      draw.addFeatures([makeSquare('a')]);

      expect(() => draw.addFeatures([makeSquare('a')])).toThrow('Feature already exists: a');
      expect(() => draw.addFeatures([makeSquare('b'), makeSquare('b')])).toThrow(
        'Feature already exists: b'
      );
      expect(draw.getFeatures().map((f) => f.id)).toEqual(['a']);
    });
  });

  describe('addFeatures() with strict: false', () => {
    it('reports invalid entries in input order and adds only the valid ones as one step', () => {
      const draw = new LibreDraw(new FakeMap().asMap(), { toolbar: false });
      const createListener = vi.fn();
      draw.on('create', createListener);

      const results = draw.addFeatures(
        [makeBroken('bad'), makeSquare('a'), null, makeSquare('b', 50, 50)],
        { strict: false }
      );

      expect(results).toHaveLength(4);
      expect(results[0]).toEqual({
        valid: false,
        id: 'bad',
        reason: 'Ring is not closed. The first and last positions must be identical.',
      });
      expect(results[1]).toEqual({ valid: true, id: 'a' });
      expect(results[2]).toEqual({ valid: false, reason: 'Feature must be a non-null object.' });
      expect(results[3]).toEqual({ valid: true, id: 'b' });

      expect(draw.getFeatures().map((f) => f.id)).toEqual(['a', 'b']);
      expect(createListener).toHaveBeenCalledTimes(2);

      // One undo step for the whole call.
      expect(draw.undo()).toBe(true);
      expect(draw.getFeatures()).toHaveLength(0);
      expect(draw.undo()).toBe(false);
    });

    it('uses the same reason wording as the strict-mode exception', () => {
      const draw = new LibreDraw(new FakeMap().asMap(), { toolbar: false });

      let thrown = '';
      try {
        draw.addFeatures([makeBroken('x')]);
      } catch (err) {
        thrown = (err as Error).message;
      }
      const [result] = draw.addFeatures([makeBroken('x')], { strict: false });

      expect(thrown).not.toBe('');
      expect(result).toEqual({ valid: false, id: 'x', reason: thrown });
    });

    it('rejects duplicate ids per feature instead of throwing', () => {
      const draw = new LibreDraw(new FakeMap().asMap(), { toolbar: false });
      draw.addFeatures([makeSquare('a')]);

      const results = draw.addFeatures(
        [makeSquare('a'), makeSquare('b'), makeSquare('b', 50, 50)],
        { strict: false }
      );

      expect(results).toEqual([
        { valid: false, id: 'a', reason: 'Feature already exists: a' },
        { valid: true, id: 'b' },
        { valid: false, id: 'b', reason: 'Feature already exists: b' },
      ]);
      expect(draw.getFeatures().map((f) => f.id)).toEqual(['a', 'b']);
    });

    it('records nothing when every feature is invalid', () => {
      const draw = new LibreDraw(new FakeMap().asMap(), { toolbar: false });
      const createListener = vi.fn();
      draw.on('create', createListener);

      const results = draw.addFeatures([makeBroken('a'), 42], { strict: false });

      expect(results.every((r) => !r.valid)).toBe(true);
      expect(draw.getFeatures()).toHaveLength(0);
      expect(draw.undo()).toBe(false);
      expect(createListener).not.toHaveBeenCalled();
    });
  });

  describe('validateFeature()', () => {
    it('returns a normalized copy without adding it', () => {
      const draw = new LibreDraw(new FakeMap().asMap(), { toolbar: false });
      const input = makeSquare('a');

      const result = draw.validateFeature(input);

      expect(result.valid).toBe(true);
      if (!result.valid) throw new Error('expected valid');
      expect(result.feature).not.toBe(input);
      expect(result.feature.id).toBe('a');
      expect(draw.getFeatures()).toHaveLength(0);
    });

    it('returns the rejection reason instead of throwing', () => {
      const draw = new LibreDraw(new FakeMap().asMap(), { toolbar: false });

      expect(draw.validateFeature(makeBroken('a'))).toEqual({
        valid: false,
        reason: 'Ring is not closed. The first and last positions must be identical.',
      });
      expect(draw.validateFeature(undefined).valid).toBe(false);
    });

    it('throws only after destroy()', () => {
      const draw = new LibreDraw(new FakeMap().asMap(), { toolbar: false });
      draw.destroy();
      expect(() => draw.validateFeature(makeSquare('a'))).toThrow(LibreDrawError);
    });
  });

  describe('event origin', () => {
    it("stamps 'api' on events raised by public methods", () => {
      const draw = new LibreDraw(new FakeMap().asMap(), { toolbar: false });
      const origins: Record<string, EventOrigin[]> = {};
      const record =
        (type: string) =>
        (e: { origin: EventOrigin }): void => {
          (origins[type] ??= []).push(e.origin);
        };
      draw.on('create', record('create'));
      draw.on('delete', record('delete'));
      draw.on('modechange', record('modechange'));
      draw.on('selectionchange', record('selectionchange'));
      draw.on('draftchange', record('draftchange'));

      draw.addFeatures([makeSquare('a'), makeSquare('b', 50, 50)]);
      draw.selectFeature('a');
      draw.clearSelection();
      draw.deleteFeature('b');
      draw.undo();
      draw.redo();
      draw.setMode('draw-polygon');
      draw.cancelDrawing();
      draw.setMode('idle');

      expect(origins.create).toEqual(['api', 'api', 'api']); // addFeatures ×2, undo of delete
      expect(origins.delete).toEqual(['api', 'api']); // deleteFeature, redo
      expect(origins.selectionchange).toEqual(['api', 'api']);
      expect(origins.draftchange.length).toBeGreaterThan(0); // cancelDrawing / leaving draw-polygon
      expect(new Set(origins.draftchange)).toEqual(new Set(['api']));
      expect(new Set(origins.modechange)).toEqual(new Set(['api']));
    });

    it("stamps 'user' on pointer input and the Delete key", () => {
      const map = new FakeMap();
      const draw = new LibreDraw(map.asMap(), { toolbar: false });
      const createListener = vi.fn();
      const deleteListener = vi.fn();
      draw.on('create', createListener);
      draw.on('delete', deleteListener);

      draw.setMode('draw-point');
      clickAt(map, 30, 30);
      expect(createListener).toHaveBeenCalledTimes(1);
      expect((createListener.mock.calls[0][0] as CreateEvent).origin).toBe('user');

      const pointId = draw.getFeatures()[0].id;
      draw.selectFeature(pointId);
      pressOnMap(map, { key: 'Delete' });
      expect(deleteListener).toHaveBeenCalledTimes(1);
      expect((deleteListener.mock.calls[0][0] as DeleteEvent).origin).toBe('user');
      expect(draw.getFeatures()).toHaveLength(0);
    });

    it("stamps 'user' on the toolbar's undo, redo and delete buttons", () => {
      const map = new FakeMap();
      const draw = new LibreDraw(map.asMap());
      const origins: EventOrigin[] = [];
      draw.on('create', (e) => origins.push(e.origin));
      draw.on('delete', (e) => origins.push(e.origin));

      draw.addFeatures([makeSquare('a')]); // api
      draw.selectFeature('a');
      button(map, 'Delete selected').click(); // user
      button(map, 'Undo').click(); // user (create comes back)
      button(map, 'Redo').click(); // user (deleted again)

      expect(origins).toEqual(['api', 'user', 'user', 'user']);
      expect(draw.getFeatures()).toHaveLength(0);
    });

    it("stamps 'user' on the undo / redo keyboard shortcuts", () => {
      const map = new FakeMap();
      const draw = new LibreDraw(map.asMap(), { toolbar: false });
      const origins: EventOrigin[] = [];
      draw.on('create', (e) => origins.push(e.origin));
      draw.on('delete', (e) => origins.push(e.origin));

      draw.addFeatures([makeSquare('a')]); // api
      pressOnMap(map, { key: 'z', ctrlKey: true }); // user: undo -> delete
      pressOnMap(map, { key: 'y', ctrlKey: true }); // user: redo -> create

      expect(origins).toEqual(['api', 'user', 'user']);
      expect(draw.getFeatures().map((f) => f.id)).toEqual(['a']);
    });

    it("restores 'user' after a public method called from inside a user event", () => {
      const map = new FakeMap();
      const draw = new LibreDraw(map.asMap(), { toolbar: false });
      const origins: EventOrigin[] = [];
      let mirrored = false;
      draw.on('create', (e) => {
        origins.push(e.origin);
        // Re-entrant call from a user-originated listener.
        if (e.origin === 'user' && !mirrored) {
          mirrored = true;
          draw.addFeatures([makeSquare('mirror', 60, 60)]);
        }
      });

      draw.setMode('draw-point');
      clickAt(map, 30, 30); // user create -> listener adds 'mirror' (api)
      clickAt(map, 60, 60); // user create again

      expect(origins).toEqual(['user', 'api', 'user']);
    });

    it('lets a mirroring listener ignore its own API changes', () => {
      const map = new FakeMap();
      const draw = new LibreDraw(map.asMap(), { toolbar: false });
      draw.addFeatures([makeSquare('a'), makeSquare('b', 50, 50)]);

      // A typical sync loop: push user deletions to a backend, but not the
      // ones this code performs itself (which would echo back).
      const pushedToBackend: string[] = [];
      draw.on('delete', (e) => {
        if (e.origin === 'api') return;
        pushedToBackend.push(e.feature.id);
      });

      draw.deleteFeature('a'); // our own change: ignored
      draw.selectFeature('b');
      pressOnMap(map, { key: 'Delete' }); // the user's change: pushed

      expect(pushedToBackend).toEqual(['b']);
      expect(draw.getFeatures()).toHaveLength(0);
    });

    it("keeps 'user' when a public method throws", () => {
      const map = new FakeMap();
      const draw = new LibreDraw(map.asMap(), { toolbar: false });
      const createListener = vi.fn();
      draw.on('create', createListener);

      expect(() => draw.selectFeature('missing')).toThrow(LibreDrawError);

      draw.setMode('draw-point');
      clickAt(map, 30, 30);
      expect((createListener.mock.calls[0][0] as CreateEvent).origin).toBe('user');
    });
  });
});
