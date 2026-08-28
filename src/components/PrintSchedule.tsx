import React, { useMemo } from 'react';
import { Project, ScheduleRow, Scene, RibbonRow, RibbonCell, SceneColorEntry, ColorRule, SceneColorPalette } from '../types';
import { getFieldValue, getRibbonCellBaseStyle, ribCellTextSize, formatCellText, getNoteBreakPad, getCellBorderProps, getFallbackStripColors } from '../lib/ribbonUtils';
import { RibbonCellText } from './RibbonCellText';
import type { CellBorders, ViewMode } from '../lib/persist';
import { formatDuration, formatDateLong } from '../lib/utils';
import { computeRowData } from '../lib/daybreakUtils';
import { useDaybreakSections } from '../lib/useDaybreakSections';
import { filterIndices, filterCells } from './print/printLayout';
import { PRINT_STYLE } from './print/printStyles';
import { CastListPrint } from './print/CastListPrint';
import {
  PrintRowCtx, PrintNoteRow, PrintBreakRow, PrintDaybreakRow, PrintSceneRow,
  PrintSectionHeader, PrintSectionFooter,
} from './print/PrintRowParts';

interface PrintScheduleProps {
  project: Project;
  showTimes: boolean;
  showDurations: boolean;
  showCastList: boolean;
  showExportDate: boolean;
  showPageNumbers: boolean;
  selectedDays: number[];
  includeStatusDays?: boolean;
  fileName: string;
  ribbon?: RibbonRow[];
  colWidths?: number[];
  cellPaddingV?: number;
  cellPaddingH?: number;
  textSize?: number;
  edgePadding?: number;
  cellBorders?: CellBorders;
  viewMode?: ViewMode;
}

interface DaySectionProps {
  dayInt: number;
  rows: ScheduleRow[];
  callTime?: string;
  dateStr?: string;
  scenes: Scene[];
  showTimes: boolean;
  showDurations: boolean;
  chronoDay: number;
  ribbon?: RibbonRow[];
  colWidths?: number[];
  cellPaddingV?: number;
  cellPaddingH?: number;
  textSize?: number;
  edgePadding?: number;
  cellBorders?: CellBorders;
  sceneColors?: SceneColorEntry[];
  fallbackOverride?: { background: string; color: string };
  colorRules?: ColorRule[];
  colorPalette?: SceneColorPalette;
}

