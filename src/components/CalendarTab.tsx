import React, { useState, useMemo, useCallback } from 'react';
import { DndContext, useDraggable, useDroppable, DragEndEvent, DragStartEvent, DragOverlay, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { useProject } from '../store';
import { ScheduleRow, Scene, ShootDayMeta } from '../types';
import { generateUUID } from '../lib/utils';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function getCalendarDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const startOfWeek = firstDay.getDay();
  const days: { date: Date; isCurrentMonth: boolean; isToday: boolean }[] = [];
  const cursor = new Date(year, month, 1 - startOfWeek);
  const today = new Date();
  for (let i = 0; i < 42; i++) {
    days.push({
      date: new Date(cursor),
      isCurrentMonth: cursor.getMonth() === month,
      isToday: isSameDay(cursor, today)
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function sceneColor(scene?: Scene | null) {
  if (!scene) return { bg: '#591b1b', text: '#ffffff' };
  const intExt = (scene.intExt || '').toUpperCase();
  const dayNight = (scene.dayNight || '').toUpperCase();
  if (intExt.includes('INT') && dayNight.includes('DAY')) return { bg: '#ffffff', text: '#464646' };
  if (intExt.includes('EXT') && dayNight.includes('DAY')) return { bg: '#bdd857', text: '#000000' };
  if (intExt.includes('INT') && dayNight.includes('NIGHT')) return { bg: '#67832e', text: '#f2fce3' };
  if (intExt.includes('EXT') && dayNight.includes('NIGHT')) return { bg: '#2148a7', text: '#ffffff' };
  if (intExt.includes('INT') && dayNight.includes('MORNING')) return { bg: '#efbea0', text: '#4a3730' };
  if (intExt.includes('EXT') && dayNight.includes('MORNING')) return { bg: '#e88aa5', text: '#ffffff' };
  if (intExt.includes('INT') && dayNight.includes('EVENING')) return { bg: '#e29926', text: '#000000' };
  if (intExt.includes('EXT') && dayNight.includes('EVENING')) return { bg: '#ce7d21', text: '#000000' };
  return { bg: '#ffffff', text: '#18181b' };
}

interface SceneCardProps {
  row: ScheduleRow;
  scene?: Scene;
  isPreview?: boolean;
}

const SceneCardContent: React.FC<{ row: ScheduleRow; scene?: Scene }> = ({ row, scene }) => {
  if (!scene) {
    if (row.type === 'BREAK') {
      return <div className="text-[9px] font-semibold bg-[#591b1b] text-white px-1.5 py-0.5 rounded truncate mb-0.5">{row.breakLabel || 'BREAK'}</div>;
    }
    if (row.type === 'NOTE') {
      return <div className="text-[9px] font-semibold bg-[#591b1b] text-white px-1.5 py-0.5 rounded truncate mb-0.5 italic">{row.noteText || 'Note'}</div>;
    }
    return null;
  }
  const c = sceneColor(scene);
  return (
    <div style={{ background: c.bg, color: c.text }}
      className="text-[9px] truncate px-1.5 py-0.5 rounded mb-0.5 leading-tight whitespace-nowrap font-semibold"
    >
      {scene.sceneNumber}. {scene.set}
    </div>
  );
};

const SceneCard: React.FC<SceneCardProps> = ({ row, scene, isPreview }) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: row.id,
    data: { type: 'SCENE_CARD', row, scene },
  });

  const style = isDragging && !isPreview ? { opacity: 0.3, cursor: 'grabbing' } : isPreview ? undefined : { cursor: 'grab' };
  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      <SceneCardContent row={row} scene={scene} />
    </div>
  );
};

const DayCell: React.FC<{
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  rows: ScheduleRow[];
  scenes: Scene[];
}> = ({ date, isCurrentMonth, isToday, rows, scenes }) => {
  const { setNodeRef, isOver } = useDroppable({
    id: `day-${date.toDateString()}`,
    data: { type: 'DAY_CELL', date: date.toDateString() },
  });

  return (
    <div
      ref={setNodeRef}
      className={`min-h-[80px] border-r border-b border-zinc-200 p-1 flex flex-col
        ${!isCurrentMonth ? 'bg-zinc-50/50 text-zinc-300' : 'bg-white'}
        ${isOver ? 'bg-blue-50' : ''}`}
    >
      <div className={`text-[10px] font-semibold mb-0.5 px-0.5 ${isToday ? 'bg-blue-500 text-white rounded w-5 h-5 flex items-center justify-center' : isCurrentMonth ? 'text-zinc-600' : 'text-zinc-300'}`}>
        {date.getDate()}
      </div>
      <div className="flex-1 overflow-y-auto min-h-0">
        {rows.map(r => (
          <SceneCard key={r.id} row={r} scene={scenes.find(s => s.id === r.sceneId)} />
        ))}
      </div>
    </div>
  );
};

