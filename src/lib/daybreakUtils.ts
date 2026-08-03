import { ScheduleRow, Scene, NonShootDate } from '../types';
import { addMinutesToTime, formatDuration } from './utils';
import type { AddBannerConfig } from '../components/AddBannerModal';

export interface ProductionDay {
  index: number;
  rows: ScheduleRow[];
  daybreakRow?: ScheduleRow;
}

export interface ComputedRow extends ScheduleRow {
  computedCallTime: string;
  computedElapsed: number;
  computedDayElapsed?: number;
  previousBreakEndElapsed?: number;
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

export function formatElapsedCaption(row: { computedDayElapsed?: number; previousBreakEndElapsed?: number }): string | null {
  if (row.computedDayElapsed == null) return null;
  if (row.previousBreakEndElapsed != null) {
    return `+${formatDuration(Math.max(0, row.computedDayElapsed - row.previousBreakEndElapsed))} after previous break`;
  }
  return `${formatDuration(row.computedDayElapsed)} after start`;
}

/**
 * Identity cache for computed rows. `computeRowData` runs on every dispatch
 * (rows/sections change), which would otherwise mint a fresh object for every
 * row every time - defeating React.memo on the stripboard row components.
 * Rows are immutable (a changed row = a new object), so a WeakMap keyed by the
 * raw row preserves identity across dispatches as long as the position-derived
 * computed fields still match (reorders/duration edits invalidate downstream
 * rows via the fingerprint compare below).
 */
const computedRowCache = new WeakMap<ScheduleRow, ComputedRow>();

function sameComputedFields(a: ComputedRow, b: ComputedRow): boolean {
  return a.computedCallTime === b.computedCallTime &&
    a.computedElapsed === b.computedElapsed &&
    a.computedDayElapsed === b.computedDayElapsed &&
    a.previousBreakEndElapsed === b.previousBreakEndElapsed &&
    a.daybreakLabel === b.daybreakLabel &&
    a.daybreakDate === b.daybreakDate &&
    a.hasNextDaybreak === b.hasNextDaybreak &&
    a.sectionTotal === b.sectionTotal &&
    a.sectionPages === b.sectionPages &&
    a.sectionShoot === b.sectionShoot &&
    a.sectionBreak === b.sectionBreak &&
    a.sectionEndTime === b.sectionEndTime;
}

function pushComputed(computedRows: ComputedRow[], row: ScheduleRow, computed: ComputedRow): void {
  const cached = computedRowCache.get(row);
  if (cached && sameComputedFields(cached, computed)) {
    computedRows.push(cached);
    return;
  }
  computedRowCache.set(row, computed);
  computedRows.push(computed);
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
  let lastBreakEndElapsed: number | undefined;

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

      pushComputed(computedRows, r, computedDaybreak);

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
      lastBreakEndElapsed = undefined;
    } else {
      const callTime = addMinutesToTime(sectionBaseTime, sectionElapsed);
      const dayElapsed = sectionElapsed;
      const inSection = daybreakSeen < totalDaybreaks;
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

      const computedRow = {
        ...r,
        computedCallTime: callTime,
        computedElapsed: runningElapsed,
        ...(inSection ? { computedDayElapsed: dayElapsed } : {}),
        ...(r.type === 'BREAK' && inSection ? { previousBreakEndElapsed: lastBreakEndElapsed } : {}),
      } as ComputedRow;
      pushComputed(computedRows, r, computedRow);

      if (r.type === 'BREAK' && inSection) {
        lastBreakEndElapsed = dayElapsed + dur;
      }

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

export function computeMiddleInsertIndex(
  stripRows: ScheduleRow[],
  content: ScheduleRow[],
  scenes: Scene[],
  config: AddBannerConfig,
): number | null {
  const n = content.length;
  if (n === 0) return null;

  const getRowValue = (r: ScheduleRow): number => {
    if (config.splitMethod === 'pages') {
      if (r.type !== 'SCENE' || !r.sceneId) return 0;
      return scenes.find(s => s.id === r.sceneId)?.pageCountDecimal || 0;
    }
    if (r.type === 'SCENE' || r.type === 'NOTE') return r.estimatedDuration || 0;
    return 0;
  };

  if (config.splitMethod === 'ribbons') {
    const splitAt = Math.floor(n / 2);
    if (splitAt <= 0) return null;
    const idx = stripRows.findIndex(x => x.id === content[splitAt].id);
    return idx >= 0 ? idx : null;
  }

  let total = 0;
  for (const r of content) total += getRowValue(r);
  if (total <= 0) return null;

  const target = config.splitTarget != null && config.splitTarget > 0 ? config.splitTarget : total / 2;
  let acc = 0;
  for (const r of content) {
    acc += getRowValue(r);
    if (acc >= target) {
      const idx = stripRows.findIndex(x => x.id === r.id);
      return idx >= 0 ? idx : null;
    }
  }

  const last = content[content.length - 1];
  const lastIdx = stripRows.findIndex(x => x.id === last.id);
  return lastIdx >= 0 ? lastIdx + 1 : null;
}
