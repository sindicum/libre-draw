import { SelectionManager } from '../../src/core/SelectionManager';
import type { ModeContext } from '../../src/core/ModeContext';
import type { Mode } from '../../src/modes/Mode';

/**
 * Give a hand-built ModeContext the shared selection, wired the way the
 * LibreDraw facade wires it: every change reaches `render.setSelectedIds`,
 * `render.renderFeatures`, a `selectionchange` event, and the active mode's `onSelectionChange`
 * (when `getMode` is given).
 */
export function attachSelection(
  context: Omit<ModeContext, 'selection'>,
  getMode?: () => Mode | undefined
): ModeContext {
  const full = context as ModeContext;
  full.selection = new SelectionManager((selectedIds) => {
    full.render.setSelectedIds(selectedIds);
    full.render.renderFeatures();
    full.events.emit('selectionchange', { selectedIds });
    getMode?.()?.onSelectionChange?.(selectedIds);
  });
  return full;
}
