import { NonShootDate } from '../types';
import { getCategoryElements, elementMatchId } from './elements';

/**
 * Single source of truth for per-date travel/hold element annotations
 * (`NonShootDate.travel` / `NonShootDate.hold`).
 *
 * - Element keys follow the canonical rule: cast = IDs, every other category
 *   = names (`elementMatchId`).
 * - `'*'` as a category's only key means the ENTIRE category is marked.
 * - Legacy entries (`status: 'travel'` + `castIds`) are folded into
 *   `travel['cast']` at read time — no data migration needed.
 */
export const NON_SHOOT_ALL = '*';

/** True when the entry carries a day-level status (hold/travel/holiday) — i.e. a true non-shoot day. */
export function hasDayStatus(entry?: NonShootDate | null): boolean {
  return !!entry?.status;
}

export function getNonShootEntryMap(dates: NonShootDate[] | undefined | null): Map<string, NonShootDate> {
  const m = new Map<string, NonShootDate>();
  for (const n of dates || []) m.set(n.date, n);
  return m;
}

/** Normalized travel/hold category→keys lists, legacy `status:'travel' + castIds` folded into travel['cast']. */
export function getTravelHoldLists(entry?: NonShootDate | null): { travel: Record<string, string[]>; hold: Record<string, string[]> } {
  const travel: Record<string, string[]> = {};
  const hold: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(entry?.travel || {})) if (v.length) travel[k] = [...v];
  for (const [k, v] of Object.entries(entry?.hold || {})) if (v.length) hold[k] = [...v];
  if (entry?.status === 'travel' && entry.castIds) {
    const ids = entry.castIds.split(',').map(x => x.trim()).filter(Boolean);
    if (ids.length) travel.cast = [...(travel.cast || []), ...ids];
  }
  return { travel, hold };
}

export function hasTravel(entry?: NonShootDate | null): boolean {
  return Object.keys(getTravelHoldLists(entry).travel).length > 0;
}

export function hasHold(entry?: NonShootDate | null): boolean {
  return Object.keys(getTravelHoldLists(entry).hold).length > 0;
}

/** True when the element key is marked for the given kind on this date (`'*'` covers the whole category). */
export function isElementMarked(entry: NonShootDate | undefined | null, kind: 'travel' | 'hold', category: string, key: string): boolean {
  if (!entry) return false;
  const list = (kind === 'travel' ? entry.travel : entry.hold)?.[category];
  if (!list) return false;
  return list.includes(NON_SHOOT_ALL) || list.includes(key);
}

export interface TravelHoldGroup {
  kind: 'travel' | 'hold';
  category: string;
  keys: string[];
}

/** Display groups (travel first, then hold). `'*'` stays as the single key — renders as "All {Category}". */
export function getTravelHoldGroups(entry: NonShootDate | undefined | null): TravelHoldGroup[] {
  const { travel, hold } = getTravelHoldLists(entry);
  const groups: TravelHoldGroup[] = [];
  for (const [cat, keys] of Object.entries(travel)) groups.push({ kind: 'travel', category: cat, keys });
  for (const [cat, keys] of Object.entries(hold)) groups.push({ kind: 'hold', category: cat, keys });
  return groups;
}

/** True when a group marks the entire category. */
export function isAllKeys(keys: string[]): boolean {
  return keys.length === 1 && keys[0] === NON_SHOOT_ALL;
}

/** Resolves an element key to a display name (cast → "ID. NAME", others → name). */
export function resolveElementName(key: string, category: string, project: any): string {
  if (category === 'cast') {
    const el = (project.castMembers || []).find((m: any) => m.id === key);
    return el ? `${el.id}. ${el.name}` : key;
  }
  const el = getCategoryElements(project, category).find((e: any) => elementMatchId(e, category) === key);
  return el?.name || key;
}
