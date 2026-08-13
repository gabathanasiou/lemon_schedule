import { Project } from '../types';
import { ELEMENT_CATEGORIES, getLabel, isMultiValue } from './categories';
import { formatDateShort, formatDuration, formatPageCount } from './utils';
import {
  ReportCtx, ReportSceneInfo, ReportDayInfo, ReportElementInfo, ReportCategoryInfo, ReportCrewItem,
} from './reportData';

// Single field registry for the Reports Designer. Attributes only exist in the
// context where they make sense — the palette, token picker and table pickers
// all filter by scope (see getFieldsForScope). Every get() is guarded at the
// value boundary (item type mismatch → ''), never crash.

export interface ReportFieldDef {
  key: string;
  label: string;
  group: string;
  scope: 'scenes' | 'elements' | 'cast' | 'categories' | 'document' | 'days' | 'crew' | 'production' | 'project';
  align?: 'left' | 'center' | 'right';
  defaultWidth?: number;
  multiValue?: boolean;  // value is a comma-separated list → per-item affixes apply
  get: (ctx: ReportCtx, item?: any, aux?: FieldAux) => string;
}

/** Render-time context for document fields (counter index, page numbers…). */
export interface FieldAux {
  index?: number;                  // 0-based iteration index (nearest repeat/table)
  pageIndex?: number;              // 0-based page
  pageCount?: number;
  counterStart?: number;           // from the iterating block
  pageSize?: 'portrait' | 'landscape';
}

const s = (v: unknown): string => (v == null ? '' : String(v));

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
  { key: 'duration', label: 'Duration', group: 'Shooting', scope: 'scenes', defaultWidth: 8, get: (_c, it: ReportSceneInfo) => formatDuration(it.durationMin) },
  { key: 'day', label: 'Day', group: 'Shooting', scope: 'scenes', align: 'center', defaultWidth: 6, get: (_c, it: ReportSceneInfo) => s(it.chronoDay || '') },
  { key: 'date', label: 'Date', group: 'Shooting', scope: 'scenes', defaultWidth: 12, get: (_c, it: ReportSceneInfo) => formatDateShort(it.date) },
  { key: 'cast', label: 'Cast', group: 'Cast & Talent', scope: 'scenes', multiValue: true, defaultWidth: 18, get: (ctx, it: ReportSceneInfo) => sceneCast(ctx, it.scene.cast) },
  { key: 'backgroundActors', label: 'Background Actors', group: 'Cast & Talent', scope: 'scenes', defaultWidth: 14, get: (_c, it: ReportSceneInfo) => s(it.scene.backgroundActors) },
];

// ---- elements & cast ---------------------------------------------------------

const ELEMENT_FIELDS: ReportFieldDef[] = [
  { key: 'elementName', label: 'Name', group: 'Elements', scope: 'elements', defaultWidth: 20, get: (_c, it: ReportElementInfo) => s(it.name) },
  { key: 'elementCategory', label: 'Category', group: 'Elements', scope: 'elements', defaultWidth: 14, get: (_c, it: ReportElementInfo) => s(it.category) },
  { key: 'sceneCount', label: 'Scene Count', group: 'Elements', scope: 'elements', align: 'center', defaultWidth: 10, get: (_c, it: ReportElementInfo) => s(it.sceneCount) },
  { key: 'attachedScenes', label: 'Attached Scenes', group: 'Elements', scope: 'elements', multiValue: true, defaultWidth: 16, get: (_c, it: ReportElementInfo) => s(it.attachedScenes) },
  { key: 'totalPages', label: 'Total Pages', group: 'Elements', scope: 'elements', align: 'center', defaultWidth: 10, get: (_c, it: ReportElementInfo) => formatPageCount(it.totalPages) },
  { key: 'shootDays', label: 'Shoot Days', group: 'Elements', scope: 'elements', multiValue: true, defaultWidth: 22, get: (_c, it: ReportElementInfo) => it.shootDays.join(', ') },
  { key: 'workDays', label: 'Work Days', group: 'Elements', scope: 'elements', align: 'center', defaultWidth: 9, get: (_c, it: ReportElementInfo) => s(it.workDays) },
  { key: 'holdDays', label: 'Hold Days', group: 'Elements', scope: 'elements', align: 'center', defaultWidth: 9, get: (_c, it: ReportElementInfo) => s(it.holdDays) },
  { key: 'travelDays', label: 'Travel Days', group: 'Elements', scope: 'elements', align: 'center', defaultWidth: 9, get: (_c, it: ReportElementInfo) => s(it.travelDays) },
  { key: 'startDate', label: 'Start Date', group: 'Elements', scope: 'elements', defaultWidth: 12, get: (_c, it: ReportElementInfo) => formatDateShort(it.startDate || '') },
  { key: 'finishDate', label: 'Finish Date', group: 'Elements', scope: 'elements', defaultWidth: 12, get: (_c, it: ReportElementInfo) => formatDateShort(it.finishDate || '') },
];

