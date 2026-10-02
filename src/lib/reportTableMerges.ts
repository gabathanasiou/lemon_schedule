import { ReportBlock, ReportCellMerge, ReportCustomRow, ReportTableColumn } from '../types';
import { cellStyleKey, clearCellStyleKeys, stripCellFormatting } from './reportCellStyles';

// Free-table merged cells (roadmap 189). ONE module for merge geometry: coverage,
// bands, merge/unmerge and the structural remaps — views must never re-derive
// coverage. A merge is anchored by stable row/column ids (`rowId: 'header'` =
// the header band); covered cells are derived here, never stored.

/** Stable id of the header band in `ReportCellMerge.rowId`. */
export const HEADER_ROW_ID = 'header';

export interface CellRef { rowId: string; colId: string; }
/** Inclusive rectangular selection/merge over table positions. */
export interface MergeRect {
  band: 'header' | 'body';
  r0: number; r1: number; c0: number; c1: number;
}
/** A maximal run of consecutive rows joined by a vertical merge. */
export interface TableBand { rows: ReportCustomRow[]; start: number; }

const cellKey = (rowId: string, colId: string) => `${rowId}\u0000${colId}`;

/** Normalizes a raw span to a positive integer (defensive for stored data). */
function spanOf(n: number | undefined): number {
  const v = Math.floor(n ?? 1);
  return Number.isFinite(v) && v > 0 ? v : 1;
}

function colPos(columns: ReportTableColumn[], colId: string): number {
  return columns.findIndex(c => c.id === colId);
}

function rowPos(rows: ReportCustomRow[], rowId: string): number {
  return rows.findIndex(r => r.id === rowId);
}

/** The merge anchored exactly at this cell, or null. */
export function mergeAnchorAt(merges: ReportCellMerge[] | undefined, rowId: string, colId: string): ReportCellMerge | null {
  return (merges || []).find(m => m.rowId === rowId && m.colId === colId) || null;
}

/** The merge COVERING this cell (the cell is inside the rectangle but is not
 *  its anchor), or null. */
export function isCovered(
  merges: ReportCellMerge[] | undefined,
  rows: ReportCustomRow[],
  columns: ReportTableColumn[],
  rowId: string,
  colId: string,
): ReportCellMerge | null {
  const ci = colPos(columns, colId);
  if (ci < 0) return null;
  for (const m of merges || []) {
    if (m.rowId === rowId && m.colId === colId) continue; // the anchor itself
    const ai = colPos(columns, m.colId);
    if (ai < 0) continue;
    if (ci < ai || ci >= ai + spanOf(m.colSpan)) continue;
    if (m.rowId === HEADER_ROW_ID) {
      if (rowId !== HEADER_ROW_ID) continue;
      return m;
    }
    const ar = rowPos(rows, m.rowId);
    const r = rowPos(rows, rowId);
    if (ar < 0 || r < ar || r >= ar + spanOf(m.rowSpan)) continue;
    return m;
  }
  return null;
}

/** The rectangle a merge occupies (clamped to the table), or null when stale. */
export function mergeRect(
  m: ReportCellMerge,
  rows: ReportCustomRow[],
  columns: ReportTableColumn[],
): MergeRect | null {
  const ci = colPos(columns, m.colId);
  if (ci < 0) return null;
  const c1 = Math.min(columns.length - 1, ci + spanOf(m.colSpan) - 1);
  if (m.rowId === HEADER_ROW_ID) return { band: 'header', r0: 0, r1: 0, c0: ci, c1 };
  const ri = rowPos(rows, m.rowId);
  if (ri < 0) return null;
  return { band: 'body', r0: ri, r1: Math.min(rows.length - 1, ri + spanOf(m.rowSpan) - 1), c0: ci, c1 };
}

function rectsIntersect(a: MergeRect, b: MergeRect): boolean {
  if (a.band !== b.band) return false;
  return a.r0 <= b.r1 && b.r0 <= a.r1 && a.c0 <= b.c1 && b.c0 <= a.c1;
}

/** Normalized rectangular range between two cell refs, or null when either
 *  ref is stale or the endpoints straddle the header/body boundary. */
