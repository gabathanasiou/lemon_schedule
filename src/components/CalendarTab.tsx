import React, { useState, useMemo } from 'react';
import { DndContext, useDraggable, useDroppable, DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
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

interface SceneCardProps {
  row: ScheduleRow;
  scene?: Scene;
  isGhost?: boolean;
}

const SceneCard: React.FC<SceneCardProps> = ({ row, scene, isGhost }) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: row.id,
    data: { type: 'SCENE_CARD', row },
  });

  if (isDragging) return null;

  const style = transform ? {
    transform: `translate(${transform.x}px, ${transform.y}px)`,
    zIndex: 10,
  } : undefined;

  if (!scene) {
    if (row.type === 'BREAK') {
      return (
        <div ref={setNodeRef} style={style} {...listeners} {...attributes}
          className="text-[9px] font-semibold bg-[#591b1b] text-white px-1.5 py-0.5 rounded truncate cursor-grab mb-0.5"
        >
          {row.breakLabel || 'BREAK'}
        </div>
      );
    }
    if (row.type === 'NOTE') {
      return (
        <div ref={setNodeRef} style={style} {...listeners} {...attributes}
          className="text-[9px] font-semibold bg-[#591b1b] text-white px-1.5 py-0.5 rounded truncate cursor-grab mb-0.5 italic"
        >
          {row.noteText || 'Note'}
        </div>
      );
    }
    return null;
  }

  const intExt = (scene.intExt || '').toUpperCase();
  const dayNight = (scene.dayNight || '').toUpperCase();
  let bgColor = '#ffffff';
  let textColor = '#18181b';
  if (intExt.includes('INT') && dayNight.includes('DAY')) { bgColor = '#ffffff'; textColor = '#464646'; }
  else if (intExt.includes('EXT') && dayNight.includes('DAY')) { bgColor = '#bdd857'; textColor = '#000000'; }
  else if (intExt.includes('INT') && dayNight.includes('NIGHT')) { bgColor = '#67832e'; textColor = '#f2fce3'; }
  else if (intExt.includes('EXT') && dayNight.includes('NIGHT')) { bgColor = '#2148a7'; textColor = '#ffffff'; }
  else if (intExt.includes('INT') && dayNight.includes('MORNING')) { bgColor = '#efbea0'; textColor = '#4a3730'; }
  else if (intExt.includes('EXT') && dayNight.includes('MORNING')) { bgColor = '#e88aa5'; textColor = '#ffffff'; }
  else if (intExt.includes('INT') && dayNight.includes('EVENING')) { bgColor = '#e29926'; textColor = '#000000'; }
  else if (intExt.includes('EXT') && dayNight.includes('EVENING')) { bgColor = '#ce7d21'; textColor = '#000000'; }

  return (
    <div ref={setNodeRef} style={{ ...style, background: bgColor, color: textColor }} {...listeners} {...attributes}
      className={`text-[9px] truncate px-1.5 py-0.5 rounded mb-0.5 leading-tight cursor-grab whitespace-nowrap ${isGhost ? 'opacity-60 border border-dashed border-black/30' : 'font-semibold'}`}
    >
      {scene.sceneNumber}. {intExt}. {scene.set}
    </div>
  );
};

