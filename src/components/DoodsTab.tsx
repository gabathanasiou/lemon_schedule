import React, { useMemo } from 'react';
import { useProject } from '../store';
import { Scene, ScheduleRow, ShootDayMeta, CustomCategoryDef } from '../types';
import { getLabel, DEFAULT_CATEGORY_LABELS } from '../lib/categories';

function formatDateShort(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d.getTime())) return iso;
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatDow(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
}

function formatDateLong(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d.getTime())) return iso;
  const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${weekdays[d.getDay()]} ${d.getDate()}${getOrdinal(d.getDate())} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function getOrdinal(n: number): string {
  if (n >= 11 && n <= 13) return 'th';
  const last = n % 10;
  if (last === 1) return 'st';
  if (last === 2) return 'nd';
  if (last === 3) return 'rd';
  return 'th';
}

function getCellClass(code: string): string {
  if (code === 'W') return 'bg-lime-900/60 text-lime-300';
  if (code === 'SW') return 'bg-lime-900/60 text-lime-300 border-l-2 border-l-lime-400';
  if (code === 'WF') return 'bg-lime-900/60 text-lime-300 border-r-2 border-r-lime-400';
  if (code === 'SWF') return 'bg-lime-900/60 text-lime-300 border-l-2 border-l-lime-400 border-r-2 border-r-lime-400';
  if (code === 'H') return 'bg-amber-900/50 text-amber-400';
  if (code === 'T') return 'bg-sky-900/50 text-sky-400';
  return '';
}

function getCellTooltip(code: string): string {
  if (code === 'W') return 'Work';
  if (code === 'SW') return 'Start Work';
  if (code === 'WF') return 'Work Finish';
  if (code === 'SWF') return 'Start & Finish';
  if (code === 'H') return 'Hold';
  if (code === 'T') return 'Travel';
  return '';
}

function getCategoryLabel(key: string, customCategories: CustomCategoryDef[]): string {
  const builtin = DEFAULT_CATEGORY_LABELS[key];
  if (builtin) return builtin;
  const custom = customCategories.find(c => c.key === key);
  return custom?.label || key;
}

function getSceneElements(scene: Scene, category: string): string[] {
  if (category === 'cast') {
    if (!scene.cast) return [];
    return scene.cast.split(',').map(x => x.trim()).filter(Boolean);
  }
  if (category === 'set') {
    if (!scene.set) return [];
    return [scene.set.trim()];
  }
  const raw = String((scene as any)[category] ?? '');
  if (!raw) return [];
  return raw.split(',').map(x => x.trim()).filter(Boolean);
}

interface DoodsTabProps {
  selectedCategory: string;
}

