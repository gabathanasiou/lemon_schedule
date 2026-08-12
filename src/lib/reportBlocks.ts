import { ReportBlock, ReportCollection } from '../types';
import { generateUUID } from './utils';

// Immutable tree helpers for report design block lists. Contract: findBlock
// returns `parent: null` for root-level blocks (never the root array) — root
// inserts/moves splice the root array; nested ones updateBlock the parent.

let _n = 0;
export function blockId(): string {
  _n += 1;
  return `b${Date.now().toString(36)}${_n}`;
}

export function makeReportBlock(type: ReportBlock['type'], partial: Partial<ReportBlock> = {}): ReportBlock {
  const base: ReportBlock = { id: blockId(), type };
  switch (type) {
    case 'text': base.text = partial.text ?? 'Text — {{title}}'; break;
    case 'field': base.field = partial.field ?? undefined; break;
    case 'repeat': base.collection = partial.collection ?? 'scenes'; base.children = []; base.gap = partial.gap ?? 8; break;
    case 'table': base.collection = partial.collection ?? 'scenes'; base.repeatAxis = 'rows'; base.colWidths = []; base.tableRows = []; base.showHeader = true; break;
    case 'columns': base.cols = []; break;
    case 'ribbon': base.ribbonMode = partial.ribbonMode ?? 'all'; break;
    case 'spacer': base.height = partial.height ?? 16; break;
    default: break;
  }
  return { ...base, ...partial, id: base.id, type };
}

export function cloneBlock(b: ReportBlock): ReportBlock {
  return JSON.parse(JSON.stringify(b));
}

export interface Found { block: ReportBlock; parent: ReportBlock[] | null; index: number; depth: number; }

export function findBlock(blocks: ReportBlock[], id: string, depth = 0, isRoot = true): Found | null {
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i].id === id) return { block: blocks[i], parent: isRoot ? null : blocks, index: i, depth };
    if (blocks[i].children?.length) {
      const f = findBlock(blocks[i].children!, id, depth + 1, false);
      if (f) return f;
    }
  }
  return null;
}

function mapTree(blocks: ReportBlock[], id: string, fn: (b: ReportBlock) => ReportBlock): ReportBlock[] {
  return blocks.map(b => {
    if (b.id === id) return fn(b);
    if (b.children?.length) return { ...b, children: mapTree(b.children, id, fn) };
    return b;
  });
}

function parentIdOf(blocks: ReportBlock[], id: string): string | null {
  for (const b of blocks) {
    if (b.children?.some(c => c.id === id)) return b.id;
    if (b.children?.length) {
      const pid = parentIdOf(b.children, id);
      if (pid) return pid;
    }
  }
  return null;
}

export function updateBlock(blocks: ReportBlock[], id: string, patch: Partial<ReportBlock>): ReportBlock[] {
  return mapTree(blocks, id, b => ({ ...b, ...patch }));
}

function insertInArray(arr: ReportBlock[], index: number, b: ReportBlock): ReportBlock[] {
  return [...arr.slice(0, index), b, ...arr.slice(index)];
}

function insertSibling(blocks: ReportBlock[], f: Found, b: ReportBlock, index: number): ReportBlock[] {
  if (f.parent === null) return insertInArray(blocks, Math.min(index, blocks.length), b);
  const newChildren = insertInArray(f.parent, Math.min(index, f.parent.length), b);
  const pid = parentIdOf(blocks, f.block.id);
  if (!pid) return blocks;
  return updateBlock(blocks, pid, { children: newChildren });
}

export function insertAfter(blocks: ReportBlock[], id: string | null, b: ReportBlock): ReportBlock[] {
  if (!id) return [...blocks, b];
  const f = findBlock(blocks, id);
  if (!f) return blocks;
  return insertSibling(blocks, f, b, f.index + 1);
}

export function insertBefore(blocks: ReportBlock[], id: string | null, b: ReportBlock): ReportBlock[] {
  if (!id) return [b, ...blocks];
  const f = findBlock(blocks, id);
  if (!f) return blocks;
  return insertSibling(blocks, f, b, f.index);
}

export function insertInto(blocks: ReportBlock[], id: string | null, b: ReportBlock): ReportBlock[] {
  if (!id) return [...blocks, b];
  const f = findBlock(blocks, id);
  if (!f) return blocks;
  if (f.block.type === 'repeat' || f.block.type === 'table') {
    return updateBlock(blocks, id, { children: [...(f.block.children || []), b] });
  }
  return insertSibling(blocks, f, b, f.index + 1);
}

export function removeBlock(blocks: ReportBlock[], id: string): ReportBlock[] {
  const f = findBlock(blocks, id);
  if (!f) return blocks;
  if (f.parent === null) return blocks.filter(b => b.id !== id);
  const children = f.parent.filter(b => b.id !== id);
  const pid = parentIdOf(blocks, id);
  if (!pid) return blocks;
  return updateBlock(blocks, pid, { children });
}

export function duplicateBlock(blocks: ReportBlock[], id: string): ReportBlock[] {
  const f = findBlock(blocks, id);
  if (!f) return blocks;
  const copy = { ...cloneBlock(f.block), id: blockId() };
  return insertSibling(blocks, f, copy, f.index + 1);
}

