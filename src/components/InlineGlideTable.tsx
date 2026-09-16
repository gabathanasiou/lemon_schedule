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
import { useSpreadsheetFontSize, SS_FONT_SIZE_DEFAULT } from '../lib/persist';
import { IS_COARSE } from '../lib/device';
import { createGlideTheme } from '../lib/glideTheme';
import { useGlideFill } from '../lib/glideFill';
import { textCell, buildCopyText, buildCutPlan } from '../lib/glideCells';
import { expandRangeFill, planGridPaste, type PasteEdit } from '../lib/glidePaste';
import { useGlidePasteInterception } from '../lib/glidePasteIntercept';
import { createGlideCellEditor, type GlideColumnEditor } from '../lib/glideEditor';
import { usePortalTarget, useCurrentDocument } from '../lib/popoutTarget';
import { clipboardRead, clipboardWrite } from '../lib/utils';
import { ContextMenu, ContextMenuItem, ContextMenuDivider } from './ContextMenu';
import { FloatingTooltip } from './FloatingTooltip';

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
  icon: 'plus' | 'trash';
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
  /** DOM data attribute for tests/scoping (e.g. `data-day-times-glide`). */
  dataAttr?: string;
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
   *  dispatches the one clicked. */
  rowActions?: (rowIndex: number) => InlineGlideRowAction[];
}

