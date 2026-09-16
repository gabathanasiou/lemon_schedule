import type { Action } from '../store/reducer';
import type { Project, Scene } from '../types';
import { ELEMENT_CATEGORIES, isMultiValue } from './categories';

/**
 * Auto-registration of breakdown elements for agent/write paths.
 *
 * In the UI, entity dropdowns and the breakdown/Scene Sheet commit flow route
 * every new value through `addNewElement` (lib/newCastNaming.tsx), which
 * dispatches `ADD_ELEMENT` so a typed name becomes a first-class Element
 * Manager entry. The debug/agent bridge writes through `applyActionsToBridge`,
 * which bypassed that layer — an agent could tag a scene with a prop the
 * Element Manager had never seen.
 *
 * This mirrors the UI's non-cast branch (`{category, element:{id, name}}`)
 * for scene element fields carried by the same batch. Cast is ID-keyed and
 * never auto-created (a new cast member needs the naming modal).
 */

export interface ElementRegistration {
  category: string;
  element: { id: string; name: string };
}

/** Name-keyed element categories on a scene (built-ins minus cast, plus custom). */
function categoryKeys(project: Project): string[] {
  const keys = ELEMENT_CATEGORIES.filter(c => c.key !== 'cast').map(c => c.key);
  for (const cc of project.customCategories || []) {
    if (!keys.includes(cc.key)) keys.push(cc.key);
  }
  return keys;
}

/** Scene-shaped payloads inside a batch (the actions that can carry element fields). */
function sceneRecords(action: Action): Array<Record<string, unknown>> {
  switch (action.type) {
    case 'UPDATE_SCENE':
    case 'ADD_SCENE':
      return [action.payload as unknown as Record<string, unknown>];
    case 'INSERT_SCENE_AT':
      return [(action.payload as { scene: Scene }).scene as unknown as Record<string, unknown>];
    case 'IMPORT_SCENES':
      return action.payload as unknown as Array<Record<string, unknown>>;
    default:
      return [];
  }
}

/**
 * Every new (name, category) a batch would introduce on scene element fields,
 * as `ADD_ELEMENT` payloads. Idempotent: names already in `breakdownElements`
 * (or added earlier in the same batch) are skipped, and `ADD_ELEMENT` itself
 * dedups by name.
 */
export function collectElementRegistrations(project: Project, actions: Action[]): ElementRegistration[] {
  const keys = categoryKeys(project);
  const known = new Map<string, Set<string>>();
  for (const cat of keys) {
    const names = ((project.breakdownElements || {})[cat] || []).map(e => (e.name || e.id || '').toLowerCase());
    known.set(cat, new Set(names));
  }

  const out: ElementRegistration[] = [];
  for (const action of actions) {
    for (const scene of sceneRecords(action)) {
      for (const cat of keys) {
        const raw = scene[cat];
        if (typeof raw !== 'string' || !raw.trim()) continue;
        const items = isMultiValue(cat, project.customCategories)
          ? raw.split(',').map(x => x.trim()).filter(Boolean)
          : [raw.trim()];
        const seen = known.get(cat)!;
        for (const item of items) {
          const key = item.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({ category: cat, element: { id: item, name: item } });
        }
      }
    }
  }
  return out;
}
