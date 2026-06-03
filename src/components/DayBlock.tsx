import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useProject } from '../store';
import { addMinutesToTime, formatDuration, formatPageCount } from '../lib/utils';
import { SortableRow } from './SortableRow';
import { generateUUID } from '../lib/utils';
import { GripHorizontal, Trash2 } from 'lucide-react';
import { ScheduleRow, ShootDayMeta, Scene } from '../types';

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
      <div className="opacity-30 flex items-stretch bg-white text-zinc-900 min-h-[44px] font-sans text-[12px] font-bold tracking-tight border-b sm:border-black/20 shrink-0">
        <div className="flex-1 flex items-center justify-center px-3 italic">{row.noteText || 'Note'}</div>
      </div>
    );
  }

  if (row.type === 'BREAK') {
    return (
      <div className="opacity-30 flex items-stretch bg-[#591b1b] text-white min-h-[44px] font-sans text-[12px] font-bold tracking-tight border-b sm:border-black/20 shrink-0">
        <div className="flex-1 flex items-center justify-center px-3">{row.breakLabel || 'BREAK'}</div>
      </div>
    );
  }

  const scene = scenes.find(s => s.id === row.sceneId);
  return (
    <div className={`opacity-30 flex items-stretch min-h-[44px] font-sans text-[12px] font-bold tracking-tight border-b sm:border-black/20 shrink-0 ${sceneCardClass(scene)}`}>
      {scene && (
        <>
          <div className="flex items-center justify-center w-[50px] shrink-0 px-1 border-r border-black/10">{scene.sceneNumber}</div>
          <div className="flex-1 flex items-center px-3 gap-1 min-w-0">
            <span className="uppercase shrink-0">{scene.intExt}.</span>
            <span className="uppercase tracking-wider truncate">{scene.set}</span>
            <span className="opacity-50 shrink-0">-</span>
            <span className="uppercase shrink-0">{scene.dayNight}</span>
          </div>
        </>
      )}
    </div>
  );
};

export const DayBlock: React.FC<{ dayInt: number, rows: ScheduleRow[], meta?: ShootDayMeta, selectedIds?: Set<string>, onRowClick?: (id: string, e: React.MouseEvent) => void, textEditingEnabled: boolean, insertBeforeId?: string | null, activeRowId?: string | null, activeDragRow?: ScheduleRow | null }> = ({ dayInt, rows, meta, selectedIds = new Set(), onRowClick, textEditingEnabled, insertBeforeId, activeRowId, activeDragRow }) => {
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

  return (
    <div ref={setDragRef} style={style} className="bg-white rounded-lg shadow-xl overflow-hidden flex flex-col font-sans break-inside-avoid shadow-black/10 border border-zinc-200">
      
      {/* Day Ribbon Banner */}
      <div className="bg-zinc-800 text-white font-bold text-[14px] flex justify-between p-3 items-center group sticky top-0 z-10 print:static">
         <div className="flex items-center gap-4">
            <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing hover:bg-zinc-700 p-1 rounded transition-colors -ml-1">
               <GripHorizontal className="w-5 h-5 text-zinc-400" />
            </div>
            <div className="flex items-center gap-2">
               <span className="text-zinc-400 bg-black px-3 py-1 rounded tracking-widest">DAY {dayInt}</span>
            </div>
            <input 
              value={meta?.unitCall || '08:00'} 
              onChange={e => updateMeta({unitCall: e.target.value})}
              className="bg-zinc-800 px-2 py-1 rounded outline-none border border-transparent focus:border-zinc-500 font-bold"
            />
            <button 
              onClick={() => dispatch({ type: 'DELETE_DAY', day: dayInt })}
              className="opacity-50 hover:opacity-100 hover:text-red-400 transition-colors"
              title="Delete Day"
            >
              <Trash2 className="w-4 h-4" />
            </button>
         </div>
         <div className="flex items-center gap-4">
            <input 
              type="date"
              value={meta?.date || ''} 
              onChange={e => updateMeta({date: e.target.value})} 
              className="bg-transparent text-right outline-none text-zinc-400 focus:text-white"
            />
         </div>
      </div>

      {/* Header Row */}
      <div className="bg-zinc-100 text-zinc-500 font-bold text-[11px] tracking-wider flex items-stretch border-b-2 border-zinc-300">
        <div className="w-[8px] border-r border-zinc-300"></div> {/* Grip aligner */}
        <div className="w-[50px] text-center border-r border-zinc-300 py-2">SC #</div>
        <div className="w-[60px] text-center border-r border-zinc-300 py-2">CALL</div>
        <div className="w-[70px] text-center border-r border-zinc-300 py-2">DUR</div>
        <div className="flex-1 flex flex-col justify-center min-w-0 pr-3 gap-0.5 py-2">
           <div className="flex items-center w-full gap-2">
             <div className="pl-3 shrink-0 text-left">I/E</div>
             <div className="flex-1 text-left min-w-0 pr-2">SET / DESCRIPTION</div>
             <div className="w-[50px] shrink-0 text-left">D/N</div>
             <div className="w-[80px] shrink-0 text-right">CAST</div>
           </div>
        </div>
        <div className="w-[50px] text-center border-l border-zinc-300 py-2">PAGES</div>
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
        <div className="bg-zinc-900 text-white font-bold text-xs flex justify-between p-3 border-t-2 border-zinc-950 mt-auto items-center">
          <div className="flex gap-8 text-zinc-400">
             <span>TOTAL PAGES: <strong className="text-white">{formatPageCount(totalPages)}</strong></span>
             <span>SHOOT TIME: <strong className="text-white">{formatDuration(totalShootTime)}</strong></span>
          </div>
          <div className="flex items-center gap-4 text-zinc-300 bg-black px-4 py-1.5 rounded tracking-widest uppercase">
            END OF DAY {dayInt}
          </div>
        </div>
      )}
    </div>
  );
}
