import { ScheduleRow, Scene, NonShootDate } from '../types';
import { addMinutesToTime } from './utils';

export interface ProductionDay {
  index: number;
  rows: ScheduleRow[];
  daybreakRow?: ScheduleRow;
}

export interface ComputedRow extends ScheduleRow {
  computedCallTime: string;
  computedElapsed: number;
  daybreakLabel: string;
  daybreakDate: string;
  hasNextDaybreak: boolean;
  sectionTotal: number;
  sectionPages: number;
  sectionShoot: number;
  sectionBreak: number;
  sectionEndTime: string;
}

export interface SectionSums {
  total: number;
  pages: number;
  shoot: number;
  break: number;
  endTime: string;
}

export interface SectionInfo extends ProductionDay {
  date: string;
  label: string;
  chronoDay: number;
  isPinned: boolean;
  sums: SectionSums;
}

export function addDays(date: string, n: number): string {
  const parts = date.split('-').map(Number);
  const dt = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + n));
  return dt.toISOString().slice(0, 10);
}

export function buildNonShootSet(nonShootDates?: NonShootDate[] | null): Set<string> {
  return new Set((nonShootDates || []).map(n => n.date));
}

export function splitSections(rows: ScheduleRow[]): ProductionDay[] {
  const sections: ProductionDay[] = [];
  let currentRows: ScheduleRow[] = [];
  let sectionIndex = 0;
  for (const r of rows) {
    if (r.type === 'DAYBREAK') {
      sections.push({ index: sectionIndex, rows: currentRows, daybreakRow: r });
      currentRows = [];
      sectionIndex++;
    } else {
      currentRows.push(r);
    }
  }
  return sections;
}

export function computeRowData(
  rows: ScheduleRow[],
  scenes: Scene[],
  startDate: string,
  nonShootSet: Set<string>,
  callTimeBase?: string,
): {
  computedRows: ComputedRow[];
  sections: SectionInfo[];
  sectionDateMap: Map<number, string>;
  sectionLabelMap: Map<number, string>;
  sectionSums: Map<number, SectionSums>;
} {
  const totalDaybreaks = rows.filter(r => r.type === 'DAYBREAK').length;
  const computedRows: ComputedRow[] = [];
  const sections: SectionInfo[] = [];
  const sectionDateMap = new Map<number, string>();
  const sectionLabelMap = new Map<number, string>();
  const sectionSums = new Map<number, SectionSums>();

  let runningElapsed = 0;
  let sectionElapsed = 0;
  let sectionBaseTime = callTimeBase || '08:00';
  let sectionStart = 0;
  let sectionShoot = 0;
  let sectionBreak = 0;
  let sectionPages = 0;
  let sectionIndex = 0;
  let daybreakSeen = 0;

  let dateCursor = startDate || new Date().toISOString().slice(0, 10);
  let contentRows: ScheduleRow[] = [];
  let dayCounter = 0;

  const getDate = (isPinned: boolean): string => {
    while (nonShootSet.has(dateCursor)) dateCursor = addDays(dateCursor, 1);
    const d = dateCursor;
    if (!isPinned) dateCursor = addDays(dateCursor, 1);
    return d;
  };

  for (const r of rows) {
    if (r.type === 'DAYBREAK') {
      const sectionTotal = runningElapsed - sectionStart;
      const sectionEndTime = addMinutesToTime(sectionBaseTime, sectionElapsed);

      const isPinned = r.pinned ?? false;
      const date = getDate(isPinned);
      const label = isPinned ? '' : `Day ${dayCounter + 1}`;
      const chronoDay = isPinned ? 0 : dayCounter + 1;

      if (!isPinned) dayCounter++;

      const hasNextDaybreak = daybreakSeen < totalDaybreaks - 1;

      const sums: SectionSums = {
        total: sectionTotal,
        pages: sectionPages,
        shoot: sectionShoot,
        break: sectionBreak,
        endTime: sectionEndTime,
      };

      sectionSums.set(sectionIndex, sums);
      sectionDateMap.set(sectionIndex, date);
      sectionLabelMap.set(sectionIndex, label);

      const daybreakLabel = isPinned ? '' : (label ? `End of ${label}` : '');

      const computedDaybreak: ComputedRow = {
        ...r,
        computedCallTime: sectionEndTime,
        computedElapsed: runningElapsed,
        daybreakLabel,
        daybreakDate: date,
        hasNextDaybreak,
        sectionTotal,
        sectionPages,
        sectionShoot,
        sectionBreak,
        sectionEndTime,
      };

      computedRows.push(computedDaybreak);

      sections.push({
        index: sectionIndex,
        rows: contentRows,
        daybreakRow: r,
        date,
        label,
        chronoDay,
        isPinned,
        sums,
      });

      contentRows = [];
      daybreakSeen++;
      sectionIndex++;
      sectionElapsed = 0;
      sectionBaseTime = r.daybreakCallTime || callTimeBase || '08:00';
      sectionStart = runningElapsed;
      sectionShoot = 0;
      sectionBreak = 0;
      sectionPages = 0;
    } else {
      const callTime = addMinutesToTime(sectionBaseTime, sectionElapsed);
      let dur = 0;

      if (r.type === 'SCENE') {
        dur = r.estimatedDuration || 0;
        const scene = scenes.find(s => s.id === r.sceneId);
        if (scene) sectionPages += scene.pageCountDecimal;
        sectionShoot += dur;
      } else if (r.type === 'BREAK') {
        dur = r.breakDuration || 0;
        sectionBreak += dur;
      } else if (r.type === 'NOTE') {
        dur = r.estimatedDuration || 0;
        sectionShoot += dur;
      }

      runningElapsed += dur;
      sectionElapsed += dur;

      computedRows.push({
        ...r,
        computedCallTime: callTime,
        computedElapsed: runningElapsed,
      } as ComputedRow);

      contentRows.push(r);
    }
  }

  const sectionTotal = runningElapsed - sectionStart;
  const sectionEndTime = addMinutesToTime(sectionBaseTime, sectionElapsed);

  sectionSums.set(sectionIndex, {
    total: sectionTotal,
    pages: sectionPages,
    shoot: sectionShoot,
    break: sectionBreak,
    endTime: sectionEndTime,
  });

  return { computedRows, sections, sectionDateMap, sectionLabelMap, sectionSums };
}