const CAST_FIELDS: ReportFieldDef[] = [
  { key: 'id', label: 'Cast ID', group: 'Cast & Talent', scope: 'cast', align: 'center', defaultWidth: 6, get: (_c, it: ReportElementInfo) => s(it.id) },
  { key: 'castName', label: 'Name', group: 'Cast & Talent', scope: 'cast', defaultWidth: 20, get: (_c, it: ReportElementInfo) => s(it.name) },
  { key: 'castIdName', label: 'Cast ID & Name', group: 'Cast & Talent', scope: 'cast', defaultWidth: 22, get: (_c, it: ReportElementInfo) => s(`${it.id}. ${it.name}`) },
  { key: 'castWorkDays', label: 'Work Days', group: 'Cast & Talent', scope: 'cast', align: 'center', defaultWidth: 9, get: (_c, it: ReportElementInfo) => s(it.workDays) },
  { key: 'castHoldDays', label: 'Hold Days', group: 'Cast & Talent', scope: 'cast', align: 'center', defaultWidth: 9, get: (_c, it: ReportElementInfo) => s(it.holdDays) },
  { key: 'castTravelDays', label: 'Travel Days', group: 'Cast & Talent', scope: 'cast', align: 'center', defaultWidth: 9, get: (_c, it: ReportElementInfo) => s(it.travelDays) },
  { key: 'castStartDate', label: 'Start Date', group: 'Cast & Talent', scope: 'cast', defaultWidth: 12, get: (_c, it: ReportElementInfo) => formatDateShort(it.startDate || '') },
  { key: 'castFinishDate', label: 'Finish Date', group: 'Cast & Talent', scope: 'cast', defaultWidth: 12, get: (_c, it: ReportElementInfo) => formatDateShort(it.finishDate || '') },
];

// ---- categories (one item per element category) ------------------------------

const CATEGORY_FIELDS: ReportFieldDef[] = [
  { key: 'categoryLabel', label: 'Category', group: 'Categories', scope: 'categories', defaultWidth: 20, get: (_c, it: ReportCategoryInfo) => s(it.label) },
  { key: 'categoryItems', label: 'Items', group: 'Categories', scope: 'categories', multiValue: true, defaultWidth: 30, get: (_c, it: ReportCategoryInfo) => it.items.join(', ') },
  { key: 'categoryElementCount', label: 'Element Count', group: 'Categories', scope: 'categories', align: 'center', defaultWidth: 10, get: (_c, it: ReportCategoryInfo) => s(it.elementCount) },
  { key: 'categorySceneCount', label: 'Scene Count', group: 'Categories', scope: 'categories', align: 'center', defaultWidth: 10, get: (_c, it: ReportCategoryInfo) => s(it.sceneCount) },
  { key: 'categoryOccurrences', label: 'Total Occurrences', group: 'Categories', scope: 'categories', align: 'center', defaultWidth: 12, get: (_c, it: ReportCategoryInfo) => s(it.occurrences) },
];