const DayCell: React.FC<{
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  rows: ScheduleRow[];
  scenes: Scene[];
  isUnscheduled?: boolean;
}> = ({ date, isCurrentMonth, isToday, rows, scenes, isUnscheduled }) => {
  const { setNodeRef, isOver } = useDroppable({
    id: isUnscheduled ? 'unscheduled' : `day-${date.toISOString()}`,
    data: { type: 'DAY_CELL', date },
  });

  return (
    <div
      ref={setNodeRef}
      className={`min-h-[80px] border-r border-b border-zinc-200 p-1 flex flex-col
        ${!isCurrentMonth ? 'bg-zinc-50/50 text-zinc-300' : 'bg-white'}
        ${isOver ? 'bg-blue-50' : ''}`}
    >
      <div className={`text-[10px] font-semibold mb-0.5 px-0.5 ${isToday ? 'bg-blue-500 text-white rounded w-5 h-5 flex items-center justify-center' : isCurrentMonth ? 'text-zinc-600' : 'text-zinc-300'}`}>
        {isToday ? date.getDate() : date.getDate()}
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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
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

  const getRowDate = (row: ScheduleRow): Date | null => {
    if (row.shootDay === null) return null;
    const meta = activeVersion?.dayMeta?.[row.shootDay];
    if (!meta?.date) return null;
    const d = new Date(meta.date);
    return isNaN(d.getTime()) ? null : d;
  };

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
  }, [augmentedRows]);

  const unscheduledRows = useMemo(() =>
    augmentedRows.filter(r => {
      const date = getRowDate(r);
      return date === null;
    }).sort((a, b) => a.order - b.order),
    [augmentedRows]);

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over) return;

    const rowId = active.id as string;
    const row = augmentedRows.find(r => r.id === rowId);
    if (!row) return;

    const overId = over.id as string;
    let newShootDay: number | null = null;

    if (overId === 'unscheduled') {
      newShootDay = null;
    } else if (overId.startsWith('day-')) {
      const overDate = new Date(overId.replace('day-', ''));
      const entry = Object.entries(activeVersion?.dayMeta || {}).find(([, meta]: [string, ShootDayMeta]) => {
        if (!(meta as ShootDayMeta).date) return false;
        const d = new Date((meta as ShootDayMeta).date);
        return !isNaN(d.getTime()) && isSameDay(d, overDate);
      });
      if (entry) {
        newShootDay = parseInt(entry[0]);
      } else {
        const nextDay = Math.max(0, ...Object.keys(activeVersion?.dayMeta || {}).map(Number)) + 1;
        const newMeta = { ...activeVersion?.dayMeta, [nextDay]: { shootDay: nextDay, unitCall: '08:00', date: overDate.toISOString().split('T')[0] } };
        const cloneRow = (r: ScheduleRow) => ({ ...r, id: r.id.startsWith('row-synth-') ? generateUUID() : r.id });
        const updatedRows = augmentedRows.map(cloneRow).map(r => r.id === rowId ? { ...r, shootDay: nextDay } : r);
        dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion!.id, rows: updatedRows, dayMeta: newMeta } });
        return;
      }
    } else return;

    if (row.shootDay === newShootDay) return;

    const cloneRow = (r: ScheduleRow) => { const { id, ...rest } = r; return { ...rest, id: r.id.startsWith('row-synth-') ? crypto.randomUUID() : r.id }; };
    const updatedRows = augmentedRows.map(cloneRow).map(r => {
      if (r.id === rowId || (row.id.startsWith('row-synth-') && r.sceneId === row.sceneId)) {
        return { ...r, shootDay: newShootDay, order: newShootDay === null ? 999999 : 0 };
      }
      return r;
    });

    dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion!.id, rows: updatedRows } });
  };

  const goToPrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(y => y - 1);
    } else {
      setCurrentMonth(m => m - 1);
    }
  };

  const goToNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(y => y + 1);
    } else {
      setCurrentMonth(m => m + 1);
    }
  };

  const monthName = new Date(currentYear, currentMonth).toLocaleString('en-US', { month: 'long', year: 'numeric' });

  if (!activeVersion) return <div className="p-8 text-zinc-500">No active version</div>;

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
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

        <div className="w-[200px] border-l border-zinc-200 bg-zinc-50 flex flex-col shrink-0">
          <div className="px-3 py-2 border-b border-zinc-200 font-semibold text-[11px] text-zinc-600 bg-white">
            UNSCHEDULED
          </div>
          <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1">
            {unscheduledRows.map(r => (
              <SceneCard key={r.id} row={r} scene={project.scenes.find(s => s.id === r.sceneId)} />
            ))}
            {unscheduledRows.length === 0 && (
              <div className="text-center text-zinc-400 text-[10px] py-8">All scenes scheduled</div>
            )}
          </div>
        </div>
      </div>
    </DndContext>
  );
};
