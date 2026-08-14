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
import { useProject, useIsCloudProject } from '../store';
import { generateUUID, clipboardWrite, clipboardRead } from '../lib/utils';
import { ChevronDown, FileDown, Download, ZoomIn, ZoomOut, RotateCcw, CheckSquare, Square, Copy, Scissors, ClipboardPaste, Trash2 } from 'lucide-react';
import { ContextMenu, ContextMenuItem, ContextMenuDivider } from './ContextMenu';
import DropdownMenu from './DropdownMenu';
import DropdownItem from './DropdownItem';
import DropdownDivider from './DropdownDivider';
import { useSpreadsheetFontSize, SS_FONT_SIZE_DEFAULT, useGlideSmoothScroll, useKeyboardMode } from '../lib/persist';
import { IS_COARSE, useHardwareKeyboard, isTouchLike } from '../lib/device';
import { createGlideTheme } from '../lib/glideTheme';
import { usePortalTarget, useCurrentDocument } from '../lib/popoutTarget';
import { textCell, buildCopyText, buildCutPlan } from '../lib/glideCells';
import { createGlideCellEditor, type GlideColumnEditor } from '../lib/glideEditor';
import { useGlidePasteInterception } from '../lib/glidePasteIntercept';
import { useGlideColumnWidths } from '../lib/glideColumns';
import { buildCrewRows, resolveRoleKey, planCrewPaste, parseCrewCSV, commitCrewImport, exportCrewCSV } from '../lib/crewGlide';
import Modal, { ModalFooter } from './Modal';

const CREW_COLUMN_DEFS = [
  { key: 'actions', label: '', width: IS_COARSE ? 48 : 36 },
  { key: 'role', label: 'Role', width: 160 },
  { key: 'name', label: 'Name', width: 200 },
  { key: 'phone', label: 'Phone', width: 130 },
  { key: 'email', label: 'Email', width: 220 },
];

const SPARE_ROWS = 5;

