import { Project, ScheduleVersion, CalendarVersion, Scene, ScheduleRow, ReportCollection, ReportBlock, ReportDesign, CrewPerson, RuleViolation } from '../types';
import { SectionInfo, ComputedRow } from './daybreakUtils';
import { loadCategoryElements, elementMatchId } from './elements';
import { ELEMENT_CATEGORIES, getFieldItems, getLabel } from './categories';
import { deriveDood, DoodTotals } from './nonShootStats';
import { formatDateShort } from './utils';
import { computeViolationIndex, violationTypeLabel } from './violations';
import { typeLabelOf } from './locations';
import { getDayTypes, codeForType } from './dayTypes';
import { getBrowserTimeZone } from './timezones';
import type { ReportLocation } from './reportWeather';

// ---- the location seam (shared by the report location attributes, the map
// block and sun/weather) --------------------------------------------------------
//
// Roadmap 6/9: `locationsOfItem` is the plural primitive — "the locations this
// item stands for". A locations-DB item resolves to itself; anything else (a
// day today) resolves through `getReportLocation`, which will route to the
// day's derived/attached locations (from its scenes, future attachments) when
// the Location Manager wiring lands. Single-valued consumers show the FIRST
// location; multi-location items get a per-block "Show location" picker.

/** Fixed location until the per-day location DB lands — a dummy London
 *  address (placeholder for the real location attachment). */
export const LONDON_LOCATION: ReportLocation = {
  lat: 51.5074,
  lng: -0.1278,
  place: '112 Maryland Street, London E15 1QD, United Kingdom',
  address: '112 Maryland Street',
  city: 'London',
  postcode: 'E15 1QD',
  country: 'United Kingdom',
  timezone: 'Europe/London',
};

/** The location a report day resolves to. Future location DB: route on the
 *  item (day/scene) here — nothing else in the report pipeline changes. */
export function getReportLocation(ctx: ReportCtx, _item?: any): ReportLocation {
  return {
    ...LONDON_LOCATION,
    timezone: ctx.project.productionInfo?.timezone || getBrowserTimeZone(),
  };
}

/** True when the item is a locations-DB entry (ReportLocationInfo shape). */
export function isLocationItem(it: any): it is ReportLocationInfo {
  return !!it && typeof it.id === 'string' && typeof it.name === 'string' && typeof it.type === 'string' && typeof it.typeLabel === 'string';
}

/** The locations an item stands for (plural — a day may have several later).
 *  Location DB items resolve to themselves; days resolve via getReportLocation.
 *  Consumers render the first location; `locationChoice` (a type key) picks
 *  another when several exist. */
export function locationsOfItem(ctx: ReportCtx, item: any): ReportLocation[] {
  if (isLocationItem(item)) {
    return [{
      lat: item.lat ?? 0,
      lng: item.lng ?? 0,
      place: item.place,
      address: item.address,
      timezone: ctx.project.productionInfo?.timezone || getBrowserTimeZone(),
      info: item,
      typeKey: item.type,
    }];
  }
  return [getReportLocation(ctx, item)];
}

/** The location an item's attribute renders: first by default, else the one
 *  whose type key matches `locationChoice` (per-block "Show location" picker). */
export function pickLocation(ctx: ReportCtx, item: any, locationChoice?: string): ReportLocation | undefined {
  const locs = locationsOfItem(ctx, item);
  if (locs.length === 0) return undefined;
  if (locs.length > 1 && locationChoice) {
    const hit = locs.find(l => l.typeKey === locationChoice);
    if (hit) return hit;
  }
  return locs[0];
}

/** Locations a report design expects: every pinned locations-DB entry the
 *  design iterates (a top-level or nested `locations` / `locationsOfType`
 *  repeat or table). Powers weather prefetch for location scopes. */
export function designLocationsIn(ctx: ReportCtx, design: ReportDesign): ReportLocationInfo[] {
  const refs = new Set<ReportLocationInfo>();
  const walk = (list: ReportBlock[] | undefined) => {
    if (!list) return;
    for (const b of list) {
      if (b.collection === 'locations') {
        // Flat locations blocks carry the type filter (block.category).
        const byType = b.category
          ? ctx.locationInfos.filter(l => l.type === b.category)
          : ctx.locationInfos;
        for (const l of byType) refs.add(l);
      } else if (b.collection === 'locationsOfType') {
        // Per-type tables have NO type picker (roadmap 6) — the parent
        // locationTypes repeat picks per-type at render time, so every pin
        // must warm for the weather fields inside (roadmap 31).
        for (const l of ctx.locationInfos) refs.add(l);
      }
      if (b.type === 'columns') for (const c of b.cols || []) walk(c.blocks);
      if (b.children) walk(b.children);
    }
  };
  walk(design.blocks);
  walk(design.header);
  walk(design.footer);
  return Array.from(refs);
}

