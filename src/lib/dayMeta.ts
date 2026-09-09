import type { Dispatch } from 'react';
import type { DayCrewCall, DayMeta, ScheduleRow } from '../types';

/**
 * Canonical owner of `ScheduleRow.daybreakMeta` (D6). Day properties live on
 * the GOVERNING DAYBREAK row — the daybreak above a section, exactly like
 * `daybreakCallTime` (D4). Nothing reads the raw field; every access, write
 * and empty-check goes through this module so the storage convention has one
 * home. The shape itself lives in `types.ts`.
 */

export const EMPTY_DAY_META: DayMeta = {};

/** Minimal section shape `daybreakAbove` needs (SectionInfo satisfies it). */
export interface DaySectionLike {
  index: number;
  isPinned?: boolean;
  daybreakRow?: ScheduleRow;
}

/**
 * The daybreak row that governs the section at `index` — the daybreak ABOVE
 * it (the pinned daybreak for the first production day). This is the one row
 * that carries the day's call time AND `daybreakMeta`. Consolidates the two
 * ad-hoc copies that used to live in `reportData.ts` and `violations.ts`.
 */
export function daybreakAbove(sections: DaySectionLike[], index: number): ScheduleRow | undefined {
  return sections[index - 1]?.daybreakRow;
}

/**
 * Base call time of the section at `index`: the governing daybreak's call
 * time, falling back to the section's own closing daybreak, then `fallback`.
 * One source for the `above?.daybreakCallTime || own?.daybreakCallTime || '08:00'`
 * recipe.
 */
export function sectionCallTime(sections: DaySectionLike[], index: number, fallback = '08:00'): string {
  const above = daybreakAbove(sections, index);
  const own = sections[index]?.daybreakRow;
  return above?.daybreakCallTime || own?.daybreakCallTime || fallback;
}

/** The day properties for a row (never undefined; `EMPTY_DAY_META` otherwise). */
export function getDayMeta(row?: ScheduleRow | null): DayMeta {
  return row?.daybreakMeta ?? EMPTY_DAY_META;
}

/** True when a day carries NO user data — the delete warning and bulk-op copy
 *  only fire for days that would actually lose something. */
export function isEmptyDayMeta(meta?: DayMeta | null): boolean {
  if (!meta) return true;
  if (meta.locationId) return false;
  if (meta.locationIds && meta.locationIds.length > 0) return false;
  if (meta.note && meta.note.trim()) return false;
  if (meta.crewIds && meta.crewIds.length > 0) return false;
  if (meta.departmentPrecalls && Object.keys(meta.departmentPrecalls).length > 0) return false;
  if (meta.elementCalls) {
    for (const category of Object.keys(meta.elementCalls)) {
      if (Object.keys(meta.elementCalls[category] || {}).length > 0) return false;
    }
  }
  if (meta.callSheets && Object.keys(meta.callSheets).length > 0) return false;
  return true;
}

/**
 * Writes a `daybreakMeta` patch through `UPDATE_ROW` (single-row — preferred
 * over rebuilding the version's rows). `row` supplies both the id and the
 * current meta so the patch merges instead of replacing the whole bundle.
 */
export function patchDayMeta(
  dispatch: Dispatch<any>,
  versionId: string,
  row: Pick<ScheduleRow, 'id' | 'daybreakMeta'>,
  patch: Partial<DayMeta>,
): void {
  dispatch({
    type: 'UPDATE_ROW',
    payload: {
      versionId,
      rowId: row.id,
      updates: { daybreakMeta: { ...row.daybreakMeta, ...patch } },
    },
  });
}

/**
 * Immutably sets (or clears, when `raw` is blank) one crew person's call-time
 * override. Returns `undefined` when the list would be empty. The Crew grid's
 * single write path.
 */
export function setCrewCall(
  crewCalls: DayCrewCall[] | undefined,
  personId: string,
  raw: string,
): DayCrewCall[] | undefined {
  const calls = [...(crewCalls || [])];
  const idx = calls.findIndex(c => c.personId === personId);
  const value = raw.trim();
  if (idx >= 0) {
    if (value) calls[idx] = { ...calls[idx], callTime: value };
    else {
      const next = { ...calls[idx] };
      delete next.callTime;
      if (!next.note) calls.splice(idx, 1);
      else calls[idx] = next;
    }
  } else if (value) {
    calls.push({ personId, callTime: value });
  }
  return calls.length ? calls : undefined;
}

export interface DayMetaRefSets {
  crewIds?: Set<string>;
  locationIds?: Set<string>;
}

/**
 * Drops day-meta references to deleted crew people / locations. Returns the
 * same object when nothing dangles so callers can cheaply skip a dispatch.
 */
export function pruneDayMetaRefs(meta: DayMeta, valid: DayMetaRefSets): DayMeta {
  let next = meta;
  if (meta.crewIds && valid.crewIds) {
    const kept = meta.crewIds.filter(id => valid.crewIds!.has(id));
    if (kept.length !== meta.crewIds.length) next = { ...next, crewIds: kept };
  }
  if (meta.locationId && valid.locationIds && !valid.locationIds.has(meta.locationId)) {
    const { locationId: _dropped, ...rest } = next;
    next = rest;
  }
  if (meta.locationIds && valid.locationIds) {
    const kept = meta.locationIds.filter(id => valid.locationIds!.has(id));
    if (kept.length !== meta.locationIds.length) next = { ...next, locationIds: kept };
  }
  return next;
}
