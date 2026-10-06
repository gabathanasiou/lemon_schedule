import React, { useMemo, useState } from 'react';
import { ReportBlock, ReportCollection, ReportTextStyle } from '../../types';
import { ReportCtx } from '../../lib/reportData';
import { ReportFieldDef, FieldAux, buildLookupTokens, fieldsForScope, getReportFieldDefs, composeCellRefKey, composeRelativeCellRefKey, parseCellRefKey, cellRefChain } from '../../lib/reportFields';
import { normalizeColWidths } from '../../lib/ribbonDefaults';
import { IS_COARSE } from '../../lib/device';
import { useTableColumnReorder } from './useTableColumnReorder';
import { useColumnResize, ColumnResizeStrip } from '../columnResize';
import { CellRef, isCovered, rectCovers } from '../../lib/reportTableMerges';
import { CustomCellSelection, useCustomTableCells } from './useCustomTableCells';
import { BodyBand, HeaderBand } from './CustomTableBands';
import TableCellChrome from './TableCellChrome';
import CustomCellControls, { cellStructureOps } from './CustomCellControls';
import CustomTableContextMenu, { CustomTableMenuState } from './CustomTableContextMenu';
import CustomCellRefMenu, { CellRefMenuAction, filterCellRefMenu } from './CustomCellRefMenu';
import { RichTextEditorHandle, RICH_TEXT_STATE_IDLE, RichTextState } from './RichTextEditor';

// Free table (item 10, roadmap 188/189): literal rows × columns; every cell
// is rich text with `@` tokens. In the designer (`hint` + `onPatchBlock`) the
// table edits ITSELF — headers type in place, row/column +/× controls and the
// row-height grip live on the cells (no block chrome), cells select as a
// rectangular range with merge/unmerge + per-cell formatting in a floating
// chrome and a right-click menu. Rows render as grid BANDS (vertical merges =
// grid-row spans); the `.report-table-cols`/`.rm-row` classes keep the
// measured paginator splitting between bands for free. Preview/print resolve
// the tokens to static HTML.

export interface CustomTableProps {
  block: ReportBlock;
  ctx: ReportCtx;
  fieldMap: Record<string, ReportFieldDef>;
  item?: any;
  aux?: FieldAux;
  baseStyle: React.CSSProperties;
  cellPad: React.CSSProperties;
  border: string;
  hint?: boolean;
  rowRange?: [number, number];
  repeatTableHeader?: boolean;
  onPatchBlock?: (patch: Partial<ReportBlock>) => void;
  /** Designer canvas: the block is selected — shows the column-resize strip. */
  selected?: boolean;
  /** Controlled cell selection (designer): the docked inspector mirrors it. */
  cellSelection?: CustomCellSelection | null;
  onCellSelectionChange?: (sel: CustomCellSelection | null) => void;
  /** Designer-owned ref the focused cell's editor publishes itself into —
   *  the dock's format toolbar execs against it. */
  cellEditorRef?: React.MutableRefObject<RichTextEditorHandle | null>;
  onCellRtStateChange?: (state: RichTextState) => void;
  /** Docked editor mode: the dock hosts the cell controls — no floating chrome. */
  cellDocked?: boolean;
  /** Field scope for the cell chrome's "Insert attribute" picker. */
  parentCollection?: ReportCollection;
  parentCategory?: string;
  /** Persist named text styles edited from the cell chrome's style menu. */
  onCellSaveTextStyles?: (styles: ReportTextStyle[]) => void;
}