const DEFAULT_ROW_HEIGHT = 28;
const DEFAULT_HEADER_HEIGHT = 30;
/** Synthetic trailing row-actions column (key `actions` — skipped by copy/cut). */
const ACTIONS_COLUMN: InlineGlideColumn = { key: 'actions', label: '', width: 34 };

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
  dataAttr,
  headerMenuItems,
  rowTooltip,
  onRowHover,
  editors,
  getEditor,
  rowActions,
}) => {
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const readOnlyRef = useRef(!!readOnly);
  readOnlyRef.current = !!readOnly;

  // The grid fills the card: measure the wrapper and distribute the columns so
  // the table never scrolls sideways. The second column absorbs the rounding
  // remainder, so the widths always sum to exactly the available width.
  const { ref: gridSizeRef, width: gridWidth } = useGlideFill<HTMLDivElement>();

  const [fontSize] = useSpreadsheetFontSize(IS_COARSE ? 12.5 : undefined);
  const rowH = Math.round((baseRowHeight * fontSize) / SS_FONT_SIZE_DEFAULT);
  const headerH = Math.round((baseHeaderHeight * fontSize) / SS_FONT_SIZE_DEFAULT);

  const COLUMNS = useMemo(() => {
    const total = columns.reduce((s, c) => s + c.width, 0);
    if (!gridWidth || gridWidth <= 0 || total <= 0) {
      return rowActions ? [...columns, ACTIONS_COLUMN] : columns;
    }
    const target = Math.max(120, Math.floor(gridWidth) - 1) - (rowActions ? ACTIONS_COLUMN.width : 0);
    const flexIdx = Math.min(1, columns.length - 1);
    const widths = columns.map(c => Math.max(40, Math.floor((c.width / total) * target)));
    let sum = widths.reduce((s, w) => s + w, 0);
    if (flexIdx >= 0) {
      if (sum > target) widths[flexIdx] = Math.max(40, widths[flexIdx] - (sum - target));
      sum = widths.reduce((s, w) => s + w, 0);
      if (sum < target) widths[flexIdx] += target - sum;
    }
    const out = columns.map((c, i) => ({ ...c, width: widths[i] }));
    if (rowActions) out.push(ACTIONS_COLUMN);
    return out;
  }, [columns, gridWidth, rowActions]);

  const glideColumns: GridColumn[] = useMemo(
    () => COLUMNS.map(c => ({ title: c.label.toUpperCase(), width: c.width })),
    [COLUMNS],
  );

  const contentHeight = headerH + rows.length * rowH;

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
  const gridPortalRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    gridPortalRef.current = portalTarget ? portalTarget.querySelector('#portal') : document.getElementById('portal');
  }, [portalTarget]);

  // Optional inline dropdown editors (crew slot person/call). Column offset 0:
  // this grid has no row-marker column, so Glide's reported col IS the data col.
  const provideEditor = useMemo(
    () => (editors || getEditor)
      ? createGlideCellEditor({
          readOnlyRef,
          columns: COLUMNS,
          getValue: (row, colKey) => String(rowsRef.current[row]?.[colKey] ?? ''),
          editors,
          getEditor,
          portalRef: gridPortalRef,
          columnOffset: 0,
        })
      : undefined,
    [COLUMNS, editors, getEditor],
  );

  const gridRef = useRef<DataEditorRef>(null);
  // Row-action glyphs (drawn on the canvas — Glide cells can't host React).
  const trashImg = useRef<HTMLImageElement | null>(null);
  const plusImg = useRef<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!rowActions) return;
    const trashSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>';
    const plusSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3f3f46" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>';
    const t = new Image();
    t.src = 'data:image/svg+xml;base64,' + btoa(trashSvg);
    trashImg.current = t;
    const p = new Image();
    p.src = 'data:image/svg+xml;base64,' + btoa(plusSvg);
    plusImg.current = p;
  }, [rowActions]);
  const [gridSelection, setGridSelection] = useState<GridSelection>({
    columns: CompactSelection.empty(),
    rows: CompactSelection.empty(),
  });
  const gridSelectionRef = useRef(gridSelection);
  gridSelectionRef.current = gridSelection;
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
  const wrapperRef = useRef<HTMLDivElement>(null);
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

  // Hover/affordance model: EDITABLE cells get a light-blue fill (they read as
  // "you can type here") that deepens on the hovered row; READ-ONLY cells stay
  // on the plain card background with faint text at rest and pick up a subtle
  // NEUTRAL hover so the whole row still responds — never a gray "disabled"
  // box, never the blue (which is the editable cue). Fully read-only grids
  // (stage-less fallbacks) don't tint at all. Repaint just the two affected
  // rows on hover change.
  const EDITABLE_BG = '#eff6ff';
  const EDITABLE_HOVER_BG = '#dbeafe';
  const READONLY_HOVER_BG = '#f4f4f5';
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
    if (colDef.key === 'actions') {
      // Synthetic row-delete cell: readonly, pointer, neutral hover.
      const hovered = row === hoveredRowRef.current;
      return textCell('', {
        readonly: true,
        allowOverlay: false,
        cursor: 'pointer',
        themeOverride: hovered ? { bgCell: READONLY_HOVER_BG } : undefined,
      });
    }
    const cell = getCellContent(colDef, r, row);
    if (readOnlyRef.current) return cell;
    const hovered = row === hoveredRowRef.current;
    const isReadonly = !!(cell as any).readonly;
    if (!isReadonly) {
      // Editable: blue rest fill, deeper blue on the hovered row. Preserves
      // the caller's text colour (e.g. amber overrides).
      const bg = hovered ? EDITABLE_HOVER_BG : EDITABLE_BG;
      return { ...cell, themeOverride: { ...((cell as any).themeOverride || {}), bgCell: bg, bgCellMedium: bg } };
    }
    if (hovered) {
      // Read-only: neutral hover only — plain idle, faint text.
      return { ...cell, themeOverride: { ...((cell as any).themeOverride || {}), bgCell: READONLY_HOVER_BG, bgCellMedium: READONLY_HOVER_BG } };
    }
    return cell;
  }, [COLUMNS, getCellContent]);

  /** Glide draws header text left-aligned only; repaint centered columns so
   *  each title lines up with its (centered) cells. */
  const drawHeader = useCallback((args: any, drawContent: () => void) => {
    drawContent();
    const { ctx, rect, column, columnIndex, theme } = args;
    const colDef = COLUMNS[columnIndex];
    if (!colDef || (colDef.align ?? 'left') !== 'center') return;
    ctx.save();
    ctx.fillStyle = theme.bgHeader;
    ctx.fillRect(rect.x + 1, rect.y, rect.width - 2, rect.height);
    ctx.fillStyle = theme.textHeader;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(column.title, rect.x + rect.width / 2, rect.y + rect.height / 2);
    ctx.restore();
  }, [COLUMNS]);

  /** Draw each row's action glyphs on the synthetic actions column. */
  const drawCell = useCallback((args: any, drawContent: () => void) => {
    drawContent();
    const colDef = COLUMNS[args.col];
    if (!colDef || colDef.key !== 'actions') return;
    if (args.row >= rowsRef.current.length) return;
    const actions = rowActions?.(args.row);
    if (!actions || actions.length === 0) return;
    const { ctx, rect } = args;
    const slot = rect.width / actions.length;
    const size = Math.min(13, slot - 4, rect.height - 4);
    actions.forEach((action, i) => {
      const img = action.icon === 'plus' ? plusImg.current : trashImg.current;
      if (!img || !img.complete) return;
      const cx = rect.x + slot * i + slot / 2;
      ctx.drawImage(img, cx - size / 2, rect.y + (rect.height - size) / 2, size, size);
    });
  }, [COLUMNS, rowActions]);

  /** Row-action click (hit-tests the glyph within the synthetic column). */
  const onCellClicked = useCallback((cell: Item, event: any) => {
    if (!rowActions) return;
    if (COLUMNS[cell[0]]?.key !== 'actions') return;
    const row = cell[1];
    if (row < 0 || row >= rowsRef.current.length) return;
    const actions = rowActions(row);
    if (!actions || actions.length === 0) return;
    const width = event?.bounds?.width ?? 0;
    const localX = event?.localEventX ?? 0;
    const idx = width > 0 ? Math.min(actions.length - 1, Math.max(0, Math.floor(localX / (width / actions.length)))) : 0;
    actions[idx]?.onClick();
  }, [COLUMNS, rowActions]);

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

  const getEffectiveRange = useCallback((): { x: number; y: number; width: number; height: number } | null => {
    const sel = gridSelectionRef.current;
    if (sel?.current?.range) return sel.current.range;
    if (sel.rows.length > 0) {
      const selected = Array.from({ length: rows.length }, (_, i) => i).filter(i => sel.rows.hasIndex(i));
      if (selected.length === 0) return null;
      return { x: 0, y: selected[0], width: COLUMNS.length, height: selected.length };
    }
    if (sel.columns.length > 0) {
      const selected = Array.from({ length: COLUMNS.length }, (_, i) => i).filter(i => sel.columns.hasIndex(i));
      if (selected.length === 0) return null;
      return { x: selected[0], y: 0, width: selected.length, height: rows.length };
    }
    return null;
  }, [rows.length, COLUMNS.length]);

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
      val: e.value.kind === GridCellKind.Text ? e.value.data : '',
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

  if (rows.length === 0 && emptyLabel) {
    return <div className="px-2.5 py-6 text-center text-xs text-zinc-400">{emptyLabel}</div>;
  }

  return (
    <div
      ref={wrapperRef}
      className="inline-glide-table"
      {...(dataAttr ? { [dataAttr]: '' } : {})}
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
      <div ref={gridSizeRef} style={{ touchAction: 'none' }}>
        {/* Auto-fit columns to the card is THIS module's job (COLUMNS above).
            Glide's defaults (min 50 / max 500 per column) would re-clamp our
            scaled widths — a dominant Name column over 500px gets capped and
            the columns no longer sum to the card width, painting a blank
            "extra column" on the right. Pass through our own bounds so the fit
            is authoritative and the table always fills exactly. Mount the
            DataEditor only once a width is measured so it never first paints
            at content width (wrong sizing + phantom scrollbars). */}
        {gridWidth && gridWidth > 0 ? (
          <DataEditor
            ref={gridRef}
            width={gridWidth}
            height={contentHeight}
            columns={glideColumns}
            rows={rows.length}
            getCellContent={getCell}
            onCellsEdited={onCellsEdited}
            onPaste={handlePaste}
            provideEditor={provideEditor}
            getCellsForSelection={true}
            gridSelection={gridSelection}
            onGridSelectionChange={setGridSelection}
            theme={createTheme(fontSize)}
            rowHeight={rowH}
            headerHeight={headerH}
            drawHeader={drawHeader}
            drawCell={rowActions ? drawCell : undefined}
            onCellClicked={rowActions ? onCellClicked : undefined}
            onItemHovered={onItemHovered}
            onCellContextMenu={onCellContextMenu}
            onHeaderContextMenu={onHeaderContextMenu}
            editOnType
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
          <div style={{ height: contentHeight }} />
        )}
      </div>

      <ContextMenu open={!!contextMenu} x={contextMenu?.x ?? 0} y={contextMenu?.y ?? 0} onClose={() => setContextMenu(null)}>
        {contextMenu && contextMenu.header && headerMenuItems ? (
          <>{headerMenuItems(() => setContextMenu(null))}</>
        ) : contextMenu ? (
          <>
            <ContextMenuItem onClick={() => void handleCopy()} icon={<Copy className="w-3.5 h-3.5" />} disabled={!hasSelection}>
              Copy
            </ContextMenuItem>
            <ContextMenuItem onClick={() => void handlePasteFromMenu()} icon={<ClipboardPaste className="w-3.5 h-3.5" />} disabled={readOnly}>
              Paste
            </ContextMenuItem>
            <ContextMenuItem onClick={handleClear} icon={<Trash2 className="w-3.5 h-3.5 text-zinc-400" />} disabled={!hasSelection || readOnly}>
              Clear
            </ContextMenuItem>
            <ContextMenuDivider />
            <ContextMenuItem onClick={handleCut} icon={<Scissors className="w-3.5 h-3.5 text-zinc-400" />} disabled={!hasSelection || readOnly}>
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
