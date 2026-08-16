import React from 'react';
import { ReportBlock, RibbonRow, RibbonCell, RibbonDesign, Scene } from '../../types';
import { ReportCtx, ReportSceneInfo, ReportDayInfo, ReportCollectionItem, ruleBearingAncestor, parentScenesOf, RibbonPrintOptions } from '../../lib/reportData';
import { CellBorders } from '../../lib/persist';
import { getRibbonCellBaseStyle, getNoteBreakPad, getCellBorderProps, formatCellText, ribbonCellDisplayValue, PREVIEW_SAMPLES } from '../../lib/ribbonUtils';
import { getMergeLookup } from '../../lib/mergeGroups';
import {
  sceneStyle, getDayHeaderColors, getDayFooterColors, getFallbackStripColors,
} from '../../lib/sceneColors';
import { formatDuration, formatPageCount } from '../../lib/utils';
import { formatElapsedCaption, ComputedRow } from '../../lib/daybreakUtils';
import { RibbonCellText } from '../RibbonCellText';

// Ribbon block: renders real scene strips with the chosen RibbonDesign.
// Reuses the shared ribbon helpers (getRibbonCellBaseStyle, ribbonCellDisplayValue,
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

function designFor(ctx: ReportCtx, block: ReportBlock, overrides?: RibbonPrintOptions) {
  const id = overrides?.ribbonId || block.ribbonId || ctx.project.activeRibbonId || ctx.project.ribbonDesigns?.[0]?.id;
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

const Strip: React.FC<{ it: ReportSceneInfo; ctx: ReportCtx; design: NonNullable<ReturnType<typeof designFor>>; hiddenFields?: Set<string>; cellBorders?: CellBorders; sample?: boolean }> = ({ it, ctx, design, hiddenFields, cellBorders, sample }) => {
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
  const customFieldLabels = React.useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of ctx.project.customCategories || []) m[c.key] = c.label;
    return m;
  }, [ctx.project.customCategories]);

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
          const d = ribbonCellDisplayValue(cell, sceneDataFor(it), { sample, customFieldLabels });
          const lastInRow = (ci + (isH ? span : 1) - 1) >= rows[0].cells.length - 1;
          const lastRow = (ri + (isV ? span : 1) - 1) >= rows.length - 1;
          return (
            <div
              key={`${ri}-${ci}`}
              style={{
                ...base,
                gridColumn: isH ? `span ${span}` : undefined,
                gridRow: isV ? `span ${span}` : undefined,
                color: style.color,
                overflow: 'hidden',
                ...getCellBorderProps(cellBorders, style.color, lastInRow, lastRow),
              }}
            >
              <RibbonCellText cell={cell} span={span} cellPadding={cpv} style={{ fontStyle: d.isValue ? 'normal' : 'italic', opacity: d.isValue ? 1 : 0.5 }}>
                {d.text || '\u00A0'}
              </RibbonCellText>
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
  sample?: boolean;
}

