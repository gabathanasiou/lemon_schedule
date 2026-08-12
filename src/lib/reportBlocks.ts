import { ReportBlock, ReportCollection, ReportColumn } from '../types';
import { generateUUID } from './utils';

// Immutable tree helpers for report design block lists. Contract: findBlock
// returns `parent: null` for root-level blocks (never the root array) — root
// inserts/moves splice the root array; nested ones updateBlock the parent.

let _n = 0;
export function blockId(): string {
  _n += 1;
  return `b${Date.now().toString(36)}${_n}`;
}

/**
 * Splits a design's top-level blocks into pages at each `pageBreak` block.
 * Leading breaks are no-ops; consecutive breaks produce blank pages; a
 * trailing break is dropped. Nested pageBreak blocks are left in place.
 */
export function paginateBlocks(blocks: ReportBlock[]): ReportBlock[][] {
  const pages: ReportBlock[][] = [];
  let current: ReportBlock[] = [];
  for (const b of blocks) {
    if (b.type === 'pageBreak') {
      if (current.length > 0 || pages.length > 0) {
        pages.push(current);
        current = [];
      }
      continue;
    }
    current.push(b);
  }
  if (current.length > 0) pages.push(current);
  return pages.length > 0 ? pages : [current];
}

export function makeReportBlock(type: ReportBlock['type'], partial: Partial<ReportBlock> = {}): ReportBlock {
  const base: ReportBlock = { id: blockId(), type };
  switch (type) {
    case 'text': base.text = partial.text ?? 'Text — {{title}}'; break;
    case 'field': base.field = partial.field ?? undefined; break;
    case 'repeat': base.collection = partial.collection ?? 'scenes'; base.children = []; base.gap = partial.gap ?? 8; break;
    case 'table': base.collection = partial.collection ?? 'scenes'; base.columns = partial.columns ?? [
      { id: blockId(), field: '', width: 50 },
      { id: blockId(), field: '', width: 50 },
    ]; base.showHeader = true; break;
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
    if (blocks[i].type === 'columns' && blocks[i].cols) {
      for (const col of blocks[i].cols) {
        const f = findBlock(col.blocks || [], id, depth + 1, false);
        if (f) return f;
      }
    }
  }
  return null;
}

function mapTree(blocks: ReportBlock[], id: string, fn: (b: ReportBlock) => ReportBlock): ReportBlock[] {
  return blocks.map(b => {
    if (b.id === id) return fn(b);
    let next = b;
    if (b.children?.length) next = { ...next, children: mapTree(b.children, id, fn) };
    if (b.type === 'columns' && b.cols) {
      next = { ...next, cols: b.cols.map(c => ({ ...c, blocks: mapTree(c.blocks || [], id, fn) })) };
    }
    return next;
  });
}

/** The block owning the list that contains `id` (repeat/table → children; columns → cols[i].blocks). */
export interface ListOwner { blockId: string; colIndex?: number; }

export function listOwnerOf(blocks: ReportBlock[], id: string): ListOwner | null {
  for (const b of blocks) {
    if (b.children?.some(c => c.id === id)) return { blockId: b.id };
    if (b.children?.length) {
      const o = listOwnerOf(b.children, id);
      if (o) return o;
    }
    if (b.type === 'columns' && b.cols) {
      for (let i = 0; i < b.cols.length; i++) {
        if ((b.cols[i].blocks || []).some(x => x.id === id)) return { blockId: b.id, colIndex: i };
        const o = listOwnerOf(b.cols[i].blocks || [], id);
        if (o) return o;
      }
    }
  }
  return null;
}

export function updateBlock(blocks: ReportBlock[], id: string, patch: Partial<ReportBlock>): ReportBlock[] {
  return mapTree(blocks, id, b => ({ ...b, ...patch }));
}

function updateList(blocks: ReportBlock[], owner: ListOwner, list: ReportBlock[]): ReportBlock[] {
  return mapTree(blocks, owner.blockId, b => {
    if (owner.colIndex !== undefined && b.type === 'columns' && b.cols) {
      return { ...b, cols: b.cols.map((c, i) => (i === owner.colIndex ? { ...c, blocks: list } : c)) };
    }
    return { ...b, children: list };
  });
}

function insertInArray(arr: ReportBlock[], index: number, b: ReportBlock): ReportBlock[] {
  return [...arr.slice(0, index), b, ...arr.slice(index)];
}

