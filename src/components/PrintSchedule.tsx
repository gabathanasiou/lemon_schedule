import React from 'react';
import { Project, ScheduleRow, Scene, ShootDayMeta } from '../types';
import { addMinutesToTime, formatDuration, formatPageCount } from '../lib/utils';

interface PrintScheduleProps {
  project: Project;
  showTimes: boolean;
  showDurations: boolean;
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
}

const DaySection: React.FC<DaySectionProps> = ({ dayInt, rows, meta, scenes, showTimes, showDurations }) => {
  let runningElapsed = 0;
  let totalPages = 0;

  const computedRows = rows.map(r => {
    const callTime = addMinutesToTime(meta?.unitCall || '08:00', runningElapsed);
    let dur = 0;
    if (r.type === 'SCENE') {
      dur = r.estimatedDuration || 0;
      const scene = scenes.find(s => s.id === r.sceneId);
      if (scene) totalPages += scene.pageCountDecimal;
    } else if (r.type === 'BREAK') {
      dur = r.breakDuration || 0;
    } else if (r.type === 'NOTE') {
      dur = r.estimatedDuration || 0;
    }
    runningElapsed += dur;
    return { ...r, computedCallTime: callTime, computedElapsed: runningElapsed };
  });

  return (
    <div className="print-day">
      <div className="print-day-header">
        <span className="print-day-number">DAY #{dayInt}</span>
        {meta?.date && <span className="print-day-date">{formatDateLong(meta.date)}</span>}
        <span className="print-day-call">CALL {meta?.unitCall || ''}</span>
      </div>

      {computedRows.map((r) => {
            if (r.type === 'NOTE') {
              return (
                <table key={r.id} className="print-table" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' } as any}>
                  <tbody>
                    <tr className="print-row-note">
                      <td className="print-col-sc" />
                      {showTimes && <td className="print-col-call">{r.computedCallTime}</td>}
                      {showDurations && <td className="print-col-dur">{r.estimatedDuration ? formatDuration(r.estimatedDuration) : ''}</td>}
                      <td className="print-col-ie" />
                      <td className="print-col-set" colSpan={3}>{r.noteText || ''}</td>
                      <td className="print-col-pgs" />
                    </tr>
                  </tbody>
                </table>
              );
            }
            if (r.type === 'BREAK') {
              return (
                <table key={r.id} className="print-table" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' } as any}>
                  <tbody>
                    <tr className="print-row-break">
                      <td className="print-col-sc" />
                      {showTimes && <td className="print-col-call">{r.computedCallTime}</td>}
                      {showDurations && <td className="print-col-dur">{formatDuration(r.breakDuration || 0)}</td>}
                      <td className="print-col-ie" />
                      <td className="print-col-set" colSpan={3}>{r.breakLabel || 'BREAK'}</td>
                      <td className="print-col-pgs" />
                    </tr>
                  </tbody>
                </table>
              );
            }
            const scene = scenes.find(s => s.id === r.sceneId);
            if (!scene) return null;
            const rowStyle = sceneStyle(scene);
            const bgColor = rowStyle.background || '#ffffff';
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
                    <td className="print-col-pgs">{scene.pageCount}</td>
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
        <span className="print-footer-end-label">End of Day #{dayInt}</span>
        {meta?.date && <span className="print-footer-date">{formatDateLong(meta.date)}</span>}
        <span className="print-footer-spacer" />
        <span>Total Pages: {formatPageCount(totalPages)}</span>
        <span>EST. TIME: {formatDuration(runningElapsed)}</span>
      </div>
    </div>
  );
}

const PRINT_STYLE = `
  @media print {
    html, body, #root {
      height: initial !important;
      overflow: initial !important;
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
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .print-title-section {
    text-align: center;
    padding-bottom: 10pt;
    margin-bottom: 10pt;
    border-bottom: 2pt solid #18181b;
  }
  .print-title {
    font-weight: 800;
    margin: 0;
    letter-spacing: 0.5pt;
  }
  .print-subtitle {
    color: #52525b;
    margin: 2pt 0 0 0;
  }
  .print-day {
    page-break-inside: auto;
  }
  .print-day-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #000000;
    color: #ffffff;
    padding: 8pt 10pt;
    font-weight: 700;
  }
  .print-day-number {
    letter-spacing: 1.5pt;
    flex: 0 0 auto;
  }
  .print-day-date {
    font-weight: 400;
    text-align: center;
    flex: 1;
  }
  .print-day-call {
    font-weight: 400;
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
  .print-col-sc { width: 20pt; text-align: center !important; font-weight: 700; }
  .print-col-call { width: 20pt; text-align: center !important; }
  .print-col-dur { width: 20pt; text-align: center !important; }
  .print-col-ie { width: 34pt; text-align: left !important; }
  .print-col-set { width: 120pt; text-align: left !important; text-transform: uppercase; }
  .print-col-dn { width: 40pt; text-align: left !important; }
  .print-col-cast { width: 56pt; text-align: left !important; }
  .print-col-pgs { width: 34pt; text-align: center !important; font-weight: 700; }

  .print-table .print-row-scene td,
  .print-table .print-row-desc td {
    border-right: 1px solid var(--td-border-color, #ffffff);
    border-bottom: 1px solid var(--td-border-color, #ffffff);
  }

  .print-table .print-row-note td,
  .print-table .print-row-break td {
    background: #591b1b;
    color: #ffffff;
    vertical-align: middle;
    padding-top: 9pt !important;
    padding-bottom: 9pt !important;
    border-right: 1px solid #591b1b;
    border-bottom: 1px solid #591b1b;
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
    font-weight: 700;
  }
  .print-footer-date {
    font-weight: 400;
    flex: 1;
    text-align: center;
  }
  .print-footer-spacer {
    flex: 1;
  }
`;

const PrintSchedule: React.FC<PrintScheduleProps> = ({ project, showTimes, showDurations }) => {
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
    ...(activeVersion.dayMeta ? Object.keys(activeVersion.dayMeta).map(Number) : [])
  ]));
  existingDays.sort((a, b) => a - b);

  return (
    <div>
      <style>{PRINT_STYLE}</style>
      <div className="print-root">
        <div className="print-title-section">
          <h1 className="print-title">{project.title || 'Production Schedule'}</h1>
          <p className="print-subtitle">Schedule Version: {activeVersion.name}</p>
        </div>

        {existingDays.map(dayInt => (
          <DaySection
            key={dayInt}
            dayInt={dayInt}
            rows={scheduledRows[dayInt] || []}
            meta={activeVersion.dayMeta?.[dayInt]}
            scenes={scenes}
            showTimes={showTimes}
            showDurations={showDurations}
          />
        ))}
      </div>
    </div>
  );
};
export default PrintSchedule;
