import { Project } from '../../types';
import { getSceneFieldValue } from '../reducer';
import type { Action, State } from '../reducer';
import { generateUUID } from '../../lib/utils';
import { getFieldItems, isMultiValue } from '../../lib/categories';
import type { RuleTrashItem, ElementTrashItem, CategoryTrashItem } from '../../types';

export type ApplyChange = (p: Project) => State;

export function caseAddRule(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'ADD_RULE') return state;
  return applyChange({
    ...state.present,
    rules: [...(state.present.rules || []), action.payload]
  });
}

export function caseUpdateRule(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'UPDATE_RULE') return state;
  return applyChange({
    ...state.present,
    rules: (state.present.rules || []).map(r => r.id === action.payload.id ? action.payload : r)
  });
}

export function caseDeleteRule(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'DELETE_RULE') return state;
  const rule = (state.present.rules || []).find(r => r.id === action.payload);
  if (!rule) return state;
  const trashItem: RuleTrashItem = {
    rule: { ...rule },
    deletedAt: Date.now(),
  };
  return applyChange({
    ...state.present,
    rules: (state.present.rules || []).filter(r => r.id !== action.payload),
    rulesTrash: [...(state.present.rulesTrash || []), trashItem],
  });
}

export function caseRestoreRuleFromTrash(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'RESTORE_RULE_FROM_TRASH') return state;
  const item = (state.present.rulesTrash || []).find(t => t.rule.id === action.payload);
  if (!item) return state;
  return applyChange({
    ...state.present,
    rules: [...(state.present.rules || []), item.rule],
    rulesTrash: (state.present.rulesTrash || []).filter(t => t.rule.id !== action.payload),
  });
}

export function caseAddCastMember(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'ADD_CAST_MEMBER') return state;
  const cms = [...(state.present.castMembers || []), action.payload];
  const mirrored = cms.map(m => ({ id: m.id, name: m.name }));
  return applyChange({
    ...state.present,
    breakdownElements: { ...state.present.breakdownElements, cast: mirrored },
    castMembers: cms,
  });
}

export function caseUpdateCastMember(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'UPDATE_CAST_MEMBER') return state;
  const cms = (state.present.castMembers || []).map(c => c.id === action.payload.id ? action.payload : c);
  const mirrored = cms.map(m => ({ id: m.id, name: m.name }));
  return applyChange({
    ...state.present,
    breakdownElements: { ...state.present.breakdownElements, cast: mirrored },
    castMembers: cms,
  });
}

export function caseDeleteCastMember(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'DELETE_CAST_MEMBER') return state;
  const id = action.payload;
  const cms = (state.present.castMembers || []).filter(c => c.id !== id);
  const mirrored = cms.map(m => ({ id: m.id, name: m.name }));
  return applyChange({
    ...state.present,
    scenes: state.present.scenes.map(scene => {
      const items = scene.cast.split(',').map(x => x.trim()).filter(x => x !== id);
      return { ...scene, cast: items.join(', ') };
    }),
    breakdownElements: { ...state.present.breakdownElements, cast: mirrored },
    castMembers: cms,
  });
}

export function caseAddElement(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'ADD_ELEMENT') return state;
  const { category, element } = action.payload;
  const existing = state.present.breakdownElements[category] || [];
  const dedupKey = element.id || element.name.toLowerCase();
  const existingIdx = existing.findIndex(e => (e.id || e.name.toLowerCase()) === dedupKey);
  if (existingIdx >= 0 || (category === 'cast' && element.id && (state.present.castMembers || []).some(c => c.id === element.id))) {
    let updated = existingIdx >= 0
      ? existing.map(e => ((e.id || e.name.toLowerCase()) === dedupKey ? { ...e, ...element } : e))
      : [...existing, element];
    return applyChange({
      ...state.present,
      breakdownElements: { ...state.present.breakdownElements, [category]: updated },
      castMembers: category === 'cast'
        ? (state.present.castMembers || []).map(c => c.id === element.id ? { ...c, ...element } : c)
        : state.present.castMembers,
    });
  }
  return applyChange({
    ...state.present,
    breakdownElements: { ...state.present.breakdownElements, [category]: [...existing, element] },
    castMembers: category === 'cast' ? [...(state.present.castMembers || []), element] : state.present.castMembers,
  });
}

