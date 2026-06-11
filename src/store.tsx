import React, { createContext, useContext, useEffect, useReducer, useCallback, useState } from 'react';
import { Project, Scene, ScheduleVersion, ScheduleRow, TrashItem, VersionTrashItem, RuleTrashItem, RibbonTrashItem, ProjectRule, CastMember, SceneRibbonColumn, SCENE_RIBBON_DEFAULTS, RibbonDesign, RibbonRow, RibbonCell, CustomCategoryDef, ElementTrashItem, CategoryTrashItem } from './types';
import { generateUUID, parsePageCount, normalizePunctuation } from './lib/utils';
import { getDefaultRibbonRows, cid } from './lib/ribbonUtils';
import Papa from 'papaparse';

const LEGACY_KEY = 'a-little-bit-of-hope-project';
const INDEX_KEY = 'lemon_schedule_project_index';
const PROJECT_KEY_PREFIX = 'lemon_schedule_project_v1_';

export interface ProjectMeta {
  id: string;
  title: string;
  lastModified: number;
  createdAt: number;
}

function getProjectStorageKey(id: string): string {
  return `${PROJECT_KEY_PREFIX}${id}`;
}

function loadProjectListFromStorage(): ProjectMeta[] {
  try {
    const stored = localStorage.getItem(INDEX_KEY);
    if (stored) {
      const list: ProjectMeta[] = JSON.parse(stored);
      return list.map(p => ({ createdAt: p.lastModified, ...p }));
    }
  } catch (e) {
    console.error("Failed to load project list", e);
  }
  return [];
}

function saveProjectListToStorage(list: ProjectMeta[]) {
  localStorage.setItem(INDEX_KEY, JSON.stringify(list));
}

function loadProjectFromStorage(id: string): Project | null {
  try {
    const stored = localStorage.getItem(getProjectStorageKey(id));
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.scenes && parsed.versions) {
        parsed.versions = parsed.versions.map((v: ScheduleVersion) => ({
          ...v,
          updatedAt: v.updatedAt || v.createdAt || Date.now()
        }));
        const thirtyDays = 30 * 24 * 60 * 60 * 1000;
        parsed.trash = (parsed.trash || []).filter((t: TrashItem) => {
          return Date.now() - t.deletedAt < thirtyDays;
        }).map((t: TrashItem) => ({
          ...t,
          versionName: t.versionName || 'Unknown'
        }));
        parsed.versionTrash = (parsed.versionTrash || []).filter((t: VersionTrashItem) => {
          return Date.now() - t.deletedAt < thirtyDays;
        });
        parsed.rulesTrash = (parsed.rulesTrash || []).filter((t: RuleTrashItem) => {
          return Date.now() - t.deletedAt < thirtyDays;
        });
        parsed.ribbonTrash = (parsed.ribbonTrash || []).filter((t: RibbonTrashItem) => {
          return Date.now() - t.deletedAt < thirtyDays;
        });
        parsed.elementsTrash = (parsed.elementsTrash || []).filter((t: ElementTrashItem) => {
          return Date.now() - t.deletedAt < thirtyDays;
        });
        parsed.categoryTrash = (parsed.categoryTrash || []).filter((t: CategoryTrashItem) => {
          return Date.now() - t.deletedAt < thirtyDays;
        });

        // Migrate renamed keys: extras→backgroundActors, animals→animalsAndWranglers
        for (const s of parsed.scenes || []) {
          if ('extras' in s) { s.backgroundActors = s.extras; delete s.extras; }
          if ('animals' in s) { s.animalsAndWranglers = s.animals; delete s.animals; }
        }
        if (parsed.breakdownElements) {
          if (parsed.breakdownElements.extras) {
            parsed.breakdownElements.backgroundActors = parsed.breakdownElements.extras;
            delete parsed.breakdownElements.extras;
          }
          if (parsed.breakdownElements.animals) {
            parsed.breakdownElements.animalsAndWranglers = parsed.breakdownElements.animals;
            delete parsed.breakdownElements.animals;
          }
        }
        for (const d of parsed.ribbonDesigns || []) {
          for (const row of d.rows || []) {
            for (const cell of row.cells || []) {
              if (cell.field === 'extras') cell.field = 'backgroundActors';
              if (cell.field === 'animals') cell.field = 'animalsAndWranglers';
            }
          }
        }

        parsed.hiddenCategories = parsed.hiddenCategories || [];
        parsed.categoryLabels = parsed.categoryLabels || {};

        return parsed;
      }
    }
  } catch (e) {
    console.error("Failed to load project", e);
  }
  return null;
}

