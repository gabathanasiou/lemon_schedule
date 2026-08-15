import React from 'react';
import { ReportBlock, RibbonRow, RibbonCell, RibbonDesign } from '../../types';
import { ReportCtx, ReportSceneInfo, ReportDayInfo, ReportCollectionItem, ruleBearingAncestor, parentScenesOf } from '../../lib/reportData';
import { getFieldValue } from '../../lib/ribbonDefaults';
import { getRibbonCellBaseStyle, getNoteBreakPad } from '../../lib/ribbonUtils';
import { getMergeLookup } from '../../lib/mergeGroups';
import {
  sceneStyle, getDayHeaderColors, getDayFooterColors, getFallbackStripColors,
} from '../../lib/sceneColors';
import { formatDuration, formatPageCount } from '../../lib/utils';
import { formatElapsedCaption, ComputedRow } from '../../lib/daybreakUtils';
import { RibbonCellText } from '../RibbonCellText';

// Ribbon block: renders real scene strips with the chosen RibbonDesign.
// Reuses the shared ribbon helpers (getRibbonCellBaseStyle, getFieldValue,
// merge groups, sceneStyle, day header/footer colors) — the same pipeline the
// stripboard and schedule print use. Daybreak halves, notes and breaks render
// 1:1 from the stripboard (mirroring SortableRowDaybreak/Note/Break).
//
// Context-driven:
//  - inside a Scenes repeat  → that scene's strip
//  - inside a Days repeat    → the day's boxed section (border + keep-together,
//    daybreak halves when ribbonDayBreaks), with strips filtered to the nearest
//    person/element ancestor when one exists ("this person's scenes on this day")
//  - anywhere else at top level → the full schedule, stripboard order:
//    daybreak halves (when ribbonDayBreaks) + strips + note/break rows
//  - inside elements/categories/cast/crew context → nothing

const DAYBREAK_PREVIEW_LIMIT = 4;

function designFor(ctx: ReportCtx, block: ReportBlock) {
  const id = block.ribbonId || ctx.project.activeRibbonId || ctx.project.ribbonDesigns?.[0]?.id;
  return ctx.project.ribbonDesigns?.find(d => d.id === id) || ctx.project.ribbonDesigns?.[0];
}

function sceneDataFor(it: ReportSceneInfo) {
  return {
    ...it.scene,
    computedCallTime: it.callTime,
    estimatedDuration: it.durationMin,
    sheetNumber: String(it.sheetNumber),
  };
}

const fmt = (prefix?: string, v?: string, suffix?: string) => `${prefix ?? ''}${v ?? ''}${suffix ?? ''}`;

const formatLongDate = (iso: string): string => {
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
};

// Column geometry shared by strips, daybreak halves, notes and breaks —
// mirrors the stripboard row components (SortableRowDaybreak/Note/Break).
function gridGeometry(design: RibbonDesign) {
  const rows = design.rows as RibbonRow[];
  const numCols = Math.max(...rows.map(r => r.cells.length));
  const cells = rows[0]?.cells || [];
  const cw = design.colWidths && design.colWidths.length === numCols
    ? design.colWidths
    : Array.from({ length: numCols }, () => 100 / numCols);
  const nonSpecial = cells
    .map((c, i) => ({ i, w: cw[i] ?? 0, f: c.field }))
    .filter(x => x.f !== 'duration' && x.f !== 'callTime');
  const mainCellIdx = nonSpecial.length > 0
    ? nonSpecial.reduce((a, b) => a.w >= b.w ? a : b).i
    : cells.map((c, i) => ({ i, w: cw[i] ?? 0 })).reduce((a, b) => a.w >= b.w ? a : b, { i: 0, w: 0 }).i;
  const durationColIdx = cells.findIndex(c => c.field === 'duration');
  const pageCountColIdx = cells.findIndex((_, ci) =>
    rows.some(r => ci < r.cells.length && r.cells[ci].field === 'pageCount'),
  );
  const lastCellIdx = cells.length - 1;
  const estColIdx = mainCellIdx === cells.length - 1 && durationColIdx >= 0 ? durationColIdx : lastCellIdx;
  return { cells, cw, mainCellIdx, durationColIdx, pageCountColIdx, lastCellIdx, estColIdx };
}

