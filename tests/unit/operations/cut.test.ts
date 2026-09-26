import { afterEach, describe, expect, it, vi } from 'vitest';
import { cut } from '../../../src/operations/cut';
import { CutAction } from '../../../src/types/features';
import type { LibreDrawFeature, Position } from '../../../src/types/features';
import { createContext, makeLine, makePoint, makeSquare } from './helpers';

// Pieces come from the geometry engine; the validation rejection path is
// exercised by failing validation on demand.
const validation = vi.hoisted(() => ({ rejectWith: null as string | null }));
vi.mock('../../../src/validation/geojson', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/validation/geojson')>();
  return {
    ...actual,
    tryValidateFeature: (feature: unknown) =>
      validation.rejectWith === null
        ? actual.tryValidateFeature(feature)
        : { valid: false, reason: validation.rejectWith },
  };
});

function square(x: number, y: number, size: number): Position[] {
  return [
    [x, y],
    [x + size, y],
    [x + size, y + size],
    [x, y + size],
  ];
}

const STRIP: Position[] = [
  [4, -1],
  [6, -1],
  [6, 11],
  [4, 11],
];

function ringCount(feature: LibreDrawFeature): number {
  if (feature.geometry.type !== 'Polygon') throw new Error('expected Polygon');
  return feature.geometry.coordinates.length;
}

describe('cut', () => {
  afterEach(() => {
    validation.rejectWith = null;
  });

  it('cuts a hole in place as one CutAction and reports the piece as updated', () => {
    const { context, features, push, emit, add, remove } = createContext([makeSquare('sq')]);
    const original = features.get('sq')!;

    const result = cut(context, 'sq', square(2, 2, 3));

    if (!result.ok) throw new Error(result.reason);
    expect(result.created).toEqual([]);
    expect(result.deleted).toEqual([]);
    expect(result.updated).toHaveLength(1);
    expect(result.updated[0].id).toBe('sq');
    expect(ringCount(result.updated[0])).toBe(2);
    expect(ringCount(features.get('sq')!)).toBe(2);
    // Replaced in place: no remove / add, so the drawing order is kept.
    expect(remove).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();

    expect(push).toHaveBeenCalledTimes(1);
    const action = push.mock.calls[0][0] as CutAction;
    expect(action).toBeInstanceOf(CutAction);
    expect(action.keepsId).toBe(true);
    expect(emit).toHaveBeenCalledWith('cut', {
      originalFeature: original,
      features: [result.updated[0]],
    });
  });

  it('replaces the polygon with the pieces when it is cut apart', () => {
    const { context, features, push, emit } = createContext([makeSquare('sq')]);
    const original = features.get('sq')!;

    const result = cut(context, 'sq', STRIP);

    if (!result.ok) throw new Error(result.reason);
    expect(result.updated).toEqual([]);
    expect(result.deleted).toEqual([original]);
    expect(result.created).toHaveLength(2);
    expect(features.has('sq')).toBe(false);
    expect(features.size).toBe(2);
    expect((push.mock.calls[0][0] as CutAction).keepsId).toBe(false);
    expect(emit).toHaveBeenCalledWith('cut', {
      originalFeature: original,
      features: result.created,
    });
  });

  it('returns snapshots detached from the store', () => {
    const { context, features } = createContext([makeSquare('sq')]);

    const result = cut(context, 'sq', square(2, 2, 3));

    if (!result.ok) throw new Error(result.reason);
    expect(result.updated[0]).not.toBe(features.get('sq'));
  });

  it.each([
    ['empty-result', square(-1, -1, 12)],
    ['no-overlap', square(20, 20, 2)],
  ])('reports %s with a cutfailed event and changes nothing', (reason, cutter) => {
    const { context, features, push, emit } = createContext([makeSquare('sq')]);
    const original = features.get('sq');

    expect(cut(context, 'sq', cutter)).toEqual({ ok: false, reason });

    expect(emit).toHaveBeenCalledWith('cutfailed', { reason, featureId: 'sq' });
    expect(push).not.toHaveBeenCalled();
    expect(features.get('sq')).toBe(original);
  });

  it('reports invalid-result when a piece fails validation', () => {
    validation.rejectWith = 'bad ring';
    const { context, features, push, emit } = createContext([makeSquare('sq')]);
    const original = features.get('sq');

    expect(cut(context, 'sq', square(2, 2, 3))).toEqual({ ok: false, reason: 'invalid-result' });

    expect(emit).toHaveBeenCalledWith('cutfailed', { reason: 'invalid-result', featureId: 'sq' });
    expect(push).not.toHaveBeenCalled();
    expect(features.get('sq')).toBe(original);
  });

  it.each([
    ['not-found', 'missing', square(2, 2, 3)],
    ['not-polygon', 'line', square(2, 2, 3)],
    ['not-polygon', 'point', square(2, 2, 3)],
    [
      'invalid-cutter',
      'sq',
      [
        [0, 0],
        [1, 1],
      ],
    ],
  ])('returns %s for %s without emitting', (reason, id, cutter) => {
    const { context, push, emit } = createContext([
      makeSquare('sq'),
      makeLine('line'),
      makePoint('point'),
    ]);

    expect(cut(context, id, cutter as Position[])).toEqual({ ok: false, reason });

    expect(emit).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });
});

describe('CutAction', () => {
  function store(initial: LibreDrawFeature[]) {
    const map = new Map(initial.map((f) => [f.id, f]));
    return {
      map,
      add: vi.fn((f: LibreDrawFeature) => {
        map.set(f.id, f);
        return f;
      }),
      update: vi.fn((id: string, f: LibreDrawFeature) => {
        map.set(id, f);
      }),
      remove: vi.fn((id: string) => {
        const found = map.get(id);
        map.delete(id);
        return found;
      }),
      getById: (id: string) => map.get(id),
      getAll: () => [...map.values()],
      setAll: vi.fn(),
      clear: vi.fn(),
    };
  }

  it('replaces in place when one piece keeps the id', () => {
    const original = makeSquare('sq');
    const piece = { ...makeSquare('sq', 0, 0, 5) };
    const s = store([original]);
    const action = new CutAction(original, [piece]);

    expect(action.type).toBe('cut');
    action.apply(s);
    expect(s.update).toHaveBeenCalledWith('sq', piece);
    action.revert(s);
    expect(s.map.get('sq')).toEqual(original);
    expect(s.remove).not.toHaveBeenCalled();
  });

  it('removes and adds when the pieces have new ids', () => {
    const original = makeSquare('sq');
    const pieces = [makeSquare('a'), makeSquare('b')];
    const s = store([original]);
    const action = new CutAction(original, pieces);

    expect(action.keepsId).toBe(false);
    action.apply(s);
    expect([...s.map.keys()]).toEqual(['a', 'b']);
    action.revert(s);
    expect([...s.map.keys()]).toEqual(['sq']);
  });

  it('snapshots its features', () => {
    const original = makeSquare('sq');
    const action = new CutAction(original, [makeSquare('a')]);
    original.properties.name = 'changed';

    expect(action.originalFeature.properties.name).toBe('sq');
  });
});