// Collection resolvers for the Reports Designer.
// ALL day/section/date/call-time data comes from the canonical daybreak
// computation (useDaybreakSections / computeRowData) — this module only
// derives report-shaped projections on top of it, never re-derives the
// schedule. DOOD aggregates reuse nonShootStats (same engine as the DOOD
// printout). Trailing content after the last daybreak is intentionally
// skipped (v1).

export interface ReportSceneInfo {
  scene: Scene;
  row: ScheduleRow;
  sectionIndex: number;
  chronoDay: number;
  date: string;
  callTime: string;
  durationMin: number;
  sheetNumber: number; // position in the glide breakdown (scenes-array index + 1)
}

export interface ReportDayInfo {
  section: SectionInfo;
  chronoDay: number;
  date: string;
  callTime: string;
  endTime: string;
  totalPages: number;
  shootMin: number;
  breakMin: number;
  label: string;
  sceneCount: number;
  firstScene: string;
  lastScene: string;
}

export interface ReportElementInfo {
  id: string;
  name: string;
  category: string;
  sceneCount: number;
  attachedScenes: string;
  sceneIds: string[];
  totalPages: number;
  workDayList: { day: number; iso: string }[];
  holdDayList: { day: number; iso: string }[];
  travelDayList: { day: number; iso: string }[];
  workDays: number;
  holdDays: number;
  travelDays: number;
  startDate: string | null;
  finishDate: string | null;
}

/** Production-wide aggregates (group 'Production' — the whole schedule). */
export interface ReportProductionTotals {
  shootDays: number;
  shootMin: number;
  breakMin: number;
  pages: number;
  scenes: number;
  firstDay: string;
  lastDay: string;
}

export interface ReportCrewItem {
  role: string;
  name: string;
  phone?: string;
  email?: string;
}

/** One element category, as a repeat/table item of the 'categories' collection. */
export interface ReportCategoryInfo {
  key: string;
  label: string;
  elementCount: number;
  sceneCount: number;
  occurrences: number;
  items: string[]; // display names of every element, for the Items attribute
}

/** One rule type, as a repeat/table item of the 'violationTypes' collection. */
export interface ReportViolationTypeInfo {
  type: string;
  label: string;
  count: number;
  messages: string[];
  violations: RuleViolation[]; // for Lego scoping — never a field value
}

/** One location from the locations DB, as a repeat/table item of the
 *  'locations' / 'locationsOfType' collections. */
export interface ReportLocationInfo {
  id: string;
  name: string;
  type: string;      // key into project.locationTypes
  typeLabel: string;
  address?: string;
  place?: string;
  lat?: number;
  lng?: number;
  contactName?: string;
  phone?: string;
  email?: string;
  notes?: string;
}

/** One location type, as a repeat/table item of the 'locationTypes'
 *  collection. No scene data — not a rule-bearing ancestor. */
export interface ReportLocationTypeInfo {
  key: string;
  label: string;
  count: number;     // locations of this type
}

/** Canonical daybreak output consumed by the reports (from useDaybreakSections). */
export interface ReportDaybreakData {
  sections: SectionInfo[];
  computedRows: ComputedRow[];
}

/** One collection's print scope: which items to include. [] = include NOTHING. */
export interface ReportScope {
  collection: ReportCollection;
  category?: string;                // for elements
  include: (string | number)[];     // reportItemKey values
}

/**
 * Print scope selection for custom reports (header Print → Custom Reports).
 * Only scopes the user explicitly limited appear here — a missing scope for a
 * collection means "include everything".
 */
export interface ReportScopeFilter {
  scopes: ReportScope[];
}

/** Print-time overrides for ONE ribbon block (custom report print dialog).
 *  Every field defaults to the block's own property — the overrides only
 *  change what the print run renders, never the design. */
export interface RibbonPrintOptions {
  ribbonId?: string;                  // override block.ribbonId
  cellBorders?: 'none' | 'vertical' | 'horizontal' | 'both';
  showCallTimes?: boolean;            // override ribbonCallTimes
  showDurations?: boolean;            // override ribbonDurations
  showNotes?: boolean;                // override ribbonNotes (default true)
  showBreaks?: boolean;               // override ribbonBreaks
  showDayBreaks?: boolean;            // override ribbonDayBreaks
}

/** Custom-report print options: per-block ribbon overrides (keyed by block
 *  id — only blocks the user touched appear) + a page-size override. */
export interface ReportPrintOptions {
  ribbonOverrides?: Record<string, RibbonPrintOptions>;
  page?: 'portrait' | 'landscape';    // override the design's page size
}

