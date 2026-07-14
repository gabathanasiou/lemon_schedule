import React, { useMemo } from 'react';
import { Project, ScheduleRow, Scene, RibbonRow, RibbonCell, SceneColorEntry, ColorRule, SceneColorPalette } from '../types';
import { getFieldValue, getRibbonCellBaseStyle, formatCellText, getNoteBreakPad, sceneStyle, getCellBorderProps, getFallbackStripColors, computeMergeGroups, getDayHeaderColors, getDayFooterColors } from '../lib/ribbonUtils';
import { RibbonCellText } from './RibbonCellText';
import type { CellBorders, ViewMode } from '../lib/persist';
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
  cellPaddingV?: number;
  cellPaddingH?: number;
  edgePadding?: number;
  cellBorders?: CellBorders;
  viewMode?: ViewMode;
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
  edgePadding?: number;
  cellBorders?: CellBorders;
  sceneColors?: SceneColorEntry[];
  fallbackOverride?: { background: string; color: string };
  colorRules?: ColorRule[];
  colorPalette?: SceneColorPalette;
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

const DaySection: React.FC<DaySectionProps> = ({ dayInt, rows, callTime, dateStr, scenes, showTimes, showDurations, chronoDay, ribbon, colWidths, cellPaddingV, cellPaddingH, edgePadding, cellBorders, sceneColors, fallbackOverride, colorRules, colorPalette }) => {
  let runningElapsed = 0;
  let totalPages = 0;
  let totalBreakTime = 0;
  let sectionElapsed = 0;
  let sectionBaseTime = callTime || '08:00';
  let sectionStart = 0;
  let sectionPages = 0;
  let sectionShoot = 0;
  let sectionBreak = 0;

  const computedRows = rows.map(r => {
    const callTime = addMinutesToTime(sectionBaseTime, sectionElapsed);
    let dur = 0;

    if (r.type === 'DAYBREAK') {
      const sectionTotal = runningElapsed - sectionStart;
      const sectionEndTime = callTime;
      const row = {
        ...r,
        computedCallTime: callTime,
        computedElapsed: runningElapsed,
        sectionTotal,
        sectionPages,
        sectionShoot,
        sectionBreak,
        sectionEndTime,
      };
      sectionElapsed = 0;
      sectionBaseTime = r.daybreakCallTime || callTime || '08:00';
      sectionStart = runningElapsed;
      sectionPages = 0;
      sectionShoot = 0;
      sectionBreak = 0;
      return row;
    }

    if (r.type === 'SCENE') {
      dur = r.estimatedDuration || 0;
      const scene = scenes.find(s => s.id === r.sceneId);
      if (scene) {
        totalPages += scene.pageCountDecimal;
        sectionPages += scene.pageCountDecimal;
      }
      sectionShoot += dur;
    } else if (r.type === 'BREAK') {
      dur = r.breakDuration || 0;
      totalBreakTime += dur;
      sectionBreak += dur;
    } else if (r.type === 'NOTE') {
      dur = r.estimatedDuration || 0;
      sectionShoot += dur;
    }

    runningElapsed += dur;
    sectionElapsed += dur;

    return { ...r, computedCallTime: callTime, computedElapsed: runningElapsed };
  });

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

  const cellPrintStyle = (cell: RibbonCell, span = 1) => getRibbonCellBaseStyle(cell, cellPaddingV, cellPaddingH, span);

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
    return <div key={cell.id} style={style}><RibbonCellText cell={cell} span={span} cellPadding={cellPaddingV}>{display || ''}</RibbonCellText></div>;
  };


  return (
    <div className="print-day">
      {cells ? (
        <div style={{ display: 'grid', gridTemplateColumns: filteredWidths.map(w => `${w}%`).join(' '), background: '#000000', color: '#ffffff', borderBottom: '2px solid #000' }}>
          {cells.map((cell, ci) => {
            if (ci === mainCellIdx) {
              return (
                <div key={cell.id} style={{
                  gridColumn: ci + 1, gridRow: 1,
                  ...getRibbonCellBaseStyle(cell, cellPaddingV, cellPaddingH, 1),
                  textAlign: 'center', padding: noteBreakPadPx, overflow: 'visible',
                }}>
                  {dateStr ? formatDateLong(dateStr) : ''}
                </div>
              );
            }
            if (ci === 0) {
              return (
                <div key={cell.id} style={{
                  gridColumn: ci + 1, gridRow: 1,
                  ...getRibbonCellBaseStyle(cell, cellPaddingV, cellPaddingH, 1),
                  textAlign: 'center', padding: noteBreakPadPx, overflow: 'visible',
                }}>
                  DAY #{chronoDay}
                </div>
              );
            }
            if (cell.field === 'callTime') {
              return (
                <div key={cell.id} style={{
                  gridColumn: ci + 1, gridRow: 1,
                  ...getRibbonCellBaseStyle(cell, cellPaddingV, cellPaddingH, 1),
                  textAlign: 'center', padding: noteBreakPadPx, overflow: 'visible',
                }}>
                  CALL {callTime || ''}
                </div>
              );
            }
            return (
              <div key={cell.id} style={{
                gridColumn: ci + 1, gridRow: 1,
                ...getRibbonCellBaseStyle(cell, cellPaddingV, cellPaddingH, 1),
                textAlign: 'center', padding: noteBreakPadPx, overflow: 'visible',
              }} />
            );
          })}
        </div>
      ) : (
        <div className="print-day-header">
          <span className="print-day-number">DAY #{chronoDay}</span>
          {dateStr && <span className="print-day-date">{formatDateLong(dateStr)}</span>}
          <span className="print-day-call">CALL {callTime || ''}</span>
        </div>
      )}

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
                          textAlign: 'center',
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
                      <tr className="print-row-note" style={{ '--note-bg': noteBg, '--note-fg': noteFg, '--td-border-color': noteBg, '--note-row-py': `${getNoteBreakPad(cellPaddingV ?? 6, ribbon?.length || 1)}px` } as any}>
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
                          textAlign: 'center',
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
                    <tr className="print-row-break" style={{ '--note-row-py': `${getNoteBreakPad(cellPaddingV ?? 6, ribbon?.length || 1)}px` } as any}>
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
            if (r.type === 'DAYBREAK') {
              const dh = getDayHeaderColors(colorPalette);
              const df = getDayFooterColors(colorPalette);
              const sTotal = (r as any).sectionTotal || 0;
              const sPages = (r as any).sectionPages || 0;
              const sShoot = (r as any).sectionShoot || 0;
              const sBreak = (r as any).sectionBreak || 0;
              const sEndTime = (r as any).sectionEndTime || '';
              const sCallTime = (r as any).daybreakCallTime || '';

              if (cells) {
                const showStats = sTotal > 0;
                return (
                  <div key={r.id} style={{ pageBreakInside: 'avoid', breakInside: 'avoid', borderBottom: '2px solid #000' }}>
                    <div style={{ background: df.background, color: df.color }}>
                      <div style={{ display: 'grid', gridTemplateColumns: filteredWidths.map(w => `${w}%`).join(' ') }}>
                        {cells.map((cell, ci) => {
                          if (ci === mainCellIdx) {
                            return (
                              <div key={cell.id} style={{
                                gridColumn: ci + 1, gridRow: 1,
                                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1,
                                padding: noteBreakPadPx, textAlign: 'center',
                                overflow: 'visible', whiteSpace: 'normal', wordBreak: 'break-word',
                                fontSize: '8pt', lineHeight: 1.1, fontFamily: 'Helvetica, sans-serif',
                              }}>
                                <span>{(r as any).daybreakLabel || 'End of Day'}</span>
                                {showStats && (
                                  <span style={{ fontSize: '7pt', opacity: 0.75 }}>
                                    {formatPageCount(sPages)} pgs · {formatDuration(sShoot)} shoot{sBreak > 0 ? <span> + {formatDuration(sBreak)} break</span> : null}
                                  </span>
                                )}
                              </div>
                            );
                          }
                          let content = '';
                          if (cell.field === 'callTime') {
                            content = sEndTime || '';
                          } else if (cell.field === 'duration') {
                            content = sTotal > 0 ? formatDuration(sTotal) : '';
                          }
                          return (
                            <div key={cell.id} style={{
                              gridColumn: ci + 1, gridRow: 1,
                              padding: noteBreakPadPx, textAlign: 'center',
                              fontSize: '8pt', lineHeight: 1.1, fontFamily: 'Helvetica, sans-serif',
                            }}>
                              {content}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    {sCallTime && (
                      <div style={{ background: dh.background, color: dh.color }}>
                        <div style={{ display: 'grid', gridTemplateColumns: filteredWidths.map(w => `${w}%`).join(' ') }}>
                          {cells.map((cell, ci) => {
                            if (cell.field === 'callTime') {
                              return (
                                <div key={cell.id} style={{
                                  gridColumn: ci + 1, gridRow: 1,
                                  padding: '1px 4px', textAlign: 'center',
                                  fontSize: '8pt', lineHeight: 1.1, fontFamily: 'Helvetica, sans-serif',
                                }}>
                                  <span style={{ fontWeight: 600, fontSize: '10px' }}>CALL </span>
                                  {sCallTime}
                                </div>
                              );
                            }
                            return (
                              <div key={cell.id} style={{
                                gridColumn: ci + 1, gridRow: 1,
                                padding: '1px 4px',
                              }} />
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <table key={r.id} className="print-table" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' } as any}>
                  <tbody>
                    <tr className="print-row-break" style={{ '--note-row-py': `${getNoteBreakPad(cellPaddingV ?? 6, ribbon?.length || 1)}px`, background: df.background, color: df.color } as any}>
                      <>
                        <td className="print-col-sc" />
                        {showTimes && <td className="print-col-call">{sEndTime || (r as any).computedCallTime}</td>}
                        {showDurations && <td className="print-col-dur">{sTotal > 0 ? formatDuration(sTotal) : ''}</td>}
                        <td className="print-col-ie" />
                        <td className="print-col-set" style={{textAlign: 'center'}}>{(r as any).daybreakLabel || 'End of Day'}</td>
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
            const rowStyle = sceneStyle(scene, sceneColors, fallbackOverride, colorRules);
            const bgColor = rowStyle.background || '#ffffff';

            if (cells) {
              return (
                <div key={r.id} style={{ pageBreakInside: 'avoid', breakInside: 'avoid', borderBottom: '2px solid #000', paddingLeft: edgePadding ?? 2, paddingRight: edgePadding ?? 2, background: bgColor }}>
                  {filteredRibbon && filteredRibbon.length > 0 && (
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: filteredWidths.map(w => `${w}%`).join(' '),
                      gridTemplateRows: `${edgePadding ?? 2}px repeat(${filteredRibbon.length}, auto) ${edgePadding ?? 2}px`,
                      ...rowStyle,
                    }}>
                      {(() => {
                        const mgroups = computeMergeGroups(filteredRibbon);
                        const hiddenIds = new Set<string>();
                        for (const g of mgroups) {
                          if (g.direction === 'v') {
                            for (let ri = g.rowIndex + 1; ri < g.rowIndex + g.span; ri++) {
                              const cell = filteredRibbon[ri]?.cells[g.colIndex];
                              if (cell) hiddenIds.add(cell.id);
                            }
                          } else {
                            for (let ci = g.colIndex + 1; ci < g.colIndex + g.span; ci++) {
                              const cell = filteredRibbon[g.rowIndex]?.cells[ci];
                              if (cell) hiddenIds.add(cell.id);
                            }
                          }
                        }
                        const items: { cell: RibbonCell; col: number; row: number; vSpan: number; hSpan: number }[] = [];
                        for (let ri = 0; ri < filteredRibbon.length; ri++) {
                          for (let ci = 0; ci < filteredRibbon[ri].cells.length; ci++) {
                            const cell = filteredRibbon[ri].cells[ci];
                            if (hiddenIds.has(cell.id)) continue;
                            const g = mgroups.find(gg => gg.colIndex === ci && gg.rowIndex === ri);
                            const vSpan = g?.direction === 'v' ? (g.span || 1) : 1;
                            const hSpan = g?.direction === 'h' ? (g.span || 1) : 1;
                            items.push({ cell, col: ci, row: ri, vSpan, hSpan });
                          }
                        }
                        return items.map(({ cell, col, row, vSpan, hSpan }) => {
                          const isLastInRow = hSpan > 1 ? col + hSpan - 1 >= filteredRibbon[0].cells.length - 1 : col === filteredRibbon[0].cells.length - 1;
                          return renderSceneCellFlex(cell, scene, r.computedCallTime, r.estimatedDuration, isLastInRow, row + vSpan - 1 >= filteredRibbon.length - 1, rowStyle.color, col, row, vSpan, hSpan);
                        });
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

      {cells ? (
        <div className="print-day-footer" style={{ display: 'grid', gridTemplateColumns: filteredWidths.map(w => `${w}%`).join(' ') }}>
          {cells.map((cell, ci) => {
            if (ci === 0) {
              return (
                <div key={cell.id} style={{
                  gridColumn: ci + 1, gridRow: 1,
                  ...getRibbonCellBaseStyle(cell, cellPaddingV, cellPaddingH, 1),
                  textAlign: 'center', padding: `${cellPaddingV ?? 6}px ${cellPaddingH ?? 6}px`, overflow: 'visible',
                }}>
                  End of Day #{chronoDay}
                  {runningElapsed > 0 && <span> · {addMinutesToTime(callTime || '08:00', runningElapsed)}</span>}
                </div>
              );
            }
            if (ci === mainCellIdx) {
              return (
                <div key={cell.id} style={{
                  gridColumn: ci + 1, gridRow: 1,
                  ...getRibbonCellBaseStyle(cell, cellPaddingV, cellPaddingH, 1),
                  textAlign: 'center', padding: `${cellPaddingV ?? 6}px ${cellPaddingH ?? 6}px`, overflow: 'visible',
                }}>
                  {dateStr ? formatDateLong(dateStr) : ''}
                </div>
              );
            }
            return (
              <div key={cell.id} style={{
                gridColumn: ci + 1, gridRow: 1,
                ...getRibbonCellBaseStyle(cell, cellPaddingV, cellPaddingH, 1),
                textAlign: 'center', padding: `${cellPaddingV ?? 6}px ${cellPaddingH ?? 6}px`, overflow: 'visible',
              }} />
            );
          })}
          <div style={{ gridColumn: `1 / -1`, padding: `2px ${cellPaddingV ?? 6}px`, display: 'flex', justifyContent: 'flex-end', gap: 16 }}>
            {totalPages > 0 && <span>Total Pages: <strong>{formatPageCount(totalPages)} pgs</strong></span>}
            <span>EST. TIME: <strong>{formatDuration(runningElapsed - totalBreakTime)}</strong>{totalBreakTime > 0 && <span> + <strong>{formatDuration(totalBreakTime)}</strong></span>}</span>
          </div>
        </div>
      ) : (
        <div className="print-day-footer">
          <span className="print-footer-end-label">
            End of Day #{chronoDay}
            {runningElapsed > 0 && <span> · {addMinutesToTime(callTime || '08:00', runningElapsed)}</span>}
          </span>
          {dateStr && <span className="print-footer-date">{formatDateLong(dateStr)}</span>}
          <div className="print-footer-stats">
            {totalPages > 0 && <span>Total Pages: <strong>{formatPageCount(totalPages)} pgs</strong></span>}
            <span>EST. TIME: <strong>{formatDuration(runningElapsed - totalBreakTime)}</strong>{totalBreakTime > 0 && <span> + <strong>{formatDuration(totalBreakTime)}</strong></span>}</span>
          </div>
        </div>
      )}
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
  const sectionDateMap = (() => { const m = new Map<number, string>(); let c = startDate; for (let i = 0; i < sections.length; i++) { while (nonShootSet.has(c)) c = addDays(c, 1); m.set(i, c); c = addDays(c, 1); } return m; })();

  const sectionEntries = sections.map((s, secIdx) => ({
    sectionIndex: s.index,
    date: sectionDateMap.get(s.index) || '',
    rows: s.rows.filter(r => selectedDays.includes(s.index)),
    hasRows: s.rows.some(r => selectedDays.includes(s.index)),
  })).filter(e => e.hasRows && e.date);

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
                dayInt={e.sectionIndex}
                rows={e.rows}
                callTime={sections.find(s => s.index === e.sectionIndex)?.daybreakRow?.daybreakCallTime || '08:00'}
                dateStr={e.date}
                scenes={scenes}
                showTimes={showTimes}
                showDurations={showDurations}
                chronoDay={chronoDayMap.get(e.sectionIndex)}
                ribbon={ribbon}
                colWidths={colWidths}
                cellPaddingV={cellPaddingV}
                cellPaddingH={cellPaddingH}
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
