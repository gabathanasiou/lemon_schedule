import { Project, RuleViolation } from '../types';
import { ELEMENT_CATEGORIES, getLabel, isMultiValue } from './categories';
import { formatDateCustom, formatDayList, formatDuration, formatPageCount, DayFormatMode } from './utils';
import { escapeHtml, normalizeSpaces } from './richText';
import { parentNoun } from './reportBlocks';
import { dayTypeLabelForDate, getDayTypes, codeForType, dayTypeForDate } from './dayTypes';
import { getStatusesWithLists } from './nonShootHelpers';
import { sunWeatherFieldValue, reportLocationLabel, reportLocationLinkLabel, reportLocationLink, MapLinkKind, type ReportLocation } from './reportWeather';
import {
  ReportCtx, ReportSceneInfo, ReportDayInfo, ReportElementInfo, ReportCategoryInfo, ReportCrewItem, ReportViolationTypeInfo, flaggedIdsOf,
  ReportLocationInfo, ReportLocationTypeInfo, ReportDayTypeInfo, locationsOfItem, pickLocation,
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
  scope: 'scenes' | 'elements' | 'cast' | 'categories' | 'document' | 'days' | 'crew' | 'production' | 'project' | 'smart' | 'violationTypes' | 'locations' | 'locationTypes' | 'dayTypes';
  align?: 'left' | 'center' | 'right';
  defaultWidth?: number;
  multiValue?: boolean;  // value is a comma-separated list → per-item affixes apply
  /** The value is a structured day list ({day, iso}) — the toolbar's day-format
   *  dropdown applies to fields carrying this marker (dynamic per-type day lists
   *  register it in addition to the static `DAY_LIST_FIELD_KEYS` base). */
  dayList?: boolean;
  separator?: boolean;   // render a divider before this field inside its submenu
  /** The value is a link — text blocks and table cells render it as a
   *  clickable anchor. 'url' = the value is the href; 'mailto'/'tel' wrap it
   *  in mailto:/tel: (no label changes, no icons). */
  link?: boolean;
  linkKind?: 'url' | 'mailto' | 'tel';
  /** Anchor text for url link fields (defaults to the URL). */
  linkLabel?: (ctx: ReportCtx, item?: any) => string;
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
  locationChoice?: string;         // block-level "Show location" pick: a location TYPE key
  dayDate?: string;                // nearest in-scope DAY's date (location rows inside a day repeat)
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
  // Empty separator segment = ", " default — joining items with no spacing is
  // never wanted, so only an EXPLICIT separator (e.g. "; ") overrides it.
  const sep = opts.itemSeparator || ', ';
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
  { key: 'dayType', label: 'Day Type', group: 'Days', scope: 'days', defaultWidth: 14, get: (ctx, it: ReportDayInfo) => s(dayTypeLabelForDate(ctx.project, ctx.calendarVersion.nonShootDates, it.date)) },
  { key: 'dayCode', label: 'Day Type Code', group: 'Days', scope: 'days', align: 'center', defaultWidth: 9, get: (ctx, it: ReportDayInfo) => s(dayCodeForDate(ctx, it.date, it.sceneCount > 0)) },
  { key: 'dayTypeEvents', label: 'Event Types', group: 'Days', scope: 'days', multiValue: true, defaultWidth: 18, get: (ctx, it: ReportDayInfo) => dayTypeEventsForDate(ctx, it.date) },
  { key: 'dayDate', label: 'Date', group: 'Days', scope: 'days', defaultWidth: 16, separator: true, get: (ctx, it: ReportDayInfo) => formatDateCustom(it.date, dateKey(ctx)) },
  { key: 'dayCallTime', label: 'Call Time', group: 'Days', scope: 'days', defaultWidth: 9, get: (_c, it: ReportDayInfo) => s(it.callTime) },
  { key: 'dayEnd', label: 'End Time', group: 'Days', scope: 'days', defaultWidth: 9, get: (_c, it: ReportDayInfo) => s(it.endTime) },
  { key: 'dayTotalPages', label: 'Total Pages', group: 'Days', scope: 'days', align: 'center', defaultWidth: 9, separator: true, get: (_c, it: ReportDayInfo) => formatPageCount(it.totalPages) },
  { key: 'daySceneCount', label: 'Scene Count', group: 'Days', scope: 'days', align: 'center', defaultWidth: 9, get: (_c, it: ReportDayInfo) => s(it.sceneCount) },
  { key: 'dayFirstScene', label: 'First Scene', group: 'Days', scope: 'days', align: 'center', defaultWidth: 8, separator: true, get: (_c, it: ReportDayInfo) => s(it.firstScene) },
  { key: 'dayLastScene', label: 'Last Scene', group: 'Days', scope: 'days', align: 'center', defaultWidth: 8, get: (_c, it: ReportDayInfo) => s(it.lastScene) },
];

