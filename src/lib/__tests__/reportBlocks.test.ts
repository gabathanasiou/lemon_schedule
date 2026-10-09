import { describe, it, expect } from 'vitest';
import {
  makeReportBlock,
  insertAfter,
  insertInto,
  insertScopeFor,
  findBlock,
  removeBlock,
  moveBlock,
  paginateBlocks,
  collectRibbonBlocks,
  insertTableColumnAt,
  removeTableColumnAt,
  moveTableColumn,
  insertCustomRowAt,
  removeCustomRowAt,
  duplicateBlockWithId,
  dayGridOffenders,
} from '../reportBlocks';
import type { ReportBlock } from '../../types';

const b = (id: string, type: ReportBlock['type'] = 'text', over: Partial<ReportBlock> = {}): ReportBlock =>
  ({ id, type, ...over });

describe('makeReportBlock', () => {
  it('text defaults to empty', () => {
    const blk = makeReportBlock('text');
    expect(blk.type).toBe('text');
    expect(blk.text).toBe('');
    expect(blk.id).toBeTruthy();
  });
  it('repeat defaults to scenes children + gap 8', () => {
    const blk = makeReportBlock('repeat');
    expect(blk.collection).toBe('scenes');
    expect(blk.children).toEqual([]);
    expect(blk.gap).toBe(8);
  });
  it('applies partial fields but always mints a fresh id (a supplied id is ignored)', () => {
    const blk = makeReportBlock('text', { id: 'fixed', text: 'hi' });
    expect(blk.text).toBe('hi');
    expect(blk.id).toBeTruthy();
    expect(blk.id).not.toBe('fixed');
  });
});

describe('findBlock / insertAfter / removeBlock / moveBlock', () => {
  it('inserts after a root block', () => {
    const blocks = [b('a'), b('b')];
    const out = insertAfter(blocks, 'a', b('c'));
    expect(out.map(x => x.id)).toEqual(['a', 'c', 'b']);
  });

  it('finds nested blocks and removes them in place', () => {
    const child = b('child');
    const blocks = [b('root', 'repeat', { children: [child] })];
    expect(findBlock(blocks, 'child')?.block.id).toBe('child');
    const out = removeBlock(blocks, 'child');
    expect(findBlock(out, 'child')).toBeNull();
    expect(findBlock(out, 'root')).not.toBeNull();
  });

  it('moves a root block within bounds', () => {
    const blocks = [b('a'), b('b'), b('c')];
    expect(moveBlock(blocks, 'c', -1).map(x => x.id)).toEqual(['a', 'c', 'b']);
    expect(moveBlock(blocks, 'a', -1).map(x => x.id)).toEqual(['a', 'b', 'c']); // clamped
  });
});

describe('insertInto (roadmap 219 — tables are leaves)', () => {
  it('descends into repeats and relatives', () => {
    const blocks = [b('rep', 'repeat', { children: [] }), b('rel', 'relative', { children: [] })];
    expect((findBlock(insertInto(blocks, 'rep', b('x')), 'rep')!.block.children || []).map(c => c.id)).toEqual(['x']);
    expect((findBlock(insertInto(blocks, 'rel', b('y')), 'rel')!.block.children || []).map(c => c.id)).toEqual(['y']);
  });

  it('a table gets the insert as its SIBLING — never an invisible child', () => {
    const blocks = [b('t', 'table', { custom: true, collection: 'scenes' }), b('after')];
    const out = insertInto(blocks, 't', b('x'));
    expect(out.map(x => x.id)).toEqual(['t', 'x', 'after']);
    expect(findBlock(out, 't')!.block.children).toBeUndefined();
  });

  it('insertScopeFor a table is the parent scope (sibling insert)', () => {
    const nested: ReportBlock[] = [b('rep', 'repeat', { collection: 'days', children: [b('t', 'table', { collection: 'scenes' })] })];
    expect(insertScopeFor(nested, 't')).toBe('days');
    expect(insertScopeFor(nested, 'rep')).toBe('days');
    expect(insertScopeFor([b('t', 'table')], 't')).toBeNull();
  });
});

