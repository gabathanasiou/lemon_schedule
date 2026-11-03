import { describe, it, expect } from 'vitest';
import {
  parentKeyForRow, resolveGlideViewRestore, type GlideViewRestore, type GlideViewRow, type GlideViewColumn,
} from '../glideViewState';

const columns: GlideViewColumn[] = [
  { key: 'item' }, { key: 'budget' }, { key: 'actual' }, { key: 'etc' }, { key: 'efc' },
];

const budgetColumns: GlideViewColumn[] = [
  { key: 'item' }, { key: 'qty' }, { key: 'rate' }, { key: 'total' },
];

const budgetRows: GlideViewRow[] = [
  { key: 'cat:c1', kind: 'category', catId: 'c1' },
  { key: 'acc:a1', kind: 'account', catId: 'c1', accId: 'a1' },
  { key: 'line:l1', kind: 'line', catId: 'c1', accId: 'a1' },
  { key: 'acc:a2', kind: 'account', catId: 'c1', accId: 'a2' },
];

const costRows: GlideViewRow[] = [
  { key: 'cat:c1', kind: 'category', catId: 'c1' },
  { key: 'acc:a1', kind: 'account', catId: 'c1', accId: 'a1' },
  { key: 'line:l1', kind: 'line', catId: 'c1', accId: 'a1' },
  { key: 'unalloc:a1', kind: 'unallocated', catId: 'c1', accId: 'a1' },
  { key: 'acc:a2', kind: 'account', catId: 'c1', accId: 'a2' },
];

function view(partial: Partial<GlideViewRestore>): GlideViewRestore {
  return {
    token: 1,
    scroll: { rowKey: 'acc:a2', rowIndex: 3, parentKey: 'cat:c1', offset: 10 },
    selection: { rowKey: 'line:l1', rowIndex: 2, parentKey: 'acc:a1', colKey: 'rate' },
    ...partial,
  };
}

describe('cross-view sheet restore (roadmap 349)', () => {
  it('maps the top row and selection to the other view, preserving the offset', () => {
    const target = resolveGlideViewRestore(view({}), costRows, columns, 26)!;
    // acc:a2 moves from row 3 to row 4 after the Unallocated row is inserted.
    expect(target.scrollTop).toBe(4 * 26 + 10);
    // The line is row 2 in both views; the Budget-only column falls back to item.
    expect(target.rowIndex).toBe(2);
    expect(target.colIndex).toBe(0);
  });

  it('falls back from an Unallocated row to its account', () => {
    const target = resolveGlideViewRestore(view({
      scroll: { rowKey: 'unalloc:a1', rowIndex: 3, parentKey: 'acc:a1', offset: 5 },
      selection: { rowKey: 'unalloc:a1', rowIndex: 3, parentKey: 'acc:a1', colKey: 'etc' },
    }), budgetRows, budgetColumns, 26)!;
    expect(target.rowIndex).toBe(1);
    expect(target.scrollTop).toBe(1 * 26 + 5);
    expect(target.colIndex).toBe(0);
  });

  it('falls back to the nearest row when a markup has no equivalent', () => {
    const target = resolveGlideViewRestore(view({
      scroll: { rowKey: 'markup:m1', rowIndex: 99, offset: 3 },
      selection: { rowKey: 'markup:m1', rowIndex: 99, colKey: 'total' },
    }), costRows, columns, 26)!;
    expect(target.rowIndex).toBe(costRows.length - 1);
    expect(target.scrollTop).toBe((costRows.length - 1) * 26 + 3);
  });

  it('keeps the exact row when the key exists in both views', () => {
    const target = resolveGlideViewRestore(view({
      scroll: { rowKey: 'line:l1', rowIndex: 2, parentKey: 'acc:a1', offset: 0 },
      selection: { rowKey: 'line:l1', rowIndex: 2, parentKey: 'acc:a1', colKey: 'item' },
    }), costRows, columns, 26)!;
    expect(target.rowIndex).toBe(2);
    expect(target.scrollTop).toBe(2 * 26);
  });

  it('derives parent keys and refuses empty grids', () => {
    expect(parentKeyForRow({ key: 'line:l1', kind: 'line', catId: 'c1', accId: 'a1' })).toBe('acc:a1');
    expect(parentKeyForRow({ key: 'acc:a1', kind: 'account', catId: 'c1', accId: 'a1' })).toBe('cat:c1');
    expect(parentKeyForRow({ key: 'cat:c1', kind: 'category', catId: 'c1' })).toBeUndefined();
    expect(resolveGlideViewRestore(view({}), [], columns, 26)).toBeNull();
  });
});
