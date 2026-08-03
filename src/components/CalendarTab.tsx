import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { DndContext, useDraggable, DragOverlay, PointerSensor, TouchSensor, useSensor, useSensors, closestCorners, CollisionDetection } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useProject } from '../store';
import { ScheduleRow, Scene, RuleViolation, SceneColorPalette, NonShootDate } from '../types';
import { resolveSceneColor, getNoteBannerColors, getFallbackStripColors } from '../lib/ribbonUtils';
import { ChevronLeft, ChevronRight, Flag, X, Pointer, Eraser, Pause, Plane, Sun, Check, ChevronDown, AlignLeft, StickyNote, Eye, EyeOff, CalendarDays, ClipboardPaste, Coffee } from 'lucide-react';
import { ContextMenu, ContextMenuItem, ContextMenuDivider } from './ContextMenu';
import { StripboardContextMenuContent } from './StripboardContextMenuContent';
import { useStripboardContextMenu } from '../lib/useStripboardContextMenu';
import { checkSection } from '../lib/rulesEngine';
import Modal from './Modal';
import { ModalFooter } from './Modal';
import { useMarquee, MarqueeOverlay, useAddMode, isAddModeActive } from '../lib/useMarquee';
import { useMarqueeMode, getMarqueeMode } from '../lib/useLongPressMenu';
import { IS_COARSE } from '../lib/device';
import { usePersistState } from '../lib/persist';
import { useCurrentWindow, useCurrentDocument } from '../lib/popoutTarget';
import { getLabel, ELEMENT_CATEGORIES, CAT_ICONS, getCustomIcon } from '../lib/categories';
import DropdownMenu from './DropdownMenu';
import DropdownItem from './DropdownItem';
import DropdownDivider from './DropdownDivider';
import DropdownSubmenu from './DropdownSubmenu';
import { compareByCustomOrder, getLockedTiebreakerResult } from './SortDropdown';
import { CustomOrderSortModal, useCustomOrderSort } from './CustomOrderSortModal';
import { useDaybreakSections } from '../lib/useDaybreakSections';
import PageToolbar from './PageToolbar';
import ColorField from './ColorField';
import { DayCell, FillerCell } from './calendar/DayCell';
import { useCalendarKeyboard } from './calendar/useCalendarKeyboard';
import { useCalendarDrag } from './calendar/useCalendarDrag';
import { SceneCardContent } from './calendar/SceneCard';
import { BoneyardSidebar, SIDEBAR_COLLAPSED_KEY } from './calendar/BoneyardSidebar';
import { BoneyardExpandButton } from './BoneyardExpandButton';
import { DayDropState, MonthSlot, MonthTrim, DAY_CELL_HEIGHT, toDateKey, DAY_NAMES, formatFullDate, monthsInRange, estimateMonthHeight, buildMonthSlots, monthTitle } from './calendar/calendarUtils';
const SCROLL_KEY = 'lemon_schedule_calendar_scroll';

