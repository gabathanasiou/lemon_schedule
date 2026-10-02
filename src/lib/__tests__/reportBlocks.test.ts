import { describe, it, expect } from 'vitest';
import {
  makeReportBlock,
  insertAfter,
  findBlock,
  removeBlock,
  moveBlock,
  paginateBlocks,
  collectRibbonBlocks,
  insertTableColumnAt,
  removeTableColumnAt,
  moveTableColumn,
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
