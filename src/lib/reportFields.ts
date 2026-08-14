import { Project } from '../types';
import { ELEMENT_CATEGORIES, getLabel, isMultiValue } from './categories';
import { formatDateCustom, formatDayList, formatDuration, formatPageCount, DayFormatMode } from './utils';
import { escapeHtml, normalizeSpaces } from './richText';
import { parentNoun } from './reportBlocks';
import {
  ReportCtx, ReportSceneInfo, ReportDayInfo, ReportElementInfo, ReportCategoryInfo, ReportCrewItem,
} from './reportData';

// Single field registry for the Reports Designer. Attributes only exist in the
// context where they make sense — the palette, token picker and table pickers
// all filter by scope (see getFieldsForScope). Every get() is guarded at the
// value boundary (item type mismatch → ''), never crash.
//
// Display vocabulary:
//  - `separator` → a divider rendered before the field inside its submenu
//  - scope 'smart' → universal contextual fields (see SMART_FIELDS).

export interface ReportFieldDef {
  key: string;
  label: string;
  group: string;
  scope: 'scenes' | 'elements' | 'cast' | 'categories' | 'document' | 'days' | 'crew' | 'production' | 'project' | 'smart';
  align?: 'left' | 'center' | 'right';
  defaultWidth?: number;
  multiValue?: boolean;  // value is a comma-separated list → per-item affixes apply
  separator?: boolean;   // render a divider before this field inside its submenu
  get: (ctx: ReportCtx, item?: any, aux?: FieldAux) => string;
}

/** Render-time context for document fields (counter index, page numbers…). */
export interface FieldAux {
  index?: number;                  // 0-based iteration index (nearest repeat/table)
  pageIndex?: number;              // 0-based page
  pageCount?: number;
  counterStart?: number;           // from the iterating block
  pageSize?: 'portrait' | 'landscape';
  dayFormat?: DayFormatMode;       // from the block's day-list display mode
  sceneScope?: Set<string> | null; // Lego ancestor intersection — smart fields resolve within it
}

const s = (v: unknown): string => (v == null ? '' : String(v));

/** The project's global date format (Production tab) — source of truth for report dates. */
const dateKey = (ctx: ReportCtx) => ctx.project.productionInfo?.dateFormat;

/**
 * Re-joins a comma-separated attribute with per-item affixes. Only used when
 * the field is multiValue and the block carries at least one item option —
 * otherwise the raw value passes through untouched.
 */
export function applyItemAffixes(value: string, opts: { itemPrefix?: string; itemSuffix?: string; itemSeparator?: string }): string {
  const parts = value.split(',').map(x => x.trim()).filter(Boolean);
  if (parts.length === 0) return value;
  const sep = opts.itemSeparator ?? ', ';
  return parts.map(p => `${opts.itemPrefix ?? ''}${p}${opts.itemSuffix ?? ''}`).join(sep);
}

function keyPerson(ctx: ReportCtx, roleKey: string): string {
  return (ctx.project.crew?.[roleKey] || []).map(p => p.name).join(', ');
}

function sceneCast(ctx: ReportCtx, ids: string): string {
  return ids.split(',').map(x => x.trim()).filter(Boolean)
    .map(id => ctx.castNames.get(id) || id)
    .join(', ');
}

// ---- scenes ------------------------------------------------------------------

