import { ScheduleRow } from '../../types';

export const DAY_NAMES = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Initial view date for a date picker's open month (roadmap 68): the field's
 *  picked date (latest pick), else the production start, else undefined
 *  (the kit falls back to real today). */
export function initialViewFor(fieldValue: string[], productionStart?: string): string | undefined {
  if (fieldValue.length > 0) return fieldValue[fieldValue.length - 1];
  return productionStart || undefined;
}

const fullDateCache = new Map<string, string>();
export function formatFullDate(date: Date): string {
  const key = toDateKey(date);
  const cached = fullDateCache.get(key);
  if (cached) return cached;
  const wd = date.toLocaleString('en-US', { weekday: 'short' }).toUpperCase();
  const mo = date.toLocaleString('en-US', { month: 'short' }).toUpperCase();
  const s = `${wd} ${date.getDate()} ${mo}`;
  fullDateCache.set(key, s);
  return s;
}

export interface CalendarMonth { year: number; month: number; }

export function monthsInRange(startYear: number, startMonth: number, endYear: number, endMonth: number): CalendarMonth[] {
  const months: CalendarMonth[] = [];
  let y = startYear;
  let m = startMonth;
  while (y < endYear || (y === endYear && m <= endMonth)) {
    months.push({ year: y, month: m });
    if (m === 11) { m = 0; y += 1; } else { m += 1; }
  }
  return months;
}

export interface MonthTrim { startKey?: string; endKey?: string; }

function weekStartOf(d: Date): Date {
  const day = d.getDay() === 0 ? 6 : d.getDay() - 1;
  const out = new Date(d);
  out.setDate(d.getDate() - day);
  out.setHours(0, 0, 0, 0);
  return out;
}

function weekEndOf(d: Date): Date {
  const day = d.getDay() === 0 ? 6 : d.getDay() - 1;
  const out = new Date(d);
  out.setDate(d.getDate() + (6 - day));
  out.setHours(0, 0, 0, 0);
  return out;
}

interface MonthGridBounds { lead: number; dayStart: number; dayEnd: number; trail: number; }

function monthGridBounds(year: number, month: number, trim?: MonthTrim): MonthGridBounds {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startOff = first.getDay() === 0 ? 6 : first.getDay() - 1;
  const endOff = last.getDay() === 0 ? 6 : last.getDay() - 1;
  let lead = startOff;
  let dayStart = 1;
  let dayEnd = last.getDate();
  let trail = 6 - endOff;
  if (trim?.startKey) {
    const ws = weekStartOf(new Date(trim.startKey + 'T00:00:00'));
    if (ws.getFullYear() === year && ws.getMonth() === month) {
      dayStart = ws.getDate();
      lead = 0;
    } else {
      lead = Math.round((first.getTime() - ws.getTime()) / 86400000);
    }
  }
  if (trim?.endKey) {
    const we = weekEndOf(new Date(trim.endKey + 'T00:00:00'));
    if (we.getFullYear() === year && we.getMonth() === month) {
      dayEnd = we.getDate();
      trail = 0;
    }
  }
  return { lead, dayStart, dayEnd, trail };
}

export const DAY_CELL_HEIGHT = 170;

export type MonthSlot = { filler: true; key: string } | { filler: false; key: string; date: Date; dateKey: string; isToday: boolean };

export function buildMonthSlots(year: number, month: number, trim?: MonthTrim): MonthSlot[] {
  const b = monthGridBounds(year, month, trim);
  const todayKey = toDateKey(new Date());
  const slots: MonthSlot[] = [];
  for (let i = 0; i < b.lead; i++) slots.push({ filler: true, key: `${year}-${month}-lead-${i}` });
  for (let d = b.dayStart; d <= b.dayEnd; d++) {
    const date = new Date(year, month, d);
    const dateKey = toDateKey(date);
    slots.push({ filler: false, key: dateKey, date, dateKey, isToday: dateKey === todayKey });
  }
  for (let i = 0; i < b.trail; i++) slots.push({ filler: true, key: `${year}-${month}-trail-${i}` });
  return slots;
}

export function monthTitle(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

export type DayDropState = { zone: 'insert' | 'swap'; side?: 'before' | 'after'; sectionIndex: number } | null;

export interface DayBlock { content: ScheduleRow[]; daybreakRow?: ScheduleRow; origIdx: number; }

export function buildDayBlocks(scheduled: ScheduleRow[]): { blocks: DayBlock[]; tail: ScheduleRow[] } {
  const blocks: DayBlock[] = [];
  let currentContent: ScheduleRow[] = [];
  for (const r of scheduled) {
    if (r.type === 'DAYBREAK') {
      blocks.push({ content: currentContent, daybreakRow: r, origIdx: blocks.length });
      currentContent = [];
    } else {
      currentContent.push(r);
    }
  }
  return { blocks, tail: currentContent };
}

export function rebuildRowsFromBlocks(blocks: DayBlock[], tail: ScheduleRow[], boneyard: ScheduleRow[]): ScheduleRow[] {
  const rebuilt: ScheduleRow[] = [];
  for (const block of blocks) {
    rebuilt.push(...block.content);
    if (block.daybreakRow) rebuilt.push(block.daybreakRow);
  }
  rebuilt.push(...tail);
  const combined = [...boneyard, ...rebuilt];
  combined.forEach((r, i) => r.order = i);
  return combined;
}