// getDefaultRibbonRows and cid imported from ribbonUtils

const BUILTIN_SCENE_KEYS = new Set([
  'sceneNumber', 'pageCount', 'pageCountDecimal', 'scriptDay', 'intExt', 'set', 'dayNight',
  'description', 'cast', 'notes', 'backgroundActors', 'stunts', 'vehicles', 'props', 'wardrobe',
  'makeup', 'sfx', 'vfx', 'sound', 'music', 'animalsAndWranglers', 'weapons', 'greenery', 'artDept', 'shootDay',
]);

export const PROTECTED_CATEGORIES = new Set(['cast', 'set', 'notes']);

export const DEFAULT_CATEGORY_LABELS: Record<string, string> = {
  cast: 'Cast',
  set: 'Sets',
  props: 'Props',
  backgroundActors: 'Background Actors',
  stunts: 'Stunts',
  vehicles: 'Vehicles',
  wardrobe: 'Wardrobe',
  makeup: 'Makeup & Hair',
  sfx: 'SFX',
  vfx: 'VFX',
  sound: 'Sound',
  music: 'Music / Playback',
  animalsAndWranglers: 'Animals & Wranglers',
  weapons: 'Weapons / Armoury',
  greenery: 'Greenery',
  artDept: 'Art Department',
  location: 'Location',
};

function getSceneFieldValue(scene: Scene, category: string): string {
  if (BUILTIN_SCENE_KEYS.has(category)) {
    return String((scene as any)[category] ?? '');
  }
  return String((scene as any)[category] ?? '');
}

function makeBlankProject(title = 'Untitled Project'): Project {
  const id = generateUUID();
  const defaultDesign: RibbonDesign = {
    id: generateUUID(),
    name: 'Default',
    rows: getDefaultRibbonRows(),
    createdAt: Date.now(),
  };
  return {
    id,
    title,
    draftNumber: '1',
    scenes: [],
    versions: [{
      id,
      name: 'v01',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      rows: [],
      dayMeta: {
        1: { shootDay: 1, unitCall: '08:00', date: (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })() }
      }
    }],
    activeVersionId: id,
    trash: [],
    versionTrash: [],
    rulesTrash: [],
    ribbonTrash: [],
    rules: [],
    castMembers: [],
    customCategories: [],
    hiddenCategories: [],
    categoryLabels: {},
    elementsTrash: [],
    categoryTrash: [],
    breakdownElements: {},
    sceneRibbon: SCENE_RIBBON_DEFAULTS,
    ribbonDesigns: [defaultDesign],
    activeRibbonId: defaultDesign.id,
  };
}

