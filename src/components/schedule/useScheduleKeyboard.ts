import React, { useEffect } from 'react';
import { ScheduleRow, ScheduleVersion } from '../../types';
import { getContainerBlock, ContainerIds, LastSelectedByContainer } from '../../lib/containers';

export interface ScheduleKeyboardConfig {
  currentWindow: Window;
  currentDocument: Document;
  setSelectedRowIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setLastClickedId: (id: string) => void;
  setFocusedRowId: React.Dispatch<React.SetStateAction<string | null>>;
  selectedRowIds: Set<string>;
  activeDragIds: Set<string>;
  lastClickedIdRef: React.MutableRefObject<string | null>;
  textEditingEnabled: boolean;
  activeVersion: ScheduleVersion | undefined;
  dispatch: React.Dispatch<any>;
  containerIdsRef: React.MutableRefObject<ContainerIds>;
  flatRowIdsRef: React.MutableRefObject<string[]>;
  lastSelectedRef: React.MutableRefObject<LastSelectedByContainer>;
  sidebarCollapsedRef: React.MutableRefObject<boolean>;
  scheduleScrollRef: React.MutableRefObject<HTMLDivElement | null>;
  cutSelected: () => void;
  pasteClipboard: (targetRowId: string) => void;
  selectNextAfterRemove: (ids: Set<string>) => void;
  scrollToRow: (id: string) => void;
  existingDays: number[];
}

