import { CastMember } from '../../types';
import { generateUUID } from '../utils';
import { FDX_CATEGORY_MAP, ImportResult, categoryNameToKey } from './shared';

export interface CommitImportParams {
  dispatch: (action: any) => void;
  result: ImportResult;
  castIdMap: Map<string, string>;
  newCustomCategories: string[];
  existingCastMembers: CastMember[];
  projectTitle?: string;
  reEnableCategories?: string[];
  existingCustomCategoryKeys?: string[];
}

export function commitImport({
  dispatch,
  result,
  castIdMap,
  newCustomCategories,
  existingCastMembers,
  projectTitle,
  reEnableCategories = [],
  existingCustomCategoryKeys = [],
}: CommitImportParams): void {
  dispatch({ type: 'BATCH_START' });
  try {
    if (projectTitle) {
      dispatch({ type: 'UPDATE_PROJECT', payload: { title: projectTitle } });
    }
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
    const upperName = name.toUpperCase();
    dispatch({ type: 'ADD_CAST_MEMBER', payload: { id, name: upperName } });
  }

  for (const [name, id] of castIdMap) {
    const upperName = name.toUpperCase();
    dispatch({ type: 'ADD_ELEMENT', payload: { category: 'cast', element: { id, name: upperName } } });
  }

  const SCENE_FIELD_KEYS = new Set(['notes', 'scriptDay', 'set', 'description']);

  const BUILTIN_BREAKDOWN_KEYS = new Set(
    Object.values(FDX_CATEGORY_MAP).filter((v): v is string => v !== null && !SCENE_FIELD_KEYS.has(v))
  );
  const selectedCustomKeys = new Set(newCustomCategories.map(categoryNameToKey));
  const existingCustomKeys = new Set(existingCustomCategoryKeys);
  const allCategoryKeys = new Set([...BUILTIN_BREAKDOWN_KEYS, ...selectedCustomKeys, ...existingCustomKeys]);

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

  const importedSets = new Set<string>();
  for (const ps of result.scenes) {
    const castIds = ps.characters
      .map(name => {
        const upper = name.toUpperCase();
        for (const [original, assigned] of castIdMap) {
          if (original.toUpperCase() === upper) return assigned;
        }
        return '';
      })
      .filter(Boolean)
      .join(', ');

    const breakdownFields: Record<string, string> = {};
    for (const [cat, items] of Object.entries(ps.taggedElements)) {
      breakdownFields[cat] = items.join(', ');
    }

    const setName = (breakdownFields.set || ps.set || '').toUpperCase().trim();
    if (setName) importedSets.add(setName);

    const sceneBase: any = {
      id: generateUUID(),
      sceneNumber: ps.sceneNumber,
      pageCount: ps.pageCount ?? '0',
      pageCountDecimal: ps.pageCountDecimal ?? 0,
      scriptDay: breakdownFields.scriptDay || '',
      intExt: ps.intExt,
      set: setName || ps.set.toUpperCase(),
      dayNight: ps.dayNight,
      description: breakdownFields.description || '',
      cast: castIds || ps.rawCast || '',
      notes: breakdownFields.notes || '',
      location: breakdownFields.location || '',
      backgroundActors: breakdownFields.backgroundActors || '',
      stunts: breakdownFields.stunts || '',
      vehicles: breakdownFields.vehicles || '',
      props: breakdownFields.props || '',
      wardrobe: breakdownFields.wardrobe || '',
      makeup: breakdownFields.makeup || '',
      sfx: breakdownFields.sfx || '',
      vfx: breakdownFields.vfx || '',
      sound: breakdownFields.sound || '',
      music: breakdownFields.music || '',
      animalsAndWranglers: breakdownFields.animalsAndWranglers || '',
      weapons: breakdownFields.weapons || '',
      greenery: breakdownFields.greenery || '',
      artDept: breakdownFields.artDept || '',
    };

    for (const catName of newCustomCategories) {
      const key = categoryNameToKey(catName);
      if (breakdownFields[key]) sceneBase[key] = breakdownFields[key];
    }
    const BUILTIN_SCENE_KEYS = new Set([
      'id', 'sceneNumber', 'pageCount', 'pageCountDecimal', 'scriptDay',
      'intExt', 'set', 'dayNight', 'description', 'cast', 'notes', 'location',
      'backgroundActors', 'stunts', 'vehicles', 'props', 'wardrobe', 'makeup',
      'sfx', 'vfx', 'sound', 'music', 'animalsAndWranglers', 'weapons', 'greenery', 'artDept',
    ]);
    for (const [key, val] of Object.entries(breakdownFields)) {
      if (!BUILTIN_SCENE_KEYS.has(key)) {
        sceneBase[key] = val;
      }
    }

    dispatch({ type: 'ADD_SCENE', payload: sceneBase });
  }
  for (const name of importedSets) {
    dispatch({ type: 'ADD_ELEMENT', payload: { category: 'set', element: { id: name, name } } });
  }
  } finally {
    dispatch({ type: 'BATCH_COMMIT' });
  }
}
