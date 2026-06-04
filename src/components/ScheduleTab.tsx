import React, { useState } from 'react';
import { useProject } from '../store';
import { DndContext, closestCorners, PointerSensor, useSensor, useSensors, DragEndEvent, DragOverlay, DragStartEvent, DragOverEvent, CollisionDetection } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { DayBlock } from './DayBlock';
import { UnscheduledBlock } from './UnscheduledBlock';
import { SortableRow } from './SortableRow';
import { generateUUID } from '../lib/utils';
import { ScheduleRow, Scene, ShootDayMeta } from '../types';

// Custom pointer-based collision detection
const customCollisionDetection: CollisionDetection = (args) => {
  const { active, pointerCoordinates, droppableContainers } = args;

  const isDraggingDay = active.data.current?.type === 'DAY_BREAK';
  if (isDraggingDay) {
    return closestCorners(args);
  }

  const filteredContainers = droppableContainers.filter((container) => {
    const isDayWrap = (container.id as string).startsWith('day-wrap-');
    return !isDayWrap;
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
  const [insertBeforeId, setInsertBeforeId] = useState<string | null>(null);
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
    ...Object.keys(activeVersion.dayMeta || {}).map(Number),
  ])).sort((a, b) => {
    const dateA = activeVersion.dayMeta?.[a]?.date || '';
    const dateB = activeVersion.dayMeta?.[b]?.date || '';
    return dateA.localeCompare(dateB);
  });

  const getDayFromId = (id: string): number | null => {
    if (id.startsWith('day-break-')) {
      return parseInt(id.replace('day-break-', ''), 10);
    }
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

    let newRows = augmentedRows.map(r => ({ ...r }));
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
        const baseNumber = originalScene.sceneNumber.replace(/[A-Z]+$/, '');
        const existingLetters = project.scenes
          .filter(s => s.id !== originalScene.id && s.sceneNumber.match(new RegExp('^' + baseNumber + '[A-Z]$')))
          .map(s => s.sceneNumber.slice(-1));
        let nextLetter = 'A';
        for (let code = 65; code <= 90; code++) {
          const letter = String.fromCharCode(code);
          if (!existingLetters.includes(letter)) {
            nextLetter = letter;
            break;
          }
        }
        const newScene: Scene = {
          ...originalScene,
          id: generateUUID(),
          sceneNumber: baseNumber + nextLetter
        };
        newRow.sceneId = newScene.id;
        dispatch({ type: 'ADD_SCENE', payload: newScene });
      }
      newRows.push(newRow);
    } else if (action === 'add_day_break') {
      if (shootDay === null) { setContextMenu(null); return; }
      const nextDay = shootDay + 1;
      const insertOrder = row.order + 0.5;
      const breakRow: ScheduleRow = {
        id: generateUUID(),
        type: 'DAY_BREAK',
        shootDay: nextDay,
        order: insertOrder
      };
      newRows = newRows.map(r => {
        if (r.id === rowId) return r;
        if (r.shootDay === shootDay && r.order > row.order) return { ...r, shootDay: nextDay };
        if (r.shootDay >= nextDay) return { ...r, shootDay: r.shootDay + 1 };
        return r;
      });
      newRows.push(breakRow);
      const newDayMeta: Record<number, any> = {};
      for (const [k, val] of Object.entries(activeVersion.dayMeta || {}) as [string, ShootDayMeta][]) {
        const kn = Number(k);
        if (kn >= nextDay) newDayMeta[kn + 1] = { ...val, shootDay: kn + 1 };
        else newDayMeta[kn] = val;
      }
      const lastDate = activeVersion.dayMeta?.[shootDay]?.date || '';
      let date = '';
      if (lastDate) {
        const d = new Date(lastDate + 'T00:00:00');
        d.setDate(d.getDate() + 1);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        date = `${y}-${m}-${day}`;
      }
      newDayMeta[nextDay] = { shootDay: nextDay, unitCall: '08:00', date };
      dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, rows: newRows, dayMeta: newDayMeta } });
      setContextMenu(null);
      return;
    } else if (action === 'delete') {
      newRows = newRows.filter(r => r.id !== rowId);
    }

    newRows = newRows.sort((a, b) => {
       if (a.shootDay === null && b.shootDay !== null) return 1;
       if (a.shootDay !== null && b.shootDay === null) return -1;
       if (a.shootDay !== b.shootDay) return (a.shootDay || 0) - (b.shootDay || 0);
       return a.order - b.order;
    });
    newRows.forEach((r, i) => r.order = i);

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

  const handleDragOver = (e: DragOverEvent) => {
    const overId = e.over?.id as string | undefined;
    if (overId && activeType === 'DAY_BREAK') {
      const day = getDayFromId(overId);
      if (day !== null) {
        if (augmentedRows.some(r => r.id === overId)) {
          setInsertBeforeId(overId);
        } else {
          setInsertBeforeId(`day-${day}`);
        }
      } else {
        setInsertBeforeId(null);
      }
    } else if (overId && activeType === 'ROW') {
      const day = getDayFromId(overId);
      if (day !== null) {
        const dayRows = scheduledRows[day] || [];
        if (dayRows.some(r => r.id === overId)) {
          setInsertBeforeId(overId);
        } else {
          setInsertBeforeId(`day-${day}`);
        }
      } else {
        setInsertBeforeId(null);
      }
    } else {
      setInsertBeforeId(null);
    }
  };

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    const lastInsertBeforeId = insertBeforeId;
    setActiveId(null);
    setActiveType(null);
    setInsertBeforeId(null);
    
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    if (activeId === overId) return;

    // Day break dragging logic
    if (active.data.current?.type === 'DAY_BREAK') {
      const sourceDay = parseInt(activeId.replace('day-break-', ''), 10);
      const overDay = getDayFromId(overId);
      if (overDay === null || sourceDay === overDay) return;

      const targetRowId = overId.startsWith('day-') ? null : overId;

      let workingRows = augmentedRows.map(r => ({ ...r }));

      // Step 1: Remove source DAY_BREAK, merge its rows into previous day
      const prevDay = sourceDay > 1 ? sourceDay - 1 : 2;
      workingRows = workingRows.filter(r => !(r.type === 'DAY_BREAK' && r.shootDay === sourceDay));
      workingRows = workingRows.map(r => {
        if (r.shootDay === sourceDay) return { ...r, shootDay: prevDay };
        if (r.shootDay > sourceDay) return { ...r, shootDay: r.shootDay - 1 };
        return r;
      });

      const workingMeta: Record<number, any> = {};
      const sourceMeta = activeVersion.dayMeta?.[sourceDay];
      for (const [k, v] of Object.entries(activeVersion.dayMeta || {}) as [string, ShootDayMeta][]) {
        const kn = Number(k);
        if (kn === sourceDay) continue;
        if (kn > sourceDay) workingMeta[kn - 1] = { ...v, shootDay: kn - 1 };
        else workingMeta[kn] = v;
      }

      // Step 2: Determine target after renumbering
      const adjustedOverDay = overDay > sourceDay ? overDay - 1 : overDay;
      const targetRow = targetRowId ? workingRows.find(r => r.id === targetRowId) : null;
      const targetShootDay = targetRow ? targetRow.shootDay! : adjustedOverDay;
      const nextDay = targetShootDay + 1;

      // Step 3: Insert new DAY_BREAK at target position, split day
      const insertOrder = targetRow ? targetRow.order + 0.5 : 999;
      const newBreak: ScheduleRow = {
        id: generateUUID(),
        type: 'DAY_BREAK',
        shootDay: nextDay,
        order: insertOrder
      };

      workingRows = workingRows.map(r => {
        if (targetRow && r.shootDay === targetShootDay && r.order > targetRow.order) return { ...r, shootDay: nextDay };
        if (r.shootDay >= nextDay) return { ...r, shootDay: r.shootDay + 1 };
        return r;
      });
      workingRows.push(newBreak);

      const finalMeta: Record<number, any> = {};
      for (const [k, v] of Object.entries(workingMeta)) {
        const kn = Number(k);
        if (kn >= nextDay) finalMeta[kn + 1] = { ...v, shootDay: kn + 1 };
        else finalMeta[kn] = v;
      }
      finalMeta[nextDay] = {
        shootDay: nextDay,
        unitCall: sourceMeta?.unitCall || '08:00',
        date: sourceMeta?.date || ''
      };

      const persistentRows = workingRows.map(r =>
        r.id.startsWith('row-synth-') ? { ...r, id: generateUUID() } : r
      );
      dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, rows: persistentRows, dayMeta: finalMeta } });
      return;
    }

    // Old DAY type handling (legacy day-wrap sortable)
    if (active.data.current?.type === 'DAY') {
      const activeDay = parseInt(activeId.replace('day-wrap-', ''), 10);
      const overDay = getDayFromId(overId);
      
      if (overDay !== null && activeDay !== overDay) {
         let newRows = augmentedRows.map(r => ({ ...r }));
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

    let newRows = augmentedRows.map(r => ({ ...r }));
    
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
        newRows = newRows.filter(r => r.id !== activeId);
        let dayRows = newRows.filter(r => r.shootDay === overDay).sort((a, b) => a.order - b.order);
        let targetOverId = lastInsertBeforeId && !lastInsertBeforeId.startsWith('day-') && dayRows.some(r => r.id === lastInsertBeforeId)
          ? lastInsertBeforeId : null;
        let insertIndex = targetOverId ? dayRows.findIndex(r => r.id === targetOverId) : dayRows.length;
        if (insertIndex === -1) insertIndex = dayRows.length;
        const movedRow = { ...activeRow, shootDay: overDay };
        dayRows.splice(insertIndex, 0, movedRow);
        dayRows.forEach((r, i) => r.order = i);
        newRows = [...newRows.filter(r => r.shootDay !== overDay), ...dayRows];
      }
    } else {
      const draggingItems = draggingIds.map(id => newRows.find(r => r.id === id)!).filter(Boolean);
      newRows = newRows.filter(r => !draggingIds.includes(r.id));
      
      let dayRows = newRows.filter(r => r.shootDay === overDay).sort((a, b) => a.order - b.order);
      let targetOverId = lastInsertBeforeId && !lastInsertBeforeId.startsWith('day-') && dayRows.some(r => r.id === lastInsertBeforeId)
        ? lastInsertBeforeId : null;
      let insertIndex = targetOverId ? dayRows.findIndex(r => r.id === targetOverId) : dayRows.length;
      if (insertIndex === -1) insertIndex = dayRows.length;
      
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
    <>
      <style>{`
        .schedule-table {
          width: 100%;
          table-layout: fixed;
          border-collapse: collapse;
          font-family: Helvetica, Arial, sans-serif;
          font-size: 8pt;
          line-height: 1.2;
        }
        .schedule-table td {
          padding: 4px 4px;
          vertical-align: middle;
          border-right: 0.5px solid rgba(0,0,0,0.1);
          border-bottom: 0.5px solid rgba(0,0,0,0.1);
          overflow: hidden;
        }
        .schedule-table tbody tr:first-child td:first-child {
          border-left: none;
        }
        .schedule-table tbody tr:last-child td:last-child {
          border-right: none;
        }
        .col-sc { width: 40px; text-align: center; overflow: visible !important; padding: 0 !important; }
        .col-call { width: 35px; text-align: center; }
        .col-dur { width: 40px; text-align: center; }
        .col-ie { width: 50px; text-align: center; }
        .col-set { width: 200px; }
        .col-dn { width: 75px; text-align: center; }
        .col-cast { width: 50px; text-align: left; }
        .col-pgs { width: 50px; text-align: center; }
        .col-desc {
          text-align: left;
          line-height: 1.2;
        }
        .schedule-table .row-note td,
        .schedule-table .row-break td {
          padding-top: 14px !important;
          padding-bottom: 14px !important;
        }
      `}</style>
    <DndContext 
      sensors={sensors}
      collisionDetection={customCollisionDetection}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
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

          <div className="w-full max-w-4xl">
              {existingDays.map((dayInt, i) => (
                <DayBlock 
                  key={dayInt} 
                  dayInt={dayInt} 
                  rows={scheduledRows[dayInt] || []}
                  meta={activeVersion?.dayMeta[dayInt]}
                  selectedIds={selectedRowIds}
                  onRowClick={handleRowClick}
                  textEditingEnabled={textEditingEnabled}
                  insertBeforeId={insertBeforeId}
                  activeRowId={activeId}
                  activeDragRow={activeDragRow}
                  activeType={activeType}
                  chronoDay={i + 1}
                />
              ))}
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
        ) : activeType === 'DAY_BREAK' ? (
           <div className="bg-black text-white px-3 py-2 flex items-center gap-3 rounded opacity-90 pointer-events-none w-full max-w-4xl shadow-2xl">
             <span className="font-semibold">DAY {activeId?.toString().replace('day-break-', '')}</span>
             <span className="text-zinc-400">CALL {activeVersion.dayMeta?.[parseInt(activeId?.toString().replace('day-break-', '') || '1')]?.unitCall || '08:00'}</span>
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
           <button onClick={() => handleContextMenuAction('add_day_break')} className="w-full text-left px-4 py-2 hover:bg-zinc-100 transition-colors">Insert Day Break Below</button>
           <div className="h-[1px] bg-zinc-200 my-1"></div>
           <button onClick={() => handleContextMenuAction('duplicate')} className="w-full text-left px-4 py-2 hover:bg-zinc-100 transition-colors">Duplicate (Ghost Scene)</button>
           <div className="h-[1px] bg-zinc-200 my-1"></div>
           <button onClick={() => handleContextMenuAction('delete')} className="w-full text-left px-4 py-2 hover:bg-red-50 text-red-600 transition-colors">Delete Row</button>
        </div>
      )}
    </DndContext>
    </>
  );
}
