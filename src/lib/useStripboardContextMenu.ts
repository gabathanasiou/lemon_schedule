import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { ScheduleRow, ScheduleVersion, Project } from '../types';
import { generateUUID } from './utils';
import { renumberRows, insertionOrder, daybreakRegionFromTarget } from './daybreakUtils';
import { useSceneDuplicate } from './sceneDuplicate';
import { isEmptyDayMeta } from './dayMeta';
import { getMarqueeMode } from './useLongPressMenu';
import { getNoteBannerColors } from './ribbonUtils';
import { useDialog } from '../components/Dialog';
import type { PresenceHeldItem } from './supabase/presence';

interface ContextMenuState {
  x: number;
  y: number;
  rowId: string;
  containerId: number | null;
  /** Which visual region of a DAYBREAK row was right-clicked: the
   *  "START OF DAY N" header (opens the day BELOW) or the footer/rest
   *  ("End of Day N" — the day above). Roadmap 226. */
  daybreakRegion?: 'header' | 'footer';
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
  /** Enables add_daybreak / duplicate_daybreak context actions (ScheduleTab). */
  enableDaybreaks?: boolean;
  /** Live peer-held items (roadmap 235): their item ids refuse every
   *  MOVE/REMOVE path here (no menu, no cut, no delete/boneyard). */
  heldBy?: Map<string, PresenceHeldItem>;
}

/** The transient "X is moving this" chip shown instead of a menu on a held
 *  item (auto-hides). */
export interface HeldHintState {
  x: number;
  y: number;
  name: string;
}

