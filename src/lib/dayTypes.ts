import React from 'react';
import { DayTypeDef, NonShootDate, Project } from '../types';
import { CUSTOM_ICON_OPTIONS } from './categories';
import { Pause, Plane, Sun, Tag, CalendarCheck } from 'lucide-react';

const BUILTIN_ICON_COMPONENTS: Record<string, React.ElementType> = {
  hold: Pause,
  travel: Plane,
  holiday: Sun,
  work: CalendarCheck,
};

// Day types — the single source for calendar day statuses ("Hold", "Travel",
// "Day Off" + user-defined types). Every surface (calendar DayCell, calendar
// context menu, TravelHoldModal picker, DOODs tab + print, reports `dayType`
// field) resolves labels/colors/icons through here — never hardcode the
// built-in keys' badge strings elsewhere.

export const DAY_TYPE_BUILTIN_ICONS: Record<string, string> = {
  hold: 'Pause',
  travel: 'Plane',
  holiday: 'Sun',
  work: 'CalendarCheck',
};

export const DEFAULT_DAY_TYPES: DayTypeDef[] = [
  { key: 'hold', label: 'Hold', color: '#dc2626', attachable: true, builtin: true },
  { key: 'travel', label: 'Travel', color: '#9333ea', attachable: true, builtin: true },
  { key: 'holiday', label: 'Day Off', color: '#71717a', builtin: true },
  { key: 'work', label: 'Work Day', color: '#2563eb', builtin: true },
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

/** One-letter DOOD cell code for a status key: travel→T, hold→H stay fixed
 *  (labeled independently of user edits); custom types get their label's
 *  initial (e.g. Rehearsal→R); fallback 'O'. */
export function codeForType(defs: DayTypeDef[] | undefined | null, key?: string | null): string {
  if (key === 'travel') return 'T';
  if (key === 'hold') return 'H';
  const def = getDayTypeDef(defs, key);
  if (!def) return '';
  const initial = def.label.trim().charAt(0).toUpperCase();
  return /[A-Z]/.test(initial) ? initial : 'O';
}

export function getDayTypeCode(project: Project, key?: string | null): string {
  return codeForType(project.dayTypes, key);
}

/** The status icon for a type (built-ins have implicit icons). */
export function iconForType(defs: DayTypeDef[] | undefined | null, key?: string | null): string | undefined {
  const def = getDayTypeDef(defs, key);
  return def?.icon || DAY_TYPE_BUILTIN_ICONS[key || ''] || 'Tag';
}

/** Renderable icon component for a type — built-ins get their implicit
 *  Plane/Pause/Sun icons; customs their chosen icon (Tag fallback). */
export function typeIconComponent(defs: DayTypeDef[] | undefined | null, key?: string | null): React.ElementType {
  const name = iconForType(defs, key);
  const custom = CUSTOM_ICON_OPTIONS.find(o => o.name === name);
  return custom ? custom.Icon : (BUILTIN_ICON_COMPONENTS[key || ''] || Tag);
}

/** Key for a new custom type: slugified label, `-2`/`-3`… on collision. */
export function slugifyDayType(label: string): string {
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24);
  return slug || 'type';
}