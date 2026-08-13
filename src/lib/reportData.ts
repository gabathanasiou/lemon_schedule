import { Project, ScheduleVersion, Scene, ScheduleRow, ReportCollection, ReportBlock, CrewPerson } from '../types';
import { SectionInfo, ComputedRow } from './daybreakUtils';
import { loadCategoryElements, elementMatchId } from './elements';
import { ELEMENT_CATEGORIES, getFieldItems, getLabel } from './categories';
import { deriveDood, DoodTotals } from './nonShootStats';
import { formatDateShort } from './utils';

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
  totalPages: number;
  shootDays: string[];
  workDays: number;
  holdDays: number;
  travelDays: number;
  startDate: string | null;
  finishDate: string | null;
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

/** Stable identity key of a report item within its collection. */
export function reportItemKey(collection: ReportCollection, item: ReportCollectionItem): string | number {
  switch (collection) {
    case 'scenes': return (item as ReportSceneInfo).scene.id;
    case 'days': case 'daysOfCast': return (item as ReportDayInfo).section.index;
    case 'cast': case 'elements': case 'elementsOfCategory': return (item as ReportElementInfo).id;
    case 'categories': return (item as ReportCategoryInfo).key;
    default: return 0;
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

export function parentScenesOf(ctx: ReportCtx, parentItem: ReportCollectionItem | undefined): ReportSceneInfo[] {
  if (!parentItem) return [];
  const any = parentItem as any;
  if (any.scene) return [parentItem as ReportSceneInfo];                       // scene (or a scenes-of-* item)
  if (typeof any.section?.index === 'number') {                                 // day
    return ctx.sceneInfos.filter(si => si.sectionIndex === any.section.index);
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

/** Categories that appear in the given scenes (non-empty breakdown field). */
function categoriesPresentIn(ctx: ReportCtx, scenes: ReportSceneInfo[]): ReportCategoryInfo[] {
  if (scenes.length === 0) return [];
  return ctx.categoryInfos.filter(cat => scenes.some(si => ctx.sceneFieldItems(si.scene, cat.key).length > 0));
}

/** Elements of `category` attached to the given scenes. */
function elementsAttachedTo(ctx: ReportCtx, scenes: ReportSceneInfo[], category: string): ReportElementInfo[] {
  if (scenes.length === 0) return [];
  const out: ReportElementInfo[] = [];
  for (const e of getElementsFor(ctx, category)) {
    const match = elementMatchId(e, category).toLowerCase();
    if (scenes.some(si => ctx.sceneFieldItems(si.scene, category).some(v => v.toLowerCase() === match))) out.push(e);
  }
  return out;
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
  sceneInfos: ReportSceneInfo[];
  dayInfos: ReportDayInfo[];
  categoryInfos: ReportCategoryInfo[];
  castNames: Map<string, string>;
  elementsCache: Map<string, ReportElementInfo[]>;
  crewItems: ReportCrewItem[];
  sceneFieldItems: (scene: Scene, category: string) => string[];
}

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function buildReportCtx(
  project: Project,
  version: ScheduleVersion,
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

  return {
    project,
    version,
    sceneInfos,
    dayInfos,
    categoryInfos,
    castNames,
    elementsCache: new Map(),
    crewItems,
    sceneFieldItems: (scene, category) => getFieldItems(category, String((scene as any)[category] ?? '')),
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
  const out: ReportElementInfo[] = [];
  for (const e of elements) {
    const scenesOf = ctx.sceneInfos.filter(si =>
      ctx.sceneFieldItems(si.scene, category).some(v => v.toLowerCase() === matchId(e).toLowerCase())
    );
    const t = stats.get(e.id);
    out.push({
      id: e.id,
      name: category === 'cast' ? ctx.castNames.get(e.id) || e.id : e.name,
      category,
      sceneCount: scenesOf.length,
      attachedScenes: scenesOf.map(si => si.scene.sceneNumber).join(', '),
      totalPages: scenesOf.reduce((sum, si) => sum + (si.scene.pageCountDecimal || 0), 0),
      shootDays: [...new Set(scenesOf.map(si => `Day ${si.chronoDay} (${formatDateShort(si.date)})`))],
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
  const idToName = new Map<string, string>();
  for (const e of elements) idToName.set(e.id.toLowerCase(), e.name);
  const { totals } = deriveDood(
    ctx.project.scenes,
    ctx.version.rows,
    ctx.version.productionStart || todayIso(),
    ctx.version.nonShootDates || [],
    elements.map(e => e.id),
    ctx.dayInfos.map(d => d.section.index),
    true,
    category,
    isCast ? ctx.castNames : undefined,
    isCast ? undefined : idToName,
  );
  return totals;
}

export type ReportCollectionItem =
  | ReportSceneInfo
  | ReportDayInfo
  | ReportElementInfo
  | ReportCategoryInfo
  | ReportCrewItem;

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
    default: return [];
  }
}

/**
 * Block-aware collection resolution: applies the block's own filters for the
 * 'categories' collection (skip-empty — on unless explicitly off — and the
 * excluded list), plus the Lego scoping rule (scopedToParent — on unless
 * explicitly off): when an outer item is present, the collection is reduced to
 * the items that live in the outer item's scenes. Every renderer resolves
 * through here so the designer, preview and page expansion all agree.
 */
export function resolveCollectionItems(
  ctx: ReportCtx,
  collection: ReportCollection | undefined,
  category: string | undefined,
  parentItem: any,
  parentCategory: string | undefined,
  block?: ReportBlock,
  outerItem?: ReportCollectionItem,
): ReportCollectionItem[] {
  let items = resolveCollection(ctx, collection, category, parentItem, parentCategory);
  if (outerItem && block && block.scopedToParent !== false && collection) {
    const scenes = parentScenesOf(ctx, outerItem);
    const set = new Set(scenes.map(s => s.sectionIndex));
    switch (collection) {
      case 'scenes': case 'scenesOfDay': case 'scenesOfElement': case 'scenesOfCast': {
        items = scenes;
        break;
      }
      case 'days': case 'daysOfCast': {
        items = ctx.dayInfos.filter(d => set.has(d.section.index));
        break;
      }
      case 'categories': {
        items = categoriesPresentIn(ctx, scenes);
        break;
      }
      case 'cast': case 'elements': case 'elementsOfCategory': {
        const cat = collection === 'cast' ? 'cast' : (category || (parentItem as any)?.key || (parentItem as any)?.category || 'props');
        items = elementsAttachedTo(ctx, scenes, cat);
        break;
      }
      case 'elementsOfScene': {
        if (category) {
          items = elementsAttachedTo(ctx, scenes, category);
        } else {
          const out: ReportElementInfo[] = [];
          for (const key of allCategoryKeysOf(ctx.project)) {
            for (const e of elementsAttachedTo(ctx, scenes, key)) {
              if (!out.some(x => x.id === e.id && x.category === key)) out.push(e);
            }
          }
          items = out;
        }
        break;
      }
      default: break; // crew etc. — no scoping rule
    }
  }
  // categories block filters apply LAST — to the global OR the scoped list.
  if (collection === 'categories' && block) {
    if (block.skipEmptyCategories !== false) {
      items = items.filter((c: any) => c.elementCount > 0);
    }
    const excluded = new Set(block.excludedCategories || []);
    if (excluded.size > 0) {
      items = items.filter((c: any) => !excluded.has(c.key));
    }
  }
  return items;
}
