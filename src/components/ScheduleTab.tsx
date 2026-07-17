import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useProject, useIsCloudProject } from '../store';
import { useCurrentWindow, useCurrentDocument } from '../lib/popoutTarget';
import { DndContext, closestCorners, PointerSensor, TouchSensor, useSensor, useSensors, DragEndEvent, DragOverlay, DragStartEvent, DragOverEvent, CollisionDetection } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { StripBlock } from './StripBlock';
import { BoneyardBlock } from './BoneyardBlock';
import { SortableRibbon } from './SortableRibbon';
import { generateUUID, formatDuration, parseDuration, parsePageCount } from '../lib/utils';
import { ScheduleRow, Scene, RuleViolation } from '../types';
import { useMarquee, MarqueeOverlay, isAddModeActive, useAddMode, useMarqueeActive } from '../lib/useMarquee';
import { Pencil, Check, ChevronDown, Printer, HelpCircle, Scissors, ClipboardPaste, StickyNote, Coffee, Copy, Eye, Trash2, Palette, LayoutTemplate, Monitor, Table, ExternalLink, Sunrise, Eraser, Wand2, Clock, FileText, Flag, Send } from 'lucide-react';
import { ContextMenu, ContextMenuItem, ContextMenuDivider } from './ContextMenu';
import DropdownMenu from './DropdownMenu';
import DropdownItem from './DropdownItem';
import DropdownDivider from './DropdownDivider';
import DropdownSubmenu from './DropdownSubmenu';
import SortDropdown, { SortCriterion, compareByCustomOrder } from './SortDropdown';
import { CustomOrderSortModal, useCustomOrderSort } from './CustomOrderSortModal';
import HelpModal from './HelpModal';
import { FloatingTooltip } from './FloatingTooltip';
import Modal from './Modal';
import { ModalFooter } from './Modal';
import { useViewMode, useCellBorders, CellBorders } from '../lib/persist';
import { IS_COARSE } from '../lib/device';
import { useMarqueeMode } from '../lib/useLongPressMenu';
import { getMarqueeMode } from '../lib/useLongPressMenu';
import { useDialog } from './Dialog';
import { ELEMENT_CATEGORIES, CAT_ICONS, getCustomIcon } from '../lib/categories';
import { checkSection } from '../lib/rulesEngine';
import { addMinutesToTime, formatDateLong } from '../lib/utils';
import { ShootViolationsModal } from './ViolationModal';
import { useDaybreakSections } from '../lib/useDaybreakSections';
import PageToolbar from './PageToolbar';

