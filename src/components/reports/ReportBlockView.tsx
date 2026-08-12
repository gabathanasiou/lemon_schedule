import React from 'react';
import { ReportBlock, ReportTableRow } from '../../types';
import { ReportCtx, ReportCollectionItem, resolveCollection } from '../../lib/reportData';
import { reportFieldValueByKey, resolveReportTokens, ReportFieldDef } from '../../lib/reportFields';
import { getMergeLookup } from '../../lib/mergeGroups';
import { RibbonRow } from '../../types';
import { getReportBlockBaseStyle } from './reportStyle';
import { ReportRibbonView } from './ReportRibbonView';

// Pure block renderer for reports (designer canvas + print). All data comes
// from the canonical ReportCtx; items are resolved by the parent repeat.

export interface ReportRenderProps {
  block: ReportBlock;
  ctx: ReportCtx;
  fieldMap: Record<string, ReportFieldDef>;
  item?: ReportCollectionItem;
  parentCategory?: string;
  parentCollection?: string;
  scopeFilter?: { days?: number[] };
}

function isEmptyValue(v: string): boolean {
  return !v.trim();
}

function visibleFor(b: ReportBlock, value: string): boolean {
  if (!isEmptyValue(value)) return true;
  return (b.emptyBehavior ?? 'show') !== 'hideBlock';
}

export const ReportBlockView: React.FC<ReportRenderProps> = React.memo(
  ({ block, ctx, fieldMap, item, parentCategory, parentCollection, scopeFilter }) => {
    const baseStyle = getReportBlockBaseStyle(block);

    switch (block.type) {
      case 'text': {
        const text = resolveReportTokens(ctx, fieldMap, block.text || '', item);
        if (!visibleFor(block, text)) return null;
        const st: React.CSSProperties = { ...baseStyle };
        if ((block.emptyBehavior ?? 'show') === 'hideText' && isEmptyValue(text)) st.display = 'none';
        return <div style={st}>{text || '\u00A0'}</div>;
      }
      case 'field': {
        if (!block.field) {
          return <div style={{ ...baseStyle, color: '#a1a1aa', fontStyle: 'italic' }}>Select field…</div>;
        }
        const value = reportFieldValueByKey(ctx, fieldMap, block.field, item);
        const text = `${block.prefix ?? ''}${value}${block.suffix ?? ''}`;
        if (!visibleFor(block, text)) return null;
        const st: React.CSSProperties = { ...baseStyle };
        if ((block.emptyBehavior ?? 'show') === 'hideText' && isEmptyValue(text)) st.display = 'none';
        return <div style={st}>{text || '\u00A0'}</div>;
      }
      case 'repeat': {
        return <ReportRepeatView block={block} ctx={ctx} fieldMap={fieldMap} item={item} parentCategory={parentCategory} scopeFilter={scopeFilter} />;
      }
      case 'table': {
        return <ReportTableView block={block} ctx={ctx} fieldMap={fieldMap} item={item} parentCategory={parentCategory} scopeFilter={scopeFilter} />;
      }
      case 'columns': {
        const cols = block.cols || [];
        const total = cols.reduce((a, c) => a + c.width, 0);
        return (
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            {cols.map(col => (
              <div key={col.id} style={{ flex: `${total > 0 ? col.width / total : 1 / cols.length} 1 0%`, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                { (col.blocks || []).map(cb => (
                  <ReportBlockView key={cb.id} block={cb} ctx={ctx} fieldMap={fieldMap} item={item} parentCategory={parentCategory} parentCollection={parentCollection} scopeFilter={scopeFilter} />
                ))}
              </div>
            ))}
          </div>
        );
      }
      case 'ribbon': {
        return <ReportRibbonView block={block} ctx={ctx} item={item} />;
      }
      case 'pageBreak': {
        return <div className="report-page-break" style={{ height: 1 }} />;
      }
      case 'spacer': {
        return <div style={{ height: block.height ?? 16 }} aria-hidden />;
      }
      default:
        return null;
    }
  },
  (a, b) =>
    a.block === b.block &&
    a.ctx === b.ctx &&
    a.fieldMap === b.fieldMap &&
    a.item === b.item &&
    a.parentCategory === b.parentCategory &&
    a.parentCollection === b.parentCollection &&
    a.scopeFilter === b.scopeFilter,
);

// ---- repeat (vertical stack of children) ------------------------------------

const ReportRepeatView: React.FC<Omit<ReportRenderProps, 'block'> & { block: ReportBlock }> = ({ block, ctx, fieldMap, item, parentCategory, scopeFilter }) => {
  const items = resolveCollection(ctx, block.collection, block.category, item, parentCategory) as ReportCollectionItem[];
  const filtered = block.collection === 'days' && scopeFilter?.days?.length
    ? items.filter((it: any) => scopeFilter.days!.includes(it.section.index))
    : items;
  if (filtered.length === 0) return null;
  const gap = block.gap ?? 8;
  const children = block.children || [];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap }}>
      {filtered.map((it, i) => (
        <div key={i} style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
          {children.map(cb => (
            <ReportBlockView key={cb.id} block={cb} ctx={ctx} fieldMap={fieldMap} item={it} parentCategory={block.collection === 'elements' ? block.category : parentCategory} parentCollection={block.collection} scopeFilter={scopeFilter} />
          ))}
        </div>
      ))}
    </div>
  );
};

