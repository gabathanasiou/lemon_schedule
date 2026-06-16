import React, { useMemo } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useProject } from '../store';
import { addMinutesToTime, formatDuration, formatPageCount, formatDateLong } from '../lib/utils';
import { SortableRow } from './SortableRow';
import { CellInput } from './CellInput';
import { Tooltip } from './Tooltip';
import { Trash2, Flag } from 'lucide-react';
import { ScheduleRow, ShootDayMeta, Scene, RibbonRow, SceneColorPalette } from '../types';
import { getFieldValue, FIELD_MAP, resolveSceneColor, getDayHeaderColors, getNoteBannerColors } from '../lib/ribbonUtils';
import { checkDay } from '../lib/rulesEngine';

function getSceneCardStyle(scene?: Scene | null, palette?: SceneColorPalette): React.CSSProperties {
  if (!scene) return { background: '#ffffff', color: '#18181b' };
  return resolveSceneColor(scene.intExt || '', scene.dayNight || '', palette?.sceneColors);
}

const GhostCard: React.FC<{ row: ScheduleRow, scenes: Scene[]; compact?: boolean; ribbon?: RibbonRow[]; palette?: SceneColorPalette }> = ({ row, scenes, compact, ribbon, palette }) => {
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
    const cells = ribbon[0].cells;
    const sc = getSceneCardStyle(scene, palette);
    return (
      <div className={`opacity-30 flex items-stretch border-b shrink-0 ${h} ${sz}`}
        style={{ ...sc, fontFamily: 'Helvetica, sans-serif', fontSize: compact ? '7pt' : '8pt', lineHeight: '1.1' }}>
        {cells.map(c => {
          const val = c.field === 'text' ? (c.textContent || '') : getFieldValue(c.field, { ...scene, computedCallTime: row.computedCallTime, estimatedDuration: row.estimatedDuration || 0 });
          const label = FIELD_MAP[c.field]?.label || c.field;
          const display = val ? `${c.prefix || ''}${c.prefix && val ? '\u00A0' : ''}${val}${c.suffix && val ? '\u00A0' : ''}${c.suffix || ''}` : label;
          return (
            <div key={c.id} style={{
              flex: `0 0 ${c.width}%`, minWidth: 0, padding: compact ? '3pt 3pt' : '4pt 4pt',
              borderRight: '1px solid rgba(0,0,0,0.15)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
              textAlign: c.align || 'left',
              fontWeight: c.field === 'sceneNumber' ? 700 : 500,
              fontStyle: val ? 'normal' : 'italic',
            }}>
              {display || ''}
            </div>
          );
        })}
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

export const StackedGhosts: React.FC<{ rows: ScheduleRow[]; scenes: Scene[]; ribbon?: RibbonRow[]; palette?: SceneColorPalette }> = ({ rows, scenes, ribbon, palette }) => {
  if (rows.length === 0) return null;
  if (rows.length === 1) return <GhostCard row={rows[0]} scenes={scenes} ribbon={ribbon} palette={palette} />;
  const maxShow = Math.min(rows.length, 5);
  const rest = rows.length - maxShow;
  return (
    <div className="flex flex-col shrink-0">
      {rows.slice(0, maxShow).map((r, i) => (
        <GhostCard key={r.id} row={r} scenes={scenes} compact ribbon={ribbon} palette={palette} />
      ))}
      {rest > 0 && (
        <div className="opacity-30 flex items-center justify-center min-h-[30px] bg-zinc-100 text-zinc-500 text-[10px] font-bold border-b shrink-0">
          +{rest} more
        </div>
      )}
    </div>
  );
};

export const DayBlock: React.FC<{ dayInt: number, rows: ScheduleRow[], meta?: ShootDayMeta, selectedIds?: Set<string>, activeDragIds?: Set<string>, onRowClick?: (id: string, e: React.MouseEvent) => void, textEditingEnabled: boolean, insertBeforeId?: string | null, activeRowId?: string | null, activeDragRow?: ScheduleRow | null, activeDragRows?: ScheduleRow[], chronoDay?: number, focusedRowId?: string | null, onRowDoubleClick?: (id: string) => void, onRowNavigate?: (rowId: string) => void, ribbon?: RibbonRow[], cellPadding?: number, edgePadding?: number }> = ({ dayInt, rows, meta, selectedIds = new Set(), activeDragIds = new Set(), onRowClick, textEditingEnabled, insertBeforeId, activeRowId, activeDragRow, activeDragRows = [], chronoDay, focusedRowId, onRowDoubleClick, onRowNavigate, ribbon, cellPadding, edgePadding }) => {
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
    return checkDay(dayInt, project.rules || [], project.scenes, activeVersion.rows, activeVersion.dayMeta);
  }, [dayInt, project.rules, project.scenes, activeVersion]);
  const vMessages = violations.map(v => v.message).join('\n• ');
  const sceneViolationMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const v of violations) {
      for (const sid of (v.sceneIds || (v.sceneId ? [v.sceneId] : []))) {
        if (!map.has(sid)) map.set(sid, []);
        if (!map.get(sid)!.includes(v.message)) map.get(sid)!.push(v.message);
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

  // Compute accumulated times & page counts
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

  const totalShootTime = runningElapsed - totalBreakTime;

  const baseStyle = {
    fontFamily: 'Helvetica, sans-serif',
    fontSize: '8pt',
    lineHeight: '1.2',
  };

  const dhColors = getDayHeaderColors(project.colorPalette);

  if (isStatusDay) {
    return (
      <div style={baseStyle} className="bg-white flex flex-col border-[2px] border-black border-b-dashed border-b-zinc-300">
        <div style={{ background: dhColors.background, color: dhColors.color }}>
          <table className="schedule-table">
            <tbody>
              <tr className="day-header-row" data-row-id={`empty-${dayInt}`} data-shoot-day={dayInt}
                onClick={(e) => { e.stopPropagation(); onRowClick?.(`empty-${dayInt}`, e as any); }}
                style={{background: selectedIds.has(`empty-${dayInt}`) ? '#27272a' : undefined, outline: 'none'}}>
                <td className="col-sc" style={{textAlign: 'left'}}>
                  <span className="font-bold" style={{paddingLeft: 4}}>{meta?.status === 'hold' ? 'HOLD' : meta?.status === 'travel' ? 'TRAVEL' : 'HOLIDAY'}</span>
                </td>
                <td className="col-call"><span style={{visibility: 'hidden'}}>CALL</span></td>
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
        <table className="schedule-table">
          <tbody>
            <tr className="day-header-row" data-row-id={`empty-${dayInt}`} data-shoot-day={dayInt}
              onClick={(e) => { e.stopPropagation(); onRowClick?.(`empty-${dayInt}`, e as any); }}
              style={{background: selectedIds.has(`empty-${dayInt}`) ? '#27272a' : undefined, outline: 'none'}}>
              <td className="col-sc" style={{textAlign: 'left'}}>
                <span className="font-bold" style={{paddingLeft: 4}}>{meta?.status === 'hold' ? 'HOLD' : meta?.status === 'travel' ? 'TRAVEL' : meta?.status === 'holiday' ? 'HOLIDAY' : `DAY #${displayDay}`}</span>
              </td>
              <td className="col-call">
                {violations.length > 0 && (
                  <Tooltip content={vMessages}>
                    <span className="inline-flex items-center gap-0.5 text-red-400">
                      <Flag className="w-3.5 h-3.5 fill-red-400" />
                      <span className="text-[10px] font-bold">{violations.length}</span>
                    </span>
                  </Tooltip>
                )}
                <button 
                  onClick={() => {
                    dispatch({ type: 'UNSCHEDULE_DAY', day: dayInt });
                  }}
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
      </div>

      <div ref={setDropRef} className="flex flex-col min-h-0 bg-white items-stretch relative">
        {showGhosts && insertBeforeId === `day-${dayInt}` && (
          <StackedGhosts rows={activeDragRows} scenes={project.scenes} ribbon={ribbon} palette={project.colorPalette} />
        )}
        <SortableContext items={rows.map(r => r.id)} strategy={verticalListSortingStrategy}>
          {computedRows.map((r) => {
            return (
              <React.Fragment key={r.id}>
                {showGhosts && insertBeforeId === r.id && (
                  <StackedGhosts rows={activeDragRows} scenes={project.scenes} ribbon={ribbon} palette={project.colorPalette} />
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
                  cellPadding={cellPadding}
                  edgePadding={edgePadding}
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
          <StackedGhosts rows={activeDragRows} scenes={project.scenes} ribbon={ribbon} palette={project.colorPalette} />
        )}
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
        </>
    </div>
  );
}
