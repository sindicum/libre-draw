import type { ModeContext } from '../core/ModeContext';

/**
 * Handles selected feature IDs and selection change notifications.
 */
export class SelectionManager {
  private selectedIds: Set<string> = new Set();
  private context: ModeContext;
  private onSelectionChange?: (selectedIds: string[]) => void;

  constructor(context: ModeContext, onSelectionChange?: (selectedIds: string[]) => void) {
    this.context = context;
    this.onSelectionChange = onSelectionChange;
  }

  getSelectedIds(): string[] {
    return Array.from(this.selectedIds);
  }

  getFirstSelectedId(): string | undefined {
    return this.selectedIds.values().next().value as string | undefined;
  }

  hasSelection(): boolean {
    return this.selectedIds.size > 0;
  }

  has(id: string): boolean {
    return this.selectedIds.has(id);
  }

  selectOnly(id: string): void {
    this.selectedIds.clear();
    this.selectedIds.add(id);
  }

  remove(id: string): void {
    this.selectedIds.delete(id);
  }

  clear(): void {
    this.selectedIds.clear();
  }

  clearAndNotify(): boolean {
    if (!this.hasSelection()) return false;
    this.clear();
    this.notify();
    return true;
  }

  notify(): void {
    const ids = this.getSelectedIds();
    this.context.render.setSelectedIds(ids);
    this.context.events.emit('selectionchange', { selectedIds: ids });
    if (this.onSelectionChange) {
      this.onSelectionChange(ids);
    }
  }
}
