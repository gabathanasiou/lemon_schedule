import React, { useState } from 'react';
import { useProject } from '../store';
import { DndContext, closestCorners, PointerSensor, useSensor, useSensors, DragEndEvent, DragOverlay, DragStartEvent, CollisionDetection } from '@dnd-kit/core';
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { DayBlock } from './DayBlock';
import { UnscheduledBlock } from './UnscheduledBlock';
import { SortableRow } from './SortableRow';
import { generateUUID } from '../lib/utils';
import { ScheduleRow, Scene } from '../types';

// Custom pointer-based collision detection
const customCollisionDetection: CollisionDetection = (args) => {
  const { active, pointerCoordinates, droppableContainers } = args;

  // Filter droppable containers based on what we are dragging to avoid mismatch/flickering
  const isDraggingDay = active.data.current?.type === 'DAY';
  const filteredContainers = droppableContainers.filter((container) => {
    const isDayWrap = (container.id as string).startsWith('day-wrap-');
    if (isDraggingDay) {
      return isDayWrap;
    } else {
      return !isDayWrap;
    }
  });

  if (pointerCoordinates) {
    const collisions: { id: string; distance: number; area: number }[] = [];

    for (const container of filteredContainers) {
      const rect = container.rect.current;
      if (rect) {
        // Calculate the shortest distance from pointer to the bounding box
        const dx = Math.max(rect.left - pointerCoordinates.x, 0, pointerCoordinates.x - rect.right);
        const dy = Math.max(rect.top - pointerCoordinates.y, 0, pointerCoordinates.y - rect.bottom);
        const distance = Math.sqrt(dx * dx + dy * dy);
        const area = rect.width * rect.height;
        collisions.push({ id: container.id as string, distance, area });
      }
    }

    // Sort by distance first (closest first).
    // If distances are equal (e.g. pointer is inside multiple containers),
    // sort by area (smaller area first, so nested items like rows are preferred over day blocks).
    collisions.sort((a, b) => {
      if (a.distance !== b.distance) {
        return a.distance - b.distance;
      }
      return a.area - b.area;
    });

    if (collisions.length > 0) {
      return collisions.map(c => ({ id: c.id }));
    }
  }

  // Fallback to closestCorners with filtered containers if no pointer coordinates
  return closestCorners({
    ...args,
    droppableContainers: filteredContainers,
  });
};

