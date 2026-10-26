import type { DayMeta } from '../types';

/**
 * The day's attached locations — ONE owner of the master/key list model.
 *
 * `DayMeta.locationId` is a POINTER into the ordered `locationIds` list (the
 * day's master location); `locationIds` keeps the display order, so ticking a
 * different master never moves that row. Legacy days that stored the master
 * only in `locationId` get it prepended on read (then written into the list by
 * the next mutation). Nothing outside this module re-derives the merge.
 */

export interface DayLocationRef {
  /** Locations-DB id (`project.locations`). */
  id: string;
  isMaster: boolean;
}

/** The day's locations in stable display order (master included). */
export function dayLocationRefs(meta: DayMeta): DayLocationRef[] {
  const ids = [...(meta.locationIds || [])];
  if (meta.locationId && !ids.includes(meta.locationId)) ids.unshift(meta.locationId);
  const seen = new Set<string>();
  const out: DayLocationRef[] = [];
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, isMaster: id === meta.locationId });
  }
  return out;
}

/** Attaches a location: appended to the order; the FIRST one becomes master
 *  (a day with no master yet). A no-op when already attached. */
export function addDayLocation(meta: DayMeta, id: string): Partial<DayMeta> {
  if (!id) return {};
  const refs = dayLocationRefs(meta);
  if (refs.some(r => r.id === id)) return {};
  const ids = [...refs.map(r => r.id), id];
  return { locationId: meta.locationId ?? id, locationIds: ids };
}

/** Points the master at one attached location (undefined = no master; the row
 *  stays attached). Never reorders the list. */
export function setDayMaster(meta: DayMeta, id: string | undefined): Partial<DayMeta> {
  const ids = dayLocationRefs(meta).map(r => r.id);
  if (id && !ids.includes(id)) ids.push(id);
  return { locationId: id, locationIds: ids.length ? ids : undefined };
}

/** Detaches a location from the day (removing the master clears the pointer;
 *  no implicit promotion — the explicit checkbox is the one master control). */
export function removeDayLocation(meta: DayMeta, id: string): Partial<DayMeta> {
  const ids = dayLocationRefs(meta).map(r => r.id).filter(x => x !== id);
  const master = meta.locationId === id ? undefined : meta.locationId;
  return { locationId: master, locationIds: ids.length ? ids : undefined };
}

/** Swaps one attached location for another in place (keeps the row's position
 *  and master role). Swapping to an already-attached location dedupes it. */
export function replaceDayLocation(meta: DayMeta, oldId: string, newId: string): Partial<DayMeta> {
  if (!newId || oldId === newId) return {};
  const ids = dayLocationRefs(meta)
    .map(r => r.id)
    // Drop a duplicate of the target, but keep the row being swapped in place.
    .filter(id => id !== newId || id === oldId);
  const at = ids.indexOf(oldId);
  if (at >= 0) ids[at] = newId;
  else ids.push(newId);
  const master = meta.locationId === oldId ? newId : meta.locationId;
  return { locationId: master, locationIds: ids };
}