const CustomTable: React.FC<CustomTableProps> = ({ block, ctx, fieldMap, item, aux, baseStyle, cellPad, border, hint, rowRange, repeatTableHeader, onPatchBlock, selected, cellSelection, onCellSelectionChange, cellEditorRef, onCellRtStateChange, cellDocked, parentCollection, parentCategory, onCellSaveTextStyles }) => {
  const editable = !!hint && !!onPatchBlock;
  const fields = useMemo(() => getReportFieldDefs(ctx.project), [ctx.project]);
  // Contextual `@` suggestions: cell editors get the SAME scope-filtered field
  // list text blocks get, so fields that need a repeat parent (scene/day/
  // element fields) only appear where they resolve. `fields` stays the full
  // registry for lookup chip labels + the `.` attribute stage.
  const contextFields = useMemo(() => fieldsForScope(fields, parentCollection, parentCategory), [fields, parentCollection, parentCategory]);
  const lookupTokens = useMemo(
    () => buildLookupTokens(ctx.project, ctx.dayInfos.map(d => ({ index: d.section.index, chronoDay: d.chronoDay, date: d.date }))),
    [ctx.project, ctx.dayInfos],
  );
  const cells = useCustomTableCells({
    block,
    patch: onPatchBlock,
    selection: cellSelection,
    onSelectionChange: onCellSelectionChange,
  });
  const { rows, columns, merges, bands, selection, select, selectionRect, focusStyle, label, canMerge, canUnmerge } = cells;
  const [menu, setMenu] = useState<CustomTableMenuState | null>(null);
  const patch = (p: Partial<ReportBlock>) => onPatchBlock?.(p);

  // Focused-cell editor handle + inline formatting state. The designer passes
  // its own ref/state so the docked toolbar shares the exact same targets.
  const [localEditorRef] = useState<React.MutableRefObject<RichTextEditorHandle | null>>(() => ({ current: null }));
  const focusedEditorRef = cellEditorRef ?? localEditorRef;
  const [rtState, setRtState] = useState<RichTextState>(RICH_TEXT_STATE_IDLE);
  const rtCbRef = React.useRef(onCellRtStateChange);
  rtCbRef.current = onCellRtStateChange;
  const handleRtState = (state: RichTextState) => { setRtState(state); rtCbRef.current?.(state); };
  const focusKey = selection ? `${selection.focus.rowId}:${selection.focus.colId}` : null;
  React.useEffect(() => {
    setRtState(RICH_TEXT_STATE_IDLE);
    rtCbRef.current?.(RICH_TEXT_STATE_IDLE);
  }, [focusKey]);

  // The `=` referencing menu (roadmap 190): intercept `=` in an empty cell
  // (it never enters the editor), own the following keystrokes for the query,
  // insert a relative cellref at the caret, or enter click-a-cell pick mode.
  const [refMenu, setRefMenu] = useState<{ rowId: string; colId: string; query: string; highlight: number } | null>(null);
  const [pickSource, setPickSource] = useState<CellRef | null>(null);
  const [hoverCell, setHoverCell] = useState<CellRef | null>(null);
  const cellIsEmpty = (html: string) => !html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').trim();

  const handleRefPick = (id: CellRefMenuAction) => {
    const source = refMenu ? { rowId: refMenu.rowId, colId: refMenu.colId } : null;
    if (!source) return;
    if (id === 'pick') {
      setPickSource(source);
      setRefMenu(null);
      select(null);
      // Leave the editor so typing can't land in the source cell while picking.
      (document.activeElement as HTMLElement | null)?.blur?.();
      return;
    }
    const delta: Record<Exclude<CellRefMenuAction, 'pick'>, [number, number]> = {
      left: [-1, 0], right: [1, 0], above: [0, -1], below: [0, 1],
    };
    const [dx, dy] = delta[id];
    const key = composeRelativeCellRefKey(dx, dy);
    setRefMenu(null);
    // Insert through the focused source editor so the caret lands after the
    // chip and the kit's `.` attribute stage keeps working.
    if (focusedEditorRef.current) {
      focusedEditorRef.current.insertToken(key);
      return;
    }
    const ri = rows.findIndex(r => r.id === source.rowId);
    const ci = columns.findIndex(c => c.id === source.colId);
    if (ri >= 0 && ci >= 0) cells.commitCell(ri, ci, `{{${key}}}`);
  };

  const handleRefKeyDown = (e: React.KeyboardEvent, rowId: string, colId: string, html: string): void => {
    // Pick mode owns all typing — the source cell must never receive it.
    if (pickSource) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (!refMenu) {
      if (e.key === '=' && cellIsEmpty(html)) {
        e.preventDefault();
        e.stopPropagation();
        setRefMenu({ rowId, colId, query: '', highlight: 0 });
      }
      return;
    }
    if (refMenu.rowId !== rowId || refMenu.colId !== colId) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setRefMenu(null);
      return;
    }
    const entries = filterCellRefMenu(refMenu.query);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      if (entries.length) {
        const step = e.key === 'ArrowDown' ? 1 : -1;
        setRefMenu(m => m && { ...m, highlight: (m.highlight + step + entries.length) % entries.length });
      }
      return;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      const entry = entries[refMenu.highlight];
      if (entry) handleRefPick(entry.id);
      return;
    }
    if (e.key === 'Backspace') {
      e.preventDefault();
      e.stopPropagation();
      setRefMenu(m => m && { ...m, query: m.query.slice(0, -1), highlight: 0 });
      return;
    }
    if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      e.stopPropagation();
      setRefMenu(m => m && { ...m, query: m.query + e.key, highlight: 0 });
    }
  };

  /** Tab / Shift+Tab move the selection AND the focus to the next/previous
   *  body cell (row-major, merged cells skipped, no wrap) so the new cell is
   *  live — outline follows, and `=` opens the referencing menu there. */
  const handleCellTab = (e: React.KeyboardEvent, rowId: string, colId: string): void => {
    if (pickSource) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    const ri = rows.findIndex(r => r.id === rowId);
    const ci = columns.findIndex(c => c.id === colId);
    if (ri < 0 || ci < 0) return;
    const dir = e.shiftKey ? -1 : 1;
    const total = rows.length * columns.length;
    for (let step = 1; step <= total; step++) {
      const next = ri * columns.length + ci + dir * step;
      if (next < 0 || next >= total) return;
      const nr = Math.floor(next / columns.length);
      const nc = next % columns.length;
      const targetRow = rows[nr];
      const targetCol = columns[nc];
      if (isCovered(merges, rows, columns, targetRow.id, targetCol.id)) continue;
      e.preventDefault();
      e.stopPropagation();
      const ref = { rowId: targetRow.id, colId: targetCol.id };
      select({ anchor: ref, focus: ref });
      const el = rootRef.current?.querySelector<HTMLElement>(`[data-cell="${ref.rowId}:${ref.colId}"] .tiptap`);
      queueMicrotask(() => el?.focus());
      return;
    }
  };

  const handlePickTarget = (ref: CellRef) => {
    const source = pickSource;
    setPickSource(null);
    if (!source) return;
    const ri = rows.findIndex(r => r.id === source.rowId);
    const ci = columns.findIndex(c => c.id === source.colId);
    if (ri < 0 || ci < 0) return;
    // Blur the source editor first so the kit's external-value sync applies
    // the patched token (the roadmap's blur → patch flow). Deferred a tick:
    // blur handlers can leave React mid-lifecycle, and dispatch() is flushSync.
    queueMicrotask(() => {
      (document.activeElement as HTMLElement | null)?.blur?.();
      cells.commitCell(ri, ci, `{{${composeCellRefKey(ref.rowId, ref.colId)}}}`);
    });
  };

  /** Hovering a cellref chip highlights the PARENT SOURCE of the info — the
   *  origin cell at the end of the reference chain (not every hop). */
  const handleChipHover = (rowId: string, colId: string, key: string | null) => {
    const parsed = key ? parseCellRefKey(key) : null;
    const chain = parsed ? cellRefChain(block, { rowId, colId }, parsed) : [];
    const origin = chain.length ? chain[chain.length - 1] : null;
    const next = origin ? { rowId: origin.rowId, colId: origin.colId } : null;
    setHoverCell(prev => (prev?.rowId === next?.rowId && prev?.colId === next?.colId ? prev : next));
  };

  // Pick mode: Esc or a pointerdown outside a body cell cancels.
  React.useEffect(() => {
    if (!pickSource) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest?.('[data-pick-target]') && rootRef.current?.contains(t)) return;
      setPickSource(null);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPickSource(null); };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [pickSource]);

  // Selection moving off the formula cell closes the referencing menu.
  React.useEffect(() => {
    if (!refMenu) return;
    if (selection && selection.focus.rowId === refMenu.rowId && selection.focus.colId === refMenu.colId) return;
    setRefMenu(null);
  }, [refMenu, selection]);

  React.useEffect(() => {
    if (!selected) { select(null); setMenu(null); setRefMenu(null); setPickSource(null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const selectCell = (ref: CellRef, shift: boolean) => {
    select(shift && selection ? { anchor: selection.anchor, focus: ref } : { anchor: ref, focus: ref });
  };
  const handleCellContextMenu = (e: React.MouseEvent, ref: CellRef) => {
    if (!editable) return;
    e.preventDefault();
    e.stopPropagation();
    if (pickSource) { setPickSource(null); return; }
    if (!selectionRect || !rectCovers(rows, columns, selectionRect, ref.rowId, ref.colId)) {
      select({ anchor: ref, focus: ref });
    }
    setMenu({ x: e.clientX, y: e.clientY });
  };

  const { startDrag, colOutline } = useTableColumnReorder({
    enabled: editable,
    onMove: (from, to) => cells.moveColumn(from, to),
  });

  // Row resize: the shared drag engine in vertical mode (px heights, only the
  // row above the boundary changes). Heights are measured from the per-row
  // overlay grid items (`data-row-id`) inside each band.
  const rootRef = React.useRef<HTMLDivElement>(null);
  const startHeightsRef = React.useRef<number[]>([]);
  const rowEls = () => rootRef.current
    ? (Array.from(rootRef.current.querySelectorAll('.report-ct-row[data-row-id]')) as HTMLElement[])
    : [];
  const startRowResize = useColumnResize(rows.map(r => r.height ?? 0), {
    axis: 'y',
    redistribute: false,
    minSize: 14,
    getSizes: () => {
      startHeightsRef.current = rowEls().map(el => el.offsetHeight);
      return startHeightsRef.current;
    },
    // Live-apply rewrites each band's track sizes from the measured heights
    // (React owns gridTemplateRows, so no stale inline minHeight can linger).
    apply: (heights) => {
      const bandEls = rootRef.current?.querySelectorAll('.rm-row');
      if (!bandEls) return;
      let cursor = 0;
      bandEls.forEach((el, bi) => {
        const band = bands[bi];
        if (!band) return;
        const tracks = band.rows.map((_, i) => `${Math.max(14, Math.round(heights[cursor + i] ?? 0))}px`);
        cursor += band.rows.length;
        (el as HTMLElement).style.gridTemplateRows = tracks.join(' ');
      });
    },
    commit: (heights, ci) => {
      const next = Math.round(heights[ci]);
      if (next !== startHeightsRef.current[ci]) cells.setRowHeight(ci, next);
    },
  });

  // Direct border drag (mouse only): grabbing the vertical boundary between
  // columns or the horizontal boundary between rows resizes with the SAME
  // shared engine the tabs use. The strip tab, every cell-border segment of
  // the boundary and the drag all share ONE active state.
  const stripRef = React.useRef<HTMLDivElement>(null);
  const [hoverCol, setHoverCol] = React.useState<number | null>(null);
  const [dragCol, setDragCol] = React.useState<number | null>(null);
  const activeCol = dragCol ?? hoverCol;
  React.useEffect(() => {
    if (dragCol === null) return;
    const clear = () => setDragCol(null);
    window.addEventListener('pointerup', clear);
    return () => window.removeEventListener('pointerup', clear);
  }, [dragCol]);
  // Live-apply updates every band's grid tracks (anchors span tracks) plus
  // the strip — no per-cell widths anymore.
  const writeTrackWidths = (widths: number[]) => {
    const template = widths.map(w => `${w}%`).join(' ');
    rootRef.current?.querySelectorAll('.rm-row, .rm-header').forEach(el => {
      (el as HTMLElement).style.gridTemplateColumns = template;
    });
    if (stripRef.current) stripRef.current.style.gridTemplateColumns = template;
  };
  const startColBorderResize = useColumnResize(columns.map(c => c.width), {
    getWidth: () => rootRef.current?.clientWidth || 1,
    apply: writeTrackWidths,
    commit: (widths) => {
      const normalized = normalizeColWidths(widths);
      patch({ columns: columns.map((c, i) => ({ ...c, width: normalized[i] ?? c.width })) });
    },
  });
  const startColResize = (ci: number, e: React.PointerEvent) => {
    setDragCol(ci);
    startColBorderResize(ci, e);
  };

  const shownBands = rowRange ? bands.slice(rowRange[0], rowRange[1]) : bands;
  const shared = {
    block, columns, merges, cellStyles: cells.cellStyles, baseStyle, cellPad, border, editable,
    selection, selectionRect, focusKey, focusedEditorRef, rtState, onRtStateChange: handleRtState,
    onSelectCell: selectCell, onCellContextMenu: handleCellContextMenu,
    activeCol, onColHover: setHoverCol, colOutline, startColResize,
    ctx, fieldMap, item, aux, fields, contextFields, lookupTokens,
    pickSource, onPickTarget: handlePickTarget, onRefKeyDown: handleRefKeyDown,
    refMenuOpen: !!refMenu, onCellTab: handleCellTab,
    onRefHover: (i: number) => setRefMenu(m => m && { ...m, highlight: i }),
    hoverCell, onChipHover: handleChipHover,
  };

  return (
    <div className="report-ct-root" data-picking={pickSource ? '1' : undefined}>
      {editable && selected && (
        <div className={`${IS_COARSE ? 'h-10' : 'h-5'} select-none`}>
          <ColumnResizeStrip
            widths={columns.map(c => c.width)}
            startResize={startColResize}
            containerRef={stripRef}
            activeIndex={activeCol}
            onHoverIndex={setHoverCol}
            onResetBoundary={cells.resetColumnBoundary}
          />
        </div>
      )}
      <div ref={rootRef} className="report-table-cols" style={{ borderTop: border, borderLeft: border }}>
        <HeaderBand
          shared={shared}
          show={!!(block.showHeader && (rowRange ? rowRange[0] === 0 || repeatTableHeader : true))}
          setHeader={cells.setHeader}
          insertColumnAfter={i => cells.insertColumnAt(i + 1)}
          removeColumn={cells.removeColumn}
          duplicateColumn={cells.duplicateColumn}
          startColumnDrag={startDrag}
        />
        {shownBands.map(band => (
          <BodyBand
            key={band.rows[0].id}
            shared={shared}
            band={band}
            rowCount={rows.length}
            commitCell={cells.commitCell}
            insertRowBelow={cells.insertRowAt}
            removeRow={cells.removeRow}
            duplicateRow={cells.duplicateRow}
            startRowResize={startRowResize}
            setRowHeight={cells.setRowHeight}
          />
        ))}
      </div>
      {editable && selected && !cellDocked && selection && selectionRect && (
        <TableCellChrome focus={selection.focus}>
          <CustomCellControls
            label={label}
            canMerge={canMerge}
            canUnmerge={canUnmerge}
            project={ctx.project}
            styleValue={focusStyle}
            objectMixed={cells.rangeMixed}
            editorRef={focusedEditorRef}
            active={rtState}
            onMerge={cells.merge}
            onUnmerge={cells.unmerge}
            onStyle={cells.patchStyle}
            onReset={cells.resetCells}
            onSaveTextStyles={onCellSaveTextStyles}
            onDeselect={() => select(null)}
            structure={cellStructureOps(cells)}
          />
        </TableCellChrome>
      )}
      {editable && (
        <CustomTableContextMenu
          menu={menu}
          rect={selectionRect}
          canMerge={canMerge}
          canUnmerge={canUnmerge}
          canDeleteRows={cells.canDeleteRows}
          canDeleteColumns={cells.canDeleteColumns}
          onClose={() => setMenu(null)}
          onMerge={cells.merge}
          onUnmerge={cells.unmerge}
          onInsertRowAbove={() => selectionRect && cells.insertRowAt(selectionRect.r0)}
          onInsertRowBelow={() => selectionRect && cells.insertRowAt(selectionRect.r1 + 1)}
          onDuplicateRow={() => {
            const ri = selection ? rows.findIndex(r => r.id === selection.focus.rowId) : -1;
            if (ri >= 0) cells.duplicateRow(ri);
          }}
          onDeleteRows={cells.deleteRows}
          onInsertColumnLeft={() => selectionRect && cells.insertColumnAt(selectionRect.c0)}
          onInsertColumnRight={() => selectionRect && cells.insertColumnAt(selectionRect.c1 + 1)}
          onDuplicateColumn={() => {
            const ci = selection ? columns.findIndex(c => c.id === selection.focus.colId) : -1;
            if (ci >= 0) cells.duplicateColumn(ci);
          }}
          onDeleteColumns={cells.deleteColumns}
          onClear={cells.clearContents}
        />
      )}
      {editable && refMenu && (
        <CustomCellRefMenu
          focus={{ rowId: refMenu.rowId, colId: refMenu.colId }}
          query={refMenu.query}
          highlight={refMenu.highlight}
          onPick={handleRefPick}
          onHover={i => setRefMenu(m => m && { ...m, highlight: i })}
        />
      )}
    </div>
  );
};

export default CustomTable;
