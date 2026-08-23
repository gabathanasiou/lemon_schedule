import { Scene, ScheduleRow, NonShootDate } from '../types';
import { getFieldItems } from './categories';
import { addDays, buildNonShootSet, splitSections } from './daybreakUtils';
import { isElementMarked } from './nonShootHelpers';

// Single source of truth for per-element day statistics (Day Out of Days
// logic). Consumed by the DOOD printout (Dood.tsx) AND the reports designer
// (element/cast aggregates). Never re-derive this elsewhere.

export interface DoodDay {
  dayInt: number;
  isoDate: string;
  isShooting: boolean;
  nonShootStatus?: string;
  hasGap?: boolean;
}

export interface DoodRow {
  elementId: string;
  elementName: string;
  cells: string[];
}

export interface DoodTotals {
  workDays: number;
  holdDays: number;
  travelDays: number;
  startDate: string | null;
  finishDate: string | null;
  workDayList: string[];
  holdDayList: string[];
  travelDayList: string[];
  /** Custom-type attachments: status key → marked iso dates (count columns). */
  typeDayLists: Record<string, string[]>;
}

export function getSceneElements(scene: Scene, category: string): string[] {
  return getFieldItems(category, String((scene as any)[category] ?? ''));
}

export function getElementDisplayName(
  elementId: string,
  isCast: boolean,
  castMemberNames?: Map<string, string>,
  elementNameMap?: Map<string, string>,
): string {
  if (isCast) {
    const name = castMemberNames?.get(elementId) || '?';
    return `${elementId.padStart(3, ' ')}.  ${name}`;
  }
  return elementNameMap?.get(elementId.toLowerCase()) || elementId;
}

export function deriveDood(
  scenes: Scene[],
  scheduleRows: ScheduleRow[],
  productionStart: string,
  nonShootDates: NonShootDate[],
  elementIds: string[],
  dayInts: number[],
  includeNonShooting: boolean,
  category: string,
  castMemberNames?: Map<string, string>,
  elementNameMap?: Map<string, string>,
  typeCodes?: Map<string, string> | null,
): { days: DoodDay[]; rows: DoodRow[]; totals: Map<string, DoodTotals> } {
  const isCast = category === 'cast';
  const nonShootByDate = new Map(nonShootDates?.map(n => [n.date, n]) || []);

  const nonShootSet = buildNonShootSet(nonShootDates);

  const sortedRows = scheduleRows
    .filter(r => r.containerId != null)
    .sort((a, b) => {
      if ((a.containerId || 0) !== (b.containerId || 0)) return (a.containerId || 0) - (b.containerId || 0);
      return a.order - b.order;
    });

  const sections = splitSections(sortedRows);

  const sectionDateMap = new Map<number, string>();
  let currentDate = productionStart;
  for (let i = 0; i < sections.length; i++) {
    while (nonShootSet.has(currentDate)) currentDate = addDays(currentDate, 1);
    sectionDateMap.set(i, currentDate);
    if (!sections[i].daybreakRow?.pinned) {
      currentDate = addDays(currentDate, 1);
    }
  }

  const scenesBySection = new Map<number, Scene[]>();
  for (const s of sections) {
    for (const r of s.rows) {
      if (r.type !== 'SCENE' || !r.sceneId) continue;
      const scene = scenes.find(sc => sc.id === r.sceneId);
      if (!scene) continue;
      if (!scenesBySection.has(s.index)) scenesBySection.set(s.index, []);
      scenesBySection.get(s.index)!.push(scene);
    }
  }

  let sortedDayInts = dayInts
    .filter(d => sectionDateMap.has(d))
    .sort((a, b) => (sectionDateMap.get(a) || '').localeCompare(sectionDateMap.get(b) || ''));

  if (!includeNonShooting) {
    sortedDayInts = sortedDayInts.filter(d => scenesBySection.has(d));
  }

  const days: DoodDay[] = sortedDayInts.map(d => {
    const isoDate = sectionDateMap.get(d) || '';
    const ns = nonShootByDate.get(isoDate);
    return {
      dayInt: d,
      isoDate,
      isShooting: scenesBySection.has(d),
      nonShootStatus: ns?.status || undefined,
    };
  });

  for (let i = 1; i < days.length; i++) {
    const prev = new Date(days[i - 1].isoDate + 'T00:00:00');
    const cur = new Date(days[i].isoDate + 'T00:00:00');
    if (cur.getTime() - prev.getTime() > 86400000) {
      days[i].hasGap = true;
    }
  }

  const doodRows: DoodRow[] = [];
  const totals = new Map<string, DoodTotals>();

  for (const elementId of elementIds) {
    const appearSet = new Set<number>();
    let firstDate: string | null = null;
    let lastDate: string | null = null;
    const matchId = elementId.toLowerCase();
    for (const d of sortedDayInts) {
      const secScenes = scenesBySection.get(d);
      if (!secScenes) continue;
      if (secScenes.some(s => getSceneElements(s, category).some(e => e.toLowerCase() === matchId))) {
        appearSet.add(d);
        const date = sectionDateMap.get(d) || '';
        if (!firstDate || date < firstDate) firstDate = date;
        if (!lastDate || date > lastDate) lastDate = date;
      }
    }

    const typeDayLists: Record<string, string[]> = {};
    const cells: string[] = days.map(d => {
      const ns = nonShootByDate.get(d.isoDate);
      const st = ns?.status;
      const code = st ? typeCodes?.get(st) : '';
      if (st && code && isElementMarked(ns, st, category, elementId)) {
        (typeDayLists[st] = typeDayLists[st] || []).push(d.isoDate);
        return code;
      }
      if (!appearSet.has(d.dayInt)) {
        return (firstDate && lastDate && d.isoDate > firstDate && d.isoDate < lastDate) ? 'H' : '';
      }
      if (d.isoDate === firstDate && d.isoDate === lastDate) return 'SWF';
      if (d.isoDate === firstDate) return 'SW';
      if (d.isoDate === lastDate) return 'WF';
      return 'W';
    });

    const workDays = appearSet.size;
    const holdCount = cells.filter(c => c === 'H').length;
    const travelCount = cells.filter(c => c === 'T').length;
    const workDayList: string[] = [];
    const holdDayList: string[] = [];
    const travelDayList: string[] = [];
    days.forEach((d, i) => {
      const c = cells[i];
      if (c === 'T') travelDayList.push(d.isoDate);
      else if (c === 'H') holdDayList.push(d.isoDate);
      else if (c) workDayList.push(d.isoDate);
    });
    const elementName = getElementDisplayName(elementId, isCast, castMemberNames, elementNameMap);

    doodRows.push({ elementId, elementName, cells });
    totals.set(elementId, {
      workDays, holdDays: holdCount, travelDays: travelCount,
      startDate: firstDate, finishDate: lastDate,
      workDayList, holdDayList, travelDayList,
      typeDayLists,
    });
  }

  return { days, rows: doodRows, totals };
}
