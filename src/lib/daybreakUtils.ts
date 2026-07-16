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
  productionDays: ProductionDay[],
  scenes: Scene[],
  sectionDateMap: Map<number, string>,
  sectionLabelMap: Map<number, string>,
  callTimeBase?: string,
): { computedRows: ComputedRow[]; sectionSums: Map<number, SectionSums> } {
  const totalDaybreaks = productionDays.filter(p => p.daybreakRow).length;
  const sectionSums = new Map<number, SectionSums>();

  let runningElapsed = 0;
  let sectionElapsed = 0;
  let sectionBaseTime = callTimeBase || '08:00';
  let sectionStart = 0;
  let sectionPages = 0;
  let sectionShoot = 0;
  let sectionBreak = 0;
  let sectionIndex = 0;
  let daybreakSeen = 0;

  const computedRows: ComputedRow[] = rows.map(r => {
    const callTime = addMinutesToTime(sectionBaseTime, sectionElapsed);
    let dur = 0;

    if (r.type === 'DAYBREAK') {
      const sectionTotal = runningElapsed - sectionStart;
      const sectionEndTime = callTime;
      const label = sectionLabelMap.get(sectionIndex) ?? '';
      const daybreakLabel = r.pinned ? '' : (label ? `End of ${label}` : '');
      const daybreakDate = sectionDateMap.get(sectionIndex) ?? '';
      const hasNextDaybreak = daybreakSeen < totalDaybreaks - 1;
      sectionSums.set(sectionIndex, {
        total: sectionTotal,
        pages: sectionPages,
        shoot: sectionShoot,
        break: sectionBreak,
        endTime: sectionEndTime,
      });
      daybreakSeen++;
      sectionIndex++;
      sectionElapsed = 0;
      sectionBaseTime = r.daybreakCallTime || callTimeBase || '08:00';
      sectionStart = runningElapsed;
      sectionPages = 0;
      sectionShoot = 0;
      sectionBreak = 0;
      return {
        ...r,
        computedCallTime: callTime,
        computedElapsed: runningElapsed,
        daybreakLabel,
        daybreakDate,
        hasNextDaybreak,
        sectionTotal,
        sectionPages,
        sectionShoot,
        sectionBreak,
        sectionEndTime,
      };
    }

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

    return {
      ...r,
      computedCallTime: callTime,
      computedElapsed: runningElapsed,
    } as ComputedRow;
  });

  sectionSums.set(sectionIndex, {
    total: runningElapsed - sectionStart,
    pages: sectionPages,
    shoot: sectionShoot,
    break: sectionBreak,
    endTime: addMinutesToTime(sectionBaseTime, sectionElapsed),
  });

  return { computedRows, sectionSums };
}