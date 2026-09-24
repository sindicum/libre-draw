import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LibreDraw } from '../../src/LibreDraw';
import type { ModeName } from '../../src/types/mode';
import type { LibreDrawFeature } from '../../src/types/features';
import { FakeMap } from './helpers/fakeMap';

// FakeMap projects lng/lat straight to screen pixels, so coordinates below
// are also the canvas positions used for clicks.

function makeSquare(id: string, x: number, y = 10, size = 20) {
  return {
    id,
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
    properties: { name: id },
  };
}

const POINT = {
  id: 'p',
  type: 'Feature' as const,
  geometry: { type: 'Point' as const, coordinates: [120, 20] },
  properties: {},
};

type Modifiers = Pick<MouseEventInit, 'shiftKey' | 'ctrlKey' | 'metaKey'>;

function pressAt(map: FakeMap, x: number, y: number, modifiers: Modifiers = {}): void {
  map
    .getCanvasContainer()
    .dispatchEvent(
      new MouseEvent('mousedown', { clientX: x, clientY: y, button: 0, ...modifiers })
    );
}

function moveTo(x: number, y: number): void {
  window.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y, button: 0 }));
}

function releaseAt(x: number, y: number): void {
  window.dispatchEvent(new MouseEvent('mouseup', { clientX: x, clientY: y, button: 0 }));
}

function clickAt(map: FakeMap, x: number, y: number, modifiers: Modifiers = {}): void {
  pressAt(map, x, y, modifiers);
  releaseAt(x, y);
}

