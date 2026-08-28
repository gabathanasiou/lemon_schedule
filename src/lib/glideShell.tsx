import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import DataEditor, {
  GridCellKind,
  type GridCell,
  type GridColumn,
  type Item,
  type GridSelection,
  type EditableGridCell,
  type DataEditorRef,
  CompactSelection,
} from '@glideapps/glide-data-grid';
import '@glideapps/glide-data-grid/dist/index.css';
import { useProject } from '../store';
import { generateUUID, clipboardWrite, clipboardRead } from './utils';
import { ChevronDown, FileDown, Download, ZoomIn, ZoomOut, RotateCcw, CheckSquare, Square, Copy, Scissors, ClipboardPaste, Trash2, ArrowUp, ArrowDown, Eye } from 'lucide-react';
import { ContextMenu, ContextMenuItem, ContextMenuDivider } from '../components/ContextMenu';
import DropdownMenu from '../components/DropdownMenu';
import DropdownItem from '../components/DropdownItem';
import DropdownDivider from '../components/DropdownDivider';
import Modal, { ModalFooter } from '../components/Modal';
import ModalFooterButton from '../components/ModalFooterButton';
import { useSpreadsheetFontSize, SS_FONT_SIZE_DEFAULT, useGlideSmoothScroll, useKeyboardMode } from './persist';
import { IS_COARSE, useHardwareKeyboard, isTouchLike } from './device';
import { createGlideTheme } from './glideTheme';
import { usePortalTarget, useCurrentDocument } from './popoutTarget';
import { textCell, buildCopyText, buildCutPlan } from './glideCells';
import { createGlideCellEditor, type GlideColumnEditor } from './glideEditor';
import { useGlidePasteInterception } from './glidePasteIntercept';
import { useGlideColumnWidths } from './glideColumns';
import { useDedupeCellCommit } from './glideEditGuard';
import { planGridPaste, type PasteEdit, type PasteColumn, type PasteRange } from './glidePaste';
import type { Project } from '../types';

// ---- Generic database "glide" grid shell ------------------------------------
//
// One DataEditor spreadsheet engine shared by every flat database view (crew,
// locations, future DBs). All database-specific behavior (row building, cell
// commits, category creation, paste, CSV, sort, delete) lives in a config
// object; this shell owns the grid state, keyboard, menus and rendering.

export interface GlideColumnDef {
  key: string;
  label: string;
  width: number;
  align?: 'left' | 'right';
  /** category columns are autocomplete dropdowns that create new categories. */
  kind?: 'text' | 'category';
  /** false disables Clear for the column (category columns are required). */
  clearable?: boolean;
  placeholder?: string;
}

/** A flat grid row. `categoryKey`/`categoryLabel` anchor the category column
 *  (role/type); the config also stores the category label under the category
 *  column's key so copy/cut/paste read it like any other field. */
export interface GlideRow extends Record<string, string> {
  key: string;
  categoryKey: string;
  categoryLabel: string;
}

export interface GlideCategory {
  key: string;
  label: string;
}

export interface GlidePasteNewRow {
  categoryKey: string | null;
  categoryLabel: string;
  values: Record<string, string>;
}

export interface GlidePastePlan {
  editRows: PasteEdit[];
  newRows: GlidePasteNewRow[];
}

export interface GlideCsvImport {
  count: number;
  newCategories: { key: string; label: string }[];
}

export interface GlideInfoCount {
  label: string;
  count: number;
}

