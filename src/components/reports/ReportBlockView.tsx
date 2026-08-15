import React, { useEffect, useRef, useState } from 'react';
import { ReportBlock, ReportCollection } from '../../types';
import { ReportCtx, ReportCollectionItem, ReportScopeFilter, filterItemsByScope, resolveCollectionItems, ancestorSceneScope } from '../../lib/reportData';
import { reportFieldValueByKey, resolveReportTokens, resolveReportTokensHtml, applyItemAffixes, ReportFieldDef, FieldAux, fieldChipColor } from '../../lib/reportFields';
import { getReportBlockBaseStyle } from './reportStyle';
import { ReportRibbonView } from './ReportRibbonView';
import { ReportMapView } from './ReportMapView';
import { ReportLocationLink } from './ReportLocationLink';
import { contextualCollectionsFor, defaultIdentityField, tableItemCollection } from '../../lib/reportBlocks';
import { stripRichText, normalizeSpaces } from '../../lib/richText';
import { PageItem, stripEdgeBreaks } from '../../lib/reportPagination';

// Pure block renderer for reports (designer canvas + print). All data comes
// from the canonical ReportCtx; items are resolved by the parent repeat.

export interface ReportRenderProps {
  block: ReportBlock;
  ctx: ReportCtx;
  fieldMap: Record<string, ReportFieldDef>;
  item?: ReportCollectionItem;
  parentCategory?: string;
  parentCollection?: ReportCollection;
  scopeFilter?: ReportScopeFilter;
  hint?: boolean;
  showKeys?: boolean;
  /** Designer canvas: empty token values render as their raw {{token}} text. */
  showUnresolved?: boolean;
  aux?: FieldAux;
  onceTable?: boolean;  // summary table inside a same-collection repeat: list all items
  ancestors?: ReportCollectionItem[]; // full parent-item chain, nearest first — for scopedToParent
  onColumnSelect?: (colIndex: number) => void;            // designer only (columns-mode tables)
  onColumnContextMenu?: (e: React.MouseEvent, colIndex: number) => void;
  onMoveColumn?: (from: number, to: number) => void;
  selectedColumn?: number | null;
  /** Preview surfaces: full-schedule ribbon blocks render the first strips
   *  plus an "…N more" indicator instead of the whole schedule. */
  previewLimit?: boolean;
}

function isEmptyValue(v: string): boolean {
  return !v.trim();
}

/** Field value as a React node: plain text, or a clickable anchor when the
 *  field is a link field (map links, emails, phones) or its value is itself a
 *  URL. Shared by field blocks and table cells so links work everywhere.
 *  Anchors inherit the surrounding typography — cells stay readable, links
 *  only exist as behavior (the explicit Link block keeps link styling). */
function fieldValueNode(
  ctx: ReportCtx,
  fieldMap: Record<string, ReportFieldDef>,
  field: string,
  item: any,
  aux?: FieldAux,
): React.ReactNode {
  const def = fieldMap[field];
  const value = reportFieldValueByKey(ctx, fieldMap, field, item, aux);
  const anchorStyle: React.CSSProperties = { color: 'inherit', textDecoration: 'none' };
  if (!value || def.multiValue) return value;
  if (def?.link) {
    const kind = def.linkKind || 'url';
    const href = kind === 'mailto' ? `mailto:${value}` : kind === 'tel' ? `tel:${value}` : value;
    if (!/^(https?:\/\/|mailto:|tel:)/i.test(href)) return value;
    const label = kind === 'url' && def.linkLabel ? def.linkLabel(ctx, item) : value;
    return <a href={href} target="_blank" rel="noreferrer" style={anchorStyle}>{label || href}</a>;
  }
  // Plain attributes holding a URL link like rich-text links do (scheme
  // guarded — a raw value can't inject javascript: URLs).
  const trimmed = value.trim();
  if (/^(https?:\/\/|mailto:|tel:)/i.test(trimmed)) {
    return <a href={trimmed} target="_blank" rel="noreferrer" style={anchorStyle}>{value}</a>;
  }
  return value;
}

