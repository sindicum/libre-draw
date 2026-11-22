import { describe, expect, it } from 'vitest';
import { toolbarGrid } from '../../../src/ui/toolbarGrid';

// Rows of 44px with a 4px gap and 4px padding: n rows need 48n + 4px, so
// 16 rows in one column need 772px.
describe('toolbarGrid', () => {
  it('keeps one column when every row fits', () => {
    expect(toolbarGrid(16, 44, 772)).toEqual({ columns: 1, rows: 16 });
    expect(toolbarGrid(16, 44, 1000)).toEqual({ columns: 1, rows: 16 });
  });

  it('fills the first column and moves only the rows that do not fit to the second', () => {
    // 771px holds 15 rows (724px), so one row moves.
    expect(toolbarGrid(16, 44, 771)).toEqual({ columns: 2, rows: 15 });
    // 500px holds 10 rows (484px); 499px still holds 10, 483px holds 9.
    expect(toolbarGrid(16, 44, 500)).toEqual({ columns: 2, rows: 10 });
    expect(toolbarGrid(16, 44, 484)).toEqual({ columns: 2, rows: 10 });
    expect(toolbarGrid(16, 44, 483)).toEqual({ columns: 2, rows: 9 });
  });

  it('uses the fewest rows that hold every button when two columns do not fit (the list scrolls)', () => {
    // 388px holds exactly 8 rows: two full columns, no scroll.
    expect(toolbarGrid(16, 44, 388)).toEqual({ columns: 2, rows: 8 });
    expect(toolbarGrid(16, 44, 300)).toEqual({ columns: 2, rows: 8 });
    expect(toolbarGrid(15, 44, 300)).toEqual({ columns: 2, rows: 8 });
    expect(toolbarGrid(16, 44, 0)).toEqual({ columns: 2, rows: 8 });
  });

  it('keeps one column before layout (row height 0) and for a single row', () => {
    expect(toolbarGrid(16, 0, 100)).toEqual({ columns: 1, rows: 16 });
    expect(toolbarGrid(1, 44, 10)).toEqual({ columns: 1, rows: 1 });
    expect(toolbarGrid(0, 44, 10)).toEqual({ columns: 1, rows: 0 });
  });
});