describe('paginateBlocks', () => {
  it('splits at page breaks', () => {
    const blocks = [b('a'), b('br', 'pageBreak'), b('b')];
    expect(paginateBlocks(blocks).map(p => p.map(x => x.id))).toEqual([['a'], ['b']]);
  });
  it('drops a trailing break and ignores a leading one', () => {
    expect(paginateBlocks([b('br', 'pageBreak'), b('a')]).map(p => p.map(x => x.id))).toEqual([['a']]);
    expect(paginateBlocks([b('a'), b('br', 'pageBreak')]).map(p => p.map(x => x.id))).toEqual([['a']]);
  });
  it('an empty design yields one empty page', () => {
    expect(paginateBlocks([])).toEqual([[]]);
  });
});

describe('collectRibbonBlocks', () => {
  it('collects ribbon blocks at every depth', () => {
    const design: ReportBlock[] = [
      b('r1', 'ribbon'),
      b('rep', 'repeat', { children: [b('r2', 'ribbon')] }),
      b('cols', 'columns', { cols: [{ id: 'c1', blocks: [b('r3', 'ribbon')] } as any] }),
    ];
    expect(collectRibbonBlocks(design).map(x => x.id)).toEqual(['r1', 'r2', 'r3']);
  });
});

describe('free-table column ops keep cells aligned', () => {
  const custom = (): ReportBlock => b('t', 'table', {
    custom: true,
    columns: [
      { id: 'c1', field: '', width: 50, label: 'A' },
      { id: 'c2', field: '', width: 50, label: 'B' },
      { id: 'c3', field: '', width: 50, label: 'C' },
    ],
    customRows: [
      { id: 'r1', cells: ['a1', 'b1', 'c1'] },
      { id: 'r2', cells: ['a2', 'b2', 'c2'] },
    ],
  });

  it('insert inserts an empty cell at the column index', () => {
    const [t] = insertTableColumnAt([custom()], 't', 1);
    expect(t.columns!.map(c => c.id)).toEqual(['c1', expect.any(String), 'c2', 'c3']);
    expect(t.customRows!.map(r => r.cells)).toEqual([
      ['a1', '', 'b1', 'c1'],
      ['a2', '', 'b2', 'c2'],
    ]);
  });

  it('remove drops that column’s cell from every row', () => {
    const [t] = removeTableColumnAt([custom()], 't', 1);
    expect(t.columns!.map(c => c.id)).toEqual(['c1', 'c3']);
    expect(t.customRows!.map(r => r.cells)).toEqual([['a1', 'c1'], ['a2', 'c2']]);
  });

  it('move carries each cell with its column', () => {
    const [t] = moveTableColumn([custom()], 't', 0, 2);
    expect(t.columns!.map(c => c.id)).toEqual(['c2', 'c3', 'c1']);
    expect(t.customRows!.map(r => r.cells)).toEqual([
      ['b1', 'c1', 'a1'],
      ['b2', 'c2', 'a2'],
    ]);
  });
});

