import type { Project, ReportCollection } from '../types';
import { ELEMENT_CATEGORIES, getLabel } from './categories';
import { elementMatchId, getCategoryElements } from './elements';
import { formatDateCustom } from './utils';
import { getDayTypes } from './dayTypes';
import { resolveCollection, reportItemKey, reportItemLabel, reportSceneInfoFor, parentScenesOf, ancestorSceneScope, type ReportCtx, type ReportCollectionItem, type ReportCategoryInfo, type ReportCrewItem, type ReportElementInfo, type ReportSceneInfo } from './reportData';
import type { ReportFieldDef, FieldAux } from './reportFields';

// Item lookup + reference navigation for the Reports Designer (roadmaps 100,
// 121, 195, 196; split out of reportTokens.ts): the lookup token grammar
// (plain keys + `nav:` paths), field-value reading (fieldValueSafe), the
// scope registry (fieldsForScope) and the `.` attribute/child offer.
// reportTokens.ts re-uses this module; reportFields.ts re-exports it for
// consumers. ReportFieldDef/FieldAux are imported type-only — no runtime cycle.
/** Scopes whose values come from the resolved collection ITEM (repeat/table
 *  rows) — vs document/project/smart fields that resolve from ctx/aux. */
export const ITEM_SCOPES = new Set(['scenes', 'elements', 'cast', 'days', 'crew', 'locations', 'locationTypes', 'dayTypes', 'elementCallsOfDay', 'departmentCallsOfDay']);

/** Distinct values a scene-scope field yields across scenes (case-insensitive
 *  dedupe, first-seen order) plus the raw occurrence/scene counts — the union
 *  primitive shared by `dayBreakdownValue` and roadmap 195's scoped lookup
 *  targets. Field extraction always goes through `def.get`. */
function unionSceneFieldParts(
  ctx: ReportCtx,
  def: ReportFieldDef,
  scenes: ReportSceneInfo[],
): { items: string[]; occurrences: number; sceneCount: number } {
  const seen = new Set<string>();
  const items: string[] = [];
  let occurrences = 0;
  let sceneCount = 0;
  const push = (v: string) => {
    const k = v.toLowerCase();
    if (k && !seen.has(k)) { seen.add(k); items.push(v); }
  };
  for (const si of scenes) {
    const raw = String(def.get(ctx, si) || '');
    const parts = def.multiValue ? raw.split(',').map(x => x.trim()).filter(Boolean) : (raw.trim() ? [raw.trim()] : []);
    if (parts.length > 0) sceneCount++;
    occurrences += parts.length;
    for (const p of parts) push(p);
  }
  return { items, occurrences, sceneCount };
}

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
  return unionSceneFieldParts(ctx, def, scenes).items.join(', ');
}

