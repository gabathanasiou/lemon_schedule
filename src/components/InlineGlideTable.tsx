import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { ClipboardPaste, Copy, Scissors, Trash2 } from 'lucide-react';
import { useSpreadsheetFontSize, SS_FONT_SIZE_DEFAULT, useGlideSmoothScroll } from '../lib/persist';
import { IS_COARSE } from '../lib/device';
import { createGlideTheme } from '../lib/glideTheme';
import { useKitTheme } from '@gabriel/ui-kit';
import {
  kitGlyphCell,
  kitGlyphGroupCell,
  kitPickerCell,
  controlCellRenderers,
  isControlCell,
  isKitGlyphCell,
  isKitGlyphGroupCell,
  pressControlCell,
} from '@gabriel/ui-kit/glide-controls';
import { useGlideFill } from '../lib/glideFill';
import { textCell, buildCopyText, buildCutPlan, infoGlyphCell, infoGlyphRenderer, colorSwatchRenderer, disclosureGlyphRenderer } from '../lib/glideCells';
import { expandRangeFill, planGridPaste, type PasteEdit } from '../lib/glidePaste';
import { useGlidePasteInterception } from '../lib/glidePasteIntercept';
import { createGlideCellEditor, useGlideEscapeCancel, type GlideColumnEditor, type GlideEditorOptions } from '../lib/glideEditor';
import { usePortalTarget, useCurrentDocument } from '../lib/popoutTarget';
import { useGlidePeerSelection } from '../lib/useGlidePeerSelection';
import { registerPresenceGridScope, type PresenceGridScope } from '../lib/presenceResolvers';
import { effectiveGridRange } from '../lib/glideSelection';
import { clipboardRead, clipboardWrite } from '../lib/utils';
import { ContextMenu, ContextMenuItem, ContextMenuDivider } from './ContextMenu';
import { FloatingTooltip } from './FloatingTooltip';
import {
  parentKeyForRow, resolveGlideViewRestore,
  type GlideViewRestore, type GlideViewState,
} from '../lib/glideViewState';

/**
 * Inline Glide table — a compact, self-sizing spreadsheet embedded in a page
 * card (the Day Times grids are the first consumer; manager pages can reuse
 * it). It owns the generic grid mechanics so callers only supply data + cell
 * rendering:
 *  - columns auto-fit the card width (no horizontal scroll),
 *  - the grid is exactly as tall as its rows (no vertical scroll, no wheel
 *    trapping), with `overflow: hidden` on the scroller,
 *  - overlay editing, multi-cell selection, fill-down, copy/cut/paste/clear
 *    (each operation commits ONCE via `onCommit`),
 *  - centered column headers to match centered cells.
 *
 * Caller contract: `getCellContent` renders one cell; `onCommit` applies a
 * whole operation's edits in one go (one undo entry); `editableKeys` lists the
 * writable columns (paste/cut/clear/fill skip everything else).
 */
export interface InlineGlideColumn {
  key: string;
  label: string;
  /** Preferred width — scaled to fit the card. */
  width: number;
  align?: 'left' | 'center' | 'right';
}

export interface InlineGlideEdit {
  row: number;
  colKey: string;
  value: string;
}

/** One trailing per-row action (drawn as a glyph in the actions column). */
export interface InlineGlideRowAction {
  key: string;
  title: string;
  icon: 'plus' | 'trash' | 'chevron' | 'info';
  onClick: () => void;
}

export interface InlineGlideTableProps {
  columns: InlineGlideColumn[];
  /** Flat row objects keyed by column key. */
  rows: Record<string, string>[];
  getCellContent: (col: InlineGlideColumn, row: Record<string, string>, rowIndex: number) => GridCell;
  /** Applies a whole operation's edits (one call per edit/paste/fill/clear). */
  onCommit: (edits: InlineGlideEdit[]) => void;
  /** Column keys that accept writes. */
  editableKeys: Set<string>;
  readOnly?: boolean;
  /** Theme factory (defaults to the standard Glide theme). */
  createTheme?: (fontSize: number) => ReturnType<typeof createGlideTheme>;
  /** Empty-state text when `rows` is empty. */
  emptyLabel?: string;
  /** Base row/header heights at an 11px font (scaled with the font size). */
  baseRowHeight?: number;
  baseHeaderHeight?: number;
  /** Wrap header titles onto multiple lines inside their column (clipped to
   *  the cell) instead of Glide's single-line draw. Pair with a taller
   *  `baseHeaderHeight` — used by the horizontal precalls grid where the
   *  column titles ARE the department names. */
  wrapHeaders?: boolean;
  /** DOM data attribute for tests/scoping (e.g. `data-day-times-glide`). */
  dataAttr?: string;
  /** Optional category on the same wrapper (test geometry: cast grids carry
   *  the Artiste column). */
  dataCategory?: string;
  /** Extra context-menu items shown when the HEADER is right-clicked. Return
   *  `ContextMenuItem`s; call `close()` to dismiss the menu. Omit for the
   *  default (cell-only) context menu. */
  headerMenuItems?: (close: () => void) => React.ReactNode;
  /** Optional per-row hover tooltip (item 115). Content is host-supplied; the
   *  shared grid owns the hover/positioning. Return `null` to skip a row. */
  rowTooltip?: (row: Record<string, string>, rowIndex: number) => React.ReactNode;
  /** Fires with the hovered row index (null when leaving the rows) — lets the
   *  host drive a cross-surface highlight (Call Sheet scene strips). */
  onRowHover?: (rowIndex: number | null) => void;
  /** Optional inline dropdown editors per column key. */
  editors?: Record<string, GlideColumnEditor>;
  /** Optional per-(row,column) editor — wins over `editors`. Use when the
   *  editor's options depend on the row (e.g. a crew slot's person list). */
  getEditor?: (row: number, colKey: string) => GlideColumnEditor | undefined | null;
  /** Optional trailing actions column: shows each row's action glyphs and
   *  dispatches the one clicked. `info` renders the shared (i) glyph. */
  rowActions?: (rowIndex: number) => InlineGlideRowAction[];
  /** Optional leading glyph column (drawn before the trailing actions): the
   *  shared (i) "edit/inspect" affordance, so destructive actions can stay in
   *  their own persistent trash column. */
  rowInfo?: (rowIndex: number) => { title: string; onClick: () => void } | null;
  /** Right-click menu items for a data row (rendered above the generic
   *  copy/paste items). Return `null` to fall back to the generic menu. */
  rowMenuItems?: (rowIndex: number, close: () => void) => React.ReactNode;
  /** Shift+Enter quick-add (roadmap 337): creates a row in the focused row's
   *  context (`null` = no focused row → the host appends) with no modal. Return
   *  the NEW row's `key` so the grid can move the selection/caret onto it once
   *  the host's rows update. Omit to leave Shift+Enter to Glide. */
  onAddRow?: (rowIndex: number | null) => string | null | void;
  /** Cell-scoped key shortcut (roadmap 340): return `true` to consume the key
   *  (arrows on a tree/disclosure cell), `false` to let Glide navigate. */
  onCellKeyDown?: (rowIndex: number, colKey: string, key: string) => boolean;
  /** Optional per-row band theme (budget category/account rows, roadmap 343):
   *  paints EVERY cell — data + the trailing info/actions lanes — and wins over
   *  the read-only disabled tint. Hover keeps the band (no punched holes). */
  rowThemeOverride?: (rowIndex: number) => { bgCell?: string; textDark?: string; textMedium?: string; textLight?: string } | undefined;
  /** `content` (default) = the grid is exactly as tall as its rows; `fill` =
   *  the grid fills its measured container and scrolls its rows INSIDE Glide,
   *  keeping the column header pinned (the Budget sheet, roadmap 343). */
  heightMode?: 'content' | 'fill';
  /** Presence scope (roadmap 234): the stable id of THIS logical table shared
   *  by every client (e.g. `day:3:times:cast`). Every mounted instance — main
   *  window, popped-out sheet, portalled canvas — publishes its own selection
   *  and paints peers' ones under it. Omit for grids that must not participate
   *  (e.g. modal-owned template editors). */
  presenceScope?: string;
  /** Row keys for presence; defaults to `row.key`, then the row index. Keys
   *  must be stable across clients (they survive client-side reordering). */
  presenceRowKey?: (row: Record<string, string>, index: number) => string;
  /** Restore a shared sheet anchor after a view switch (roadmap 349). The
   *  token is consumed once; rows/columns resolve independently by key. */
  viewRestore?: GlideViewRestore | null;
  /** Reports the top visible row + current cell so the host can carry the
   *  viewport/selection across two grids of the same sheet. */
  onViewChange?: (state: GlideViewState) => void;
}