function insertSibling(blocks: ReportBlock[], f: Found, b: ReportBlock, index: number): ReportBlock[] {
  if (f.parent === null) return insertInArray(blocks, Math.min(index, blocks.length), b);
  const newList = insertInArray(f.parent, Math.min(index, f.parent.length), b);
  const owner = listOwnerOf(blocks, f.block.id);
  if (!owner) return blocks;
  return updateList(blocks, owner, newList);
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
  const list = f.parent.filter(b => b.id !== id);
  const owner = listOwnerOf(blocks, id);
  if (!owner) return blocks;
  return updateList(blocks, owner, list);
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
  const owner = listOwnerOf(blocks, id);
  if (!owner) return blocks;
  return updateList(blocks, owner, arr);
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

/** Notion Alt+drag: inserts a clone of `moveId` at the target, keeping the original. */
export function duplicateBlockTo(blocks: ReportBlock[], moveId: string, targetId: string, pos: 'before' | 'after'): ReportBlock[] {
  const fm = findBlock(blocks, moveId);
  if (!fm) return blocks;
  const copy = { ...cloneBlock(fm.block), id: blockId() };
  return pos === 'before' ? insertBefore(blocks, targetId, copy) : insertAfter(blocks, targetId, copy);
}

/** Appends a block into a specific column of a columns block. */
export function appendToColumn(blocks: ReportBlock[], columnsId: string, colIndex: number, b: ReportBlock): ReportBlock[] {
  return mapTree(blocks, columnsId, blk => {
    if (blk.type !== 'columns' || !blk.cols) return blk;
    return { ...blk, cols: blk.cols.map((c, i) => (i === colIndex ? { ...c, blocks: [...(c.blocks || []), b] } : c)) };
  });
}

/** Moves a block from anywhere into a specific column (removes it from its old list). */
export function moveIntoColumn(blocks: ReportBlock[], moveId: string, columnsId: string, colIndex: number): ReportBlock[] {
  const fm = findBlock(blocks, moveId);
  if (!fm) return blocks;
  const next = removeBlock(blocks, moveId);
  return appendToColumn(next, columnsId, colIndex, fm.block);
}

/** Moves a block from anywhere into a container's children (repeat/table). */
export function moveIntoChildren(blocks: ReportBlock[], moveId: string, containerId: string): ReportBlock[] {
  const fm = findBlock(blocks, moveId);
  if (!fm) return blocks;
  const next = removeBlock(blocks, moveId);
  return insertInto(next, containerId, fm.block);
}

// ---- column ops (columns block) ----------------------------------------------

/** Normalizes the given width weights to percentages summing to 100. */
function rescaleWidths(cols: ReportColumn[], weights: number[]): ReportColumn[] {
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  return cols.map((c, i) => ({ ...c, width: Math.round(((weights[i] ?? 0) / total) * 10000) / 100 }));
}

function mapColumns(blocks: ReportBlock[], colsId: string, fn: (cols: ReportColumn[]) => ReportColumn[]): ReportBlock[] {
  return mapTree(blocks, colsId, b => {
    if (b.type !== 'columns' || !b.cols) return b;
    return { ...b, cols: fn(b.cols) };
  });
}

/** Inserts a new column at `colIndex` containing `b`; existing widths shrink proportionally. */
export function insertColumnAt(blocks: ReportBlock[], colsId: string, colIndex: number, b: ReportBlock): ReportBlock[] {
  return mapColumns(blocks, colsId, cols => {
    const n = cols.length;
    const index = Math.max(0, Math.min(colIndex, n));
    const avg = n > 0 ? cols.reduce((a, c) => a + c.width, 0) / n : 50;
    const next = [...cols];
    next.splice(index, 0, { id: blockId(), width: avg, blocks: [b] });
    return rescaleWidths(next, next.map(c => c.width));
  });
}

/** Removes the column at `colIndex` (and its contents — Notion behavior). No-op when 1 column remains. */
export function removeColumnAt(blocks: ReportBlock[], colsId: string, colIndex: number): ReportBlock[] {
  return mapColumns(blocks, colsId, cols => {
    if (cols.length <= 1) return cols;
    const next = cols.filter((_, i) => i !== colIndex);
    return rescaleWidths(next, next.map(c => c.width));
  });
}

/** Moves a block from anywhere into a brand-new column at `colIndex`. */
export function moveIntoNewColumn(blocks: ReportBlock[], moveId: string, colsId: string, colIndex: number): ReportBlock[] {
  const fm = findBlock(blocks, moveId);
  if (!fm) return blocks;
  const next = removeBlock(blocks, moveId);
  if (!findBlock(next, colsId)) return blocks;
  return insertColumnAt(next, colsId, colIndex, fm.block);
}

/** Alt+drag: clones a block into a brand-new column at `colIndex`, keeping the original. */
export function duplicateIntoNewColumn(blocks: ReportBlock[], moveId: string, colsId: string, colIndex: number): ReportBlock[] {
  const fm = findBlock(blocks, moveId);
  if (!fm) return blocks;
  return insertColumnAt(blocks, colsId, colIndex, cloneBlock(fm.block));
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
  scenesOfCast: 'Scenes (of this cast member)',
  daysOfCast: 'Days (of this cast member)',
};

export const COLLECTION_ORDER: ReportCollection[] = ['scenes', 'days', 'cast', 'elements', 'crew', 'scenesOfDay', 'scenesOfElement', 'scenesOfCast', 'daysOfCast'];

export function validCollections(parentCollection?: ReportCollection): ReportCollection[] {
  return COLLECTION_ORDER.filter(c => {
    if (c === 'scenesOfDay') return parentCollection === 'days';
    if (c === 'scenesOfElement') return parentCollection === 'elements';
    if (c === 'scenesOfCast' || c === 'daysOfCast') return parentCollection === 'cast';
    return true;
  });
}

/** Contextual sub-collections available for a table nested in a parent repeat. */
export function contextualCollectionsFor(parentCollection?: ReportCollection): ReportCollection[] {
  if (parentCollection === 'days') return ['scenesOfDay'];
  if (parentCollection === 'elements') return ['scenesOfElement'];
  if (parentCollection === 'cast') return ['scenesOfCast', 'daysOfCast'];
  return [];
}

/**
 * The collection a table iterates. Standalone tables use their own `collection`.
 * Tables nested in a repeat auto-resolve the contextual sub-collection of the
 * parent (scenes of this day/element/cast member, or days of the cast member)
 * when the table still has the default `scenes` collection — an explicitly set
 * collection (e.g. a crew table inside a days repeat) is always respected.
 * Falls back to the parent collection itself for per-item spec mode (scenes/crew).
 */
export function tableItemCollection(block: ReportBlock, parentCollection?: ReportCollection): ReportCollection {
  if (!parentCollection) return block.collection || 'scenes';
  const contextual = contextualCollectionsFor(parentCollection);
  if (block.collection && contextual.includes(block.collection)) return block.collection;
  if (block.collection && block.collection !== 'scenes') return block.collection;
  return contextual[0] || parentCollection;
}

/** The field scope for a table's attribute list (column/row field options). */
export function tableFieldScope(block: ReportBlock, parentCollection?: ReportCollection): ReportCollection | undefined {
  if (!parentCollection) return block.collection;
  const contextual = contextualCollectionsFor(parentCollection);
  if (block.collection && block.collection !== 'scenes' && !contextual.includes(block.collection)) return block.collection;
  return contextual.length > 0 ? 'scenes' : parentCollection;
}

/** Human label for where a nested table gets its rows. */
export function tableOverLabel(parentCollection?: ReportCollection): string {
  if (!parentCollection) return '';
  const contextual = contextualCollectionsFor(parentCollection);
  if (contextual.length > 0) return COLLECTION_LABELS[contextual[0]] || '';
  return `Per-item — ${COLLECTION_LABELS[parentCollection] || parentCollection} fields`;
}

/** Default identity header field per collection (rows-mode matrix headers). */
export function defaultIdentityField(collection?: ReportCollection): string {
  switch (collection) {
    case 'scenes': case 'scenesOfDay': case 'scenesOfElement': case 'scenesOfCast': return 'sceneNumber';
    case 'days': case 'daysOfCast': return 'dayNumber';
    case 'cast': case 'elements': return 'name';
    case 'crew': return 'crewName';
    default: return 'title';
  }
}

export function parentCollectionOf(blocks: ReportBlock[], id: string, ctx?: ReportCollection): ReportCollection | undefined {
  for (const b of blocks) {
    if (b.children?.some(c => c.id === id)) return b.collection || ctx;
    if (b.children?.length) {
      const pc = parentCollectionOf(b.children, id, b.collection || ctx);
      if (pc) return pc;
    }
    if (b.type === 'columns' && b.cols) {
      for (const col of b.cols) {
        if ((col.blocks || []).some(x => x.id === id)) return ctx;
        const pc = parentCollectionOf(col.blocks || [], id, ctx);
        if (pc) return pc;
      }
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
      if (b.cols.some(c => (c.blocks || []).some(x => x.id === id))) return true;
      for (const c of b.cols) {
        if (insideColumnsBlock(c.blocks || [], id)) return true;
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
  const owner = listOwnerOf(next, targetId);
  if (!owner) return next;
  return updateList(next, owner, f.parent.map(b => (b.id === targetId ? colsBlock : b)));
}

export { generateUUID };