const DaySection: React.FC<DaySectionProps> = ({ dayInt, rows, callTime, dateStr, scenes, showTimes, showDurations, chronoDay, ribbon, colWidths, cellPaddingV, cellPaddingH, textSize, edgePadding, cellBorders, sceneColors, fallbackOverride, colorRules, colorPalette }) => {
  const { computedRows, sectionSums } = computeRowData(
    rows,
    scenes,
    dateStr || new Date().toISOString().slice(0, 10),
    new Set(),
    callTime,
  );
  const sums = sectionSums.get(0);
  const totalPages = sums?.pages ?? 0;
  const totalBreakTime = sums?.break ?? 0;
  const runningElapsed = sums?.total ?? 0;

  const rawCells = (ribbon && ribbon.length > 0) ? ribbon[0].cells : null;
  const cw = colWidths ?? [];
  const { keep, filteredWidths } = useMemo(() => rawCells ? filterIndices(rawCells, cw, showTimes, showDurations) : { keep: [] as boolean[], filteredWidths: [] as number[] }, [rawCells, cw, showTimes, showDurations]);
  const cells = useMemo(() => rawCells ? filterCells(rawCells, keep) : null, [rawCells, keep]);
  const filteredRibbon = useMemo(() => {
    if (!ribbon || keep.length === 0) return undefined;
    return ribbon.map(row => ({ ...row, cells: filterCells(row.cells, keep) }));
  }, [ribbon, keep]);
  const noteBreakPadPx = `${getNoteBreakPad(cellPaddingV ?? 6, ribbon?.length || 1)}px ${cellPaddingH ?? 6}px`;
  const mainCellIdx = cells ? (() => {
    const nonSpecial = cells
      .map((c, i) => ({i, w: filteredWidths[i] ?? 0, f: c.field}))
      .filter(x => x.f !== 'duration' && x.f !== 'callTime');
    return nonSpecial.length > 0
      ? nonSpecial.reduce((a, b) => a.w >= b.w ? a : b).i
      : cells.map((c, i) => ({i, w: filteredWidths[i] ?? 0})).reduce((a, b) => a.w >= b.w ? a : b, {i: 0, w: 0}).i;
  })() : null;

  const pageCountColIdx = cells ? cells.findIndex((_, ci) =>
    filteredRibbon && filteredRibbon.some(r => ci < r.cells.length && r.cells[ci].field === 'pageCount')
  ) : -1;

  const pageCountCell = (() => {
    if (!ribbon) return null;
    for (const r of ribbon) {
      const found = r.cells.find(c => c.field === 'pageCount');
      if (found) return found;
    }
    return null;
  })();

  const durationColIdx = cells ? cells.findIndex(c => c.field === 'duration') : -1;
  const durationCell = ribbon ? (() => {
    for (const r of ribbon) {
      const found = r.cells.find(c => c.field === 'duration');
      if (found) return found;
    }
    return null;
  })() : null;

  const estColIdx = mainCellIdx === cells?.length - 1 && durationColIdx >= 0 ? durationColIdx : (cells ? cells.length - 1 : -1);

  const cellPrintStyle = (cell: RibbonCell, span = 1) => getRibbonCellBaseStyle(cell, cellPaddingV, cellPaddingH, span, ribCellTextSize(textSize, cell));

  const fmt = (prefix: string | undefined, val: string, suffix: string | undefined) =>
    formatCellText(prefix, val, suffix);

  const renderSceneCellFlex = (cell: RibbonCell, scene: Scene, computedCallTime?: string, estimatedDuration?: number, isLastInRow?: boolean, isLastRow?: boolean, textColor?: string, col?: number, row?: number, vSpan?: number, hSpan?: number) => {
    const span = vSpan || 1;
    const val = cell.field === 'text' ? (cell.textContent || '') : getFieldValue(cell.field, { ...scene, computedCallTime, estimatedDuration: estimatedDuration || 0, sheetNumber: String(scenes.findIndex(s => s.id === scene.id) + 1) });
    const display = val ? fmt(cell.prefix, val, cell.suffix) : '';
    const style: React.CSSProperties = {
      ...cellPrintStyle(cell, span),
      ...getCellBorderProps(cellBorders, textColor || '#000', isLastInRow ?? true, isLastRow ?? true),
    };
    if (col !== undefined && row !== undefined) {
      style.gridColumn = (hSpan && hSpan > 1) ? `${col + 1} / span ${hSpan}` : col + 1;
      style.gridRow = span > 1 ? `${row + 2} / span ${span}` : row + 2;
    }
    return <div key={cell.id} style={style}><RibbonCellText cell={cell} span={span} cellPadding={cellPaddingV} textSize={textSize}>{display || ''}</RibbonCellText></div>;
  };

  const ctx: PrintRowCtx = {
    cells, filteredWidths, mainCellIdx, estColIdx, noteBreakPadPx, fmt,
    pageCountColIdx, pageCountCell, durationColIdx, durationCell, renderSceneCellFlex,
    showTimes, showDurations, cellPaddingV, cellPaddingH, textSize, edgePadding, cellBorders,
    ribbon, filteredRibbon, scenes, sceneColors, fallbackOverride, colorRules, colorPalette,
    chronoDay, dateStr, callTime, runningElapsed, totalPages, totalBreakTime,
  };

  return (
    <div className="print-day">
      <PrintSectionHeader ctx={ctx} />

      {computedRows.map((r) => {
        if (r.type === 'NOTE') return <PrintNoteRow key={r.id} r={r} ctx={ctx} />;
        if (r.type === 'BREAK') return <PrintBreakRow key={r.id} r={r} ctx={ctx} />;
        if (r.type === 'DAYBREAK') return <PrintDaybreakRow key={r.id} r={r} ctx={ctx} />;
        return <PrintSceneRow key={r.id} r={r} ctx={ctx} />;
      })}

      <PrintSectionFooter ctx={ctx} />
    </div>
  );
};