const DEFAULT_ROW_HEIGHT = 28;
const DEFAULT_HEADER_HEIGHT = 30;

/** Local selection memory per logical grid (roadmap 315): the Day Manager
 *  category tabs unmount their sections, so a Glide grid's selected cell/range
 *  would reset when you switch away and back. Key by the stable presence scope
 *  (or the data attr for grids without one); restore on remount. Ephemeral and
 *  per window — never project state, never published. */
const SELECTION_CACHE = new Map<string, GridSelection>();
const EMPTY_SELECTION: GridSelection = {
  columns: CompactSelection.empty(),
  rows: CompactSelection.empty(),
};
/** Synthetic trailing row-actions column (key `actions` — skipped by copy/cut). */
const ACTIONS_COLUMN: InlineGlideColumn = { key: 'actions', label: '', width: 56 };
/** Synthetic leading info column (key `info` — skipped by copy/cut). */
const INFO_COLUMN: InlineGlideColumn = { key: 'info', label: '', width: 30 };
/** Stable identity for the "no presence scope" key lists (memo deps). */
const NO_KEYS: string[] = [];

export const InlineGlideTable: React.FC<InlineGlideTableProps> = ({
  columns,
  rows,
  getCellContent,
  onCommit,
  editableKeys,
  readOnly,
  createTheme = createGlideTheme,
  emptyLabel,
  baseRowHeight = DEFAULT_ROW_HEIGHT,
  baseHeaderHeight = DEFAULT_HEADER_HEIGHT,
  wrapHeaders,
  dataAttr,
  dataCategory,
  headerMenuItems,
  rowMenuItems,
  onAddRow,
  onCellKeyDown,
  rowTooltip,
  onRowHover,
  editors,
  getEditor,
  rowActions,
  rowInfo,
  rowThemeOverride,
  heightMode = 'content',
  presenceScope,
  presenceRowKey,
  viewRestore,
  onViewChange,
}) => {
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const readOnlyRef = useRef(!!readOnly);
  readOnlyRef.current = !!readOnly;
  const onAddRowRef = useRef(onAddRow);
  onAddRowRef.current = onAddRow;
  const onCellKeyDownRef = useRef(onCellKeyDown);
  onCellKeyDownRef.current = onCellKeyDown;
  const rowThemeRef = useRef(rowThemeOverride);
  rowThemeRef.current = rowThemeOverride;
  /** The row key Shift+Enter just created — the selection moves there once the
   *  host's rows include it (the dispatch lands on the next render). */
  const pendingAddKeyRef = useRef<string | null>(null);

  // The grid fills the card: measure the wrapper and distribute the columns so
  // the table never scrolls sideways. The second column absorbs the rounding
  // remainder, so the widths always sum to exactly the available width.
  const { ref: gridSizeRef, width: gridWidth } = useGlideFill<HTMLDivElement>();

  const [fontSize] = useSpreadsheetFontSize(IS_COARSE ? 12.5 : undefined);
  // Every Glide grid shares ONE smooth-scroll pref (default on).
  const [smoothScroll] = useGlideSmoothScroll();
  const rowH = Math.round((baseRowHeight * fontSize) / SS_FONT_SIZE_DEFAULT);
  const headerH = Math.round((baseHeaderHeight * fontSize) / SS_FONT_SIZE_DEFAULT);

  /** `heightMode="fill"` measures the container so Glide scrolls its own rows
   *  (the pinned-header sheet). Content mode stays exactly as tall as rows. */
  const [fillHeight, setFillHeight] = useState(0);
  useEffect(() => {
    if (heightMode !== 'fill') return;
    const el = gridSizeRef.current;
    if (!el) return;
    const measure = () => setFillHeight(el.clientHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [heightMode, gridSizeRef]);

  const COLUMNS = useMemo(() => {
    const total = columns.reduce((s, c) => s + c.width, 0);
    const trailingWidth = (rowInfo ? INFO_COLUMN.width : 0) + (rowActions ? ACTIONS_COLUMN.width : 0);
    const withTrailing = (list: InlineGlideColumn[]) => [
      ...list,
      ...(rowInfo ? [INFO_COLUMN] : []),
      ...(rowActions ? [ACTIONS_COLUMN] : []),
    ];
    if (!gridWidth || gridWidth <= 0 || total <= 0) return withTrailing(columns);
    const target = Math.max(120, Math.floor(gridWidth) - 1) - trailingWidth;
    const flexIdx = Math.min(1, columns.length - 1);
    const widths = columns.map(c => Math.max(40, Math.floor((c.width / total) * target)));
    let sum = widths.reduce((s, w) => s + w, 0);
    if (flexIdx >= 0) {
      if (sum > target) widths[flexIdx] = Math.max(40, widths[flexIdx] - (sum - target));
      sum = widths.reduce((s, w) => s + w, 0);
      if (sum < target) widths[flexIdx] += target - sum;
    }
    const out = columns.map((c, i) => ({ ...c, width: widths[i] }));
    if (rowInfo) out.push(INFO_COLUMN);
    if (rowActions) out.push(ACTIONS_COLUMN);
    return out;
  }, [columns, gridWidth, rowActions, rowInfo]);

  const glideColumns: GridColumn[] = useMemo(
    () => COLUMNS.map(c => ({ title: c.label.toUpperCase(), width: c.width })),
    [COLUMNS],
  );

  const contentHeight = headerH + rows.length * rowH;
  const gridHeight = heightMode === 'fill' ? Math.max(headerH + rowH, fillHeight) : contentHeight;

  // Glide caches cells on its canvas — a data/column change (add/remove rows,
  // resize) only repaints after an explicit full-grid damage pass. Without this
  // the grid looks stale until the next interaction (the reported "right-click
  // suddenly renders it").
  useEffect(() => {
    if (!gridRef.current) return;
    const damage: { cell: Item }[] = [];
    for (let r = 0; r < rows.length; r++) {
      for (let c = 0; c < COLUMNS.length; c++) damage.push({ cell: [c, r] });
    }
    const id = setTimeout(() => gridRef.current?.updateCells(damage), 0);
    return () => clearTimeout(id);
  }, [rows, COLUMNS]);

  const portalTarget = usePortalTarget();
  const currentDocument = useCurrentDocument();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const gridPortalRef = useRef<HTMLElement | null>(null);
  // Glide portals cell editors (and their dropdown panels) into
  // `gridPortalRef.current`. The shared `#portal` sits at z-9999 — BELOW modal
  // content (z-10000) — so a grid rendered INSIDE a modal (Call Times → Crew
  // template) opened its editors behind the dialog: invisible and unclickable.
  // Those grids get their own body-level, viewport-anchored layer at the
  // in-modal popover depth (the `.ui-menu` 10001 tier) instead.
  useEffect(() => {
    const doc = currentDocument ?? document;
    const inModal = !!wrapperRef.current?.closest('[role="dialog"]');
    if (!inModal) {
      gridPortalRef.current = portalTarget ? portalTarget.querySelector('#portal') : doc.getElementById('portal');
      return;
    }
    const layer = doc.createElement('div');
    layer.setAttribute('data-glide-overlay-layer', '');
    // Radix modal mode sets `pointer-events: none` on <body>; re-enable on the
    // layer (a 0×0 fixed anchor, so it never blocks clicks itself).
    layer.style.cssText = 'position:fixed;left:0;top:0;z-index:10001;pointer-events:auto';
    // The dialog's focus scope (Radix FocusScope) listens for focusin/focusout
    // on the document and yanks focus back inside the dialog whenever it lands
    // outside — the layer is outside by construction, so every keystroke would
    // be stolen back to the grid (edit-on-type then re-opened the cell editor
    // per key: "only one character sticks"). Focus events inside the layer stay
    // inside it (React's own delegated listeners live ON the layer and still
    // run), and a capture guard below covers the focusout fired on the dialog
    // element itself when focus moves INTO the layer.
    const swallow = (e: FocusEvent) => e.stopPropagation();
    layer.addEventListener('focusin', swallow);
    layer.addEventListener('focusout', swallow);
    const onDocFocusOut = (e: FocusEvent) => {
      const related = e.relatedTarget as Node | null;
      if (related && layer.contains(related)) e.stopPropagation();
    };
    doc.addEventListener('focusout', onDocFocusOut, true);
    doc.body.appendChild(layer);
    gridPortalRef.current = layer;
    return () => {
      doc.removeEventListener('focusout', onDocFocusOut, true);
      layer.remove();
      gridPortalRef.current = null;
    };
  }, [portalTarget, currentDocument]);

  // Inline dropdown editors (crew slot person/call) AND the default aligned
  // text editor for centered/right columns (item 223): the provider is ALWAYS
  // supplied — with no per-column config it only kicks in for non-left columns
  // (left cells keep Glide's own editor untouched). Column offset 0: this grid
  // has no row-marker column, so Glide's reported col IS the data col.
  // ONE stable provideEditor for the grid's lifetime — the current config
  // travels through a ref, so parent re-renders (new callback identities) can
  // never recreate the editor components and remount an open overlay.
  const editorOptsRef = useRef<GlideEditorOptions | null>(null);
  editorOptsRef.current = {
    readOnlyRef,
    columns: COLUMNS,
    getValue: (row, colKey) => String(rowsRef.current[row]?.[colKey] ?? ''),
    editors,
    getEditor,
    portalRef: gridPortalRef,
    columnOffset: 0,
  };
  const provideEditor = useMemo(() => createGlideCellEditor(() => editorOptsRef.current), []);
  // Escape cancels the open cell edit without closing an enclosing modal.
  const escapeCancel = useGlideEscapeCancel();

  const gridRef = useRef<DataEditorRef>(null);
  const selectionKey = presenceScope || dataAttr || '';
  const [gridSelection, setGridSelection] = useState<GridSelection>(() =>
    (selectionKey ? SELECTION_CACHE.get(selectionKey) : undefined) ?? EMPTY_SELECTION);
  // A different day/table is a different logical grid — adopt its cached
  // selection instead of carrying the old one across.
  useEffect(() => {
    setGridSelection(selectionKey ? SELECTION_CACHE.get(selectionKey) ?? EMPTY_SELECTION : EMPTY_SELECTION);
  }, [selectionKey]);
  const gridSelectionRef = useRef(gridSelection);
  gridSelectionRef.current = gridSelection;

  // Cross-view continuity (roadmap 349): report the top visible row + current
  // cell so the host can restore them in the other view of the same sheet.
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const scrollTopRef = useRef(0);
  const rowHRef = useRef(rowH);
  rowHRef.current = rowH;
  const columnsRef = useRef(COLUMNS);
  columnsRef.current = COLUMNS;
  const onViewChangeRef = useRef(onViewChange);
  onViewChangeRef.current = onViewChange;

  const emitViewChange = useCallback(() => {
    const callback = onViewChangeRef.current;
    const list = rowsRef.current;
    if (!callback || list.length === 0) return;
    const rowHeight = Math.max(1, rowHRef.current);
    const scrollTop = Math.max(0, scrollerRef.current?.scrollTop ?? scrollTopRef.current);
    scrollTopRef.current = scrollTop;
    const topIndex = Math.max(0, Math.min(list.length - 1, Math.floor(scrollTop / rowHeight)));
    const top = list[topIndex];
    const cell = gridSelectionRef.current?.current?.cell;
    const selectedRow = cell ? list[cell[1]] : undefined;
    const selectedCol = cell ? columnsRef.current[cell[0]]?.key : undefined;
    callback({
      scroll: {
        rowKey: top.key ?? String(topIndex),
        rowIndex: topIndex,
        parentKey: parentKeyForRow(top),
        offset: Math.max(0, scrollTop - topIndex * rowHeight),
      },
      selection: selectedRow && selectedCol
        ? {
            rowKey: selectedRow.key ?? String(cell![1]),
            rowIndex: cell![1],
            parentKey: parentKeyForRow(selectedRow),
            colKey: selectedCol,
          }
        : null,
    });
  }, []);

  // Attach to Glide's scroller once it exists; MutationObserver covers the
  // first frame and any full remount of the editor body.
  useEffect(() => {
    const root = wrapperRef.current;
    if (!root) return;
    let el: HTMLDivElement | null = null;
    // Deliberately synchronous: the host only stores the anchor in a ref, and
    // the last scroll must be visible before the user can click the view
    // switch (a rAF throttle could leave a stale anchor on the way out).
    const onScroll = () => {
      if (!el) return;
      scrollTopRef.current = el.scrollTop;
      emitViewChange();
    };
    const bind = (next: HTMLDivElement | null) => {
      if (el === next) return;
      if (el) el.removeEventListener('scroll', onScroll);
      el = next;
      scrollerRef.current = next;
      if (next) {
        scrollTopRef.current = next.scrollTop;
        next.addEventListener('scroll', onScroll, { passive: true });
      }
    };
    const find = () => bind(root.querySelector('.dvn-scroller') as HTMLDivElement | null);
    find();
    const observer = new MutationObserver(find);
    observer.observe(root, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      bind(null);
    };
  }, [emitViewChange]);

  // Report the initial/after-render state (and any row-set change) so a switch
  // immediately after mount still has an anchor.
  useEffect(() => {
    emitViewChange();
  }, [rows, emitViewChange]);

  // Restore the shared anchor once per switch token. Selection and scroll are
  // applied separately: the viewport is rebuilt from the top-row key, not the
  // selected row, so scrolling away from the selection survives the switch.
  const restoredViewTokenRef = useRef<number | null>(null);
  useEffect(() => {
    if (!viewRestore || restoredViewTokenRef.current === viewRestore.token) return;
    if (rows.length === 0) return;
    // A fill-mode grid has no scrollable height until it has measured; a
    // scrollTop set before that is clamped to 0 and silently lost.
    if (heightMode === 'fill' && fillHeight <= 0) return;
    const target = resolveGlideViewRestore(viewRestore, rows, COLUMNS, rowH);
    if (!target) return;
    restoredViewTokenRef.current = viewRestore.token;
    const selection: GridSelection = {
      columns: CompactSelection.empty(),
      rows: CompactSelection.empty(),
      current: {
        cell: [target.colIndex, target.rowIndex],
        range: { x: target.colIndex, y: target.rowIndex, width: 1, height: 1 },
        rangeStack: [],
      },
    };
    gridSelectionRef.current = selection;
    setGridSelection(selection);
    if (selectionKey) SELECTION_CACHE.set(selectionKey, selection);
    scrollTopRef.current = target.scrollTop;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      // Two frames: let Glide finish mounting its scroller and apply the
      // selection's own scroll before we set the exact offset.
      const scroller = scrollerRef.current
        ?? (wrapperRef.current?.querySelector('.dvn-scroller') as HTMLDivElement | null);
      if (gridRef.current?.scrollTo) {
        gridRef.current.scrollTo(0, { amount: target.scrollTop, unit: 'px' }, 'vertical', 0, 0, { behavior: 'auto' });
      }
      if (scroller) scroller.scrollTop = target.scrollTop;
      emitViewChange();
    }));
  }, [viewRestore, rows, COLUMNS, rowH, heightMode, fillHeight, selectionKey, emitViewChange]);

  // Shift+Enter quick-add (roadmap 337): move the selection onto the row the
  // host just created, once its dispatch lands in `rows`. The first EDITABLE
  // data column is the natural landing cell; typing then opens its editor
  // (`editOnType`) with no modal.
  useEffect(() => {
    const key = pendingAddKeyRef.current;
    if (!key) return;
    const rowIndex = rows.findIndex(r => r.key === key);
    if (rowIndex < 0) return;
    pendingAddKeyRef.current = null;
    const col = Math.max(0, COLUMNS.findIndex(c => editableKeys.has(c.key)));
    const cell: Item = [col, rowIndex];
    setGridSelection({
      columns: CompactSelection.empty(),
      rows: CompactSelection.empty(),
      current: { cell, range: { x: col, y: rowIndex, width: 1, height: 1 }, rangeStack: [] },
    });
    gridRef.current?.scrollTo?.(col, rowIndex);
  }, [rows, COLUMNS, editableKeys]);
  // Peer selections (roadmap 234) — see the props' docs. Inert without a scope.
  const presenceRowKeys = useMemo(
    () => (presenceScope ? rows.map((r, i) => presenceRowKey?.(r, i) ?? r.key ?? String(i)) : NO_KEYS),
    [presenceScope, rows, presenceRowKey],
  );
  const presenceColKeys = useMemo(
    () => (presenceScope ? COLUMNS.map(c => c.key) : NO_KEYS),
    [presenceScope, COLUMNS],
  );
  const peerHighlights = useGlidePeerSelection({
    scope: presenceScope,
    selection: gridSelection,
    rowKeys: presenceRowKeys,
    colKeys: presenceColKeys,
  });
  // Live-pointer grid scope (roadmap 236): the pointer chain probes THIS grid
  // under the presence scope and the receiver locates the cell with its own
  // scroll/column widths — the same recipe as the Glide Breakdown. Keys travel
  // through a ref so the registered scope never re-registers on data churn.
  const presenceKeysRef = useRef({ rows: presenceRowKeys, cols: presenceColKeys });
  presenceKeysRef.current = { rows: presenceRowKeys, cols: presenceColKeys };
  useEffect(() => {
    if (!presenceScope) return;
    const scope: PresenceGridScope = {
      probe: (x, y) => {
        const args = gridRef.current?.getMouseArgsForPosition(x, y);
        if (!args || args.kind !== 'cell') return null;
        const [col, row] = args.location;
        const { rows, cols } = presenceKeysRef.current;
        const rowKey = rows[row];
        const colKey = cols[col];
        if (rowKey == null || colKey == null) return null;
        const { x: bx, y: by, width: bw, height: bh } = args.bounds;
        const fx = bw > 0 ? Math.min(Math.max((x - bx) / bw, 0), 1) : 0.5;
        const fy = bh > 0 ? Math.min(Math.max((y - by) / bh, 0), 1) : 0.5;
        return { rowKey, colKey, rowIndex: row, colIndex: col, fx, fy };
      },
      locate: ({ rowKey, colKey, rowIndex, colIndex }) => {
        const { rows, cols } = presenceKeysRef.current;
        if (rows.length === 0 || cols.length === 0) return null;
        let ri = rows.indexOf(rowKey);
        if (ri < 0) ri = Math.min(Math.max(rowIndex, 0), rows.length - 1);
        let ci = cols.indexOf(colKey);
        if (ci < 0) ci = Math.min(Math.max(colIndex, 0), cols.length - 1);
        const rect = gridRef.current?.getBounds(ci, ri);
        if (!rect) return null;
        return { left: rect.x, top: rect.y, width: rect.width, height: rect.height };
      },
    };
    return registerPresenceGridScope(presenceScope, scope);
  }, [presenceScope]);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; row: number; col: number; header?: boolean } | null>(null);
  const [tooltip, setTooltip] = useState<{ row: number } | null>(null);
  const [tooltipAnchor, setTooltipAnchor] = useState<{ x: number; y: number } | null>(null);
  const rowTooltipRef = useRef(rowTooltip);
  rowTooltipRef.current = rowTooltip;
  const onRowHoverRef = useRef(onRowHover);
  onRowHoverRef.current = onRowHover;

  // Track the cursor (capture phase, so it beats Glide's canvas handler) and
  // seed the tooltip there — it then follows the pointer smoothly with no
  // first-frame jump from the cell anchor.
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const handler = (e: PointerEvent) => { pointerRef.current = { x: e.clientX, y: e.clientY }; };
    el.addEventListener('pointermove', handler, true);
    return () => el.removeEventListener('pointermove', handler, true);
  }, []);

  /** Viewport position of a grid-relative cell rect (fallback for touch taps). */
  const anchorFor = useCallback((t: { bx: number; by: number; bw: number }) => {
    const rect = gridSizeRef.current?.getBoundingClientRect();
    return { x: (rect?.left ?? 0) + t.bx + t.bw / 2, y: (rect?.top ?? 0) + t.by };
  }, [gridSizeRef]);

  // Hover/affordance model: EDITABLE cells are the INPUT surface — plain white
  // (the grid's own background) at rest, so they read like a field. READ-ONLY
  // cells are the DISABLED surface — a neutral grey at rest, a touch deeper on
  // the hovered row. A caller's own `themeOverride.bgCell` (budget category/
  // account bands) wins over the disabled tint. Repaint just the two affected
  // rows on hover change.
  const gridMode = useKitTheme()?.mode ?? 'light';
  const EDITABLE_HOVER_BG = gridMode === 'dark' ? '#1f1f22' : '#fbfbfc';
  const READONLY_BG = gridMode === 'dark' ? '#1c1c1f' : '#f4f4f5';
  const READONLY_HOVER_BG = gridMode === 'dark' ? '#27272a' : '#e4e4e7';
  const hoveredRowRef = useRef<number | null>(null);
  const onItemHovered = useCallback((args: any) => {
    const loc = args?.location;
    const row = args?.kind === 'cell' && loc && loc[1] >= 0 && loc[1] < rowsRef.current.length ? loc[1] : null;
    if (row === hoveredRowRef.current) return;
    const prev = hoveredRowRef.current;
    hoveredRowRef.current = row;

    // Row-hover tooltip (item 115): anchor at the hovered cell, viewport-space.
    if (rowTooltipRef.current) {
      if (row == null) {
        setTooltip(null);
        setTooltipAnchor(null);
      } else {
        const b = args?.bounds;
        setTooltip({ row });
        setTooltipAnchor(pointerRef.current ?? anchorFor({ bx: b?.x ?? 0, by: b?.y ?? 0, bw: b?.width ?? 0 }));
      }
    }

    onRowHoverRef.current?.(row);

    const damage: { cell: Item }[] = [];
    if (prev != null) for (let c = 0; c < COLUMNS.length; c++) damage.push({ cell: [c, prev] });
    if (row != null) for (let c = 0; c < COLUMNS.length; c++) damage.push({ cell: [c, row] });
    if (damage.length) gridRef.current?.updateCells(damage);
  }, [COLUMNS.length, anchorFor]);

  const getCell = useCallback(([col, row]: Item): GridCell => {
    const colDef = COLUMNS[col];
    const r = rowsRef.current[row];
    if (!colDef || !r) return textCell('', { readonly: true, allowOverlay: false });
    // A row band (budget category/account) covers EVERY lane, including the
    // trailing info/actions glyphs, so no disabled-grey hole appears
    // (roadmap 343). A cell's own themeOverride still wins over the band.
    const band = rowThemeRef.current?.(row);
    const withBand = (cell: GridCell): GridCell => band
      ? { ...cell, themeOverride: { ...band, ...((cell as any).themeOverride || {}) } }
      : cell;
    if (colDef.key === 'info') {
      const info = rowInfo?.(row);
      if (readOnlyRef.current || !info) return withBand(textCell('', { readonly: true, allowOverlay: false }));
      return withBand(infoGlyphCell({ label: info.title, onActivate: info.onClick }));
    }
    if (colDef.key === 'actions') {
      // Painted row actions — the kit's canvas-native control cells. A lone
      // (i) action is the shared app glyph (details/inspect, NOT a chevron,
      // which reads as collapse/expand).
      const actions = rowActions?.(row) ?? [];
      if (readOnlyRef.current || actions.length === 0) return withBand(textCell('', { readonly: true, allowOverlay: false }));
      if (actions.length === 1 && actions[0].icon === 'info') {
        return withBand(infoGlyphCell({ label: actions[0].title, onActivate: actions[0].onClick }));
      }
      const kitActions = actions.filter(action => action.icon !== 'info');
      if (kitActions.length === 0) return withBand(textCell('', { readonly: true, allowOverlay: false }));
      const buttons = kitActions.map(action => ({
        icon: action.icon as 'plus' | 'trash' | 'chevron',
        label: action.title,
        tone: action.icon === 'trash' ? ('danger' as const) : action.icon === 'chevron' || action.icon === 'info' ? ('neutral' as const) : ('accent' as const),
        onActivate: action.onClick,
      }));
      return withBand(buttons.length > 1
        ? kitGlyphGroupCell({ lane: 'full', buttons })
        : kitGlyphCell({ lane: 'full', ...buttons[0] }));
    }
    const cell = withBand(getCellContent(colDef, r, row));
    const hovered = row === hoveredRowRef.current;
    const isReadonly = readOnlyRef.current || !!(cell as any).readonly;
    if (!isReadonly) {
      // Picker columns (entity/enum editors) carry the kit's chevron lane so
      // the dropdown affordance is visible without opening the cell. The
      // lane opens the SAME overlay editor a double-click does.
      const editorCfg = getEditor?.(row, colDef.key) ?? editors?.[colDef.key];
      const picker = editorCfg && (editorCfg.kind === 'entity' || editorCfg.kind === 'enum') && (cell as any).kind === GridCellKind.Text
        ? kitPickerCell({
            value: String((cell as any).displayData ?? (cell as any).data ?? ''),
            seedValue: String((editorCfg as any).seedValue ?? r[colDef.key] ?? ''),
            label: `${colDef.label} for row ${row + 1}`,
            placeholder: '—',
            onOpen: () => gridRef.current?.openCellEditor(col, row),
          })
        : null;
      // Editable inputs stay white at rest (the grid's own bg — the "field"
      // surface); only a near-white hover repaint keeps the row responsive.
      // A caller-tinted editable cell (the status cells, roadmap 345) is the
      // explicit exception and keeps its tint at rest AND on hover.
      const editable = picker ?? cell;
      if ((editable as any).themeOverride?.bgCell) return editable;
      if (!hovered) return editable;
      return { ...editable, themeOverride: { ...((editable as any).themeOverride || {}), bgCell: EDITABLE_HOVER_BG, bgCellMedium: EDITABLE_HOVER_BG } };
    }
    // Read-only = disabled: neutral grey at rest, a touch deeper on hover,
    // unless the caller supplied its own band colour (which never gets a hole
    // punched by the hover tint).
    const own = (cell as any).themeOverride?.bgCell as string | undefined;
    const bg = own ?? (hovered ? READONLY_HOVER_BG : READONLY_BG);
    return { ...cell, themeOverride: { ...((cell as any).themeOverride || {}), bgCell: bg, bgCellMedium: bg } };
  }, [COLUMNS, getCellContent, getEditor, editors, rowActions, rowInfo, EDITABLE_HOVER_BG, READONLY_BG, READONLY_HOVER_BG]);

  /** Glide draws header text left-aligned only; repaint centered columns so
   *  each title lines up with its (centered) cells. `wrapHeaders` wraps the
   *  title into the column (word-wrapped, clipped to the cell) — the canvas
   *  never wraps on its own. */
  const drawHeader = useCallback((args: any, drawContent: () => void) => {
    drawContent();
    const { ctx, rect, column, columnIndex, theme } = args;
    const colDef = COLUMNS[columnIndex];
    if (!colDef) return;
    const centered = (colDef.align ?? 'left') === 'center';
    if (!centered && !wrapHeaders) return;
    ctx.save();
    ctx.fillStyle = theme.bgHeader;
    ctx.fillRect(rect.x + 1, rect.y, rect.width - 2, rect.height);
    ctx.fillStyle = theme.textHeader;
    ctx.textAlign = centered ? 'center' : 'left';
    ctx.textBaseline = 'middle';
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.width, rect.height);
    ctx.clip();
    const x = centered ? rect.x + rect.width / 2 : rect.x + 6;
    if (!wrapHeaders) {
      ctx.fillText(String(column.title), x, rect.y + rect.height / 2);
    } else {
      const lines: string[] = [];
      let line = '';
      const maxW = rect.width - 8;
      for (const word of String(column.title).split(/\s+/)) {
        const next = line ? `${line} ${word}` : word;
        if (ctx.measureText(next).width <= maxW) { line = next; continue; }
        if (line) { lines.push(line); line = ''; }
        // A single word wider than the column hard-splits by characters —
        // the same last resort as the static table's CSS `break-word`.
        let chunk = '';
        for (const ch of word) {
          if (chunk && ctx.measureText(chunk + ch).width > maxW) { lines.push(chunk); chunk = ch; }
          else chunk += ch;
        }
        line = chunk;
      }
      if (line) lines.push(line);
      const lh = Math.min(14, rect.height / Math.max(1, lines.length));
      const startY = rect.y + rect.height / 2 - ((lines.length - 1) * lh) / 2;
      lines.forEach((l, i) => ctx.fillText(l, x, startY + i * lh));
    }
    ctx.restore();
  }, [COLUMNS, wrapHeaders]);

  /** Painted control cells own their clicks; repaint so the press flash runs. */
  const onCellClicked = useCallback((cell: Item) => {
    if (!rowActions) return;
    if (isControlCell(getCell(cell))) requestAnimationFrame(() => gridRef.current?.updateCells([{ cell }]));
  }, [rowActions, getCell]);

  /** Enter/Space on a painted control or app glyph fires it once. The custom
   *  canvas cells (info, colour swatch, pencil picker) are REAL grid cells, so
   *  keyboard activation must match their pointer behaviour. */
  const onCellActivated = useCallback((cell: Item) => {
    const content = getCell(cell);
    const data = (content as any).data as { kind?: string; onActivate?: () => void; onOpen?: () => void } | undefined;
    // View-only toggles (the budget band disclosure) stay live in read-only.
    if (data?.kind === 'lemon-disclosure') {
      data.onActivate?.();
      return;
    }
    if (!readOnlyRef.current && data) {
      if (data.kind === 'lemon-info') {
        data.onActivate?.();
        return;
      }
    }
    const button = isKitGlyphGroupCell(content)
      ? content.data.buttons[0]
      : isKitGlyphCell(content)
        ? content.data
        : undefined;
    if (!button || readOnlyRef.current) {
      escapeCancel.onCellActivated();
      return;
    }
    pressControlCell(cell, button.label);
    button.onActivate?.();
    requestAnimationFrame(() => gridRef.current?.updateCells([{ cell }]));
  }, [getCell, escapeCancel]);

  /** Applies a set of edits as ONE commit — a whole paste/fill/clear is one
   *  undo entry for the caller. */
  const applyEdits = useCallback((edits: PasteEdit[]) => {
    if (readOnlyRef.current) return;
    const out: InlineGlideEdit[] = [];
    for (const edit of edits) {
      if (!editableKeys.has(edit.colKey)) continue;
      if (!rowsRef.current[edit.row]) continue;
      out.push({ row: edit.row, colKey: edit.colKey, value: edit.val });
    }
    if (out.length > 0) onCommit(out);
  }, [editableKeys, onCommit]);

  const getEffectiveRange = useCallback((): { x: number; y: number; width: number; height: number } | null =>
    effectiveGridRange(gridSelectionRef.current, rows.length, COLUMNS.length),
  [rows.length, COLUMNS.length]);

  const onCellsEdited = useCallback((edits: readonly { location: Item; value: EditableGridCell }[]) => {
    if (readOnlyRef.current) return false;
    // Range fill (roadmap 139): a single edit committed while a multi-cell
    // selection is active writes that value to every writable cell in the
    // selection — ONE commit / undo entry. Paste arrives as many edits, so it
    // is never expanded here (fill-handle copies the same value anyway).
    if (edits.length === 1 && edits[0].value.kind === GridCellKind.Text) {
      const range = getEffectiveRange();
      if (range && range.width * range.height > 1) {
        const spread = expandRangeFill(range, COLUMNS, edits[0].value.data);
        if (spread.length > 1) {
          applyEdits(spread);
          return true;
        }
      }
    }
    applyEdits(edits.map(e => ({
      row: e.location[1],
      colKey: COLUMNS[e.location[0]]?.key || '',
      val: e.value.kind === GridCellKind.Text
        ? e.value.data
        : e.value.kind === GridCellKind.Boolean
          ? String(e.value.data)
          : '',
    })));
    return true;
  }, [COLUMNS, applyEdits, getEffectiveRange]);

  const handlePaste = useCallback((target: Item, values: readonly (readonly string[])[]) => {
    if (readOnlyRef.current) return false;
    const plan = planGridPaste<null>(
      target,
      values,
      rowsRef.current.length,
      COLUMNS,
      gridSelectionRef.current?.current?.range,
      () => null,
    );
    applyEdits(plan.editRows);
    // Returning false stops Glide from also applying the paste itself.
    return false;
  }, [COLUMNS, applyEdits]);

  const handleCopy = useCallback(async () => {
    const range = getEffectiveRange();
    if (!range) return;
    const text = buildCopyText(rows, COLUMNS, range);
    if (text.length > 0) await clipboardWrite(text);
    setContextMenu(null);
  }, [rows, COLUMNS, getEffectiveRange]);

  const handleCut = useCallback(async () => {
    if (readOnlyRef.current) { setContextMenu(null); return; }
    const range = getEffectiveRange();
    if (!range) return;
    const { text, committers } = buildCutPlan(rows, COLUMNS, range);
    if (text.length > 0) {
      await clipboardWrite(text);
      applyEdits(committers.map(c => ({ ...c, val: '' })));
    }
    setContextMenu(null);
  }, [rows, COLUMNS, applyEdits, getEffectiveRange]);

  const handleClear = useCallback(() => {
    if (readOnlyRef.current) { setContextMenu(null); return; }
    const range = getEffectiveRange();
    if (!range) return;
    const edits: PasteEdit[] = [];
    for (let r = range.y; r < range.y + range.height; r++) {
      for (let c = range.x; c < range.x + range.width; c++) {
        const key = COLUMNS[c]?.key;
        if (key && editableKeys.has(key)) edits.push({ row: r, colKey: key, val: '' });
      }
    }
    applyEdits(edits);
    setContextMenu(null);
  }, [COLUMNS, editableKeys, applyEdits, getEffectiveRange]);

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
    handlePaste(cell, text.split(/\r\n|\n|\r/).map(r => r.split('\t')));
  }, [getPasteTarget, handlePaste]);

  const handlePasteFromMenu = useCallback(async () => {
    const text = await clipboardRead();
    if (text) pasteTextAtSelection(text);
    setContextMenu(null);
  }, [pasteTextAtSelection]);

  useGlidePasteInterception(pasteTextAtSelection);

  // Physical keyboard (Cmd/Ctrl+C/X/V) — the grid canvas doesn't always hold
  // real focus (iPad), so drive the same handlers the context menu uses.
  const clipboardShortcutsRef = useRef<{ copy: () => void; cut: () => void; paste: () => void }>({
    copy: () => {}, cut: () => {}, paste: () => {},
  });
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
      if (key === 'c') void h.copy();
      else if (key === 'x') h.cut();
      else void h.paste();
    };
    doc.addEventListener('keydown', onKeyDown, true);
    return () => doc.removeEventListener('keydown', onKeyDown, true);
  }, [currentDocument]);

  const onCellContextMenu = useCallback((cell: Item, e: any) => {
    e.preventDefault();
    const [col, row] = cell;
    if (row < 0 || row >= rowsRef.current.length) return;
    const x = (e.bounds?.x ?? 0) + (e.localEventX ?? 0);
    const y = (e.bounds?.y ?? 0) + (e.localEventY ?? 0);
    setContextMenu({ x, y, row, col });
  }, []);

  /** Header right-click → the caller's settings menu (when supplied). */
  const onHeaderContextMenu = useCallback((col: number, e: any) => {
    if (!headerMenuItems) return;
    e.preventDefault?.();
    const x = (e.bounds?.x ?? 0) + (e.localEventX ?? 0);
    const y = (e.bounds?.y ?? 0) + (e.localEventY ?? 0);
    setContextMenu({ x, y, row: -1, col, header: true });
  }, [headerMenuItems]);

  const hasSelection = gridSelection.current?.range !== undefined || gridSelection.rows.length > 0 || gridSelection.columns.length > 0;
  const onGridSelectionChange = useCallback((sel: GridSelection) => {
    gridSelectionRef.current = sel;
    setGridSelection(sel);
    if (selectionKey) SELECTION_CACHE.set(selectionKey, sel);
    emitViewChange();
  }, [selectionKey, emitViewChange]);

  return (
    <div
      ref={wrapperRef}
      className={`inline-glide-table${heightMode === 'fill' ? ' inline-glide-table--scroll flex-1 min-h-0 flex flex-col' : ''}`}
      {...(dataAttr ? { [dataAttr]: '' } : {})}
      {...(dataCategory ? { 'data-category': dataCategory } : {})}
      data-presence-grid={presenceScope}
      onKeyDownCapture={(e) => {
        // Shift+Enter = quick-add (roadmap 337). Captured BEFORE Glide's
        // activate-cell handler so plain Enter keeps committing/activating and
        // the modified chord never opens an editor first.
        if (e.key === 'Enter' && e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey) {
          const add = onAddRowRef.current;
          if (!add || readOnlyRef.current) return;
          e.preventDefault();
          e.stopPropagation();
          const row = gridSelectionRef.current?.current?.cell?.[1] ?? -1;
          const key = add(row >= 0 && row < rowsRef.current.length ? row : null);
          if (typeof key === 'string' && key) pendingAddKeyRef.current = key;
          return;
        }
        // Host key shortcuts on the CURRENT cell (band disclosure arrows).
        const shortcut = onCellKeyDownRef.current;
        const cell = gridSelectionRef.current?.current?.cell;
        if (!shortcut || !cell || e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return;
        const colKey = COLUMNS[cell[0]]?.key;
        if (colKey && shortcut(cell[1], colKey, e.key)) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      onPointerLeave={() => {
        // Moving onto a floating chrome (block editor / palette) that sits over
        // the grid must dismiss the tooltip — Glide's canvas never sees that
        // pointerleave, so clear here.
        if (tooltip) { setTooltip(null); setTooltipAnchor(null); }
        const prev = hoveredRowRef.current;
        if (prev != null) {
          hoveredRowRef.current = null;
          const damage: { cell: Item }[] = [];
          for (let c = 0; c < COLUMNS.length; c++) damage.push({ cell: [c, prev] });
          gridRef.current?.updateCells(damage);
          onRowHoverRef.current?.(null);
        }
      }}
    >
      <div ref={gridSizeRef} className={heightMode === 'fill' ? 'flex-1 min-h-0' : undefined} style={{ touchAction: 'none' }}>
        {/* Auto-fit columns to the card is THIS module's job (COLUMNS above).
            Glide's defaults (min 50 / max 500 per column) would re-clamp our
            scaled widths — a dominant Name column over 500px gets capped and
            the columns no longer sum to the card width, painting a blank
            "extra column" on the right. Pass through our own bounds so the fit
            is authoritative and the table always fills exactly. Mount the
            DataEditor only once a width is measured so it never first paints
            at content width (wrong sizing + phantom scrollbars). */}
        {rows.length === 0 && emptyLabel ? (
          // Keep the measured container mounted for the empty state: rows can
          // arrive later (bridge/peer/collaborator), and an unmounted ref would
          // never attach the width observer (the grid stuck at zero width).
          <div className="px-2.5 py-6 text-center text-xs text-[color:var(--ui-text-faint)]">{emptyLabel}</div>
        ) : gridWidth && gridWidth > 0 ? (
          <DataEditor
            ref={gridRef}
            width={gridWidth}
            height={gridHeight}
            columns={glideColumns}
            rows={rows.length}
            getCellContent={getCell}
            onCellsEdited={onCellsEdited}
            onPaste={handlePaste}
            provideEditor={provideEditor}
            onFinishedEditing={escapeCancel.onFinishedEditing}
            onCellActivated={onCellActivated}
            customRenderers={[...controlCellRenderers, infoGlyphRenderer, colorSwatchRenderer, disclosureGlyphRenderer]}
            getCellsForSelection={true}
            gridSelection={gridSelection}
            onGridSelectionChange={onGridSelectionChange}
            highlightRegions={peerHighlights}
            theme={createTheme(fontSize)}
            rowHeight={rowH}
            headerHeight={headerH}
            drawHeader={drawHeader}
            onCellClicked={rowActions ? onCellClicked : undefined}
            onItemHovered={onItemHovered}
            onCellContextMenu={onCellContextMenu}
            onHeaderContextMenu={onHeaderContextMenu}
            editOnType
            smoothScrollX={smoothScroll}
            smoothScrollY={smoothScroll}
            rangeSelect="rect"
            cellActivationBehavior="double-click"
            rowSelectionMode="single"
            fillHandle
            portalElementRef={gridPortalRef}
            readonly={!!readOnly}
            minColumnWidth={1}
            maxColumnWidth={10000}
            {...({ experimental: { eventTarget: currentDocument } } as any)}
          />
        ) : (
          <div style={{ height: gridHeight }} />
        )}
      </div>

      <ContextMenu open={!!contextMenu} x={contextMenu?.x ?? 0} y={contextMenu?.y ?? 0} onClose={() => setContextMenu(null)}>
        {contextMenu && contextMenu.header && headerMenuItems ? (
          <>{headerMenuItems(() => setContextMenu(null))}</>
        ) : contextMenu ? (
          <>
            {rowMenuItems && contextMenu.row >= 0 && (
              <>
                {rowMenuItems(contextMenu.row, () => setContextMenu(null))}
                <ContextMenuDivider />
              </>
            )}
            <ContextMenuItem onClick={() => void handleCopy()} icon={<Copy className="w-3.5 h-3.5" />} disabled={!hasSelection}>
              Copy
            </ContextMenuItem>
            <ContextMenuItem onClick={() => void handlePasteFromMenu()} icon={<ClipboardPaste className="w-3.5 h-3.5" />} disabled={readOnly}>
              Paste
            </ContextMenuItem>
            <ContextMenuItem onClick={handleClear} icon={<Trash2 className="w-3.5 h-3.5 text-[color:var(--ui-text-faint)]" />} disabled={!hasSelection || readOnly}>
              Clear
            </ContextMenuItem>
            <ContextMenuDivider />
            <ContextMenuItem onClick={handleCut} icon={<Scissors className="w-3.5 h-3.5 text-[color:var(--ui-text-faint)]" />} disabled={!hasSelection || readOnly}>
              Cut
            </ContextMenuItem>
          </>
        ) : null}
      </ContextMenu>

      {rowTooltip && tooltip && tooltipAnchor && (
        <FloatingTooltip open anchor={tooltipAnchor}>
          {rowTooltip(rows[tooltip.row], tooltip.row)}
        </FloatingTooltip>
      )}
    </div>
  );
};

export default InlineGlideTable;
