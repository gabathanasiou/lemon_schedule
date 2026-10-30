import type { BudgetLineSource, Project } from '../../types';
import { buildNonShootSet, computeRowData } from '../daybreakUtils';
import { buildDayViews } from '../dayView';
import { activeBudgetVersion } from './model';

/**
 * Schedule → budget quantities (`docs/BUDGETING.md` §4, `BUDGETING-SURFACES.md`
 * §9). Built from the SAME canonical day views the Day Manager/DOOD read, so a
 * budget can never disagree with the stripboard. Live links have no sync step:
 * `computeBudget` asks this module for the quantity at read time.
 */

export interface ScheduleQuantities {
  shootDays: number;
  prepDays: number;
  postDays: number;
  /** `${roleKey}\u0000${personId}` → production days that person works. */
  crewPersonDays: Record<string, number>;
  /** roleKey → production days the role is filled (by anyone). */
  crewRoleDays: Record<string, number>;
  /** cast Board ID → production days the member works. */
  castDays: Record<string, number>;
  /** location DB id → production days it is the master or a key location. */
  locationDays: Record<string, number>;
  /** `${category}\u0000${elementKey}` → production days it appears. */
  elementDays: Record<string, number>;
}

const EMPTY: ScheduleQuantities = {
  shootDays: 0, prepDays: 0, postDays: 0,
  crewPersonDays: {}, crewRoleDays: {}, castDays: {}, locationDays: {}, elementDays: {},
};

function parseIso(date: string | undefined): Date | null {
  if (!date) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(d.getTime()) ? d : null;
}

function daysBetween(from: string | undefined, to: string | undefined): number {
  const a = parseIso(from);
  const b = parseIso(to);
  if (!a || !b) return 0;
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86400000));
}

/** Pure schedule read: the active version's production days and what each
 *  carries. Returns zeros (never throws) for an empty project. */
export function computeScheduleQuantities(project: Project): ScheduleQuantities {
  const version = project.versions.find(v => v.id === project.activeVersionId);
  if (!version) return EMPTY;
  const calendar = project.calendarVersions.find(c => c.id === project.activeCalendarVersionId)
    || project.calendarVersions[0];
  const rows = version.rows
    .filter(r => r.containerId != null && r.containerId !== -1)
    .sort((a, b) => {
      if ((a.containerId || 0) !== (b.containerId || 0)) return (a.containerId || 0) - (b.containerId || 0);
      return a.order - b.order;
    });
  const nonShootSet = buildNonShootSet(calendar?.nonShootDates);
  const startDate = calendar?.productionStart || new Date().toISOString().slice(0, 10);
  const callTimeBase = rows.find(r => r.type === 'DAYBREAK')?.daybreakCallTime || '08:00';
  const { sections, sectionDateMap, computedRows, sectionSums } = computeRowData(
    rows, project.scenes, startDate, nonShootSet, callTimeBase,
  );
  const productionSections = sections.filter(s => !s.isPinned);
  const days = buildDayViews({
    project, sections, productionSections, sectionDateMap, computedRows, sectionSums,
    calendarVersion: calendar,
  });

  const q: ScheduleQuantities = {
    ...EMPTY,
    crewPersonDays: {}, crewRoleDays: {}, castDays: {}, locationDays: {}, elementDays: {},
    shootDays: days.length,
    prepDays: daysBetween(calendar?.prepStart, calendar?.productionStart),
    postDays: daysBetween(days[days.length - 1]?.date || calendar?.productionStart, calendar?.postEnd),
  };
  for (const day of days) {
    for (const entry of day.crew) {
      const role = entry.role;
      q.crewRoleDays[role] = (q.crewRoleDays[role] || 0) + 1;
      const key = `${role}\u0000${entry.person.id}`;
      q.crewPersonDays[key] = (q.crewPersonDays[key] || 0) + 1;
    }
    for (const entry of day.cast) q.castDays[entry.key] = (q.castDays[entry.key] || 0) + 1;
    for (const loc of [day.masterLocation, ...day.keyLocations]) {
      if (loc) q.locationDays[loc.id] = (q.locationDays[loc.id] || 0) + 1;
    }
    for (const [category, entries] of Object.entries(day.elements)) {
      for (const entry of entries) {
        const key = `${category}\u0000${entry.key}`;
        q.elementDays[key] = (q.elementDays[key] || 0) + 1;
      }
    }
  }
  return q;
}

/** The quantity a source resolves to today (0 + no crash when the target is
 *  gone — the caller surfaces the warning). */
export function scheduleQtyFor(source: BudgetLineSource | undefined, q: ScheduleQuantities): number {
  if (!source) return 0;
  switch (source.kind) {
    case 'shootDays': return q.shootDays;
    case 'perDay': return q.shootDays;
    case 'crewRole': return source.personId
      ? q.crewPersonDays[`${source.roleKey}\u0000${source.personId}`] || 0
      : q.crewRoleDays[source.roleKey] || 0;
    case 'cast': return q.castDays[source.castId] || 0;
    case 'location': return q.locationDays[source.locationId] || 0;
    case 'element': return q.elementDays[`${source.category}\u0000${source.key}`] || 0;
    default: return 0;
  }
}

/** Read-only system globals (recomputed at read time, never stored stale). */
export function computeSystemGlobals(project: Project, q: ScheduleQuantities): Record<string, number> {
  const calendar = project.calendarVersions.find(c => c.id === project.activeCalendarVersionId)
    || project.calendarVersions[0];
  const totalDays = daysBetween(calendar?.productionStart, calendar?.postEnd);
  return {
    SHOOT_DAYS: q.shootDays,
    PREP_DAYS: q.prepDays,
    PREP_WEEKS: Math.round((q.prepDays / 5) * 10) / 10,
    WRAP_DAYS: 0,
    WRAP_WEEKS: 0,
    POST_WEEKS: Math.round((q.postDays / 5) * 10) / 10,
    TOTAL_WEEKS: Math.round((totalDays / 7) * 10) / 10,
  };
}

export const SYSTEM_GLOBAL_KEYS = ['SHOOT_DAYS', 'PREP_DAYS', 'PREP_WEEKS', 'WRAP_DAYS', 'WRAP_WEEKS', 'POST_WEEKS', 'TOTAL_WEEKS'] as const;

/**
 * Approved scenario: compute the pinned quantity for every live-linked line so
 * the version cannot drift after locking. Pure — the reducer receives the map
 * and never computes schedule quantities itself.
 */
export function lockBudgetVersion(project: Project, versionId: string): { id: string; pinned: Record<string, number> } {
  const version = project.budget?.versions.find(v => v.id === versionId);
  const pinned: Record<string, number> = {};
  if (version) {
    const quantities = computeScheduleQuantities(project);
    for (const line of version.lines) {
      if (line.source && line.qtyOverride == null) pinned[line.id] = scheduleQtyFor(line.source, quantities);
    }
  }
  return { id: versionId, pinned };
}

export function budgetLineCount(project: Project): number {
  const version = activeBudgetVersion(project.budget);
  return version?.lines.length || 0;
}
