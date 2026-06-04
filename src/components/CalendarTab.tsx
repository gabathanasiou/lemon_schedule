import React, { useState, useMemo } from 'react';
import { DndContext, useDraggable, useDroppable, DragEndEvent, DragStartEvent, DragOverlay, PointerSensor, useSensor, useSensors, closestCenter } from '@dnd-kit/core';
import { useProject } from '../store';
import { ScheduleRow, Scene, ShootDayMeta } from '../types';
import { generateUUID } from '../lib/utils';
import { ChevronLeft, ChevronRight } from 'lucide-react';

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
  const days: { date: Date; dateKey: string; isCurrentMonth: boolean; isToday: boolean }[] = [];
  const cursor = new Date(year, month, 1 - startOfWeek);
  const todayKey = toDateKey(new Date());
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

/* ── Scene Card (draggable) ── */
const SceneCardContent: React.FC<{ row: ScheduleRow; scene?: Scene }> = ({ row, scene }) => {
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
      {scene.sceneNumber}. {scene.set}
    </div>
  );
};

const SceneCard: React.FC<{ row: ScheduleRow; scene?: Scene }> = ({ row, scene }) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: row.id,
    data: { type: 'SCENE_CARD', row, scene },
  });
  const style = isDragging ? { opacity: 0.3 } : { cursor: 'grab' };
  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      <SceneCardContent row={row} scene={scene} />
    </div>
  );
};

/* ── Droppable Day Cell ── */
const DayCell: React.FC<{
  dateKey: string; date: Date; isCurrentMonth: boolean; isToday: boolean;
  rows: ScheduleRow[]; scenes: Scene[];
}> = ({ dateKey, date, isCurrentMonth, isToday, rows, scenes }) => {
  const { setNodeRef, isOver } = useDroppable({
    id: `day-${dateKey}`,
    data: { type: 'DAY_CELL', date: dateKey },
  });
  return (
    <div ref={setNodeRef}
      className={`min-h-[80px] h-full border-r border-b border-zinc-200 p-1 flex flex-col
        ${!isCurrentMonth ? 'bg-zinc-50/50 text-zinc-300' : 'bg-white'}
        ${isOver ? '!bg-blue-50' : ''}`}
    >
      <div className={`text-[10px] font-semibold mb-0.5 px-0.5 ${isToday ? 'bg-blue-500 text-white rounded w-5 h-5 flex items-center justify-center' : isCurrentMonth ? 'text-zinc-600' : 'text-zinc-300'}`}>
        {date.getDate()}
      </div>
      <div className="flex-1 overflow-y-auto min-h-0">
        {rows.map(r => (<SceneCard key={r.id} row={r} scene={scenes.find(s => s.id === r.sceneId)} />))}
      </div>
    </div>
  );
};

/* ── Unscheduled Sidebar ── */
const UnscheduledSidebar: React.FC<{
  dayBlocks: { shootDay: number; rows: ScheduleRow[] }[];
  loose: ScheduleRow[];
  scenes: Scene[];
}> = ({ dayBlocks, loose, scenes }) => {
  const { setNodeRef, isOver } = useDroppable({ id: 'unscheduled', data: { type: 'UNSCHEDULED' } });
  return (
    <div className="w-[200px] border-l border-zinc-200 bg-zinc-50 flex flex-col shrink-0">
      <div className="px-3 py-2 border-b border-zinc-200 font-semibold text-[11px] text-zinc-600 bg-white">UNSCHEDULED</div>
      <div ref={setNodeRef} className={`flex-1 overflow-y-auto p-2 flex flex-col gap-0 ${isOver ? 'bg-blue-50' : ''}`}>
        {dayBlocks.map(block => (
          <div key={`day-${block.shootDay}`} className="mb-2">
            <div className="text-[9px] font-bold text-zinc-500 uppercase mb-0.5 px-0.5">Day {block.shootDay}</div>
            {block.rows.map(r => (<SceneCard key={r.id} row={r} scene={scenes.find(s => s.id === r.sceneId)} />))}
          </div>
        ))}
        {loose.map(r => (<SceneCard key={r.id} row={r} scene={scenes.find(s => s.id === r.sceneId)} />))}
        {dayBlocks.length === 0 && loose.length === 0 && <div className="text-center text-zinc-400 text-[10px] py-8">All scenes scheduled</div>}
      </div>
    </div>
  );
};