export const CalendarTab: React.FC<{ onOpenScene?: (sceneId: string) => void; onOpenSceneInPopout?: (sceneId: string) => void }> = ({ onOpenScene, onOpenSceneInPopout }) => {
  const { state, dispatch } = useProject();
  const currentWindow = useCurrentWindow();
  const project = state.present;
  const activeVersion = project.versions.find(v => v.id === project.activeVersionId);
  const { productionDays, productionSections, sectionDateMap: hookSectionDateMap, productionChronoDayMap } = useDaybreakSections();

  const today = new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(() => activeVersion?.productionStart || today);

  useEffect(() => {
    if (activeVersion?.productionStart) setStartDate(activeVersion.productionStart);
  }, [activeVersion?.productionStart]);

  const containerDay = useMemo(() => {
    if (!activeVersion) return 1;
    const days = activeVersion.rows.filter(r => r.containerId != null).map(r => r.containerId!);
    return days.length > 0 ? Math.min(...days) : 1;
  }, [activeVersion]);

  const updateStartDate = useCallback((d: string) => {
    setStartDate(d);
    if (activeVersion) {
      dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, productionStart: d } });
    }
  }, [activeVersion, dispatch, containerDay]);

  const didInit = useRef(false);
  useEffect(() => {
    if (!activeVersion || didInit.current) return;
    if (activeVersion.productionStart) return;
    didInit.current = true;
    const sd = new Date().toISOString().slice(0, 10);
    updateStartDate(sd);
  }, [activeVersion, updateStartDate]);

  const nonShootDates = useMemo(() => activeVersion?.nonShootDates || [], [activeVersion?.nonShootDates]);

  const [calSettings, setCalSettings] = usePersistState<{ displayField: string; showBreaks: boolean; showConflicts: boolean }>('lemon_schedule_calendar_view', {
    displayField: 'set',
    showBreaks: true,
    showConflicts: true,
  });
  const { displayField, showBreaks, showConflicts } = calSettings;
  const updateCal = (patch: Partial<typeof calSettings>) => setCalSettings(prev => ({ ...prev, ...patch }));

  const [activeDragRow, setActiveDragRow] = useState<ScheduleRow | null>(null);
  const [activeDragDay, setActiveDragDay] = useState<number | null>(null);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [boneyardCollapsed, setBoneyardCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true'; } catch { return false; }
  });
  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(boneyardCollapsed));
  }, [boneyardCollapsed]);
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const [statusModal, setStatusModal] = useState<{ containerId: number; dateKey: string } | null>(null);
  const [modalStatus, setModalStatus] = useState('work');
  const [modalCastIds, setModalCastIds] = useState('');
  const [autoDayOffOpen, setAutoDayOffOpen] = useState(false);
  const [autoDayOffDays, setAutoDayOffDays] = useState<Set<number>>(new Set([5, 6]));

  const handleNonShootToggle = useCallback((dateKey: string, status: 'hold' | 'travel' | 'holiday' | null) => {
    if (!activeVersion) return;
    const current = activeVersion.nonShootDates || [];
    let next: NonShootDate[];
    if (status === null) {
      next = current.filter(ns => ns.date !== dateKey);
    } else {
      const exists = current.find(ns => ns.date === dateKey);
      if (exists) {
        next = current.map(ns => ns.date === dateKey ? { ...ns, status } : ns);
      } else {
        next = [...current, { date: dateKey, status }];
      }
    }
    dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, nonShootDates: next } });
  }, [activeVersion, dispatch]);

  const [contextMenuDate, setContextMenuDate] = useState<string | null>(null);
  const [contextMenuBodyTarget, setContextMenuBodyTarget] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [activeDragIds, setActiveDragIds] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [insertBeforeId, setInsertBeforeId] = useState<string | null>(null);
  const [lastClickedId, setLastClickedId] = useState<string | null>(null);
  const [dayDropState, setDayDropState] = useState<DayDropState>(null);
  const dragPointerRef = useRef<{ x: number; y: number } | null>(null);
  const [flashSections, setFlashSections] = useState<Map<number, 'a' | 'b'>>(new Map());
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashDays = useCallback((entries: [number, 'a' | 'b'][]) => {
    setFlashSections(new Map(entries));
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setFlashSections(new Map()), 900);
  }, []);
  useEffect(() => () => { if (flashTimerRef.current) clearTimeout(flashTimerRef.current); }, []);

  const activeDragIdsRef = useRef(activeDragIds);
  activeDragIdsRef.current = activeDragIds;
  const selectedRowIdsRef = useRef(selectedRowIds);
  selectedRowIdsRef.current = selectedRowIds;
  const lastClickedIdRef = useRef(lastClickedId);
  lastClickedIdRef.current = lastClickedId;
  const boneyardFlatRef = useRef<string[]>([]);

  const collisionDetection = useCallback<CollisionDetection>((args) => {
    const { pointerCoordinates, droppableContainers } = args;
    const filteredContainers = droppableContainers.filter((container) => {
      if (activeDragIdsRef.current.has(container.id as string)) return false;
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
  const marqueeMode = useMarqueeMode();
  const calendarGridRef = useRef<HTMLDivElement>(null);
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
  const { marqueeBox, justEndedRef: marqueeJustEndedRef } = useMarquee(
    calendarGridRef,
    useCallback((ids) => {
      const filtered = new Set([...ids].filter(id => !id.startsWith('empty-') && !id.startsWith('empty-date-')));
      setSelectedRowIds(prev => isAddModeActive() ? new Set([...prev, ...filtered]) : filtered);
    }, []),
    true,
  );

  const sensors = useSensors(
    IS_COARSE
      ? useSensor(TouchSensor, {
          activationConstraint: activeTool || ctrlOrCmdHeld || marqueeMode !== 'off'
            ? { delay: 999999, tolerance: 0 }
            : { delay: 200, tolerance: 5 }
        })
      : useSensor(PointerSensor, {
          activationConstraint: { distance: activeTool ? 999999 : (ctrlOrCmdHeld || marqueeMode !== 'off' ? 999999 : 3) }
        })
  );

  const lastProductionDate = useMemo(() => {
    let lastDate: string | null = null;
    for (const d of hookSectionDateMap.values()) {
      if (!lastDate || d > lastDate) lastDate = d;
    }
    return lastDate;
  }, [hookSectionDateMap]);

  const calendarMonths = useMemo(() => {
    const start = new Date(startDate + 'T00:00:00');
    const end = lastProductionDate ? new Date(lastProductionDate + 'T00:00:00') : new Date(start);
    return monthsInRange(start.getFullYear(), start.getMonth(), end.getFullYear(), end.getMonth());
  }, [startDate, lastProductionDate]);

  const days = useMemo(() => {
    const out: { date: Date; dateKey: string; isToday: boolean }[] = [];
    for (const m of calendarMonths) {
      for (const slot of buildMonthSlots(m.year, m.month)) {
        if (slot.filler) continue;
        const day = slot as Extract<MonthSlot, { filler: false }>;
        out.push({ date: day.date, dateKey: day.dateKey, isToday: day.isToday });
      }
    }
    return out;
  }, [calendarMonths]);

  const rangeLabel = useMemo(() => {
    if (calendarMonths.length === 0) return '';
    const first = calendarMonths[0];
    const last = calendarMonths[calendarMonths.length - 1];
    const f = new Date(first.year, first.month, 1).toLocaleString('en-US', { month: 'short', year: 'numeric' });
    const l = new Date(last.year, last.month, 1).toLocaleString('en-US', { month: 'short', year: 'numeric' });
    return first.year === last.year && first.month === last.month ? f : `${f} - ${l}`;
  }, [calendarMonths]);

  const openAutoDayOff = useCallback(() => {
    setAutoDayOffOpen(true);
  }, []);

  const handleApplyAutoDaysOff = useCallback(() => {
    if (!activeVersion || days.length === 0) return;
    const from = days[0].dateKey;
    const to = days[days.length - 1].dateKey;
    const fromDate = new Date(from + 'T00:00:00');
    const toDate = new Date(to + 'T00:00:00');
    const current = activeVersion.nonShootDates || [];
    const targetDates = new Set<string>();
    const cursor = new Date(fromDate);
    while (cursor <= toDate) {
      const jsDay = cursor.getDay();
      const monBased = jsDay === 0 ? 6 : jsDay - 1;
      if (autoDayOffDays.has(monBased)) {
        targetDates.add(toDateKey(cursor));
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    let next = current.filter(ns => {
      if (ns.date < from || ns.date > to) return true;
      return targetDates.has(ns.date);
    });
    for (const date of targetDates) {
      if (!next.find(ns => ns.date === date)) {
        next.push({ date, status: 'holiday' as const });
      }
    }
    dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, nonShootDates: next } });
    setAutoDayOffOpen(false);
  }, [activeVersion, days, autoDayOffDays, dispatch]);

  const nonShootDateMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const ns of nonShootDates) m.set(ns.date, ns.status);
    return m;
  }, [nonShootDates]);

  const sectionDateMap = hookSectionDateMap;
  const chronoDayMap = productionChronoDayMap;
  const sections = productionDays;
  const calendarSections = productionSections;

  const availableFields = useMemo(() => {
    const hiddenSet = new Set(project.hiddenCategories || []);
    const fields: { key: string; label: string }[] = [
      { key: 'description', label: 'Description' },
    ];
    for (const cat of ELEMENT_CATEGORIES) {
      if (!hiddenSet.has(cat.key)) {
        fields.push({ key: cat.key, label: getLabel(cat.key, cat.label, project.categoryLabels) });
      }
    }
    for (const cat of project.customCategories || []) {
      if (!hiddenSet.has(cat.key)) {
        fields.push({ key: cat.key, label: cat.label });
      }
    }
    return fields;
  }, [project.hiddenCategories, project.customCategories, project.categoryLabels]);

  const violationMap = useMemo(() => {
    const m = new Map<string, RuleViolation[]>();
    if (!activeVersion || !showConflicts) return m;
    const firstDaybreak = activeVersion.rows.find(r => r.type === 'DAYBREAK');
    let baseTime = firstDaybreak?.daybreakCallTime || '08:00';
    for (const s of sections) {
      const dateKey = sectionDateMap.get(s.index);
      if (!dateKey) continue;
      const v = checkSection(s.rows, dateKey, baseTime, project.rules || [], project.scenes, project.castMembers || []);
      if (v.length > 0) m.set(dateKey, v);
      baseTime = s.daybreakRow?.daybreakCallTime || baseTime;
    }
    return m;
  }, [activeVersion, project.rules, project.scenes, project.castMembers, showConflicts, sections, sectionDateMap]);

  const sceneViolationMap = useMemo(() => {
    const m = new Map<string, RuleViolation[]>();
    for (const [, violations] of violationMap) {
      for (const v of violations) {
        const ids = v.sceneIds || (v.sceneId ? [v.sceneId] : []);
        for (const sid of ids) {
          if (!m.has(sid)) m.set(sid, []);
          m.get(sid)!.push(v);
        }
      }
    }
    return m;
  }, [violationMap]);

  const [focusedRowId, setFocusedRowId] = useState<string | null>(null);
  const [colorPicker, setColorPicker] = useState<{ rowId: string; bg: string; text: string; noteText: string; originalBg: string; originalText: string; originalNoteText: string } | null>(null);

  const scrollToRow = useCallback((rowId: string) => {
    const el = document.querySelector(`[data-row-id="${rowId}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, []);

  const {
    contextMenu,
    setContextMenu,
    inClipboard,
    cutSelected,
    pasteClipboard,
    handleContextMenuAction,
    createOnContextMenu,
    selectNextAfterRemove,
  } = useStripboardContextMenu({
    selectedRowIds,
    setSelectedRowIds,
    rows: (activeVersion?.rows || []),
    activeVersion,
    activeDragIds,
    textEditingEnabled: false,
    dispatch,
    setFocusedRowId,
    scrollToRow,
    setColorPicker,
    project,
  });

  const handleRowContextMenu = useCallback((e: React.MouseEvent) => {
    setContextMenuDate(null);
    setContextMenuBodyTarget(null);
    (createOnContextMenu()(e));
  }, [createOnContextMenu]);

  const rowsByDate = useMemo(() => {
    const map = new Map<string, ScheduleRow[]>();
    if (!activeVersion) return map;
    for (const s of sections) {
      const dateKey = sectionDateMap.get(s.index);
      if (!dateKey) continue;
      const allRows = s.rows.filter(r => {
        if (r.containerId === -1) return false;
        if (activeDragIds.has(r.id)) return false;
        if (!showBreaks && (r.type === 'BREAK' || r.type === 'NOTE' || r.type === 'DAYBREAK')) return false;
        return true;
      });
      if (!map.has(dateKey)) map.set(dateKey, []);
      map.get(dateKey)!.push(...allRows);
    }
    return map;
  }, [sections, sectionDateMap, activeDragIds, showBreaks, activeVersion]);

  const dateSectionMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const [k, v] of sectionDateMap) m.set(v, k);
    return m;
  }, [sectionDateMap]);

  const sectionRowIds = useMemo(() => new Set(sections.flatMap(s => s.rows.map(r => r.id))), [sections]);

  const boneyardRows = useMemo(() => {
    return (activeVersion?.rows || []).filter(r => {
      if (activeDragIds.has(r.id)) return false;
      if (r.containerId === -1) return false;
      if (!showBreaks && (r.type === 'BREAK' || r.type === 'NOTE' || r.type === 'DAYBREAK')) return false;
      if (r.containerId === null && r.type !== 'DAYBREAK') return true;
      if (r.containerId != null && !sectionRowIds.has(r.id) && r.type !== 'DAYBREAK') return true;
      return false;
    }).sort((a, b) => a.order - b.order);
  }, [(activeVersion?.rows || []), activeDragIds, showBreaks, sectionRowIds]);

  boneyardFlatRef.current = boneyardRows.map(r => r.id);

  const handleToggle = useCallback((dateKey: string) => {
    if (activeTool) {
      if (activeTool === 'remove') {
        handleNonShootToggle(dateKey, null);
      } else {
        handleNonShootToggle(dateKey, activeTool as 'hold' | 'travel' | 'holiday');
      }
      return;
    }
  }, [handleNonShootToggle, activeTool]);

  const sortBoneyard = useCallback((criterion: string, direction: 'asc' | 'desc') => {
    if (!activeVersion) return;
    const scheduled = activeVersion.rows.filter(r => r.containerId !== null);
    const boneyard: ScheduleRow[] = activeVersion.rows.filter(r => r.containerId === null);
    const sign = direction === 'desc' ? -1 : 1;
    boneyard.sort((a, b) => {
      if (a.type !== 'SCENE' && b.type === 'SCENE') return 1;
      if (a.type === 'SCENE' && b.type !== 'SCENE') return -1;
      if (a.type !== 'SCENE' && b.type !== 'SCENE') return 0;
      const sA = project.scenes.find(s => s.id === a.sceneId);
      const sB = project.scenes.find(s => s.id === b.sceneId);
      if (!sA || !sB) return 0;

      const locks = lockedCriteriaRef.current.filter(l => l !== criterion);
      if (locks.length > 0) {
        const tie = getLockedTiebreakerResult(locks, '', sA, sB, customSortOrdersRef.current, a.estimatedDuration, b.estimatedDuration);
        if (tie !== 0) return tie;
      }

      let cmp = 0;
      if (criterion === 'scene_number') cmp = sA.sceneNumber.localeCompare(sB.sceneNumber, undefined, { numeric: true, sensitivity: 'base' }) * sign;
      else if (criterion === 'script_day') cmp = sA.scriptDay.localeCompare(sB.scriptDay, undefined, { numeric: true, sensitivity: 'base' }) * sign;
      else if (criterion === 'page_count') cmp = ((sA.pageCountDecimal || 0) - (sB.pageCountDecimal || 0)) * sign;
      else if (criterion === 'duration') cmp = ((a.estimatedDuration || 0) - (b.estimatedDuration || 0)) * sign;
      else if (criterion === 'int_ext') {
        const customCmp = customSortOrdersRef.current['int_ext'] ? compareByCustomOrder(customSortOrdersRef.current['int_ext'], s => s.intExt) : null;
        if (customCmp) cmp = customCmp(sA, sB);
        else cmp = ((sA.intExt || '') as string).localeCompare((sB.intExt || '') as string) * sign;
      } else if (criterion === 'day_night') {
        const customCmp = customSortOrdersRef.current['day_night'] ? compareByCustomOrder(customSortOrdersRef.current['day_night'], s => s.dayNight) : null;
        if (customCmp) cmp = customCmp(sA, sB);
        else cmp = ((sA.dayNight || '') as string).localeCompare((sB.dayNight || '') as string) * sign;
      } else if (criterion === 'set_name' || criterion === 'set') cmp = sA.set.localeCompare(sB.set) * sign;
      else {
        const valA = String((sA as any)?.[criterion] ?? '');
        const valB = String((sB as any)?.[criterion] ?? '');
        cmp = valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' }) * sign;
      }

      return cmp;
    });
    const combined = [...scheduled, ...boneyard];
    const finalRows = combined.map((r, i) => ({ ...r, order: i }));
    dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, rows: finalRows } });
  }, [activeVersion, project.scenes, dispatch]);

  const sortCategoryEntries = useMemo(() => {
    const cats = ELEMENT_CATEGORIES.map(c => ({ key: c.key, label: c.label, icon: CAT_ICONS[c.key] ? React.createElement(CAT_ICONS[c.key], { className: 'w-3.5 h-3.5' }) : undefined }));
    for (const cc of project.customCategories) {
      const Icon = getCustomIcon(cc.icon || 'Tag');
      cats.push({ key: cc.key, label: cc.label, icon: React.createElement(Icon, { className: 'w-3.5 h-3.5' }) });
    }
    return cats;
  }, [project.customCategories]);

  const [calSortBy, setCalSortBy] = useState<string | null>(null);
  const [calSortDir, setCalSortDir] = useState<'asc' | 'desc'>('asc');
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

  const handleCustomSort = useCallback((criterion: string) => {
    const isIntExt = criterion === 'int_ext';
    const options = isIntExt
      ? (project.colorPalette?.intExtOptions || ['INT', 'EXT', 'INT/EXT'])
      : (project.colorPalette?.dayNightOptions || ['DAY', 'NIGHT', 'MORNING', 'EVENING']);
    const title = options.slice(0, 2).join(' / ');
    openCustomOrderModal(criterion, title, options);
  }, [project.colorPalette, openCustomOrderModal]);

  const handleCustomOrderSort = useCallback((criterion: string, order: string[]) => {
    setCalSortBy(criterion);
    setCalSortDir('asc');
    const next = { ...customSortOrders, [criterion]: order };
    setCustomSortOrders(next);
    customSortOrdersRef.current = next;
    sortBoneyard(criterion, 'asc');
  }, [customSortOrders, sortBoneyard]);

  const intExtSortLabel = useMemo(() => {
    const opts = project.colorPalette?.intExtOptions;
    return opts?.length ? opts.slice(0, 2).join(' / ') : undefined;
  }, [project.colorPalette?.intExtOptions]);

  const dayNightSortLabel = useMemo(() => {
    const opts = project.colorPalette?.dayNightOptions;
    return opts?.length ? opts.slice(0, 2).join(' / ') : undefined;
  }, [project.colorPalette?.dayNightOptions]);

  const handleCalSort = useCallback((criterion: string, direction: 'asc' | 'desc') => {
    setCalSortBy(criterion);
    setCalSortDir(direction);
    sortBoneyard(criterion, direction);
  }, [sortBoneyard]);

  const handleRowClick = (id: string, e: React.MouseEvent) => {
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
    } else if (e.shiftKey && lastClickedId) {
      e.stopPropagation();
      const clickedRow = activeVersion?.rows.find(r => r.id === id);
      const anchorRow = activeVersion?.rows.find(r => r.id === lastClickedId);
      const isBoneyard = (clickedRow && (clickedRow.containerId === null || clickedRow.containerId === -1)) ||
        (anchorRow && (anchorRow.containerId === null || anchorRow.containerId === -1));
      const allIds = isBoneyard ? boneyardFlatRef.current : (activeVersion?.rows || []).map(r => r.id);
      const idxA = allIds.indexOf(lastClickedId);
      const idxB = allIds.indexOf(id);
      if (idxA >= 0 && idxB >= 0) setSelectedRowIds(new Set(allIds.slice(Math.min(idxA, idxB), Math.max(idxA, idxB) + 1)));
    } else {
      e.stopPropagation();
      setSelectedRowIds(new Set([id]));
      setLastClickedId(id);
    }
  };

  const handleRowDoubleClick = useCallback((id: string, shiftKey?: boolean) => {
    if (marqueeMode !== 'off') return;
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
      const rowEl = activeEl.closest(`[data-row-id="${id}"]`);
      if (rowEl) return;
    }
    const row = activeVersion?.rows.find(r => r.id === id);
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

  const applyNoteColor = useCallback(() => {
    if (!colorPicker || !activeVersion) return;
    const newRows = activeVersion.rows.map(r =>
      r.id === colorPicker.rowId ? { ...r, noteColor: colorPicker.bg, noteTextColor: colorPicker.text, noteText: colorPicker.noteText } : r
    );
    dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, rows: newRows } });
    setColorPicker(null);
  }, [colorPicker, activeVersion, dispatch]);

  const { activeType, handleDragStart, handleDragOver, handleDragEnd } = useCalendarDrag({
    activeId, setActiveId,
    activeDragDay, setActiveDragDay,
    activeDragRow, setActiveDragRow,
    activeDragIds, setActiveDragIds,
    insertBeforeId, setInsertBeforeId,
    dayDropState, setDayDropState,
    setSelectedRowIds,
    selectedRowIdsRef,
    calendarGridRef,
    dragPointerRef,
    activeVersion,
    sections,
    dateSectionMap,
    sectionDateMap,
    nonShootDateMap,
    flashDays,
    dispatch,
  });

  const activeDragRows = useMemo(() => {
    if (!activeId || activeType !== 'SCENE_CARD') return [];
    return activeDragIds.size > 1
      ? Array.from(activeDragIds)
          .sort((a, b) => {
            const rA = (activeVersion?.rows || []).find(r => r.id === a);
            const rB = (activeVersion?.rows || []).find(r => r.id === b);
            if (rA && rB) {
              if (rA.containerId !== rB.containerId) return (rA.containerId || 0) - (rB.containerId || 0);
              return rA.order - rB.order;
            }
            return 0;
          })
          .map(id => (activeVersion?.rows || []).find(r => r.id === id)!)
          .filter(Boolean)
      : [(activeVersion?.rows || []).find(r => r.id === activeId)!].filter(Boolean);
  }, [activeId, activeType, activeDragIds, (activeVersion?.rows || [])]);

  const [renderWindow, setRenderWindow] = useState({ start: 0, end: 2 });
  const [measuredHeights, setMeasuredHeights] = useState<Record<string, number>>({});

  const updateRenderWindow = useCallback(() => {
    const el = calendarGridRef.current;
    if (!el) return;
    const monthEls = el.querySelectorAll('[data-cal-month]');
    if (monthEls.length === 0) return;
    const viewTop = el.scrollTop - el.clientHeight;
    const viewBottom = el.scrollTop + el.clientHeight * 2;
    let start = -1;
    let end = -1;
    monthEls.forEach((m, i) => {
      const top = (m as HTMLElement).offsetTop;
      const bottom = top + (m as HTMLElement).offsetHeight;
      if (bottom >= viewTop && top <= viewBottom) {
        if (start === -1) start = i;
        end = i;
      }
    });
    if (start === -1 || end === -1) return;
    setRenderWindow(prev => (prev.start === start && prev.end === end ? prev : { start, end }));
  }, []);

  useEffect(() => {
    updateRenderWindow();
  }, [calendarMonths, updateRenderWindow]);

  useEffect(() => {
    setMeasuredHeights({});
  }, [sectionDateMap, project.scenes, showBreaks]);

  const smoothScrollTo = useCallback((targetTop: number) => {
    const el = calendarGridRef.current;
    if (!el) return;
    const start = el.scrollTop;
    const delta = targetTop - start;
    if (Math.abs(delta) < 2) return;
    const duration = Math.min(350, Math.max(180, Math.abs(delta) * 0.4));
    const t0 = performance.now();
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      el.scrollTop = start + delta * ease(p);
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, []);

  const scrollToMonthIndex = useCallback((index: number) => {
    if (index < 0 || index >= calendarMonths.length) return;
    setRenderWindow({
      start: Math.max(0, index - 1),
      end: Math.min(calendarMonths.length - 1, index + 1),
    });
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const container = calendarGridRef.current;
      if (!container) return;
      const el = container.querySelectorAll('[data-cal-month]')[index] as HTMLElement | undefined;
      if (!el) return;
      const stickyEl = container.querySelector('[data-cal-sticky]');
      const stickyH = stickyEl instanceof HTMLElement ? stickyEl.offsetHeight : 28;
      smoothScrollTo(el.offsetTop - stickyH - 6);
    }));
  }, [calendarMonths, smoothScrollTo]);

  const goPrevMonth = useCallback(() => scrollToMonthIndex(Math.max(0, renderWindow.start - 1)), [scrollToMonthIndex, renderWindow.start]);
  const goNextMonth = useCallback(() => scrollToMonthIndex(Math.min(calendarMonths.length - 1, renderWindow.end + 1)), [scrollToMonthIndex, renderWindow.end, calendarMonths.length]);

  const goToday = useCallback(() => {
    const now = new Date();
    const mi = calendarMonths.findIndex(m => m.year === now.getFullYear() && m.month === now.getMonth());
    if (mi === -1) {
      const todayKey = toDateKey(now);
      if (days.length > 0 && todayKey < days[0].dateKey) scrollToMonthIndex(0);
      else scrollToMonthIndex(calendarMonths.length - 1);
      return;
    }
    setRenderWindow({
      start: Math.max(0, mi - 1),
      end: Math.min(calendarMonths.length - 1, mi + 1),
    });
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const container = calendarGridRef.current;
      if (!container) return;
      const el = container.querySelector(`[data-date-key="${toDateKey(now)}"]`) as HTMLElement | undefined;
      if (!el) return;
      const target = el.offsetTop - Math.max(0, (container.clientHeight - el.offsetHeight) / 2);
      smoothScrollTo(target);
    }));
  }, [calendarMonths, days, scrollToMonthIndex, smoothScrollTo]);

  const lastScrollSaveRef = useRef(0);
  const saveScrollPos = useCallback((top: number) => {
    const now = Date.now();
    if (now - lastScrollSaveRef.current < 200) return;
    lastScrollSaveRef.current = now;
    localStorage.setItem(SCROLL_KEY, String(Math.round(top)));
  }, []);

  const scrollRestoredRef = useRef(false);
  useEffect(() => {
    const el = calendarGridRef.current;
    if (!el || scrollRestoredRef.current) return;
    const saved = Number(localStorage.getItem(SCROLL_KEY) || '0');
    if (saved > 0) {
      scrollRestoredRef.current = true;
      el.scrollTop = saved;
    }
  }, [calendarMonths]);

  useCalendarKeyboard({
    currentWindow,
    setSelectedRowIds,
    setLastClickedId,
    selectedRowIdsRef,
    lastClickedIdRef,
    boneyardFlatRef,
    scrollToRow,
    activeVersion,
    dispatch,
    cutSelected,
    pasteClipboard,
    selectNextAfterRemove,
    setColorPicker,
    palette: state.present.colorPalette,
    onOpenScene,
    onOpenSceneInPopout,
  });

  if (!activeVersion) return <div className="p-8 text-zinc-500">No active version</div>;

  return (
    <>
    <style>{`
      @keyframes cal-day-flash {
        0% { background-color: rgba(59,130,246,0.55); }
        25% { background-color: rgba(59,130,246,0.55); }
        100% { background-color: rgba(59,130,246,0); }
      }
      @keyframes cal-day-flash-b {
        0% { background-color: rgba(16,185,129,0.55); }
        25% { background-color: rgba(16,185,129,0.55); }
        100% { background-color: rgba(16,185,129,0); }
      }
      .cal-day-flash {
        animation: cal-day-flash 0.9s ease-out;
      }
      .cal-day-flash-b {
        animation: cal-day-flash-b 0.9s ease-out;
      }
    `}</style>
    <DndContext sensors={sensors} collisionDetection={collisionDetection} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd} onDragCancel={() => {
      setActiveId(null);
      setActiveDragRow(null);
      setActiveDragDay(null);
      setActiveDragIds(new Set());
      setInsertBeforeId(null);
      setDayDropState(null);
    }}>
      <div className="flex-1 flex overflow-hidden min-h-0" style={{ fontFamily: 'Helvetica, sans-serif', fontSize: '11px' }}
        onClick={(e) => {
          if (marqueeJustEndedRef.current) { marqueeJustEndedRef.current = false; return; }
          if ((e.target as HTMLElement).closest('[data-row-id], button, input, select, [role="button"], [role="menuitem"]')) return;
          setSelectedRowIds(new Set());
          setViewMenuOpen(false);
          setContextMenuDate(null);
          setContextMenu(null);
        }}
      >
        <BoneyardSidebar rows={boneyardRows} scenes={project.scenes} displayField={displayField} sceneViolationMap={sceneViolationMap} collapsed={boneyardCollapsed} onToggleCollapsed={() => setBoneyardCollapsed(v => !v)} activeDragRows={activeDragRows} insertBeforeId={insertBeforeId} activeRowId={activeId} activeDragIds={activeDragIds} selectedIds={selectedRowIds} onRowClick={handleRowClick} onSort={handleCalSort} onCustomSort={handleCustomSort} sortBy={calSortBy} sortDir={calSortDir} lockedCriteria={lockedCriteria} onToggleLock={handleToggleLock} sortCategories={sortCategoryEntries} intExtSortLabel={intExtSortLabel} dayNightSortLabel={dayNightSortLabel} onRowDoubleClick={handleRowDoubleClick} onRowContextMenu={handleRowContextMenu} />
        <div data-marquee-tool-only className="flex-1 flex flex-col overflow-hidden">
          <PageToolbar theme="light" justify="between"
            children={
              <div className="flex items-center gap-2">
                {boneyardCollapsed && (
                  <BoneyardExpandButton onClick={() => setBoneyardCollapsed(false)} />
                )}
                <button onClick={goPrevMonth} title="Previous month" className="p-1 hover:bg-zinc-100 rounded"><ChevronLeft className="w-4 h-4" /></button>
                <h2 className="font-semibold text-sm whitespace-nowrap">{rangeLabel}</h2>
                <button onClick={goNextMonth} title="Next month" className="p-1 hover:bg-zinc-100 rounded"><ChevronRight className="w-4 h-4" /></button>
                <button onClick={goToday} title="Jump to today" className="px-2 py-1 rounded text-[10px] font-semibold text-zinc-500 hover:bg-zinc-100 transition-colors">
                  Today
                </button>
                <span className="text-zinc-400">|</span>
                <span className="text-[10px] font-semibold text-zinc-500">START</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => updateStartDate(e.target.value)}
                  className="text-[10px] font-semibold px-2 rounded border border-zinc-300 bg-white cursor-pointer h-[25px]"
                />
              </div>
            }
            rightContent={
              <div className="flex items-center gap-3">
                <button
                  onClick={openAutoDayOff}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer select-none hover:bg-zinc-200 text-zinc-600"
                >
                  <CalendarDays className="w-3.5 h-3.5" />
                  Days Off
                </button>
                <DropdownMenu
                  open={viewMenuOpen}
                  onOpenChange={setViewMenuOpen}
                  width="w-48"
                  theme="light"
                  trigger={
                    <button className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer select-none hover:bg-zinc-200 text-zinc-600">
                      View
                      <ChevronDown className="w-3 h-3 shrink-0 text-zinc-500" />
                    </button>
                  }
                >
                  <DropdownSubmenu id="display-field" label="Display Field" side="left" width="w-44" icon={<AlignLeft className="w-3.5 h-3.5" />}>
                    {availableFields.map(f => {
                      const Icon = f.key === 'description' ? AlignLeft : CAT_ICONS[f.key] || getCustomIcon((project.customCategories || []).find(c => c.key === f.key)?.icon || 'Tag');
                      return (
                        <DropdownItem
                          key={f.key}
                          onClick={() => { updateCal({ displayField: f.key }); setViewMenuOpen(false); }}
                          icon={Icon ? <Icon className="w-3.5 h-3.5" /> : undefined}
                        >
                          <span className="flex-1">{f.label}</span>
                          {displayField === f.key && <Check className="w-3.5 h-3.5 shrink-0" />}
                        </DropdownItem>
                      );
                    })}
                  </DropdownSubmenu>
                  <DropdownDivider />
                  <button
                    onClick={() => updateCal({ showBreaks: !showBreaks })}
                    className="w-full text-left px-3 py-2 rounded flex items-center justify-between gap-2 text-xs transition-colors outline-none cursor-pointer select-none text-zinc-700 hover:bg-zinc-100"
                  >
                    <span className="flex items-center gap-2">
                      <StickyNote className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                      Breaks &amp; Notes
                    </span>
                    {showBreaks ? <Eye className="w-3.5 h-3.5 text-zinc-500 shrink-0" /> : <EyeOff className="w-3.5 h-3.5 text-zinc-400 shrink-0" />}
                  </button>
                  <button
                    onClick={() => updateCal({ showConflicts: !showConflicts })}
                    className="w-full text-left px-3 py-2 rounded flex items-center justify-between gap-2 text-xs transition-colors outline-none cursor-pointer select-none text-zinc-700 hover:bg-zinc-100"
                  >
                    <span className="flex items-center gap-2">
                      <Flag className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                      Conflicts
                    </span>
                    {showConflicts ? <Eye className="w-3.5 h-3.5 text-zinc-500 shrink-0" /> : <EyeOff className="w-3.5 h-3.5 text-zinc-400 shrink-0" />}
                  </button>
                </DropdownMenu>
              </div>
            }
          />
          <PageToolbar theme="light" justify="start">
            {[
              { key: null, label: <Pointer className="w-3 h-3" />, title: 'Select' },
              { key: 'hold', label: 'H', title: 'Hold' },
              { key: 'travel', label: 'T', title: 'Travel' },
              { key: 'holiday', label: 'DO', title: 'Day Off' },
              { key: 'remove', label: <Eraser className="w-3 h-3" />, title: 'Erase' },
            ].map(t => (
              <button key={t.key || 'none'} type="button"
                onClick={() => setActiveTool(prev => prev === t.key ? null : t.key)}
                title={t.title}
                className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${activeTool === t.key ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:bg-zinc-100'}`}
              >{t.label}</button>
            ))}
          </PageToolbar>
          <div ref={calendarGridRef} onClick={(e) => {
            if (marqueeJustEndedRef.current || (e.target as HTMLElement).closest('[data-row-id]')) return;
            setSelectedRowIds(new Set());
            setViewMenuOpen(false);
            setContextMenuDate(null);
            setContextMenu(null);
          }} onScroll={() => { updateRenderWindow(); if (calendarGridRef.current) saveScrollPos(calendarGridRef.current.scrollTop); }} className="flex-1 overflow-y-auto min-h-0 relative overscroll-contain" style={{ touchAction: IS_COARSE ? 'pan-y pan-x' : undefined }}>
            <div className="grid grid-cols-7 sticky top-0 z-10 border-l border-t border-zinc-200 bg-zinc-50" data-cal-sticky>
              {DAY_NAMES.map(n => <div key={n} className="text-center text-[10px] font-semibold text-zinc-500 py-1.5 border-r border-b border-zinc-200 bg-zinc-50">{n}</div>)}
            </div>
            <MarqueeOverlay box={marqueeBox} />
            {calendarMonths.map((m, mi) => {
              const key = `${m.year}-${m.month}`;
              const trim: MonthTrim | undefined = mi === 0 || mi === calendarMonths.length - 1
                ? { startKey: mi === 0 ? startDate : undefined, endKey: mi === calendarMonths.length - 1 ? (lastProductionDate ?? undefined) : undefined }
                : undefined;
              const inWindow = mi >= renderWindow.start && mi <= renderWindow.end;
              const cached = measuredHeights[key];
              const est = estimateMonthHeight(m.year, m.month, trim);
              if (!inWindow) {
                return (
                  <div key={key} data-cal-month className="border-l border-t border-zinc-200 bg-white flex items-center justify-center"
                    style={{ height: cached ?? est }}>
                    <span className="text-[11px] font-semibold text-zinc-300">{monthTitle(m.year, m.month)}</span>
                  </div>
                );
              }
              return (
                <div key={key} data-cal-month
                  ref={(el) => {
                    if (!el) return;
                    const h = el.offsetHeight;
                    if (h > 0 && measuredHeights[key] !== h) {
                      setMeasuredHeights(prev => (prev[key] === h ? prev : { ...prev, [key]: h }));
                    }
                  }}
                >
                  <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider px-2 py-1 border-l border-t border-r border-zinc-200 bg-zinc-100">
                    {monthTitle(m.year, m.month)}
                  </div>
                  <div className="grid grid-cols-7 border-l border-t border-zinc-200" style={{ gridAutoRows: DAY_CELL_HEIGHT }}>
                    {buildMonthSlots(m.year, m.month, trim).map(slot => {
                      if (slot.filler) return <FillerCell key={slot.key} />;
                      const day = slot as Extract<MonthSlot, { filler: false }>;
                      const dateSectionIdx = dateSectionMap.get(day.dateKey) ?? null;
                      const chronoDay = dateSectionIdx != null ? chronoDayMap.get(dateSectionIdx) : undefined;
                      const sectionLabel = chronoDay ? `DAY ${chronoDay}` : undefined;
                      let bodyTargetRowId: string | null = null;
                      if (dateSectionIdx != null) {
                        const section = sections.find(s => s.index === dateSectionIdx);
                        if (section) {
                          const sRows = [...section.rows].sort((a, b) => a.order - b.order);
                          bodyTargetRowId = sRows.length > 0
                            ? sRows[sRows.length - 1].id
                            : section.daybreakRow
                              ? (() => {
                                  const flatRows = (activeVersion?.rows || []);
                                  const di = flatRows.findIndex(r => r.id === section.daybreakRow!.id);
                                  return di > 0 ? flatRows[di - 1].id : section.daybreakRow!.id;
                                })()
                              : null;
                        }
                      }
                      return (
                        <DayCell key={day.dateKey}
                          dateKey={day.dateKey} date={day.date} isToday={day.isToday}
                          nonShootStatus={nonShootDateMap.get(day.dateKey)}
                          sectionIndex={dateSectionIdx ?? undefined}
                          sectionLabel={sectionLabel}
                          activeTool={activeTool}
                          onContextMenu={(e, dateKey) => {
                            setContextMenuDate(dateKey);
                            setContextMenu({ x: e.clientX, y: e.clientY, rowId: '', containerId: null });
                          }}
                          rows={rowsByDate.get(day.dateKey) || []} scenes={project.scenes}
                          displayField={displayField}
                          violations={violationMap.get(day.dateKey) || []}
                          sceneViolationMap={sceneViolationMap}
                          onToggle={handleToggle}
                          selectedIds={selectedRowIds}
                          activeDragIds={activeDragIds}
                          onRowClick={handleRowClick}
                          insertBeforeId={insertBeforeId}
                          activeDragRow={activeDragRow}
                          activeDragRows={activeDragRows}
                          activeRowId={activeId}
                          activeDragDay={activeDragDay}
                          dropState={dayDropState}
                          flashColor={dateSectionIdx != null ? (flashSections.get(dateSectionIdx) ?? undefined) : undefined}
                          onRowDoubleClick={handleRowDoubleClick}
                          onRowContextMenu={handleRowContextMenu}
                          bodyTargetRowId={bodyTargetRowId}
                          onBodyContextMenu={(e, targetRowId) => {
                            setContextMenuDate(null);
                            setContextMenuBodyTarget(targetRowId);
                            setContextMenu({ x: e.clientX, y: e.clientY, rowId: targetRowId, containerId: 1 });
                          }}
                          palette={project.colorPalette}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <DragOverlay dropAnimation={null} style={{ pointerEvents: 'none' }}>
        {activeType === 'DAY' && activeDragDay != null ? (
          <div className="bg-zinc-900 text-white rounded px-3 py-2 shadow-xl opacity-90">
            <div className="text-[11px] font-bold uppercase tracking-wider">{sections[activeDragDay] ? `DAY ${(chronoDayMap.get(activeDragDay) ?? 0)}` : ''}</div>
            <div className="text-[9px] text-zinc-400">{sections[activeDragDay]?.rows.length ?? 0} strips</div>
          </div>
        ) : null}
        {activeDragRows.length > 0 ? (
          <div className="flex flex-col gap-0.5 opacity-90">
            {activeDragRows.slice(0, 3).map(r => (
              <SceneCardContent key={r.id} row={r} scene={project.scenes.find(s => s.id === r.sceneId)} displayField={displayField} />
            ))}
            {activeDragRows.length > 3 && <div className="text-[9px] text-center text-zinc-500">+{activeDragRows.length - 3} more</div>}
          </div>
        ) : null}
      </DragOverlay>

      {contextMenuDate && contextMenu && (
        <ContextMenu open={true} x={contextMenu.x} y={contextMenu.y} onClose={() => { setContextMenu(null); setContextMenuDate(null); }}>
          <ContextMenuItem onClick={() => { handleNonShootToggle(contextMenuDate, 'hold'); setContextMenu(null); setContextMenuDate(null); }} icon={<Pause className="w-3.5 h-3.5" />}>Hold</ContextMenuItem>
          <ContextMenuItem onClick={() => { handleNonShootToggle(contextMenuDate, 'travel'); setContextMenu(null); setContextMenuDate(null); }} icon={<Plane className="w-3.5 h-3.5" />}>Travel</ContextMenuItem>
          <ContextMenuItem onClick={() => { handleNonShootToggle(contextMenuDate, 'holiday'); setContextMenu(null); setContextMenuDate(null); }} icon={<Sun className="w-3.5 h-3.5" />}>Day Off</ContextMenuItem>
          {nonShootDateMap.has(contextMenuDate) && (
            <>
              <ContextMenuDivider />
              <ContextMenuItem onClick={() => { handleNonShootToggle(contextMenuDate, null); setContextMenu(null); setContextMenuDate(null); }} icon={<X className="w-3.5 h-3.5" />}>Clear Status</ContextMenuItem>
            </>
          )}
        </ContextMenu>
      )}
      {contextMenuBodyTarget && contextMenu && (
        <ContextMenu open={true} x={contextMenu.x} y={contextMenu.y} onClose={() => { setContextMenu(null); setContextMenuBodyTarget(null); }}>
          {inClipboard > 0 && (
            <>
              <ContextMenuItem onClick={() => { pasteClipboard(contextMenuBodyTarget); setContextMenu(null); setContextMenuBodyTarget(null); }} icon={<ClipboardPaste className="w-3.5 h-3.5" />}>Paste Below ({inClipboard})</ContextMenuItem>
              <ContextMenuDivider />
            </>
          )}
          <ContextMenuItem onClick={() => { handleContextMenuAction('add_note'); setContextMenu(null); setContextMenuBodyTarget(null); }} icon={<StickyNote className="w-3.5 h-3.5" />}>Add Note Below</ContextMenuItem>
          <ContextMenuItem onClick={() => { handleContextMenuAction('add_break'); setContextMenu(null); setContextMenuBodyTarget(null); }} icon={<Coffee className="w-3.5 h-3.5" />}>Add Break Below</ContextMenuItem>
        </ContextMenu>
      )}
      {contextMenu && !contextMenuDate && !contextMenuBodyTarget && (
        <StripboardContextMenuContent
          contextMenu={contextMenu}
          setContextMenu={setContextMenu}
          rows={(activeVersion?.rows || [])}
          selectedRowIds={selectedRowIds}
          inClipboard={inClipboard}
          cutSelected={cutSelected}
          pasteClipboard={pasteClipboard}
          handleContextMenuAction={handleContextMenuAction}
          dispatch={dispatch}
          activeVersion={activeVersion}
          selectNextAfterRemove={selectNextAfterRemove}
          containerRef={calendarGridRef}
          onOpenScene={onOpenScene}
          onOpenSceneInPopout={onOpenSceneInPopout}
          shiftHeld={shiftHeld}
        />
      )}
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
              <ColorField value={colorPicker.bg} onChange={v => setColorPicker(p => p ? { ...p, bg: v } : null)} defaultValue={getNoteBannerColors(state.present.colorPalette).background} />
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-xs text-zinc-300">Text Color</span>
              <ColorField value={colorPicker.text} onChange={v => setColorPicker(p => p ? { ...p, text: v } : null)} defaultValue={getNoteBannerColors(state.present.colorPalette).color} />
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
      {autoDayOffOpen && (
        <Modal open onClose={() => setAutoDayOffOpen(false)} title="Auto Day Off" width="max-w-sm"
          footer={
            <ModalFooter>
              <button onClick={() => setAutoDayOffOpen(false)} className="px-6 py-2 text-zinc-400 text-xs font-medium rounded-lg hover:bg-zinc-800 hover:text-zinc-200 transition-colors">Cancel</button>
              <button onClick={handleApplyAutoDaysOff} className="px-6 py-2 bg-zinc-800 text-white text-xs font-semibold rounded-lg border border-zinc-700 hover:bg-zinc-700 transition-colors">Apply</button>
            </ModalFooter>
          }
        >
          <div className="p-6 space-y-5">
            <div>
              <span className="text-xs text-zinc-300">Days of the week</span>
              <div className="flex gap-1.5 mt-2">
                {['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map((label, i) => (
                  <button
                    key={label}
                    onClick={() => setAutoDayOffDays(prev => {
                      const next = new Set(prev);
                      if (next.has(i)) next.delete(i); else next.add(i);
                      return next;
                    })}
                    className={`w-9 h-8 text-[10px] font-semibold rounded transition-colors ${
                      autoDayOffDays.has(i)
                        ? 'bg-zinc-700 text-white'
                        : 'bg-zinc-900 text-zinc-500 hover:bg-zinc-800 border border-zinc-800'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Modal>
      )}
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
    </>
  );
};