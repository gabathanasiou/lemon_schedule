import React from 'react';
import { ReportBlock, RibbonRow } from '../../types';
import { ReportCtx, ReportSceneInfo, ReportDayInfo, ReportElementInfo, ReportCollectionItem } from '../../lib/reportData';
import { getFieldValue } from '../../lib/ribbonDefaults';
import { getRibbonCellBaseStyle } from '../../lib/ribbonUtils';
import { getMergeLookup } from '../../lib/mergeGroups';
import {
  sceneStyle, getDayHeaderColors, getDayFooterColors, getFallbackStripColors,
} from '../../lib/sceneColors';
import { formatDuration } from '../../lib/utils';

// Ribbon block: renders real scene strips with the chosen RibbonDesign.
// Reuses the shared ribbon helpers (getRibbonCellBaseStyle, getFieldValue,
// merge groups, sceneStyle, day header/footer colors) — the same pipeline the
// stripboard and schedule print use.
//
// Modes: single (inside a scene-scoped repeat) · day (inside a Days repeat,
// the day's full section) · all (whole schedule, respects print day filter).

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

const Strip: React.FC<{ it: ReportSceneInfo; ctx: ReportCtx; design: NonNullable<ReturnType<typeof designFor>> }> = ({ it, ctx, design }) => {
  const rows = design.rows as RibbonRow[];
  const mergeLookup = getMergeLookup(rows);
  const cpv = design.cellPaddingV ?? 3;
  const cph = design.cellPaddingH ?? 3;
  const edge = design.edgePadding ?? 3;
  const style = sceneStyle(it.scene, ctx.project.colorPalette?.sceneColors, getFallbackStripColors(ctx.project.colorPalette), ctx.project.colorPalette?.colorRules);
  const numCols = Math.max(...rows.map(r => r.cells.length));
  const colWidths = design.colWidths && design.colWidths.length === numCols
    ? design.colWidths
    : Array.from({ length: numCols }, () => 100 / numCols);

  return (
    <div
      style={{
        ...style,
        border: '1px solid #000',
        display: 'grid',
        gridTemplateColumns: colWidths.map(w => `${w}%`).join(' '),
        gridTemplateRows: `repeat(${rows.length}, auto)`,
        padding: `${edge}px ${edge}px`,
        fontSize: 8,
        lineHeight: 1.1,
        fontFamily: 'Helvetica, sans-serif',
      }}
    >
      {rows.flatMap((row, ri) =>
        row.cells.map((cell, ci) => {
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

const NoteBreakRow: React.FC<{ label: string; ctx: ReportCtx }> = ({ label, ctx }) => {
  const palette = ctx.project.colorPalette;
  const bg = palette?.noteBg || '#3f0000';
  const color = palette?.noteText || '#ffffff';
  return (
    <div style={{ background: bg, color, fontSize: 8, padding: '4px 6px', border: '1px solid #000', fontWeight: 700, textAlign: 'center' }}>
      {label}
    </div>
  );
};

const DaySectionView: React.FC<{ day: ReportDayInfo; ctx: ReportCtx; design: NonNullable<ReturnType<typeof designFor>> }> = ({ day, ctx, design }) => {
  const header = getDayHeaderColors(ctx.project.colorPalette);
  const footer = getDayFooterColors(ctx.project.colorPalette);
  const scenes = ctx.sceneInfos.filter(si => si.sectionIndex === day.section.index);
  const palette = ctx.project.colorPalette;
  const noteBg = palette?.noteBg || '#3f0000';
  const noteColor = palette?.noteText || '#ffffff';
  return (
    <div style={{ border: '1px solid #000', pageBreakInside: 'avoid', breakInside: 'avoid' }}>
      <div style={{ background: header.background, color: header.color, fontSize: 8, padding: '3px 6px', display: 'flex', justifyContent: 'space-between' }}>
        <span>{day.label ? `START OF ${day.label.toUpperCase()}` : `START OF DAY ${day.chronoDay}`} — {day.date}</span>
        <span>CALL {day.callTime}</span>
      </div>
      {day.section.rows.map((r, i) => {
        if (r.type === 'SCENE' && r.sceneId) {
          const it = scenes.find(s => s.scene.id === r.sceneId);
          return it ? <Strip key={i} it={it} ctx={ctx} design={design} /> : null;
        }
        if (r.type === 'NOTE') {
          return <div key={i} style={{ background: noteBg, color: noteColor, fontSize: 8, padding: '4px 6px', borderTop: '1px solid #000' }}>NOTE — {r.noteText}</div>;
        }
        if (r.type === 'BREAK') {
          return <NoteBreakRow key={i} label={r.breakLabel || 'BREAK'} ctx={ctx} />;
        }
        return null;
      })}
      <div style={{ background: footer.background, color: footer.color, fontSize: 8, padding: '3px 6px', display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #000' }}>
        <span>{day.label ? `END OF ${day.label.toUpperCase()}` : `END OF DAY ${day.chronoDay}`}</span>
        <span>{day.totalPages} pgs · {formatDuration(day.shootMin)} shoot{day.breakMin ? ` + ${formatDuration(day.breakMin)} break` : ''}</span>
      </div>
    </div>
  );
};

export const ReportRibbonView: React.FC<{ block: ReportBlock; ctx: ReportCtx; item?: ReportCollectionItem }> = ({ block, ctx, item }) => {
  const design = designFor(ctx, block);
  if (!design) return null;
  const mode = block.ribbonMode || 'all';

  if (mode === 'single') {
    const it = item as ReportSceneInfo | ReportElementInfo | undefined;
    if (it && (it as ReportSceneInfo).scene) {
      return (
        <div style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
          <Strip it={it as ReportSceneInfo} ctx={ctx} design={design} />
        </div>
      );
    }
    return null;
  }

  if (mode === 'day') {
    const day = item as ReportDayInfo | undefined;
    if (day) return <DaySectionView day={day} ctx={ctx} design={design} />;
    return null;
  }

  return (
    <>
      {ctx.dayInfos.map(d => (
        <DaySectionView key={d.section.index} day={d} ctx={ctx} design={design} />
      ))}
    </>
  );
};
