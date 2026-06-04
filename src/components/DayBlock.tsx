import React, { useMemo } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useProject } from '../store';
import { addMinutesToTime, formatDuration, formatPageCount } from '../lib/utils';
import { SortableRow } from './SortableRow';
import { CellInput } from './CellInput';
import { Tooltip } from './Tooltip';
import { Trash2, Flag } from 'lucide-react';
import { ScheduleRow, ShootDayMeta, Scene } from '../types';
import { checkDay } from '../lib/rulesEngine';

function formatDateLong(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  const weekday = d.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();
  const day = d.getDate();
  const month = d.toLocaleDateString('en-US', { month: 'long' }).toUpperCase();
  const year = d.getFullYear();
  const suffixes = ['TH', 'ST', 'ND', 'RD'];
  const suffix = (day >= 11 && day <= 13) ? 'TH' : suffixes[day % 10] || 'TH';
  return `${weekday} ${day}${suffix} ${month} ${year}`;
}

const sceneCardClass = (scene?: Scene | null): string => {
  if (!scene) return 'bg-white text-zinc-900';
  const intExt = (scene.intExt || '').toUpperCase();
  const dayNight = (scene.dayNight || '').toUpperCase();
  if (intExt.includes('INT') && dayNight.includes('DAY')) return 'bg-[#FFFFFF] text-[#464646]';
  if (intExt.includes('EXT') && dayNight.includes('DAY')) return 'bg-[#BDD857] text-[#000000]';
  if (intExt.includes('INT') && dayNight.includes('NIGHT')) return 'bg-[#67832E] text-[#F2FCE3]';
  if (intExt.includes('EXT') && dayNight.includes('NIGHT')) return 'bg-[#2148A7] text-[#FFFFFF]';
  if (intExt.includes('INT') && dayNight.includes('MORNING')) return 'bg-[#EFBEA0] text-[#4A3730]';
  if (intExt.includes('EXT') && dayNight.includes('MORNING')) return 'bg-[#E88AA5] text-[#FFFFFF]';
  if (intExt.includes('INT') && dayNight.includes('EVENING')) return 'bg-[#E29926] text-[#000000]';
  if (intExt.includes('EXT') && dayNight.includes('EVENING')) return 'bg-[#CE7D21] text-[#000000]';
  return 'bg-white text-zinc-900';
};

const GhostCard: React.FC<{ row: ScheduleRow, scenes: Scene[]; compact?: boolean }> = ({ row, scenes, compact }) => {
  const h = compact ? 'min-h-[30px]' : 'min-h-[44px]';
  const sz = compact ? 'text-[7pt]' : '';
  if (row.type === 'NOTE') {
    return (
      <div className={`opacity-30 flex items-stretch bg-white text-zinc-900 ${h} border-b shrink-0 ${sz}`}>
        <div className="flex-1 flex items-center justify-center px-3 italic">{row.noteText || 'Note'}</div>
      </div>
    );
  }

  if (row.type === 'BREAK') {
    return (
      <div className={`opacity-30 flex items-stretch bg-[#591b1b] text-white ${h} border-b shrink-0 ${sz}`}>
        <div className="flex-1 flex items-center justify-center px-3">{row.breakLabel || 'BREAK'}</div>
      </div>
    );
  }

  const scene = scenes.find(s => s.id === row.sceneId);
  return (
    <div className={`opacity-30 flex items-stretch border-b shrink-0 ${h} ${sz} ${sceneCardClass(scene)}`}>
      {scene && (
        <>
          <div className={`flex items-center justify-center shrink-0 px-1 border-r border-black/10 ${compact ? 'w-[30px]' : 'w-[50px]'}`}>{scene.sceneNumber}</div>
          <div className="flex-1 flex items-center px-3 gap-1 min-w-0">
            <span className="uppercase shrink-0">{scene.intExt}.</span>
            <span className="uppercase truncate">{scene.set}</span>
            <span className="opacity-50 shrink-0">-</span>
            <span className="uppercase shrink-0">{scene.dayNight}</span>
          </div>
        </>
      )}
    </div>
  );
};

export const StackedGhosts: React.FC<{ rows: ScheduleRow[]; scenes: Scene[] }> = ({ rows, scenes }) => {
  if (rows.length === 0) return null;
  if (rows.length === 1) return <GhostCard row={rows[0]} scenes={scenes} />;
  const maxShow = Math.min(rows.length, 5);
  const rest = rows.length - maxShow;
  return (
    <div className="flex flex-col shrink-0">
      {rows.slice(0, maxShow).map((r, i) => (
        <GhostCard key={r.id} row={r} scenes={scenes} compact />
      ))}
      {rest > 0 && (
        <div className="opacity-30 flex items-center justify-center min-h-[30px] bg-zinc-100 text-zinc-500 text-[10px] font-bold border-b shrink-0">
          +{rest} more
        </div>
      )}
    </div>
  );
};

