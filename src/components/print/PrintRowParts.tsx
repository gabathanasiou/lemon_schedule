import React from 'react';
import { ScheduleRow, Scene, RibbonRow, RibbonCell, SceneColorEntry, ColorRule, SceneColorPalette } from '../../types';
import { getRibbonCellBaseStyle, getNoteBreakPad, sceneStyle, getCellBorderProps, computeMergeGroups, getDayHeaderColors, getDayFooterColors } from '../../lib/ribbonUtils';
import { RibbonCellText } from '../RibbonCellText';
import { formatDuration, formatPageCount, addMinutesToTime, formatDateLong } from '../../lib/utils';
import { ComputedRow, formatElapsedCaption } from '../../lib/daybreakUtils';
import type { CellBorders } from '../../lib/persist';

export interface PrintRowCtx {
  cells: RibbonCell[] | null;
  filteredWidths: number[];
  mainCellIdx: number | null;
  estColIdx: number;
  noteBreakPadPx: string;
  fmt: (prefix: string | undefined, val: string, suffix: string | undefined) => string;
  pageCountColIdx: number;
  pageCountCell: RibbonCell | null;
  durationColIdx: number;
  durationCell: RibbonCell | null;
  renderSceneCellFlex: (cell: RibbonCell, scene: Scene, computedCallTime?: string, estimatedDuration?: number, isLastInRow?: boolean, isLastRow?: boolean, textColor?: string, col?: number, row?: number, vSpan?: number, hSpan?: number) => React.ReactNode;
  showTimes: boolean;
  showDurations: boolean;
  cellPaddingV?: number;
  cellPaddingH?: number;
  edgePadding?: number;
  cellBorders?: CellBorders;
  ribbon?: RibbonRow[];
  filteredRibbon?: RibbonRow[];
  scenes: Scene[];
  sceneColors?: SceneColorEntry[];
  fallbackOverride?: { background: string; color: string };
  colorRules?: ColorRule[];
  colorPalette?: SceneColorPalette;
  chronoDay: number;
  dateStr?: string;
  callTime?: string;
  runningElapsed: number;
  totalPages: number;
  totalBreakTime: number;
}

export const PrintNoteRow: React.FC<{ r: ScheduleRow & Partial<ComputedRow>; ctx: PrintRowCtx }> = ({ r, ctx }) => {
  const { cells, filteredWidths, mainCellIdx, noteBreakPadPx, fmt, showTimes, showDurations, cellPaddingV, ribbon } = ctx;
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
};

