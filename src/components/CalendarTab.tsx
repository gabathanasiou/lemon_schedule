import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { DndContext, useDraggable, useDroppable, DragEndEvent, DragStartEvent, DragOverlay, DragOverEvent, PointerSensor, TouchSensor, useSensor, useSensors, closestCorners, CollisionDetection } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useProject } from '../store';
import { ScheduleRow, Scene, ShootDayMeta, RuleViolation, SceneColorPalette } from '../types';
import { generateUUID } from '../lib/utils';
import { resolveSceneColor, getNoteBannerColors } from '../lib/ribbonUtils';
import { ChevronLeft, ChevronRight, GripVertical, Flag, X, Pointer, Eraser, Trash2, Briefcase, Pause, Plane, Sun, Plus, Check, ChevronDown, AlignLeft, StickyNote, Eye, EyeOff } from 'lucide-react';
import { ContextMenu, ContextMenuItem, ContextMenuDivider } from './ContextMenu';
import { StripboardContextMenuContent } from './StripboardContextMenuContent';
import { useStripboardContextMenu } from '../lib/useStripboardContextMenu';
import { checkDay } from '../lib/rulesEngine';
import { ViolationTooltip } from './ViolationTooltip';
import { EntityDropdown } from './EntityDropdown';
import Modal from './Modal';
import { ModalFooter } from './Modal';
import { useMarquee, MarqueeOverlay, useAddMode, isAddModeActive } from '../lib/useMarquee';
import { useMarqueeMode, getMarqueeMode } from '../lib/useLongPressMenu';
import { IS_COARSE } from '../lib/device';
import { usePersistState } from '../lib/persist';
import { getLabel, ELEMENT_CATEGORIES, CAT_ICONS, getCustomIcon } from '../lib/categories';
import DropdownMenu from './DropdownMenu';
import DropdownItem from './DropdownItem';
import DropdownDivider from './DropdownDivider';
import DropdownSubmenu from './DropdownSubmenu';

const SIDEBAR_KEY = 'lemon_schedule_calendar_sidebar_width';

const DAY_NAMES = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getCalendarDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const startOfWeek = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
  const cursor = new Date(year, month, 1 - startOfWeek);
  const todayKey = toDateKey(new Date());
  const days: { date: Date; dateKey: string; isCurrentMonth: boolean; isToday: boolean }[] = [];
  for (let i = 0; i < 42; i++) {
    const isCurrentMonth = cursor.getMonth() === month;
    days.push({ date: new Date(cursor), dateKey: toDateKey(cursor), isCurrentMonth, isToday: toDateKey(cursor) === todayKey });
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

const SceneCardContent: React.FC<{ row: ScheduleRow; scene?: Scene; displayField: string; violations?: RuleViolation[] }> = ({ row, scene, displayField, violations }) => {
  const { state } = useProject();
  const palette = state.present.colorPalette;
  if (!scene) {
    const label = row.type === 'BREAK' ? row.breakLabel || 'BREAK' : row.type === 'NOTE' ? row.noteText || 'Note' : null;
    if (!label) return null;
    const nb = getNoteBannerColors(palette);
    const bg = row.noteColor || nb.background;
    const fg = row.noteTextColor || nb.color;
    return (
      <div style={{ background: bg, color: fg }} className={`text-[9px] font-semibold px-1.5 py-0.5 truncate border-b border-white select-none cursor-grab ${row.type === 'NOTE' ? 'italic' : ''}`}>
        {label}
      </div>
    );
  }
  const getDisplayValue = (): string => {
    if (displayField === 'description') return scene.description;
    if (displayField === 'cast') {
      const ids = scene.cast.split(',').map(s => s.trim()).filter(Boolean);
      const members = state.present.castMembers || [];
      return ids.map(id => members.find(m => m.id === id)?.name || id).join(', ');
    }
    return (scene as any)[displayField] || '';
  };
  const c = resolveSceneColor(scene.intExt || '', scene.dayNight || '', palette?.sceneColors);
  const vFlag = violations && violations.length > 0 ? (
    <ViolationTooltip violations={violations}>
      <Flag className="w-2 h-2 text-red-500 fill-red-500 shrink-0" />
    </ViolationTooltip>
  ) : null;
  return (
    <div style={{ background: c.background, color: c.color }} className="text-[9px] truncate px-1.5 py-0.5 leading-tight whitespace-nowrap font-semibold flex items-center gap-0.5 border-b border-white select-none cursor-grab">
      <span className="truncate">{scene.sceneNumber}. {getDisplayValue()}</span>
      {vFlag}
    </div>
  );
};

const SceneCard: React.FC<{ row: ScheduleRow; scene?: Scene; displayField: string; violations?: RuleViolation[]; isSelected?: boolean; isFaded?: boolean; onToggle?: (id: string, e: React.MouseEvent) => void; onDoubleClick?: (id: string) => void }> = ({ row, scene, displayField, violations, isSelected, isFaded, onToggle, onDoubleClick }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.id,
    data: { type: 'SCENE_CARD', row, scene },
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    ...(isDragging ? { opacity: 0.3 } : {}),
    userSelect: 'none' as const,
    WebkitUserSelect: 'none' as const,
    WebkitTouchCallout: 'none' as const,
  };
    return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}
      onClick={(e) => onToggle?.(row.id, e)}
      onDoubleClick={(e) => { e.preventDefault(); onDoubleClick?.(row.id); }}
      data-row-id={row.id}
      data-shoot-day={row.shootDay == null ? 'null' : row.shootDay}
      className={`${isSelected ? 'before:absolute before:inset-0 before:bg-black/15 before:pointer-events-none before:z-10 before:content-[\'\'] relative' : ''}`}>
      <SceneCardContent row={row} scene={scene} displayField={displayField} violations={violations} />
      {isFaded && <div className="absolute inset-0 bg-white/50 pointer-events-none" />}
    </div>
  );
};

