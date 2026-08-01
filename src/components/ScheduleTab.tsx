import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useProject, useIsCloudProject } from '../store';
import { useCurrentWindow, useCurrentDocument } from '../lib/popoutTarget';
import { DndContext, closestCorners, PointerSensor, TouchSensor, useSensor, useSensors, DragEndEvent, DragOverlay, DragStartEvent, DragOverEvent, CollisionDetection } from '@dnd-kit/core';
import { StripBlock } from './StripBlock';
import ColorField from './ColorField';
import { FieldBox, SuffixField } from './FieldBox';
import { CellInput } from './CellInput';
import { BoneyardBlock } from './BoneyardBlock';
import { SortableRibbon } from './SortableRibbon';
import { generateUUID, formatDuration, parseDuration, parsePageCount, formatPageCount } from '../lib/utils';
import { getNoteBannerColors } from '../lib/ribbonUtils';
import { ScheduleRow, Scene, RuleViolation } from '../types';
import { useMarquee, MarqueeOverlay, isAddModeActive, useAddMode, useMarqueeActive } from '../lib/useMarquee';
import { Sunrise } from 'lucide-react';
import { ContextMenu, ContextMenuItem, ContextMenuDivider } from './ContextMenu';
import DropdownMenu from './DropdownMenu';
import DropdownItem from './DropdownItem';
import DropdownDivider from './DropdownDivider';
import DropdownSubmenu from './DropdownSubmenu';