function visibleFor(b: ReportBlock, value: string): boolean {
  if (!isEmptyValue(value)) return true;
  return (b.emptyBehavior ?? 'show') !== 'hideBlock';
}

function emptyHint(text: string, style: React.CSSProperties): React.ReactNode {
  return <div style={{ ...style, color: '#8f8f8f', fontStyle: 'italic' }}>{text}</div>;
}

const TOKEN_CHIP_RE = /(\{\{[^}]+\}\})/g;

/** Template preview: `{{field}}` tokens render as color-coded chips (one color
 *  per attribute group) so the "this is a template" nature of a text block is
 *  obvious in key mode. */
export const TokenPreview: React.FC<{ text: string; fieldMap?: Record<string, ReportFieldDef> }> = ({ text, fieldMap }) => {
  const parts = normalizeSpaces(text).split(TOKEN_CHIP_RE);
  return (
    <>
      {parts.map((part, i) => {
        const key = part.startsWith('{{') && part.endsWith('}}') && part.length > 4 ? part.slice(2, -2).trim() : null;
        const fieldKey = key ? key.split('|')[0].trim() : null;
        const customized = key ? key.includes('|') : false;
        if (key !== null) {
          const def = fieldKey ? fieldMap?.[fieldKey] : undefined;
          const color = def ? fieldChipColor(def.group) : { text: '#52525b', bg: 'rgba(82, 82, 91, 0.12)' };
          return (
            <span key={i} style={{ background: color.text, color: '#ffffff', borderRadius: 2, padding: '1px 4px', margin: '0 2px', fontWeight: 600, fontStyle: 'normal' }}>
              {part}
              {customized && <span style={{ opacity: 0.7, marginLeft: 2 }}>*</span>}
            </span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
};

/** Drops trailing pageBreak children (a trailing break would print a blank page). */
function dropTrailingBreaks(list: ReportBlock[]): ReportBlock[] {
  let end = list.length;
  while (end > 0 && list[end - 1].type === 'pageBreak') end--;
  return end === list.length ? list : list.slice(0, end);
}

export const ReportBlockView: React.FC<ReportRenderProps> = React.memo(
  ({ block, ctx, fieldMap, item, parentCategory, parentCollection, scopeFilter, hint, showKeys, showUnresolved, aux, onceTable, ancestors, onColumnSelect, onColumnContextMenu, onMoveColumn, selectedColumn, previewLimit }) => {
    const baseStyle = getReportBlockBaseStyle(block, ctx.project);
    const blockAux: FieldAux = {
      ...aux,
      counterStart: block.counterStart ?? aux?.counterStart,
      dayFormat: block.dayFormat ?? aux?.dayFormat,
      sceneScope: ancestorSceneScope(ctx, ancestors),
    };

    switch (block.type) {
      case 'text': {
        if (showKeys) {
          return (
            <div style={{ ...baseStyle, color: '#8f8f8f', fontStyle: 'italic' }}>
              {block.text ? <TokenPreview text={block.text} fieldMap={fieldMap} /> : '\u00A0'}
            </div>
          );
        }
        const html = resolveReportTokensHtml(ctx, fieldMap, block.text || '', item, blockAux, { showUnresolved });
        const text = stripRichText(html);
        if (!visibleFor(block, text)) return null;
        const st: React.CSSProperties = { ...baseStyle };
        if ((block.emptyBehavior ?? 'show') === 'hideText' && isEmptyValue(text)) st.display = 'none';
        const isHtml = html.includes('<');
        if (isHtml) {
          return <div className="report-text-block" style={st} dangerouslySetInnerHTML={{ __html: html || '\u00A0' }} />;
        }
        return <div className="report-text-block" style={{ ...st, whiteSpace: 'pre-wrap' }}>{text || '\u00A0'}</div>;
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
        // Link fields render a clickable anchor (prefix/suffix stay outside).
        const node = fieldValueNode(ctx, fieldMap, block.field, item, blockAux);
        if (node !== value) {
          return <div style={st}>{block.prefix}{node}{block.suffix}</div>;
        }
        return <div style={st}>{text || '\u00A0'}</div>;
      }
      case 'repeat': {
        return <ReportRepeatView block={block} ctx={ctx} fieldMap={fieldMap} item={item} parentCategory={parentCategory} scopeFilter={scopeFilter} hint={hint} showKeys={showKeys} showUnresolved={showUnresolved} aux={blockAux} ancestors={ancestors} />;
      }
      case 'table': {
        return <ReportTableView block={block} ctx={ctx} fieldMap={fieldMap} item={item} parentCategory={parentCategory} parentCollection={parentCollection} scopeFilter={scopeFilter} hint={hint} showKeys={showKeys} aux={blockAux} onceTable={onceTable} ancestors={ancestors} onColumnSelect={onColumnSelect} onColumnContextMenu={onColumnContextMenu} onMoveColumn={onMoveColumn} selectedColumn={selectedColumn} />;
      }
      case 'columns': {
        const cols = block.cols || [];
        const total = cols.reduce((a, c) => a + c.width, 0);
        return (
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            {cols.map(col => (
              <div key={col.id} style={{ flex: `${total > 0 ? col.width / total : 1 / cols.length} 1 0%`, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                { (col.blocks || []).map(cb => (
                  <ReportBlockView key={cb.id} block={cb} ctx={ctx} fieldMap={fieldMap} item={item} parentCategory={parentCategory} parentCollection={parentCollection} scopeFilter={scopeFilter} hint={hint} showKeys={showKeys} showUnresolved={showUnresolved} aux={blockAux} ancestors={ancestors} />
                ))}
              </div>
            ))}
          </div>
        );
      }
      case 'ribbon': {
        return <ReportRibbonView block={block} ctx={ctx} item={item} hint={hint} ancestors={ancestors} previewLimit={previewLimit} />;
      }
      case 'pageBreak': {
        return <div className="report-page-break" style={{ height: 1 }} />;
      }
      case 'spacer': {
        const h = block.height ?? 16;
        const style = block.spacerStyle ?? 'none';
        if (style === 'none') {
          // Designer canvas: an empty spacer is invisible — label it so the
          // block is obvious (print/preview stay clean).
          if (hint) {
            return (
              <div style={{ height: h, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#a1a1aa', fontStyle: 'italic', letterSpacing: '0.08em' }}>
                SPACER
              </div>
            );
          }
          return <div style={{ height: h }} aria-hidden />;
        }
        if (style === 'black') {
          return <div style={{ height: h, background: '#000' }} aria-hidden />;
        }
        return (
          <div style={{ height: h, display: 'flex', alignItems: 'center' }}>
            <div style={{ width: '100%', borderTop: style === 'dotted' ? '2px dotted #000' : '1px solid #000' }} />
          </div>
        );
      }
      case 'image': {
        if (!block.imageDataUrl) {
          return hint ? emptyHint('Attach an image…', baseStyle) : null;
        }
        const height = block.imageHeight;
        const fit = block.imageFit ?? 'contain';
        return (
          <img
            src={block.imageDataUrl}
            alt=""
            style={{
              display: 'block',
              width: '100%',
              ...(height ? { height, objectFit: fit } : { height: 'auto' }),
            }}
          />
        );
      }
      case 'map': {
        return <ReportMapView block={block} ctx={ctx} item={item} hint={hint} />;
      }
      case 'link': {
        const label = block.text || '';
        const rawUrl = resolveReportTokens(ctx, fieldMap, block.url || '', item, blockAux, { showUnresolved: hint });
        // Only real web/mail links — tokens can't inject javascript: URLs.
        const safeUrl = /^(https?:\/\/|mailto:)/i.test(rawUrl) ? rawUrl : '';
        if (!label && !safeUrl) {
          return hint ? emptyHint('Link…', baseStyle) : null;
        }
        const st: React.CSSProperties = { ...baseStyle, display: 'block' };
        if (!safeUrl) {
          return <div style={{ ...st, color: '#8f8f8f', textDecoration: 'underline', textDecorationColor: '#b6b6bd' }}>{label || rawUrl || '\u00A0'}</div>;
        }
        return (
          <ReportLocationLink
            href={safeUrl}
            label={label || rawUrl}
            style={{ ...st, color: '#1d4ed8', textDecoration: 'underline', cursor: 'pointer' }}
          />
        );
      }
      case 'callSheetEdit': {
        // Future Call Sheet Designer: this is the per-day editable region of a
        // call-sheet template. In the reports designer it's a locked zone —
        // the designer only accepts drops into repeat/table containers, so no
        // children can be added here. Children render if the block already has
        // them (forward-compat for the callsheet designer).
        const children = block.children || [];
        if (children.length === 0) {
          if (hint) {
            return (
              <div style={{ border: '1px dashed #a1a1aa', borderRadius: 6, padding: 10, textAlign: 'center', fontSize: 10, color: '#8f8f8f', fontStyle: 'italic' }}>
                Call Sheet Edit Zone — per-day content lives here (editable in the Call Sheet Designer)
              </div>
            );
          }
          return null;
        }
        return (
          <div style={{ border: '1px dashed #a1a1aa', borderRadius: 6, padding: 8 }}>
            {children.map(cb => (
              <ReportBlockView
                key={cb.id}
                block={cb}
                ctx={ctx}
                fieldMap={fieldMap}
                item={item}
                parentCategory={parentCategory}
                parentCollection={parentCollection}
                scopeFilter={scopeFilter}
                hint={hint}
                showKeys={showKeys}
                showUnresolved={showUnresolved}
                aux={aux}
                onceTable={onceTable}
                ancestors={ancestors}
              />
            ))}
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
    a.showUnresolved === b.showUnresolved &&
    a.ancestors === b.ancestors &&
    a.aux === b.aux &&
    a.onceTable === b.onceTable &&
    a.onColumnSelect === b.onColumnSelect &&
    a.onColumnContextMenu === b.onColumnContextMenu &&
    a.onMoveColumn === b.onMoveColumn &&
    a.selectedColumn === b.selectedColumn &&
    a.previewLimit === b.previewLimit,
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
  header?: ReportBlock[];
  footer?: ReportBlock[];
  headerSkipFirst?: boolean;
  footerSkipFirst?: boolean;
  previewLimit?: boolean;
}> = ({ items, ctx, fieldMap, scopeFilter, hint, showKeys, pageIndex = 0, pageCount = 1, header, footer, headerSkipFirst, footerSkipFirst, previewLimit }) => {
  const pageAux: FieldAux = { pageIndex, pageCount };
  const showHeader = !!(header && header.length > 0 && !(headerSkipFirst && pageIndex === 0));
  const showFooter = !!(footer && footer.length > 0 && !(footerSkipFirst && pageIndex === 0));
  return (
    <div className="report-page-body" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {showHeader && (
        <div className="report-page-header">
          {header!.map(b => (
            <ReportBlockView key={b.id} block={b} ctx={ctx} fieldMap={fieldMap} scopeFilter={scopeFilter} hint={hint} showKeys={showKeys} aux={pageAux} previewLimit={previewLimit} />
          ))}
        </div>
      )}
      <div style={{ flex: 1 }}>
        {items.map((pi, i) => {
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
                    previewLimit={previewLimit}
                  />
                ))}
              </div>
            );
          }
          return <ReportBlockView key={pi.id} block={pi} ctx={ctx} fieldMap={fieldMap} scopeFilter={scopeFilter} hint={hint} showKeys={showKeys} aux={pageAux} previewLimit={previewLimit} />;
        })}
      </div>
      {showFooter && (
        <div className="report-page-footer">
          {footer!.map(b => (
            <ReportBlockView key={b.id} block={b} ctx={ctx} fieldMap={fieldMap} scopeFilter={scopeFilter} hint={hint} showKeys={showKeys} aux={pageAux} previewLimit={previewLimit} />
          ))}
        </div>
      )}
    </div>
  );
};

// ---- repeat (vertical stack of children) ------------------------------------

const ReportRepeatView: React.FC<Omit<ReportRenderProps, 'block'> & { block: ReportBlock }> = ({ block, ctx, fieldMap, item, parentCategory, scopeFilter, hint, showKeys, showUnresolved, aux, ancestors }) => {
  const items = resolveCollectionItems(ctx, block.collection, block.category, item, parentCategory, block, ancestors) as ReportCollectionItem[];
  const filtered = filterItemsByScope(items, block.collection, block.collection === 'elements' ? block.category : undefined, scopeFilter);
  if (filtered.length === 0) {
    if (hint) return emptyHint('Empty — no items in this collection', getReportBlockBaseStyle(block, ctx.project));
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
      showUnresolved={showUnresolved}
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
              <ReportBlockView key={cb.id} block={cb} ctx={ctx} fieldMap={fieldMap} item={it} parentCategory={block.collection === 'elements' ? block.category : parentCategory} parentCollection={block.collection} scopeFilter={scopeFilter} hint={hint} showKeys={showKeys} showUnresolved={showUnresolved} aux={{ ...aux, index: i, counterStart: block.counterStart ?? aux?.counterStart }} ancestors={[it, ...(ancestors || [])]} />
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

/** Preview surfaces cap tables at this many item rows (+N more indicator). */
const TABLE_PREVIEW_LIMIT = 6;

const ReportTableView: React.FC<Omit<ReportRenderProps, 'block'> & { block: ReportBlock }> = ({ block, ctx, fieldMap, item, parentCategory, parentCollection, scopeFilter, hint, showKeys, aux, onceTable, ancestors, onColumnSelect, onColumnContextMenu, onMoveColumn, selectedColumn, previewLimit }) => {
  const nested = !!parentCollection;
  const itemCollection = tableItemCollection(block, parentCollection);
  const isPerItem = nested && contextualCollectionsFor(parentCollection).length === 0 && !onceTable;
  const items = isPerItem
    ? (item ? [item] : [])
    : (resolveCollectionItems(ctx, itemCollection, itemCollection === 'elements' || itemCollection === 'elementsOfScene' ? block.category : undefined, item, parentCategory, block, ancestors) as ReportCollectionItem[]);
  const filtered = filterItemsByScope(items, itemCollection, itemCollection === 'elements' ? block.category : undefined, scopeFilter);

  const baseStyle = getReportBlockBaseStyle(block, ctx.project);
  const cellPad = { padding: `${block.paddingV ?? 2}px ${block.paddingH ?? 4}px` };
  const border = block.showBorders === false ? 'none' : '1px solid #d4d4d8';
  const attributes = block.columns || [];
  if (attributes.length === 0) return null;

  const renderTable = (items: ReportCollectionItem[], skeleton = false) =>
    (block.axis ?? 'columns') === 'rows'
      ? <TableRowsMatrix block={block} ctx={ctx} fieldMap={fieldMap} items={items} itemCollection={itemCollection} baseStyle={baseStyle} cellPad={cellPad} border={border} showKeys={showKeys} aux={aux} perItemIndex={undefined} skeleton={skeleton} />
      : <TableColumnsGrid block={block} ctx={ctx} fieldMap={fieldMap} items={items} attributes={attributes} baseStyle={baseStyle} cellPad={cellPad} border={border} showKeys={showKeys} aux={aux} perItemIndex={undefined} skeleton={skeleton} onColumnSelect={onColumnSelect} onColumnContextMenu={onColumnContextMenu} onMoveColumn={onMoveColumn} selectedColumn={selectedColumn} />;

  // Designer canvas: an empty collection still shows the table skeleton
  // (header + field-key row) so the layout is visible without data.
  if (filtered.length === 0) {
    if (hint && attributes.length > 0) return renderTable([], true);
    if (hint) return emptyHint('Empty — no items in this collection', getReportBlockBaseStyle(block, ctx.project));
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

  // Preview surfaces cap the table at the first TABLE_PREVIEW_LIMIT rows and
  // show a "+N more" row; print always renders everything.
  if (previewLimit && shown.length > TABLE_PREVIEW_LIMIT) {
    const more = shown.length - TABLE_PREVIEW_LIMIT;
    return (
      <>
        {renderTable(shown.slice(0, TABLE_PREVIEW_LIMIT))}
        <div className="report-table-cols" style={{ border: 'none', borderLeft: border, borderRight: border, borderBottom: border }}>
          <div style={{ padding: '4px 8px', textAlign: 'center', fontStyle: 'italic', color: '#8f8f8f', fontSize: 10, background: '#fafafa' }}>
            +{more} more
          </div>
        </div>
      </>
    );
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
  onColumnSelect?: (colIndex: number) => void;
  onColumnContextMenu?: (e: React.MouseEvent, colIndex: number) => void;
  onMoveColumn?: (from: number, to: number) => void;
  selectedColumn?: number | null;
}> = ({ block, ctx, fieldMap, items, attributes, baseStyle, cellPad, border, showKeys, aux, perItemIndex, skeleton, onColumnSelect, onColumnContextMenu, onMoveColumn, selectedColumn }) => {
  const headerStyle = { ...baseStyle, ...cellPad, fontWeight: 700, background: '#f4f4f5' } as React.CSSProperties;
  const keyCell = (field: string) => (
    <span style={{ color: '#8f8f8f', fontStyle: 'italic' }}>{`{{${field}}}`}</span>
  );
  const editable = !!onColumnSelect;
  const dragRef = React.useRef<{ from: number; startX: number; startY: number; dragging: boolean } | null>(null);
  const [reorderFrom, setReorderFrom] = React.useState<number | null>(null);
  const [reorderOver, setReorderOver] = React.useState<number | null>(null);
  const reorderOverRef = React.useRef<number | null>(null);
  reorderOverRef.current = reorderOver;

  const startPointer = (e: React.PointerEvent, ci: number) => {
    if (!editable) return;
    // preventDefault stops the block card's native HTML5 drag from swallowing
    // pointer events; selection happens on pointerup instead of click.
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { from: ci, startX: e.clientX, startY: e.clientY, dragging: false };
    const rowEl = (e.currentTarget as HTMLElement).parentElement;
    const onMove = (ev: PointerEvent) => {
      const d = dragRef.current;
      if (!d || !rowEl) return;
      if (!d.dragging && Math.abs(ev.clientX - d.startX) + Math.abs(ev.clientY - d.startY) < 6) return;
      if (!d.dragging) {
        d.dragging = true;
        setReorderFrom(d.from);
      }
      ev.preventDefault();
      const rect = rowEl.getBoundingClientRect();
      const cells = Array.from(rowEl.children) as HTMLElement[];
      const x = ev.clientX - rect.left;
      let acc = 0;
      const centers = cells.map(c => { const w = c.getBoundingClientRect().width; acc += w; return acc - w / 2; });
      let over = cells.length - 1;
      for (let i = 0; i < centers.length; i++) {
        if (x <= centers[i] + 0.5) { over = i; break; }
      }
      reorderOverRef.current = over;
      setReorderOver(over);
    };
    const onUp = () => {
      const d = dragRef.current;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (!d) return;
      if (d.dragging) {
        if (reorderOverRef.current !== null && reorderOverRef.current !== d.from && onMoveColumn) {
          onMoveColumn(d.from, reorderOverRef.current);
        }
      } else if (onColumnSelect) {
        onColumnSelect(d.from);
      }
      dragRef.current = null;
      setReorderFrom(null);
      setReorderOver(null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const cellHandlers = (ci: number) => ({
    onPointerDown: editable ? ((e: React.PointerEvent) => startPointer(e, ci)) : undefined,
    onContextMenu: onColumnContextMenu ? ((e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); onColumnContextMenu(e, ci); }) : undefined,
  });

  const colOutline = (ci: number): React.CSSProperties => {
    if (selectedColumn === ci) return { outline: '2px solid #3b82f6', outlineOffset: -2 };
    if (reorderFrom !== null && reorderOver !== null && reorderFrom !== reorderOver && reorderOver === ci) return { outline: '2px dashed #3b82f6', outlineOffset: -2 };
    if (reorderFrom === ci) return { opacity: 0.45 };
    return {};
  };

  return (
    <div className="report-table-cols" style={{ borderTop: border, borderLeft: border }}>
      {block.showHeader && (
        <div style={{ display: 'flex', pageBreakInside: 'avoid', breakInside: 'avoid' }}>
          {attributes.map((c, ci) => (
            <div key={c.id} data-col-ci={c.id} data-table-col-ci={ci} {...cellHandlers(ci)} style={{ ...headerStyle, width: `${c.width}%`, textAlign: c.align || 'left', borderRight: border, borderBottom: border, cursor: editable ? 'pointer' : undefined, ...colOutline(ci) }}>
              {fieldMap[c.field]?.label || c.field || ''}
              {editable && <span style={{ float: 'right', opacity: 0.35, fontSize: 9, lineHeight: '14px' }}>⠿</span>}
            </div>
          ))}
        </div>
      )}
      {skeleton ? (
        <div style={{ display: 'flex', pageBreakInside: 'avoid', breakInside: 'avoid' }}>
          {attributes.map((c, ci) => (
            <div key={c.id} data-col-ci={c.id} data-table-col-ci={ci} {...cellHandlers(ci)} style={{ ...baseStyle, ...cellPad, width: `${c.width}%`, textAlign: c.align || 'left', borderRight: border, borderBottom: border, cursor: editable ? 'pointer' : undefined, ...colOutline(ci) }}>
              {keyCell(c.field)}
            </div>
          ))}
        </div>
      ) : items.map((it, i) => (
        <div key={i} style={{ display: 'flex', pageBreakInside: 'avoid', breakInside: 'avoid' }}>
          {attributes.map((c, ci) => (
            <div key={c.id} data-col-ci={c.id} data-table-col-ci={ci} {...cellHandlers(ci)} style={{ ...baseStyle, ...cellPad, ...(c.bold ? { fontWeight: 700 } : {}), ...(c.italic ? { fontStyle: 'italic' } : {}), width: `${c.width}%`, textAlign: c.align || 'left', borderRight: border, borderBottom: border, cursor: editable ? 'pointer' : undefined, ...colOutline(ci) }}>
              {showKeys
                ? keyCell(c.field)
                : (fieldValueNode(ctx, fieldMap, c.field, it, { ...aux, index: perItemIndex ?? i, counterStart: block.counterStart ?? aux?.counterStart }) || '\u00A0')}
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
                      : (fieldValueNode(ctx, fieldMap, identityField, it, { ...aux, index: gIndex, counterStart: block.counterStart ?? aux?.counterStart }) || '\u00A0')}
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
                      : (fieldValueNode(ctx, fieldMap, a.field, it, { ...aux, index: gIndex, counterStart: block.counterStart ?? aux?.counterStart }) || '\u00A0')}
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
