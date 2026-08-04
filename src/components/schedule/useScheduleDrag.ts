import React, { useCallback } from 'react';
import type { DragStartEvent, DragOverEvent, DragEndEvent } from '@dnd-kit/core';
import { ScheduleRow, ScheduleVersion } from '../../types';
import { insertionOrder } from '../../lib/daybreakUtils';
import { isAddModeActive } from '../../lib/useMarquee';

export interface UseScheduleDragConfig {
  activeType: string | null;
  setActiveType: (t: string | null) => void;
  setActiveId: (id: string | null) => void;
  insertBeforeId: string | null;
  setInsertBeforeId: (id: string | null) => void;
  setActiveDragIds: (s: Set<string>) => void;
  setSelectedRowIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  selectedRowIds: Set<string>;
  selectedRowIdsRef: React.MutableRefObject<Set<string>>;
  scheduledRows: Record<number, ScheduleRow[]>;
  boneyardRows: ScheduleRow[];
  activeVersion: ScheduleVersion | undefined;
  dispatch: React.Dispatch<any>;
}

/** Resolves a droppable id to a day number (or null for boneyard/unknown). */
export function getDayFromId(id: string, rows: ScheduleRow[]): number | null {
  if (id === 'end-boneyard' || id === 'boneyard_bin') return null;
  if (id.startsWith('day-wrap-') || id.startsWith('day-') || id.startsWith('end-')) {
    return parseInt(id.replace('day-wrap-', '').replace('day-', '').replace('end-', ''), 10);
  }
  const row = rows.find(r => r.id === id);
  return row ? row.containerId : null;
}

