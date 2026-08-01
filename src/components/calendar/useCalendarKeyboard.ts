import React, { useEffect } from 'react';
import { ScheduleRow, ScheduleVersion, SceneColorPalette } from '../../types';
import { getNoteBannerColors } from '../../lib/ribbonUtils';
import { IS_COARSE } from '../../lib/device';
export interface ColorPickerState {
  rowId: string;
  bg: string;
  text: string;
  noteText: string;
  originalBg: string;
  originalText: string;
  originalNoteText: string;
}

interface UseCalendarKeyboardConfig {
  currentWindow: Window;
  setSelectedRowIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setLastClickedId: (id: string) => void;
  selectedRowIdsRef: React.MutableRefObject<Set<string>>;
  lastClickedIdRef: React.MutableRefObject<string | null>;
  boneyardFlatRef: React.MutableRefObject<string[]>;
  scrollToRow: (id: string) => void;
  activeVersion: ScheduleVersion | undefined;
  dispatch: React.Dispatch<any>;
  cutSelected: () => void;
  pasteClipboard: (targetRowId: string) => void;
  selectNextAfterRemove: (ids: Set<string>) => void;
  setColorPicker: React.Dispatch<React.SetStateAction<ColorPickerState | null>>;
  palette: SceneColorPalette;
  onOpenScene?: (sceneId: string) => void;
  onOpenSceneInPopout?: (sceneId: string) => void;
}

