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
import { planGridPaste, type PasteEdit } from '../lib/glidePaste';
import { useGlidePasteInterception } from '../lib/glidePasteIntercept';
import { usePortalTarget, useCurrentDocument } from '../lib/popoutTarget';
import { clipboardRead, clipboardWrite } from '../lib/utils';
import { ContextMenu, ContextMenuItem, ContextMenuDivider } from './ContextMenu';

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
}

const DEFAULT_ROW_HEIGHT = 28;
const DEFAULT_HEADER_HEIGHT = 30;

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
    if (!gridWidth || gridWidth <= 0 || total <= 0) return columns;
    const target = Math.max(120, Math.floor(gridWidth) - 1);
    const flexIdx = Math.min(1, columns.length - 1);
    const widths = columns.map(c => Math.max(40, Math.floor((c.width / total) * target)));
    let sum = widths.reduce((s, w) => s + w, 0);
    if (flexIdx >= 0) {
      if (sum > target) widths[flexIdx] = Math.max(40, widths[flexIdx] - (sum - target));
      sum = widths.reduce((s, w) => s + w, 0);
      if (sum < target) widths[flexIdx] += target - sum;
    }
    return columns.map((c, i) => ({ ...c, width: widths[i] }));
  }, [columns, gridWidth]);

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

  const gridRef = useRef<DataEditorRef>(null);
  const [gridSelection, setGridSelection] = useState<GridSelection>({
    columns: CompactSelection.empty(),
    rows: CompactSelection.empty(),
  });
  const gridSelectionRef = useRef(gridSelection);
  gridSelectionRef.current = gridSelection;
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; row: number; col: number; header?: boolean } | null>(null);

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
    const damage: { cell: Item }[] = [];
    if (prev != null) for (let c = 0; c < COLUMNS.length; c++) damage.push({ cell: [c, prev] });
    if (row != null) for (let c = 0; c < COLUMNS.length; c++) damage.push({ cell: [c, row] });
    if (damage.length) gridRef.current?.updateCells(damage);
  }, [COLUMNS.length]);

  const getCell = useCallback(([col, row]: Item): GridCell => {
    const colDef = COLUMNS[col];
    const r = rowsRef.current[row];
    if (!colDef || !r) return textCell('', { readonly: true, allowOverlay: false });
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

  const onCellsEdited = useCallback((edits: readonly { location: Item; value: EditableGridCell }[]) => {
    if (readOnlyRef.current) return false;
    applyEdits(edits.map(e => ({
      row: e.location[1],
      colKey: COLUMNS[e.location[0]]?.key || '',
      val: e.value.kind === GridCellKind.Text ? e.value.data : '',
    })));
    return true;
  }, [COLUMNS, applyEdits]);

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
    <div className="inline-glide-table" {...(dataAttr ? { [dataAttr]: '' } : {})}>
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
            getCellsForSelection={true}
            gridSelection={gridSelection}
            onGridSelectionChange={setGridSelection}
            theme={createTheme(fontSize)}
            rowHeight={rowH}
            headerHeight={headerH}
            drawHeader={drawHeader}
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
    </div>
  );
};

export default InlineGlideTable;
