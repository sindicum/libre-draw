import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReshapeMode } from '../../../src/modes/ReshapeMode';
import type { ModeContext } from '../../../src/core/ModeContext';
import type { LibreDrawFeature, Position } from '../../../src/types/features';
import { UpdateAction } from '../../../src/types/features';
import type { InputType, NormalizedInputEvent } from '../../../src/types/input';
import { attachSelection } from '../../helpers/selection';

function makeSquare(id: string, x: number, size: number): LibreDrawFeature {
  return {
    id,
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [x, 0],
          [x + size, 0],
          [x + size, size],
          [x, size],
          [x, 0],
        ],
      ],
    },
    properties: {},
  };
}

function event(lng: number, lat: number, inputType: InputType = 'mouse'): NormalizedInputEvent {
  return {
    lngLat: { lng, lat },
    point: { x: lng * 10, y: lat * 10 },
    originalEvent: new MouseEvent('click'),
    inputType,
  };
}

// Dips into the bottom edge of square 'a' (0..10) between x = 2 and 5.
const NOTCH: Position[] = [
  [2, -1],
  [2, 2],
  [5, 2],
  [5, -1],
];

describe('ReshapeMode', () => {
  let features: Map<string, LibreDrawFeature>;
  let context: ModeContext;
  let mode: ReshapeMode;

  function clickAt(lng: number, lat: number): void {
    mode.onPointerDown(event(lng, lat));
    mode.onPointerUp(event(lng, lat));
  }

  /** Draft a line through the positions and finish it on its last vertex. */
  function draftLine(line: Position[]): void {
    for (const [lng, lat] of line) clickAt(lng, lat);
    const [lng, lat] = line[line.length - 1];
    clickAt(lng, lat);
  }

  function rings(id: string): Position[][] {
    const feature = features.get(id);
    if (!feature || feature.geometry.type !== 'Polygon') throw new Error(`no polygon ${id}`);
    return feature.geometry.coordinates;
  }

  beforeEach(() => {
    features = new Map([
      ['a', makeSquare('a', 0, 10)],
      ['b', makeSquare('b', 20, 10)],
    ]);
    context = attachSelection(
      {
        store: {
          add: vi.fn((f: LibreDrawFeature) => {
            features.set(f.id, f);
            return f;
          }),
          update: vi.fn((id: string, f: LibreDrawFeature) => {
            features.set(id, f);
          }),
          remove: vi.fn((id: string) => {
            const found = features.get(id);
            features.delete(id);
            return found;
          }),
          getById: (id: string) => features.get(id),
          getAll: () => [...features.values()],
        },
        history: { push: vi.fn() },
        events: { emit: vi.fn() },
        render: {
          renderPreview: vi.fn(),
          clearPreview: vi.fn(),
          renderEdgeHighlight: vi.fn(),
          clearEdgeHighlight: vi.fn(),
          renderFeatures: vi.fn(),
          renderVertices: vi.fn(),
          clearVertices: vi.fn(),
          setSelectedIds: vi.fn(),
          renderSnapIndicator: vi.fn(),
          clearSnapIndicator: vi.fn(),
          renderRotationCenter: vi.fn(),
          clearRotationCenter: vi.fn(),
        },
        getScreenPoint: (lngLat) => ({ x: lngLat.lng * 10, y: lngLat.lat * 10 }),
        setDragPan: vi.fn(),
        getSetbackDistance: () => 10,
        getSnapConfig: () => ({ enabled: false, threshold: 10 }),
        getViewportBounds: () => ({ west: -180, south: -90, east: 180, north: 90 }),
      },
      () => mode
    );
    mode = new ReshapeMode(context);
    mode.activate();
  });

  it('ignores input while inactive', () => {
    mode.deactivate();
    clickAt(5, 5);
    expect(context.selection.getSelectedIds()).toEqual([]);
  });

  it('selects the polygon under a click as the target and starts drafting', () => {
    expect(mode.isDrafting()).toBe(false);
    clickAt(5, 5);

    expect(context.selection.getSelectedIds()).toEqual(['a']);
    expect(mode.isDrafting()).toBe(true);
    expect(mode.getDraftVertexCount()).toBe(0);
  });

  it('clears the selection on a click that hits no polygon', () => {
    clickAt(15, 5);
    expect(context.selection.getSelectedIds()).toEqual([]);
    expect(mode.isDrafting()).toBe(false);
  });

  it('reshapes the target when the line is finished, then deselects it', () => {
    clickAt(5, 5);
    draftLine(NOTCH);

    expect(rings('a')[0]).toEqual(
      expect.arrayContaining([
        [2, 2],
        [5, 2],
      ])
    );
    expect(vi.mocked(context.history.push).mock.calls[0][0]).toBeInstanceOf(UpdateAction);
    expect(context.events.emit).toHaveBeenCalledWith('reshape', expect.anything());
    expect(context.selection.getSelectedIds()).toEqual([]);
    expect(mode.isDrafting()).toBe(false);
    expect(context.render.renderFeatures).toHaveBeenCalled();
  });

  it('keeps the target and drops only the draft when the reshape fails', () => {
    clickAt(5, 5);
    // Crosses the outer ring once: invalid-intersection-count.
    draftLine([
      [5, 5],
      [15, 5],
    ]);

    expect(context.events.emit).toHaveBeenCalledWith('reshapefailed', {
      reason: 'invalid-intersection-count',
      featureId: 'a',
    });
    expect(context.selection.getSelectedIds()).toEqual(['a']);
    expect(mode.isDrafting()).toBe(true);
    expect(mode.getDraftVertexCount()).toBe(0);
    expect(rings('a')[0]).toHaveLength(5);
  });

  it('delegates the draft API while drafting and is inert before', () => {
    expect(mode.finishDrawing()).toBe(false);
    expect(mode.undoLastVertex()).toBe(false);
    expect(mode.canFinishDrawing()).toBe(false);
    mode.cancelDrawing();

    clickAt(5, 5);
    clickAt(2, -1);
    expect(mode.canFinishDrawing()).toBe(false);
    clickAt(2, 2);
    clickAt(5, 2);
    expect(mode.getDraftVertexCount()).toBe(3);
    expect(mode.canFinishDrawing()).toBe(true);
    expect(mode.undoLastVertex()).toBe(true);
    expect(mode.getDraftVertexCount()).toBe(2);
    mode.cancelDrawing();
    expect(mode.getDraftVertexCount()).toBe(0);
    expect(mode.isDrafting()).toBe(true);

    for (const [lng, lat] of NOTCH) clickAt(lng, lat);
    expect(mode.finishDrawing()).toBe(true);
    expect(rings('a')[0]).toContainEqual([2, 2]);
  });

  it('takes back the last line point on long press', () => {
    clickAt(5, 5);
    clickAt(2, -1);
    clickAt(2, 2);
    mode.onLongPress(event(2, 2, 'touch'));
    expect(mode.getDraftVertexCount()).toBe(1);
  });

  it('prevents the map double-click zoom while drafting', () => {
    clickAt(5, 5);
    const dbl = event(2, 2);
    const preventDefault = vi.spyOn(dbl.originalEvent, 'preventDefault');
    mode.onDoubleClick(dbl);
    expect(preventDefault).toHaveBeenCalled();
  });

  it('gives up the target and the draft on Escape', () => {
    clickAt(5, 5);
    clickAt(2, -1);
    mode.onKeyDown('Escape', new KeyboardEvent('keydown'));

    expect(context.selection.getSelectedIds()).toEqual([]);
    expect(mode.isDrafting()).toBe(false);
    expect(mode.getDraftVertexCount()).toBe(0);
  });

  it('stops drafting when the selection is cleared from outside', () => {
    clickAt(5, 5);
    clickAt(2, -1);
    context.selection.clear();

    expect(mode.isDrafting()).toBe(false);
    expect(mode.getDraftVertexCount()).toBe(0);
  });

  it('stops drafting when the target leaves the store', () => {
    clickAt(5, 5);
    features.delete('a');
    mode.refreshFromStore();

    expect(mode.isDrafting()).toBe(false);
    expect(context.selection.getSelectedIds()).toEqual([]);
  });

  it('keeps drafting on refresh while the target is still there', () => {
    clickAt(5, 5);
    mode.refreshFromStore();
    expect(mode.isDrafting()).toBe(true);
  });

  it('clears the draft, the target, and emits draftchange on deactivate', () => {
    clickAt(5, 5);
    clickAt(2, -1);
    mode.deactivate();

    expect(context.selection.getSelectedIds()).toEqual([]);
    expect(context.events.emit).toHaveBeenCalledWith('draftchange', { vertexCount: 0 });
    expect(mode.getDraftVertexCount()).toBe(0);
  });

  it('passes no pointer input but the target pick to the draft before a target is set', () => {
    mode.onPointerMove(event(5, 5));
    mode.onPointerUp(event(5, 5));
    mode.onLongPress(event(5, 5, 'touch'));
    const dbl = event(5, 5);
    const preventDefault = vi.spyOn(dbl.originalEvent, 'preventDefault');
    mode.onDoubleClick(dbl);

    expect(preventDefault).not.toHaveBeenCalled();
    expect(context.render.renderPreview).not.toHaveBeenCalled();
    expect(mode.getDraftVertexCount()).toBe(0);
    expect(context.selection.getSelectedIds()).toEqual([]);
  });

  it('ignores keys other than Escape and Escape while inactive', () => {
    clickAt(5, 5);
    clickAt(2, -1);
    mode.onKeyDown('Enter', new KeyboardEvent('keydown'));
    expect(mode.getDraftVertexCount()).toBe(1);

    mode.deactivate();
    context.selection.set(['a']);
    mode.onKeyDown('Escape', new KeyboardEvent('keydown'));
    expect(context.selection.getSelectedIds()).toEqual(['a']);
  });

  it('keeps the draft when the selection changes to a non-empty one', () => {
    clickAt(5, 5);
    clickAt(2, -1);
    mode.onSelectionChange(['a']);
    expect(mode.isDrafting()).toBe(true);
    expect(mode.getDraftVertexCount()).toBe(1);
  });

  it('does nothing on refresh before a target is set', () => {
    mode.refreshFromStore();
    expect(mode.isDrafting()).toBe(false);
    expect(context.selection.getSelectedIds()).toEqual([]);
  });

  it('asks the map not to pan or zoom on double click', () => {
    expect(mode.mapInteractions()).toEqual({ dragPan: false, doubleClickZoom: false });
  });
});
