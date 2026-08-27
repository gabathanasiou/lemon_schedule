import { ElementLink, Scene } from '../types';
import { ELEMENT_CATEGORIES, getFieldItems, isMultiValue } from './categories';
import type { CustomCategoryDef } from '../types';

/**
 * Element links (roadmap 44) — one-way, anchor-based. The anchor owns the
 * links; an element can be an anchor (with its own links) AND a linked
 * element of another anchor. Links reference elements canonically via
 * `elementMatchId` (cast = Board ID, every other category = exact name).
 *
 * This module is the single write-path seam: every scene value commit
 * (Scene Sheet fields, Glide cells, stripboard row editing) goes through
 * `computePropagation` when an anchor value is ADDED to a scene, and
 * `computeRemovedLinks`/`cascadeRemoval` when an anchor is REMOVED (with a
 * confirm dialog in the caller). Retroactive apply uses `applyLinkToScenes`.
 *
 * Matching semantics follow the rest of the app: cast members are compared
 * by exact id; every other category case-insensitively by name.
 */

/** Built-in element categories that are NOT linkable scene fields (free text). */
const NON_LINKABLE = new Set(['notes']);

export function isLinkableCategory(category: string, customCategories?: CustomCategoryDef[]): boolean {
  if (category === 'cast') return true;
  if (NON_LINKABLE.has(category)) return false;
  if (ELEMENT_CATEGORIES.some(c => c.key === category)) return true;
  return !!customCategories?.some(c => c.key === category);
}

/** Links whose anchor is `(category, value)` (names matched case-insensitively). */
export function getAnchorLinks(links: ElementLink[], category: string, value: string): ElementLink[] {
  if (!links || links.length === 0 || !value) return [];
  return links.filter(l =>
    l.anchorCategory === category &&
    (category === 'cast' ? l.anchorValue === value : l.anchorValue.toLowerCase() === value.toLowerCase()),
  );
}

/** Item keys (`elementMatchId` space: cast = Board ID, others = name) that act
 *  as an anchor in any link for `category` — for anchor indicators in pickers. */
export function anchoredKeysFor(links: ElementLink[], category: string): Set<string> {
  const keys = new Set<string>();
  for (const l of links || []) {
    if (l.anchorCategory === category && l.anchorValue) keys.add(l.anchorValue);
  }
  return keys;
}

const itemsOf = (category: string, raw: string | undefined | null): string[] => {
  const items = getFieldItems(category, raw || '');
  return category === 'cast' ? items : items.map(i => i.toLowerCase());
};

export function fieldContains(category: string, raw: string | undefined | null, value: string): boolean {
  if (!raw) return false;
  const target = category === 'cast' ? value : value.toLowerCase();
  return itemsOf(category, raw).includes(target);
}

/**
 * Adds `value` to a scene field value. Multi-value categories append (and
 * dedupe); single-value categories (e.g. `set`) only land when the field is
 * empty — an occupied field is left untouched (never clobbered). Returns the
 * new serialized field value, or null when nothing changed.
 */
export function addValueToField(customCategories: CustomCategoryDef[] | undefined, category: string, current: string | undefined, value: string): string | null {
  if (!value) return null;
  if (fieldContains(category, current, value)) return null;
  if (isMultiValue(category, customCategories)) {
    const items = getFieldItems(category, current || '');
    items.push(category === 'cast' ? value : value.trim());
    return items.join(', ');
  }
  if (!current || !current.trim()) return value;
  return null;
}

/**
 * Propagation: computes extra field updates that must ride along an entity
 * field edit. For every anchor value ADDED between `before` and `after`,
 * every link of that anchor gets its linked value added to the scene (each
 * target category processed in sequence, so multiple links into the same
 * field accumulate). Returns only the linked categories that changed.
 */