const Strip: React.FC<{ it: ReportSceneInfo; ctx: ReportCtx; design: NonNullable<ReturnType<typeof designFor>>; hiddenFields?: Set<string> }> = ({ it, ctx, design, hiddenFields }) => {
  const rows = design.rows as RibbonRow[];
  const mergeLookup = getMergeLookup(rows);
  const cpv = design.cellPaddingV ?? 3;
  const cph = design.cellPaddingH ?? 3;
  const edge = design.edgePadding ?? 3;
  const style = sceneStyle(it.scene, ctx.project.colorPalette?.sceneColors, getFallbackStripColors(ctx.project.colorPalette), ctx.project.colorPalette?.colorRules);
  const numCols = Math.max(...rows.map(r => r.cells.length));
  const baseWidths = design.colWidths && design.colWidths.length === numCols
    ? design.colWidths
    : Array.from({ length: numCols }, () => 100 / numCols);

  const filtering = !!(hiddenFields && hiddenFields.size > 0);
  // A merged cell renders as its group's lead — hide the whole group when the
  // lead's field is hidden.
  const isHidden = (cell: RibbonCell): boolean => {
    if (!filtering) return false;
    const m = mergeLookup.get(cell.id);
    const lead = m && !m.isLead ? rows[m.group.rowIndex]?.cells[m.group.colIndex] : cell;
    return !!lead && hiddenFields!.has(lead.field);
  };

  // Column widths: when cells are hidden, rebuild the template from the first
  // row's visible cells (their original widths renormalized to 100%).
  let templateWidths: number[] = baseWidths;
  if (filtering) {
    const first = rows[0]?.cells || [];
    const visible = first.map((c, i) => ({ c, i })).filter(x => !isHidden(x.c));
    templateWidths = visible.length > 0
      ? visible.map(x => baseWidths[x.i] ?? 100 / baseWidths.length)
      : [];
  }
  const total = templateWidths.reduce((a, b) => a + b, 0);
  const colPct = total > 0 ? templateWidths.map(w => `${(w / total) * 100}%`).join(' ') : undefined;

  return (
    <div
      style={{
        ...style,
        border: '1px solid #000',
        display: 'grid',
        gridTemplateColumns: colPct,
        gridTemplateRows: `repeat(${rows.length}, auto)`,
        padding: `${edge}px ${edge}px`,
        fontSize: 8,
        lineHeight: 1.1,
        fontFamily: 'Helvetica, sans-serif',
      }}
    >
      {rows.flatMap((row, ri) =>
        row.cells.map((cell, ci) => {
          if (isHidden(cell)) return null;
          const m = mergeLookup.get(cell.id);
          if (m && !m.isLead) return null;
          const span = m ? m.group.span : 1;
          const isH = m ? m.group.direction === 'h' : false;
          const isV = m ? m.group.direction === 'v' : false;
          const base = getRibbonCellBaseStyle(cell, cpv, cph, span);
          const value = cell.field === 'text'
            ? (cell.textContent || '')
            : getFieldValue(cell.field, sceneDataFor(it));
          return (
            <div
              key={`${ri}-${ci}`}
              style={{
                ...base,
                gridColumn: isH ? `span ${span}` : undefined,
                gridRow: isV ? `span ${span}` : undefined,
                color: style.color,
                overflow: 'hidden',
              }}
            >
              {value || '\u00A0'}
            </div>
          );
        }),
      )}
    </div>
  );
};

// ---- daybreak halves (1:1 with SortableRowDaybreak, static text) ------------

interface DaybreakProps {
  day: ReportDayInfo;
  ctx: ReportCtx;
  design: NonNullable<ReturnType<typeof designFor>>;
  showCall: boolean;
  showDurations: boolean;
}

