import { describe, expect, it } from 'vitest';
import { deriveUiState, parseSetbackDistance } from '../../../examples/custom-ui/state';
import type { UiInputs } from '../../../examples/custom-ui/state';

const idle: UiInputs = {
  mode: 'idle',
  selectedCount: 0,
  canUndo: false,
  canRedo: false,
  draftVertexCount: 0,
};

describe('deriveUiState (examples/custom-ui)', () => {
  it('presses the active mode button', () => {
    expect(deriveUiState({ ...idle, mode: 'draw-polygon' }).activeMode).toBe('draw-polygon');
  });

  it('enables undo / redo from the history availability alone', () => {
    const state = deriveUiState({ ...idle, canUndo: true, canRedo: false });
    expect([state.undoEnabled, state.redoEnabled]).toEqual([true, false]);
  });

  it('enables delete only for a selection in select mode, like the toolbar', () => {
    expect(deriveUiState({ ...idle, mode: 'select', selectedCount: 1 }).deleteEnabled).toBe(true);
    expect(deriveUiState({ ...idle, mode: 'select', selectedCount: 0 }).deleteEnabled).toBe(false);
    expect(deriveUiState({ ...idle, mode: 'rotate', selectedCount: 1 }).deleteEnabled).toBe(false);
  });

  it('shows the union execute control for two or more selected in union mode', () => {
    expect(deriveUiState({ ...idle, mode: 'union', selectedCount: 2 }).unionExecuteVisible).toBe(
      true
    );
    expect(deriveUiState({ ...idle, mode: 'union', selectedCount: 1 }).unionExecuteVisible).toBe(
      false
    );
    expect(deriveUiState({ ...idle, mode: 'select', selectedCount: 2 }).unionExecuteVisible).toBe(
      false
    );
  });

  it('shows the rotate input for a selection in rotate mode and the setback input in setback mode', () => {
    expect(deriveUiState({ ...idle, mode: 'rotate', selectedCount: 1 }).rotateInputVisible).toBe(
      true
    );
    expect(deriveUiState({ ...idle, mode: 'rotate', selectedCount: 0 }).rotateInputVisible).toBe(
      false
    );
    expect(deriveUiState({ ...idle, mode: 'setback' }).setbackInputVisible).toBe(true);
    expect(deriveUiState({ ...idle, mode: 'select' }).setbackInputVisible).toBe(false);
  });

  it('enables finish and cancel while a draft has points', () => {
    const drafting = deriveUiState({ ...idle, mode: 'draw-line', draftVertexCount: 2 });
    expect([drafting.finishEnabled, drafting.cancelEnabled]).toEqual([true, true]);
    const empty = deriveUiState({ ...idle, mode: 'draw-line' });
    expect([empty.finishEnabled, empty.cancelEnabled]).toEqual([false, false]);
  });
});

describe('parseSetbackDistance (examples/custom-ui)', () => {
  it('accepts a finite positive number', () => {
    expect(parseSetbackDistance('25')).toBe(25);
    expect(parseSetbackDistance(' 0.5 ')).toBe(0.5);
  });

  // An empty or invalid field must not execute with the last accepted
  // distance, so it parses to null rather than to a default.
  it.each(['', '0', '-3', 'abc', 'Infinity'])('rejects %j', (value) => {
    expect(parseSetbackDistance(value)).toBeNull();
  });
});