export function caseUpdateElement(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'UPDATE_ELEMENT') return state;
  const { category, id, updates } = action.payload;
  let list = state.present.breakdownElements[category] || [];
  if (list.length === 0) {
    if (category === 'cast') {
      list = (state.present.castMembers || []).map(m => ({ id: m.id, name: m.name }));
    } else {
      const ids = new Set<string>();
      for (const s of state.present.scenes) {
        const val = getSceneFieldValue(s, category);
        if (!val) continue;
        for (const item of getFieldItems(category, val)) ids.add(item);
      }
      list = [...ids].sort().map(item => ({ id: item, name: item }));
    }
  }
  const isCast = category === 'cast';
  let old = isCast
    ? list.find(e => e.id === id)
    : list.find(e => e.id.toLowerCase() === id.toLowerCase());
  if (!old) {
    const newElement = { id: updates.id || id, name: updates.name || '' };
    return applyChange({
      ...state.present,
      breakdownElements: { ...state.present.breakdownElements, [category]: [...list, newElement] },
      castMembers: isCast
        ? [...(state.present.castMembers || []), newElement]
        : state.present.castMembers || [],
    });
  }
  const newElement = { ...old, ...updates };
  const newList = list.map(e => (isCast ? e.id === id : e.id.toLowerCase() === id.toLowerCase()) ? newElement : e);

  let newScenes = state.present.scenes;
  if (isCast && updates.id && updates.id !== id) {
    const oldLower = id.toLowerCase();
    newScenes = state.present.scenes.map(scene => {
      const val = getSceneFieldValue(scene, category);
      if (!val) return scene;
      const items = val.split(',').map(x => x.trim());
      const idx = items.findIndex(x => x.toLowerCase() === oldLower);
      if (idx < 0) return scene;
      items[idx] = updates.id!;
      return { ...scene, [category]: items.join(', ') };
    });
  } else if (!isCast && updates.name && updates.name !== old.name) {
    if (!isMultiValue(category, state.present.customCategories)) {
      const oldUpper = old.name.toUpperCase();
      newScenes = state.present.scenes.map(scene => {
        const val = getSceneFieldValue(scene, category);
        if (!val || val.toUpperCase() !== oldUpper) return scene;
        return { ...scene, [category]: updates.name! };
      });
    } else {
      const oldLower = old.name.toLowerCase();
      newScenes = state.present.scenes.map(scene => {
        const val = getSceneFieldValue(scene, category);
        if (!val) return scene;
        const items = val.split(',').map(x => x.trim());
        const idx = items.findIndex(x => x.toLowerCase() === oldLower);
        if (idx < 0) return scene;
        items[idx] = updates.name!;
        return { ...scene, [category]: items.join(', ') };
      });
    }
  }

  return applyChange({
    ...state.present,
    scenes: newScenes,
    breakdownElements: { ...state.present.breakdownElements, [category]: newList },
    castMembers: isCast
      ? (state.present.castMembers || []).map(c => c.id === id ? newElement : c)
      : state.present.castMembers,
  });
}

export function caseDeleteElement(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'DELETE_ELEMENT') return state;
  const { category, id } = action.payload;
  const isCast = category === 'cast';
  const list = state.present.breakdownElements[category] || [];
  const el = list.find(e => e.id === id);
  const matchLower = isCast ? id.toLowerCase() : (el?.name ?? id).toLowerCase();
  const trashItem: ElementTrashItem = {
    category,
    element: el ? { id: el.id, name: el.name } : { id, name: '' },
    deletedAt: Date.now(),
  };
  return applyChange({
    ...state.present,
    scenes: state.present.scenes.map(scene => {
      const val = getSceneFieldValue(scene, category);
      if (!val) return scene;
      const items = getFieldItems(category, val).filter(x => x.toLowerCase() !== matchLower);
      return { ...scene, [category]: items.join(', ') };
    }),
    breakdownElements: {
      ...state.present.breakdownElements,
      [category]: list.filter(e => e.id !== id),
    },
    castMembers: isCast
      ? (state.present.castMembers || []).filter(c => c.id !== id)
      : state.present.castMembers,
    elementsTrash: [...state.present.elementsTrash, trashItem],
  });
}

export function caseMergeElements(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'MERGE_ELEMENTS') return state;
  const { category, sourceIds, targetId, targetName } = action.payload;
  const isCast = category === 'cast';
  const list = state.present.breakdownElements[category] || [];
  const sourceSet = new Set(sourceIds.map(id => id.toLowerCase()));
  const sourceNames = isCast ? sourceSet : new Set(
    sourceIds.map(sid => {
      const elem = list.find(e => e.id.toLowerCase() === sid.toLowerCase());
      return (elem?.name || elem?.id || '').toLowerCase();
    }).filter(Boolean)
  );
  const matchSet = isCast ? sourceSet : sourceNames;

  const filtered = list.filter(e => !sourceSet.has(e.id.toLowerCase()));
  if (!filtered.some(e => e.id.toLowerCase() === targetId.toLowerCase())) {
    filtered.push({ id: targetId, name: targetName });
  }

  const scenes = state.present.scenes.map(scene => {
    const val = getSceneFieldValue(scene, category);
    if (!val) return scene;
    const items = getFieldItems(category, val);
    let changed = false;
    const newItems = items.map(item => {
      if (matchSet.has(item.toLowerCase())) {
        changed = true;
        return targetName;
      }
      return item;
    });
    if (!changed) return scene;
    return { ...scene, [category]: newItems.join(', ') };
  });

  let castMembers = state.present.castMembers;
  if (isCast) {
    castMembers = castMembers.filter(c => !sourceSet.has(c.id.toLowerCase()));
    if (!castMembers.some(c => c.id.toLowerCase() === targetId.toLowerCase())) {
      castMembers = [...castMembers, { id: targetId, name: targetName }];
    }
  }

  return applyChange({
    ...state.present,
    scenes,
    breakdownElements: { ...state.present.breakdownElements, [category]: filtered },
    castMembers,
  });
}