export const DayBlock: React.FC<{ dayInt: number, rows: ScheduleRow[], meta?: ShootDayMeta, selectedIds?: Set<string>, activeDragIds?: Set<string>, onRowClick?: (id: string, e: React.MouseEvent) => void, textEditingEnabled: boolean, insertBeforeId?: string | null, activeRowId?: string | null, activeDragRow?: ScheduleRow | null, activeDragRows?: ScheduleRow[], chronoDay?: number }> = ({ dayInt, rows, meta, selectedIds = new Set(), activeDragIds = new Set(), onRowClick, textEditingEnabled, insertBeforeId, activeRowId, activeDragRow, activeDragRows = [], chronoDay }) => {
  const displayDay = chronoDay ?? dayInt;
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
    fontFamily: 'Helvetica, Arial, sans-serif',
    fontSize: '8pt',
    lineHeight: '1.2',
  };

  return (
    <div style={baseStyle} className="bg-white flex flex-col">
      
      {/* Day Ribbon Banner */}
      <div className="bg-black text-white flex justify-between items-center px-3 py-4">
         <div className="flex items-center gap-2 shrink-0">
            <span className="font-bold">DAY #{displayDay}</span>
            {violations.length > 0 && (
              <Tooltip content={vMessages}>
                <span className="flex items-center gap-0.5 text-red-400">
                  <Flag className="w-3.5 h-3.5 fill-red-400" />
                  <span className="text-[10px] font-bold">{violations.length}</span>
                </span>
              </Tooltip>
            )}
            <button 
              onClick={() => {
                dispatch({ type: 'UNSCHEDULE_DAY', day: dayInt });
              }}
              className="opacity-40 hover:opacity-100 hover:text-red-400 transition-colors"
              title="Remove all scenes from this day"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
         </div>
         <span className="flex-1 text-center font-semibold">
            {meta?.date ? formatDateLong(meta.date) : ''}
         </span>
         <div className="flex items-center gap-1 shrink-0">
            <span className="font-semibold text-xs text-zinc-300">CALL</span>
            <CellInput
              value={meta?.unitCall || '08:00'}
              onChange={val => updateMeta({unitCall: val})}
              clearOnType
              col="duration"
              className="bg-zinc-900 px-1.5 py-0.5 border border-transparent focus-within:border-zinc-600 w-14 text-center"
            />
         </div>
      </div>

      <div ref={setDropRef} className="flex flex-col min-h-[50px] print:min-h-0 bg-white items-stretch relative">
        <SortableContext items={rows.map(r => r.id)} strategy={verticalListSortingStrategy}>
          {computedRows.map((r, i) => {
            const isRowGhostTarget = activeRowId && activeDragRows.length > 0;
            return (
              <React.Fragment key={r.id}>
                {isRowGhostTarget && insertBeforeId === r.id && activeDragRow && (
                  <StackedGhosts rows={activeDragRows} scenes={project.scenes} />
                )}
                <SortableRow 
                  row={r} 
                  scenes={project.scenes} 
                  isSelected={selectedIds.has(r.id)}
                  isFaded={activeDragIds.has(r.id)}
                  onSelectToggle={(e) => onRowClick?.(r.id, e)}
                  textEditingEnabled={textEditingEnabled}
                  sceneViolations={sceneViolationMap.get(r.sceneId || '')}
                />
                {isRowGhostTarget && i === computedRows.length - 1 && insertBeforeId === `day-${dayInt}` && activeDragRow && (
                  <StackedGhosts rows={activeDragRows} scenes={project.scenes} />
                )}
              </React.Fragment>
            );
          })}
        </SortableContext>
        {computedRows.length === 0 && showGhosts && insertBeforeId === `day-${dayInt}` && (
          <StackedGhosts rows={activeDragRows} scenes={project.scenes} />
        )}
      </div>

      {/* Day Footer */}
      <>
        {showGhosts && insertBeforeId === `end-${dayInt}` && (
          <StackedGhosts rows={activeDragRows} scenes={project.scenes} />
        )}
        <div ref={setFooterRef} className="flex justify-between items-center px-3 py-2 border-t border-zinc-300"
          style={{fontFamily: 'Helvetica, Arial, sans-serif', fontSize: '8pt', color: '#18181b'}}>
          <span className="shrink-0">
            End of Day #{displayDay}
            {runningElapsed > 0 && <span> · {addMinutesToTime(meta?.unitCall || '08:00', runningElapsed)}</span>}
          </span>
          <span className="flex-1 text-center">
            {meta?.date ? new Date(meta.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : ''}
          </span>
          <div className="flex shrink-0" style={{gap: '20pt'}}>
            <span>Total Pages: <strong>{formatPageCount(totalPages)}</strong></span>
            <span>EST. TIME: <strong>{formatDuration(totalShootTime)}</strong>{totalBreakTime > 0 && <span> + <strong>{formatDuration(totalBreakTime)}</strong></span>}</span>
          </div>
        </div>
        </>
    </div>
  );
}