const DayCell: React.FC<{
  dateKey: string; date: Date; isCurrentMonth: boolean; isToday: boolean;
  isWorkingDay: boolean; shootDay: number | null; label: string | null;
  rows: ScheduleRow[]; scenes: Scene[]; displayField: string;
  violations: RuleViolation[];
  sceneViolationMap: Map<string, RuleViolation[]>;
  onToggle: (dateKey: string) => void;
  onDoubleClick?: (dateKey: string) => void;
  status?: string;
  chronoDay?: number;
  dayCastIds?: string;
  activeTool?: string | null;
  selectedIds?: Set<string>;
  activeDragIds?: Set<string>;
  onRowClick?: (id: string, e: React.MouseEvent) => void;
  insertBeforeId?: string | null;
  activeDragRow?: ScheduleRow | null;
  activeDragRows?: ScheduleRow[];
  activeRowId?: string | null;
  activeDragDay?: number | null;
  monthSeparator?: string | null;
  onRowDoubleClick?: (id: string) => void;
}> = ({ dateKey, date, isCurrentMonth, isToday, isWorkingDay, shootDay, label, rows, scenes, displayField, violations, sceneViolationMap, onToggle, onDoubleClick, status, chronoDay, dayCastIds, activeTool, selectedIds, activeDragIds, onRowClick, insertBeforeId, activeDragRow, activeDragRows = [], activeRowId, activeDragDay, monthSeparator, onRowDoubleClick }) => {
  const isNonWorkStatus = status && status !== 'work';
  const { setNodeRef, isOver } = useDroppable({
    id: `day-${dateKey}`,
    data: { type: 'DAY_CELL', date: dateKey, shootDay },
  });

  const { attributes, listeners, setNodeRef: setHandleRef, isDragging } = useDraggable({
    id: shootDay !== null ? `day-handle-${shootDay}` : 'day-handle-inactive',
    data: shootDay !== null ? { type: 'DAY', shootDay, date: dateKey } : {},
    disabled: !isWorkingDay || shootDay === null,
  });

  const { setNodeRef: setEndRef } = useDroppable({
    id: shootDay != null ? `end-${shootDay}` : `end-date-${dateKey}`,
    data: { type: 'DAY_END', date: dateKey, shootDay },
    disabled: isNonWorkStatus || shootDay === null,
  });

  const statusBadge = status === 'hold' ? 'H' : status === 'travel' ? 'T' : status === 'holiday' ? 'HOL' : null;
  const statusBg = status === 'hold' ? 'bg-red-50' : status === 'travel' ? 'bg-purple-50' : status === 'holiday' ? 'bg-green-50' : '';
  const headerColor = status === 'hold' ? 'bg-red-600 text-white'
    : status === 'travel' ? 'bg-purple-600 text-white'
    : status === 'holiday' ? 'bg-green-700 text-white'
    : status === 'work' || (!status && isWorkingDay) ? 'bg-zinc-700 text-white'
    : 'bg-zinc-200 text-zinc-600';

  const headerLabel = status === 'hold' ? `HOLD${dayCastIds ? ` · ${dayCastIds.split(',').filter(Boolean).length}` : ''}` : status === 'travel' ? `TRAVEL${dayCastIds ? ` · ${dayCastIds.split(',').filter(Boolean).length}` : ''}` : status === 'holiday' ? 'HOLIDAY' : chronoDay ? `DAY #${chronoDay}` : '';

  return (
    <div ref={setNodeRef}
      className={`min-h-[80px] h-full border-r flex flex-col
        ${!isWorkingDay && !status ? 'border-b border-dashed border-zinc-200' : 'border-b border-zinc-200'}
        ${!isCurrentMonth ? 'bg-zinc-50/50 text-zinc-300' : !isWorkingDay && !status ? 'bg-zinc-50 text-zinc-400' : statusBg || 'bg-zinc-50'}
        ${isOver && !(activeDragIds?.size && isNonWorkStatus) ? '!bg-blue-50' : ''}`}
    >
        {monthSeparator && (
          <div className="text-center text-[9px] font-bold text-zinc-400 uppercase tracking-wider py-0.5 bg-zinc-50 border-b border-zinc-200">
            {monthSeparator}
          </div>
        )}
        <div
          ref={setHandleRef} {...listeners} {...attributes}
          onClick={() => activeTool && onToggle(dateKey)}
          onDoubleClick={(e) => { e.preventDefault(); if (!activeTool && onDoubleClick) onDoubleClick(dateKey); }}
          data-row-id={shootDay != null ? `empty-${shootDay}` : `empty-date-${dateKey}`}
          data-shoot-day={shootDay == null ? 'null' : shootDay}
          title={activeTool ? `Click to set ${activeTool}` : 'Double-click to set status'}
          style={{ opacity: isDragging ? 0.3 : 1, cursor: activeTool ? 'pointer' : (isWorkingDay && shootDay != null ? 'grab' : 'default') }}
        className={`flex items-center justify-between mx-0.5 my-0.5 px-1.5 py-1 select-none min-h-[26px] ${headerColor} ${isCurrentMonth ? '' : 'opacity-30'} ${isToday ? 'ring-2 ring-blue-400' : ''}`}
      >
        <span className="text-[10px] font-bold w-5 text-center leading-none">{date.getDate()}</span>
        <span className="text-[10px] font-bold uppercase tracking-wider flex-1 text-center">{headerLabel}</span>
        <span className="w-5 flex justify-center">


          {violations.length > 0 && (
            <ViolationTooltip violations={violations}>
              <Flag className="w-2.5 h-2.5 fill-red-400 shrink-0 text-red-400" />
            </ViolationTooltip>
          )}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0 mx-0.5" data-row-id={shootDay != null ? `empty-${shootDay}` : `empty-date-${dateKey}`} data-shoot-day={shootDay == null ? 'null' : shootDay}>
        <SortableContext items={rows.map(r => r.id)} strategy={verticalListSortingStrategy}>
          {rows.map((r, i, arr) => (
            <React.Fragment key={r.id}>
              {activeRowId && activeDragRows.length > 0 && insertBeforeId === r.id && (
                <div className="opacity-40 flex flex-col gap-0">
                  {activeDragRows.slice(0, 3).map(dr => (
                    <SceneCardContent key={dr.id} row={dr} scene={scenes.find(s => s.id === dr.sceneId)} displayField={displayField} />
                  ))}
                  {activeDragRows.length > 3 && <div className="text-[8px] text-zinc-400 text-center">+{activeDragRows.length - 3} more</div>}
                </div>
              )}
              <SceneCard row={r} scene={scenes.find(s => s.id === r.sceneId)} displayField={displayField} violations={sceneViolationMap.get(r.sceneId || '')} isSelected={selectedIds?.has(r.id) ?? false} isFaded={activeDragIds?.has(r.id) ?? false} onToggle={onRowClick} onDoubleClick={onRowDoubleClick} />
              {activeRowId && activeDragRows.length > 0 && i === arr.length - 1 && insertBeforeId === `day-${dateKey}` && (
                <div className="opacity-40 flex flex-col gap-0">
                  {activeDragRows.slice(0, 3).map(dr => (
                    <SceneCardContent key={dr.id} row={dr} scene={scenes.find(s => s.id === dr.sceneId)} displayField={displayField} />
                  ))}
                  {activeDragRows.length > 3 && <div className="text-[8px] text-zinc-400 text-center">+{activeDragRows.length - 3} more</div>}
                </div>
              )}
            </React.Fragment>
          ))}
        </SortableContext>
        <div ref={setEndRef} className="h-1 w-full shrink-0" />
      </div>
    </div>
  );
};

