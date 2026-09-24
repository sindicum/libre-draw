/**
 * The one selection shared by every mode.
 *
 * Owned by the LibreDraw facade and handed to the modes through
 * `ModeContext.selection`. Every mutator reports whether the set actually
 * changed and calls `onChange` only then, so rendering, the
 * `selectionchange` event, and the active mode's bookkeeping all hang off
 * a single notification no matter who changed the selection.
 */
export class SelectionManager {
  /** Insertion-ordered: `getSelectedIds()` returns ids in the order they were selected. */
  private selectedIds: Set<string> = new Set();
  private onChange: (selectedIds: string[]) => void;

  constructor(onChange: (selectedIds: string[]) => void) {
    this.onChange = onChange;
  }

  getSelectedIds(): string[] {
    return Array.from(this.selectedIds);
  }

  get size(): number {
    return this.selectedIds.size;
  }

  has(id: string): boolean {
    return this.selectedIds.has(id);
  }

  /**
   * The selected id when exactly one feature is selected, otherwise
   * `undefined`. Single-target modes read their target through this.
   */
  getSingleId(): string | undefined {
    if (this.selectedIds.size !== 1) return undefined;
    return this.selectedIds.values().next().value as string;
  }

  /** Replace the selection with `ids` (duplicates collapse, first occurrence wins). */
  set(ids: readonly string[]): boolean {
    const next = new Set(ids);
    if (this.sameAs(next)) return false;
    this.selectedIds = next;
    this.notify();
    return true;
  }

  /** Add `id` if absent, remove it if present. */
  toggle(id: string): boolean {
    if (this.selectedIds.has(id)) {
      this.selectedIds.delete(id);
    } else {
      this.selectedIds.add(id);
    }
    this.notify();
    return true;
  }

  remove(id: string): boolean {
    if (!this.selectedIds.delete(id)) return false;
    this.notify();
    return true;
  }

  clear(): boolean {
    if (this.selectedIds.size === 0) return false;
    this.selectedIds.clear();
    this.notify();
    return true;
  }

  /** Keep only the ids for which `keep` returns true (e.g. those still in the store). */
  retain(keep: (id: string) => boolean): boolean {
    const next = new Set(Array.from(this.selectedIds).filter(keep));
    if (next.size === this.selectedIds.size) return false;
    this.selectedIds = next;
    this.notify();
    return true;
  }

  private sameAs(other: Set<string>): boolean {
    if (other.size !== this.selectedIds.size) return false;
    const a = Array.from(this.selectedIds);
    const b = Array.from(other);
    return a.every((id, i) => id === b[i]);
  }

  private notify(): void {
    this.onChange(this.getSelectedIds());
  }
}