export function moveBlock(blocks: ReportBlock[], id: string, dir: -1 | 1): ReportBlock[] {
  const f = findBlock(blocks, id);
  if (!f) return blocks;
  const limit = f.parent ? f.parent.length : blocks.length;
  const target = f.index + dir;
  if (target < 0 || target >= limit) return blocks;
  if (f.parent === null) {
    const arr = [...blocks];
    const [b] = arr.splice(f.index, 1);
    arr.splice(target, 0, b);
    return arr;
  }
  const arr = [...f.parent];
  const [b] = arr.splice(f.index, 1);
  arr.splice(target, 0, b);
  const pid = parentIdOf(blocks, id);
  if (!pid) return blocks;
  return updateBlock(blocks, pid, { children: arr });
}

export function moveBlockTo(blocks: ReportBlock[], moveId: string, targetId: string, pos: 'before' | 'after'): ReportBlock[] {
  if (moveId === targetId) return blocks;
  const fm = findBlock(blocks, moveId);
  if (!fm) return blocks;
  const next = removeBlock(blocks, moveId);
  if (findBlock(next, targetId)) {
    return pos === 'before' ? insertBefore(next, targetId, fm.block) : insertAfter(next, targetId, fm.block);
  }
  return blocks;
}

// ---- collection context ------------------------------------------------------

export const COLLECTION_LABELS: Record<string, string> = {
  scenes: 'Scenes',
  days: 'Days',
  cast: 'Cast',
  elements: 'Elements',
  crew: 'Crew',
  scenesOfDay: 'Scenes (of this day)',
  scenesOfElement: 'Scenes (of this element)',
};

export const COLLECTION_ORDER: ReportCollection[] = ['scenes', 'days', 'cast', 'elements', 'crew', 'scenesOfDay', 'scenesOfElement'];

export function validCollections(parentCollection?: ReportCollection): ReportCollection[] {
  return COLLECTION_ORDER.filter(c => {
    if (c === 'scenesOfDay') return parentCollection === 'days';
    if (c === 'scenesOfElement') return parentCollection === 'elements';
    return true;
  });
}

export function parentCollectionOf(blocks: ReportBlock[], id: string): ReportCollection | undefined {
  for (const b of blocks) {
    if (b.children?.some(c => c.id === id)) return b.collection;
    if (b.children?.length) {
      const pc = parentCollectionOf(b.children, id);
      if (pc) return pc;
    }
  }
  return undefined;
}

/** The collection an insertion at `id` (or root) would live in. */
export function insertScopeFor(blocks: ReportBlock[], id: string | null): ReportCollection | null {
  if (!id) return null;
  const f = findBlock(blocks, id);
  if (!f) return null;
  if (f.block.type === 'repeat' || f.block.type === 'table') return f.block.collection || null;
  return parentCollectionOf(blocks, id) || null;
}

/** True when the block lives inside a columns block's column (columns can't nest). */
export function insideColumnsBlock(blocks: ReportBlock[], id: string): boolean {
  for (const b of blocks) {
    if (b.type === 'columns' && b.cols) {
      if (b.cols.some(c => c.blocks.some(x => x.id === id))) return true;
      for (const c of b.cols) {
        if (insideColumnsBlock(c.blocks, id)) return true;
      }
    }
    if (b.children?.some(c => c.id === id)) return insideColumnsBlock(b.children, id);
    if (b.children?.length && insideColumnsBlock(b.children, id)) return true;
  }
  return false;
}

/**
 * Notion-style wrap: replaces `targetId` with a 2-column columns block
 * containing `[dropped, target]` (side 'left') or `[target, dropped]`
 * (side 'right'). If `moveId` is given, that block is removed from its
 * original location first (drag of an existing block).
 */
export function wrapWithColumns(
  blocks: ReportBlock[],
  targetId: string,
  dropped: ReportBlock,
  side: 'left' | 'right',
  moveId?: string,
): ReportBlock[] {
  if (moveId === targetId) return blocks;
  let next = blocks;
  if (moveId) {
    next = removeBlock(blocks, moveId);
    if (findBlock(next, targetId) === null) return blocks;
  }
  const f = findBlock(next, targetId);
  if (!f) return blocks;
  const target = f.block;
  const colsBlock: ReportBlock = {
    id: blockId(),
    type: 'columns',
    cols: side === 'left'
      ? [
          { id: blockId(), width: 50, blocks: [cloneBlock(dropped)] },
          { id: blockId(), width: 50, blocks: [cloneBlock(target)] },
        ]
      : [
          { id: blockId(), width: 50, blocks: [cloneBlock(target)] },
          { id: blockId(), width: 50, blocks: [cloneBlock(dropped)] },
        ],
  };
  if (f.parent === null) return next.map(b => (b.id === targetId ? colsBlock : b));
  const pid = parentIdOf(next, targetId);
  if (!pid) return next;
  return updateBlock(next, pid, { children: f.parent.map(b => (b.id === targetId ? colsBlock : b)) });
}

export { generateUUID };
