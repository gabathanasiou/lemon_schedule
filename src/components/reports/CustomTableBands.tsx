import React from 'react';
import { Plus, X } from 'lucide-react';
import { ReportCellMerge, ReportCellStyle, ReportTableColumn } from '../../types';
import { ReportCtx } from '../../lib/reportData';
import { FieldAux, LookupTokenItem, ReportFieldDef, resolveReportTokensHtml } from '../../lib/reportFields';
import { REPORT_TABLE_HEADER_BG } from '../../lib/reportLook';
import { CellRef, MergeRect, TableBand, HEADER_ROW_ID, isCovered, mergeAnchorAt } from '../../lib/reportTableMerges';
import { getTextStyleById } from '../../lib/reportTextStyles';
import { IS_COARSE } from '../../lib/device';
import RichTextEditor, { RichTextEditorHandle, RichTextState } from './RichTextEditor';

// Free-table band renderers (roadmap 189). The composition root
// (CustomTable.tsx) owns state/ops/resize; this file renders the header band
// and the body bands — each band is ONE `display:grid` (column widths as
// tracks) so vertical merges become grid-row spans. Band wrappers keep
// `rm-row`/`rm-header` so the measured paginator flattens them unchanged.

export interface CustomSelection { anchor: CellRef; focus: CellRef; }

export interface CustomTableShared {
  columns: ReportTableColumn[];
  merges: ReportCellMerge[];
  cellStyles: Record<string, ReportCellStyle>;
  baseStyle: React.CSSProperties;
  cellPad: React.CSSProperties;
  border: string;
  editable: boolean;
  selection: CustomSelection | null;
  selectionRect: MergeRect | null;
  focusKey: string | null;
  /** Focused cell's editor handle — the format toolbar's exec target. */
  focusedEditorRef: React.MutableRefObject<RichTextEditorHandle | null>;
  rtState: RichTextState;
  onRtStateChange: (state: RichTextState) => void;
  onSelectCell: (ref: CellRef, shift: boolean) => void;
  onCellContextMenu: (e: React.MouseEvent, ref: CellRef) => void;
  activeCol: number | null;
  onColHover: (ci: number | null) => void;
  colOutline: (ci: number) => React.CSSProperties;
  startColResize: (ci: number, e: React.PointerEvent) => void;
  ctx: ReportCtx;
  fieldMap: Record<string, ReportFieldDef>;
  item?: any;
  aux?: FieldAux;
  fields: ReportFieldDef[];
  lookupTokens: LookupTokenItem[];
}

const CellBtn: React.FC<{ title: string; onClick: () => void; children: React.ReactNode }> = ({ title, onClick, children }) => (
  <button
    type="button"
    title={title}
    aria-label={title}
    className="report-ct-btn"
    onPointerDown={e => e.stopPropagation()}
    onClick={e => { e.stopPropagation(); onClick(); }}
  >
    {children}
  </button>
);

const CellEditor: React.FC<{
  shared: CustomTableShared;
  rowId: string;
  colId: string;
  html: string;
  onChange: (html: string) => void;
}> = ({ shared, rowId, colId, html, onChange }) => {
  const ref = React.useRef<RichTextEditorHandle | null>(null);
  const isFocus = shared.editable && shared.focusKey === `${rowId}:${colId}`;
  // The focused cell publishes its editor handle so the chrome/dock format
  // toolbar can exec marks against the live contentEditable.
  React.useEffect(() => {
    if (!isFocus) return;
    shared.focusedEditorRef.current = ref.current;
    return () => {
      if (shared.focusedEditorRef.current === ref.current) shared.focusedEditorRef.current = null;
    };
  }, [isFocus, shared.focusedEditorRef]);
  if (!shared.editable) {
    return <div dangerouslySetInnerHTML={{ __html: resolveReportTokensHtml(shared.ctx, shared.fieldMap, html, shared.item, shared.aux) }} />;
  }
  return (
    <RichTextEditor
      ref={ref}
      value={html}
      onChange={onChange}
      onStateChange={isFocus ? shared.onRtStateChange : undefined}
      fields={shared.fields}
      lookupTokens={shared.lookupTokens}
      placeholder="Type… @ for tokens"
      className="report-cell-editor w-full min-h-[18px]"
    />
  );
};

/** Per-cell overrides layered over the column/base style: the named paragraph
 *  style first, then direct font/size, then vertical alignment. */
