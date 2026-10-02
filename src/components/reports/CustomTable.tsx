import React, { useMemo } from 'react';
import { Plus, X } from 'lucide-react';
import { ReportBlock } from '../../types';
import { ReportCtx } from '../../lib/reportData';
import { ReportFieldDef, FieldAux, LookupTokenItem, getReportFieldDefs, buildLookupTokens, resolveReportTokensHtml } from '../../lib/reportFields';
import { REPORT_TABLE_HEADER_BG } from '../../lib/reportLook';
import { insertTableColumnAt, removeTableColumnAt, moveTableColumn, blockId } from '../../lib/reportBlocks';
import { normalizeColWidths } from '../../lib/ribbonDefaults';
import { IS_COARSE } from '../../lib/device';
import RichTextEditor from './RichTextEditor';
import { useTableColumnReorder } from './useTableColumnReorder';
import { useColumnResize, ColumnResizeStrip } from '../columnResize';

// Free table (item 10, roadmap 188): literal rows × columns; every cell
// is rich text with `@` tokens. In the designer (`hint` + `onPatchBlock`) the
// table edits ITSELF — headers type in place, row/column +/× controls and the
// row-height grip live on the cells (no block chrome). Preview/print resolve
// the tokens to static HTML. The `.report-table-cols`/`.rm-row` classes keep
// the measured paginator splitting it between rows for free.

const CustomCellEditor: React.FC<{
  html: string;
  fields: ReportFieldDef[];
  lookupTokens: LookupTokenItem[];
  disabled?: boolean;
  onChange: (html: string) => void;
}> = ({ html, fields, lookupTokens, disabled, onChange }) => (
  <RichTextEditor
    value={html}
    onChange={onChange}
    fields={fields}
    lookupTokens={lookupTokens}
    disabled={disabled}
    placeholder="Type… @ for tokens"
    className="report-cell-editor w-full min-h-[18px]"
  />
);

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
}

