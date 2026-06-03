import React from 'react';
import { Scene } from '../types';
import { useDraggable, useDroppable } from '@dnd-kit/core';

export const UnscheduledBlock: React.FC<{ scenes: Scene[] }> = ({ scenes }) => {
  const { setNodeRef, isOver } = useDroppable({
    id: `unscheduled_bin`,
    data: { type: 'UNSCHEDULED_BIN' }
  });

  return (
    <div className="w-80 border-l border-zinc-300 bg-white flex flex-col">
      <div className="p-3 bg-zinc-900 text-white font-bold text-[12px] uppercase tracking-wider">
        Unscheduled Scenes ({scenes.length})
      </div>
      <div 
        ref={setNodeRef} 
        className={`flex-1 overflow-auto p-2 space-y-2 transition-colors ${isOver ? 'bg-zinc-100 ring-inset ring-2 ring-blue-400' : ''}`}
      >
        {scenes.map(s => (
          <DraggableScene key={s.id} scene={s} />
        ))}
        {scenes.length === 0 && (
          <div className="text-zinc-500 text-xs p-4 text-center">All scenes scheduled.</div>
        )}
      </div>
      <div className="p-2 border-t border-zinc-200 bg-zinc-50 text-[10px] text-zinc-500 text-center uppercase tracking-wide font-bold">
         Drag scenes here to unschedule<br />Drag breaks here to delete
      </div>
    </div>
  );
}

export const DraggableScene: React.FC<{ scene: Scene, isOverlay?: boolean }> = ({ scene, isOverlay }) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: scene.id,
    data: { type: 'UNSCHEDULED_SCENE' }
  });

  return (
    <div
      ref={isOverlay ? undefined : setNodeRef}
      {...(isOverlay ? {} : listeners)}
      {...(isOverlay ? {} : attributes)}
      className={`p-2 border rounded shadow-sm text-[12px] font-sans ${isDragging && !isOverlay ? 'opacity-50' : 'bg-white border-zinc-400 hover:border-zinc-400 cursor-grab'} ${isOverlay ? 'shadow-2xl scale-105 border-zinc-900 pointer-events-none ring-2 ring-black' : ''}`}
    >
      <div className="flex font-bold mb-1 items-center gap-2">
        <span className="w-8">{scene.sceneNumber}</span>
        <span className="text-zinc-500">{scene.intExt}</span>
        <span className="text-zinc-500">{scene.dayNight}</span>
      </div>
      <div className="font-bold truncate uppercase">{scene.set}</div>
      <div className="text-zinc-500 truncate mt-1">{scene.description}</div>
    </div>
  );
}
