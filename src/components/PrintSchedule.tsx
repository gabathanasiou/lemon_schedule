import React, { useMemo } from 'react';
import { Project, ScheduleRow, Scene, ShootDayMeta, RibbonRow, RibbonCell, SceneColorEntry } from '../types';
import { getFieldValue, getRibbonCellBaseStyle, formatCellText, getNoteBreakPad, sceneStyle, getCellBorderProps, computeMergeGroups } from '../lib/ribbonUtils';
import { RibbonCellText } from './RibbonCellText';
import type { CellBorders } from '../lib/persist';
import { addMinutesToTime, formatDuration, formatPageCount } from '../lib/utils';

function filterIndices(cells: RibbonCell[], colWidths: number[], showTimes: boolean, showDurations: boolean): { keep: boolean[]; filteredWidths: number[] } {
  const keep: boolean[] = cells.map(c => {
    if (c.field === 'callTime' && !showTimes) return false;
    if (c.field === 'duration' && !showDurations) return false;
    return true;
  });
  if (keep.every(k => k)) return { keep, filteredWidths: colWidths };
  const filteredWidths: number[] = [];
  for (let i = 0; i < colWidths.length; i++) {
    if (keep[i]) filteredWidths.push(colWidths[i]);
  }
  if (filteredWidths.length === 0) return { keep, filteredWidths };
  const total = filteredWidths.reduce((s, w) => s + w, 0);
  if (total <= 0) return { keep, filteredWidths };
  const scale = 100 / total;
  for (let i = 0; i < filteredWidths.length; i++) {
    filteredWidths[i] = Math.round(filteredWidths[i] * scale * 100) / 100;
  }
  return { keep, filteredWidths };
}

function filterCells(cells: RibbonCell[], keep: boolean[]): RibbonCell[] {
  return cells.filter((_, i) => keep[i]);
}

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
  cellPadding?: number;
  edgePadding?: number;
  cellBorders?: CellBorders;
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
  colWidths?: number[];
  cellPadding?: number;
  edgePadding?: number;
  cellBorders?: CellBorders;
  sceneColors?: SceneColorEntry[];
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

