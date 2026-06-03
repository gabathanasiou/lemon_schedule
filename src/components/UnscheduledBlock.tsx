import React from 'react';
import { Scene, ScheduleRow } from '../types';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SortableRow } from './SortableRow';
import { useProject } from '../store';
import { generateUUID } from '../lib/utils';
import { Plus } from 'lucide-react';

export const UnscheduledBlock: React.FC<{ 
  rows: ScheduleRow[], 
  projectScenes: Scene[],
  textEditingEnabled: boolean,
  onAction?: (action: string) => void,
  contextMenu?: any,
  setContextMenu?: any
}> = ({ rows, projectScenes, textEditingEnabled }) => {
  const { state, dispatch } = useProject();
  
  const { setNodeRef } = useDroppable({
    id: 'unscheduled_bin',
    data: { type: 'UNSCHEDULED_BIN' }
  });

  const addRow = (type: 'NOTE' | 'BREAK') => {
    const activeVersion = state.present.versions.find(v => v.id === state.present.activeVersionId);
    if (!activeVersion) return;
    const newOrder = rows.length > 0 ? Math.max(...rows.map(r => r.order)) + 1 : 0;
    
    const newRow: ScheduleRow = type === 'NOTE' ? {
      id: generateUUID(),
      type: 'NOTE',
      shootDay: null,
      order: newOrder,
      noteText: ''
    } : {
      id: generateUUID(),
      type: 'BREAK',
      shootDay: null,
      order: newOrder,
      breakLabel: 'LUNCH',
      breakDuration: 60
    };

    dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, rows: [...activeVersion.rows, newRow] } });
  };

  return (
    <div className="w-[340px] bg-white border-r border-zinc-200 shadow-xl flex flex-col z-20 print:hidden relative shrink-0">
      <div className="p-4 border-b border-zinc-200 bg-zinc-50 shadow-sm sticky top-0 z-10 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-bold text-sm tracking-widest text-zinc-800">UNSCHEDULED</h2>
            <p className="text-xs text-zinc-500 mt-1">{rows.length} Items</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => addRow('NOTE')} className="flex-1 text-xs font-bold bg-white border border-zinc-300 text-zinc-600 hover:bg-zinc-100 py-1.5 rounded flex items-center justify-center gap-1 shadow-sm">
             <Plus className="w-3 h-3" /> NOTE
          </button>
          <button onClick={() => addRow('BREAK')} className="flex-1 text-xs font-bold bg-white border border-zinc-300 text-zinc-600 hover:bg-zinc-100 py-1.5 rounded flex items-center justify-center gap-1 shadow-sm">
             <Plus className="w-3 h-3" /> BREAK
          </button>
        </div>
      </div>
      
      <div id="unscheduled_rows_container" ref={setNodeRef} className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 min-h-0 bg-zinc-100 items-stretch">
        <SortableContext items={rows.map(r => r.id)} strategy={verticalListSortingStrategy}>
          {rows.map((r) => (
            <div key={r.id} className="shadow-sm rounded overflow-hidden border border-black/20">
               <SortableRow 
                 row={r}
                 scenes={projectScenes}
                 isCompact
                 textEditingEnabled={textEditingEnabled}
               />
            </div>
          ))}
        </SortableContext>
        {rows.length === 0 && (
          <div className="flex-1 flex items-center justify-center p-8 text-zinc-300 border-2 border-dashed border-zinc-200 m-2 rounded-lg font-bold text-center">
            Drop items here to unschedule
          </div>
        )}
      </div>
    </div>
  );
}