export interface GlideShellConfig {
  /** Storage-key fragment for per-database column widths, e.g. 'crew'. */
  widthStorageKey: string;
  columnDefs: GlideColumnDef[];
  buildRows(project: Project): GlideRow[];
  categories(project: Project): GlideCategory[];
  resolveCategoryKey(text: string, categories: GlideCategory[]): string | null;
  commitEdit(dispatch: (action: any) => void, row: GlideRow, colKey: string, newVal: string, project: Project): void;
  createFromAddRow(dispatch: (action: any) => void, colKey: string, val: string, project: Project): void;
  planPaste(target: Item, values: readonly (readonly string[])[], rows: GlideRow[], columns: PasteColumn[], selection: PasteRange | null | undefined, project: Project): GlidePastePlan;
  commitPaste(dispatch: (action: any) => void, plan: GlidePastePlan, rows: GlideRow[], project: Project): void;
  deleteRow(dispatch: (action: any) => void, row: GlideRow): void;
  sortAction(dispatch: (action: any) => void, key: string, direction: 'asc' | 'desc'): void;
  parseCSV(file: File, project: Project): Promise<GlideCsvImport>;
  commitImport(dispatch: (action: any) => void, result: GlideCsvImport, project: Project): void;
  exportCSV(project: Project): void;
  labels: {
    infoTitle: string;
    infoCounts(rows: GlideRow[], project: Project): GlideInfoCount[];
    importTitle: string;
    importNoun: string;
    importSummary: string;
    exportNoun: string;
    goToManager(row: GlideRow): string;
  };
}

const SPARE_ROWS = 5;

