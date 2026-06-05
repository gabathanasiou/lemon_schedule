import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { DndContext, useDraggable, useDroppable, DragEndEvent, DragStartEvent, DragOverlay, DragOverEvent, PointerSensor, useSensor, useSensors, rectIntersection } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useProject } from '../store';
import { ScheduleRow, Scene, ShootDayMeta, RuleViolation } from '../types';
import { generateUUID } from '../lib/utils';
import { ChevronLeft, ChevronRight, GripVertical, Flag, X } from 'lucide-react';
import { checkDay } from '../lib/rulesEngine';
import { Tooltip } from './Tooltip';
import { useMarquee, MarqueeOverlay, useAddMode, isAddModeActive } from '../lib/useMarquee';

const SIDEBAR_KEY = 'lemon_schedule_calendar_sidebar_width';

const DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getCalendarDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const startOfWeek = firstDay.getDay();
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

function sceneColor(scene?: Scene | null) {
  if (!scene) return { bg: '#591b1b', text: '#ffffff' };
  const ie = (scene.intExt || '').toUpperCase();
  const dn = (scene.dayNight || '').toUpperCase();
  if (ie.includes('INT') && dn.includes('DAY')) return { bg: '#ffffff', text: '#464646' };
  if (ie.includes('EXT') && dn.includes('DAY')) return { bg: '#bdd857', text: '#000000' };
  if (ie.includes('INT') && dn.includes('NIGHT')) return { bg: '#67832e', text: '#f2fce3' };
  if (ie.includes('EXT') && dn.includes('NIGHT')) return { bg: '#2148a7', text: '#ffffff' };
  if (ie.includes('INT') && dn.includes('MORNING')) return { bg: '#efbea0', text: '#4a3730' };
  if (ie.includes('EXT') && dn.includes('MORNING')) return { bg: '#e88aa5', text: '#ffffff' };
  if (ie.includes('INT') && dn.includes('EVENING')) return { bg: '#e29926', text: '#000000' };
  if (ie.includes('EXT') && dn.includes('EVENING')) return { bg: '#ce7d21', text: '#000000' };
  return { bg: '#ffffff', text: '#18181b' };
}

const SceneCardContent: React.FC<{ row: ScheduleRow; scene?: Scene; showDesc?: boolean; violations?: string[] }> = ({ row, scene, showDesc, violations }) => {
  if (!scene) {
    const label = row.type === 'BREAK' ? row.breakLabel || 'BREAK' : row.type === 'NOTE' ? row.noteText || 'Note' : null;
    if (!label) return null;
    return (
      <div className={`text-[9px] font-semibold bg-[#591b1b] text-white px-1.5 py-0.5 rounded truncate mb-0.5 ${row.type === 'NOTE' ? 'italic' : ''}`}>
        {label}
      </div>
    );
  }
  const c = sceneColor(scene);
  const vFlag = violations && violations.length > 0 ? (
    <Tooltip content={violations.join('\n• ')}>
      <Flag className="w-2 h-2 text-red-500 fill-red-500 shrink-0" />
    </Tooltip>
  ) : null;
  return (
    <div style={{ background: c.bg, color: c.text }} className="text-[9px] truncate px-1.5 py-0.5 rounded mb-0.5 leading-tight whitespace-nowrap font-semibold flex items-center gap-0.5">
      <span className="truncate">{scene.sceneNumber}. {showDesc && scene.description ? scene.description : scene.set}</span>
      {vFlag}
    </div>
  );
};

