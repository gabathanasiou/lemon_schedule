import React, { useEffect, useRef, useState } from 'react';
import { ReportBlock, ReportCollection } from '../../types';
import { ReportCtx, ReportCollectionItem, ReportScopeFilter, filterItemsByScope, resolveCollectionItems, ancestorSceneScope } from '../../lib/reportData';
import { reportFieldValueByKey, resolveReportTokens, applyItemAffixes, ReportFieldDef, FieldAux } from '../../lib/reportFields';
import { getReportBlockBaseStyle } from './reportStyle';
import { ReportRibbonView } from './ReportRibbonView';
import { contextualCollectionsFor, defaultIdentityField, tableItemCollection } from '../../lib/reportBlocks';
import { PageItem, stripEdgeBreaks } from '../../lib/reportPagination';

// Pure block renderer for reports (designer canvas + print). All data comes
// from the canonical ReportCtx; items are resolved by the parent repeat.

export interface ReportRenderProps {
  block: ReportBlock;
  ctx: ReportCtx;
  fieldMap: Record<string, ReportFieldDef>;
  item?: ReportCollectionItem;
  parentCategory?: string;
  parentCollection?: string;
  scopeFilter?: ReportScopeFilter;
  hint?: boolean;
  showKeys?: boolean;
  aux?: FieldAux;
  onceTable?: boolean;  // summary table inside a same-collection repeat: list all items
  ancestors?: ReportCollectionItem[]; // full parent-item chain, nearest first — for scopedToParent
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

/** Drops trailing pageBreak children (a trailing break would print a blank page). */
function dropTrailingBreaks(list: ReportBlock[]): ReportBlock[] {
  let end = list.length;
  while (end > 0 && list[end - 1].type === 'pageBreak') end--;
  return end === list.length ? list : list.slice(0, end);
}

export const ReportBlockView: React.FC<ReportRenderProps> = React.memo(
  ({ block, ctx, fieldMap, item, parentCategory, parentCollection, scopeFilter, hint, showKeys, aux, onceTable, ancestors }) => {
    const baseStyle = getReportBlockBaseStyle(block);
    const blockAux: FieldAux = {
      ...aux,
      counterStart: block.counterStart ?? aux?.counterStart,
      dayFormat: block.dayFormat ?? aux?.dayFormat,
      sceneScope: ancestorSceneScope(ctx, ancestors),
    };

    switch (block.type) {
      case 'text': {
        if (showKeys) {
          return <div style={{ ...baseStyle, color: '#8f8f8f', fontStyle: 'italic' }}>{block.text || '\u00A0'}</div>;
        }
        const text = resolveReportTokens(ctx, fieldMap, block.text || '', item, blockAux);
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
        const value = reportFieldValueByKey(ctx, fieldMap, block.field, item, blockAux);
        const def = fieldMap[block.field];
        const shown = def?.multiValue && (block.itemPrefix != null || block.itemSuffix != null || block.itemSeparator != null)
          ? applyItemAffixes(value, { itemPrefix: block.itemPrefix, itemSuffix: block.itemSuffix, itemSeparator: block.itemSeparator })
          : value;
        const text = `${block.prefix ?? ''}${shown}${block.suffix ?? ''}`;
        if (!visibleFor(block, text)) return null;
        const st: React.CSSProperties = { ...baseStyle };
        if ((block.emptyBehavior ?? 'show') === 'hideText' && isEmptyValue(text)) st.display = 'none';
        return <div style={st}>{text || '\u00A0'}</div>;
      }
      case 'repeat': {
        return <ReportRepeatView block={block} ctx={ctx} fieldMap={fieldMap} item={item} parentCategory={parentCategory} scopeFilter={scopeFilter} hint={hint} showKeys={showKeys} aux={blockAux} ancestors={ancestors} />;
      }
      case 'table': {
        return <ReportTableView block={block} ctx={ctx} fieldMap={fieldMap} item={item} parentCategory={parentCategory} parentCollection={parentCollection} scopeFilter={scopeFilter} hint={hint} showKeys={showKeys} aux={blockAux} onceTable={onceTable} ancestors={ancestors} />;
      }
      case 'columns': {
        const cols = block.cols || [];
        const total = cols.reduce((a, c) => a + c.width, 0);
        return (
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            {cols.map(col => (
              <div key={col.id} style={{ flex: `${total > 0 ? col.width / total : 1 / cols.length} 1 0%`, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                { (col.blocks || []).map(cb => (
                  <ReportBlockView key={cb.id} block={cb} ctx={ctx} fieldMap={fieldMap} item={item} parentCategory={parentCategory} parentCollection={parentCollection} scopeFilter={scopeFilter} hint={hint} showKeys={showKeys} aux={blockAux} ancestors={ancestors} />
                ))}
              </div>
            ))}
          </div>
        );
      }
      case 'ribbon': {
        return <ReportRibbonView block={block} ctx={ctx} item={item} hint={hint} ancestors={ancestors} />;
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
    a.showKeys === b.showKeys &&
    a.ancestors === b.ancestors &&
    a.aux === b.aux &&
    a.onceTable === b.onceTable,
);

// ---- page-level rendering (print + preview): one PageItem per page -----------

export const ReportPageItems: React.FC<{
  items: PageItem[];
  ctx: ReportCtx;
  fieldMap: Record<string, ReportFieldDef>;
  scopeFilter?: ReportScopeFilter;
  hint?: boolean;
  showKeys?: boolean;
  pageIndex?: number;
  pageCount?: number;
}> = ({ items, ctx, fieldMap, scopeFilter, hint, showKeys, pageIndex = 0, pageCount = 1 }) => (  <>
    {items.map((pi, i) => {
      const pageAux: FieldAux = { pageIndex, pageCount };
      if ('repeatItem' in pi) {
        const { repeatItem, item, itemIndex } = pi;
        return (
          <div key={`ri-${repeatItem.id}-${i}`} style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
            {stripEdgeBreaks(repeatItem.children || []).map(cb => (
              <ReportBlockView
                key={cb.id}
                block={cb}
                ctx={ctx}
                fieldMap={fieldMap}
                item={item}
                parentCategory={repeatItem.collection === 'elements' ? repeatItem.category : undefined}
                parentCollection={repeatItem.collection}
                scopeFilter={scopeFilter}
                hint={hint}
                showKeys={showKeys}
                aux={{ ...pageAux, index: itemIndex ?? 0, counterStart: repeatItem.counterStart }}
                ancestors={[item]}
              />
            ))}
          </div>
        );
      }
      return <ReportBlockView key={pi.id} block={pi} ctx={ctx} fieldMap={fieldMap} scopeFilter={scopeFilter} hint={hint} showKeys={showKeys} aux={pageAux} />;
    })}
  </>
);

// ---- repeat (vertical stack of children) ------------------------------------

const ReportRepeatView: React.FC<Omit<ReportRenderProps, 'block'> & { block: ReportBlock }> = ({ block, ctx, fieldMap, item, parentCategory, scopeFilter, hint, showKeys, aux, ancestors }) => {
  const items = resolveCollectionItems(ctx, block.collection, block.category, item, parentCategory, block, ancestors) as ReportCollectionItem[];
  const filtered = filterItemsByScope(items, block.collection, block.collection === 'elements' ? block.category : undefined, scopeFilter);
  if (filtered.length === 0) {
    if (hint) return emptyHint('Empty — no items in this collection', getReportBlockBaseStyle(block));
    return null;
  }
  const gap = block.gap ?? 8;
  const children = block.children || [];
  const collection = block.collection as ReportCollection | undefined;
  // A table nested in an elementsOfCategory repeat is a SUMMARY table: it
  // renders ONCE per category, listing all of the category's elements — not
  // once per element. Any other same-collection nesting stays per-item.
  const onceTables = children.filter(cb => cb.type === 'table' && collection === 'elementsOfCategory' && tableItemCollection(cb, collection) === collection);
  const onceIds = new Set(onceTables.map(t => t.id));
  const perItemChildren = children.filter(cb => !onceIds.has(cb.id));
  const hasContent = perItemChildren.some(cb => cb.type !== 'pageBreak');

  const renderOnceTables = () => onceTables.map(cb => (
    <ReportBlockView
      key={cb.id}
      block={cb}
      ctx={ctx}
      fieldMap={fieldMap}
      item={item}
      parentCategory={collection === 'elements' || collection === 'elementsOfCategory' ? block.category || (item as any)?.key : parentCategory}
      parentCollection={collection}
      scopeFilter={scopeFilter}
      hint={hint}
      showKeys={showKeys}
      aux={aux}
      ancestors={[item, ...(ancestors || [])]}
      onceTable
    />
  ));

  if (!hasContent) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap }}>
        {renderOnceTables()}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap }}>
      {filtered.map((it, i) => {
        const itemChildren = i === filtered.length - 1 ? dropTrailingBreaks(perItemChildren) : perItemChildren;
        return (
          <div key={i} style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
            {itemChildren.map(cb => (
              <ReportBlockView key={cb.id} block={cb} ctx={ctx} fieldMap={fieldMap} item={it} parentCategory={block.collection === 'elements' ? block.category : parentCategory} parentCollection={block.collection} scopeFilter={scopeFilter} hint={hint} showKeys={showKeys} aux={{ ...aux, index: i, counterStart: block.counterStart ?? aux?.counterStart }} ancestors={[it, ...(ancestors || [])]} />
            ))}
          </div>
        );
      })}
      {onceTables.length > 0 && (
        <div>{renderOnceTables()}</div>
      )}
    </div>
  );
};

// ---- table (contextual repeat: attributes as columns or rows) ----------------

const TABLE_LABEL_W = 120;
const TABLE_ITEM_W = 72;

const ReportTableView: React.FC<Omit<ReportRenderProps, 'block'> & { block: ReportBlock }> = ({ block, ctx, fieldMap, item, parentCategory, parentCollection, scopeFilter, hint, showKeys, aux, onceTable, ancestors }) => {
  const nested = !!parentCollection;
  const itemCollection = tableItemCollection(block, parentCollection);
  const isPerItem = nested && contextualCollectionsFor(parentCollection).length === 0 && !onceTable;
  const items = isPerItem
    ? (item ? [item] : [])
    : (resolveCollectionItems(ctx, itemCollection, itemCollection === 'elements' || itemCollection === 'elementsOfScene' ? block.category : undefined, item, parentCategory, block, ancestors) as ReportCollectionItem[]);
  const filtered = filterItemsByScope(items, itemCollection, itemCollection === 'elements' ? block.category : undefined, scopeFilter);

  const baseStyle = getReportBlockBaseStyle(block);
  const cellPad = { padding: `${block.paddingV ?? 2}px ${block.paddingH ?? 4}px` };
  const border = block.showBorders === false ? 'none' : '1px solid #d4d4d8';
  const attributes = block.columns || [];
  if (attributes.length === 0) return null;

  const renderTable = (items: ReportCollectionItem[], skeleton = false) =>
    (block.axis ?? 'columns') === 'rows'
      ? <TableRowsMatrix block={block} ctx={ctx} fieldMap={fieldMap} items={items} itemCollection={itemCollection} baseStyle={baseStyle} cellPad={cellPad} border={border} showKeys={showKeys} aux={aux} perItemIndex={undefined} skeleton={skeleton} />
      : <TableColumnsGrid block={block} ctx={ctx} fieldMap={fieldMap} items={items} attributes={attributes} baseStyle={baseStyle} cellPad={cellPad} border={border} showKeys={showKeys} aux={aux} perItemIndex={undefined} skeleton={skeleton} />;

  // Designer canvas: an empty collection still shows the table skeleton
  // (header + field-key row) so the layout is visible without data.
  if (filtered.length === 0) {
    if (hint && attributes.length > 0) return renderTable([], true);
    if (hint) return emptyHint('Empty — no items in this collection', getReportBlockBaseStyle(block));
    return null;
  }
  // Per-item tables (one row per parent item, e.g. a table inside an element
  // repeater) keep the parent repeat's index so the Counter numbers the
  // repetitions — not the single row.
  const perItemIndex = isPerItem ? (aux?.index ?? 0) : undefined;

  // Per-column skip: hide items whose cell is empty in a column marked
  // skipEmpty (document fields like the counter always count as filled).
  // The legacy global skipEmptyRows flag still applies when set.
  const skipCols = attributes.some(c => c.skipEmpty);
  const shown = (block.skipEmptyRows || skipCols)
    ? filtered.filter((it: any) => attributes.every(c => {
        const def = fieldMap[c.field];
        if (def?.scope === 'document') return true;
        if (!c.skipEmpty && !block.skipEmptyRows) return true;
        return reportFieldValueByKey(ctx, fieldMap, c.field, it).trim() !== '';
      }))
    : filtered;
  if (shown.length === 0) {
    if (hint && attributes.length > 0) return renderTable([], true);
    return null;
  }

  return renderTable(shown);
};

const TableColumnsGrid: React.FC<{
  block: ReportBlock;
  ctx: ReportCtx;
  fieldMap: Record<string, ReportFieldDef>;
  items: ReportCollectionItem[];
  attributes: ReportBlock['columns'];
  baseStyle: React.CSSProperties;
  cellPad: React.CSSProperties;
  border: string;
  showKeys?: boolean;
  aux?: FieldAux;
  perItemIndex?: number;
  skeleton?: boolean;
}> = ({ block, ctx, fieldMap, items, attributes, baseStyle, cellPad, border, showKeys, aux, perItemIndex, skeleton }) => {
  const headerStyle = { ...baseStyle, ...cellPad, fontWeight: 700, background: '#f4f4f5' } as React.CSSProperties;
  const keyCell = (field: string) => (
    <span style={{ color: '#8f8f8f', fontStyle: 'italic' }}>{`{{${field}}}`}</span>
  );
  return (
    <div className="report-table-cols" style={{ borderTop: border, borderLeft: border }}>
      {block.showHeader && (
        <div style={{ display: 'flex', pageBreakInside: 'avoid', breakInside: 'avoid' }}>
          {attributes.map(c => (
            <div key={c.id} data-col-ci={c.id} style={{ ...headerStyle, width: `${c.width}%`, textAlign: c.align || 'left', borderRight: border, borderBottom: border }}>
              {fieldMap[c.field]?.label || c.field || ''}
            </div>
          ))}
        </div>
      )}
      {skeleton ? (
        <div style={{ display: 'flex', pageBreakInside: 'avoid', breakInside: 'avoid' }}>
          {attributes.map(c => (
            <div key={c.id} data-col-ci={c.id} style={{ ...baseStyle, ...cellPad, width: `${c.width}%`, textAlign: c.align || 'left', borderRight: border, borderBottom: border }}>
              {keyCell(c.field)}
            </div>
          ))}
        </div>
      ) : items.map((it, i) => (
        <div key={i} style={{ display: 'flex', pageBreakInside: 'avoid', breakInside: 'avoid' }}>
          {attributes.map(c => (
            <div key={c.id} data-col-ci={c.id} style={{ ...baseStyle, ...cellPad, ...(c.bold ? { fontWeight: 700 } : {}), ...(c.italic ? { fontStyle: 'italic' } : {}), width: `${c.width}%`, textAlign: c.align || 'left', borderRight: border, borderBottom: border }}>
              {showKeys
                ? keyCell(c.field)
                : (reportFieldValueByKey(ctx, fieldMap, c.field, it, { ...aux, index: perItemIndex ?? i, counterStart: block.counterStart ?? aux?.counterStart }) || '\u00A0')}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

const TableRowsMatrix: React.FC<{
  block: ReportBlock;
  ctx: ReportCtx;
  fieldMap: Record<string, ReportFieldDef>;
  items: ReportCollectionItem[];
  itemCollection: ReportCollection;
  baseStyle: React.CSSProperties;
  cellPad: React.CSSProperties;
  border: string;
  showKeys?: boolean;
  aux?: FieldAux;
  perItemIndex?: number;
  skeleton?: boolean;
}> = ({ block, ctx, fieldMap, items, itemCollection, baseStyle, cellPad, border, showKeys, aux, perItemIndex, skeleton }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [chunk, setChunk] = useState(() => Math.max(1, Math.floor((800 - TABLE_LABEL_W) / TABLE_ITEM_W)));
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setChunk(Math.max(1, Math.floor((el.clientWidth - TABLE_LABEL_W) / TABLE_ITEM_W)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const attributes = block.columns || [];
  const identityField = block.headerField || defaultIdentityField(itemCollection);
  const keySpan = (field: string) => (
    <span style={{ color: '#8f8f8f', fontStyle: 'italic' }}>{`{{${field}}}`}</span>
  );
  const groups: ReportCollectionItem[][] = [];
  for (let i = 0; i < items.length; i += chunk) groups.push(items.slice(i, i + chunk));

  const labelStyle = { ...baseStyle, ...cellPad, fontWeight: 700, background: '#f4f4f5' } as React.CSSProperties;

  if (skeleton) {
    return (
      <div ref={ref} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="report-table-cols" style={{ borderTop: border, borderLeft: border, pageBreakInside: 'avoid', breakInside: 'avoid' }}>
          <div style={{ display: 'flex' }}>
            <div style={{ ...labelStyle, width: TABLE_LABEL_W, borderRight: border, borderBottom: border }}>
              {fieldMap[identityField]?.label || identityField || ''}
            </div>
            <div style={{ ...labelStyle, flex: '1 1 0%', minWidth: 0, textAlign: 'center', borderRight: border, borderBottom: border }}>
              {keySpan(identityField)}
            </div>
          </div>
          {attributes.map(a => (
            <div key={a.id} style={{ display: 'flex' }}>
              <div style={{ ...labelStyle, width: TABLE_LABEL_W, textAlign: 'left', borderRight: border, borderBottom: border }}>
                {fieldMap[a.field]?.label || a.field || ''}
              </div>
              <div style={{ ...baseStyle, ...cellPad, flex: '1 1 0%', minWidth: 0, textAlign: a.align || 'left', borderRight: border, borderBottom: border }}>
                {keySpan(a.field)}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div ref={ref} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {groups.map((g, gi) => (
        <div key={gi} className="report-table-cols" style={{ borderTop: border, borderLeft: border, pageBreakInside: 'avoid', breakInside: 'avoid' }}>
          {g.length > 1 && (
            <div style={{ display: 'flex' }}>
              <div style={{ ...labelStyle, width: TABLE_LABEL_W, borderRight: border, borderBottom: border }}>&nbsp;</div>
              {g.map((it, ii) => {
                const gIndex = perItemIndex ?? gi * chunk + ii;
                return (
                  <div key={ii} style={{ ...labelStyle, flex: '1 1 0%', minWidth: 0, textAlign: 'center', borderRight: border, borderBottom: border }}>
                    {showKeys
                      ? keySpan(identityField)
                      : (reportFieldValueByKey(ctx, fieldMap, identityField, it, { ...aux, index: gIndex, counterStart: block.counterStart ?? aux?.counterStart }) || '\u00A0')}
                  </div>
                );
              })}
            </div>
          )}
          {attributes.map(a => (
            <div key={a.id} style={{ display: 'flex' }}>
              <div style={{ ...labelStyle, width: TABLE_LABEL_W, textAlign: 'left', borderRight: border, borderBottom: border }}>
                {fieldMap[a.field]?.label || a.field || ''}
              </div>
              {g.map((it, ii) => {
                const gIndex = perItemIndex ?? gi * chunk + ii;
                return (
                  <div key={ii} style={{ ...baseStyle, ...cellPad, ...(a.bold ? { fontWeight: 700 } : {}), ...(a.italic ? { fontStyle: 'italic' } : {}), flex: '1 1 0%', minWidth: 0, textAlign: a.align || 'left', borderRight: border, borderBottom: border }}>
                    {showKeys
                      ? keySpan(a.field)
                      : (reportFieldValueByKey(ctx, fieldMap, a.field, it, { ...aux, index: gIndex, counterStart: block.counterStart ?? aux?.counterStart }) || '\u00A0')}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};