type Action =
  | { type: 'LOAD'; payload: Project }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'UPDATE_PROJECT', payload: Partial<Project> }
  | { type: 'ADD_SCENE', payload: Scene }
  | { type: 'UPDATE_SCENE', payload: Partial<Scene> & { id: string } }
  | { type: 'DELETE_SCENE', payload: string }
  | { type: 'RESTORE_SCENE', payload: string }
  | { type: 'EMPTY_TRASH' }
  | { type: 'RESTORE_VERSION_FROM_TRASH', payload: string }
  | { type: 'SORT_SCENES' }
  | { type: 'INSERT_SCENE_AT', payload: { index: number; scene: Scene } }
  | { type: 'UPDATE_VERSION', payload: Partial<ScheduleVersion> & { id: string } }
  | { type: 'NEW_VERSION', payload: { name: string, cloneFromId?: string | null } }
  | { type: 'DELETE_VERSION', payload: string }
  | { type: 'RENAME_VERSION', payload: { id: string, name: string } }
  | { type: 'SET_ACTIVE_VERSION', payload: string }
  | { type: 'IMPORT_SCENES', payload: Scene[] }
  | { type: 'DELETE_DAY', day: number }
  | { type: 'UNSCHEDULE_DAY', day: number }
  | { type: 'TOGGLE_WORKING_DAY', date: string }
  | { type: 'UPDATE_DAY_META'; shootDay: number; date?: string; status?: string; castIds?: string }
  | { type: 'ADD_RULE'; payload: ProjectRule }
  | { type: 'UPDATE_RULE'; payload: ProjectRule }
  | { type: 'DELETE_RULE'; payload: string }
  | { type: 'RESTORE_RULE_FROM_TRASH'; payload: string }
  | { type: 'ADD_CAST_MEMBER'; payload: CastMember }
  | { type: 'UPDATE_CAST_MEMBER'; payload: CastMember }
  | { type: 'DELETE_CAST_MEMBER'; payload: string }
  | { type: 'ADD_CUSTOM_CATEGORY'; payload: CustomCategoryDef }
  | { type: 'UPDATE_CUSTOM_CATEGORY'; payload: { key: string; label?: string; icon?: string } }
  | { type: 'RENAME_CUSTOM_CATEGORY'; payload: { key: string; label: string } }
  | { type: 'DELETE_CUSTOM_CATEGORY'; payload: string }
  | { type: 'RESTORE_CATEGORY_FROM_TRASH'; payload: string }
  | { type: 'HIDE_CATEGORY'; payload: string }
  | { type: 'SHOW_CATEGORY'; payload: string }
  | { type: 'RESTORE_HIDDEN_CATEGORY'; payload: string }
  | { type: 'SET_CATEGORY_LABEL'; payload: { key: string; label: string } }
  | { type: 'ADD_ELEMENT'; payload: { category: string; element: { id: string; name: string } } }
  | { type: 'UPDATE_ELEMENT'; payload: { category: string; id: string; updates: { id?: string; name?: string } } }
  | { type: 'DELETE_ELEMENT'; payload: { category: string; id: string } }
  | { type: 'RESTORE_ELEMENT_FROM_TRASH'; payload: string }
  | { type: 'UPDATE_SCENE_RIBBON'; payload: SceneRibbonColumn[] }
  | { type: 'ADD_RIBBON_DESIGN'; payload: { name: string; cloneFromId?: string; rows?: RibbonRow[] } }
  | { type: 'UPDATE_RIBBON_DESIGN'; payload: { id: string; rows: RibbonRow[] } }
  | { type: 'DELETE_RIBBON_DESIGN'; payload: string }
  | { type: 'RENAME_RIBBON_DESIGN'; payload: { id: string; name: string } }
  | { type: 'SET_ACTIVE_RIBBON'; payload: string }
  | { type: 'RESTORE_RIBBON_FROM_TRASH'; payload: string }

interface State {
  past: Project[];
  present: Project;
  future: Project[];
}

