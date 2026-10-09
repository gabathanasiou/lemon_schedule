import React, { useMemo } from 'react';
import type { ReportBlock, ReportCollection, ReportViewMode } from '../../types';
import type { ReportCollectionItem, ReportCtx } from '../../lib/reportData';
import { reportFieldValueByKey, type ReportFieldDef } from '../../lib/reportFields';
import { getReportBorder, REPORT_TABLE_HEADER_BG } from '../../lib/reportLook';
import { getReportBlockBaseStyle } from './reportStyle';
import {
  isReportGridCollection,
  resolveReportGridGroups,
  skeletonReportGridGroups,
  type ReportGridGroup,
} from '../../lib/reportGrids';

/**
 * Static renderer for the day-scoped GRID blocks (items 111/112) — the
 * Call Times table and its crew sibling. One table per category (cast-first)
 * with fixed registry columns, using the shared `.report-table-cols`/`.rm-row`
 * recipe so the measured paginator splits it between rows. The interactive
 * InlineGlide version lives in `production/day/InteractiveGridBlock` and shares
 * the `lib/reportGrids` read model.
 */
interface ReportGridBlockProps {
  block: ReportBlock;
  ctx: ReportCtx;
  fieldMap: Record<string, ReportFieldDef>;
  /** The enclosing day item (a `days` repeat row). */
  dayItem?: ReportCollectionItem;
  hint?: boolean;
  mode?: ReportViewMode;
  showKeys?: boolean;
  rowRange?: [number, number];
  onPatchBlock?: (patch: Partial<ReportBlock>) => void;
  showUnresolved?: boolean;
  parentCollection?: ReportCollection;
  /** The title node (item 140), built by `ReportBlockView`. */
  title?: React.ReactNode;
}

type FlatRow =
  | { kind: 'group'; group: ReportGridGroup; gap: number }
  | { kind: 'head'; group: ReportGridGroup }
  | { kind: 'key'; group: ReportGridGroup }
  | { kind: 'data'; group: ReportGridGroup; item: ReportCollectionItem };

