import React, { useMemo } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useProject } from '../store';
import { addMinutesToTime, formatDuration, formatPageCount, formatDateLong } from '../lib/utils';
import { SortableRow } from './SortableRow';
import { CellInput } from './CellInput';
import { ViolationTooltip } from './ViolationTooltip';
import { Trash2, Flag } from 'lucide-react';
import { ScheduleRow, ShootDayMeta, Scene, RibbonRow, SceneColorPalette, RuleViolation } from '../types';
import { CellBorders } from '../lib/persist';
import { getFieldValue, FIELD_MAP, resolveSceneColor, getDayHeaderColors, getNoteBannerColors, computeMergeGroups, getRibbonCellBaseStyle, getNoteBreakPad } from '../lib/ribbonUtils';
import { checkDay } from '../lib/rulesEngine';

function getSceneCardStyle(scene?: Scene | null, palette?: SceneColorPalette): React.CSSProperties {
  if (!scene) return { background: '#ffffff', color: '#18181b' };
  return resolveSceneColor(scene.intExt || '', scene.dayNight || '', palette?.sceneColors);
}

const GhostCard: React.FC<{ row: ScheduleRow, scenes: Scene[]; compact?: boolean; ribbon?: RibbonRow[]; colWidths?: number[]; palette?: SceneColorPalette }> = ({ row, scenes, compact, ribbon, colWidths, palette }) => {
  const h = compact ? 'min-h-[30px]' : 'min-h-[44px]';
  const sz = compact ? 'text-[7pt]' : '';
  const noteColors = getNoteBannerColors(palette);
  if (row.type === 'NOTE') {
    const bg = row.noteColor || noteColors.background;
    const fg = row.noteTextColor || noteColors.color;
    return (
      <div className={`opacity-30 flex items-stretch ${h} border-b shrink-0 ${sz}`} style={{ background: bg, color: fg }}>
        <div className="flex-1 flex items-center justify-center px-3 italic">{row.noteText || 'Note'}</div>
      </div>
    );
  }

  if (row.type === 'BREAK') {
    return (
      <div className={`opacity-30 flex items-stretch ${h} border-b shrink-0 ${sz}`} style={{ background: noteColors.background, color: noteColors.color }}>
        <div className="flex-1 flex items-center justify-center px-3">{row.breakLabel || 'BREAK'}</div>
      </div>
    );
  }

  const scene = scenes.find(s => s.id === row.sceneId);
  if (!scene) return null;

  if (ribbon && ribbon.length > 0 && ribbon[0].cells.length > 0) {
    const cw = colWidths ?? [];
    const sc = getSceneCardStyle(scene, palette);
    const mgroups = computeMergeGroups(ribbon);
    const hiddenIds = new Set<string>();
    for (const g of mgroups) {
      if (g.direction === 'v') {
        for (let ri = g.rowIndex + 1; ri < g.rowIndex + g.span; ri++) {
          const cell = ribbon[ri]?.cells[g.colIndex];
          if (cell) hiddenIds.add(cell.id);
        }
      } else {
        for (let ci = g.colIndex + 1; ci < g.colIndex + g.span; ci++) {
          const cell = ribbon[g.rowIndex]?.cells[ci];
          if (cell) hiddenIds.add(cell.id);
        }
      }
    }
    const items: { cell: RibbonRow['cells'][0]; col: number; ri: number; vSpan: number; hSpan: number }[] = [];
    for (let ri = 0; ri < ribbon.length; ri++) {
      for (let ci = 0; ci < ribbon[ri].cells.length; ci++) {
        const cell = ribbon[ri].cells[ci];
        if (hiddenIds.has(cell.id)) continue;
        const g = mgroups.find(gg => gg.colIndex === ci && gg.rowIndex === ri);
        const vSpan = g?.direction === 'v' ? (g.span || 1) : 1;
        const hSpan = g?.direction === 'h' ? (g.span || 1) : 1;
        items.push({ cell, col: ci, ri, vSpan, hSpan });
      }
    }
    return (
      <div className={`opacity-30 flex items-stretch border-b shrink-0 ${h} ${sz}`}
        style={{ ...sc, fontFamily: 'Helvetica, sans-serif', fontSize: compact ? '7pt' : '8pt', lineHeight: '1.1' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: cw.map(w => `${w}%`).join(' '),
          gridTemplateRows: `repeat(${ribbon.length}, auto)`,
          width: '100%',
        }}>
          {items.map(({ cell, col, ri, vSpan, hSpan }) => {
            const span = vSpan || 1;
            const val = cell.field === 'text' ? (cell.textContent || '') : getFieldValue(cell.field, { ...scene, computedCallTime: row.computedCallTime, estimatedDuration: row.estimatedDuration || 0 });
            const label = FIELD_MAP[cell.field]?.label || cell.field;
            const display = val ? `${cell.prefix || ''}${cell.prefix && val ? '\u00A0' : ''}${val}${cell.suffix && val ? '\u00A0' : ''}${cell.suffix || ''}` : label;
            return (
              <div key={cell.id} style={{
                gridColumn: (hSpan && hSpan > 1) ? `${col + 1} / span ${hSpan}` : col + 1,
                gridRow: span > 1 ? `${ri + 1} / span ${span}` : ri + 1,
                padding: compact ? '3pt 3pt' : '4pt 4pt',
                borderRight: '1px solid rgba(0,0,0,0.15)',
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                textOverflow: 'ellipsis',
                textAlign: cell.align || 'left',
                fontWeight: cell.field === 'sceneNumber' ? 700 : 500,
                fontStyle: val ? 'normal' : 'italic',
              }}>
                {display || ''}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className={`opacity-30 flex items-stretch border-b shrink-0 ${h} ${sz}`} style={getSceneCardStyle(scene, palette)}>
      <div className={`flex items-center justify-center shrink-0 px-1 border-r border-black/10 ${compact ? 'w-[30px]' : 'w-[50px]'}`}>{scene.sceneNumber}</div>
      <div className="flex-1 flex items-center px-3 gap-1 min-w-0">
        <span className="uppercase shrink-0">{scene.intExt}.</span>
        <span className="uppercase truncate">{scene.set}</span>
        <span className="opacity-50 shrink-0">-</span>
        <span className="uppercase shrink-0">{scene.dayNight}</span>
      </div>
    </div>
  );
};

export const StackedGhosts: React.FC<{ rows: ScheduleRow[]; scenes: Scene[]; ribbon?: RibbonRow[]; colWidths?: number[]; palette?: SceneColorPalette }> = ({ rows, scenes, ribbon, colWidths, palette }) => {
  if (rows.length === 0) return null;
  if (rows.length === 1) return <GhostCard row={rows[0]} scenes={scenes} ribbon={ribbon} colWidths={colWidths} palette={palette} />;
  const maxShow = Math.min(rows.length, 5);
  const rest = rows.length - maxShow;
  return (
    <div className="flex flex-col shrink-0">
      {rows.slice(0, maxShow).map((r, i) => (
        <GhostCard key={r.id} row={r} scenes={scenes} compact ribbon={ribbon} colWidths={colWidths} palette={palette} />
      ))}
      {rest > 0 && (
        <div className="opacity-30 flex items-center justify-center min-h-[30px] bg-zinc-100 text-zinc-500 text-[10px] font-bold border-b shrink-0">
          +{rest} more
        </div>
      )}
    </div>
  );
};

const dayBlockPropsEqual = (a: any, b: any) => {
  if (a.dayInt !== b.dayInt) return false;
  if (a.rows !== b.rows) return false;
  if (a.meta !== b.meta) return false;
  if (a.selectedIds !== b.selectedIds) return false;
  if (a.activeDragIds !== b.activeDragIds) return false;
  if (a.textEditingEnabled !== b.textEditingEnabled) return false;
  if (a.insertBeforeId !== b.insertBeforeId) return false;
  if (a.activeRowId !== b.activeRowId) return false;
  if (a.activeDragRow !== b.activeDragRow) return false;
  if (a.activeDragRows !== b.activeDragRows) return false;
  if (a.chronoDay !== b.chronoDay) return false;
  if (a.focusedRowId !== b.focusedRowId) return false;
  if (a.ribbon !== b.ribbon || a.colWidths !== b.colWidths) return false;
  if (a.cellPaddingV !== b.cellPaddingV || a.cellPaddingH !== b.cellPaddingH) return false;
  if (a.edgePadding !== b.edgePadding || a.cellBorders !== b.cellBorders) return false;
  return true;
};

export const DayBlock: React.FC<{ dayInt: number, rows: ScheduleRow[], meta?: ShootDayMeta, selectedIds?: Set<string>, activeDragIds?: Set<string>, onRowClick?: (id: string, e: React.MouseEvent) => void, textEditingEnabled: boolean, insertBeforeId?: string | null, activeRowId?: string | null, activeDragRow?: ScheduleRow | null, activeDragRows?: ScheduleRow[], chronoDay?: number, focusedRowId?: string | null, onRowDoubleClick?: (id: string) => void, onRowNavigate?: (rowId: string) => void, ribbon?: RibbonRow[], colWidths?: number[], cellPaddingV?: number, cellPaddingH?: number, edgePadding?: number, cellBorders?: CellBorders }> = React.memo(({ dayInt, rows, meta, selectedIds = new Set(), activeDragIds = new Set(), onRowClick, textEditingEnabled, insertBeforeId, activeRowId, activeDragRow, activeDragRows = [], chronoDay, focusedRowId, onRowDoubleClick, onRowNavigate, ribbon, colWidths, cellPaddingV, cellPaddingH, edgePadding, cellBorders }) => {
  const displayDay = chronoDay ?? dayInt;
  const isStatusDay = !!(meta?.status && meta.status !== 'work');
  const showGhosts = activeRowId && activeDragRows.length > 0;
  const { state, dispatch } = useProject();
  const project = state.present;
  const activeVersion = project.versions.find(v => v.id === project.activeVersionId);

  const { setNodeRef: setDropRef } = useDroppable({
    id: `day-${dayInt}`,
    data: { type: 'DAY_DROPZONE', dayInt }
  });

  const { setNodeRef: setFooterRef } = useDroppable({
    id: `end-${dayInt}`,
    data: { type: 'DAY_END', dayInt }
  });

  const violations = useMemo(() => {
    if (!activeVersion) return [];
    return checkDay(dayInt, project.rules || [], project.scenes, activeVersion.rows, activeVersion.dayMeta, project.castMembers || []);
  }, [dayInt, project.rules, project.scenes, project.castMembers, activeVersion]);
    const sceneViolationMap = useMemo(() => {
    const map = new Map<string, RuleViolation[]>();
    for (const v of violations) {
      for (const sid of (v.sceneIds || (v.sceneId ? [v.sceneId] : []))) {
        if (!map.has(sid)) map.set(sid, []);
        map.get(sid)!.push(v);
      }
    }
    return map;
  }, [violations]);

  const updateMeta = (updates: Partial<ShootDayMeta>) => {
    if (!activeVersion) return;
    dispatch({
      type: 'UPDATE_VERSION',
      payload: {
        id: activeVersion.id,
        dayMeta: {
          ...activeVersion.dayMeta,
          [dayInt]: { ...(activeVersion.dayMeta[dayInt] || { unitCall: '08:00', date: '' }), ...updates }
        }
      }
    });
  };

  const { computedRows, totalPages, totalShootTime, totalBreakTime, runningElapsed } = useMemo(() => {
    let runningElapsed = 0;
    let totalPages = 0;
    let totalBreakTime = 0;
    const computedRows = rows.map(r => {
      const callTime = addMinutesToTime(meta?.unitCall || '08:00', runningElapsed);
      let dur = 0;
      
      if (r.type === 'SCENE') {
        dur = r.estimatedDuration || 0;
        const scene = project.scenes.find(s => s.id === r.sceneId);
        if (scene) totalPages += scene.pageCountDecimal;
      } else if (r.type === 'BREAK') {
        dur = r.breakDuration || 0;
        totalBreakTime += dur;
      } else if (r.type === 'NOTE') {
        dur = r.estimatedDuration || 0;
      }

      runningElapsed += dur;

      return {
        ...r,
        computedCallTime: callTime,
        computedElapsed: runningElapsed
      };
    });
    return { computedRows, totalPages, totalShootTime: runningElapsed - totalBreakTime, totalBreakTime, runningElapsed };
  }, [rows, meta?.unitCall, project.scenes]);

  const baseStyle = {
    fontFamily: 'Helvetica, sans-serif',
    fontSize: '8pt',
    lineHeight: '1.2',
  };

  const dhColors = getDayHeaderColors(project.colorPalette);

  // Ribbon column layout for header/footer
  const ribbonActive = !!(ribbon && ribbon.length > 0);
  const cells = ribbonActive ? ribbon![0].cells : null;
  const cw = colWidths ?? cells?.map(() => 100 / (cells.length || 1)) ?? [];
  const cpv = cellPaddingV ?? 6;
  const cph = cellPaddingH ?? 6;
  const hPad = `${getNoteBreakPad(cpv, ribbon?.length || 1)}px ${cph}px`;
  const mainCellIdx = cells ? (() => {
    const nonSpecial = cells
      .map((c, i) => ({i, w: cw[i] ?? 0, f: c.field}))
      .filter(x => x.f !== 'duration' && x.f !== 'callTime');
    return nonSpecial.length > 0
      ? nonSpecial.reduce((a, b) => a.w >= b.w ? a : b).i
      : cells.map((c, i) => ({i, w: cw[i] ?? 0})).reduce((a, b) => a.w >= b.w ? a : b, {i: 0, w: 0}).i;
  })() : null;
  const labelCellIdx = cells ? cells.findIndex(c => c.field !== 'duration' && c.field !== 'callTime') : -1;

  const renderRibbonHeader = (statusLabel?: string) => {
    if (!cells || mainCellIdx == null) return null;
    const label = statusLabel || `DAY #${displayDay}`;
    const dateStr = meta?.date ? formatDateLong(meta.date) : '';
    return (
      <div className="flex-1 min-w-0 flex flex-col relative" style={{ paddingLeft: edgePadding ?? 2, paddingRight: edgePadding ?? 2 }}>
        {violations.length > 0 && (
          <div className="absolute top-0 right-0 p-1 z-10">
            <ViolationTooltip violations={violations}>
              <span className="inline-flex items-center gap-0.5 text-red-400">
                <Flag className="w-3.5 h-3.5 fill-red-400" />
                <span className="text-[10px] font-bold">{violations.length}</span>
              </span>
            </ViolationTooltip>
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: cw.map(w => `${w}%`).join(' ') }}>
          {cells.map((cell, ci) => {
            if (ci === mainCellIdx) {
              return (
                <div key={cell.id} style={{
                  gridColumn: ci + 1, gridRow: 1,
                  ...getRibbonCellBaseStyle(cell, cpv, cph, 1),
                  textAlign: 'center', padding: hPad, overflow: 'visible',
                  whiteSpace: 'normal', wordBreak: 'break-word',
                }}>
                  <strong>{dateStr}</strong>
                </div>
              );
            }
            if (ci === labelCellIdx) {
              return (
                <div key={cell.id} style={{
                  gridColumn: ci + 1, gridRow: 1,
                  ...getRibbonCellBaseStyle(cell, cpv, cph, 1),
                  textAlign: 'center', padding: hPad, overflow: 'visible',
                }}>
                  <span className="font-bold">{label}</span>
                </div>
              );
            }
            if (cell.field === 'callTime') {
              return (
                <div key={cell.id} style={{
                  gridColumn: ci + 1, gridRow: 1,
                  ...getRibbonCellBaseStyle(cell, cpv, cph, 1),
                  textAlign: 'center', padding: hPad, overflow: 'visible',
                }}>
                  {!statusLabel && (
                    <>
                      <span className="font-semibold text-[10px]">CALL </span>
                      <CellInput
                        value={meta?.unitCall || '08:00'}
                        onChange={val => updateMeta({unitCall: val})}
                        clearOnType col="duration"
                        className="bg-zinc-800 px-1.5 py-0.5 border border-transparent focus-within:border-zinc-500 text-center"
                      />
                    </>
                  )}
                </div>
              );
            }
            return (
              <div key={cell.id} style={{
                gridColumn: ci + 1, gridRow: 1,
                ...getRibbonCellBaseStyle(cell, cpv, cph, 1),
                textAlign: 'center', padding: hPad, overflow: 'visible',
              }} />
            );
          })}
        </div>
      </div>
    );
  };

  const renderRibbonFooter = () => {
    if (!cells || mainCellIdx == null) return null;
    const endTime = runningElapsed > 0 ? addMinutesToTime(meta?.unitCall || '08:00', runningElapsed) : '';
    const dateStr = meta?.date ? formatDateLong(meta.date) : '';
    return (
      <div ref={setFooterRef} style={{ fontFamily: 'Helvetica, sans-serif', fontSize: '8pt', borderTop: '1px solid var(--border, #d4d4d8)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: cw.map(w => `${w}%`).join(' ') }}>
          {cells.map((cell, ci) => {
            if (ci === labelCellIdx) {
              return (
                <div key={cell.id} style={{
                  gridColumn: ci + 1, gridRow: 1,
                  ...getRibbonCellBaseStyle(cell, cpv, cph, 1),
                  textAlign: 'center', overflow: 'hidden',
                  whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                }}>
                  End of Day #{displayDay}
                  {endTime && <span> · {endTime}</span>}
                </div>
              );
            }
            if (ci === mainCellIdx) {
              return (
                <div key={cell.id} style={{
                  gridColumn: ci + 1, gridRow: 1,
                  ...getRibbonCellBaseStyle(cell, cpv, cph, 1),
                  textAlign: 'center',
                }}>
                  {dateStr}
                </div>
              );
            }
            return (
              <div key={cell.id} style={{
                gridColumn: ci + 1, gridRow: 1,
                ...getRibbonCellBaseStyle(cell, cpv, cph, 1),
                textAlign: 'center',
              }} />
            );
          })}
        </div>
        <div style={{ padding: `2px ${cpv}px`, display: 'flex', justifyContent: 'flex-end', gap: 16, color: '#18181b' }}>
          <span>Total Pages: <strong>{formatPageCount(totalPages)} pgs</strong></span>
          <span>EST. TIME: <strong>{formatDuration(totalShootTime)}</strong>{totalBreakTime > 0 && <span> + <strong>{formatDuration(totalBreakTime)}</strong></span>}</span>
        </div>
      </div>
    );
  };

  if (isStatusDay) {
    const statusLabel = meta?.status === 'hold' ? 'HOLD' : meta?.status === 'travel' ? 'TRAVEL' : 'HOLIDAY';
    if (ribbonActive) {
      return (
        <div style={baseStyle} className="bg-white flex flex-col border-[2px] border-black border-b-dashed border-b-zinc-300">
          <div style={{ background: dhColors.background, color: dhColors.color }}>
            {renderRibbonHeader(statusLabel)}
          </div>
        </div>
      );
    }
    return (
      <div style={baseStyle} className="bg-white flex flex-col border-[2px] border-black border-b-dashed border-b-zinc-300">
        <div style={{ background: dhColors.background, color: dhColors.color }}>
          <table className="schedule-table">
            <tbody>
              <tr className="day-header-row" data-row-id={`empty-${dayInt}`} data-shoot-day={dayInt}
                onClick={(e) => { e.stopPropagation(); onRowClick?.(`empty-${dayInt}`, e as any); }}
                style={{background: selectedIds.has(`empty-${dayInt}`) ? '#27272a' : undefined, outline: 'none'}}>
                <td className="col-sc" style={{textAlign: 'left'}}>
                  <span className="font-bold" style={{paddingLeft: 4}}>{statusLabel}</span>
                </td>
                <td className="col-call">
                  {violations.length > 0 && (
                    <ViolationTooltip violations={violations}>
                      <span className="inline-flex items-center gap-0.5 text-red-400">
                        <Flag className="w-3.5 h-3.5 fill-red-400" />
                        <span className="text-[10px] font-bold">{violations.length}</span>
                      </span>
                    </ViolationTooltip>
                  )}
                  <span style={{visibility: 'hidden'}}>CALL</span>
                </td>
                <td className="col-dur" />
                <td className="col-ie" />
                <td className="col-set text-center font-semibold">
                  {meta?.date ? formatDateLong(meta.date) : ''}
                </td>
                <td className="col-dn" />
                <td className="col-cast" />
                <td className="col-pgs" />
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div style={baseStyle} className="bg-white flex flex-col border-[2px] border-black">
      
      {/* Day Ribbon Banner */}
      <div style={{ background: dhColors.background, color: dhColors.color }}>
        {ribbonActive ? renderRibbonHeader() : (
          <table className="schedule-table">
            <tbody>
              <tr className="day-header-row" data-row-id={`empty-${dayInt}`} data-shoot-day={dayInt}
                onClick={(e) => { e.stopPropagation(); onRowClick?.(`empty-${dayInt}`, e as any); }}
                style={{background: selectedIds.has(`empty-${dayInt}`) ? '#27272a' : undefined, outline: 'none'}}>
                <td className="col-sc" style={{textAlign: 'left'}}>
                  <span className="font-bold" style={{paddingLeft: 4}}>DAY #{displayDay}</span>
                </td>
                <td className="col-call">
                  {violations.length > 0 && (
                    <ViolationTooltip violations={violations}>
                      <span className="inline-flex items-center gap-0.5 text-red-400">
                        <Flag className="w-3.5 h-3.5 fill-red-400" />
                        <span className="text-[10px] font-bold">{violations.length}</span>
                      </span>
                    </ViolationTooltip>
                  )}
                  <button 
                    onClick={() => { dispatch({ type: 'UNSCHEDULE_DAY', day: dayInt }); }}
                    className="opacity-40 hover:opacity-100 hover:text-red-400 transition-colors ml-1"
                    title="Remove all scenes from this day"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
                <td className="col-dur" />
                <td className="col-ie" />
                <td className="col-set text-center font-semibold">
                  {meta?.date ? formatDateLong(meta.date) : ''}
                </td>
                <td className="col-dn" />
                <td className="col-cast">
                  <span className="font-semibold text-[10px] text-zinc-400">CALL</span>
                </td>
                <td className="col-pgs">
                  <CellInput
                    value={meta?.unitCall || '08:00'}
                    onChange={val => updateMeta({unitCall: val})}
                    clearOnType
                    col="duration"
                    className="bg-zinc-900 px-1.5 py-0.5 border border-transparent focus-within:border-zinc-600 w-full text-center"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        )}

      </div>

      <div ref={setDropRef} className="flex flex-col min-h-0 bg-white items-stretch relative">
        {showGhosts && insertBeforeId === `day-${dayInt}` && (
          <StackedGhosts rows={activeDragRows} scenes={project.scenes} ribbon={ribbon} colWidths={colWidths} palette={project.colorPalette} />
        )}
        <SortableContext items={React.useMemo(() => rows.map(r => r.id), [rows])} strategy={verticalListSortingStrategy}>
          {computedRows.map((r) => {
            return (
              <React.Fragment key={r.id}>
                {showGhosts && insertBeforeId === r.id && (
                  <StackedGhosts rows={activeDragRows} scenes={project.scenes} ribbon={ribbon} colWidths={colWidths} palette={project.colorPalette} />
                )}
                  <SortableRow 
                    row={r} 
                    scenes={project.scenes} 
                    isSelected={selectedIds.has(r.id)}
                    isFaded={activeDragIds.has(r.id)}
                    onSelectToggle={(e) => onRowClick?.(r.id, e)}
                    textEditingEnabled={textEditingEnabled}
                    sceneViolations={sceneViolationMap.get(r.sceneId || '')}
                    focusedRowId={focusedRowId}
                    onDoubleClick={onRowDoubleClick}
                    onRowNavigate={onRowNavigate}
                    ribbon={ribbon}
                    colWidths={colWidths}
                    cellPaddingV={cellPaddingV} cellPaddingH={cellPaddingH}
                    edgePadding={edgePadding}
                    cellBorders={cellBorders}
                  />
              </React.Fragment>
            );
          })}
        </SortableContext>
        {computedRows.length === 0 && (
          <div className="flex items-center px-4 py-3 text-[9pt] border-b-[2px] border-black italic select-none text-zinc-300"
            style={{ fontFamily: 'Helvetica, sans-serif' }}
          >
            No scenes in this day · right-click for options
          </div>
        )}
      </div>

      {/* Day Footer */}
      <>
        {showGhosts && insertBeforeId === `end-${dayInt}` && (
          <StackedGhosts rows={activeDragRows} scenes={project.scenes} ribbon={ribbon} colWidths={colWidths} palette={project.colorPalette} />
        )}
        {ribbonActive ? renderRibbonFooter() : (
          <div ref={setFooterRef} className="flex justify-between items-center px-2 py-1 border-t border-zinc-300"
            style={{fontFamily: 'Helvetica, sans-serif', fontSize: '8pt', color: '#18181b'}}>
            <span className="shrink-0">
              End of Day #{displayDay}
              {runningElapsed > 0 && <span> · {addMinutesToTime(meta?.unitCall || '08:00', runningElapsed)}</span>}
            </span>
            <span className="flex-1 text-center">
              {meta?.date ? formatDateLong(meta.date) : ''}
            </span>
            <div className="flex shrink-0" style={{gap: '20pt'}}>
              <span>Total Pages: <strong>{formatPageCount(totalPages)} pgs</strong></span>
              <span>EST. TIME: <strong>{formatDuration(totalShootTime)}</strong>{totalBreakTime > 0 && <span> + <strong>{formatDuration(totalBreakTime)}</strong></span>}</span>
            </div>
          </div>
        )}
      </>
    </div>
  );
}, dayBlockPropsEqual);
