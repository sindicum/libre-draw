import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ModeContext } from '../../../src/core/ModeContext';
import { UnionMode } from '../../../src/modes/UnionMode';
import { UnionAction } from '../../../src/types/features';
import type { LibreDrawFeature } from '../../../src/types/features';
import type { NormalizedInputEvent, InputType } from '../../../src/types/input';

function makeSquare(id: string, x: number, y: number, size = 10): LibreDrawFeature {
  return {
    id,
    type: 'Feature',
    geometry: {
      type: 'Polygon',
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

function pointerEvent(
  lng: number,
  lat: number,
  inputType: InputType = 'mouse'
): NormalizedInputEvent {
  return {
    lngLat: { lng, lat },
    point: { x: lng * 10, y: lat * 10 },
    originalEvent: new MouseEvent('click'),
    inputType,
  };
}

interface TestHarness {
  context: ModeContext;
  features: Map<string, LibreDrawFeature>;
  mocks: {
    add: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
    push: ReturnType<typeof vi.fn>;
    emit: ReturnType<typeof vi.fn>;
    renderFeatures: ReturnType<typeof vi.fn>;
    setSelectedIds: ReturnType<typeof vi.fn>;
  };
}

function createHarness(initial: LibreDrawFeature[]): TestHarness {
  const features = new Map<string, LibreDrawFeature>();
  for (const f of initial) features.set(f.id, f);

  const add = vi.fn((feature: LibreDrawFeature) => {
    features.set(feature.id, feature);
    return feature;
  });
  const update = vi.fn((id: string, feature: LibreDrawFeature) => {
    features.set(id, feature);
  });
  const remove = vi.fn((id: string) => {
    const existing = features.get(id);
    features.delete(id);
    return existing;
  });
  const getById = vi.fn((id: string) => features.get(id));
  const getAll = vi.fn(() => Array.from(features.values()));

  const push = vi.fn();
  const emit = vi.fn();
  const renderFeatures = vi.fn();
  const setSelectedIds = vi.fn();

  const context: ModeContext = {
    store: { add, update, remove, getById, getAll },
    history: { push },
    events: { emit },
    render: {
      renderFeatures,
      renderPreview: vi.fn(),
      clearPreview: vi.fn(),
      renderEdgeHighlight: vi.fn(),
      clearEdgeHighlight: vi.fn(),
      renderVertices: vi.fn(),
      clearVertices: vi.fn(),
      setSelectedIds,
      renderSnapIndicator: vi.fn(),
      clearSnapIndicator: vi.fn(),
      renderRotationCenter: vi.fn(),
      clearRotationCenter: vi.fn(),
    },
    getScreenPoint: ({ lng, lat }) => ({ x: lng * 10, y: lat * 10 }),
    setDragPan: vi.fn(),
    getSetbackDistance: () => 10,
    getSnapConfig: () => ({ enabled: false, threshold: 10 }),
    getViewportBounds: () => ({ west: -180, south: -90, east: 180, north: 90 }),
  };

  return { context, features, mocks: { add, remove, push, emit, renderFeatures, setSelectedIds } };
}

/** A click: pointer down and up at the same place. */
function click(mode: UnionMode, lng: number, lat: number, inputType: InputType = 'mouse'): void {
  mode.onPointerDown(pointerEvent(lng, lat, inputType));
  mode.onPointerUp(pointerEvent(lng, lat, inputType));
}

describe('UnionMode', () => {
  let harness: TestHarness;
  let mode: UnionMode;

  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    // 'a' and 'b' overlap, 'far' touches neither.
    harness = createHarness([
      makeSquare('a', 0, 0),
      makeSquare('b', 5, 5),
      makeSquare('far', 40, 40),
    ]);
    mode = new UnionMode(harness.context);
    mode.activate();
  });

  it('keeps map panning enabled and disables double-click zoom', () => {
    expect(mode.mapInteractions()).toEqual({ dragPan: true, doubleClickZoom: false });
  });

  describe('selecting the first target', () => {
    it('highlights the clicked polygon and emits selectionchange', () => {
      click(mode, 2, 2);

      expect(harness.mocks.setSelectedIds).toHaveBeenCalledWith(['a']);
      expect(harness.mocks.emit).toHaveBeenCalledWith('selectionchange', { selectedIds: ['a'] });
      expect(harness.mocks.push).not.toHaveBeenCalled();
    });

    it('picks the topmost polygon where two overlap', () => {
      click(mode, 7, 7); // inside both 'a' and 'b'; 'b' was added later

      expect(harness.mocks.setSelectedIds).toHaveBeenCalledWith(['b']);
    });

    it('ignores points and lines', () => {
      harness.features.set('pt', {
        id: 'pt',
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [30, 30] },
        properties: {},
      });
      harness.features.set('ln', {
        id: 'ln',
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [
            [30, 20],
            [35, 20],
          ],
        },
        properties: {},
      });

      click(mode, 30, 30);
      click(mode, 32, 20);

      expect(harness.mocks.setSelectedIds).not.toHaveBeenCalled();
      expect(harness.mocks.emit).not.toHaveBeenCalledWith('selectionchange', expect.anything());
    });

    it('treats a pointer that travelled beyond the click tolerance as a pan', () => {
      mode.onPointerDown(pointerEvent(2, 2));
      mode.onPointerUp(pointerEvent(3, 2)); // 10px of travel > 3px mouse tolerance

      expect(harness.mocks.setSelectedIds).not.toHaveBeenCalled();
    });

    it('stays a pan when the pointer left the tolerance and came back before release', () => {
      mode.onPointerDown(pointerEvent(2, 2));
      mode.onPointerMove(pointerEvent(4, 2)); // 20px away
      mode.onPointerMove(pointerEvent(2, 2)); // back to the start
      mode.onPointerUp(pointerEvent(2, 2));

      expect(harness.mocks.setSelectedIds).not.toHaveBeenCalled();
    });

    it('allows a finger to wobble within the tap tolerance', () => {
      mode.onPointerDown(pointerEvent(2, 2, 'touch'));
      mode.onPointerUp(pointerEvent(2.5, 2, 'touch')); // 5px < 12px touch tolerance

      expect(harness.mocks.setSelectedIds).toHaveBeenCalledWith(['a']);
    });

    it('does not treat a touch held for a long press as a tap', () => {
      vi.useFakeTimers();
      mode.onPointerDown(pointerEvent(2, 2, 'touch'));
      vi.advanceTimersByTime(500); // LONG_PRESS_MS
      mode.onPointerUp(pointerEvent(2, 2, 'touch'));

      expect(harness.mocks.setSelectedIds).not.toHaveBeenCalled();
    });

    it('treats a touch released before the long press threshold as a tap', () => {
      vi.useFakeTimers();
      mode.onPointerDown(pointerEvent(2, 2, 'touch'));
      vi.advanceTimersByTime(499);
      mode.onPointerUp(pointerEvent(2, 2, 'touch'));

      expect(harness.mocks.setSelectedIds).toHaveBeenCalledWith(['a']);
    });

    it('ignores a pointer up without a preceding pointer down', () => {
      mode.onPointerUp(pointerEvent(2, 2));

      expect(harness.mocks.setSelectedIds).not.toHaveBeenCalled();
    });

    it('does nothing while inactive', () => {
      mode.deactivate();
      click(mode, 2, 2);

      expect(harness.mocks.setSelectedIds).not.toHaveBeenCalledWith(['a']);
    });
  });

  describe('merging with the second target', () => {
    it('replaces both polygons, pushes a UnionAction, and emits union', () => {
      click(mode, 2, 2); // select 'a'
      click(mode, 13, 13); // click 'b' (outside 'a')

      expect(harness.mocks.remove).toHaveBeenCalledWith('a');
      expect(harness.mocks.remove).toHaveBeenCalledWith('b');
      expect(harness.mocks.add).toHaveBeenCalledTimes(1);
      expect(harness.features.size).toBe(2); // merged + far

      expect(harness.mocks.push).toHaveBeenCalledTimes(1);
      expect(harness.mocks.push.mock.calls[0][0]).toBeInstanceOf(UnionAction);

      expect(harness.mocks.emit).toHaveBeenCalledWith(
        'union',
        expect.objectContaining({
          originalFeatures: [
            expect.objectContaining({ id: 'a' }),
            expect.objectContaining({ id: 'b' }),
          ],
          feature: expect.objectContaining({
            geometry: expect.objectContaining({ type: 'Polygon' }),
            properties: { name: 'a' },
          }),
        })
      );
      expect(harness.mocks.setSelectedIds).toHaveBeenLastCalledWith([]);
      expect(harness.mocks.emit).toHaveBeenCalledWith('selectionchange', { selectedIds: [] });
      expect(harness.mocks.renderFeatures).toHaveBeenCalled();
    });

    it('emits a detached copy of the merged feature', () => {
      click(mode, 2, 2);
      click(mode, 13, 13);

      const unionCall = harness.mocks.emit.mock.calls.find((call) => call[0] === 'union');
      const emitted = unionCall?.[1].feature as LibreDrawFeature;
      const stored = harness.features.get(emitted.id);

      expect(stored).toBeDefined();
      expect(emitted).not.toBe(stored);
      expect(emitted).toEqual(stored);
    });

    it('emits unionfailed with disjoint and keeps the first selection', () => {
      click(mode, 2, 2); // select 'a'
      harness.mocks.setSelectedIds.mockClear();
      click(mode, 45, 45); // 'far' does not touch 'a'

      expect(harness.mocks.remove).not.toHaveBeenCalled();
      expect(harness.mocks.push).not.toHaveBeenCalled();
      expect(harness.mocks.emit).toHaveBeenCalledWith('unionfailed', {
        reason: 'disjoint',
        featureIds: ['a', 'far'],
      });
      expect(harness.mocks.setSelectedIds).not.toHaveBeenCalled();

      // Still in the first-selected state: a valid partner merges right away.
      click(mode, 13, 13);
      expect(harness.mocks.push).toHaveBeenCalledTimes(1);
    });

    it('does not merge on a long press over the second polygon', () => {
      click(mode, 2, 2, 'touch'); // select 'a'
      vi.useFakeTimers();
      mode.onPointerDown(pointerEvent(13, 13, 'touch'));
      vi.advanceTimersByTime(500);
      mode.onPointerUp(pointerEvent(13, 13, 'touch'));

      expect(harness.mocks.push).not.toHaveBeenCalled();
      expect(harness.features.size).toBe(3);
    });

    it('emits unionfailed with has-holes and keeps the first selection when a hole would form', () => {
      // A "C" shape whose open side is closed off by 'lid'.
      harness.features.clear();
      harness.features.set('c', {
        id: 'c',
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [0, 0],
              [30, 0],
              [30, 10],
              [10, 10],
              [10, 20],
              [30, 20],
              [30, 30],
              [0, 30],
              [0, 0],
            ],
          ],
        },
        properties: {},
      });
      harness.features.set('lid', makeSquare('lid', 25, 5, 20));

      click(mode, 5, 5); // select 'c'
      harness.mocks.setSelectedIds.mockClear();
      click(mode, 40, 15); // 'lid' (outside 'c')

      expect(harness.mocks.emit).toHaveBeenCalledWith('unionfailed', {
        reason: 'has-holes',
        featureIds: ['c', 'lid'],
      });
      expect(harness.mocks.remove).not.toHaveBeenCalled();
      expect(harness.mocks.setSelectedIds).not.toHaveBeenCalled();
      expect(harness.features.size).toBe(2);
    });

    it('ignores a second click on the already selected polygon', () => {
      click(mode, 2, 2);
      harness.mocks.emit.mockClear();
      click(mode, 3, 3);

      expect(harness.mocks.push).not.toHaveBeenCalled();
      expect(harness.mocks.emit).not.toHaveBeenCalled();
    });

    it('clears the selection when clicking empty space', () => {
      click(mode, 2, 2);
      click(mode, 90, 90);

      expect(harness.mocks.setSelectedIds).toHaveBeenLastCalledWith([]);
      expect(harness.mocks.emit).toHaveBeenCalledWith('selectionchange', { selectedIds: [] });
      expect(harness.mocks.push).not.toHaveBeenCalled();
    });

    it('drops the selection if the first polygon vanished from the store', () => {
      click(mode, 2, 2);
      harness.features.delete('a');
      harness.mocks.setSelectedIds.mockClear();

      click(mode, 13, 13);

      expect(harness.mocks.push).not.toHaveBeenCalled();
      expect(harness.mocks.setSelectedIds).toHaveBeenCalledWith([]);
    });
  });

  describe('Escape', () => {
    it('clears the selection and keeps the mode active', () => {
      click(mode, 2, 2);
      harness.mocks.setSelectedIds.mockClear();

      mode.onKeyDown('Escape', new KeyboardEvent('keydown', { key: 'Escape' }));

      expect(harness.mocks.setSelectedIds).toHaveBeenCalledWith([]);
      expect(harness.mocks.emit).toHaveBeenCalledWith('selectionchange', { selectedIds: [] });

      // A new pair can be picked without re-activating.
      click(mode, 2, 2);
      expect(harness.mocks.setSelectedIds).toHaveBeenCalledWith(['a']);
    });

    it('ignores other keys', () => {
      click(mode, 2, 2);
      harness.mocks.setSelectedIds.mockClear();

      mode.onKeyDown('Enter', new KeyboardEvent('keydown', { key: 'Enter' }));

      expect(harness.mocks.setSelectedIds).not.toHaveBeenCalled();
    });
  });

  it('clears the selection on deactivate', () => {
    click(mode, 2, 2);
    harness.mocks.setSelectedIds.mockClear();

    mode.deactivate();

    expect(harness.mocks.setSelectedIds).toHaveBeenCalledWith([]);
  });
});