/** Stable identity key of a report item within its collection. */
export function reportItemKey(collection: ReportCollection, item: ReportCollectionItem): string | number {
  switch (collection) {
    case 'scenes': return (item as ReportSceneInfo).scene.id;
    case 'days': case 'daysOfCast': return (item as ReportDayInfo).section.index;
    case 'cast': case 'elements': case 'elementsOfCategory': {
      const el = item as ReportElementInfo;
      return elementMatchId(el, el.category || 'props');
    }
    case 'categories': return (item as ReportCategoryInfo).key;
    case 'locations': case 'locationsOfType': return (item as ReportLocationInfo).id;
    case 'locationTypes': return (item as ReportLocationTypeInfo).key;
    default: return 0;
  }
}

/** Human label for one collection item — shared by the print dialog's
 *  checklists and the relative block's resolved-target preview. */
export function reportItemLabel(collection: ReportCollection, it: ReportCollectionItem): string {
  switch (collection) {
    case 'scenes': case 'scenesOfDay': case 'scenesOfElement': case 'scenesOfCast':
      return `${(it as ReportSceneInfo).scene.sceneNumber} · ${(it as ReportSceneInfo).scene.set || (it as ReportSceneInfo).scene.description || (it as ReportSceneInfo).scene.intExt || ''}`.replace(/ · $/, '');
    case 'days': case 'daysOfCast': return `Day ${(it as ReportDayInfo).chronoDay} (${formatDateShort((it as ReportDayInfo).date)})`;
    case 'cast': case 'elements': case 'elementsOfCategory': case 'elementsOfScene': return (it as ReportElementInfo).name;
    case 'categories': return (it as ReportCategoryInfo).label;
    case 'crew': return `${(it as ReportCrewItem).role}: ${(it as ReportCrewItem).name}`;
    case 'violationTypes': return (it as ReportViolationTypeInfo).label;
    case 'locations': case 'locationsOfType': return (it as ReportLocationInfo).name;
    case 'locationTypes': return (it as ReportLocationTypeInfo).label;
    default: return '';
  }
}

/**
 * Applies the print scope for `collection`/`category` — only when that scope
 * is explicitly present in the filter (missing scope = include everything).
 * Crew has no stable key — filtered by position in the resolved list.
 */
export function filterItemsByScope(
  items: ReportCollectionItem[],
  collection: ReportCollection | undefined,
  category: string | undefined,
  scopeFilter: ReportScopeFilter | undefined,
): ReportCollectionItem[] {
  if (!scopeFilter || !collection) return items;
  const scope = scopeFilter.scopes.find(s => s.collection === collection && (s.category ?? undefined) === (category ?? undefined));
  if (!scope) return items;
  const set = new Set(scope.include.map(String));
  return items.filter((it, i) => {
    if (collection === 'crew') return set.has(String(i));
    return set.has(String(reportItemKey(collection, it)));
  });
}

// ---- Lego context: scopedToParent --------------------------------------------
//
// A nested repeat/table can scope its collection to the parent's context
// ("only categories of this day", "only elements of this scene", ...). Every
// rule reduces to the same primitive: which SCENES does the parent item stand
// for. crew has no scene association — it stays global.

/** Scene ids a RuleViolation flags (sceneIds with sceneId fallback). */
export function flaggedIdsOf(v: RuleViolation): string[] {
  return v.sceneIds || (v.sceneId ? [v.sceneId] : []);
}

export function parentScenesOf(ctx: ReportCtx, parentItem: ReportCollectionItem | undefined): ReportSceneInfo[] {
  if (!parentItem) return [];
  const any = parentItem as any;
  if (any.scene) return [parentItem as ReportSceneInfo];                       // scene (or a scenes-of-* item)
  if (typeof any.section?.index === 'number') {                                 // day
    return ctx.sceneInfos.filter(si => si.sectionIndex === any.section.index);
  }
  if (Array.isArray(any.violations)) {                                          // violation type → its flagged scenes
    const ids = new Set<string>();
    for (const v of any.violations as RuleViolation[]) for (const id of flaggedIdsOf(v)) ids.add(id);
    return ctx.sceneInfos.filter(si => ids.has(si.scene.id));
  }
  if (typeof any.key === 'string' && any.label !== undefined) {                 // category
    return ctx.sceneInfos.filter(si => ctx.sceneFieldItems(si.scene, any.key).length > 0);
  }
  if (typeof any.id !== 'undefined' && typeof any.name !== 'undefined') {       // element / cast member
    const cat = any.category || 'props';
    const match = elementMatchId(any, cat).toLowerCase();
    return ctx.sceneInfos.filter(si => ctx.sceneFieldItems(si.scene, cat).some(v => v.toLowerCase() === match));
  }
  return [];
}

