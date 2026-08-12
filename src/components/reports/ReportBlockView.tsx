import React from 'react';
import { ReportBlock } from '../../types';
import { ReportCtx, ReportCollectionItem, resolveCollection } from '../../lib/reportData';
import { reportFieldValueByKey, resolveReportTokens, ReportFieldDef } from '../../lib/reportFields';
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
  hint?: boolean;
  showKeys?: boolean;
}

function isEmptyValue(v: string): boolean {
  return !v.trim();
}

function visibleFor(b: ReportBlock, value: string): boolean {
  if (!isEmptyValue(value)) return true;
  return (b.emptyBehavior ?? 'show') !== 'hideBlock';
}

function emptyHint(text: string, style: React.CSSProperties): React.ReactNode {
  return <div style={{ ...style, color: '#8f8f8f', fontStyle: 'italic' }}>{text}</div>;
}

export const ReportBlockView: React.FC<ReportRenderProps> = React.memo(
  ({ block, ctx, fieldMap, item, parentCategory, parentCollection, scopeFilter, hint, showKeys }) => {
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
        if (showKeys) {
          return <div style={{ ...baseStyle, color: '#8f8f8f', fontStyle: 'italic' }}>{fieldMap[block.field]?.label || block.field}</div>;
        }
        const value = reportFieldValueByKey(ctx, fieldMap, block.field, item);
        const text = `${block.prefix ?? ''}${value}${block.suffix ?? ''}`;
        if (!visibleFor(block, text)) return null;
        const st: React.CSSProperties = { ...baseStyle };
        if ((block.emptyBehavior ?? 'show') === 'hideText' && isEmptyValue(text)) st.display = 'none';
        return <div style={st}>{text || '\u00A0'}</div>;
      }
      case 'repeat': {
        return <ReportRepeatView block={block} ctx={ctx} fieldMap={fieldMap} item={item} parentCategory={parentCategory} scopeFilter={scopeFilter} hint={hint} />;
      }
      case 'table': {
        return <ReportTableView block={block} ctx={ctx} fieldMap={fieldMap} item={item} parentCategory={parentCategory} scopeFilter={scopeFilter} hint={hint} />;
      }
      case 'columns': {
        const cols = block.cols || [];
        const total = cols.reduce((a, c) => a + c.width, 0);
        return (
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            {cols.map(col => (
              <div key={col.id} style={{ flex: `${total > 0 ? col.width / total : 1 / cols.length} 1 0%`, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                { (col.blocks || []).map(cb => (
                  <ReportBlockView key={cb.id} block={cb} ctx={ctx} fieldMap={fieldMap} item={item} parentCategory={parentCategory} parentCollection={parentCollection} scopeFilter={scopeFilter} hint={hint} />
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
        const h = block.height ?? 16;
        const style = block.spacerStyle ?? 'none';
        if (style === 'none') return <div style={{ height: h }} aria-hidden />;
        if (style === 'black') {
          return (
            <div style={{ height: h, background: '#000', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, letterSpacing: 1.5, fontWeight: 600, textTransform: 'uppercase' }}>
              spacer
            </div>
          );
        }
        return (
          <div style={{ height: h, display: 'flex', alignItems: 'center' }}>
            <div style={{ width: '100%', borderTop: style === 'dotted' ? '2px dotted #000' : '1px solid #000' }} />
          </div>
        );
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
    a.scopeFilter === b.scopeFilter &&
    a.hint === b.hint &&
    a.showKeys === b.showKeys,
);

// ---- repeat (vertical stack of children) ------------------------------------

const ReportRepeatView: React.FC<Omit<ReportRenderProps, 'block'> & { block: ReportBlock }> = ({ block, ctx, fieldMap, item, parentCategory, scopeFilter, hint }) => {
  const items = resolveCollection(ctx, block.collection, block.category, item, parentCategory) as ReportCollectionItem[];
  const filtered = block.collection === 'days' && scopeFilter?.days?.length
    ? items.filter((it: any) => scopeFilter.days!.includes(it.section.index))
    : items;
  if (filtered.length === 0) {
    if (hint) return emptyHint('Empty — no items in this collection', getReportBlockBaseStyle(block));
    return null;
  }
  const gap = block.gap ?? 8;
  const children = block.children || [];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap }}>
      {filtered.map((it, i) => (
        <div key={i} style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
          {children.map(cb => (
            <ReportBlockView key={cb.id} block={cb} ctx={ctx} fieldMap={fieldMap} item={it} parentCategory={block.collection === 'elements' ? block.category : parentCategory} parentCollection={block.collection} scopeFilter={scopeFilter} hint={hint} />
          ))}
        </div>
      ))}
    </div>
  );
};

// ---- table (prototype model: flat column defs, one row per item) -------------

const ReportTableView: React.FC<Omit<ReportRenderProps, 'block'> & { block: ReportBlock }> = ({ block, ctx, fieldMap, item, parentCategory, scopeFilter, hint }) => {
  const items = resolveCollection(ctx, block.collection, block.category, item, parentCategory) as ReportCollectionItem[];
  const filtered = block.collection === 'days' && scopeFilter?.days?.length
    ? items.filter((it: any) => scopeFilter.days!.includes(it.section.index))
    : items;
  if (filtered.length === 0) {
    if (hint) return emptyHint('Empty — no items in this collection', getReportBlockBaseStyle(block));
    return null;
  }

  const baseStyle = getReportBlockBaseStyle(block);
  const cellPad = { padding: `${block.paddingV ?? 2}px ${block.paddingH ?? 4}px` };
  const border = '1px solid #d4d4d8';
  const columns = block.columns || [];
  if (columns.length === 0) return null;

  const headerStyle = { ...baseStyle, ...cellPad, fontWeight: 700, background: '#f4f4f5' } as React.CSSProperties;

  return (
    <div className="report-table-cols" style={{ borderTop: border, borderLeft: border }}>
      {block.showHeader && (
        <div style={{ display: 'flex', pageBreakInside: 'avoid', breakInside: 'avoid' }}>
          {columns.map(c => (
            <div key={c.id} data-col-ci={c.id} style={{ ...headerStyle, width: `${c.width}%`, textAlign: c.align || 'left', borderRight: border, borderBottom: border }}>
              {fieldMap[c.field]?.label || c.field || ''}
            </div>
          ))}
        </div>
      )}
      {filtered.map((it, i) => (
        <div key={i} style={{ display: 'flex', pageBreakInside: 'avoid', breakInside: 'avoid' }}>
          {columns.map(c => (
            <div key={c.id} data-col-ci={c.id} style={{ ...baseStyle, ...cellPad, width: `${c.width}%`, textAlign: c.align || 'left', borderRight: border, borderBottom: border }}>
              {reportFieldValueByKey(ctx, fieldMap, c.field, it) || '\u00A0'}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};