const ReportGridBlock: React.FC<ReportGridBlockProps> = ({ block, ctx, fieldMap, dayItem, hint, mode, showKeys, rowRange, onPatchBlock, showUnresolved, parentCollection, title }) => {
  const collection = isReportGridCollection(block.collection) ? block.collection : null;
  const baseStyle = getReportBlockBaseStyle(block, ctx.project);
  const cellPad = { padding: `${block.paddingV ?? 2}px ${block.paddingH ?? 4}px` };
  const border = getReportBorder(block.showBorders !== false);
  const headerStyle = { ...baseStyle, ...cellPad, fontWeight: 700, background: REPORT_TABLE_HEADER_BG } as React.CSSProperties;
  const keyStyle: React.CSSProperties = { color: '#8f8f8f', fontStyle: 'italic' };

  const groups = useMemo(() => {
    if (!collection) return [];
    const real = dayItem ? resolveReportGridGroups(ctx, collection, block.category, dayItem, fieldMap, { includeAll: block.precallsAll, include: block.precallsDepts }) : [];
    const withRows = real.filter(g => g.items.length > 0);
    if (withRows.length > 0) return withRows;
    return hint ? skeletonReportGridGroups(ctx.project, collection, block.category, fieldMap) : [];
  }, [collection, ctx, block.category, block.precallsAll, block.precallsDepts, dayItem, fieldMap, hint]);

  if (groups.length === 0) return null;

  // Horizontal precalls layout (item 159): one column per department with a
  // single resolved-call row. Same `.report-table-cols`/`.rm-row` recipe, so
  // designer, preview, print and the paginator stay on one path.
  if (collection === 'departmentCallsOfDay' && (block.precallsLayout ?? 'horizontal') === 'horizontal') {
    const items = (groups[0]?.items ?? []) as unknown as { label: string }[];
    const w = `${100 / Math.max(1, items.length)}%`;
    // Department names WRAP inside their column (never clipped/abbreviated) —
    // the same treatment the editor's wrapped glide headers give (item 159).
    const wrap: React.CSSProperties = { wordBreak: 'break-word', lineHeight: 1.15 };
    const head = items.length > 0
      ? items.map((it, i) => (
          <div key={`gh${i}`} style={{ ...headerStyle, ...wrap, textAlign: 'center', width: w, borderRight: border, borderBottom: border }}>{it.label}</div>
        ))
      : [<div key="gh0" style={{ ...headerStyle, textAlign: 'center', width: '100%', borderRight: border, borderBottom: border }}><span style={keyStyle}>{'{{departmentLabel}}'}</span></div>];
    const data = items.length > 0
      ? items.map((it, i) => (
          <div key={`gd${i}`} style={{ ...baseStyle, ...cellPad, ...wrap, textAlign: 'center', width: w, borderRight: border, borderBottom: border }}>
            {showKeys
              ? <span style={keyStyle}>{'{{departmentCallTime}}'}</span>
              : (reportFieldValueByKey(ctx, fieldMap, 'departmentCallTime', it) || '\u00A0')}
          </div>
        ))
      : [<div key="gd0" style={{ ...baseStyle, ...cellPad, textAlign: 'center', width: '100%', borderRight: border, borderBottom: border }}><span style={keyStyle}>{'{{departmentCallTime}}'}</span></div>];
    const rows = [
      <div key="hrow" className="rm-row" style={{ display: 'flex', pageBreakInside: 'avoid', breakInside: 'avoid' }}>{head}</div>,
      <div key="drow" className="rm-row" style={{ display: 'flex', pageBreakInside: 'avoid', breakInside: 'avoid' }}>{data}</div>,
    ];
    const shownRows = rowRange ? rows.slice(rowRange[0], rowRange[1]) : rows;
    return (
      <>
        {title}
        <div className="report-table-cols" style={{ borderTop: border, borderLeft: border }}>{shownRows}</div>
      </>
    );
  }

  const multi = groups.length > 1;
  const groupGap = block.gap ?? 8;
  const flat: FlatRow[] = [];
  let groupSeen = 0;
  for (const group of groups) {
    if (multi) { flat.push({ kind: 'group', group, gap: groupSeen === 0 ? 0 : groupGap }); groupSeen += 1; }
    flat.push({ kind: 'head', group });
    if (group.items.length === 0) flat.push({ kind: 'key', group });
    for (const item of group.items) flat.push({ kind: 'data', group, item });
  }
  const shown = rowRange ? flat.slice(rowRange[0], rowRange[1]) : flat;

  const table = (
    <div className="report-table-cols" style={{ borderTop: border, borderLeft: border }}>
      {shown.map((row, i) => {
        if (row.kind === 'group') {
          return (
            <div key={`g${i}`} className="rm-row" style={{ display: 'flex', pageBreakInside: 'avoid', breakInside: 'avoid', marginTop: row.gap }}>
              <div style={{ ...headerStyle, width: '100%', borderRight: border, borderBottom: border }}>{row.group.label}</div>
            </div>
          );
        }
        if (row.kind === 'head') {
          return (
            <div key={`h${i}`} className="rm-row" style={{ display: 'flex', pageBreakInside: 'avoid', breakInside: 'avoid' }}>
              {row.group.columns.map(c => (
                <div key={c.field} style={{ ...headerStyle, width: `${c.width}%`, textAlign: c.align || 'left', borderRight: border, borderBottom: border }}>
                  {c.label}
                </div>
              ))}
            </div>
          );
        }
        if (row.kind === 'key') {
          return (
            <div key={`k${i}`} className="rm-row" style={{ display: 'flex', pageBreakInside: 'avoid', breakInside: 'avoid' }}>
              {row.group.columns.map(c => (
                <div key={c.field} style={{ ...baseStyle, ...cellPad, width: `${c.width}%`, textAlign: c.align || 'left', borderRight: border, borderBottom: border }}>
                  <span style={keyStyle}>{`{{${c.field}}}`}</span>
                </div>
              ))}
            </div>
          );
        }
        return (
          <div key={`d${i}`} className="rm-row" style={{ display: 'flex', pageBreakInside: 'avoid', breakInside: 'avoid' }}>
            {row.group.columns.map(c => (
              <div key={c.field} style={{ ...baseStyle, ...cellPad, width: `${c.width}%`, textAlign: c.align || 'left', borderRight: border, borderBottom: border }}>
                {showKeys
                  ? <span style={keyStyle}>{`{{${c.field}}}`}</span>
                  : (reportFieldValueByKey(ctx, fieldMap, c.field, row.item) || '\u00A0')}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );

  return (
    <>
      {title}
      {table}
    </>
  );
};

export default ReportGridBlock;
