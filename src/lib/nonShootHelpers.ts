import { NonShootDate } from '../types';
import { getCategoryElements, elementMatchId } from './elements';

/**
 * Single source of truth for per-date element annotations
 * (`NonShootDate.lists` — keyed by day-type key; travel/hold are just the
 * built-in attachable types' lists after the LOAD migration).
 *
 * - Element keys follow the canonical rule: cast = IDs, every other category
 *   = names (`elementMatchId`).
 * - `'*'` as a category's only key means the ENTIRE category is marked.
 */
export const NON_SHOOT_ALL = '*';

/** True when the entry carries a day-level status — i.e. a true non-shoot day. */
export function hasDayStatus(entry?: NonShootDate | null): boolean {
  return !!entry?.status;
}

export function getNonShootEntryMap(dates: NonShootDate[] | undefined | null): Map<string, NonShootDate> {
  const m = new Map<string, NonShootDate>();
  for (const n of dates || []) m.set(n.date, n);
  return m;
}

/** The list map for ONE status key (empty when the entry has none). */
export function getTypeLists(entry?: NonShootDate | null, statusKey?: string | null): Record<string, string[]> {
  if (!statusKey) return {};
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(entry?.lists?.[statusKey] || {})) if (v.length) out[k] = [...v];
  return out;
}

/** Status keys carrying at least one non-empty list on this date. */
export function getStatusesWithLists(entry?: NonShootDate | null): string[] {
  return Object.keys(entry?.lists || {}).filter(k => Object.values(entry!.lists![k]).some(v => v.length > 0));
}

export function hasAnyLists(entry?: NonShootDate | null): boolean {
  return getStatusesWithLists(entry).length > 0;
}

/** Normalized travel/hold lists (legacy `status:'travel' + castIds` folded into travel['cast']). */
export function getTravelHoldLists(entry?: NonShootDate | null): { travel: Record<string, string[]>; hold: Record<string, string[]> } {
  return { travel: getTypeLists(entry, 'travel'), hold: getTypeLists(entry, 'hold') };
}

export function hasTravel(entry?: NonShootDate | null): boolean {
  return Object.keys(getTravelHoldLists(entry).travel).length > 0;
}

export function hasHold(entry?: NonShootDate | null): boolean {
  return Object.keys(getTravelHoldLists(entry).hold).length > 0;
}

/** True when the element key is marked under the given status key on this
 *  date (`'*'` covers the whole category). */
export function isElementMarked(entry: NonShootDate | undefined | null, statusKey: string, category: string, key: string): boolean {
  const list = getTypeLists(entry, statusKey)[category];
  if (!list) return false;
  return list.includes(NON_SHOOT_ALL) || list.includes(key);
}

export interface TravelHoldGroup {
  kind: 'travel' | 'hold';
  category: string;
  keys: string[];
}

/** Travel/hold display groups (travel first, then hold) — the day-modal editor. */
export function getTravelHoldGroups(entry: NonShootDate | undefined | null): TravelHoldGroup[] {
  const { travel, hold } = getTravelHoldLists(entry);
  const groups: TravelHoldGroup[] = [];
  for (const [cat, keys] of Object.entries(travel)) groups.push({ kind: 'travel', category: cat, keys });
  for (const [cat, keys] of Object.entries(hold)) groups.push({ kind: 'hold', category: cat, keys });
  return groups;
}

export interface TypeListGroup {
  status: string;
  category: string;
  keys: string[];
}

/** All attachment groups on a date, per status key (tooltip display). */
export function getTypeListGroups(entry: NonShootDate | undefined | null): TypeListGroup[] {
  const groups: TypeListGroup[] = [];
  for (const status of getStatusesWithLists(entry)) {
    for (const [cat, keys] of Object.entries(getTypeLists(entry, status))) {
      groups.push({ status, category: cat, keys });
    }
  }
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