/** All element category keys (built-in + custom, minus hidden). */
function allCategoryKeysOf(project: Project): string[] {
  const hidden = new Set(project.hiddenCategories || []);
  const keys = ELEMENT_CATEGORIES.map(c => c.key);
  for (const c of project.customCategories || []) if (!keys.includes(c.key)) keys.push(c.key);
  return keys.filter(k => !hidden.has(k));
}

/** Elements attached to a single scene — optionally limited to one category. */
function elementsOfSceneFor(ctx: ReportCtx, scene: Scene, category?: string): ReportElementInfo[] {
  const keys = category ? [category] : allCategoryKeysOf(ctx.project);
  const out: ReportElementInfo[] = [];
  for (const key of keys) {
    const items = ctx.sceneFieldItems(scene, key);
    if (items.length === 0) continue;
    for (const e of getElementsFor(ctx, key)) {
      const match = elementMatchId(e, key).toLowerCase();
      if (items.some(v => v.toLowerCase() === match) && !out.some(x => x.id === e.id && x.category === key)) out.push(e);
    }
  }
  return out;
}

export interface ReportCtx {
  project: Project;
  version: ScheduleVersion;
  /** Active calendar plan — production window + day statuses/events
   *  (item 66: calendar data is versioned independently of the schedule). */
  calendarVersion: CalendarVersion;
  sceneInfos: ReportSceneInfo[];
  dayInfos: ReportDayInfo[];
  categoryInfos: ReportCategoryInfo[];
  castNames: Map<string, string>;
  elementsCache: Map<string, ReportElementInfo[]>;
  crewItems: ReportCrewItem[];
  locationInfos: ReportLocationInfo[];
  locationTypeInfos: ReportLocationTypeInfo[];
  totals: ReportProductionTotals;
  sectionViolations: Map<number, RuleViolation[]>;
  sceneViolations: Map<string, RuleViolation[]>;
  totalViolations: number;
  sceneFieldItems: (scene: Scene, category: string) => string[];
  /** Canonical computed rows by raw row id (call times, daybreak halves,
   *  elapsed captions) — for static note/break/daybreak rendering. */
  computedByRowId: Map<string, ComputedRow>;
}

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function buildReportCtx(
  project: Project,
  version: ScheduleVersion,
  calendarVersion: CalendarVersion,
  daybreak: ReportDaybreakData,
): ReportCtx {
  const { sections, computedRows } = daybreak;

  const sectionIndexByRowId = new Map<string, number>();
  for (const s of sections) {
    for (const r of s.rows) sectionIndexByRowId.set(r.id, s.index);
  }
  const sectionsByIndex = new Map<number, SectionInfo>();
  for (const s of sections) sectionsByIndex.set(s.index, s);

  // stripboard order → per-scene computed info (callTime = computed, not raw)
  const sceneInfos: ReportSceneInfo[] = [];
  for (const cr of computedRows) {
    if (cr.type !== 'SCENE' || !cr.sceneId) continue;
    const sectionIndex = sectionIndexByRowId.get(cr.id);
    const section = sectionIndex !== undefined ? sectionsByIndex.get(sectionIndex) : undefined;
    if (!section) continue; // trailing content after the last daybreak — skipped
    const scene = project.scenes.find(s => s.id === cr.sceneId);
    if (!scene) continue;
    sceneInfos.push({
      scene,
      row: cr,
      sectionIndex,
      chronoDay: section.chronoDay,
      date: section.date,
      callTime: cr.computedCallTime,
      durationMin: cr.estimatedDuration || 0,
      sheetNumber: project.scenes.findIndex(s => s.id === scene.id) + 1,
    });
  }

  // production days — base call = the daybreak ABOVE the section
  const dayInfos: ReportDayInfo[] = [];
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    if (s.isPinned) continue;
    const above = sections[i - 1]?.daybreakRow;
    const sceneNums = s.rows
      .filter(r => r.type === 'SCENE' && r.sceneId)
      .map(r => project.scenes.find(sc => sc.id === r.sceneId)?.sceneNumber)
      .filter(Boolean) as string[];
    dayInfos.push({
      section: s,
      chronoDay: s.chronoDay,
      date: s.date,
      callTime: above?.daybreakCallTime || s.daybreakRow?.daybreakCallTime || '08:00',
      endTime: s.sums.endTime,
      totalPages: s.sums.pages,
      shootMin: s.sums.shoot,
      breakMin: s.sums.break,
      label: s.label,
      sceneCount: sceneNums.length,
      firstScene: sceneNums[0] || '',
      lastScene: sceneNums[sceneNums.length - 1] || '',
    });
  }

  const castNames = new Map<string, string>();
  for (const m of project.castMembers || []) castNames.set(m.id, m.name);

  // element categories — built-in + custom, minus app-hidden. Counts are
  // scene-based (same fields the stripboard/DOOD read), elements via the
  // canonical stored∪scene-derived merge. Empty categories are NOT dropped
  // here — per-block skipEmptyCategories decides that at resolve time.
  const hidden = new Set(project.hiddenCategories || []);
  const categoryInfos: ReportCategoryInfo[] = [];
  for (const c of ELEMENT_CATEGORIES) {
    if (!hidden.has(c.key)) {
      categoryInfos.push({
        key: c.key,
        label: getLabel(c.key, c.label, project.categoryLabels),
        elementCount: 0, sceneCount: 0, occurrences: 0, items: [],
      });
    }
  }
  for (const c of project.customCategories || []) {
    if (!hidden.has(c.key)) {
      categoryInfos.push({ key: c.key, label: c.label, elementCount: 0, sceneCount: 0, occurrences: 0, items: [] });
    }
  }
  for (const info of categoryInfos) {
    const elements = loadCategoryElements(project, info.key);
    info.elementCount = elements.length;
    info.items = elements.map(e => info.key === 'cast' ? (castNames.get(e.id) || e.name || e.id) : (e.name || e.id));
    for (const si of sceneInfos) {
      const items = getFieldItems(info.key, String((si.scene as any)[info.key] ?? ''));
      if (items.length > 0) info.sceneCount++;
      info.occurrences += items.length;
    }
  }

  const crewItems: ReportCrewItem[] = [];
  for (const role of project.crewRoles || []) {
    const people: CrewPerson[] = project.crew?.[role.key] || [];
    for (const p of people) {
      crewItems.push({ role: role.label, name: p.name, phone: p.phone, email: p.email });
    }
  }

  // locations DB — flat list + per-type rollup. Types come from the project's
  // locationTypes (label-based, like crew roles).
  const locationTypes = project.locationTypes || [];
  const locationInfos: ReportLocationInfo[] = (project.locations || []).map(l => ({
    id: l.id,
    name: l.name,
    type: l.type,
    typeLabel: typeLabelOf(l, locationTypes),
    address: l.address,
    place: l.place,
    lat: l.lat,
    lng: l.lng,
    contactName: l.contactName,
    phone: l.phone,
    email: l.email,
    notes: l.notes,
  }));
  const locationTypeInfos: ReportLocationTypeInfo[] = locationTypes.map(t => ({
    key: t.key,
    label: t.label,
    count: 0,
  }));
  for (const info of locationTypeInfos) {
    info.count = locationInfos.filter(l => l.type === info.key).length;
  }

  const totals: ReportProductionTotals = {
    shootDays: dayInfos.length,
    shootMin: dayInfos.reduce((sum, d) => sum + d.shootMin, 0),
    breakMin: dayInfos.reduce((sum, d) => sum + d.breakMin, 0),
    pages: dayInfos.reduce((sum, d) => sum + d.totalPages, 0),
    scenes: sceneInfos.length,
    firstDay: dayInfos[0]?.date || calendarVersion.productionStart || todayIso(),
    lastDay: dayInfos[dayInfos.length - 1]?.date || calendarVersion.productionStart || todayIso(),
  };

  const { sectionViolations, sceneViolations, totalViolations } = computeViolationIndex(project, sections);

  const computedByRowId = new Map<string, ComputedRow>();
  for (const cr of computedRows) computedByRowId.set(cr.id, cr);

  return {
    project,
    version,
    calendarVersion,
    sceneInfos,
    dayInfos,
    categoryInfos,
    castNames,
    elementsCache: new Map(),
    crewItems,
    locationInfos,
    locationTypeInfos,
    totals,
    sectionViolations,
    sceneViolations,
    totalViolations,
    sceneFieldItems: (scene, category) => getFieldItems(category, String((scene as any)[category] ?? '')),
    computedByRowId,
  };
}