const SCENE_FIELDS: ReportFieldDef[] = [
  { key: 'sceneNumber', label: 'Scene #', group: 'Scene Info', scope: 'scenes', align: 'center', defaultWidth: 8, get: (_c, it: ReportSceneInfo) => s(it.scene.sceneNumber) },
  { key: 'sheetNumber', label: 'Sheet #', group: 'Scene Info', scope: 'scenes', align: 'center', defaultWidth: 8, get: (_c, it: ReportSceneInfo) => s(it.sheetNumber) },
  { key: 'scriptDay', label: 'Script Day', group: 'Scene Info', scope: 'scenes', align: 'center', defaultWidth: 9, get: (_c, it: ReportSceneInfo) => s(it.scene.scriptDay) },
  { key: 'intExt', label: 'Int/Ext', group: 'Scene Info', scope: 'scenes', align: 'center', defaultWidth: 7, get: (_c, it: ReportSceneInfo) => s(it.scene.intExt) },
  { key: 'set', label: 'Set', group: 'Scene Info', scope: 'scenes', defaultWidth: 20, get: (_c, it: ReportSceneInfo) => s(it.scene.set) },
  { key: 'dayNight', label: 'Day/Night', group: 'Scene Info', scope: 'scenes', align: 'center', defaultWidth: 8, get: (_c, it: ReportSceneInfo) => s(it.scene.dayNight) },
  { key: 'pageCount', label: 'Page Count', group: 'Scene Info', scope: 'scenes', align: 'center', defaultWidth: 8, get: (_c, it: ReportSceneInfo) => formatPageCount(it.scene.pageCountDecimal || 0) },
  { key: 'description', label: 'Description', group: 'Scene Info', scope: 'scenes', defaultWidth: 30, get: (_c, it: ReportSceneInfo) => s(it.scene.description) },
  { key: 'notes', label: 'Notes', group: 'Scene Info', scope: 'scenes', defaultWidth: 22, get: (_c, it: ReportSceneInfo) => s(it.scene.notes) },
  { key: 'callTime', label: 'Call Time', group: 'Shooting', scope: 'scenes', defaultWidth: 8, get: (_c, it: ReportSceneInfo) => s(it.callTime) },
  { key: 'day', label: 'Day', group: 'Shooting', scope: 'scenes', align: 'center', defaultWidth: 6, get: (_c, it: ReportSceneInfo) => s(it.chronoDay || '') },
  { key: 'date', label: 'Date', group: 'Shooting', scope: 'scenes', defaultWidth: 12, get: (ctx, it: ReportSceneInfo) => formatDateCustom(it.date, dateKey(ctx)) },
  { key: 'cast', label: 'Cast Members List', group: 'Breakdown', scope: 'scenes', multiValue: true, defaultWidth: 18, get: (ctx, it: ReportSceneInfo) => sceneCast(ctx, it.scene.cast) },
  { key: 'backgroundActors', label: 'Background Actors List', group: 'Breakdown', scope: 'scenes', multiValue: true, defaultWidth: 14, get: (_c, it: ReportSceneInfo) => s(it.scene.backgroundActors) },
];

// ---- elements & cast (cast identity fields merge into the Elements submenu;
// the six cast duplicates of element fields were removed) -----------------------

const ELEMENT_FIELDS: ReportFieldDef[] = [
  { key: 'elementName', label: 'Name', group: 'Elements', scope: 'elements', defaultWidth: 20, get: (_c, it: ReportElementInfo) => s(it.name) },
  { key: 'elementCategory', label: 'Category', group: 'Elements', scope: 'elements', defaultWidth: 14, get: (_c, it: ReportElementInfo) => s(it.category) },
  { key: 'sceneCount', label: 'Scene Count', group: 'Elements', scope: 'elements', align: 'center', defaultWidth: 10, separator: true, get: (_c, it: ReportElementInfo) => s(it.sceneCount) },
  { key: 'attachedScenes', label: 'Attached Scenes List', group: 'Elements', scope: 'elements', multiValue: true, defaultWidth: 16, get: (_c, it: ReportElementInfo) => s(it.attachedScenes) },
  { key: 'totalPages', label: 'Total Pages', group: 'Elements', scope: 'elements', align: 'center', defaultWidth: 10, get: (_c, it: ReportElementInfo) => formatPageCount(it.totalPages) },
  { key: 'workDayList', label: 'Work Days List', group: 'Elements', scope: 'elements', multiValue: true, defaultWidth: 22, separator: true, get: (ctx, it: ReportElementInfo, aux) => formatDayList(it.workDayList, aux?.dayFormat, dateKey(ctx)) },
  { key: 'totalWorkDays', label: 'Total Work Days', group: 'Elements', scope: 'elements', align: 'center', defaultWidth: 9, get: (_c, it: ReportElementInfo) => s(it.workDays) },
  { key: 'holdDayList', label: 'Hold Days List', group: 'Elements', scope: 'elements', multiValue: true, defaultWidth: 22, get: (ctx, it: ReportElementInfo, aux) => formatDayList(it.holdDayList, aux?.dayFormat, dateKey(ctx)) },
  { key: 'totalHoldDays', label: 'Total Hold Days', group: 'Elements', scope: 'elements', align: 'center', defaultWidth: 9, get: (_c, it: ReportElementInfo) => s(it.holdDays) },
  { key: 'travelDayList', label: 'Travel Days List', group: 'Elements', scope: 'elements', multiValue: true, defaultWidth: 22, get: (ctx, it: ReportElementInfo, aux) => formatDayList(it.travelDayList, aux?.dayFormat, dateKey(ctx)) },
  { key: 'totalTravelDays', label: 'Total Travel Days', group: 'Elements', scope: 'elements', align: 'center', defaultWidth: 9, get: (_c, it: ReportElementInfo) => s(it.travelDays) },
  { key: 'workStart', label: 'Work Start', group: 'Elements', scope: 'elements', defaultWidth: 12, separator: true, get: (ctx, it: ReportElementInfo) => formatDateCustom(it.startDate || '', dateKey(ctx)) },
  { key: 'workFinish', label: 'Work Finish', group: 'Elements', scope: 'elements', defaultWidth: 12, get: (ctx, it: ReportElementInfo) => formatDateCustom(it.finishDate || '', dateKey(ctx)) },
];