export function rangeRect(
  rows: ReportCustomRow[],
  columns: ReportTableColumn[],
  a: CellRef,
  b: CellRef,
): MergeRect | null {
  const ca = colPos(columns, a.colId);
  const cb = colPos(columns, b.colId);
  if (ca < 0 || cb < 0) return null;
  const c0 = Math.min(ca, cb);
  const c1 = Math.max(ca, cb);
  const aHeader = a.rowId === HEADER_ROW_ID;
  const bHeader = b.rowId === HEADER_ROW_ID;
  if (aHeader !== bHeader) return null;
  if (aHeader) return { band: 'header', r0: 0, r1: 0, c0, c1 };
  const ra = rowPos(rows, a.rowId);
  const rb = rowPos(rows, b.rowId);
  if (ra < 0 || rb < 0) return null;
  return { band: 'body', r0: Math.min(ra, rb), r1: Math.max(ra, rb), c0, c1 };
}

/** True when the rect contains the given cell. */
export function rectCovers(
  rows: ReportCustomRow[],
  columns: ReportTableColumn[],
  rect: MergeRect,
  rowId: string,
  colId: string,
): boolean {
  const ci = colPos(columns, colId);
  if (ci < rect.c0 || ci > rect.c1) return false;
  if (rect.band === 'header') return rowId === HEADER_ROW_ID;
  const ri = rowPos(rows, rowId);
  return ri >= rect.r0 && ri <= rect.r1;
}

/** Cell count of a rect (≥1). */
export function rectCellCount(rect: MergeRect): number {
  return (rect.r1 - rect.r0 + 1) * (rect.c1 - rect.c0 + 1);
}

/** True when any merge intersects the rect (selection touches a merged cell). */
export function rectTouchesMerge(
  merges: ReportCellMerge[] | undefined,
  rows: ReportCustomRow[],
  columns: ReportTableColumn[],
  rect: MergeRect,
): boolean {
  return (merges || []).some(m => {
    const mr = mergeRect(m, rows, columns);
    return !!mr && rectsIntersect(mr, rect);
  });
}

/** Grows the rect until it fully contains every merge it intersects (selecting
 *  part of a merged cell selects the whole merge — Excel behavior). */
export function expandRectToMerges(
  merges: ReportCellMerge[] | undefined,
  rows: ReportCustomRow[],
  columns: ReportTableColumn[],
  rect: MergeRect,
): MergeRect {
  let out = rect;
  let changed = true;
  while (changed) {
    changed = false;
    for (const m of merges || []) {
      const mr = mergeRect(m, rows, columns);
      if (!mr || !rectsIntersect(mr, out)) continue;
      const r0 = Math.min(out.r0, mr.r0);
      const r1 = Math.max(out.r1, mr.r1);
      const c0 = Math.min(out.c0, mr.c0);
      const c1 = Math.max(out.c1, mr.c1);
      if (r0 !== out.r0 || r1 !== out.r1 || c0 !== out.c0 || c1 !== out.c1) {
        out = { band: out.band, r0, r1, c0, c1 };
        changed = true;
      }
    }
  }
  return out;
}

/** Removes stale/overlapping merges and clamps spans to the table. */
export function pruneMerges(
  merges: ReportCellMerge[] | undefined,
  rows: ReportCustomRow[],
  columns: ReportTableColumn[],
): ReportCellMerge[] {
  if (!merges || merges.length === 0) return [];
  const out: ReportCellMerge[] = [];
  const covered = new Set<string>();
  for (const m of merges) {
    const ai = colPos(columns, m.colId);
    if (ai < 0) continue;
    const header = m.rowId === HEADER_ROW_ID;
    const ri = header ? -1 : rowPos(rows, m.rowId);
    if (!header && ri < 0) continue;
    const colSpan = Math.min(spanOf(m.colSpan), columns.length - ai);
    const rowSpan = header ? 1 : Math.min(spanOf(m.rowSpan), rows.length - ri);
    let overlaps = false;
    for (let r = 0; r < rowSpan && !overlaps; r++) {
      const rid = header ? HEADER_ROW_ID : rows[ri + r].id;
      for (let c = 0; c < colSpan; c++) {
        if (covered.has(cellKey(rid, columns[ai + c].id))) { overlaps = true; break; }
      }
    }
    if (overlaps) continue;
    for (let r = 0; r < rowSpan; r++) {
      const rid = header ? HEADER_ROW_ID : rows[ri + r].id;
      for (let c = 0; c < colSpan; c++) covered.add(cellKey(rid, columns[ai + c].id));
    }
    out.push({ rowId: m.rowId, colId: m.colId, colSpan, rowSpan });
  }
  return out;
}

/** Merges the rectangular range between two refs, absorbing every merge it
 *  intersects. Returns the new merge list plus the merged rect; the caller
 *  clears the covered cells (content stays in the top-left anchor). */
