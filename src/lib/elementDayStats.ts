import { Project } from '../types';
import { buildNonShootSet, computeRowData } from './daybreakUtils';
import { getCategoryElements, elementMatchId, elementKey } from './elements';
import { getFieldItems } from './categories';
import { getDayTypes } from './dayTypes';
import { isElementMarked } from './nonShootHelpers';

/**
 * Per-element scheduling stats — one source of truth for the element
 * manager's day columns (Start/Finish/Total Days, day-type counts).
 *
 * - Production ("work") days: distinct dates of the sections (stripboard
 *   daybreaks) that contain at least one scene referencing the element
 *   (cast = ID, other categories = name, case-insensitive — same matching
 *   as `countOccurrences`).
 * - Statused days: distinct `nonShootDates` where the element is attached
 *   under that status key via `lists[statusKey][category]` (cast = IDs,
 *   others = exact names, `'*'` = whole category — `isElementMarked`).
 *   A date has a single status and can never be both statused and a
 *   production day (the section date cursor skips statused dates), so the
 *   sets never overlap.
 * - The day-type key set is derived from `project.dayTypes` (built-ins +
 *   every custom type from the Calendar's Day Types tab) — never hardcoded.
 *
 * Returned map is keyed by the canonical `elementKey(e)` (`id || name`) so
 * buffered manager rows can look up stats directly.
 */

export interface ElementDayStats {
  /** First date (production or attached) the element appears on, if any. */
  startDate?: string;
  /** Last date (production or attached) the element appears on, if any. */
  finishDate?: string;
  /** Production days the element is scheduled. */
  workDays: number;
  /** Work days + every attached statused day. */
  totalDays: number;
  /** Day-type key → attached days (statused dates the element is on). */
  statusCounts: Record<string, number>;
}

export function computeElementDayStats(project: Project, category: string): Map<string, ElementDayStats> {
  const out = new Map<string, ElementDayStats>();
  const activeVersion = project.versions.find(v => v.id === project.activeVersionId);
  if (!activeVersion) return out;

  const containerRows = activeVersion.rows
    .filter(r => r.containerId != null && r.containerId !== -1)
    .sort((a, b) => {
      if ((a.containerId || 0) !== (b.containerId || 0)) return (a.containerId || 0) - (b.containerId || 0);
      return a.order - b.order;
    });

  const nonShootSet = buildNonShootSet(activeVersion.nonShootDates);
  const startDate = activeVersion.productionStart || new Date().toISOString().slice(0, 10);
  const firstDaybreak = containerRows.find(r => r.type === 'DAYBREAK');
  const callTimeBase = firstDaybreak?.daybreakCallTime || '08:00';

  const { sections, sectionDateMap } = computeRowData(containerRows, project.scenes, startDate, nonShootSet, callTimeBase);

  // Production days per element (scene refs → their stripboard section's date).
  const workDates = new Map<string, Set<string>>();
  for (const section of sections) {
    if (section.isPinned) continue;
    const date = sectionDateMap.get(section.index);
    if (!date) continue;
    for (const row of section.rows) {
      if (row.type !== 'SCENE' || !row.sceneId) continue;
      const scene = project.scenes.find(s => s.id === row.sceneId);
      if (!scene) continue;
      const raw = category === 'cast' ? (scene as any).cast : (scene as any)[category];
      const items = getFieldItems(category, raw);
      if (items.length === 0) continue;
      const seen = new Set<string>();
      for (const item of items) {
        const key = category === 'cast' ? item : item.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        let dates = workDates.get(key);
        if (!dates) workDates.set(key, (dates = new Set()));
        dates.add(date);
      }
    }
  }

  // Registry of stored elements (keyed exactly, matching `elementKey`): cast
  // by ID, others by exact name — the map is looked up by the manager's row key.
  const elements = getCategoryElements(project, category);
  const byKey = new Map<string, { refKey: string }>();
  for (const e of elements) {
    const k = elementKey(e);
    if (!byKey.has(k)) byKey.set(k, { refKey: elementMatchId(e, category) });
  }

  const dayTypeKeys = getDayTypes(project).map(t => t.key);
  const statusDates = new Map<string, Map<string, Set<string>>>();

  for (const e of elements) {
    const k = elementKey(e);
    const s: ElementDayStats = out.get(k) || { workDays: 0, totalDays: 0, statusCounts: {} };
    if (!out.has(k)) out.set(k, s);
    const refKey = byKey.get(k)!.refKey;

    for (const key of dayTypeKeys) {
      let dates = statusDates.get(key);
      if (!dates) statusDates.set(key, (dates = new Map()));
      if (dates.has(k)) continue;
      const set = new Set<string>();
      dates.set(k, set);
      for (const entry of activeVersion.nonShootDates || []) {
        // The element is marked under this type via the day's STATUS or a
        // card (a `lists` group — extra events like a travel card on a work
        // day count in the column too; `'*'` = whole category).
        if (isElementMarked(entry, key, category, refKey)) set.add(entry.date);
      }
      if (set.size > 0) s.statusCounts[key] = set.size;
    }

    const wd = workDates.get(category === 'cast' ? k : k.toLowerCase());
    if (wd && wd.size > 0) {
      s.workDays = wd.size;
    }
    const all = new Set(wd || []);
    for (const dates of statusDates.values()) for (const d of dates.get(k) || []) all.add(d);
    if (all.size > 0) {
      const sorted = [...all].sort();
      s.startDate = sorted[0];
      s.finishDate = sorted[sorted.length - 1];
    }
    s.totalDays = s.workDays + Object.values(s.statusCounts).reduce((a, b) => a + b, 0);
  }

  return out;
}