// Cast identity only — everything else duplicated the element fields above.
const CAST_FIELDS: ReportFieldDef[] = [
  { key: 'id', label: 'Cast ID', group: 'Cast & Talent', scope: 'cast', align: 'center', defaultWidth: 6, get: (_c, it: ReportElementInfo) => s(it.id) },
  { key: 'castIdName', label: 'Cast ID & Name', group: 'Cast & Talent', scope: 'cast', defaultWidth: 22, get: (_c, it: ReportElementInfo) => s(`${it.id}. ${it.name}`) },
];

// ---- categories (one item per element category) ------------------------------

const CATEGORY_FIELDS: ReportFieldDef[] = [
  { key: 'categoryLabel', label: 'Category Name', group: 'Categories', scope: 'categories', defaultWidth: 20, get: (_c, it: ReportCategoryInfo) => s(it.label) },
  { key: 'categoryItems', label: 'Element List', group: 'Categories', scope: 'categories', multiValue: true, defaultWidth: 30, separator: true, get: (_c, it: ReportCategoryInfo) => it.items.join(', ') },
  { key: 'categoryElementCount', label: 'Element Count', group: 'Categories', scope: 'categories', align: 'center', defaultWidth: 10, separator: true, get: (_c, it: ReportCategoryInfo) => s(it.elementCount) },
  { key: 'categorySceneCount', label: 'Scene Count', group: 'Categories', scope: 'categories', align: 'center', defaultWidth: 10, get: (_c, it: ReportCategoryInfo) => s(it.sceneCount) },
  { key: 'categoryOccurrences', label: 'Total Occurrences', group: 'Categories', scope: 'categories', align: 'center', defaultWidth: 12, get: (_c, it: ReportCategoryInfo) => s(it.occurrences) },
];

// ---- document (counter, pages, print metadata) -------------------------------

const DOCUMENT_FIELDS: ReportFieldDef[] = [
  { key: 'counter', label: 'Counter', group: 'Document', scope: 'document', align: 'center', defaultWidth: 8, get: (_c, _it, aux) => s((aux?.index ?? 0) + (aux?.counterStart ?? 1)) },
  { key: 'pageNumber', label: 'Page Number', group: 'Document', scope: 'document', align: 'center', defaultWidth: 8, get: (_c, _it, aux) => s((aux?.pageIndex ?? 0) + 1) },
  { key: 'pageCount', label: 'Total Pages (report)', group: 'Document', scope: 'document', align: 'center', defaultWidth: 8, get: (_c, _it, aux) => s(aux?.pageCount ?? '') },
  { key: 'printDate', label: 'Print Date', group: 'Document', scope: 'document', defaultWidth: 12, get: (ctx) => formatDateCustom(new Date().toISOString().slice(0, 10), dateKey(ctx)) },
  { key: 'pageSize', label: 'Page Size', group: 'Document', scope: 'document', defaultWidth: 12, get: (_c, _it, aux) => aux?.pageSize ? (aux.pageSize === 'portrait' ? 'A4 Portrait' : 'A4 Landscape') : '' },
];

// ---- days --------------------------------------------------------------------

const DAY_FIELDS: ReportFieldDef[] = [
  { key: 'dayNumber', label: 'Day #', group: 'Days', scope: 'days', align: 'center', defaultWidth: 7, get: (_c, it: ReportDayInfo) => s(it.chronoDay) },
  { key: 'dayLabel', label: 'Day Label', group: 'Days', scope: 'days', defaultWidth: 12, get: (_c, it: ReportDayInfo) => s(it.label) },
  { key: 'dayDate', label: 'Date', group: 'Days', scope: 'days', defaultWidth: 16, separator: true, get: (ctx, it: ReportDayInfo) => formatDateCustom(it.date, dateKey(ctx)) },
  { key: 'dayCallTime', label: 'Call Time', group: 'Days', scope: 'days', defaultWidth: 9, get: (_c, it: ReportDayInfo) => s(it.callTime) },
  { key: 'dayEnd', label: 'End Time', group: 'Days', scope: 'days', defaultWidth: 9, get: (_c, it: ReportDayInfo) => s(it.endTime) },
  { key: 'dayTotalPages', label: 'Total Pages', group: 'Days', scope: 'days', align: 'center', defaultWidth: 9, separator: true, get: (_c, it: ReportDayInfo) => formatPageCount(it.totalPages) },
  { key: 'daySceneCount', label: 'Scene Count', group: 'Days', scope: 'days', align: 'center', defaultWidth: 9, get: (_c, it: ReportDayInfo) => s(it.sceneCount) },
  { key: 'dayFirstScene', label: 'First Scene', group: 'Days', scope: 'days', align: 'center', defaultWidth: 8, separator: true, get: (_c, it: ReportDayInfo) => s(it.firstScene) },
  { key: 'dayLastScene', label: 'Last Scene', group: 'Days', scope: 'days', align: 'center', defaultWidth: 8, get: (_c, it: ReportDayInfo) => s(it.lastScene) },
];

