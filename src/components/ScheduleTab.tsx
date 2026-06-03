import React, { useMemo, useState } from 'react';
import { useProject } from '../store';
import { Scene, ScheduleRow } from '../types';
import { generateUUID } from '../lib/utils';
import { DndContext, closestCorners, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent, DragOverlay, DragStartEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { DayBlock } from './DayBlock';
import { UnscheduledBlock, DraggableScene } from './UnscheduledBlock';
import { SortableRow } from './SortableRow';

export function ScheduleTab() {
  const { state, dispatch } = useProject();
  const project = state.present;
  const activeVersion = project.versions.find(v => v.id === project.activeVersionId);
  const rows = activeVersion?.rows || [];

  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<string | null>(null);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, rowId: string, shootDay: number } | null>(null);

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
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const scheduledRows = useMemo(() => {
    const days: Record<number, ScheduleRow[]> = {};
    for (const r of rows) {
      if (!days[r.shootDay]) days[r.shootDay] = [];
      days[r.shootDay].push(r);
    }
    Object.keys(days).forEach(key => {
      days[Number(key)].sort((a, b) => a.order - b.order);
    });
    return days;
  }, [rows]);

  const existingDays = useMemo(() => {
    const dayMetaMap = activeVersion?.dayMeta || {};
    return Object.keys(dayMetaMap)
      .map(Number)
      .sort((a, b) => {
         const orderA = dayMetaMap[a]?.order ?? dayMetaMap[a]?.shootDay ?? a;
         const orderB = dayMetaMap[b]?.order ?? dayMetaMap[b]?.shootDay ?? b;
         return orderA - orderB;
      });
  }, [activeVersion]);

  const unscheduledScenes = useMemo(() => {
    const scheduledSceneIds = new Set(rows.map(r => r.sceneId).filter(Boolean));
    return project.scenes.filter(s => !scheduledSceneIds.has(s.id));
  }, [rows, project.scenes]);

  const handleDragStart = (e: DragStartEvent) => {
    setActiveId(e.active.id as string);
    setActiveType(e.active.data.current?.type || null);
  };

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    setActiveType(null);
    const { active, over } = e;
    if (!over || !activeVersion) return;

    const activeId = active.id as string;
    const overId = over.id as string;
    
    // Case 1: Reordering Days
    if (active.data.current?.type === 'DAY') {
       if (activeId !== overId && over.data.current?.type === 'DAY') {
          const oldIndex = existingDays.indexOf(active.data.current.day);
          const newIndex = existingDays.indexOf(over.data.current.day);
          const newDaysArray = arrayMove(existingDays, oldIndex, newIndex) as number[];
          
          const newDayMeta = { ...activeVersion.dayMeta };
          newDaysArray.forEach((dayId, index) => {
             if (!newDayMeta[dayId]) newDayMeta[dayId] = { shootDay: dayId, unitCall: '08:00', date: '' };
             newDayMeta[dayId] = { ...newDayMeta[dayId], order: index };
          });
          dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, dayMeta: newDayMeta } });
       }
       return;
    }

    // Case 2: Dropping scene back to Unscheduled Box
    if (overId === 'unscheduled_bin' && active.data.current?.type !== 'UNSCHEDULED_SCENE') {
       // Remove from schedule
       const newRows = rows.filter(r => r.id !== activeId);
       dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, rows: newRows } });
       return;
    }

    // Case 3: Dragging from Unscheduled to Schedule
    if (active.data.current?.type === 'UNSCHEDULED_SCENE') {
      const targetDayResult = getDayFromId(overId);
      if (targetDayResult !== null) {
        // Create new row
        const newRow: ScheduleRow = {
          id: generateUUID(),
          type: 'SCENE',
          shootDay: targetDayResult,
          order: 9999 + Math.random(), // put at end, then re-sort
          sceneId: activeId,
          estimatedDuration: 60
        };
        const updatedRows = [...rows, newRow];
        const finalRows = reorderDay(updatedRows, targetDayResult, newRow.id, overId);
        dispatch({
          type: 'UPDATE_VERSION',
          payload: { id: activeVersion.id, rows: finalRows }
        });
      }
      return;
    }

    // Case 4: Moving existing rows around timeline
    const activeRow = rows.find(r => r.id === activeId);
    if (!activeRow) return;

    const overDay = getDayFromId(overId);
    if (overDay === null) return; // Dropped in invalid place

    let draggingIds = [activeId];
    if (selectedRowIds.has(activeId) && selectedRowIds.size > 1) {
       draggingIds = Array.from(selectedRowIds);
       // Sort top to bottom
       draggingIds.sort((a, b) => {
          const rA = rows.find(r => r.id === a);
          const rB = rows.find(r => r.id === b);
          if (rA && rB) {
             if (rA.shootDay !== rB.shootDay) return rA.shootDay - rB.shootDay;
             return rA.order - rB.order;
          }
          return 0;
       });
    }

    let newRows = [...rows];
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
      // Multi-select drag logic
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
      setSelectedRowIds(new Set()); // clear after custom multi dnd
    }

    dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, rows: newRows } });
  };

  const getDayFromId = (id: string): number | null => {
    if (id.startsWith('day-')) return parseInt(id.replace('day-', ''), 10);
    const row = rows.find(r => r.id === id);
    return row ? row.shootDay : null;
  };

  const handleContextMenuAction = (action: string) => {
    if (!contextMenu || !activeVersion) return;
    const { rowId, shootDay } = contextMenu;
    const rowIndex = rows.findIndex(r => r.id === rowId);
    if (rowIndex === -1) return;
    const row = rows[rowIndex];

    let newRows = [...rows];
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
       if (a.shootDay !== b.shootDay) return a.shootDay - b.shootDay;
       return a.order - b.order;
    });
    newRows.forEach((r, i) => r.order = i); // re-normalize

    dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, rows: newRows } });
    setContextMenu(null);
  };

  const reorderDay = (allRows: ScheduleRow[], day: number, activeId: string, overId: string) => {
    let dayRows = allRows.filter(r => r.shootDay === day).sort((a, b) => a.order - b.order);
    const activeIndex = dayRows.findIndex(r => r.id === activeId);
    const overIndex = dayRows.findIndex(r => r.id === overId);

    if (activeIndex !== -1 && overIndex !== -1) {
      dayRows = arrayMove(dayRows, activeIndex, overIndex);
    } else if (activeIndex !== -1 && overId.startsWith('day-')) {
       dayRows = arrayMove(dayRows, activeIndex, dayRows.length-1);
    }

    dayRows.forEach((r, i) => r.order = i);
    const otherRows = allRows.filter(r => r.shootDay !== day);
    return [...otherRows, ...dayRows];
  };

  const handleAddDay = () => {
    if (!activeVersion) return;
    const allDays = Object.keys(activeVersion.dayMeta).map(Number);
    const newDay = allDays.length > 0 ? Math.max(...allDays) + 1 : 1;
    const newMeta = { ...activeVersion.dayMeta, [newDay]: { shootDay: newDay, unitCall: '08:00', date: `Day ${newDay}`, order: existingDays.length } };
    dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, dayMeta: newMeta } });
  };

  const activeDragRow = activeId ? rows.find(r => r.id === activeId) : null;
  const activeUnscheduledScene = activeType === 'UNSCHEDULED_SCENE' && activeId ? project.scenes.find(s => s.id === activeId) : null;

  return (
    <DndContext 
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div 
         className="flex-1 flex overflow-hidden bg-zinc-200/50 relative"
         onClick={() => setContextMenu(null)}
         onContextMenu={(e) => {
             const rowEl = (e.target as HTMLElement).closest('[data-row-id]');
             if (rowEl) {
                e.preventDefault();
                const rowId = rowEl.getAttribute('data-row-id')!;
                const shootDay = parseInt(rowEl.getAttribute('data-shoot-day')!, 10);
                setContextMenu({ x: e.clientX, y: e.clientY, rowId, shootDay });
             } else {
                setContextMenu(null);
             }
         }}
      >
        
        {/* Main Schedule Area */}
        <div className="flex-1 overflow-auto flex flex-col items-center p-8 pb-32">
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
                />
              ))}
            </SortableContext>
            
            <button 
              onClick={handleAddDay}
              className="w-full py-4 border-2 border-dashed border-zinc-400 bg-white/50 text-zinc-500 rounded-lg hover:bg-white transition-colors font-bold text-sm"
            >
              + ADD NEW SHOOT DAY
            </button>
          </div>
        </div>

        {/* Unscheduled Bin Panel */}
        <UnscheduledBlock scenes={unscheduledScenes} />
        
      </div>
      
      <DragOverlay dropAnimation={null}>
        {activeDragRow ? (
          <div className="w-[1024px] max-w-4xl pointer-events-none relative">
            <SortableRow row={activeDragRow as any} scenes={project.scenes} isOverlay />
            {selectedRowIds.size > 1 && selectedRowIds.has(activeId as string) && (
               <div className="absolute -top-3 -right-3 bg-blue-500 text-white font-bold px-3 py-1 rounded-full shadow-lg text-sm border-2 border-white">
                 +{selectedRowIds.size - 1} selected
               </div>
            )}
          </div>
        ) : activeUnscheduledScene ? (
          <div className="w-[1024px] max-w-4xl pointer-events-none">
            <SortableRow 
              row={{
                id: activeUnscheduledScene.id,
                type: 'SCENE',
                shootDay: 0,
                order: 0,
                sceneId: activeUnscheduledScene.id,
                estimatedDuration: 0,
                computedCallTime: '--:--'
              } as any}
              scenes={[activeUnscheduledScene]} 
              isOverlay 
            />
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
