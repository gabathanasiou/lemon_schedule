import React, { useMemo } from 'react';
import type { ReportBlock } from '../../types';
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
  showKeys?: boolean;
  rowRange?: [number, number];
}

type FlatRow =
  | { kind: 'group'; group: ReportGridGroup; gap: number }
  | { kind: 'head'; group: ReportGridGroup }
  | { kind: 'key'; group: ReportGridGroup }
  | { kind: 'data'; group: ReportGridGroup; item: ReportCollectionItem };

const ReportGridBlock: React.FC<ReportGridBlockProps> = ({ block, ctx, fieldMap, dayItem, hint, showKeys, rowRange }) => {
  const collection = isReportGridCollection(block.collection) ? block.collection : null;
  const baseStyle = getReportBlockBaseStyle(block, ctx.project);
  const cellPad = { padding: `${block.paddingV ?? 2}px ${block.paddingH ?? 4}px` };
  const border = getReportBorder(block.showBorders !== false);
  const headerStyle = { ...baseStyle, ...cellPad, fontWeight: 700, background: REPORT_TABLE_HEADER_BG } as React.CSSProperties;
  const keyStyle: React.CSSProperties = { color: '#8f8f8f', fontStyle: 'italic' };

  const groups = useMemo(() => {
    if (!collection) return [];
    const real = dayItem ? resolveReportGridGroups(ctx, collection, block.category, dayItem, fieldMap) : [];
    const withRows = real.filter(g => g.items.length > 0);
    if (withRows.length > 0) return withRows;
    return hint ? skeletonReportGridGroups(ctx.project, collection, block.category, fieldMap) : [];
  }, [collection, ctx, block.category, dayItem, fieldMap, hint]);

  if (groups.length === 0) return null;

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

  return (
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
};

export default ReportGridBlock;
