import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { DndContext, useDraggable, DragOverlay, closestCorners, CollisionDetection } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useProject } from '../store';
import { useAppDragSensors } from '../lib/dndSensors';
import { ScheduleRow, Scene, RuleViolation, SceneColorPalette, NonShootDate, ProjectRule, RuleType } from '../types';
import { resolveSceneColor, getNoteBannerColors, getFallbackStripColors } from '../lib/ribbonUtils';
import { ChevronLeft, ChevronRight, Flag, X, Pointer, Eraser, Pause, Plane, Sun, Check, ChevronDown, AlignLeft, StickyNote, Eye, EyeOff, CalendarDays, ClipboardPaste, Coffee, ListFilter, Maximize2, Minimize2, Trash2, Link2, Plus } from 'lucide-react';
import { ContextMenu, ContextMenuItem, ContextMenuDivider } from './ContextMenu';
import Button from './Button';
import { StripboardContextMenuContent } from './StripboardContextMenuContent';
import { useStripboardContextMenu } from '../lib/useStripboardContextMenu';
import { computeSectionViolationMap, rulesRelevantToDay } from '../lib/rulesEngine';
import Modal from './Modal';
import { ModalFooter } from './Modal';
import ModalFooterButton from './ModalFooterButton';
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
import { DayEventsModal } from './calendar/DayEventsModal';
import { EventAdderModal } from './calendar/EventAdderModal';
import { EventModal } from './calendar/EventModal';
import { ProductionDatesModal } from './calendar/ProductionDatesModal';
import { EventDayCell, EventCardView } from './calendar/EventDayCell';
import { useEventsDrag } from './calendar/useEventsDrag';
import { useEventsKeyboard } from './calendar/useEventsKeyboard';
import { DayTypesTab } from './calendar/DayTypesTab';
import { PopoutPlaceholder } from './PopoutWindow';
import { getDayTypes, getMarkableDayTypes, getDayTypeVisual, getDayTypeLabel, getDayTypeCode, typeIconComponent } from '../lib/dayTypes';
import { getNonShootEntryMap, hasAnyLists, upsertNonShootDate } from '../lib/nonShootHelpers';
import { computeDayEvents, removeRuleDate, withRuleDates, DEFAULT_EVENTS_FILTER } from '../lib/events';
import { describeRule, RULE_TYPE_META, RULE_TYPES } from './rules/ruleMeta';
import { useCalendarKeyboard } from './calendar/useCalendarKeyboard';
import { useCalendarDrag } from './calendar/useCalendarDrag';
import { SceneCardContent } from './calendar/SceneCard';
import { BoneyardSidebar, SIDEBAR_COLLAPSED_KEY } from './calendar/BoneyardSidebar';
import { BoneyardExpandButton } from './BoneyardExpandButton';
import { DayDropState, MonthSlot, MonthTrim, DAY_CELL_HEIGHT, toDateKey, DAY_NAMES, formatFullDate, monthsInRange, estimateMonthHeight, buildMonthSlots, monthTitle } from './calendar/calendarUtils';
const SCROLL_KEY = 'lemon_schedule_calendar_scroll';


