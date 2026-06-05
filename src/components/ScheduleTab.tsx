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
import { Pencil } from 'lucide-react';
import { ContextMenu, ContextMenuItem, ContextMenuDivider } from './ContextMenu';

export function ScheduleTab() {
  const { state, dispatch } = useProject();
  const project = state.present;
  const activeVersion = project.versions.find(v => v.id === project.activeVersionId);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<string | null>(null);
  const [insertBeforeId, setInsertBeforeId] = useState<string | null>(null);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [focusedRowId, setFocusedRowId] = useState<string | null>(null);
  const [activeDragIds, setActiveDragIds] = useState<Set<string>>(new Set());
  const [lastClickedId, setLastClickedId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, rowId: string, shootDay: number | null } | null>(null);
  const [textEditingEnabled, setTextEditingEnabled] = useState(false);
  const [colorPicker, setColorPicker] = useState<{ rowId: string; bg: string; text: string } | null>(null);

  const handleRowDoubleClick = useCallback((id: string) => {
    const row = activeVersion?.rows.find(r => r.id === id);
    if (row?.type === 'NOTE') {
      setColorPicker({ rowId: row.id, bg: row.noteColor || '#591b1b', text: row.noteTextColor || '#ffffff' });
    }
  }, [activeVersion]);

  const handleRowClick = (id: string, e: React.MouseEvent) => {
    if (textEditingEnabled) return;
    if (e.metaKey || e.ctrlKey) {
      e.stopPropagation();
      setSelectedRowIds(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      });
      setLastClickedId(id);
    } else if (e.shiftKey && id.startsWith('empty-')) {
      return;
    } else if (e.shiftKey && lastClickedId && !lastClickedId.startsWith('empty-')) {
      e.stopPropagation();
      const allIds = flatRowIdsRef.current;
      const idxA = allIds.indexOf(lastClickedId);
      const idxB = allIds.indexOf(id);
      if (idxA >= 0 && idxB >= 0) {
        const range = allIds.slice(Math.min(idxA, idxB), Math.max(idxA, idxB) + 1);
        setSelectedRowIds(new Set(range));
      }
    } else {
      e.stopPropagation();
      setSelectedRowIds(new Set([id]));
      setLastClickedId(id);
    }
  };

  const selectNextAfterRemove = (removedIds: Set<string>) => {
    const removedRows = Array.from(removedIds).map(id => augmentedRows.find(r => r.id === id)!).filter(Boolean);
    if (removedRows.length === 0) return;
    removedRows.sort((a, b) => {
      if (a.shootDay !== b.shootDay) return (a.shootDay || 0) - (b.shootDay || 0);
      return a.order - b.order;
    });
    const candidates: string[] = [];
    for (const r of removedRows) {
      const next = augmentedRows.filter(x => x.shootDay === r.shootDay && x.order > r.order && !removedIds.has(x.id)).sort((a, b) => a.order - b.order)[0];
      if (next) candidates.push(next.id);
    }
    if (candidates.length === 0) {
      const first = removedRows[0];
      const prev = augmentedRows.filter(x => x.shootDay === first.shootDay && x.order < first.order && !removedIds.has(x.id)).sort((a, b) => b.order - a.order)[0];
      if (prev) candidates.push(prev.id);
    }
    // If same day is now empty, look across days
    if (candidates.length === 0) {
      const firstRemoved = removedRows[0];
      const dayOrder = existingDays;
      const startIdx = firstRemoved.shootDay !== null ? dayOrder.indexOf(firstRemoved.shootDay) : -1;
      // Try next days first
      for (let i = startIdx + 1; i < dayOrder.length; i++) {
        const rows = scheduledRows[dayOrder[i]] || [];
        if (rows.length > 0) { candidates.push(rows[0].id); break; }
      }
      // Then try previous days
      if (candidates.length === 0) {
        for (let i = startIdx - 1; i >= 0; i--) {
          const rows = scheduledRows[dayOrder[i]] || [];
          if (rows.length > 0) { candidates.push(rows[rows.length - 1].id); break; }
        }
      }
    }
    if (candidates.length > 0) setSelectedRowIds(new Set([candidates[0]]));
  };

  const selectPrevAfterRemove = (removedIds: Set<string>) => {
    const removedRows = Array.from(removedIds).map(id => augmentedRows.find(r => r.id === id)!).filter(Boolean);
    if (removedRows.length === 0) return;
    removedRows.sort((a, b) => {
      if (a.shootDay !== b.shootDay) return (a.shootDay || 0) - (b.shootDay || 0);
      return a.order - b.order;
    });
    const first = removedRows[0];
    const prev = augmentedRows.filter(x => x.shootDay === first.shootDay && x.order < first.order && !removedIds.has(x.id)).sort((a, b) => b.order - a.order)[0];
    if (prev) { setSelectedRowIds(new Set([prev.id])); return; }
    const next = augmentedRows.filter(x => x.shootDay === first.shootDay && x.order > first.order && !removedIds.has(x.id)).sort((a, b) => a.order - b.order)[0];
    if (next) { setSelectedRowIds(new Set([next.id])); return; }
    const dayOrder = existingDays;
    const startIdx = first.shootDay !== null ? dayOrder.indexOf(first.shootDay) : -1;
    for (let i = startIdx - 1; i >= 0; i--) {
      const rows = scheduledRows[dayOrder[i]] || [];
      if (rows.length > 0) { setSelectedRowIds(new Set([rows[rows.length - 1].id])); return; }
    }
    for (let i = startIdx + 1; i < dayOrder.length; i++) {
      const rows = scheduledRows[dayOrder[i]] || [];
      if (rows.length > 0) { setSelectedRowIds(new Set([rows[0].id])); return; }
    }
  };

  const cutSelected = () => {
    if (selectedRowIds.size === 0 || activeDragIds.size > 0 || textEditingEnabled || !activeVersion) return;
    const ids = Array.from(selectedRowIds);
    const newRows = activeVersion.rows.map(r => ids.includes(r.id) ? { ...r, shootDay: -1 } : r);
    dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, rows: newRows } });
    selectPrevAfterRemove(new Set(ids as string[]));
  };

  const pasteClipboard = (targetRowId: string) => {
    if (activeDragIds.size > 0 || textEditingEnabled || !activeVersion) return;
    const targetRow = augmentedRows.find(r => r.id === targetRowId);

    const clipboardItems = augmentedRows
      .filter(r => r.shootDay === -1)
      .sort((a, b) => {
        if (a.shootDay !== b.shootDay) return (a.shootDay || 0) - (b.shootDay || 0);
        return a.order - b.order;
      })
      .map(r => ({ ...r }));

    if (clipboardItems.length === 0) return;

    // Determine target day: from row or from dummy row ID
    let overDay: number | null;
    let insertIdx: number;
    if (targetRow) {
      overDay = targetRow.shootDay;
      let dayRows = activeVersion.rows.filter(r => r.shootDay === overDay && r.shootDay !== -1).sort((a, b) => a.order - b.order);
      const targetIdx = dayRows.findIndex(r => r.id === targetRowId);
      insertIdx = targetIdx !== -1 ? targetIdx + 1 : dayRows.length;
    } else if (targetRowId.startsWith('empty-')) {
      overDay = parseInt(targetRowId.replace('empty-', ''), 10);
      insertIdx = 0;
    } else {
      return;
    }

    let newRows = activeVersion.rows.map(r => ({ ...r }));
    newRows = newRows.filter(r => r.shootDay !== -1);
    clipboardItems.forEach(item => item.shootDay = overDay);
    let dayRows = newRows.filter(r => r.shootDay === overDay).sort((a, b) => a.order - b.order);
    dayRows.splice(insertIdx, 0, ...clipboardItems);
    dayRows.forEach((r, i) => r.order = i);
    newRows = [...newRows.filter(r => r.shootDay !== overDay), ...dayRows];
    dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, rows: newRows } });
    setSelectedRowIds(new Set(clipboardItems.map(r => r.id)));
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
  }, [selectedRowIds, activeDragIds, textEditingEnabled, activeVersion]);

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
        selectNextAfterRemove(new Set(ids as string[]));
      }
      if (e.key === 'Enter' && selectedRowIds.size === 1 && !textEditingEnabled) {
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
    const selectedId = [...selectedRowIds][0] as string;
    const selectedRow = activeVersion?.rows.find(r => r.id === selectedId);
    if ((selectedRow && (selectedRow.type === 'NOTE' || selectedRow.type === 'BREAK' || selectedRow.type === 'SCENE')) || selectedId.startsWith('empty-')) {
      e.preventDefault();
      setFocusedRowId(selectedId);
      const selector = `[data-row-id="${selectedId}"] input[data-col="duration"]`;
      const input = scheduleScrollRef.current?.querySelector<HTMLElement>(selector);
      input?.focus();
      input?.select();
    }
      }
      if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !textEditingEnabled) {
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
        if (!activeVersion) return;
        e.preventDefault();
        const flat = flatRowIdsRef.current;
        if (flat.length === 0) return;
        const isShift = e.shiftKey;
        const isDown = e.key === 'ArrowDown';
          if (isShift) {
          const shiftFlat = flat.filter(id => !id.startsWith('empty-'));
          if (shiftFlat.length === 0) return;
          const anchor = lastClickedIdRef.current;
          const anchorIdx = (anchor && !anchor.startsWith('empty-')) ? shiftFlat.indexOf(anchor) : -1;
          if (anchorIdx === -1) {
            setSelectedRowIds(new Set([shiftFlat[0]]));
            setLastClickedId(shiftFlat[0]);
            scrollToRow(shiftFlat[0]);
            return;
          }
          const currentIds = Array.from(selectedRowIds);
          const indices = currentIds.map(id => shiftFlat.indexOf(id)).filter(i => i >= 0);
          let from: number, to: number;
          if (indices.length === 0) {
            from = anchorIdx;
            to = isDown ? Math.min(anchorIdx + 1, shiftFlat.length - 1) : Math.max(anchorIdx - 1, 0);
          } else {
            const minIdx = Math.min(...indices);
            const maxIdx = Math.max(...indices);
            if (isDown) {
              if (minIdx < anchorIdx) {
                from = minIdx + 1;
                to = maxIdx;
              } else {
                from = anchorIdx;
                to = Math.min(maxIdx + 1, shiftFlat.length - 1);
              }
            } else {
              if (maxIdx > anchorIdx) {
                from = minIdx;
                to = maxIdx - 1;
              } else {
                from = Math.max(minIdx - 1, 0);
                to = anchorIdx;
              }
            }
          }
          setSelectedRowIds(new Set(shiftFlat.slice(from, to + 1)));
          const scrollTarget = isDown ? to : from;
          scrollToRow(shiftFlat[scrollTarget]);
        } else {
          const currentIds = Array.from(selectedRowIds);
          if (currentIds.length === 0) {
            setSelectedRowIds(new Set([flat[0]]));
            setLastClickedId(flat[0]);
            scrollToRow(flat[0]);
            return;
          }
          const lastId = isDown ? currentIds[currentIds.length - 1] : currentIds[0];
          const idx = flat.indexOf(lastId);
          if (isDown && idx < flat.length - 1) {
            setSelectedRowIds(new Set([flat[idx + 1]]));
            setLastClickedId(flat[idx + 1]);
            scrollToRow(flat[idx + 1]);
          } else if (!isDown && idx > 0) {
            setSelectedRowIds(new Set([flat[idx - 1]]));
            setLastClickedId(flat[idx - 1]);
            scrollToRow(flat[idx - 1]);
          }
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedRowIds, textEditingEnabled, activeVersion, dispatch]);

  useEffect(() => {
    if (textEditingEnabled) setSelectedRowIds(new Set());
  }, [textEditingEnabled]);

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
  useEffect(() => {
    if (!focusedRowId) return;
    const id = setTimeout(() => setFocusedRowId(null), 3000);
    return () => clearTimeout(id);
  }, [focusedRowId]);
  const scrollToRow = (rowId: string) => {
    requestAnimationFrame(() => {
      const el = scheduleScrollRef.current?.querySelector(`[data-row-id="${rowId}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  };
  const activeDragIdsRef = useRef(activeDragIds);
  activeDragIdsRef.current = activeDragIds;
  const activeVersionRef = useRef(activeVersion);
  activeVersionRef.current = activeVersion;

  useEffect(() => {
    return () => {
      const ids = activeDragIdsRef.current;
      const version = activeVersionRef.current;
      if (ids.size > 0 && version) {
        const newRows = version.rows.map(r => ids.has(r.id) ? { ...r, shootDay: null, order: 999999 } : r);
        dispatch({ type: 'UPDATE_VERSION', payload: { id: version.id, rows: newRows } });
      }
    };
  }, []);

  const collisionDetection = useCallback<CollisionDetection>((args) => {
    const { active, pointerCoordinates, droppableContainers } = args;
    const isDraggingDay = active.data.current?.type === 'DAY';
    const filteredContainers = droppableContainers.filter((container) => {
      const id = container.id as string;
      const isDayWrap = id.startsWith('day-wrap-');
      if (isDraggingDay) return isDayWrap;
      if (isDayWrap) return false;
      if (activeDragIdsRef.current.has(id)) return false;
      return true;
    });

    if (pointerCoordinates) {
      const collisions: { id: string; distance: number; area: number }[] = [];
      for (const container of filteredContainers) {
        const rect = container.rect.current;
        if (rect) {
          const dx = Math.max(rect.left - pointerCoordinates.x, 0, pointerCoordinates.x - rect.right);
          const dy = Math.max(rect.top - pointerCoordinates.y, 0, pointerCoordinates.y - rect.bottom);
          const distance = Math.sqrt(dx * dx + dy * dy);
          const area = rect.width * rect.height;
          collisions.push({ id: container.id as string, distance, area });
        }
      }
      collisions.sort((a, b) => {
        if (a.distance !== b.distance) return a.distance - b.distance;
        return a.area - b.area;
      });
      if (collisions.length > 0) return collisions.map(c => ({ id: c.id }));
    }

    return closestCorners({ ...args, droppableContainers: filteredContainers });
  }, []);

  const ctrlOrCmdHeld = useAddMode();

  const { marqueeBox, justEndedRef: marqueeJustEndedRef } = useMarquee(
    scheduleScrollRef,
    useCallback((ids, isAddMode) => {
      const filtered = new Set([...ids].filter(id => !id.startsWith('empty-')));
      setSelectedRowIds(prev => isAddMode ? new Set([...prev, ...filtered]) : filtered);
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

  const scheduledRows = augmentedRows.filter(r => !activeDragIds.has(r.id) && r.shootDay !== -1).reduce((acc, row) => {
    if (row.shootDay !== null) {
      if (!acc[row.shootDay]) acc[row.shootDay] = [];
      acc[row.shootDay].push(row);
    }
    return acc;
  }, {} as Record<number, ScheduleRow[]>);

  (Object.values(scheduledRows) as ScheduleRow[][]).forEach(dayRows => {
    dayRows.sort((a, b) => a.order - b.order);
  });

  const unscheduledRows = augmentedRows.filter(r => r.shootDay === null && !activeDragIds.has(r.id)).sort((a, b) => a.order - b.order);

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
    const isDummy = rowId.startsWith('empty-');

    // Dummy rows can only add notes/breaks
    if (isDummy && (action === 'add_note' || action === 'add_break')) {
      const newId = generateUUID();
      const newRow: ScheduleRow = {
        id: newId,
        type: action === 'add_note' ? 'NOTE' : 'BREAK',
        shootDay,
        order: 0,
        ...(action === 'add_note' ? { noteText: '' } : { breakLabel: 'LUNCH', breakDuration: 60 }),
      };
      const dayRows = activeVersion.rows.filter(r => r.shootDay === shootDay).sort((a, b) => a.order - b.order);
      const firstDayRow = dayRows[0];
      const insertAt = firstDayRow ? activeVersion.rows.indexOf(firstDayRow) : activeVersion.rows.length;
      const newRows = [...activeVersion.rows.slice(0, insertAt), newRow, ...activeVersion.rows.slice(insertAt)];
      newRows.forEach((r, i) => r.order = i);
      dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, rows: newRows } });
      setSelectedRowIds(new Set([newId]));
      setFocusedRowId(newId);
      scrollToRow(newId);
      setContextMenu(null);
      return;
    }

    if (rowIndex === -1) return;
    const row = augmentedRows[rowIndex];

    let newRows = augmentedRows.map(r => ({ ...r }));
    let newRowIds: string[] = [];
    if (action === 'add_note') {
      const newId = generateUUID();
      newRows.push({
        id: newId, type: 'NOTE', shootDay, order: row.order + 0.5, noteText: ''
      });
      newRowIds.push(newId);
    } else if (action === 'add_break') {
      const newId = generateUUID();
      newRows.push({
        id: newId, type: 'BREAK', shootDay, order: row.order + 0.5, breakLabel: 'LUNCH', breakDuration: 60
      });
      newRowIds.push(newId);
    } else if (action === 'duplicate' && row.type === 'SCENE') {
      const newId = generateUUID();
      const newRow: ScheduleRow = {
        ...row, id: newId, order: row.order + 0.5,
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
      newRowIds.push(newId);
    } else if ((action === 'duplicate' || action === 'duplicate_note' || action === 'duplicate_break') && (row.type === 'NOTE' || row.type === 'BREAK')) {
      const newId = generateUUID();
      newRows.push({ ...row, id: newId, order: row.order + 0.5 });
      newRowIds.push(newId);
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
    newRows.forEach((r, i) => r.order = i);

    dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, rows: newRows } });
    if (newRowIds.length > 0) {
      setSelectedRowIds(new Set(newRowIds));
      setFocusedRowId(newRowIds[0]);
      scrollToRow(newRowIds[0]);
    }
    if (action === 'delete' || action === 'unschedule') {
      selectNextAfterRemove(new Set([rowId] as string[]));
    }
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
  const lastClickedIdRef = useRef(lastClickedId);
  lastClickedIdRef.current = lastClickedId;
  const flatRowIdsRef = useRef<string[]>([]);
  flatRowIdsRef.current = existingDays.flatMap(dayInt => {
    const dayRows = scheduledRows[dayInt];
    if (!dayRows || dayRows.length === 0) return [`empty-${dayInt}`];
    return [`empty-${dayInt}`, ...dayRows.map(r => r.id)];
  });

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
          setInsertBeforeId(overId.startsWith('end-') ? overId : `day-${day}`);
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
      const movedRow = { ...activeRow, shootDay: overDay };
      dayRows.splice(insertIndex, 0, movedRow);
      dayRows.forEach((r, i) => r.order = i);
      newRows = [...newRows.filter(r => r.shootDay !== overDay), ...dayRows];
      setSelectedRowIds(new Set([activeId]));
    } else {
      const draggingItems = draggingIds.map(id => newRows.find(r => r.id === id)!).filter(Boolean);
      const dayRowsBefore = newRows.filter(r => r.shootDay === overDay).sort((a, b) => a.order - b.order);
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
      const insertIndex = rawIndex === 0 ? 0 : rawIndex - draggingIds.filter(id => {
        const idx = dayRowsBefore.findIndex(r => r.id === id);
        return idx >= 0 && idx < rawIndex;
      }).length;

      newRows = newRows.filter(r => !draggingIds.includes(r.id));
      const dayRows = newRows.filter(r => r.shootDay === overDay).sort((a, b) => a.order - b.order);
      const newItems = draggingItems.map(item => ({ ...item, shootDay: overDay }));
      dayRows.splice(insertIndex, 0, ...newItems);
      dayRows.forEach((r, i) => r.order = i);
      newRows = [...newRows.filter(r => r.shootDay !== overDay), ...dayRows];
      setSelectedRowIds(new Set(draggingIds));
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
          overflow: hidden;
        }
        .col-sc { width: 40px; text-align: center; overflow: visible !important; padding: 0 !important; }
        .col-call { width: 35px; text-align: center; }
        .col-dur { width: 40px; text-align: center; }
        .col-ie { width: 40px; text-align: left; overflow: visible !important; }
        .col-set { width: 200px; overflow: visible !important; }
        .col-dn { width: 75px; text-align: left; overflow: visible !important; }
        .col-cast { width: 50px; text-align: left; overflow: visible !important; }
        .col-pgs { width: 50px; text-align: center; }
        .col-desc {
          text-align: left;
          line-height: 1.2;
        }
        .schedule-table .day-header-row td {
          padding-top: 16px !important;
          padding-bottom: 16px !important;
        }
        .schedule-table .row-note td,
        .schedule-table .row-break td {
          padding-top: 14px !important;
          padding-bottom: 14px !important;
        }
      `}</style>
    <DndContext 
      sensors={sensors}
      collisionDetection={collisionDetection}
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
        <UnscheduledBlock rows={unscheduledRows} projectScenes={project.scenes} textEditingEnabled={textEditingEnabled} onAction={handleContextMenuAction} contextMenu={contextMenu} setContextMenu={setContextMenu} selectedIds={selectedRowIds} activeDragIds={activeDragIds} onRowClick={handleRowClick} onSelectionChange={(ids, addMode) => setSelectedRowIds(prev => addMode ? new Set([...prev, ...ids]) : ids)} insertBeforeId={insertBeforeId} activeDragRow={activeDragRow} activeDragRows={activeDragRows} activeRowId={activeId} onRowNavigate={(rowId) => { setSelectedRowIds(new Set([rowId])); setLastClickedId(rowId); }} />
        
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
               <div className="flex items-center gap-4">
                 <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Stripboard</h2>
                 <span className="text-xs text-zinc-600 font-medium">{activeVersion?.name}</span>
                 {augmentedRows.filter(r => r.shootDay === -1).length > 0 && (
                   <span className="bg-zinc-800 text-zinc-200 text-xs font-semibold px-3 py-1 rounded-full flex items-center gap-1.5 border border-zinc-700">
                     <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                     {augmentedRows.filter(r => r.shootDay === -1).length} in buffer
                   </span>
                 )}
               </div>
              <button 
                 onClick={() => setTextEditingEnabled(p => !p)}
                 className={`flex items-center gap-1.5 px-3 py-1.5 rounded transition-colors font-sans cursor-pointer select-none ${textEditingEnabled ? 'bg-zinc-900 text-white' : 'hover:bg-zinc-800 text-zinc-400 hover:text-white'}`}
                 style={{ fontSize: '13px' }}
              >
                 <Pencil className="w-3.5 h-3.5 shrink-0" />
                 Edit Mode
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
                   focusedRowId={focusedRowId}
                   onRowDoubleClick={handleRowDoubleClick}
                   onRowNavigate={(rowId) => { setSelectedRowIds(new Set([rowId])); setLastClickedId(rowId); }}
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
          const inClipboard = augmentedRows.filter(r => r.shootDay === -1).length;
          if (selectedRowIds.size > 1) {
            return (
              <>
                <ContextMenuItem onClick={() => { cutSelected(); setContextMenu(null); }}>Cut {selectedRowIds.size} to Buffer</ContextMenuItem>
                <ContextMenuDivider />
                <ContextMenuItem variant="danger" onClick={() => {
                  const ids = Array.from(selectedRowIds);
                  const newRows = activeVersion!.rows.map(r => ids.includes(r.id) ? { ...r, shootDay: null, order: 999999 } : r);
                  dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion!.id, rows: newRows } });
                  selectNextAfterRemove(new Set(ids as string[]));
                  setContextMenu(null);
                }}>
                  Remove {selectedRowIds.size} Ribbons
                </ContextMenuItem>
              </>
            );
          }
          return (
            <>
              {inClipboard > 0 && (
                <>
                  <ContextMenuItem onClick={() => { pasteClipboard(contextMenu!.rowId); setContextMenu(null); }}>Paste Below ({inClipboard})</ContextMenuItem>
                  <ContextMenuDivider />
                </>
              )}
              {row && (
                <>
                  <ContextMenuItem onClick={() => { cutSelected(); setContextMenu(null); }}>Cut to Buffer</ContextMenuItem>
                  <ContextMenuDivider />
                </>
              )}
              <ContextMenuItem onClick={() => handleContextMenuAction('add_note')}>Add Note Below</ContextMenuItem>
              <ContextMenuItem onClick={() => handleContextMenuAction('add_break')}>Add Break Below</ContextMenuItem>
              {row && <ContextMenuDivider />}
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