const DaybreakFooterHalf: React.FC<DaybreakProps> = ({ day, ctx, design, showCall, showDurations, sample }) => {
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
            const d = ribbonCellDisplayValue(cell, { computedCallTime: day.endTime }, { sample });
            return (
              <div key={cell.id} style={{ gridColumn: ci + 1, gridRow: 1, ...getRibbonCellBaseStyle(cell, cpv, cph, 1), padding: pad, overflow: 'visible' }}>
                {showCall && d.text ? <RibbonCellText cell={cell} style={{ fontStyle: d.isValue ? 'normal' : 'italic', opacity: d.isValue ? 1 : 0.5 }}>{d.text}</RibbonCellText> : ''}
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

const DaybreakHeaderHalf: React.FC<DaybreakProps> = ({ day, ctx, design, showCall, sample }) => {
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
            const d = ribbonCellDisplayValue(cell, { computedCallTime: day.callTime }, { sample });
            return (
              <div key={cell.id} style={{ gridColumn: ci + 1, gridRow: 1, ...getRibbonCellBaseStyle(cell, cpv, cph, 1), padding: pad, overflow: 'visible' }}>
                {showCall && d.text ? <RibbonCellText cell={cell} style={{ fontStyle: d.isValue ? 'normal' : 'italic', opacity: d.isValue ? 1 : 0.5 }}>{d.text}</RibbonCellText> : ''}
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

const StaticNoteRow: React.FC<{ row: ComputedRow; ctx: ReportCtx; design: NonNullable<ReturnType<typeof designFor>>; sample?: boolean }> = ({ row, ctx, design, sample }) => {
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
            // 1:1 with the print pipeline: a zero/absent row duration shows
            // nothing (no ↑ marker — that's a scene-strip affordance).
            const v = row.estimatedDuration ? formatDuration(row.estimatedDuration) : '';
            const text = formatCellText(cell.prefix, v, cell.suffix);
            return (
              <div key={cell.id} style={{ gridColumn: ci + 1, gridRow: 1, ...getRibbonCellBaseStyle(cell, cpv, cph, 1), padding: pad, overflow: 'visible', display: 'flex', alignItems: 'center', justifyContent: cell.align === 'right' ? 'flex-end' : cell.align === 'left' ? 'flex-start' : 'center' }}>
                <RibbonCellText cell={cell}>{text}</RibbonCellText>
              </div>
            );
          }
          if (cell.field === 'callTime') {
            const d = ribbonCellDisplayValue(cell, { computedCallTime: row.computedCallTime }, { sample });
            return (
              <div key={cell.id} style={{ gridColumn: ci + 1, gridRow: 1, ...getRibbonCellBaseStyle(cell, cpv, cph, 1), padding: pad, overflow: 'visible' }}>
                {d.text ? <RibbonCellText cell={cell} style={{ fontStyle: d.isValue ? 'normal' : 'italic', opacity: d.isValue ? 1 : 0.5 }}>{d.text}</RibbonCellText> : ''}
              </div>
            );
          }
          return <div key={cell.id} style={{ gridColumn: ci + 1, gridRow: 1, ...getRibbonCellBaseStyle(cell, cpv, cph, 1), padding: pad, overflow: 'visible' }} />;
        })}
      </div>
    </div>
  );
};

const StaticBreakRow: React.FC<{ row: ComputedRow; ctx: ReportCtx; design: NonNullable<ReturnType<typeof designFor>>; sample?: boolean }> = ({ row, ctx, design, sample }) => {
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
            // 1:1 with the print pipeline: zero/absent break duration → nothing.
            const v = row.breakDuration ? formatDuration(row.breakDuration) : '';
            const text = formatCellText(cell.prefix, v, cell.suffix);
            return (
              <div key={cell.id} style={{ gridColumn: ci + 1, gridRow: 1, ...getRibbonCellBaseStyle(cell, cpv, cph, 1), padding: pad, overflow: 'visible', display: 'flex', flexDirection: 'column', alignItems: cell.align === 'right' ? 'flex-end' : cell.align === 'left' ? 'flex-start' : 'center', gap: 1, justifyContent: 'center' }}>
                <RibbonCellText cell={cell}>{text}</RibbonCellText>
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
            const d = ribbonCellDisplayValue(cell, { computedCallTime: row.computedCallTime }, { sample });
            return (
              <div key={cell.id} style={{ gridColumn: ci + 1, gridRow: 1, ...getRibbonCellBaseStyle(cell, cpv, cph, 1), padding: pad, overflow: 'visible' }}>
                {d.text ? <RibbonCellText cell={cell} style={{ fontStyle: d.isValue ? 'normal' : 'italic', opacity: d.isValue ? 1 : 0.5 }}>{d.text}</RibbonCellText> : ''}
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
  cellBorders?: CellBorders;
  /** Sample-value / field-label fallbacks (designer canvas + preview only). */
  sample?: boolean;
  /** Measured-pagination slice: render only units [start, end) of the day box,
   *  border-less (a split day box renders like the full-schedule view). */
  unitRange?: [number, number];
}

const sectionRow = (r: any, flags: SectionRowFlags, ctx: ReportCtx, design: NonNullable<ReturnType<typeof designFor>>, sample?: boolean) => {
  if (r.type === 'NOTE' && flags.showNotes) {
    const cr = ctx.computedByRowId.get(r.id);
    return cr ? <div key={r.id} className="rm-ribbon-unit" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}><StaticNoteRow row={cr} ctx={ctx} design={design} sample={sample} /></div> : null;
  }
  if (r.type === 'BREAK' && flags.showBreaks) {
    const cr = ctx.computedByRowId.get(r.id);
    return cr ? <div key={r.id} className="rm-ribbon-unit" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}><StaticBreakRow row={cr} ctx={ctx} design={design} sample={sample} /></div> : null;
  }
  return null;
};