export const CalendarTab: React.FC<{
  onOpenScene?: (sceneId: string) => void;
  onOpenSceneInPopout?: (sceneId: string) => void;
  subTab?: 'calendar' | 'dayTypes';
  onSubTabChange?: (t: 'calendar' | 'dayTypes') => void;
  poppedOutSubTabs?: Set<string>;
  onToggleSubPopout?: (id: string) => void;
  onCloseSubPopout?: (id: string) => void;
  shiftHeld?: boolean;
}> = ({ onOpenScene, onOpenSceneInPopout, subTab = 'calendar', onSubTabChange, poppedOutSubTabs = new Set(), onToggleSubPopout, onCloseSubPopout, shiftHeld: poppedShiftHeld = false }) => {
  const { state, dispatch } = useProject();
  const currentWindow = useCurrentWindow();
  const project = state.present;
  const activeVersion = project.versions.find(v => v.id === project.activeVersionId);
  const { productionDays, productionSections, sectionDateMap: hookSectionDateMap, productionChronoDayMap } = useDaybreakSections();

  const today = new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(() => activeVersion?.prepStart || activeVersion?.productionStart || today);

  useEffect(() => {
    if (activeVersion?.prepStart || activeVersion?.productionStart) {
      setStartDate(activeVersion.prepStart || activeVersion.productionStart);
    }
  }, [activeVersion?.prepStart, activeVersion?.productionStart]);

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

  const [calSettings, setCalSettings] = usePersistState<{
    displayField: string;
    showBreaks: boolean;
    showConflicts: boolean;
    viewMode: 'strips' | 'events';
    eventsFilter: { statuses: string[] | null; attachments: boolean; flags: boolean; rules: RuleType[] | null };
    /** Day cells size to their content (default) vs the fixed 170px grid row. */
    expandDays: boolean;
  }>('lemon_schedule_calendar_view', {
    displayField: 'set',
    showBreaks: true,
    showConflicts: true,
    viewMode: 'strips',
    eventsFilter: { ...DEFAULT_EVENTS_FILTER },
    expandDays: true,
  });
  const { displayField, showBreaks, showConflicts, expandDays } = calSettings;
  const viewMode = calSettings.viewMode === 'events' ? 'events' : 'strips';
  const eventsFilter = calSettings.eventsFilter || DEFAULT_EVENTS_FILTER;
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
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [prodDatesOpen, setProdDatesOpen] = useState(false);
  const [travelHoldModal, setTravelHoldModal] = useState<{ dateKey: string; status?: string; rule?: ProjectRule } | null>(null);
  const [adderDate, setAdderDate] = useState<string | null>(null);
  const [eventModal, setEventModal] = useState<{ dateKey: string; statusKey: string; category: string; elementKey: string } | null>(null);
  const [selectedEventKeys, setSelectedEventKeys] = useState<Set<string>>(new Set());
  const selectedEventKeysRef = useRef(selectedEventKeys);
  selectedEventKeysRef.current = selectedEventKeys;
  const [lastClickedEventKey, setLastClickedEventKey] = useState<string | null>(null);
  const lastClickedEventKeyRef = useRef(lastClickedEventKey);
  lastClickedEventKeyRef.current = lastClickedEventKey;
  const [eventsFlashDate, setEventsFlashDate] = useState<string | null>(null);
  const eventsFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashEventDate = useCallback((dateKey: string) => {
    setEventsFlashDate(dateKey);
    if (eventsFlashTimerRef.current) clearTimeout(eventsFlashTimerRef.current);
    eventsFlashTimerRef.current = setTimeout(() => setEventsFlashDate(null), 900);
  }, []);
  useEffect(() => () => { if (eventsFlashTimerRef.current) clearTimeout(eventsFlashTimerRef.current); }, []);
  const [autoDayOffOpen, setAutoDayOffOpen] = useState(false);
  const [autoDayOffDays, setAutoDayOffDays] = useState<Set<number>>(new Set([5, 6]));

  const handleNonShootToggle = useCallback((dateKey: string, status: string | null) => {
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
  const [ruleCardMenu, setRuleCardMenu] = useState<{ ruleId: string; dateKey: string; x: number; y: number; everyday: boolean } | null>(null);
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
      if (viewMode === 'events') {
        setSelectedEventKeys(prev => isAddModeActive() ? new Set([...prev, ...filtered]) : filtered);
      } else {
        setSelectedRowIds(prev => isAddModeActive() ? new Set([...prev, ...filtered]) : filtered);
      }
    }, [viewMode]),
    true,
    viewMode === 'events' ? '[data-event-key]' : '[data-row-id]',
  );

  const sensors = useAppDragSensors(!!(activeTool || ctrlOrCmdHeld || marqueeMode !== 'off'), 3);

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

  const nonShootDateMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const ns of nonShootDates) if (ns.status) m.set(ns.date, ns.status);
    return m;
  }, [nonShootDates]);

  const nonShootEntryByDate = useMemo(() => getNonShootEntryMap(nonShootDates), [nonShootDates]);

  const handleTravelHoldSave = useCallback((dateKey: string, entry: NonShootDate) => {
    if (!activeVersion) return;
    dispatch({
      type: 'UPDATE_VERSION',
      payload: { id: activeVersion.id, nonShootDates: upsertNonShootDate(activeVersion.nonShootDates, dateKey, entry) },
    });
  }, [activeVersion, dispatch]);

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
    if (!activeVersion || !showConflicts) return new Map<string, RuleViolation[]>();
    return computeSectionViolationMap(activeVersion.rows, sections, sectionDateMap, project.rules || [], project.scenes, project.castMembers || []);
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
        handleNonShootToggle(dateKey, activeTool as string);
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
    enabled: viewMode === 'strips',
  });

  /* ---- Events mode (roadmap 45) ---- */
  const projectRules = useMemo(() => project.rules || [], [project.rules]);

  const eventsByDate = useMemo(() => {
    const m = new Map<string, ReturnType<typeof computeDayEvents>>();
    if (!activeVersion) return m;
    for (const day of days) {
      const cards = computeDayEvents(
        project, day.dateKey,
        nonShootEntryByDate.get(day.dateKey),
        violationMap.get(day.dateKey),
        projectRules,
        eventsFilter,
      );
      if (cards.length > 0) m.set(day.dateKey, cards);
    }
    return m;
  }, [days, project, nonShootEntryByDate, violationMap, projectRules, eventsFilter]);

  const visibleDates = useMemo(() => days.map(d => d.dateKey), [days]);

  /** Dates carrying ANY event state (entry or rule date) — the day header
   *  becomes draggable (whole-day move) only when there is something. */
  const eventStateDates = useMemo(() => {
    const dates = new Set<string>();
    for (const n of nonShootDates) if (n.status || hasAnyLists(n)) dates.add(n.date);
    for (const r of projectRules) if ('dates' in r && r.dates) for (const d of r.dates) dates.add(d);
    return dates;
  }, [nonShootDates, projectRules]);
  const {
    activeEventId, activeEventIds, activeMeta: activeEventMeta, dropZone: eventsDropZone,
    handleDragStart: handleEventDragStart, handleDragOver: handleEventDragOver,
    handleDragEnd: handleEventDragEnd, reset: resetEventsDrag,
  } = useEventsDrag({
    activeVersion,
    nonShootDates,
    rules: projectRules,
    visibleDates,
    selectedEventKeysRef,
    setSelectedEventKeys,
    calendarGridRef,
    setFlashDateKey: flashEventDate,
    dispatch,
  });

  const handleEventCardClick = useCallback((id: string, e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey) {
      e.stopPropagation();
      setSelectedEventKeys(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      });
      setLastClickedEventKey(id);
    } else if (e.shiftKey && lastClickedEventKeyRef.current) {
      e.stopPropagation();
      const el = calendarGridRef.current;
      if (!el) return;
      const flat = Array.from(el.querySelectorAll('[data-event-key]')).map(x => x.getAttribute('data-event-key')!).filter(Boolean);
      const idxA = flat.indexOf(lastClickedEventKeyRef.current);
      const idxB = flat.indexOf(id);
      if (idxA >= 0 && idxB >= 0) setSelectedEventKeys(new Set(flat.slice(Math.min(idxA, idxB), Math.max(idxA, idxB) + 1)));
    } else {
      e.stopPropagation();
      setSelectedEventKeys(new Set([id]));
      setLastClickedEventKey(id);
    }
  }, []);

  useEventsKeyboard({
    enabled: viewMode === 'events',
    currentWindow,
    setSelectedEventKeys,
    selectedEventKeysRef,
    lastClickedEventRef: lastClickedEventKeyRef,
    calendarGridRef,
    onOpenEvents: (dateKey) => setTravelHoldModal({ dateKey }),
  });

  if (!activeVersion) return <div className="p-8 text-zinc-500">No active version</div>;

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">
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
    <PageToolbar
      tabs={[
        { id: 'calendar', label: 'Calendar' },
        { id: 'dayTypes', label: 'Day Breakdown' },
      ]}
      activeTab={subTab}
      onChange={(t) => onSubTabChange?.(t as 'calendar' | 'dayTypes')}
      onPopout={(id) => onToggleSubPopout?.(id)}
      shiftHeld={poppedShiftHeld}
    />
    {poppedOutSubTabs.has(subTab) ? (
      <PopoutPlaceholder title={subTab === 'dayTypes' ? 'Day Breakdown' : 'Calendar'} onBringBack={() => onCloseSubPopout?.(subTab)} />
    ) : subTab === 'dayTypes' ? (
      <DayTypesTab />
    ) : (
    <>
    <DndContext sensors={sensors} collisionDetection={collisionDetection} onDragStart={viewMode === 'events' ? handleEventDragStart : handleDragStart} onDragOver={viewMode === 'events' ? handleEventDragOver : handleDragOver} onDragEnd={viewMode === 'events' ? handleEventDragEnd : handleDragEnd} onDragCancel={() => {
      setActiveId(null);
      setActiveDragRow(null);
      setActiveDragDay(null);
      setActiveDragIds(new Set());
      setInsertBeforeId(null);
      setDayDropState(null);
      resetEventsDrag();
    }}>
      <div className="flex-1 flex overflow-hidden min-h-0" style={{ fontFamily: 'Helvetica, sans-serif', fontSize: '11px' }}
        onClick={(e) => {
          if (marqueeJustEndedRef.current) { marqueeJustEndedRef.current = false; return; }
          if ((e.target as HTMLElement).closest('[data-row-id], [data-event-key], button, input, select, [role="button"], [role="menuitem"]')) return;
          setSelectedRowIds(new Set());
          setSelectedEventKeys(new Set());
          setViewMenuOpen(false);
          setFilterMenuOpen(false);
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
              </div>
            }
            rightContent={
              <div className="flex items-center gap-3">
                <Button
                  onClick={() => setProdDatesOpen(true)}
                >
                  <CalendarDays className="w-3.5 h-3.5" />
                  Production Dates
                </Button>
                <div className="flex border border-zinc-200 rounded p-0.5">
                  {(['strips', 'events'] as const).map(m => (
                    <button
                      key={m}
                      onClick={() => { updateCal({ viewMode: m }); setSelectedEventKeys(new Set()); }}
                      title={m === 'strips' ? 'Strips view' : 'Events view'}
                      className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors ${viewMode === m ? 'bg-zinc-950 text-white' : 'text-zinc-500 hover:text-zinc-900'}`}
                    >
                      {m === 'strips' ? 'Strips' : 'Events'}
                    </button>
                  ))}
                </div>
                {viewMode === 'events' && (
                  <DropdownMenu
                    open={filterMenuOpen}
                    onOpenChange={setFilterMenuOpen}
                    width="w-56"
                    theme="light"
                    trigger={
                      <Button>
                        <ListFilter className="w-3.5 h-3.5" />
                        Filter
                        <ChevronDown className="w-3 h-3 shrink-0 text-zinc-500" />
                      </Button>
                    }
                  >
                    <div className="px-3 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Events</div>
                    <DropdownItem keepOpen onClick={() => updateCal({ eventsFilter: { ...eventsFilter, statuses: eventsFilter.statuses == null ? [] : null } })} className="font-semibold">
                      <span className="flex items-center justify-between w-full gap-2">All Events{eventsFilter.statuses == null && <Check className="w-3.5 h-3.5 shrink-0" />}</span>
                    </DropdownItem>
                    {getMarkableDayTypes(project).map(t => {
                      const on = eventsFilter.statuses == null || eventsFilter.statuses.includes(t.key);
                      return (
                        <DropdownItem key={t.key} keepOpen onClick={() => {
                          const all = getMarkableDayTypes(project).map(x => x.key);
                          const cur = eventsFilter.statuses == null ? all : eventsFilter.statuses;
                          const next = cur.includes(t.key) ? cur.filter(k => k !== t.key) : [...cur, t.key];
                          updateCal({ eventsFilter: { ...eventsFilter, statuses: next.length === all.length ? null : next } });
                        }} icon={(() => {
                          const Icon = typeIconComponent(project.dayTypes, t.key);
                          return <Icon className="w-3.5 h-3.5" style={t.color ? { color: t.color } : undefined} />;
                        })()}>
                          <span className="flex items-center justify-between w-full gap-2">{t.label}{on && <Check className="w-3.5 h-3.5 shrink-0" />}</span>
                        </DropdownItem>
                      );
                    })}
                    <DropdownDivider />
                    <DropdownItem keepOpen onClick={() => updateCal({ eventsFilter: { ...eventsFilter, attachments: !eventsFilter.attachments } })} icon={<Link2 className="w-3.5 h-3.5" />}>
                      <span className="flex items-center justify-between w-full gap-2">Cast &amp; Elements{eventsFilter.attachments && <Check className="w-3.5 h-3.5 shrink-0" />}</span>
                    </DropdownItem>
                    <DropdownDivider />
                    <div className="px-3 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Rules</div>
                    <DropdownItem keepOpen onClick={() => updateCal({ eventsFilter: { ...eventsFilter, rules: eventsFilter.rules == null ? [] : null } })} className="font-semibold">
                      <span className="flex items-center justify-between w-full gap-2">All Rule Types{eventsFilter.rules == null && <Check className="w-3.5 h-3.5 shrink-0" />}</span>
                    </DropdownItem>
                    {RULE_TYPES.map(t => {
                      const on = eventsFilter.rules == null || eventsFilter.rules.includes(t);
                      const meta = RULE_TYPE_META[t];
                      return (
                        <DropdownItem key={t} keepOpen onClick={() => {
                          const cur = eventsFilter.rules == null ? [...RULE_TYPES] : eventsFilter.rules;
                          const next = cur.includes(t) ? cur.filter(k => k !== t) : [...cur, t];
                          updateCal({ eventsFilter: { ...eventsFilter, rules: next.length === RULE_TYPES.length ? null : next } });
                        }} icon={<meta.icon className={`w-3 h-3 ${meta.chipIcon}`} />}>
                          <span className="flex items-center justify-between w-full gap-2">{meta.label}{on && <Check className="w-3.5 h-3.5 shrink-0" />}</span>
                        </DropdownItem>
                      );
                    })}
                  </DropdownMenu>
                )}
                <DropdownMenu
                  open={viewMenuOpen}
                  onOpenChange={setViewMenuOpen}
                  width="w-48"
                  theme="light"
                  trigger={
                    <Button>
                      View
                      <ChevronDown className="w-3 h-3 shrink-0 text-zinc-500" />
                    </Button>
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
                  <DropdownDivider />
                  <button
                    onClick={() => updateCal({ expandDays: !expandDays })}
                    className="w-full text-left px-3 py-2 rounded flex items-center justify-between gap-2 text-xs transition-colors outline-none cursor-pointer select-none text-zinc-700 hover:bg-zinc-100"
                  >
                    <span className="flex items-center gap-2">
                      <Maximize2 className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                      Expand Day Cells
                    </span>
                    {expandDays ? <Maximize2 className="w-3.5 h-3.5 text-zinc-500 shrink-0" /> : <Minimize2 className="w-3.5 h-3.5 text-zinc-400 shrink-0" />}
                  </button>
                </DropdownMenu>
              </div>
            }
          />
          {viewMode === 'strips' && (
          <PageToolbar theme="light" justify="start">
            {[
              { key: null, label: <Pointer className="w-3 h-3" />, title: 'Select' },
              { key: 'hold', label: 'H', title: getDayTypeLabel(project, 'hold') || 'Hold' },
              { key: 'travel', label: 'T', title: getDayTypeLabel(project, 'travel') || 'Travel' },
              { key: 'holiday', label: 'DO', title: getDayTypeLabel(project, 'holiday') || 'Day Off' },
              { key: 'remove', label: <Eraser className="w-3 h-3" />, title: 'Erase' },
            ].map(t => (
              <button key={t.key || 'none'} type="button"
                onClick={() => setActiveTool(prev => prev === t.key ? null : t.key)}
                title={t.title}
                className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${activeTool === t.key ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:bg-zinc-100'}`}
              >{t.label}</button>
            ))}
          </PageToolbar>
          )}
          <div ref={calendarGridRef} data-marquee-container onClick={(e) => {
            if (marqueeJustEndedRef.current || (e.target as HTMLElement).closest('[data-row-id]') || (e.target as HTMLElement).closest('[data-event-key]')) return;
            setSelectedRowIds(new Set());
            setViewMenuOpen(false);
            setContextMenuDate(null);
            setContextMenu(null);
          }} onScroll={() => { updateRenderWindow(); if (calendarGridRef.current) saveScrollPos(calendarGridRef.current.scrollTop); }} className="flex-1 overflow-y-auto min-h-0 relative overscroll-contain" data-cal-grid style={{ touchAction: IS_COARSE ? 'pan-y pan-x' : undefined }}>
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
                  {viewMode === 'events' ? (
                    (() => {
                      const slots = buildMonthSlots(m.year, m.month, trim);
                      const weeks: MonthSlot[][] = [];
                      for (let i = 0; i < slots.length; i += 7) weeks.push(slots.slice(i, i + 7));
                      return weeks.map((week, wi) => {
                        const weekDates = week
                          .filter((s): s is Extract<MonthSlot, { filler: false }> => !s.filler)
                          .map(s => s.dateKey);
                        return (
                          <div key={`wk-${wi}`} data-cal-week className="relative border-t border-zinc-200">
                            <div className="grid grid-cols-7 border-l border-zinc-200">
                              {week.map(slot => {
                                if (slot.filler) return <FillerCell key={slot.key} />;
                                const day = slot as Extract<MonthSlot, { filler: false }>;
                                const dateSectionIdx = dateSectionMap.get(day.dateKey) ?? null;
                                const chronoDay = dateSectionIdx != null ? chronoDayMap.get(dateSectionIdx) : undefined;
                                return (
                                  <EventDayCell key={day.dateKey}
                                    dateKey={day.dateKey} date={day.date} isToday={day.isToday}
                                    cards={eventsByDate.get(day.dateKey) || []}
                                    travelHoldEntry={nonShootEntryByDate.get(day.dateKey)}
                                    dayTypeVisual={getDayTypeVisual(project, nonShootDateMap.get(day.dateKey))}
                                    dayTypeCode={getDayTypeCode(project, nonShootDateMap.get(day.dateKey))}
                                    violations={violationMap.get(day.dateKey) || []}
                                    sectionLabel={chronoDay != null ? `DAY ${chronoDay}` : undefined}
                                    selectedIds={selectedEventKeys}
                                    onCardClick={handleEventCardClick}
                                    onCardDoubleClick={(card) => {
                                      // Per-element card → the single-event editor
                                      // (same as the element events manager's pencil);
                                      // whole-category/status/rule cards keep their day surfaces.
                                      if (card.kind === 'attachment' && !card.all) {
                                        setEventModal({ dateKey: card.dateKey, statusKey: card.status, category: card.category, elementKey: card.key });
                                        return;
                                      }
                                      setTravelHoldModal({
                                        dateKey: card.dateKey,
                                        ...(card.kind === 'attachment' ? { status: card.status } : {}),
                                        ...(card.kind === 'rule' ? { rule: card.rule } : {}),
                                      });
                                    }}
                                    onCardContextMenu={(card, e) => {
                                      if (card.kind === 'rule') {
                                        setRuleCardMenu({ ruleId: card.rule.id, dateKey: card.dateKey, x: e.clientX, y: e.clientY, everyday: card.everyday });
                                      }
                                    }}
                                    onOpenEvents={(dk) => setTravelHoldModal({ dateKey: dk })}
                                    onContextMenu={(e, dateKey) => {
                                      setContextMenuDate(dateKey);
                                      setContextMenu({ x: e.clientX, y: e.clientY, rowId: '', containerId: null });
                                    }}
                                    flash={eventsFlashDate === day.dateKey}
                                    hasEvents={eventStateDates.has(day.dateKey)}
                                    dropZone={eventsDropZone}
                                  />
                                );
                              })}
                            </div>
                          </div>
                        );
                      });
                    })()
                  ) : (
                  <div className="grid grid-cols-7 border-l border-t border-zinc-200" style={{ gridAutoRows: expandDays ? 'auto' : DAY_CELL_HEIGHT }}>
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
                          dayTypeVisual={getDayTypeVisual(project, nonShootDateMap.get(day.dateKey))}
                          dayTypeCode={getDayTypeCode(project, nonShootDateMap.get(day.dateKey))}
                          travelHoldEntry={nonShootEntryByDate.get(day.dateKey)}
                          onEditTravelHold={(dk) => setTravelHoldModal({ dateKey: dk })}
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
                  )}
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
        {viewMode === 'events' && activeEventId && activeEventMeta ? (
          activeEventMeta.type === 'EVENT_DAY' ? (
            <div className="flex flex-col gap-0.5 opacity-90">
              {(eventsByDate.get(activeEventMeta.dateKey) || [])
                .slice(0, 3)
                .map(card => (
                  <div key={card.id} className="w-56"><EventCardView card={card} project={project} /></div>
                ))}
              {((eventsByDate.get(activeEventMeta.dateKey) || []).length) > 3 && (
                <div className="text-[9px] text-center text-zinc-500">+{(eventsByDate.get(activeEventMeta.dateKey) || []).length - 3} more</div>
              )}
            </div>
          ) : (
            (() => {
              for (const cards of eventsByDate.values()) {
                const c = cards.find(x => x.id === activeEventId);
                if (c) return <div className="w-56"><EventCardView card={c} project={project} /></div>;
              }
              return null;
            })()
          )
        ) : null}
      </DragOverlay>

      {ruleCardMenu && (
        <ContextMenu open x={ruleCardMenu.x} y={ruleCardMenu.y} onClose={() => setRuleCardMenu(null)}>
          <ContextMenuItem
            variant="danger"
            disabled={ruleCardMenu.everyday}
            icon={<Trash2 className="w-3.5 h-3.5" />}
            onClick={() => {
              const rule = projectRules.find(r => r.id === ruleCardMenu.ruleId);
              if (rule) {
                const res = removeRuleDate(rule, ruleCardMenu.dateKey);
                if (res.changed) dispatch({ type: 'UPDATE_RULE', payload: withRuleDates(rule, res.dates) });
              }
              setRuleCardMenu(null);
            }}
          >
            {ruleCardMenu.everyday ? 'Every-day rule — edit dates in the rule editor' : 'Remove from this day'}
          </ContextMenuItem>
        </ContextMenu>
      )}

      {contextMenuDate && contextMenu && (
        <ContextMenu open={true} x={contextMenu.x} y={contextMenu.y} onClose={() => { setContextMenu(null); setContextMenuDate(null); }}>
          {getMarkableDayTypes(project).map(t => {
            const Icon = typeIconComponent(project.dayTypes, t.key);
            return (
              <ContextMenuItem key={t.key} onClick={() => { handleNonShootToggle(contextMenuDate, t.key); setContextMenu(null); setContextMenuDate(null); }}
                icon={<Icon className="w-3.5 h-3.5" style={t.color ? { color: t.color } : undefined} />}
              >
                {t.label}
              </ContextMenuItem>
            );
          })}
          <ContextMenuDivider />
          <ContextMenuItem onClick={() => { setAdderDate(contextMenuDate); setContextMenu(null); setContextMenuDate(null); }} icon={<Plus className="w-3.5 h-3.5" />}>Add Events…</ContextMenuItem>
          <ContextMenuItem onClick={() => { setTravelHoldModal({ dateKey: contextMenuDate }); setContextMenu(null); setContextMenuDate(null); }} icon={<><Plane className="w-3 h-3" /><Pause className="w-3 h-3" /></>}>{viewMode === 'events' ? 'Manage Events…' : 'Manage Travel/Hold…'}</ContextMenuItem>
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
              <ModalFooterButton variant="ghost" onClick={() => setColorPicker(null)}>Cancel</ModalFooterButton>
              <ModalFooterButton onClick={applyNoteColor}>Apply</ModalFooterButton>
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
      {prodDatesOpen && (
        <ProductionDatesModal onClose={() => setProdDatesOpen(false)} />
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
      {adderDate && (
        <EventAdderModal
          date={adderDate}
          onClose={() => setAdderDate(null)}
        />
      )}
      {eventModal && (
        <EventModal
          dateKey={eventModal.dateKey}
          statusKey={eventModal.statusKey}
          category={eventModal.category}
          elementKey={eventModal.elementKey}
          editableElement
          onClose={() => setEventModal(null)}
        />
      )}
      {travelHoldModal && (
        <DayEventsModal
          dateKey={travelHoldModal.dateKey}
          violations={violationMap.get(travelHoldModal.dateKey) || []}
          rules={rulesRelevantToDay(projectRules, travelHoldModal.dateKey)}
          initialStatus={travelHoldModal.status}
          initialRule={travelHoldModal.rule}
          onClose={() => setTravelHoldModal(null)}
        />
      )}
    </DndContext>
    </>
    )}
  </div>
  );
};