export function CrewGlideTab({ headerTarget }: { headerTarget?: HTMLElement | null }) {
  const { state, dispatch, readOnly } = useProject();
  const isCloud = useIsCloudProject();
  const currentDocument = useCurrentDocument();
  const project = state.present;

  const crewRoles = project.crewRoles || [];
  const crew = project.crew || {};

  const crewRows = useMemo(() => buildCrewRows(crewRoles, crew), [crewRoles, crew]);
  const crewRowsRef = useRef(crewRows);
  crewRowsRef.current = crewRows;
  const crewRolesRef = useRef(crewRoles);
  crewRolesRef.current = crewRoles;
  const readOnlyRef = useRef(readOnly);
  readOnlyRef.current = readOnly;

  const portalTarget = usePortalTarget();
  const gridPortalRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    gridPortalRef.current = portalTarget ? portalTarget.querySelector('#portal') : document.getElementById('portal');
  }, [portalTarget]);

  const [columnWidths, setColumnWidth] = useGlideColumnWidths(`lemon_schedule_glide_crew_cols_${project.id}`);
  const [fontSize, setFontSizeBase] = useSpreadsheetFontSize(IS_COARSE ? 12.5 : undefined);
  const [fontVersion, setFontVersion] = useState(0);
  const setFontSize = useCallback((n: number) => { setFontSizeBase(n); setFontVersion(v => v + 1); }, [setFontSizeBase]);
  const [smoothScroll, setSmoothScroll] = useGlideSmoothScroll(IS_COARSE);
  const [keyboardMode] = useKeyboardMode();
  const hwKeyboard = useHardwareKeyboard();
  const kbLocked = IS_COARSE && !hwKeyboard && keyboardMode === 'off';

  const COLUMNS = useMemo(() => CREW_COLUMN_DEFS.map(c => ({ ...c, width: columnWidths[c.key] ?? c.width })), [columnWidths]);
  const COLUMNSRef = useRef(COLUMNS);
  COLUMNSRef.current = COLUMNS;

  const glideColumns: GridColumn[] = useMemo(() => {
    const scale = fontSize / SS_FONT_SIZE_DEFAULT;
    return COLUMNS.map(c =>
      c.key === 'actions'
        ? { title: '', width: Math.round(c.width * scale), themeOverride: { textDark: '#ef4444' } } as GridColumn
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
      Array.from({ length: crewRows.length + SPARE_ROWS }, (_, r) =>
        Array.from({ length: COLUMNS.length }, (_, c) => ({ cell: [c, r] as Item }))
      ).flat()
    );
  }, [crewRows, COLUMNS]);

  const roleItems = useMemo(() => crewRoles.map(r => ({ id: r.label, name: r.label })), [crewRoles]);

  const glideEditors = useMemo<Record<string, GlideColumnEditor>>(() => ({
    role: { kind: 'entity', mode: 'single', displayMode: 'name', items: roleItems, placeholder: 'Role', keepAlphabetical: true },
  }), [roleItems]);

  const provideEditor = useMemo(() => createGlideCellEditor({
    readOnlyRef,
    columns: COLUMNS,
    getValue: (row: number, colKey: string) => String(crewRowsRef.current[row]?.[colKey] ?? ''),
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
      if (args.row > crewRowsRef.current.length) return true;
      const isAddRow = args.row === crewRowsRef.current.length;
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
    const isAddRow = row >= crewRowsRef.current.length;
    if (colDef.key === 'actions') {
      return textCell('', { readonly: true, allowOverlay: false, cursor: 'pointer', themeOverride: { bgCell: isAddRow ? '#f3f4f6' : '#fef2f2' } });
    }
    if (isAddRow) {
      return textCell('', { readonly: kbLocked, themeOverride: col === 0 ? { bgCell: '#f3f4f6' } : undefined });
    }
    const r = crewRowsRef.current[row];
    if (!r) return textCell('', { readonly: true, allowOverlay: false });
    const raw = String((r as any)[colDef.key] ?? '');
    return textCell(raw, {
      displayData: colDef.key === 'role' ? r.role : raw,
      readonly: kbLocked,
      align: colDef.key === 'phone' ? 'right' : 'left',
    });
  }, [kbLocked]);

  /** Moves a person to another role (creating the role first if needed) or patches a field. */
  const commitEdit = useCallback((rowIdx: number, colKey: string, newVal: string) => {
    const r = crewRowsRef.current[rowIdx];
    if (!r) return;
    if (colKey === 'role') {
      const key = resolveRoleKey(newVal, crewRolesRef.current);
      if (!key || key === r.roleKey) return;
      if (!crewRolesRef.current.some(x => x.key === key)) {
        dispatch({ type: 'BATCH_START' });
        dispatch({ type: 'ADD_CREW_ROLE', payload: { role: { key, label: newVal.trim() } } });
        dispatch({ type: 'UPDATE_CREW_PERSON', payload: { role: r.roleKey, id: r.id, updates: {}, toRole: key } });
        dispatch({ type: 'BATCH_COMMIT' });
      } else {
        dispatch({ type: 'UPDATE_CREW_PERSON', payload: { role: r.roleKey, id: r.id, updates: {}, toRole: key } });
      }
      return;
    }
    dispatch({ type: 'UPDATE_CREW_PERSON', payload: { role: r.roleKey, id: r.id, updates: { [colKey]: newVal } } });
  }, [dispatch]);

  const createPersonFromAddRow = useCallback((colKey: string, val: string) => {
    let roleKey: string | null = null;
    let newRoleLabel = '';
    if (colKey === 'role') {
      roleKey = resolveRoleKey(val, crewRolesRef.current);
      newRoleLabel = val.trim();
    } else {
      roleKey = crewRolesRef.current[0]?.key || null;
    }
    if (!roleKey) return;
    dispatch({ type: 'BATCH_START' });
    if (!crewRolesRef.current.some(x => x.key === roleKey)) {
      dispatch({ type: 'ADD_CREW_ROLE', payload: { role: { key: roleKey, label: newRoleLabel || roleKey } } });
    }
    dispatch({
      type: 'ADD_CREW_PERSON',
      payload: {
        role: roleKey,
        person: {
          id: generateUUID(),
          name: colKey === 'name' ? val : '',
          phone: colKey === 'phone' ? val : '',
          email: colKey === 'email' ? val : '',
        },
      },
    });
    dispatch({ type: 'BATCH_COMMIT' });
  }, [dispatch]);

  const onCellEdited = useCallback(([col, row]: Item, newValue: EditableGridCell) => {
    const colDef = COLUMNS[col];
    if (!colDef || colDef.key === 'actions') return;
    if (newValue.kind !== GridCellKind.Text) return;
    const isAddRow = row >= crewRowsRef.current.length;
    if (isAddRow) {
      createPersonFromAddRow(colDef.key, newValue.data);
      return;
    }
    commitEdit(row, colDef.key, newValue.data);
  }, [COLUMNS, commitEdit, createPersonFromAddRow]);

  const handlePaste = useCallback((target: Item, values: readonly (readonly string[])[]) => {
    if (readOnlyRef.current) return;
    const selection = gridSelectionRef.current?.current?.range ?? null;
    const plan = planCrewPaste(target, values, crewRowsRef.current, COLUMNS, selection, crewRolesRef.current);
    if (plan.editRows.length === 0 && plan.newRows.length === 0) return;
    dispatch({ type: 'BATCH_START' });
    const newRoleKeys = new Set<string>();
    for (const nr of plan.newRows) {
      if (nr.roleKey && !crewRolesRef.current.some(x => x.key === nr.roleKey) && !newRoleKeys.has(nr.roleKey)) {
        newRoleKeys.add(nr.roleKey);
        dispatch({ type: 'ADD_CREW_ROLE', payload: { role: { key: nr.roleKey, label: nr.roleLabel || nr.roleKey } } });
      }
    }
    for (const nr of plan.newRows) {
      if (!nr.roleKey) continue;
      dispatch({
        type: 'ADD_CREW_PERSON',
        payload: { role: nr.roleKey, person: { id: generateUUID(), name: nr.name, phone: nr.phone, email: nr.email } },
      });
    }
    for (const e of plan.editRows) commitEdit(e.row, e.colKey, e.val);
    dispatch({ type: 'BATCH_COMMIT' });
    gridRef.current?.updateCells(plan.editRows.map(e => {
      const colIndex = COLUMNS.findIndex(c => c.key === e.colKey);
      return { cell: [Math.max(0, colIndex), e.row] as Item };
    }));
  }, [COLUMNS, commitEdit, dispatch]);

  const getEffectiveRange = useCallback((): { x: number; y: number; width: number; height: number } | null => {
    const sel = gridSelection.current;
    if (sel?.range) return sel.range;
    if (gridSelection.rows.length > 0) {
      const selectedRows = Array.from({ length: crewRows.length }, (_, i) => i).filter(i => gridSelection.rows.hasIndex(i));
      if (selectedRows.length === 0) return null;
      return { x: 0, y: selectedRows[0], width: COLUMNS.length, height: selectedRows.length };
    }
    if (gridSelection.columns.length > 0) {
      const selectedCols = Array.from({ length: COLUMNS.length }, (_, i) => i).filter(i => gridSelection.columns.hasIndex(i));
      if (selectedCols.length === 0) return null;
      return { x: selectedCols[0], y: 0, width: selectedCols.length, height: crewRows.length };
    }
    return null;
  }, [gridSelection, crewRows.length, COLUMNS.length]);

  const handleCopy = useCallback(async () => {
    const range = getEffectiveRange();
    if (!range) return;
    const text = buildCopyText(crewRows, COLUMNS, range);
    if (text.length > 0) await clipboardWrite(text);
    setContextMenu(null);
  }, [crewRows, COLUMNS, getEffectiveRange]);

  const handleCut = useCallback(async () => {
    const range = getEffectiveRange();
    if (!range) return;
    const { text, committers } = buildCutPlan(crewRows, COLUMNS, range);
    if (text.length > 0) {
      await clipboardWrite(text);
      dispatch({ type: 'BATCH_START' });
      for (const c of committers) {
        if (c.colKey === 'role') continue; // role is required — cut clears nothing there
        commitEdit(c.row, c.colKey, '');
      }
      dispatch({ type: 'BATCH_COMMIT' });
      gridRef.current?.updateCells(committers.map(c => {
        const colIndex = COLUMNS.findIndex(col => col.key === c.colKey);
        return { cell: [Math.max(0, colIndex), c.row] as Item };
      }));
    }
    setContextMenu(null);
  }, [crewRows, COLUMNS, commitEdit, dispatch, getEffectiveRange]);

  const getPasteTarget = useCallback((): Item | null => {
    const sel = gridSelectionRef.current;
    let cell = sel.current?.cell;
    if (!cell && sel.rows.length > 0) {
      for (let i = 0; i < crewRowsRef.current.length; i++) {
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
      if (r >= crewRows.length) continue;
      for (let c = x; c < x + width; c++) {
        const key = COLUMNS[c]?.key;
        if (!key || key === 'actions' || key === 'role') continue;
        commitEdit(r, key, '');
        damageList.push({ cell: [c, r] });
      }
    }
    dispatch({ type: 'BATCH_COMMIT' });
    setTimeout(() => gridRef.current?.updateCells(damageList), 0);
    setContextMenu(null);
  }, [crewRows, COLUMNS, commitEdit, dispatch, getEffectiveRange]);

  const deleteSelectedRows = useCallback(() => {
    const rowsToDelete: number[] = [];
    if (gridSelectionRef.current?.current?.range) {
      const { y, height } = gridSelectionRef.current.current.range;
      for (let i = y; i < y + height; i++) rowsToDelete.push(i);
    } else {
      for (let i = 0; i < crewRowsRef.current.length; i++) {
        if (gridSelectionRef.current.rows.hasIndex(i)) rowsToDelete.push(i);
      }
    }
    const valid = rowsToDelete.filter(i => i < crewRowsRef.current.length);
    if (valid.length === 0) return;
    dispatch({ type: 'BATCH_START' });
    for (const i of valid) {
      const r = crewRowsRef.current[i];
      if (r) dispatch({ type: 'DELETE_CREW_PERSON', payload: { role: r.roleKey, id: r.id } });
    }
    dispatch({ type: 'BATCH_COMMIT' });
    setContextMenu(null);
  }, [dispatch]);

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

  const onCellContextMenu = useCallback((cell: Item, e: any) => {
    e.preventDefault();
    const [col, row] = cell;
    if (row < 0 || row > crewRows.length) return;
    if (col < 0 && row < crewRows.length) {
      setGridSelection({
        rows: CompactSelection.fromSingleSelection(row),
        columns: CompactSelection.empty(),
        current: { cell: [1, row] as Item, range: { x: 1, y: row, width: COLUMNS.length - 1, height: 1 }, rangeStack: [] },
      });
    }
    const x = (e.bounds?.x ?? 0) + (e.localEventX ?? 0);
    const y = (e.bounds?.y ?? 0) + (e.localEventY ?? 0);
    setContextMenu({ x, y, row, col });
  }, [crewRows.length, COLUMNS.length]);

  const onCellClicked = useCallback((cell: Item, e: any) => {
    const [col, row] = cell;
    if (row < 0 || row > crewRows.length) return;
    if (row === crewRows.length) {
      // Clicking the add row's actions cell does nothing (the row is always editable).
      if (col === 0 && !readOnlyRef.current) gridRef.current?.focus();
      return;
    }
    if (col === 0) {
      if (readOnlyRef.current) return;
      const r = crewRowsRef.current[row];
      if (r) dispatch({ type: 'DELETE_CREW_PERSON', payload: { role: r.roleKey, id: r.id } });
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
  }, [crewRows.length, COLUMNS.length, dispatch]);

  const hasSelection = gridSelection.current?.range !== undefined || gridSelection.rows.length > 0 || gridSelection.columns.length > 0;

  // ---- CSV import / export ---------------------------------------------------

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingImport, setPendingImport] = useState<{ result: Awaited<ReturnType<typeof parseCrewCSV>>; fileName: string } | null>(null);

  const handleCSVFile = useCallback(async (file: File) => {
    try {
      const result = await parseCrewCSV(file, crewRolesRef.current);
      if (result.people.length === 0) return;
      setPendingImport({ result, fileName: file.name });
    } catch (_) {
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, []);

  const [actionsOpen, setActionsOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);

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
          Import Crew CSV
        </DropdownItem>
        <DropdownDivider />
        <DropdownItem onClick={() => { setActionsOpen(false); exportCrewCSV(project); }} icon={<Download className="w-3.5 h-3.5" />}>
          Export Crew to CSV
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
          <div className="flex items-center justify-between gap-6">
            <span className="font-medium text-zinc-400 uppercase tracking-wider text-[10px]">Members</span>
            <span className="font-semibold text-zinc-800">{crewRows.length}</span>
          </div>
          <div className="flex items-center justify-between gap-6">
            <span className="font-medium text-zinc-400 uppercase tracking-wider text-[10px]">Roles</span>
            <span className="font-semibold text-zinc-800">{crewRoles.length}</span>
          </div>
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
          rows={crewRows.length + SPARE_ROWS}
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
        {contextMenu && contextMenu.row < crewRows.length && (
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
            <ContextMenuItem onClick={deleteSelectedRows} icon={<Trash2 className="w-3.5 h-3.5" />} variant="danger">
              Delete Row{gridSelectionRef.current.rows.length > 1 ? 's' : ''}
            </ContextMenuItem>
          </>
        )}
      </ContextMenu>

      {/* CSV import review */}
      {pendingImport && (
        <Modal open onClose={() => setPendingImport(null)} title="Import Crew CSV" width="max-w-md"
          footer={
            <ModalFooter>
              <button onClick={() => setPendingImport(null)} className="px-6 py-2 text-zinc-400 text-xs font-medium rounded-lg hover:bg-zinc-800 hover:text-zinc-200 transition-colors">Cancel</button>
              <button onClick={() => { commitCrewImport(dispatch, pendingImport.result, crewRolesRef.current, crew); setPendingImport(null); }} className="px-6 py-2 bg-zinc-800 text-white text-xs font-semibold rounded-lg border border-zinc-700 hover:bg-zinc-700 transition-colors">Import</button>
            </ModalFooter>
          }
        >
          <div className="p-6 space-y-4">
            <p className="text-xs text-zinc-400 leading-relaxed">
              <span className="text-zinc-200 font-semibold">{pendingImport.result.people.length}</span> crew members in <span className="text-zinc-200 font-semibold">{pendingImport.fileName}</span>. Members matching an existing role + name have their phone/email updated (non-empty values only); everyone else is added.
            </p>
            {pendingImport.result.newRoles.length > 0 && (
              <div>
                <h4 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
                  {pendingImport.result.newRoles.length} new {pendingImport.result.newRoles.length === 1 ? 'role' : 'roles'}
                </h4>
                <div className="flex flex-wrap gap-1">
                  {pendingImport.result.newRoles.map(r => (
                    <span key={r.key} className="text-[11px] bg-zinc-800 border border-zinc-700 rounded px-2 py-0.5 text-zinc-300">{r.label}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
