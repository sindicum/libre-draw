/** Space between two button rows, in pixels. */
export const TOOLBAR_GAP = 4;

/** Padding around the button rows of a column, in pixels. */
export const TOOLBAR_PADDING = 4;

/**
 * How the toolbar splits its button rows: `columns` is 1 or 2, and `rows`
 * is the number of rows the first (outer) column holds.
 */
export interface ToolbarGrid {
  columns: 1 | 2;
  rows: number;
}

/** Height of the button list holding `rows` rows of `rowHeight` each. */
function listHeight(rows: number, rowHeight: number): number {
  return rows * rowHeight + Math.max(0, rows - 1) * TOOLBAR_GAP + 2 * TOOLBAR_PADDING;
}

/** How many rows of `rowHeight` fit in `available` pixels. */
function rowsThatFit(rowHeight: number, available: number): number {
  return Math.floor((available - 2 * TOOLBAR_PADDING + TOOLBAR_GAP) / (rowHeight + TOOLBAR_GAP));
}

/**
 * Lay out `count` rows in one column when they fit in `available` pixels.
 * Otherwise the first column holds as many rows as fit and the rest move to
 * a second column. When the rest do not fit there either, the outer column
 * gets `ceil(count / 2)` rows, the inner one the rest, and the list scrolls.
 *
 * A `rowHeight` of 0, before layout, keeps one column.
 */
export function toolbarGrid(count: number, rowHeight: number, available: number): ToolbarGrid {
  if (count < 2 || rowHeight <= 0 || listHeight(count, rowHeight) <= available) {
    return { columns: 1, rows: count };
  }
  return { columns: 2, rows: Math.max(rowsThatFit(rowHeight, available), Math.ceil(count / 2)) };
}
