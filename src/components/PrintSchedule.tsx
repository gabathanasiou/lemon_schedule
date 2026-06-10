import React, { useMemo } from 'react';
import { Project, ScheduleRow, Scene, ShootDayMeta, RibbonRow } from '../types';
import { getFieldValue } from '../lib/ribbonUtils';
import { addMinutesToTime, formatDuration, formatPageCount } from '../lib/utils';

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
}

function sceneStyle(scene?: Scene | null): React.CSSProperties {
  if (!scene) return { background: '#ffffff', color: '#18181b' };
  const intExt = (scene.intExt || '').toUpperCase();
  const dayNight = (scene.dayNight || '').toUpperCase();
  if (intExt.includes('INT') && dayNight.includes('DAY')) return { background: '#ffffff', color: '#464646' };
  if (intExt.includes('EXT') && dayNight.includes('DAY')) return { background: '#bdd857', color: '#000000' };
  if (intExt.includes('INT') && dayNight.includes('NIGHT')) return { background: '#67832e', color: '#f2fce3' };
  if (intExt.includes('EXT') && dayNight.includes('NIGHT')) return { background: '#2148a7', color: '#ffffff' };
  if (intExt.includes('INT') && dayNight.includes('MORNING')) return { background: '#efbea0', color: '#4a3730' };
  if (intExt.includes('EXT') && dayNight.includes('MORNING')) return { background: '#e88aa5', color: '#ffffff' };
  if (intExt.includes('INT') && dayNight.includes('EVENING')) return { background: '#e29926', color: '#000000' };
  if (intExt.includes('EXT') && dayNight.includes('EVENING')) return { background: '#ce7d21', color: '#000000' };
  return { background: '#ffffff', color: '#18181b' };
}

function formatDateLong(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const weekday = d.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();
  const day = d.getDate();
  const month = d.toLocaleDateString('en-US', { month: 'long' }).toUpperCase();
  const year = d.getFullYear();
  const suffixes = ['TH', 'ST', 'ND', 'RD'];
  const suffix = (day >= 11 && day <= 13) ? 'TH' : suffixes[day % 10] || 'TH';
  return `${weekday} ${day}${suffix} ${month} ${year}`;
}

