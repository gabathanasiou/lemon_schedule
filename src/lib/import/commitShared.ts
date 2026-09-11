import { CastMember } from '../../types';
import { FDX_CATEGORY_MAP, ImportResult, categoryNameToKey, type ParsedScene } from './shared';

/** Scene-field keys carried on `taggedElements` that are NOT element
 *  categories (they map to Scene fields, handled by sceneFields.ts). */
const SCENE_FIELD_KEYS = new Set(['notes', 'scriptDay', 'set', 'description']);

export interface ImportSetupParams {
  dispatch: (action: any) => void;
  result: ImportResult;
  castIdMap: Map<string, string>;
  newCustomCategories: string[];
  existingCastMembers: CastMember[];
  reEnableCategories?: string[];
  existingCustomCategoryKeys?: string[];
}

/** Shared import preamble: re-enable categories, create new custom categories,
 *  then create cast members (+ their cast-category elements) and every tagged
 *  breakdown element. Consumed by BOTH the append import (`commitImport`) and
 *  the in-place script diff commit (`commitScriptDiff`) — one source of truth. */
export function emitImportSetup({
  dispatch,
  result,
  castIdMap,
  newCustomCategories,
  existingCastMembers,
  reEnableCategories = [],
  existingCustomCategoryKeys = [],
}: ImportSetupParams): void {
  for (const key of reEnableCategories) {
    dispatch({ type: 'SHOW_CATEGORY', payload: key });
  }
  for (const catName of newCustomCategories) {
    const key = categoryNameToKey(catName);
    dispatch({ type: 'ADD_CUSTOM_CATEGORY', payload: { key, label: catName, icon: 'Tag' } });
  }

  const existingIds = new Set(existingCastMembers.map(c => c.id));
  for (const [name, id] of castIdMap) {
    if (existingIds.has(id)) continue;
    dispatch({ type: 'ADD_CAST_MEMBER', payload: { id, name: name.toUpperCase() } });
  }
  for (const [name, id] of castIdMap) {
    dispatch({ type: 'ADD_ELEMENT', payload: { category: 'cast', element: { id, name: name.toUpperCase() } } });
  }

  const builtinBreakdownKeys = new Set(
    Object.values(FDX_CATEGORY_MAP).filter((v): v is string => v !== null && !SCENE_FIELD_KEYS.has(v))
  );
  const allCategoryKeys = new Set([
    ...builtinBreakdownKeys,
    ...newCustomCategories.map(categoryNameToKey),
    ...existingCustomCategoryKeys,
  ]);

  const allElements = new Map<string, Set<string>>();
  for (const ps of result.scenes) {
    for (const [cat, items] of Object.entries(ps.taggedElements)) {
      if (SCENE_FIELD_KEYS.has(cat)) continue;
      if (!allCategoryKeys.has(cat)) continue;
      if (!allElements.has(cat)) allElements.set(cat, new Set());
      const set = allElements.get(cat)!;
      for (const item of items) set.add(item);
    }
  }
  for (const [cat, items] of allElements) {
    for (const item of items) {
      dispatch({ type: 'ADD_ELEMENT', payload: { category: cat, element: { id: item, name: item } } });
    }
  }
}

/** The set elements a parsed screenplay introduces (scene.set / Set Dressing). */
export function collectImportedSets(parsedScene: ParsedScene): string[] {
  const name = (parsedScene.taggedElements.set?.join(', ') || parsedScene.set || '').toUpperCase().trim();
  return name ? [name] : [];
}
