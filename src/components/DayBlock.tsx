import React, { useMemo } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useProject } from '../store';
import { addMinutesToTime, formatDuration, formatPageCount } from '../lib/utils';
import { SortableRow } from './SortableRow';
import { CellInput } from './CellInput';
import { Tooltip } from './Tooltip';
import { GripHorizontal, Trash2, Flag } from 'lucide-react';
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

const GhostCard: React.FC<{ row: ScheduleRow, scenes: Scene[] }> = ({ row, scenes }) => {
  if (row.type === 'NOTE') {
    return (
      <div className="opacity-30 flex items-stretch bg-white text-zinc-900 min-h-[44px] border-b shrink-0">
        <div className="flex-1 flex items-center justify-center px-3 italic">{row.noteText || 'Note'}</div>
      </div>
    );
  }

  if (row.type === 'BREAK') {
    return (
      <div className="opacity-30 flex items-stretch bg-[#591b1b] text-white min-h-[44px] border-b shrink-0">
        <div className="flex-1 flex items-center justify-center px-3">{row.breakLabel || 'BREAK'}</div>
      </div>
    );
  }

  const scene = scenes.find(s => s.id === row.sceneId);
  return (
    <div className={`opacity-30 flex items-stretch min-h-[44px] border-b shrink-0 ${sceneCardClass(scene)}`}>
      {scene && (
        <>
          <div className="flex items-center justify-center w-[50px] shrink-0 px-1 border-r border-black/10">{scene.sceneNumber}</div>
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

export const DayBlock: React.FC<{ dayInt: number, rows: ScheduleRow[], meta?: ShootDayMeta, selectedIds?: Set<string>, onRowClick?: (id: string, e: React.MouseEvent) => void, textEditingEnabled: boolean, insertBeforeId?: string | null, activeRowId?: string | null, activeDragRow?: ScheduleRow | null, chronoDay?: number }> = ({ dayInt, rows, meta, selectedIds = new Set(), onRowClick, textEditingEnabled, insertBeforeId, activeRowId, activeDragRow, chronoDay }) => {
  const displayDay = chronoDay ?? dayInt;
  const { state, dispatch } = useProject();
  const project = state.present;
  const activeVersion = project.versions.find(v => v.id === project.activeVersionId);

  const { attributes, listeners, setNodeRef: setDragRef, transform, transition, isDragging } = useSortable({
    id: `day-wrap-${dayInt}`,
    data: { type: 'DAY', dayInt }
  });

  const { setNodeRef: setDropRef } = useDroppable({
    id: `day-${dayInt}`,
    data: { type: 'DAY_DROPZONE', dayInt }
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

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

  const computedRows = rows.map(r => {
    const callTime = addMinutesToTime(meta?.unitCall || '08:00', runningElapsed);
    let dur = 0;
    
    if (r.type === 'SCENE') {
      dur = r.estimatedDuration || 0;
      const scene = project.scenes.find(s => s.id === r.sceneId);
      if (scene) totalPages += scene.pageCountDecimal;
    } else if (r.type === 'BREAK') {
      dur = r.breakDuration || 0;
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

  const totalShootTime = runningElapsed;

  const baseStyle = {
    fontFamily: 'Helvetica, Arial, sans-serif',
    fontSize: '8pt',
    lineHeight: '1.2',
  };

  return (
    <div ref={setDragRef} style={{...style, ...baseStyle}} className="bg-white flex flex-col">
      
      {/* Day Ribbon Banner */}
      <div className="bg-black text-white flex justify-between px-3 py-2 items-center">
         <div className="flex items-center gap-3">
            <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing hover:bg-zinc-800 p-1 rounded transition-colors -ml-1">
               <GripHorizontal className="w-4 h-4 text-zinc-500" />
            </div>
            <span className="font-semibold">DAY {displayDay}</span>
            {violations.length > 0 && (
              <Tooltip content={vMessages}>
                <span className="flex items-center gap-0.5 text-red-400">
                  <Flag className="w-3.5 h-3.5 fill-red-400" />
                  <span className="text-[10px] font-bold">{violations.length}</span>
                </span>
              </Tooltip>
            )}
            <CellInput
              value={meta?.unitCall || '08:00'}
              onChange={val => updateMeta({unitCall: val})}
              clearOnType
              col="duration"
              className="bg-zinc-900 px-2 py-0.5 border border-transparent focus-within:border-zinc-600 w-16 text-center"
            />
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
          <div className="flex items-center gap-2">
            <span className="text-zinc-400">{meta?.date ? formatDateLong(meta.date) : ''}</span>
          </div>
      </div>

      <div ref={setDropRef} className="flex-1 flex flex-col min-h-[50px] print:min-h-0 bg-white items-stretch relative">
        <SortableContext items={rows.map(r => r.id)} strategy={verticalListSortingStrategy}>
          {computedRows.map((r, i) => {
            const isCrossContext = activeRowId && !rows.some(row => row.id === activeRowId);
            return (
              <React.Fragment key={r.id}>
                {isCrossContext && insertBeforeId === r.id && activeDragRow && (
                  <GhostCard row={activeDragRow} scenes={project.scenes} />
                )}
                <SortableRow 
                  row={r} 
                  scenes={project.scenes} 
                  isSelected={selectedIds.has(r.id)}
                  onSelectToggle={(e) => onRowClick?.(r.id, e)}
                  textEditingEnabled={textEditingEnabled}
                  sceneViolations={sceneViolationMap.get(r.sceneId || '')}
                />
                {isCrossContext && i === computedRows.length - 1 && insertBeforeId === `day-${dayInt}` && activeDragRow && (
                  <GhostCard row={activeDragRow} scenes={project.scenes} />
                )}
              </React.Fragment>
            );
          })}
        </SortableContext>
        
        {/* Drop target filler if empty */}
        {rows.length === 0 && (
          <>
            {activeRowId && insertBeforeId === `day-${dayInt}` && activeDragRow && (
              <GhostCard row={activeDragRow} scenes={project.scenes} />
            )}
            <div className="flex-1 flex items-center justify-center p-8 text-zinc-300 border-2 border-dashed border-zinc-200 m-2 rounded-lg font-bold">
              Drop scenes here
            </div>
          </>
        )}
      </div>

      {/* Day Footer stats */}
      {rows.length > 0 && (
        <div className="flex justify-between items-center px-3 py-1.5 border-t border-zinc-300"
          style={{fontFamily: 'Helvetica, Arial, sans-serif'}}>
          <span className="font-semibold">End of Day #{displayDay}</span>
          <div className="flex gap-4 text-zinc-600">
             <span>Total Pages: <strong>{formatPageCount(totalPages)}</strong></span>
             <span>EST. TIME: <strong>{formatDuration(totalShootTime)}</strong></span>
          </div>
        </div>
      )}
    </div>
  );
}