export function useScheduleKeyboard(config: ScheduleKeyboardConfig) {
  const {
    currentWindow, currentDocument, setSelectedRowIds, setLastClickedId, setFocusedRowId,
    selectedRowIds, activeDragIds, lastClickedIdRef,
    textEditingEnabled, activeVersion, dispatch,
    containerIdsRef, flatRowIdsRef, lastSelectedRef, sidebarCollapsedRef, scheduleScrollRef,
    cutSelected, pasteClipboard, selectNextAfterRemove, scrollToRow, existingDays,
  } = config;

  // Escape clears the selection
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedRowIds(new Set());
    };
    currentWindow.addEventListener('keydown', handler);
    return () => currentWindow.removeEventListener('keydown', handler);
  }, [currentWindow]);

  // Cmd/Ctrl+X cut to buffer, Cmd/Ctrl+V paste below selection
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isEditable = (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) && !(target as HTMLInputElement).readOnly;
      if (isEditable) return;
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
    currentWindow.addEventListener('keydown', handler);
    return () => currentWindow.removeEventListener('keydown', handler);
  }, [selectedRowIds, activeDragIds, textEditingEnabled, activeVersion, currentWindow, cutSelected, pasteClipboard]);

  // Navigation: Cmd+A select-all, Backspace/Delete to boneyard, Enter focus, arrows
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'a' || e.key === 'A') && !textEditingEnabled) {
        const target = e.target as HTMLElement;
        if ((target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) && !(target as HTMLInputElement).readOnly) return;
        if (!activeVersion) return;
        e.preventDefault();
        const isBoneyard = selectedRowIds.size > 0
          ? Array.from(selectedRowIds).some(id => containerIdsRef.current.boneyard.includes(id))
          : lastSelectedRef.current.boneyard !== null;
        const ids = isBoneyard ? containerIdsRef.current.boneyard : containerIdsRef.current.stripboard;
        if (ids.length > 0) {
          setSelectedRowIds(new Set(ids));
          setLastClickedId(ids[0]);
          scrollToRow(ids[0]);
        }
        return;
      }
      if ((e.key === 'Backspace' || e.key === 'Delete') && selectedRowIds.size > 0 && !textEditingEnabled) {
        const target = e.target as HTMLElement;
        if ((target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) && !(target as HTMLInputElement).readOnly) return;
        e.preventDefault();
        if (!activeVersion) return;
        const mutableRows = activeVersion.rows.map(r => ({ ...r }));
        const ids = Array.from(selectedRowIds).filter(id => {
          const r = mutableRows.find(rr => rr.id === id);
          return !r?.pinned;
        });
        if (ids.length === 0) return;
        const allInBoneyard = ids.every(id => containerIdsRef.current.boneyard.includes(id));
        if (allInBoneyard && ids.some(id => {
          const r = mutableRows.find(rr => rr.id === id);
          return r && r.type !== 'DAYBREAK';
        })) {
          const containerRows = mutableRows.filter(r => r.containerId != null && r.containerId !== -1);
          const maxOrder = containerRows.length > 0 ? Math.max(...containerRows.map(r => r.order)) : -1;
          const newRows = mutableRows.map((r, i) => {
            if (ids.includes(r.id) && r.type !== 'DAYBREAK') {
              return { ...r, containerId: 1, order: maxOrder + 1 + ids.indexOf(r.id) };
            }
            if (ids.includes(r.id) && r.type === 'DAYBREAK') {
              return null;
            }
            return r;
          }).filter(Boolean) as ScheduleRow[];
          dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, rows: newRows } });
        } else {
          const hasDaybreak = ids.some(id => {
            const r = mutableRows.find(rr => rr.id === id);
            return r && r.type === 'DAYBREAK';
          });
          const newRows = hasDaybreak
            ? mutableRows.filter(r => !(ids.includes(r.id) && r.type === 'DAYBREAK')).map(r => ids.includes(r.id) ? { ...r, containerId: null, order: 999999 } : r)
            : mutableRows.map(r => ids.includes(r.id) ? { ...r, containerId: null, order: 999999 } : r);
          dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, rows: newRows } });
        }
        selectNextAfterRemove(new Set(ids as string[]));
      }
      if (e.key === 'Enter' && selectedRowIds.size === 1 && !textEditingEnabled) {
        const target = e.target as HTMLElement;
        const isEditableInput = (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) && !(target as HTMLInputElement).readOnly;
        if (isEditableInput) return;
    const selectedId = [...selectedRowIds][0] as string;
    const selectedRow = activeVersion.rows.find(r => r.id === selectedId);
    if ((selectedRow && (selectedRow.type === 'NOTE' || selectedRow.type === 'BREAK' || selectedRow.type === 'SCENE' || selectedRow.type === 'DAYBREAK')) || selectedId.startsWith('empty-')) {
      e.preventDefault();
      setFocusedRowId(selectedId);
      const rowType = selectedRow?.type;
      const isNoteOrBreak = rowType === 'NOTE' || rowType === 'BREAK';
      const colSelector = isNoteOrBreak ? (e.shiftKey ? 'text' : 'duration') : 'duration';
      const selector = `[data-row-id="${selectedId}"] [data-col="${colSelector}"]`;
      const input = scheduleScrollRef.current?.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector);
      input?.focus();
      input?.select();
    }
      }
      if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !textEditingEnabled && selectedRowIds.size > 0) {
        const target = e.target as HTMLElement;
        if ((target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) && !(target as HTMLInputElement).readOnly) return;
        e.preventDefault();
        const lastSelected = [...selectedRowIds].pop()!;
        let currentDay: number | null = null;
        if (lastSelected.startsWith('empty-')) {
          currentDay = parseInt(lastSelected.replace('empty-', ''), 10);
        } else {
          const row = activeVersion.rows.find(r => r.id === lastSelected);
          currentDay = row?.containerId ?? null;
        }
        if (currentDay === null) return;
        const dayIdx = existingDays.indexOf(currentDay);
        if (dayIdx === -1) return;
        const nextIdx = e.key === 'ArrowRight' ? dayIdx + 1 : dayIdx - 1;
        if (nextIdx < 0 || nextIdx >= existingDays.length) return;
        const targetDay = existingDays[nextIdx];
        setSelectedRowIds(new Set([`empty-${targetDay}`]));
        setLastClickedId(`empty-${targetDay}`);
        scrollToRow(`empty-${targetDay}`);
      }
      if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !textEditingEnabled) {
        const target = e.target as HTMLElement;
        if ((target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) && !(target as HTMLInputElement).readOnly) return;
        if (!activeVersion) return;
        e.preventDefault();
        const isShift = e.shiftKey;
        const isDown = e.key === 'ArrowDown';
        const currentIds = Array.from(selectedRowIds);
        const isBoneyard = currentIds.length > 0
          ? currentIds.some(id => containerIdsRef.current.boneyard.includes(id))
          : lastSelectedRef.current.boneyard !== null;
        const flat = isBoneyard ? containerIdsRef.current.boneyard as string[] : flatRowIdsRef.current;
        if (flat.length === 0) return;
          if (isShift) {
          const shiftFlat = isBoneyard ? flat : flat.filter(id => !id.startsWith('empty-') && !activeVersion?.rows.find(rr => rr.id === id)?.pinned);
          if (shiftFlat.length === 0) return;
          const anchor = lastClickedIdRef.current;
          const anchorIdx = (anchor && (isBoneyard || !anchor.startsWith('empty-'))) ? shiftFlat.indexOf(anchor) : -1;
          if (anchorIdx === -1) {
            setSelectedRowIds(new Set([shiftFlat[0]]));
            setLastClickedId(shiftFlat[0]);
            scrollToRow(shiftFlat[0]);
            return;
          }
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
          if (currentIds.length === 0) {
            if (lastSelectedRef.current.boneyard !== null && containerIdsRef.current.boneyard.length > 0) {
              const firstBoneyard = containerIdsRef.current.boneyard[0];
              setSelectedRowIds(new Set([firstBoneyard]));
              setLastClickedId(firstBoneyard);
              scrollToRow(firstBoneyard);
              return;
            }
            const firstReal = containerIdsRef.current.stripboard[0];
            if (!firstReal) return;
            setSelectedRowIds(new Set([firstReal]));
            setLastClickedId(firstReal);
            scrollToRow(firstReal);
            return;
          }
          const anchor = lastClickedIdRef.current;
          const refId = anchor && currentIds.includes(anchor) ? anchor : (isDown ? currentIds[currentIds.length - 1] : currentIds[0]);
          const nav = isBoneyard ? containerIdsRef.current.boneyard as string[] : flatRowIdsRef.current.filter(id => !id.startsWith('empty-'));
          const idx = nav.indexOf(refId);
          if (idx === -1) return;
          if (isDown && idx < nav.length - 1) {
            setSelectedRowIds(new Set([nav[idx + 1]]));
            setLastClickedId(nav[idx + 1]);
            scrollToRow(nav[idx + 1]);
          } else if (!isDown && idx > 0) {
            setSelectedRowIds(new Set([nav[idx - 1]]));
            setLastClickedId(nav[idx - 1]);
            scrollToRow(nav[idx - 1]);
          }
        }
      }
    };
    currentWindow.addEventListener('keydown', handler);
    return () => currentWindow.removeEventListener('keydown', handler);
  }, [selectedRowIds, textEditingEnabled, activeVersion, dispatch, currentWindow, existingDays, scrollToRow]);

  // Clear selection when entering text-edit mode
  useEffect(() => {
    if (textEditingEnabled) setSelectedRowIds(new Set());
  }, [textEditingEnabled]);

  // Suppress text selection while not editing
  useEffect(() => {
    const onSelectStart = (e: Event) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;
      if (target.isContentEditable) return;
      e.preventDefault();
    };
    if (!textEditingEnabled) {
      currentDocument.addEventListener('selectstart', onSelectStart);
    }
    return () => currentDocument.removeEventListener('selectstart', onSelectStart);
  }, [textEditingEnabled, currentDocument]);

  // Track the last-selected row per container
  useEffect(() => {
    for (const id of selectedRowIds) {
      const row = activeVersion.rows.find(r => r.id === id);
      if (row) {
        const block = getContainerBlock(row);
        lastSelectedRef.current[block] = id;
      }
    }
  }, [selectedRowIds, activeVersion]);

  // Tab switches between stripboard and boneyard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || textEditingEnabled) return;
      const target = e.target as HTMLElement;
      if ((target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) && !(target as HTMLInputElement).readOnly) return;
      if (!activeVersion) return;
      if (sidebarCollapsedRef.current) return;
      e.preventDefault();
      const inBoneyard = Array.from(selectedRowIds).some(id => containerIdsRef.current.boneyard.includes(id));
      if (inBoneyard) {
        const id = lastSelectedRef.current.stripboard || containerIdsRef.current.stripboard[0] || null;
        if (id) {
          setSelectedRowIds(new Set([id]));
          setLastClickedId(id);
          scrollToRow(id);
        }
      } else {
        const id = lastSelectedRef.current.boneyard || containerIdsRef.current.boneyard[0] || null;
        if (id) {
          setSelectedRowIds(new Set([id]));
          setLastClickedId(id);
          scrollToRow(id);
        }
      }
    };
    currentWindow.addEventListener('keydown', handler);
    return () => currentWindow.removeEventListener('keydown', handler);
  }, [textEditingEnabled, activeVersion, selectedRowIds, currentWindow, scrollToRow]);
}
