import React, { useState, useMemo, useCallback } from 'react';
import { ScheduleRow, ScheduleVersion, Project, Scene } from '../types';
import { generateUUID } from './utils';
import { getMarqueeMode } from './useLongPressMenu';

interface ContextMenuState {
  x: number;
  y: number;
  rowId: string;
  containerId: number | null;
}

interface ColorPickerState {
  rowId: string;
  bg: string;
  text: string;
  noteText: string;
  originalBg: string;
  originalText: string;
  originalNoteText: string;
}

export interface StripboardContextMenuConfig {
  selectedRowIds: Set<string>;
  setSelectedRowIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  rows: ScheduleRow[];
  activeVersion: ScheduleVersion | undefined;
  activeDragIds: Set<string>;
  textEditingEnabled: boolean;
  dispatch: React.Dispatch<any>;
  setFocusedRowId: React.Dispatch<React.SetStateAction<string | null>>;
  scrollToRow: (id: string) => void;
  setColorPicker: React.Dispatch<React.SetStateAction<ColorPickerState | null>>;
  project: Project;
}

export function useStripboardContextMenu(config: StripboardContextMenuConfig) {
  const {
    selectedRowIds, setSelectedRowIds, rows, activeVersion,
    activeDragIds, textEditingEnabled, dispatch, setFocusedRowId,
    scrollToRow, setColorPicker, project,
  } = config;

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const inClipboard = useMemo(
    () => rows.filter(r => r.containerId === -1).length,
    [rows]
  );

  const existingDays = useMemo(() => {
    const days = new Set<number>();
    for (const r of rows) {
      if (r.containerId !== null && r.containerId !== -1 && r.containerId !== undefined) days.add(r.containerId);
    }
    return Array.from(days).sort((a, b) => a - b);
  }, [rows]);

  const scheduledRows = useMemo(() => {
    const map: Record<number, ScheduleRow[]> = {};
    for (const r of rows) {
      const d = r.containerId ?? 0;
      if (!map[d]) map[d] = [];
      map[d].push(r);
    }
    return map;
  }, [rows]);

  const selectNextAfterRemove = useCallback((removedIds: Set<string>) => {
    const removedRows = Array.from(removedIds).map(id => rows.find(r => r.id === id)!).filter(Boolean);
    if (removedRows.length === 0) return;
    removedRows.sort((a, b) => {
      if (a.containerId !== b.containerId) return (a.containerId || 0) - (b.containerId || 0);
      return a.order - b.order;
    });
    const candidates: string[] = [];
    for (const r of removedRows) {
      const next = rows.filter(x => x.containerId === r.containerId && x.order > r.order && !removedIds.has(x.id)).sort((a, b) => a.order - b.order)[0];
      if (next) candidates.push(next.id);
    }
    if (candidates.length === 0) {
      const first = removedRows[0];
      const prev = rows.filter(x => x.containerId === first.containerId && x.order < first.order && !removedIds.has(x.id)).sort((a, b) => b.order - a.order)[0];
      if (prev) candidates.push(prev.id);
    }
    if (candidates.length === 0) {
      const firstRemoved = removedRows[0];
      const startIdx = firstRemoved.containerId !== null ? existingDays.indexOf(firstRemoved.containerId) : -1;
      for (let i = startIdx + 1; i < existingDays.length; i++) {
        const rows = scheduledRows[existingDays[i]] || [];
        if (rows.length > 0) { candidates.push(rows[0].id); break; }
      }
      if (candidates.length === 0) {
        for (let i = startIdx - 1; i >= 0; i--) {
          const rows = scheduledRows[existingDays[i]] || [];
          if (rows.length > 0) { candidates.push(rows[rows.length - 1].id); break; }
        }
      }
    }
    if (candidates.length > 0) setSelectedRowIds(new Set([candidates[0]]));
  }, [rows, existingDays, scheduledRows, setSelectedRowIds]);

  const selectPrevAfterRemove = useCallback((removedIds: Set<string>) => {
    const removedRows = Array.from(removedIds).map(id => rows.find(r => r.id === id)!).filter(Boolean);
    if (removedRows.length === 0) return;
    removedRows.sort((a, b) => {
      if (a.containerId !== b.containerId) return (a.containerId || 0) - (b.containerId || 0);
      return a.order - b.order;
    });
    const first = removedRows[0];
    const prev = rows.filter(x => x.containerId === first.containerId && x.order < first.order && !removedIds.has(x.id)).sort((a, b) => b.order - a.order)[0];
    if (prev) { setSelectedRowIds(new Set([prev.id])); return; }
    const next = rows.filter(x => x.containerId === first.containerId && x.order > first.order && !removedIds.has(x.id)).sort((a, b) => a.order - b.order)[0];
    if (next) { setSelectedRowIds(new Set([next.id])); return; }
    const startIdx = first.containerId !== null ? existingDays.indexOf(first.containerId) : -1;
    for (let i = startIdx - 1; i >= 0; i--) {
      const rows = scheduledRows[existingDays[i]] || [];
      if (rows.length > 0) { setSelectedRowIds(new Set([rows[rows.length - 1].id])); return; }
    }
    for (let i = startIdx + 1; i < existingDays.length; i++) {
      const rows = scheduledRows[existingDays[i]] || [];
      if (rows.length > 0) { setSelectedRowIds(new Set([rows[0].id])); return; }
    }
  }, [rows, existingDays, scheduledRows, setSelectedRowIds]);

  const cutSelected = useCallback(() => {
    if (selectedRowIds.size === 0 || activeDragIds.size > 0 || textEditingEnabled || !activeVersion) return;
    const ids = Array.from(selectedRowIds).filter(id => !activeVersion.rows.find(r => r.id === id)?.pinned);
    if (ids.length === 0) return;
    let newRows = activeVersion.rows.map(r => ids.includes(r.id) ? { ...r, containerId: -1 } : r);
    dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, rows: newRows } });
    selectPrevAfterRemove(new Set(ids as string[]));
  }, [selectedRowIds, activeDragIds, textEditingEnabled, activeVersion, dispatch, selectPrevAfterRemove]);

  const pasteClipboard = useCallback((targetRowId: string) => {
    if (activeDragIds.size > 0 || textEditingEnabled || !activeVersion) return;
    const targetRow = rows.find(r => r.id === targetRowId);

    const clipboardItems = rows
      .filter(r => r.containerId === -1)
      .sort((a, b) => {
        if (a.containerId !== b.containerId) return (a.containerId || 0) - (b.containerId || 0);
        return a.order - b.order;
      })
      .map(r => ({ ...r }));

    if (clipboardItems.length === 0) return;

    let overDay: number | null;
    let insertIdx: number;

    if (targetRowId.startsWith('empty-')) {
      overDay = parseInt(targetRowId.replace('empty-', ''), 10);
      const dayRows = activeVersion.rows
        .filter(r => r.containerId === overDay && r.containerId !== -1)
        .sort((a, b) => a.order - b.order);
      insertIdx = dayRows.length > 0 && dayRows[0]?.pinned ? 1 : 0;
    } else if (targetRow) {
      overDay = targetRow.containerId;
      const dayRows = activeVersion.rows
        .filter(r => r.containerId === overDay && r.containerId !== -1)
        .sort((a, b) => a.order - b.order);
      const targetIdx = dayRows.findIndex(r => r.id === targetRowId);
      insertIdx = targetIdx !== -1 ? targetIdx + 1 : dayRows.length;
    } else {
      return;
    }

    clipboardItems.forEach(item => item.containerId = overDay);

    let newRows = activeVersion.rows.filter(r => r.containerId !== -1);
    const dayRows = newRows.filter(r => r.containerId === overDay).sort((a, b) => a.order - b.order);
    dayRows.splice(insertIdx, 0, ...clipboardItems);
    dayRows.forEach((r, i) => r.order = i);
    newRows = [...newRows.filter(r => r.containerId !== overDay), ...dayRows];

    dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, rows: newRows } });
    setSelectedRowIds(new Set(clipboardItems.map(r => r.id)));
    if (clipboardItems.length > 0) scrollToRow(clipboardItems[0].id);
  }, [activeDragIds, textEditingEnabled, activeVersion, rows, dispatch, setSelectedRowIds, scrollToRow]);

  const handleContextMenuAction = useCallback((action: string) => {
    if (!contextMenu || !activeVersion) return;
    const { rowId, containerId } = contextMenu;
    const rowIndex = rows.findIndex(r => r.id === rowId);
    const isDummy = rowId.startsWith('empty-');

    if (isDummy && (action === 'add_note' || action === 'add_break')) {
      const newId = generateUUID();
      const newRow: ScheduleRow = {
        id: newId,
        type: action === 'add_note' ? 'NOTE' : 'BREAK',
        containerId,
        order: 0,
        ...(action === 'add_note' ? { noteText: '' } : { breakLabel: 'LUNCH', breakDuration: 60 }),
      };
      const dayRows = activeVersion.rows.filter(r => r.containerId === containerId).sort((a, b) => a.order - b.order);
      const firstDayRow = dayRows[0];
      let insertAt: number;
      if (firstDayRow?.pinned) {
        const pinnedIdx = activeVersion.rows.indexOf(firstDayRow);
        insertAt = pinnedIdx + 1;
      } else {
        insertAt = firstDayRow ? activeVersion.rows.indexOf(firstDayRow) : activeVersion.rows.length;
      }
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
    const row = rows[rowIndex];

    let newRows = rows.map(r => ({ ...r }));
    let newRowIds: string[] = [];
    if (action === 'add_note') {
      const newId = generateUUID();
      newRows.push({ id: newId, type: 'NOTE', containerId, order: row.order + 0.5, noteText: '' });
      newRowIds.push(newId);
    } else if (action === 'add_break') {
      const newId = generateUUID();
      newRows.push({ id: newId, type: 'BREAK', containerId, order: row.order + 0.5, breakLabel: 'LUNCH', breakDuration: 60 });
      newRowIds.push(newId);
    } else if (action === 'duplicate' && row.type === 'SCENE') {
      const newId = generateUUID();
      const newRow: ScheduleRow = { ...row, id: newId, order: row.order + 0.5 };
      const originalScene = project.scenes.find(s => s.id === row.sceneId);
      if (originalScene) {
        const baseNumber = originalScene.sceneNumber.replace(/[A-Z]+$/, '');
        const existingLetters = project.scenes
          .filter(s => s.sceneNumber.match(new RegExp('^' + baseNumber + '[A-Z]$')))
          .map(s => s.sceneNumber.slice(-1));
        let nextLetter = 'A';
        for (let code = 65; code <= 90; code++) {
          const letter = String.fromCharCode(code);
          if (!existingLetters.includes(letter)) { nextLetter = letter; break; }
        }
        const newScene: Scene = { ...originalScene, id: generateUUID(), sceneNumber: baseNumber + nextLetter };
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
      setColorPicker({ rowId: row.id, bg: row.noteColor || '#591b1b', text: row.noteTextColor || '#ffffff', noteText: row.noteText || '', originalBg: row.noteColor || '#591b1b', originalText: row.noteTextColor || '#ffffff', originalNoteText: row.noteText || '' });
      setContextMenu(null);
      return;
    } else if (action === 'delete') {
      if (row.pinned) { setContextMenu(null); return; }
      if (row.containerId == null && row.type === 'SCENE') {
        const containerRows = newRows.filter(r => r.containerId != null && r.containerId !== -1);
        const maxOrder = containerRows.length > 0 ? Math.max(...containerRows.map(r => r.order)) : -1;
        newRows = newRows.map(r => r.id === rowId ? { ...r, containerId: 1, order: maxOrder + 1 } : r);
      } else {
        newRows = newRows.filter(r => r.id !== rowId);
      }
    } else if (action === 'boneyard' && row.type !== 'DAYBREAK') {
      newRows = newRows.map(r => r.id === rowId ? { ...r, containerId: null, order: 999999 } : r);
    }

    newRows = newRows.sort((a, b) => {
      if (a.containerId === null && b.containerId !== null) return 1;
      if (a.containerId !== null && b.containerId === null) return -1;
      if (a.containerId !== b.containerId) return (a.containerId || 0) - (b.containerId || 0);
      return a.order - b.order;
    });
    newRows.forEach((r, i) => r.order = i);

    dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, rows: newRows } });
    if (newRowIds.length > 0) {
      setSelectedRowIds(new Set(newRowIds));
      setFocusedRowId(newRowIds[0]);
      scrollToRow(newRowIds[0]);
    }
    if (action === 'delete' || action === 'boneyard') {
      selectNextAfterRemove(new Set([rowId] as string[]));
    }
    setContextMenu(null);
  }, [contextMenu, activeVersion, rows, project, dispatch, setSelectedRowIds, setFocusedRowId, scrollToRow, setColorPicker, selectNextAfterRemove, setContextMenu]);

  const createOnContextMenu = useCallback((options?: {
    prependSelect?: () => void;
  }) => (e: React.MouseEvent) => {
    const rowEl = (e.target as HTMLElement).closest('[data-row-id]');
    e.preventDefault();
    if (rowEl) {
      e.stopPropagation();
      const rowId = rowEl.getAttribute('data-row-id')!;
      if (getMarqueeMode() === 'tool') {
        setSelectedRowIds(prev => prev.has(rowId) ? prev : new Set([...prev, rowId]));
      } else if (!selectedRowIds.has(rowId)) {
        setSelectedRowIds(new Set([rowId]));
      }
      const containerIdAttr = rowEl.getAttribute('data-container-id');
      const containerId = containerIdAttr === 'null' ? null : parseInt(containerIdAttr!, 10);
      options?.prependSelect?.();
      setContextMenu({ x: e.clientX, y: e.clientY, rowId, containerId });
    } else {
      setContextMenu(null);
    }
  }, [selectedRowIds, setSelectedRowIds, setContextMenu]);

  return {
    contextMenu,
    setContextMenu,
    inClipboard,
    cutSelected,
    pasteClipboard,
    handleContextMenuAction,
    createOnContextMenu,
    selectNextAfterRemove,
  };
}