export function useStripboardContextMenu(config: StripboardContextMenuConfig) {
  const {
    selectedRowIds, setSelectedRowIds, rows, activeVersion,
    activeDragIds, textEditingEnabled, dispatch, setFocusedRowId,
    scrollToRow, setColorPicker, project, enableDaybreaks = false, heldBy,
  } = config;

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [heldHint, setHeldHint] = useState<HeldHintState | null>(null);
  const heldHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dialog = useDialog();
  const sceneDuplicate = useSceneDuplicate();

  const showHeldHint = useCallback((x: number, y: number, name: string) => {
    setHeldHint({ x, y, name });
    if (heldHintTimerRef.current) clearTimeout(heldHintTimerRef.current);
    heldHintTimerRef.current = setTimeout(() => setHeldHint(null), 2500);
  }, []);

  useEffect(() => () => {
    if (heldHintTimerRef.current) clearTimeout(heldHintTimerRef.current);
  }, []);

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
    // Held rows are never cut (roadmap 235) — the peer's drop owns them.
    const ids = Array.from(selectedRowIds).filter(id => !activeVersion.rows.find(r => r.id === id)?.pinned && !heldBy?.has(id));
    if (ids.length === 0) return;
    let newRows = activeVersion.rows.map(r => ids.includes(r.id) ? { ...r, containerId: -1 } : r);
    dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, rows: newRows } });
    selectPrevAfterRemove(new Set(ids as string[]));
  }, [selectedRowIds, activeDragIds, textEditingEnabled, activeVersion, dispatch, selectPrevAfterRemove, heldBy]);

  const pasteClipboard = useCallback((targetRowId: string) => {
    if (activeDragIds.size > 0 || textEditingEnabled || !activeVersion) return;
    const targetRow = rows.find(r => r.id === targetRowId);

    const clipboardItems = rows
      .filter(r => r.containerId === -1 && !heldBy?.has(r.id))
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
      insertIdx = dayRows.length;
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
    const baseOrder = insertionOrder(dayRows, insertIdx);
    clipboardItems.forEach((item, j) => { item.containerId = overDay; item.order = baseOrder + j * 0.01; });
    newRows = [
      ...newRows.filter(r => r.containerId !== overDay),
      ...dayRows.slice(0, insertIdx),
      ...clipboardItems,
      ...dayRows.slice(insertIdx),
    ];

    dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, rows: newRows } });
    setSelectedRowIds(new Set(clipboardItems.map(r => r.id)));
    if (clipboardItems.length > 0) scrollToRow(clipboardItems[0].id);
  }, [activeDragIds, textEditingEnabled, activeVersion, rows, dispatch, setSelectedRowIds, scrollToRow, heldBy]);

  const handleContextMenuAction = useCallback(async (action: string) => {
    if (!contextMenu || !activeVersion) return;
    const { rowId, containerId } = contextMenu;
    // A peer's drag started while the menu was open (roadmap 235): the
    // MOVE/REMOVE actions refuse a now-held row — the same lock as the drag
    // paths. Insert-style actions (add note/break, duplicate) stay allowed.
    if ((action === 'delete' || action === 'boneyard') && heldBy?.has(rowId)) {
      setContextMenu(null);
      return;
    }
    const rowIndex = rows.findIndex(r => r.id === rowId);
    const isDummy = rowId.startsWith('empty-');

    if (isDummy && (action === 'add_note' || action === 'add_break' || (enableDaybreaks && action === 'add_daybreak'))) {
      const newId = generateUUID();
      const type = action === 'add_note' ? 'NOTE' as const : action === 'add_break' ? 'BREAK' as const : 'DAYBREAK' as const;
      const newRow: ScheduleRow = {
        id: newId,
        type,
        containerId,
        order: 0,
        ...(action === 'add_note' ? { noteText: '' } : action === 'add_break' ? { breakLabel: 'LUNCH', breakDuration: 60 } : { daybreakLabel: 'DAYBREAK' }),
      };
      const dayRows = activeVersion.rows.filter(r => r.containerId === containerId).sort((a, b) => a.order - b.order);
      const lastDayRow = dayRows[dayRows.length - 1];
      const insertAt = lastDayRow ? activeVersion.rows.indexOf(lastDayRow) + 1 : activeVersion.rows.length;
      const newRows = [...activeVersion.rows.slice(0, insertAt), newRow, ...activeVersion.rows.slice(insertAt)];
      dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, rows: renumberRows(newRows) } });
      setSelectedRowIds(new Set([newId]));
      setFocusedRowId(newId);
      scrollToRow(newId);
      setContextMenu(null);
      return;
    }

    if (rowIndex === -1) return;
    const row = rows[rowIndex];

    let newRows: ScheduleRow[] = rows;
    let newRowIds: string[] = [];
    if (action === 'add_note') {
      const newId = generateUUID();
      newRows.push({ id: newId, type: 'NOTE', containerId, order: row.order + 0.5, noteText: '' });
      newRowIds.push(newId);
    } else if (action === 'add_break') {
      const newId = generateUUID();
      newRows.push({ id: newId, type: 'BREAK', containerId, order: row.order + 0.5, breakLabel: 'LUNCH', breakDuration: 60 });
      newRowIds.push(newId);
    } else if (enableDaybreaks && action === 'add_daybreak') {
      const newId = generateUUID();
      newRows.push({ id: newId, type: 'DAYBREAK', containerId, order: row.order + 0.5, daybreakLabel: 'DAYBREAK', daybreakCallTime: '08:00' });
      newRowIds.push(newId);
    } else if (action === 'duplicate' && row.type === 'SCENE') {
      // Route the scene duplicate through the shared modal (roadmap 132 Part D);
      // the row insert happens on confirm, inside the modal's undo batch.
      const originalScene = project.scenes.find(s => s.id === row.sceneId);
      if (originalScene) {
        setContextMenu(null);
        sceneDuplicate.request({
          scene: originalScene,
          onConfirm: (newScene) => {
            const newId = generateUUID();
            const newRow: ScheduleRow = { ...row, id: newId, order: row.order + 0.5, sceneId: newScene.id };
            const next = renumberRows(
              [...rows, newRow].sort((a, b) => {
                if (a.containerId === null && b.containerId !== null) return 1;
                if (a.containerId !== null && b.containerId === null) return -1;
                if (a.containerId !== b.containerId) return (a.containerId || 0) - (b.containerId || 0);
                return a.order - b.order;
              }),
            );
            dispatch({ type: 'ADD_SCENE', payload: newScene });
            dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, rows: next } });
            setSelectedRowIds(new Set([newId]));
            setFocusedRowId(newId);
            scrollToRow(newId);
          },
        });
        return;
      }
    } else if ((action === 'duplicate' || action === 'duplicate_note' || action === 'duplicate_break' || (enableDaybreaks && action === 'duplicate_daybreak')) && (row.type === 'NOTE' || row.type === 'BREAK' || (enableDaybreaks && row.type === 'DAYBREAK'))) {
      const newId = generateUUID();
      newRows.push({ ...row, id: newId, order: row.order + 0.5 });
      newRowIds.push(newId);
    } else if (action === 'change_color' && row.type === 'NOTE') {
      setColorPicker({ rowId: row.id, bg: row.noteColor || getNoteBannerColors(project.colorPalette).background, text: row.noteTextColor || getNoteBannerColors(project.colorPalette).color, noteText: row.noteText || '', originalBg: row.noteColor || getNoteBannerColors(project.colorPalette).background, originalText: row.noteTextColor || getNoteBannerColors(project.colorPalette).color, originalNoteText: row.noteText || '' });
      setContextMenu(null);
      return;
    } else if (action === 'delete') {
      if (row.pinned) { setContextMenu(null); return; }
      if (row.type === 'DAYBREAK' && !isEmptyDayMeta(row.daybreakMeta)) {
        const ok = await dialog.confirm({
          title: `Delete ${row.daybreakLabel || 'day break'}?`,
          message: 'This day has details (locations, crew, call times or notes). Deleting the day break discards them. You can undo this.',
          danger: true,
        });
        if (!ok) { setContextMenu(null); return; }
      }
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
    newRows = renumberRows(newRows);

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
  }, [contextMenu, activeVersion, rows, project, dispatch, setSelectedRowIds, setFocusedRowId, scrollToRow, setColorPicker, selectNextAfterRemove, setContextMenu, dialog, sceneDuplicate, heldBy]);

  const createOnContextMenu = useCallback((options?: {
    prependSelect?: () => void;
  }) => (e: React.MouseEvent) => {
    const rowEl = (e.target as HTMLElement).closest('[data-row-id]');
    e.preventDefault();
    if (rowEl) {
      e.stopPropagation();
      const rowId = rowEl.getAttribute('data-row-id')!;
      // A held item never opens its menu (roadmap 235) — the peer's drag owns
      // it until it ends; a small chip says who instead.
      const held = heldBy?.get(rowId);
      if (held) {
        showHeldHint(e.clientX, e.clientY, held.name);
        return;
      }
      if (getMarqueeMode() === 'tool') {
        setSelectedRowIds(prev => prev.has(rowId) ? prev : new Set([...prev, rowId]));
      } else if (!selectedRowIds.has(rowId)) {
        setSelectedRowIds(new Set([rowId]));
      }
      const containerIdAttr = rowEl.getAttribute('data-container-id');
      const containerId = containerIdAttr === 'null' ? null : parseInt(containerIdAttr!, 10);
      const daybreakRegion = daybreakRegionFromTarget(e.target);
      options?.prependSelect?.();
      setContextMenu({ x: e.clientX, y: e.clientY, rowId, containerId, daybreakRegion });
    } else {
      setContextMenu(null);
    }
  }, [selectedRowIds, setSelectedRowIds, setContextMenu, heldBy, showHeldHint]);

  return {
    contextMenu,
    setContextMenu,
    heldHint,
    showHeldHint,
    inClipboard,
    cutSelected,
    pasteClipboard,
    handleContextMenuAction,
    createOnContextMenu,
    selectNextAfterRemove,
  };
}