export function fieldValueSafe(def: ReportFieldDef, ctx: ReportCtx, item: any, aux?: FieldAux): string {
  if (!def) return '';
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

// ---- item lookup tokens (item 100, two-stage picker item 121) ----------------
// `lookup.<collection>.<field>.<encodedItemKey>` references ONE item's attribute
// anywhere the design resolves tokens (text blocks, free-table cells/headers,
// the Call Sheet zone). Stage 1 (`@`) lists ITEMS ONLY, each inserting the
// collection's IDENTITY field; stage 2 (a `.` typed right after the chip) lists
// that item's scoped attributes and the kit INSERTS A SECOND, independent chip.
// The resolver finds the item by its stable key (`reportItemKey` / crew id) and
// returns the field through the same registry, so lookup tokens and normal
// fields can never disagree.

export const LOOKUP_PREFIX = 'lookup.';

export interface LookupTokenItem {
  key: string;
  label: string;
  collection: string;
  field: string;
  itemKey: string;
  /** Contextual right-side text in the picker — crew role, element category,
   *  location type, scene INT/EXT, counts, day-type code. Never a generic
   *  "Reference — {collection}" tag; hints are searchable too. */
  hint?: string;
  /** Elements only: the breakdown category the item belongs to. */
  category?: string;
}

export function composeLookupKey(collection: string, field: string, itemKey: string): string {
  return `${LOOKUP_PREFIX}${collection}.${field}.${encodeURIComponent(itemKey)}`;
}

// ---- navigable reference paths (roadmap 196) ----------------------------------
// A reference can WALK the collection graph: day → first scene → that scene's
// attributes, category → an element, crew → their categories. The path lives
// inside the token's itemKey slot as `nav:` + URI-encoded JSON. Real item keys
// are ALWAYS URI-encoded by composeLookupKey, and encodeURIComponent escapes
// `:`, so a plain key can never start with the literal `nav:` marker — the two
// forms are unambiguous. Legacy tokens parse unchanged.

/** One navigation step: the child collection plus either a specific child
 *  (`key`, the child's stable lookup key) or an end pick (`first`/`last`). */
export interface LookupNavHop {
  collection: ReportCollection;
  key?: string;
  pick?: 'first' | 'last';
}

/** Root item + child hops — the full target of a chained reference. */
export interface LookupPath {
  v: 1;
  root: { collection: string; itemKey: string };
  hops: LookupNavHop[];
}

const NAV_PREFIX = 'nav:';

export interface ParsedLookupKey {
  collection: string;
  field: string;
  /** Plain keys are decoded; a path key stays the RAW `nav:…` payload so
   *  adjacent chips compare equal by string identity. */
  itemKey: string;
  path?: LookupPath;
}

export function composeLookupPathKey(collection: string, field: string, path: LookupPath): string {
  return `${LOOKUP_PREFIX}${collection}.${field}.${NAV_PREFIX}${encodeURIComponent(JSON.stringify(path))}`;
}

export function parseLookupPath(itemKey: string): LookupPath | null {
  if (!itemKey.startsWith(NAV_PREFIX)) return null;
  try {
    const p = JSON.parse(decodeURIComponent(itemKey.slice(NAV_PREFIX.length)));
    if (!p || p.v !== 1 || !p.root || !Array.isArray(p.hops)) return null;
    return p as LookupPath;
  } catch {
    return null;
  }
}

export function parseLookupKey(raw: string): ParsedLookupKey | null {
  if (!raw.startsWith(LOOKUP_PREFIX)) return null;
  const parts = raw.split('.');
  if (parts.length < 4) return null;
  const rest = parts.slice(3).join('.');
  if (rest.startsWith(NAV_PREFIX)) {
    const path = parseLookupPath(rest);
    if (!path) return null;
    return { collection: parts[1], field: parts[2], itemKey: rest, path };
  }
  return { collection: parts[1], field: parts[2], itemKey: decodeURIComponent(rest) };
}

/** Elements encode their category in the item key (`<category>::<matchId>`) —
 *  element names are unique within a category only. */
export function elementLookupKey(category: string, matchId: string): string {
  return `${category}::${matchId}`;
}

export function splitElementLookupKey(itemKey: string): { category: string; matchId: string } {
  const i = itemKey.indexOf('::');
  return i < 0 ? { category: 'props', matchId: itemKey } : { category: itemKey.slice(0, i), matchId: itemKey.slice(i + 2) };
}

/** Stable item key for lookups (crew has no `reportItemKey` case — its id). */
function lookupItemKey(collection: string, item: ReportCollectionItem): string {
  if (collection === 'crew') return (item as ReportCrewItem).id;
  if (collection === 'elements') {
    const el = item as ReportElementInfo;
    const cat = el.category || 'props';
    return elementLookupKey(cat, elementMatchId(el, cat));
  }
  return String(reportItemKey(collection as ReportCollection, item));
}

/** The field an `@` item pick inserts — the collection's identity value. */
export function lookupIdentityField(collection: string): string {
  return LOOKUP_SPECS.find(s => s.collection === collection)?.identityField ?? '';
}

interface LookupSpec { collection: ReportCollection; label: string; identityField: string; }

const LOOKUP_SPECS: LookupSpec[] = [
  { collection: 'days', label: 'Days', identityField: 'dayLabel' },
  { collection: 'crew', label: 'Crew', identityField: 'crewName' },
  { collection: 'locations', label: 'Locations', identityField: 'locationName' },
  { collection: 'categories', label: 'Categories', identityField: 'categoryLabel' },
  { collection: 'locationTypes', label: 'Location Types', identityField: 'locationTypeLabel' },
  { collection: 'dayTypes', label: 'Day Types', identityField: 'dayTypeLabel' },
  { collection: 'scenes', label: 'Scenes', identityField: 'sceneLabel' },
  { collection: 'elements', label: 'Elements', identityField: 'elementName' },
];

/** A lightweight day reference for the picker (avoids needing a full ReportCtx). */
export interface LookupDayRef { index: number; chronoDay: number; date: string; }

/** One picker item: `hint` is the short right-side kind label (crew role,
 *  element category, location type, else a plain noun like "Scene"/"Day"). */
type LookupItem = { key: string; label: string; category?: string; hint?: string };

/** Project-derived items for one lookup collection. */
function lookupItemsFor(project: Project, collection: ReportCollection, days: LookupDayRef[]): LookupItem[] {
  switch (collection) {
    case 'days':
      return days.map(d => ({
        key: String(d.index),
        label: `Day ${d.chronoDay} (${formatDateCustom(d.date, project.productionInfo?.dateFormat)})`,
        hint: 'Prod date',
      }));
    case 'crew': {
      const out: LookupItem[] = [];
      for (const role of project.crewRoles || []) {
        for (const p of project.crew?.[role.key] || []) out.push({ key: p.id, label: p.name, hint: role.label });
      }
      return out;
    }
    case 'locations': {
      const typeLabel = new Map((project.locationTypes || []).map(t => [t.key, t.label]));
      return (project.locations || []).map(l => ({
        key: l.id,
        label: l.name,
        hint: (l.type && typeLabel.get(l.type)) || 'Location',
      }));
    }
    case 'categories':
      return [
        ...ELEMENT_CATEGORIES.map(c => ({ key: c.key, label: getLabel(c.key, c.label, project.categoryLabels), hint: 'Category' })),
        ...(project.customCategories || []).map(c => ({ key: c.key, label: c.label, hint: 'Category' })),
      ];
    case 'locationTypes':
      return (project.locationTypes || []).map(t => ({ key: t.key, label: t.label, hint: 'Location type' }));
    case 'dayTypes':
      return getDayTypes(project).map(t => ({ key: t.key, label: t.label, hint: 'Day type' }));
    case 'scenes':
      return (project.scenes || []).map(sc => ({
        key: sc.id,
        label: `Scene ${sc.sceneNumber}`,
        hint: 'Scene',
      }));
    case 'elements': {
      const out: LookupItem[] = [];
      const catLabel = new Map<string, string>();
      for (const c of ELEMENT_CATEGORIES) catLabel.set(c.key, getLabel(c.key, c.label, project.categoryLabels));
      for (const c of project.customCategories || []) catLabel.set(c.key, c.label);
      const cats = [...ELEMENT_CATEGORIES.map(c => c.key), ...(project.customCategories || []).map(c => c.key)];
      for (const cat of cats) {
        for (const el of getCategoryElements(project, cat)) {
          const matchId = elementMatchId(el, cat);
          if (!matchId) continue;
          out.push({ key: elementLookupKey(cat, matchId), label: el.name || matchId, category: cat, hint: catLabel.get(cat) || cat });
        }
      }
      return out;
    }
    default:
      return [];
  }
}

/** Stage-1 (`@`) lookup items: ONE entry per item, keyed by the collection's
 *  identity field. `days` comes from the caller's canonical sections. Stage 2
 *  (the `.` attribute list) comes from `lookupAttributeFields`. */
export function buildLookupTokens(project: Project, days: LookupDayRef[]): LookupTokenItem[] {
  const out: LookupTokenItem[] = [];
  for (const spec of LOOKUP_SPECS) {
    for (const item of lookupItemsFor(project, spec.collection, days)) {
      if (!item.key) continue;
      out.push({
        key: composeLookupKey(spec.collection, spec.identityField, item.key),
        label: item.label,
        hint: item.hint,
        collection: spec.collection,
        field: spec.identityField,
        itemKey: item.key,
        category: item.category,
      });
    }
  }
  return out;
}

/** Report-wide constant fields — grouped under the GLOBAL divider in pickers,
 *  and EXCLUDED from a lookup's `.` offer (roadmap 195): they resolve from
 *  ctx/aux, never from the item, so `@Bob.Company` is not Bob's attribute. */
export const GLOBAL_FIELD_SCOPES = new Set(['production', 'project', 'document']);
export function isGlobalField(f: ReportFieldDef): boolean {
  return GLOBAL_FIELD_SCOPES.has(f.scope);
}

/** The FIELD scope a collection's items read from — the ONE collection→scope
 *  map (fieldsForScope, tableFieldScope and every picker go through it).
 *  Contextual collections alias their item shape's base registry: a day of a
 *  cast member is a day, elements-of-scene are elements, locations-of-type are
 *  locations. Cast is the one hybrid — its items are full element infos PLUS
 *  the identity pair; `fieldsForScope` admits both families for 'cast'. */
export function fieldScopeFor(collection: string | null | undefined): string | undefined {
  switch (collection) {
    case 'scenes': case 'scenesOfDay': case 'scenesOfElement': case 'scenesOfCast': return 'scenes';
    case 'days': case 'daysOfCast': return 'days';
    case 'cast': return 'cast';
    case 'elements': case 'elementsOfCategory': case 'elementsOfScene': return 'elements';
    case 'locationsOfType': case 'locationsOfDay': return 'locations';
    case 'dayTypesOfElement': return 'dayTypes';
    case 'crewOfDay': return 'crew';
    default: return collection ?? undefined;
  }
}

/** The item-scope palette for a collection/context — the ONE scope filter
 *  consumed by the palette, table pickers and (since roadmap 195) the lookup
 *  `.` attribute stage. Lives here (not the registry) so the token module can
 *  use it without a runtime cycle.
 *
 *  `scopeSet` = production/project/document/smart (always) + the context's
 *  mapped field scope; day contexts additionally admit scene-Breakdown
 *  attributes (they resolve per-day as a union) and location/weather
 *  attributes; a cast context admits the element fields too (cast items ARE
 *  element infos). See `docs/REPORTS-LEGO-CONTEXT.md` for the Lego context
 *  model + the collection→scope matrix. */
export function fieldsForScope(
  fields: ReportFieldDef[],
  scope: string | null | undefined,
  category?: string,
): ReportFieldDef[] {
  const scopeSet = new Set(['production', 'project', 'document', 'smart']);
  const mapped = fieldScopeFor(scope);
  if (mapped) scopeSet.add(mapped);
  // Cast items are elements with identity extras — both families apply.
  if (mapped === 'cast') scopeSet.add('elements');
  // Cast identity fields belong to element contexts too: Elements → Cast
  // (category 'cast') and a categories repeat's Cast item (its category is
  // per-iteration, so elementsOfCategory admits the identity fields always).
  if (scope === 'elementsOfCategory' || category === 'cast') scopeSet.add('cast');
  const dayScope = mapped === 'days';
  return fields.filter(f => {
    if (scopeSet.has(f.scope)) return true;
    // Breakdown attributes (scene-scope) resolve per-day inside a day context
    // (roadmap 22) — the only scene fields pickable in a day context.
    if (dayScope && f.scope === 'scenes' && f.group === 'Breakdown') return true;
    // Location + weather attributes (scope 'locations') are pickable in day
    // contexts too — they resolve through the day's location seam (roadmap 6).
    if (dayScope && f.scope === 'locations') return true;
    return false;
  });
}

/** Lookup collections whose items the smart fields can read (a day/scene/
 *  element/category's scenes). Crew, locations and the rollup types carry no
 *  scene data — smart fields would only offer blanks/zeros there, so the `.`
 *  stage omits them. */
const SMART_LOOKUP_COLLECTIONS = new Set(['days', 'scenes', 'elements', 'categories']);

/** The item-scoped attributes offered at stage 2 — the target's OWN item
 *  scope (roadmap 195): `fieldsForScope` for its collection (+ category), so a
 *  day ref offers the days palette (smart fields, locations, per-day breakdown
 *  attributes) and a cast element adds the cast identity fields. Three
 *  exclusions keep the list relevant: the identity field (that IS the
 *  reference chip), the document-wide GLOBAL divider (not attributes OF the
 *  item), and smart fields where the item kind can't resolve them. */
export function lookupAttributeFields(allFields: ReportFieldDef[], collection: string, category?: string): ReportFieldDef[] {
  const identity = lookupIdentityField(collection);
  return fieldsForScope(allFields, collection, category).filter(f =>
    f.key !== identity
    && !GLOBAL_FIELD_SCOPES.has(f.scope)
    && (f.scope !== 'smart' || SMART_LOOKUP_COLLECTIONS.has(collection)),
  );
}

export interface LookupRef { collection: string; field: string; itemKey: string; path?: LookupPath; }

/** Resolve a lookup's target items — elements carry their category in the item
 *  key, and scene references target ANY project scene (scheduled or not). */
function resolveLookupItems(ctx: ReportCtx, collection: string, itemKey: string): ReportCollectionItem[] {
  if (collection === 'elements') {
    return resolveCollection(ctx, 'elements', splitElementLookupKey(itemKey).category, undefined, undefined);
  }
  if (collection === 'scenes') {
    const info = reportSceneInfoFor(ctx, itemKey);
    return info ? [info] : [];
  }
  return resolveCollection(ctx, collection as ReportCollection, undefined, undefined, undefined);
}

/** Navigable child relations per reference collection (roadmap 196). Hops
 *  reuse the canonical contextual child resolvers — never a parallel list. */
const NAV_CHILDREN: Partial<Record<string, { collection: ReportCollection; label: string; noun: string }[]>> = {
  days: [{ collection: 'scenes', label: 'Scenes', noun: 'scene' }],
  elements: [{ collection: 'scenes', label: 'Scenes', noun: 'scene' }],
  cast: [{ collection: 'scenes', label: 'Scenes', noun: 'scene' }],
  categories: [{ collection: 'elements', label: 'Elements', noun: 'element' }],
  scenes: [{ collection: 'elements', label: 'Elements', noun: 'element' }],
  crew: [{ collection: 'categories', label: 'Categories', noun: 'category' }],
};

/** Roadmap 196 child navigation is LOCKED (user decision 2026-10-08): the
 *  grammar, resolution, scoping and offer machinery stay live and tested, but
 *  the `.` picker hides child steps until this flips to true. Unlock tracked
 *  by roadmap 215 — same pattern as SHOW_FLOATING_STRUCTURE_CONTROLS
 *  (reports/CustomTableBands.tsx). */
export const CHILD_NAVIGATION_ENABLED = false;

/** Per-relation cap on the specific-child entries offered after a query
 *  narrows (same convention as the `@` reference list). */
const NAV_CHILD_LIMIT = 8;

/** One item's children in a base collection, through the contextual resolver
 *  branches. Crew → categories has no collection of its own: the categories
 *  present in the member's scenes (their position's categories). */
function navChildItems(ctx: ReportCtx, parentCollection: string, parentItem: ReportCollectionItem, child: ReportCollection): ReportCollectionItem[] {
  if (child === 'scenes') {
    if (parentCollection === 'days') return resolveCollection(ctx, 'scenesOfDay', undefined, parentItem);
    const el = parentItem as ReportElementInfo;
    if (parentCollection === 'cast' || el.category === 'cast') return resolveCollection(ctx, 'scenesOfCast', undefined, parentItem);
    return resolveCollection(ctx, 'scenesOfElement', el.category, parentItem);
  }
  if (child === 'elements') {
    return resolveCollection(ctx, parentCollection === 'categories' ? 'elementsOfCategory' : 'elementsOfScene', undefined, parentItem);
  }
  if (child === 'categories') {
    const scenes = parentScenesOf(ctx, parentItem);
    return ctx.categoryInfos.filter(cat => scenes.some(si => ctx.sceneFieldItems(si.scene, cat.key).length > 0));
  }
  return [];
}

/** Every item a nav path walks through — root first, final hop last. Null
 *  when any step dangles. */
function resolvePathItems(ctx: ReportCtx, path: LookupPath): ReportCollectionItem[] | null {
  let collectionNow = path.root.collection;
  let item: ReportCollectionItem | null =
    resolveLookupItems(ctx, collectionNow, path.root.itemKey).find(it => lookupItemKey(collectionNow, it) === path.root.itemKey) ?? null;
  if (!item) return null;
  const items: ReportCollectionItem[] = [item];
  for (const hop of path.hops) {
    const children = navChildItems(ctx, collectionNow, item, hop.collection);
    item = hop.key
      ? children.find(c => lookupItemKey(hop.collection, c) === hop.key) ?? null
      : hop.pick === 'last' ? children[children.length - 1] ?? null : children[0] ?? null;
    if (!item) return null;
    items.push(item);
    collectionNow = hop.collection;
  }
  return items;
}

/** A category's canonical display label (built-ins + customs), from the ctx
 *  registry — never re-derived from the key. */
function categoryLabelOf(ctx: ReportCtx, key: string): string {
  return ctx.categoryInfos.find(c => c.key === key)?.label || key;
}

/** The single item a reference targets (roadmap 196): a plain key resolves
 *  through the canonical collection; a nav path walks root → hops, each hop
 *  resolved as a child of the previous item. Null when any step dangles. */
export function lookupTargetItem(ctx: ReportCtx, collection: string, itemKey: string, path?: LookupPath): ReportCollectionItem | null {
  if (path) return resolvePathItems(ctx, path)?.at(-1) ?? null;
  return resolveLookupItems(ctx, collection, itemKey).find(it => lookupItemKey(collection, it) === itemKey) ?? null;
}

/** The scene scope a navigation path defines for its final item (roadmap 196):
 *  the intersection of every path item's scenes — the chain's OWN ancestor
 *  context, the twin of the containing chain's `ancestorSceneScope`. A category
 *  reached through a crew member scopes its Element List to that member's
 *  scenes; null when the path dangles or no item is rule-bearing. */
export function chainSceneScope(ctx: ReportCtx, path: LookupPath): Set<string> | null {
  const items = resolvePathItems(ctx, path);
  return items ? ancestorSceneScope(ctx, items) : null;
}

export interface ReferenceOfferChild {
  label: string;
  group: string;
  /** The child's base collection — its identity field names the chip. */
  collection: ReportCollection;
  path: LookupPath;
}

export interface ReferenceOffer {
  /** The target's own attribute palette (roadmap 195 relevance rules). */
  attributes: ReportFieldDef[];
  /** Navigable child steps (roadmap 196): First/Last + specific children. */
  children: ReferenceOfferChild[];
  /** The resolved target item — null when the reference dangles. */
  item: ReportCollectionItem | null;
  category?: string;
}

/** Everything a `.` picker offers after a reference chip (roadmaps 195/196):
 *  the target's own attribute palette plus navigable child steps — First/Last
 *  and the specific children (query-narrowed, then capped). ONE source for the
 *  text-block editor and the cellref picker so the surfaces can't drift. */
export function referenceOffer(
  allFields: ReportFieldDef[],
  ctx: ReportCtx,
  lookup: { collection: string; itemKey: string; path?: LookupPath },
  query: string,
  childLimit = NAV_CHILD_LIMIT,
): ReferenceOffer {
  const item = lookupTargetItem(ctx, lookup.collection, lookup.itemKey, lookup.path);
  const category = lookup.collection === 'elements'
    ? ((item as ReportElementInfo | null)?.category ?? (lookup.path ? undefined : splitElementLookupKey(lookup.itemKey).category))
    : undefined;
  const q = query.trim().toLowerCase();
  const attributes = lookupAttributeFields(allFields, lookup.collection, category)
    .filter(f => !q || f.label.toLowerCase().includes(q) || f.key.toLowerCase().includes(q));
  const children: ReferenceOfferChild[] = [];
  if (item) {
    const base: LookupPath = lookup.path ?? { v: 1, root: { collection: lookup.collection, itemKey: lookup.itemKey }, hops: [] };
    const pathTo = (hop: LookupNavHop): LookupPath => ({ v: 1, root: base.root, hops: [...base.hops, hop] });
    for (const rel of NAV_CHILDREN[lookup.collection] ?? []) {
      const kids = navChildItems(ctx, lookup.collection, item, rel.collection);
      if (kids.length === 0) continue;
      const matches = (label: string) => !q || label.toLowerCase().includes(q) || rel.label.toLowerCase().includes(q);
      if (matches(`First ${rel.noun}`)) children.push({ label: `→ First ${rel.noun}`, group: rel.label, collection: rel.collection, path: pathTo({ collection: rel.collection, pick: 'first' }) });
      if (matches(`Last ${rel.noun}`)) children.push({ label: `→ Last ${rel.noun}`, group: rel.label, collection: rel.collection, path: pathTo({ collection: rel.collection, pick: 'last' }) });
      let shown = 0;
      for (const child of kids) {
        if (shown >= childLimit) break;
        const label = reportItemLabel(rel.collection, child);
        if (!matches(label)) continue;
        // Element children mix categories in an elements-of-scene list — name
        // the category so "Back Story" vs "BAILEY PARK" is never a guess.
        const group = rel.collection === 'elements'
          ? `${rel.label} · ${categoryLabelOf(ctx, (child as ReportElementInfo).category || 'props')}`
          : rel.label;
        children.push({ label, group, collection: rel.collection, path: pathTo({ collection: rel.collection, key: lookupItemKey(rel.collection, child) }) });
        shown++;
      }
    }
  }
  return { attributes, children, item, category };
}

/** The live chip label of an identity reference (a chained one included) —
 *  the editor uses it for keys not present in the static `@` item list. */
export function lookupReferenceLabel(ctx: ReportCtx, allFields: ReportFieldDef[], raw: string): string {
  const lookup = parseLookupKey(raw);
  if (!lookup || lookup.field !== lookupIdentityField(lookup.collection)) return '';
  const hit = lookupTargetItem(ctx, lookup.collection, lookup.itemKey, lookup.path);
  if (!hit) return '';
  const def = allFields.find(f => f.key === lookup.field);
  return def ? fieldValueSafe(def, ctx, hit, undefined) : '';
}

/**
 * Roadmap 195: read a lookup target through the containing repeater's scene
 * scope (the resolved ancestor intersection, `aux.sceneScope`). A category
 * target reduces its Element List/counts to the scoped scenes — the SAME
 * `{{props}}` day-union semantics, so `@Props.Element List` inside a days
 * repeat prints that day's props. An element target reduces its scene-derived
 * fields (attached scenes/count/pages) to its scoped scenes; its day-list
 * timeline attributes stay element-wide. Bare refs and item shapes without
 * scene-derived attributes pass through unchanged.
 */
export function scopeLookupTarget(
  ctx: ReportCtx,
  fieldMap: Record<string, ReportFieldDef>,
  collection: string,
  item: ReportCollectionItem,
  scope: Set<string> | null | undefined,
): ReportCollectionItem {
  if (!scope || scope.size === 0) return item;
  if (collection === 'categories') {
    const cat = item as ReportCategoryInfo;
    const def = fieldMap[cat.key];
    // No scene-scope field registered for this category key → nothing
    // scene-derived to reduce.
    if (!def || def.scope !== 'scenes') return item;
    const { items, occurrences, sceneCount } = unionSceneFieldParts(ctx, def, ctx.sceneInfos.filter(si => scope.has(si.scene.id)));
    return { ...cat, items, elementCount: items.length, occurrences, sceneCount };
  }
  if (collection === 'elements') {
    const el = item as ReportElementInfo;
    const own = new Set(el.sceneIds || []);
    const scenes = ctx.sceneInfos.filter(si => own.has(si.scene.id) && scope.has(si.scene.id));
    return {
      ...el,
      sceneIds: scenes.map(si => si.scene.id),
      sceneCount: scenes.length,
      attachedScenes: scenes.map(si => si.scene.sceneNumber).join(', '),
      totalPages: scenes.reduce((sum, si) => sum + (si.scene.pageCountDecimal || 0), 0),
    };
  }
  return item;
}

/** The identity value of a lookup item ("Bob", "Day 1"), '' when dangling. */
export function lookupItemLabel(ctx: ReportCtx, fieldMap: Record<string, ReportFieldDef>, aux: FieldAux | undefined, lookup: LookupRef): string {
  const hit = lookupTargetItem(ctx, lookup.collection, lookup.itemKey, lookup.path);
  if (!hit) return '';
  const def = fieldMap[lookupIdentityField(lookup.collection)];
  return def ? fieldValueSafe(def, ctx, hit, aux) : '';
}