/** The day's DOOD cell letter (deriveDood precedence): the status letter wins,
 *  a shooting day is Work (`W` — work wins over cards), a non-shooting
 *  production day falls back to its covering card type's code. */
function dayCodeForDate(ctx: ReportCtx, date: string, isShooting: boolean): string {
  const entry = (ctx.calendarVersion.nonShootDates || []).find(n => n.date === date);
  if (entry?.status) return codeForType(ctx.project.dayTypes, entry.status);
  if (isShooting) return 'W';
  const type = dayTypeForDate(ctx.project, ctx.calendarVersion.nonShootDates, date);
  return type ? codeForType(ctx.project.dayTypes, type.key) : '';
}

/** ALL types on the day — the status plus every card group, in manager order
 *  (multi-type days print fully, not just the covering type). */
function dayTypeEventsForDate(ctx: ReportCtx, date: string): string {
  const entry = (ctx.calendarVersion.nonShootDates || []).find(n => n.date === date);
  const keys = new Set<string>();
  if (entry?.status) keys.add(entry.status);
  for (const k of getStatusesWithLists(entry)) keys.add(k);
  return getDayTypes(ctx.project).filter(t => keys.has(t.key)).map(t => t.label).join(', ');
}

// ---- day types (scope 'dayTypes' — the Day Type Breakdown rollup) -------------
// One item per registry day type (label/code/color/count/days). `dayTypesOfElement`
// items share the same shape, so the same registry entries cover both scopes
// (fieldsForScope maps the child scope onto 'dayTypes').

const DAY_TYPE_FIELDS: ReportFieldDef[] = [
  { key: 'dayTypeLabel', label: 'Day Type', group: 'Day Types', scope: 'dayTypes', defaultWidth: 14, get: (_c, it: ReportDayTypeInfo) => s(it.label) },
  { key: 'dayTypeCode', label: 'Code', group: 'Day Types', scope: 'dayTypes', align: 'center', defaultWidth: 6, separator: true, get: (_c, it: ReportDayTypeInfo) => s(it.code) },
  { key: 'dayTypeColor', label: 'Color', group: 'Day Types', scope: 'dayTypes', defaultWidth: 8, get: (_c, it: ReportDayTypeInfo) => s(it.color || '') },
  { key: 'dayTypeDayCount', label: 'Total Days', group: 'Day Types', scope: 'dayTypes', align: 'center', defaultWidth: 8, separator: true, get: (_c, it: ReportDayTypeInfo) => s(it.dayCount) },
  { key: 'dayTypeDays', label: 'Days List', group: 'Day Types', scope: 'dayTypes', multiValue: true, dayList: true, defaultWidth: 24, get: (ctx, it: ReportDayTypeInfo, aux) => formatDayList(it.dayEntries, aux?.dayFormat, dateKey(ctx)) },
];

// ---- crew --------------------------------------------------------------------

const CREW_FIELDS: ReportFieldDef[] = [
  { key: 'role', label: 'Role', group: 'Crew', scope: 'crew', defaultWidth: 18, get: (_c, it: ReportCrewItem) => s(it.role) },
  { key: 'crewName', label: 'Name', group: 'Crew', scope: 'crew', defaultWidth: 18, get: (_c, it: ReportCrewItem) => s(it.name) },
  { key: 'phone', label: 'Phone', group: 'Crew', scope: 'crew', defaultWidth: 14, link: true, linkKind: 'tel', get: (_c, it: ReportCrewItem) => s(it.phone) },
  { key: 'email', label: 'Email', group: 'Crew', scope: 'crew', defaultWidth: 20, link: true, linkKind: 'mailto', get: (_c, it: ReportCrewItem) => s(it.email) },
];

