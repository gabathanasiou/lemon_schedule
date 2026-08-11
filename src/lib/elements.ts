import { ProjectElement } from '../types';
import { getElementsFromScenes } from '../store';
import { getFieldItems } from './categories';

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