const UnscheduledSidebar: React.FC<{
  rows: ScheduleRow[];
  scenes: Scene[];
  displayField: string;
  sceneViolationMap: Map<string, RuleViolation[]>;
  activeDragRows?: ScheduleRow[];
  insertBeforeId?: string | null;
  activeRowId?: string | null;
  activeDragIds?: Set<string>;
  selectedIds?: Set<string>;
  onRowClick?: (id: string, e: React.MouseEvent) => void;
  onSort?: (criterion: 'scene_number' | 'script_day' | 'page_count' | 'set_name') => void;
  onRowDoubleClick?: (id: string) => void;
}> = ({ rows, scenes, displayField, sceneViolationMap, activeDragRows = [], insertBeforeId, activeRowId, activeDragIds, selectedIds, onRowClick, onSort, onRowDoubleClick }) => {
  const { setNodeRef, isOver } = useDroppable({ id: 'unscheduled', data: { type: 'UNSCHEDULED' } });
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [width, setWidth] = useState<number>(() => {
    try { const v = localStorage.getItem(SIDEBAR_KEY); return v ? parseInt(v, 10) : 200; } catch { return 200; }
  });
  const panelRef = useRef<HTMLDivElement>(null);
  const widthRef = useRef(width);

  useEffect(() => {
    widthRef.current = width;
    localStorage.setItem(SIDEBAR_KEY, String(width));
  }, [width]);

  const handleResizeStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const startX = e.clientX;
    const startWidth = panelRef.current?.offsetWidth || widthRef.current;
    const handlePointerMove = (e: PointerEvent) => {
      const newWidth = Math.min(400, Math.max(160, startWidth + e.clientX - startX));
      widthRef.current = newWidth;
      if (panelRef.current) panelRef.current.style.width = `${newWidth}px`;
    };
    const handlePointerUp = () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setWidth(widthRef.current);
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
    };
    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
  }, []);

  return (
    <div ref={panelRef}
      className="border-r border-zinc-200 bg-zinc-50 flex flex-col shrink-0 relative overflow-hidden"
      style={{ width: `${width}px` }}
    >
      <div className="px-3 py-2 border-b border-zinc-200 font-semibold text-[11px] text-zinc-600 bg-white flex items-center justify-between">
        <span>UNSCHEDULED</span>
        {onSort && (
          <div className="relative">
            <button onClick={() => setShowSortMenu(p => !p)} className="text-[10px] text-zinc-400 hover:text-zinc-600 font-normal">
              Sort ▾
            </button>
            {showSortMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowSortMenu(false)} />
                <div className="absolute right-0 top-full mt-1 w-40 bg-zinc-950/95 backdrop-blur-md border border-zinc-800 rounded-lg shadow-2xl z-50 text-zinc-300 p-1 flex flex-col text-[10px] font-sans font-semibold">
                  <button onClick={() => { onSort('scene_number'); setShowSortMenu(false); }} className="w-full text-left px-2 py-1.5 hover:bg-zinc-900 rounded hover:text-white">Scene Number</button>
                  <button onClick={() => { onSort('script_day'); setShowSortMenu(false); }} className="w-full text-left px-2 py-1.5 hover:bg-zinc-900 rounded hover:text-white">Script Day</button>
                  <button onClick={() => { onSort('page_count'); setShowSortMenu(false); }} className="w-full text-left px-2 py-1.5 hover:bg-zinc-900 rounded hover:text-white">Page Count (Longest)</button>
                  <button onClick={() => { onSort('set_name'); setShowSortMenu(false); }} className="w-full text-left px-2 py-1.5 hover:bg-zinc-900 rounded hover:text-white">Set / Location</button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
      <div ref={setNodeRef} className={`flex-1 overflow-y-auto p-2 flex flex-col gap-0 ${isOver ? 'bg-blue-50' : ''}`}>
        {rows.map((r, i, arr) => (
          <React.Fragment key={r.id}>
            {activeRowId && activeDragRows.length > 0 && insertBeforeId === r.id && (
              <div className="opacity-40 flex flex-col gap-0 mb-0.5">
                {activeDragRows.slice(0, 2).map(dr => (
                  <SceneCardContent key={dr.id} row={dr} scene={scenes.find(s => s.id === dr.sceneId)} displayField={displayField} />
                ))}
                {activeDragRows.length > 2 && <div className="text-[8px] text-zinc-400 text-center">+{activeDragRows.length - 2} more</div>}
              </div>
            )}
            <SceneCard row={r} scene={scenes.find(s => s.id === r.sceneId)} displayField={displayField} violations={sceneViolationMap.get(r.sceneId || '')} isSelected={selectedIds?.has(r.id) ?? false} isFaded={activeDragIds?.has(r.id) ?? false} onToggle={onRowClick} onDoubleClick={onRowDoubleClick} />
            {activeRowId && activeDragRows.length > 0 && i === arr.length - 1 && insertBeforeId === 'end-unscheduled' && (
              <div className="opacity-40 flex flex-col gap-0">
                {activeDragRows.slice(0, 2).map(dr => (
                  <SceneCardContent key={dr.id} row={dr} scene={scenes.find(s => s.id === dr.sceneId)} displayField={displayField} />
                ))}
                {activeDragRows.length > 2 && <div className="text-[8px] text-zinc-400 text-center">+{activeDragRows.length - 2} more</div>}
              </div>
            )}
          </React.Fragment>
        ))}
        {rows.length === 0 && <div className="text-center text-zinc-400 text-[10px] py-8">All scenes scheduled</div>}
      </div>
      <div
        className="absolute top-0 bottom-0 right-0 w-1.5 cursor-col-resize hover:bg-blue-400/40 z-30"
        onPointerDown={handleResizeStart}
        data-no-longpress
      />
    </div>
  );
};

export const CalendarTab: React.FC<{ onOpenScene?: (sceneId: string) => void }> = ({ onOpenScene }) => {
  const { state, dispatch } = useProject();
  const project = state.present;
  const activeVersion = project.versions.find(v => v.id === project.activeVersionId);

  const [calSettings, setCalSettings] = usePersistState<{ displayField: string; showBreaks: boolean; showConflicts: boolean }>('lemon_schedule_calendar_view', {
    displayField: 'set',
    showBreaks: true,
    showConflicts: true,
  });
  const { displayField, showBreaks, showConflicts } = calSettings;
  const updateCal = (patch: Partial<typeof calSettings>) => setCalSettings(prev => ({ ...prev, ...patch }));

  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [activeDragRow, setActiveDragRow] = useState<ScheduleRow | null>(null);
  const [activeDragDay, setActiveDragDay] = useState<number | null>(null);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const [statusModal, setStatusModal] = useState<{ shootDay: number; dateKey: string } | null>(null);
  const [modalStatus, setModalStatus] = useState('work');
  const [modalCastIds, setModalCastIds] = useState('');

  const handleStatusDoubleClick = useCallback((dateKey: string) => {
    let day: number | null = null;
    const meta = activeVersion?.dayMeta || {};
    for (const [k, v] of Object.entries(meta) as [string, ShootDayMeta][]) {
      if (v.date === dateKey) { day = Number(k); break; }
    }
    if (day == null) {
      const existing = Object.keys(meta).map(Number);
      day = existing.length > 0 ? Math.max(...existing) + 1 : 1;
    }
    setModalStatus(meta[day]?.status || 'work');
    setModalCastIds(meta[day]?.castIds || '');
    setStatusModal({ shootDay: day, dateKey });
  }, [activeVersion]);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [activeDragIds, setActiveDragIds] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [insertBeforeId, setInsertBeforeId] = useState<string | null>(null);
  const [lastClickedId, setLastClickedId] = useState<string | null>(null);

  const activeDragIdsRef = useRef(activeDragIds);
  activeDragIdsRef.current = activeDragIds;
  const selectedRowIdsRef = useRef(selectedRowIds);
  selectedRowIdsRef.current = selectedRowIds;

  const collisionDetection = useCallback<CollisionDetection>((args) => {
    const { active, pointerCoordinates, droppableContainers } = args;
    const isDraggingDay = active.data.current?.type === 'DAY';
    const filteredContainers = droppableContainers.filter((container) => {
      const id = container.id as string;
      const isDayHandle = id.startsWith('day-handle-');
      if (isDraggingDay) return isDayHandle;
      if (isDayHandle) return false;
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
  const marqueeMode = useMarqueeMode();
  const calendarGridRef = useRef<HTMLDivElement>(null);
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

  const days = useMemo(() => getCalendarDays(currentYear, currentMonth), [currentYear, currentMonth]);

  const workingMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const [k, v] of Object.entries(activeVersion.dayMeta || {}) as [string, ShootDayMeta][]) {
      if (v.date) m.set(v.date, Number(k));
    }
    return m;
  }, [activeVersion]);

  const statusMap = useMemo(() => {
    const m = new Map<number, string>();
    for (const [k, v] of Object.entries(activeVersion.dayMeta || {}) as [string, ShootDayMeta][]) {
      if (v.status) m.set(Number(k), v.status);
    }
    return m;
  }, [activeVersion]);

  const chronoDayMap = useMemo(() => {
    const entries = Object.entries(activeVersion.dayMeta || {}) as [string, ShootDayMeta][];
    const sorted = entries
      .filter(([, v]) => v.date && (!v.status || v.status === 'work'))
      .sort((a, b) => a[1].date.localeCompare(b[1].date));
    const m = new Map<number, number>();
    sorted.forEach(([k], i) => m.set(Number(k), i + 1));
    return m;
  }, [activeVersion]);

  const dayCastIdsMap = useMemo(() => {
    const m = new Map<number, string>();
    for (const [k, v] of Object.entries(activeVersion.dayMeta || {}) as [string, ShootDayMeta][]) {
      if (v.castIds) m.set(Number(k), v.castIds);
    }
    return m;
  }, [activeVersion]);

  const workingLabels = useMemo(() => {
    const labels = new Map<string, string>();
    const workingDates = [...workingMap.keys()].sort();
    if (workingDates.length === 0) return labels;
    labels.set(workingDates[0], 'SW');
    if (workingDates.length > 1) labels.set(workingDates[workingDates.length - 1], 'FW');
    for (let i = 1; i < workingDates.length - 1; i++) {
      labels.set(workingDates[i], 'W');
    }
    return labels;
  }, [workingMap]);

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
    for (const [k] of Object.entries(activeVersion.dayMeta || {})) {
      const day = Number(k);
      const v = checkDay(day, project.rules || [], project.scenes, activeVersion.rows, activeVersion.dayMeta, project.castMembers || []);
      if (v.length > 0) m.set(activeVersion.dayMeta[day]?.date || '', v);
    }
    return m;
  }, [activeVersion, project.rules, project.scenes, project.castMembers, showConflicts]);

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

  const sceneIdsInRows = new Set(activeVersion?.rows.filter(r => r.type === 'SCENE').map(r => r.sceneId));
  const missingScenes = project.scenes.filter(s => !sceneIdsInRows.has(s.id));

  const augmentedRows = useMemo(() => [
    ...(activeVersion?.rows || []),
    ...missingScenes.map((s, i) => ({ id: `row-synth-${s.id}`, type: 'SCENE' as const, sceneId: s.id, shootDay: null as number | null, order: 999999 + i, estimatedDuration: 30 })),
  ], [activeVersion?.rows, missingScenes]);

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
    augmentedRows,
    activeVersion,
    activeDragIds,
    textEditingEnabled: false,
    dispatch,
    setFocusedRowId,
    scrollToRow,
    setColorPicker,
    project,
  });

  const handleContextMenu = createOnContextMenu();

  const rowsByDate = useMemo(() => {
    const map = new Map<string, ScheduleRow[]>();
    if (!activeVersion) return map;
    augmentedRows.forEach(r => {
      if (r.shootDay === null) return;
      if (activeDragIds.has(r.id)) return;
      if (!showBreaks && (r.type === 'BREAK' || r.type === 'NOTE')) return;
      const meta = activeVersion.dayMeta?.[r.shootDay];
      if (!meta?.date) return;
      const dk = meta.date;
      if (!map.has(dk)) map.set(dk, []);
      map.get(dk)!.push(r);
    });
    return map;
  }, [augmentedRows, activeVersion, activeDragIds, showBreaks]);

  const unscheduledRows = useMemo(() => {
    return augmentedRows.filter(r => {
      if (activeDragIds.has(r.id)) return false;
      if (!showBreaks && (r.type === 'BREAK' || r.type === 'NOTE')) return false;
      if (r.shootDay === null) return true;
      const meta = activeVersion?.dayMeta?.[r.shootDay];
      return !meta?.date;
    }).sort((a, b) => a.order - b.order);
  }, [augmentedRows, activeVersion, activeDragIds, showBreaks]);

  const handleToggle = useCallback((dateKey: string) => {
    if (activeTool) {
      if (activeTool === 'remove') {
        const meta = (activeVersion?.dayMeta ?? {}) as Record<number, ShootDayMeta>;
        if (!Object.values(meta).some(v => v.date === dateKey)) return;
        dispatch({ type: 'TOGGLE_WORKING_DAY', date: dateKey });
      } else {
        const meta = activeVersion?.dayMeta || {};
        let shootDay: number | null = null;
        for (const [k, v] of Object.entries(meta) as [string, ShootDayMeta][]) {
          if (v.date === dateKey) { shootDay = Number(k); break; }
        }
        if (shootDay == null) {
          const existing = Object.keys(meta).map(Number);
          shootDay = existing.length > 0 ? Math.max(...existing) + 1 : 1;
        }
        dispatch({ type: 'UPDATE_DAY_META' as any, shootDay, date: dateKey, status: activeTool });
      }
      return;
    }
    dispatch({ type: 'TOGGLE_WORKING_DAY', date: dateKey });
  }, [dispatch, activeTool, activeVersion]);

  const sortUnscheduled = useCallback((criterion: 'scene_number' | 'script_day' | 'page_count' | 'set_name') => {
    if (!activeVersion) return;
    const scheduled = activeVersion.rows.filter(r => r.shootDay !== null);
    const sceneIdsInRows = new Set(activeVersion.rows.filter(r => r.type === 'SCENE').map(r => r.sceneId));
    const missingScenes = project.scenes.filter(s => !sceneIdsInRows.has(s.id));
    const unscheduled: ScheduleRow[] = [
      ...activeVersion.rows.filter(r => r.shootDay === null),
      ...missingScenes.map(s => ({ id: generateUUID(), type: 'SCENE' as const, sceneId: s.id, shootDay: null as number | null, order: 999999, estimatedDuration: 30 })),
    ];
    unscheduled.sort((a, b) => {
      if (a.type !== 'SCENE' && b.type === 'SCENE') return 1;
      if (a.type === 'SCENE' && b.type !== 'SCENE') return -1;
      if (a.type !== 'SCENE' && b.type !== 'SCENE') return 0;
      const sA = project.scenes.find(s => s.id === a.sceneId);
      const sB = project.scenes.find(s => s.id === b.sceneId);
      if (!sA || !sB) return 0;
      if (criterion === 'scene_number') return sA.sceneNumber.localeCompare(sB.sceneNumber, undefined, { numeric: true, sensitivity: 'base' });
      if (criterion === 'script_day') return sA.scriptDay.localeCompare(sB.scriptDay, undefined, { numeric: true, sensitivity: 'base' });
      if (criterion === 'page_count') return sB.pageCountDecimal - sA.pageCountDecimal;
      if (criterion === 'set_name') return sA.set.localeCompare(sB.set);
      return 0;
    });
    const combined = [...scheduled, ...unscheduled];
    combined.forEach((r, i) => { r.order = i; });
    dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, rows: combined } });
  }, [activeVersion, project.scenes, dispatch]);

  const handleRowClick = (id: string, e: React.MouseEvent) => {
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
      const allIds = augmentedRows.map(r => r.id);
      const idxA = allIds.indexOf(lastClickedId);
      const idxB = allIds.indexOf(id);
      if (idxA >= 0 && idxB >= 0) setSelectedRowIds(new Set(allIds.slice(Math.min(idxA, idxB), Math.max(idxA, idxB) + 1)));
    } else {
      setSelectedRowIds(new Set([id]));
      setLastClickedId(id);
    }
  };

  const handleRowDoubleClick = useCallback((id: string) => {
    if (marqueeMode !== 'off') return;
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
      const rowEl = activeEl.closest(`[data-row-id="${id}"]`);
      if (rowEl) return;
    }
    const row = activeVersion?.rows.find(r => r.id === id);
    if (row?.type === 'NOTE') {
      setColorPicker({ rowId: row.id, bg: row.noteColor || '#591b1b', text: row.noteTextColor || '#ffffff', noteText: row.noteText || '', originalBg: row.noteColor || '#591b1b', originalText: row.noteTextColor || '#ffffff', originalNoteText: row.noteText || '' });
    } else if (row?.type === 'SCENE' && row.sceneId && onOpenScene) {
      onOpenScene(row.sceneId);
    }
  }, [activeVersion, onOpenScene, marqueeMode]);

  const applyNoteColor = useCallback(() => {
    if (!colorPicker || !activeVersion) return;
    const newRows = activeVersion.rows.map(r =>
      r.id === colorPicker.rowId ? { ...r, noteColor: colorPicker.bg, noteTextColor: colorPicker.text, noteText: colorPicker.noteText } : r
    );
    dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, rows: newRows } });
    setColorPicker(null);
  }, [colorPicker, activeVersion, dispatch]);

  const activeType = activeId ? (activeDragDay !== null ? 'DAY' : 'SCENE_CARD') : null;

  const activeDragRows = useMemo(() => {
    if (!activeId || activeType !== 'SCENE_CARD') return [];
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
      : [augmentedRows.find(r => r.id === activeId)!].filter(Boolean);
  }, [activeId, activeType, activeDragIds, augmentedRows]);

  const handleDragStart = (e: DragStartEvent) => {
    if (isAddModeActive()) return;
    const data = e.active.data.current as any;
    setActiveId(e.active.id as string);
    if (data?.type === 'DAY') {
      setActiveDragDay(data.shootDay);
      setActiveDragRow(null);
      setActiveDragIds(new Set());
    } else {
      const draggedId = e.active.id as string;
      const currentSelection = selectedRowIdsRef.current;
      if (currentSelection.has(draggedId) && currentSelection.size > 1) {
        setActiveDragIds(new Set(currentSelection));
      } else {
        if (currentSelection.size > 0) {
          setSelectedRowIds(new Set());
        }
        setActiveDragIds(new Set([draggedId]));
      }
      setActiveDragRow(augmentedRows.find(r => r.id === draggedId) || null);
      setActiveDragDay(null);
    }
  };

  const handleDragOver = (e: DragOverEvent) => {
    const overId = e.over?.id as string | undefined;
    if (!overId || activeType !== 'SCENE_CARD') { setInsertBeforeId(null); return; }
    if (overId === 'unscheduled') { setInsertBeforeId('end-unscheduled'); return; }
    if (overId.startsWith('end-')) { setInsertBeforeId(overId); return; }
    if (overId.startsWith('day-')) { setInsertBeforeId(overId); return; }
    setInsertBeforeId(overId);
  };

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    const lastInsertId = insertBeforeId;
    setActiveId(null);
    setActiveDragRow(null);
    setActiveDragIds(new Set());
    setInsertBeforeId(null);
    if (!over || !activeVersion) return;

    const activeData = active.data.current as any;

    if (activeData?.type === 'DAY') {
      const sourceDay = activeData.shootDay as number;
      const sourceDate = activeData.date as string;
      const overData = over.data.current as any;
      let targetDate: string | null = null;
      if (overData?.type === 'DAY_CELL' && typeof overData.date === 'string') targetDate = overData.date;
      else if (typeof over.id === 'string' && over.id.startsWith('day-')) targetDate = over.id.slice(4);
      if (!targetDate || sourceDate === targetDate) return;
      const targetEntry = (Object.entries(activeVersion.dayMeta) as [string, ShootDayMeta][]).find(([, m]) => m.date === targetDate);
      const newDayMeta = { ...activeVersion.dayMeta };
      newDayMeta[sourceDay] = { ...newDayMeta[sourceDay], date: targetDate };
      if (targetEntry) newDayMeta[Number(targetEntry[0])] = { ...newDayMeta[Number(targetEntry[0])], date: sourceDate };
      dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, dayMeta: newDayMeta } });
      return;
    }

    const draggedId = active.id as string;
    const allSelected = new Set(activeDragIds);
    const draggingIds = allSelected.size > 1 ? Array.from(allSelected) : [draggedId];
    draggingIds.sort((a, b) => {
      const rA = augmentedRows.find(r => r.id === a);
      const rB = augmentedRows.find(r => r.id === b);
      if (rA && rB) {
        if (rA.shootDay !== rB.shootDay) return (rA.shootDay || 0) - (rB.shootDay || 0);
        return rA.order - rB.order;
      }
      return 0;
    });

    let targetShootDay: number | null = null;
    const overData = over.data.current as any;
    if (over.id === 'unscheduled') targetShootDay = null;
    else if (overData?.type === 'DAY_CELL' && overData.shootDay != null) targetShootDay = overData.shootDay;
    else if (typeof over.id === 'string' && over.id.startsWith('day-')) {
      const raw = over.id.slice(4);
      const meta = activeVersion.dayMeta || {};
      const dateMap = new Map((Object.entries(meta) as [string, ShootDayMeta][]).map(([k, v]) => [v.date || '', Number(k)]));
      targetShootDay = dateMap.get(raw) ?? null;
    } else {
      const overRow = augmentedRows.find(r => r.id === over.id);
      if (overRow && overRow.shootDay != null) targetShootDay = overRow.shootDay;
    }

    if (targetShootDay != null) {
      const targetStatus = statusMap.get(targetShootDay);
      if (targetStatus && targetStatus !== 'work') return;
    }

    if (targetShootDay === undefined) return;

    let newRows = activeVersion.rows.map(r => ({ ...r }));
    const sanitizeRow = (r: ScheduleRow) => {
      if (r.id.startsWith('row-synth-')) return { ...r, id: generateUUID() };
      return r;
    };

    if (draggingIds.length === 1) {
      newRows = newRows.filter(r => r.id !== draggedId);
      let dayRows = newRows.filter(r => r.shootDay === targetShootDay).sort((a, b) => a.order - b.order);
      let insertIndex: number;
      if (lastInsertId?.startsWith('day-')) {
        insertIndex = dayRows.length;
      } else if (lastInsertId?.startsWith('end-')) {
        insertIndex = dayRows.length;
      } else if (lastInsertId && dayRows.some(r => r.id === lastInsertId)) {
        insertIndex = dayRows.findIndex(r => r.id === lastInsertId);
        if (insertIndex === -1) insertIndex = dayRows.length;
      } else {
        insertIndex = dayRows.length;
      }
      const sourceRow = augmentedRows.find(r => r.id === draggedId) || activeVersion.rows.find(r => r.id === draggedId);
      if (!sourceRow) { setSelectedRowIds(new Set()); return; }
      const movedRow = { ...sourceRow, shootDay: targetShootDay };
      dayRows.splice(insertIndex, 0, movedRow);
      dayRows.forEach((r, i) => r.order = i);
      newRows = [...newRows.filter(r => r.shootDay !== targetShootDay), ...dayRows];
      setSelectedRowIds(new Set([draggedId]));
    } else {
      const draggingItems = draggingIds
        .map(id => augmentedRows.find(r => r.id === id) || activeVersion.rows.find(r => r.id === id))
        .filter(Boolean) as ScheduleRow[];
      const dayRowsBefore = newRows.filter(r => r.shootDay === targetShootDay).sort((a, b) => a.order - b.order);
      let rawIndex: number;
      if (lastInsertId?.startsWith('day-')) {
        rawIndex = dayRowsBefore.length;
      } else if (lastInsertId?.startsWith('end-')) {
        rawIndex = dayRowsBefore.length;
      } else if (lastInsertId && dayRowsBefore.some(r => r.id === lastInsertId)) {
        rawIndex = dayRowsBefore.findIndex(r => r.id === lastInsertId);
        if (rawIndex === -1) rawIndex = dayRowsBefore.length;
      } else {
        rawIndex = dayRowsBefore.length;
      }
      const insertIndex = rawIndex === 0 ? 0 : rawIndex - draggingIds.filter(id => {
        const idx = dayRowsBefore.findIndex(r => r.id === id);
        return idx >= 0 && idx < rawIndex;
      }).length;

      newRows = newRows.filter(r => !draggingIds.includes(r.id));
      const dayRows = newRows.filter(r => r.shootDay === targetShootDay).sort((a, b) => a.order - b.order);
      const newItems = draggingItems.map(item => ({ ...item, shootDay: targetShootDay }));
      dayRows.splice(insertIndex, 0, ...newItems);
      dayRows.forEach((r, i) => r.order = i);
      newRows = [...newRows.filter(r => r.shootDay !== targetShootDay), ...dayRows];
      setSelectedRowIds(new Set(draggingIds));
    }

    const persistentRows = newRows.map(sanitizeRow);
    dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, rows: persistentRows } });
  };

  const goPrev = () => { if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(y => y - 1); } else setCurrentMonth(m => m - 1); };
  const goNext = () => { if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(y => y + 1); } else setCurrentMonth(m => m + 1); };

  const monthName = new Date(currentYear, currentMonth).toLocaleString('en-US', { month: 'long', year: 'numeric' });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelectedRowIds(new Set()); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  if (!activeVersion) return <div className="p-8 text-zinc-500">No active version</div>;

  return (
    <>
    <DndContext sensors={sensors} collisionDetection={collisionDetection} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
      <div className="flex-1 flex overflow-hidden min-h-0" style={{ fontFamily: 'Helvetica, sans-serif', fontSize: '11px' }} onContextMenu={handleContextMenu}>
        <UnscheduledSidebar rows={unscheduledRows} scenes={project.scenes} displayField={displayField} sceneViolationMap={sceneViolationMap} activeDragRows={activeDragRows} insertBeforeId={insertBeforeId} activeRowId={activeId} activeDragIds={activeDragIds} selectedIds={selectedRowIds} onRowClick={handleRowClick} onSort={sortUnscheduled} onRowDoubleClick={handleRowDoubleClick} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-200 bg-white">
            <div className="flex items-center gap-3">
              <button onClick={goPrev} className="p-1 hover:bg-zinc-100 rounded"><ChevronLeft className="w-4 h-4" /></button>
              <h2 className="font-semibold text-sm">{monthName}</h2>
              <button onClick={goNext} className="p-1 hover:bg-zinc-100 rounded"><ChevronRight className="w-4 h-4" /></button>
            </div>
            <div className="flex items-center gap-3">
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
          </div>
          <div className="flex items-center gap-1 px-3 py-1.5 border-b border-zinc-200 bg-white">
            {[
              { key: null, label: <Pointer className="w-3 h-3" />, title: 'Select' },
              { key: 'work', label: 'W', title: 'Work' },
              { key: 'hold', label: 'H', title: 'Hold' },
              { key: 'travel', label: 'T', title: 'Travel' },
              { key: 'holiday', label: 'HOL', title: 'Holiday' },
              { key: 'remove', label: <Eraser className="w-3 h-3" />, title: 'Erase' },
            ].map(t => (
              <button key={t.key || 'none'} type="button"
                onClick={() => setActiveTool(prev => prev === t.key ? null : t.key)}
                title={t.title}
                className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${activeTool === t.key ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:bg-zinc-100'}`}
              >{t.label}</button>
            ))}
          </div>
          <div ref={calendarGridRef} className="flex-1 overflow-y-auto min-h-0 relative" style={{ touchAction: IS_COARSE ? 'pan-y' : undefined }}>
            <div className="grid grid-cols-7 sticky top-0 z-10 border-l border-t border-zinc-200 bg-zinc-50">
              {DAY_NAMES.map(n => <div key={n} className="text-center text-[10px] font-semibold text-zinc-500 py-1.5 border-r border-b border-zinc-200 bg-zinc-50">{n}</div>)}
            </div>
            <MarqueeOverlay box={marqueeBox} />
            <div className="grid grid-cols-7 border-l border-zinc-200">
               {days.map((day, idx) => {
                const prev = idx > 0 ? days[idx - 1] : null;
                const firstOfCurrentMonth = day.isCurrentMonth && (!prev || !prev.isCurrentMonth);
                const firstOfNextMonth = !day.isCurrentMonth && prev?.isCurrentMonth;
                const nextYear = currentMonth === 11 ? currentYear + 1 : currentYear;
                const nextMonth = currentMonth === 11 ? 0 : currentMonth + 1;
                const monthSeparator = firstOfCurrentMonth
                  ? new Date(currentYear, currentMonth).toLocaleString('en-US', { month: 'long', year: 'numeric' })
                  : firstOfNextMonth
                  ? new Date(nextYear, nextMonth).toLocaleString('en-US', { month: 'long', year: 'numeric' })
                  : null;
                const sd = workingMap.get(day.dateKey) ?? null;
                  return (
                  <DayCell key={day.dateKey}
                    dateKey={day.dateKey} date={day.date}
                    isCurrentMonth={day.isCurrentMonth} isToday={day.isToday}
                    isWorkingDay={sd !== null} shootDay={sd}
                    status={sd != null ? statusMap.get(sd) : undefined}
                    chronoDay={sd != null ? chronoDayMap.get(sd) : undefined}
                    dayCastIds={sd != null ? dayCastIdsMap.get(sd) : undefined}
                    monthSeparator={monthSeparator}
                    activeTool={activeTool}
                    onDoubleClick={(day) => handleStatusDoubleClick(day)}
                    label={workingLabels.get(day.dateKey) ?? null}
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
                    onRowDoubleClick={handleRowDoubleClick}
                  />
                );
              })}
              </div>
          </div>
        </div>
      </div>
      <DragOverlay dropAnimation={null} style={{ pointerEvents: 'none' }}>
        {activeDragRows.length > 0 ? (
          <div className="flex flex-col gap-0.5 opacity-90">
            {activeDragRows.slice(0, 3).map(r => (
              <SceneCardContent key={r.id} row={r} scene={project.scenes.find(s => s.id === r.sceneId)} displayField={displayField} />
            ))}
            {activeDragRows.length > 3 && <div className="text-[9px] text-center text-zinc-500">+{activeDragRows.length - 3} more</div>}
          </div>
        ) : activeDragDay !== null ? (() => {
          const dragStatus = activeVersion?.dayMeta?.[activeDragDay]?.status;
          const ghostHeader = dragStatus === 'hold' ? 'bg-red-600 text-white'
            : dragStatus === 'travel' ? 'bg-purple-600 text-white'
            : dragStatus === 'holiday' ? 'bg-green-700 text-white'
            : 'bg-zinc-700 text-white';
          return (
          <div className="bg-zinc-50 border border-zinc-300 shadow-xl flex flex-col w-[200px] opacity-90">
            <div className={`flex items-center justify-between px-2 py-1.5 ${ghostHeader}`}>
              <span className="text-[10px] font-bold">{activeVersion?.dayMeta?.[activeDragDay]?.date ? new Date(activeVersion.dayMeta[activeDragDay].date + 'T00:00:00').getDate() : activeDragDay}</span>
              <span className="text-[10px] font-bold uppercase tracking-wider">
                {dragStatus === 'hold' ? 'HOLD' : dragStatus === 'travel' ? 'TRAVEL' : dragStatus === 'holiday' ? 'HOLIDAY' : chronoDayMap.get(activeDragDay) ? `DAY #${chronoDayMap.get(activeDragDay)}` : ''}
              </span>
              <span className="w-4" />
            </div>
            <div className="flex flex-col gap-0.5 p-1.5">
              {augmentedRows.filter(r => r.shootDay === activeDragDay).map(r => (
                <SceneCardContent key={r.id} row={r} scene={project.scenes.find(s => s.id === r.sceneId)} displayField={displayField} />
              ))}
              {augmentedRows.filter(r => r.shootDay === activeDragDay).length === 0 && (
                <div className="text-[9px] text-zinc-400 text-center py-2">No scenes</div>
              )}
            </div>
          </div>
          ) })() : null}
      </DragOverlay>

      {statusModal !== null && (
        <Modal open onClose={() => setStatusModal(null)} title={`Day ${statusModal.shootDay}`} width="max-w-sm"
          footer={
            <div className="flex items-center justify-between px-6 py-2.5 border-t border-zinc-800">
              <button type="button"
                onClick={() => { dispatch({ type: 'TOGGLE_WORKING_DAY' as any, date: statusModal.dateKey }); setStatusModal(null); }}
                className="text-xs font-medium text-rose-400 hover:bg-rose-950/40 px-2 py-1 rounded transition-colors"
              >Remove</button>
              <button type="button"
                onClick={() => { dispatch({ type: 'UPDATE_DAY_META' as any, shootDay: statusModal.shootDay, date: statusModal.dateKey, status: modalStatus, castIds: modalCastIds || '' }); setStatusModal(null); }}
                className="px-4 py-1.5 rounded-md text-xs font-bold bg-zinc-800 text-white border border-zinc-700 hover:bg-zinc-700 transition-colors"
              >Apply</button>
            </div>
          }
        >
          <div className="p-4 space-y-2">
            {(['work', 'hold', 'travel', 'holiday'] as const).map(s => (
              <button key={s} type="button"
                onClick={() => setModalStatus(s)}
                className={`w-full text-left px-3 py-2 rounded-md text-xs font-medium transition-colors flex items-center gap-2 ${modalStatus === s ? 'bg-zinc-800 text-white border border-zinc-700' : 'text-zinc-400 hover:bg-zinc-900 border border-zinc-800'}`}
              >
                <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${modalStatus === s ? 'border-white' : 'border-zinc-600'}`}>
                  {modalStatus === s && <span className="w-2 h-2 bg-white rounded-full" />}
                </span>
                {s === 'work' ? 'Work' : s === 'hold' ? 'Hold' : s === 'travel' ? 'Travel' : 'Holiday'}
              </button>
            ))}
            {(modalStatus === 'hold' || modalStatus === 'travel') && (
              <div className="pt-1">
                <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 font-semibold">Cast Members</div>
                <EntityDropdown
                  value={modalCastIds}
                  onChange={v => setModalCastIds(v)}
                  items={(project.castMembers || []).map(m => ({ id: m.id, name: m.name }))}
                  positioning="fixed"
                  mode="multi"
                  displayMode="id"
                  placeholder="e.g. 1, 2, 3"
                  className="text-xs"
                  renderItem={(item) => (
                    <>
                      <span className="text-zinc-400 shrink-0">{item.id}.</span>
                      <span className="truncate flex-1">{item.name && item.name !== item.id ? item.name : '—'}</span>
                    </>
                  )}
                />
              </div>
            )}
          </div>
        </Modal>
      )}
      {contextMenu && contextMenu.rowId.startsWith('empty-date-') ? (
        <ContextMenu open={true} x={contextMenu.x} y={contextMenu.y} onClose={() => setContextMenu(null)} containerRef={calendarGridRef}>
          <ContextMenuItem onClick={() => { dispatch({ type: 'TOGGLE_WORKING_DAY', date: contextMenu.rowId.replace('empty-date-', '') }); setContextMenu(null); }} icon={<Plus className="w-3.5 h-3.5" />}>Make Working Day</ContextMenuItem>
          <ContextMenuItem onClick={() => { const dk = contextMenu.rowId.replace('empty-date-', ''); const m = activeVersion?.dayMeta || {}; const existing = Object.keys(m).map(Number); const sd = existing.length > 0 ? Math.max(...existing) + 1 : 1; dispatch({ type: 'UPDATE_DAY_META' as any, shootDay: sd, date: dk, status: 'hold' }); setContextMenu(null); }} icon={<Pause className="w-3.5 h-3.5" />}>Hold</ContextMenuItem>
          <ContextMenuItem onClick={() => { const dk = contextMenu.rowId.replace('empty-date-', ''); const m = activeVersion?.dayMeta || {}; const existing = Object.keys(m).map(Number); const sd = existing.length > 0 ? Math.max(...existing) + 1 : 1; dispatch({ type: 'UPDATE_DAY_META' as any, shootDay: sd, date: dk, status: 'travel' }); setContextMenu(null); }} icon={<Plane className="w-3.5 h-3.5" />}>Travel</ContextMenuItem>
          <ContextMenuItem onClick={() => { const dk = contextMenu.rowId.replace('empty-date-', ''); const m = activeVersion?.dayMeta || {}; const existing = Object.keys(m).map(Number); const sd = existing.length > 0 ? Math.max(...existing) + 1 : 1; dispatch({ type: 'UPDATE_DAY_META' as any, shootDay: sd, date: dk, status: 'holiday' }); setContextMenu(null); }} icon={<Sun className="w-3.5 h-3.5" />}>Holiday</ContextMenuItem>
        </ContextMenu>
      ) : contextMenu ? (
        <StripboardContextMenuContent
          contextMenu={contextMenu}
          setContextMenu={setContextMenu}
          augmentedRows={augmentedRows}
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
          extraItems={contextMenu.rowId.startsWith('empty-') ? (
            <>
              <ContextMenuItem onClick={() => { const dk = (activeVersion?.dayMeta[contextMenu.shootDay!] || {}).date; if (dk) { dispatch({ type: 'UPDATE_DAY_META' as any, shootDay: contextMenu.shootDay, date: dk, status: 'work' }); setContextMenu(null); } }} icon={<Briefcase className="w-3.5 h-3.5" />}>Work</ContextMenuItem>
              <ContextMenuItem onClick={() => { const dk = (activeVersion?.dayMeta[contextMenu.shootDay!] || {}).date; if (dk) { dispatch({ type: 'UPDATE_DAY_META' as any, shootDay: contextMenu.shootDay, date: dk, status: 'hold' }); setContextMenu(null); } }} icon={<Pause className="w-3.5 h-3.5" />}>Hold</ContextMenuItem>
              <ContextMenuItem onClick={() => { const dk = (activeVersion?.dayMeta[contextMenu.shootDay!] || {}).date; if (dk) { dispatch({ type: 'UPDATE_DAY_META' as any, shootDay: contextMenu.shootDay, date: dk, status: 'travel' }); setContextMenu(null); } }} icon={<Plane className="w-3.5 h-3.5" />}>Travel</ContextMenuItem>
              <ContextMenuItem onClick={() => { const dk = (activeVersion?.dayMeta[contextMenu.shootDay!] || {}).date; if (dk) { dispatch({ type: 'UPDATE_DAY_META' as any, shootDay: contextMenu.shootDay, date: dk, status: 'holiday' }); setContextMenu(null); } }} icon={<Sun className="w-3.5 h-3.5" />}>Holiday</ContextMenuItem>
              <ContextMenuDivider />
              <ContextMenuItem onClick={() => { const dk = (activeVersion?.dayMeta[contextMenu.shootDay!] || {}).date; if (dk) dispatch({ type: 'TOGGLE_WORKING_DAY', date: dk }); setContextMenu(null); }} variant="danger" icon={<Trash2 className="w-3.5 h-3.5" />}>
                Remove Working Day
              </ContextMenuItem>
            </>
          ) : undefined}
        />
      ) : null}
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
    </DndContext>
    </>
  );
};