export const GlideGridShell: React.FC<{
  config: GlideShellConfig;
  headerTarget?: HTMLElement | null;
  onGoToManager?: (categoryKey: string) => void;
}> = ({ config, headerTarget, onGoToManager }) => {
  const { state, dispatch, readOnly } = useProject();
  const currentDocument = useCurrentDocument();
  const project = state.present;

  const categories = useMemo(() => config.categories(project), [config, project]);
  const rows = useMemo(() => config.buildRows(project), [config, project]);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const categoriesRef = useRef(categories);
  categoriesRef.current = categories;
  const readOnlyRef = useRef(readOnly);
  readOnlyRef.current = readOnly;
  const projectRef = useRef(project);
  projectRef.current = project;

  const portalTarget = usePortalTarget();
  const gridPortalRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    gridPortalRef.current = portalTarget ? portalTarget.querySelector('#portal') : document.getElementById('portal');
  }, [portalTarget]);

  const [columnWidths, setColumnWidth] = useGlideColumnWidths(`lemon_schedule_glide_${config.widthStorageKey}_cols_${project.id}`);
  const [fontSize, setFontSizeBase] = useSpreadsheetFontSize(IS_COARSE ? 12.5 : undefined);
  const [fontVersion, setFontVersion] = useState(0);
  const setFontSize = useCallback((n: number) => { setFontSizeBase(n); setFontVersion(v => v + 1); }, [setFontSizeBase]);
  const [smoothScroll, setSmoothScroll] = useGlideSmoothScroll(IS_COARSE);
  const [keyboardMode] = useKeyboardMode();
  const hwKeyboard = useHardwareKeyboard();
  const kbLocked = IS_COARSE && !hwKeyboard && keyboardMode === 'off';

  const COLUMNS = useMemo(() => config.columnDefs.map(c => ({ ...c, width: columnWidths[c.key] ?? c.width })), [config, columnWidths]);
  const COLUMNSRef = useRef(COLUMNS);
  COLUMNSRef.current = COLUMNS;

  const glideColumns: GridColumn[] = useMemo(() => {
    const scale = fontSize / SS_FONT_SIZE_DEFAULT;
    return COLUMNS.map(c =>
      c.key === 'actions'
        ? { title: '', width: Math.round((IS_COARSE ? 48 : c.width) * scale), themeOverride: { textDark: '#ef4444' } } as GridColumn
        : { title: c.label, width: Math.round(c.width * scale) }
    );
  }, [COLUMNS, fontSize]);

  const onColumnResize = useCallback((_col: any, w: number, ci: number) => {
    const key = COLUMNSRef.current[ci]?.key;
    if (!key) return;
    const scale = fontSize / SS_FONT_SIZE_DEFAULT;
    setColumnWidth(key, Math.round(w / scale));
  }, [fontSize, setColumnWidth]);

  const [gridSelection, setGridSelection] = useState<GridSelection>({
    columns: CompactSelection.empty(),
    rows: CompactSelection.empty(),
  });
  const gridRef = useRef<DataEditorRef>(null);
  const gridSelectionRef = useRef(gridSelection);
  gridSelectionRef.current = gridSelection;

  // Full repaint when the underlying data or columns change (Glide caches cells).
  useEffect(() => {
    gridRef.current?.updateCells(
      Array.from({ length: rows.length + SPARE_ROWS }, (_, r) =>
        Array.from({ length: COLUMNS.length }, (_, c) => ({ cell: [c, r] as Item }))
      ).flat()
    );
  }, [rows, COLUMNS]);

  const categoryItems = useMemo(() => categories.map(c => ({ id: c.label, name: c.label })), [categories]);

  const glideEditors = useMemo<Record<string, GlideColumnEditor>>(() => {
    const editors: Record<string, GlideColumnEditor> = {};
    for (const c of config.columnDefs) {
      if (c.kind === 'category') {
        editors[c.key] = { kind: 'entity', mode: 'single', displayMode: 'name', items: categoryItems, placeholder: c.placeholder || c.label, keepAlphabetical: true };
      }
    }
    return editors;
  }, [config.columnDefs, categoryItems]);

  const provideEditor = useMemo(() => createGlideCellEditor({
    readOnlyRef,
    columns: COLUMNS,
    getValue: (row: number, colKey: string) => String(rowsRef.current[row]?.[colKey] ?? ''),
    editors: glideEditors,
    portalRef: gridPortalRef,
  }), [COLUMNS, glideEditors]);

  const trashImg = useRef<HTMLImageElement | null>(null);
  const plusImg = useRef<HTMLImageElement | null>(null);
  useEffect(() => {
    const trashSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>';
    const plusSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>';
    const tImg = new Image();
    tImg.src = 'data:image/svg+xml;base64,' + btoa(trashSvg);
    trashImg.current = tImg;
    const pImg = new Image();
    pImg.src = 'data:image/svg+xml;base64,' + btoa(plusSvg);
    plusImg.current = pImg;
  }, []);

  const drawCell = useCallback((args: any, draw: (a: any) => boolean) => {
    if (args.col === 0) {
      draw(args);
      if (args.row > rowsRef.current.length) return true;
      const isAddRow = args.row === rowsRef.current.length;
      const img = isAddRow ? plusImg.current : trashImg.current;
      if (img && img.complete) {
        const { ctx, rect } = args;
        const size = Math.min(14, rect.width - 4, rect.height - 4);
        const x = rect.x + (rect.width - size) / 2;
        const y = rect.y + (rect.height - size) / 2;
        ctx.drawImage(img, x, y, size, size);
      }
      return true;
    }
    return draw(args);
  }, []);

  const getCellContent = useCallback(([col, row]: Item): GridCell => {
    const colDef = COLUMNSRef.current[col];
    if (!colDef) return textCell('', { readonly: true, allowOverlay: false });
    const isAddRow = row >= rowsRef.current.length;
    if (colDef.key === 'actions') {
      return textCell('', { readonly: true, allowOverlay: false, cursor: 'pointer', themeOverride: { bgCell: isAddRow ? '#f3f4f6' : '#fef2f2' } });
    }
    if (isAddRow) {
      return textCell('', { readonly: kbLocked, themeOverride: col === 0 ? { bgCell: '#f3f4f6' } : undefined });
    }
    const r = rowsRef.current[row];
    if (!r) return textCell('', { readonly: true, allowOverlay: false });
    const raw = String(r[colDef.key] ?? '');
    return textCell(raw, {
      displayData: colDef.kind === 'category' ? r.categoryLabel : raw,
      readonly: kbLocked,
      align: colDef.align,
    });
  }, [kbLocked]);

  const commitEdit = useCallback((rowIdx: number, colKey: string, newVal: string) => {
    const r = rowsRef.current[rowIdx];
    if (!r) return;
    config.commitEdit(dispatch, r, colKey, newVal, projectRef.current);
  }, [config, dispatch]);

  const createFromAddRow = useCallback((colKey: string, val: string) => {
    config.createFromAddRow(dispatch, colKey, val, projectRef.current);
  }, [config, dispatch]);

  const dedupeCellCommit = useDedupeCellCommit();

  const onCellEdited = useCallback(([col, row]: Item, newValue: EditableGridCell) => {
    const colDef = COLUMNS[col];
    if (!colDef || colDef.key === 'actions') return;
    if (newValue.kind !== GridCellKind.Text) return;
    const isAddRow = row >= rowsRef.current.length;
    if (isAddRow) {
      if (!dedupeCellCommit(`${colDef.key}:${newValue.data}`)) return;
      createFromAddRow(colDef.key, newValue.data);
      return;
    }
    commitEdit(row, colDef.key, newValue.data);
  }, [COLUMNS, commitEdit, createFromAddRow, dedupeCellCommit]);

  const handlePaste = useCallback((target: Item, values: readonly (readonly string[])[]) => {
    if (readOnlyRef.current) return;
    const selection = gridSelectionRef.current?.current?.range ?? null;
    const plan = config.planPaste(target, values, rowsRef.current, COLUMNS, selection, projectRef.current);
    if (plan.editRows.length === 0 && plan.newRows.length === 0) return;
    config.commitPaste(dispatch, plan, rowsRef.current, projectRef.current);
    gridRef.current?.updateCells(plan.editRows.map(e => {
      const colIndex = COLUMNS.findIndex(c => c.key === e.colKey);
      return { cell: [Math.max(0, colIndex), e.row] as Item };
    }));
  }, [COLUMNS, config, dispatch]);

  const getEffectiveRange = useCallback((): { x: number; y: number; width: number; height: number } | null => {
    const sel = gridSelection.current;
    if (sel?.range) return sel.range;
    if (gridSelection.rows.length > 0) {
      const selectedRows = Array.from({ length: rows.length }, (_, i) => i).filter(i => gridSelection.rows.hasIndex(i));
      if (selectedRows.length === 0) return null;
      return { x: 0, y: selectedRows[0], width: COLUMNS.length, height: selectedRows.length };
    }
    if (gridSelection.columns.length > 0) {
      const selectedCols = Array.from({ length: COLUMNS.length }, (_, i) => i).filter(i => gridSelection.columns.hasIndex(i));
      if (selectedCols.length === 0) return null;
      return { x: selectedCols[0], y: 0, width: selectedCols.length, height: rows.length };
    }
    return null;
  }, [gridSelection, rows.length, COLUMNS.length]);

  const handleCopy = useCallback(async () => {
    const range = getEffectiveRange();
    if (!range) return;
    const text = buildCopyText(rows, COLUMNS, range);
    if (text.length > 0) await clipboardWrite(text);
    setContextMenu(null);
  }, [rows, COLUMNS, getEffectiveRange]);

  const handleCut = useCallback(async () => {
    const range = getEffectiveRange();
    if (!range) return;
    const { text, committers } = buildCutPlan(rows, COLUMNS, range);
    if (text.length > 0) {
      await clipboardWrite(text);
      dispatch({ type: 'BATCH_START' });
      for (const c of committers) {
        const colDef = COLUMNS.find(col => col.key === c.colKey);
        if (colDef?.kind === 'category') continue; // category is required — cut clears nothing there
        commitEdit(c.row, c.colKey, '');
      }
      dispatch({ type: 'BATCH_COMMIT' });
      gridRef.current?.updateCells(committers.map(c => {
        const colIndex = COLUMNS.findIndex(col => col.key === c.colKey);
        return { cell: [Math.max(0, colIndex), c.row] as Item };
      }));
    }
    setContextMenu(null);
  }, [rows, COLUMNS, commitEdit, dispatch, getEffectiveRange]);

  const getPasteTarget = useCallback((): Item | null => {
    const sel = gridSelectionRef.current;
    let cell = sel.current?.cell;
    if (!cell && sel.rows.length > 0) {
      for (let i = 0; i < rowsRef.current.length; i++) {
        if (sel.rows.hasIndex(i)) { cell = [0, i] as Item; break; }
      }
    }
    return cell ?? null;
  }, []);

  const pasteTextAtSelection = useCallback((text: string) => {
    if (readOnlyRef.current) return;
    const cell = getPasteTarget();
    if (!cell) return;
    const pastedRows = text.split(/\r\n|\n|\r/);
    handlePaste(cell, pastedRows.map(r => r.split('\t')));
  }, [getPasteTarget, handlePaste]);

  const handlePasteFromMenu = useCallback(async () => {
    const text = await clipboardRead();
    if (!text) return;
    pasteTextAtSelection(text);
    setContextMenu(null);
  }, [pasteTextAtSelection]);

  useGlidePasteInterception(pasteTextAtSelection);

  const handleClear = useCallback(() => {
    const range = getEffectiveRange();
    if (!range) return;
    dispatch({ type: 'BATCH_START' });
    const { x, y, width, height } = range;
    const damageList: { cell: Item }[] = [];
    for (let r = y; r < y + height; r++) {
      if (r >= rows.length) continue;
      for (let c = x; c < x + width; c++) {
        const colDef = COLUMNS[c];
        if (!colDef || colDef.key === 'actions' || colDef.kind === 'category' || colDef.clearable === false) continue;
        commitEdit(r, colDef.key, '');
        damageList.push({ cell: [c, r] });
      }
    }
    dispatch({ type: 'BATCH_COMMIT' });
    setTimeout(() => gridRef.current?.updateCells(damageList), 0);
    setContextMenu(null);
  }, [rows, COLUMNS, commitEdit, dispatch, getEffectiveRange]);

  const deleteSelectedRows = useCallback(() => {
    const rowsToDelete: number[] = [];
    if (gridSelectionRef.current?.current?.range) {
      const { y, height } = gridSelectionRef.current.current.range;
      for (let i = y; i < y + height; i++) rowsToDelete.push(i);
    } else {
      for (let i = 0; i < rowsRef.current.length; i++) {
        if (gridSelectionRef.current.rows.hasIndex(i)) rowsToDelete.push(i);
      }
    }
    const valid = rowsToDelete.filter(i => i < rowsRef.current.length);
    if (valid.length === 0) return;
    dispatch({ type: 'BATCH_START' });
    for (const i of valid) {
      const r = rowsRef.current[i];
      if (r) config.deleteRow(dispatch, r);
    }
    dispatch({ type: 'BATCH_COMMIT' });
    setContextMenu(null);
  }, [config, dispatch]);

  // Physical keyboard (Cmd/Ctrl+C/X/V) — same rationale as the scenes glide.
  const clipboardShortcutsRef = useRef<{ copy: () => void; cut: () => void; paste: () => void }>({ copy: () => {}, cut: () => {}, paste: () => {} });
  clipboardShortcutsRef.current = { copy: handleCopy, cut: handleCut, paste: handlePasteFromMenu };

  useEffect(() => {
    const doc = currentDocument;
    const isEditableTarget = (t: EventTarget | null) => {
      if (!(t instanceof HTMLElement)) return false;
      return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key !== 'c' && key !== 'x' && key !== 'v') return;
      if (isEditableTarget(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      const h = clipboardShortcutsRef.current;
      if (key === 'c') h.copy();
      else if (key === 'x') { if (!readOnlyRef.current) h.cut(); }
      else if (key === 'v') void h.paste();
    };
    doc.addEventListener('keydown', onKeyDown, true);
    return () => doc.removeEventListener('keydown', onKeyDown, true);
  }, [currentDocument]);

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; row: number; col?: number } | null>(null);
  const [sortMenu, setSortMenu] = useState<{ x: number; y: number; colKey: string; label: string } | null>(null);

  const onHeaderContextMenu = useCallback((colIndex: number, e: any) => {
    e.preventDefault();
    const colKey = COLUMNS[colIndex]?.key;
    if (!colKey || colKey === 'actions') return;
    const x = (e.bounds?.x ?? 0) + (e.localEventX ?? 0);
    const y = (e.bounds?.y ?? 0) + (e.localEventY ?? 0);
    setSortMenu({ x, y, colKey, label: COLUMNS[colIndex]?.label || colKey });
  }, [COLUMNS]);

  const onCellContextMenu = useCallback((cell: Item, e: any) => {
    e.preventDefault();
    const [col, row] = cell;
    if (row < 0 || row > rows.length) return;
    if (col < 0 && row < rows.length) {
      setGridSelection({
        rows: CompactSelection.fromSingleSelection(row),
        columns: CompactSelection.empty(),
        current: { cell: [1, row] as Item, range: { x: 1, y: row, width: COLUMNS.length - 1, height: 1 }, rangeStack: [] },
      });
    }
    const x = (e.bounds?.x ?? 0) + (e.localEventX ?? 0);
    const y = (e.bounds?.y ?? 0) + (e.localEventY ?? 0);
    setContextMenu({ x, y, row, col });
  }, [rows.length, COLUMNS.length]);

  const onCellClicked = useCallback((cell: Item, e: any) => {
    const [col, row] = cell;
    if (row < 0 || row > rows.length) return;
    if (row === rows.length) {
      // Clicking the add row's actions cell does nothing (the row is always editable).
      if (col === 0 && !readOnlyRef.current) gridRef.current?.focus();
      return;
    }
    if (col === 0) {
      if (readOnlyRef.current) return;
      const r = rowsRef.current[row];
      if (r) config.deleteRow(dispatch, r);
      return;
    }
    if (col < 0) {
      // Row marker: select the row (pen/touch right-click opens the context menu).
      if (isTouchLike(e.pointerType) || e.button === 2) {
        const x = (e.bounds?.x ?? 0) + (e.localEventX ?? 0);
        const y = (e.bounds?.y ?? 0) + (e.localEventY ?? 0);
        setContextMenu({ x, y, row, col });
      }
      setGridSelection({
        rows: CompactSelection.fromSingleSelection(row),
        columns: CompactSelection.empty(),
        current: { cell: [1, row] as Item, range: { x: 1, y: row, width: COLUMNS.length - 1, height: 1 }, rangeStack: [] },
      });
      gridRef.current?.focus();
    }
  }, [rows.length, COLUMNS.length, config, dispatch]);

  const hasSelection = gridSelection.current?.range !== undefined || gridSelection.rows.length > 0 || gridSelection.columns.length > 0;

  // ---- CSV import / export ---------------------------------------------------

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingImport, setPendingImport] = useState<{ result: GlideCsvImport; fileName: string } | null>(null);

  const handleCSVFile = useCallback(async (file: File) => {
    try {
      const result = await config.parseCSV(file, projectRef.current);
      if (result.count === 0) return;
      setPendingImport({ result, fileName: file.name });
    } catch (_) {
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [config]);

  const [actionsOpen, setActionsOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);

  const infoCounts = useMemo(() => config.labels.infoCounts(rows, project), [config, rows, project]);

  const headerContent = (
    <div className="flex items-center justify-end gap-1">
      <DropdownMenu open={actionsOpen} onOpenChange={setActionsOpen} width="w-52" theme="light"
        trigger={
          <button className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer select-none hover:bg-zinc-200 text-zinc-600 border border-transparent hover:border-zinc-300">
            Edit
            <ChevronDown className="w-3 h-3 shrink-0 text-zinc-500" />
          </button>
        }
      >
        <DropdownItem onClick={() => { setActionsOpen(false); fileInputRef.current?.click(); }} icon={<FileDown className="w-3.5 h-3.5" />} disabled={readOnly}>
          Import {config.labels.importTitle.replace(/^Import\s+/, '')} CSV
        </DropdownItem>
        <DropdownDivider />
        <DropdownItem onClick={() => { setActionsOpen(false); config.exportCSV(project); }} icon={<Download className="w-3.5 h-3.5" />}>
          Export {config.labels.exportNoun} to CSV
        </DropdownItem>
      </DropdownMenu>

      <DropdownMenu open={viewOpen} onOpenChange={setViewOpen} width="w-44" theme="light"
        trigger={
          <button className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer select-none hover:bg-zinc-200 text-zinc-600 border border-transparent hover:border-zinc-300">
            View
            <ChevronDown className="w-3 h-3 shrink-0 text-zinc-500" />
          </button>
        }
      >
        <DropdownItem onClick={() => { setFontSize(fontSize + 1.5); }} keepOpen icon={<ZoomIn className="w-3.5 h-3.5" />}>
          Bigger
        </DropdownItem>
        <DropdownItem onClick={() => { setFontSize(fontSize - 1.5); }} keepOpen icon={<ZoomOut className="w-3.5 h-3.5" />}>
          Smaller
        </DropdownItem>
        <DropdownDivider />
        <DropdownItem onClick={() => { setFontSize(IS_COARSE ? 12.5 : SS_FONT_SIZE_DEFAULT); }} keepOpen icon={<RotateCcw className="w-3.5 h-3.5" />}>
          Reset
        </DropdownItem>
        <DropdownDivider />
        <DropdownItem onClick={() => { setSmoothScroll(!smoothScroll); }} keepOpen icon={smoothScroll ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}>
          Smooth scroll
        </DropdownItem>
      </DropdownMenu>

      <DropdownMenu open={infoOpen} onOpenChange={setInfoOpen} width="w-48" theme="light"
        trigger={
          <button className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer select-none hover:bg-zinc-200 text-zinc-600 border border-transparent hover:border-zinc-300">
            Info
            <ChevronDown className="w-3 h-3 shrink-0 text-zinc-500" />
          </button>
        }
      >
        <div className="px-4 py-2.5 text-xs text-zinc-500 space-y-1.5">
          {infoCounts.map(ic => (
            <div key={ic.label} className="flex items-center justify-between gap-6">
              <span className="font-medium text-zinc-400 uppercase tracking-wider text-[10px]">{ic.label}</span>
              <span className="font-semibold text-zinc-800">{ic.count}</span>
            </div>
          ))}
        </div>
      </DropdownMenu>
    </div>
  );

  return (
    <div className="flex-1 flex flex-col min-h-0 w-full">
      <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void handleCSVFile(f); }} />
      {headerTarget ? createPortal(headerContent, headerTarget) : (
        <div className="flex items-center justify-end gap-1 px-3 py-1.5 border-b border-zinc-200 bg-white shrink-0">
          {headerContent}
        </div>
      )}

      {/* Grid */}
      <div style={{ flex: 1, minHeight: 0, touchAction: 'none' }}>
        <DataEditor
          key={fontVersion}
          ref={gridRef}
          columns={glideColumns}
          rows={rows.length + SPARE_ROWS}
          getCellContent={getCellContent}
          onCellEdited={onCellEdited}
          getCellsForSelection={true}
          gridSelection={gridSelection}
          onGridSelectionChange={setGridSelection}
          theme={createGlideTheme(fontSize)}
          rowHeight={Math.round(34 * fontSize / SS_FONT_SIZE_DEFAULT)}
          headerHeight={Math.round(36 * fontSize / SS_FONT_SIZE_DEFAULT)}
          onDelete={handleClear}
          onPaste={handlePaste}
          onColumnResize={onColumnResize}
          onCellContextMenu={onCellContextMenu}
          onCellClicked={onCellClicked}
          onHeaderContextMenu={onHeaderContextMenu}
          drawCell={drawCell}
          provideEditor={provideEditor}
          rowMarkers={{ kind: 'clickable-number', width: IS_COARSE ? 72 : 50, startIndex: 1, theme: { bgCell: '#fafafa', accentLight: '#e8e8ec' } }}
          freezeColumns={1}
          editOnType
          rangeSelect={IS_COARSE && !hwKeyboard ? "cell" : "rect"}
          cellActivationBehavior="double-click"
          rowSelectionMode="single"
          smoothScrollX={smoothScroll}
          smoothScrollY={smoothScroll}
          portalElementRef={gridPortalRef}
          readonly={readOnly}
          {...({ experimental: { eventTarget: currentDocument } } as any)}
        />
      </div>

      {/* Context Menu */}
      <ContextMenu open={!!contextMenu} x={contextMenu?.x ?? 0} y={contextMenu?.y ?? 0} onClose={() => setContextMenu(null)}>
        {contextMenu && contextMenu.row < rows.length && (
          <>
            <ContextMenuItem onClick={() => void handleCopy()} icon={<Copy className="w-3.5 h-3.5" />}>
              Copy
            </ContextMenuItem>
            <ContextMenuItem onClick={() => void handleCut()} icon={<Scissors className="w-3.5 h-3.5" />} disabled={readOnly}>
              Cut
            </ContextMenuItem>
            <ContextMenuItem onClick={() => void handlePasteFromMenu()} icon={<ClipboardPaste className="w-3.5 h-3.5" />} disabled={readOnly}>
              Paste
            </ContextMenuItem>
            <ContextMenuItem onClick={handleClear} icon={<Trash2 className="w-3.5 h-3.5 text-zinc-400" />} disabled={!hasSelection || readOnly}>
              Clear
            </ContextMenuItem>
            <ContextMenuDivider />
            {(() => {
              const row = rowsRef.current[contextMenu.row];
              if (!row) return null;
              return (
                <ContextMenuItem
                  onClick={() => { onGoToManager?.(row.categoryKey); setContextMenu(null); }}
                  icon={<Eye className="w-3 h-3 text-zinc-400" />}
                  disabled={!onGoToManager}
                >
                  {config.labels.goToManager(row)}
                </ContextMenuItem>
              );
            })()}
            <ContextMenuDivider />
            <ContextMenuItem onClick={deleteSelectedRows} icon={<Trash2 className="w-3.5 h-3.5" />} variant="danger">
              Delete Row{gridSelectionRef.current.rows.length > 1 ? 's' : ''}
            </ContextMenuItem>
          </>
        )}
      </ContextMenu>

      {/* Sort Context Menu */}
      <ContextMenu open={!!sortMenu} x={sortMenu?.x ?? 0} y={sortMenu?.y ?? 0} onClose={() => setSortMenu(null)}>
        {sortMenu && (
          <>
            <ContextMenuItem
              onClick={() => { config.sortAction(dispatch, sortMenu.colKey, 'asc'); setSortMenu(null); }}
              icon={<ArrowUp className="w-3 h-3 text-zinc-400" />}
              disabled={readOnly}
            >
              Sort A to Z
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => { config.sortAction(dispatch, sortMenu.colKey, 'desc'); setSortMenu(null); }}
              icon={<ArrowDown className="w-3 h-3 text-zinc-400" />}
              disabled={readOnly}
            >
              Sort Z to A
            </ContextMenuItem>
          </>
        )}
      </ContextMenu>

      {/* CSV import review */}
      {pendingImport && (
        <Modal open onClose={() => setPendingImport(null)} title={config.labels.importTitle} width="max-w-md"
          footer={
            <ModalFooter>
              <ModalFooterButton variant="ghost" onClick={() => setPendingImport(null)}>Cancel</ModalFooterButton>
              <ModalFooterButton onClick={() => { config.commitImport(dispatch, pendingImport.result, project); setPendingImport(null); }}>Import</ModalFooterButton>
            </ModalFooter>
          }
        >
          <div className="p-6 space-y-4">
            <p className="text-xs text-zinc-400 leading-relaxed">
              <span className="text-zinc-200 font-semibold">{pendingImport.result.count}</span> {config.labels.importNoun} in <span className="text-zinc-200 font-semibold">{pendingImport.fileName}</span>. {config.labels.importSummary}
            </p>
            {pendingImport.result.newCategories.length > 0 && (
              <div>
                <h4 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
                  {pendingImport.result.newCategories.length} new {pendingImport.result.newCategories.length === 1 ? 'category' : 'categories'}
                </h4>
                <div className="flex flex-wrap gap-1">
                  {pendingImport.result.newCategories.map(c => (
                    <span key={c.key} className="text-[11px] bg-zinc-800 border border-zinc-700 rounded px-2 py-0.5 text-zinc-300">{c.label}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
};

/** Default category-aware paste planner — the common case for category DBs. */
export function buildCategoryPastePlan<R extends GlidePasteNewRow>(
  target: Item,
  values: readonly (readonly string[])[],
  rows: GlideRow[],
  columns: PasteColumn[],
  selection: PasteRange | null | undefined,
  buildNewRow: (raw: Record<string, string>) => R,
): GlidePastePlan {
  const plan = planGridPaste<R>(target, values, rows.length, columns, selection, buildNewRow);
  return { editRows: plan.editRows, newRows: plan.newRows };
}
