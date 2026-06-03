import React, { useMemo } from 'react';
import { ScheduleRow, ShootDayMeta } from '../types';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useProject } from '../store';
import { addMinutesToTime, formatDuration, formatPageCount } from '../lib/utils';
import { SortableRow } from './SortableRow';
import { generateUUID } from '../lib/utils';
import { GripHorizontal, Trash2 } from 'lucide-react';

export const DayBlock: React.FC<{ dayInt: number, rows: ScheduleRow[], meta?: ShootDayMeta, selectedIds?: Set<string>, onRowClick?: (id: string, e: React.MouseEvent) => void }> = ({ dayInt, rows, meta, selectedIds = new Set(), onRowClick }) => {
  const { state, dispatch } = useProject();
  const project = state.present;
  const activeVersion = project.versions.find(v => v.id === project.activeVersionId);

  // Droppable area for scenes entering this day
  const { setNodeRef: setDropRef } = useDroppable({
    id: `day-${dayInt}`,
    data: { type: 'DAY', day: dayInt }
  });

  // Sortable area for moving the day itself
  const { attributes, listeners, setNodeRef: setSortRef, transform, transition, isDragging } = useSortable({
    id: `day-wrap-${dayInt}`,
    data: { type: 'DAY', day: dayInt }
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 998 : 'auto',
    opacity: isDragging ? 0.3 : 1,
  };

  const updateMeta = (updates: Partial<ShootDayMeta>) => {
    if (!activeVersion || !meta) return;
    const newMeta = { ...activeVersion.dayMeta, [dayInt]: { ...meta, ...updates } };
    dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, dayMeta: newMeta } });
  };

  // Compute times
  const computedRows = useMemo(() => {
    let currentTime = meta?.unitCall || '08:00';
    let totalElapsed = 0;

    return rows.map(r => {
      let dur = 0;
      if (r.type === 'SCENE') dur = r.estimatedDuration || 0;
      if (r.type === 'BREAK') dur = r.breakDuration || 0;
      
      const callTime = currentTime;
      if (r.type !== 'NOTE') {
        currentTime = addMinutesToTime(currentTime, dur);
        totalElapsed += dur;
      }

      return {
        ...r,
        computedCallTime: callTime,
        computedElapsed: totalElapsed // time at end of this block
      };
    });
  }, [rows, meta?.unitCall]);

  let endOfDayTime = meta?.unitCall || '08:00';
  let totalShootTime = 0;
  let totalPages = 0;

  for (const r of rows) {
     let dur = 0;
     if (r.type === 'SCENE') {
         dur = r.estimatedDuration || 0;
         totalShootTime += dur;
         const scene = project.scenes.find(s => s.id === r.sceneId);
         if (scene) totalPages += (scene.pageCountDecimal || 0); // fallback 0 for missing values
     }
     if (r.type === 'BREAK') dur = r.breakDuration || 0;
     if (r.type !== 'NOTE') endOfDayTime = addMinutesToTime(endOfDayTime, dur);
  }

  const addBreak = () => {
    if(!activeVersion) return;
    const newRow: ScheduleRow = {
      id: generateUUID(),
      type: 'BREAK',
      shootDay: dayInt,
      order: rows.length,
      breakLabel: 'LUNCH',
      breakDuration: 60,
      isTimed: true
    };
    dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, rows: [...activeVersion.rows, newRow] } });
  };

  const addNote = () => {
    if(!activeVersion) return;
    const newRow: ScheduleRow = {
      id: generateUUID(),
      type: 'NOTE',
      shootDay: dayInt,
      order: rows.length,
      noteText: 'Special requirement note'
    };
    dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, rows: [...activeVersion.rows, newRow] } });
  };


  return (
    <div ref={setSortRef} style={style} className="w-full bg-white shadow-xl shadow-zinc-200 border border-zinc-300 print:shadow-none print:border-none print:break-after-page flex flex-col font-sans relative pb-4">
      
      {/* Day Banner */}
      <div className="bg-zinc-900 text-white flex justify-between items-center p-3 font-bold tracking-wide text-sm group">
         <div {...listeners} {...attributes} className="absolute -left-10 hover:bg-black/10 p-2 rounded cursor-grab active:cursor-grabbing text-zinc-400  transition-colors">
            <GripHorizontal className="w-6 h-6" />
         </div>

         <div className="flex bg-black px-4 py-1.5 rounded items-center shadow-inner gap-2">
            <span>DAY</span>
            <input 
              value={meta?.shootDay || dayInt} 
              onChange={e => updateMeta({shootDay: parseInt(e.target.value)||dayInt})} 
              className="bg-transparent w-8 text-center outline-none border-b border-transparent hover:border-zinc-500 focus:border-zinc-400 font-bold"
            />
         </div>
         <div className="flex gap-2 items-center text-zinc-300 uppercase tracking-widest text-[11px] font-bold">
            <span>Unit Call:</span>
            <input 
              type="time"
              value={meta?.unitCall || '08:00'} 
              onChange={e => updateMeta({unitCall: e.target.value})} 
              className="bg-zinc-800 px-2 py-1 rounded outline-none border border-transparent focus:border-zinc-500 font-bold"
            />
         </div>
         <div className="flex items-center gap-4">
            <input 
              value={meta?.date || ''} 
              onChange={e => updateMeta({date: e.target.value})} 
              placeholder="DATE"
              className="bg-transparent text-right outline-none text-zinc-400 focus:text-white uppercase w-64"
            />
            <button 
              onClick={() => dispatch({ type: 'DELETE_DAY', day: dayInt })}
              className="opacity-50 hover:opacity-100 hover:text-red-400 transition-colors"
              title="Delete Day"
            >
              <Trash2 className="w-4 h-4" />
            </button>
         </div>
      </div>

      {/* Column Headers */}
      <div className="flex items-stretch font-bold text-[10px] uppercase tracking-wider text-zinc-500 border-b-2 border-zinc-900 bg-zinc-50 py-1 select-none">
        <div className="w-[30px]" /> {/* Grip spacer */}
        <div className="w-[50px] text-center border-r border-zinc-300">SC #</div>
        <div className="w-[60px] text-center border-r border-zinc-300">CALL</div>
        <div className="w-[70px] text-center border-r border-zinc-300">DUR</div>
        <div className="w-[50px] text-center border-r border-zinc-300">PAGES</div>
        <div className="flex-1 flex pr-3">
           <span className="w-[50px] pl-3 text-left">I/E</span>
           <span className="flex-1 text-left">SET / DESCRIPTION</span>
           <span className="w-[100px] text-left">D/N</span>
           <span className="w-[80px] text-right">CAST</span>
        </div>
      </div>

      <div ref={setDropRef} className="flex-1 flex flex-col min-h-[50px] print:min-h-0 bg-white items-stretch">
        <SortableContext items={rows.map(r => r.id)} strategy={verticalListSortingStrategy}>
          {computedRows.map(r => (
            <SortableRow 
              key={r.id} 
              row={r} 
              scenes={project.scenes} 
              isSelected={selectedIds.has(r.id)}
              onSelectToggle={(e) => onRowClick?.(r.id, e)}
            />
          ))}
        </SortableContext>
        
        {rows.length === 0 && (
          <div className="flex-1 flex items-center justify-center p-8 text-zinc-400 font-bold text-sm border-2 border-dashed border-zinc-200 m-2 rounded bg-zinc-50">
            Drag scenes here
          </div>
        )}
      </div>

      {/* Wrap / Summary Block */}
      {rows.length > 0 && (
        <div className="bg-zinc-900 text-white font-bold text-xs flex justify-between p-3 border-t-2 border-zinc-950 mt-auto items-center">
          <div className="flex gap-8 text-zinc-400">
             <span>TOTAL PAGES: <strong className="text-white">{formatPageCount(totalPages)}</strong></span>
             <span>SHOOT TIME: <strong className="text-white">{formatDuration(totalShootTime)}</strong></span>
          </div>
          <div className="flex items-center gap-4 text-zinc-300 bg-black px-4 py-1.5 rounded tracking-widest uppercase">
            <span>Wrap Time</span>
            <span className="text-white text-base">{endOfDayTime}</span>
          </div>
        </div>
      )}

      {/* Add Controls */}
      <div className="p-2 border-t border-zinc-100 flex gap-2 bg-zinc-50 print:hidden justify-center opacity-70 hover:opacity-100 transition-opacity">
        <button onClick={addBreak} className="px-4 py-1.5 bg-white border border-zinc-300 text-zinc-900 rounded font-bold hover:bg-zinc-100 shadow-sm transition-colors text-xs uppercase tracking-wider">
          + Add Break
        </button>
        <button onClick={addNote} className="px-4 py-1.5 bg-white border border-zinc-300 text-zinc-900 rounded font-bold hover:bg-zinc-100 shadow-sm transition-colors text-xs uppercase tracking-wider">
          + Add Note
        </button>
      </div>

    </div>
  );
}
