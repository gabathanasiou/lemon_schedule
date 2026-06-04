import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { DndContext, useDraggable, useDroppable, DragEndEvent, DragStartEvent, DragOverlay, PointerSensor, useSensor, useSensors, rectIntersection } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useProject } from '../store';
import { ScheduleRow, Scene, ShootDayMeta } from '../types';
import { generateUUID } from '../lib/utils';
import { ChevronLeft, ChevronRight, GripVertical } from 'lucide-react';

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

const SceneCardContent: React.FC<{ row: ScheduleRow; scene?: Scene; showDesc?: boolean }> = ({ row, scene, showDesc }) => {
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
  return (
    <div style={{ background: c.bg, color: c.text }} className="text-[9px] truncate px-1.5 py-0.5 rounded mb-0.5 leading-tight whitespace-nowrap font-semibold">
      {scene.sceneNumber}. {showDesc && scene.description ? scene.description : scene.set}
    </div>
  );
};

const SceneCard: React.FC<{ row: ScheduleRow; scene?: Scene; showDesc?: boolean }> = ({ row, scene, showDesc }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.id,
    data: { type: 'SCENE_CARD', row, scene },
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      <SceneCardContent row={row} scene={scene} showDesc={showDesc} />
    </div>
  );
};

const DayCell: React.FC<{
  dateKey: string; date: Date; isCurrentMonth: boolean; isToday: boolean;
  isWorkingDay: boolean; shootDay: number | null; label: string | null;
  rows: ScheduleRow[]; scenes: Scene[]; showDesc: boolean;
  onToggle: (dateKey: string) => void;
}> = ({ dateKey, date, isCurrentMonth, isToday, isWorkingDay, shootDay, label, rows, scenes, showDesc, onToggle }) => {
  const { setNodeRef, isOver } = useDroppable({
    id: `day-${dateKey}`,
    data: { type: 'DAY_CELL', date: dateKey, shootDay },
  });

  const { attributes, listeners, setNodeRef: setHandleRef, isDragging } = useDraggable({
    id: shootDay !== null ? `day-handle-${shootDay}` : 'day-handle-inactive',
    data: shootDay !== null ? { type: 'DAY', shootDay, date: dateKey } : {},
    disabled: !isWorkingDay || shootDay === null,
  });

  return (
    <div ref={setNodeRef}
      className={`min-h-[80px] h-full border-r border-b border-zinc-200 p-1 flex flex-col
        ${!isCurrentMonth ? 'bg-zinc-50/50 text-zinc-300' : !isWorkingDay ? 'bg-zinc-100 text-zinc-400' : 'bg-white'}
        ${isOver ? '!bg-blue-50' : ''}`}
    >
      <div className="flex items-center justify-between mb-0.5">
        <button
          onClick={(e) => { e.stopPropagation(); onToggle(dateKey); }}
          className={`text-[10px] font-semibold px-0.5 rounded flex items-center justify-center
            ${isToday ? 'bg-blue-500 text-white w-5 h-5' : !isWorkingDay && isCurrentMonth ? 'text-zinc-300 hover:bg-zinc-200' : isCurrentMonth ? 'text-zinc-600 hover:bg-zinc-200' : 'text-zinc-200'}`}
          title={isWorkingDay ? 'Remove working day' : 'Add working day'}
        >
          {date.getDate()}
        </button>
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
          {rows.map(r => (<SceneCard key={r.id} row={r} scene={scenes.find(s => s.id === r.sceneId)} showDesc={showDesc} />))}
        </SortableContext>
      </div>
    </div>
  );
};