const CustomTable: React.FC<CustomTableProps> = ({ block, ctx, fieldMap, item, aux, baseStyle, cellPad, border, hint, rowRange, repeatTableHeader, onPatchBlock, selected }) => {
  const rows = block.customRows || [];
  const columns = block.columns || [];
  const shown = rowRange ? rows.slice(rowRange[0], rowRange[1]) : rows;
  const editable = !!hint && !!onPatchBlock;
  const fields = useMemo(() => getReportFieldDefs(ctx.project), [ctx.project]);
  const lookupTokens = useMemo(
    () => buildLookupTokens(ctx.project, ctx.dayInfos.map(d => ({ index: d.section.index, chronoDay: d.chronoDay, date: d.date }))),
    [ctx.project, ctx.dayInfos],
  );
  const headerStyle = { ...baseStyle, ...cellPad, fontWeight: 700, background: REPORT_TABLE_HEADER_BG } as React.CSSProperties;
  const { startDrag, colOutline } = useTableColumnReorder({
    enabled: editable,
    onMove: (from, to) => applyTableOp(blocks => moveTableColumn(blocks, block.id, from, to)),
  });

  const patch = (p: Partial<ReportBlock>) => onPatchBlock?.(p);
  // Structural edits go through the canonical table-column helpers — they
  // remap `customRows[].cells` by column id, so values stay aligned.
  const applyTableOp = (op: (blocks: ReportBlock[]) => ReportBlock[]) => {
    const next = op([block])[0];
    patch({ columns: next.columns, customRows: next.customRows });
  };
  const commitCell = (rowIndex: number, colIndex: number, html: string) => {
    patch({ customRows: rows.map((r, i) => i === rowIndex
      ? { ...r, cells: columns.map((_, j) => (j === colIndex ? html : (r.cells[j] || ''))) }
      : r) });
  };
  const setHeader = (colIndex: number, label: string) => {
    patch({ columns: columns.map((c, i) => (i === colIndex ? { ...c, label } : c)) });
  };
  const insertRowAt = (index: number) => {
    const row = { id: blockId(), cells: columns.map(() => '') };
    patch({ customRows: [...rows.slice(0, index), row, ...rows.slice(index)] });
  };
  const removeRow = (index: number) => {
    if (rows.length <= 1) return;
    patch({ customRows: rows.filter((_, i) => i !== index) });
  };
  const setRowHeight = (index: number, height: number | undefined) => {
    patch({ customRows: rows.map((r, i) => (i === index ? { ...r, height } : r)) });
  };

  // Row resize: the shared drag engine in vertical mode (px heights, only the
  // row above the boundary changes). The tab mirrors the column strip's handle
  // on the table's right edge and is selection-gated in CSS (like the tabs).
  const rootRef = React.useRef<HTMLDivElement>(null);
  const startHeightsRef = React.useRef<number[]>([]);
  const rowEls = () => rootRef.current
    ? (Array.from(rootRef.current.querySelectorAll('.rm-row')) as HTMLElement[])
    : [];
  const startRowResize = useColumnResize(rows.map(r => r.height ?? 0), {
    axis: 'y',
    redistribute: false,
    minSize: 14,
    getSizes: () => {
      startHeightsRef.current = rowEls().map(el => el.offsetHeight);
      return startHeightsRef.current;
    },
    apply: (heights, _ev, ci) => {
      const el = rowEls()[ci];
      if (el) el.style.minHeight = `${heights[ci]}px`;
    },
    commit: (heights, ci) => {
      const next = Math.round(heights[ci]);
      if (next !== startHeightsRef.current[ci]) setRowHeight(ci, next);
    },
  });

  // Direct border drag (mouse only): grabbing the vertical boundary between
  // columns or the horizontal boundary between rows resizes with the SAME
  // shared engine the tabs use — no tab needs to be visible/selected. The
  // strip tab, every cell-border segment of the boundary and the drag all
  // share ONE active state, so the two affordances read as one handle.
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
  const startColBorderResize = useColumnResize(columns.map(c => c.width), {
    getWidth: () => rootRef.current?.clientWidth || 1,
    apply: (widths) => {
      const root = rootRef.current;
      if (root) {
        root.querySelectorAll('[data-table-col-ci]').forEach(el => {
          const ci = Number((el as HTMLElement).getAttribute('data-table-col-ci'));
          if (Number.isFinite(ci)) (el as HTMLElement).style.width = `${widths[ci]}%`;
        });
      }
      if (stripRef.current) stripRef.current.style.gridTemplateColumns = widths.map(w => `${w}%`).join(' ');
    },
    commit: (widths) => {
      const normalized = normalizeColWidths(widths);
      patch({ columns: columns.map((c, i) => ({ ...c, width: normalized[i] ?? c.width })) });
    },
  });
  const startColResize = (ci: number, e: React.PointerEvent) => {
    setDragCol(ci);
    startColBorderResize(ci, e);
  };

  return (
    <div className="report-ct-root">
      {editable && selected && (
        <div className={`${IS_COARSE ? 'h-10' : 'h-5'} select-none`}>
          <ColumnResizeStrip
            widths={columns.map(c => c.width)}
            startResize={startColResize}
            containerRef={stripRef}
            activeIndex={activeCol}
            onHoverIndex={setHoverCol}
          />
        </div>
      )}
      <div ref={rootRef} className="report-table-cols" style={{ borderTop: border, borderLeft: border }}>
      {block.showHeader && (rowRange ? rowRange[0] === 0 || repeatTableHeader : true) && (
        <div className="rm-header" style={{ display: 'flex', pageBreakInside: 'avoid', breakInside: 'avoid' }}>
          {columns.map((c, ci) => (
            <div
              key={c.id}
              data-table-col-ci={ci}
              className={editable ? 'report-ct-hcell' : undefined}
              style={{ ...headerStyle, position: 'relative', width: `${c.width}%`, textAlign: c.align || 'left', borderRight: border, borderBottom: border, ...colOutline(ci) }}
            >
              {editable ? (
                <>
                  {!IS_COARSE && ci < columns.length - 1 && (
                    <div
                      className="report-ct-colborder"
                      data-active={activeCol === ci ? '1' : undefined}
                      onPointerDown={e => startColResize(ci, e)}
                      onMouseEnter={() => setHoverCol(ci)}
                      onMouseLeave={() => setHoverCol(prev => (prev === ci ? null : prev))}
                    />
                  )}
                  <input
                    className="report-ct-header-input"
                    value={c.label ?? ''}
                    placeholder={`Column ${ci + 1}`}
                    onChange={e => setHeader(ci, e.target.value)}
                    onPointerDown={e => e.stopPropagation()}
                  />
                  {columns.length > 1 && (
                    <span
                      className="report-ct-colgrip"
                      title="Drag to rearrange the column"
                      onPointerDown={e => startDrag(e, ci)}
                    >⠿</span>
                  )}
                  <span className="report-ct-controls report-ct-hcontrols">
                    <CellBtn title="Insert column after" onClick={() => applyTableOp(blocks => insertTableColumnAt(blocks, block.id, ci + 1))}><Plus className="w-3 h-3" /></CellBtn>
                    {columns.length > 1 && (
                      <CellBtn title="Delete column" onClick={() => applyTableOp(blocks => removeTableColumnAt(blocks, block.id, ci))}><X className="w-3 h-3" /></CellBtn>
                    )}
                  </span>
                </>
              ) : (
                c.label || c.field || ''
              )}
            </div>
          ))}
        </div>
      )}
      {shown.map((row, ri) => {
        const absoluteRi = rowRange ? rowRange[0] + ri : ri;
        return (
          <div
            key={row.id}
            className={`rm-row${editable ? ' report-ct-row' : ''}`}
            style={{ display: 'flex', minHeight: row.height ? `${row.height}px` : undefined, pageBreakInside: 'avoid', breakInside: 'avoid' }}
          >
            {editable && (
              <span className="report-ct-controls report-ct-rcontrols">
                <CellBtn title="Insert row below" onClick={() => insertRowAt(absoluteRi + 1)}><Plus className="w-3 h-3" /></CellBtn>
                {rows.length > 1 && (
                  <CellBtn title="Delete row" onClick={() => removeRow(absoluteRi)}><X className="w-3 h-3" /></CellBtn>
                )}
              </span>
            )}
            {columns.map((c, ci) => {
              const cellStyle = {
                ...baseStyle, ...cellPad, ...(c.bold ? { fontWeight: 700 } : {}), ...(c.italic ? { fontStyle: 'italic' } : {}),
                position: 'relative', width: `${c.width}%`, textAlign: c.align || 'left', borderRight: border, borderBottom: border, ...colOutline(ci),
              } as React.CSSProperties;
              const html = row.cells[ci] || '';
              return (
                <div key={c.id} data-table-col-ci={ci} style={cellStyle}>
                  {editable && !IS_COARSE && ci < columns.length - 1 && (
                    <div
                      className="report-ct-colborder"
                      data-active={activeCol === ci ? '1' : undefined}
                      onPointerDown={e => startColResize(ci, e)}
                      onMouseEnter={() => setHoverCol(ci)}
                      onMouseLeave={() => setHoverCol(prev => (prev === ci ? null : prev))}
                    />
                  )}
                  {editable ? (
                    <CustomCellEditor html={html} fields={fields} lookupTokens={lookupTokens} onChange={h => commitCell(absoluteRi, ci, h)} />
                  ) : (
                    <div dangerouslySetInnerHTML={{ __html: resolveReportTokensHtml(ctx, fieldMap, html, item, aux) }} />
                  )}
                </div>
              );
            })}
            {editable && !IS_COARSE && (
              <div className="report-ct-rowborder" onPointerDown={e => startRowResize(absoluteRi, e)} />
            )}
            {editable && (
              <div
                className="report-ct-rowtab"
                title="Drag to resize the row (double-click to reset)"
                onPointerDown={e => startRowResize(absoluteRi, e)}
                onClick={e => e.stopPropagation()}
                onDoubleClick={e => { e.stopPropagation(); setRowHeight(absoluteRi, undefined); }}
              >
                <div className="report-ct-rowtab-stem" />
                <div className="report-ct-rowtab-tri" />
              </div>
            )}
          </div>
        );
      })}
      </div>
    </div>
  );
};

export default CustomTable;
