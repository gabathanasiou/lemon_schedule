import { describe, it, expect } from 'vitest';
import {
  HEADER_ROW_ID,
  buildBands,
  expandRectToMerges,
  insertMergeRow,
  isCovered,
  mergeAnchorAt,
  mergeRange,
  pruneMerges,
  rangeRect,
  rectCellCount,
  rectCovers,
  rectTouchesMerge,
  removeMergeRow,
  remapMergesForColumns,
  unmergeAt,
  unmergeInRect,
} from '../reportTableMerges';
import type { ReportCellMerge, ReportCustomRow, ReportTableColumn } from '../../types';

const rows = (...ids: string[]): ReportCustomRow[] => ids.map(id => ({ id, cells: ['', '', ''] }));
const cols = (...ids: string[]): ReportTableColumn[] => ids.map((id, i, a) => ({ id, field: '', width: 100 / a.length }));
const rowRef = (rowId: string, colId: string) => ({ rowId, colId });

describe('coverage', () => {
  const r = rows('r1', 'r2', 'r3');
  const c = cols('c1', 'c2', 'c3');

  it('a horizontal merge covers the cells right of its anchor in the same row', () => {
    const m: ReportCellMerge = { rowId: 'r1', colId: 'c1', colSpan: 3, rowSpan: 1 };
    expect(isCovered([m], r, c, 'r1', 'c1')).toBeNull(); // anchor
    expect(isCovered([m], r, c, 'r1', 'c2')).toBe(m);
    expect(isCovered([m], r, c, 'r1', 'c3')).toBe(m);
    expect(isCovered([m], r, c, 'r2', 'c2')).toBeNull(); // row outside
  });

  it('a vertical merge covers the cells below its anchor including its own column', () => {
    const m: ReportCellMerge = { rowId: 'r1', colId: 'c2', colSpan: 1, rowSpan: 2 };
    expect(isCovered([m], r, c, 'r1', 'c2')).toBeNull();
    expect(isCovered([m], r, c, 'r2', 'c2')).toBe(m);
    expect(isCovered([m], r, c, 'r3', 'c2')).toBeNull();
    expect(isCovered([m], r, c, 'r2', 'c1')).toBeNull();
  });

  it('header merges never cover body cells (and vice versa)', () => {
    const m: ReportCellMerge = { rowId: HEADER_ROW_ID, colId: 'c1', colSpan: 2, rowSpan: 1 };
    expect(isCovered([m], r, c, 'header', 'c2')).toBe(m);
    expect(isCovered([m], r, c, 'r1', 'c2')).toBeNull();
  });

  it('mergeAnchorAt only matches the anchor cell', () => {
    const m: ReportCellMerge = { rowId: 'r1', colId: 'c1', colSpan: 2, rowSpan: 2 };
    expect(mergeAnchorAt([m], 'r1', 'c1')).toBe(m);
    expect(mergeAnchorAt([m], 'r1', 'c2')).toBeNull();
    expect(mergeAnchorAt([m], 'r2', 'c1')).toBeNull();
  });
});

describe('rangeRect / rectCovers', () => {
  const r = rows('r1', 'r2', 'r3');
  const c = cols('c1', 'c2', 'c3');

  it('normalizes a body range regardless of drag direction', () => {
    expect(rangeRect(r, c, rowRef('r3', 'c2'), rowRef('r1', 'c1'))).toEqual({ band: 'body', r0: 0, r1: 2, c0: 0, c1: 1 });
  });

  it('rejects a range straddling the header/body boundary', () => {
    expect(rangeRect(r, c, rowRef('header', 'c3'), rowRef('r1', 'c1'))).toBeNull();
  });

  it('header ranges span columns only', () => {
    expect(rangeRect(r, c, rowRef('header', 'c3'), rowRef('header', 'c1'))).toEqual({ band: 'header', r0: 0, r1: 0, c0: 0, c1: 2 });
  });

  it('rectCovers respects the band', () => {
    const rect = { band: 'body' as const, r0: 0, r1: 1, c0: 0, c1: 1 };
    expect(rectCovers(r, c, rect, 'r2', 'c2')).toBe(true);
    expect(rectCovers(r, c, rect, 'r3', 'c2')).toBe(false);
    expect(rectCovers(r, c, rect, 'header', 'c1')).toBe(false);
  });
});