// ---- crew --------------------------------------------------------------------

const CREW_FIELDS: ReportFieldDef[] = [
  { key: 'role', label: 'Role', group: 'Crew', scope: 'crew', defaultWidth: 18, get: (_c, it: ReportCrewItem) => s(it.role) },
  { key: 'crewName', label: 'Name', group: 'Crew', scope: 'crew', defaultWidth: 18, get: (_c, it: ReportCrewItem) => s(it.name) },
  { key: 'phone', label: 'Phone', group: 'Crew', scope: 'crew', defaultWidth: 14, get: (_c, it: ReportCrewItem) => s(it.phone) },
  { key: 'email', label: 'Email', group: 'Crew', scope: 'crew', defaultWidth: 20, get: (_c, it: ReportCrewItem) => s(it.email) },
];

// ---- production & project (static) ------------------------------------------
// Production dates are DERIVED from the schedule (single source of truth) —
// first/last production day + the aggregates below. No manual start/wrap fields.

const PRODUCTION_FIELDS: ReportFieldDef[] = [
  { key: 'company', label: 'Company', group: 'Production', scope: 'production', defaultWidth: 18, get: (ctx) => s(ctx.project.productionInfo?.company) },
  { key: 'studio', label: 'Studio', group: 'Production', scope: 'production', defaultWidth: 18, get: (ctx) => s(ctx.project.productionInfo?.studio) },
  { key: 'productionOffice', label: 'Production Office', group: 'Production', scope: 'production', defaultWidth: 18, get: (ctx) => s(ctx.project.productionInfo?.productionOffice) },
  { key: 'address', label: 'Address', group: 'Production', scope: 'production', defaultWidth: 18, get: (ctx) => s(ctx.project.productionInfo?.address) },
  { key: 'prodPhone', label: 'Phone', group: 'Production', scope: 'production', defaultWidth: 14, get: (ctx) => s(ctx.project.productionInfo?.phone) },
  { key: 'prodEmail', label: 'Email', group: 'Production', scope: 'production', defaultWidth: 18, get: (ctx) => s(ctx.project.productionInfo?.email) },
  { key: 'firstProductionDay', label: 'First Production Day', group: 'Production', scope: 'production', defaultWidth: 12, separator: true, get: (ctx) => formatDateCustom(ctx.totals.firstDay, dateKey(ctx)) },
  { key: 'lastProductionDay', label: 'Last Production Day', group: 'Production', scope: 'production', defaultWidth: 12, get: (ctx) => formatDateCustom(ctx.totals.lastDay, dateKey(ctx)) },
  { key: 'totalShootDays', label: 'Total Shoot Days', group: 'Production', scope: 'production', align: 'center', defaultWidth: 9, separator: true, get: (ctx) => s(ctx.totals.shootDays) },
  { key: 'totalShootTime', label: 'Total Shoot Time', group: 'Production', scope: 'production', defaultWidth: 10, get: (ctx) => formatDuration(ctx.totals.shootMin) },
  { key: 'totalBreakTime', label: 'Total Break Time', group: 'Production', scope: 'production', defaultWidth: 10, get: (ctx) => formatDuration(ctx.totals.breakMin) },
  { key: 'schedulePages', label: 'Total Pages (schedule)', group: 'Production', scope: 'production', align: 'center', defaultWidth: 10, get: (ctx) => formatPageCount(ctx.totals.pages) },
  { key: 'totalScenes', label: 'Total Scenes', group: 'Production', scope: 'production', align: 'center', defaultWidth: 9, get: (ctx) => s(ctx.totals.scenes) },
  { key: 'director', label: 'Director', group: 'Key Positions', scope: 'production', defaultWidth: 16, get: (ctx) => keyPerson(ctx, 'director') },
  { key: 'producer', label: 'Producer', group: 'Key Positions', scope: 'production', defaultWidth: 16, get: (ctx) => keyPerson(ctx, 'producer') },
  { key: 'lineProducer', label: 'Line Producer', group: 'Key Positions', scope: 'production', defaultWidth: 16, get: (ctx) => keyPerson(ctx, 'lineProducer') },
  { key: 'firstAD', label: '1st AD', group: 'Key Positions', scope: 'production', defaultWidth: 16, get: (ctx) => keyPerson(ctx, 'firstAD') },
  { key: 'upm', label: 'UPM', group: 'Key Positions', scope: 'production', defaultWidth: 16, get: (ctx) => keyPerson(ctx, 'upm') },
];