export function ScheduleTab() {
  const { state, dispatch } = useProject();
  const project = state.present;
  const activeVersion = project.versions.find(v => v.id === project.activeVersionId);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<string | null>(null);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, rowId: string, shootDay: number | null } | null>(null);
  const [textEditingEnabled, setTextEditingEnabled] = useState(false);

  const handleRowClick = (id: string, e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey) {
      e.stopPropagation();
      setSelectedRowIds(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      });
    } else {
      if (selectedRowIds.size > 0 && (e.target as HTMLElement).tagName !== 'INPUT') {
         setSelectedRowIds(new Set());
      }
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: textEditingEnabled ? 999999 : 5 } })
  );

  if (!activeVersion) return <div>No active version</div>;

  const sceneIdsInRows = new Set(activeVersion.rows.filter(r => r.type === 'SCENE').map(r => r.sceneId));
  const missingScenesInRows = project.scenes.filter(s => !sceneIdsInRows.has(s.id));
  
  const augmentedRows = [
    ...activeVersion.rows,
    ...missingScenesInRows.map((s, i) => ({
      id: `row-synth-${s.id}`,
      type: 'SCENE' as const,
      sceneId: s.id,
      shootDay: null,
      order: 999999 + i,
      estimatedDuration: 30
    }))
  ];

  const scheduledRows = augmentedRows.reduce((acc, row) => {
    if (row.shootDay !== null) {
      if (!acc[row.shootDay]) acc[row.shootDay] = [];
      acc[row.shootDay].push(row);
    }
    return acc;
  }, {} as Record<number, ScheduleRow[]>);

  (Object.values(scheduledRows) as ScheduleRow[][]).forEach(dayRows => {
    dayRows.sort((a, b) => a.order - b.order);
  });

  const unscheduledRows = augmentedRows.filter(r => r.shootDay === null).sort((a, b) => a.order - b.order);

  const existingDays = Array.from(new Set([
    ...augmentedRows.map(r => r.shootDay).filter((d): d is number => d !== null),
    ...(activeVersion.dayMeta ? Object.keys(activeVersion.dayMeta).map(Number) : [])
  ]));
  existingDays.sort((a, b) => a - b);

  const getDayFromId = (id: string): number | null => {
    if (id.startsWith('day-wrap-') || id.startsWith('day-')) {
      return parseInt(id.replace('day-wrap-', '').replace('day-', ''), 10);
    }
    const row = augmentedRows.find(r => r.id === id);
    return row ? row.shootDay : null;
  };

  const handleContextMenuAction = (action: string) => {
    if (!contextMenu || !activeVersion) return;
    const { rowId, shootDay } = contextMenu;
    const rowIndex = augmentedRows.findIndex(r => r.id === rowId);
    if (rowIndex === -1) return;
    const row = augmentedRows[rowIndex];

    let newRows = [...augmentedRows];
    if (action === 'add_note') {
      const newRow: ScheduleRow = {
        id: generateUUID(),
        type: 'NOTE',
        shootDay,
        order: row.order + 0.5,
        noteText: ''
      };
      newRows.push(newRow);
    } else if (action === 'add_break') {
      const newRow: ScheduleRow = {
        id: generateUUID(),
        type: 'BREAK',
        shootDay,
        order: row.order + 0.5,
        breakLabel: 'LUNCH',
        breakDuration: 60
      };
      newRows.push(newRow);
    } else if (action === 'duplicate' && row.type === 'SCENE') {
      const newRow: ScheduleRow = {
        ...row,
        id: generateUUID(),
        order: row.order + 0.5,
      };
      const originalScene = project.scenes.find(s => s.id === row.sceneId);
      if (originalScene) {
         const newScene: Scene = { ...originalScene, id: generateUUID(), ghostOf: originalScene.id };
         newRow.sceneId = newScene.id;
         dispatch({ type: 'ADD_SCENE', payload: newScene });
      }
      newRows.push(newRow);
    } else if (action === 'delete') {
      newRows = newRows.filter(r => r.id !== rowId);
    }

    newRows = newRows.sort((a, b) => {
       if (a.shootDay === null && b.shootDay !== null) return 1;
       if (a.shootDay !== null && b.shootDay === null) return -1;
       if (a.shootDay !== b.shootDay) return (a.shootDay || 0) - (b.shootDay || 0);
       return a.order - b.order;
    });
    newRows.forEach((r, i) => r.order = i); // re-normalize

    dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, rows: newRows } });
    setContextMenu(null);
  };

  const reorderDay = (allRows: ScheduleRow[], day: number | null, activeId: string, overId: string) => {
    let dayRows = allRows.filter(r => r.shootDay === day).sort((a, b) => a.order - b.order);
    const activeIndex = dayRows.findIndex(r => r.id === activeId);
    const overIndex = dayRows.findIndex(r => r.id === overId);
    
    if (activeIndex !== -1 && overIndex !== -1) {
      dayRows = arrayMove(dayRows, activeIndex, overIndex);
      dayRows.forEach((r, i) => r.order = i);
      return [...allRows.filter(r => r.shootDay !== day), ...dayRows];
    }
    return allRows;
  };

  const handleDragStart = (e: DragStartEvent) => {
    setActiveId(e.active.id as string);
    setActiveType(e.active.data.current?.type || null);
  };

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    setActiveId(null);
    setActiveType(null);
    
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    if (activeId === overId) return;

    // Day dragging logic
    if (active.data.current?.type === 'DAY') {
      const activeDay = parseInt(activeId.replace('day-wrap-', ''), 10);
      const overDay = getDayFromId(overId);
      
      if (overDay !== null && activeDay !== overDay) {
         let newRows = [...augmentedRows];
         newRows = newRows.map(r => {
           if (r.shootDay === activeDay) return { ...r, shootDay: -1 }; 
           if (r.shootDay === overDay) return { ...r, shootDay: activeDay };
           return r;
         }).map(r => r.shootDay === -1 ? { ...r, shootDay: overDay } : r);
         
         const newMeta = { ...activeVersion.dayMeta };
         const tempMeta = newMeta[activeDay];
         newMeta[activeDay] = newMeta[overDay];
         newMeta[overDay] = tempMeta;

         dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, rows: newRows, dayMeta: newMeta } });
      }
      return;
    }

    const activeRow = augmentedRows.find(r => r.id === activeId);
    
    if (!activeRow) return;

    let overDay = getDayFromId(overId);
    if (overId === 'unscheduled_bin' || (overDay === null && augmentedRows.some(r => r.id === overId && r.shootDay === null))) {
      overDay = null; // explicit drop to unscheduled
    } else if (overDay === null && !overId.startsWith('day-')) {
      return; // invalid drop
    }

    let draggingIds = [activeId];
    if (selectedRowIds.has(activeId) && selectedRowIds.size > 1) {
       draggingIds = Array.from(selectedRowIds);
       draggingIds.sort((a, b) => {
          const rA = augmentedRows.find(r => r.id === a);
          const rB = augmentedRows.find(r => r.id === b);
          if (rA && rB) {
             if (rA.shootDay !== rB.shootDay) return (rA.shootDay || 0) - (rB.shootDay || 0);
             return rA.order - rB.order;
          }
          return 0;
       });
    }

    let newRows = [...augmentedRows];
    
    // helper to clean synth IDs when saving
    const sanitizeRow = (r: ScheduleRow) => {
       if (r.id.startsWith('row-synth-')) {
          return { ...r, id: generateUUID() };
       }
       return r;
    }

    if (draggingIds.length === 1) {
      if (activeRow.shootDay === overDay) {
        newRows = reorderDay(newRows, overDay, activeId, overId);
      } else {
        const movedRow = { ...activeRow, shootDay: overDay };
        newRows = newRows.filter(r => r.id !== activeId);
        newRows.push(movedRow);
        newRows = reorderDay(newRows, overDay, activeId, overId);
      }
    } else {
      const draggingItems = draggingIds.map(id => newRows.find(r => r.id === id)!).filter(Boolean);
      newRows = newRows.filter(r => !draggingIds.includes(r.id));
      
      let dayRows = newRows.filter(r => r.shootDay === overDay).sort((a, b) => a.order - b.order);
      const overIndex = dayRows.findIndex(r => r.id === overId);
      
      let insertIndex = dayRows.length;
      if (overIndex !== -1) {
         insertIndex = overIndex;
      } else if (overId.startsWith('day-')) {
         insertIndex = dayRows.length;
      }
      
      const newItems = draggingItems.map(item => ({ ...item, shootDay: overDay }));
      dayRows.splice(insertIndex, 0, ...newItems);
      
      dayRows.forEach((r, i) => r.order = i);
      newRows = [...newRows.filter(r => r.shootDay !== overDay), ...dayRows];
      setSelectedRowIds(new Set());
    }

    // Convert synthetic rows that got modified into real rows
    const persistentRows = newRows.map(sanitizeRow);
    dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, rows: persistentRows } });
  };

  const activeDragRow = activeId && activeType === 'ROW' ? augmentedRows.find(r => r.id === activeId) : null;

  return (
    <DndContext 
      sensors={sensors}
      collisionDetection={customCollisionDetection}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div 
         className="flex-1 flex overflow-hidden bg-zinc-200/50 relative min-h-0"
         onClick={() => setContextMenu(null)}
         onContextMenu={(e) => {
             const rowEl = (e.target as HTMLElement).closest('[data-row-id]');
             if (rowEl) {
                e.preventDefault();
                const rowId = rowEl.getAttribute('data-row-id')!;
                const shootDayAttr = rowEl.getAttribute('data-shoot-day');
                const shootDay = shootDayAttr === 'null' ? null : parseInt(shootDayAttr!, 10);
                setContextMenu({ x: e.clientX, y: e.clientY, rowId, shootDay });
             } else {
                setContextMenu(null);
             }
         }}
      >
        <UnscheduledBlock rows={unscheduledRows} projectScenes={project.scenes} textEditingEnabled={textEditingEnabled} onAction={handleContextMenuAction} contextMenu={contextMenu} setContextMenu={setContextMenu} />
        
        {/* Main Schedule Area */}
        <div className="flex-1 overflow-auto flex flex-col items-center p-8 pb-32">
          
          <div className="w-full max-w-4xl flex justify-between items-center mb-6">
             <h2 className="text-xl font-bold">Schedule Breakdown</h2>
             <button 
                onClick={() => setTextEditingEnabled(p => !p)}
                className={`px-4 py-2 rounded text-sm font-bold shadow-sm transition-all focus:outline-none flex items-center gap-2 ${textEditingEnabled ? 'bg-blue-500 text-white shadow-blue-500/30' : 'bg-white border border-zinc-300 text-zinc-600 hover:bg-zinc-50'}`}
             >
                <div className={`w-2 h-2 rounded-full ${textEditingEnabled ? 'bg-white' : 'bg-transparent border border-zinc-400'}`}></div>
                TEXT EDITING
             </button>
          </div>

          <div className="w-full max-w-4xl space-y-12">
            <SortableContext items={existingDays.map(d => `day-wrap-${d}`)} strategy={verticalListSortingStrategy}>
              {existingDays.map(dayInt => (
                <DayBlock 
                  key={dayInt} 
                  dayInt={dayInt} 
                  rows={scheduledRows[dayInt] || []}
                  meta={activeVersion?.dayMeta[dayInt]}
                  selectedIds={selectedRowIds}
                  onRowClick={handleRowClick}
                  textEditingEnabled={textEditingEnabled}
                />
              ))}
            </SortableContext>

            <div className="flex justify-center mt-8">
               <button 
                 onClick={() => {
                   const nextDay = existingDays.length > 0 ? Math.max(...existingDays) + 1 : 1;
                   dispatch({
                     type: 'UPDATE_VERSION',
                     payload: { id: activeVersion.id, dayMeta: { ...activeVersion.dayMeta, [nextDay]: { shootDay: nextDay, unitCall: '08:00', date: '' } } }
                   });
                 }}
                 className="bg-black text-white px-8 py-3 rounded-full font-bold shadow-lg shadow-black/20 hover:scale-105 transition-transform"
               >
                 + ADD SHOOT DAY
               </button>
            </div>
          </div>
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {activeDragRow ? (
          <div className="w-[1024px] max-w-4xl pointer-events-none relative shadow-2xl">
            <SortableRow row={activeDragRow as any} scenes={project.scenes} isOverlay textEditingEnabled={textEditingEnabled} />
            {selectedRowIds.size > 1 && selectedRowIds.has(activeId as string) && (
               <div className="absolute -top-3 -right-3 bg-blue-500 text-white font-bold px-3 py-1 rounded-full shadow-lg text-sm border-2 border-white">
                 +{selectedRowIds.size - 1} selected
               </div>
            )}
          </div>
        ) : activeType === 'DAY' ? (
          <div className="bg-white shadow-2xl border-4 border-blue-500 w-full max-w-4xl h-32 rounded flex items-center justify-center font-bold text-lg opacity-90 scale-105 pointer-events-none">
             Moving Shoot Day...
          </div>
        ) : null}
      </DragOverlay>

      {/* Context Menu */}
      {contextMenu && (
        <div 
          className="fixed bg-white border border-zinc-200 shadow-xl rounded py-1 z-[9999] text-sm font-semibold text-zinc-700 min-w-[160px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
           <button onClick={() => handleContextMenuAction('add_note')} className="w-full text-left px-4 py-2 hover:bg-zinc-100 transition-colors">Add Note Below</button>
           <button onClick={() => handleContextMenuAction('add_break')} className="w-full text-left px-4 py-2 hover:bg-zinc-100 transition-colors">Add Break Below</button>
           <div className="h-[1px] bg-zinc-200 my-1"></div>
           <button onClick={() => handleContextMenuAction('duplicate')} className="w-full text-left px-4 py-2 hover:bg-zinc-100 transition-colors">Duplicate (Ghost Scene)</button>
           <div className="h-[1px] bg-zinc-200 my-1"></div>
           <button onClick={() => handleContextMenuAction('delete')} className="w-full text-left px-4 py-2 hover:bg-red-50 text-red-600 transition-colors">Delete Row</button>
        </div>
      )}
    </DndContext>
  );
}