describe('free-table structural edits drop cut merges (roadmap 189)', () => {
  const custom = (over: Partial<ReportBlock> = {}): ReportBlock => b('t', 'table', {
    custom: true,
    columns: [
      { id: 'c1', field: '', width: 50, label: 'A' },
      { id: 'c2', field: '', width: 50, label: 'B' },
      { id: 'c3', field: '', width: 50, label: 'C' },
    ],
    customRows: [
      { id: 'r1', cells: ['a1', 'b1', 'c1'] },
      { id: 'r2', cells: ['a2', 'b2', 'c2'] },
      { id: 'r3', cells: ['a3', 'b3', 'c3'] },
    ],
    cellMerges: [{ rowId: 'r1', colId: 'c1', colSpan: 2, rowSpan: 1 }],
    ...over,
  });

  it('column insert inside a span drops the merge; outside keeps it', () => {
    const [inside] = insertTableColumnAt([custom()], 't', 1);
    expect(inside.cellMerges).toEqual([]);
    const [before] = insertTableColumnAt([custom()], 't', 0);
    expect(before.cellMerges).toEqual([{ rowId: 'r1', colId: 'c1', colSpan: 2, rowSpan: 1 }]);
    const [after] = insertTableColumnAt([custom()], 't', 3);
    expect(after.cellMerges).toEqual([{ rowId: 'r1', colId: 'c1', colSpan: 2, rowSpan: 1 }]);
  });

  it('removing a covered column drops the merge', () => {
    const [t] = removeTableColumnAt([custom()], 't', 1);
    expect(t.cellMerges).toEqual([]);
    const [keep] = removeTableColumnAt([custom()], 't', 2);
    expect(keep.cellMerges).toEqual([{ rowId: 'r1', colId: 'c1', colSpan: 2, rowSpan: 1 }]);
  });

  it('moving a merged column drops the merge', () => {
    const [t] = moveTableColumn([custom()], 't', 0, 2);
    expect(t.cellMerges).toEqual([]);
  });

  it('row insert/remove drops a vertical merge it cuts', () => {
    const vertical = custom({ cellMerges: [{ rowId: 'r1', colId: 'c1', colSpan: 1, rowSpan: 2 }] });
    const [cut] = insertCustomRowAt([vertical], 't', 1, { id: 'rx', cells: ['', '', ''] });
    expect(cut.customRows!.map(r => r.id)).toEqual(['r1', 'rx', 'r2', 'r3']);
    expect(cut.cellMerges).toEqual([]);
    const [before] = insertCustomRowAt([vertical], 't', 0, { id: 'rx', cells: ['', '', ''] });
    expect(before.cellMerges).toEqual([{ rowId: 'r1', colId: 'c1', colSpan: 1, rowSpan: 2 }]);
    const [removed] = removeCustomRowAt([vertical], 't', 1);
    expect(removed.customRows!.map(r => r.id)).toEqual(['r1', 'r3']);
    expect(removed.cellMerges).toEqual([]);
  });

  it('row delete is a no-op with a single row', () => {
    const one = custom({ customRows: [{ id: 'r1', cells: ['', '', ''] }] });
    const [t] = removeCustomRowAt([one], 't', 0);
    expect(t.customRows).toHaveLength(1);
  });
});

describe('duplicateBlockWithId (roadmap 204)', () => {
  it('inserts the copy right after the source and returns its id', () => {
    const list = [b('a'), b('c'), b('d')];
    const { blocks: next, newId } = duplicateBlockWithId(list, 'c');
    expect(next.map(x => x.id)).toEqual(['a', 'c', newId, 'd']);
    expect(newId).toBeTruthy();
    expect(newId).not.toBe('c');
    expect(findBlock(next, newId!)?.block.type).toBe('text');
  });

  it('duplicates a nested child in place', () => {
    const list = [b('rep', 'repeat', { children: [b('x'), b('y')] })];
    const { blocks: next, newId } = duplicateBlockWithId(list, 'x');
    expect((findBlock(next, 'rep')!.block.children || []).map(x => x.id)).toEqual(['x', newId, 'y']);
  });

  it('unknown id returns the list unchanged and a null id', () => {
    const list = [b('a')];
    expect(duplicateBlockWithId(list, 'nope')).toEqual({ blocks: list, newId: null });
  });
});

describe('dayGridOffenders (day-grid blocks only inside a Days context)', () => {
  it('accepts grids inside a days repeat (and daysOfCast), flags them elsewhere', () => {
    expect([...dayGridOffenders([b('d', 'repeat', { collection: 'days', children: [b('g', 'precalls')] })]).keys()]).toEqual([]);
    // Sibling of the days repeat = outside.
    expect([...dayGridOffenders([
      b('d', 'repeat', { collection: 'days', children: [b('g', 'crewTable')] }),
      b('x', 'callTimes'),
    ]).keys()]).toEqual(['x']);
    // A non-days repeat loses the context.
    expect([...dayGridOffenders([b('r', 'repeat', { collection: 'scenes', children: [b('y', 'callTimes')] })]).keys()]).toEqual(['y']);
    // Columns pass the ambient context through.
    expect([...dayGridOffenders([b('c', 'columns', { cols: [{ id: 'c1', width: 50, blocks: [b('z', 'precalls')] }] })]).keys()]).toEqual(['z']);
  });
});