function cellStyleOverrides(cs: ReportCellStyle | undefined, project: ReportCtx['project']): React.CSSProperties {
  if (!cs) return {};
  const named = cs.textStyle ? getTextStyleById(project, cs.textStyle) : undefined;
  return {
    ...(named ? {
      ...(named.fontFamily ? { fontFamily: named.fontFamily } : {}),
      fontSize: named.fontSize,
      ...(named.bold ? { fontWeight: 700 } : {}),
      ...(named.italic ? { fontStyle: 'italic' } : {}),
    } : {}),
    ...(cs.fontFamily ? { fontFamily: cs.fontFamily } : {}),
    ...(cs.fontSize ? { fontSize: cs.fontSize } : {}),
    ...(cs.verticalAlign ? {
      display: 'flex',
      flexDirection: 'column',
      justifyContent: cs.verticalAlign === 'middle' ? 'center' : cs.verticalAlign === 'bottom' ? 'flex-end' : 'flex-start',
    } : {}),
  };
}

/** Range outline as edge-only box shadows so every cell contributes its
 *  boundary segments — one continuous rectangle, spans included. */function selectionEdges(
  rect: MergeRect | null,
  band: 'header' | 'body',
  rowPos: number,
  colPos: number,
  colSpan: number,
  rowSpan: number,
): React.CSSProperties {
  if (!rect || rect.band !== band) return {};
  if (colPos + colSpan - 1 < rect.c0 || colPos > rect.c1) return {};
  if (band === 'body' && (rowPos + rowSpan - 1 < rect.r0 || rowPos > rect.r1)) return {};
  const shadows: string[] = [];
  if (rowPos === rect.r0) shadows.push('inset 0 2px 0 0 #3b82f6');
  if (rowPos + rowSpan - 1 === rect.r1) shadows.push('inset 0 -2px 0 0 #3b82f6');
  if (colPos === rect.c0) shadows.push('inset 2px 0 0 0 #3b82f6');
  if (colPos + colSpan - 1 === rect.c1) shadows.push('inset -2px 0 0 0 #3b82f6');
  return shadows.length ? { boxShadow: shadows.join(', ') } : {};
}

/** One cell: grid placement, stable identity (`data-cell`), range outline,
 *  selection/context-menu capture and the direct border-drag strip. `rowPos`
 *  is the ABSOLUTE row index (selection rects are absolute); `gridRow` is the
 *  band-relative row for grid placement. */
const CellShell: React.FC<{
  shared: CustomTableShared;
  band: 'header' | 'body';
  rowId: string;
  colId: string;
  colPos: number;
  rowPos: number;
  gridRow: number;
  colSpan: number;
  rowSpan: number;
  style: React.CSSProperties;
  children: React.ReactNode;
}> = ({ shared, band, rowId, colId, colPos, rowPos, gridRow, colSpan, rowSpan, style, children }) => {
  const { editable, columns, border, selectionRect, onSelectCell, onCellContextMenu, activeCol, onColHover, startColResize } = shared;
  const lastCol = colPos + colSpan - 1;
  return (
    <div
      data-cell={`${rowId}:${colId}`}
      data-table-col-ci={colPos}
      data-row-id={rowId}
      className={band === 'header' && editable ? 'report-ct-hcell' : undefined}
      style={{
        ...style,
        gridColumn: `${colPos + 1} / span ${colSpan}`,
        gridRow: `${gridRow + 1} / span ${rowSpan}`,
        position: 'relative',
        ...selectionEdges(selectionRect, band, rowPos, colPos, colSpan, rowSpan),
      }}
      onPointerDown={editable ? e => {
        if (e.button !== 0) return;
        if (e.shiftKey) { e.preventDefault(); e.stopPropagation(); }
        onSelectCell({ rowId, colId }, e.shiftKey);
      } : undefined}
      onContextMenu={editable ? e => onCellContextMenu(e, { rowId, colId }) : undefined}
    >
      {children}
      {editable && !IS_COARSE && lastCol < columns.length - 1 && (
        <div
          className="report-ct-colborder"
          data-active={activeCol === lastCol ? '1' : undefined}
          onPointerDown={e => startColResize(lastCol, e)}
          onMouseEnter={() => onColHover(lastCol)}
          onMouseLeave={() => onColHover(null)}
        />
      )}
    </div>
  );
};