// ---- production & project (static) ------------------------------------------
// Production dates are DERIVED from the schedule (single source of truth) —
// first/last production day + the aggregates below. No manual start/wrap fields.

const PRODUCTION_FIELDS: ReportFieldDef[] = [
  { key: 'company', label: 'Company', group: 'Production', scope: 'production', defaultWidth: 18, get: (ctx) => s(ctx.project.productionInfo?.company) },
  { key: 'studio', label: 'Studio', group: 'Production', scope: 'production', defaultWidth: 18, get: (ctx) => s(ctx.project.productionInfo?.studio) },
  { key: 'productionOffice', label: 'Production Office', group: 'Production', scope: 'production', defaultWidth: 18, get: (ctx) => s(ctx.project.productionInfo?.productionOffice) },
  { key: 'address', label: 'Address', group: 'Production', scope: 'production', defaultWidth: 18, get: (ctx) => s(ctx.project.productionInfo?.address) },
  { key: 'prodPhone', label: 'Phone', group: 'Production', scope: 'production', defaultWidth: 14, link: true, linkKind: 'tel', get: (ctx) => s(ctx.project.productionInfo?.phone) },
  { key: 'prodEmail', label: 'Email', group: 'Production', scope: 'production', defaultWidth: 18, link: true, linkKind: 'mailto', get: (ctx) => s(ctx.project.productionInfo?.email) },
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

// ---- violation types (one item per rule type) --------------------------------

const VIOLATION_TYPE_FIELDS: ReportFieldDef[] = [
  { key: 'violationType', label: 'Type', group: 'Violations', scope: 'violationTypes', defaultWidth: 16, get: (_c, it: ReportViolationTypeInfo) => s(it.label) },
  { key: 'violationTypeCount', label: 'Violation Count', group: 'Violations', scope: 'violationTypes', align: 'center', defaultWidth: 10, separator: true, get: (_c, it: ReportViolationTypeInfo) => s(it.count) },
  { key: 'violationTypeMessages', label: 'Violation Details', group: 'Violations', scope: 'violationTypes', defaultWidth: 40, get: (_c, it: ReportViolationTypeInfo) => it.messages.join('; ') },
];

// ---- sun & weather (location-aware — same locationsOfItem seam) ----------------
// Scope 'locations' (+ admitted in day contexts): weather is computed for the
// resolved location (day → the day seam; location item → its pin) on the in-
// scope day. The date comes from the item when it's a day, else the nearest
// day ancestor — a locations table inside a days repeat shows that day's
// weather at each location. No day in scope → empty until one is.

const SUN_WEATHER_FIELDS: ReportFieldDef[] = [
  { key: 'sunrise', label: 'Sunrise', group: 'Sun & Weather', scope: 'locations', align: 'center', defaultWidth: 9, get: (ctx, it, aux) => sunWeatherFieldValue(ctx, it, aux, 'sunrise') },
  { key: 'sunset', label: 'Sunset', group: 'Sun & Weather', scope: 'locations', align: 'center', defaultWidth: 9, get: (ctx, it, aux) => sunWeatherFieldValue(ctx, it, aux, 'sunset') },
  { key: 'weather', label: 'Weather', group: 'Sun & Weather', scope: 'locations', defaultWidth: 20, get: (ctx, it, aux) => sunWeatherFieldValue(ctx, it, aux, 'weather') },
];

// ---- location (merged family — one source of truth, per-item dispatch) -------
// Scope 'locations' (+ admitted in day contexts): a location-DB item reads its
// own entry; anything else (a day today) resolves through the locationsOfItem
// seam (London stub until the Location Manager wiring lands). Single-valued
// fields render the FIRST location — no joined lists; a per-block
// `locationChoice` (type key) picks another when a day has several. The old
// dayLocation* keys are gone (no migration per user decision).

const locPart = (
  ctx: ReportCtx,
  it: any,
  aux: FieldAux | undefined,
  part: (loc: ReportLocation) => string,
  dbPart: (info: ReportLocationInfo) => string,
): string => {
  const loc = pickLocation(ctx, it, aux?.locationChoice);
  if (!loc) return '';
  return loc.info ? dbPart(loc.info) : part(loc);
};

const mapLinkField = (kind: MapLinkKind, key: string, label: string): ReportFieldDef => ({
  key, label, group: 'Location', scope: 'locations', link: true, defaultWidth: 20,
  get: (ctx, it, aux) => {
    const loc = pickLocation(ctx, it, aux?.locationChoice);
    if (!loc) return '';
    if (loc.info) {
      const { lat, lng } = loc.info;
      if (lat == null || lng == null) return '';
      return reportLocationLink(kind, { lat, lng, place: loc.info.place, address: loc.info.address, timezone: loc.timezone });
    }
    return reportLocationLink(kind, loc);
  },
  linkLabel: (ctx, it) => {
    const loc = pickLocation(ctx, it);
    if (!loc) return '';
    return loc.info ? loc.info.name : reportLocationLinkLabel(loc);
  },
});

const LOCATION_FIELDS: ReportFieldDef[] = [
  { key: 'locationName', label: 'Name', group: 'Location', scope: 'locations', defaultWidth: 22, get: (ctx, it, aux) => locPart(ctx, it, aux, loc => reportLocationLabel(loc), info => info.name) },
  { key: 'locationType', label: 'Type', group: 'Location', scope: 'locations', defaultWidth: 12, get: (ctx, it, aux) => locPart(ctx, it, aux, () => '', info => info.typeLabel) },
  { key: 'locationAddress', label: 'Street Address', group: 'Location', scope: 'locations', defaultWidth: 24, get: (ctx, it, aux) => locPart(ctx, it, aux, loc => loc.address || '', info => info.address || '') },
  { key: 'locationPlace', label: 'Place', group: 'Location', scope: 'locations', defaultWidth: 24, get: (ctx, it, aux) => locPart(ctx, it, aux, loc => loc.place || '', info => info.place || '') },
  { key: 'locationCity', label: 'City', group: 'Location', scope: 'locations', defaultWidth: 12, get: (ctx, it, aux) => locPart(ctx, it, aux, loc => loc.city || '', () => '') },
  { key: 'locationPostcode', label: 'Postcode', group: 'Location', scope: 'locations', defaultWidth: 10, get: (ctx, it, aux) => locPart(ctx, it, aux, loc => loc.postcode || '', () => '') },
  { key: 'locationCountry', label: 'Country', group: 'Location', scope: 'locations', defaultWidth: 14, get: (ctx, it, aux) => locPart(ctx, it, aux, loc => loc.country || '', () => '') },
  { key: 'locationContact', label: 'Contact', group: 'Location', scope: 'locations', defaultWidth: 14, get: (ctx, it, aux) => locPart(ctx, it, aux, () => '', info => info.contactName || '') },
  { key: 'locationPhone', label: 'Phone', group: 'Location', scope: 'locations', link: true, linkKind: 'tel', defaultWidth: 14, get: (ctx, it, aux) => locPart(ctx, it, aux, () => '', info => info.phone || '') },
  { key: 'locationEmail', label: 'Email', group: 'Location', scope: 'locations', link: true, linkKind: 'mailto', defaultWidth: 18, get: (ctx, it, aux) => locPart(ctx, it, aux, () => '', info => info.email || '') },
  { key: 'locationNotes', label: 'Notes', group: 'Location', scope: 'locations', defaultWidth: 26, get: (ctx, it, aux) => locPart(ctx, it, aux, () => '', info => info.notes || '') },
  mapLinkField('google', 'locationMapLink', 'Map Link (Google Maps)'),
  mapLinkField('apple', 'locationMapLinkApple', 'Map Link (Apple Maps)'),
  mapLinkField('citymapper', 'locationMapLinkCitymapper', 'Map Link (Citymapper)'),
];

// ---- location types (locationTypes items — the typed-parent rollup) ----------

const LOCATION_TYPE_FIELDS: ReportFieldDef[] = [
  { key: 'locationTypeLabel', label: 'Type', group: 'Location', scope: 'locationTypes', defaultWidth: 20, get: (_c, it: ReportLocationTypeInfo) => s(it.label) },
  { key: 'locationTypeCount', label: 'Location Count', group: 'Location', scope: 'locationTypes', align: 'center', defaultWidth: 10, separator: true, get: (_c, it: ReportLocationTypeInfo) => s(it.count) },
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
  if (typeof it.key === 'string' && it.label !== undefined && Array.isArray(it.items)) {
    return within(ctx.sceneInfos.filter(si => ctx.sceneFieldItems(si.scene, it.key).length > 0));
  }
  // Element/cast items carry a category or sceneIds — guard both so a
  // locations-DB item (id + name + type, no scene data) can't be mistaken for
  // an element by the smart fields.
  if (typeof it.id !== 'undefined' && typeof it.name !== 'undefined' && (typeof it.category === 'string' || Array.isArray(it.sceneIds))) {
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

/**
 * Violations standing behind a smart context: scene → its own; day → the
 * section's; element/cast/category → every violation flagging at least one of
 * its scenes (Lego-scoped via the ancestor intersection). Deduped by ruleId.
 */
function violationsOf(ctx: ReportCtx, it: any, scope?: Set<string> | null): RuleViolation[] {
  if (it.scene) return ctx.sceneViolations.get((it as ReportSceneInfo).scene.id) || [];
  const day = smartDayOf(ctx, it);
  if (day) return ctx.sectionViolations.get(day.section.index) || [];
  const ids = new Set(smartScenesOf(ctx, it, scope).map(si => si.scene.id));
  if (ids.size === 0) return [];
  const seen = new Set<string>();
  const out: RuleViolation[] = [];
  for (const [, list] of ctx.sectionViolations) {
    for (const v of list) {
      if (!seen.has(v.ruleId) && flaggedIdsOf(v).some(id => ids.has(id))) {
        seen.add(v.ruleId);
        out.push(v);
      }
    }
  }
  return out;
}

function allViolations(ctx: ReportCtx): RuleViolation[] {
  const out: RuleViolation[] = [];
  for (const [, list] of ctx.sectionViolations) out.push(...list);
  return out;
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
      if (typeof it.key === 'string' && it.label !== undefined && Array.isArray(it.items)) {
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
  {
    key: 'smartViolationCount', label: 'Violation Count', group: 'Smart', scope: 'smart', align: 'center', defaultWidth: 8,
    get: (ctx, it, aux) => {
      if (!it) return s(ctx.totalViolations);
      return s(violationsOf(ctx, it, aux?.sceneScope).length);
    },
  },
  {
    // Plain (NOT multiValue) — violation messages contain commas and
    // applyItemAffixes would split them apart.
    key: 'smartViolations', label: 'Violation Details', group: 'Smart', scope: 'smart', defaultWidth: 40,
    get: (ctx, it, aux) => {
      const list = it ? violationsOf(ctx, it, aux?.sceneScope) : allViolations(ctx);
      return list.map(v => v.message).join('; ');
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

/**
 * Per-type element columns — one `Total {Type} Days` + `{Type} Day List` pair
 * per CUSTOM day type (work/hold/travel already have the built-in trio; Day
 * Off and non-attachable types can't carry elements). Gated to types actually
 * in use (≥1 statused/carded day in the ACTIVE calendar version) so defined-
 * but-unused types never clutter the pickers — re-marking a day re-adds the
 * field automatically. Values come from the element's `typeDayLists`
 * (computeElementStats → isElementMarked, status + cards). Keys are deduped
 * against every already-registered field so a type slug can never collide.
 */
function buildDayTypeElementFields(project: Project, existingKeys: Set<string>): ReportFieldDef[] {
  const out: ReportFieldDef[] = [];
  const activeCal = project.calendarVersions?.find(c => c.id === project.activeCalendarVersionId) || project.calendarVersions?.[0];
  const dates = activeCal?.nonShootDates || [];
  const inUse = (key: string) => dates.some(n => n.status === key || getStatusesWithLists(n).includes(key));
  const cap = (k: string) => k.charAt(0).toUpperCase() + k.slice(1);
  for (const t of getDayTypes(project)) {
    if (t.key === 'work' || t.key === 'hold' || t.key === 'travel') continue;
    if (t.attachable === false) continue;
    if (!inUse(t.key)) continue;
    const totalKey = `total${cap(t.key)}Days`;
    const listKey = `${t.key}DayList`;
    if (existingKeys.has(totalKey) || existingKeys.has(listKey)) continue;
    out.push({
      key: totalKey, label: `Total ${t.label} Days`, group: 'Day Types', scope: 'elements', align: 'center', defaultWidth: 9, separator: true,
      get: (_c, it: ReportElementInfo) => s(it.typeDayLists?.[t.key]?.length || 0),
    });
    out.push({
      key: listKey, label: `${t.label} Day List`, group: 'Day Types', scope: 'elements', multiValue: true, dayList: true, defaultWidth: 24,
      get: (ctx, it: ReportElementInfo, aux) => formatDayList(it.typeDayLists?.[t.key] || [], aux?.dayFormat, dateKey(ctx)),
    });
  }
  return out;
}

export function getReportFieldDefs(project: Project): ReportFieldDef[] {
  const base = [
    ...SCENE_FIELDS,
    ...buildCategorySceneFields(project),
    ...ELEMENT_FIELDS,
    ...CAST_FIELDS,
    ...CATEGORY_FIELDS,
    ...VIOLATION_TYPE_FIELDS,
    ...DOCUMENT_FIELDS,
    ...DAY_FIELDS,
    ...DAY_TYPE_FIELDS,
    ...SUN_WEATHER_FIELDS,
    ...LOCATION_FIELDS,
    ...LOCATION_TYPE_FIELDS,
    ...CREW_FIELDS,
    ...PRODUCTION_FIELDS,
    ...PROJECT_FIELDS,
    ...SMART_FIELDS,
  ];
  const existing = new Set(base.map(f => f.key));
  return [...base, ...buildDayTypeElementFields(project, existing)];
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

/** Scopes whose values come from the resolved collection ITEM (repeat/table
 *  rows) — vs document/project/smart fields that resolve from ctx/aux. */
export const ITEM_SCOPES = new Set(['scenes', 'elements', 'cast', 'days', 'crew', 'locations', 'locationTypes', 'dayTypes']);

/**
 * Breakdown attributes (group 'Breakdown', scene-scope) inside a DAY repeater:
 * resolve to the union of that day's scenes' values — Cast Members List →
 * distinct cast working that day, Props → distinct props across the day's
 * scenes. Composed with the ancestor `sceneScope` intersection like the smart
 * fields, so a days repeater nested in a cast/element chain only unions the
 * scenes that survive the Lego intersection. Field extraction stays in the
 * registry (`def.get` per scene — never re-derived).
 */
function dayBreakdownValue(ctx: ReportCtx, def: ReportFieldDef, day: any, scope?: Set<string> | null): string {
  let scenes = ctx.sceneInfos.filter(si => si.sectionIndex === day.section.index);
  if (scope && scope.size > 0) scenes = scenes.filter(si => scope.has(si.scene.id));
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (v: string) => {
    const k = v.toLowerCase();
    if (k && !seen.has(k)) { seen.add(k); out.push(v); }
  };
  for (const si of scenes) {
    if (def.multiValue) {
      for (const part of String(def.get(ctx, si) || '').split(',').map(x => x.trim()).filter(Boolean)) push(part);
    } else {
      const v = String(def.get(ctx, si) || '').trim();
      if (v) push(v);
    }
  }
  return out.join(', ');
}

function fieldValueSafe(def: ReportFieldDef, ctx: ReportCtx, item: any, aux?: FieldAux): string {
  if (ITEM_SCOPES.has(def.scope) && !item) return '';
  try {
    // Breakdown attributes inside a day repeater can't read `it.scene` (a day
    // item has none) — resolve them per-day instead of blanking out. Only the
    // Breakdown group: other scene-scope fields stay scene-only, so legacy
    // {{sceneNumber}}-style tokens inside day repeaters keep rendering ''.
    if (def.scope === 'scenes' && def.group === 'Breakdown' && item && typeof item.section?.index === 'number') {
      return dayBreakdownValue(ctx, def, item, aux?.sceneScope) || '';
    }
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

export const TOKEN_RE = /\{\{([^}]+)\}\}/g;
const KEY_POSITION_KEYS = new Set(['director', 'producer', 'lineProducer', 'firstAD', 'upm']);

/** Item-formatting options parsed from a token's `|`-separated tail:
 *  `{{field|itemPrefix|itemSuffix|itemSeparator}}` — empty segments mean
 *  defaults. Tokens without pipes carry no options (exact current behavior). */
export interface TokenItemOpts {
  itemPrefix?: string;
  itemSuffix?: string;
  itemSeparator?: string;
}

export function parseToken(raw: string): { field: string; opts: TokenItemOpts } {
  const parts = raw.split('|');
  const field = parts[0].trim();
  if (parts.length === 1) return { field, opts: {} };
  return {
    field,
    opts: {
      itemPrefix: parts[1] ?? '',
      itemSuffix: parts[2] ?? '',
      itemSeparator: parts[3] ?? '',
    },
  };
}

/** Compose a piped token key from parts (omits pipes when all empty). */
export function composeTokenKey(field: string, prefix: string, suffix: string, separator: string): string {
  if (!prefix && !suffix && !separator) return field;
  return `${field}|${prefix}|${suffix}|${separator}`;
}

export interface TokenResolveOptions {
  /** Designer canvas: render the raw token ({{field}}) when its value is empty
   *  so templates stay visible instead of showing a blank spot. Print/preview
   *  keep true empty values. */
  showUnresolved?: boolean;
}

function resolveToken(ctx: ReportCtx, fieldMap: Record<string, ReportFieldDef>, raw: string, item: any, aux?: FieldAux): string {
  const { field, opts } = parseToken(raw);
  const [base, sub] = field.split('.');
  const def = fieldMap[base];
  if (!def) return '';
  if (def.scope === 'production' && KEY_POSITION_KEYS.has(base)) {
    const people = ctx.project.crew?.[base] || [];
    if (sub === 'phone') return people[0]?.phone || '';
    if (sub === 'email') return people[0]?.email || '';
    return people.map(p => p.name).join(', ');
  }
  const value = fieldValueSafe(def, ctx, item, aux);
  // Item affixes only apply to multi-value attributes (the same rule as the
  // retired attribute block) — single values are formatted by typing around
  // the token, and link fields must stay unaffixed so their hrefs stay valid.
  if (def.multiValue && (opts.itemPrefix !== undefined || opts.itemSuffix !== undefined || opts.itemSeparator !== undefined)) {
    return applyItemAffixes(value, opts);
  }
  return value;
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
  return normalizeSpaces(html)
    // Old kit builds serialized via XMLSerializer — drop the xmlns noise it
    // left on every element so polluted stored text renders clean.
    .replace(/ xmlns="http:\/\/www\.w3\.org\/1999\/xhtml"/g, '')
    .replace(TOKEN_RE, (_m, raw: string) => {
    const { field } = parseToken(raw);
    const value = resolveToken(ctx, fieldMap, raw, item, aux);
    if (opts?.showUnresolved && !value) {
      // Designer canvas: an empty token renders as a colored tag (background
      // only — the token text inherits the block's typography) so templates
      // stay visible instead of blank spots.
      const base = field.split('.')[0];
      const color = fieldMap[base] ? fieldChipColor(fieldMap[base].group) : { text: '#52525b', bg: 'rgba(82, 82, 91, 0.12)' };
      return `<span style="${tokenTagCss(color)}">{{${escapeHtml(raw)}}}</span>`;
    }
    // Link fields (map links, emails, phones) resolve to clickable anchors.
    // Scheme-guarded so token values can't inject javascript: URLs. Key
    // positions' .phone/.email sub-tokens link too.
    const [baseKey, subKey] = field.split('.');
    const def = fieldMap[baseKey];
    let kind: 'url' | 'mailto' | 'tel' | null = null;
    if (subKey === 'phone') kind = 'tel';
    else if (subKey === 'email') kind = 'mailto';
    else if (def?.link) kind = def.linkKind || 'url';
    if (kind && value) {
      const href = kind === 'mailto' ? `mailto:${value}` : kind === 'tel' ? `tel:${value}` : value;
      if (/^(https?:\/\/|mailto:|tel:)/i.test(href)) {
        const label = kind === 'url' && def?.linkLabel ? def.linkLabel(ctx, item) : value;
        return `<a href="${escapeHtml(href)}" target="_blank" rel="noreferrer">${escapeHtml(label || href)}</a>`;
      }
    }
    return escapeHtml(value);
  });
}

export function fieldsForScope(
  fields: ReportFieldDef[],
  scope: string | null | undefined,
  category?: string,
): ReportFieldDef[] {
  const scopeSet = new Set(['production', 'project', 'document', 'smart']);
  const dayScope = scope === 'days' || scope === 'daysOfCast';
  if (scope) {
    if (['scenes', 'scenesOfDay', 'scenesOfElement', 'scenesOfCast'].includes(scope)) scopeSet.add('scenes');
    else if (scope === 'elementsOfCategory') scopeSet.add('elements');
    // dayTypesOfElement items share the day-type item shape — the Day Types
    // attributes (scope 'dayTypes') belong there too.
    else if (scope === 'dayTypesOfElement') scopeSet.add('dayTypes');
    else scopeSet.add(scope);
  }
  // Cast members are reached via Elements → Cast (collection 'elements' with
  // category 'cast') or a categories repeat's Cast item ('elementsOfCategory')
  // — their identity fields (Cast ID, Cast ID & Name) belong there too.
  if (scope === 'cast' || category === 'cast' || scope === 'elementsOfCategory') scopeSet.add('cast');
  return fields.filter(f => {
    if (scopeSet.has(f.scope)) return true;
    // Breakdown attributes (scene-scope) resolve per-day inside a days repeater
    // (roadmap 22) — the only scene fields pickable in a day context.
    if (dayScope && f.scope === 'scenes' && f.group === 'Breakdown') return true;
    // Location + weather attributes (scope 'locations') are pickable in day
    // contexts too — they resolve through the day's location seam (roadmap 6).
    if (dayScope && f.scope === 'locations') return true;
    return false;
  });
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
  'Day Types': { text: '#7c3aed', bg: 'rgba(147, 51, 234, 0.12)' },
  'Sun & Weather': { text: '#ca8a04', bg: 'rgba(202, 138, 4, 0.12)' },
  'Location': { text: '#0369a1', bg: 'rgba(14, 165, 233, 0.12)' },
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

/** Inline CSS for the editor token chip (white text on the group color).
 *  Canvas/preview tags use tokenTagCss (background-only) instead. */
export function tokenChipCss(color: ChipColor, margin = '0 2px'): string {
  return `background:${color.text};color:#fff;border-radius:2px;padding:4px;margin:${margin};font-weight:600;white-space:nowrap`;
}

/** Inline CSS for canvas/preview token tags: colored background only — the
 *  token text inherits the block's own typography (color, size, weight). */
export function tokenTagCss(color: ChipColor, margin = '0 2px'): string {
  return `background:${color.text};border-radius:2px;padding:1px 4px;margin:${margin}`;
}

/** Report-wide constant fields — grouped under the GLOBAL divider in pickers. */
export const GLOBAL_FIELD_SCOPES = new Set(['production', 'project', 'document']);
export function isGlobalField(f: ReportFieldDef): boolean {
  return GLOBAL_FIELD_SCOPES.has(f.scope);
}

/** Day-list field keys — the toolbar's day-format dropdown applies to these. */
export const DAY_LIST_FIELD_KEYS = new Set(['workDayList', 'holdDayList', 'travelDayList']);
