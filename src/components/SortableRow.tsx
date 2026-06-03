import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ScheduleRow, Scene } from '../types';
import { formatDuration, parseDuration, formatPageCount } from '../lib/utils';
import { useProject } from '../store';
import { CellInput } from './CellInput';
import { X, GripVertical, Ghost } from 'lucide-react';

export const SortableRow: React.FC<{ 
  row: ScheduleRow & { computedCallTime?: string, computedElapsed?: number }, 
  scenes: Scene[], 
  isOverlay?: boolean,
  isSelected?: boolean,
  onSelectToggle?: (e: React.MouseEvent) => void
}> = ({ row, scenes, isOverlay, isSelected, onSelectToggle }) => {
  const { state, dispatch } = useProject();
  const activeVersionId = state.present.activeVersionId;

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.id,
    data: row
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: isOverlay ? 'none' : transition,
    zIndex: isDragging || isOverlay ? 999 : 'auto',
    opacity: isDragging && !isOverlay ? 0.3 : 1,
    boxShadow: isOverlay ? '0 10px 20px rgba(0,0,0,0.3)' : 'none',
  };

  const updateRow = (updates: Partial<ScheduleRow>) => {
    if (!activeVersionId) return;
    const version = state.present.versions.find(v => v.id === activeVersionId);
    if (!version) return;
    const newRows = version.rows.map(r => r.id === row.id ? { ...r, ...updates } : r);
    dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersionId, rows: newRows } });
  };

  const updateScene = (updates: Partial<Scene>) => {
    if (row.type === 'SCENE' && row.sceneId) {
      dispatch({ type: 'UPDATE_SCENE', payload: { id: row.sceneId, ...updates } });
    }
  };

  const removeRow = () => {
    if (!activeVersionId) return;
    const version = state.present.versions.find(v => v.id === activeVersionId);
    if (!version) return;
    const newRows = version.rows.filter(r => r.id !== row.id);
    dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersionId, rows: newRows } });
  };

  const scene = row.type === 'SCENE' ? scenes.find(s => s.id === row.sceneId) : null;

  // Colors based on image
  let bgClass = "bg-white text-zinc-900";
  let inputClass = "bg-transparent focus:bg-white focus:text-black focus:ring-1 focus:ring-black outline-none w-full"; // text inputs
  
  if (row.type === 'BREAK') {
    bgClass = "bg-[#712a2a] text-white";
    inputClass = "bg-transparent focus:bg-white focus:text-black outline-none w-full";
  } else if (row.type === 'NOTE') {
    bgClass = "bg-[#fffce8] text-zinc-900 border-b border-[#e6de9c]";
    inputClass = "bg-transparent focus:bg-white focus:text-black outline-none w-full text-center py-1";
  } else if (scene) {
    const ext = scene.intExt.toUpperCase().includes('EXT');
    const night = scene.dayNight.toUpperCase().includes('NIGHT');
    
    // Very literal matching to screenshot
    if (!ext && night) bgClass = "bg-[#0b1cdb] text-white border-b-2 border-[#0915a3]"; // Blue
    else if (ext && night) bgClass = "bg-[#80a135] text-white border-b-2 border-[#6d8a2a]"; // Green 
    else if (!ext && !night) bgClass = "bg-[#e8dcb8] text-black border-b-2 border-[#d0c5a3]"; // INT DAY Sand
    else bgClass = "bg-[#8ab33b] text-white border-b-2 border-[#769a30]"; // EXT DAY Green
    
    // Override text color logic
    if (bgClass.includes('text-white')) {
       inputClass = "bg-transparent focus:bg-white focus:text-black outline-none w-full text-white";
    }
  }
  
  // Custom cell class for tighter spreadsheet
  const cellClass = `px-2 flex items-center min-w-0 ${row.type !== 'SCENE' ? (bgClass.includes('text-white') ? 'border-r border-white/20' : 'border-r border-black/10') : ''}`;

  const commonProps = {
    ref: setNodeRef,
    style,
    onClick: onSelectToggle,
    ...listeners,
    ...attributes,
    'data-row-id': row.id,
    'data-shoot-day': row.shootDay,
    className: `${bgClass} flex items-stretch group relative transition-colors text-[12px] font-bold tracking-tight min-h-[38px] font-sans border-b border-black/20 ${isOverlay ? 'scale-[1.02] shadow-2xl cursor-grabbing ring-2 ring-black' : ''} ${isSelected ? 'ring-2 ring-blue-500 z-50' : ''}`
  };

  const Grip = () => (
    <div className="w-[8px] flex flex-col items-center justify-center shrink-0 z-10 transition-colors opacity-0 group-hover:opacity-100 bg-black/10 text-white cursor-grab active:cursor-grabbing">
    </div>
  );

  const RemoveBtn = () => (
    <button onClick={removeRow} className="absolute right-0 top-0 bottom-0 px-2 bg-red-600 text-white opacity-0 group-hover:opacity-100 transition-opacity z-10 hover:bg-red-500">
      <X className="w-4 h-4" />
    </button>
  );

  if (row.type === 'BREAK') {
    return (
      <div {...commonProps}>
         <Grip />
         <div className={cellClass + " w-[50px] justify-center"}>{/* Scene # */}</div>
         <div className={cellClass + " w-[60px] justify-center text-[13px] font-normal"}>{row.computedCallTime}</div>
         <div className={cellClass + " w-[70px] justify-center"}>
            <CellInput 
              value={formatDuration(row.breakDuration || 0)} 
              onChange={val => updateRow({breakDuration: parseDuration(val)})}
              clearOnType
              col="duration"
              className={`${inputClass} text-center`}
            />
         </div>
         <div className={cellClass + " w-[50px]"}>{/* Pages */}</div>
         <div className={cellClass + " flex-1 justify-center px-4"}>
            <CellInput 
              value={row.breakLabel} 
              onChange={val => updateRow({breakLabel: val})}
              className={`${inputClass} text-center uppercase tracking-widest font-bold`}
            />
         </div>
         {row.breakLabel?.toLowerCase().includes('lunch') && (
            <div className={cellClass + " w-[100px] justify-end font-normal opacity-90 pr-6"}>
              {formatDuration(row.computedElapsed || 0)}
            </div>
         )}
         <RemoveBtn />
      </div>
    );
  }

  if (row.type === 'NOTE') {
    return (
      <div {...commonProps}>
         <Grip />
         <div className={cellClass + " w-[50px] justify-center"}>{/* Scene # */}</div>
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
         <div className="flex-1 flex px-2 items-center">
            <CellInput 
              value={row.noteText} 
              onChange={val => updateRow({noteText: val})}
              className={inputClass}
              placeholder="Add note..."
            />
         </div>
         <RemoveBtn />
      </div>
    );
  }

  if (scene) {
    return (
      <div {...commonProps}>
         <Grip />
         
         <div className={cellClass + " w-[50px] justify-center relative"}>
            {scene.ghostOf && <Ghost className="w-3 h-3 absolute top-[2px] right-[2px] opacity-70" title="Ghost Scene (Duplicate)" />}
            <CellInput 
              value={scene.sceneNumber} 
              onChange={val => updateScene({sceneNumber: val})}
              className={`${inputClass} text-center font-bold text-[14px]`}
            />
         </div>
         
         {/* Call Time */}
         <div className={cellClass + " w-[60px] justify-center text-[13px] font-normal"}>
            {row.computedCallTime}
         </div>
         
         <div className={cellClass + " w-[70px] justify-center"}>
            <CellInput 
              value={row.estimatedDuration === 0 ? '↑' : formatDuration(row.estimatedDuration || 0)} 
              onChange={val => updateRow({estimatedDuration: parseDuration(val)})}
              clearOnType
              col="duration"
              className={`${inputClass} text-center font-normal`}
            />
         </div>
         
         <div className={cellClass + " w-[50px] justify-center"}>
            <CellInput 
              value={scene.pageCount} 
              onChange={val => updateScene({pageCount: val})}
              className={`${inputClass} text-center font-normal`}
            />
         </div>

         {/* MAIN SCENE INFO */}
         <div className="flex-1 flex flex-col justify-center min-w-0 pr-3 gap-0.5">
            {/* Top line */}
            <div className="flex items-center w-full gap-2 text-[13px] leading-tight font-bold">
               <div className="w-[50px] pl-3">
                 <CellInput value={scene.intExt} onChange={val => updateScene({intExt: val as any})} className={`${inputClass} text-left`} />
               </div>
               <div className="flex-1 uppercase font-bold pr-4">
                 <CellInput value={scene.set} onChange={val => updateScene({set: val})} className={`${inputClass} text-left uppercase tracking-wider`} />
               </div>
               <div className="w-[100px] flex-none">
                 <CellInput value={scene.dayNight} onChange={val => updateScene({dayNight: val as any})} className={`${inputClass} text-left`} />
               </div>
               <div className="w-[80px] text-right">
                 <CellInput value={scene.cast} onChange={val => updateScene({cast: val})} className={`${inputClass} w-[80px] text-right font-normal`} placeholder="Cast" />
               </div>
            </div>
            
            {/* Bottom line: Description */}
            <div className="flex items-center w-full gap-2 text-[13px]">
               <div className="w-[50px] pl-3" />
               <div className="flex-1 font-normal">
                 <CellInput 
                   value={scene.description} 
                   onChange={val => updateScene({description: val})}
                   className={`${inputClass} w-full text-left`}
                 />
               </div>
            </div>
         </div>
      </div>
    );
  }

  return null;
}