// ---- document (counter, pages, print metadata) -------------------------------

const DOCUMENT_FIELDS: ReportFieldDef[] = [
  { key: 'counter', label: 'Counter', group: 'Document', scope: 'document', align: 'center', defaultWidth: 8, get: (_c, _it, aux) => s((aux?.index ?? 0) + (aux?.counterStart ?? 1)) },
  { key: 'pageNumber', label: 'Page Number', group: 'Document', scope: 'document', align: 'center', defaultWidth: 8, get: (_c, _it, aux) => s((aux?.pageIndex ?? 0) + 1) },
  { key: 'pageCount', label: 'Total Pages', group: 'Document', scope: 'document', align: 'center', defaultWidth: 8, get: (_c, _it, aux) => s(aux?.pageCount ?? '') },
  { key: 'printDate', label: 'Print Date', group: 'Document', scope: 'document', defaultWidth: 12, get: () => formatDateShort(new Date().toISOString().slice(0, 10)) },
  { key: 'pageSize', label: 'Page Size', group: 'Document', scope: 'document', defaultWidth: 12, get: (_c, _it, aux) => aux?.pageSize ? (aux.pageSize === 'portrait' ? 'A4 Portrait' : 'A4 Landscape') : '' },
];

// ---- days --------------------------------------------------------------------