export function mergeRange(
  merges: ReportCellMerge[] | undefined,
  rows: ReportCustomRow[],
  columns: ReportTableColumn[],
  a: CellRef,
  b: CellRef,
): { merges: ReportCellMerge[]; rect: MergeRect } | null {
  const rect = rangeRect(rows, columns, a, b);
  if (!rect || rectCellCount(rect) < 2) return null;
  const kept = (merges || []).filter(m => {
    const mr = mergeRect(m, rows, columns);
    return !mr || !rectsIntersect(mr, rect);
  });
  const anchorRow = rect.band === 'header' ? HEADER_ROW_ID : rows[rect.r0].id;
  const anchor = {
    rowId: anchorRow,
    colId: columns[rect.c0].id,
    colSpan: rect.c1 - rect.c0 + 1,
    rowSpan: rect.band === 'header' ? 1 : rect.r1 - rect.r0 + 1,
  };
  return { merges: [...kept, anchor], rect };
}

/** Removes every merge intersecting the rect (unmerge leaves content only in
 *  the top-left — covered cells were cleared at merge time). */
export function unmergeInRect(
  merges: ReportCellMerge[] | undefined,
  rows: ReportCustomRow[],
  columns: ReportTableColumn[],
  rect: MergeRect,
): ReportCellMerge[] {
  return (merges || []).filter(m => {
    const mr = mergeRect(m, rows, columns);
    return !mr || !rectsIntersect(mr, rect);
  });
}

/** Unmerges the merge covering the given cell (anchor or covered). */
export function unmergeAt(
  merges: ReportCellMerge[] | undefined,
  rows: ReportCustomRow[],
  columns: ReportTableColumn[],
  rowId: string,
  colId: string,
): ReportCellMerge[] {
  const rect = rangeRect(rows, columns, { rowId, colId }, { rowId, colId });
  if (!rect) return merges || [];
  return unmergeInRect(merges, rows, columns, rect);
}

/** Groups rows into bands: one row, or a maximal run of consecutive rows
 *  joined by a vertical merge (the grid-band rendering unit). */
export function buildBands(rows: ReportCustomRow[], merges: ReportCellMerge[] | undefined): TableBand[] {
  const n = rows.length;
  if (n === 0) return [];
  const joined = new Array(Math.max(0, n - 1)).fill(false);
  const pos = new Map(rows.map((r, i) => [r.id, i]));
  for (const m of merges || []) {
    if (m.rowId === HEADER_ROW_ID) continue;
    const span = spanOf(m.rowSpan);
    if (span < 2) continue;
    const r0 = pos.get(m.rowId);
    if (r0 === undefined) continue;
    for (let i = r0; i < Math.min(r0 + span - 1, n - 1); i++) joined[i] = true;
  }
  const bands: TableBand[] = [];
  let start = 0;
  for (let i = 0; i < n; i++) {
    if (i === n - 1 || !joined[i]) {
      bands.push({ rows: rows.slice(start, i + 1), start });
      start = i + 1;
    }
  }
  return bands;
}

/** Merges after inserting a row at `index`: a merge cut open (insert strictly
 *  inside its vertical span) is dropped; inserting above/below keeps it. */
export function insertMergeRow(
  rows: ReportCustomRow[],
  merges: ReportCellMerge[] | undefined,
  index: number,
): ReportCellMerge[] {
  return (merges || []).filter(m => {
    if (m.rowId === HEADER_ROW_ID) return true;
    const r0 = rowPos(rows, m.rowId);
    if (r0 < 0) return false;
    const span = spanOf(m.rowSpan);
    return !(span > 1 && index > r0 && index < r0 + span);
  });
}

/** Merges after removing the row at `index`: every merge that covered it drops. */
export function removeMergeRow(
  rows: ReportCustomRow[],
  merges: ReportCellMerge[] | undefined,
  index: number,
): ReportCellMerge[] {
  return (merges || []).filter(m => {
    if (m.rowId === HEADER_ROW_ID) return true;
    const r0 = rowPos(rows, m.rowId);
    if (r0 < 0) return false;
    const span = spanOf(m.rowSpan);
    return !(index >= r0 && index < r0 + span);
  });
}

/** Merges after a column insert/remove/reorder. A merge survives only when its
 *  covered columns still exist AND stay consecutive with the anchor first —
 *  any structural edit that cuts the rectangle drops it (`movedFrom` marks a
 *  reorder's source column, which always cuts). */