// ---- table -------------------------------------------------------------------

const ReportTableView: React.FC<Omit<ReportRenderProps, 'block'> & { block: ReportBlock }> = ({ block, ctx, fieldMap, item, parentCategory, scopeFilter }) => {
  const items = resolveCollection(ctx, block.collection, block.category, item, parentCategory) as ReportCollectionItem[];
  const filtered = block.collection === 'days' && scopeFilter?.days?.length
    ? items.filter((it: any) => scopeFilter.days!.includes(it.section.index))
    : items;
  if (filtered.length === 0) return null;

  const baseStyle = getReportBlockBaseStyle(block);
  const cellPad = { padding: `${block.paddingV ?? 2}px ${block.paddingH ?? 4}px` };
  const border = '1px solid #d4d4d8';

  if ((block.repeatAxis ?? 'rows') === 'columns') {
    return <TransposedTable block={block} ctx={ctx} fieldMap={fieldMap} items={filtered} baseStyle={baseStyle} cellPad={cellPad} border={border} />;
  }

  const colWidths = block.colWidths || [];
  const tableRows: ReportTableRow[] = block.tableRows || [];
  const ribbonRows = tableRows as unknown as RibbonRow[];
  const mergeLookup = getMergeLookup(ribbonRows);
  const numCols = Math.max(0, ...tableRows.map(r => r.cells.length), colWidths.length);
  const widths = colWidths.length === numCols ? colWidths : Array.from({ length: numCols }, () => 100 / numCols);

  return (
    <div style={{ borderTop: border, borderLeft: border }}>
      {block.showHeader && (
        <div style={{ display: 'flex', pageBreakInside: 'avoid', breakInside: 'avoid' }}>
          {Array.from({ length: numCols }, (_, ci) => (
            <div key={ci} style={{ ...baseStyle, ...cellPad, width: `${widths[ci]}%`, borderRight: border, borderBottom: border, fontWeight: 700, background: '#f4f4f5' }}>
              {labelFor(fieldMap, tableRows, ci)}
            </div>
          ))}
        </div>
      )}
      {filtered.map((it, i) => (
        <div
          key={i}
          className="report-table-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: widths.map(w => `${w}%`).join(' '),
            gridTemplateRows: `repeat(${tableRows.length}, auto)`,
            pageBreakInside: 'avoid',
            breakInside: 'avoid',
          }}
        >
          {tableRows.flatMap((row, ri) =>
            row.cells.map((cell, ci) => {
              const m = mergeLookup.get(cell.id);
              if (m && !m.isLead) return null;
              const span = m ? m.group.span : 1;
              const isH = m ? m.group.direction === 'h' : false;
              const isV = m ? m.group.direction === 'v' : false;
              const value = reportFieldValueByKey(ctx, fieldMap, cell.field, it);
              return (
                <div
                  key={`${ri}-${ci}`}
                  style={{
                    ...baseStyle,
                    ...cellPad,
                    gridColumn: isH ? `span ${span}` : undefined,
                    gridRow: isV ? `span ${span}` : undefined,
                    borderRight: border,
                    borderBottom: border,
                    textAlign: cell.align || baseStyle.textAlign,
                  }}
                >
                  {value || '\u00A0'}
                </div>
              );
            }),
          )}
        </div>
      ))}
    </div>
  );
};

function labelFor(fieldMap: Record<string, ReportFieldDef>, rows: ReportTableRow[], ci: number): string {
  for (const r of rows) {
    const cell = r.cells[ci];
    if (cell && cell.field) return fieldMap[cell.field]?.label || cell.field;
  }
  return '';
}

const TransposedTable: React.FC<{
  block: ReportBlock;
  ctx: ReportCtx;
  fieldMap: Record<string, ReportFieldDef>;
  items: ReportCollectionItem[];
  baseStyle: React.CSSProperties;
  cellPad: React.CSSProperties;
  border: string;
}> = ({ block, ctx, fieldMap, items, baseStyle, cellPad, border }) => {
  const rows = block.tableRows || [];
  const headerField = block.headerField || '';
  const labelCell = (field: string) => fieldMap[field]?.label || field;
  return (
    <div style={{ display: 'flex', borderTop: border, borderLeft: border }}>
      <div style={{ flex: '0 0 140px', minWidth: 0 }}>
        <div style={{ ...baseStyle, ...cellPad, borderRight: border, borderBottom: border, fontWeight: 700, background: '#f4f4f5' }}>
          {headerField ? labelCell(headerField) : ''}
        </div>
        {rows.map(r => (
          <div key={r.id} style={{ ...baseStyle, ...cellPad, borderRight: border, borderBottom: border, fontWeight: 600 }}>
            {labelCell(r.cells[0]?.field || '')}
          </div>
        ))}
      </div>
      {items.map((it, i) => (
        <div key={i} style={{ flex: '1 1 0%', minWidth: 0 }}>
          {headerField && (
            <div style={{ ...baseStyle, ...cellPad, borderRight: border, borderBottom: border, fontWeight: 700, background: '#f4f4f5' }}>
              {reportFieldValueByKey(ctx, fieldMap, headerField, it)}
            </div>
          )}
          {rows.map(r => (
            <div key={r.id} style={{ ...baseStyle, ...cellPad, borderRight: border, borderBottom: border }}>
              {reportFieldValueByKey(ctx, fieldMap, r.cells[0]?.field || '', it)}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};