export function getElementsFor(ctx: ReportCtx, category: string): ReportElementInfo[] {
  let out = ctx.elementsCache.get(category);
  if (!out) {
    out = buildElementsFor(ctx, category);
    ctx.elementsCache.set(category, out);
  }
  return out;
}

function buildElementsFor(ctx: ReportCtx, category: string): ReportElementInfo[] {
  const { project } = ctx;
  const elements = loadCategoryElements(project, category);
  const stats = computeElementStats(ctx, category, elements);
  const matchId = (e: { id: string; name: string }) => elementMatchId(e, category);
  const chronoByDate = new Map(ctx.dayInfos.map(d => [d.date, d.chronoDay]));
  const toDayEntries = (list: string[]) => list
    .map(iso => ({ iso, day: chronoByDate.get(iso) ?? 0 }))
    .filter(e => e.day > 0);
  const out: ReportElementInfo[] = [];
  for (const e of elements) {
    const scenesOf = ctx.sceneInfos.filter(si =>
      ctx.sceneFieldItems(si.scene, category).some(v => v.toLowerCase() === matchId(e).toLowerCase())
    );
    const t = stats.get(matchId(e));
    out.push({
      id: e.id,
      name: category === 'cast' ? ctx.castNames.get(e.id) || e.id : e.name,
      category,
      sceneCount: scenesOf.length,
      attachedScenes: scenesOf.map(si => si.scene.sceneNumber).join(', '),
      sceneIds: scenesOf.map(si => si.scene.id),
      totalPages: scenesOf.reduce((sum, si) => sum + (si.scene.pageCountDecimal || 0), 0),
      workDayList: toDayEntries(t?.workDayList || []),
      holdDayList: toDayEntries(t?.holdDayList || []),
      travelDayList: toDayEntries(t?.travelDayList || []),
      workDays: t?.workDays ?? 0,
      holdDays: t?.holdDays ?? 0,
      travelDays: t?.travelDays ?? 0,
      startDate: t?.startDate ?? null,
      finishDate: t?.finishDate ?? null,
    });
  }
  return out;
}