const DaySectionView: React.FC<SectionRenderProps> = ({ day, ctx, design, sceneFilter, flags, hiddenFields, cellBorders, sample, unitRange }) => {
  const scenes = ctx.sceneInfos.filter(si => si.sectionIndex === day.section.index);
  const daybreakProps = { day, ctx, design, sample };
  const units: React.ReactNode[] = [];
  if (flags.showDayBreaks) {
    units.push(
      <div key="h" className="rm-ribbon-unit" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
        <DaybreakHeaderHalf {...daybreakProps} showCall={flags.showCall} showDurations={flags.showDurations} />
      </div>,
    );
  }
  for (const r of day.section.rows) {
    if (r.type === 'SCENE' && r.sceneId) {
      const it = scenes.find(s => s.scene.id === r.sceneId);
      if (!it) continue;
      if (sceneFilter && !sceneFilter.has(it.scene.id)) continue;
      units.push(
        <div key={r.id} className="rm-ribbon-unit" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
          <Strip it={it} ctx={ctx} design={design} hiddenFields={hiddenFields} cellBorders={cellBorders} sample={sample} />
        </div>,
      );
    } else {
      const rowNode = sectionRow(r, flags, ctx, design, sample);
      if (rowNode) units.push(rowNode);
    }
  }
  if (flags.showDayBreaks && day.section.daybreakRow) {
    units.push(
      <div key="f" className="rm-ribbon-unit" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
        <DaybreakFooterHalf {...daybreakProps} showCall={flags.showCall} showDurations={flags.showDurations} />
      </div>,
    );
  }
  if (unitRange) {
    return <div>{units.slice(unitRange[0], unitRange[1])}</div>;
  }
  return (
    <div className="rm-daybox" style={{ border: '1px solid #000', pageBreakInside: 'avoid', breakInside: 'avoid' }}>
      {units}
    </div>
  );
};

/** Full schedule in stripboard order: daybreak halves + strips + note/break
 *  rows. `previewLimit` caps scene strips at DAYBREAK_PREVIEW_LIMIT and shows
 *  an "…N more" indicator instead of the tail. `unitRange` renders a
 *  measured-pagination slice (units across all days). */
const FullSchedule: React.FC<{
  ctx: ReportCtx;
  design: NonNullable<ReturnType<typeof designFor>>;
  flags: SectionRowFlags;
  hiddenFields?: Set<string>;
  cellBorders?: CellBorders;
  previewLimit?: boolean;
  sample?: boolean;
  unitRange?: [number, number];
}> = ({ ctx, design, flags, hiddenFields, cellBorders, previewLimit, sample, unitRange }) => {
  const limit = previewLimit ? DAYBREAK_PREVIEW_LIMIT : Infinity;
  const totalStrips = ctx.sceneInfos.length;
  let stripsShown = 0;
  const out: React.ReactNode[] = [];

  for (let di = 0; di < ctx.dayInfos.length; di++) {
    const day = ctx.dayInfos[di];
    const scenes = ctx.sceneInfos.filter(si => si.sectionIndex === day.section.index);
    const daybreakProps = { day, ctx, design, sample };

    if (flags.showDayBreaks) {
      out.push(
        <div key={`h-${day.section.index}`} className="rm-ribbon-unit" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
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
          <div key={r.id} className="rm-ribbon-unit" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
            <Strip it={it} ctx={ctx} design={design} hiddenFields={hiddenFields} cellBorders={cellBorders} sample={sample} />
          </div>,
        );
      } else {
        const rowNode = sectionRow(r, flags, ctx, design, sample);
        if (rowNode) out.push(rowNode);
      }
    }

    if (capped) {
      const remaining = totalStrips - DAYBREAK_PREVIEW_LIMIT;
      if (remaining > 0) {
        out.push(
          <div key="more" className="rm-ribbon-unit" style={{ border: '1px solid #a1a1aa', borderRadius: 4, padding: '4px 8px', marginTop: 4, fontSize: 9, color: '#71717a', textAlign: 'center', fontStyle: 'italic' }}>
            …{remaining} more strip{remaining !== 1 ? 's' : ''}
          </div>,
        );
      }
      break;
    }

    if (flags.showDayBreaks && day.section.daybreakRow) {
      out.push(
        <div key={`f-${day.section.index}`} className="rm-ribbon-unit" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
          <DaybreakFooterHalf {...daybreakProps} showCall={flags.showCall} showDurations={flags.showDurations} />
        </div>,
      );
    }
  }

  return <div style={{ display: 'flex', flexDirection: 'column' }}>{unitRange ? out.slice(unitRange[0], unitRange[1]) : out}</div>;
};

/** Empty-schedule preview (designer canvas + preview only): renders the
 *  PREVIEW_SAMPLES trio (INT DAY / EXT DAY / INT NIGHT) as real strips so the
 *  design stays visible before any days exist. Mirrors RibbonLivePreview. */