const UnscheduledSidebar: React.FC<{
  dayBlocks: { shootDay: number; rows: ScheduleRow[] }[];
  loose: ScheduleRow[];
  scenes: Scene[];
  showDesc: boolean;
}> = ({ dayBlocks, loose, scenes, showDesc }) => {
  const { setNodeRef, isOver } = useDroppable({ id: 'unscheduled', data: { type: 'UNSCHEDULED' } });
  const [width, setWidth] = useState<number>(() => {
    try { const v = localStorage.getItem(SIDEBAR_KEY); if (v) return parseInt(v); } catch {}
    return 200;
  });
  const panelRef = useRef<HTMLDivElement>(null);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const startX = e.clientX;
    const startWidth = panelRef.current?.offsetWidth || width;
    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.min(400, Math.max(160, startWidth + e.clientX - startX));
      if (panelRef.current) panelRef.current.style.width = `${newWidth}px`;
      setWidth(newWidth);
    };
    const handleMouseUp = () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [width]);

  useEffect(() => { localStorage.setItem(SIDEBAR_KEY, String(width)); }, [width]);

  return (
    <div ref={panelRef}
      className="border-l border-zinc-200 bg-zinc-50 flex flex-col shrink-0 relative overflow-hidden"
      style={{ width: `${width}px` }}
    >
      <div className="px-3 py-2 border-b border-zinc-200 font-semibold text-[11px] text-zinc-600 bg-white">UNSCHEDULED</div>
      <div ref={setNodeRef} className={`flex-1 overflow-y-auto p-2 flex flex-col gap-0 ${isOver ? 'bg-blue-50' : ''}`}>
        {dayBlocks.map(block => (
          <div key={`day-${block.shootDay}`} className="mb-2">
            <div className="text-[9px] font-bold text-zinc-500 uppercase mb-0.5 px-0.5">Day {block.shootDay}</div>
            {block.rows.map(r => (<SceneCard key={r.id} row={r} scene={scenes.find(s => s.id === r.sceneId)} showDesc={showDesc} />))}
          </div>
        ))}
        {loose.map(r => (<SceneCard key={r.id} row={r} scene={scenes.find(s => s.id === r.sceneId)} showDesc={showDesc} />))}
        {dayBlocks.length === 0 && loose.length === 0 && <div className="text-center text-zinc-400 text-[10px] py-8">All scenes scheduled</div>}
      </div>
      <div
        className="absolute top-0 bottom-0 left-0 w-1.5 cursor-col-resize hover:bg-blue-400/40 z-30"
        onMouseDown={handleResizeStart}
      />
    </div>
  );
};