/** Header band — the same rectangular selection as body cells; merged header
 *  cells span columns (never rows). */
export const HeaderBand: React.FC<{
  shared: CustomTableShared;
  show: boolean;
  setHeader: (ci: number, label: string) => void;
  insertColumnAfter: (ci: number) => void;
  removeColumn: (ci: number) => void;
  startColumnDrag: (e: React.PointerEvent, ci: number) => void;
}> = ({ shared, show, setHeader, insertColumnAfter, removeColumn, startColumnDrag }) => {
  const { columns, merges, baseStyle, cellPad, border, editable, colOutline } = shared;
  if (!show) return null;
  const headerStyle = { ...baseStyle, ...cellPad, fontWeight: 700, background: REPORT_TABLE_HEADER_BG } as React.CSSProperties;
  const headerMerged = merges.some(m => m.rowId === HEADER_ROW_ID);
  return (
    <div
      className="rm-header"
      style={{ display: 'grid', gridTemplateColumns: columns.map(c => `${c.width}%`).join(' '), pageBreakInside: 'avoid', breakInside: 'avoid' }}
    >
      {columns.map((c, ci) => {
        if (isCovered(merges, [], columns, HEADER_ROW_ID, c.id)) return null;
        const anchor = mergeAnchorAt(merges, HEADER_ROW_ID, c.id);
        const colSpan = anchor?.colSpan ?? 1;
        const cs = shared.cellStyles[`${HEADER_ROW_ID}:${c.id}`];
        return (
          <CellShell
            key={c.id}
            shared={shared}
            band="header"
            rowId={HEADER_ROW_ID}
            colId={c.id}
            colPos={ci}
            rowPos={0}
            gridRow={0}
            colSpan={colSpan}
            rowSpan={1}
            style={{
              ...headerStyle,
              ...cellStyleOverrides(cs, shared.ctx.project),
              textAlign: cs?.align || c.align || 'left',
              borderRight: border,
              borderBottom: border,
              ...colOutline(ci),
            }}
          >
            {editable ? (
              <>
                <input
                  className="report-ct-header-input"
                  value={c.label ?? ''}
                  placeholder={`Column ${ci + 1}`}
                  onChange={e => setHeader(ci, e.target.value)}
                  onPointerDown={e => {
                    if (e.button !== 0) return;
                    if (e.shiftKey) e.preventDefault();
                    e.stopPropagation();
                    shared.onSelectCell({ rowId: HEADER_ROW_ID, colId: c.id }, e.shiftKey);
                  }}
                />
                {columns.length > 1 && !headerMerged && (
                  <span
                    className="report-ct-colgrip"
                    title="Drag to rearrange the column"
                    onPointerDown={e => startColumnDrag(e, ci)}
                  >⠿</span>
                )}
                <span className="report-ct-controls report-ct-hcontrols">
                  <CellBtn title="Insert column after" onClick={() => insertColumnAfter(ci + colSpan - 1)}><Plus className="w-3 h-3" /></CellBtn>
                  {columns.length > 1 && (
                    <CellBtn title="Delete column" onClick={() => removeColumn(ci)}><X className="w-3 h-3" /></CellBtn>
                  )}
                </span>
              </>
            ) : (
              c.label || c.field || ''
            )}
          </CellShell>
        );
      })}
    </div>
  );
};

/** One body band: consecutive rows joined by vertical merges render as one
 *  grid; per-row affordances live in invisible overlay grid items. */
