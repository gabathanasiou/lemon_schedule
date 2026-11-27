import type { CustomCategoryDef, Scene } from '../types';
import { isMultiValue } from './categories';
import { normalizePunctuation } from './utils';

/**
 * Scene-derived element values for a category — the merge source behind
 * `loadCategoryElements` and the print/DOOD surfaces. Pure leaf on purpose:
 * `elements.ts` must never import the store barrel (that cycle reaches the
 * reducer/provider and can TDZ during module init).
 */
export function getElementsFromScenes(scenes: Scene[], category: string, customCategories?: CustomCategoryDef[]): { id: string; name: string }[] {
  if (!isMultiValue(category, customCategories)) {
    const map = new Map<string, string>();
    const isSet = category === 'set';
    for (const s of scenes) {
      const raw = (String(((s as any)[category] as string) ?? '')).trim();
      if (!raw) continue;
      const val = isSet ? normalizePunctuation(raw).toUpperCase() : raw;
      if (!map.has(val)) map.set(val, val);
    }
    return [...map.values()].sort().map(v => ({ id: v, name: v }));
  }
  const set = new Set<string>();
  for (const s of scenes) {
    const val = (s as any)[category];
    if (val == null || val === '') continue;
    for (const id of String(val).split(',').map(x => x.trim()).filter(Boolean)) set.add(id);
  }
  return [...set].sort().map(id => ({ id, name: id }));
}
