import { useMemo } from 'react';
import { useProject } from '../store';
import { CrewPerson, DayMeta, NonShootDate, ProjectLocation, RuleViolation, ScheduleRow, Scene } from '../types';
import { useDaybreakSections, ComputedRow, SectionInfo, SectionSums } from './useDaybreakSections';
import { daybreakAbove, getDayMeta, sectionCallTime } from './dayMeta';
import { ELEMENT_CATEGORIES, getFieldItems } from './categories';
import { getCategoryElements, elementMatchId } from './elements';
import { getNonShootEntryMap, isElementMarked } from './nonShootHelpers';
import { computeSectionViolationMap } from './rulesEngine';
import { codeForType } from './dayTypes';

/**
 * Canonical read model for ONE production day (D7). The page, the pop-out, the
 * copy modal and future quick-edit surfaces all consume the same `DayView`
 * assembled here — sections never re-derive from the store.
 */

export interface DaySceneEntry {
  row: ComputedRow;
  scene?: Scene;
  callTime: string;
}

export interface DayElementEntry {
  category: string;
  /** Element key: cast = Board ID, others = name (`elementMatchId`). */
  key: string;
  name: string;
  /** Cast Board ID (cast only) — the call-sheet ID column. */
  boardId?: string;
  /** 1-based position of the first scene the element appears in. */
  firstScene: number;
  firstCallTime: string;
  /** The element's day-state code (SWF column): status/card code, else `W`. */
  code: string;
}

export interface DayBreakEntry {
  row: ComputedRow;
  label: string;
  duration: number;
  time: string;
}

export interface DayNoteEntry {
  row: ComputedRow;
  text: string;
  time: string;
  color?: string;
}

export interface DayCrewEntry {
  person: CrewPerson;
  role: string;
  /** Explicit per-day call override (falls back to the element chain). */
  callTime?: string;
  note?: string;
}

export interface DayLocationRef {
  id: string;
  name: string;
  type: string;
  location: ProjectLocation;
}

export interface DayView {
  sectionIndex: number;
  /** 1-based production day number (pinned section = 0). */
  chronoDay: number;
  date: string;
  label: string;
  daybreakRow?: ScheduleRow;
  meta: DayMeta;
  callTime: string;
  /** Earliest computed call time on the day (first call). */
  firstCall: string;
  wrap: string;
  status?: string;
  event?: NonShootDate;
  scenes: DaySceneEntry[];
  breaks: DayBreakEntry[];
  notes: DayNoteEntry[];
  cast: DayElementEntry[];
  /** category key → elements appearing that day (cast excluded). */
  elements: Record<string, DayElementEntry[]>;
  sceneLocations: string[];
  masterLocation?: ProjectLocation;
  keyLocations: ProjectLocation[];
  crew: DayCrewEntry[];
  violations: RuleViolation[];
  sums: SectionSums;
}

function resolveName(key: string, category: string, project: any): string {
  if (category === 'cast') {
    // Plain name — callers format the Board ID prefix themselves (it must not
    // be duplicated next to the ID column).
    const el = (project.castMembers || []).find((m: any) => m.id === key);
    return el ? el.name : key;
  }
  const el = getCategoryElements(project, category).find((e: any) => elementMatchId(e, category) === key);
  return el?.name || key;
}

function categoryKeysOf(scene: Scene, category: string): string[] {
  const raw = (scene as any)[category];
  if (typeof raw !== 'string') return [];
  return getFieldItems(category, raw);
}

/** The element's day-state code for the SWF column: a status/card code when
 *  marked (manager order), else `W` (it appears in a scene that day). */
function elementDayCode(project: any, event: NonShootDate | undefined, category: string, key: string): string {
  const defs = project.dayTypes || [];
  if (event?.status) return codeForType(defs, event.status);
  for (const t of defs) {
    if (isElementMarked(event, t.key, category, key)) return codeForType(defs, t.key);
  }
  return 'W';
}

/**
 * Assembles every production day once. Memoized on the canonical inputs
 * (`useDaybreakSections` + project data), so selecting a day is a map lookup.
 */