function computeElementStats(
  ctx: ReportCtx,
  category: string,
  elements: { id: string; name: string }[],
): Map<string, DoodTotals> {
  const isCast = category === 'cast';
  const matchKey = (e: { id: string; name: string }) => elementMatchId(e, category);
  const idToName = new Map<string, string>();
  for (const e of elements) idToName.set(matchKey(e).toLowerCase(), e.name);
  const typeCodes = new Map<string, string>();
  for (const t of getDayTypes(ctx.project)) typeCodes.set(t.key, codeForType(ctx.project.dayTypes, t.key));
  const { totals } = deriveDood(
    ctx.project.scenes,
    ctx.version.rows,
    ctx.calendarVersion.productionStart || todayIso(),
    ctx.calendarVersion.nonShootDates || [],
    elements.map(matchKey),
    ctx.dayInfos.map(d => d.section.index),
    true,
    category,
    isCast ? ctx.castNames : undefined,
    isCast ? undefined : idToName,
    typeCodes,
  );
  return totals;
}

export type ReportCollectionItem =
  | ReportSceneInfo
  | ReportDayInfo
  | ReportElementInfo
  | ReportCategoryInfo
  | ReportCrewItem
  | ReportViolationTypeInfo
  | ReportLocationInfo
  | ReportLocationTypeInfo;

export function resolveCollection(
  ctx: ReportCtx,
  collection: ReportCollection | undefined,
  category: string | undefined,
  parentItem: any,
  parentCategory?: string,
): ReportCollectionItem[] {
  switch (collection) {
    case 'scenes': return ctx.sceneInfos;
    case 'days': return ctx.dayInfos;
    case 'cast': return getElementsFor(ctx, 'cast');
    case 'elements': return getElementsFor(ctx, category || 'props');
    case 'categories': return ctx.categoryInfos;
    case 'crew': return ctx.crewItems;
    case 'locations': {
      // Type filter (block.category) — "only the unit bases" etc.
      const list = ctx.locationInfos;
      return category ? list.filter(l => l.type === category) : list;
    }
    case 'locationTypes': return ctx.locationTypeInfos;
    case 'locationsOfType': {
      const type = parentItem as ReportLocationTypeInfo | undefined;
      if (!type) return [];
      return ctx.locationInfos.filter(l => l.type === type.key);
    }
    case 'scenesOfDay': {
      const day = parentItem as ReportDayInfo | undefined;
      if (!day) return [];
      return ctx.sceneInfos.filter(si => si.sectionIndex === day.section.index);
    }
    case 'scenesOfElement': {
      const el = parentItem as ReportElementInfo | undefined;
      const cat = parentCategory || el?.category || 'props';
      if (!el) return [];
      const match = elementMatchId(el, cat).toLowerCase();
      return ctx.sceneInfos.filter(si =>
        ctx.sceneFieldItems(si.scene, cat).some(v => v.toLowerCase() === match)
      );
    }
    case 'scenesOfCast': {
      const member = parentItem as ReportElementInfo | undefined;
      if (!member) return [];
      const match = member.id.toLowerCase();
      return ctx.sceneInfos.filter(si =>
        ctx.sceneFieldItems(si.scene, 'cast').some(v => v.toLowerCase() === match)
      );
    }
    case 'daysOfCast': {
      const member = parentItem as ReportElementInfo | undefined;
      if (!member) return [];
      const match = member.id.toLowerCase();
      const dayIdx = new Set(
        ctx.sceneInfos
          .filter(si => ctx.sceneFieldItems(si.scene, 'cast').some(v => v.toLowerCase() === match))
          .map(si => si.sectionIndex),
      );
      return ctx.dayInfos.filter(d => dayIdx.has(d.section.index));
    }
    case 'elementsOfCategory': {
      const cat = parentItem as ReportCategoryInfo | undefined;
      if (!cat) return [];
      return getElementsFor(ctx, cat.key);
    }
    case 'elementsOfScene': {
      const scene = (parentItem as ReportSceneInfo | undefined)?.scene;
      if (!scene) return [];
      return elementsOfSceneFor(ctx, scene, category);
    }
    case 'violationTypes': {
      // One item per rule type, in first-appearance (section) order.
      const byType = new Map<string, ReportViolationTypeInfo>();
      for (const d of ctx.dayInfos) {
        const list = ctx.sectionViolations.get(d.section.index);
        if (!list) continue;
        for (const v of list) {
          let info = byType.get(v.ruleType);
          if (!info) {
            info = { type: v.ruleType, label: violationTypeLabel(v.ruleType), count: 0, messages: [], violations: [] };
            byType.set(v.ruleType, info);
          }
          info.count++;
          info.messages.push(v.message);
          info.violations.push(v);
        }
      }
      return Array.from(byType.values());
    }
    default: return [];
  }
}