const DaySection: React.FC<DaySectionProps> = ({ dayInt, rows, meta, scenes, showTimes, showDurations, chronoDay, ribbon, colWidths, cellPadding, edgePadding, cellBorders, sceneColors }) => {
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
        <div className="print-day-header">
          <span className="print-day-number">{meta.status === 'hold' ? 'HOLD' : meta.status === 'travel' ? 'TRAVEL' : 'HOLIDAY'}</span>
          {meta?.date && <span className="print-day-date">{formatDateLong(meta.date)}</span>}
          <span className="print-day-call" style={{visibility: 'hidden'}}>CALL 08:00</span>
        </div>
      </div>
    );
  }

  const rawCells = (ribbon && ribbon.length > 0) ? ribbon[0].cells : null;
  const cw = colWidths ?? [];
  const { keep, filteredWidths } = useMemo(() => rawCells ? filterIndices(rawCells, cw, showTimes, showDurations) : { keep: [] as boolean[], filteredWidths: [] as number[] }, [rawCells, cw, showTimes, showDurations]);
  const cells = useMemo(() => rawCells ? filterCells(rawCells, keep) : null, [rawCells, keep]);
  const filteredRibbon = useMemo(() => {
    if (!ribbon || keep.length === 0) return undefined;
    return ribbon.map(row => ({ ...row, cells: filterCells(row.cells, keep) }));
  }, [ribbon, keep]);
  const noteBreakPadPx = `${getNoteBreakPad(cellPadding ?? 6, ribbon?.length || 1)}px ${cellPadding ?? 6}px`;
  const mainCellIdx = cells ? (() => {
    const nonSpecial = cells
      .map((c, i) => ({i, w: filteredWidths[i] ?? 0, f: c.field}))
      .filter(x => x.f !== 'duration' && x.f !== 'callTime');
    return nonSpecial.length > 0
      ? nonSpecial.reduce((a, b) => a.w >= b.w ? a : b).i
      : cells.map((c, i) => ({i, w: filteredWidths[i] ?? 0})).reduce((a, b) => a.w >= b.w ? a : b, {i: 0, w: 0}).i;
  })() : null;

  const cellPrintStyle = (cell: RibbonCell, span = 1) => getRibbonCellBaseStyle(cell, cellPadding, span);

  const fmt = (prefix: string | undefined, val: string, suffix: string | undefined) =>
    formatCellText(prefix, val, suffix);

  const renderSceneCellFlex = (cell: RibbonCell, scene: Scene, computedCallTime?: string, estimatedDuration?: number, isLastInRow?: boolean, isLastRow?: boolean, textColor?: string, col?: number, row?: number, span?: number) => {
    const val = cell.field === 'text' ? (cell.textContent || '') : getFieldValue(cell.field, { ...scene, computedCallTime, estimatedDuration: estimatedDuration || 0 });
    const display = val ? fmt(cell.prefix, val, cell.suffix) : '';
    const style: React.CSSProperties = {
      ...cellPrintStyle(cell, span),
      ...getCellBorderProps(cellBorders, textColor || '#000', isLastInRow ?? true, isLastRow ?? true),
    };
    if (col !== undefined && row !== undefined) {
      style.gridColumn = col + 1;
      style.gridRow = span ? `${row + 1} / span ${span}` : row + 1;
    }
    return <div key={cell.id} style={style}><RibbonCellText cell={cell} span={span}>{display || ''}</RibbonCellText></div>;
  };


  return (
    <div className="print-day">
      <div className="print-day-header">
        <span className="print-day-number">DAY #{chronoDay}</span>
        {meta?.date && <span className="print-day-date">{formatDateLong(meta.date)}</span>}
        <span className="print-day-call">CALL {meta?.unitCall || ''}</span>
      </div>

      {computedRows.map((r) => {
            if (r.type === 'NOTE') {
              const noteBg = (r as any).noteColor || '#591b1b';
              const noteFg = (r as any).noteTextColor || '#ffffff';

              if (cells) {
                return (
                  <div key={r.id} style={{ pageBreakInside: 'avoid', breakInside: 'avoid', borderBottom: '2px solid #000', background: noteBg, color: noteFg }}>
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: filteredWidths.map(w => `${w}%`).join(' '),
                    }}>
                    {cells.map((cell, ci) => {
                      const wrapCell = ci === mainCellIdx;
                      if (wrapCell) {
                        return (
                          <div key={cell.id} style={{
                            gridColumn: ci + 1, gridRow: 1,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            padding: noteBreakPadPx,
                            textAlign: 'center',
                            overflow: 'visible',
                            whiteSpace: 'normal',
                            wordBreak: 'break-word',
                            fontSize: '8pt', lineHeight: 1.1, fontFamily: 'Helvetica, sans-serif',
                          }}>
                            {r.noteText || ''}
                          </div>
                        );
                      }
                      let content = '';
                      if (cell.field === 'callTime') {
                        const v = r.computedCallTime || '';
                        content = v ? fmt(cell.prefix, v, cell.suffix) : '';
                      } else if (cell.field === 'duration') {
                        const v = r.estimatedDuration ? formatDuration(r.estimatedDuration) : '';
                        content = v ? fmt(cell.prefix, v, cell.suffix) : '';
                      }
                      return (
                        <div key={cell.id} style={{
                          gridColumn: ci + 1, gridRow: 1,
                          padding: noteBreakPadPx,
                          fontSize: '8pt', lineHeight: 1.1, fontFamily: 'Helvetica, sans-serif',
                        }}>
                          {content}
                        </div>
                      );
                    })}
                    </div>
                   </div>
                 );
               }
               return (
                 <table key={r.id} className="print-table" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' } as any}>
                   <tbody>
                      <tr className="print-row-note" style={{ '--note-bg': noteBg, '--note-fg': noteFg, '--td-border-color': noteBg, '--note-row-py': `${getNoteBreakPad(cellPadding ?? 6, ribbon?.length || 1)}px` } as any}>
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
                return (
                  <div key={r.id} style={{ pageBreakInside: 'avoid', breakInside: 'avoid', borderBottom: '2px solid #000', background: '#591b1b', color: '#ffffff' }}>
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: filteredWidths.map(w => `${w}%`).join(' '),
                    }}>
                    {cells.map((cell, ci) => {
                      const wrapCell = ci === mainCellIdx;
                      if (wrapCell) {
                        return (
                          <div key={cell.id} style={{
                            gridColumn: ci + 1, gridRow: 1,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            padding: noteBreakPadPx,
                            textAlign: 'center',
                            overflow: 'visible',
                            whiteSpace: 'normal',
                            wordBreak: 'break-word',
                            fontSize: '8pt', lineHeight: 1.1, fontFamily: 'Helvetica, sans-serif',
                          }}>
                            {r.breakLabel || 'BREAK'}
                          </div>
                        );
                      }
                      let content = '';
                      if (cell.field === 'callTime') {
                        const v = r.computedCallTime || '';
                        content = v ? fmt(cell.prefix, v, cell.suffix) : '';
                      } else if (cell.field === 'duration') {
                        const v = r.breakDuration ? formatDuration(r.breakDuration) : '';
                        content = v ? fmt(cell.prefix, v, cell.suffix) : '';
                      }
                      return (
                        <div key={cell.id} style={{
                          gridColumn: ci + 1, gridRow: 1,
                          padding: noteBreakPadPx,
                          fontSize: '8pt', lineHeight: 1.1, fontFamily: 'Helvetica, sans-serif',
                        }}>
                          {content}
                        </div>
                      );
                    })}
                    </div>
                  </div>
                );
              }
              return (
                <table key={r.id} className="print-table" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' } as any}>
                  <tbody>
                    <tr className="print-row-break" style={{ '--note-row-py': `${getNoteBreakPad(cellPadding ?? 6, ribbon?.length || 1)}px` } as any}>
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
            const rowStyle = sceneStyle(scene, sceneColors);
            const bgColor = rowStyle.background || '#ffffff';

            if (cells) {
              return (
                <div key={r.id} style={{ pageBreakInside: 'avoid', breakInside: 'avoid', borderBottom: '2px solid #000', paddingTop: edgePadding ?? 2, paddingBottom: edgePadding ?? 2, paddingLeft: edgePadding ?? 2, paddingRight: edgePadding ?? 2, background: bgColor }}>
                  {filteredRibbon && filteredRibbon.length > 0 && (
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: filteredWidths.map(w => `${w}%`).join(' '),
                      gridTemplateRows: `repeat(${filteredRibbon.length}, auto)`,
                      ...rowStyle,
                    }}>
                      {(() => {
                        const mgroups = computeMergeGroups(filteredRibbon);
                        const hiddenIds = new Set<string>();
                        for (const g of mgroups) {
                          for (let ri = g.rowIndex + 1; ri < g.rowIndex + g.span; ri++) {
                            const cell = filteredRibbon[ri]?.cells[g.colIndex];
                            if (cell) hiddenIds.add(cell.id);
                          }
                        }
                        const items: { cell: RibbonCell; col: number; row: number; span: number }[] = [];
                        for (let ri = 0; ri < filteredRibbon.length; ri++) {
                          for (let ci = 0; ci < filteredRibbon[ri].cells.length; ci++) {
                            const cell = filteredRibbon[ri].cells[ci];
                            if (hiddenIds.has(cell.id)) continue;
                            const g = mgroups.find(gg => gg.colIndex === ci && gg.rowIndex === ri);
                            items.push({ cell, col: ci, row: ri, span: g ? g.span : 1 });
                          }
                        }
                        return items.map(({ cell, col, row, span }) => renderSceneCellFlex(cell, scene, r.computedCallTime, r.estimatedDuration, col === filteredRibbon[0].cells.length - 1, row + span - 1 >= filteredRibbon.length - 1, rowStyle.color, col, row, span));
                      })()}
                    </div>
                  )}
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
        {meta?.date && <span className="print-footer-date">{formatDateLong(meta.date)}</span>}
        <div className="print-footer-stats">
          <span>Total Pages: <strong>{formatPageCount(totalPages)} pgs</strong></span>
          <span>EST. TIME: <strong>{formatDuration(runningElapsed - totalBreakTime)}</strong>{totalBreakTime > 0 && <span> + <strong>{formatDuration(totalBreakTime)}</strong></span>}</span>
        </div>
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

const PrintSchedule: React.FC<PrintScheduleProps> = ({ project, showTimes, showDurations, showCastList, showExportDate, showPageNumbers, selectedDays, includeStatusDays, fileName, ribbon, colWidths, cellPadding, edgePadding, cellBorders }) => {
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
        <style>{`@page { @bottom-right { content: counter(page); font-family: Helvetica, sans-serif; font-size: 8pt; } }`}</style>
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
                colWidths={colWidths}
                cellPadding={cellPadding}
                edgePadding={edgePadding}
                cellBorders={cellBorders}
                sceneColors={project.colorPalette?.sceneColors}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
export default PrintSchedule;