export default function DoodsTab({ selectedCategory }: DoodsTabProps) {
  const { state } = useProject();
  const project = state.present;
  const activeVersion = project.versions.find(v => v.id === project.activeVersionId);
  const rows = activeVersion?.rows || [];
  const dayMeta = (activeVersion?.dayMeta || {}) as Record<number, ShootDayMeta>;
  const castMembers = project.castMembers || [];
  const isCast = selectedCategory === 'cast';

  const elementIds = useMemo(() => {
    const allIds = new Set<string>();
    for (const s of project.scenes) {
      for (const id of getSceneElements(s, selectedCategory)) {
        allIds.add(id);
      }
    }
    return Array.from(allIds).sort((a, b) => {
      if (isCast) {
        const na = parseInt(a), nb = parseInt(b);
        if (!isNaN(na) && !isNaN(nb)) return na - nb;
      }
      return a.localeCompare(b);
    });
  }, [project.scenes, selectedCategory, isCast]);

  /**
   * Builds the DOOD grid columns.
   *
   * A "scheduled day" is a day with an entry in `dayMeta` (created via the
   * calendar or assigned scenes). It has a day number (1, 2, 3, …) and a
   * date. `isShooting` is true when the day has scheduled scenes and no
   * non-working status (hold/travel/holiday).
   *
   * A "gap day" is a calendar date between the min and max scheduled date
   * that has NO `dayMeta` entry — e.g. a weekend or break between two
   * shooting blocks. Gap days have `dayInt: 0` and `isGap: true`. They are
   * shown as dimmed, empty columns so the DOOD reads like a calendar.
   */
  const data = useMemo(() => {
    const scenes = project.scenes;
    const scheduleRows = rows;
    const dm = dayMeta;

    const scenesByDay = new Map<number, Scene[]>();
    for (const row of scheduleRows) {
      if (row.type !== 'SCENE' || !row.sceneId) continue;
      const scene = scenes.find(s => s.id === row.sceneId);
      if (!scene) continue;
      if (!scenesByDay.has(row.shootDay)) scenesByDay.set(row.shootDay, []);
      scenesByDay.get(row.shootDay)!.push(scene);
    }

    const shootingDays = new Set(scenesByDay.keys());

    const days: { dayInt: number; isoDate: string; isShooting: boolean; status?: string; hasGap?: boolean }[] = [];
    for (const [k, v] of Object.entries(dm)) {
      if (!v.date) continue;
      const dayInt = Number(k);
      days.push({
        dayInt,
        isoDate: v.date,
        isShooting: shootingDays.has(dayInt) && (!v.status || v.status === 'work'),
        status: v.status,
      });
    }
    days.sort((a, b) => a.isoDate.localeCompare(b.isoDate));

    for (let i = 1; i < days.length; i++) {
      const prev = new Date(days[i - 1].isoDate + 'T00:00:00');
      const cur = new Date(days[i].isoDate + 'T00:00:00');
      if (cur.getTime() - prev.getTime() > 86400000) {
        days[i].hasGap = true;
      }
    }

    const doodRows: { elementId: string; elementName: string; cells: string[]; workDays: number; holdDays: number; travelDays: number; startDate: string | null; finishDate: string | null }[] = [];

    for (const elementId of elementIds) {
      const appearSet = new Set<number>();
      let firstDate: string | null = null;
      let lastDate: string | null = null;
      for (const d of days) {
        const dayScenes = scenesByDay.get(d.dayInt);
        if (!dayScenes) continue;
        if (dayScenes.some(s => getSceneElements(s, selectedCategory).includes(elementId))) {
          appearSet.add(d.dayInt);
          if (!firstDate || d.isoDate < firstDate) firstDate = d.isoDate;
          if (!lastDate || d.isoDate > lastDate) lastDate = d.isoDate;
        }
      }

      const cells: string[] = days.map(d => {
        const meta = dm[d.dayInt];
        if (isCast && meta?.status === 'travel' && meta?.castIds) {
          const tIds = meta.castIds.split(',').map(x => x.trim());
          if (tIds.includes(elementId)) return 'T';
        }
        if (!appearSet.has(d.dayInt)) {
          return (firstDate && lastDate && d.isoDate > firstDate && d.isoDate < lastDate) ? 'H' : '';
        }
        if (d.isoDate === firstDate && d.isoDate === lastDate) return 'SWF';
        if (d.isoDate === firstDate) return 'SW';
        if (d.isoDate === lastDate) return 'WF';
        return 'W';
      });

      const travelCount = cells.filter(c => c === 'T').length;
      const workDays = appearSet.size;
      const holdCount = cells.filter(c => c === 'H').length;

      let displayName: string;
      if (isCast) {
        const cm = castMembers.find(m => m.id === elementId);
        displayName = cm ? `${elementId.padStart(3, ' ')}.  ${cm.name}` : elementId;
      } else {
        displayName = elementId;
      }

      const startDate = firstDate;
      const finishDate = lastDate;

      doodRows.push({
        elementId,
        elementName: displayName,
        cells,
        workDays,
        holdDays: holdCount,
        travelDays: travelCount,
        startDate,
        finishDate,
      });
    }

    return { days, rows: doodRows };
  }, [project.scenes, rows, dayMeta, elementIds, castMembers, selectedCategory, isCast]);

  const chronoDayMap = useMemo(() => {
    const m = new Map<number, number>();
    let counter = 0;
    for (const d of data.days) {
      if (d.isShooting) { counter++; m.set(d.dayInt, counter); }
    }
    return m;
  }, [data.days]);

  const categoryLabel = getCategoryLabel(selectedCategory, project.customCategories || []);

  if (data.days.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-zinc-950 text-zinc-500 gap-2">
        <p className="text-sm">No days scheduled</p>
        <p className="text-xs text-zinc-600">Add days to the schedule to populate the Day Out of Days</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0 bg-zinc-950 text-zinc-300">
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 shrink-0">
        <span className="text-sm font-bold text-white">Day Out of Days — {categoryLabel}</span>
        <div className="flex items-center gap-4 text-[10px] text-zinc-500">
          <span><span className="inline-block w-2 h-2 rounded-sm bg-lime-900/40 mr-1"></span>W=Work</span>
          <span><span className="inline-block w-2 h-2 rounded-sm bg-amber-900/30 mr-1"></span>H=Hold</span>
          {isCast && <span><span className="inline-block w-2 h-2 rounded-sm bg-sky-900/30 mr-1"></span>T=Travel</span>}
          <span>SW=Start</span>
          <span>WF=Finish</span>
          <span>SWF=Only</span>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="border-separate border-spacing-0 text-[11px] w-full">
          <thead>
            <tr className="sticky top-0 z-20">
              <th className="sticky left-0 bg-zinc-900 px-3 py-1.5 text-left text-zinc-400 font-medium border-r border-zinc-800 whitespace-nowrap z-30" style={{ boxShadow: '4px 0 6px -2px rgba(0,0,0,0.5)' }}>{categoryLabel}</th>
              {data.days.map((d, ci) => (
                <th key={d.dayInt} className={`px-2 py-1.5 text-center font-medium whitespace-nowrap bg-zinc-900 cursor-default ${d.hasGap ? 'border-l [border-left-style:dotted] border-l-zinc-600' : ''} ${d.isShooting ? 'text-zinc-300' : 'text-zinc-600'}`} style={{ minWidth: 42 }}>
                  <div title={formatDateLong(d.isoDate)}>{formatDateShort(d.isoDate)}</div>
                </th>
              ))}
              <th className="px-2 py-1.5 text-center text-zinc-500 font-medium border-l border-l-zinc-800 bg-zinc-900 cursor-default">Work</th>
              <th className="px-2 py-1.5 text-center text-zinc-500 font-medium bg-zinc-900 cursor-default">Hold</th>
              {isCast && <th className="px-2 py-1.5 text-center text-zinc-500 font-medium bg-zinc-900 cursor-default">Trav</th>}
              <th className="px-2 py-1.5 text-center text-zinc-500 font-medium bg-zinc-900 cursor-default" style={{ minWidth: 60 }}>Start</th>
              <th className="px-2 py-1.5 text-center text-zinc-500 font-medium bg-zinc-900 cursor-default" style={{ minWidth: 60 }}>Finish</th>
            </tr>
            <tr className="sticky z-20" style={{ top: 28 }}>
              <th className="sticky left-0 bg-zinc-900 px-3 py-1 text-left text-zinc-500 font-normal border-r border-zinc-800 z-30 cursor-default" style={{ boxShadow: '4px 0 6px -2px rgba(0,0,0,0.5)' }}>Day of Week</th>
              {data.days.map((d, ci) => (
                <th key={d.dayInt} className={`px-2 py-1 text-center font-normal whitespace-nowrap text-[10px] bg-zinc-900 cursor-default ${d.hasGap ? 'border-l [border-left-style:dotted] border-l-zinc-600' : ''} ${d.isShooting ? 'text-zinc-400' : 'text-zinc-600'}`}>
                  {formatDow(d.isoDate)}
                </th>
              ))}
              <th className="px-2 py-1 border-l border-l-zinc-800 bg-zinc-900"></th>
              <th className="px-2 py-1 bg-zinc-900"></th>
              {isCast && <th className="px-2 py-1 bg-zinc-900"></th>}
              <th className="px-2 py-1 bg-zinc-900"></th>
              <th className="px-2 py-1 bg-zinc-900"></th>
            </tr>
            <tr className="sticky z-20" style={{ top: 52, boxShadow: '0 4px 6px -2px rgba(0,0,0,0.5)' }}>
              <th className="sticky left-0 bg-zinc-900 px-3 py-1 text-left text-zinc-500 font-normal border-b border-r border-zinc-800 z-30 cursor-default" style={{ boxShadow: '4px 0 6px -2px rgba(0,0,0,0.5)' }}>Shooting Day</th>
              {data.days.map((d, ci) => (
                <th key={d.dayInt} className={`px-2 py-1 text-center font-medium whitespace-nowrap border-b border-zinc-800 text-[10px] bg-zinc-900 cursor-default ${d.hasGap ? 'border-l [border-left-style:dotted] border-l-zinc-600' : ''} ${d.isShooting ? 'text-zinc-400' : 'text-zinc-600'}`}>
                  {d.isShooting ? chronoDayMap.get(d.dayInt) : d.status === 'hold' ? 'H' : d.status === 'travel' ? 'T' : d.status === 'holiday' ? 'HOL' : ''}
                </th>
              ))}
              <th className="px-2 py-1 border-b border-zinc-800 border-l border-l-zinc-800 bg-zinc-900"></th>
              <th className="px-2 py-1 border-b border-zinc-800 bg-zinc-900"></th>
              {isCast && <th className="px-2 py-1 border-b border-zinc-800 bg-zinc-900"></th>}
              <th className="px-2 py-1 border-b border-zinc-800 bg-zinc-900"></th>
              <th className="px-2 py-1 border-b border-zinc-800 bg-zinc-900"></th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map(row => (
              <tr key={row.elementId} className="group hover:bg-zinc-800/40">
                <td className="sticky left-0 bg-zinc-950 group-hover:bg-zinc-800 px-3 py-1.5 text-white font-medium border-b border-r border-zinc-800 whitespace-nowrap z-10 overflow-hidden text-ellipsis cursor-default" style={{ maxWidth: 400, boxShadow: '4px 0 6px -2px rgba(0,0,0,0.5)' }}>
                  {row.elementName}
                </td>
                {data.days.map((d, ci) => {
                  const code = row.cells[ci];
                  const cls = getCellClass(code);
                  const isSwCell = code === 'SW' || code === 'SWF';
                  const gapClass = (d.hasGap && !isSwCell) ? 'border-l [border-left-style:dotted] border-l-zinc-600' : '';
                  return (
                    <td key={ci} className={`px-2 py-1.5 text-center border-b border-zinc-800 text-xs font-medium cursor-default ${gapClass} ${cls}`} title={getCellTooltip(code)}>
                      <span className={!d.isShooting ? 'opacity-40' : ''}>{code}</span>
                    </td>
                  );
                })}
                <td className="px-2 py-1.5 text-center text-xs text-zinc-400 font-medium border-b border-zinc-800 border-l border-l-zinc-800 cursor-default">{row.workDays > 0 ? row.workDays : ''}</td>
                <td className="px-2 py-1.5 text-center text-xs text-zinc-400 border-b border-zinc-800 cursor-default">{row.holdDays > 0 ? row.holdDays : ''}</td>
                {isCast && <td className="px-2 py-1.5 text-center text-xs text-zinc-400 border-b border-zinc-800 cursor-default">{row.travelDays > 0 ? row.travelDays : ''}</td>}
                <td className="px-2 py-1.5 text-center text-xs text-zinc-500 border-b border-zinc-800 cursor-default">{row.startDate ? formatDateShort(row.startDate) : ''}</td>
                <td className="px-2 py-1.5 text-center text-xs text-zinc-500 border-b border-zinc-800 cursor-default">{row.finishDate ? formatDateShort(row.finishDate) : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