import { CustomOrderSortModal, useCustomOrderSort } from './CustomOrderSortModal';
import { compareByCustomOrder, getLockedTiebreakerResult } from './SortDropdown';
import HelpModal from './HelpModal';
import { FloatingTooltip } from './FloatingTooltip';
import Modal from './Modal';
import { ModalFooter } from './Modal';
import { useViewMode, useCellBorders } from '../lib/persist';
import { IS_COARSE } from '../lib/device';
import { useMarqueeMode } from '../lib/useLongPressMenu';
import { getMarqueeMode } from '../lib/useLongPressMenu';
import { useDialog } from './Dialog';
import { ELEMENT_CATEGORIES, CAT_ICONS, getCustomIcon } from '../lib/categories';
import { checkSection } from '../lib/rulesEngine';
import { formatDateLong } from '../lib/utils';
import { ShootViolationsModal } from './ViolationModal';
import { useDaybreakSections } from '../lib/useDaybreakSections';
import AddBannerModal, { AddBannerConfig } from './AddBannerModal';
import { getContainerBlock, makeEmptyContainerIds, ContainerIds, LastSelectedByContainer } from '../lib/containers';
import PageToolbar from './PageToolbar';
import ScheduleToolbar from './schedule/ScheduleToolbar';
import ScheduleContextMenu from './schedule/ScheduleContextMenu';
import ScheduleModals from './schedule/ScheduleModals';
import ScheduleOverlays from './schedule/ScheduleOverlays';
import { computeMiddleInsertIndex } from '../lib/daybreakUtils';
import { useStripboardContextMenu } from '../lib/useStripboardContextMenu';
import { useScheduleKeyboard } from './schedule/useScheduleKeyboard';
export function ScheduleTab({ onOpenScene, onOpenSceneInPopout, onPrint, targetSceneId, onSceneTargetSeen, savedScrollTop, onScrollChange }: { onOpenScene?: (sceneId: string) => void; onOpenSceneInPopout?: (sceneId: string) => void; onPrint?: () => void; targetSceneId?: string | null; onSceneTargetSeen?: () => void; savedScrollTop?: number; onScrollChange?: (top: number) => void }) {
  const { state, dispatch, readOnly } = useProject();
  const currentWindow = useCurrentWindow();
  const currentDocument = useCurrentDocument();
  const isCloud = useIsCloudProject();
  const project = state.present;
  const activeVersion = project.versions.find(v => v.id === project.activeVersionId);
  const { sections, sectionDateMap: hookSectionDateMap, daybreakRowToSection, nextSectionDateMap: hookNextSectionDateMap, productionSections, chronoDayMap: sectionChronoDayMap } = useDaybreakSections();
  const [viewMode, setViewMode, viewWidth] = useViewMode();
  const [cellBorders, setCellBorders] = useCellBorders();

  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<string | null>(null);
  const [insertBeforeId, setInsertBeforeId] = useState<string | null>(null);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [focusedRowId, setFocusedRowId] = useState<string | null>(null);
  const [activeDragIds, setActiveDragIds] = useState<Set<string>>(new Set());
  const [lastClickedId, setLastClickedId] = useState<string | null>(null);
  const [textEditingEnabled, setTextEditingEnabled] = useState(false);
  const effectiveTextEditingEnabled = textEditingEnabled && !readOnly;
  const [forceBoneyardExpanded, setForceBoneyardExpanded] = useState(false);
  const [colorPicker, setColorPicker] = useState<{ rowId: string; bg: string; text: string; noteText: string; originalBg: string; originalText: string; originalNoteText: string } | null>(null);
  const [ribbonMenuOpen, setRibbonMenuOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [autoDaybreakOpen, setAutoDaybreakOpen] = useState(false);
  const [autoDaybreakPrompt, setAutoDaybreakPrompt] = useState<{ mode: 'duration' | 'pages' } | null>(null);
  const [autoDaybreakRaw, setAutoDaybreakRaw] = useState('');
  const [autoDaybreakCleanup, setAutoDaybreakCleanup] = useState<{ mode: 'duration' | 'pages'; threshold: number } | null>(null);
  const [autoDaybreakNotesAction, setAutoDaybreakNotesAction] = useState<'boneyard' | 'delete'>('boneyard');
  const [autoDaybreakBreaksAction, setAutoDaybreakBreaksAction] = useState<'boneyard' | 'delete'>('boneyard');
  const [bannerMenuOpen, setBannerMenuOpen] = useState(false);
  const [bannerModalOpen, setBannerModalOpen] = useState(false);
  const [bannerDelete, setBannerDelete] = useState<{ type: 'NOTE' | 'BREAK' } | null>(null);
  const [bannerDeleteChecked, setBannerDeleteChecked] = useState<Set<string>>(new Set());
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [sortBy, setSortBy] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [customSortOrders, setCustomSortOrders] = useState<Record<string, string[]>>({});
  const customSortOrdersRef = useRef(customSortOrders);
  customSortOrdersRef.current = customSortOrders;
  const [lockedCriteria, setLockedCriteria] = useState<string[]>([]);
  const lockedCriteriaRef = useRef(lockedCriteria);
  lockedCriteriaRef.current = lockedCriteria;
  const { customOrderModal, openCustomOrderModal, closeCustomOrderModal } = useCustomOrderSort();

  const handleToggleLock = useCallback((criterion: string) => {
    setLockedCriteria(prev => {
      const next = prev.includes(criterion) ? prev.filter(c => c !== criterion) : [...prev, criterion];
      lockedCriteriaRef.current = next;
      return next;
    });
  }, []);
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
    const row = activeVersion.rows.find(r => r.id === id);
    if (row?.type === 'NOTE') {
      setColorPicker({ rowId: row.id, bg: row.noteColor || getNoteBannerColors(state.present.colorPalette).background, text: row.noteTextColor || getNoteBannerColors(state.present.colorPalette).color, noteText: row.noteText || '', originalBg: row.noteColor || getNoteBannerColors(state.present.colorPalette).background, originalText: row.noteTextColor || getNoteBannerColors(state.present.colorPalette).color, originalNoteText: row.noteText || '' });
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
      const clickedRow = activeVersion.rows.find(r => r.id === id);
      const anchorRow = activeVersion.rows.find(r => r.id === lastClickedId);
      const isBoneyard = (clickedRow && getContainerBlock(clickedRow) !== 'stripboard') ||
        (anchorRow && getContainerBlock(anchorRow) !== 'stripboard');
      const allIds = isBoneyard ? containerIdsRef.current.boneyard as string[] : containerIdsRef.current.stripboard;
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

  const handleCollapseChange = useCallback((collapsed: boolean) => {
    sidebarCollapsedRef.current = collapsed;
    if (collapsed) {
      setSelectedRowIds(prev => {
        const stripboardOnly = new Set(Array.from(prev).filter(id => !containerIdsRef.current.boneyard.includes(id)));
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
    const buffer = 80;
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
  const {
    contextMenu, setContextMenu,
    cutSelected, pasteClipboard, handleContextMenuAction,
    createOnContextMenu, selectNextAfterRemove,
  } = useStripboardContextMenu({
    selectedRowIds, setSelectedRowIds,
    rows: activeVersion.rows,
    activeVersion,
    activeDragIds,
    textEditingEnabled: effectiveTextEditingEnabled,
    dispatch,
    setFocusedRowId,
    scrollToRow,
    setColorPicker,
    project,
    enableDaybreaks: true,
  });

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
      const filtered = new Set([...ids].filter(id => !id.startsWith('empty-') && !activeVersionRef.current?.rows.find(r => r.id === id)?.pinned));
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

  const scheduledRows = useMemo(() => {
    const grouped = activeVersion.rows.filter(r => !activeDragIds.has(r.id) && r.containerId !== -1).reduce((acc, row) => {
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
  }, [activeVersion.rows, activeDragIds]);

  const boneyardRows = useMemo(() =>
    activeVersion.rows.filter(r => r.containerId === null && r.type !== 'DAYBREAK' && !activeDragIds.has(r.id)).sort((a, b) => a.order - b.order),
  [activeVersion.rows, activeDragIds]);

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
    const selectedRows = activeVersion.rows.filter(
      r => selectedRowIds.has(r.id) && r.type !== 'DAYBREAK' && !r.id.startsWith('empty-')
    );
    if (selectedRows.length === 0) return null;
    const totalMinutes = selectedRows.reduce((sum, r) =>
      sum + (r.type === 'BREAK' ? (r.breakDuration || 0) : (r.estimatedDuration || 0)), 0);
    return { count: selectedRows.length, totalMinutes };
  }, [selectedRowIds, activeVersion.rows]);

  const bufferSummary = useMemo(() => {
    const bufferRows = activeVersion.rows.filter(r => r.containerId === -1);
    if (bufferRows.length === 0) return null;
    const totalMinutes = bufferRows.reduce((sum, r) => sum + (r.estimatedDuration || 0), 0);
    return { count: bufferRows.length, totalMinutes };
  }, [activeVersion.rows]);

  const getDayFromId = (id: string): number | null => {
    if (id === 'end-boneyard' || id === 'boneyard_bin') return null;
    if (id.startsWith('day-wrap-') || id.startsWith('day-') || id.startsWith('end-')) {
      return parseInt(id.replace('day-wrap-', '').replace('day-', '').replace('end-', ''), 10);
    }
    const row = activeVersion.rows.find(r => r.id === id);
    return row ? row.containerId : null;
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

  const hasDaybreakDays = useMemo(() =>
    activeVersion?.rows.some(r => r.type === 'DAYBREAK' && !r.pinned && r.containerId != null && r.containerId !== -1) ?? false,
  [activeVersion]);

  const bannerLabelOf = useCallback((r: ScheduleRow, type: 'NOTE' | 'BREAK'): string => {
    const raw = type === 'NOTE' ? (r.noteText || '') : (r.breakLabel || '');
    return raw.trim().toUpperCase() || '(untitled)';
  }, []);

  const bannerColorOf = useCallback((r: ScheduleRow, type: 'NOTE' | 'BREAK'): { bg: string; fg: string } => {
    const nb = getNoteBannerColors(state.present.colorPalette);
    if (type === 'NOTE' && r.noteColor) {
      return { bg: r.noteColor, fg: r.noteTextColor || nb.color };
    }
    return { bg: nb.background, fg: nb.color };
  }, [state.present.colorPalette]);

  const bannerKeyOf = useCallback((r: ScheduleRow, type: 'NOTE' | 'BREAK'): string => {
    const label = bannerLabelOf(r, type);
    if (type === 'NOTE') {
      return `${label}||${bannerColorOf(r, type).bg}`;
    }
    return label;
  }, [bannerLabelOf, bannerColorOf]);

  const openBannerDeleteModal = useCallback((type: 'NOTE' | 'BREAK') => {
    setBannerDeleteChecked(new Set());
    setBannerDelete({ type });
  }, []);

  const deleteBanners = useCallback((type: 'NOTE' | 'BREAK', keys: Set<string>) => {
    if (!activeVersion) return;
    const ids = new Set<string>();
    for (const r of activeVersion.rows) {
      if (r.containerId != null && r.type === type) {
        if (keys.has(bannerKeyOf(r, type))) ids.add(r.id);
      }
    }
    if (ids.size === 0) return;
    const label = type === 'NOTE' ? 'note' : 'break';
    const doDelete = () => {
      dispatch({ type: 'BATCH_START' });
      const newRows = activeVersion.rows.filter(r => !ids.has(r.id)).map((r, i) => ({ ...r, order: i }));
      dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, rows: newRows } });
      dispatch({ type: 'BATCH_COMMIT' });
      setBannerDelete(null);
    };
    if (ids.size > 1) {
      dialog.confirm({
        title: `Delete ${ids.size} ${label} banners?`,
        message: `Remove ${ids.size} ${label} banner${ids.size !== 1 ? 's' : ''} from the stripboard?`,
        danger: true,
      }).then(ok => { if (ok) doDelete(); });
    } else {
      doDelete();
    }
  }, [activeVersion, dispatch, bannerKeyOf, dialog]);

  const bannerDeleteEntries = useMemo(() => {
    if (!activeVersion || !bannerDelete) return [];
    const counts = new Map<string, { key: string; count: number; label: string; bg: string; fg: string }>();
    for (const r of activeVersion.rows) {
      if (r.containerId != null && r.type === bannerDelete.type) {
        const key = bannerKeyOf(r, bannerDelete.type);
        const existing = counts.get(key);
        if (existing) {
          existing.count++;
        } else {
          const colors = bannerColorOf(r, bannerDelete.type);
          counts.set(key, { key, count: 1, label: bannerLabelOf(r, bannerDelete.type), bg: colors.bg, fg: colors.fg });
        }
      }
    }
    return [...counts.values()]
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }, [activeVersion, bannerDelete, bannerKeyOf, bannerColorOf, bannerLabelOf]);

  const handleAddBanners = (config: AddBannerConfig) => {
    if (!activeVersion) return;
    const stripRows = activeVersion.rows
      .filter(r => r.containerId != null && r.containerId !== -1)
      .sort((a, b) => {
        if ((a.containerId || 0) !== (b.containerId || 0)) return (a.containerId || 0) - (b.containerId || 0);
        return a.order - b.order;
      });

    type Insertion = { index: number; row: ScheduleRow };
    const insertions: Insertion[] = [];

    for (let i = 0; i < sections.length; i++) {
      const s = sections[i];
      if (s.isPinned) continue;
      const content = s.rows;
      const containerId = content[0]?.containerId ?? s.daybreakRow?.containerId ?? 1;
      const banner: ScheduleRow = {
        id: generateUUID(),
        type: config.type,
        containerId,
        order: 0,
        ...(config.type === 'NOTE'
          ? {
              noteText: (config.label || '').toUpperCase(),
              estimatedDuration: config.minutes,
              noteColor: config.noteColor || getNoteBannerColors(state.present.colorPalette).background,
              noteTextColor: config.noteTextColor || getNoteBannerColors(state.present.colorPalette).color,
            }
          : { breakLabel: (config.label || 'LUNCH').toUpperCase(), breakDuration: config.minutes }),
      };

      const opening = i > 0 ? sections[i - 1].daybreakRow : undefined;
      const openingIdx = opening ? stripRows.findIndex(r => r.id === opening.id) : -1;
      const closing = s.daybreakRow;
      const closingIdx = closing ? stripRows.findIndex(r => r.id === closing.id) : -1;

      let insertIndex: number;
      if (config.position === 'top') {
        insertIndex = openingIdx >= 0 ? openingIdx + 1 : 0;
      } else if (config.position === 'bottom') {
        insertIndex = closingIdx >= 0 ? closingIdx : stripRows.length;
      } else {
        insertIndex = computeMiddleInsertIndex(stripRows, content, project.scenes, config)
          ?? (openingIdx >= 0 ? openingIdx + 1 : 0);
      }

      insertions.push({ index: insertIndex, row: banner });
    }

    if (insertions.length === 0) return;

    insertions.sort((a, b) => a.index - b.index);

    const newStripRows: ScheduleRow[] = [];
    let insertionPtr = 0;
    for (let i = 0; i < stripRows.length; i++) {
      while (insertionPtr < insertions.length && insertions[insertionPtr].index === i) {
        newStripRows.push({ ...insertions[insertionPtr].row });
        insertionPtr++;
      }
      newStripRows.push({ ...stripRows[i] });
    }
    for (; insertionPtr < insertions.length; insertionPtr++) {
      newStripRows.push({ ...insertions[insertionPtr].row });
    }

    newStripRows.forEach((r, i) => { r.order = i; });

    const otherRows = activeVersion.rows.filter(r => r.containerId == null || r.containerId === -1);
    const newRows = [...newStripRows, ...otherRows];

    dispatch({ type: 'BATCH_START' });
    dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, rows: newRows } });
    dispatch({ type: 'BATCH_COMMIT' });
  };

  const handleAutoDaybreak = (mode: 'duration' | 'pages') => {
    if (!activeVersion) return;
    setAutoDaybreakRaw('');
    setAutoDaybreakPrompt({ mode });
  };

  const confirmAutoDaybreak = () => {
    if (!activeVersion || !autoDaybreakPrompt) return;
    const mode = autoDaybreakPrompt.mode;
    const threshold = mode === 'duration' ? parseDuration(autoDaybreakRaw) : parsePageCount(autoDaybreakRaw);
    if (isNaN(threshold) || threshold <= 0) return;
    setAutoDaybreakPrompt(null);

    const hasDaybreaks = activeVersion.rows.some(r => r.type === 'DAYBREAK' && !r.pinned);
    const hasNotes = activeVersion.rows.some(r => r.containerId !== null && r.type === 'NOTE');
    const hasBreaks = activeVersion.rows.some(r => r.containerId !== null && r.type === 'BREAK');

    if (hasDaybreaks || hasNotes || hasBreaks) {
      setAutoDaybreakCleanup({ mode, threshold });
      return;
    }

    executeAutoDaybreak(mode, threshold, 'boneyard', 'boneyard');
  };

  const normalizeAutoDaybreakRaw = (s: string) => {
    if (!autoDaybreakPrompt) return s;
    const v = autoDaybreakPrompt.mode === 'duration' ? parseDuration(s) : parsePageCount(s);
    return !isNaN(v) && v > 0
      ? (autoDaybreakPrompt.mode === 'duration' ? formatDuration(v) : formatPageCount(v))
      : s;
  };

  const executeAutoDaybreak = (mode: 'duration' | 'pages', threshold: number, notesAction: 'boneyard' | 'delete', breaksAction: 'boneyard' | 'delete') => {
    if (!activeVersion) return;

    dispatch({ type: 'BATCH_START' });

    let rows = [...activeVersion.rows];
    rows = rows.filter(r => r.type !== 'DAYBREAK' || r.pinned);

    const notesToProcess = rows.filter(r => r.containerId !== null && r.type === 'NOTE');
    const breaksToProcess = rows.filter(r => r.containerId !== null && r.type === 'BREAK');

    if (notesAction === 'boneyard') {
      rows = rows.map(r => notesToProcess.find(n => n.id === r.id) ? { ...r, containerId: null } : r);
    } else {
      rows = rows.filter(r => !notesToProcess.find(n => n.id === r.id));
    }
    if (breaksAction === 'boneyard') {
      rows = rows.map(r => breaksToProcess.find(b => b.id === r.id) ? { ...r, containerId: null } : r);
    } else {
      rows = rows.filter(r => !breaksToProcess.find(b => b.id === r.id));
    }

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
      const rowValue = mode === 'duration'
        ? (row.estimatedDuration || 0)
        : (scene?.pageCountDecimal || 0);

      if (accumulator > 0 && accumulator + rowValue > threshold) {
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

      accumulator += rowValue;
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

        const locks = lockedCriteriaRef.current.filter(l => l !== criterion);
        if (locks.length > 0 && sceneA && sceneB) {
          const tie = getLockedTiebreakerResult(locks, '', sceneA, sceneB, customSortOrdersRef.current, a.estimatedDuration, b.estimatedDuration);
          if (tie !== 0) return tie;
        }

        let cmp = 0;

        if (criterion === 'scene_number') {
          const numA = sceneA ? parseInt(sceneA.sceneNumber, 10) || 0 : 0;
          const numB = sceneB ? parseInt(sceneB.sceneNumber, 10) || 0 : 0;
          if (numA !== numB) cmp = (numA - numB) * sign;
          else cmp = (sceneA?.sceneNumber || '').localeCompare(sceneB?.sceneNumber || '') * sign;
        } else if (criterion === 'script_day') {
          const numA = parseInt(sceneA?.scriptDay || '0', 10) || 0;
          const numB = parseInt(sceneB?.scriptDay || '0', 10) || 0;
          if (numA !== numB) cmp = (numA - numB) * sign;
          else cmp = (sceneA?.scriptDay || '').localeCompare(sceneB?.scriptDay || '') * sign;
        } else if (criterion === 'page_count') {
          cmp = ((sceneA?.pageCountDecimal || 0) - (sceneB?.pageCountDecimal || 0)) * sign;
        } else if (criterion === 'duration') {
          cmp = ((a.estimatedDuration || 0) - (b.estimatedDuration || 0)) * sign;
        } else if (criterion === 'int_ext') {
          const customCmp = getCustomOrderCmp('int_ext');
          if (customCmp && sceneA && sceneB) cmp = customCmp(sceneA, sceneB);
          else cmp = ((sceneA?.intExt || '') as string).localeCompare((sceneB?.intExt || '') as string) * sign;
        } else if (criterion === 'day_night') {
          const customCmp = getCustomOrderCmp('day_night');
          if (customCmp && sceneA && sceneB) cmp = customCmp(sceneA, sceneB);
          else cmp = ((sceneA?.dayNight || '') as string).localeCompare((sceneB?.dayNight || '') as string) * sign;
        } else {
          const valA = String((sceneA as any)?.[criterion] ?? '');
          const valB = String((sceneB as any)?.[criterion] ?? '');
          cmp = valA.localeCompare(valB) * sign;
        }

        return cmp;
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
  const containerIdsRef = useRef<ContainerIds>(makeEmptyContainerIds());
  containerIdsRef.current = {
    boneyard: boneyardRows.map(r => r.id),
    stripboard: flatRowIdsRef.current.filter(id => {
      if (id.startsWith('empty-')) return false;
      const r = activeVersion?.rows.find(rr => rr.id === id);
      return !r?.pinned;
    }),
    clipboard: activeVersion?.rows.filter(r => r.containerId === -1).map(r => r.id) || [],
  };
  const lastSelectedRef = useRef<LastSelectedByContainer>({ boneyard: null, stripboard: null, clipboard: null });
  const sidebarCollapsedRef = useRef(false);

  useScheduleKeyboard({
    currentWindow,
    currentDocument,
    setSelectedRowIds,
    setLastClickedId,
    setFocusedRowId,
    selectedRowIds,
    activeDragIds,
    lastClickedIdRef,
    textEditingEnabled,
    activeVersion,
    dispatch,
    containerIdsRef,
    flatRowIdsRef,
    lastSelectedRef,
    sidebarCollapsedRef,
    scheduleScrollRef,
    cutSelected,
    pasteClipboard,
    selectNextAfterRemove,
    scrollToRow,
    existingDays,
  });


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
    let newRows: ScheduleRow[];
    if (dayNum < daybreaks.length) {
      const targetDaybreak = daybreaks[dayNum];
      newRows = data.rows.map(r => {
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
      newRows = data.rows.map(r => {
        if (data.rowIds.includes(r.id)) {
          return { ...r, containerId: 1, order: maxOrder + 1 + data.rowIds.indexOf(r.id) };
        }
        return r;
      });
      dispatch({ type: 'UPDATE_VERSION', payload: { id: data.versionId, rows: newRows } });
    }
    const scheduledIds = new Set(data.rowIds);
    const remainingBoneyard = data.rows
      .filter(r => getContainerBlock(r) === 'boneyard' && !scheduledIds.has(r.id))
      .sort((a, b) => a.order - b.order);
    if (remainingBoneyard.length > 0) {
      const lastScheduled = data.rows
        .filter(r => data.rowIds.includes(r.id))
        .sort((a, b) => b.order - a.order)[0];
      const next = lastScheduled
        ? remainingBoneyard.find(r => r.order > lastScheduled.order)
        : null;
      const selection = next || remainingBoneyard[0];
      setSelectedRowIds(new Set([selection.id]));
      setLastClickedId(selection.id);
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
      const boneyardSelected = activeVersion.rows.filter(r => selectedRowIds.has(r.id) && getContainerBlock(r) !== 'stripboard');
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
         let newRows = activeVersion.rows.map(r => ({ ...r }));
         newRows = newRows.map(r => {
           if (r.containerId === activeDay) return { ...r, containerId: -1 }; 
           if (r.containerId === overDay) return { ...r, containerId: activeDay };
           return r;
         }).map(r => r.containerId === -1 ? { ...r, containerId: overDay } : r);
         
          dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, rows: newRows } });
      }
      return;
    }

    const activeRow = activeVersion.rows.find(r => r.id === activeId);
    
    if (!activeRow) return;

    let overDay = getDayFromId(overId);
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

    let newRows = activeVersion.rows.map(r => ({ ...r }));
    
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

    dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, rows: newRows } });
  };

  const activeDragRow = useMemo(() => {
    if (!activeId || activeType !== 'ROW') return null;
    const ids = Array.from(activeDragIds.size > 1 ? activeDragIds : [activeId]);
    ids.sort((a, b) => {
      const rA = activeVersion.rows.find(r => r.id === a);
      const rB = activeVersion.rows.find(r => r.id === b);
      if (rA && rB) {
        if (rA.containerId !== rB.containerId) return (rA.containerId || 0) - (rB.containerId || 0);
        return rA.order - rB.order;
      }
      return 0;
    });
    return activeVersion.rows.find(r => r.id === ids[0]) || null;
  }, [activeId, activeType, activeDragIds, activeVersion.rows]);

  const activeDragRows = useMemo(() => {
    if (!activeId || activeType !== 'ROW') return [];
    return activeDragIds.size > 1
      ? Array.from(activeDragIds)
          .sort((a, b) => {
            const rA = activeVersion.rows.find(r => r.id === a);
            const rB = activeVersion.rows.find(r => r.id === b);
            if (rA && rB) {
              if (rA.containerId !== rB.containerId) return (rA.containerId || 0) - (rB.containerId || 0);
              return rA.order - rB.order;
            }
            return 0;
          })
          .map(id => activeVersion.rows.find(r => r.id === id)!)
          .filter(Boolean)
      : [activeDragRow!].filter(Boolean);
  }, [activeId, activeType, activeDragIds, activeVersion.rows, activeDragRow]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <ScheduleToolbar
        shootViolations={shootViolations}
        onShowViolations={() => setShowShootViolations(true)}
        selectionSummary={selectionSummary}
        bufferSummary={bufferSummary}
        dayCount={productionSections.length}
        isCloud={isCloud}
        autoDaybreakOpen={autoDaybreakOpen}
        setAutoDaybreakOpen={setAutoDaybreakOpen}
        handleAutoDaybreak={handleAutoDaybreak}
        handleDeleteAllDaybreaks={handleDeleteAllDaybreaks}
        hasDaybreakDays={hasDaybreakDays}
        bannerMenuOpen={bannerMenuOpen}
        setBannerMenuOpen={setBannerMenuOpen}
        setBannerModalOpen={setBannerModalOpen}
        openBannerDeleteModal={openBannerDeleteModal}
        sortMenuOpen={sortMenuOpen}
        setSortMenuOpen={setSortMenuOpen}
        sortState={{ sortBy, sortDir, lockedCriteria, sortCategories, intExtSortLabel, dayNightSortLabel }}
        handleToggleLock={handleToggleLock}
        handleSort={handleSort}
        handleCustomSort={handleCustomSort}
        ribbonMenuOpen={ribbonMenuOpen}
        setRibbonMenuOpen={setRibbonMenuOpen}
        ribbonDesigns={project.ribbonDesigns}
        activeRibbonId={project.activeRibbonId}
        viewMode={viewMode}
        setViewMode={setViewMode}
        cellBorders={cellBorders}
        setCellBorders={setCellBorders}
        textEditingEnabled={textEditingEnabled}
        setTextEditingEnabled={setTextEditingEnabled}
        readOnly={readOnly}
        onPrint={onPrint}
        onShowHelp={() => setShowHelp(true)}
      />
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
            setBannerMenuOpen(false);
          }}
          onContextMenu={createOnContextMenu()}
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
            if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
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

      <ScheduleOverlays
        activeId={activeId}
        activeDragRow={activeDragRow}
        activeDragIds={activeDragIds}
        activeDragRows={activeDragRows}
        scenes={project.scenes}
        textEditingEnabled={effectiveTextEditingEnabled}
        ribbon={activeRibbon}
        colWidths={activeColWidths}
        cellPaddingV={cellPaddingV}
        cellPaddingH={cellPaddingH}
        edgePadding={edgePadding}
        cellBorders={cellBorders}
        digitBuffer={digitBuffer}
        bufferMs={BUFFER_MS}
        selectionSummary={selectionSummary}
        bufferSummary={bufferSummary}
      />

      {/* Context Menu */}
      <ScheduleContextMenu
        contextMenu={contextMenu}
        setContextMenu={setContextMenu}
        version={activeVersion}
        selectedRowIds={selectedRowIds}
        setSelectedRowIds={setSelectedRowIds}
        setLastClickedId={setLastClickedId}
        scrollToRow={scrollToRow}
        containerIdsRef={containerIdsRef}
        cutSelected={cutSelected}
        pasteClipboard={pasteClipboard}
        handleContextMenuAction={handleContextMenuAction}
        selectNextAfterRemove={selectNextAfterRemove}
        dispatch={dispatch}
        shiftHeld={shiftHeld}
        onOpenScene={onOpenScene}
        onOpenSceneInPopout={onOpenSceneInPopout}
      />

      <ScheduleModals
        colorPicker={colorPicker}
        setColorPicker={setColorPicker}
        palette={state.present.colorPalette}
        applyNoteColor={applyNoteColor}
        autoDaybreakPrompt={autoDaybreakPrompt}
        setAutoDaybreakPrompt={setAutoDaybreakPrompt}
        autoDaybreakRaw={autoDaybreakRaw}
        setAutoDaybreakRaw={setAutoDaybreakRaw}
        normalizeAutoDaybreakRaw={normalizeAutoDaybreakRaw}
        confirmAutoDaybreak={confirmAutoDaybreak}
        autoDaybreakCleanup={autoDaybreakCleanup}
        setAutoDaybreakCleanup={setAutoDaybreakCleanup}
        autoDaybreakNotesAction={autoDaybreakNotesAction}
        setAutoDaybreakNotesAction={setAutoDaybreakNotesAction}
        autoDaybreakBreaksAction={autoDaybreakBreaksAction}
        setAutoDaybreakBreaksAction={setAutoDaybreakBreaksAction}
        executeAutoDaybreak={executeAutoDaybreak}
        daybreakCount={activeVersion?.rows.filter(r => r.type === 'DAYBREAK' && !r.pinned).length ?? 0}
        noteCount={activeVersion?.rows.filter(r => r.containerId !== null && r.type === 'NOTE').length ?? 0}
        breakCount={activeVersion?.rows.filter(r => r.containerId !== null && r.type === 'BREAK').length ?? 0}
        bannerDelete={bannerDelete}
        setBannerDelete={setBannerDelete}
        bannerDeleteEntries={bannerDeleteEntries}
        bannerDeleteChecked={bannerDeleteChecked}
        setBannerDeleteChecked={setBannerDeleteChecked}
        deleteBanners={deleteBanners}
      />
    </DndContext>
  </div>
);
}