describe('mergeRange / unmerge', () => {
  const r = rows('r1', 'r2', 'r3');
  const c = cols('c1', 'c2', 'c3');

  it('merges a rectangular range anchored top-left', () => {
    const res = mergeRange([], r, c, rowRef('r1', 'c1'), rowRef('r2', 'c3'))!;
    expect(res.rect).toEqual({ band: 'body', r0: 0, r1: 1, c0: 0, c1: 2 });
    expect(res.merges).toEqual([{ rowId: 'r1', colId: 'c1', colSpan: 3, rowSpan: 2 }]);
    expect(rectCellCount(res.rect)).toBe(6);
  });

  it('refuses a single-cell range', () => {
    expect(mergeRange([], r, c, rowRef('r1', 'c1'), rowRef('r1', 'c1'))).toBeNull();
  });

  it('merges header cells without a row span', () => {
    const res = mergeRange([], r, c, rowRef('header', 'c1'), rowRef('header', 'c2'))!;
    expect(res.merges).toEqual([{ rowId: HEADER_ROW_ID, colId: 'c1', colSpan: 2, rowSpan: 1 }]);
  });

  it('absorbs intersecting merges and keeps unrelated ones', () => {
    const intersect: ReportCellMerge = { rowId: 'r1', colId: 'c3', colSpan: 1, rowSpan: 2 };
    const unrelated: ReportCellMerge = { rowId: 'r3', colId: 'c1', colSpan: 2, rowSpan: 1 };
    const res = mergeRange([intersect, unrelated], r, c, rowRef('r1', 'c2'), rowRef('r2', 'c3'))!;
    expect(res.merges).toEqual([
      unrelated,
      { rowId: 'r1', colId: 'c2', colSpan: 2, rowSpan: 2 },
    ]);
  });

  it('unmergeAt releases the merge covering a cell (anchor or covered)', () => {
    const m: ReportCellMerge = { rowId: 'r1', colId: 'c1', colSpan: 2, rowSpan: 2 };
    expect(unmergeAt([m], r, c, 'r1', 'c1')).toEqual([]);
    expect(unmergeAt([m], r, c, 'r2', 'c2')).toEqual([]);
    expect(unmergeAt([m], r, c, 'r3', 'c3')).toEqual([m]);
  });

  it('unmergeInRect removes every intersecting merge', () => {
    const a: ReportCellMerge = { rowId: 'r1', colId: 'c1', colSpan: 2, rowSpan: 1 };
    const b: ReportCellMerge = { rowId: 'r3', colId: 'c3', colSpan: 1, rowSpan: 1 };
    const rect = { band: 'body' as const, r0: 0, r1: 0, c0: 0, c1: 0 };
    expect(unmergeInRect([a, b], r, c, rect)).toEqual([b]);
  });

  it('rectTouchesMerge reports when a selection touches a merged cell', () => {
    const m: ReportCellMerge = { rowId: 'r1', colId: 'c1', colSpan: 2, rowSpan: 1 };
    expect(rectTouchesMerge([m], r, c, { band: 'body', r0: 0, r1: 0, c0: 1, c1: 1 })).toBe(true);
    expect(rectTouchesMerge([m], r, c, { band: 'body', r0: 1, r1: 2, c0: 0, c1: 2 })).toBe(false);
  });

  it('expandRectToMerges selects whole merges', () => {
    const m: ReportCellMerge = { rowId: 'r1', colId: 'c1', colSpan: 2, rowSpan: 2 };
    const raw = rangeRect(r, c, rowRef('r2', 'c2'), rowRef('r2', 'c2'))!;
    expect(expandRectToMerges([m], r, c, raw)).toEqual({ band: 'body', r0: 0, r1: 1, c0: 0, c1: 1 });
  });
});

describe('buildBands', () => {
  it('is one band per row without merges', () => {
    expect(buildBands(rows('r1', 'r2', 'r3'), []).map(b => b.rows.map(r => r.id))).toEqual([['r1'], ['r2'], ['r3']]);
  });

  it('joins consecutive rows covered by a vertical merge', () => {
    const m: ReportCellMerge = { rowId: 'r1', colId: 'c1', colSpan: 1, rowSpan: 2 };
    const bands = buildBands(rows('r1', 'r2', 'r3'), [m]);
    expect(bands.map(b => b.rows.map(r => r.id))).toEqual([['r1', 'r2'], ['r3']]);
    expect(bands[0].start).toBe(0);
    expect(bands[1].start).toBe(2);
  });

  it('chains overlapping vertical merges into one maximal band', () => {
    const a: ReportCellMerge = { rowId: 'r1', colId: 'c1', colSpan: 1, rowSpan: 2 };
    const bm: ReportCellMerge = { rowId: 'r2', colId: 'c2', colSpan: 1, rowSpan: 2 };
    expect(buildBands(rows('r1', 'r2', 'r3', 'r4'), [a, bm]).map(b => b.rows.length)).toEqual([3, 1]);
  });

  it('ignores header merges', () => {
    const m: ReportCellMerge = { rowId: HEADER_ROW_ID, colId: 'c1', colSpan: 2, rowSpan: 1 };
    expect(buildBands(rows('r1', 'r2'), [m]).map(b => b.rows.length)).toEqual([1, 1]);
  });
});