const PROJECT_FIELDS: ReportFieldDef[] = [
  { key: 'title', label: 'Title', group: 'Project', scope: 'project', defaultWidth: 18, get: (ctx) => s(ctx.project.title) },
  { key: 'version', label: 'Schedule Version', group: 'Project', scope: 'project', defaultWidth: 10, get: (ctx) => s(ctx.version.name) },
  { key: 'draftNumber', label: 'Draft #', group: 'Project', scope: 'project', defaultWidth: 8, get: (ctx) => s(ctx.project.draftNumber) },
];

// ---- smart (universal contextual attributes) ----------------------------------
// One field that resolves by the item it sits in: top level → whole production,
// day → that day, scene → its day, element/cast → its scenes, category → its
// scenes. Picker labels carry a context clue ("Shoot Time (of this scene)").

const SMART_PARENT_NOUNS: Record<string, string> = {
  scenes: 'scene', scenesOfDay: 'scene', scenesOfElement: 'scene', scenesOfCast: 'scene', elementsOfScene: 'scene',
  days: 'day', daysOfCast: 'day',
  elements: 'element', elementsOfCategory: 'element',
  categories: 'category',
  cast: 'cast member',
  crew: 'crew member',
};

/** Context clue for a smart field's label given the iterating collection. */
export function smartFieldLabel(base: string, parentCollection?: string | null): string {
  const noun = parentCollection ? SMART_PARENT_NOUNS[parentCollection] : undefined;
  return noun ? `${base} (of this ${noun})` : `${base} (production)`;
}

function smartScenesOf(ctx: ReportCtx, it: any, scope?: Set<string> | null): ReportSceneInfo[] {
  const within = (list: ReportSceneInfo[]) => (scope && scope.size > 0) ? list.filter(si => scope.has(si.scene.id)) : list;
  if (it.scene) return within([it as ReportSceneInfo]);
  if (typeof it.section?.index === 'number') return within(ctx.sceneInfos.filter(si => si.sectionIndex === it.section.index));
  if (typeof it.key === 'string' && it.label !== undefined) {
    return within(ctx.sceneInfos.filter(si => ctx.sceneFieldItems(si.scene, it.key).length > 0));
  }
  if (typeof it.id !== 'undefined' && typeof it.name !== 'undefined') {
    const ids = new Set(it.sceneIds || []);
    const byId = ids.size > 0
      ? ctx.sceneInfos.filter(si => ids.has(si.scene.id))
      : ctx.sceneInfos.filter(si => ctx.sceneFieldItems(si.scene, it.category || 'props').some(v => v.toLowerCase() === (it.name || '').toLowerCase()));
    return within(byId);
  }
  return [];
}

/** The day a smart field stands for: day item → itself, scene item → its day. */
function smartDayOf(ctx: ReportCtx, it: any): ReportDayInfo | undefined {
  if (typeof it.section?.index === 'number') return ctx.dayInfos.find(d => d.section.index === it.section.index);
  if (it.scene) return ctx.dayInfos.find(d => d.section.index === (it as ReportSceneInfo).sectionIndex);
  return undefined;
}

/**
 * Distinct elements across the given scenes (all element categories; cast
 * counts by ID). Used by the smart Element Count field — the count is the
 * number of unique element values actually present in those scenes.
 */
function distinctElementsIn(ctx: ReportCtx, scenes: ReportSceneInfo[]): number {
  const hidden = new Set(ctx.project.hiddenCategories || []);
  const cats = [
    ...ELEMENT_CATEGORIES.filter(c => !hidden.has(c.key)).map(c => c.key),
    ...(ctx.project.customCategories || []).filter(c => !hidden.has(c.key)).map(c => c.key),
  ];
  const seen = new Set<string>();
  for (const si of scenes) {
    for (const cat of cats) {
      for (const v of ctx.sceneFieldItems(si.scene, cat)) {
        const k = v.trim().toLowerCase();
        if (k) seen.add(k);
      }
    }
  }
  return seen.size;
}

// Smart semantics are "the current item's own value", Lego-composed:
//   top level  → whole production
//   day        → that day's total
//   scene      → the scene's own duration/pages (break → its day's break)
//   element/cast → its scenes (scoped to the ancestor chain)
//   category   → its scenes (scoped to the ancestor chain)

