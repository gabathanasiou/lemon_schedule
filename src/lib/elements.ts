import { ProjectElement } from '../types';
import { getElementsFromScenes } from '../store';
import { getFieldItems } from './categories';

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