/* ── Calendar Tab ── */
export const CalendarTab: React.FC = () => {
  const { state, dispatch } = useProject();
  const project = state.present;
  const activeVersion = project.versions.find(v => v.id === project.activeVersionId);

  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [activeDragRow, setActiveDragRow] = useState<ScheduleRow | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 3 } }));

  const days = useMemo(() => getCalendarDays(currentYear, currentMonth), [currentYear, currentMonth]);

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

  const handleDragStart = (e: DragStartEvent) => {
    setActiveDragRow(augmentedRows.find(r => r.id === e.active.id) || null);
  };

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    setActiveDragRow(null);
    if (!over || !activeVersion) return;

    const row = augmentedRows.find(r => r.id === active.id);
    if (!row) return;

    /* ── Determine target ── */
    if (over.id === 'unscheduled') {
      if (row.shootDay === null && row.id.startsWith('row-synth-')) return;
      if (row.shootDay === null) return;
      const updatedRows = activeVersion.rows.map(r =>
        r.id === row.id ? { ...r, shootDay: null as number | null, order: 999999 } : r
      );
      dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, rows: updatedRows } });
      return;
    }

    /* ── Get date string from day cell ── */
    const overData = over.data.current as any;
    let dateStr: string | null = null;
    if (overData?.type === 'DAY_CELL' && typeof overData.date === 'string') {
      dateStr = overData.date;
    } else if (typeof over.id === 'string' && over.id.startsWith('day-')) {
      dateStr = over.id.slice(4);
    }
    if (!dateStr) return;

    /* ── Find or create the shootDay for this date ── */
    const entry = Object.entries(activeVersion.dayMeta || {}).find(([, m]: [string, ShootDayMeta]) => m.date === dateStr);
    let newShootDay: number;
    let newDayMeta: Record<number, ShootDayMeta> = activeVersion.dayMeta;

    if (entry) {
      newShootDay = parseInt(entry[0]);
    } else {
      newShootDay = Math.max(0, ...Object.keys(activeVersion.dayMeta || {}).map(Number), 0) + 1;
      newDayMeta = {
        ...activeVersion.dayMeta,
        [newShootDay]: { shootDay: newShootDay, unitCall: '08:00', date: dateStr },
      };
    }

    if (row.shootDay === newShootDay && !row.id.startsWith('row-synth-')) return;

    /* ── Build updated rows ── */
    const isSynthetic = row.id.startsWith('row-synth-');
    let updatedRows: ScheduleRow[];

    if (isSynthetic) {
      const newRow: ScheduleRow = {
        id: generateUUID(),
        type: 'SCENE',
        sceneId: row.sceneId!,
        shootDay: newShootDay,
        order: 0,
        estimatedDuration: row.estimatedDuration,
      };
      updatedRows = [...activeVersion.rows, newRow];
    } else {
      updatedRows = activeVersion.rows.map(r =>
        r.id === row.id ? { ...r, shootDay: newShootDay, order: 0 } : r
      );
    }

    dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, rows: updatedRows, dayMeta: newDayMeta } });
  };

  const goPrev = () => { if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(y => y - 1); } else setCurrentMonth(m => m - 1); };
  const goNext = () => { if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(y => y + 1); } else setCurrentMonth(m => m + 1); };

  const monthName = new Date(currentYear, currentMonth).toLocaleString('en-US', { month: 'long', year: 'numeric' });
  const activeScene = activeDragRow ? project.scenes.find(s => s.id === activeDragRow.sceneId) : undefined;

  if (!activeVersion) return <div className="p-8 text-zinc-500">No active version</div>;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex-1 flex overflow-hidden min-h-0" style={{ fontFamily: 'Helvetica, Arial, sans-serif', fontSize: '11px' }}>
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-200 bg-white">
            <div className="flex items-center gap-3">
              <button onClick={goPrev} className="p-1 hover:bg-zinc-100 rounded"><ChevronLeft className="w-4 h-4" /></button>
              <h2 className="font-semibold text-sm">{monthName}</h2>
              <button onClick={goNext} className="p-1 hover:bg-zinc-100 rounded"><ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>
          <div className="grid grid-cols-7 border-l border-t border-zinc-200">
            {DAY_NAMES.map(n => <div key={n} className="text-center text-[10px] font-semibold text-zinc-500 py-1.5 border-r border-b border-zinc-200 bg-zinc-50">{n}</div>)}
          </div>
          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="grid grid-cols-7 border-l border-zinc-200">
              {days.map((day, i) => (
                <DayCell key={i} dateKey={day.dateKey} date={day.date} isCurrentMonth={day.isCurrentMonth} isToday={day.isToday}
                  rows={rowsByDate.get(day.dateKey) || []} scenes={project.scenes} />
              ))}
            </div>
          </div>
        </div>
        <UnscheduledSidebar dayBlocks={unscheduledRows.dayBlocks} loose={unscheduledRows.loose} scenes={project.scenes} />
      </div>
      <DragOverlay dropAnimation={null} style={{ pointerEvents: 'none' }}>
        {activeDragRow ? <div style={{ opacity: 0.9 }}><SceneCardContent row={activeDragRow} scene={activeScene} /></div> : null}
      </DragOverlay>
    </DndContext>
  );
};