interface DaySectionProps {
  dayInt: number;
  rows: ScheduleRow[];
  meta?: ShootDayMeta;
  scenes: Scene[];
  showTimes: boolean;
  showDurations: boolean;
  chronoDay: number;
  ribbon?: RibbonRow[];
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

const DaySection: React.FC<DaySectionProps> = ({ dayInt, rows, meta, scenes, showTimes, showDurations, chronoDay, ribbon }) => {
  let runningElapsed = 0;
  let totalPages = 0;
  let totalBreakTime = 0;

  const computedRows = rows.map(r => {
    const callTime = addMinutesToTime(meta?.unitCall || '08:00', runningElapsed);
    let dur = 0;
    if (r.type === 'SCENE') {
      dur = r.estimatedDuration || 0;
      const scene = scenes.find(s => s.id === r.sceneId);
      if (scene) totalPages += scene.pageCountDecimal;
    } else if (r.type === 'BREAK') {
      dur = r.breakDuration || 0;
      totalBreakTime += dur;
    } else if (r.type === 'NOTE') {
      dur = r.estimatedDuration || 0;
    }
    runningElapsed += dur;
    return { ...r, computedCallTime: callTime, computedElapsed: runningElapsed };
  });

  const isStatusDay = meta?.status && meta.status !== 'work';

  if (isStatusDay && rows.length === 0) {
    return (
      <div className="print-day" style={{borderBottom: '1pt dashed #a1a1aa'}}>
        <div className="print-day-header" style={{background: '#000', color: '#fff', justifyContent: 'space-between', paddingLeft: '10pt'}}>
          <span className="print-day-number" style={{fontSize: '10pt'}}>{meta.status === 'hold' ? 'HOLD' : meta.status === 'travel' ? 'TRAVEL' : 'HOLIDAY'}</span>
          {meta?.date && <span className="print-day-date" style={{fontSize: '8pt'}}>{new Date(meta.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</span>}
        </div>
      </div>
    );
  }

  const cells = (ribbon && ribbon.length > 0) ? ribbon[0].cells : null;
  const nCells = cells ? cells.length : 8;

  const cellPrintStyle = (cell: import('../types').RibbonCell, bgColor: string, isLast?: boolean, isDesc?: boolean): React.CSSProperties => ({
    flex: `0 0 ${cell.width}%`,
    minWidth: 0,
    textAlign: cell.align || 'left',
    padding: isDesc ? '0 1pt 3pt 1pt' : '3pt 1pt',
    verticalAlign: 'top',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: cell.wrap ? 'normal' : 'nowrap',
    wordBreak: cell.wrap ? 'break-word' : undefined,
    textTransform: cell.field === 'set' ? 'uppercase' : 'none',
    fontWeight: cell.field === 'sceneNumber' ? 700 : 500,
    borderRight: isLast ? '1px solid #000' : `1px solid ${bgColor}`,
  });

  const fmt = (prefix: string | undefined, val: string, suffix: string | undefined) =>
    `${prefix || ''}${prefix && val ? '\u00A0' : ''}${val}${suffix && val ? '\u00A0' : ''}${suffix || ''}`;

  const renderSceneCellFlex = (cell: import('../types').RibbonCell, scene: Scene, computedCallTime?: string, isLast?: boolean, bgColor?: string) => {
    const val = cell.field === 'text' ? (cell.textContent || '') : getFieldValue(cell.field, { ...scene, computedCallTime, estimatedDuration: 0 });
    const display = val ? fmt(cell.prefix, val, cell.suffix) : '';
    return <div key={cell.id} style={cellPrintStyle(cell, bgColor || '#ffffff', isLast)}>{display || ''}</div>;
  };

  const renderSceneDescCellFlex = (cell: import('../types').RibbonCell, scene: Scene, isLast?: boolean, bgColor?: string) => {
    const val = cell.field === 'text' ? (cell.textContent || '') : getFieldValue(cell.field, scene);
    const display = val ? fmt(cell.prefix, val, cell.suffix) : '';
    return <div key={cell.id} style={cellPrintStyle(cell, bgColor || '#ffffff', isLast, true)}>{display || ''}</div>;
  };

  const renderEmptyCellFlex = (cell: import('../types').RibbonCell, isLast?: boolean, isDesc?: boolean, bgColor?: string) => (
    <div key={cell.id} style={cellPrintStyle(cell, bgColor || '#ffffff', isLast, isDesc)} />
  );

  return (
    <div className="print-day">
      <div className="print-day-header">
        <span className="print-day-number">DAY #{chronoDay}</span>
        {meta?.date && <span className="print-day-date">{new Date(meta.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</span>}
        <span className="print-day-call">CALL {meta?.unitCall || ''}</span>
      </div>

      {computedRows.map((r, ri) => {
            const isLastRow = ri === computedRows.length - 1;
            if (r.type === 'NOTE') {
              const noteBg = (r as any).noteColor || '#591b1b';
              const noteFg = (r as any).noteTextColor || '#ffffff';
              if (cells) {
                const n = cells.length;
                return (
                  <div key={r.id} style={{ pageBreakInside: 'avoid', breakInside: 'avoid', display: 'flex', flexDirection: 'column', borderLeft: '1px solid #000', borderRight: '1px solid #000', borderTop: '1px solid #000', borderBottom: isLastRow ? '1px solid #000' : 'none', background: noteBg, color: noteFg }}>
                    <div style={{ display: 'flex', background: noteBg, color: noteFg, minHeight: 0 }}>
                      {cells.map((c, ci) => (
                        <div key={c.id} style={{ flex: `0 0 ${c.width}%`, minWidth: 0, textAlign: 'center', padding: '9pt 1pt', borderRight: ci === n - 1 ? '1px solid #000' : `1px solid ${noteBg}`, overflow: 'hidden', whiteSpace: c.wrap ? 'normal' : 'nowrap' }}>
                          {r.noteText || ''}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              }
              return (
                <table key={r.id} className="print-table" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' } as any}>
                  <tbody>
                    <tr className="print-row-note" style={{ '--note-bg': noteBg, '--note-fg': noteFg, '--td-border-color': noteBg } as any}>
                      <>
                        <td className="print-col-sc" />
                        {showTimes && <td className="print-col-call">{r.computedCallTime}</td>}
                        {showDurations && <td className="print-col-dur">{r.estimatedDuration ? formatDuration(r.estimatedDuration) : ''}</td>}
                        <td className="print-col-ie" />
                        <td className="print-col-set" style={{textAlign: 'center'}}>{r.noteText || ''}</td>
                        <td className="print-col-dn" />
                        <td className="print-col-cast" />
                        <td className="print-col-pgs" />
                      </>
                    </tr>
                  </tbody>
                </table>
              );
            }
            if (r.type === 'BREAK') {
              if (cells) {
                const n = cells.length;
                return (
                  <div key={r.id} style={{ pageBreakInside: 'avoid', breakInside: 'avoid', display: 'flex', flexDirection: 'column', borderLeft: '1px solid #000', borderRight: '1px solid #000', borderTop: '1px solid #000', borderBottom: isLastRow ? '1px solid #000' : 'none', background: '#591b1b', color: '#ffffff' }}>
                    <div style={{ display: 'flex', background: '#591b1b', color: '#ffffff', minHeight: 0 }}>
                      {cells.map((c, ci) => (
                        <div key={c.id} style={{ flex: `0 0 ${c.width}%`, minWidth: 0, textAlign: 'center', padding: '9pt 1pt', borderRight: ci === n - 1 ? '1px solid #000' : `1px solid #591b1b`, overflow: 'hidden', whiteSpace: c.wrap ? 'normal' : 'nowrap' }}>
                          {r.breakLabel || 'BREAK'}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              }
              return (
                <table key={r.id} className="print-table" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' } as any}>
                  <tbody>
                    <tr className="print-row-break">
                      <>
                        <td className="print-col-sc" />
                        {showTimes && <td className="print-col-call">{r.computedCallTime}</td>}
                        {showDurations && <td className="print-col-dur">{formatDuration(r.breakDuration || 0)}</td>}
                        <td className="print-col-ie" />
                        <td className="print-col-set" style={{textAlign: 'center'}}>{r.breakLabel || 'BREAK'}</td>
                        <td className="print-col-dn" />
                        <td className="print-col-cast" />
                        <td className="print-col-pgs" />
                      </>
                    </tr>
                  </tbody>
                </table>
              );
            }
            const scene = scenes.find(s => s.id === r.sceneId);
            if (!scene) return null;
            const rowStyle = sceneStyle(scene);
            const bgColor = rowStyle.background || '#ffffff';

            if (cells) {
              const r2 = (ribbon && ribbon.length > 1) ? ribbon[1] : null;
              const c1 = cells;
              return (
                <div key={r.id} style={{ pageBreakInside: 'avoid', breakInside: 'avoid', display: 'flex', flexDirection: 'column', borderLeft: '1px solid #000', borderRight: '1px solid #000', borderTop: '1px solid #000', borderBottom: isLastRow ? '1px solid #000' : 'none' }}>
                  <div style={{ display: 'flex', ...rowStyle }}>
                    {c1.map((c, ci) => renderSceneCellFlex(c, scene, r.computedCallTime, ci === c1.length - 1, bgColor))}
                  </div>
                  <div style={{ display: 'flex', ...rowStyle }}>
                    {r2 ? r2.cells.map((c, ci) => renderSceneDescCellFlex(c, scene, ci === r2.cells.length - 1, bgColor)) : c1.map((c, ci) => renderEmptyCellFlex(c, ci === c1.length - 1, true, bgColor))}
                  </div>
                </div>
              );
            }

            return (
              <table key={r.id} className="print-table" style={{ pageBreakInside: 'avoid', breakInside: 'avoid', '--td-border-color': bgColor } as any}>
                <tbody>
                  <tr className="print-row-scene" style={rowStyle}>
                    <td className="print-col-sc">{scene.sceneNumber}</td>
                    {showTimes && <td className="print-col-call">{r.computedCallTime}</td>}
                    {showDurations && <td className="print-col-dur">{formatDuration(r.estimatedDuration || 0)}</td>}
                    <td className="print-col-ie">{scene.intExt}</td>
                    <td className="print-col-set">{scene.set}</td>
                    <td className="print-col-dn">{scene.dayNight}</td>
                    <td className="print-col-cast">{scene.cast}</td>
                    <td className="print-col-pgs">{scene.pageCount ? `${scene.pageCount} pgs` : ''}</td>
                  </tr>
                  <tr className="print-row-desc" style={rowStyle}>
                    <td className="print-col-sc" />
                    {showTimes && <td className="print-col-call" />}
                    {showDurations && <td className="print-col-dur" />}
                    <td colSpan={5} className="print-cell-desc">
                      {scene.description || ''}
                    </td>
                  </tr>
                </tbody>
              </table>
            );
          })}

      <div className="print-day-footer">
        <span className="print-footer-end-label">
          End of Day #{chronoDay}
          {runningElapsed > 0 && <span> · {addMinutesToTime(meta?.unitCall || '08:00', runningElapsed)}</span>}
        </span>
        {meta?.date && <span className="print-footer-date">{new Date(meta.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</span>}
        <span className="print-footer-spacer" />
        <span>Total Pages: {formatPageCount(totalPages)} pgs</span>
        <span>EST. TIME: {formatDuration(runningElapsed - totalBreakTime)}{totalBreakTime > 0 ? ` + ${formatDuration(totalBreakTime)}` : ''}</span>
      </div>
    </div>
  );
}

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
    font-family: Helvetica, Arial, sans-serif;
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
    border-bottom: 1px solid var(--td-border-color, #ffffff);
  }

  .print-table .print-row-note td,
  .print-table .print-row-break td {
    background: var(--note-bg, #591b1b);
    color: var(--note-fg, #ffffff);
    vertical-align: middle;
    padding-top: 9pt !important;
    padding-bottom: 9pt !important;
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
    justify-content: flex-start;
    align-items: center;
    background: #ffffff;
    color: #18181b;
    padding: 4pt 6pt;
    gap: 20pt;
    border-top: 0.5pt solid #d4d4d8;
  }
  .print-footer-end-label {
  }
  .print-footer-date {
    flex: 1;
    text-align: center;
  }
  .print-footer-spacer {
    flex: 1;
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
    font-family: Helvetica, Arial, sans-serif;
    font-size: 8pt;
    font-weight: 700;
    margin: 0 0 8pt 0;
    border-bottom: 1pt solid #000;
    padding-bottom: 4pt;
  }
  .cast-list-table {
    width: 100%;
    border-collapse: collapse;
    font-family: Helvetica, Arial, sans-serif;
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

const PrintSchedule: React.FC<PrintScheduleProps> = ({ project, showTimes, showDurations, showCastList, showExportDate, showPageNumbers, selectedDays, includeStatusDays, fileName, ribbon }) => {
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
      shootDay: null,
      order: 999999,
      estimatedDuration: 30,
    });
  }

  const scheduledRows = augmentedRows.reduce((acc, row) => {
    if (row.shootDay !== null) {
      if (!acc[row.shootDay]) acc[row.shootDay] = [];
      acc[row.shootDay].push(row);
    }
    return acc;
  }, {} as Record<number, ScheduleRow[]>);

  Object.values(scheduledRows).forEach(dayRows => dayRows.sort((a, b) => a.order - b.order));

  const existingDays = Array.from(new Set([
    ...augmentedRows.map(r => r.shootDay).filter((d): d is number => d !== null),
    ...(includeStatusDays ? Object.entries(activeVersion.dayMeta || {})
      .filter(([, v]) => (v as ShootDayMeta).status && (v as ShootDayMeta).status !== 'work')
      .map(([k]) => Number(k)) : []),
  ])).filter(d => scheduledRows[d] && scheduledRows[d].length > 0 ? selectedDays.includes(d) : includeStatusDays && selectedDays.includes(d))
    .sort((a, b) => {
      const dateA = activeVersion.dayMeta?.[a]?.date || '';
      const dateB = activeVersion.dayMeta?.[b]?.date || '';
      return dateA.localeCompare(dateB);
    });

  const chronoDayMap = useMemo(() => {
    const m = new Map<number, number>();
    let counter = 0;
    for (const d of existingDays) {
      const status = activeVersion.dayMeta?.[d]?.status;
      if (!status || status === 'work') { counter++; m.set(d, counter); }
    }
    return m;
  }, [existingDays, activeVersion]);

  const printedSceneIds = new Set<string>();
  for (const dayInt of existingDays) {
    for (const row of (scheduledRows[dayInt] || [])) {
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
        <style>{`@page { @bottom-right { content: counter(page); font-family: Helvetica, Arial, sans-serif; font-size: 8pt; } }`}</style>
      )}
      <div className="print-root">
        {showCastList && <CastListPrint castMembers={project.castMembers || []} relevantCastIds={printedCastIds} />}

        <div className="print-title-section">
          <h1 className="print-title">{project.title || 'Production Schedule'}</h1>
          <p className="print-subtitle">Schedule Version: {activeVersion.name}{showExportDate ? ` ${new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })}` : ''}</p>
        </div>

        {existingDays.length > 0 && (
          <div className="print-schedule-pages" style={{ counterReset: 'page' }}>
            {existingDays.map((dayInt, i) => (
              <DaySection
                key={dayInt}
                dayInt={dayInt}
                rows={scheduledRows[dayInt] || []}
                meta={activeVersion.dayMeta?.[dayInt]}
                scenes={scenes}
                showTimes={showTimes}
                showDurations={showDurations}
                chronoDay={chronoDayMap.get(dayInt)}
                ribbon={ribbon}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
export default PrintSchedule;