const SMART_FIELDS: ReportFieldDef[] = [
  {
    key: 'shootTime', label: 'Shoot Time', group: 'Smart', scope: 'smart', defaultWidth: 10,
    get: (ctx, it, aux) => {
      if (!it) return formatDuration(ctx.totals.shootMin);
      if (it.scene) return formatDuration((it as ReportSceneInfo).durationMin);
      const day = smartDayOf(ctx, it);
      if (day) return formatDuration(day.shootMin);
      const scenes = smartScenesOf(ctx, it, aux?.sceneScope);
      return scenes.length ? formatDuration(scenes.reduce((sum, si) => sum + si.durationMin, 0)) : '';
    },
  },
  {
    key: 'breakTime', label: 'Break Time', group: 'Smart', scope: 'smart', defaultWidth: 10,
    get: (ctx, it, aux) => {
      if (!it) return formatDuration(ctx.totals.breakMin);
      const day = smartDayOf(ctx, it);
      if (day) return formatDuration(day.breakMin);
      const sections = new Set(smartScenesOf(ctx, it, aux?.sceneScope).map(si => si.sectionIndex));
      return sections.size
        ? formatDuration(ctx.dayInfos.reduce((sum, d) => sections.has(d.section.index) ? sum + d.breakMin : sum, 0))
        : '';
    },
  },
  {
    key: 'smartPages', label: 'Total Pages', group: 'Smart', scope: 'smart', align: 'center', defaultWidth: 10,
    get: (ctx, it, aux) => {
      if (!it) return formatPageCount(ctx.totals.pages);
      if (it.scene) return formatPageCount((it as ReportSceneInfo).scene.pageCountDecimal || 0);
      const day = smartDayOf(ctx, it);
      if (day) return formatPageCount(day.totalPages);
      const scenes = smartScenesOf(ctx, it, aux?.sceneScope);
      return scenes.length ? formatPageCount(scenes.reduce((sum, si) => sum + (si.scene.pageCountDecimal || 0), 0)) : '';
    },
  },
  {
    key: 'smartElementCount', label: 'Element Count', group: 'Smart', scope: 'smart', align: 'center', defaultWidth: 8,
    get: (ctx, it, aux) => {
      if (!it) return s(distinctElementsIn(ctx, ctx.sceneInfos));
      if (it.scene) return s(distinctElementsIn(ctx, [it as ReportSceneInfo]));
      const day = smartDayOf(ctx, it);
      if (day) return s(distinctElementsIn(ctx, ctx.sceneInfos.filter(si => si.sectionIndex === day.section.index)));
      if (typeof it.key === 'string' && it.label !== undefined) {
        const seen = new Set<string>();
        for (const si of smartScenesOf(ctx, it, aux?.sceneScope)) {
          for (const v of ctx.sceneFieldItems(si.scene, it.key)) {
            const k = v.trim().toLowerCase();
            if (k) seen.add(k);
          }
        }
        return s(seen.size);
      }
      return s(1); // element/cast item → itself
    },
  },
  {
    key: 'smartSceneCount', label: 'Scene Count', group: 'Smart', scope: 'smart', align: 'center', defaultWidth: 8,
    get: (ctx, it, aux) => {
      if (!it) return s(ctx.totals.scenes);
      if (it.scene) return s(1);
      const day = smartDayOf(ctx, it);
      if (day) return s(day.sceneCount);
      return s(smartScenesOf(ctx, it, aux?.sceneScope).length);
    },
  },
];

// ---- registry ----------------------------------------------------------------

function buildCategorySceneFields(project: Project): ReportFieldDef[] {
  const out: ReportFieldDef[] = [];
  const hidden = new Set(project.hiddenCategories || []);
  const baseKeys = new Set(SCENE_FIELDS.map(f => f.key));
  const listLabel = (label: string, multi: boolean) => `${label}${multi ? ' List' : ''}`;
  for (const cat of ELEMENT_CATEGORIES) {
    if (cat.key === 'cast' || cat.key === 'set' || baseKeys.has(cat.key) || hidden.has(cat.key)) continue;
    out.push({
      key: cat.key,
      label: listLabel(getLabel(cat.key, cat.label, project.categoryLabels), isMultiValue(cat.key, project.customCategories)),
      group: 'Breakdown',
      scope: 'scenes',
      multiValue: isMultiValue(cat.key, project.customCategories),
      defaultWidth: 16,
      get: (_c, it: ReportSceneInfo) => s((it.scene as any)[cat.key]),
    });
  }
  for (const c of project.customCategories || []) {
    if (hidden.has(c.key)) continue;
    out.push({
      key: c.key,
      label: listLabel(c.label, isMultiValue(c.key, project.customCategories)),
      group: 'Breakdown',
      scope: 'scenes',
      multiValue: isMultiValue(c.key, project.customCategories),
      defaultWidth: 16,
      get: (_c, it: ReportSceneInfo) => s((it.scene as any)[c.key]),
    });
  }
  return out;
}