export const CalendarTab: React.FC = () => {
  const { state, dispatch } = useProject();
  const project = state.present;
  const activeVersion = project.versions.find(v => v.id === project.activeVersionId);

  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [activeDragRow, setActiveDragRow] = useState<ScheduleRow | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 3 } })
  );

  const days = useMemo(() => getCalendarDays(currentYear, currentMonth), [currentYear, currentMonth]);

  const sceneIdsInRows = new Set(activeVersion?.rows.filter(r => r.type === 'SCENE').map(r => r.sceneId));
  const missingScenes = project.scenes.filter(s => !sceneIdsInRows.has(s.id));

  const augmentedRows = useMemo(() => [
    ...(activeVersion?.rows || []),
    ...missingScenes.map((s, i) => ({
      id: `row-synth-${s.id}`,
      type: 'SCENE' as const,
      sceneId: s.id,
      shootDay: null as number | null,
      order: 999999 + i,
      estimatedDuration: 30,
    })),
  ], [activeVersion?.rows, missingScenes]);

  const getRowDate = useCallback((row: ScheduleRow): Date | null => {
    if (row.shootDay === null) return null;
    const meta = activeVersion?.dayMeta?.[row.shootDay];
    if (!meta?.date) return null;
    const d = new Date(meta.date);
    return isNaN(d.getTime()) ? null : d;
  }, [activeVersion?.dayMeta]);

  const rowsByDay = useMemo(() => {
    const map = new Map<string, ScheduleRow[]>();
    augmentedRows.forEach(r => {
      const date = getRowDate(r);
      if (date) {
        const key = date.toDateString();
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(r);
      }
    });
    return map;
  }, [augmentedRows, getRowDate]);

  const unscheduledRows = useMemo(() => {
    const withoutDay = augmentedRows.filter(r => {
      const date = getRowDate(r);
      return r.shootDay === null || date === null;
    }).sort((a, b) => a.order - b.order);

    const dayBlocks: { shootDay: number; rows: ScheduleRow[] }[] = [];
    const loose: ScheduleRow[] = [];

    const byShootDay = new Map<number, ScheduleRow[]>();
    withoutDay.forEach(r => {
      if (r.shootDay !== null) {
        if (!byShootDay.has(r.shootDay)) byShootDay.set(r.shootDay, []);
        byShootDay.get(r.shootDay)!.push(r);
      } else {
        loose.push(r);
      }
    });

    byShootDay.forEach((rows, day) => {
      dayBlocks.push({ shootDay: day, rows: rows.sort((a, b) => a.order - b.order) });
    });
    dayBlocks.sort((a, b) => a.shootDay - b.shootDay);

    return { dayBlocks, loose };
  }, [augmentedRows, getRowDate]);

  const handleDragStart = (e: DragStartEvent) => {
    const row = augmentedRows.find(r => r.id === e.active.id);
    setActiveDragRow(row || null);
  };

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    setActiveDragRow(null);
    if (!over) return;

    const rowId = active.id as string;
    const row = augmentedRows.find(r => r.id === rowId);
    if (!row) return;

    const overData = over.data.current as { type: string; date?: string } | undefined;
    let newShootDay: number | null = null;

    if (overData?.type === 'UNSCHEDULED') {
      newShootDay = null;
    } else if (overData?.type === 'DAY_CELL' && overData.date) {
      const overDate = new Date(overData.date);
      const entry = Object.entries(activeVersion?.dayMeta || {}).find(([, meta]: [string, ShootDayMeta]) => {
        if (!meta.date) return false;
        const d = new Date(meta.date);
        return !isNaN(d.getTime()) && isSameDay(d, overDate);
      });
      if (entry) {
        newShootDay = parseInt(entry[0]);
      } else {
        const nextDay = Math.max(0, ...Object.keys(activeVersion?.dayMeta || {}).map(Number), 0) + 1;
        const dateStr = overDate.toISOString().split('T')[0];
        const newMeta = { ...activeVersion?.dayMeta, [nextDay]: { shootDay: nextDay, unitCall: '08:00', date: dateStr } };
        const updatedRows = augmentedRows.map(r => {
          const id = r.id.startsWith('row-synth-') ? generateUUID() : r.id;
          if (r.id === rowId || (row.id.startsWith('row-synth-') && r.sceneId === row.sceneId && r.id === row.id)) {
            return { ...r, id, shootDay: nextDay, order: 0 };
          }
          return { ...r, id };
        });
        dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion!.id, rows: updatedRows, dayMeta: newMeta } });
        return;
      }
    } else {
      return;
    }

    if (row.shootDay === newShootDay) return;

    const updatedRows = augmentedRows.map(r => {
      const id = r.id.startsWith('row-synth-') ? generateUUID() : r.id;
      if (r.id === rowId || (row.id.startsWith('row-synth-') && r.sceneId === row.sceneId && r.id === row.id)) {
        return { ...r, id, shootDay: newShootDay, order: newShootDay === null ? 999999 : 0 };
      }
      return { ...r, id };
    });
    dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion!.id, rows: updatedRows } });
  };

  const goToPrevMonth = () => {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(y => y - 1); }
    else setCurrentMonth(m => m - 1);
  };

  const goToNextMonth = () => {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(y => y + 1); }
    else setCurrentMonth(m => m + 1);
  };

  const monthName = new Date(currentYear, currentMonth).toLocaleString('en-US', { month: 'long', year: 'numeric' });

  const activeScene = activeDragRow ? project.scenes.find(s => s.id === activeDragRow.sceneId) : undefined;

  if (!activeVersion) return <div className="p-8 text-zinc-500">No active version</div>;

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex-1 flex overflow-hidden min-h-0" style={{ fontFamily: 'Helvetica, Arial, sans-serif', fontSize: '11px' }}>
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-200 bg-white">
            <div className="flex items-center gap-3">
              <button onClick={goToPrevMonth} className="p-1 hover:bg-zinc-100 rounded">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <h2 className="font-semibold text-sm">{monthName}</h2>
              <button onClick={goToNextMonth} className="p-1 hover:bg-zinc-100 rounded">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 border-l border-t border-zinc-200">
            {DAY_NAMES.map(name => (
              <div key={name} className="text-center text-[10px] font-semibold text-zinc-500 py-1.5 border-r border-b border-zinc-200 bg-zinc-50">
                {name}
              </div>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="grid grid-cols-7 border-l border-zinc-200">
              {days.map((day, i) => {
                const key = day.date.toDateString();
                return (
                  <DayCell
                    key={i}
                    date={day.date}
                    isCurrentMonth={day.isCurrentMonth}
                    isToday={day.isToday}
                    rows={rowsByDay.get(key) || []}
                    scenes={project.scenes}
                  />
                );
              })}
            </div>
          </div>
        </div>

        <UnscheduledSidebar dayBlocks={unscheduledRows.dayBlocks} loose={unscheduledRows.loose} scenes={project.scenes} />
      </div>

      <DragOverlay dropAnimation={null}>
        {activeDragRow ? (
          <div style={{ opacity: 0.9 }}>
            <SceneCardContent row={activeDragRow} scene={activeScene} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};

const UnscheduledSidebar: React.FC<{
  dayBlocks: { shootDay: number; rows: ScheduleRow[] }[];
  loose: ScheduleRow[];
  scenes: Scene[];
}> = ({ dayBlocks, loose, scenes }) => {
  const { setNodeRef, isOver } = useDroppable({
    id: 'unscheduled',
    data: { type: 'UNSCHEDULED' },
  });

  return (
    <div className="w-[200px] border-l border-zinc-200 bg-zinc-50 flex flex-col shrink-0">
      <div className="px-3 py-2 border-b border-zinc-200 font-semibold text-[11px] text-zinc-600 bg-white">
        UNSCHEDULED
      </div>
      <div ref={setNodeRef} className={`flex-1 overflow-y-auto p-2 flex flex-col gap-0 transition-colors ${isOver ? 'bg-blue-50' : ''}`}>
        {dayBlocks.map(block => (
          <div key={`day-${block.shootDay}`} className="mb-2">
            <div className="text-[9px] font-bold text-zinc-500 uppercase mb-0.5 px-0.5">
              Day {block.shootDay}
            </div>
            {block.rows.map(r => (
              <SceneCard key={r.id} row={r} scene={scenes.find(s => s.id === r.sceneId)} />
            ))}
          </div>
        ))}
        {loose.map(r => (
          <SceneCard key={r.id} row={r} scene={scenes.find(s => s.id === r.sceneId)} />
        ))}
        {dayBlocks.length === 0 && loose.length === 0 && (
          <div className="text-center text-zinc-400 text-[10px] py-8">All scenes scheduled</div>
        )}
      </div>
    </div>
  );
};