export function useScheduleDrag(config: UseScheduleDragConfig) {
  const {
    activeType, setActiveType, setActiveId, insertBeforeId, setInsertBeforeId,
    setActiveDragIds, setSelectedRowIds, selectedRowIds, selectedRowIdsRef,
    scheduledRows, boneyardRows, activeVersion, dispatch,
  } = config;

  const handleDragStart = (e: DragStartEvent) => {
    if (isAddModeActive()) return;
    const draggedId = e.active.id as string;
    setActiveId(draggedId);
    setActiveType(e.active.data.current?.type || null);
    const currentSelection = selectedRowIdsRef.current;
    if (currentSelection.has(draggedId) && currentSelection.size > 1) {
      setActiveDragIds(new Set(currentSelection));
    } else {
      if (currentSelection.size > 0) {
        setSelectedRowIds(new Set());
      }
      setActiveDragIds(new Set([draggedId]));
    }
  };

  const handleDragOver = (e: DragOverEvent) => {
    const overId = e.over?.id as string | undefined;
    if (overId && activeType === 'ROW') {
      if (overId === 'boneyard_bin' || overId === 'end-boneyard') {
        setInsertBeforeId('end-boneyard');
        return;
      }
      const day = getDayFromId(overId, activeVersion?.rows || []);
      if (day !== null) {
        const dayRows = scheduledRows[day] || [];
        if (dayRows.some(r => r.id === overId)) {
          setInsertBeforeId(overId);
        } else {
          setInsertBeforeId(overId.startsWith('end-') ? overId : `day-${day}`);
        }
      } else {
        const isBoneyardRow = boneyardRows.some(r => r.id === overId);
        if (isBoneyardRow) {
          setInsertBeforeId(overId);
        } else {
          setInsertBeforeId(null);
        }
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
    setActiveDragIds(new Set());
    
    if (!over || !activeVersion) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    if (activeId === overId) return;

    // Day dragging logic
    if (active.data.current?.type === 'DAY') {
      const activeDay = parseInt(activeId.replace('day-wrap-', ''), 10);
      const overDay = getDayFromId(overId, activeVersion.rows);
      
      if (overDay !== null && activeDay !== overDay) {
        // Swap containerIds between the two days; rows in other days keep identity
        // (the row identity is the stripboard memo contract — never copy all rows).
        const newRows = activeVersion.rows.map(r => {
          if (r.containerId === activeDay) return { ...r, containerId: overDay };
          if (r.containerId === overDay) return { ...r, containerId: activeDay };
          return r;
        });
        dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, rows: newRows } });
      }
      return;
    }

    const activeRow = activeVersion.rows.find(r => r.id === activeId);
    
    if (!activeRow) return;

    let overDay = getDayFromId(overId, activeVersion.rows);
    if (overId === 'boneyard_bin' || overId === 'end-boneyard' || (overDay === null && activeVersion.rows.some(r => r.id === overId && r.containerId === null))) {
      overDay = null; // explicit drop to boneyard
    } else if (overDay === null && !overId.startsWith('day-') && !overId.startsWith('end-')) {
      return; // invalid drop
    }

    let draggingIds = [activeId];
    if (selectedRowIds.has(activeId) && selectedRowIds.size > 1) {
       draggingIds = Array.from(selectedRowIds);
       draggingIds.sort((a, b) => {
          const rA = activeVersion.rows.find(r => r.id === a);
          const rB = activeVersion.rows.find(r => r.id === b);
          if (rA && rB) {
             if (rA.containerId !== rB.containerId) return (rA.containerId || 0) - (rB.containerId || 0);
             return rA.order - rB.order;
          }
          return 0;
       });
    }
    
    if (draggingIds.length === 1) {
      const dayRows = activeVersion.rows
        .filter(r => r.id !== activeId && r.containerId === overDay)
        .sort((a, b) => a.order - b.order);
      let insertIndex: number;
      if (lastInsertBeforeId?.startsWith('day-')) {
        insertIndex = 0;
      } else if (lastInsertBeforeId?.startsWith('end-')) {
        insertIndex = dayRows.length;
      } else if (lastInsertBeforeId && dayRows.some(r => r.id === lastInsertBeforeId)) {
        insertIndex = dayRows.findIndex(r => r.id === lastInsertBeforeId);
        if (insertIndex === -1) insertIndex = dayRows.length;
      } else {
        insertIndex = dayRows.length;
      }
      if (insertIndex === 0 && dayRows.length > 0 && dayRows[0]?.pinned) {
        insertIndex = 1;
      }
      // Fractional midpoint order: no renumbering, so every untouched row keeps
      // its object identity (the stripboard memo contract) — only rows whose
      // computed values actually shifted re-render after the drop.
      const movedRow = { ...activeRow, containerId: overDay, order: insertionOrder(dayRows, insertIndex) };
      const newRows = [
        ...activeVersion.rows.filter(r => r.id !== activeId && r.containerId !== overDay),
        ...dayRows.slice(0, insertIndex),
        movedRow,
        ...dayRows.slice(insertIndex),
      ];
      setSelectedRowIds(new Set([activeId]));
      dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, rows: newRows } });
    } else {
      const draggingItems = draggingIds.map(id => activeVersion.rows.find(r => r.id === id)!).filter(Boolean);
      const dayRowsBefore = activeVersion.rows.filter(r => r.containerId === overDay).sort((a, b) => a.order - b.order);
      let rawIndex: number;
      if (lastInsertBeforeId?.startsWith('day-')) {
        rawIndex = 0;
      } else if (lastInsertBeforeId?.startsWith('end-')) {
        rawIndex = dayRowsBefore.length;
      } else if (lastInsertBeforeId && dayRowsBefore.some(r => r.id === lastInsertBeforeId)) {
        rawIndex = dayRowsBefore.findIndex(r => r.id === lastInsertBeforeId);
        if (rawIndex === -1) rawIndex = dayRowsBefore.length;
      } else {
        rawIndex = dayRowsBefore.length;
      }
      if (rawIndex === 0 && dayRowsBefore.length > 0 && dayRowsBefore[0]?.pinned) {
        rawIndex = 1;
      }
      const insertIndex = rawIndex === 0 ? 0 : rawIndex - draggingIds.filter(id => {
        const idx = dayRowsBefore.findIndex(r => r.id === id);
        return idx >= 0 && idx < rawIndex;
      }).length;

      const dayRows = activeVersion.rows
        .filter(r => r.containerId === overDay && !draggingIds.includes(r.id))
        .sort((a, b) => a.order - b.order);
      const baseOrder = insertionOrder(dayRows, insertIndex);
      const newItems = draggingItems.map((item, j) => ({ ...item, containerId: overDay, order: baseOrder + j * 0.01 }));
      const newRows = [
        ...activeVersion.rows.filter(r => r.containerId !== overDay && !draggingIds.includes(r.id)),
        ...dayRows.slice(0, insertIndex),
        ...newItems,
        ...dayRows.slice(insertIndex),
      ];
      setSelectedRowIds(new Set(draggingIds));
      dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, rows: newRows } });
    }
  };

  return { handleDragStart, handleDragOver, handleDragEnd };
}
