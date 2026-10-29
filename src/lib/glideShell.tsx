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
import { ChevronDown, FileUp, Download, ZoomIn, ZoomOut, RotateCcw, CheckSquare, Square, Copy, Scissors, ClipboardPaste, Trash2, ArrowUp, ArrowDown, Eye, Info } from 'lucide-react';
import { ContextMenu, ContextMenuItem, ContextMenuDivider } from '../components/ContextMenu';
import DropdownMenu from '../components/DropdownMenu';
import DropdownItem from '../components/DropdownItem';
import DropdownDivider from '../components/DropdownDivider';
import Modal, { ModalFooter } from '../components/Modal';
import ModalFooterButton from '../components/ModalFooterButton';
import { useDialog } from '../components/Dialog';
import { useSpreadsheetFontSize, SS_FONT_SIZE_DEFAULT, useGlideSmoothScroll, useKeyboardMode } from './persist';import { IS_COARSE, useHardwareKeyboard, isTouchLike } from './device';
import { createGlideTheme } from './glideTheme';
import { usePortalTarget, useCurrentDocument } from './popoutTarget';
import { textCell, buildCopyText, buildCutPlan } from './glideCells';
import { createGlideCellEditor, type GlideColumnEditor, type GlideEditorOptions } from './glideEditor';
import { useGlidePasteInterception } from './glidePasteIntercept';
import { useGlideColumnWidths } from './glideColumns';
import { useDedupeCellCommit } from './glideEditGuard';
import { planGridPaste, type PasteEdit, type PasteColumn, type PasteRange } from './glidePaste';
import { useGlideFill } from './glideFill';
import { useGlidePeerSelection } from './useGlidePeerSelection';
import { registerPresenceGridScope, type PresenceGridScope } from './presenceResolvers';
import { useFollowView } from './supabase/useFollowView';
import type { AppPlace } from './appNav';
import { effectiveGridRange } from './glideSelection';
import Button from '../components/Button';
import { revealMenuTrigger } from '../components/revealMenuTrigger';
import { GlideFilter } from '../components/GlideFilter';
import {
  kitGlyphCell,
  controlCellRenderers,
  isControlCell,
  isKitGlyphCell,
  isKitGlyphGroupCell,
  pressControlCell,
} from '@gabriel/ui-kit/glide-controls';
import { filterGlideRows } from './glideFilter';
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
  /** Comma-list column: a range fill replaces each row's whole list, so it
   *  confirms first (roadmap 144). */
  multiValue?: boolean;
  /** Item 147 — when present, the column edits as a multi-select entity
   *  dropdown over these items (labels); the committed value stays the
   *  comma-joined label list. */
  entityItems?: (project: Project) => { id: string; name: string }[];
  /** Text columns: force typed values UPPERCASE live (e.g. crew names). */
  uppercase?: boolean;
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
  /** Accordion group (crew role department). Categories without a group open
   *  as a flat list. */
  group?: string;
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
  /** Presence scope (roadmap 234): the stable id of this logical grid shared
   *  by every client (`crew-glide`, `locations-glide`) — peer selections
   *  publish/render per instance under it. */
  presenceScope: string;
  /** Follow place (roadmap 229/172): the App place this grid is the view of,
   *  so the row filter mirrors while following. */
  followPlace: Pick<AppPlace, 'tab' | 'sub' | 'mode'>;
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
  /** Optional extra header actions (item 148 — Crew Glide → Links). */
  renderHeaderActions?: (ctx: { dispatch: (action: any) => void; readOnly: boolean; project: Project }) => React.ReactNode;
}