export function getReportFieldDefs(project: Project): ReportFieldDef[] {
  return [
    ...SCENE_FIELDS,
    ...buildCategorySceneFields(project),
    ...ELEMENT_FIELDS,
    ...CAST_FIELDS,
    ...CATEGORY_FIELDS,
    ...DOCUMENT_FIELDS,
    ...DAY_FIELDS,
    ...CREW_FIELDS,
    ...PRODUCTION_FIELDS,
    ...PROJECT_FIELDS,
    ...SMART_FIELDS,
  ];
}

/**
 * Legacy keys from before the attribute overhaul — resolve to their renamed
 * replacements so saved designs keep rendering. Aliases never shadow a real key.
 */
const LEGACY_FIELD_ALIASES: Record<string, string> = {
  shootDays: 'workDayList',
  workDays: 'totalWorkDays',
  holdDays: 'totalHoldDays',
  travelDays: 'totalTravelDays',
  startDate: 'workStart',
  finishDate: 'workFinish',
  castName: 'elementName',
  castWorkDays: 'totalWorkDays',
  castHoldDays: 'totalHoldDays',
  castTravelDays: 'totalTravelDays',
  castStartDate: 'workStart',
  castFinishDate: 'workFinish',
  dayShoot: 'shootTime',
  dayBreak: 'breakTime',
  duration: 'shootTime', // scene duration == smart Shoot Time for a scene item
};

export function getReportFieldMap(project: Project): Record<string, ReportFieldDef> {
  const map = Object.fromEntries(getReportFieldDefs(project).map(f => [f.key, f]));
  for (const [legacy, target] of Object.entries(LEGACY_FIELD_ALIASES)) {
    if (!map[legacy] && map[target]) map[legacy] = map[target];
  }
  return map;
}

const ITEM_SCOPES = new Set(['scenes', 'elements', 'cast', 'days', 'crew']);

function fieldValueSafe(def: ReportFieldDef, ctx: ReportCtx, item: any, aux?: FieldAux): string {
  if (ITEM_SCOPES.has(def.scope) && !item) return '';
  try {
    return def.get(ctx, item, aux) || '';
  } catch {
    return '';
  }
}

export function reportFieldValueByKey(ctx: ReportCtx, fieldMap: Record<string, ReportFieldDef>, key: string, item: any, aux?: FieldAux): string {
  const def = fieldMap[key];
  if (!def) return '';
  return fieldValueSafe(def, ctx, item, aux);
}

// ---- token resolution (text blocks) ------------------------------------------

const TOKEN_RE = /\{\{([^}]+)\}\}/g;
const KEY_POSITION_KEYS = new Set(['director', 'producer', 'lineProducer', 'firstAD', 'upm']);

export interface TokenResolveOptions {
  /** Designer canvas: render the raw token ({{field}}) when its value is empty
   *  so templates stay visible instead of showing a blank spot. Print/preview
   *  keep true empty values. */
  showUnresolved?: boolean;
}

function resolveToken(ctx: ReportCtx, fieldMap: Record<string, ReportFieldDef>, raw: string, item: any, aux?: FieldAux): string {
  const [base, sub] = raw.trim().split('.');
  const def = fieldMap[base];
  if (!def) return '';
  if (def.scope === 'production' && KEY_POSITION_KEYS.has(base)) {
    const people = ctx.project.crew?.[base] || [];
    if (sub === 'phone') return people[0]?.phone || '';
    if (sub === 'email') return people[0]?.email || '';
    return people.map(p => p.name).join(', ');
  }
  return fieldValueSafe(def, ctx, item, aux);
}

export function resolveReportTokens(
  ctx: ReportCtx,
  fieldMap: Record<string, ReportFieldDef>,
  text: string,
  item: any,
  aux?: FieldAux,
  opts?: TokenResolveOptions,
): string {
  return text.replace(TOKEN_RE, (_m, raw: string) => {
    const value = resolveToken(ctx, fieldMap, raw, item, aux);
    return opts?.showUnresolved && !value ? `{{${raw}}}` : value;
  });
}

/** Rich-text variant: token values are HTML-escaped so formatting can't be injected. */
export function resolveReportTokensHtml(
  ctx: ReportCtx,
  fieldMap: Record<string, ReportFieldDef>,
  html: string,
  item: any,
  aux?: FieldAux,
  opts?: TokenResolveOptions,
): string {
  return normalizeSpaces(html).replace(TOKEN_RE, (_m, raw: string) => {
    const value = resolveToken(ctx, fieldMap, raw, item, aux);
    return opts?.showUnresolved && !value ? `{{${escapeHtml(raw)}}}` : escapeHtml(value);
  });
}

