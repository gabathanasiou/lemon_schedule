import { ProjectElement } from '../types';
import { getElementsFromScenes } from '../store';
import { getFieldItems } from './categories';
import { canonicalBoardId } from './boardIds';
import { getBoardIdDisplay } from './persist';

/**
 * Single source of truth for breakdown elements:
 * - `cast` is IDENTITY-keyed: members live in `project.castMembers` (numeric
 *   IDs referenced by `scene.cast`), never in `breakdownElements.cast`.
 * - every other category is NAME-keyed: elements live in
 *   `project.breakdownElements[category]` and scenes reference them by name.
 *
 * Consumers MUST go through `getCategoryElements()` / `elementMatchId()` —
 * never read `breakdownElements['cast']` and never hand-roll an
 * `isCast ? id : name` branch.
 */
export function isIdKeyed(category: string): boolean {
  return category === 'cast';
}

export function getCategoryElements(project: any, category: string): ProjectElement[] {
  if (isIdKeyed(category)) return project.castMembers || [];
  return (project.breakdownElements || {})[category] || [];
}

/** The key scenes use to reference an element: id for cast, name otherwise. */
export function elementMatchId(e: { id: string; name: string }, category: string): string {
  return isIdKeyed(category) ? e.id : (e.name || e.id);
}

/** Merges stored elements with scene-derived values for a category (cast special-cases by id). */
export function loadCategoryElements(project: any, category: string): ProjectElement[] {
  if (category === 'cast') {
    const sceneIds = getElementsFromScenes(project.scenes, 'cast');
    const merged = new Map<string, ProjectElement>();
    for (const e of sceneIds) merged.set(e.id, { id: e.id, name: '' });
    for (const m of project.castMembers || []) merged.set(m.id, { id: m.id, name: m.name.toUpperCase() });
    return [...merged.values()];
  }
  const stored: ProjectElement[] = (project.breakdownElements || {})[category] || [];
  const nameMap = new Map(stored.map(e => [e.name.toLowerCase(), e]));
  const seen = new Set<string>();
  const items: ProjectElement[] = [];
  for (const e of stored) {
    const key = (e.id || e.name);
    if (!seen.has(key)) { items.push(e); seen.add(key); }
  }
  const sceneElems = getElementsFromScenes(project.scenes, category);
  for (const e of sceneElems) {
    const key = (e.id || e.name).toLowerCase();
    if (!seen.has(key) && !nameMap.has(e.name.toLowerCase())) { items.push(e); seen.add(key); }
  }
  return items;
}

export function elementKey(e: { id: string; name: string }) { return e.id || e.name || '__new__'; }

// ---- Board IDs (roadmap 257) ------------------------------------------------
// Cast's `CastMember.id` IS its Board ID (the value `scene.cast` stores);
// every other category keeps a `boardId` label on `ProjectElement` while
// scenes stay name-keyed. These helpers are the ONE place that branch lives.
// Allocation/comparison primitives live in the leaf `boardIds.ts` (no store
// imports) and are re-exported here so consumers have one element-facing API.

export { nextBoardId, compareBoardIds } from './boardIds';

/** The category's Board ID for one element — cast's id, else `boardId`. */
export function boardIdOf(e: { id: string; name?: string; boardId?: string }, category: string): string {
  return isIdKeyed(category) ? String(e.id || '') : String(e.boardId || '');
}

/** "1. NAME" — the ONE element display label (roadmap 305). Plain name when
 *  the element has no Board ID. Display only: committed values stay id/name. */
export function boardLabel(boardId: string | null | undefined, name: string): string {
  const id = String(boardId ?? '').trim();
  const label = String(name ?? '');
  return id ? `${id}. ${label}` : label;
}

/** Display label for the surfaces that follow the user's Board ID pref
 *  (roadmap 321 — cast only by default): cast always keeps its number, other
 *  categories only when the pref is "All elements". Reports/print/DOOD call
 *  `boardLabel` directly and stay numbered regardless. */
export function boardLabelForDisplay(boardId: string | null | undefined, name: string, category: string): string {
  const show = isIdKeyed(category) || getBoardIdDisplay() === 'all';
  return boardLabel(show ? boardId : undefined, name);
}

/** Scene-value key (lowercase) → Board ID, built ONCE per display surface
 *  (DOOD, Element Breakdown, print sheets). Name-keyed categories match
 *  case-insensitively; unnumbered elements are absent. */
export function boardIdMapFor(project: any, category: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const e of getCategoryElements(project, category)) {
    const key = elementMatchId(e, category).toLowerCase();
    const id = boardIdOf(e, category);
    if (key && id) out.set(key, id);
  }
  return out;
}

/** True when `value` is already used by a DIFFERENT element of the category.
 *  `exceptKey` is the edited row's `elementKey` (it may keep its own number). */
export function isDuplicateBoardId(
  elements: { id: string; name?: string; boardId?: string }[],
  category: string,
  value: string,
  exceptKey?: string,
): boolean {
  const wanted = canonicalBoardId(value);
  if (!wanted) return false;
  return elements.some(e => {
    if (exceptKey !== undefined && (e.id || e.name || '__new__') === exceptKey) return false;
    return canonicalBoardId(boardIdOf(e, category)) === wanted;
  });
}

/**
 * Resolve a typed dropdown segment to the key scenes store (AGENTS.md §Cast &
 * Entities — the STRICT id-vs-name rule). For ID-keyed categories (cast): an
 * exact Board ID wins, then an exact case-insensitive display NAME resolves to
 * that member's ID — typing "MARY" must bind the existing member, NEVER create
 * a duplicate blank one. Name-keyed categories keep the raw text.
 */
export function resolveTypedElementKey(
  items: { id: string; name: string }[],
  displayMode: 'id' | 'name',
  segment: string,
): string {
  if (displayMode !== 'id') return segment;
  const seg = segment.trim();
  if (!seg) return seg;
  const byId = items.find(m => String(m.id || m.name) === seg);
  if (byId) return String(byId.id || byId.name);
  const lower = seg.toLowerCase();
  const byName = items.find(m => (m.name || '').trim().toLowerCase() === lower);
  return byName ? String(byName.id || byName.name) : seg;
}

/** Counts how many scenes reference each element value. */
export function countOccurrences(scenes: any[], cat: string, isC: boolean): Map<string, number> {
  const counts = new Map<string, number>();
  for (const s of scenes) {
    const val = isC ? s.cast : (s as any)[cat] as string;
    if (!val) continue;
    const items = getFieldItems(cat, val);
    for (const item of items) {
      const key = item.toLowerCase();
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  return counts;
}
