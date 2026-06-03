import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Scene, ScheduleRow } from '../types';
import { formatDuration, parseDuration, formatPageCount } from '../lib/utils';
import { useProject } from '../store';
import { CellInput } from './CellInput';
import { GripVertical } from 'lucide-react';

export const SortableRow: React.FC<{ 
  row: ScheduleRow & { computedCallTime?: string, computedElapsed?: number }, 
  scenes: Scene[], 
  isOverlay?: boolean,
  isSelected?: boolean,
  onSelectToggle?: (e: React.MouseEvent) => void,
  isCompact?: boolean,
  textEditingEnabled?: boolean
}> = ({ row, scenes, isOverlay, isSelected, onSelectToggle, isCompact, textEditingEnabled }) => {
  const { state, dispatch } = useProject();
  const activeVersionId = state.present.activeVersionId;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ 
    id: row.id,
    data: { type: 'ROW', row }
  });

  const scene = row.type === 'SCENE' ? scenes.find(s => s.id === row.sceneId) : null;

  const updateRow = (updates: Partial<ScheduleRow>) => {
    if (!activeVersionId) return;
    const version = state.present.versions.find(v => v.id === activeVersionId);
    if (!version) return;
    const newRows = version.rows.map(r => r.id === row.id ? { ...r, ...updates } : r);
    dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersionId, rows: newRows } });
  };

  const updateScene = (updates: Partial<Scene>) => {
    if (!scene) return;
    dispatch({ type: 'UPDATE_SCENE', payload: { id: scene.id, ...updates } });
  };

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging && !isOverlay ? 0.3 : 1,
  };

  let bgClass = 'bg-white text-zinc-900 border-zinc-200';
  if (row.type === 'NOTE') {
    bgClass = 'bg-[#7a2e2e] text-white border-[#592323]';
  } else if (row.type === 'BREAK') {
    bgClass = 'bg-[#591b1b] text-white border-[#401212]';
  } else if (scene) {
    const intExt = (scene.intExt || '').toUpperCase();
    const dayNight = (scene.dayNight || '').toUpperCase();
    
    if (intExt.includes('INT') && dayNight.includes('DAY')) {
      bgClass = 'bg-[#e2d5b6] text-black border-[#d1c2a1]';
    } else if (intExt.includes('EXT') && dayNight.includes('DAY')) {
      bgClass = 'bg-[#89a744] text-white border-[#77913b]';
    } else if (intExt.includes('EXT') && dayNight.includes('NIGHT')) {
      bgClass = 'bg-[#3b5998] text-white border-[#2f477a]';
    } else if (intExt.includes('INT') && dayNight.includes('NIGHT')) {
      bgClass = 'bg-[#333333] text-white border-[#222222]';
    }
  }

  const commonProps = {
    ref: setNodeRef,
    style,
    onClick: onSelectToggle,
    ...listeners,
    ...attributes,
    'data-row-id': row.id,
    'data-shoot-day': row.shootDay,
    className: `${bgClass} flex items-stretch group relative transition-colors text-[12px] font-bold tracking-tight min-h-[44px] font-sans border-b sm:border-black/20 ${isOverlay ? 'scale-[1.02] shadow-2xl cursor-grabbing ring-2 ring-black' : ''} ${isSelected ? 'ring-2 ring-blue-500 z-50' : ''} ${isCompact ? 'min-h-[40px] px-1' : ''}`
  };

  const Grip = () => (
    <div className="w-[8px] flex flex-col items-center justify-center shrink-0 z-10 transition-colors opacity-0 group-hover:opacity-100 bg-black/10 text-white cursor-grab active:cursor-grabbing">
    </div>
  );

  const cellClass = "flex items-center shrink-0 py-2 border-r border-black/10";
  const inputClass = "text-inherit placeholder:text-inherit placeholder:opacity-50";

  if (row.type === 'NOTE') {
    return (
      <div {...commonProps}>
         <Grip />
         <div className={cellClass + " w-[50px] justify-center"}></div>
         {!isCompact && (
             <>
               <div className={cellClass + " w-[60px] justify-center text-[13px] font-normal"}>{row.computedCallTime}</div>
               <div className={cellClass + " w-[70px] justify-center"}>
                  <CellInput 
                    value={row.estimatedDuration === 0 || !row.estimatedDuration ? '--' : formatDuration(row.estimatedDuration || 0)} 
                    onChange={val => updateRow({estimatedDuration: parseDuration(val)})}
                    clearOnType
                    col="duration"
                    className={`${inputClass} text-center font-normal`}
                  />
               </div>
             </>
         )}
         <div className="flex-1 flex px-3 items-center justify-center min-w-0 py-2">
            <CellInput 
              value={row.noteText} 
              onChange={val => updateRow({noteText: val})} 
              className={`${inputClass} text-center italic truncate max-w-full`} 
              placeholder="Enter note here..."
            />
         </div>
         {!isCompact && <div className={cellClass + " w-[50px] border-l border-r-0"}></div>}
      </div>
    );
  }

  if (row.type === 'BREAK') {
    return (
      <div {...commonProps}>
         <Grip />
         <div className={cellClass + " w-[50px] justify-center text-black/20"}></div>
         {!isCompact && (
             <>
               <div className={cellClass + " w-[60px] justify-center text-[13px] font-normal"}>{row.computedCallTime}</div>
               <div className={cellClass + " w-[70px] justify-center"}>
                  <CellInput 
                    value={formatDuration(row.breakDuration || 0)} 
                    onChange={val => updateRow({breakDuration: parseDuration(val)})}
                    clearOnType
                    col="duration"
                    className={`${inputClass} text-center font-bold`}
                  />
               </div>
             </>
         )}
         <div className="flex-1 flex px-3 items-center justify-center min-w-0 py-2">
            <CellInput 
              value={row.breakLabel} 
              onChange={val => updateRow({breakLabel: val})} 
              className={`${inputClass} font-bold text-center truncate max-w-full`} 
              placeholder="ENTER BREAK TEXT"
            />
         </div>
         {!isCompact && <div className={cellClass + " w-[50px] border-l border-r-0"}></div>}
      </div>
    );
  }

  if (scene) {
    const isGhostOrHasGhost = !!scene.ghostOf || scenes.some(s => s.ghostOf === scene.id);

    return (
      <div {...commonProps}>
         <Grip />
         
         <div className={cellClass + " w-[50px] justify-center relative flex-col gap-1 px-1"}>
            <CellInput 
              value={scene.sceneNumber} 
              onChange={val => updateScene({sceneNumber: val})}
              className={`${inputClass} text-center ${isGhostOrHasGhost ? 'italic font-serif opacity-80' : ''}`}
              readOnly={!textEditingEnabled && !isGhostOrHasGhost}
            />
         </div>
         
         {!isCompact && (
            <>
               <div className={cellClass + " w-[60px] justify-center text-[13px] font-normal"}>{row.computedCallTime}</div>
               <div className={cellClass + " w-[70px] justify-center"}>
                  <CellInput 
                    value={row.estimatedDuration === 0 ? '↑' : formatDuration(row.estimatedDuration || 0)} 
                    onChange={val => updateRow({estimatedDuration: parseDuration(val)})}
                    clearOnType
                    col="duration"
                    className={`${inputClass} text-center font-normal`}
                  />
               </div>
            </>
         )}

         {/* MAIN SCENE INFO */}
         <div className="flex-1 flex flex-col justify-center min-w-0 pr-3 gap-0.5 py-1.5">
            {/* Top line */}
            <div className="flex items-center w-full gap-2 text-[13px] leading-tight font-bold">
               <div className="pl-3 shrink-0 flex items-center justify-start">
                 <CellInput value={scene.intExt} onChange={val => updateScene({intExt: val as any})} className={`${inputClass} text-left`} readOnly={!textEditingEnabled} />
               </div>
               <div className="flex-1 flex items-center justify-start min-w-0 pr-2">
                 <CellInput value={scene.set} onChange={val => updateScene({set: val})} className={`${inputClass} text-left uppercase tracking-wider block max-w-full`} readOnly={!textEditingEnabled} />
               </div>
               <div className="w-[50px] shrink-0 flex items-center justify-start">
                 <CellInput value={scene.dayNight} onChange={val => updateScene({dayNight: val as any})} className={`${inputClass} text-left`} readOnly={!textEditingEnabled} />
               </div>
               <div className="w-[80px] shrink-0 flex items-center justify-end">
                 <CellInput value={scene.cast} onChange={val => updateScene({cast: val})} className={`${inputClass} text-right font-normal`} placeholder="Cast" readOnly={!textEditingEnabled} />
               </div>
            </div>
            
            {/* Description line */}
            <div className="flex items-center w-full text-[13px]">
               <div className="flex-1 font-normal min-w-0 pl-3 flex items-center justify-start">
                 <CellInput 
                   value={scene.description} 
                   onChange={val => updateScene({description: val})}
                   className={`${inputClass} text-left truncate leading-snug max-w-full`}
                   readOnly={!textEditingEnabled}
                   placeholder="Scene Description"
                 />
               </div>
            </div>
         </div>

         {!isCompact && (
            <div className={cellClass + " w-[50px] justify-center font-normal text-[13px] border-l border-r-0"}>
               {scene.pageCount}
            </div>
         )}
      </div>
    );
  }

  return null;
}
