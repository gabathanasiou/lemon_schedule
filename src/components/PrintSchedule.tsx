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

  const contentColspan = 4; // I/E + SET + D/N + CAST

  return (
    <div className="print-day">
      <div className="print-day-header">
        <div className="print-day-header-left">
          <span className="print-day-number">DAY {dayInt}</span>
          {meta?.date && <span className="print-day-date">{meta.date}</span>}
        </div>
        <div className="print-day-header-right">
          {meta?.unitCall && <span>Call: {meta.unitCall}</span>}
        </div>
      </div>

      <table className="print-table">
        <thead>
          <tr>
            <th className="print-col-sc">SC #</th>
            {showTimes && <th className="print-col-call">CALL</th>}
            {showDurations && <th className="print-col-dur">DUR</th>}
            <th className="print-col-ie">I/E</th>
            <th className="print-col-set">SET</th>
            <th className="print-col-dn">D/N</th>
            <th className="print-col-cast">CAST</th>
            <th className="print-col-pgs">PGS</th>
          </tr>
        </thead>
          {computedRows.map((r) => {
            if (r.type === 'NOTE') {
              return (
                <tbody key={r.id} style={{ pageBreakInside: 'avoid' }}>
                  <tr className="print-row-note">
                    <td className="print-col-sc" />
                    {showTimes && <td className="print-col-call">{r.computedCallTime}</td>}
                    {showDurations && <td className="print-col-dur">{formatDuration(r.estimatedDuration || 0)}</td>}
                    <td colSpan={contentColspan} className="print-cell-note">{r.noteText || ''}</td>
                    <td className="print-col-pgs" />
                  </tr>
                </tbody>
              );
            }
            if (r.type === 'BREAK') {
              return (
                <tbody key={r.id} style={{ pageBreakInside: 'avoid' }}>
                  <tr className="print-row-break">
                    <td className="print-col-sc" />
                    {showTimes && <td className="print-col-call">{r.computedCallTime}</td>}
                    {showDurations && <td className="print-col-dur">{formatDuration(r.breakDuration || 0)}</td>}
                    <td colSpan={contentColspan} className="print-cell-break">{r.breakLabel || 'BREAK'}</td>
                    <td className="print-col-pgs" />
                  </tr>
                </tbody>
              );
            }
            const scene = scenes.find(s => s.id === r.sceneId);
            if (!scene) return null;
            const rowStyle = sceneStyle(scene);
            return (
              <tbody key={r.id} style={{ pageBreakInside: 'avoid' }}>
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
            );
          })}
      </table>

      <div className="print-day-footer">
        <span>Total Pages: <strong>{formatPageCount(totalPages)}</strong></span>
        <span className="print-footer-spacer">Shoot Time: <strong>{formatDuration(runningElapsed)}</strong></span>
        <span className="print-end-label">END OF DAY {dayInt}</span>
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
    font-size: 7pt;
    line-height: 1.2;
    color: #18181b;
    padding: 0;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .print-title-section {
    text-align: center;
    padding-bottom: 8pt;
    margin-bottom: 8pt;
    border-bottom: 1.5pt solid #18181b;
  }
  .print-title {
    font-size: 12pt;
    font-weight: 800;
    margin: 0;
    letter-spacing: 0.5pt;
  }
  .print-subtitle {
    font-size: 7pt;
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
    background: #27272a;
    color: #ffffff;
    padding: 4pt 8pt;
    font-weight: 700;
    font-size: 8pt;
  }
  .print-day-header-left {
    display: flex;
    align-items: center;
    gap: 8pt;
  }
  .print-day-number {
    background: #18181b;
    padding: 1.5pt 6pt;
    border-radius: 2pt;
    letter-spacing: 1pt;
  }
  .print-day-date {
    font-size: 7pt;
    font-weight: 400;
    opacity: 0.8;
  }
  .print-day-header-right {
    font-size: 7pt;
    opacity: 0.9;
  }
  .print-table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 0;
    font-size: 6.5pt;
  }
  .print-table thead th {
    background: #f4f4f5;
    padding: 3pt 4pt;
    text-align: left;
    font-weight: 700;
    font-size: 6pt;
    letter-spacing: 0.3pt;
    text-transform: uppercase;
    color: #18181b;
    white-space: nowrap;
  }
  .print-table tbody td {
    padding: 2pt 4pt;
    vertical-align: top;
  }
  .print-col-sc { width: 18pt; text-align: center !important; font-weight: 700; }
  .print-col-call { width: 28pt; text-align: center !important; font-size: 6.5pt; }
  .print-col-dur { width: 28pt; text-align: center !important; }
  .print-col-ie { width: 28pt; text-align: left !important; font-weight: 700; }
  .print-col-set { text-align: left !important; font-weight: 700; text-transform: uppercase; }
  .print-col-dn { width: 30pt; text-align: left !important; font-weight: 700; }
  .print-col-cast { width: 38pt; text-align: left !important; }
  .print-col-pgs { width: 22pt; text-align: center !important; font-weight: 700; }

  .print-row-note td { background: #7a2e2e; color: #ffffff; font-style: italic; }
  .print-cell-note { font-style: italic; font-size: 6.5pt; padding: 3pt 5pt !important; text-align: center !important; }
  .print-row-break td { background: #591b1b; color: #ffffff; }
  .print-cell-break { text-align: center !important; text-transform: uppercase; letter-spacing: 1pt; font-size: 6.5pt; padding: 3pt 5pt !important; }
  .print-row-desc td { padding-top: 0 !important; }
  .print-cell-desc { font-size: 6pt; opacity: 0.75; line-height: 1.3; }

  .print-day-footer {
    display: flex;
    justify-content: flex-start;
    align-items: center;
    background: #18181b;
    color: #ffffff;
    padding: 3pt 8pt;
    font-size: 6.5pt;
    gap: 16pt;
  }
  .print-end-label {
    margin-left: auto;
    background: #000000;
    padding: 1.5pt 8pt;
    letter-spacing: 1pt;
    font-weight: 700;
    font-size: 6pt;
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