export function ScheduleTab({ onOpenScene, onOpenSceneInPopout, onPrint, targetSceneId, onSceneTargetSeen, savedScrollTop, onScrollChange }: { onOpenScene?: (sceneId: string) => void; onOpenSceneInPopout?: (sceneId: string) => void; onPrint?: () => void; targetSceneId?: string | null; onSceneTargetSeen?: () => void; savedScrollTop?: number; onScrollChange?: (top: number) => void }) {
  const { state, dispatch, readOnly } = useProject();
  const currentWindow = useCurrentWindow();
  const currentDocument = useCurrentDocument();
  const isCloud = useIsCloudProject();
  const project = state.present;
  const activeVersion = project.versions.find(v => v.id === project.activeVersionId);
  const { sectionDateMap: hookSectionDateMap, daybreakRowToSection, nextSectionDateMap: hookNextSectionDateMap, productionSections, chronoDayMap: sectionChronoDayMap } = useDaybreakSections();
  const [viewMode, setViewMode, viewWidth] = useViewMode();
  const [cellBorders, setCellBorders] = useCellBorders();

  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<string | null>(null);
  const [insertBeforeId, setInsertBeforeId] = useState<string | null>(null);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [focusedRowId, setFocusedRowId] = useState<string | null>(null);
  const [activeDragIds, setActiveDragIds] = useState<Set<string>>(new Set());
  const [lastClickedId, setLastClickedId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, rowId: string, containerId: number | null } | null>(null);
  const [textEditingEnabled, setTextEditingEnabled] = useState(false);
  const effectiveTextEditingEnabled = textEditingEnabled && !readOnly;
  const [forceBoneyardExpanded, setForceBoneyardExpanded] = useState(false);
  const [colorPicker, setColorPicker] = useState<{ rowId: string; bg: string; text: string; noteText: string; originalBg: string; originalText: string; originalNoteText: string } | null>(null);
  const [ribbonMenuOpen, setRibbonMenuOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [autoDaybreakOpen, setAutoDaybreakOpen] = useState(false);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [sortBy, setSortBy] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [customSortOrders, setCustomSortOrders] = useState<Record<string, string[]>>({});
  const customSortOrdersRef = useRef(customSortOrders);
  customSortOrdersRef.current = customSortOrders;
  const { customOrderModal, openCustomOrderModal, closeCustomOrderModal } = useCustomOrderSort();
  const dialog = useDialog();
  const [showShootViolations, setShowShootViolations] = useState(false);

  const sortCategories = useMemo(() => {
    const cats = ELEMENT_CATEGORIES.map(c => ({ key: c.key, label: c.label, icon: CAT_ICONS[c.key] ? React.createElement(CAT_ICONS[c.key], { className: 'w-3.5 h-3.5' }) : undefined }));
    for (const cc of project.customCategories) {
      const Icon = getCustomIcon(cc.icon || 'Tag');
      cats.push({ key: cc.key, label: cc.label, icon: React.createElement(Icon, { className: 'w-3.5 h-3.5' }) });
    }
    return cats;
  }, [project.customCategories]);

  const intExtSortLabel = useMemo(() => {
    const opts = project.colorPalette?.intExtOptions;
    return opts?.length ? opts.slice(0, 2).join(' / ') : undefined;
  }, [project.colorPalette?.intExtOptions]);

  const dayNightSortLabel = useMemo(() => {
    const opts = project.colorPalette?.dayNightOptions;
    return opts?.length ? opts.slice(0, 2).join(' / ') : undefined;
  }, [project.colorPalette?.dayNightOptions]);

  const marqueeMode = useMarqueeMode();

  const [shiftHeld, setShiftHeld] = useState(false);
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => { if (e.key === 'Shift') setShiftHeld(true); };
    const onUp = (e: KeyboardEvent) => { if (e.key === 'Shift') setShiftHeld(false); };
    const onBlur = () => setShiftHeld(false);
    currentWindow.addEventListener('keydown', onDown);
    currentWindow.addEventListener('keyup', onUp);
    currentWindow.addEventListener('blur', onBlur);
    return () => {
      currentWindow.removeEventListener('keydown', onDown);
      currentWindow.removeEventListener('keyup', onUp);
      currentWindow.removeEventListener('blur', onBlur);
    };
  }, [currentWindow]);

  const handleRowDoubleClick = useCallback((id: string, shiftKey?: boolean) => {
    if (marqueeMode !== 'off') return;
    if (textEditingEnabled) return;
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
      const rowEl = activeEl.closest(`[data-row-id="${id}"]`);
      if (rowEl) return;
    }
    const row = activeVersion?.rows.find(r => r.id === id);
    if (row?.type === 'NOTE') {
      setColorPicker({ rowId: row.id, bg: row.noteColor || '#591b1b', text: row.noteTextColor || '#ffffff', noteText: row.noteText || '', originalBg: row.noteColor || '#591b1b', originalText: row.noteTextColor || '#ffffff', originalNoteText: row.noteText || '' });
    } else if (row?.type === 'SCENE' && row.sceneId) {
      if (!IS_COARSE && shiftKey && onOpenSceneInPopout) {
        onOpenSceneInPopout(row.sceneId);
      } else if (onOpenScene) {
        onOpenScene(row.sceneId);
      }
    }
  }, [activeVersion, onOpenScene, onOpenSceneInPopout, marqueeMode]);

  const handleRowClick = (id: string, e: React.MouseEvent) => {
    if (textEditingEnabled) return;
    if (e.altKey) return;
    if (marqueeJustEndedRef.current) {
      marqueeJustEndedRef.current = false;
      return;
    }
    if (e.metaKey || e.ctrlKey) {
      e.stopPropagation();
      setSelectedRowIds(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      });
      setLastClickedId(id);
    } else if (getMarqueeMode() === 'tool') {
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
      const clickedRow = activeVersion?.rows.find(r => r.id === id);
      const anchorRow = activeVersion?.rows.find(r => r.id === lastClickedId);
      const isBoneyard = (clickedRow && (clickedRow.containerId === null || clickedRow.containerId === -1)) ||
        (anchorRow && (anchorRow.containerId === null || anchorRow.containerId === -1));
      const allIds = isBoneyard ? boneyardFlatRef.current : flatRowIdsRef.current;
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
      if (a.containerId !== b.containerId) return (a.containerId || 0) - (b.containerId || 0);
      return a.order - b.order;
    });
    const candidates: string[] = [];
    for (const r of removedRows) {
      const next = augmentedRows.filter(x => x.containerId === r.containerId && x.order > r.order && !removedIds.has(x.id)).sort((a, b) => a.order - b.order)[0];
      if (next) candidates.push(next.id);
    }
    if (candidates.length === 0) {
      const first = removedRows[0];
      const prev = augmentedRows.filter(x => x.containerId === first.containerId && x.order < first.order && !removedIds.has(x.id)).sort((a, b) => b.order - a.order)[0];
      if (prev) candidates.push(prev.id);
    }
    // If same day is now empty, look across days
    if (candidates.length === 0) {
      const firstRemoved = removedRows[0];
      const dayOrder = existingDays;
      const startIdx = firstRemoved.containerId !== null ? dayOrder.indexOf(firstRemoved.containerId) : -1;
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
      if (a.containerId !== b.containerId) return (a.containerId || 0) - (b.containerId || 0);
      return a.order - b.order;
    });
    const first = removedRows[0];
    const prev = augmentedRows.filter(x => x.containerId === first.containerId && x.order < first.order && !removedIds.has(x.id)).sort((a, b) => b.order - a.order)[0];
    if (prev) { setSelectedRowIds(new Set([prev.id])); return; }
    const next = augmentedRows.filter(x => x.containerId === first.containerId && x.order > first.order && !removedIds.has(x.id)).sort((a, b) => a.order - b.order)[0];
    if (next) { setSelectedRowIds(new Set([next.id])); return; }
    const dayOrder = existingDays;
    const startIdx = first.containerId !== null ? dayOrder.indexOf(first.containerId) : -1;
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
    const ids = Array.from(selectedRowIds).filter(id => !activeVersion.rows.find(r => r.id === id)?.pinned);
    if (ids.length === 0) return;
    const newRows = activeVersion.rows.map(r => ids.includes(r.id) ? { ...r, containerId: -1 } : r);
    dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, rows: newRows } });
    selectPrevAfterRemove(new Set(ids as string[]));
  };

  const pasteClipboard = (targetRowId: string) => {
    if (activeDragIds.size > 0 || textEditingEnabled || !activeVersion) return;
    const targetRow = augmentedRows.find(r => r.id === targetRowId);

    const clipboardItems = augmentedRows
      .filter(r => r.containerId === -1)
      .sort((a, b) => {
        if (a.containerId !== b.containerId) return (a.containerId || 0) - (b.containerId || 0);
        return a.order - b.order;
      })
      .map(r => ({ ...r }));

    if (clipboardItems.length === 0) return;

    // Determine target day: from row or from dummy row ID
    let overDay: number | null;
    let insertIdx: number;
    if (targetRow) {
      overDay = targetRow.containerId;
      let dayRows = activeVersion.rows.filter(r => r.containerId === overDay && r.containerId !== -1).sort((a, b) => a.order - b.order);
      const targetIdx = dayRows.findIndex(r => r.id === targetRowId);
      insertIdx = targetIdx !== -1 ? targetIdx + 1 : dayRows.length;
    } else if (targetRowId.startsWith('empty-')) {
      overDay = parseInt(targetRowId.replace('empty-', ''), 10);
      const dayRows = activeVersion.rows.filter(r => r.containerId === overDay && r.containerId !== -1).sort((a, b) => a.order - b.order);
      insertIdx = dayRows.length > 0 && dayRows[0]?.pinned ? 1 : 0;
    } else {
      return;
    }

    let newRows = activeVersion.rows.map(r => ({ ...r }));
    newRows = newRows.filter(r => r.containerId !== -1);
    clipboardItems.forEach(item => item.containerId = overDay);
    let dayRows = newRows.filter(r => r.containerId === overDay).sort((a, b) => a.order - b.order);
    dayRows.splice(insertIdx, 0, ...clipboardItems);
    dayRows.forEach((r, i) => r.order = i);
    newRows = [...newRows.filter(r => r.containerId !== overDay), ...dayRows];
    dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, rows: newRows } });
    setSelectedRowIds(new Set(clipboardItems.map(r => r.id)));
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedRowIds(new Set());
    };
    currentWindow.addEventListener('keydown', handler);
    return () => currentWindow.removeEventListener('keydown', handler);
  }, [currentWindow]);

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
    currentWindow.addEventListener('keydown', handler);
    return () => currentWindow.removeEventListener('keydown', handler);
  }, [selectedRowIds, activeDragIds, textEditingEnabled, activeVersion, currentWindow]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'a' || e.key === 'A') && !textEditingEnabled) {
        const target = e.target as HTMLElement;
        if ((target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) && !(target as HTMLInputElement).readOnly) return;
        if (!activeVersion) return;
        e.preventDefault();
        const isBoneyard = Array.from(selectedRowIds).some(id => {
          const row = activeVersion.rows.find(r => r.id === id);
          return row && (row.containerId === null || row.containerId === -1);
        }) || (selectedRowIds.size === 0 && boneyardLastIdRef.current !== null);
        const ids = isBoneyard ? boneyardFlatRef.current : flatRowIdsRef.current.filter(id => !id.startsWith('empty-'));
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
        const ids = Array.from(selectedRowIds).filter(id => {
          const r = activeVersion.rows.find(rr => rr.id === id);
          return !r?.pinned;
        });
        if (ids.length === 0) return;
        const allInBoneyard = ids.every(id => {
          const r = activeVersion.rows.find(rr => rr.id === id);
          return r && r.containerId == null;
        });
        if (allInBoneyard && ids.some(id => {
          const r = activeVersion.rows.find(rr => rr.id === id);
          return r && r.type !== 'DAYBREAK';
        })) {
          const containerRows = activeVersion.rows.filter(r => r.containerId != null && r.containerId !== -1);
          const maxOrder = containerRows.length > 0 ? Math.max(...containerRows.map(r => r.order)) : -1;
          const newRows = activeVersion.rows.map((r, i) => {
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
            const r = activeVersion.rows.find(rr => rr.id === id);
            return r && r.type === 'DAYBREAK';
          });
          const newRows = hasDaybreak
            ? activeVersion.rows.filter(r => !(ids.includes(r.id) && r.type === 'DAYBREAK')).map(r => ids.includes(r.id) ? { ...r, containerId: null, order: 999999 } : r)
            : activeVersion.rows.map(r => ids.includes(r.id) ? { ...r, containerId: null, order: 999999 } : r);
          dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, rows: newRows } });
        }
        selectNextAfterRemove(new Set(ids as string[]));
      }
      if (e.key === 'Enter' && selectedRowIds.size === 1 && !textEditingEnabled) {
        const target = e.target as HTMLElement;
        const isEditableInput = (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) && !(target as HTMLInputElement).readOnly;
        if (isEditableInput) return;
    const selectedId = [...selectedRowIds][0] as string;
    const selectedRow = activeVersion?.rows.find(r => r.id === selectedId);
    if ((selectedRow && (selectedRow.type === 'NOTE' || selectedRow.type === 'BREAK' || selectedRow.type === 'SCENE' || selectedRow.type === 'DAYBREAK')) || selectedId.startsWith('empty-')) {
      e.preventDefault();
      setFocusedRowId(selectedId);
      const rowType = selectedRow?.type;
      const isNoteOrBreak = rowType === 'NOTE' || rowType === 'BREAK';
      const colSelector = isNoteOrBreak ? (e.shiftKey ? 'text' : 'duration') : 'duration';
      const selector = `[data-row-id="${selectedId}"] [data-col="${colSelector}"]`;
      const input = scheduleScrollRef.current?.querySelector<HTMLElement>(selector);
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
          const row = augmentedRows.find(r => r.id === lastSelected);
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
        const isBoneyard = currentIds.some(id => {
          const row = activeVersion.rows.find(r => r.id === id);
          return row && (row.containerId === null || row.containerId === -1);
        }) || (currentIds.length === 0 && boneyardLastIdRef.current !== null);
        const flat = isBoneyard ? boneyardFlatRef.current : flatRowIdsRef.current;
        if (flat.length === 0) return;
          if (isShift) {
          const shiftFlat = isBoneyard ? flat : flat.filter(id => !id.startsWith('empty-'));
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
            if (boneyardLastIdRef.current !== null && boneyardFlatRef.current.length > 0) {
              const firstBoneyard = boneyardFlatRef.current[0];
              setSelectedRowIds(new Set([firstBoneyard]));
              setLastClickedId(firstBoneyard);
              scrollToRow(firstBoneyard);
              return;
            }
            const firstReal = flatRowIdsRef.current.find(id => !id.startsWith('empty-'));
            if (!firstReal) return;
            setSelectedRowIds(new Set([firstReal]));
            setLastClickedId(firstReal);
            scrollToRow(firstReal);
            return;
          }
          const anchor = lastClickedIdRef.current;
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
      }
    };
    currentWindow.addEventListener('keydown', handler);
    return () => currentWindow.removeEventListener('keydown', handler);
  }, [selectedRowIds, textEditingEnabled, activeVersion, dispatch, currentWindow]);

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
      currentDocument.addEventListener('selectstart', onSelectStart);
    }
    return () => currentDocument.removeEventListener('selectstart', onSelectStart);
  }, [textEditingEnabled, currentDocument]);

  useEffect(() => {
    for (const id of selectedRowIds) {
      const row = activeVersion?.rows.find(r => r.id === id);
      if (row && (row.containerId === null || row.containerId === -1)) {
        boneyardLastIdRef.current = id;
      } else if (row && row.containerId !== null && row.containerId !== -1) {
        stripboardLastIdRef.current = id;
      }
    }
  }, [selectedRowIds, activeVersion]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || textEditingEnabled) return;
      const target = e.target as HTMLElement;
      if ((target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) && !(target as HTMLInputElement).readOnly) return;
      if (!activeVersion) return;
      if (sidebarCollapsedRef.current) return;
      e.preventDefault();
      const hasBoneyard = Array.from(selectedRowIds).some(id => {
        const row = activeVersion.rows.find(r => r.id === id);
        return row && (row.containerId === null || row.containerId === -1);
      });
      if (hasBoneyard) {
        const id = stripboardLastIdRef.current || flatRowIdsRef.current.find(i => !i.startsWith('empty-')) || null;
        if (id) {
          setSelectedRowIds(new Set([id]));
          setLastClickedId(id);
          scrollToRow(id);
        }
      } else {
        const id = boneyardLastIdRef.current || boneyardFlatRef.current[0] || null;
        if (id) {
          setSelectedRowIds(new Set([id]));
          setLastClickedId(id);
          scrollToRow(id);
        }
      }
    };
    currentWindow.addEventListener('keydown', handler);
    return () => currentWindow.removeEventListener('keydown', handler);
  }, [textEditingEnabled, activeVersion, selectedRowIds, currentWindow]);

  const handleCollapseChange = useCallback((collapsed: boolean) => {
    sidebarCollapsedRef.current = collapsed;
    if (collapsed) {
      setSelectedRowIds(prev => {
        const stripboardOnly = new Set(Array.from(prev).filter(id => {
          const row = activeVersion?.rows.find(r => r.id === id);
          return row && row.containerId !== null && row.containerId !== -1;
        }));
        return stripboardOnly.size > 0 ? stripboardOnly : new Set();
      });
    }
  }, [activeVersion]);

  const scheduleScrollRef = useRef<HTMLDivElement>(null);
  const savedScrollTopRef = useRef(savedScrollTop);
  const mousePosRef = useRef({ y: 0 });
  const autoScrollRafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!activeId) return;
    let rafId: number | null = null;
    let stepSchedule = 0;
    let stepBoneyard = 0;
    const buffer = 200;

    const loop = () => {
      const y = mousePosRef.current.y;
      if (y == null) { rafId = requestAnimationFrame(loop); return; }

      if (y > buffer && y < window.innerHeight - buffer) {
        rafId = requestAnimationFrame(loop);
        return;
      }

      const scheduleContainer = scheduleScrollRef.current;
      const boneyardContainer = document.querySelector('#boneyard_rows_container')?.closest('.overflow-y-auto') as HTMLElement | null;

      const targets = [scheduleContainer, boneyardContainer].filter(Boolean) as HTMLElement[];
      for (const container of targets) {
        const rect = container.getBoundingClientRect();
        if (y < rect.top || y > rect.bottom) continue;

        let step = container === scheduleContainer ? stepSchedule : stepBoneyard;

        if (y < rect.top + buffer) {
          const t = 1 - (y - rect.top) / buffer;
          const speed = 2 + t * t * 20;
          step = step * 0.85 + speed * 0.15;
          container.scrollTop = Math.max(0, container.scrollTop - step);
        } else if (y > rect.bottom - buffer) {
          const t = (y - (rect.bottom - buffer)) / buffer;
          const speed = 2 + t * t * 20;
          step = step * 0.85 + speed * 0.15;
          container.scrollTop = container.scrollTop + step;
        } else {
          step *= 0.6;
        }

        if (container === scheduleContainer) stepSchedule = step;
        else stepBoneyard = step;
        break;
      }
      rafId = requestAnimationFrame(loop);
    };

    const onPointerMove = (e: PointerEvent) => {
      mousePosRef.current = { y: e.clientY };
      if (rafId === null && (e.clientY < buffer || e.clientY > window.innerHeight - buffer)) {
        rafId = requestAnimationFrame(loop);
      }
    };
    currentDocument.addEventListener('pointermove', onPointerMove);

    return () => {
      currentDocument.removeEventListener('pointermove', onPointerMove);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [activeId, currentDocument]);

  useEffect(() => {
    if (!focusedRowId) return;
    const id = setTimeout(() => setFocusedRowId(null), 3000);
    return () => clearTimeout(id);
  }, [focusedRowId]);

  useEffect(() => {
    if (savedScrollTop && scheduleScrollRef.current && !targetSceneId) {
      requestAnimationFrame(() => {
        if (scheduleScrollRef.current) {
          scheduleScrollRef.current.scrollTop = savedScrollTop;
        }
      });
    }
    return () => {
      if (onScrollChange) {
        onScrollChange(savedScrollTopRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!targetSceneId || !activeVersion) return;
    const row = activeVersion.rows.find(r => r.sceneId === targetSceneId);
    if (row) {
      if (row.containerId == null) setForceBoneyardExpanded(true);
      setSelectedRowIds(new Set([row.id]));
      requestAnimationFrame(() => {
        scrollToRow(row.id, 0.3);
        setForceBoneyardExpanded(false);
        onSceneTargetSeen?.();
      });
    } else {
      onSceneTargetSeen?.();
    }
  }, [targetSceneId, activeVersion, onSceneTargetSeen]);

  const scrollToRow = (rowId: string, offsetFraction?: number) => {
    requestAnimationFrame(() => {
      let el = scheduleScrollRef.current?.querySelector(`[data-row-id="${rowId}"]`) ?? null;
      let container: HTMLElement | null = el ? scheduleScrollRef.current : null;

      if (!el) {
        el = document.querySelector(`#boneyard_rows_container [data-row-id="${rowId}"]`);
        if (el) container = el.closest('.overflow-y-auto') as HTMLElement | null;
      }

      if (!el || !container) return;
      const cRect = container.getBoundingClientRect();
      const eRect = el.getBoundingClientRect();

      let targetScroll: number;
      if (offsetFraction !== undefined) {
        targetScroll = container.scrollTop + eRect.top - cRect.top - cRect.height * offsetFraction;
      } else {
        const buffer = 200;
        if (eRect.top < cRect.top + buffer) {
          targetScroll = container.scrollTop + eRect.top - (cRect.top + buffer);
        } else if (eRect.bottom > cRect.bottom - buffer) {
          targetScroll = container.scrollTop + eRect.bottom - (cRect.bottom - buffer);
        } else {
          return;
        }
      }

      const start = container.scrollTop;
      const distance = targetScroll - start;
      const duration = 250;
      const startTime = performance.now();
      const animate = (now: number) => {
        const elapsed = now - startTime;
        const t = Math.min(elapsed / duration, 1);
        container.scrollTop = start + distance * (1 - Math.pow(1 - t, 3));
        if (t < 1) requestAnimationFrame(animate);
      };
      requestAnimationFrame(animate);
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
        const newRows = version.rows.map(r => ids.has(r.id) && !r.pinned ? { ...r, containerId: null, order: 999999 } : r);
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

  const isMarqueeActive = useMarqueeActive();

  const dragDisabled = ctrlOrCmdHeld || textEditingEnabled || marqueeMode !== 'off' || isMarqueeActive || readOnly;
  const sensors = useSensors(
    IS_COARSE
      ? useSensor(TouchSensor, {
          activationConstraint: dragDisabled
            ? { delay: 999999, tolerance: 0 }
            : { delay: 200, tolerance: 5 }
        })
      : useSensor(PointerSensor, {
          activationConstraint: { distance: dragDisabled ? 999999 : 5 }
        })
  );

  if (!activeVersion) return <div>No active version</div>;

  const activeRibbonDesign = project.ribbonDesigns.find(d => d.id === project.activeRibbonId) || project.ribbonDesigns[0];
  const activeRibbon = activeRibbonDesign.rows;
  const activeColWidths = activeRibbonDesign.colWidths;
  const cellPaddingV = activeRibbonDesign.cellPaddingV;
  const cellPaddingH = activeRibbonDesign.cellPaddingH;
  const edgePadding = activeRibbonDesign.edgePadding;
  const currentRibbonName = activeRibbonDesign.name;

  const sceneIdsInRows = useMemo(() => new Set(activeVersion.rows.filter(r => r.type === 'SCENE').map(r => r.sceneId)), [activeVersion.rows]);
  const missingScenesInRows = useMemo(() => project.scenes.filter(s => !sceneIdsInRows.has(s.id)), [project.scenes, sceneIdsInRows]);
  
  const augmentedRows = useMemo(() => [
    ...activeVersion.rows,
    ...missingScenesInRows.map((s, i) => ({
      id: `row-synth-${s.id}`,
      type: 'SCENE' as const,
      sceneId: s.id,
      containerId: null,
      order: 999999 + i,
      estimatedDuration: 30
    }))
  ], [activeVersion.rows, missingScenesInRows]);

  const scheduledRows = useMemo(() => {
    const grouped = augmentedRows.filter(r => !activeDragIds.has(r.id) && r.containerId !== -1).reduce((acc, row) => {
      if (row.containerId !== null) {
        if (!acc[row.containerId]) acc[row.containerId] = [];
        acc[row.containerId].push(row);
      }
      return acc;
    }, {} as Record<number, ScheduleRow[]>);
    (Object.values(grouped) as ScheduleRow[][]).forEach(dayRows => {
      dayRows.sort((a, b) => a.order - b.order);
    });
    return grouped;
  }, [augmentedRows, activeDragIds]);

  const boneyardRows = useMemo(() =>
    augmentedRows.filter(r => r.containerId === null && r.type !== 'DAYBREAK' && !activeDragIds.has(r.id)).sort((a, b) => a.order - b.order),
  [augmentedRows, activeDragIds]);

  const existingDays = useMemo(() => {
    const ids = Array.from(new Set<number>(
      activeVersion.rows.filter(r => r.containerId != null && r.containerId !== -1).map(r => r.containerId as number)
    )).sort((a, b) => a - b);
    return ids.length > 0 ? ids : [1];
  }, [activeVersion.rows]);

  const chronoDayMap = useMemo(() => {
    const m = new Map<number, number>();
    let counter = 0;
    for (const d of existingDays) {
      counter++; m.set(d, counter);
    }
    return m;
  }, [existingDays]);

  const shootViolations = useMemo(() => {
    const rules = project.rules || [];
    const castMembers = project.castMembers || [];
    if (rules.length === 0) return [];
    const result: Array<{ dayLabel: string; dateStr?: string; violations: RuleViolation[] }> = [];
    for (const dayInt of existingDays) {
      const rows = scheduledRows[dayInt] || [];
      const firstDaybreak = rows.find(r => r.type === 'DAYBREAK');
      const firstDaybreakCallTime = firstDaybreak?.daybreakCallTime || '08:00';
      let sectionRows: ScheduleRow[] = [];
      let sectionBaseTime = firstDaybreakCallTime;
      let pendingSection: number | null = firstDaybreak ? (daybreakRowToSection.get(firstDaybreak.id) ?? null) : null;
      let pendingDate = pendingSection != null ? (hookSectionDateMap.get(pendingSection) || '') : '';
      let lastDaybreakSection: number | null = pendingSection;
      for (const row of rows) {
        if (row.type === 'DAYBREAK') {
          const sec = daybreakRowToSection.get(row.id);
          const sectionDate = sec != null ? (hookSectionDateMap.get(sec) || '') : pendingDate;
          const v = checkSection([...sectionRows], sectionDate, sectionBaseTime, rules, project.scenes, castMembers);
          if (v.length > 0) {
            result.push({
              dayLabel: `DAY #${sectionChronoDayMap.get(sec ?? 0) ?? sec ?? dayInt}`,
              dateStr: sectionDate ? formatDateLong(sectionDate) : undefined,
              violations: v,
            });
          }
          sectionRows = [];
          sectionBaseTime = row.daybreakCallTime || firstDaybreakCallTime;
          lastDaybreakSection = sec;
          pendingSection = sec != null ? sec + 1 : null;
          pendingDate = pendingSection != null ? (hookNextSectionDateMap.get(sec ?? -1) || hookSectionDateMap.get(pendingSection) || '') : '';
        } else {
          sectionRows.push(row as ScheduleRow);
        }
      }
      if (sectionRows.length > 0) {
        const sectionDate = lastDaybreakSection != null ? (hookNextSectionDateMap.get(lastDaybreakSection) || hookSectionDateMap.get(pendingSection ?? -1) || '') : pendingDate;
        if (sectionDate) {
          const v = checkSection([...sectionRows], sectionDate, sectionBaseTime, rules, project.scenes, castMembers);
          if (v.length > 0) {
            result.push({
              dayLabel: `DAY #${sectionChronoDayMap.get(pendingSection ?? lastDaybreakSection ?? 0) || dayInt}`,
              dateStr: formatDateLong(sectionDate),
              violations: v,
            });
          }
        }
      }
    }
    return result;
  }, [existingDays, scheduledRows, project.rules, project.scenes, project.castMembers, sectionChronoDayMap, hookSectionDateMap, daybreakRowToSection, hookNextSectionDateMap]);

  const selectionSummary = useMemo(() => {
    if (selectedRowIds.size < 2) return null;
    const sceneRows = augmentedRows.filter(
      r => selectedRowIds.has(r.id) && r.type === 'SCENE' && !r.id.startsWith('empty-')
    );
    if (sceneRows.length === 0) return null;
    const totalMinutes = sceneRows.reduce((sum, r) => sum + (r.estimatedDuration || 0), 0);
    return { count: sceneRows.length, totalMinutes };
  }, [selectedRowIds, augmentedRows]);

  const bufferSummary = useMemo(() => {
    const bufferRows = augmentedRows.filter(r => r.containerId === -1);
    if (bufferRows.length === 0) return null;
    const totalMinutes = bufferRows.reduce((sum, r) => sum + (r.estimatedDuration || 0), 0);
    return { count: bufferRows.length, totalMinutes };
  }, [augmentedRows]);

  const getDayFromId = (id: string): number | null => {
    if (id === 'end-boneyard' || id === 'boneyard_bin') return null;
    if (id.startsWith('day-wrap-') || id.startsWith('day-') || id.startsWith('end-')) {
      return parseInt(id.replace('day-wrap-', '').replace('day-', '').replace('end-', ''), 10);
    }
    const row = augmentedRows.find(r => r.id === id);
    return row ? row.containerId : null;
  };

  const handleContextMenuAction = (action: string) => {
    if (!contextMenu || !activeVersion) return;
    const { rowId, containerId } = contextMenu;
    const rowIndex = augmentedRows.findIndex(r => r.id === rowId);
    const isDummy = rowId.startsWith('empty-');

    // Dummy rows can only add notes/breaks
    if (isDummy && (action === 'add_note' || action === 'add_break' || action === 'add_daybreak')) {
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
    const row = augmentedRows[rowIndex];

    let newRows = augmentedRows.map(r => ({ ...r }));
    let newRowIds: string[] = [];
    if (action === 'add_note') {
      const newId = generateUUID();
      newRows.push({
        id: newId, type: 'NOTE', containerId, order: row.order + 0.5, noteText: ''
      });
      newRowIds.push(newId);
    } else if (action === 'add_break') {
      const newId = generateUUID();
      newRows.push({
        id: newId, type: 'BREAK', containerId, order: row.order + 0.5, breakLabel: 'LUNCH', breakDuration: 60
      });
      newRowIds.push(newId);
    } else if (action === 'add_daybreak') {
      const newId = generateUUID();
      newRows.push({
        id: newId, type: 'DAYBREAK', containerId, order: row.order + 0.5, daybreakLabel: 'DAYBREAK', daybreakCallTime: '08:00'
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
          .filter(s => s.sceneNumber.match(new RegExp('^' + baseNumber + '[A-Z]$')))
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
    } else if ((action === 'duplicate' || action === 'duplicate_note' || action === 'duplicate_break' || action === 'duplicate_daybreak') && (row.type === 'NOTE' || row.type === 'BREAK' || row.type === 'DAYBREAK')) {
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
  };

  const handleDeleteAllDaybreaks = async () => {
    if (!activeVersion) return;
    const hasDaybreaks = activeVersion.rows.some(r => r.type === 'DAYBREAK');
    if (!hasDaybreaks) return;
    const ok = await dialog.confirm({
      title: 'Clear All Day Breaks',
      message: 'Remove all day break separators from the stripboard?',
      danger: true,
    });
    if (!ok) return;
    dispatch({ type: 'BATCH_START' });
    const newRows = activeVersion.rows.filter(r => r.type !== 'DAYBREAK' || r.pinned);
    newRows.forEach((r, i) => r.order = i);
    dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, rows: newRows } });
    dispatch({ type: 'BATCH_COMMIT' });
  };

  const handleAutoDaybreak = async (mode: 'duration' | 'pages') => {
    if (!activeVersion) return;
    const val = await dialog.prompt({
      title: mode === 'duration' ? 'Auto Day Break by Duration' : 'Auto Day Break by Pages',
      placeholder: mode === 'duration' ? 'e.g. 8h or 1h 30m' : 'e.g. 2 4/8 or 3.5',
      defaultValue: '',
    });
    if (!val) return;
    const threshold = mode === 'duration' ? parseDuration(val) : parsePageCount(val);
    if (isNaN(threshold) || threshold <= 0) return;

    let rows = [...activeVersion.rows];

    const hasDaybreaks = rows.some(r => r.type === 'DAYBREAK');
    if (hasDaybreaks) {
      const ok = await dialog.confirm({
        title: 'Existing Day Breaks',
        message: 'Existing day breaks will be removed before auto-placing new ones. Continue?',
        danger: true,
      });
      if (!ok) return;
      rows = rows.filter(r => r.type !== 'DAYBREAK' || r.pinned);
    }

    dispatch({ type: 'BATCH_START' });

    const pinnedRows = rows.filter(r => r.pinned);

    const scheduled = rows.filter(r => r.containerId !== null && r.type !== 'DAYBREAK');
    const boneyard = rows.filter(r => r.containerId === null && r.type !== 'DAYBREAK');

    scheduled.sort((a, b) => {
      if (a.containerId !== b.containerId) return (a.containerId || 0) - (b.containerId || 0);
      return a.order - b.order;
    });

    const result: typeof rows = [];
    let accumulator = 0;

    for (const row of scheduled) {
      const scene = row.sceneId ? project.scenes.find(s => s.id === row.sceneId) : null;

      if (accumulator > 0 && accumulator >= threshold) {
        result.push({
          id: generateUUID(),
          type: 'DAYBREAK' as const,
          containerId: row.containerId,
          order: 0,
          daybreakLabel: 'DAYBREAK',
          daybreakCallTime: '08:00',
        });
        accumulator = 0;
      }

      if (mode === 'duration') {
        accumulator += (row.estimatedDuration || 0);
      } else {
        accumulator += scene?.pageCountDecimal || 0;
      }

      result.push(row);
    }

    if (result.length > 0) {
      result.push({
        id: generateUUID(),
        type: 'DAYBREAK' as const,
        containerId: result[result.length - 1].containerId,
        order: 0,
        daybreakLabel: 'DAYBREAK',
        daybreakCallTime: '08:00',
      });
    }

    const combined = [...pinnedRows, ...result, ...boneyard];
    combined.forEach((r, i) => r.order = i);

    dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, rows: combined } });
    dispatch({ type: 'BATCH_COMMIT' });
  };

  const handleCustomSort = (criterion: string) => {
    const isIntExt = criterion === 'int_ext';
    const options = isIntExt
      ? (project.colorPalette?.intExtOptions || ['INT', 'EXT', 'INT/EXT'])
      : (project.colorPalette?.dayNightOptions || ['DAY', 'NIGHT', 'MORNING', 'EVENING']);
    const title = options.slice(0, 2).join(' / ');
    openCustomOrderModal(criterion, title, options);
  };

  const handleCustomOrderSort = (criterion: string, order: string[]) => {
    setSortBy(criterion);
    setSortDir('asc');
    const next = { ...customSortOrders, [criterion]: order };
    setCustomSortOrders(next);
    customSortOrdersRef.current = next;
    handleSort(criterion, 'asc');
  };

  const getCustomOrderCmp = (criterion: string) => {
    const order = customSortOrdersRef.current[criterion];
    if (!order) return null;
    if (criterion === 'int_ext') return compareByCustomOrder(order, s => s.intExt);
    if (criterion === 'day_night') return compareByCustomOrder(order, s => s.dayNight);
    return null;
  };

  const handleSort = useCallback(async (criterion: string, direction: 'asc' | 'desc') => {
    if (!activeVersion) return;
    setSortBy(criterion);
    setSortDir(direction);

    const hasDaybreaks = activeVersion.rows.some(r => r.type === 'DAYBREAK' && !r.pinned);
    if (hasDaybreaks) {
      const ok = await dialog.confirm({
        title: 'Sort Strips',
        message: 'Sorting will remove all day breaks. Continue?',
        danger: true,
      });
      if (!ok) return;
    }

    dispatch({ type: 'BATCH_START' });

    const pinnedRows = activeVersion.rows.filter(r => r.pinned);
    let rows = activeVersion.rows.filter(r => (r.type !== 'DAYBREAK' || r.pinned) && !r.pinned);

    const scheduled = rows.filter(r => r.containerId !== null);
    const boneyard = rows.filter(r => r.containerId === null);

    const days = new Map<number, typeof scheduled>();
    for (const row of scheduled) {
      const d = row.containerId || 0;
      if (!days.has(d)) days.set(d, []);
      days.get(d)!.push(row);
    }

    const sign = direction === 'desc' ? -1 : 1;

    for (const [day, dayRows] of days) {
      const sceneRows = dayRows.filter(r => r.type === 'SCENE');
      const nonSceneRows = dayRows.filter(r => r.type !== 'SCENE');

      sceneRows.sort((a, b) => {
        const sceneA = a.sceneId ? project.scenes.find(s => s.id === a.sceneId) : null;
        const sceneB = b.sceneId ? project.scenes.find(s => s.id === b.sceneId) : null;

        if (criterion === 'scene_number') {
          const numA = sceneA ? parseInt(sceneA.sceneNumber, 10) || 0 : 0;
          const numB = sceneB ? parseInt(sceneB.sceneNumber, 10) || 0 : 0;
          if (numA !== numB) return (numA - numB) * sign;
          return (sceneA?.sceneNumber || '').localeCompare(sceneB?.sceneNumber || '') * sign;
        }
        if (criterion === 'script_day') {
          const numA = parseInt(sceneA?.scriptDay || '0', 10) || 0;
          const numB = parseInt(sceneB?.scriptDay || '0', 10) || 0;
          if (numA !== numB) return (numA - numB) * sign;
          return (sceneA?.scriptDay || '').localeCompare(sceneB?.scriptDay || '') * sign;
        }
        if (criterion === 'page_count') {
          return ((sceneA?.pageCountDecimal || 0) - (sceneB?.pageCountDecimal || 0)) * sign;
        }
        if (criterion === 'duration') {
          return ((a.estimatedDuration || 0) - (b.estimatedDuration || 0)) * sign;
        }
        if (criterion === 'int_ext') {
          const customCmp = getCustomOrderCmp('int_ext');
          if (customCmp && sceneA && sceneB) return customCmp(sceneA, sceneB);
          return ((sceneA?.intExt || '') as string).localeCompare((sceneB?.intExt || '') as string) * sign;
        }
        if (criterion === 'day_night') {
          const customCmp = getCustomOrderCmp('day_night');
          if (customCmp && sceneA && sceneB) return customCmp(sceneA, sceneB);
          return ((sceneA?.dayNight || '') as string).localeCompare((sceneB?.dayNight || '') as string) * sign;
        }
        const valA = String((sceneA as any)?.[criterion] ?? '');
        const valB = String((sceneB as any)?.[criterion] ?? '');
        return valA.localeCompare(valB) * sign;
      });

      const merged = [...sceneRows, ...nonSceneRows];
      days.set(day, merged);
    }

    const sortedScheduled: typeof scheduled = [];
    for (const day of [...days.keys()].sort((a, b) => a - b)) {
      const dayRows = days.get(day)!;
      sortedScheduled.push(...dayRows);
    }

    const combined = [...pinnedRows, ...sortedScheduled, ...boneyard];
    const finalRows = combined.map((r, i) => ({ ...r, order: i }));

    dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, rows: finalRows } });
    dispatch({ type: 'BATCH_COMMIT' });
  }, [activeVersion, project.scenes, dispatch, dialog]);

  const applyNoteColor = () => {
    if (!colorPicker || !activeVersion) return;
    const newRows = activeVersion.rows.map(r =>
      r.id === colorPicker.rowId ? { ...r, noteColor: colorPicker.bg, noteTextColor: colorPicker.text, noteText: colorPicker.noteText } : r
    );
    dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, rows: newRows } });
    setColorPicker(null);
  };

  const reorderDay = (allRows: ScheduleRow[], day: number | null, activeId: string, overId: string) => {
    let dayRows = allRows.filter(r => r.containerId === day).sort((a, b) => a.order - b.order);
    const activeIndex = dayRows.findIndex(r => r.id === activeId);
    const overIndex = dayRows.findIndex(r => r.id === overId);
    
    if (activeIndex !== -1 && overIndex !== -1) {
      const targetIndex = activeIndex < overIndex ? overIndex - 1 : overIndex;
      dayRows = arrayMove(dayRows, activeIndex, targetIndex);
      dayRows.forEach((r, i) => r.order = i);
      return [...allRows.filter(r => r.containerId !== day), ...dayRows];
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
  const boneyardFlatRef = useRef<string[]>([]);
  boneyardFlatRef.current = boneyardRows.map(r => r.id);
  const stripboardLastIdRef = useRef<string | null>(null);
  const boneyardLastIdRef = useRef<string | null>(null);
  const sidebarCollapsedRef = useRef(false);

  const [digitBuffer, setDigitBuffer] = useState('');
  const digitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const digitDataRef = useRef({ versionId: '', rowIds: [] as string[], rows: [] as ScheduleRow[], buffer: '' });
  const daybreakOrderRef = useRef<ScheduleRow[]>([]);
  daybreakOrderRef.current = (activeVersion?.rows || []).filter(r => r.type === 'DAYBREAK' && r.containerId != null).sort((a, b) => {
    if ((a.containerId || 0) !== (b.containerId || 0)) return (a.containerId || 0) - (b.containerId || 0);
    return a.order - b.order;
  });
  const BUFFER_MS = 350;

  const commitDigits = useCallback(() => {
    const data = digitDataRef.current;
    if (!data.buffer) return;
    const daybreaks = daybreakOrderRef.current;
    if (daybreaks.filter(d => !d.pinned).length === 0) {
      setDigitBuffer('');
      digitDataRef.current.buffer = '';
      return;
    }
    const dayNum = parseInt(data.buffer, 10);
    if (dayNum < 1 || dayNum > daybreaks.length) {
      setDigitBuffer('');
      digitDataRef.current.buffer = '';
      return;
    }
    if (dayNum < daybreaks.length) {
      const targetDaybreak = daybreaks[dayNum];
      const newRows = data.rows.map(r => {
        if (data.rowIds.includes(r.id)) {
          return { ...r, containerId: 1, order: targetDaybreak.order - 0.5 + data.rowIds.indexOf(r.id) * 0.01 };
        }
        return r;
      });
      newRows.sort((a, b) => {
        if ((a.containerId || 0) !== (b.containerId || 0)) return (a.containerId || 0) - (b.containerId || 0);
        return a.order - b.order;
      });
      newRows.forEach((r, i) => r.order = i);
      dispatch({ type: 'UPDATE_VERSION', payload: { id: data.versionId, rows: newRows } });
    } else {
      const maxOrder = daybreaks.length > 0 ? Math.max(...daybreaks.map(d => d.order)) : -1;
      const newRows = data.rows.map(r => {
        if (data.rowIds.includes(r.id)) {
          return { ...r, containerId: 1, order: maxOrder + 1 + data.rowIds.indexOf(r.id) };
        }
        return r;
      });
      dispatch({ type: 'UPDATE_VERSION', payload: { id: data.versionId, rows: newRows } });
    }
    const lastScheduledId = data.rowIds[data.rowIds.length - 1];
    const lastIdx = data.rows.findIndex(r => r.id === lastScheduledId);
    const next = data.rows.slice(lastIdx + 1).find(r => r.containerId === null || r.containerId === -1);
    if (next) {
      setSelectedRowIds(new Set([next.id]));
      setLastClickedId(next.id);
    }
    setDigitBuffer('');
    digitDataRef.current.buffer = '';
  }, [dispatch]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (textEditingEnabled || !activeVersion) return;
      const target = e.target as HTMLElement;
      if ((target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) && !(target as HTMLInputElement).readOnly) return;
      if (e.key === 'Enter' && digitDataRef.current.buffer) {
        e.preventDefault();
        if (digitTimerRef.current) clearTimeout(digitTimerRef.current);
        commitDigits();
        return;
      }
      if (!/^[0-9]$/.test(e.key)) return;
      const boneyardSelected = activeVersion.rows.filter(r => selectedRowIds.has(r.id) && (r.containerId === null || r.containerId === -1));
      if (boneyardSelected.length === 0) return;
      if (daybreakOrderRef.current.filter(d => !d.pinned).length === 0) return;
      e.preventDefault();
      const next = digitDataRef.current.buffer + e.key;
      digitDataRef.current = {
        versionId: activeVersion.id,
        rowIds: boneyardSelected.map(r => r.id),
        rows: activeVersion.rows,
        buffer: next,
      };
      setDigitBuffer(next);
      if (digitTimerRef.current) clearTimeout(digitTimerRef.current);
      digitTimerRef.current = setTimeout(commitDigits, BUFFER_MS);
    };
    currentWindow.addEventListener('keydown', handler);
    return () => currentWindow.removeEventListener('keydown', handler);
  }, [selectedRowIds, textEditingEnabled, activeVersion, commitDigits, currentWindow]);

  useEffect(() => {
    return () => {
      if (digitTimerRef.current) clearTimeout(digitTimerRef.current);
    };
  }, []);

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
      const day = getDayFromId(overId);
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
           if (r.containerId === activeDay) return { ...r, containerId: -1 }; 
           if (r.containerId === overDay) return { ...r, containerId: activeDay };
           return r;
         }).map(r => r.containerId === -1 ? { ...r, containerId: overDay } : r);
         
          dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, rows: newRows } });
      }
      return;
    }

    const activeRow = augmentedRows.find(r => r.id === activeId);
    
    if (!activeRow) return;

    let overDay = getDayFromId(overId);
    if (overId === 'boneyard_bin' || overId === 'end-boneyard' || (overDay === null && augmentedRows.some(r => r.id === overId && r.containerId === null))) {
      overDay = null; // explicit drop to boneyard
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
             if (rA.containerId !== rB.containerId) return (rA.containerId || 0) - (rB.containerId || 0);
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
      let dayRows = newRows.filter(r => r.containerId === overDay).sort((a, b) => a.order - b.order);
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
      const movedRow = { ...activeRow, containerId: overDay };
      dayRows.splice(insertIndex, 0, movedRow);
      dayRows.forEach((r, i) => r.order = i);
      newRows = [...newRows.filter(r => r.containerId !== overDay), ...dayRows];
      setSelectedRowIds(new Set([activeId]));
    } else {
      const draggingItems = draggingIds.map(id => newRows.find(r => r.id === id)!).filter(Boolean);
      const dayRowsBefore = newRows.filter(r => r.containerId === overDay).sort((a, b) => a.order - b.order);
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

      newRows = newRows.filter(r => !draggingIds.includes(r.id));
      const dayRows = newRows.filter(r => r.containerId === overDay).sort((a, b) => a.order - b.order);
      const newItems = draggingItems.map(item => ({ ...item, containerId: overDay }));
      dayRows.splice(insertIndex, 0, ...newItems);
      dayRows.forEach((r, i) => r.order = i);
      newRows = [...newRows.filter(r => r.containerId !== overDay), ...dayRows];
      setSelectedRowIds(new Set(draggingIds));
    }

    // Convert synthetic rows that got modified into real rows
    const persistentRows = newRows.map(sanitizeRow);
    dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, rows: persistentRows } });
  };

  const activeDragRow = useMemo(() => {
    if (!activeId || activeType !== 'ROW') return null;
    const ids = Array.from(activeDragIds.size > 1 ? activeDragIds : [activeId]);
    ids.sort((a, b) => {
      const rA = augmentedRows.find(r => r.id === a);
      const rB = augmentedRows.find(r => r.id === b);
      if (rA && rB) {
        if (rA.containerId !== rB.containerId) return (rA.containerId || 0) - (rB.containerId || 0);
        return rA.order - rB.order;
      }
      return 0;
    });
    return augmentedRows.find(r => r.id === ids[0]) || null;
  }, [activeId, activeType, activeDragIds, augmentedRows]);

  const activeDragRows = useMemo(() => {
    if (!activeId || activeType !== 'ROW') return [];
    return activeDragIds.size > 1
      ? Array.from(activeDragIds)
          .sort((a, b) => {
            const rA = augmentedRows.find(r => r.id === a);
            const rB = augmentedRows.find(r => r.id === b);
            if (rA && rB) {
              if (rA.containerId !== rB.containerId) return (rA.containerId || 0) - (rB.containerId || 0);
              return rA.order - rB.order;
            }
            return 0;
          })
          .map(id => augmentedRows.find(r => r.id === id)!)
          .filter(Boolean)
      : [activeDragRow!].filter(Boolean);
  }, [activeId, activeType, activeDragIds, augmentedRows, activeDragRow]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <PageToolbar theme="light" justify="end">
            {selectionSummary && (
              <span className="bg-amber-100 text-amber-700 text-xs font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                <span>{selectionSummary.count} strip{selectionSummary.count > 1 ? 's' : ''}</span>
                <span className="text-amber-500/60">·</span>
                <span>{formatDuration(selectionSummary.totalMinutes)}</span>
              </span>
            )}
            {bufferSummary && (
              <span className="bg-amber-100 text-amber-700 text-xs font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                {bufferSummary.count} in buffer
              </span>
            )}
            <span className="text-xs text-zinc-500 shrink-0">{productionSections.length} days</span>
            <div className="w-px h-4 bg-zinc-200" />
            <button
              onClick={handleDeleteAllDaybreaks}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer select-none ${isCloud ? 'bg-blue-950 hover:bg-blue-900 text-white' : 'bg-zinc-900 hover:bg-zinc-800 text-white'}`}
              title="Clear All Day Breaks"
            >
              <Eraser className="w-3.5 h-3.5 shrink-0" />
              Clear
            </button>
            <DropdownMenu
              open={autoDaybreakOpen}
              onOpenChange={setAutoDaybreakOpen}
              width="w-44"
              theme="light"
              trigger={
                <button className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer select-none ${isCloud ? 'bg-blue-950 hover:bg-blue-900 text-white' : 'bg-zinc-900 hover:bg-zinc-800 text-white'}`}>
                  <Wand2 className="w-3.5 h-3.5 shrink-0" />
                  Auto
                  <ChevronDown className="w-3 h-3 shrink-0" />
                </button>
              }
            >
              <DropdownItem onClick={() => { setAutoDaybreakOpen(false); handleAutoDaybreak('duration'); }} icon={<Clock className="w-3.5 h-3.5" />}>By Duration…</DropdownItem>
              <DropdownItem onClick={() => { setAutoDaybreakOpen(false); handleAutoDaybreak('pages'); }} icon={<FileText className="w-3.5 h-3.5" />}>By Pages…</DropdownItem>
              <DropdownDivider />
              <DropdownItem onClick={() => { setAutoDaybreakOpen(false); handleDeleteAllDaybreaks(); }} icon={<Eraser className="w-3.5 h-3.5" />} variant="danger">Clear All</DropdownItem>
            </DropdownMenu>
            <SortDropdown
              open={sortMenuOpen}
              onOpenChange={setSortMenuOpen}
              sortBy={sortBy}
              sortDir={sortDir}
              onSort={handleSort}
              onCustomSort={handleCustomSort}
              categories={sortCategories}
              intExtLabel={intExtSortLabel}
              dayNightLabel={dayNightSortLabel}
            />
            <div className="w-px h-4 bg-zinc-200" />
            <DropdownMenu
              open={ribbonMenuOpen}
              onOpenChange={setRibbonMenuOpen}
              width="w-48"
              theme="light"
                trigger={
                  <button className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer select-none hover:bg-zinc-200 text-zinc-600">
                    View
                    <ChevronDown className="w-3 h-3 shrink-0 text-zinc-500" />
                  </button>
              }
            >
              <DropdownSubmenu id="ribbon-layout" label="Ribbon Layout" icon={<LayoutTemplate className="w-3.5 h-3.5" />} width="w-44">
                {project.ribbonDesigns.map(d => (
                <DropdownItem
                    key={d.id}
                    onClick={() => { dispatch({ type: 'SET_ACTIVE_RIBBON', payload: d.id }); setRibbonMenuOpen(false); }}
                    icon={project.activeRibbonId === d.id ? <Check className="w-3.5 h-3.5" /> : undefined}
                  >
                    {d.name}
                  </DropdownItem>
                ))}
              </DropdownSubmenu>
              <DropdownSubmenu id="stripboard-view" label="Stripboard View" icon={<Monitor className="w-3.5 h-3.5" />} width="w-44">
                {(['portrait', 'landscape', 'full'] as const).map(m => (
                  <DropdownItem
                    key={m}
                    onClick={() => { setViewMode(m); setRibbonMenuOpen(false); }}
                    icon={viewMode === m ? <Check className="w-3.5 h-3.5" /> : undefined}
                  >
                    {m === 'portrait' ? 'A4 Portrait' : m === 'landscape' ? 'A4 Landscape' : 'Full Width'}
                  </DropdownItem>
                ))}
              </DropdownSubmenu>
              <DropdownDivider />
              <DropdownSubmenu id="cell-borders" label="Cell Borders" icon={<Table className="w-3.5 h-3.5" />} width="w-44">
                {(['none', 'vertical', 'horizontal', 'both'] as CellBorders[]).map(m => (
                  <DropdownItem
                    key={m}
                    onClick={() => { setCellBorders(m); setRibbonMenuOpen(false); }}
                    icon={cellBorders === m ? <Check className="w-3.5 h-3.5" /> : undefined}
                  >
                    {m === 'none' ? 'None' : m === 'vertical' ? 'Vertical' : m === 'horizontal' ? 'Horizontal' : 'Both'}
                  </DropdownItem>
                ))}
              </DropdownSubmenu>
            </DropdownMenu>
            <button
              onClick={() => shootViolations.length > 0 && setShowShootViolations(true)}
              className={`flex items-center justify-center gap-1 h-7 px-2 rounded-full text-xs font-semibold transition-colors cursor-pointer select-none ${shootViolations.length > 0 ? 'bg-red-100 text-red-600 hover:bg-red-200' : 'text-zinc-400 hover:text-zinc-600 hover:bg-zinc-200'}`}
              title="View All Violations"
            >
              <Flag className={`w-3.5 h-3.5 ${shootViolations.length > 0 ? 'text-red-500' : ''}`} />
              {shootViolations.length > 0 && <span className="shrink-0">{shootViolations.length}</span>}
            </button>
            <button
              onClick={() => setShowHelp(true)}
              className="flex items-center justify-center w-7 h-7 rounded-full text-zinc-500 hover:text-zinc-700 hover:bg-zinc-200 transition-colors cursor-pointer select-none"
              title="Keyboard Shortcuts & Help"
            >
              <HelpCircle className="w-4 h-4" />
            </button>
            <button
              onClick={() => !readOnly && setTextEditingEnabled(p => !p)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-semibold transition-colors cursor-pointer select-none ${readOnly ? 'opacity-30 cursor-not-allowed' : ''} ${textEditingEnabled ? 'bg-blue-600 hover:bg-blue-500 text-white' : isCloud ? 'bg-blue-950 hover:bg-blue-900 text-white' : 'bg-zinc-900 hover:bg-zinc-800 text-white'}`}
            >
              <Pencil className="w-3.5 h-3.5 shrink-0" />
              Edit
            </button>
            {onPrint && (
              <button
                onClick={onPrint}
                className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-semibold transition-colors ${isCloud ? 'bg-blue-950 hover:bg-blue-900 text-white' : 'bg-zinc-900 hover:bg-zinc-800 text-white'}`}
              >
                <Printer className="w-3.5 h-3.5 shrink-0" />
                Print
              </button>
            )}
      </PageToolbar>
      <style>{`
        .schedule-table {
          width: 100%;
          table-layout: fixed;
          border-collapse: collapse;
          font-family: Helvetica, sans-serif;
          font-size: 8pt;
          line-height: 1.2;
        }
        .schedule-table td {
          padding: 6px 6px;
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
        .schedule-table .strip-header-row td {
          padding-top: 16px !important;
          padding-bottom: 16px !important;
        }
        .schedule-table .row-note td,
        .schedule-table .row-break td {
          padding-top: var(--note-row-py, 12px) !important;
          padding-bottom: var(--note-row-py, 12px) !important;
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
            setSortMenuOpen(false);
            setRibbonMenuOpen(false);
            setAutoDaybreakOpen(false);
          }}
          onContextMenu={(e) => {
              const rowEl = (e.target as HTMLElement).closest('[data-row-id]');
              if (rowEl) {
                 e.preventDefault();
                 const rowId = rowEl.getAttribute('data-row-id')!;
                 if (getMarqueeMode() === 'tool') {
                   setSelectedRowIds(prev => prev.has(rowId) ? prev : new Set([...prev, rowId]));
                 } else if (!selectedRowIds.has(rowId)) {
                   setSelectedRowIds(new Set([rowId]));
                 }
                 const containerIdAttr = rowEl.getAttribute('data-container-id');
                  const containerId = containerIdAttr === 'null' ? null : parseInt(containerIdAttr!, 10);
                 setContextMenu({ x: e.clientX, y: e.clientY, rowId, containerId });
              } else {
                 setContextMenu(null);
              }
          }}
      >
            <BoneyardBlock rows={boneyardRows} projectScenes={project.scenes} textEditingEnabled={effectiveTextEditingEnabled} onAction={handleContextMenuAction} contextMenu={contextMenu} setContextMenu={setContextMenu} selectedIds={selectedRowIds} activeDragIds={activeDragIds} onRowClick={handleRowClick} onSelectionChange={(ids, addMode) => setSelectedRowIds(prev => {
                if (addMode && getMarqueeMode() === 'tool') {
                  const next = new Set(prev);
                  for (const id of ids) next.has(id) ? next.delete(id) : next.add(id);
                  return next;
                }
                return addMode ? new Set([...prev, ...ids]) : ids;
              })} insertBeforeId={insertBeforeId} activeDragRow={activeDragRow} activeDragRows={activeDragRows} activeRowId={activeId} onRowNavigate={(rowId) => { setSelectedRowIds(new Set([rowId])); setLastClickedId(rowId); }} onRowDoubleClick={handleRowDoubleClick} onCollapseChange={handleCollapseChange} ribbon={activeRibbon} colWidths={activeColWidths} cellPaddingV={cellPaddingV} cellPaddingH={cellPaddingH} edgePadding={edgePadding} cellBorders={cellBorders} forceExpanded={forceBoneyardExpanded} />
        
        {/* Main Schedule Area */}
        <div ref={scheduleScrollRef} onScroll={() => { if (scheduleScrollRef.current) savedScrollTopRef.current = scheduleScrollRef.current.scrollTop; }} className="flex-1 overflow-auto flex flex-col items-center p-8 pb-32 relative" style={{ touchAction: IS_COARSE ? 'pan-y pan-x' : undefined }}
          onClick={(e) => {
            if (marqueeJustEndedRef.current || (e.target as HTMLElement).closest('[data-row-id]')) return;
            setSelectedRowIds(new Set());
            setContextMenu(null);
            setSortMenuOpen(false);
            setRibbonMenuOpen(false);
            setAutoDaybreakOpen(false);
          }}
        >
          <div style={{ width: viewWidth ? `${viewWidth}px` : '100%', margin: '0 auto' }}>
                {existingDays.map((dayInt, i) => (
                <StripBlock 
                  key={dayInt} 
                  dayInt={dayInt} 
                  rows={scheduledRows[dayInt] || []}
                  selectedIds={selectedRowIds}
                  activeDragIds={activeDragIds}
                  onRowClick={handleRowClick}
                  textEditingEnabled={effectiveTextEditingEnabled}
                  insertBeforeId={insertBeforeId}
                  activeRowId={activeId}
                  activeDragRow={activeDragRow}
                  activeDragRows={activeDragRows}
                  chronoDay={chronoDayMap.get(dayInt)}
                   focusedRowId={focusedRowId}
                   onRowDoubleClick={handleRowDoubleClick}
                    onRowNavigate={(rowId) => { setSelectedRowIds(new Set([rowId])); setLastClickedId(rowId); }}
                      ribbon={activeRibbon}
                      colWidths={activeColWidths}
                      cellPaddingV={cellPaddingV} cellPaddingH={cellPaddingH} edgePadding={edgePadding}
                     cellBorders={cellBorders}
                  />
              ))}
          </div>
          <MarqueeOverlay box={marqueeBox} />
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
                  <SortableRibbon row={row as any} scenes={project.scenes} isOverlay textEditingEnabled={effectiveTextEditingEnabled} ribbon={activeRibbon} colWidths={activeColWidths} cellPaddingV={cellPaddingV} cellPaddingH={cellPaddingH} edgePadding={edgePadding} cellBorders={cellBorders} />
                </div>
              );
            })}
            {activeDragIds.size === 1 && activeDragIds.has(activeId as string) && (
              <SortableRibbon row={activeDragRow as any} scenes={project.scenes} isOverlay textEditingEnabled={effectiveTextEditingEnabled} ribbon={activeRibbon} colWidths={activeColWidths} cellPaddingV={cellPaddingV} cellPaddingH={cellPaddingH} edgePadding={edgePadding} />
            )}
            {activeDragIds.size > 1 && (
               <div className="absolute -top-3 -right-3 bg-blue-500 text-white font-bold px-3 py-1 rounded-full shadow-lg text-sm border-2 border-white z-20">
                 ×{activeDragIds.size}
               </div>
            )}
          </div>
        ) : null}
      </DragOverlay>

      {digitBuffer && (
        <div className="fixed inset-0 pointer-events-none z-[9999] flex items-start justify-center pt-12">
          <div className="bg-zinc-900/90 backdrop-blur-md border border-zinc-700 rounded-xl shadow-2xl px-6 py-3 flex flex-col items-center gap-1.5 min-w-[140px]">
            <span className="text-zinc-300 text-xs font-semibold uppercase tracking-widest">Schedule to Section</span>
            <span className="text-white text-3xl font-bold tabular-nums">{digitBuffer}</span>
            <div className="w-full h-1 bg-zinc-700 rounded-full overflow-hidden">
              <div key={digitBuffer} className="h-full bg-blue-500 rounded-full" style={{ animation: `shrink ${BUFFER_MS}ms linear forwards` }} />
            </div>
          </div>
        </div>
      )}

      <FloatingTooltip open={!!selectionSummary || !!bufferSummary}>
        <div className="bg-zinc-900 text-white text-[10px] rounded shadow-xl whitespace-nowrap leading-relaxed">
          {selectionSummary && (
            <>
              <div className="px-2.5 py-1.5">{selectionSummary.count} strip{selectionSummary.count > 1 ? 's' : ''} selected</div>
              <div className="border-t border-zinc-700 px-2.5 py-1.5">{formatDuration(selectionSummary.totalMinutes)}</div>
            </>
          )}
          {selectionSummary && bufferSummary && <div className="border-t border-zinc-700" />}
          {bufferSummary && (
            <div className="px-2.5 py-1.5">{bufferSummary.count} strip{bufferSummary.count > 1 ? 's' : ''} in buffer</div>
          )}
        </div>
      </FloatingTooltip>

      <style>{`
        @keyframes shrink {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>

      {/* Context Menu */}
      <ContextMenu open={!!contextMenu} x={contextMenu?.x ?? 0} y={contextMenu?.y ?? 0} onClose={() => setContextMenu(null)}>
        {(() => {
          const row = contextMenu ? augmentedRows.find(r => r.id === contextMenu.rowId) : null;
          const inClipboard = augmentedRows.filter(r => r.containerId === -1).length;
          if (selectedRowIds.size > 1) {
            const allInBoneyard = Array.from(selectedRowIds).every(id => {
              const r = activeVersion.rows.find(rr => rr.id === id);
              return r && r.containerId == null;
            });
            return (
              <>
                <ContextMenuItem onClick={() => { cutSelected(); setContextMenu(null); }} icon={<Scissors className="w-3.5 h-3.5" />}>Cut {selectedRowIds.size} to Buffer</ContextMenuItem>
                <ContextMenuDivider />
                {allInBoneyard ? (
                  <ContextMenuItem variant="danger" onClick={() => {
                    const ids = Array.from(selectedRowIds).filter(id => {
                      const r = activeVersion.rows.find(rr => rr.id === id);
                      return !r?.pinned && r?.type !== 'DAYBREAK';
                    });
                    if (ids.length === 0) return;
                    const containerRows = activeVersion!.rows.filter(r => r.containerId != null && r.containerId !== -1);
                    const maxOrder = containerRows.length > 0 ? Math.max(...containerRows.map(r => r.order)) : -1;
                    const newRows = activeVersion!.rows.map(r => ids.includes(r.id) ? { ...r, containerId: 1, order: maxOrder + 1 + ids.indexOf(r.id) } : r);
                    dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion!.id, rows: newRows } });
                    selectNextAfterRemove(new Set(ids as string[]));
                    setContextMenu(null);
                  }} icon={<Send className="w-3.5 h-3.5" />}>
                    Send {selectedRowIds.size} to Stripboard
                  </ContextMenuItem>
                ) : (
                  <ContextMenuItem variant="danger" onClick={() => {
        const ids = Array.from(selectedRowIds).filter(id => {
          const r = activeVersion.rows.find(rr => rr.id === id);
          return !r?.pinned;
        });
        if (ids.length === 0) return;
                    const newRows = activeVersion!.rows.map(r => ids.includes(r.id) ? { ...r, containerId: null, order: 999999 } : r);
                    dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion!.id, rows: newRows } });
                    selectNextAfterRemove(new Set(ids as string[]));
                    setContextMenu(null);
                  }} icon={<Trash2 className="w-3.5 h-3.5" />}>
                    Remove {selectedRowIds.size} Ribbons
                  </ContextMenuItem>
                )}
              </>
            );
          }
          return (
            <>
              {inClipboard > 0 && (
                <>
                  <ContextMenuItem onClick={() => { pasteClipboard(contextMenu!.rowId); setContextMenu(null); }} icon={<ClipboardPaste className="w-3.5 h-3.5" />}>Paste Below ({inClipboard})</ContextMenuItem>
                  <ContextMenuDivider />
                </>
              )}
              {row && (
                <>
                  <ContextMenuItem onClick={() => { cutSelected(); setContextMenu(null); }} icon={<Scissors className="w-3.5 h-3.5" />}>Cut to Buffer</ContextMenuItem>
                  <ContextMenuDivider />
                </>
              )}
              <ContextMenuItem onClick={() => handleContextMenuAction('add_note')} icon={<StickyNote className="w-3.5 h-3.5" />}>Add Note Below</ContextMenuItem>
              <ContextMenuItem onClick={() => handleContextMenuAction('add_break')} icon={<Coffee className="w-3.5 h-3.5" />}>Add Break Below</ContextMenuItem>
              <ContextMenuItem onClick={() => handleContextMenuAction('add_daybreak')} icon={<Sunrise className="w-3.5 h-3.5" />}>Add Daybreak Below</ContextMenuItem>
              {row && <ContextMenuDivider />}
              {row?.type === 'SCENE' && (
                <>
                  <ContextMenuItem onClick={() => handleContextMenuAction('duplicate')} icon={<Copy className="w-3.5 h-3.5" />}>Duplicate (Ghost Scene)</ContextMenuItem>
                  <ContextMenuDivider />
                  {!IS_COARSE && shiftHeld && onOpenSceneInPopout ? (
                    <ContextMenuItem onClick={() => { if (row.sceneId && onOpenSceneInPopout) onOpenSceneInPopout(row.sceneId); setContextMenu(null); }} icon={<ExternalLink className="w-3.5 h-3.5" />}>Open in New Window</ContextMenuItem>
                  ) : (
                    <ContextMenuItem onClick={() => { if (row.sceneId && onOpenScene) onOpenScene(row.sceneId); setContextMenu(null); }} icon={<Eye className="w-3.5 h-3.5" />}>Open Sheet</ContextMenuItem>
                  )}
              {row?.containerId != null && (
                <>
                  <ContextMenuDivider />
                  <ContextMenuItem onClick={() => handleContextMenuAction('boneyard')} icon={<Trash2 className="w-3.5 h-3.5" />}>Send to Boneyard</ContextMenuItem>
                </>
              )}
            </>
          )}
              {(row?.type === 'NOTE' || row?.type === 'BREAK' || row?.type === 'DAYBREAK') && (
                <>
                  {row?.type === 'NOTE' && (
                    <>
                      <ContextMenuItem onClick={() => handleContextMenuAction('duplicate_note')} icon={<Copy className="w-3.5 h-3.5" />}>Duplicate Note</ContextMenuItem>
                      <ContextMenuItem onClick={() => handleContextMenuAction('change_color')} icon={<Palette className="w-3.5 h-3.5" />}>Edit Banner</ContextMenuItem>
                    </>
                  )}
                  {row?.type === 'BREAK' && (
                    <ContextMenuItem onClick={() => handleContextMenuAction('duplicate_break')} icon={<Copy className="w-3.5 h-3.5" />}>Duplicate Break</ContextMenuItem>
                  )}
                  {row?.type === 'DAYBREAK' && (
                    <ContextMenuItem onClick={() => handleContextMenuAction('duplicate_daybreak')} icon={<Copy className="w-3.5 h-3.5" />}>Duplicate Daybreak</ContextMenuItem>
                  )}
                  <ContextMenuDivider />
                  {row?.containerId != null && (
                    <ContextMenuItem onClick={() => handleContextMenuAction('boneyard')} icon={<Trash2 className="w-3.5 h-3.5" />}>Send to Boneyard</ContextMenuItem>
                  )}
                  <ContextMenuItem onClick={() => handleContextMenuAction('delete')} variant="danger" icon={<Trash2 className="w-3.5 h-3.5" />}>Delete</ContextMenuItem>
                </>
              )}
            </>
          );
        })()}
      </ContextMenu>

      {/* Color Picker Modal */}
      {colorPicker && (
        <Modal open onClose={() => setColorPicker(null)} title="Edit Banner" width="max-w-md"
          footer={
            <ModalFooter>
              <button onClick={() => setColorPicker(null)} className="px-6 py-2 text-zinc-400 text-xs font-medium rounded-lg hover:bg-zinc-800 hover:text-zinc-200 transition-colors">Cancel</button>
              <button onClick={applyNoteColor} className="px-6 py-2 bg-zinc-800 text-white text-xs font-semibold rounded-lg border border-zinc-700 hover:bg-zinc-700 transition-colors">Apply</button>
            </ModalFooter>
          }
        >
          <div className="p-6 space-y-5">
            <div className="flex items-center justify-between py-1">
              <span className="text-xs text-zinc-300">Background</span>
              <div className="flex items-center gap-2.5">
                <input type="color" value={colorPicker.bg} onChange={e => setColorPicker(p => p ? { ...p, bg: e.target.value } : null)} className="w-9 h-9 rounded border border-zinc-600 bg-zinc-900 cursor-pointer p-0" />
                <input type="text" readOnly value={colorPicker.bg} className="w-[5.5rem] text-xs text-zinc-300 font-mono bg-zinc-950 border border-zinc-700 rounded px-2 py-1 outline-none select-all" />
              </div>
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-xs text-zinc-300">Text Color</span>
              <div className="flex items-center gap-2.5">
                <input type="color" value={colorPicker.text} onChange={e => setColorPicker(p => p ? { ...p, text: e.target.value } : null)} className="w-9 h-9 rounded border border-zinc-600 bg-zinc-900 cursor-pointer p-0" />
                <input type="text" readOnly value={colorPicker.text} className="w-[5.5rem] text-xs text-zinc-300 font-mono bg-zinc-950 border border-zinc-700 rounded px-2 py-1 outline-none select-all" />
              </div>
            </div>
            <div>
              <textarea
                value={colorPicker.noteText}
                onChange={e => setColorPicker(p => p ? { ...p, noteText: e.target.value.toUpperCase() } : null)}
                rows={3}
                className="w-full text-xs px-3 py-2 rounded border border-zinc-800 outline-none focus:border-zinc-600 resize-none"
                style={{ background: colorPicker.bg, color: colorPicker.text }}
                placeholder="Banner text..."
              />
            </div>
          </div>
        </Modal>
      )}
      <HelpModal open={showHelp} onClose={() => setShowHelp(false)} />
      <ShootViolationsModal
        open={showShootViolations}
        onClose={() => setShowShootViolations(false)}
        dayViolations={shootViolations}
        castMembers={project.castMembers || []}
      />
      <CustomOrderSortModal
        open={customOrderModal?.open ?? false}
        onClose={closeCustomOrderModal}
        title={customOrderModal?.title ?? ''}
        options={customOrderModal?.options ?? []}
        onSort={(order) => {
          if (customOrderModal?.criterion) handleCustomOrderSort(customOrderModal.criterion, order);
        }}
      />
    </DndContext>
  </div>
);
}