const SampleSchedule: React.FC<{
  ctx: ReportCtx;
  design: NonNullable<ReturnType<typeof designFor>>;
  flags: SectionRowFlags;
  hiddenFields?: Set<string>;
  cellBorders?: CellBorders;
}> = ({ ctx, design, flags, hiddenFields, cellBorders }) => {
  const scenes: ReportSceneInfo[] = PREVIEW_SAMPLES.map((s, i) => ({
    scene: {
      id: `sample-scene-${i}`,
      sceneNumber: s.sceneNumber,
      intExt: s.intExt,
      dayNight: s.dayNight,
      set: '', cast: '', pageCount: '', description: '', notes: '',
      backgroundActors: '', stunts: '', vehicles: '', props: '', wardrobe: '',
      makeup: '', sfx: '', vfx: '', sound: '', music: '',
      animalsAndWranglers: '', weapons: '', greenery: '', artDept: '',
      scriptDay: '', pageCountDecimal: 0,
    } as Scene,
    row: { id: `sample-row-${i}` } as any,
    sectionIndex: 0,
    chronoDay: i + 1,
    date: '',
    callTime: '08:00',
    durationMin: 0,
    sheetNumber: i + 1,
  }));
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {scenes.map(it => (
        <div key={it.scene.id} className="rm-ribbon-unit" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
          <Strip it={it} ctx={ctx} design={design} hiddenFields={hiddenFields} cellBorders={cellBorders} sample />
        </div>
      ))}
    </div>
  );
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

export const ReportRibbonView: React.FC<{ block: ReportBlock; ctx: ReportCtx; item?: ReportCollectionItem; hint?: boolean; ancestors?: ReportCollectionItem[]; previewLimit?: boolean; overrides?: RibbonPrintOptions; unitRange?: [number, number] }> = ({ block, ctx, item, hint, ancestors, previewLimit, overrides, unitRange }) => {
  const design = designFor(ctx, block, overrides);
  if (!design) return null;
  const any = item as any;

  // Cell fields dropped from every strip (call time / duration off by default).
  // Print overrides replace the block's own flags entirely when present.
  const hiddenFields = new Set<string>();
  if (overrides ? overrides.showCallTimes !== true : block.ribbonCallTimes !== true) hiddenFields.add('callTime');
  if (overrides ? overrides.showDurations !== true : block.ribbonDurations !== true) hiddenFields.add('duration');
  const cellBorders = overrides?.cellBorders;

  const flagsFor = (): SectionRowFlags => ({
    showDayBreaks: overrides ? overrides.showDayBreaks === true : (block.ribbonDayBreaks === true || block.ribbonHeaders === true),
    showCall: overrides ? overrides.showCallTimes === true : block.ribbonCallTimes === true,
    showDurations: overrides ? overrides.showDurations === true : block.ribbonDurations === true,
    showNotes: overrides ? overrides.showNotes !== false : block.ribbonNotes !== false,
    showBreaks: overrides ? overrides.showBreaks === true : block.ribbonBreaks === true,
  });

  // Sample-value / field-label fallbacks are a designer-canvas + preview
  // affordance only (previewLimit is true there, false in print) — print
  // NEVER renders samples.
  const sample = !!previewLimit;

  if (any?.scene) {
    return (
      <div style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
        <Strip it={item as ReportSceneInfo} ctx={ctx} design={design} hiddenFields={hiddenFields} cellBorders={cellBorders} sample={sample} />
      </div>
    );
  }

  if (typeof any?.section?.index === 'number') {
    const sceneFilter = personSceneFilter(ctx, ancestors);
    return (
      <DaySectionView
        day={item as ReportDayInfo}
        ctx={ctx}
        design={design}
        sceneFilter={sceneFilter}
        flags={flagsFor()}
        hiddenFields={hiddenFields}
        cellBorders={cellBorders}
        sample={sample}
        unitRange={unitRange}
      />
    );
  }

  // Top level — the full schedule.
  if (ctx.dayInfos.length === 0) {
    // Empty project: keep the design visible on canvas/preview by rendering
    // the PREVIEW_SAMPLES trio (INT DAY / EXT DAY / INT NIGHT) instead of the
    // "schedule is empty" hint. Print renders nothing for an empty schedule.
    if (sample) {
      return <SampleSchedule ctx={ctx} design={design} flags={flagsFor()} hiddenFields={hiddenFields} cellBorders={cellBorders} />;
    }
    if (hint) {
      return (
        <div style={{ fontSize: 10, color: '#8f8f8f', fontStyle: 'italic', border: '1px dashed #a1a1aa', borderRadius: 6, padding: 8, textAlign: 'center' }}>
          Ribbon — the schedule is empty. Place inside a Scenes or Days repeat, or add days to render the full schedule here.
        </div>
      );
    }
    return null;
  }
  return <FullSchedule ctx={ctx} design={design} flags={flagsFor()} hiddenFields={hiddenFields} cellBorders={cellBorders} previewLimit={previewLimit} sample={sample} unitRange={unitRange} />;
};