export const CalendarTab: React.FC<{ showDesc?: boolean }> = ({ showDesc = false }) => {
  const { state, dispatch } = useProject();
  const project = state.present;
  const activeVersion = project.versions.find(v => v.id === project.activeVersionId);

  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [activeDragRow, setActiveDragRow] = useState<ScheduleRow | null>(null);
  const [activeDragDay, setActiveDragDay] = useState<number | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 3 } }));

  const days = useMemo(() => getCalendarDays(currentYear, currentMonth), [currentYear, currentMonth]);

  const workingMap = useMemo(() => {
    const m = new Map<string, number>();
    if (!activeVersion) return m;
    for (const [k, v] of Object.entries(activeVersion.dayMeta || {}) as [string, ShootDayMeta][]) {
      if (v.date) m.set(v.date, Number(k));
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
      const meta = activeVersion.dayMeta?.[r.shootDay];
      if (!meta?.date) return;
      const dk = meta.date;
      if (!map.has(dk)) map.set(dk, []);
      map.get(dk)!.push(r);
    });
    return map;
  }, [augmentedRows, activeVersion]);

  const unscheduledRows = useMemo(() => {
    const withoutDay = augmentedRows.filter(r => {
      if (r.shootDay === null) return true;
      const meta = activeVersion?.dayMeta?.[r.shootDay];
      return !meta?.date;
    }).sort((a, b) => a.order - b.order);
    const dayBlocks: { shootDay: number; rows: ScheduleRow[] }[] = [];
    const loose: ScheduleRow[] = [];
    const bySD = new Map<number, ScheduleRow[]>();
    withoutDay.forEach(r => { if (r.shootDay !== null) { if (!bySD.has(r.shootDay)) bySD.set(r.shootDay, []); bySD.get(r.shootDay)!.push(r); } else loose.push(r); });
    bySD.forEach((rows, day) => dayBlocks.push({ shootDay: day, rows: rows.sort((a, b) => a.order - b.order) }));
    dayBlocks.sort((a, b) => a.shootDay - b.shootDay);
    return { dayBlocks, loose };
  }, [augmentedRows, activeVersion]);

  const handleToggle = useCallback((dateKey: string) => {
    dispatch({ type: 'TOGGLE_WORKING_DAY', date: dateKey });
  }, [dispatch]);

  const handleDragStart = (e: DragStartEvent) => {
    const data = e.active.data.current as any;
    if (data?.type === 'DAY') {
      setActiveDragDay(data.shootDay);
    setActiveDragRow(null);
    setActiveDragDay(null);
    } else {
      setActiveDragRow(augmentedRows.find(r => r.id === e.active.id) || null);
      setActiveDragDay(null);
    }
  };

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    setActiveDragRow(null);
    if (!over || !activeVersion) return;

    const activeData = active.data.current as any;

    /* ── Day drag: swap/move dayMeta dates ── */
    if (activeData?.type === 'DAY') {
      const sourceDay = activeData.shootDay as number;
      const sourceDate = activeData.date as string;
      const overData = over.data.current as any;
      let targetDate: string | null = null;
      if (overData?.type === 'DAY_CELL' && typeof overData.date === 'string') {
        targetDate = overData.date;
      } else if (typeof over.id === 'string' && over.id.startsWith('day-')) {
        targetDate = over.id.slice(4);
      }
      if (!targetDate || sourceDate === targetDate) return;

      const targetEntry = (Object.entries(activeVersion.dayMeta) as [string, ShootDayMeta][]).find(([, m]) => m.date === targetDate);
      const newDayMeta = { ...activeVersion.dayMeta };
      newDayMeta[sourceDay] = { ...newDayMeta[sourceDay], date: targetDate };
      if (targetEntry) {
        const targetDay = Number(targetEntry[0]);
        newDayMeta[targetDay] = { ...newDayMeta[targetDay], date: sourceDate };
      }
      dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, dayMeta: newDayMeta } });
      return;
    }

    /* ── Scene drop ── */
    const row = augmentedRows.find(r => r.id === active.id);
    if (!row) return;

    let overRow: ScheduleRow | undefined;
    if (typeof over.id === 'string' && !over.id.startsWith('day-') && over.id !== 'unscheduled') {
      overRow = augmentedRows.find(r => r.id === over.id);
    }

    /* Within-day reorder */
    if (overRow && row.shootDay === overRow.shootDay && row.shootDay !== null) {
      const version = activeVersion;
      const dayRows = augmentedRows.filter(r => r.shootDay === row.shootDay).sort((a, b) => a.order - b.order);
      const activeIndex = dayRows.findIndex(r => r.id === row.id);
      const overIndex = dayRows.findIndex(r => r.id === overRow!.id);
      if (activeIndex !== -1 && overIndex !== -1 && activeIndex !== overIndex) {
        const reordered = arrayMove(dayRows, activeIndex, overIndex).map((r: ScheduleRow, i) => ({ ...r, order: i }));
        const otherRows = version.rows.filter(r => r.shootDay !== row.shootDay);
        dispatch({ type: 'UPDATE_VERSION', payload: { id: version.id, rows: [...otherRows, ...reordered] } });
      }
      return;
    }

    if (over.id === 'unscheduled') {
      if (row.shootDay === null && row.id.startsWith('row-synth-')) return;
      if (row.shootDay === null) return;
      const updatedRows = activeVersion.rows.map(r =>
        r.id === row.id ? { ...r, shootDay: null as number | null, order: 999999 } : r
      );
      dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, rows: updatedRows } });
      return;
    }

    const overData = over.data.current as any;
    let dateStr: string | null = null;
    let targetShootDay: number | null = null;
    if (overData?.type === 'DAY_CELL' && typeof overData.date === 'string') {
      dateStr = overData.date;
      targetShootDay = overData.shootDay ?? null;
    } else if (typeof over.id === 'string' && over.id.startsWith('day-')) {
      dateStr = over.id.slice(4);
    }
    if (!dateStr || targetShootDay === null) return;

    if (row.shootDay === targetShootDay && !row.id.startsWith('row-synth-')) return;

    const isSynthetic = row.id.startsWith('row-synth-');
    let updatedRows: ScheduleRow[];

    if (isSynthetic) {
      const newRow: ScheduleRow = {
        id: generateUUID(),
        type: 'SCENE',
        sceneId: row.sceneId!,
        shootDay: targetShootDay,
        order: 0,
        estimatedDuration: row.estimatedDuration,
      };
      updatedRows = [...activeVersion.rows, newRow];
    } else {
      updatedRows = activeVersion.rows.map(r =>
        r.id === row.id ? { ...r, shootDay: targetShootDay, order: 0 } : r
      );
    }

    dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, rows: updatedRows } });
  };

  const goPrev = () => { if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(y => y - 1); } else setCurrentMonth(m => m - 1); };
  const goNext = () => { if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(y => y + 1); } else setCurrentMonth(m => m + 1); };

  const monthName = new Date(currentYear, currentMonth).toLocaleString('en-US', { month: 'long', year: 'numeric' });
  const activeScene = activeDragRow ? project.scenes.find(s => s.id === activeDragRow.sceneId) : undefined;
  const activeDayRows = activeDragDay !== null ? (augmentedRows.filter(r => r.shootDay === activeDragDay) || []) : [];

  if (!activeVersion) return <div className="p-8 text-zinc-500">No active version</div>;

  return (
    <DndContext sensors={sensors} collisionDetection={rectIntersection} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex-1 flex overflow-hidden min-h-0" style={{ fontFamily: 'Helvetica, Arial, sans-serif', fontSize: '11px' }}>
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-200 bg-white">
            <div className="flex items-center gap-3">
              <button onClick={goPrev} className="p-1 hover:bg-zinc-100 rounded"><ChevronLeft className="w-4 h-4" /></button>
              <h2 className="font-semibold text-sm">{monthName}</h2>
              <button onClick={goNext} className="p-1 hover:bg-zinc-100 rounded"><ChevronRight className="w-4 h-4" /></button>
            </div>
            <span className="text-[10px] text-zinc-400">
              <span className="text-[7px] font-bold text-green-600 mr-1">SW</span>Start &nbsp;
              <span className="text-[7px] font-bold text-green-600 mr-1 ml-2">W</span>Work &nbsp;
              <span className="text-[7px] font-bold text-green-600 mr-1 ml-2">FW</span>Finish
            </span>
          </div>
          <div className="grid grid-cols-7 border-l border-t border-zinc-200">
            {DAY_NAMES.map(n => <div key={n} className="text-center text-[10px] font-semibold text-zinc-500 py-1.5 border-r border-b border-zinc-200 bg-zinc-50">{n}</div>)}
          </div>
          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="grid grid-cols-7 border-l border-zinc-200">
              {days.map((day, i) => {
                const sd = workingMap.get(day.dateKey) ?? null;
                  return (
                  <DayCell key={i}
                    dateKey={day.dateKey} date={day.date}
                    isCurrentMonth={day.isCurrentMonth} isToday={day.isToday}
                    isWorkingDay={sd !== null} shootDay={sd}
                    label={workingLabels.get(day.dateKey) ?? null}
                    rows={rowsByDate.get(day.dateKey) || []} scenes={project.scenes}
                    showDesc={showDesc}
                    onToggle={handleToggle}
                  />
                );
              })}
            </div>
          </div>
        </div>
        <UnscheduledSidebar dayBlocks={unscheduledRows.dayBlocks} loose={unscheduledRows.loose} scenes={project.scenes} showDesc={showDesc} />
      </div>
      <DragOverlay dropAnimation={null} style={{ pointerEvents: 'none' }}>
        {activeDragRow ? <div style={{ opacity: 0.9 }}><SceneCardContent row={activeDragRow} scene={activeScene} showDesc={showDesc} /></div> : null}
        {activeDragDay !== null && activeDayRows.length > 0 ? (
          <div className="flex flex-col gap-0.5 opacity-90">
            {activeDayRows.map(r => (
              <SceneCardContent key={r.id} row={r} scene={project.scenes.find(s => s.id === r.sceneId)} showDesc={showDesc} />
            ))}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};