export function computePropagation(
  links: ElementLink[],
  customCategories: CustomCategoryDef[] | undefined,
  before: Scene,
  after: Scene,
): Record<string, string> {
  if (!links || links.length === 0) return {};
  const extra: Record<string, string> = {};
  const current: Record<string, string | undefined> = {};
  for (const cat of Object.keys(after)) {
    if (isLinkableCategory(cat, customCategories)) current[cat] = (after as any)[cat];
  }
  for (const cat of Object.keys(after)) {
    if (!isLinkableCategory(cat, customCategories)) continue;
    const b = (before as any)[cat] as string | undefined;
    const a = (after as any)[cat] as string | undefined;
    if (b === a) continue;
    const beforeItems = itemsOf(cat, b);
    for (const added of itemsOf(cat, a)) {
      if (beforeItems.includes(added)) continue;
      for (const link of getAnchorLinks(links, cat, added)) {
        const next = addValueToField(customCategories, link.linkedCategory, current[link.linkedCategory], link.linkedValue);
        if (next != null) {
          current[link.linkedCategory] = next;
          extra[link.linkedCategory] = next;
        }
      }
    }
  }
  return extra;
}

export interface RemovedAnchorLink {
  category: string;
  value: string;
  links: ElementLink[];
}

/**
 * Removal guard: anchors REMOVED between `before` and `after` that still
 * own links. Callers show a confirm before applying; the cascade below
 * strips the linked values from the scene when confirmed.
 */
export function computeRemovedLinks(
  links: ElementLink[],
  customCategories: CustomCategoryDef[] | undefined,
  before: Scene,
  after: Scene,
): RemovedAnchorLink[] {
  if (!links || links.length === 0) return [];
  const out: RemovedAnchorLink[] = [];
  for (const cat of Object.keys(after)) {
    if (!isLinkableCategory(cat, customCategories)) continue;
    const b = (before as any)[cat] as string | undefined;
    const a = (after as any)[cat] as string | undefined;
    if (b === a) continue;
    const afterItems = itemsOf(cat, a);
    for (const removed of itemsOf(cat, b)) {
      if (afterItems.includes(removed)) continue;
      const anchorLinks = getAnchorLinks(links, cat, removed);
      if (anchorLinks.length > 0) out.push({ category: cat, value: removed, links: anchorLinks });
    }
  }
  return out;
}

/**
 * Cascade: computes field updates that remove the linked values of removed
 * anchors from a scene (after `after` already dropped the anchors). Multi
 * fields filter the value out; single fields clear when they equal it.
 */
export function cascadeRemoval(
  customCategories: CustomCategoryDef[] | undefined,
  after: Scene,
  removed: RemovedAnchorLink[],
): Record<string, string> {
  if (removed.length === 0) return {};
  const extra: Record<string, string> = {};
  const current: Record<string, string | undefined> = {};
  for (const cat of Object.keys(after)) {
    if (isLinkableCategory(cat, customCategories)) current[cat] = (after as any)[cat];
  }
  for (const r of removed) {
    for (const link of r.links) {
      const cur = current[link.linkedCategory] || '';
      let next: string | null = null;
      if (isMultiValue(link.linkedCategory, customCategories)) {
        const items = getFieldItems(link.linkedCategory, cur).filter(v => {
          const target = link.linkedCategory === 'cast' ? v : v.toLowerCase();
          const val = link.linkedCategory === 'cast' ? link.linkedValue : link.linkedValue.toLowerCase();
          return target !== val;
        });
        const joined = items.join(', ');
        if (joined !== cur) next = joined;
      } else {
        const target = link.linkedCategory === 'cast' ? cur.trim() : cur.trim().toLowerCase();
        const val = link.linkedCategory === 'cast' ? link.linkedValue : link.linkedValue.toLowerCase();
        if (target === val) next = '';
      }
      if (next != null) {
        current[link.linkedCategory] = next;
        extra[link.linkedCategory] = next;
      }
    }
  }
  return extra;
}

/**
 * Retroactive apply: walks scenes containing the anchor and adds the linked
 * element to each (scenes already containing it — or single fields already
 * occupied — are left untouched). Returns per-scene UPDATE_SCENE payloads;
 * the caller batches them into one undo entry.
 */
export function applyLinkToScenes(
  customCategories: CustomCategoryDef[] | undefined,
  scenes: Scene[],
  link: ElementLink,
): { id: string; updates: Record<string, string> }[] {
  const out: { id: string; updates: Record<string, string> }[] = [];
  for (const s of scenes) {
    const anchorField = (s as any)[link.anchorCategory] as string | undefined;
    if (!fieldContains(link.anchorCategory, anchorField, link.anchorValue)) continue;
    const next = addValueToField(customCategories, link.linkedCategory, (s as any)[link.linkedCategory], link.linkedValue);
    if (next != null) out.push({ id: s.id, updates: { [link.linkedCategory]: next } });
  }
  return out;
}