const DaybreakFooterHalf: React.FC<DaybreakProps> = ({ day, ctx, design, showCall, showDurations }) => {
  const palette = ctx.project.colorPalette;
  const df = getDayFooterColors(palette);
  const { cells, cw, mainCellIdx, estColIdx, pageCountColIdx, durationColIdx } = gridGeometry(design);
  const cpv = design.cellPaddingV ?? 3;
  const cph = design.cellPaddingH ?? 3;
  const edge = design.edgePadding ?? 3;
  const notePadV = getNoteBreakPad(cpv, design.rows.length);
  const daybreakPadV = Math.max(cpv, Math.floor(notePadV / 2));
  const pad = `${daybreakPadV}px ${cph}px`;
  const total = day.shootMin + day.breakMin;
  const pageCountCell = cells[pageCountColIdx];
  const estCell = (estColIdx === durationColIdx && cells[durationColIdx]) ? cells[durationColIdx] : cells[estColIdx];
  const estAlign = estCell?.align === 'right' ? 'flex-end' : estCell?.align === 'left' ? 'flex-start' : 'center';
  const pcAlign = pageCountCell?.align === 'right' ? 'flex-end' : pageCountCell?.align === 'left' ? 'flex-start' : 'center';

  return (
    <div style={{ background: df.background, color: df.color, paddingLeft: edge, paddingRight: edge, border: '1px solid #000' }}>
      <div style={{ display: 'grid', gridTemplateColumns: cw.map(w => `${w}%`).join(' ') }}>
        {cells.map((cell, ci) => {
          if (ci === mainCellIdx) {
            return (
              <div key={cell.id} style={{ gridColumn: ci + 1, gridRow: 1, ...getRibbonCellBaseStyle(cell, cpv, cph, 1), padding: pad, overflow: 'visible', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                <RibbonCellText cell={cell}>{day.label ? `End of ${day.label}` : 'End of Day'}</RibbonCellText>
                {day.date && <span style={{ fontSize: '7pt', opacity: 0.8 }}>{formatLongDate(day.date)}</span>}
              </div>
            );
          }
          if (ci === estColIdx && showDurations && total > 0) {
            return (
              <div key={cell.id} style={{ gridColumn: ci + 1, gridRow: 1, ...getRibbonCellBaseStyle(cell, cpv, cph, 1), padding: pad, overflow: 'visible', whiteSpace: 'normal', wordBreak: 'break-word', display: 'flex', flexDirection: 'column', alignItems: estAlign, justifyContent: 'center', gap: 1 }}>
                <span style={{ fontSize: '8pt' }}>
                  EST: {formatDuration(day.shootMin)}{day.breakMin > 0 ? <span> + {formatDuration(day.breakMin)} break</span> : null}
                </span>
              </div>
            );
          }
          if (ci === pageCountColIdx && day.totalPages > 0 && pageCountCell) {
            return (
              <div key={cell.id} style={{ gridColumn: ci + 1, gridRow: 1, ...getRibbonCellBaseStyle(pageCountCell, cpv, cph, 1), padding: pad, overflow: 'visible', display: 'flex', flexDirection: 'column', alignItems: pcAlign, justifyContent: 'center', gap: 1 }}>
                <span style={{ fontSize: '7pt', opacity: 0.8 }}>Total:</span>
                <RibbonCellText cell={pageCountCell}>{formatPageCount(day.totalPages)} {pageCountCell.suffix || 'pgs'}</RibbonCellText>
              </div>
            );
          }
          if (cell.field === 'callTime') {
            return (
              <div key={cell.id} style={{ gridColumn: ci + 1, gridRow: 1, ...getRibbonCellBaseStyle(cell, cpv, cph, 1), padding: pad, overflow: 'visible' }}>
                {showCall && day.endTime ? <RibbonCellText cell={cell}>{fmt(cell.prefix, day.endTime, cell.suffix)}</RibbonCellText> : ''}
              </div>
            );
          }
          if (cell.field === 'duration') {
            return <div key={cell.id} style={{ gridColumn: ci + 1, gridRow: 1, ...getRibbonCellBaseStyle(cell, cpv, cph, 1), padding: pad, overflow: 'visible' }} />;
          }
          return <div key={cell.id} style={{ gridColumn: ci + 1, gridRow: 1, ...getRibbonCellBaseStyle(cell, cpv, cph, 1), padding: pad, overflow: 'visible' }} />;
        })}
      </div>
    </div>
  );
};

const DaybreakHeaderHalf: React.FC<DaybreakProps> = ({ day, ctx, design, showCall }) => {
  const palette = ctx.project.colorPalette;
  const dh = getDayHeaderColors(palette);
  const { cells, cw, mainCellIdx, durationColIdx, lastCellIdx } = gridGeometry(design);
  const cpv = design.cellPaddingV ?? 3;
  const cph = design.cellPaddingH ?? 3;
  const edge = design.edgePadding ?? 3;
  const notePadV = getNoteBreakPad(cpv, design.rows.length);
  const daybreakPadV = Math.max(cpv, Math.floor(notePadV / 2));
  const pad = `${daybreakPadV}px ${cph}px`;
  const startLabel = day.label ? `START OF ${day.label.toUpperCase()}` : `START OF DAY ${day.chronoDay}`;

  return (
    <div style={{ background: dh.background, color: dh.color, paddingLeft: edge, paddingRight: edge, border: '1px solid #000' }}>
      <div style={{ display: 'grid', gridTemplateColumns: cw.map(w => `${w}%`).join(' ') }}>
        {cells.map((cell, ci) => {
          if (ci === mainCellIdx) {
            return (
              <div key={cell.id} style={{ gridColumn: ci + 1, gridRow: 1, ...getRibbonCellBaseStyle(cell, cpv, cph, 1), padding: pad, overflow: 'visible', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                <RibbonCellText cell={cell}><strong>{startLabel}</strong></RibbonCellText>
                {day.date && <span style={{ fontSize: '7pt', opacity: 0.8 }}>{formatLongDate(day.date)}</span>}
              </div>
            );
          }
          if (cell.field === 'callTime') {
            return (
              <div key={cell.id} style={{ gridColumn: ci + 1, gridRow: 1, ...getRibbonCellBaseStyle(cell, cpv, cph, 1), padding: pad, overflow: 'visible' }}>
                {showCall && day.callTime ? <RibbonCellText cell={cell}>{fmt(cell.prefix, day.callTime, cell.suffix)}</RibbonCellText> : ''}
              </div>
            );
          }
          if (cell.field === 'duration') {
            return (
              <div key={cell.id} style={{ gridColumn: ci + 1, gridRow: 1, ...getRibbonCellBaseStyle(cell, cpv, cph, 1), padding: pad, overflow: 'visible' }}>
                {showCall && <span style={{ fontSize: '7pt', opacity: 0.8 }}>CALL</span>}
              </div>
            );
          }
          return (
            <div key={cell.id} style={{ gridColumn: ci + 1, gridRow: 1, ...getRibbonCellBaseStyle(cell, cpv, cph, 1), padding: pad, overflow: 'visible', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {ci === lastCellIdx ? '\u00A0' : null}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ---- note / break rows (1:1 with SortableRowNote/Break, static text) --------

const StaticNoteRow: React.FC<{ row: ComputedRow; ctx: ReportCtx; design: NonNullable<ReturnType<typeof designFor>> }> = ({ row, ctx, design }) => {
  const palette = ctx.project.colorPalette;
  const bg = row.noteColor || palette?.noteBg || '#3f0000';
  const color = row.noteTextColor || palette?.noteText || '#ffffff';
  const { cells, cw, mainCellIdx, durationColIdx } = gridGeometry(design);
  const cpv = design.cellPaddingV ?? 3;
  const cph = design.cellPaddingH ?? 3;
  const edge = design.edgePadding ?? 3;
  const pad = `${getNoteBreakPad(cpv, design.rows.length)}px ${cph}px`;

  return (
    <div style={{ background: bg, color, paddingLeft: edge, paddingRight: edge, borderTop: '1px solid #000' }}>
      <div style={{ display: 'grid', gridTemplateColumns: cw.map(w => `${w}%`).join(' ') }}>
        {cells.map((cell, ci) => {
          if (ci === mainCellIdx) {
            return (
              <div key={cell.id} style={{ gridColumn: ci + 1, gridRow: 1, ...getRibbonCellBaseStyle(cell, cpv, cph, 1), textAlign: 'center', padding: pad, overflow: 'visible', whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.4 }}>
                <RibbonCellText cell={cell}>{row.noteText || '\u00A0'}</RibbonCellText>
              </div>
            );
          }
          if (cell.field === 'duration') {
            return (
              <div key={cell.id} style={{ gridColumn: ci + 1, gridRow: 1, ...getRibbonCellBaseStyle(cell, cpv, cph, 1), padding: pad, overflow: 'visible', display: 'flex', alignItems: 'center', justifyContent: cell.align === 'right' ? 'flex-end' : cell.align === 'left' ? 'flex-start' : 'center' }}>
                <RibbonCellText cell={cell}>{row.estimatedDuration ? formatDuration(row.estimatedDuration) : ''}</RibbonCellText>
              </div>
            );
          }
          if (cell.field === 'callTime') {
            return (
              <div key={cell.id} style={{ gridColumn: ci + 1, gridRow: 1, ...getRibbonCellBaseStyle(cell, cpv, cph, 1), padding: pad, overflow: 'visible' }}>
                {row.computedCallTime ? <RibbonCellText cell={cell}>{fmt(cell.prefix, row.computedCallTime, cell.suffix)}</RibbonCellText> : ''}
              </div>
            );
          }
          return <div key={cell.id} style={{ gridColumn: ci + 1, gridRow: 1, ...getRibbonCellBaseStyle(cell, cpv, cph, 1), padding: pad, overflow: 'visible' }} />;
        })}
      </div>
    </div>
  );
};

const StaticBreakRow: React.FC<{ row: ComputedRow; ctx: ReportCtx; design: NonNullable<ReturnType<typeof designFor>> }> = ({ row, ctx, design }) => {
  const palette = ctx.project.colorPalette;
  const bg = palette?.noteBg || '#3f0000';
  const color = palette?.noteText || '#ffffff';
  const { cells, cw, mainCellIdx, durationColIdx, estColIdx } = gridGeometry(design);
  const cpv = design.cellPaddingV ?? 3;
  const cph = design.cellPaddingH ?? 3;
  const edge = design.edgePadding ?? 3;
  const pad = `${getNoteBreakPad(cpv, design.rows.length)}px ${cph}px`;
  const caption = formatElapsedCaption(row);

  return (
    <div style={{ background: bg, color, paddingLeft: edge, paddingRight: edge, borderTop: '1px solid #000' }}>
      <div style={{ display: 'grid', gridTemplateColumns: cw.map(w => `${w}%`).join(' ') }}>
        {cells.map((cell, ci) => {
          if (ci === mainCellIdx) {
            return (
              <div key={cell.id} style={{ gridColumn: ci + 1, gridRow: 1, ...getRibbonCellBaseStyle(cell, cpv, cph, 1), textAlign: 'center', padding: pad, overflow: 'visible', whiteSpace: 'normal', wordBreak: 'break-word' }}>
                <RibbonCellText cell={cell}>{row.breakLabel || 'BREAK'}</RibbonCellText>
              </div>
            );
          }
          if (cell.field === 'duration') {
            return (
              <div key={cell.id} style={{ gridColumn: ci + 1, gridRow: 1, ...getRibbonCellBaseStyle(cell, cpv, cph, 1), padding: pad, overflow: 'visible', display: 'flex', flexDirection: 'column', alignItems: cell.align === 'right' ? 'flex-end' : cell.align === 'left' ? 'flex-start' : 'center', gap: 1, justifyContent: 'center' }}>
                <RibbonCellText cell={cell}>{row.breakDuration ? formatDuration(row.breakDuration) : ''}</RibbonCellText>
                {ci === estColIdx && caption && <span style={{ fontSize: '8pt' }}>{caption}</span>}
              </div>
            );
          }
          if (ci === estColIdx && caption) {
            const estAlign = cell.align === 'right' ? 'flex-end' : cell.align === 'left' ? 'flex-start' : 'center';
            return (
              <div key={cell.id} style={{ gridColumn: ci + 1, gridRow: 1, ...getRibbonCellBaseStyle(cell, cpv, cph, 1), padding: pad, overflow: 'visible', whiteSpace: 'normal', wordBreak: 'break-word', display: 'flex', flexDirection: 'column', alignItems: estAlign, justifyContent: 'center', gap: 1 }}>
                <span style={{ fontSize: '8pt' }}>{caption}</span>
              </div>
            );
          }
          if (cell.field === 'callTime') {
            return (
              <div key={cell.id} style={{ gridColumn: ci + 1, gridRow: 1, ...getRibbonCellBaseStyle(cell, cpv, cph, 1), padding: pad, overflow: 'visible' }}>
                {row.computedCallTime ? <RibbonCellText cell={cell}>{fmt(cell.prefix, row.computedCallTime, cell.suffix)}</RibbonCellText> : ''}
              </div>
            );
          }
          return <div key={cell.id} style={{ gridColumn: ci + 1, gridRow: 1, ...getRibbonCellBaseStyle(cell, cpv, cph, 1), padding: pad, overflow: 'visible' }} />;
        })}
      </div>
    </div>
  );
};

// ---- day section / full schedule -------------------------------------------

interface SectionRowFlags {
  showDayBreaks: boolean;
  showCall: boolean;
  showDurations: boolean;
  showNotes: boolean;
  showBreaks: boolean;
}

interface SectionRenderProps {
  day: ReportDayInfo;
  ctx: ReportCtx;
  design: NonNullable<ReturnType<typeof designFor>>;
  sceneFilter?: Set<string>;
  flags: SectionRowFlags;
  hiddenFields?: Set<string>;
}

const sectionRow = (r: any, flags: SectionRowFlags, ctx: ReportCtx, design: NonNullable<ReturnType<typeof designFor>>) => {
  if (r.type === 'NOTE' && flags.showNotes) {
    const cr = ctx.computedByRowId.get(r.id);
    return cr ? <div key={r.id} style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}><StaticNoteRow row={cr} ctx={ctx} design={design} /></div> : null;
  }
  if (r.type === 'BREAK' && flags.showBreaks) {
    const cr = ctx.computedByRowId.get(r.id);
    return cr ? <div key={r.id} style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}><StaticBreakRow row={cr} ctx={ctx} design={design} /></div> : null;
  }
  return null;
};

const DaySectionView: React.FC<SectionRenderProps> = ({ day, ctx, design, sceneFilter, flags, hiddenFields }) => {
  const scenes = ctx.sceneInfos.filter(si => si.sectionIndex === day.section.index);
  const daybreakProps = { day, ctx, design };
  const rows = day.section.rows.map((r) => {
    if (r.type === 'SCENE' && r.sceneId) {
      const it = scenes.find(s => s.scene.id === r.sceneId);
      if (!it) return null;
      if (sceneFilter && !sceneFilter.has(it.scene.id)) return null;
      return (
        <div key={r.id} style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
          <Strip it={it} ctx={ctx} design={design} hiddenFields={hiddenFields} />
        </div>
      );
    }
    return sectionRow(r, flags, ctx, design);
  });
  return (
    <div style={{ border: '1px solid #000', pageBreakInside: 'avoid', breakInside: 'avoid' }}>
      {flags.showDayBreaks && <DaybreakHeaderHalf {...daybreakProps} showCall={flags.showCall} showDurations={flags.showDurations} />}
      {rows}
      {flags.showDayBreaks && day.section.daybreakRow && <DaybreakFooterHalf {...daybreakProps} showCall={flags.showCall} showDurations={flags.showDurations} />}
    </div>
  );
};

/** Full schedule in stripboard order: daybreak halves + strips + note/break
 *  rows. `previewLimit` caps scene strips at DAYBREAK_PREVIEW_LIMIT and shows
 *  an "…N more" indicator instead of the tail. */
const FullSchedule: React.FC<{
  ctx: ReportCtx;
  design: NonNullable<ReturnType<typeof designFor>>;
  flags: SectionRowFlags;
  hiddenFields?: Set<string>;
  previewLimit?: boolean;
}> = ({ ctx, design, flags, hiddenFields, previewLimit }) => {
  const limit = previewLimit ? DAYBREAK_PREVIEW_LIMIT : Infinity;
  const totalStrips = ctx.sceneInfos.length;
  let stripsShown = 0;
  const out: React.ReactNode[] = [];

  for (let di = 0; di < ctx.dayInfos.length; di++) {
    const day = ctx.dayInfos[di];
    const scenes = ctx.sceneInfos.filter(si => si.sectionIndex === day.section.index);
    const daybreakProps = { day, ctx, design };

    if (flags.showDayBreaks) {
      out.push(
        <div key={`h-${day.section.index}`} style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
          <DaybreakHeaderHalf {...daybreakProps} showCall={flags.showCall} showDurations={flags.showDurations} />
        </div>,
      );
    }

    let capped = false;
    for (const r of day.section.rows) {
      if (r.type === 'SCENE' && r.sceneId) {
        const it = scenes.find(s => s.scene.id === r.sceneId);
        if (!it) continue;
        if (stripsShown >= limit) {
          capped = true;
          break;
        }
        stripsShown++;
        out.push(
          <div key={r.id} style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
            <Strip it={it} ctx={ctx} design={design} hiddenFields={hiddenFields} />
          </div>,
        );
      } else {
        const rowNode = sectionRow(r, flags, ctx, design);
        if (rowNode) out.push(rowNode);
      }
    }

    if (capped) {
      const remaining = totalStrips - DAYBREAK_PREVIEW_LIMIT;
      if (remaining > 0) {
        out.push(
          <div key="more" style={{ border: '1px solid #a1a1aa', borderRadius: 4, padding: '4px 8px', marginTop: 4, fontSize: 9, color: '#71717a', textAlign: 'center', fontStyle: 'italic' }}>
            …{remaining} more strip{remaining !== 1 ? 's' : ''}
          </div>,
        );
      }
      break;
    }

    if (flags.showDayBreaks && day.section.daybreakRow) {
      out.push(
        <div key={`f-${day.section.index}`} style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
          <DaybreakFooterHalf {...daybreakProps} showCall={flags.showCall} showDurations={flags.showDurations} />
        </div>,
      );
    }
  }

  return <div style={{ display: 'flex', flexDirection: 'column' }}>{out}</div>;
};

/** Scene ids for the nearest element/cast ancestor (person-filtered day strips). */
function personSceneFilter(ctx: ReportCtx, ancestors: ReportCollectionItem[] | undefined): Set<string> | undefined {
  if (!ancestors) return undefined;
  const person = ancestors.find(a => {
    const any = a as any;
    return typeof any.id !== 'undefined' && typeof any.name !== 'undefined' && !any.scene;
  });
  if (!person || !ruleBearingAncestor(person)) return undefined;
  return new Set(parentScenesOf(ctx, person).map(s => s.scene.id));
}

export const ReportRibbonView: React.FC<{ block: ReportBlock; ctx: ReportCtx; item?: ReportCollectionItem; hint?: boolean; ancestors?: ReportCollectionItem[]; previewLimit?: boolean }> = ({ block, ctx, item, hint, ancestors, previewLimit }) => {
  const design = designFor(ctx, block);
  if (!design) return null;
  const any = item as any;

  // Cell fields dropped from every strip (call time / duration off by default).
  const hiddenFields = new Set<string>();
  if (block.ribbonCallTimes !== true) hiddenFields.add('callTime');
  if (block.ribbonDurations !== true) hiddenFields.add('duration');

  if (any?.scene) {
    return (
      <div style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
        <Strip it={item as ReportSceneInfo} ctx={ctx} design={design} hiddenFields={hiddenFields} />
      </div>
    );
  }

  if (typeof any?.section?.index === 'number') {
    const sceneFilter = personSceneFilter(ctx, ancestors);
    const flags: SectionRowFlags = {
      showDayBreaks: block.ribbonDayBreaks === true || block.ribbonHeaders === true,
      showCall: block.ribbonCallTimes === true,
      showDurations: block.ribbonDurations === true,
      showNotes: block.ribbonNotes !== false,
      showBreaks: block.ribbonBreaks === true,
    };
    return (
      <DaySectionView
        day={item as ReportDayInfo}
        ctx={ctx}
        design={design}
        sceneFilter={sceneFilter}
        flags={flags}
        hiddenFields={hiddenFields}
      />
    );
  }

  // Top level — the full schedule.
  if (ctx.dayInfos.length === 0) {
    if (hint) {
      return (
        <div style={{ fontSize: 10, color: '#8f8f8f', fontStyle: 'italic', border: '1px dashed #a1a1aa', borderRadius: 6, padding: 8, textAlign: 'center' }}>
          Ribbon — the schedule is empty. Place inside a Scenes or Days repeat, or add days to render the full schedule here.
        </div>
      );
    }
    return null;
  }
  const flags: SectionRowFlags = {
    showDayBreaks: block.ribbonDayBreaks === true || block.ribbonHeaders === true,
    showCall: block.ribbonCallTimes === true,
    showDurations: block.ribbonDurations === true,
    showNotes: block.ribbonNotes !== false,
    showBreaks: block.ribbonBreaks === true,
  };
  return <FullSchedule ctx={ctx} design={design} flags={flags} hiddenFields={hiddenFields} previewLimit={previewLimit} />;
};