/**
 * Block-aware collection resolution: applies the block's own filters for the
 * 'categories' collection (skip-empty — on unless explicitly off — and the
 * excluded list), plus the Lego scoping rule (scopedToParent — on unless
 * explicitly off): the collection is reduced to items that live in EVERY
 * rule-bearing ancestor's scenes (intersection — "this person's scenes on
 * this day"). Crew ancestors have no scene rule and are skipped. Every
 * renderer resolves through here so the designer, preview and page expansion
 * all agree.
 */
/**
 * "Skip empty" registry — which repeat/table collections can skip items that
 * have no children (typed-parent rollups: categories → elementCount,
 * locationTypes → count). Default is ON (`skipEmptyCategories !== false`),
 * per-block opt-out via the block chrome checkbox. New databases (roadmap 6
 * typed-parent pattern) register here + their item's count field; the
 * resolveCollectionItems filter and the "Filters" checkbox follow.
 */
export const SKIP_EMPTY_TEST: Partial<Record<ReportCollection, (item: ReportCollectionItem) => boolean>> = {
  categories: (c: any) => c.elementCount > 0,
  locationTypes: (t: any) => (t as ReportLocationTypeInfo).count > 0,
};

export const SKIP_EMPTY_LABEL: Partial<Record<ReportCollection, string>> = {
  categories: 'Skip categories with no elements',
  locationTypes: 'Skip types with no locations',
};

export function resolveCollectionItems(
  ctx: ReportCtx,
  collection: ReportCollection | undefined,
  category: string | undefined,
  parentItem: any,
  parentCategory: string | undefined,
  block?: ReportBlock,
  ancestors?: ReportCollectionItem[],
): ReportCollectionItem[] {
  let items = resolveCollection(ctx, collection, category, parentItem, parentCategory);
  if (block && block.scopedToParent !== false && collection && ancestors && ancestors.length > 0) {
    const sceneSets = ancestors
      .filter(a => ruleBearingAncestor(a))
      .map(a => parentScenesOf(ctx, a));
    if (sceneSets.length > 0) {
      const inAllSets = (si: ReportSceneInfo) => sceneSets.every(set => set.some(s => s.scene.id === si.scene.id));
      switch (collection) {
        case 'scenes': case 'scenesOfDay': case 'scenesOfElement': case 'scenesOfCast': {
          items = items.filter((it: any) => inAllSets(it));
          break;
        }
        case 'days': case 'daysOfCast': {
          items = items.filter((it: any) => sceneSets.every(set => set.some(s => s.sectionIndex === it.section.index)));
          break;
        }
        case 'categories': {
          items = items.filter((c: any) => sceneSets.every(set => set.some(si => ctx.sceneFieldItems(si.scene, c.key).length > 0)));
          break;
        }
        case 'cast': case 'elements': case 'elementsOfCategory': case 'elementsOfScene': {
          items = items.filter((e: any) => {
            const cat = collection === 'cast' ? 'cast' : (e.category || category || 'props');
            const match = elementMatchId(e, cat).toLowerCase();
            return sceneSets.every(set => set.some(si => ctx.sceneFieldItems(si.scene, cat).some(v => v.toLowerCase() === match)));
          });
          break;
        }
        case 'violationTypes': {
          const idInSet = (id: string) => sceneSets.every(set => set.some(si => si.scene.id === id));
          items = items.filter((t: any) => t.violations?.some((v: RuleViolation) => flaggedIdsOf(v).some(idInSet)));
          break;
        }
        default: break; // crew etc. — no scoping rule
      }
    }
  }
  // Block filters apply LAST — to the global OR the scoped list. "Skip empty"
  // is registered per collection (typed-parent rollups — categories → elements,
  // locationTypes → locations — carry their child count on the item info; a
  // future database plugs in here + its resolveCollection branch and both the
  // filter and the block-chrome checkbox light up automatically).
  if (block && collection) {
    const skipEmpty = SKIP_EMPTY_TEST[collection];
    if (skipEmpty && block.skipEmptyCategories !== false) {
      items = items.filter(it => skipEmpty(it));
    }
    if (collection === 'categories') {
      const excluded = new Set(block.excludedCategories || []);
      if (excluded.size > 0) {
        items = items.filter((c: any) => !excluded.has(c.key));
      }
    }
  }
  return items;
}