const PrintSchedule: React.FC<PrintScheduleProps> = ({ project, showTimes, showDurations, showCastList, showExportDate, showPageNumbers, selectedDays, includeStatusDays, fileName, ribbon, colWidths, cellPaddingV, cellPaddingH, textSize, edgePadding, cellBorders, viewMode }) => {
  const VIEW_WIDTHS: Record<string, number | null> = { portrait: 730, landscape: 1060, full: null };
  const contentMaxWidth = viewMode ? VIEW_WIDTHS[viewMode] : null;

  const { productionDays, sectionDateMap, chronoDayMap } = useDaybreakSections();

  const activeVersion = project.versions.find(v => v.id === project.activeVersionId);
  if (!activeVersion) return null;

  const scenes = project.scenes;

  const sectionEntries = productionDays.map((s) => ({
    sectionIndex: s.index,
    date: sectionDateMap.get(s.index) || '',
    rows: s.rows.filter(r => selectedDays.includes(s.index)),
    hasRows: s.rows.some(r => selectedDays.includes(s.index)),
  })).filter(e => e.hasRows && e.date);

  sectionEntries.sort((a, b) => a.date.localeCompare(b.date));

  const printedSceneIds = new Set<string>();
  for (const e of sectionEntries) {
    for (const row of e.rows) {
      if (row.sceneId) printedSceneIds.add(row.sceneId);
    }
  }
  const printedCastIds = new Set<string>();
  for (const s of scenes) {
    if (printedSceneIds.has(s.id)) {
      for (const id of (s.cast || '').split(',').map(x => x.trim()).filter(Boolean)) {
        printedCastIds.add(id);
      }
    }
  }

  return (
    <div>
      <style>{PRINT_STYLE}</style>
      {showPageNumbers && (
        <style>{`@page { @bottom-right { content: counter(page); font-family: Helvetica, sans-serif; font-size: 8pt; } }`}</style>
      )}
      <div className="print-root" style={contentMaxWidth ? { maxWidth: contentMaxWidth, margin: '0 auto' } : undefined}>
        {showCastList && <CastListPrint castMembers={project.castMembers || []} relevantCastIds={printedCastIds} />}

        <div className="print-title-section">
          <h1 className="print-title">{project.title || 'Production Schedule'}</h1>
          <p className="print-subtitle">Schedule Version: {activeVersion.name}{showExportDate ? ` ${new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })}` : ''}</p>
        </div>

        {sectionEntries.length > 0 && (
          <div className="print-schedule-pages" style={{ counterReset: 'page' }}>
            {sectionEntries.map((e, i) => (
              <DaySection
                key={e.sectionIndex}
                dayInt={e.sectionIndex}
                rows={e.rows}
                callTime={productionDays.find(s => s.index === e.sectionIndex)?.daybreakRow?.daybreakCallTime || '08:00'}
                dateStr={e.date}
                scenes={scenes}
                showTimes={showTimes}
                showDurations={showDurations}
                chronoDay={chronoDayMap.get(e.sectionIndex)}
                ribbon={ribbon}
                colWidths={colWidths}
                cellPaddingV={cellPaddingV}
                cellPaddingH={cellPaddingH}
                textSize={textSize}
                edgePadding={edgePadding}
                cellBorders={cellBorders}
                sceneColors={project.colorPalette?.sceneColors}
                fallbackOverride={getFallbackStripColors(project.colorPalette)}
                colorRules={project.colorPalette?.colorRules}
                colorPalette={project.colorPalette}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
export default PrintSchedule;
