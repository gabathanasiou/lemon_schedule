import React, { useCallback, useEffect, useMemo } from 'react';
import type { DragStartEvent, DragOverEvent, DragEndEvent } from '@dnd-kit/core';
import { ScheduleRow, ScheduleVersion } from '../../types';
import { isAddModeActive } from '../../lib/useMarquee';
import { DayDropState, buildDayBlocks, rebuildRowsFromBlocks } from './calendarUtils';

export interface UseCalendarDragConfig {
  activeId: string | null;
  setActiveId: (id: string | null) => void;
  activeDragDay: number | null;
  setActiveDragDay: (d: number | null) => void;
  activeDragRow: ScheduleRow | null;
  setActiveDragRow: (r: ScheduleRow | null) => void;
  activeDragIds: Set<string>;
  setActiveDragIds: (s: Set<string>) => void;
  insertBeforeId: string | null;
  setInsertBeforeId: (id: string | null) => void;
  dayDropState: DayDropState;
  setDayDropState: (d: DayDropState | ((prev: DayDropState) => DayDropState)) => void;
  setSelectedRowIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  selectedRowIdsRef: React.MutableRefObject<Set<string>>;
  calendarGridRef: React.MutableRefObject<HTMLDivElement | null>;
  dragPointerRef: React.MutableRefObject<{ x: number; y: number } | null>;
  activeVersion: ScheduleVersion | undefined;
  sections: { index: number; rows: ScheduleRow[]; daybreakRow?: ScheduleRow }[];
  dateSectionMap: Map<string, number>;
  sectionDateMap: Map<number, string>;
  nonShootDateMap: Map<string, boolean>;
  flashDays: (entries: [number, 'a' | 'b'][]) => void;
  dispatch: React.Dispatch<any>;
}