export function useDayViews(): { days: DayView[]; byIndex: Map<number, DayView> } {
  const { state } = useProject();
  const project = state.present;
  const {
    sections,
    productionSections,
    sectionDateMap,
    nonShootSet,
    computedRows,
    sectionSums,
  } = useDaybreakSections();

  const activeCalendarVersion = project.calendarVersions.find(v => v.id === project.activeCalendarVersionId);
  const nonShootDates = activeCalendarVersion?.nonShootDates;

  const days = useMemo(() => {
    const computedById = new Map<string, ComputedRow>();
    for (const r of computedRows) computedById.set(r.id, r);
    const nonShootByDate = getNonShootEntryMap(nonShootDates);
    const castMembers = project.castMembers || [];
    const crewRoles = project.crewRoles || [];
    const crewMap = project.crew || {};
    const locations = project.locations || [];
    const locationById = new Map(locations.map(l => [l.id, l]));

    const violationMap = computeSectionViolationMap(
      activeCalendarVersion ? (project.versions.find(v => v.id === project.activeVersionId)?.rows || []) : [],
      sections,
      sectionDateMap,
      project.rules || [],
      project.scenes,
      castMembers,
    );

    const customCategoryKeys = (project.customCategories || []).map(c => c.key);
    const categoryKeys = [...ELEMENT_CATEGORIES.map(c => c.key), ...customCategoryKeys].filter(k => k !== 'cast');

    const out: DayView[] = [];
    for (const s of productionSections) {
      const date = sectionDateMap.get(s.index) || '';
      const governingDaybreak = daybreakAbove(sections, s.index);
      const meta = getDayMeta(governingDaybreak);
      const event = nonShootByDate.get(date);

      const sceneEntries: DaySceneEntry[] = [];
      let sceneNo = 0;
      for (const row of s.rows) {
        if (row.type !== 'SCENE' || !row.sceneId) continue;
        sceneNo++;
        const scene = project.scenes.find(sc => sc.id === row.sceneId);
        const computed = computedById.get(row.id);
        sceneEntries.push({ row: computed || (row as ComputedRow), scene, callTime: computed?.computedCallTime || '' });
      }

      const breaks: DayBreakEntry[] = [];
      const notes: DayNoteEntry[] = [];
      for (const row of s.rows) {
        const computed = computedById.get(row.id);
        const time = computed?.computedCallTime || '';
        if (row.type === 'BREAK') {
          breaks.push({ row: computed || (row as ComputedRow), label: row.breakLabel || 'Break', duration: row.breakDuration || 0, time });
        } else if (row.type === 'NOTE') {
          notes.push({ row: computed || (row as ComputedRow), text: row.noteText || '', time, color: row.noteColor });
        }
      }

      const seen = new Map<string, DayElementEntry>();
      const cast: DayElementEntry[] = [];
      const elements: Record<string, DayElementEntry[]> = {};
      sceneEntries.forEach((entry, idx) => {
        if (!entry.scene) return;
        for (const category of ['cast', ...categoryKeys]) {
          for (const key of categoryKeysOf(entry.scene, category)) {
            const mapKey = `${category}\u0000${key}`;
            if (seen.has(mapKey)) continue;
            const item: DayElementEntry = {
              category,
              key,
              name: resolveName(key, category, project),
              boardId: category === 'cast' ? key : undefined,
              firstScene: idx + 1,
              firstCallTime: entry.callTime,
              code: elementDayCode(project, event, category, key),
            };
            seen.set(mapKey, item);
            if (category === 'cast') cast.push(item);
            else (elements[category] ||= []).push(item);
          }
        }
      });

      const sceneLocations: string[] = [];
      for (const entry of sceneEntries) {
        const loc = entry.scene?.location?.trim();
        if (loc && !sceneLocations.includes(loc)) sceneLocations.push(loc);
      }

      const masterLocation = meta.locationId ? locationById.get(meta.locationId) : undefined;
      const keyLocations = (meta.locationIds || []).map(id => locationById.get(id)).filter(Boolean) as ProjectLocation[];

      const crew: DayCrewEntry[] = [];
      const explicitIds = meta.crewIds && meta.crewIds.length > 0 ? meta.crewIds : null;
      const overrideById = new Map<string, { callTime?: string; note?: string }>();
      for (const c of (meta.crewCalls || [])) overrideById.set(c.personId, { callTime: c.callTime, note: c.note });
      for (const role of crewRoles) {
        for (const person of crewMap[role.key] || []) {
          if (explicitIds && !explicitIds.includes(person.id)) continue;
          const override = overrideById.get(person.id);
          crew.push({ person, role: role.key, callTime: override?.callTime, note: override?.note });
        }
      }

      const callTime = sectionCallTime(sections, s.index);
      const firstCall = sceneEntries.reduce((min, e) => (e.callTime && (!min || e.callTime < min) ? e.callTime : min), '');

      out.push({
        sectionIndex: s.index,
        chronoDay: s.chronoDay,
        date,
        label: s.label,
        // The GOVERNING daybreak (above the section) — its call time + meta
        // drive this day. `s.daybreakRow` is the closing one.
        daybreakRow: daybreakAbove(sections, s.index) || s.daybreakRow,
        meta,
        callTime,
        firstCall: firstCall || callTime,
        wrap: s.sums.endTime,
        status: event?.status,
        event,
        scenes: sceneEntries,
        breaks,
        notes,
        cast,
        elements,
        sceneLocations,
        masterLocation,
        keyLocations,
        crew,
        violations: violationMap.get(date) || [],
        sums: sectionSums.get(s.index) || s.sums,
      });
    }
    return out;
  }, [productionSections, sections, sectionDateMap, computedRows, sectionSums, nonShootDates, project, activeCalendarVersion]);

  const byIndex = useMemo(() => new Map(days.map(d => [d.sectionIndex, d])), [days]);
  return { days, byIndex };
}

/** The daybreak above a production section — re-exported so callers building
 *  meta patches don't import both modules. */
export { daybreakAbove };
