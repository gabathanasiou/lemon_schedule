import { DayTypeDef, NonShootDate, Project } from '../types';

// Day types — the single source for calendar day statuses ("Hold", "Travel",
// "Day Off" + user-defined types). Every surface (calendar DayCell, calendar
// context menu, TravelHoldModal picker, DOODs tab + print, reports `dayType`
// field) resolves labels/colors through here — never hardcode the built-in
// keys' badge strings elsewhere.

export const DEFAULT_DAY_TYPES: DayTypeDef[] = [
  { key: 'hold', label: 'Hold', color: '#dc2626', builtin: true },
  { key: 'travel', label: 'Travel', color: '#9333ea', builtin: true },
  { key: 'holiday', label: 'Day Off', color: '#71717a', builtin: true },
];

export const DAY_TYPE_BUILTIN_KEYS = new Set(DEFAULT_DAY_TYPES.map(t => t.key));

/** Raw-defs fallback (old projects → the defaults; the manager materializes
 *  `project.dayTypes` on first save). */
export function resolveDayTypes(defs?: DayTypeDef[] | null): DayTypeDef[] {
  return defs && defs.length > 0 ? defs : DEFAULT_DAY_TYPES;
}

export function getDayTypes(project: Project): DayTypeDef[] {
  return resolveDayTypes(project.dayTypes);
}

export function getDayTypeDef(defs: DayTypeDef[] | undefined | null, key?: string | null): DayTypeDef | undefined {
  if (!key) return undefined;
  return resolveDayTypes(defs).find(t => t.key === key);
}

export function getDayType(project: Project, key?: string | null): DayTypeDef | undefined {
  return getDayTypeDef(project.dayTypes, key);
}

export function getDayTypeLabel(project: Project, key?: string | null): string {
  return getDayType(project, key)?.label || '';
}

/** The type of the non-shoot date covering `date` (if any). */
export function dayTypeForDate(project: Project, nonShootDates: NonShootDate[] | undefined | null, date: string): DayTypeDef | undefined {
  const entry = (nonShootDates || []).find(n => n.date === date);
  return getDayType(project, entry?.status);
}

export function dayTypeLabelForDate(project: Project, nonShootDates: NonShootDate[] | undefined | null, date: string): string {
  return dayTypeForDate(project, nonShootDates, date)?.label || '';
}

export interface DayTypeVisual {
  label: string;
  color?: string;
}

/** Badge data for a status key (null = no status). Custom colors are
 *  inline-styled; built-ins fall back to class defaults when colorless. */
export function visualForType(defs: DayTypeDef[] | undefined | null, key?: string | null): DayTypeVisual | null {
  const def = getDayTypeDef(defs, key);
  if (!def) return null;
  return { label: def.label, ...(def.color ? { color: def.color } : {}) };
}

export function getDayTypeVisual(project: Project, key?: string | null): DayTypeVisual | null {
  return visualForType(project.dayTypes, key);
}

/** Readable text color (white/dark) on a hex chip color — calendar/DOOD headers. */
export function dayTypeTextColor(color: string): string {
  const hex = color.replace('#', '');
  if (hex.length !== 6) return '#ffffff';
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? '#1c1917' : '#ffffff';
}