describe('pruneMerges', () => {
  const r = rows('r1', 'r2', 'r3');
  const c = cols('c1', 'c2', 'c3');

  it('drops stale row/column ids and clamps spans', () => {
    expect(pruneMerges([{ rowId: 'nope', colId: 'c1', colSpan: 1, rowSpan: 1 }], r, c)).toEqual([]);
    expect(pruneMerges([{ rowId: 'r1', colId: 'nope', colSpan: 1, rowSpan: 1 }], r, c)).toEqual([]);
    expect(pruneMerges([{ rowId: 'r2', colId: 'c2', colSpan: 9, rowSpan: 9 }], r, c)).toEqual([
      { rowId: 'r2', colId: 'c2', colSpan: 2, rowSpan: 2 },
    ]);
  });

  it('forces header rowSpan to 1', () => {
    expect(pruneMerges([{ rowId: HEADER_ROW_ID, colId: 'c1', colSpan: 2, rowSpan: 4 }], r, c)).toEqual([
      { rowId: HEADER_ROW_ID, colId: 'c1', colSpan: 2, rowSpan: 1 },
    ]);
  });

  it('drops a merge whose anchor is already covered (overlap dedupe)', () => {
    const first: ReportCellMerge = { rowId: 'r1', colId: 'c1', colSpan: 2, rowSpan: 2 };
    const second: ReportCellMerge = { rowId: 'r2', colId: 'c2', colSpan: 1, rowSpan: 1 };
    expect(pruneMerges([first, second], r, c)).toEqual([first]);
  });
});

describe('structural remaps', () => {
  it('insertMergeRow drops a vertical merge cut open, keeps boundary inserts', () => {
    const m: ReportCellMerge = { rowId: 'r1', colId: 'c1', colSpan: 1, rowSpan: 3 };
    const r = rows('r1', 'r2', 'r3');
    expect(insertMergeRow(r, [m], 1)).toEqual([]);
    expect(insertMergeRow(r, [m], 0)).toEqual([m]);
    expect(insertMergeRow(r, [m], 3)).toEqual([m]);
  });

  it('removeMergeRow drops every merge covering the removed row', () => {
    const m: ReportCellMerge = { rowId: 'r1', colId: 'c1', colSpan: 1, rowSpan: 3 };
    const r = rows('r1', 'r2', 'r3');
    expect(removeMergeRow(r, [m], 0)).toEqual([]);
    expect(removeMergeRow(r, [m], 2)).toEqual([]);
  });

  it('remapMergesForColumns drops an insert inside the span, keeps boundary inserts', () => {
    const m: ReportCellMerge = { rowId: 'r1', colId: 'c1', colSpan: 2, rowSpan: 1 };
    expect(remapMergesForColumns(cols('c1', 'c2'), cols('c1', 'x', 'c2'), [m])).toEqual([]);
    expect(remapMergesForColumns(cols('c1', 'c2'), cols('x', 'c1', 'c2'), [m])).toEqual([m]);
    expect(remapMergesForColumns(cols('c1', 'c2'), cols('c1', 'c2', 'x'), [m])).toEqual([m]);
  });

  it('remapMergesForColumns drops a removal of a covered column', () => {
    const m: ReportCellMerge = { rowId: 'r1', colId: 'c1', colSpan: 2, rowSpan: 1 };
    expect(remapMergesForColumns(cols('c1', 'c2'), cols('c1'), [m])).toEqual([]);
    expect(remapMergesForColumns(cols('c1', 'c2'), cols('c2'), [m])).toEqual([]);
  });

  it('remapMergesForColumns a reorder drops merges containing the moved column or landing inside', () => {
    const m: ReportCellMerge = { rowId: 'r1', colId: 'c1', colSpan: 2, rowSpan: 1 };
    expect(remapMergesForColumns(cols('c1', 'c2', 'c3'), cols('c2', 'c3', 'c1'), [m], 0)).toEqual([]);
    expect(remapMergesForColumns(cols('c1', 'c2', 'c3'), cols('c1', 'c3', 'c2'), [m])).toEqual([]);
    expect(remapMergesForColumns(cols('c1', 'c2', 'c3'), cols('c1', 'c2', 'c3'), [m])).toEqual([m]);
  });
});