/** Ancestors with a scoping rule (anything except crew and locations — no
 *  scene data). Element/cast items are distinguished from location items by
 *  `category`/`sceneIds` (locations carry neither). */
export function ruleBearingAncestor(a: ReportCollectionItem): boolean {
  const any = a as any;
  return !!any.scene
    || typeof any.section?.index === 'number'
    || (typeof any.key === 'string' && Array.isArray(any.items))                       // category
    || Array.isArray(any.violations)                                                   // violation type
    || (typeof any.id !== 'undefined' && (typeof any.category === 'string' || Array.isArray(any.sceneIds))); // element / cast member
}

/**
 * Relative block resolution (roadmap 27) — a mini-repeater over the PARENT
 * repeat's post-scope resolved list: `parentList.slice(idx + offset, idx +
 * offset + count)` where `idx` is the current item's index in that list.
 * `parentItems`/`itemIndex` come from the parent repeat/relative view (exact);
 * the fallback (fragment rendering of a top-level repeat) resolves the parent
 * list from the ancestor chain — ancestors[0] is the current item, ancestors[1]
 * the parent repeat's own parent item.
 */
export function resolveRelativeItems(
  ctx: ReportCtx,
  block: ReportBlock,
  parentCollection: ReportCollection | undefined,
  parentCategory: string | undefined,
  scopeFilter: ReportScopeFilter | undefined,
  parentItems: ReportCollectionItem[] | undefined,
  item: ReportCollectionItem | undefined,
  itemIndex: number | undefined,
  ancestors: ReportCollectionItem[] | undefined,
): ReportCollectionItem[] {
  const offset = block.relativeOffset ?? 1;
  const count = Math.max(1, block.relativeCount ?? 1);
  let list = parentItems;
  if (!list && parentCollection) {
    const parentItem = ancestors && ancestors.length > 1 ? ancestors[1] : undefined;
    const base = resolveCollectionItems(ctx, parentCollection, parentCategory, parentItem, parentCategory, undefined, parentItem ? ancestors?.slice(1) : undefined);
    list = filterItemsByScope(base, parentCollection, parentCollection === 'elements' ? parentCategory : undefined, scopeFilter);
  }
  list = list || [];
  let idx = itemIndex;
  if (idx === undefined && item && list.length > 0 && parentCollection) {
    idx = list.findIndex(it => it === item || reportItemKey(parentCollection, it) === reportItemKey(parentCollection, item));
    if (idx < 0) idx = 0;
  }
  if (idx === undefined) return [];
  return list.slice(idx + offset, idx + offset + count);
}

/**
 * The SCENES a block's ancestor chain stands for (Lego intersection of every
 * rule-bearing ancestor's scenes — same primitive resolveCollectionItems uses
 * for row scoping). Smart fields apply this to stay composable in nested
 * repeats: an element's Shoot Time inside a day→category chain only sums its
 * scenes within that day. null = no scoping (top level).
 */
export function ancestorSceneScope(ctx: ReportCtx, ancestors?: ReportCollectionItem[]): Set<string> | null {
  if (!ancestors || ancestors.length === 0) return null;
  const sceneSets = ancestors.filter(ruleBearingAncestor).map(a => parentScenesOf(ctx, a));
  if (sceneSets.length === 0) return null;
  const ids = new Set(sceneSets[0].map(s => s.scene.id));
  for (const set of sceneSets.slice(1)) {
    const keep = new Set(set.map(s => s.scene.id));
    for (const id of [...ids]) {
      if (!keep.has(id)) ids.delete(id);
    }
  }
  return ids;
}