const SceneCard: React.FC<{ row: ScheduleRow; scene?: Scene; showDesc?: boolean; violations?: string[]; isSelected?: boolean; isFaded?: boolean; onToggle?: (id: string, e: React.MouseEvent) => void }> = ({ row, scene, showDesc, violations, isSelected, isFaded, onToggle }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.id,
    data: { type: 'SCENE_CARD', row, scene },
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    ...(isDragging ? { opacity: 0.3 } : {}),
  };
    return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}
      onClick={(e) => onToggle?.(row.id, e)}
      data-row-id={row.id}
      className={`${isSelected ? 'before:absolute before:inset-0 before:bg-black/15 before:pointer-events-none before:z-10 before:content-[\'\'] relative' : ''}`}>
      <SceneCardContent row={row} scene={scene} showDesc={showDesc} violations={violations} />
      {isFaded && <div className="absolute inset-0 bg-white/50 pointer-events-none" />}
    </div>
  );
};

const DayCell: React.FC<{
  dateKey: string; date: Date; isCurrentMonth: boolean; isToday: boolean;
  isWorkingDay: boolean; shootDay: number | null; label: string | null;
  rows: ScheduleRow[]; scenes: Scene[]; showDesc: boolean;
  violations: RuleViolation[];
  sceneViolationMap: Map<string, string[]>;
  onToggle: (dateKey: string) => void;
  onDoubleClick?: (shootDay: number) => void;
  status?: string;
  selectedIds?: Set<string>;
  activeDragIds?: Set<string>;
  onRowClick?: (id: string, e: React.MouseEvent) => void;
  insertBeforeId?: string | null;
  activeDragRow?: ScheduleRow | null;
  activeDragRows?: ScheduleRow[];
  activeRowId?: string | null;
}> = ({ dateKey, date, isCurrentMonth, isToday, isWorkingDay, shootDay, label, rows, scenes, showDesc, violations, sceneViolationMap, onToggle, onDoubleClick, status, selectedIds, activeDragIds, onRowClick, insertBeforeId, activeDragRow, activeDragRows = [], activeRowId }) => {
  const { setNodeRef, isOver } = useDroppable({
    id: `day-${dateKey}`,
    data: { type: 'DAY_CELL', date: dateKey, shootDay },
  });

  const { attributes, listeners, setNodeRef: setHandleRef, isDragging } = useDraggable({
    id: shootDay !== null ? `day-handle-${shootDay}` : 'day-handle-inactive',
    data: shootDay !== null ? { type: 'DAY', shootDay, date: dateKey } : {},
    disabled: !isWorkingDay || shootDay === null,
  });

  const statusBadge = status === 'hold' ? 'H' : status === 'travel' ? 'T' : status === 'holiday' ? 'HOL' : null;
  const statusBg = status === 'hold' ? 'bg-amber-50' : status === 'travel' ? 'bg-blue-50' : status === 'holiday' ? 'bg-zinc-100' : '';

  return (
    <div ref={setNodeRef}
      className={`min-h-[80px] h-full border-r border-b border-zinc-200 p-1 flex flex-col
        ${!isCurrentMonth ? 'bg-zinc-50/50 text-zinc-300' : !isWorkingDay && !status ? 'bg-zinc-100 text-zinc-400' : statusBg || 'bg-white'}
        ${isOver ? '!bg-blue-50' : ''}`}
    >
      <div className="flex items-center justify-between mb-0.5">
        <div className="flex items-center gap-0.5">
          <button
            onClick={(e) => { e.stopPropagation(); onToggle(dateKey); }}
            onDoubleClick={(e) => { e.preventDefault(); if (shootDay != null && onDoubleClick) onDoubleClick(shootDay); }}
            className={`text-[10px] font-semibold px-0.5 rounded flex items-center justify-center
              ${isToday ? 'bg-blue-500 text-white w-5 h-5' : !isWorkingDay && isCurrentMonth && !status ? 'text-zinc-300 hover:bg-zinc-200' : isCurrentMonth ? 'text-zinc-600 hover:bg-zinc-200' : 'text-zinc-200'}`}
            title={isWorkingDay ? 'Double-click to set status' : 'Add working day'}
          >
            {date.getDate()}
          </button>
          {statusBadge && (
            <span className={`text-[7px] font-bold px-0.5 rounded ${status === 'hold' ? 'bg-amber-100 text-amber-700' : status === 'travel' ? 'bg-blue-100 text-blue-700' : 'bg-zinc-200 text-zinc-600'}`}>{statusBadge}</span>
          )}
        </div>
        {violations.length > 0 && (
          <Tooltip content={violations.map(v => v.message).join('\n• ')}>
            <Flag className="w-2.5 h-2.5 text-red-400 fill-red-400 shrink-0" />
          </Tooltip>
        )}
        {isWorkingDay && shootDay !== null && label && (
          <div ref={setHandleRef} {...listeners} {...attributes}
            style={{ opacity: isDragging ? 0.3 : 1, cursor: 'grab' }}
            className="flex items-center gap-1 text-[7px] font-bold text-green-600 select-none hover:text-green-800 group"
            title={`Day ${shootDay} — drag to move`}>
            {label}
            <GripVertical className="w-3 h-3 opacity-40 group-hover:opacity-100" />
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto min-h-0">
        <SortableContext items={rows.map(r => r.id)} strategy={verticalListSortingStrategy}>
          {rows.map((r, i, arr) => (
            <React.Fragment key={r.id}>
              {activeRowId && activeDragRows.length > 0 && insertBeforeId === r.id && (
                <div className="opacity-40 flex flex-col gap-0 mb-0.5">
                  {activeDragRows.slice(0, 3).map(dr => (
                    <SceneCardContent key={dr.id} row={dr} scene={scenes.find(s => s.id === dr.sceneId)} showDesc={false} />
                  ))}
                  {activeDragRows.length > 3 && <div className="text-[8px] text-zinc-400 text-center">+{activeDragRows.length - 3} more</div>}
                </div>
              )}
              <SceneCard row={r} scene={scenes.find(s => s.id === r.sceneId)} showDesc={showDesc} violations={sceneViolationMap.get(r.sceneId || '')} isSelected={selectedIds?.has(r.id) ?? false} isFaded={activeDragIds?.has(r.id) ?? false} onToggle={onRowClick} />
              {activeRowId && activeDragRows.length > 0 && i === arr.length - 1 && insertBeforeId === `day-${dateKey}` && (
                <div className="opacity-40 flex flex-col gap-0 mb-0.5">
                  {activeDragRows.slice(0, 3).map(dr => (
                    <SceneCardContent key={dr.id} row={dr} scene={scenes.find(s => s.id === dr.sceneId)} showDesc={false} />
                  ))}
                  {activeDragRows.length > 3 && <div className="text-[8px] text-zinc-400 text-center">+{activeDragRows.length - 3} more</div>}
                </div>
              )}
            </React.Fragment>
          ))}
        </SortableContext>
      </div>
    </div>
  );
};

const UnscheduledSidebar: React.FC<{
  rows: ScheduleRow[];
  scenes: Scene[];
  showDesc: boolean;
  sceneViolationMap: Map<string, string[]>;
  activeDragRows?: ScheduleRow[];
  insertBeforeId?: string | null;
  activeRowId?: string | null;
  activeDragIds?: Set<string>;
  selectedIds?: Set<string>;
  onRowClick?: (id: string, e: React.MouseEvent) => void;
  onSort?: (criterion: 'scene_number' | 'script_day' | 'page_count' | 'set_name') => void;
}> = ({ rows, scenes, showDesc, sceneViolationMap, activeDragRows = [], insertBeforeId, activeRowId, activeDragIds, selectedIds, onRowClick, onSort }) => {
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

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const startX = e.clientX;
    const startWidth = panelRef.current?.offsetWidth || widthRef.current;
    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.min(400, Math.max(160, startWidth + e.clientX - startX));
      widthRef.current = newWidth;
      if (panelRef.current) panelRef.current.style.width = `${newWidth}px`;
    };
    const handleMouseUp = () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setWidth(widthRef.current);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
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
                  <SceneCardContent key={dr.id} row={dr} scene={scenes.find(s => s.id === dr.sceneId)} showDesc={false} />
                ))}
                {activeDragRows.length > 2 && <div className="text-[8px] text-zinc-400 text-center">+{activeDragRows.length - 2} more</div>}
              </div>
            )}
            <SceneCard row={r} scene={scenes.find(s => s.id === r.sceneId)} showDesc={showDesc} violations={sceneViolationMap.get(r.sceneId || '')} isSelected={selectedIds?.has(r.id) ?? false} isFaded={activeDragIds?.has(r.id) ?? false} onToggle={onRowClick} />
            {activeRowId && activeDragRows.length > 0 && i === arr.length - 1 && insertBeforeId === 'end-unscheduled' && (
              <div className="opacity-40 flex flex-col gap-0 mt-0.5">
                {activeDragRows.slice(0, 2).map(dr => (
                  <SceneCardContent key={dr.id} row={dr} scene={scenes.find(s => s.id === dr.sceneId)} showDesc={false} />
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
        onMouseDown={handleResizeStart}
      />
    </div>
  );
};

export const CalendarTab: React.FC<{ showDesc?: boolean; showBreaks?: boolean }> = ({ showDesc = false, showBreaks = true }) => {
  const { state, dispatch } = useProject();
  const project = state.present;
  const activeVersion = project.versions.find(v => v.id === project.activeVersionId);

  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [activeDragRow, setActiveDragRow] = useState<ScheduleRow | null>(null);
  const [activeDragDay, setActiveDragDay] = useState<number | null>(null);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [statusModal, setStatusModal] = useState<number | null>(null);

  const handleStatusDoubleClick = useCallback((shootDay: number) => {
    setStatusModal(shootDay);
  }, []);
  const [activeDragIds, setActiveDragIds] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [insertBeforeId, setInsertBeforeId] = useState<string | null>(null);
  const [lastClickedId, setLastClickedId] = useState<string | null>(null);
  const ctrlOrCmdHeld = useAddMode();

  const calendarGridRef = useRef<HTMLDivElement>(null);
  const { marqueeBox, justEndedRef: marqueeJustEndedRef } = useMarquee(
    calendarGridRef,
    useCallback((ids) => setSelectedRowIds(prev => new Set(isAddModeActive() ? [...prev, ...ids] : ids)), []),
    true,
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: ctrlOrCmdHeld ? 999999 : 3 } })
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

  const violationMap = useMemo(() => {
    const m = new Map<string, RuleViolation[]>();
    if (!activeVersion) return m;
    for (const [k] of Object.entries(activeVersion.dayMeta || {})) {
      const day = Number(k);
      const v = checkDay(day, project.rules || [], project.scenes, activeVersion.rows, activeVersion.dayMeta);
      if (v.length > 0) m.set(activeVersion.dayMeta[day]?.date || '', v);
    }
    return m;
  }, [activeVersion, project.rules, project.scenes]);

  const sceneViolationMap = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const [, violations] of violationMap) {
      for (const v of violations) {
        const ids = v.sceneIds || (v.sceneId ? [v.sceneId] : []);
        for (const sid of ids) {
          if (!m.has(sid)) m.set(sid, []);
          if (!m.get(sid)!.includes(v.message)) m.get(sid)!.push(v.message);
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
    dispatch({ type: 'TOGGLE_WORKING_DAY', date: dateKey });
  }, [dispatch]);

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
    } else if (e.shiftKey && lastClickedId) {
      e.stopPropagation();
      const allIds = augmentedRows.map(r => r.id);
      const idxA = allIds.indexOf(lastClickedId);
      const idxB = allIds.indexOf(id);
      if (idxA >= 0 && idxB >= 0) setSelectedRowIds(new Set(allIds.slice(Math.min(idxA, idxB), Math.max(idxA, idxB) + 1)));
    } else {
      setLastClickedId(id);
    }
  };

  const activeType = activeId ? (activeDragDay !== null ? 'DAY' : 'SCENE_CARD') : null;
  const sortedDraggedIds = Array.from(activeDragIds).sort((a, b) => {
    const rA = augmentedRows.find(r => r.id === a);
    const rB = augmentedRows.find(r => r.id === b);
    if (rA && rB) {
      if (rA.shootDay !== rB.shootDay) return (rA.shootDay || 0) - (rB.shootDay || 0);
      return rA.order - rB.order;
    }
    return 0;
  });
  const activeDragRows = sortedDraggedIds.map(id => augmentedRows.find(r => r.id === id)!).filter(Boolean);

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
      const currentSelection = new Set(selectedRowIds);
      if (currentSelection.has(draggedId) && currentSelection.size > 1) {
        setActiveDragIds(new Set(currentSelection));
      } else {
        setActiveDragIds(new Set([draggedId]));
      }
      setActiveDragRow(augmentedRows.find(r => r.id === draggedId) || null);
      setActiveDragDay(null);
    }
  };

  const handleDragOver = (e: DragOverEvent) => {
    const overId = e.over?.id as string | undefined;
    if (!overId || activeType === 'DAY') { setInsertBeforeId(null); return; }
    if (overId === 'unscheduled') { setInsertBeforeId('end-unscheduled'); return; }
    const dayMatch = overId.startsWith('day-') ? overId.slice(4) : null;
    if (dayMatch) { setInsertBeforeId(`day-${dayMatch}`); return; }
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

    if (targetShootDay === undefined) return;

    let newRows = activeVersion.rows.map(r => ({ ...r }));
    const draggingItems = draggingIds
      .map(id => newRows.find(r => r.id === id)!)
      .filter(Boolean)
      .map(r => {
        if (r.id.startsWith('row-synth-')) return { ...r, id: generateUUID(), shootDay: targetShootDay, order: 0 };
        return { ...r, shootDay: targetShootDay, order: 0 };
      });

    newRows = newRows.filter(r => !draggingIds.includes(r.id));
    const targetDayRows = newRows.filter(r => r.shootDay === targetShootDay).sort((a, b) => a.order - b.order);
    const targetRowId = lastInsertId && !lastInsertId.startsWith('day-') && targetDayRows.some(r => r.id === lastInsertId) ? lastInsertId : null;
    let insertIdx = targetRowId ? targetDayRows.findIndex(r => r.id === targetRowId) : targetDayRows.length;
    if (insertIdx === -1) insertIdx = targetDayRows.length;
    targetDayRows.splice(insertIdx, 0, ...draggingItems);
    targetDayRows.forEach((r, i) => r.order = i);
    newRows = [...newRows.filter(r => r.shootDay !== targetShootDay), ...targetDayRows];
    dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, rows: newRows } });
    setSelectedRowIds(new Set());
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
    <DndContext sensors={sensors} collisionDetection={rectIntersection} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
      <div className="flex-1 flex overflow-hidden min-h-0" style={{ fontFamily: 'Helvetica, Arial, sans-serif', fontSize: '11px' }}>
        <UnscheduledSidebar rows={unscheduledRows} scenes={project.scenes} showDesc={showDesc} sceneViolationMap={sceneViolationMap} activeDragRows={activeDragRows} insertBeforeId={insertBeforeId} activeRowId={activeId} activeDragIds={activeDragIds} selectedIds={selectedRowIds} onRowClick={handleRowClick} onSort={sortUnscheduled} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-200 bg-white">
            <div className="flex items-center gap-3">
              <button onClick={goPrev} className="p-1 hover:bg-zinc-100 rounded"><ChevronLeft className="w-4 h-4" /></button>
              <h2 className="font-semibold text-sm">{monthName}</h2>
              <button onClick={goNext} className="p-1 hover:bg-zinc-100 rounded"><ChevronRight className="w-4 h-4" /></button>
            </div>
            <div className="flex items-center gap-3">
              {selectedRowIds.size > 0 && (
                <span className="bg-blue-100 text-blue-700 text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
                  {selectedRowIds.size} selected
                  <button onClick={() => setSelectedRowIds(new Set())} className="hover:text-blue-900 font-bold">&times;</button>
                </span>
              )}
              <span className="text-[10px] text-zinc-400">
                <span className="text-[7px] font-bold text-green-600 mr-1">SW</span>Start &nbsp;
                <span className="text-[7px] font-bold text-green-600 mr-1 ml-2">W</span>Work &nbsp;
                <span className="text-[7px] font-bold text-green-600 mr-1 ml-2">FW</span>Finish
              </span>
            </div>
          </div>
          <div className="grid grid-cols-7 border-l border-t border-zinc-200">
            {DAY_NAMES.map(n => <div key={n} className="text-center text-[10px] font-semibold text-zinc-500 py-1.5 border-r border-b border-zinc-200 bg-zinc-50">{n}</div>)}
          </div>
          <div ref={calendarGridRef} className="flex-1 overflow-y-auto min-h-0 relative">
            <MarqueeOverlay box={marqueeBox} />
            <div className="grid grid-cols-7 border-l border-zinc-200">
              {days.map((day) => {
                const sd = workingMap.get(day.dateKey) ?? null;
                  return (
                  <DayCell key={day.dateKey}
                    dateKey={day.dateKey} date={day.date}
                    isCurrentMonth={day.isCurrentMonth} isToday={day.isToday}
                    isWorkingDay={sd !== null} shootDay={sd}
                    status={sd != null ? statusMap.get(sd) : undefined}
                    onDoubleClick={(day) => handleStatusDoubleClick(day)}
                    label={workingLabels.get(day.dateKey) ?? null}
                    rows={rowsByDate.get(day.dateKey) || []} scenes={project.scenes}
                    showDesc={showDesc}
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
              <SceneCardContent key={r.id} row={r} scene={project.scenes.find(s => s.id === r.sceneId)} showDesc={showDesc} />
            ))}
            {activeDragRows.length > 3 && <div className="text-[9px] text-center text-zinc-500">+{activeDragRows.length - 3} more</div>}
          </div>
        ) : activeDragDay !== null && augmentedRows.filter(r => r.shootDay === activeDragDay).length > 0 ? (
          <div className="flex flex-col gap-0.5 opacity-90">
            {augmentedRows.filter(r => r.shootDay === activeDragDay).map(r => (
              <SceneCardContent key={r.id} row={r} scene={project.scenes.find(s => s.id === r.sceneId)} showDesc={showDesc} />
            ))}
          </div>
        ) : null}
      </DragOverlay>

      {statusModal !== null && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setStatusModal(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-[320px] p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-zinc-900">Day Status</h3>
              <button onClick={() => setStatusModal(null)} className="text-zinc-400 hover:text-zinc-700 p-1 rounded"><X className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(['work', 'hold', 'travel', 'holiday'] as const).map(s => {
                const cur = activeVersion?.dayMeta?.[statusModal]?.status;
                const sel = (cur || 'work') === s;
                return (
                  <button key={s} type="button"
                    onClick={() => { dispatch({ type: 'UPDATE_DAY_META' as any, shootDay: statusModal, status: s }); setStatusModal(null); }}
                    className={`py-2.5 px-3 rounded-lg text-sm font-semibold border-2 transition-colors ${sel ? 'bg-zinc-900 text-white border-zinc-900' : 'border-zinc-200 text-zinc-600 hover:border-zinc-400'}`}
                  >
                    {s === 'work' ? 'W Work' : s === 'hold' ? 'H Hold' : s === 'travel' ? 'T Travel' : '0 Holiday'}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </DndContext>
  );
};