export function fieldsForScope(
  fields: ReportFieldDef[],
  scope: string | null | undefined,
  category?: string,
): ReportFieldDef[] {
  const scopeSet = new Set(['production', 'project', 'document', 'smart']);
  if (scope) {
    if (['scenes', 'scenesOfDay', 'scenesOfElement', 'scenesOfCast'].includes(scope)) scopeSet.add('scenes');
    else if (scope === 'elementsOfCategory') scopeSet.add('elements');
    else scopeSet.add(scope);
  }
  // Cast members are reached via Elements → Cast (collection 'elements' with
  // category 'cast') or a categories repeat's Cast item ('elementsOfCategory')
  // — their identity fields (Cast ID, Cast ID & Name) belong there too.
  if (scope === 'cast' || category === 'cast' || scope === 'elementsOfCategory') scopeSet.add('cast');
  return fields.filter(f => scopeSet.has(f.scope));
}

/** Search-by-label-or-key shared by the palette search box and the text
 *  editor's token autocomplete — one source of truth for field filtering. */
export function searchReportFields(fields: ReportFieldDef[], query: string): ReportFieldDef[] {
  const q = query.trim().toLowerCase();
  if (!q) return fields;
  return fields.filter(f => f.label.toLowerCase().includes(q) || f.key.toLowerCase().includes(q));
}

// ---- token chip colors -------------------------------------------------------
// One source of truth for attribute color coding (editor chips, autocomplete
// rows, designer key view). Stored as {text, bg} pairs — chips render with a
// tinted background + colored text.

export interface ChipColor { text: string; bg: string }

const FIELD_GROUP_COLORS: Record<string, ChipColor> = {
  'Scene Info': { text: '#1d4ed8', bg: 'rgba(37, 99, 235, 0.12)' },
  'Shooting': { text: '#6d28d9', bg: 'rgba(109, 40, 217, 0.12)' },
  'Breakdown': { text: '#047857', bg: 'rgba(5, 150, 105, 0.12)' },
  'Elements': { text: '#0e7490', bg: 'rgba(8, 145, 178, 0.12)' },
  'Cast & Talent': { text: '#be185d', bg: 'rgba(219, 39, 119, 0.12)' },
  'Categories': { text: '#b45309', bg: 'rgba(217, 119, 6, 0.12)' },
  'Document': { text: '#475569', bg: 'rgba(100, 116, 139, 0.12)' },
  'Days': { text: '#c2410c', bg: 'rgba(234, 88, 12, 0.12)' },
  'Crew': { text: '#4338ca', bg: 'rgba(79, 70, 229, 0.12)' },
  'Production': { text: '#0f766e', bg: 'rgba(13, 148, 136, 0.12)' },
  'Key Positions': { text: '#334155', bg: 'rgba(71, 85, 105, 0.12)' },
  'Project': { text: '#57534e', bg: 'rgba(87, 83, 78, 0.12)' },
  'Smart': { text: '#a21caf', bg: 'rgba(168, 85, 247, 0.12)' },
  'Violations': { text: '#b91c1c', bg: 'rgba(220, 38, 38, 0.12)' },
};

const FALLBACK_CHIP_COLORS: ChipColor[] = [
  { text: '#1d4ed8', bg: 'rgba(37, 99, 235, 0.12)' },
  { text: '#047857', bg: 'rgba(5, 150, 105, 0.12)' },
  { text: '#be185d', bg: 'rgba(219, 39, 119, 0.12)' },
  { text: '#c2410c', bg: 'rgba(234, 88, 12, 0.12)' },
  { text: '#4338ca', bg: 'rgba(79, 70, 229, 0.12)' },
  { text: '#0e7490', bg: 'rgba(8, 145, 178, 0.12)' },
];

/** Deterministic chip color for an attribute group (custom groups hash onto
 *  the fallback palette). */
export function fieldChipColor(group: string | undefined): ChipColor {
  if (!group) return { text: '#52525b', bg: 'rgba(82, 82, 91, 0.12)' };
  const known = FIELD_GROUP_COLORS[group];
  if (known) return known;
  let h = 0;
  for (const ch of group) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return FALLBACK_CHIP_COLORS[h % FALLBACK_CHIP_COLORS.length];
}

/** Report-wide constant fields — grouped under the GLOBAL divider in pickers. */
export const GLOBAL_FIELD_SCOPES = new Set(['production', 'project', 'document']);
export function isGlobalField(f: ReportFieldDef): boolean {
  return GLOBAL_FIELD_SCOPES.has(f.scope);
}

/** Day-list field keys — the toolbar's day-format dropdown applies to these. */
export const DAY_LIST_FIELD_KEYS = new Set(['workDayList', 'holdDayList', 'travelDayList']);