// ---- print-dialog preview ---------------------------------------------------
// A compact dummy slice of the schedule so the ribbon option toggles in the
// print dialog visibly show/hide daybreak halves, note rows and break rows.
// Reuses the same row renderers as the real output (Strip, daybreak halves,
// note/break rows) with fabricated data; the real design + borders + hidden
// fields apply.

const DUMMY_DATE = '2026-08-16';

function dummyScene(id: string, num: string, intExt: 'INT' | 'EXT', dayNight: 'DAY' | 'NIGHT', set: string): ReportSceneInfo {
  return {
    scene: { id, sceneNumber: num, intExt, dayNight, set, cast: 'SAM, JOE', pageCount: '3', description: 'Dummy scene for the print preview.' } as Scene,
    row: { id: `dummy-row-${id}` } as any,
    sectionIndex: 1, chronoDay: 1, date: DUMMY_DATE, callTime: '07:00', durationMin: 40, sheetNumber: Number(num),
  } as ReportSceneInfo;
}

const dummyDay: ReportDayInfo = {
  section: { index: 1 } as any, chronoDay: 1, date: DUMMY_DATE, callTime: '07:00',
  endTime: '16:30', totalPages: 4, shootMin: 480, breakMin: 45,
  label: 'DAY 1', sceneCount: 2, firstScene: '1', lastScene: '2',
} as ReportDayInfo;

const dummyNoteRow: ComputedRow = {
  id: 'dummy-note', type: 'NOTE', noteText: 'Production note — call time moves up 30 minutes.',
  computedCallTime: '07:00', computedElapsed: 0, estimatedDuration: 10,
} as ComputedRow;

const dummyBreakRow: ComputedRow = {
  id: 'dummy-break', type: 'BREAK', breakLabel: 'LUNCH', breakDuration: 45,
  computedCallTime: '12:30', computedElapsed: 1, estimatedDuration: 20,
} as ComputedRow;

export const RibbonDummyPreview: React.FC<{ ctx: ReportCtx; overrides: RibbonPrintOptions }> = ({ ctx, overrides }) => {
  const design = designFor(ctx, { type: 'ribbon' } as ReportBlock, overrides);
  if (!design) return null;
  const hiddenFields = new Set<string>();
  if (overrides.showCallTimes !== true) hiddenFields.add('callTime');
  if (overrides.showDurations !== true) hiddenFields.add('duration');
  const flags: SectionRowFlags = {
    showDayBreaks: overrides.showDayBreaks === true,
    showCall: overrides.showCallTimes === true,
    showDurations: overrides.showDurations === true,
    showNotes: overrides.showNotes !== false,
    showBreaks: overrides.showBreaks === true,
  };
  const daybreakProps = { day: dummyDay, ctx, design };
  const strips = [dummyScene('d1', '1', 'INT', 'DAY', 'COFFEE SHOP'), dummyScene('d2', '2', 'EXT', 'NIGHT', 'PARKING LOT')];
  return (
    <>
      {flags.showDayBreaks && (
        <div style={{ pageBreakInside: 'avoid' }}>
          <DaybreakHeaderHalf {...daybreakProps} showCall={flags.showCall} showDurations={flags.showDurations} />
        </div>
      )}
      {strips.map(it => (
        <div key={it.scene.id} style={{ pageBreakInside: 'avoid' }}>
          <Strip it={it} ctx={ctx} design={design} hiddenFields={hiddenFields} cellBorders={overrides.cellBorders} />
        </div>
      ))}
      {flags.showNotes && <StaticNoteRow row={dummyNoteRow} ctx={ctx} design={design} />}
      {flags.showBreaks && <StaticBreakRow row={dummyBreakRow} ctx={ctx} design={design} />}
      {flags.showDayBreaks && (
        <div style={{ pageBreakInside: 'avoid' }}>
          <DaybreakFooterHalf {...daybreakProps} showCall={flags.showCall} showDurations={flags.showDurations} />
        </div>
      )}
    </>
  );
};