export function useCalendarKeyboard(config: UseCalendarKeyboardConfig) {
  const {
    currentWindow, setSelectedRowIds, setLastClickedId,
    selectedRowIdsRef, lastClickedIdRef, boneyardFlatRef, scrollToRow,
    activeVersion, dispatch, cutSelected, pasteClipboard, selectNextAfterRemove,
    setColorPicker, palette, onOpenScene, onOpenSceneInPopout,
  } = config;

  // Selection navigation: Escape clears, Cmd+A selects the boneyard, ArrowUp/Down moves the cursor
  useEffect(() => {
    const isInEditable = (el: EventTarget | null) => {
      const t = el as HTMLElement | null;
      if (!t) return false;
      return (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) && !(t as HTMLInputElement).readOnly;
    };
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setSelectedRowIds(new Set()); return; }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'a' || e.key === 'A')) {
        if (isInEditable(e.target)) return;
        const ids = boneyardFlatRef.current;
        if (ids.length > 0) {
          e.preventDefault();
          setSelectedRowIds(new Set(ids));
          setLastClickedId(ids[0]);
          scrollToRow(ids[0]);
        }
        return;
      }
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      if (isInEditable(e.target)) return;
      const flat = boneyardFlatRef.current;
      if (flat.length === 0) return;
      e.preventDefault();
      const isShift = e.shiftKey;
      const isDown = e.key === 'ArrowDown';
      const currentIds = Array.from(selectedRowIdsRef.current).filter(id => flat.includes(id));
      const anchor = lastClickedIdRef.current;
      if (isShift) {
        const anchorIdx = anchor ? flat.indexOf(anchor) : -1;
        if (anchorIdx === -1) {
          setSelectedRowIds(new Set([flat[0]]));
          setLastClickedId(flat[0]);
          scrollToRow(flat[0]);
          return;
        }
        const indices = currentIds.map(id => flat.indexOf(id)).filter(i => i >= 0);
        let from: number, to: number;
        if (indices.length === 0) {
          from = anchorIdx;
          to = isDown ? Math.min(anchorIdx + 1, flat.length - 1) : Math.max(anchorIdx - 1, 0);
        } else {
          const minIdx = Math.min(...indices);
          const maxIdx = Math.max(...indices);
          if (isDown) {
            if (minIdx < anchorIdx) { from = minIdx + 1; to = maxIdx; }
            else { from = anchorIdx; to = Math.min(maxIdx + 1, flat.length - 1); }
          } else {
            if (maxIdx > anchorIdx) { from = minIdx; to = maxIdx - 1; }
            else { from = Math.max(minIdx - 1, 0); to = anchorIdx; }
          }
        }
        setSelectedRowIds(new Set(flat.slice(from, to + 1)));
        scrollToRow(flat[isDown ? to : from]);
      } else {
        if (currentIds.length === 0) {
          setSelectedRowIds(new Set([flat[0]]));
          setLastClickedId(flat[0]);
          scrollToRow(flat[0]);
          return;
        }
        const refId = anchor && currentIds.includes(anchor) ? anchor : (isDown ? currentIds[currentIds.length - 1] : currentIds[0]);
        const idx = flat.indexOf(refId);
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
    };
    currentWindow.addEventListener('keydown', handler);
    return () => currentWindow.removeEventListener('keydown', handler);
  }, [currentWindow, scrollToRow, setSelectedRowIds, setLastClickedId]);

  // Clipboard + delete + open: Cmd+X/V, Backspace/Delete, Enter
  useEffect(() => {
    const isInEditable = (el: EventTarget | null) => {
      const t = el as HTMLElement | null;
      if (!t) return false;
      return (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) && !(t as HTMLInputElement).readOnly;
    };
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'x' || e.key === 'X')) {
        if (isInEditable(e.target)) return;
        e.preventDefault();
        cutSelected();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'v' || e.key === 'V')) {
        if (isInEditable(e.target)) return;
        e.preventDefault();
        if (selectedRowIdsRef.current.size === 1) {
          pasteClipboard([...selectedRowIdsRef.current][0] as string);
        }
        return;
      }
      if ((e.key === 'Backspace' || e.key === 'Delete') && selectedRowIdsRef.current.size > 0) {
        if (isInEditable(e.target)) return;
        if (!activeVersion) return;
        e.preventDefault();
        const ids = Array.from(selectedRowIdsRef.current).filter((id): id is string => {
          const r = activeVersion.rows.find(rr => rr.id === id);
          return !r?.pinned;
        });
        if (ids.length === 0) return;
        const allRows = [...activeVersion.rows];
        const allInBoneyard = ids.every(id => {
          const r = allRows.find(rr => rr.id === id);
          return r && r.containerId == null;
        });
        if (allInBoneyard && ids.some(id => {
          const r = allRows.find(rr => rr.id === id);
          return r && r.type !== 'DAYBREAK';
        })) {
          const containerRows = allRows.filter(r => r.containerId != null && r.containerId !== -1);
          const maxOrder = containerRows.length > 0 ? Math.max(...containerRows.map(r => r.order)) : -1;
          const newRows = allRows.map(r => {
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
            const r = allRows.find(rr => rr.id === id);
            return r && r.type === 'DAYBREAK';
          });
          const newRows = hasDaybreak
            ? allRows.filter(r => !(ids.includes(r.id) && r.type === 'DAYBREAK')).map(r => ids.includes(r.id) ? { ...r, containerId: null, order: 999999 } : r)
            : allRows.map(r => ids.includes(r.id) ? { ...r, containerId: null, order: 999999 } : r);
          dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, rows: newRows } });
        }
        selectNextAfterRemove(new Set(ids as string[]));
        return;
      }
      if (e.key === 'Enter' && selectedRowIdsRef.current.size === 1) {
        if (isInEditable(e.target)) return;
        const selectedId = [...selectedRowIdsRef.current][0] as string;
        const selectedRow = activeVersion?.rows.find(r => r.id === selectedId);
        if (selectedRow?.type === 'SCENE' && selectedRow.sceneId) {
          e.preventDefault();
          if (!IS_COARSE && e.shiftKey && onOpenSceneInPopout) {
            onOpenSceneInPopout(selectedRow.sceneId);
          } else {
            onOpenScene?.(selectedRow.sceneId);
          }
        } else if (selectedRow?.type === 'NOTE') {
          e.preventDefault();
          setColorPicker({ rowId: selectedRow.id, bg: selectedRow.noteColor || getNoteBannerColors(palette).background, text: selectedRow.noteTextColor || getNoteBannerColors(palette).color, noteText: selectedRow.noteText || '', originalBg: selectedRow.noteColor || getNoteBannerColors(palette).background, originalText: selectedRow.noteTextColor || getNoteBannerColors(palette).color, originalNoteText: selectedRow.noteText || '' });
        }
        return;
      }
    };
    currentWindow.addEventListener('keydown', handler);
    return () => currentWindow.removeEventListener('keydown', handler);
  }, [currentWindow, activeVersion, dispatch, cutSelected, pasteClipboard, selectNextAfterRemove, setColorPicker, onOpenScene, onOpenSceneInPopout]);
}