function reducer(state: State, action: Action): State {
  if (action.type === 'LOAD') {
    const p = action.payload;
    if (!p.ribbonDesigns || p.ribbonDesigns.length === 0) {
      const defaultDesign: RibbonDesign = {
        id: generateUUID(),
        name: 'Default',
        rows: getDefaultRibbonRows(),
        createdAt: Date.now(),
      };
      p.ribbonDesigns = [defaultDesign];
      p.activeRibbonId = p.activeRibbonId || defaultDesign.id;
    }
    return {
      past: [],
      present: {
        ...p,
        breakdownElements: p.breakdownElements || {},
        customCategories: p.customCategories || [],
        elementsTrash: p.elementsTrash || [],
        categoryTrash: p.categoryTrash || [],
      },
      future: [],
    };
  }

  if (action.type === 'UNDO') {
    if (state.past.length === 0) return state;
    const previous = state.past[state.past.length - 1];
    const newPast = state.past.slice(0, state.past.length - 1);
    return {
      past: newPast,
      present: previous,
      future: [state.present, ...state.future]
    };
  }

  if (action.type === 'REDO') {
    if (state.future.length === 0) return state;
    const next = state.future[0];
    const newFuture = state.future.slice(1);
    return {
      past: [...state.past, state.present],
      present: next,
      future: newFuture
    };
  }

  // Helper for applying changes to `present` and pushing to `past`
  const applyChange = (newPresent: Project): State => {
    return {
      past: [...state.past, state.present].slice(-50), // keep last 50
      present: newPresent,
      future: []
    };
  };

  switch (action.type) {
    case 'UPDATE_PROJECT':
      return applyChange({ ...state.present, ...action.payload });

    case 'ADD_SCENE':
      return applyChange({
        ...state.present,
        scenes: [...state.present.scenes, action.payload]
      });

    case 'UPDATE_SCENE': {
      let pageCountDecimal = state.present.scenes.find(s => s.id === action.payload.id)?.pageCountDecimal;
      if (action.payload.pageCount !== undefined) {
         // Re-parse page count
         pageCountDecimal = parsePageCount(action.payload.pageCount);
      }
      return applyChange({
        ...state.present,
        scenes: state.present.scenes.map(s => s.id === action.payload.id ? { ...s, ...action.payload, ...(pageCountDecimal !== undefined ? { pageCountDecimal } : {}) } : s)
      });
    }

    case 'DELETE_SCENE': {
      const scene = state.present.scenes.find(s => s.id === action.payload);
      if (!scene) return state;
      const activeVersion = state.present.versions.find(v => v.id === state.present.activeVersionId);
      const trashItem: TrashItem = {
        scene: { ...scene },
        deletedAt: Date.now(),
        versionName: activeVersion?.name || 'Unknown'
      };
      return applyChange({
        ...state.present,
        scenes: state.present.scenes.filter(s => s.id !== action.payload),
        versions: state.present.versions.map(v => ({
          ...v,
          rows: v.rows.filter(r => r.sceneId !== action.payload)
        })),
        trash: [...state.present.trash, trashItem]
      });
    }

    case 'RESTORE_SCENE': {
      const item = state.present.trash.find(t => t.scene.id === action.payload);
      if (!item) return state;
      return applyChange({
        ...state.present,
        scenes: [...state.present.scenes, item.scene],
        trash: state.present.trash.filter(t => t.scene.id !== action.payload)
      });
    }

    case 'EMPTY_TRASH': {
      return applyChange({
        ...state.present,
        trash: [],
        versionTrash: [],
        rulesTrash: [],
        ribbonTrash: [],
        elementsTrash: [],
        categoryTrash: [],
      });
    }

    case 'SORT_SCENES': {
      const sorted = [...state.present.scenes].sort((a, b) => 
        a.sceneNumber.localeCompare(b.sceneNumber, undefined, { numeric: true, sensitivity: 'base' })
      );
      return applyChange({ ...state.present, scenes: sorted });
    }

    case 'INSERT_SCENE_AT': {
      const { index, scene } = action.payload;
      const updated = [...state.present.scenes.slice(0, index), scene, ...state.present.scenes.slice(index)];
      return applyChange({ ...state.present, scenes: updated });
    }

    case 'UPDATE_VERSION': {
      return applyChange({
        ...state.present,
        versions: state.present.versions.map(v => v.id === action.payload.id ? { ...v, ...action.payload, updatedAt: Date.now() } : v)
      });
    }

    case 'NEW_VERSION': {
      let newVersion: ScheduleVersion;
      const parent = action.payload.cloneFromId 
        ? state.present.versions.find(v => v.id === action.payload.cloneFromId)
        : null;

      if (parent) {
        newVersion = {
          ...parent,
          id: generateUUID(),
          name: action.payload.name,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          rows: parent.rows.map(r => ({ ...r, id: generateUUID() }))
        };
      } else {
        newVersion = {
          id: generateUUID(),
          name: action.payload.name,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          rows: [],
          dayMeta: { 1: { shootDay: 1, unitCall: '08:00', date: '' } }
        };
      }
      return applyChange({
        ...state.present,
        versions: [...state.present.versions, newVersion],
        activeVersionId: newVersion.id
      });
    }

    case 'DELETE_VERSION': {
      const versionId = action.payload;
      const version = state.present.versions.find(v => v.id === versionId);
      if (!version) return state;
      const newVersions = state.present.versions.filter(v => v.id !== versionId);
      
      if (newVersions.length === 0) return state;

      const newActiveId = state.present.activeVersionId === versionId
        ? newVersions[0].id
        : state.present.activeVersionId;

      const trashItem: VersionTrashItem = {
        version: { ...version },
        deletedAt: Date.now()
      };
      
      return applyChange({
        ...state.present,
        versions: newVersions,
        activeVersionId: newActiveId,
        versionTrash: [...(state.present.versionTrash || []), trashItem]
      });
    }

    case 'RESTORE_VERSION_FROM_TRASH': {
      const item = (state.present.versionTrash || []).find(t => t.version.id === action.payload);
      if (!item) return state;
      return applyChange({
        ...state.present,
        versions: [...state.present.versions, item.version],
        versionTrash: (state.present.versionTrash || []).filter(t => t.version.id !== action.payload)
      });
    }

    case 'RENAME_VERSION': {
      const { id, name } = action.payload;
      return applyChange({
        ...state.present,
        versions: state.present.versions.map(v => v.id === id ? { ...v, name, updatedAt: Date.now() } : v)
      });
    }

    case 'SET_ACTIVE_VERSION':
      return applyChange({ ...state.present, activeVersionId: action.payload });
      
    case 'IMPORT_SCENES':
      return applyChange({
        ...state.present,
        scenes: [...state.present.scenes, ...action.payload]
      });

    case 'DELETE_DAY': {
      const activeVerId = state.present.activeVersionId;
      if (!activeVerId) return state;
      return applyChange({
        ...state.present,
        versions: state.present.versions.map(v => {
          if (v.id !== activeVerId) return v;
          return {
            ...v,
            rows: v.rows.filter(r => r.shootDay !== action.day),
            dayMeta: Object.fromEntries(Object.entries(v.dayMeta).filter(([k]) => Number(k) !== action.day))
          };
        })
      });
    }

    case 'UNSCHEDULE_DAY': {
      const activeVerId = state.present.activeVersionId;
      if (!activeVerId) return state;
      const day = action.day;
      return applyChange({
        ...state.present,
        versions: state.present.versions.map(v => {
          if (v.id !== activeVerId) return v;
          return {
            ...v,
            rows: v.rows.map(r => r.shootDay === day ? { ...r, shootDay: null as any, order: 999999 } : r)
          };
        })
      });
    }

    case 'TOGGLE_WORKING_DAY': {
      const date = action.date;
      const activeVerId = state.present.activeVersionId;
      if (!activeVerId) return state;
      return applyChange({
        ...state.present,
        versions: state.present.versions.map(v => {
          if (v.id !== activeVerId) return v;
          const existing = Object.entries(v.dayMeta).find(([, m]) => m.date === date);
          if (existing) {
            const day = Number(existing[0]);
            return {
              ...v,
              rows: v.rows.map(r => r.shootDay === day ? { ...r, shootDay: null as any, order: 999999 } : r),
              dayMeta: Object.fromEntries(Object.entries(v.dayMeta).filter(([k]) => Number(k) !== day))
            };
          } else {
            const nextDay = Math.max(0, ...Object.keys(v.dayMeta || {}).map(Number), 0) + 1;
            return {
              ...v,
              dayMeta: { ...v.dayMeta, [nextDay]: { shootDay: nextDay, unitCall: '08:00', date } }
            };
          }
        })
      });
    }

    case 'UPDATE_DAY_META': {
      const { shootDay, status, date, castIds } = action;
      const activeVerId = state.present.activeVersionId;
      if (!activeVerId) return state;
      return applyChange({
        ...state.present,
        versions: state.present.versions.map(v => {
          if (v.id !== activeVerId) return v;
          const oldStatus = v.dayMeta[shootDay]?.status;
          const newStatus = status as any;
          let rows = v.rows;
          if (newStatus && newStatus !== 'work' && oldStatus !== newStatus) {
            rows = v.rows.map(r => r.shootDay === shootDay ? { ...r, shootDay: null as any, order: 999999 } : r);
          }
          return {
            ...v,
            rows,
            dayMeta: {
              ...v.dayMeta,
              [shootDay]: { ...(v.dayMeta[shootDay] || { shootDay, unitCall: '08:00', date: date || '' }), status: newStatus, ...(castIds !== undefined ? { castIds } : {}) },
            },
          };
        }),
      });
    }

    case 'ADD_RULE':
      return applyChange({
        ...state.present,
        rules: [...(state.present.rules || []), action.payload]
      });

    case 'UPDATE_RULE':
      return applyChange({
        ...state.present,
        rules: (state.present.rules || []).map(r => r.id === action.payload.id ? action.payload : r)
      });

    case 'DELETE_RULE': {
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

    case 'RESTORE_RULE_FROM_TRASH': {
      const item = (state.present.rulesTrash || []).find(t => t.rule.id === action.payload);
      if (!item) return state;
      return applyChange({
        ...state.present,
        rules: [...(state.present.rules || []), item.rule],
        rulesTrash: (state.present.rulesTrash || []).filter(t => t.rule.id !== action.payload),
      });
    }

    case 'ADD_CAST_MEMBER': {
      const cms = [...(state.present.castMembers || []), action.payload];
      const mirrored = cms.map(m => ({ id: m.id, name: m.name }));
      return applyChange({
        ...state.present,
        breakdownElements: { ...state.present.breakdownElements, cast: mirrored },
        castMembers: cms,
      });
    }

    case 'UPDATE_CAST_MEMBER': {
      const cms = (state.present.castMembers || []).map(c => c.id === action.payload.id ? action.payload : c);
      const mirrored = cms.map(m => ({ id: m.id, name: m.name }));
      return applyChange({
        ...state.present,
        breakdownElements: { ...state.present.breakdownElements, cast: mirrored },
        castMembers: cms,
      });
    }

    case 'DELETE_CAST_MEMBER': {
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

    case 'ADD_ELEMENT': {
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

    case 'UPDATE_ELEMENT': {
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
            for (const item of val.split(',').map(x => x.trim()).filter(Boolean)) ids.add(item);
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
        if (category === 'set') {
          const oldUpper = old.name.toUpperCase();
          newScenes = state.present.scenes.map(scene => {
            if (scene.set.toUpperCase() !== oldUpper) return scene;
            return { ...scene, set: updates.name! };
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

    case 'DELETE_ELEMENT': {
      const { category, id } = action.payload;
      const isCast = category === 'cast';
      const list = state.present.breakdownElements[category] || [];
      const el = list.find(e => e.id === id);
      const matchValue = isCast ? id : (el?.name ?? id);
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
          const items = val.split(',').map(x => x.trim()).filter(x => x.toLowerCase() !== matchLower);
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

    case 'RESTORE_ELEMENT_FROM_TRASH': {
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

    case 'ADD_CUSTOM_CATEGORY': {
      return applyChange({
        ...state.present,
        customCategories: [...state.present.customCategories, action.payload],
      });
    }

    case 'RENAME_CUSTOM_CATEGORY': {
      const { key, label } = action.payload;
      return applyChange({
        ...state.present,
        customCategories: state.present.customCategories.map(c =>
          c.key === key ? { ...c, label } : c
        ),
      });
    }

    case 'UPDATE_CUSTOM_CATEGORY': {
      const { key, ...updates } = action.payload;
      return applyChange({
        ...state.present,
        customCategories: state.present.customCategories.map(c =>
          c.key === key ? { ...c, ...updates } : c
        ),
      });
    }

    case 'DELETE_CUSTOM_CATEGORY': {
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

    case 'RESTORE_CATEGORY_FROM_TRASH': {
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

    case 'HIDE_CATEGORY':
      return applyChange({
        ...state.present,
        hiddenCategories: [...state.present.hiddenCategories.filter(k => k !== action.payload), action.payload],
      });

    case 'SHOW_CATEGORY':
      return applyChange({
        ...state.present,
        hiddenCategories: state.present.hiddenCategories.filter(k => k !== action.payload),
      });

    case 'RESTORE_HIDDEN_CATEGORY':
      return applyChange({
        ...state.present,
        hiddenCategories: state.present.hiddenCategories.filter(k => k !== action.payload),
      });

    case 'SET_CATEGORY_LABEL':
      return applyChange({
        ...state.present,
        categoryLabels: { ...state.present.categoryLabels, [action.payload.key]: action.payload.label },
      });

    case 'UPDATE_SCENE_RIBBON':
      return applyChange({
        ...state.present,
        sceneRibbon: action.payload,
      });

    case 'ADD_RIBBON_DESIGN': {
      const rows = action.payload.rows
        ? JSON.parse(JSON.stringify(action.payload.rows))
        : action.payload.cloneFromId
          ? JSON.parse(JSON.stringify(state.present.ribbonDesigns.find(d => d.id === action.payload.cloneFromId)?.rows || getDefaultRibbonRows()))
          : getDefaultRibbonRows();
      const newDesign: RibbonDesign = {
        id: generateUUID(),
        name: action.payload.name,
        rows,
        createdAt: Date.now(),
      };
      return applyChange({
        ...state.present,
        ribbonDesigns: [...state.present.ribbonDesigns, newDesign],
        activeRibbonId: newDesign.id,
      });
    }

    case 'UPDATE_RIBBON_DESIGN':
      return applyChange({
        ...state.present,
        ribbonDesigns: state.present.ribbonDesigns.map(d =>
          d.id === action.payload.id ? { ...d, rows: action.payload.rows } : d
        ),
      });

    case 'DELETE_RIBBON_DESIGN': {
      const target = state.present.ribbonDesigns.find(d => d.id === action.payload);
      if (!target) return state;
      const remaining = state.present.ribbonDesigns.filter(d => d.id !== action.payload);
      if (remaining.length === 0) return state;
      const newActiveId = state.present.activeRibbonId === action.payload
        ? remaining[0].id
        : state.present.activeRibbonId;
      const trashItem: RibbonTrashItem = { design: target, deletedAt: Date.now() };
      return applyChange({
        ...state.present,
        ribbonDesigns: remaining,
        activeRibbonId: newActiveId,
        ribbonTrash: [...state.present.ribbonTrash, trashItem],
      });
    }

    case 'RESTORE_RIBBON_FROM_TRASH': {
      const item = state.present.ribbonTrash.find(t => t.design.id === action.payload);
      if (!item) return state;
      return applyChange({
        ...state.present,
        ribbonDesigns: [...state.present.ribbonDesigns, item.design],
        ribbonTrash: state.present.ribbonTrash.filter(t => t.design.id !== action.payload),
      });
    }

    case 'RENAME_RIBBON_DESIGN':
      return applyChange({
        ...state.present,
        ribbonDesigns: state.present.ribbonDesigns.map(d =>
          d.id === action.payload.id ? { ...d, name: action.payload.name } : d
        ),
      });

    case 'SET_ACTIVE_RIBBON':
      return applyChange({
        ...state.present,
        activeRibbonId: action.payload,
      });

    default:
      return state;
  }
}

export function getElementsFromScenes(scenes: Scene[], category: string): { id: string; name: string }[] {
  if (category === 'set') {
    const map = new Map<string, string>();
    for (const s of scenes) {
      const val = normalizePunctuation(s.set).trim().toUpperCase();
      if (!val) continue;
      if (!map.has(val)) map.set(val, val);
    }
    return [...map.values()].sort().map(v => ({ id: v, name: v }));
  }
  const set = new Set<string>();
  for (const s of scenes) {
    const val = (s as any)[category] as string;
    if (!val) continue;
    for (const id of val.split(',').map(x => x.trim()).filter(Boolean)) set.add(id);
  }
  return [...set].sort().map(id => ({ id, name: id }));
}

interface ProjectContextType {
  state: State;
  dispatch: React.Dispatch<Action>;
  projectList: ProjectMeta[];
  currentProjectId: string | null;
  initialized: boolean;
  createProject: (title?: string) => string;
  openProject: (id: string) => void;
  deleteProject: (id: string) => void;
  renameProject: (id: string, title: string) => void;
  duplicateProject: (id: string) => void;
  importProjectFromData: (data: Project) => string;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const [projectList, setProjectList] = useState<ProjectMeta[]>(() => loadProjectListFromStorage());
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  const blank = makeBlankProject();

  const [state, dispatch] = useReducer(reducer, {
    past: [],
    present: blank,
    future: []
  });

  // On mount: migrate legacy data or load most recent project
  useEffect(() => {
    const legacyData = localStorage.getItem(LEGACY_KEY);
    if (legacyData) {
      try {
        const parsed = JSON.parse(legacyData);
        if (parsed.scenes && parsed.versions) {
          const id = generateUUID();
          localStorage.setItem(getProjectStorageKey(id), legacyData);
          localStorage.removeItem(LEGACY_KEY);

          const meta: ProjectMeta = { id, title: parsed.title || 'Project', lastModified: Date.now(), createdAt: Date.now() };
          saveProjectListToStorage([meta]);
          setProjectList([meta]);

          dispatch({ type: 'LOAD', payload: parsed });
          setCurrentProjectId(id);
          setInitialized(true);
          return;
        }
      } catch (e) {
        console.error("Failed to migrate legacy project", e);
      }
    }

    const list = loadProjectListFromStorage();
    if (list.length > 0) {
      setProjectList(list);
      const sorted = [...list].sort((a, b) => b.lastModified - a.lastModified);
      const latest = sorted[0];
      const project = loadProjectFromStorage(latest.id);
      if (project) {
        dispatch({ type: 'LOAD', payload: project });
        setCurrentProjectId(latest.id);
      }
    }

    setInitialized(true);
  }, []);

  // Auto-save current project to its storage key
  useEffect(() => {
    if (!currentProjectId) return;
    localStorage.setItem(getProjectStorageKey(currentProjectId), JSON.stringify(state.present));
    setProjectList(prev => {
      const existing = prev.find(p => p.id === currentProjectId);
      if (!existing) return prev;
      const updated = prev.map(p =>
        p.id === currentProjectId
          ? { ...p, title: state.present.title, lastModified: Date.now() }
          : p
      );
      saveProjectListToStorage(updated);
      return updated;
    });
  }, [state.present, currentProjectId]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!currentProjectId) return;
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      if (cmdOrCtrl && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        dispatch({ type: 'UNDO' });
      }
      if (cmdOrCtrl && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        dispatch({ type: 'REDO' });
      }
      if (cmdOrCtrl && e.key === 's') {
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentProjectId]);

  // Save current project state to localStorage immediately
  const flushCurrentProject = useCallback(() => {
    if (!currentProjectId) return;
    localStorage.setItem(getProjectStorageKey(currentProjectId), JSON.stringify(state.present));
    setProjectList(prev => {
      const existing = prev.find(p => p.id === currentProjectId);
      if (!existing) return prev;
      const updated = prev.map(p =>
        p.id === currentProjectId
          ? { ...p, title: state.present.title, lastModified: Date.now() }
          : p
      );
      saveProjectListToStorage(updated);
      return updated;
    });
  }, [currentProjectId, state.present]);

  const createProject = useCallback((title?: string): string => {
    flushCurrentProject();

    const id = generateUUID();
    const newProject = makeBlankProject(title);

    localStorage.setItem(getProjectStorageKey(id), JSON.stringify(newProject));

    const meta: ProjectMeta = { id, title: newProject.title, lastModified: Date.now(), createdAt: Date.now() };
    setProjectList(prev => {
      const updated = [...prev, meta];
      saveProjectListToStorage(updated);
      return updated;
    });

    dispatch({ type: 'LOAD', payload: newProject });
    setCurrentProjectId(id);
    return id;
  }, [flushCurrentProject]);

  const openProject = useCallback((id: string) => {
    flushCurrentProject();

    const project = loadProjectFromStorage(id);
    if (project) {
      dispatch({ type: 'LOAD', payload: project });
      setCurrentProjectId(id);
    }
  }, [flushCurrentProject]);

  const deleteProject = useCallback((id: string) => {
    localStorage.removeItem(getProjectStorageKey(id));

    const currentIndex = loadProjectListFromStorage();
    const remaining = currentIndex.filter(p => p.id !== id);
    saveProjectListToStorage(remaining);
    setProjectList(remaining);

    if (currentProjectId === id) {
      if (remaining.length > 0) {
        openProject(remaining[0].id);
      } else {
        setCurrentProjectId(null);
      }
    }
  }, [currentProjectId, openProject]);

  const renameProject = useCallback((id: string, title: string) => {
    if (currentProjectId === id) {
      dispatch({ type: 'UPDATE_PROJECT', payload: { title } });
    }
    setProjectList(prev => {
      const updated = prev.map(p => p.id === id ? { ...p, title } : p);
      saveProjectListToStorage(updated);
      return updated;
    });
  }, [currentProjectId]);

  const duplicateProject = useCallback((id: string) => {
    flushCurrentProject();

    const original = id === currentProjectId ? state.present : loadProjectFromStorage(id);
    if (!original) return;

    const newId = generateUUID();
    const newProject: Project = {
      ...original,
      title: `${original.title} Copy`,
      versions: original.versions.map(v => ({
        ...v,
        id: generateUUID(),
        rows: v.rows.map(r => ({ ...r, id: generateUUID() }))
      })),
      ribbonDesigns: original.ribbonDesigns || [],
      activeRibbonId: original.activeRibbonId || '',
    };

    localStorage.setItem(getProjectStorageKey(newId), JSON.stringify(newProject));

    const meta: ProjectMeta = { id: newId, title: newProject.title, lastModified: Date.now(), createdAt: Date.now() };
    setProjectList(prev => {
      const updated = [...prev, meta];
      saveProjectListToStorage(updated);
      return updated;
    });
  }, [flushCurrentProject, currentProjectId, state.present]);

  const importProjectFromData = useCallback((data: Project): string => {
    flushCurrentProject();

    const id = generateUUID();
    localStorage.setItem(getProjectStorageKey(id), JSON.stringify(data));

    const meta: ProjectMeta = { id, title: data.title || 'Imported Project', lastModified: Date.now(), createdAt: Date.now() };
    setProjectList(prev => {
      const updated = [...prev, meta];
      saveProjectListToStorage(updated);
      return updated;
    });

    dispatch({ type: 'LOAD', payload: data });
    setCurrentProjectId(id);
    return id;
  }, [flushCurrentProject]);

  return (
    <ProjectContext.Provider value={{
      state,
      dispatch,
      projectList,
      currentProjectId,
      initialized,
      createProject,
      openProject,
      deleteProject,
      renameProject,
      duplicateProject,
      importProjectFromData
    }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const context = useContext(ProjectContext);
  if (!context) throw new Error("useProject must be used within ProjectProvider");
  return context;
}