export function useCalendarDrag(config: UseCalendarDragConfig) {
  const {
    activeId, setActiveId, activeDragDay, setActiveDragDay, activeDragRow, setActiveDragRow,
    activeDragIds, setActiveDragIds, insertBeforeId, setInsertBeforeId,
    dayDropState, setDayDropState, setSelectedRowIds, selectedRowIdsRef,
    calendarGridRef, dragPointerRef, activeVersion, sections, dateSectionMap,
    sectionDateMap, nonShootDateMap, flashDays, dispatch,
  } = config;

  const activeType = activeId ? (activeDragDay !== null ? 'DAY' : 'SCENE_CARD') : null;

  const updateDayDropZone = useCallback((x: number, y: number) => {
    const container = calendarGridRef.current;
    if (!container) return;
    const dayEls = container.querySelectorAll('[data-date-key]');
    let inside: { el: Element; rect: DOMRect; sectionIndex: number } | null = null;
    let nearest: { el: Element; rect: DOMRect; sectionIndex: number; dist: number } | null = null;
    for (const el of dayEls) {
      const dateKey = el.getAttribute('data-date-key');
      if (!dateKey) continue;
      const sectionIndex = dateSectionMap.get(dateKey);
      if (sectionIndex == null) continue;
      const rect = el.getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        inside = { el, rect, sectionIndex };
        break;
      }
      const dx = Math.max(rect.left - x, 0, x - rect.right);
      const dy = Math.max(rect.top - y, 0, y - rect.bottom);
      const dist = Math.hypot(dx, dy);
      if (dist < 24 && (!nearest || dist < nearest.dist)) nearest = { el, rect, sectionIndex, dist };
    }
    if (inside) {
      const ratio = inside.rect.width > 0 ? (x - inside.rect.left) / inside.rect.width : 0.5;
      if (ratio < 0.3) {
        setDayDropState(prev => (prev && prev.zone === 'insert' && prev.side === 'before' && prev.sectionIndex === inside.sectionIndex ? prev : { zone: 'insert', side: 'before', sectionIndex: inside.sectionIndex }));
      } else if (ratio > 0.7) {
        setDayDropState(prev => (prev && prev.zone === 'insert' && prev.side === 'after' && prev.sectionIndex === inside.sectionIndex ? prev : { zone: 'insert', side: 'after', sectionIndex: inside.sectionIndex }));
      } else {
        setDayDropState(prev => (prev && prev.zone === 'swap' && prev.sectionIndex === inside.sectionIndex ? prev : { zone: 'swap', sectionIndex: inside.sectionIndex }));
      }
      return;
    }
    if (nearest) {
      const side = x < nearest.rect.left || y < nearest.rect.top ? 'before' : 'after';
      setDayDropState(prev => (prev && prev.zone === 'insert' && prev.side === side && prev.sectionIndex === nearest.sectionIndex ? prev : { zone: 'insert', side, sectionIndex: nearest.sectionIndex }));
      return;
    }
    setDayDropState(prev => (prev === null ? prev : null));
  }, [dateSectionMap]);

  // Track the pointer while dragging a DAY so the drop zone stays in sync
  useEffect(() => {
    if (activeType !== 'DAY') { dragPointerRef.current = null; setDayDropState(null); return; }
    const onMove = (e: PointerEvent) => {
      dragPointerRef.current = { x: e.clientX, y: e.clientY };
      updateDayDropZone(e.clientX, e.clientY);
    };
    const onUp = () => { dragPointerRef.current = null; };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [activeType, updateDayDropZone]);

  const handleDragStart = (e: DragStartEvent) => {
    if (isAddModeActive()) return;
    const data = e.active.data.current as any;
    setActiveId(e.active.id as string);
    if (data?.type === 'DAY') {
      setActiveDragDay(data.sectionIndex);
      setActiveDragRow(null);
      setActiveDragIds(new Set());
      return;
    }
    const draggedId = e.active.id as string;
    const currentSelection = selectedRowIdsRef.current;
    if (currentSelection.has(draggedId) && currentSelection.size > 1) {
      setActiveDragIds(new Set(currentSelection));
    } else {
      if (currentSelection.size > 0) setSelectedRowIds(new Set());
      setActiveDragIds(new Set([draggedId]));
    }
    setActiveDragRow((activeVersion?.rows || []).find(r => r.id === draggedId) || null);
    setActiveDragDay(null);
  };

  const handleDragOver = (e: DragOverEvent) => {
    const overId = e.over?.id as string | undefined;
    if (!overId || activeType !== 'SCENE_CARD') { setInsertBeforeId(null); return; }
    if (overId === 'boneyard') { setInsertBeforeId('end-boneyard'); return; }
    if (overId.startsWith('end-')) { setInsertBeforeId(overId); return; }
    if (overId.startsWith('day-')) { setInsertBeforeId(overId); return; }
    setInsertBeforeId(overId);
  };

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    const lastInsertId = insertBeforeId;
    setActiveId(null);
    setActiveDragRow(null);
    setActiveDragDay(null);
    setActiveDragIds(new Set());
    setInsertBeforeId(null);
    setDayDropState(null);
    if (!over || !activeVersion) return;

    const activeData = active.data.current as any;

    if (activeData?.type === 'DAY') {
      const sourceIdx = activeData.sectionIndex as number;
      const overData = over.data.current as any;
      let targetIdx: number | null = null;
      if (overData?.sectionIndex != null) {
        targetIdx = overData.sectionIndex;
      } else if (typeof over.id === 'string' && over.id.startsWith('day-')) {
        const dateKey = over.id.slice(4);
        targetIdx = dateSectionMap.get(dateKey) ?? null;
      }
      if (sourceIdx < 0 || sourceIdx >= sections.length) return;

      const allRows = activeVersion.rows.map(r => ({ ...r }));
      const boneyard = allRows.filter(r => r.containerId == null);
      const scheduled = allRows.filter(r => r.containerId != null).sort((a, b) => a.order - b.order);
      const { blocks, tail } = buildDayBlocks(scheduled);

      // Insert: drop on a day's edge or in the gap between days
      let insertT: number | null = null;
      const drop = dayDropState;
      if (drop && drop.zone === 'insert') {
        insertT = (drop.side === 'after' ? drop.sectionIndex + 1 : drop.sectionIndex);
      }

      if (insertT != null && sourceIdx >= 1) {
        insertT = Math.max(1, Math.min(blocks.length, insertT));
        if (sourceIdx === insertT || sourceIdx + 1 === insertT) return;

        // Snapshot each production day's call time (the daybreak above it)
        const callTimeOfDay = new Map<number, string>();
        for (let i = 1; i < blocks.length; i++) {
          callTimeOfDay.set(i, blocks[i - 1].daybreakRow?.daybreakCallTime || '08:00');
        }

        const moved = blocks.splice(sourceIdx, 1)[0];
        const targetIndex = insertT > sourceIdx ? insertT - 1 : insertT;
        blocks.splice(targetIndex, 0, moved);
        console.log(`[INSERT] section ${sourceIdx} -> position ${insertT} | scenes ${moved.content.length}`);

        // Rotate call times so every day keeps its own call time as it shifts
        for (let i = 1; i < blocks.length; i++) {
          const gov = blocks[i - 1].daybreakRow;
          if (gov) gov.daybreakCallTime = callTimeOfDay.get(blocks[i].origIdx) || '08:00';
        }

        const combined = rebuildRowsFromBlocks(blocks, tail, boneyard);
        dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, rows: combined } });
        flashDays([[targetIndex, 'a']]);
        return;
      }

      // Swap: drop on the center of a day cell
      if (targetIdx == null || sourceIdx === targetIdx) return;
      if (targetIdx < 0 || targetIdx >= sections.length) return;

      const sourceBlock = blocks[sourceIdx];
      const targetBlock = blocks[targetIdx];
      if (!sourceBlock || !targetBlock) return;

      const swapContent = [...targetBlock.content];
      targetBlock.content = [...sourceBlock.content];
      sourceBlock.content = swapContent;

      if (sourceIdx > 0 && targetIdx > 0) {
        const srcAbove = blocks[sourceIdx - 1].daybreakRow;
        const tgtAbove = blocks[targetIdx - 1].daybreakRow;
        if (srcAbove && tgtAbove) {
          const a = srcAbove.daybreakCallTime;
          const b = tgtAbove.daybreakCallTime;
          console.log(`[SWAP] section ${sourceIdx} <-> ${targetIdx} | callTime ${a} <-> ${b} | scenes ${sourceBlock.content.length} <-> ${targetBlock.content.length}`);
          srcAbove.daybreakCallTime = b;
          tgtAbove.daybreakCallTime = a;
        }
      }

      const combined = rebuildRowsFromBlocks(blocks, tail, boneyard);
      dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, rows: combined } });
      flashDays([[sourceIdx, 'a'], [targetIdx, 'b']]);
      return;
    }

    const draggedId = active.id as string;
    const allSelected = new Set(activeDragIds);
    const draggingIds = allSelected.size > 1 ? Array.from(allSelected) : [draggedId];
    draggingIds.sort((a, b) => {
      const rA = (activeVersion?.rows || []).find(r => r.id === a);
      const rB = (activeVersion?.rows || []).find(r => r.id === b);
      if (rA && rB) return rA.order - rB.order;
      return 0;
    });

    let targetDateKey: string | null = null;
    const overData = over.data.current as any;
    if (over.id === 'boneyard') {
      targetDateKey = null;
    } else if (typeof over.id === 'string' && over.id.startsWith('day-')) {
      targetDateKey = over.id.slice(4);
    } else if (typeof over.id === 'string' && over.id.startsWith('end-')) {
      targetDateKey = over.id.slice(4);
    } else {
      const overRow = (activeVersion?.rows || []).find(r => r.id === over.id);
      if (overRow) {
        for (const s of sections) {
          if (s.rows.some(rr => rr.id === overRow.id)) {
            targetDateKey = sectionDateMap.get(s.index) || null;
            break;
          }
        }
      }
    }

    let targetSectionIndex: number | null = null;
    if (targetDateKey) {
      targetSectionIndex = dateSectionMap.get(targetDateKey) ?? null;
    }
    if (targetDateKey && nonShootDateMap.has(targetDateKey)) return;

    const newRows = activeVersion.rows.map(r => ({ ...r }));

    if (targetSectionIndex === null) {
      newRows.filter(r => draggingIds.includes(r.id)).forEach(r => {
        const idx = newRows.findIndex(nr => nr.id === r.id);
        if (idx !== -1) newRows[idx] = { ...newRows[idx], containerId: null, order: 999999 };
      });
      newRows.sort((a, b) => {
        if ((a.containerId === null) !== (b.containerId === null)) return a.containerId === null ? 1 : -1;
        return a.order - b.order;
      });
      newRows.forEach((r, i) => r.order = i);
      dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, rows: newRows } });
      return;
    }

    const targetSection = sections.find(s => s.index === targetSectionIndex);
    if (!targetSection) return;

    const sectionRowIds = new Set(targetSection.rows.map(r => r.id));
    let insertIndex = targetSection.rows.length;
    if (lastInsertId && typeof lastInsertId === 'string' && !lastInsertId.startsWith('day-') && !lastInsertId.startsWith('end-') && !lastInsertId.startsWith('boneyard')) {
      const idx = targetSection.rows.findIndex(r => r.id === lastInsertId);
      if (idx !== -1) insertIndex = idx;
    }

    newRows.filter(r => draggingIds.includes(r.id)).forEach(r => {
      const idx = newRows.findIndex(nr => nr.id === r.id);
      if (idx !== -1 && !sectionRowIds.has(r.id)) newRows.splice(idx, 1);
    });

    let insertAt: number;
    if (targetSection.rows.length > 0) {
      const firstSectionRow = targetSection.rows[0];
      const firstIdx = newRows.findIndex(r => r.id === firstSectionRow.id);
      insertAt = firstIdx !== -1 ? firstIdx + insertIndex : newRows.length;
    } else if (targetSection.daybreakRow) {
      const daybreakIdx = newRows.findIndex(r => r.id === targetSection.daybreakRow!.id);
      insertAt = daybreakIdx !== -1 ? daybreakIdx : newRows.length;
    } else {
      insertAt = newRows.length;
    }

    const draggingItems = draggingIds
      .map(id => (activeVersion?.rows || []).find(r => r.id === id))
      .filter(Boolean) as ScheduleRow[];
    const newItems = draggingItems.map(item => ({ ...item, containerId: 1 }));

    const before = newRows.slice(0, insertAt).filter(r => !draggingIds.includes(r.id));
    const after = newRows.slice(insertAt).filter(r => !draggingIds.includes(r.id));
    const combined = [...before, ...newItems, ...after];
    combined.forEach((r, i) => r.order = i);

    dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, rows: combined } });
    setSelectedRowIds(new Set(draggingIds));
  };

  return { activeType, updateDayDropZone, handleDragStart, handleDragOver, handleDragEnd };
}
