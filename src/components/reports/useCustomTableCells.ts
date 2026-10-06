import { useMemo, useState } from 'react';
import { ReportBlock, ReportCellStyle, ReportCustomRow, ReportTableColumn } from '../../types';
import { blockId, insertCustomRowAt, insertTableColumnAt, moveTableColumn, removeCustomRowAt, removeTableColumnAt } from '../../lib/reportBlocks';
import {
  CellRef, HEADER_ROW_ID, MergeRect, TableBand, buildBands, expandRectToMerges, insertMergeRow, isCovered, mergeCellsInBlock,
  pruneMerges, rangeRect, rectCellCount, rectTouchesMerge, remapMergesForColumns, resetCellsInBlock, unmergeCellsInBlock,
} from '../../lib/reportTableMerges';
import { cellStyleKey, getCellStyle, patchCellStyleKeys, pruneCellStyles } from '../../lib/reportCellStyles';
import { splitBoundaryEven } from '../columnResize';

// Free-table cell model (roadmap 189): selection + derived merge/style state +
// every block mutation, shared by the canvas table (CustomTable) and the
// docked inspector (ReportDesigner) so both drive the same behavior.

export interface CustomCellSelection { anchor: CellRef; focus: CellRef; }

const EMPTY_ROWS: ReportCustomRow[] = [];
const EMPTY_COLUMNS: ReportTableColumn[] = [];

/** Human label for a selected range. */
export function cellRangeLabel(rect: MergeRect | null): string {
  if (!rect) return 'No cells selected';
  const rows = rect.r1 - rect.r0 + 1;
  const cols = rect.c1 - rect.c0 + 1;
  if (rect.band === 'header') return `Header · ${cols} column${cols > 1 ? 's' : ''}`;
  return `${rows} × ${cols} cell${rows * cols > 1 ? 's' : ''}`;
}

export interface CustomTableCells {
  isCustom: boolean;
  rows: ReportCustomRow[];
  columns: ReportTableColumn[];
  merges: ReturnType<typeof pruneMerges>;
  bands: TableBand[];
  cellStyles: Record<string, ReportCellStyle>;
  selection: CustomCellSelection | null;
  select: (sel: CustomCellSelection | null) => void;
  rawRect: MergeRect | null;
  selectionRect: MergeRect | null;
  label: string;
  canMerge: boolean;
  canUnmerge: boolean;
  canDeleteRows: boolean;
  canDeleteColumns: boolean;
  hasStyleOverride: boolean;
  /** A multi-cell selection whose overrides differ (object-level "Mixed"). */
  rangeMixed: { fontFamily: boolean; fontSize: boolean };
  focusStyle: ReportCellStyle;
  commitCell: (rowIndex: number, colIndex: number, html: string) => void;
  setHeader: (colIndex: number, label: string) => void;
  insertRowAt: (index: number) => void;
  removeRow: (index: number) => void;
  duplicateRow: (index: number) => void;
  setRowHeight: (index: number, height: number | undefined) => void;
  insertColumnAt: (index: number) => void;
  moveColumn: (from: number, to: number) => void;
  removeColumn: (index: number) => void;
  duplicateColumn: (index: number) => void;
  /** Double-click a column tab (roadmap 194): the boundary's two columns
   *  split their combined width evenly; other columns untouched. */
  resetColumnBoundary: (index: number) => void;
  deleteRows: () => void;
  deleteColumns: () => void;
  merge: () => void;
  unmerge: () => void;
  patchStyle: (patch: Partial<ReportCellStyle>) => void;
  resetCells: () => void;
  clearContents: () => void;
}