function pressOnMap(map: FakeMap, key: string): void {
  map
    .getCanvasContainer()
    .dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

function firstVertex(feature: LibreDrawFeature | undefined): number[] | undefined {
  if (!feature) return undefined;
  if (feature.geometry.type === 'Point') return feature.geometry.coordinates;
  if (feature.geometry.type === 'LineString') return feature.geometry.coordinates[0];
  return feature.geometry.coordinates[0][0];
}

describe('multi-selection (F-023)', () => {
  let map: FakeMap;
  let draw: LibreDraw;

  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', ((cb: FrameRequestCallback): number => {
      cb(0);
      return 1;
    }) as typeof requestAnimationFrame);
    map = new FakeMap();
    draw = new LibreDraw(map.asMap(), { toolbar: false });
    draw.addFeatures([makeSquare('a', 10), makeSquare('b', 50), POINT]);
  });

  afterEach(() => {
    draw.destroy();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('pointer selection in select mode', () => {
    it('adds with Shift + click and reports both ids in selectionchange', () => {
      const selectedIds: string[][] = [];
      draw.on('selectionchange', (e) => selectedIds.push(e.selectedIds));
      draw.setMode('select');

      clickAt(map, 20, 20);
      clickAt(map, 60, 20, { shiftKey: true });

      expect(draw.getSelectedFeatureIds()).toEqual(['a', 'b']);
      expect(selectedIds).toEqual([['a'], ['a', 'b']]);
    });

    it('toggles a selected feature off with Ctrl / Cmd + click', () => {
      draw.setMode('select');
      clickAt(map, 20, 20);
      clickAt(map, 60, 20, { ctrlKey: true });
      clickAt(map, 20, 20, { metaKey: true });

      expect(draw.getSelectedFeatureIds()).toEqual(['b']);
    });

    it('goes back to a single selection on a plain click', () => {
      draw.setMode('select');
      clickAt(map, 20, 20);
      clickAt(map, 60, 20, { shiftKey: true });
      clickAt(map, 120, 20);

      expect(draw.getSelectedFeatureIds()).toEqual(['p']);
    });
  });

  describe('selectFeatures()', () => {
    it('selects every id, switches to select mode, and stamps origin api', () => {
      const origins: string[] = [];
      draw.on('selectionchange', (e) => origins.push(e.origin));

      expect(draw.selectFeatures(['a', 'p'])).toBe(true);

      expect(draw.getMode()).toBe('select');
      expect(draw.getSelectedFeatureIds()).toEqual(['a', 'p']);
      expect(origins).toEqual(['api']);
    });

    it('changes nothing when an id is unknown or the list is empty', () => {
      const listener = vi.fn();
      draw.on('selectionchange', listener);
      draw.on('modechange', listener);

      expect(draw.selectFeatures(['a', 'missing'])).toBe(false);
      expect(draw.selectFeatures([])).toBe(false);

      expect(draw.getMode()).toBe('idle');
      expect(draw.getSelectedFeatureIds()).toEqual([]);
      expect(listener).not.toHaveBeenCalled();
    });

    it('is narrowed back to one by selectFeature()', () => {
      draw.selectFeatures(['a', 'b']);
      draw.selectFeature('b');
      expect(draw.getSelectedFeatureIds()).toEqual(['b']);
    });
  });

  describe('delete', () => {
    it('removes the whole selection on Delete and undo() restores it in one step', () => {
      const deleted: Array<{ id: string; origin: string }> = [];
      draw.on('delete', (e) => deleted.push({ id: e.feature.id, origin: e.origin }));
      draw.selectFeatures(['a', 'b']);

      pressOnMap(map, 'Delete');

      expect(draw.getFeatures().map((f) => f.id)).toEqual(['p']);
      expect(deleted).toEqual([
        { id: 'a', origin: 'user' },
        { id: 'b', origin: 'user' },
      ]);
      expect(draw.getSelectedFeatureIds()).toEqual([]);

      expect(draw.undo()).toBe(true);
      expect(
        draw
          .getFeatures()
          .map((f) => f.id)
          .sort()
      ).toEqual(['a', 'b', 'p']);
    });

    it('removes the whole selection from the toolbar delete button as one step', () => {
      const withToolbar = new LibreDraw(map.asMap());
      withToolbar.addFeatures([makeSquare('x', 10), makeSquare('y', 50)]);
      withToolbar.selectFeatures(['x', 'y']);

      map
        .getContainer()
        .querySelector<HTMLButtonElement>('button[data-libre-draw-button="delete"]')!
        .click();

      expect(withToolbar.getFeatures()).toEqual([]);
      withToolbar.undo();
      expect(withToolbar.getFeatures()).toHaveLength(2);
      withToolbar.destroy();
    });
  });

  describe('whole-selection drag', () => {
    it('moves every selected feature by the same delta as one history step', () => {
      const updated: string[] = [];
      draw.on('update', (e) => updated.push(e.feature.id));
      draw.selectFeatures(['a', 'b', 'p']);

      pressAt(map, 60, 20);
      moveTo(65, 27);
      releaseAt(65, 27);

      expect(firstVertex(draw.getFeatureById('a'))).toEqual([15, 17]);
      expect(firstVertex(draw.getFeatureById('b'))).toEqual([55, 17]);
      expect(firstVertex(draw.getFeatureById('p'))).toEqual([125, 27]);
      expect(updated).toEqual(['a', 'b', 'p']);
      expect(draw.getSelectedFeatureIds()).toEqual(['a', 'b', 'p']);

      draw.undo();
      expect(firstVertex(draw.getFeatureById('a'))).toEqual([10, 10]);
      expect(firstVertex(draw.getFeatureById('b'))).toEqual([50, 10]);
      expect(firstVertex(draw.getFeatureById('p'))).toEqual([120, 20]);
      expect(draw.undo()).toBe(true); // the addFeatures step, not a second drag step
      expect(draw.getFeatures()).toEqual([]);
    });
  });

  describe('deleting mid-drag', () => {
    it('deleteFeature() during a body drag records the committed shape, not the preview', () => {
      const deleted: LibreDrawFeature[] = [];
      draw.on('delete', (e) => deleted.push(e.feature));
      draw.selectFeature('a');
      pressAt(map, 20, 20);
      moveTo(26, 25);

      const returned = draw.deleteFeature('a');
      releaseAt(26, 25);

      expect(firstVertex(returned)).toEqual([10, 10]);
      expect(firstVertex(deleted[0])).toEqual([10, 10]);
      draw.undo();
      expect(firstVertex(draw.getFeatureById('a'))).toEqual([10, 10]);
      expect(draw.undo()).toBe(true); // the addFeatures step: the drag left no step behind
      expect(draw.getFeatures()).toEqual([]);
    });

    it('Delete during a whole-selection drag and undo() restore the start shapes', () => {
      draw.selectFeatures(['a', 'b']);
      pressAt(map, 60, 20);
      moveTo(65, 27);

      pressOnMap(map, 'Delete');
      releaseAt(65, 27);
      draw.undo();

      expect(firstVertex(draw.getFeatureById('a'))).toEqual([10, 10]);
      expect(firstVertex(draw.getFeatureById('b'))).toEqual([50, 10]);
      expect(draw.undo()).toBe(true);
      expect(draw.getFeatures()).toEqual([]);
    });
  });

  describe('one selection across modes', () => {
    it.each<ModeName>(['rotate', 'split', 'setback', 'union'])(
      'getSelectedFeatureIds() returns the %s target',
      (mode) => {
        draw.setMode(mode);
        clickAt(map, 20, 20);
        expect(draw.getSelectedFeatureIds()).toEqual(['a']);
      }
    );

    it('clears the selection on a mode change', () => {
      draw.selectFeatures(['a', 'b']);
      draw.setMode('rotate');
      expect(draw.getSelectedFeatureIds()).toEqual([]);
    });

    it.each<ModeName>(['select', 'rotate', 'split', 'setback', 'union'])(
      'clearSelection() empties the %s selection',
      (mode) => {
        draw.setMode(mode);
        clickAt(map, 20, 20);
        const listener = vi.fn();
        draw.on('selectionchange', listener);

        draw.clearSelection();

        expect(draw.getSelectedFeatureIds()).toEqual([]);
        expect(listener).toHaveBeenCalledWith(
          expect.objectContaining({ selectedIds: [], origin: 'api' })
        );
      }
    );

    it('clearSelection() in split mode abandons the half-drawn cut line', () => {
      draw.setMode('split');
      clickAt(map, 20, 20); // target
      clickAt(map, 0, 20); // first point of the line
      draw.clearSelection();

      // The next click picks a target again instead of finishing the line.
      clickAt(map, 60, 20);
      expect(draw.getSelectedFeatureIds()).toEqual(['b']);
      expect(draw.getFeatures()).toHaveLength(3);
    });

    it('clearSelection() in rotate mode restores an uncommitted preview', () => {
      draw.setMode('rotate');
      clickAt(map, 20, 20);
      pressAt(map, 25, 12);
      moveTo(28, 28); // drag in progress: the store holds the preview

      draw.clearSelection();
      releaseAt(28, 28);

      expect(firstVertex(draw.getFeatureById('a'))).toEqual([10, 10]);
      expect(draw.undo()).toBe(true); // only the addFeatures step exists
      expect(draw.getFeatures()).toEqual([]);
    });

    it('deleteFeature() removes only that id from a multi-selection', () => {
      const selectedIds: string[][] = [];
      draw.selectFeatures(['a', 'b']);
      draw.on('selectionchange', (e) => selectedIds.push(e.selectedIds));

      draw.deleteFeature('a');

      expect(draw.getSelectedFeatureIds()).toEqual(['b']);
      expect(selectedIds).toEqual([['b']]);
    });

    it('deleteFeature() of the rotate target drops the target', () => {
      draw.setMode('rotate');
      clickAt(map, 20, 20);
      draw.deleteFeature('a');
      expect(draw.getSelectedFeatureIds()).toEqual([]);
    });

    it('setFeatures() clears the selection', () => {
      draw.selectFeatures(['a', 'b']);
      draw.setFeatures({ type: 'FeatureCollection', features: [makeSquare('z', 10)] });
      expect(draw.getSelectedFeatureIds()).toEqual([]);
    });

    it('undo() drops selected features that left the store and keeps the rest', () => {
      draw.addFeatures([makeSquare('c', 140)]);
      draw.selectFeatures(['a', 'c']);

      draw.undo(); // removes c

      expect(draw.getSelectedFeatureIds()).toEqual(['a']);
    });
  });
});
