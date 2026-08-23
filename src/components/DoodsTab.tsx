import React, { useMemo } from 'react';
import { useProject } from '../store';
import { Scene, ScheduleRow, CustomCategoryDef } from '../types';
import { getLabel, DEFAULT_CATEGORY_LABELS, getFieldItems } from '../lib/categories';
import { useColumnResize } from '../lib/useColumnResize';
import { useDaybreakSections } from '../lib/useDaybreakSections';
import { addDays } from '../lib/daybreakUtils';
import { isElementMarked } from '../lib/nonShootHelpers';
import { getDayTypes, codeForType, getDayTypeVisual, dayTypeTextColor, getDayType } from '../lib/dayTypes';

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
  const raw = String((scene as any)[category] ?? '');
  return getFieldItems(category, raw);
}

interface DoodsTabProps {
  selectedCategory: string;
}

export default function DoodsTab({ selectedCategory }: DoodsTabProps) {
  const { state } = useProject();
  const project = state.present;
  const { sections, productionSections, sectionDateMap, sectionLabelMap, sceneToSection, startDate, activeVersion } = useDaybreakSections();
  const castMembers = project.castMembers || [];
  const isCast = selectedCategory === 'cast';

  const { widths, startResize, resetWidths, hasCustomWidths } = useColumnResize(
    'lemon_schedule_col_widths_dood',
    { name: 200, day: 42, work: 50, hold: 50, trav: 50, start: 70, finish: 70 },
  );

  const typeCodes = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of getDayTypes(project)) m.set(t.key, codeForType(project.dayTypes, t.key));
    return m;
  }, [project]);

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

  const sectionDayEntries = useMemo(() => {
    const sectionByDate = new Map<string, { sectionIndex: number; label: string; isShooting: boolean }>();
    for (const s of productionSections) {
      const date = sectionDateMap.get(s.index);
      if (!date) continue;
      sectionByDate.set(date, {
        sectionIndex: s.index,
        label: sectionLabelMap.get(s.index) || '',
        isShooting: s.rows.some(r => r.type === 'SCENE'),
      });
    }
    if (sectionByDate.size === 0) return [];

    const nonShootMap = new Map<string, string>();
    for (const n of activeVersion?.nonShootDates || []) nonShootMap.set(n.date, n.status);

    const dateKeys = Array.from(sectionByDate.keys()).sort();
    const entries: { sectionIndex: number; isoDate: string; label: string; isShooting: boolean; status?: string; hasGap?: boolean }[] = [];
    let previousWasSection = true;
    for (let iso = startDate; iso <= dateKeys[dateKeys.length - 1]; iso = addDays(iso, 1)) {
      const sec = sectionByDate.get(iso);
      const isSection = !!sec;
      entries.push({
        sectionIndex: sec ? sec.sectionIndex : -1,
        isoDate: iso,
        label: sec ? sec.label : '',
        isShooting: sec ? sec.isShooting : false,
        status: isSection ? undefined : nonShootMap.get(iso),
        hasGap: isSection && !previousWasSection,
      });
      previousWasSection = isSection;
    }

    return entries;
  }, [productionSections, sectionDateMap, sectionLabelMap, startDate, activeVersion?.nonShootDates]);

  const data = useMemo(() => {
    const scenes = project.scenes;

    const scenesBySection = new Map<number, Scene[]>();
    for (const row of sections.flatMap(s => s.rows)) {
      if (row.type !== 'SCENE' || !row.sceneId) continue;
      const scene = scenes.find(s => s.id === row.sceneId);
      if (!scene) continue;
      const secIdx = sceneToSection.get(row.sceneId);
      if (secIdx == null) continue;
      if (!scenesBySection.has(secIdx)) scenesBySection.set(secIdx, []);
      scenesBySection.get(secIdx)!.push(scene);
    }

    const doodRows: { elementId: string; elementName: string; cells: string[]; workDays: number; holdDays: number; travelDays: number; startDate: string | null; finishDate: string | null; typeCounts: Record<string, number> }[] = [];

    for (const elementId of elementIds) {
      const appearSet = new Set<number>();
      let firstDate: string | null = null;
      let lastDate: string | null = null;
      for (const d of sectionDayEntries) {
        const secScenes = scenesBySection.get(d.sectionIndex);
        if (!secScenes) continue;
        if (secScenes.some(s => getSceneElements(s, selectedCategory).includes(elementId))) {
          appearSet.add(d.sectionIndex);
          if (!firstDate || d.isoDate < firstDate) firstDate = d.isoDate;
          if (!lastDate || d.isoDate > lastDate) lastDate = d.isoDate;
        }
      }

      const nonShootDates = (state.present.versions.find(v => v.id === state.present.activeVersionId)?.nonShootDates || []);

      const typeCounts: Record<string, number> = {};
      const cells: string[] = sectionDayEntries.map(d => {
        const nd = nonShootDates.find(n => n.date === d.isoDate);
        const st = nd?.status;
        const code = st ? typeCodes.get(st) : '';
        if (st && code && isElementMarked(nd, st, selectedCategory, elementId)) {
          typeCounts[st] = (typeCounts[st] || 0) + 1;
          return code;
        }
        if (!appearSet.has(d.sectionIndex)) {
          if (d.sectionIndex === -1) return '';
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

      doodRows.push({
        elementId,
        elementName: displayName,
        cells,
        workDays,
        holdDays: holdCount,
        travelDays: travelCount,
        startDate: firstDate,
        finishDate: lastDate,
        typeCounts,
      });
    }

    return { days: sectionDayEntries, rows: doodRows };
  }, [project.scenes, sections, sectionDayEntries, sceneToSection, elementIds, castMembers, selectedCategory, isCast, state.present.versions, state.present.activeVersionId, typeCodes]);

  const chronoDayMap = useMemo(() => {
    const m = new Map<number, number>();
    let counter = 0;
    for (const d of data.days) {
      if (d.isShooting) { counter++; m.set(d.sectionIndex, counter); }
    }
    return m;
  }, [data.days]);

  const categoryLabel = getCategoryLabel(selectedCategory, project.customCategories || []);

  // Count columns for in-use custom attachable types (travel/hold already have
  // their own Work/Hold/Travel columns).
  const typeColumns = useMemo(() => {
    const used = new Set<string>();
    for (const d of sectionDayEntries) if (d.status) used.add(d.status);
    return getDayTypes(project).filter(t => t.attachable !== false && t.key !== 'travel' && t.key !== 'hold' && used.has(t.key));
  }, [sectionDayEntries, project]);

  const codeToType = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of getDayTypes(project)) m.set(codeForType(project.dayTypes, t.key), t.label);
    return m;
  }, [project]);

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
        <span className="text-sm font-bold text-white">Day Out of Days - {categoryLabel}</span>
        <div className="flex items-center gap-4 text-[10px] text-zinc-500">
          {hasCustomWidths && (
            <button onClick={resetWidths} className="text-zinc-500 hover:text-zinc-300 transition-colors">Reset Columns</button>
          )}
          <span><span className="inline-block w-2 h-2 rounded-sm bg-lime-900/40 mr-1"></span>W=Work</span>
          <span><span className="inline-block w-2 h-2 rounded-sm bg-amber-900/30 mr-1"></span>H=Hold</span>
          {isCast && <span><span className="inline-block w-2 h-2 rounded-sm bg-sky-900/30 mr-1"></span>T=Travel</span>}
          {typeColumns.map(tc => <span key={tc.key}><span className="inline-block w-2 h-2 rounded-sm mr-1" style={{ background: tc.color || '#52525b' }}></span>{codeForType(project.dayTypes, tc.key)}={tc.label}</span>)}
          <span>SW=Start</span>
          <span>WF=Finish</span>
          <span>SWF=Only</span>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="border-separate border-spacing-0 text-[11px] table-fixed">
          <colgroup>
            <col style={{ width: widths.name }} />
            {data.days.map(d => <col key={d.isoDate} style={{ width: widths.day }} />)}
            <col style={{ width: widths.work }} />
            <col style={{ width: widths.hold }} />
            {isCast && <col style={{ width: widths.trav }} />}
            {typeColumns.map(tc => <col key={tc.key} style={{ width: 50 }} />)}
            <col style={{ width: widths.start }} />
            <col style={{ width: widths.finish }} />
          </colgroup>
          <thead>
            <tr className="sticky top-0 z-20">
              <th className="sticky left-0 bg-zinc-900 px-3 py-1.5 text-left text-zinc-400 font-medium border-r border-zinc-800 whitespace-nowrap z-30" style={{ boxShadow: '4px 0 6px -2px rgba(0,0,0,0.5)' }}>
                {categoryLabel}
                <div className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-zinc-600/40" onPointerDown={(e) => startResize('name', e)} />
              </th>
              {data.days.map((d, ci) => (
                <th key={d.isoDate} className={`relative px-2 py-1.5 text-center font-medium whitespace-nowrap bg-zinc-900 cursor-default ${d.hasGap ? 'border-l [border-left-style:dotted] border-l-zinc-600' : ''} ${d.isShooting ? 'text-zinc-300' : 'text-zinc-600'}`}>
                  <div title={formatDateLong(d.isoDate)}>{formatDateShort(d.isoDate)}</div>
                  <div className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-zinc-600/40" onPointerDown={(e) => startResize('day', e)} />
                </th>
              ))}
              <th className="relative px-2 py-1.5 text-center text-zinc-500 font-medium border-l border-l-zinc-800 bg-zinc-900 cursor-default">
                Work
                <div className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-zinc-600/40" onPointerDown={(e) => startResize('work', e)} />
              </th>
              <th className="relative px-2 py-1.5 text-center text-zinc-500 font-medium bg-zinc-900 cursor-default">
                Hold
                <div className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-zinc-600/40" onPointerDown={(e) => startResize('hold', e)} />
              </th>
              {isCast && <th className="relative px-2 py-1.5 text-center text-zinc-500 font-medium bg-zinc-900 cursor-default">
                Trav
                <div className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-zinc-600/40" onPointerDown={(e) => startResize('trav', e)} />
              </th>}
              {typeColumns.map(tc => (
                <th key={tc.key} className="relative px-2 py-1.5 text-center text-zinc-500 font-medium bg-zinc-900 cursor-default">
                  {tc.label}
                  <div className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-zinc-600/40" onPointerDown={(e) => startResize(`type-${tc.key}`, e)} />
                </th>
              ))}
              <th className="relative px-2 py-1.5 text-center text-zinc-500 font-medium bg-zinc-900 cursor-default">
                Start
                <div className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-zinc-600/40" onPointerDown={(e) => startResize('start', e)} />
              </th>
              <th className="relative px-2 py-1.5 text-center text-zinc-500 font-medium bg-zinc-900 cursor-default">
                Finish
                <div className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-zinc-600/40" onPointerDown={(e) => startResize('finish', e)} />
              </th>
            </tr>
            <tr className="sticky z-20" style={{ top: 28 }}>
              <th className="sticky left-0 bg-zinc-900 px-3 py-1 text-left text-zinc-500 font-normal border-r border-zinc-800 z-30 cursor-default" style={{ boxShadow: '4px 0 6px -2px rgba(0,0,0,0.5)' }}>
                Day of Week
                <div className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-zinc-600/40" onPointerDown={(e) => startResize('name', e)} />
              </th>
              {data.days.map((d, ci) => (
                <th key={d.isoDate} className={`relative px-2 py-1 text-center font-normal whitespace-nowrap text-[10px] bg-zinc-900 cursor-default ${d.hasGap ? 'border-l [border-left-style:dotted] border-l-zinc-600' : ''} ${d.isShooting ? 'text-zinc-400' : 'text-zinc-600'}`}>
                  {formatDow(d.isoDate)}
                  <div className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-zinc-600/40" onPointerDown={(e) => startResize('day', e)} />
                </th>
              ))}
              <th className="relative px-2 py-1 border-l border-l-zinc-800 bg-zinc-900 cursor-default">
                <div className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-zinc-600/40" onPointerDown={(e) => startResize('work', e)} />
              </th>
              <th className="relative px-2 py-1 bg-zinc-900 cursor-default">
                <div className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-zinc-600/40" onPointerDown={(e) => startResize('hold', e)} />
              </th>
              {isCast && <th className="relative px-2 py-1 bg-zinc-900 cursor-default">
                <div className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-zinc-600/40" onPointerDown={(e) => startResize('trav', e)} />
              </th>}
              {typeColumns.map(tc => (
                <th key={tc.key} className="relative px-2 py-1 bg-zinc-900 cursor-default">
                  <div className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-zinc-600/40" onPointerDown={(e) => startResize(`type-${tc.key}`, e)} />
                </th>
              ))}
              <th className="relative px-2 py-1 bg-zinc-900 cursor-default">
                <div className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-zinc-600/40" onPointerDown={(e) => startResize('start', e)} />
              </th>
              <th className="relative px-2 py-1 bg-zinc-900 cursor-default">
                <div className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-zinc-600/40" onPointerDown={(e) => startResize('finish', e)} />
              </th>
            </tr>
            <tr className="sticky z-20" style={{ top: 52, boxShadow: '0 4px 6px -2px rgba(0,0,0,0.5)' }}>
              <th className="sticky left-0 bg-zinc-900 px-3 py-1 text-left text-zinc-500 font-normal border-b border-r border-zinc-800 z-30 cursor-default" style={{ boxShadow: '4px 0 6px -2px rgba(0,0,0,0.5)' }}>
                Shooting Day
                <div className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-zinc-600/40" onPointerDown={(e) => startResize('name', e)} />
              </th>
              {data.days.map((d, ci) => {
                const v = getDayTypeVisual(project, d.status);
                return (
                  <th key={d.isoDate} className={`relative px-2 py-1 text-center font-medium whitespace-nowrap border-b border-zinc-800 text-[10px] bg-zinc-900 cursor-default ${d.hasGap ? 'border-l [border-left-style:dotted] border-l-zinc-600' : ''} ${d.isShooting ? 'text-zinc-400' : 'text-zinc-600'}`}
                    style={!d.isShooting && v?.color ? { background: v.color, color: dayTypeTextColor(v.color) } : undefined}>
                    <span className="block overflow-hidden text-ellipsis max-w-[3.5rem]" title={d.isShooting ? '' : v?.label}>
                      {d.isShooting ? chronoDayMap.get(d.sectionIndex) : v?.label ?? ''}
                    </span>
                    <div className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-zinc-600/40" onPointerDown={(e) => startResize('day', e)} />
                  </th>
                );
              })}
              <th className="relative px-2 py-1 border-b border-zinc-800 border-l border-l-zinc-800 bg-zinc-900 cursor-default">
                <div className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-zinc-600/40" onPointerDown={(e) => startResize('work', e)} />
              </th>
              <th className="relative px-2 py-1 border-b border-zinc-800 bg-zinc-900 cursor-default">
                <div className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-zinc-600/40" onPointerDown={(e) => startResize('hold', e)} />
              </th>
              {isCast && <th className="relative px-2 py-1 border-b border-zinc-800 bg-zinc-900 cursor-default">
                <div className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-zinc-600/40" onPointerDown={(e) => startResize('trav', e)} />
              </th>}
              {typeColumns.map(tc => (
                <th key={tc.key} className="relative px-2 py-1 border-b border-zinc-800 bg-zinc-900 cursor-default">
                  <div className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-zinc-600/40" onPointerDown={(e) => startResize(`type-${tc.key}`, e)} />
                </th>
              ))}
              <th className="relative px-2 py-1 border-b border-zinc-800 bg-zinc-900 cursor-default">
                <div className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-zinc-600/40" onPointerDown={(e) => startResize('start', e)} />
              </th>
              <th className="relative px-2 py-1 border-b border-zinc-800 bg-zinc-900 cursor-default">
                <div className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-zinc-600/40" onPointerDown={(e) => startResize('finish', e)} />
              </th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map(row => (
              <tr key={row.elementId} className="group hover:bg-zinc-800/40">
                <td className="sticky left-0 bg-zinc-950 group-hover:bg-zinc-800 px-3 py-1.5 text-white font-medium border-b border-r border-zinc-800 whitespace-nowrap z-10 overflow-hidden text-ellipsis cursor-default" style={{ boxShadow: '4px 0 6px -2px rgba(0,0,0,0.5)' }}>
                  {row.elementName}
                  <div className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-zinc-600/40" onPointerDown={(e) => startResize('name', e)} />
                </td>
                {data.days.map((d, ci) => {
                  const code = row.cells[ci];
                  const cls = getCellClass(code);
                  const isSwCell = code === 'SW' || code === 'SWF';
                  const gapClass = (d.hasGap && !isSwCell) ? 'border-l [border-left-style:dotted] border-l-zinc-600' : '';
                  return (
                    <td key={ci} className={`relative px-2 py-1.5 text-center border-b border-zinc-800 text-xs font-medium cursor-default ${gapClass} ${cls}`} title={getCellTooltip(code) || (code ? codeToType.get(code) : '')}>
                      <span className={!d.isShooting ? 'opacity-40' : ''}>{code}</span>
                      <div className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-zinc-600/40" onPointerDown={(e) => startResize('day', e)} />
                    </td>
                  );
                })}
                <td className="relative px-2 py-1.5 text-center text-xs text-zinc-400 font-medium border-b border-zinc-800 border-l border-l-zinc-800 cursor-default">
                  {row.workDays > 0 ? row.workDays : ''}
                  <div className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-zinc-600/40" onPointerDown={(e) => startResize('work', e)} />
                </td>
                <td className="relative px-2 py-1.5 text-center text-xs text-zinc-400 border-b border-zinc-800 cursor-default">
                  {row.holdDays > 0 ? row.holdDays : ''}
                  <div className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-zinc-600/40" onPointerDown={(e) => startResize('hold', e)} />
                </td>
                {isCast && <td className="relative px-2 py-1.5 text-center text-xs text-zinc-400 border-b border-zinc-800 cursor-default">
                  {row.travelDays > 0 ? row.travelDays : ''}
                  <div className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-zinc-600/40" onPointerDown={(e) => startResize('trav', e)} />
                </td>}
                {typeColumns.map(tc => (
                  <td key={tc.key} className="relative px-2 py-1.5 text-center text-xs text-zinc-400 border-b border-zinc-800 cursor-default">
                    {row.typeCounts[tc.key] > 0 ? row.typeCounts[tc.key] : ''}
                    <div className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-zinc-600/40" onPointerDown={(e) => startResize(`type-${tc.key}`, e)} />
                  </td>
                ))}
                <td className="relative px-2 py-1.5 text-center text-xs text-zinc-500 border-b border-zinc-800 cursor-default">
                  {row.startDate ? formatDateShort(row.startDate) : ''}
                  <div className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-zinc-600/40" onPointerDown={(e) => startResize('start', e)} />
                </td>
                <td className="relative px-2 py-1.5 text-center text-xs text-zinc-500 border-b border-zinc-800 cursor-default">
                  {row.finishDate ? formatDateShort(row.finishDate) : ''}
                  <div className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-zinc-600/40" onPointerDown={(e) => startResize('finish', e)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