export function useCustomTableCells(opts: {
  block?: ReportBlock;
  patch?: (patch: Partial<ReportBlock>) => void;
  /** Controlled selection (the designer owns it so the dock can mirror it). */
  selection?: CustomCellSelection | null;
  onSelectionChange?: (sel: CustomCellSelection | null) => void;
}): CustomTableCells {
  const { block, patch, onSelectionChange } = opts;
  const [localSelection, setLocalSelection] = useState<CustomCellSelection | null>(null);
  const controlled = !!onSelectionChange;
  const selection = controlled ? (opts.selection ?? null) : localSelection;
  const select = (sel: CustomCellSelection | null) => {
    if (onSelectionChange) onSelectionChange(sel);
    else setLocalSelection(sel);
  };

  const isCustom = !!block && block.type === 'table' && !!block.custom;
  const rows = isCustom ? (block!.customRows || EMPTY_ROWS) : EMPTY_ROWS;
  const columns = isCustom ? (block!.columns || EMPTY_COLUMNS) : EMPTY_COLUMNS;
  const merges = useMemo(
    () => pruneMerges(isCustom ? block!.cellMerges : undefined, rows, columns),
    [isCustom, block?.cellMerges, rows, columns],
  );
  const bands = useMemo(() => buildBands(rows, merges), [rows, merges]);
  const cellStyles = useMemo(
    () => pruneCellStyles(isCustom ? block!.cellStyles : undefined, rows, columns, HEADER_ROW_ID),
    [isCustom, block?.cellStyles, rows, columns],
  );
  const rawRect = useMemo(
    () => (selection ? rangeRect(rows, columns, selection.anchor, selection.focus) : null),
    [selection, rows, columns],
  );
  const selectionRect = useMemo(
    () => (rawRect ? expandRectToMerges(merges, rows, columns, rawRect) : null),
    [rawRect, rows, columns, merges],
  );
  const selectionKeys = useMemo(() => {
    if (!selectionRect) return [] as string[];
    const keys: string[] = [];
    const push = (rowId: string, colId: string) => {
      // Covered cells are painted by their merge anchor — style the anchor only.
      if (isCovered(merges, rows, columns, rowId, colId)) return;
      keys.push(cellStyleKey(rowId, colId));
    };
    if (selectionRect.band === 'header') {
      for (let c = selectionRect.c0; c <= selectionRect.c1; c++) push(HEADER_ROW_ID, columns[c].id);
    } else {
      for (let r = selectionRect.r0; r <= selectionRect.r1; r++) {
        for (let c = selectionRect.c0; c <= selectionRect.c1; c++) push(rows[r].id, columns[c].id);
      }
    }
    return keys;
  }, [selectionRect, rows, columns, merges]);

  const rangeRows = selectionRect ? selectionRect.r1 - selectionRect.r0 + 1 : 0;
  const rangeCols = selectionRect ? selectionRect.c1 - selectionRect.c0 + 1 : 0;
  // Effective style of the focus cell: overrides layered over the column's
  // default alignment (what the typography pickers display).
  const focusColumn = selection ? columns.find(c => c.id === selection.focus.colId) : undefined;
  const focusStyle: ReportCellStyle = {
    ...(focusColumn?.align ? { align: focusColumn.align } : {}),
    ...(selection ? (getCellStyle(cellStyles, selection.focus.rowId, selection.focus.colId) || {}) : {}),
  };
  const rangeMixed = useMemo(() => {
    const families = new Set<string>();
    const sizes = new Set<string>();
    for (const k of selectionKeys) {
      const s = cellStyles[k];
      families.add(s?.fontFamily ?? '');
      sizes.add(s?.fontSize != null ? String(s.fontSize) : '');
    }
    return { fontFamily: families.size > 1, fontSize: sizes.size > 1 };
  }, [selectionKeys, cellStyles]);

  const applyTableOp = (op: (blocks: ReportBlock[]) => ReportBlock[]) => {
    if (!block || !patch) return;
    const next = op([block])[0];
    patch({ columns: next.columns, customRows: next.customRows, cellMerges: next.cellMerges, cellStyles: next.cellStyles });
  };

  const commitCell = (rowIndex: number, colIndex: number, html: string) => {
    if (!patch) return;
    patch({ customRows: rows.map((r, i) => i === rowIndex
      ? { ...r, cells: columns.map((_, j) => (j === colIndex ? html : (r.cells[j] || ''))) }
      : r) });
  };
  const setHeader = (colIndex: number, label: string) => {
    if (!patch) return;
    patch({ columns: columns.map((c, i) => (i === colIndex ? { ...c, label } : c)) });
  };
  const insertRowAt = (index: number) => {
    applyTableOp(blocks => insertCustomRowAt(blocks, block!.id, index, { id: blockId(), cells: columns.map(() => '') }));
  };
  const removeRow = (index: number) => {
    applyTableOp(blocks => removeCustomRowAt(blocks, block!.id, index));
  };
  /** Copy a row in place (new stable id): cells, height and per-cell styles;
   *  merges the insert would cut open are dropped (the insertMergeRow rule). */
  const duplicateRow = (index: number) => {
    if (!block || !patch || !rows[index]) return;
    const src = rows[index];
    const dup = { ...src, id: blockId(), cells: [...src.cells] };
    const nextRows = [...rows.slice(0, index + 1), dup, ...rows.slice(index + 1)];
    const nextStyles = { ...block.cellStyles };
    for (const c of columns) {
      const style = block.cellStyles?.[cellStyleKey(src.id, c.id)];
      if (style) nextStyles[cellStyleKey(dup.id, c.id)] = { ...style };
    }
    patch({
      customRows: nextRows,
      cellMerges: insertMergeRow(nextRows, block.cellMerges, index + 1),
      ...(Object.keys(nextStyles).length !== Object.keys(block.cellStyles || {}).length ? { cellStyles: nextStyles } : {}),
    });
  };
  const setRowHeight = (index: number, height: number | undefined) => {
    if (!patch) return;
    patch({ customRows: rows.map((r, i) => (i === index ? { ...r, height } : r)) });
  };
  const insertColumnAt = (index: number) => {
    applyTableOp(blocks => insertTableColumnAt(blocks, block!.id, index));
  };
  const moveColumn = (from: number, to: number) => {
    applyTableOp(blocks => moveTableColumn(blocks, block!.id, from, to));
  };
  const removeColumn = (index: number) => {
    applyTableOp(blocks => removeTableColumnAt(blocks, block!.id, index));
  };
  const resetColumnBoundary = (index: number) => {
    if (!patch) return;
    const next = splitBoundaryEven(columns.map(c => c.width), index);
    if (!next) return;
    patch({ columns: columns.map((c, i) => ({ ...c, width: next[i] })) });
  };
  /** Copy a column in place (new stable id): header props, every row's cell and
   *  per-cell styles; merges the insert would cross are dropped (the same
   *  remapMergesForColumns rule as an empty column insert). */
  const duplicateColumn = (index: number) => {
    if (!block || !patch || !columns[index]) return;
    const src = columns[index];
    const dup = { ...src, id: blockId() };
    const nextColumns = [...columns.slice(0, index + 1), dup, ...columns.slice(index + 1)];
    const nextRows = rows.map(r => ({
      ...r,
      cells: [...r.cells.slice(0, index + 1), r.cells[index] ?? '', ...r.cells.slice(index + 1)],
    }));
    const nextStyles = { ...block.cellStyles };
    for (const r of rows) {
      const style = block.cellStyles?.[cellStyleKey(r.id, src.id)];
      if (style) nextStyles[cellStyleKey(r.id, dup.id)] = { ...style };
    }
    patch({
      columns: nextColumns,
      customRows: nextRows,
      cellMerges: remapMergesForColumns(columns, nextColumns, block.cellMerges),
      ...(Object.keys(nextStyles).length !== Object.keys(block.cellStyles || {}).length ? { cellStyles: nextStyles } : {}),
    });
  };
  const deleteRows = () => {
    if (!block || !selectionRect || selectionRect.band !== 'body') return;
    let next = [block];
    for (let ri = selectionRect.r1; ri >= selectionRect.r0; ri--) next = removeCustomRowAt(next, block.id, ri);
    applyTableOp(() => next);
    select(null);
  };
  const deleteColumns = () => {
    if (!block || !selectionRect) return;
    let next = [block];
    for (let ci = selectionRect.c1; ci >= selectionRect.c0; ci--) next = removeTableColumnAt(next, block.id, ci);
    applyTableOp(() => next);
    select(null);
  };
  const merge = () => {
    if (!block || !selection) return;
    const res = mergeCellsInBlock(block, selection.anchor, selection.focus);
    if (!res || !patch) return;
    patch(res.patch);
    select({ anchor: res.anchor, focus: res.anchor });
  };
  const unmerge = () => {
    if (!block || !selectionRect || !patch) return;
    patch(unmergeCellsInBlock(block, selectionRect));
  };
  const patchStyle = (p: Partial<ReportCellStyle>) => {
    if (!block || !patch) return;
    const keys = selectionKeys.length > 0
      ? selectionKeys
      : selection ? [cellStyleKey(selection.focus.rowId, selection.focus.colId)] : [];
    if (keys.length === 0) return;
    patch({ cellStyles: patchCellStyleKeys(cellStyles, keys, p) });
  };
  const resetCells = () => {
    if (!block || !selectionRect || !patch) return;
    patch(resetCellsInBlock(block, selectionRect));
  };
  const clearContents = () => {
    if (!patch || !selectionRect) return;
    const { r0, r1, c0, c1 } = selectionRect;
    if (selectionRect.band === 'header') {
      patch({ columns: columns.map((c, ci) => (ci >= c0 && ci <= c1 ? { ...c, label: '' } : c)) });
      return;
    }
    patch({ customRows: rows.map((r, ri) => (ri < r0 || ri > r1 ? r : {
      ...r, cells: columns.map((_, ci) => (ci >= c0 && ci <= c1 ? '' : (r.cells[ci] || ''))),
    })) });
  };

  return {
    isCustom, rows, columns, merges, bands, cellStyles, selection, select,
    rawRect, selectionRect, label: cellRangeLabel(selectionRect),
    canMerge: !!rawRect && rectCellCount(rawRect) >= 2,
    canUnmerge: !!selectionRect && rectTouchesMerge(merges, rows, columns, selectionRect),
    canDeleteRows: !!selectionRect && selectionRect.band === 'body' && rows.length - rangeRows >= 1,
    canDeleteColumns: !!selectionRect && columns.length - rangeCols >= 1,
    hasStyleOverride: selectionKeys.some(k => !!cellStyles[k]),
    rangeMixed,
    focusStyle,
    commitCell, setHeader, insertRowAt, removeRow, duplicateRow, setRowHeight, insertColumnAt, moveColumn, removeColumn, duplicateColumn,
    resetColumnBoundary,
    deleteRows, deleteColumns, merge, unmerge, patchStyle, resetCells, clearContents,
  };
}