export const PrintBreakRow: React.FC<{ r: ScheduleRow & Partial<ComputedRow>; ctx: PrintRowCtx }> = ({ r, ctx }) => {
  const { cells, filteredWidths, mainCellIdx, estColIdx, noteBreakPadPx, fmt, showTimes, showDurations, cellPaddingV, ribbon } = ctx;
  const elapsedCaption = formatElapsedCaption(r as ComputedRow);
  const showElapsed = elapsedCaption && (showTimes || showDurations);
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
          if (ci === estColIdx && showElapsed && cell.field !== 'duration') {
            const capAlign = cell.align === 'right' ? 'flex-end' : cell.align === 'left' ? 'flex-start' : 'center';
            return (
              <div key={cell.id} style={{
                gridColumn: ci + 1, gridRow: 1,
                padding: noteBreakPadPx,
                display: 'flex', flexDirection: 'column', alignItems: capAlign, justifyContent: 'center', gap: 1,
                overflow: 'visible',
                whiteSpace: 'normal',
                wordBreak: 'break-word',
                fontSize: '8pt', lineHeight: 1.1, fontFamily: 'Helvetica, sans-serif',
              }}>
                <span>{elapsedCaption}</span>
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
              {ci === estColIdx && showElapsed && (
                <div style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>{elapsedCaption}</div>
              )}
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
            {showTimes && <td className="print-col-call">{r.computedCallTime}{!showDurations && showElapsed ? <div>{elapsedCaption}</div> : null}</td>}
            {showDurations && <td className="print-col-dur">{formatDuration(r.breakDuration || 0)}{showElapsed ? <div>{elapsedCaption}</div> : null}</td>}
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
};

export const PrintDaybreakRow: React.FC<{ r: ScheduleRow & Partial<ComputedRow>; ctx: PrintRowCtx }> = ({ r, ctx }) => {
  const { cells, filteredWidths, mainCellIdx, noteBreakPadPx, fmt, showTimes, showDurations, cellPaddingV, ribbon, colorPalette } = ctx;
  const dh = getDayHeaderColors(colorPalette);
  const df = getDayFooterColors(colorPalette);
  const cr = r as ComputedRow;
  const sTotal = cr.sectionTotal || 0;
  const sPages = cr.sectionPages || 0;
  const sShoot = cr.sectionShoot || 0;
  const sBreak = cr.sectionBreak || 0;
  const sEndTime = cr.sectionEndTime || '';
  const sCallTime = cr.daybreakCallTime || '';

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
                    <span>{cr.daybreakLabel || 'End of Day'}</span>
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
            {showTimes && <td className="print-col-call">{sEndTime || cr.computedCallTime}</td>}
            {showDurations && <td className="print-col-dur">{sTotal > 0 ? formatDuration(sTotal) : ''}</td>}
            <td className="print-col-ie" />
            <td className="print-col-set" style={{textAlign: 'center'}}>{cr.daybreakLabel || 'End of Day'}</td>
            <td className="print-col-dn" />
            <td className="print-col-cast" />
            <td className="print-col-pgs" />
          </>
        </tr>
      </tbody>
    </table>
  );
};

export const PrintSceneRow: React.FC<{ r: ScheduleRow & Partial<ComputedRow>; ctx: PrintRowCtx }> = ({ r, ctx }) => {
  const { cells, filteredWidths, filteredRibbon, renderSceneCellFlex, showTimes, showDurations, edgePadding, scenes, sceneColors, fallbackOverride, colorRules } = ctx;
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
};

export const PrintSectionHeader: React.FC<{ ctx: PrintRowCtx }> = ({ ctx }) => {
  const { cells, filteredWidths, mainCellIdx, noteBreakPadPx, chronoDay, dateStr, callTime, colorPalette } = ctx;
  const dh = getDayHeaderColors(colorPalette);
  if (cells) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: filteredWidths.map(w => `${w}%`).join(' '), background: dh.background, color: dh.color, borderBottom: '2px solid #000' }}>
        {cells.map((cell, ci) => {
          if (ci === mainCellIdx) {
            return (
              <div key={cell.id} style={{
                gridColumn: ci + 1, gridRow: 1,
                ...getRibbonCellBaseStyle(cell, ctx.cellPaddingV, ctx.cellPaddingH, 1),
                textAlign: 'center', padding: noteBreakPadPx,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
              }}>
                <strong>START OF DAY {chronoDay}</strong>
                {dateStr && <span style={{ fontSize: '7pt', opacity: 0.8 }}>{formatDateLong(dateStr)}</span>}
              </div>
            );
          }
          if (cell.field === 'callTime') {
            return (
              <div key={cell.id} style={{
                gridColumn: ci + 1, gridRow: 1,
                ...getRibbonCellBaseStyle(cell, ctx.cellPaddingV, ctx.cellPaddingH, 1),
                textAlign: 'center', padding: noteBreakPadPx,
              }}>
                CALL {callTime || ''}
              </div>
            );
          }
          return (
            <div key={cell.id} style={{
              gridColumn: ci + 1, gridRow: 1,
              ...getRibbonCellBaseStyle(cell, ctx.cellPaddingV, ctx.cellPaddingH, 1),
              textAlign: 'center', padding: noteBreakPadPx,
            }} />
          );
        })}
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2px 6pt', background: dh.background, color: dh.color, borderBottom: '2px solid #000', fontSize: '8pt' }}>
      <strong>START OF DAY {chronoDay}</strong>
      {dateStr && <span>{formatDateLong(dateStr)}</span>}
      <span>CALL {callTime || ''}</span>
    </div>
  );
};