export function remapMergesForColumns(
  prev: ReportTableColumn[],
  next: ReportTableColumn[],
  merges: ReportCellMerge[] | undefined,
  movedFrom?: number,
): ReportCellMerge[] {
  if (!merges || merges.length === 0) return [];
  const prevPos = new Map(prev.map((c, i) => [c.id, i]));
  const nextPos = new Map(next.map((c, i) => [c.id, i]));
  const out: ReportCellMerge[] = [];
  for (const m of merges) {
    const p0 = prevPos.get(m.colId);
    if (p0 === undefined) continue;
    const span = spanOf(m.colSpan);
    if (movedFrom !== undefined && movedFrom >= p0 && movedFrom < p0 + span) continue;
    const positions = prev.slice(p0, p0 + span).map(c => nextPos.get(c.id));
    if (positions.some(p => p === undefined)) continue;
    const first = positions[0]!;
    if (!positions.every((p, i) => p === first + i)) continue;
    out.push({ ...m, colSpan: span });
  }
  return out;
}

// ---- block-level free-table cell ops ----------------------------------------
// ONE implementation of merge/unmerge/reset so the canvas and the docked
// inspector patch the block identically.

/** Every cell key in the rect, optionally excluding the top-left anchor. */
function rectCellKeys(
  rows: ReportCustomRow[],
  columns: ReportTableColumn[],
  rect: MergeRect,
  excludeAnchor: boolean,
): string[] {
  const keys: string[] = [];
  if (rect.band === 'header') {
    for (let c = rect.c0; c <= rect.c1; c++) {
      if (excludeAnchor && c === rect.c0) continue;
      keys.push(cellStyleKey(HEADER_ROW_ID, columns[c].id));
    }
    return keys;
  }
  for (let r = rect.r0; r <= rect.r1; r++) {
    for (let c = rect.c0; c <= rect.c1; c++) {
      if (excludeAnchor && r === rect.r0 && c === rect.c0) continue;
      keys.push(cellStyleKey(rows[r].id, columns[c].id));
    }
  }
  return keys;
}

/** Merges the range between two refs, keeping the top-left content and
 *  clearing the covered cells + their style overrides. */
export function mergeCellsInBlock(
  block: ReportBlock,
  a: CellRef,
  b: CellRef,
): { patch: Partial<ReportBlock>; anchor: CellRef } | null {
  const rows = block.customRows || [];
  const columns = block.columns || [];
  const merges = pruneMerges(block.cellMerges, rows, columns);
  const res = mergeRange(merges, rows, columns, a, b);
  if (!res) return null;
  const { rect } = res;
  const customRows = rect.band === 'body'
    ? rows.map((r, ri) => (ri < rect.r0 || ri > rect.r1 ? r : {
        ...r,
        cells: columns.map((_, ci) => (ci >= rect.c0 && ci <= rect.c1 && !(ri === rect.r0 && ci === rect.c0)) ? '' : (r.cells[ci] || '')),
      }))
    : rows;
  const anchor: CellRef = {
    rowId: rect.band === 'header' ? HEADER_ROW_ID : rows[rect.r0].id,
    colId: columns[rect.c0].id,
  };
  return {
    patch: {
      customRows,
      cellMerges: res.merges,
      cellStyles: clearCellStyleKeys(block.cellStyles, rectCellKeys(rows, columns, rect, true)),
    },
    anchor,
  };
}

/** Releases every merge intersecting the rect (content stays top-left). */
export function unmergeCellsInBlock(block: ReportBlock, rect: MergeRect): Partial<ReportBlock> {
  const rows = block.customRows || [];
  const columns = block.columns || [];
  const merges = pruneMerges(block.cellMerges, rows, columns);
  return { cellMerges: unmergeInRect(merges, rows, columns, rect) };
}

/** Reset to table default: clears the rect's style overrides AND strips its
 *  inline formatting ("Clear formats"). */
export function resetCellsInBlock(block: ReportBlock, rect: MergeRect): Partial<ReportBlock> {
  const rows = block.customRows || [];
  const columns = block.columns || [];
  const keys = rectCellKeys(rows, columns, rect, false);
  const patch: Partial<ReportBlock> = { cellStyles: clearCellStyleKeys(block.cellStyles, keys) };
  if (rect.band === 'body') {
    patch.customRows = rows.map((r, ri) => (ri < rect.r0 || ri > rect.r1 ? r : {
      ...r,
      cells: columns.map((_, ci) => {
        if (ci < rect.c0 || ci > rect.c1) return r.cells[ci] || '';
        return stripCellFormatting(r.cells[ci] || '');
      }),
    }));
  }
  return patch;
}