export function caseRestoreElementFromTrash(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'RESTORE_ELEMENT_FROM_TRASH') return state;
  const item = state.present.elementsTrash.find(t => t.element.id === action.payload);
  if (!item) return state;
  const { category, element } = item;
  const existing = state.present.breakdownElements[category] || [];
  return applyChange({
    ...state.present,
    breakdownElements: {
      ...state.present.breakdownElements,
      [category]: [...existing, element],
    },
    castMembers: category === 'cast'
      ? [...(state.present.castMembers || []), element]
      : state.present.castMembers,
    elementsTrash: state.present.elementsTrash.filter(t => t.element.id !== action.payload),
  });
}

export function caseAddCustomCategory(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'ADD_CUSTOM_CATEGORY') return state;
  return applyChange({
    ...state.present,
    customCategories: [...state.present.customCategories, action.payload],
  });
}

export function caseRenameCustomCategory(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'RENAME_CUSTOM_CATEGORY') return state;
  const { key, label } = action.payload;
  return applyChange({
    ...state.present,
    customCategories: state.present.customCategories.map(c =>
      c.key === key ? { ...c, label } : c
    ),
  });
}

export function caseUpdateCustomCategory(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'UPDATE_CUSTOM_CATEGORY') return state;
  const { key, ...updates } = action.payload;
  return applyChange({
    ...state.present,
    customCategories: state.present.customCategories.map(c =>
      c.key === key ? { ...c, ...updates } : c
    ),
  });
}

export function caseDeleteCustomCategory(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'DELETE_CUSTOM_CATEGORY') return state;
  const key = action.payload;
  const def = state.present.customCategories.find(c => c.key === key);
  if (!def) return state;
  const elements = state.present.breakdownElements[key] || [];
  const sceneValues: Record<string, string> = {};
  for (const scene of state.present.scenes) {
    const val = getSceneFieldValue(scene, key);
    if (val) sceneValues[scene.id] = val;
  }
  const trashItem: CategoryTrashItem = {
    category: { ...def },
    elements: elements.map(e => ({ id: e.id, name: e.name })),
    sceneValues,
    deletedAt: Date.now(),
  };
  return applyChange({
    ...state.present,
    customCategories: state.present.customCategories.filter(c => c.key !== key),
    scenes: state.present.scenes.map(s => ({ ...s, [key]: undefined })),
    breakdownElements: (() => {
      const next = { ...state.present.breakdownElements };
      delete next[key];
      return next;
    })(),
    categoryTrash: [...state.present.categoryTrash, trashItem],
  });
}

export function caseRestoreCategoryFromTrash(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'RESTORE_CATEGORY_FROM_TRASH') return state;
  const item = state.present.categoryTrash.find(t => t.category.key === action.payload);
  if (!item) return state;
  return applyChange({
    ...state.present,
    customCategories: [...state.present.customCategories, item.category],
    scenes: state.present.scenes.map(s => {
      const val = item.sceneValues[s.id];
      return val ? { ...s, [item.category.key]: val } : s;
    }),
    breakdownElements: {
      ...state.present.breakdownElements,
      [item.category.key]: item.elements,
    },
    categoryTrash: state.present.categoryTrash.filter(t => t.category.key !== action.payload),
  });
}

export function caseHideCategory(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'HIDE_CATEGORY') return state;
  return applyChange({
    ...state.present,
    hiddenCategories: [...state.present.hiddenCategories.filter(k => k !== action.payload), action.payload],
  });
}

export function caseShowCategory(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'SHOW_CATEGORY') return state;
  return applyChange({
    ...state.present,
    hiddenCategories: state.present.hiddenCategories.filter(k => k !== action.payload),
  });
}

export function caseRestoreHiddenCategory(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'RESTORE_HIDDEN_CATEGORY') return state;
  return applyChange({
    ...state.present,
    hiddenCategories: state.present.hiddenCategories.filter(k => k !== action.payload),
  });
}

export function caseSetCategoryLabel(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'SET_CATEGORY_LABEL') return state;
  return applyChange({
    ...state.present,
    categoryLabels: { ...state.present.categoryLabels, [action.payload.key]: action.payload.label },
  });
}
