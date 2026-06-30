import type {
  ProductionCalendar, DayOffEntry, StatusDayEntry,
  ScheduleRow, ShootDayMeta
} from '../types';

// ─── Date Helpers ───

export function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseDateKey(str: string): Date {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function isWeekend(date: Date, weekendDays: number[]): boolean {
  return weekendDays.includes(date.getDay());
}

export function addDays(dateStr: string, n: number): string {
  const d = parseDateKey(dateStr);
  d.setDate(d.getDate() + n);
  return formatDateKey(d);
}

export function isSameDate(a: string, b: string): boolean {
  return a === b;
}

// ─── Off-Day Detection ───

export function isInDaysOff(dateKey: string, daysOff: Record<string, DayOffEntry>): boolean {
  return dateKey in daysOff;
}

export function isStatusDay(dateKey: string, statusDays: Record<string, StatusDayEntry>): boolean {
  return dateKey in statusDays;
}

export function getStatusDay(dateKey: string, statusDays: Record<string, StatusDayEntry>): StatusDayEntry | undefined {
  return statusDays[dateKey];
}

export function isOccupiedDate(
  date: Date,
  calendar: ProductionCalendar
): { occupied: boolean; reason?: 'weekend' | 'holiday' | 'custom' | 'hold' | 'travel' } {
  const key = formatDateKey(date);
  if (calendar.statusDays[key]) {
    return { occupied: true, reason: calendar.statusDays[key].status };
  }
  if (calendar.daysOff[key]) {
    return { occupied: true, reason: calendar.daysOff[key].type };
  }
  if (calendar.autoWeekends && isWeekend(date, calendar.weekendDays)) {
    return { occupied: true, reason: 'weekend' };
  }
  return { occupied: false };
}

// ─── Working Day Derivation ───

export function deriveDayDates(
  calendar: ProductionCalendar,
  numberOfDays: number
): Map<number, string> {
  const result = new Map<number, string>();
  if (!calendar.startDate || numberOfDays <= 0) return result;

  let cursor = parseDateKey(calendar.startDate);
  let dayNumber = 1;
  const maxIterations = numberOfDays * 14; // safety cap
  let iterations = 0;

  while (dayNumber <= numberOfDays && iterations < maxIterations) {
    iterations++;
    const occupied = isOccupiedDate(cursor, calendar);
    if (!occupied.occupied) {
      result.set(dayNumber, formatDateKey(cursor));
      dayNumber++;
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return result;
}

export function getNextAvailableDate(
  afterDate: string,
  calendar: ProductionCalendar
): string | null {
  if (!calendar.startDate) return null;

  const cursor = parseDateKey(afterDate);
  cursor.setDate(cursor.getDate() + 1);
  const maxIterations = 366;
  let iterations = 0;

  while (iterations < maxIterations) {
    iterations++;
    const occupied = isOccupiedDate(cursor, calendar);
    if (!occupied.occupied) {
      return formatDateKey(cursor);
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return null;
}

// ─── Day Group Computation ───

export function computeDayGroups(rows: ScheduleRow[]): ScheduleRow[][] {
  const groups: ScheduleRow[][] = [[]];
  let currentGroup = 0;

  const sorted = rows
    .filter(r => r.shootDay !== null && r.shootDay !== -1 && !r.boneyard)
    .sort((a, b) => a.order - b.order);

  for (const row of sorted) {
    if (row.type === 'DAY_BREAK') {
      groups[++currentGroup] = [];
    } else {
      groups[currentGroup].push(row);
    }
  }

  // Remove trailing empty group if no rows after last DAY_BREAK
  if (groups.length > 1 && groups[groups.length - 1].length === 0) {
    groups.pop();
  }

  return groups;
}

export function deriveShootDays(rows: ScheduleRow[]): ScheduleRow[] {
  const sorted = [...rows]
    .filter(r => r.shootDay !== null && r.shootDay !== -1 && !r.boneyard)
    .sort((a, b) => a.order - b.order);

  let currentDay = 1;
  const newShootDay = new Map<string, number>();

  for (const row of sorted) {
    if (row.type === 'DAY_BREAK') {
      newShootDay.set(row.id, currentDay);
      currentDay++;
    } else {
      newShootDay.set(row.id, currentDay);
    }
  }

  return rows.map(row => {
    const sd = newShootDay.get(row.id);
    if (sd !== undefined) {
      return { ...row, shootDay: sd };
    }
    return row;
  });
}

export function recomputeDayMeta(
  dayMeta: Record<number, ShootDayMeta>,
  groupCount: number
): Record<number, ShootDayMeta> {
  const newMeta: Record<number, ShootDayMeta> = {};

  for (let i = 0; i < groupCount; i++) {
    const dayNumber = i + 1;
    if (dayMeta[dayNumber]) {
      newMeta[dayNumber] = { ...dayMeta[dayNumber], shootDay: dayNumber };
    } else {
      newMeta[dayNumber] = { shootDay: dayNumber, unitCall: '08:00', date: '' };
    }
  }

  return newMeta;
}

// ─── Stripboard Layout ───

export interface StripboardWorkingItem {
  kind: 'working';
  dayNumber: number;
  date: string | null;
  rows: ScheduleRow[];
}

export interface StripboardStatusItem {
  kind: 'status';
  date: string;
  entry: StatusDayEntry;
}

export type StripboardItem = StripboardWorkingItem | StripboardStatusItem;

export function deriveStripboardLayout(
  rows: ScheduleRow[],
  calendar?: ProductionCalendar
): StripboardItem[] {
  const groups = computeDayGroups(rows);
  const groupCount = groups.length;
  const workingDates = calendar
    ? deriveDayDates(calendar, groupCount)
    : new Map<number, string>();

  const items: StripboardItem[] = [];

  for (let i = 0; i < groupCount; i++) {
    const dayNumber = i + 1;
    const date = workingDates.get(dayNumber) ?? null;
    items.push({ kind: 'working', dayNumber, date, rows: groups[i] });
  }

  if (calendar) {
    for (const dateKey of Object.keys(calendar.statusDays).sort()) {
      items.push({ kind: 'status', date: dateKey, entry: calendar.statusDays[dateKey] });
    }
  }

  items.sort((a, b) => {
    const aDate = a.kind === 'working' ? a.date : a.date;
    const bDate = b.kind === 'working' ? b.date : b.date;
    if (!aDate) return 1;
    if (!bDate) return -1;
    return aDate.localeCompare(bDate);
  });

  return items;
}

// ─── Calendar View Helpers ───

export interface CalendarDayEntry {
  date: string;
  isOff: boolean;
  offReason?: 'weekend' | 'holiday' | 'custom';
  offLabel?: string;
  statusEntry?: StatusDayEntry;
  workingDayNumber?: number;
}

export function getCalendarMonthDays(
  year: number,
  month: number,
  calendar: ProductionCalendar,
  derivedDates: Map<number, string>
): CalendarDayEntry[] {
  const entries: CalendarDayEntry[] = [];
  const startOfMonth = new Date(year, month, 1);
  const endOfMonth = new Date(year, month + 1, 0);

  // Include leading days from previous month to fill Monday-start grid
  const startDayOfWeek = startOfMonth.getDay(); // 0=Sun
  const leadingDays = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;

  const startDate = new Date(startOfMonth);
  startDate.setDate(startDate.getDate() - leadingDays);

  // Build reverse lookup: date → working day number
  const dateToDayNumber = new Map<string, number>();
  for (const [dayNum, dateStr] of derivedDates) {
    dateToDayNumber.set(dateStr, dayNum);
  }

  // Generate 42 days (6 rows × 7 cols)
  const cursor = new Date(startDate);
  for (let i = 0; i < 42; i++) {
    const dateKey = formatDateKey(cursor);
    const off = calendar.daysOff[dateKey];
    const status = calendar.statusDays[dateKey];
    const autoWeekend = calendar.autoWeekends && isWeekend(cursor, calendar.weekendDays);

    entries.push({
      date: dateKey,
      isOff: autoWeekend || !!off,
      offReason: autoWeekend ? 'weekend' : off?.type,
      offLabel: off?.label,
      statusEntry: status,
      workingDayNumber: dateToDayNumber.get(dateKey),
    });

    cursor.setDate(cursor.getDate() + 1);
  }

  return entries;
}

export function getDayNumberForDate(
  date: string,
  derivedDates: Map<number, string>
): number | undefined {
  for (const [dayNum, dateStr] of derivedDates) {
    if (dateStr === date) return dayNum;
  }
  return undefined;
}

// ─── Convenience: default calendar for new projects ───

export function defaultCalendar(): ProductionCalendar {
  return {
    startDate: null,
    daysOff: {},
    statusDays: {},
    autoWeekends: true,
    weekendDays: [0, 6], // Sun=0, Sat=6
  };
}