export const PrintSectionFooter: React.FC<{ ctx: PrintRowCtx }> = ({ ctx }) => {
  const { cells, filteredWidths, mainCellIdx, estColIdx, noteBreakPadPx, pageCountColIdx, pageCountCell, durationColIdx, durationCell, chronoDay, dateStr, callTime, runningElapsed, totalPages, totalBreakTime, cellPaddingV, cellPaddingH, edgePadding } = ctx;
  if (cells) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: filteredWidths.map(w => `${w}%`).join(' '), background: '#fff', color: '#18181b', paddingLeft: edgePadding ?? 2, paddingRight: edgePadding ?? 2 }}>
        {cells.map((cell, ci) => {
          if (ci === mainCellIdx) {
            return (
              <div key={cell.id} style={{
                gridColumn: ci + 1, gridRow: 1,
                ...getRibbonCellBaseStyle(cell, cellPaddingV, cellPaddingH, 1),
                textAlign: 'center', padding: noteBreakPadPx,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1,
              }}>
                <span>{`End of Day ${chronoDay}`}</span>
                {dateStr && <span style={{ fontSize: '7pt', opacity: 0.8 }}>{formatDateLong(dateStr)}</span>}
              </div>
            );
          }
          if (ci === pageCountColIdx && totalPages > 0 && pageCountCell) {
            return (
              <div key={cell.id} style={{
                gridColumn: ci + 1, gridRow: 1,
                ...getRibbonCellBaseStyle(pageCountCell, cellPaddingV, cellPaddingH, 1),
                padding: noteBreakPadPx,
                display: 'flex', flexDirection: 'column',
                alignItems: pageCountCell.align === 'right' ? 'flex-end' : pageCountCell.align === 'left' ? 'flex-start' : 'center',
                justifyContent: 'center', gap: 1,
              }}>
                <span style={{ fontSize: '7pt', opacity: 0.8 }}>Total:</span>
                <span style={{ fontSize: '8pt' }}>{formatPageCount(totalPages)} {pageCountCell.suffix || 'pgs'}</span>
              </div>
            );
          }
          if (ci === estColIdx && runningElapsed > 0) {
            const estCell = (estColIdx === durationColIdx && durationCell) ? durationCell : cell;
            const estAlign = estCell.align === 'right' ? 'flex-end' : estCell.align === 'left' ? 'flex-start' : 'center';
            return (
              <div key={cell.id} style={{
                gridColumn: ci + 1, gridRow: 1,
                ...getRibbonCellBaseStyle(estCell, cellPaddingV, cellPaddingH, 1),
                padding: noteBreakPadPx, display: 'flex', flexDirection: 'column', alignItems: estAlign, justifyContent: 'center', gap: 1,
              }}>
                <span style={{ fontSize: '8pt' }}>
                  EST: {formatDuration(runningElapsed - totalBreakTime)}{totalBreakTime > 0 ? <> + {formatDuration(totalBreakTime)} break</> : ''}
                </span>
              </div>
            );
          }
          if (cell.field === 'callTime') {
            return (
              <div key={cell.id} style={{
                gridColumn: ci + 1, gridRow: 1,
                ...getRibbonCellBaseStyle(cell, cellPaddingV, cellPaddingH, 1),
                textAlign: 'center', padding: noteBreakPadPx,
              }}>
                {addMinutesToTime(callTime || '08:00', runningElapsed)}
              </div>
            );
          }
          return (
            <div key={cell.id} style={{
              gridColumn: ci + 1, gridRow: 1,
              ...getRibbonCellBaseStyle(cell, cellPaddingV, cellPaddingH, 1),
              textAlign: 'center', padding: noteBreakPadPx,
            }} />
          );
        })}
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', color: '#18181b', padding: '2px 6pt', borderTop: '1pt solid #d4d4d8', fontSize: '7pt' }}>
      <span>End of Day #{chronoDay}{runningElapsed > 0 && <> · {addMinutesToTime(callTime || '08:00', runningElapsed)}</>}</span>
      {dateStr && <span>{formatDateLong(dateStr)}</span>}
      <span>{totalPages > 0 && <>{formatPageCount(totalPages)} pgs · </>}EST: {formatDuration(runningElapsed - totalBreakTime)}{totalBreakTime > 0 && <> + {formatDuration(totalBreakTime)} break</>}</span>
    </div>
  );
};
