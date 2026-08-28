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
    // The day-type letter for an element: manager-order scan of the day's
    // status AND its cards (`lists` groups — a card on an unstatused day
    // counts like a marked status; `'*'` = whole category). Status letters
    // only apply when the element is actually marked under the day's status;
    // a card on a WORK day yields the letter for counts but the cell shows
    // work (work wins — it's rare to travel while working).
    const typeLetter = (ns: NonShootDate | undefined, st: string | undefined): { key: string; code: string } | null => {
      if (!typeCodes) return null;
      // The day's own status first — its letter always wins for marked elements.
      if (st) {
        const code = typeCodes.get(st);
        if (code && isElementMarked(ns, st, category, elementId)) return { key: st, code };
      }
      // Cards: first type in manager order where the element is marked.
      for (const key of typeCodes.keys()) {
        if (key === st) continue;
        const code = typeCodes.get(key);
        if (!code) continue;
        if (isElementMarked(ns, key, category, elementId)) return { key, code };
      }
      return null;
    };
    const cells: string[] = days.map(d => {
      const ns = nonShootByDate.get(d.isoDate);
      const st = ns?.status;
      const match = typeLetter(ns, st);
      if (match) {
        (typeDayLists[match.key] = typeDayLists[match.key] || []).push(d.isoDate);
        // Status-marked days are non-shoot (the section cursor skips them)
        // — the type letter always wins there. Cards on a shoot day lose to
        // the work cell calendar below.
        if (st === match.key) return match.code;
      }
      if (appearSet.has(d.dayInt)) {
        if (d.isoDate === firstDate && d.isoDate === lastDate) return 'SWF';
        if (d.isoDate === firstDate) return 'SW';
        if (d.isoDate === lastDate) return 'WF';
        return 'W';
      }
      if (match) return match.code;
      return (firstDate && lastDate && d.isoDate > firstDate && d.isoDate < lastDate) ? 'H' : '';
    });

    const workDays = appearSet.size;
    // Event-day counts: statuses AND cards (a travel card on a work day counts
    // as a travel event even when the cell shows work — totals see both).
    const holdCount = (typeDayLists['hold'] || []).length;
    const travelCount = (typeDayLists['travel'] || []).length;
    const workDayList: string[] = [];
    const holdDayList: string[] = [];
    const travelDayList: string[] = [];
    days.forEach((d, i) => {
      const c = cells[i];
      if (c === 'T') travelDayList.push(d.isoDate);
      else if (c === 'H') holdDayList.push(d.isoDate);
      else if (c) workDayList.push(d.isoDate);
    });
    // Card events on work days never appear in the cells — the type lists
    // carry them (deduped, sorted — totals see the same days as the lists).
    for (const d of typeDayLists['travel'] || []) if (!travelDayList.includes(d)) travelDayList.push(d);
    for (const d of typeDayLists['hold'] || []) if (!holdDayList.includes(d)) holdDayList.push(d);
    travelDayList.sort();
    holdDayList.sort();
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