export const GlideGridShell: React.FC<{
  config: GlideShellConfig;
  headerTarget?: HTMLElement | null;
  onGoToManager?: (categoryKey: string) => void;
}> = ({ config, headerTarget, onGoToManager }) => {
  const { state, dispatch, locked } = useProject();
  const currentDocument = useCurrentDocument();
  const project = state.present;

  const categories = useMemo(() => config.categories(project), [config, project]);
  const allRows = useMemo(() => config.buildRows(project), [config, project]);
  /** Roadmap 172 — the grid indexes THIS list everywhere; filtering is
   *  display-only, so `allRows` still feeds the Info counts and the project
   *  itself is never rewritten. */
  const [filterQuery, setFilterQuery] = useState('');
  const rows = useMemo(
    () => filterGlideRows(allRows, filterQuery, row =>
      config.columnDefs
        .filter(c => c.key !== 'actions')
        .map(c => (c.kind === 'category' ? row.categoryLabel : String(row[c.key] ?? '')))
    ),
    [allRows, filterQuery, config.columnDefs],
  );
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  // The row filter is view state, not project data: a follower mirrors the
  // leader's query through the shared follow seam. Typing your own filter does
  // NOT end follow (same rule as scrolling) — the leader's next view sync wins.
  const filterRef = useRef(filterQuery);
  filterRef.current = filterQuery;
  useFollowView({
    place: config.followPlace,
    fields: [{ key: 'glideFilter', value: filterQuery }],
    apply: view => {
      const next = view.glideFilter ?? '';
      if (next === filterRef.current) return;
      setFilterQuery(next);
    },
  });
  const categoriesRef = useRef(categories);
  categoriesRef.current = categories;
  const readOnlyRef = useRef(locked);
  readOnlyRef.current = locked;
  const projectRef = useRef(project);
  projectRef.current = project;

  const portalTarget = usePortalTarget();
  const gridPortalRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    gridPortalRef.current = portalTarget ? portalTarget.querySelector('#portal') : document.getElementById('portal');
  }, [portalTarget]);

  // glide sizes to its CONTENT when width/height are omitted — a sparse grid
  // would shrink instead of filling the container. Measure the wrapper and
  // hand the size back to the DataEditor explicitly.
  const { ref: gridSizeRef, width: gridWidth, height: gridHeight } = useGlideFill<HTMLDivElement>();

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
    const firstEditable = COLUMNS.find(c => c.key !== 'actions')?.key;
    return COLUMNS.map(c => {
      const base = { title: c.label, width: Math.round(c.width * scale) };
      if (c.key === 'actions') {
        // The trailing add row must not sit in the trash column.
        return { ...base, title: '', themeOverride: { textDark: '#ef4444' }, trailingRowOptions: { disabled: true } } as GridColumn;
      }
      if (c.key === firstEditable) {
        return { ...base, trailingRowOptions: { hint: 'Add' } } as GridColumn;
      }
      return base as GridColumn;
    });
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

  // Row indices change when the filter changes — drop the selection instead of
  // leaving it pointing at different records.
  useEffect(() => {
    setGridSelection({ columns: CompactSelection.empty(), rows: CompactSelection.empty() });
  }, [filterQuery]);

  // Peer selections (roadmap 234) — every mounted instance publishes its own
  // selection and paints the peers' ones under `config.presenceScope`.
  const presenceRowKeys = useMemo(() => rows.map(r => r.key), [rows]);
  const presenceColKeys = useMemo(() => COLUMNS.map(c => c.key), [COLUMNS]);
  const peerHighlights = useGlidePeerSelection({
    scope: config.presenceScope,
    selection: gridSelection,
    rowKeys: presenceRowKeys,
    colKeys: presenceColKeys,
  });

  // Live-pointer grid scope (roadmap 236): the pointer chain probes THIS grid
  // (same recipe as InlineGlideTable / the Glide Breakdown) and the receiver
  // locates the cell with its own scroll and column widths.
  useEffect(() => {
    const scope: PresenceGridScope = {
      probe: (x, y) => {
        const args = gridRef.current?.getMouseArgsForPosition(x, y);
        if (!args || args.kind !== 'cell') return null;
        const [col, row] = args.location;
        const r = rowsRef.current[row];
        const colDef = COLUMNSRef.current[col];
        if (!r || !colDef) return null;
        const { x: bx, y: by, width: bw, height: bh } = args.bounds;
        const fx = bw > 0 ? Math.min(Math.max((x - bx) / bw, 0), 1) : 0.5;
        const fy = bh > 0 ? Math.min(Math.max((y - by) / bh, 0), 1) : 0.5;
        return { rowKey: r.key, colKey: colDef.key, rowIndex: row, colIndex: col, fx, fy };
      },
      locate: ({ rowKey, colKey, rowIndex, colIndex }) => {
        const rows = rowsRef.current;
        const cols = COLUMNSRef.current;
        if (rows.length === 0 || cols.length === 0) return null;
        const ri = rows.findIndex(r => r.key === rowKey);
        // Filtered out / deleted: hide the peer highlight rather than paint it
        // over an unrelated visible row.
        if (ri < 0) return null;
        let ci = cols.findIndex(c => c.key === colKey);
        if (ci < 0) ci = Math.min(Math.max(colIndex, 0), cols.length - 1);
        const rect = gridRef.current?.getBounds(ci, ri);
        if (!rect) return null;
        // A cell scrolled out of the grid's own visible area must NOT paint a
        // pointer over unrelated chrome — hide it (hide-don't-fake).
        const container = gridSizeRef.current;
        if (container) {
          const cb = container.getBoundingClientRect();
          const overlapX = Math.min(rect.x + rect.width, cb.right) - Math.max(rect.x, cb.left);
          const overlapY = Math.min(rect.y + rect.height, cb.bottom) - Math.max(rect.y, cb.top);
          if (overlapX < 6 || overlapY < 6) return null;
        }
        return { left: rect.x, top: rect.y, width: rect.width, height: rect.height };
      },
    };
    return registerPresenceGridScope(config.presenceScope, scope);
  }, [config.presenceScope]);

  // Full repaint when the underlying data or columns change (Glide caches cells).
  useEffect(() => {
    gridRef.current?.updateCells(
      Array.from({ length: rows.length + 1 }, (_, r) =>
        Array.from({ length: COLUMNS.length }, (_, c) => ({ cell: [c, r] as Item }))
      ).flat()
    );
  }, [rows, COLUMNS]);

  const categoryItems = useMemo(
    () => categories.map(c => ({ id: c.label, name: c.label, group: c.group })),
    [categories],
  );

  const glideEditors = useMemo<Record<string, GlideColumnEditor>>(() => {
    const editors: Record<string, GlideColumnEditor> = {};
    for (const c of config.columnDefs) {
      if (c.kind === 'category') {
        // Crew roles are grouped by department → accordion picker. Flat
        // categories (location types) stay open.
        editors[c.key] = {
          kind: 'entity',
          mode: 'single',
          displayMode: 'name',
          items: categoryItems,
          placeholder: c.placeholder || c.label,
          keepAlphabetical: true,
          browse: categoryItems.some(i => i.group) ? 'accordion' : 'open',
        };
      } else if (c.entityItems) {
        // Item 147 — multi-select autocomplete (e.g. a crew role's element
        // categories). Committed value = the comma-joined label list. The
        // catalogue is fixed: no "Add …" create row.
        editors[c.key] = { kind: 'entity', mode: 'multi', displayMode: 'name', items: c.entityItems(project), placeholder: c.placeholder || c.label, allowFreeText: false };
      } else if (c.uppercase) {
        editors[c.key] = { kind: 'text', uppercase: true, placeholder: c.placeholder || c.label };
      }
    }
    return editors;
  }, [config.columnDefs, categoryItems, project]);

  // ONE stable provideEditor for the grid's lifetime — the current config
  // travels through a ref, so re-renders can never recreate the editor
  // components and remount an open overlay (in-progress typing survives).
  const editorOptsRef = useRef<GlideEditorOptions | null>(null);
  editorOptsRef.current = {
    readOnlyRef,
    columns: COLUMNS,
    getValue: (row: number, colKey: string) => String(rowsRef.current[row]?.[colKey] ?? ''),
    editors: glideEditors,
    portalRef: gridPortalRef,
  };
  const provideEditor = useMemo(() => createGlideCellEditor(() => editorOptsRef.current), []);

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
    if (row >= rowsRef.current.length) {
      // The trailing add row is painted by Glide, not a data cell.
      return textCell('', { readonly: true, allowOverlay: false });
    }
    if (colDef.key === 'actions') {
      if (readOnlyRef.current) return textCell('', { readonly: true, allowOverlay: false });
      const r = rowsRef.current[row];
      const label = r ? (r.categoryLabel || r.key) : String(row + 1);
      return kitGlyphCell({
        icon: 'trash',
        label: `Delete ${label}`,
        tone: 'danger',
        lane: 'full',
        onActivate: () => { if (r) config.deleteRow(dispatch, r); },
      });
    }
    const r = rowsRef.current[row];
    if (!r) return textCell('', { readonly: true, allowOverlay: false });
    const raw = String(r[colDef.key] ?? '');
    return textCell(raw, {
      displayData: colDef.kind === 'category' ? r.categoryLabel : raw,
      readonly: kbLocked,
      align: colDef.align,
    });
  }, [kbLocked, config, dispatch]);

  const commitEdit = useCallback((rowIdx: number, colKey: string, newVal: string) => {
    const r = rowsRef.current[rowIdx];
    if (!r) return;
    config.commitEdit(dispatch, r, colKey, newVal, projectRef.current);
  }, [config, dispatch]);

  /** Trailing add-row button: append a blank row; Glide opens the clicked
   *  cell on the new row (same native flow as the Breakdown/playground). */
  const addRow = useCallback(() => {
    const firstKey = config.columnDefs.find(c => c.key !== 'actions')?.key;
    if (firstKey) config.createFromAddRow(dispatch, firstKey, '', projectRef.current);
  }, [config, dispatch]);

  const dedupeCellCommit = useDedupeCellCommit();
  const dialog = useDialog();

  const onCellEdited = useCallback(([col, row]: Item, newValue: EditableGridCell) => {
    const colDef = COLUMNS[col];
    if (!colDef || colDef.key === 'actions') return;
    if (newValue.kind !== GridCellKind.Text) return;
    if (row >= rowsRef.current.length) return;
    // Range fill (roadmap 139/144): a single edit committed while a multi-cell
    // selection is active writes that value down the SAME column — VERTICAL
    // only, since flat DBs mix column kinds (a Role never leaks into Phone).
    // The add row is exempt; one batch = one undo entry.
    const range = gridSelectionRef.current?.current?.range;
    if (range && range.height > 1 && col >= range.x && col < range.x + range.width) {
      const fillRows: number[] = [];
      for (let r = range.y; r < range.y + range.height; r++) {
        if (r < rowsRef.current.length) fillRows.push(r);
      }
      if (fillRows.length > 1) {
        const run = () => {
          dispatch({ type: 'BATCH_START' });
          for (const r of fillRows) commitEdit(r, colDef.key, newValue.data);
          dispatch({ type: 'BATCH_COMMIT' });
        };
        // A comma-list column replaces every selected row's list — confirm
        // before nuking them. Cancel keeps the edit on just the edited row.
        if (colDef.multiValue) {
          void dialog.confirm({
            title: `Replace ${colDef.label} in ${fillRows.length} rows?`,
            message: `This replaces the existing ${colDef.label} in ${fillRows.length} rows with “${newValue.data}”.`,
            danger: true,
          }).then(ok => { if (ok) run(); else commitEdit(row, colDef.key, newValue.data); });
        } else {
          run();
        }
        return;
      }
    }
    commitEdit(row, colDef.key, newValue.data);
  }, [COLUMNS, commitEdit, dedupeCellCommit, dispatch, dialog]);

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

  const getEffectiveRange = useCallback((): { x: number; y: number; width: number; height: number } | null =>
    effectiveGridRange(gridSelection, rows.length, COLUMNS.length),
  [gridSelection, rows.length, COLUMNS.length]);

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
    if (col >= 0 && row < rows.length) {
      // Painted control cells own their clicks; repaint for the press flash.
      const content = getCellContent(cell);
      if (isControlCell(content)) requestAnimationFrame(() => gridRef.current?.updateCells([{ cell }]));
      return;
    }
    if (row === rows.length) return;
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
  }, [rows.length, COLUMNS.length, getCellContent]);

  /** Enter/Space on a painted row action fires it once. */
  const onCellActivated = useCallback((cell: Item) => {
    const content = getCellContent(cell);
    const button = isKitGlyphGroupCell(content)
      ? content.data.buttons[0]
      : isKitGlyphCell(content)
        ? content.data
        : undefined;
    if (!button) return;
    pressControlCell(cell, button.label);
    button.onActivate?.();
    requestAnimationFrame(() => gridRef.current?.updateCells([{ cell }]));
  }, [getCellContent]);

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

  const infoCounts = useMemo(() => config.labels.infoCounts(allRows, project), [config, allRows, project]);
  const headerActions = config.renderHeaderActions?.({ dispatch, readOnly: locked, project });

  const headerContent = (
    <div className="flex items-center justify-end gap-1">
      <GlideFilter
        value={filterQuery}
        onChange={setFilterQuery}
        total={allRows.length}
        shown={rows.length}
      />
      {headerActions}
      <DropdownMenu open={actionsOpen} onOpenChange={setActionsOpen} width="w-52" theme="light"
        trigger={
          <Button>
            Edit
            <ChevronDown className="w-3 h-3 shrink-0 text-[color:var(--ui-text-faint)]" />
          </Button>
        }
      >
        <DropdownItem onClick={() => { setActionsOpen(false); fileInputRef.current?.click(); }} icon={<FileUp className="w-3.5 h-3.5" />} disabled={locked}>
          Import {config.labels.importTitle.replace(/^Import\s+/, '')} CSV
        </DropdownItem>
        <DropdownDivider />
        <DropdownItem onClick={() => { setActionsOpen(false); config.exportCSV(project); }} icon={<Download className="w-3.5 h-3.5" />}>
          Export {config.labels.exportNoun} to CSV
        </DropdownItem>
      </DropdownMenu>

      <DropdownMenu open={viewOpen} onOpenChange={setViewOpen} width="w-44" theme="light"
        trigger={revealMenuTrigger({
          icon: <Eye className="w-3.5 h-3.5 shrink-0" />,
          label: 'View',
          presenceAnchor: `toolbar:${config.presenceScope}:view`,
        })}
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
        trigger={revealMenuTrigger({
          icon: <Info className="w-3.5 h-3.5 shrink-0" />,
          label: 'Info',
          presenceAnchor: `toolbar:${config.presenceScope}:info`,
        })}
      >
        <div className="px-4 py-2.5 text-xs text-[color:var(--ui-text-muted)] space-y-1.5">
          {infoCounts.map(ic => (
            <div key={ic.label} className="flex items-center justify-between gap-6">
              <span className="font-medium text-[color:var(--ui-text-faint)] uppercase tracking-wider text-[10px]">{ic.label}</span>
              <span className="font-semibold text-[color:var(--ui-text-strong)]">{ic.count}</span>
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
        <div className="flex items-center justify-end gap-1 px-3 py-1.5 border-b border-[color:var(--ui-border)] bg-[var(--ui-panel-bg)] shrink-0">
          {headerContent}
        </div>
      )}

      {/* Grid */}
      <div
        ref={gridSizeRef}
        data-presence-grid={config.presenceScope}
        data-glide-visible-rows={rows.length}
        data-glide-total-rows={allRows.length}
        style={{ flex: 1, minHeight: 0, touchAction: 'none' }}
      >
        <DataEditor
          key={fontVersion}
          ref={gridRef}
          width={gridWidth}
          height={gridHeight}
          columns={glideColumns}
          rows={rows.length}
          overscrollY={5 * Math.round(34 * fontSize / SS_FONT_SIZE_DEFAULT)}
          trailingRowOptions={{ hint: '' }}
          onRowAppended={addRow}
          getCellContent={getCellContent}
          onCellEdited={onCellEdited}
          getCellsForSelection={true}
          gridSelection={gridSelection}
          onGridSelectionChange={setGridSelection}
          highlightRegions={peerHighlights}
          theme={createGlideTheme(fontSize)}
          rowHeight={Math.round(34 * fontSize / SS_FONT_SIZE_DEFAULT)}
          headerHeight={Math.round(36 * fontSize / SS_FONT_SIZE_DEFAULT)}
          onDelete={handleClear}
          onPaste={handlePaste}
          onColumnResize={onColumnResize}
          onCellContextMenu={onCellContextMenu}
          onCellClicked={onCellClicked}
          onCellActivated={onCellActivated}
          customRenderers={controlCellRenderers}
          onHeaderContextMenu={onHeaderContextMenu}
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
          readonly={locked}
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
            <ContextMenuItem onClick={() => void handleCut()} icon={<Scissors className="w-3.5 h-3.5" />} disabled={locked}>
              Cut
            </ContextMenuItem>
            <ContextMenuItem onClick={() => void handlePasteFromMenu()} icon={<ClipboardPaste className="w-3.5 h-3.5" />} disabled={locked}>
              Paste
            </ContextMenuItem>
            <ContextMenuItem onClick={handleClear} icon={<Trash2 className="w-3.5 h-3.5 text-[color:var(--ui-text-faint)]" />} disabled={!hasSelection || locked}>
              Clear
            </ContextMenuItem>
            <ContextMenuDivider />
            {(() => {
              const row = rowsRef.current[contextMenu.row];
              if (!row) return null;
              return (
                <ContextMenuItem
                  onClick={() => { onGoToManager?.(row.categoryKey); setContextMenu(null); }}
                  icon={<Eye className="w-3 h-3 text-[color:var(--ui-text-faint)]" />}
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
              icon={<ArrowUp className="w-3 h-3 text-[color:var(--ui-text-faint)]" />}
              disabled={locked}
            >
              Sort A to Z
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => { config.sortAction(dispatch, sortMenu.colKey, 'desc'); setSortMenu(null); }}
              icon={<ArrowDown className="w-3 h-3 text-[color:var(--ui-text-faint)]" />}
              disabled={locked}
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
            <p className="text-xs text-[color:var(--ui-text-muted)] leading-relaxed">
              <span className="text-[color:var(--ui-input-text)] font-semibold">{pendingImport.result.count}</span> {config.labels.importNoun} in <span className="text-[color:var(--ui-input-text)] font-semibold">{pendingImport.fileName}</span>. {config.labels.importSummary}
            </p>
            {pendingImport.result.newCategories.length > 0 && (
              <div>
                <h4 className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--ui-text-faint)] mb-1.5">
                  {pendingImport.result.newCategories.length} new {pendingImport.result.newCategories.length === 1 ? 'category' : 'categories'}
                </h4>
                <div className="flex flex-wrap gap-1">
                  {pendingImport.result.newCategories.map(c => (
                    <span key={c.key} className="text-[11px] bg-[var(--ui-input-bg)] border border-[color:var(--ui-card-border)] rounded px-2 py-0.5 text-[color:var(--ui-text)]">{c.label}</span>
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