export const BodyBand: React.FC<{
  shared: CustomTableShared;
  band: TableBand;
  rowCount: number;
  commitCell: (ri: number, ci: number, html: string) => void;
  insertRowBelow: (ri: number) => void;
  removeRow: (ri: number) => void;
  startRowResize: (ri: number, e: React.PointerEvent) => void;
  setRowHeight: (ri: number, height: number | undefined) => void;
}> = ({ shared, band, rowCount, commitCell, insertRowBelow, removeRow, startRowResize, setRowHeight }) => {
  const { columns, merges, baseStyle, cellPad, border, editable, colOutline } = shared;
  const [hoverRow, setHoverRow] = React.useState<string | null>(null);
  return (
    <div
      className={`rm-row${editable ? ' report-ct-band' : ''}`}
      style={{
        display: 'grid',
        gridTemplateColumns: columns.map(c => `${c.width}%`).join(' '),
        gridTemplateRows: band.rows.map(r => (r.height ? `minmax(${r.height}px, auto)` : 'auto')).join(' '),
        pageBreakInside: 'avoid',
        breakInside: 'avoid',
      }}
      onMouseOver={editable ? e => {
        const el = (e.target as HTMLElement).closest('[data-row-id]');
        setHoverRow(el?.getAttribute('data-row-id') ?? null);
      } : undefined}
      onMouseLeave={editable ? () => setHoverRow(null) : undefined}
    >
      {band.rows.map((row, bi) => {
        const absoluteRi = band.start + bi;
        return columns.map((c, ci) => {
          if (isCovered(merges, band.rows, columns, row.id, c.id)) return null;
          const anchor = mergeAnchorAt(merges, row.id, c.id);
          const colSpan = anchor?.colSpan ?? 1;
          const rowSpan = anchor?.rowSpan ?? 1;
          const cs = shared.cellStyles[`${row.id}:${c.id}`];
          const cellStyle = {
            ...baseStyle, ...cellPad, ...(c.bold ? { fontWeight: 700 } : {}), ...(c.italic ? { fontStyle: 'italic' } : {}),
            ...cellStyleOverrides(cs, shared.ctx.project),
            textAlign: cs?.align || c.align || 'left', borderRight: border, borderBottom: border, ...colOutline(ci),
          } as React.CSSProperties;
          return (
            <CellShell
              key={`${row.id}:${c.id}`}
              shared={shared}
              band="body"
              rowId={row.id}
              colId={c.id}
              colPos={ci}
              rowPos={absoluteRi}
              gridRow={bi}
              colSpan={colSpan}
              rowSpan={rowSpan}
              style={cellStyle}
            >
              <CellEditor
                shared={shared}
                rowId={row.id}
                colId={c.id}
                html={row.cells[ci] || ''}
                onChange={h => commitCell(absoluteRi, ci, h)}
              />
            </CellShell>
          );
        });
      })}
      {band.rows.map((row, bi) => (
        <div
          key={`overlay-${row.id}`}
          className="report-ct-row"
          data-row-id={row.id}
          data-hover={hoverRow === row.id ? '1' : undefined}
          style={{ gridColumn: '1 / -1', gridRow: `${bi + 1} / span 1`, position: 'relative', pointerEvents: 'none', zIndex: 6 }}
        >
          {editable && (
            <span className="report-ct-controls report-ct-rcontrols">
              <CellBtn title="Insert row below" onClick={() => insertRowBelow(band.start + bi + 1)}><Plus className="w-3 h-3" /></CellBtn>
              {rowCount > 1 && (
                <CellBtn title="Delete row" onClick={() => removeRow(band.start + bi)}><X className="w-3 h-3" /></CellBtn>
              )}
            </span>
          )}
          {editable && !IS_COARSE && (() => {
            // Direct row-resize grab strips: one segment per column, skipping
            // any column whose boundary below this row is INSIDE a vertical
            // merge (otherwise the strip would cross a merged cell's middle
            // and swallow clicks meant for its text).
            const nextRow = band.rows[bi + 1];
            const offsets: number[] = [];
            let acc = 0;
            for (const c of columns) { offsets.push(acc); acc += c.width; }
            const mergedAt = (rowId: string, ci: number) => {
              const anchor = mergeAnchorAt(merges, rowId, columns[ci].id);
              return !!(anchor && anchor.rowSpan > 1) || !!isCovered(merges, band.rows, columns, rowId, columns[ci].id);
            };
            return columns.map((c, ci) => {
              if (mergedAt(row.id, ci) || (nextRow && mergedAt(nextRow.id, ci))) return null;
              return (
                <div
                  key={c.id}
                  className="report-ct-rowborder"
                  style={{ left: `${offsets[ci]}%`, width: `${c.width}%`, right: 'auto' }}
                  onPointerDown={e => startRowResize(band.start + bi, e)}
                />
              );
            });
          })()}
          {editable && (
            <div
              className="report-ct-rowtab"
              title="Drag to resize the row (double-click to reset)"
              onPointerDown={e => startRowResize(band.start + bi, e)}
              onClick={e => e.stopPropagation()}
              onDoubleClick={e => { e.stopPropagation(); setRowHeight(band.start + bi, undefined); }}
            >
              <div className="report-ct-rowtab-stem" />
              <div className="report-ct-rowtab-tri" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