const DAY_FIELDS: ReportFieldDef[] = [
  { key: 'dayNumber', label: 'Day #', group: 'Days', scope: 'days', align: 'center', defaultWidth: 7, get: (_c, it: ReportDayInfo) => s(it.chronoDay) },
  { key: 'dayDate', label: 'Date', group: 'Days', scope: 'days', defaultWidth: 16, get: (_c, it: ReportDayInfo) => formatDateShort(it.date) },
  { key: 'dayCallTime', label: 'Call Time', group: 'Days', scope: 'days', defaultWidth: 9, get: (_c, it: ReportDayInfo) => s(it.callTime) },
  { key: 'dayEnd', label: 'End Time', group: 'Days', scope: 'days', defaultWidth: 9, get: (_c, it: ReportDayInfo) => s(it.endTime) },
  { key: 'dayTotalPages', label: 'Total Pages', group: 'Days', scope: 'days', align: 'center', defaultWidth: 9, get: (_c, it: ReportDayInfo) => formatPageCount(it.totalPages) },
  { key: 'dayShoot', label: 'Shoot Time', group: 'Days', scope: 'days', defaultWidth: 9, get: (_c, it: ReportDayInfo) => formatDuration(it.shootMin) },
  { key: 'dayBreak', label: 'Break Time', group: 'Days', scope: 'days', defaultWidth: 9, get: (_c, it: ReportDayInfo) => formatDuration(it.breakMin) },
  { key: 'dayLabel', label: 'Day Label', group: 'Days', scope: 'days', defaultWidth: 12, get: (_c, it: ReportDayInfo) => s(it.label) },
  { key: 'daySceneCount', label: 'Scene Count', group: 'Days', scope: 'days', align: 'center', defaultWidth: 9, get: (_c, it: ReportDayInfo) => s(it.sceneCount) },
  { key: 'dayFirstScene', label: 'First Scene', group: 'Days', scope: 'days', align: 'center', defaultWidth: 8, get: (_c, it: ReportDayInfo) => s(it.firstScene) },
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

const PRODUCTION_FIELDS: ReportFieldDef[] = [
  { key: 'company', label: 'Company', group: 'Production', scope: 'production', defaultWidth: 18, get: (ctx) => s(ctx.project.productionInfo?.company) },
  { key: 'studio', label: 'Studio', group: 'Production', scope: 'production', defaultWidth: 18, get: (ctx) => s(ctx.project.productionInfo?.studio) },
  { key: 'productionOffice', label: 'Production Office', group: 'Production', scope: 'production', defaultWidth: 18, get: (ctx) => s(ctx.project.productionInfo?.productionOffice) },
  { key: 'address', label: 'Address', group: 'Production', scope: 'production', defaultWidth: 18, get: (ctx) => s(ctx.project.productionInfo?.address) },
  { key: 'prodPhone', label: 'Phone', group: 'Production', scope: 'production', defaultWidth: 14, get: (ctx) => s(ctx.project.productionInfo?.phone) },
  { key: 'prodEmail', label: 'Email', group: 'Production', scope: 'production', defaultWidth: 18, get: (ctx) => s(ctx.project.productionInfo?.email) },
  { key: 'startDate', label: 'Start Date', group: 'Production', scope: 'production', defaultWidth: 12, get: (ctx) => formatDateShort(ctx.project.productionInfo?.startDate || '') },
  { key: 'wrapDate', label: 'Wrap Date', group: 'Production', scope: 'production', defaultWidth: 12, get: (ctx) => formatDateShort(ctx.project.productionInfo?.wrapDate || '') },
  { key: 'director', label: 'Director', group: 'Key Positions', scope: 'production', defaultWidth: 16, get: (ctx) => keyPerson(ctx, 'director') },
  { key: 'producer', label: 'Producer', group: 'Key Positions', scope: 'production', defaultWidth: 16, get: (ctx) => keyPerson(ctx, 'producer') },
  { key: 'lineProducer', label: 'Line Producer', group: 'Key Positions', scope: 'production', defaultWidth: 16, get: (ctx) => keyPerson(ctx, 'lineProducer') },
  { key: 'firstAD', label: '1st AD', group: 'Key Positions', scope: 'production', defaultWidth: 16, get: (ctx) => keyPerson(ctx, 'firstAD') },
  { key: 'upm', label: 'UPM', group: 'Key Positions', scope: 'production', defaultWidth: 16, get: (ctx) => keyPerson(ctx, 'upm') },
];

const PROJECT_FIELDS: ReportFieldDef[] = [
  { key: 'title', label: 'Title', group: 'Project', scope: 'project', defaultWidth: 18, get: (ctx) => s(ctx.project.title) },
  { key: 'version', label: 'Version', group: 'Project', scope: 'project', defaultWidth: 10, get: (ctx) => s(ctx.version.name) },
  { key: 'draftNumber', label: 'Draft #', group: 'Project', scope: 'project', defaultWidth: 8, get: (ctx) => s(ctx.project.draftNumber) },
];

// ---- registry ----------------------------------------------------------------

function buildCategorySceneFields(project: Project): ReportFieldDef[] {
  const out: ReportFieldDef[] = [];
  const hidden = new Set(project.hiddenCategories || []);
  const baseKeys = new Set(SCENE_FIELDS.map(f => f.key));
  for (const cat of ELEMENT_CATEGORIES) {
    if (cat.key === 'cast' || cat.key === 'set' || baseKeys.has(cat.key) || hidden.has(cat.key)) continue;
    out.push({
      key: cat.key,
      label: getLabel(cat.key, cat.label, project.categoryLabels),
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
      label: c.label,
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
  ];
}

export function getReportFieldMap(project: Project): Record<string, ReportFieldDef> {
  return Object.fromEntries(getReportFieldDefs(project).map(f => [f.key, f]));
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

export function resolveReportTokens(
  ctx: ReportCtx,
  fieldMap: Record<string, ReportFieldDef>,
  text: string,
  item: any,
  aux?: FieldAux,
): string {
  return text.replace(TOKEN_RE, (_m, raw: string) => {
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
  });
}

export function fieldsForScope(
  fields: ReportFieldDef[],
  scope: string | null | undefined,
): ReportFieldDef[] {
  const scopeSet = new Set(['production', 'project', 'document']);
  if (scope) {
    if (['scenes', 'scenesOfDay', 'scenesOfElement', 'scenesOfCast'].includes(scope)) scopeSet.add('scenes');
    else if (scope === 'elementsOfCategory') scopeSet.add('elements');
    else scopeSet.add(scope);
  }
  return fields.filter(f => scopeSet.has(f.scope));
}
