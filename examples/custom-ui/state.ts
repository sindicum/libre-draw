import type { ModeName } from '../../src';

/**
 * Everything the UI needs, all of it read from LibreDraw's public API:
 * `getMode()`, `getSelectedFeatureIds().length`, `canUndo()`, `canRedo()`,
 * `getDraftVertexCount()`.
 */
export interface UiInputs {
  mode: ModeName;
  selectedCount: number;
  canUndo: boolean;
  canRedo: boolean;
  draftVertexCount: number;
}

/**
 * Pressed and enabled states of the controls, derived from {@link UiInputs}
 * with the same rules the built-in toolbar applies.
 */
export interface UiState {
  activeMode: ModeName;
  deleteEnabled: boolean;
  undoEnabled: boolean;
  redoEnabled: boolean;
  unionExecuteVisible: boolean;
  rotateInputVisible: boolean;
  setbackInputVisible: boolean;
  finishEnabled: boolean;
  cancelEnabled: boolean;
}

/**
 * The distance typed into the setback field, or `null` when it is not a
 * finite positive number: the same rule as `setSetbackDistance()`, applied
 * before executing so an empty or invalid field never falls back to the
 * last accepted distance.
 */
export function parseSetbackDistance(value: string): number | null {
  if (value.trim() === '') return null;
  const meters = Number(value);
  return Number.isFinite(meters) && meters > 0 ? meters : null;
}

export function deriveUiState(inputs: UiInputs): UiState {
  const { mode, selectedCount, canUndo, canRedo, draftVertexCount } = inputs;
  return {
    activeMode: mode,
    // The toolbar's Delete button acts on the select mode's selection only.
    deleteEnabled: mode === 'select' && selectedCount > 0,
    undoEnabled: canUndo,
    redoEnabled: canRedo,
    unionExecuteVisible: mode === 'union' && selectedCount >= 2,
    rotateInputVisible: mode === 'rotate' && selectedCount > 0,
    setbackInputVisible: mode === 'setback',
    finishEnabled: draftVertexCount > 0,
    cancelEnabled: draftVertexCount > 0,
  };
}
