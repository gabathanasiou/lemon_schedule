import React, { useMemo } from 'react';
import { Project, ScheduleRow, Scene, RibbonRow } from '../types';
import { SortableRibbon } from './SortableRibbon';
import type { CellBorders, ViewMode } from '../lib/persist';
import { addMinutesToTime } from '../lib/utils';

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
  edgePadding?: number;
  cellBorders?: CellBorders;
  viewMode?: ViewMode;
}

interface DaySectionProps {
  rows: ScheduleRow[];
  callTime?: string;
  scenes: Scene[];
  ribbon?: RibbonRow[];
  colWidths?: number[];
  cellPaddingV?: number;
  cellPaddingH?: number;
  edgePadding?: number;
  cellBorders?: CellBorders;
}

const CastListPrint: React.FC<{ castMembers: Project['castMembers']; relevantCastIds: Set<string> }> = ({ castMembers, relevantCastIds }) => {
  const sorted = [...castMembers]
    .filter(m => relevantCastIds.has(m.id))
    .sort((a, b) => {
      const na = parseInt(a.id, 10);
      const nb = parseInt(b.id, 10);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.id.localeCompare(b.id, undefined, { numeric: true });
    });
  if (sorted.length === 0) return null;

  const ROWS = 10;
  const COLS = 3;
  const grid: (typeof sorted[0] | null)[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  for (let i = 0; i < sorted.length; i++) {
    const col = Math.floor(i / ROWS);
    const row = i % ROWS;
    if (col < COLS) grid[row][col] = sorted[i];
  }

  return (
    <div className="cast-list-page">
      <style>{CAST_LIST_STYLE}</style>
      <h2 className="cast-list-title">CAST LIST</h2>
      <table className="cast-list-table">
        <tbody>
          {grid.map((row, ri) => (
            <tr key={ri}>
              {row.map((m, ci) => (
                <td key={ci} className="cast-list-cell">
                  {m ? <><span className="cast-list-id">{m.id}.</span> {m.name}</> : ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const DaySection: React.FC<DaySectionProps> = ({ rows, callTime, scenes, ribbon, colWidths, cellPaddingV, cellPaddingH, edgePadding, cellBorders }) => {
  let sectionElapsed = 0;
  let sectionBaseTime = callTime || '08:00';
  let daybreakCounter = 0;

  const computedRows = rows.map(r => {
    const ct = addMinutesToTime(sectionBaseTime, sectionElapsed);
    let dur = 0;
    if (r.type === 'SCENE') dur = r.estimatedDuration || 0;
    else if (r.type === 'BREAK') dur = r.breakDuration || 0;
    else if (r.type === 'NOTE') dur = r.estimatedDuration || 0;
    if (r.type === 'DAYBREAK') {
      daybreakCounter += 1;
      const row = { ...r, computedCallTime: ct, daybreakLabel: `End of Day ${daybreakCounter}` };
      sectionElapsed = 0;
      sectionBaseTime = r.daybreakCallTime || callTime || '08:00';
      return row;
    }
    sectionElapsed += dur;
    return { ...r, computedCallTime: ct };
  });

  for (let i = computedRows.length - 1, found = false; i >= 0; i--) {
    const cr = computedRows[i] as any;
    if (cr.type === 'DAYBREAK') { cr.hasNextDaybreak = found; found = true; }
  }

  const daybreaks = computedRows.filter(r => r.type === 'DAYBREAK');
  const nextDaybreakMap = new Map<string, { callTime: string }>();
  for (let i = 0; i < daybreaks.length - 1; i++) {
    nextDaybreakMap.set(daybreaks[i].id, { callTime: daybreaks[i].daybreakCallTime || '08:00' });
  }

  return (
    <div className="print-day">
      {computedRows.map((r) => {
        const ndb = r.type === 'DAYBREAK' ? nextDaybreakMap.get(r.id) : undefined;
        return (
        <div key={r.id} style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
          <SortableRibbon
            row={r as any}
            scenes={scenes}
            readOnly
            ribbon={ribbon}
            colWidths={colWidths}
            cellPaddingV={cellPaddingV}
            cellPaddingH={cellPaddingH}
            edgePadding={edgePadding}
            cellBorders={cellBorders}
            nextDaybreakCallTime={ndb?.callTime}
          />
        </div>
        );
      })}
    </div>
  );
};

const PRINT_STYLE = `
  @media print {
    html, body, #root, #root > * {
      height: initial !important;
      overflow: initial !important;
      background: #ffffff !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
  }
  @page {
    size: landscape;
    margin: 10mm 8mm;
  }
  .print-root {
    font-family: Helvetica, sans-serif;
    font-size: 8pt;
    line-height: 1.1;
    color: #18181b;
    padding: 0;
    margin: 0;
    width: 100%;
    background: #ffffff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .print-title-section {
    text-align: left;
    padding-bottom: 10pt;
    margin-bottom: 10pt;
    border-bottom: 2pt solid #18181b;
    background: #ffffff;
  }
  .print-title {
    margin: 0;
  }
  .print-subtitle {
    color: #52525b;
    margin: 2pt 0 0 0;
  }
  .print-day {
    page-break-inside: auto;
    background: #ffffff;
  }
  .print-day-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #000000;
    color: #ffffff;
    padding: 16pt 10pt;
  }
  .print-day-number {
    flex: 0 0 auto;
  }
  .print-day-date {
    text-align: center;
    flex: 1;
  }
  .print-day-call {
    flex: 0 0 auto;
  }
  .print-table {
    width: 100%;
    border-collapse: collapse;
    margin: 0;
    padding: 0;
    border: none;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .print-table td {
    padding: 3pt 1pt;
    vertical-align: top;
  }
  .print-col-sc { width: 15pt; text-align: center !important; }
  .print-col-call { width: 20pt; text-align: center !important; }
  .print-col-dur { width: 30pt; text-align: center !important; }
  .print-col-ie { width: 34pt; text-align: left !important; }
  .print-col-set { width: 120pt; text-align: left; text-transform: uppercase; }
  .print-col-dn { width: 40pt; text-align: left !important; }
  .print-col-cast { width: 56pt; text-align: left !important; }
  .print-col-pgs { width: 34pt; text-align: center !important; }

  .print-table .print-row-scene td,
  .print-table .print-row-desc td {
    border-right: 1px solid var(--td-border-color, #ffffff);
  }

  .print-table .print-row-note td,
  .print-table .print-row-break td {
    background: var(--note-bg, #591b1b);
    color: var(--note-fg, #ffffff);
    vertical-align: middle;
    padding-top: var(--note-row-py, 12px) !important;
    padding-bottom: var(--note-row-py, 12px) !important;
    border-right: 1px solid var(--td-border-color, #591b1b);
    border-bottom: 1px solid var(--td-border-color, #591b1b);
  }
  .print-row-scene td { padding-bottom: 3pt !important; }
  .print-row-desc td { vertical-align: middle; padding-top: 0 !important; }
  .print-cell-desc {
    line-height: 1.1;
    text-align: left !important;
  }

  .print-table tbody tr:first-child td {
    border-top: 1px solid #000 !important;
  }
  .print-table:last-of-type tbody tr:last-child td {
    border-bottom: 1px solid #000 !important;
  }
  .print-table td:first-child {
    border-left: 1px solid #000 !important;
  }
  .print-table td:last-child {
    border-right: 1px solid #000 !important;
  }

  .print-day-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #ffffff;
    color: #18181b;
    padding: 4pt 6pt;
    border-top: 1pt solid #d4d4d8;
  }
  .print-footer-end-label {
    flex: 0 0 auto;
  }
  .print-footer-date {
    flex: 1;
    text-align: center;
  }
  .print-footer-stats {
    display: flex;
    gap: 20pt;
    flex: 0 0 auto;
  }
`;

const CAST_LIST_STYLE = `
  .cast-list-page {
    page-break-after: always;
    padding-top: 10pt;
    background: #ffffff;
  }
  .cast-list-title {
    text-align: left;
    font-family: Helvetica, sans-serif;
    font-size: 8pt;
    font-weight: 700;
    margin: 0 0 8pt 0;
    border-bottom: 1pt solid #000;
    padding-bottom: 4pt;
  }
  .cast-list-table {
    width: 100%;
    border-collapse: collapse;
    font-family: Helvetica, sans-serif;
    font-size: 8pt;
    table-layout: fixed;
  }
  .cast-list-table td {
    width: 33.33%;
    padding: 2pt 8pt;
    vertical-align: top;
    border: none;
  }
  .cast-list-cell {
    line-height: 1.4;
  }
  .cast-list-id {
    font-weight: 600;
  }
`;

const PrintSchedule: React.FC<PrintScheduleProps> = ({ project, showTimes, showDurations, showCastList, showExportDate, showPageNumbers, selectedDays, includeStatusDays, fileName, ribbon, colWidths, cellPaddingV, cellPaddingH, edgePadding, cellBorders, viewMode }) => {
  const VIEW_WIDTHS: Record<string, number | null> = { portrait: 730, landscape: 1060, full: null };
  const contentMaxWidth = viewMode ? VIEW_WIDTHS[viewMode] : null;

  const activeVersion = project.versions.find(v => v.id === project.activeVersionId);
  if (!activeVersion) return null;

  const scenes = project.scenes;
  const augmentedRows: ScheduleRow[] = activeVersion.rows.map(r => ({ ...r }));
  const missingScenes = project.scenes.filter(s => !augmentedRows.some(r => r.sceneId === s.id));
  for (const s of missingScenes) {
    augmentedRows.push({
      id: `row-synth-${s.id}`,
      type: 'SCENE',
      sceneId: s.id,
      containerId: null,
      order: 999999,
      estimatedDuration: 30,
    });
  }

  const scheduledRows = augmentedRows.reduce((acc, row) => {
    if (row.containerId !== null) {
      if (!acc[row.containerId]) acc[row.containerId] = [];
      acc[row.containerId].push(row);
    }
    return acc;
  }, {} as Record<number, ScheduleRow[]>);

  Object.values(scheduledRows).forEach(dayRows => dayRows.sort((a, b) => a.order - b.order));

  const allRows = augmentedRows.filter(r => r.containerId != null).sort((a, b) => {
    if ((a.containerId || 0) !== (b.containerId || 0)) return (a.containerId || 0) - (b.containerId || 0);
    return a.order - b.order;
  });

  const sections: { index: number; rows: ScheduleRow[]; daybreakRow?: ScheduleRow }[] = (() => {
    const s: { index: number; rows: ScheduleRow[]; daybreakRow?: ScheduleRow }[] = [];
    let current: ScheduleRow[] = [];
    let idx = 0;
    for (const r of allRows) {
      if (r.type === 'DAYBREAK') { s.push({ index: idx, rows: current, daybreakRow: r }); current = []; idx++; }
      else { current.push(r); }
    }
    return s;
  })();

  const addDays = (d: string, n: number) => { const p = d.split('-').map(Number); const dt = new Date(Date.UTC(p[0], p[1] - 1, p[2] + n)); return dt.toISOString().slice(0, 10); };
  const startDate = activeVersion?.productionStart || new Date().toISOString().slice(0, 10);
  const nonShootSet = new Set((activeVersion?.nonShootDates || []).map(n => n.date));
  const sectionDateMap = (() => { const m = new Map<number, string>(); let c = startDate; for (const s of sections) { while (nonShootSet.has(c)) c = addDays(c, 1); m.set(s.index, c); if (!s.daybreakRow?.pinned) { c = addDays(c, 1); } } return m; })();

  const sectionEntries = sections.filter(s => !s.daybreakRow?.pinned).map((s) => {
    const content = s.rows.filter(r => selectedDays.includes(s.index));
    const allRows = [...content];
    if (s.daybreakRow && selectedDays.includes(s.index)) allRows.push(s.daybreakRow as ScheduleRow);
    return {
      sectionIndex: s.index,
      date: sectionDateMap.get(s.index) || '',
      rows: allRows,
      hasRows: allRows.length > 0,
    };
  }).filter(e => e.hasRows && e.date);

  sectionEntries.sort((a, b) => a.date.localeCompare(b.date));

  const chronoDayMap = useMemo(() => {
    const m = new Map<number, number>();
    let counter = 0;
    for (const e of sectionEntries) { counter++; m.set(e.sectionIndex, counter); }
    return m;
  }, []);

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
                rows={e.rows}
                callTime={sections.find(s => s.index === e.sectionIndex)?.daybreakRow?.daybreakCallTime || '08:00'}
                scenes={scenes}
                ribbon={ribbon}
                colWidths={colWidths}
                cellPaddingV={cellPaddingV}
                cellPaddingH={cellPaddingH}
                edgePadding={edgePadding}
                cellBorders={cellBorders}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
export default PrintSchedule;
