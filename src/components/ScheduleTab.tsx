import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useProject } from '../store';
import { DndContext, closestCorners, PointerSensor, useSensor, useSensors, DragEndEvent, DragOverlay, DragStartEvent, DragOverEvent, CollisionDetection } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { DayBlock } from './DayBlock';
import { UnscheduledBlock } from './UnscheduledBlock';
import { SortableRow } from './SortableRow';
import { generateUUID } from '../lib/utils';
import { ScheduleRow, Scene } from '../types';
import { useMarquee, MarqueeOverlay, isAddModeActive, useAddMode } from '../lib/useMarquee';
import { ContextMenu, ContextMenuItem, ContextMenuDivider } from './ContextMenu';

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
  const [insertBeforeId, setInsertBeforeId] = useState<string | null>(null);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [activeDragIds, setActiveDragIds] = useState<Set<string>>(new Set());
  const [clipboardIds, setClipboardIds] = useState<Set<string>>(new Set());
  const [lastClickedId, setLastClickedId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, rowId: string, shootDay: number | null } | null>(null);
  const [textEditingEnabled, setTextEditingEnabled] = useState(false);
  const [colorPicker, setColorPicker] = useState<{ rowId: string; bg: string; text: string } | null>(null);

  const handleRowClick = (id: string, e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey) {
      e.stopPropagation();
      setSelectedRowIds(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      });
      setLastClickedId(id);
    } else if (e.shiftKey && lastClickedId) {
      e.stopPropagation();
      const allIds = augmentedRows.map(r => r.id);
      const idxA = allIds.indexOf(lastClickedId);
      const idxB = allIds.indexOf(id);
      if (idxA >= 0 && idxB >= 0) {
        const range = allIds.slice(Math.min(idxA, idxB), Math.max(idxA, idxB) + 1);
        setSelectedRowIds(new Set(range));
      }
    } else {
      e.stopPropagation();
      setSelectedRowIds(prev => {
        if (prev.has(id)) {
          const next = new Set(prev);
          next.delete(id);
          return next;
        }
        return new Set([id]);
      });
      setLastClickedId(id);
    }
  };

  const cutSelected = () => {
    if (selectedRowIds.size === 0 || activeDragIds.size > 0 || textEditingEnabled) return;
    setClipboardIds(new Set(selectedRowIds));
    setSelectedRowIds(new Set());
  };

  const pasteClipboard = (targetRowId: string) => {
    if (clipboardIds.size === 0 || activeDragIds.size > 0 || textEditingEnabled) return;
    if (!activeVersion) return;
    const targetRow = augmentedRows.find(r => r.id === targetRowId);
    if (!targetRow) return;

    const clipboardItems = Array.from(clipboardIds)
      .sort((a, b) => {
        const rA = augmentedRows.find(r => r.id === a);
        const rB = augmentedRows.find(r => r.id === b);
        if (rA && rB) {
          if (rA.shootDay !== rB.shootDay) return (rA.shootDay || 0) - (rB.shootDay || 0);
          return rA.order - rB.order;
        }
        return 0;
      })
      .map(id => augmentedRows.find(r => r.id === id)!)
      .filter(Boolean);

    const overDay = targetRow.shootDay;
    let newRows = activeVersion.rows.map(r => ({ ...r }));
    newRows = newRows.filter(r => !clipboardIds.has(r.id));
    let dayRows = newRows.filter(r => r.shootDay === overDay).sort((a, b) => a.order - b.order);
    const targetIdx = dayRows.findIndex(r => r.id === targetRowId);
    const insertIdx = targetIdx !== -1 ? targetIdx : dayRows.length;
    const sanitizedItems = clipboardItems.map(item => ({
      ...item,
      shootDay: overDay,
      id: item.id.startsWith('row-synth-') ? generateUUID() : item.id,
      order: 0,
    }));
    dayRows.splice(insertIdx, 0, ...sanitizedItems);
    dayRows.forEach((r, i) => r.order = i);
    newRows = [...newRows.filter(r => r.shootDay !== overDay), ...dayRows];
    dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, rows: newRows } });
    setClipboardIds(new Set());
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedRowIds(new Set());
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'x') {
        e.preventDefault();
        cutSelected();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'v') {
        e.preventDefault();
        if (selectedRowIds.size === 1) {
          pasteClipboard([...selectedRowIds][0] as string);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedRowIds, clipboardIds, activeDragIds, textEditingEnabled, activeVersion]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.key === 'Backspace' || e.key === 'Delete') && selectedRowIds.size > 0 && !textEditingEnabled) {
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
        e.preventDefault();
        if (!activeVersion) return;
        const ids = Array.from(selectedRowIds);
        const newRows = activeVersion.rows.map(r => ids.includes(r.id) ? { ...r, shootDay: null, order: 999999 } : r);
        dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, rows: newRows } });
        setSelectedRowIds(new Set());
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedRowIds, textEditingEnabled, activeVersion, dispatch]);

  useEffect(() => {
    const onSelectStart = (e: Event) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;
      if (target.isContentEditable) return;
      e.preventDefault();
    };
    if (!textEditingEnabled) {
      document.addEventListener('selectstart', onSelectStart);
    }
    return () => document.removeEventListener('selectstart', onSelectStart);
  }, [textEditingEnabled]);

  const scheduleScrollRef = useRef<HTMLDivElement>(null);
  const activeDragIdsRef = useRef(activeDragIds);
  activeDragIdsRef.current = activeDragIds;
  const clipboardIdsRef = useRef(clipboardIds);
  clipboardIdsRef.current = clipboardIds;
  const activeVersionRef = useRef(activeVersion);
  activeVersionRef.current = activeVersion;

  useEffect(() => {
    return () => {
      const allIds = new Set([...activeDragIdsRef.current, ...clipboardIdsRef.current]);
      const version = activeVersionRef.current;
      if (allIds.size > 0 && version) {
        const newRows = version.rows.map(r => allIds.has(r.id) ? { ...r, shootDay: null, order: 999999 } : r);
        dispatch({ type: 'UPDATE_VERSION', payload: { id: version.id, rows: newRows } });
      }
    };
  }, []);
  const ctrlOrCmdHeld = useAddMode();

  const { marqueeBox, justEndedRef: marqueeJustEndedRef } = useMarquee(
    scheduleScrollRef,
    useCallback((ids, isAddMode) => {
      setSelectedRowIds(prev => isAddMode ? new Set([...prev, ...ids]) : ids);
    }, []),
    !textEditingEnabled,
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { 
      activationConstraint: { 
        distance: ctrlOrCmdHeld || textEditingEnabled ? 999999 : 5 
      } 
    })
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

  const scheduledRows = augmentedRows.filter(r => !activeDragIds.has(r.id) && !clipboardIds.has(r.id)).reduce((acc, row) => {
    if (row.shootDay !== null) {
      if (!acc[row.shootDay]) acc[row.shootDay] = [];
      acc[row.shootDay].push(row);
    }
    return acc;
  }, {} as Record<number, ScheduleRow[]>);

  (Object.values(scheduledRows) as ScheduleRow[][]).forEach(dayRows => {
    dayRows.sort((a, b) => a.order - b.order);
  });

  const unscheduledRows = augmentedRows.filter(r => r.shootDay === null && !activeDragIds.has(r.id) && !clipboardIds.has(r.id)).sort((a, b) => a.order - b.order);

  const existingDays = Array.from(new Set([
    ...Object.keys(activeVersion.dayMeta || {}).map(Number),
  ])).sort((a, b) => {
    const dateA = activeVersion.dayMeta?.[a]?.date || '';
    const dateB = activeVersion.dayMeta?.[b]?.date || '';
    return dateA.localeCompare(dateB);
  });

  const getDayFromId = (id: string): number | null => {
    if (id === 'end-unscheduled' || id === 'unscheduled_bin') return null;
    if (id.startsWith('day-wrap-') || id.startsWith('day-') || id.startsWith('end-')) {
      return parseInt(id.replace('day-wrap-', '').replace('day-', '').replace('end-', ''), 10);
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
    } else if ((action === 'duplicate' || action === 'duplicate_note' || action === 'duplicate_break') && (row.type === 'NOTE' || row.type === 'BREAK')) {
      newRows.push({ ...row, id: generateUUID(), order: row.order + 0.5 });
    } else if (action === 'change_color' && row.type === 'NOTE') {
      setColorPicker({ rowId: row.id, bg: row.noteColor || '#591b1b', text: row.noteTextColor || '#ffffff' });
      setContextMenu(null);
      return;
    } else if (action === 'delete') {
      newRows = newRows.filter(r => r.id !== rowId);
    } else if (action === 'unschedule') {
      newRows = newRows.map(r => r.id === rowId ? { ...r, shootDay: null, order: 999999 } : r);
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

  const applyNoteColor = () => {
    if (!colorPicker || !activeVersion) return;
    const newRows = activeVersion.rows.map(r =>
      r.id === colorPicker.rowId ? { ...r, noteColor: colorPicker.bg, noteTextColor: colorPicker.text } : r
    );
    dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, rows: newRows } });
    setColorPicker(null);
  };

  const reorderDay = (allRows: ScheduleRow[], day: number | null, activeId: string, overId: string) => {
    let dayRows = allRows.filter(r => r.shootDay === day).sort((a, b) => a.order - b.order);
    const activeIndex = dayRows.findIndex(r => r.id === activeId);
    const overIndex = dayRows.findIndex(r => r.id === overId);
    
    if (activeIndex !== -1 && overIndex !== -1) {
      const targetIndex = activeIndex < overIndex ? overIndex - 1 : overIndex;
      dayRows = arrayMove(dayRows, activeIndex, targetIndex);
      dayRows.forEach((r, i) => r.order = i);
      return [...allRows.filter(r => r.shootDay !== day), ...dayRows];
    }
    return allRows;
  };

  const selectedRowIdsRef = useRef(selectedRowIds);
  selectedRowIdsRef.current = selectedRowIds;

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
      if (overId === 'unscheduled_bin' || overId === 'end-unscheduled') {
        setInsertBeforeId('end-unscheduled');
        return;
      }
      const day = getDayFromId(overId);
      if (day !== null) {
        const dayRows = scheduledRows[day] || [];
        if (dayRows.some(r => r.id === overId)) {
          setInsertBeforeId(overId);
        } else {
          setInsertBeforeId(`day-${day}`);
        }
      } else {
        const isUnscheduledRow = unscheduledRows.some(r => r.id === overId);
        if (isUnscheduledRow) {
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
    
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    if (activeId === overId) return;

    // Day dragging logic
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
    if (overId === 'unscheduled_bin' || overId === 'end-unscheduled' || (overDay === null && augmentedRows.some(r => r.id === overId && r.shootDay === null))) {
      overDay = null; // explicit drop to unscheduled
    } else if (overDay === null && !overId.startsWith('day-') && !overId.startsWith('end-')) {
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
      newRows = newRows.filter(r => r.id !== activeId);
      let dayRows = newRows.filter(r => r.shootDay === overDay).sort((a, b) => a.order - b.order);
      const isDayEnd = lastInsertBeforeId?.startsWith('day-') || lastInsertBeforeId?.startsWith('end-');
      let targetOverId = lastInsertBeforeId && !isDayEnd && dayRows.some(r => r.id === lastInsertBeforeId)
        ? lastInsertBeforeId : null;
      let insertIndex = targetOverId ? dayRows.findIndex(r => r.id === targetOverId) : dayRows.length;
      if (insertIndex === -1) insertIndex = dayRows.length;
      const movedRow = { ...activeRow, shootDay: overDay };
      dayRows.splice(insertIndex, 0, movedRow);
      dayRows.forEach((r, i) => r.order = i);
      newRows = [...newRows.filter(r => r.shootDay !== overDay), ...dayRows];
    } else {
      const draggingItems = draggingIds.map(id => newRows.find(r => r.id === id)!).filter(Boolean);
      const dayRowsBefore = newRows.filter(r => r.shootDay === overDay).sort((a, b) => a.order - b.order);
      const isDayEnd = lastInsertBeforeId?.startsWith('day-') || lastInsertBeforeId?.startsWith('end-');
      const targetOverId = lastInsertBeforeId && !isDayEnd && dayRowsBefore.some(r => r.id === lastInsertBeforeId)
        ? lastInsertBeforeId : null;
      const rawIndex = targetOverId ? dayRowsBefore.findIndex(r => r.id === targetOverId) : dayRowsBefore.length;
      const insertIndex = rawIndex === -1 ? 0 : rawIndex - draggingIds.filter(id => {
        const idx = dayRowsBefore.findIndex(r => r.id === id);
        return idx >= 0 && idx < rawIndex;
      }).length;

      newRows = newRows.filter(r => !draggingIds.includes(r.id));
      const dayRows = newRows.filter(r => r.shootDay === overDay).sort((a, b) => a.order - b.order);
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

  const activeDragRow = (() => {
    if (!activeId || activeType !== 'ROW') return null;
    const ids = Array.from(activeDragIds.size > 1 ? activeDragIds : [activeId]);
    ids.sort((a, b) => {
      const rA = augmentedRows.find(r => r.id === a);
      const rB = augmentedRows.find(r => r.id === b);
      if (rA && rB) {
        if (rA.shootDay !== rB.shootDay) return (rA.shootDay || 0) - (rB.shootDay || 0);
        return rA.order - rB.order;
      }
      return 0;
    });
    return augmentedRows.find(r => r.id === ids[0]) || null;
  })();

  const activeDragRows = (() => {
    if (!activeId || activeType !== 'ROW') return [];
    return activeDragIds.size > 1
      ? Array.from(activeDragIds)
          .sort((a, b) => {
            const rA = augmentedRows.find(r => r.id === a);
            const rB = augmentedRows.find(r => r.id === b);
            if (rA && rB) {
              if (rA.shootDay !== rB.shootDay) return (rA.shootDay || 0) - (rB.shootDay || 0);
              return rA.order - rB.order;
            }
            return 0;
          })
          .map(id => augmentedRows.find(r => r.id === id)!)
          .filter(Boolean)
      : [activeDragRow!].filter(Boolean);
  })();

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
        .col-ie { width: 50px; text-align: left; overflow: visible !important; }
        .col-set { width: 200px; overflow: visible !important; }
        .col-dn { width: 75px; text-align: left; overflow: visible !important; }
        .col-cast { width: 50px; text-align: left; overflow: visible !important; }
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
          className="flex-1 flex bg-zinc-200/50 relative min-h-0"
          onClick={() => {
            if (marqueeJustEndedRef.current) {
              marqueeJustEndedRef.current = false;
              return;
            }
            if (contextMenu) {
              setContextMenu(null);
              return;
            }
            setSelectedRowIds(new Set());
          }}
          onContextMenu={(e) => {
              const rowEl = (e.target as HTMLElement).closest('[data-row-id]');
              if (rowEl) {
                 e.preventDefault();
                 const rowId = rowEl.getAttribute('data-row-id')!;
                 if (!selectedRowIds.has(rowId)) {
                   setSelectedRowIds(new Set([rowId]));
                 }
                 const shootDayAttr = rowEl.getAttribute('data-shoot-day');
                 const shootDay = shootDayAttr === 'null' ? null : parseInt(shootDayAttr!, 10);
                 setContextMenu({ x: e.clientX, y: e.clientY, rowId, shootDay });
              } else {
                 setContextMenu(null);
              }
          }}
      >
        <UnscheduledBlock rows={unscheduledRows} projectScenes={project.scenes} textEditingEnabled={textEditingEnabled} onAction={handleContextMenuAction} contextMenu={contextMenu} setContextMenu={setContextMenu} selectedIds={selectedRowIds} activeDragIds={activeDragIds} onRowClick={handleRowClick} onSelectionChange={(ids, addMode) => setSelectedRowIds(prev => addMode ? new Set([...prev, ...ids]) : ids)} insertBeforeId={insertBeforeId} activeDragRow={activeDragRow} activeDragRows={activeDragRows} activeRowId={activeId} />
        
        {/* Main Schedule Area */}
        <div ref={scheduleScrollRef} className="flex-1 overflow-auto flex flex-col items-center p-8 pb-32 relative"
          onClick={(e) => {
            if (marqueeJustEndedRef.current || (e.target as HTMLElement).closest('[data-row-id]')) return;
            setSelectedRowIds(new Set());
            setContextMenu(null);
          }}
        >
          {marqueeBox && (
            <div
              style={{
                position: 'absolute',
                left: marqueeBox.left,
                top: marqueeBox.top,
                width: marqueeBox.width,
                height: marqueeBox.height,
                background: 'transparent',
                border: '1px dotted #3168D8',
                pointerEvents: 'none',
                zIndex: 1000,
              }}
            />
          )}
          
           <div className="w-full max-w-4xl flex justify-between items-center mb-6">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold">Schedule Breakdown</h2>
                {selectedRowIds.size > 0 && (
                  <span className="bg-blue-100 text-blue-700 text-xs font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
                    {selectedRowIds.size} selected
                    <button onClick={() => setSelectedRowIds(new Set())} className="hover:text-blue-900 font-bold">&times;</button>
                  </span>
                )}
              </div>
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
                  activeDragIds={activeDragIds}
                  onRowClick={handleRowClick}
                  textEditingEnabled={textEditingEnabled}
                  insertBeforeId={insertBeforeId}
                  activeRowId={activeId}
                  activeDragRow={activeDragRow}
                  activeDragRows={activeDragRows}
                  chronoDay={i + 1}
                />
              ))}
          </div>
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {activeDragRow ? (
          <div className="w-[1024px] max-w-4xl pointer-events-none relative">
            {activeDragIds.size > 1 && Array.from(activeDragIds).slice(0, 3).reverse().map((id, i, arr) => {
              const row = augmentedRows.find(r => r.id === id);
              if (!row) return null;
              const isTop = i === arr.length - 1;
              const offset = (arr.length - 1 - i) * 4;
              const opacity = isTop ? 1 : 1 - (arr.length - 1 - i) * 0.2;
              return (
                <div key={id} style={{ position: isTop ? 'relative' : 'absolute', top: offset, left: 0, right: 0, opacity, zIndex: isTop ? 10 : 5 - i }}>
                  <SortableRow row={row as any} scenes={project.scenes} isOverlay textEditingEnabled={textEditingEnabled} />
                </div>
              );
            })}
            {activeDragIds.size === 1 && activeDragIds.has(activeId as string) && (
              <SortableRow row={activeDragRow as any} scenes={project.scenes} isOverlay textEditingEnabled={textEditingEnabled} />
            )}
            {activeDragIds.size > 1 && (
               <div className="absolute -top-3 -right-3 bg-blue-500 text-white font-bold px-3 py-1 rounded-full shadow-lg text-sm border-2 border-white z-20">
                 ×{activeDragIds.size}
               </div>
            )}
          </div>
        ) : null}
      </DragOverlay>

      {/* Context Menu */}
      <ContextMenu open={!!contextMenu} x={contextMenu?.x ?? 0} y={contextMenu?.y ?? 0} onClose={() => setContextMenu(null)}>
        {(() => {
          const row = contextMenu ? augmentedRows.find(r => r.id === contextMenu.rowId) : null;
          if (selectedRowIds.size > 1) {
            return (
              <>
                <ContextMenuItem onClick={() => { cutSelected(); setContextMenu(null); }}>Cut {selectedRowIds.size} Ribbons</ContextMenuItem>
                <ContextMenuDivider />
                <ContextMenuItem variant="danger" onClick={() => {
                  const ids = Array.from(selectedRowIds);
                  const newRows = activeVersion!.rows.map(r => ids.includes(r.id) ? { ...r, shootDay: null, order: 999999 } : r);
                  dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion!.id, rows: newRows } });
                  setSelectedRowIds(new Set());
                  setContextMenu(null);
                }}>
                  Remove {selectedRowIds.size} Ribbons
                </ContextMenuItem>
              </>
            );
          }
          return (
            <>
              {clipboardIds.size > 0 && (
                <>
                  <ContextMenuItem onClick={() => { pasteClipboard(contextMenu!.rowId); setContextMenu(null); }}>Paste Below ({clipboardIds.size})</ContextMenuItem>
                  <ContextMenuDivider />
                </>
              )}
              <ContextMenuItem onClick={() => handleContextMenuAction('add_note')}>Add Note Below</ContextMenuItem>
              <ContextMenuItem onClick={() => handleContextMenuAction('add_break')}>Add Break Below</ContextMenuItem>
              <ContextMenuDivider />
              {row?.type === 'SCENE' && (
                <>
                  <ContextMenuItem onClick={() => handleContextMenuAction('duplicate')}>Duplicate (Ghost Scene)</ContextMenuItem>
                  <ContextMenuDivider />
                  <ContextMenuItem onClick={() => handleContextMenuAction('unschedule')}>Remove Ribbon</ContextMenuItem>
                </>
              )}
              {(row?.type === 'NOTE' || row?.type === 'BREAK') && (
                <>
                  {row?.type === 'NOTE' && (
                    <>
                      <ContextMenuItem onClick={() => handleContextMenuAction('duplicate_note')}>Duplicate Note</ContextMenuItem>
                      <ContextMenuItem onClick={() => handleContextMenuAction('change_color')}>Change Color</ContextMenuItem>
                    </>
                  )}
                  {row?.type === 'BREAK' && (
                    <ContextMenuItem onClick={() => handleContextMenuAction('duplicate_break')}>Duplicate Break</ContextMenuItem>
                  )}
                  <ContextMenuDivider />
                  <ContextMenuItem onClick={() => handleContextMenuAction('unschedule')}>Remove Ribbon</ContextMenuItem>
                  <ContextMenuItem onClick={() => handleContextMenuAction('delete')} variant="danger">Delete</ContextMenuItem>
                </>
              )}
            </>
          );
        })()}
      </ContextMenu>

      {/* Color Picker Modal */}
      {colorPicker && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50" onClick={() => setColorPicker(null)}>
          <div className="bg-white rounded-xl shadow-2xl p-6 w-[300px] flex flex-col gap-4" onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Enter') applyNoteColor(); if (e.key === 'Escape') setColorPicker(null); }}>
            <h3 className="text-sm font-bold text-zinc-800">Note Color</h3>
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-600">Background</span>
              <div className="flex items-center gap-2">
                <input type="color" value={colorPicker.bg} onChange={e => setColorPicker(p => p ? { ...p, bg: e.target.value } : null)} className="w-8 h-8 rounded border border-zinc-300 cursor-pointer p-0" />
                <span className="text-[10px] text-zinc-400 font-mono">{colorPicker.bg}</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-600">Text</span>
              <div className="flex items-center gap-2">
                <input type="color" value={colorPicker.text} onChange={e => setColorPicker(p => p ? { ...p, text: e.target.value } : null)} className="w-8 h-8 rounded border border-zinc-300 cursor-pointer p-0" />
                <span className="text-[10px] text-zinc-400 font-mono">{colorPicker.text}</span>
              </div>
            </div>
            <div className="text-xs text-zinc-500 px-3 py-2 rounded border border-zinc-200" style={{ background: colorPicker.bg, color: colorPicker.text }}>
              Preview text
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setColorPicker(null)} className="px-3 py-1.5 text-xs text-zinc-500 hover:bg-zinc-100 rounded">Cancel</button>
              <button onClick={applyNoteColor} className="px-4 py-1.5 text-xs bg-zinc-900 text-white rounded font-semibold">Apply</button>
            </div>
          </div>
        </div>
      )}
    </DndContext>
    </>
  );
}
