import React, { createContext, useContext, useEffect, useReducer, useCallback, useState, useRef } from 'react';
import { Project, Scene, ScheduleVersion, ScheduleRow, TrashItem, VersionTrashItem, RuleTrashItem, RibbonTrashItem, ProjectRule, CastMember, SceneRibbonColumn, SCENE_RIBBON_DEFAULTS, RibbonDesign, RibbonRow, RibbonCell, CustomCategoryDef, ElementTrashItem, CategoryTrashItem, SceneColorPalette, ColorRule, ColorRuleTrashItem } from './types';
import { generateUUID, parsePageCount, normalizePunctuation } from './lib/utils';
import { getDefaultRibbonRows, getDefaultColWidths, cid, DEFAULT_COLOR_PALETTE } from './lib/ribbonUtils';
import { isMultiValue, getFieldItems } from './lib/categories';
import { useGoogleAuth } from './lib/googleDriveAuth';
import { pushProjectAndUpdateIndex, removeFromDrive } from './lib/syncManager';
import { readDriveProject, removeFromDriveIndex } from './lib/googleDriveStorage';
import { migrateLegacyProject, LegacyMigrationResult } from './lib/legacyMigration';
import { computeRowData, buildNonShootSet } from './lib/daybreakUtils';
import Papa from 'papaparse';

const LEGACY_KEY = 'a-little-bit-of-hope-project';
const INDEX_KEY = 'lemon_schedule_project_index';
const PROJECT_KEY_PREFIX = 'lemon_schedule_project_v1_';

// Module-level store for communicating legacy migration notices from standalone functions
let _pendingLegacyMigrationNotice: LegacyMigrationResult | null = null;

export interface ProjectMeta {
  id: string;
  title: string;
  lastModified: number;
  createdAt: number;
  driveFileId?: string;
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
  const localOnly = list.filter(p => !p.driveFileId);
  localStorage.setItem(INDEX_KEY, JSON.stringify(localOnly));
}

export function loadProjectFromStorage(id: string): Project | null {
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
        parsed.colorRulesTrash = (parsed.colorRulesTrash || []).filter((t: ColorRuleTrashItem) => {
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
          // Migrate: extract colWidths from cells, strips width from cells
          if (!d.colWidths || d.colWidths.length === 0) {
            const maxRow = (d.rows || []).reduce((a: any, b: any) =>
              (a?.cells?.length ?? 0) >= (b?.cells?.length ?? 0) ? a : b, d.rows?.[0]);
            d.colWidths = maxRow?.cells?.map((c: any) => c.width ?? 10) ?? [];
          }
          const numCols = d.colWidths.length;
          for (const row of d.rows || []) {
            for (const cell of row.cells || []) {
              if (cell.field === 'extras') cell.field = 'backgroundActors';
              if (cell.field === 'animals') cell.field = 'animalsAndWranglers';
              delete (cell as any).width;
            }
            // Pad rows with fewer cells to match colWidths.length
            while ((row.cells || []).length < numCols) {
              row.cells.push({ id: cid(), field: '' });
            }
          }
        }

        parsed.hiddenCategories = parsed.hiddenCategories || [];
        parsed.categoryLabels = parsed.categoryLabels || {};

        for (const v of parsed.versions || []) {
          for (const r of v.rows || []) {
            if (r.type === 'DAYBREAK' && r.daybreakCallTime == null) {
              r.daybreakCallTime = '08:00';
            }
          }
        }

        const migrationResult = migrateLegacyProject(parsed);
        if (migrationResult.migrated) {
          _pendingLegacyMigrationNotice = migrationResult;
        }

        return migrationResult.project;
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
  'makeup', 'sfx', 'vfx', 'sound', 'music', 'animalsAndWranglers', 'weapons', 'greenery', 'artDept',
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
    colWidths: getDefaultColWidths(),
    rows: getDefaultRibbonRows(),
    createdAt: Date.now(),
    cellPaddingV: 3,
    cellPaddingH: 3,
    edgePadding: 3,
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
      rows: [{
        id: generateUUID(),
        type: 'DAYBREAK',
        containerId: 1,
        order: 0,
        daybreakLabel: 'DAYBREAK',
        daybreakCallTime: '08:00',
        pinned: true,
      }],
      productionStart: (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })(),
    }],
    activeVersionId: id,
    trash: [],
    versionTrash: [],
    rulesTrash: [],
    colorRulesTrash: [],
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
    colorPalette: DEFAULT_COLOR_PALETTE,
  };
}

type Action =
  | { type: 'LOAD'; payload: Project }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'BATCH_START' }
  | { type: 'BATCH_COMMIT' }
  | { type: 'UPDATE_PROJECT', payload: Partial<Project> }
  | { type: 'ADD_SCENE', payload: Scene }
  | { type: 'UPDATE_SCENE', payload: Partial<Scene> & { id: string } }
  | { type: 'DELETE_SCENE', payload: string }
  | { type: 'RESTORE_SCENE', payload: string }
  | { type: 'EMPTY_TRASH' }
  | { type: 'RESTORE_VERSION_FROM_TRASH', payload: string }
  | { type: 'SORT_SCENES' }
  | { type: 'SORT_SCENES_BY', payload: { key: string, direction: 'asc' | 'desc' } }
  | { type: 'INSERT_SCENE_AT', payload: { index: number; scene: Scene } }
  | { type: 'UPDATE_VERSION', payload: Partial<ScheduleVersion> & { id: string } }
  | { type: 'NEW_VERSION', payload: { name: string, cloneFromId?: string | null, id?: string } }
  | { type: 'DELETE_VERSION', payload: string }
  | { type: 'RENAME_VERSION', payload: { id: string, name: string } }
  | { type: 'SET_ACTIVE_VERSION', payload: string }
  | { type: 'IMPORT_SCENES', payload: Scene[] }
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
  | { type: 'MERGE_ELEMENTS'; payload: { category: string; sourceIds: string[]; targetId: string; targetName: string } }
  | { type: 'RESTORE_ELEMENT_FROM_TRASH'; payload: string }
  | { type: 'UPDATE_SCENE_RIBBON'; payload: SceneRibbonColumn[] }
  | { type: 'ADD_RIBBON_DESIGN'; payload: { name: string; cloneFromId?: string; rows?: RibbonRow[]; colWidths?: number[]; cellPaddingV?: number; cellPaddingH?: number; edgePadding?: number; id?: string } }
  | { type: 'UPDATE_RIBBON_DESIGN'; payload: { id: string; rows: RibbonRow[]; colWidths: number[] } }
  | { type: 'DELETE_RIBBON_DESIGN'; payload: string }
  | { type: 'RENAME_RIBBON_DESIGN'; payload: { id: string; name: string } }
  | { type: 'SET_ACTIVE_RIBBON'; payload: string }
  | { type: 'RESTORE_RIBBON_FROM_TRASH'; payload: string }
  | { type: 'SET_RIBBON_CELL_PADDING_V'; payload: { id: string; cellPaddingV: number } }
  | { type: 'SET_RIBBON_CELL_PADDING_H'; payload: { id: string; cellPaddingH: number } }
  | { type: 'SET_RIBBON_EDGE_PADDING'; payload: { id: string; edgePadding: number } }
  | { type: 'SET_COLOR_PALETTE'; payload: SceneColorPalette }
  | { type: 'ADD_COLOR_RULE'; payload: ColorRule }
  | { type: 'UPDATE_COLOR_RULE'; payload: ColorRule }
  | { type: 'DELETE_COLOR_RULE'; payload: string }
  | { type: 'RESTORE_COLOR_RULE_FROM_TRASH'; payload: string }
  | { type: 'REORDER_COLOR_RULES'; payload: ColorRule[] }

interface State {
  past: Project[];
  present: Project;
  future: Project[];
  _batchDepth: number;
  _batchBase?: Project;
}

function ensureAllScenesHaveRows(project: Project): Project {
  return {
    ...project,
    versions: project.versions.map(v => {
      const sceneIdsInRows = new Set(v.rows.filter(r => r.type === 'SCENE').map(r => r.sceneId));
      const missing = project.scenes.filter(s => !sceneIdsInRows.has(s.id));
      if (missing.length === 0) return v;
      const maxBoneyardOrder = v.rows
        .filter(r => r.containerId === null)
        .reduce((max, r) => Math.max(max, r.order), 0);
      const newRows = missing.map((s, i) => ({
        id: generateUUID(),
        type: 'SCENE' as const,
        sceneId: s.id,
        containerId: null as number | null,
        order: maxBoneyardOrder + 1 + i,
        estimatedDuration: 30,
      }));
      return { ...v, rows: [...v.rows, ...newRows] };
    }),
  };
}

function reducer(state: State, action: Action): State {
  if (action.type === 'LOAD') {
    let p = action.payload;
    if (p.ribbonDesigns) {
      p.ribbonDesigns = p.ribbonDesigns.map((d: any) => {
        if ((d.cellPaddingV === undefined && d.cellPaddingH === undefined) && d.cellPadding !== undefined) {
          return { ...d, cellPaddingV: d.cellPadding, cellPaddingH: 6, cellPadding: undefined };
        }
        return d;
      });
    }
    if (!p.ribbonDesigns || p.ribbonDesigns.length === 0) {
      const defaultDesign: RibbonDesign = {
        id: generateUUID(),
        name: 'Default',
        colWidths: getDefaultColWidths(),
        rows: getDefaultRibbonRows(),
        createdAt: Date.now(),
        cellPaddingV: 3,
        cellPaddingH: 3,
        edgePadding: 3,
      };
      p.ribbonDesigns = [defaultDesign];
      p.activeRibbonId = p.activeRibbonId || defaultDesign.id;
    }
    if (p.colorPalette) {
      if (!p.colorPalette.intExtOptions) p.colorPalette.intExtOptions = ['INT', 'EXT', 'INT/EXT'];
      if (!p.colorPalette.dayNightOptions) p.colorPalette.dayNightOptions = ['DAY', 'NIGHT', 'MORNING', 'EVENING'];
      if (!p.colorPalette.dayFooterBg) p.colorPalette.dayFooterBg = '#ffffff';
      if (!p.colorPalette.dayFooterText) p.colorPalette.dayFooterText = '#000000';
    }
    p = ensureAllScenesHaveRows(p);
    return {
      past: [],
      present: {
        ...p,
        colorPalette: p.colorPalette || DEFAULT_COLOR_PALETTE,
        breakdownElements: p.breakdownElements || {},
        customCategories: p.customCategories || [],
        elementsTrash: p.elementsTrash || [],
        categoryTrash: p.categoryTrash || [],
      },
      future: [],
      _batchDepth: 0,
    };
  }

  if (action.type === 'BATCH_START') {
    return { ...state, _batchDepth: state._batchDepth + 1, _batchBase: state._batchBase ?? state.present };
  }

  if (action.type === 'BATCH_COMMIT') {
    const newDepth = state._batchDepth - 1;
    if (newDepth <= 0) {
      const base = state._batchBase ?? state.present;
      return {
        past: [...state.past, base].slice(-50),
        present: state.present,
        future: [],
        _batchDepth: 0,
      };
    }
    return { ...state, _batchDepth: newDepth };
  }

  if (action.type === 'UNDO') {
    if (state.past.length === 0) return state;
    const previous = state.past[state.past.length - 1];
    const newPast = state.past.slice(0, state.past.length - 1);
    return {
      past: newPast,
      present: previous,
      future: [state.present, ...state.future],
      _batchDepth: 0,
    };
  }

  if (action.type === 'REDO') {
    if (state.future.length === 0) return state;
    const next = state.future[0];
    const newFuture = state.future.slice(1);
    return {
      past: [...state.past, state.present],
      present: next,
      future: newFuture,
      _batchDepth: 0,
    };
  }

  // Helper for applying changes to `present` and pushing to `past`
  const applyChange = (newPresent: Project): State => {
    if (state._batchDepth > 0) {
      return { ...state, present: newPresent };
    }
    return {
      past: [...state.past, state.present].slice(-50),
      present: newPresent,
      future: [],
      _batchDepth: 0,
    };
  };

  switch (action.type) {
    case 'UPDATE_PROJECT':
      return applyChange({ ...state.present, ...action.payload });

    case 'ADD_SCENE':
      return applyChange({
        ...state.present,
        scenes: [...state.present.scenes, action.payload],
        versions: state.present.versions.map(v => {
          const maxBoneyardOrder = v.rows
            .filter(r => r.containerId === null)
            .reduce((max, r) => Math.max(max, r.order), 0);
          return {
            ...v,
            rows: [...v.rows, {
              id: generateUUID(),
              type: 'SCENE' as const,
              sceneId: action.payload.id,
              containerId: null as number | null,
              order: maxBoneyardOrder + 1,
              estimatedDuration: 30,
            }],
          };
        }),
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
        trash: state.present.trash.filter(t => t.scene.id !== action.payload),
        versions: state.present.versions.map(v => {
          const alreadyHasRow = v.rows.some(r => r.sceneId === item.scene.id);
          if (alreadyHasRow) return v;
          const maxBoneyardOrder = v.rows
            .filter(r => r.containerId === null)
            .reduce((max, r) => Math.max(max, r.order), 0);
          return {
            ...v,
            rows: [...v.rows, {
              id: generateUUID(),
              type: 'SCENE' as const,
              sceneId: item.scene.id,
              containerId: null as number | null,
              order: maxBoneyardOrder + 1,
              estimatedDuration: 30,
            }],
          };
        }),
      });
    }

    case 'EMPTY_TRASH': {
      return applyChange({
        ...state.present,
        trash: [],
        versionTrash: [],
        rulesTrash: [],
        colorRulesTrash: [],
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

    case 'SORT_SCENES_BY': {
      const { key, direction } = action.payload;
      const numericKeys = new Set(['pageCount', 'pageCountDecimal', 'scriptDay']);
      const sorted = [...state.present.scenes].sort((a, b) => {
        const aVal = (a as any)[key] ?? '';
        const bVal = (b as any)[key] ?? '';
        if (aVal === '' && bVal === '') return 0;
        if (aVal === '') return 1;
        if (bVal === '') return -1;
        let cmp: number;
        if (numericKeys.has(key)) {
          cmp = (parseFloat(aVal) || 0) - (parseFloat(bVal) || 0);
        } else {
          cmp = String(aVal).localeCompare(String(bVal), undefined, { numeric: true, sensitivity: 'base' });
        }
        return direction === 'asc' ? cmp : -cmp;
      });
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
      const newId = action.payload.id || generateUUID();
      const parent = action.payload.cloneFromId 
        ? state.present.versions.find(v => v.id === action.payload.cloneFromId)
        : null;

      if (parent) {
        newVersion = {
          ...parent,
          id: newId,
          name: action.payload.name,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          rows: parent.rows.map(r => ({ ...r, id: generateUUID() }))
        };
      } else {
        const sceneRows = state.present.scenes.map((s, i) => ({
          id: generateUUID(),
          type: 'SCENE' as const,
          sceneId: s.id,
          containerId: null as number | null,
          order: 1 + i,
          estimatedDuration: 30,
        }));
        newVersion = {
          id: newId,
          name: action.payload.name,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          rows: [{
            id: generateUUID(),
            type: 'DAYBREAK',
            containerId: 1,
            order: 0,
            daybreakLabel: 'DAYBREAK',
            daybreakCallTime: '08:00',
            pinned: true,
          }, ...sceneRows],
          productionStart: new Date().toISOString().slice(0, 10),
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
        scenes: [...state.present.scenes, ...action.payload],
        versions: state.present.versions.map(v => {
          const maxBoneyardOrder = v.rows
            .filter(r => r.containerId === null)
            .reduce((max, r) => Math.max(max, r.order), 0);
          const newRows = action.payload.map((s, i) => ({
            id: generateUUID(),
            type: 'SCENE' as const,
            sceneId: s.id,
            containerId: null as number | null,
            order: maxBoneyardOrder + 1 + i,
            estimatedDuration: 30,
          }));
          return { ...v, rows: [...v.rows, ...newRows] };
        }),
      });

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

    case 'MERGE_ELEMENTS': {
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
      const source = action.payload.cloneFromId
        ? state.present.ribbonDesigns.find(d => d.id === action.payload.cloneFromId)
        : null;
      const rows = action.payload.rows
        ? JSON.parse(JSON.stringify(action.payload.rows))
        : source
          ? JSON.parse(JSON.stringify(source.rows))
          : getDefaultRibbonRows();
      const colWidths = action.payload.colWidths
        ? [...action.payload.colWidths]
        : source?.colWidths
          ? [...source.colWidths]
          : getDefaultColWidths();
      const newDesign: RibbonDesign = {
        id: action.payload.id || generateUUID(),
        name: action.payload.name,
        colWidths,
        rows,
        createdAt: Date.now(),
        cellPaddingV: action.payload.cellPaddingV ?? source?.cellPaddingV ?? 3,
        cellPaddingH: action.payload.cellPaddingH ?? source?.cellPaddingH ?? 3,
        edgePadding: action.payload.edgePadding ?? source?.edgePadding ?? 3,
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
          d.id === action.payload.id ? { ...d, rows: action.payload.rows, colWidths: action.payload.colWidths } : d
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

    case 'SET_RIBBON_CELL_PADDING_V':
      return applyChange({
        ...state.present,
        ribbonDesigns: state.present.ribbonDesigns.map(d =>
          d.id === action.payload.id ? { ...d, cellPaddingV: action.payload.cellPaddingV } : d
        ),
      });

    case 'SET_RIBBON_CELL_PADDING_H':
      return applyChange({
        ...state.present,
        ribbonDesigns: state.present.ribbonDesigns.map(d =>
          d.id === action.payload.id ? { ...d, cellPaddingH: action.payload.cellPaddingH } : d
        ),
      });

    case 'SET_RIBBON_EDGE_PADDING':
      return applyChange({
        ...state.present,
        ribbonDesigns: state.present.ribbonDesigns.map(d =>
          d.id === action.payload.id ? { ...d, edgePadding: action.payload.edgePadding } : d
        ),
      });

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

    case 'SET_COLOR_PALETTE':
      return applyChange({
        ...state.present,
        colorPalette: action.payload,
      });

    case 'ADD_COLOR_RULE':
      return applyChange({
        ...state.present,
        colorPalette: {
          ...(state.present.colorPalette || DEFAULT_COLOR_PALETTE),
          colorRules: [...(state.present.colorPalette?.colorRules || []), action.payload],
        },
      });

    case 'UPDATE_COLOR_RULE':
      return applyChange({
        ...state.present,
        colorPalette: {
          ...(state.present.colorPalette || DEFAULT_COLOR_PALETTE),
          colorRules: (state.present.colorPalette?.colorRules || []).map(r =>
            r.id === action.payload.id ? action.payload : r
          ),
        },
      });

    case 'DELETE_COLOR_RULE': {
      const palette = state.present.colorPalette || DEFAULT_COLOR_PALETTE;
      const rule = (palette.colorRules || []).find(r => r.id === action.payload);
      if (!rule) return state;
      const trashItem: ColorRuleTrashItem = { rule: { ...rule }, deletedAt: Date.now() };
      return applyChange({
        ...state.present,
        colorRulesTrash: [...(state.present.colorRulesTrash || []), trashItem],
        colorPalette: {
          ...palette,
          colorRules: (palette.colorRules || []).filter(r => r.id !== action.payload),
        },
      });
    }

    case 'RESTORE_COLOR_RULE_FROM_TRASH': {
      const item = (state.present.colorRulesTrash || []).find(t => t.rule.id === action.payload);
      if (!item) return state;
      const palette = state.present.colorPalette || DEFAULT_COLOR_PALETTE;
      return applyChange({
        ...state.present,
        colorRulesTrash: (state.present.colorRulesTrash || []).filter(t => t.rule.id !== action.payload),
        colorPalette: {
          ...palette,
          colorRules: [...(palette.colorRules || []), item.rule],
        },
      });
    }

    case 'REORDER_COLOR_RULES':
      return applyChange({
        ...state.present,
        colorPalette: {
          ...(state.present.colorPalette || DEFAULT_COLOR_PALETTE),
          colorRules: action.payload,
        },
      });

    default:
      return state;
  }
}

export function getElementsFromScenes(scenes: Scene[], category: string): { id: string; name: string }[] {
  if (!isMultiValue(category)) {
    const map = new Map<string, string>();
    const isSet = category === 'set';
    for (const s of scenes) {
      const raw = ((s as any)[category] as string || '').trim();
      if (!raw) continue;
      const val = isSet ? normalizePunctuation(raw).toUpperCase() : raw;
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
  readOnly: boolean;
  createProject: (title?: string, cloud?: boolean) => Promise<string>;
  openProject: (id: string, cloudDriveFileId?: string) => Promise<void>;
  deleteProject: (id: string, cloudDriveFileId?: string) => Promise<void>;
  renameProject: (id: string, title: string, driveFileId?: string) => void;
  duplicateProject: (id: string, cloudDriveFileId?: string) => Promise<void>;
  importProjectFromData: (data: Project) => string;
  updateProjectMeta: (id: string, updates: Partial<ProjectMeta>) => void;
  registerPostSaveHandler: (handler: ((project: Project) => Promise<void>) | null) => void;
  driveSaveError: boolean;
  storageQuotaError: boolean;
  retryDriveSync: () => Promise<void>;
  closeProject: () => void;
  consumeLegacyMigrationNotice: () => LegacyMigrationResult | null;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const [projectList, setProjectList] = useState<ProjectMeta[]>(() => loadProjectListFromStorage());
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const auth = useGoogleAuth();
  const driveFileIdRef = useRef<string | undefined>(undefined);
  const [driveSaveError, setDriveSaveError] = useState(false);
  const [storageQuotaError, setStorageQuotaError] = useState(false);

  const blank = makeBlankProject();

  const [state, dispatch] = useReducer(reducer, {
    past: [],
    present: blank,
    future: [],
    _batchDepth: 0,
  });
  const presentRef = useRef(state.present);
  presentRef.current = state.present;

  // Offline detection — block cloud project mutations when offline; local projects keep working
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [realOnline, setRealOnline] = useState(navigator.onLine);
  const lastSaveFailedRef = useRef(false);
  const projectListRef = useRef(projectList);
  projectListRef.current = projectList;
  useEffect(() => {
    const goOffline = () => setIsOnline(false);
    const goOnline = () => setIsOnline(true);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);
  const isCurrentCloudProject = useCallback(() => {
    const meta = projectListRef.current.find(p => p.id === currentProjectId);
    return !!meta?.driveFileId;
  }, [currentProjectId]);
  const guardedDispatch = useCallback((action: Action) => {
    if (!realOnline && action.type !== 'LOAD' && isCurrentCloudProject()) return;
    dispatch(action);
  }, [realOnline, isCurrentCloudProject]);

  // On mount: migrate legacy data or load project list (no auto-open)
  useEffect(() => {
    const legacyData = localStorage.getItem(LEGACY_KEY);
    if (legacyData) {
      try {
        const parsed = JSON.parse(legacyData);
        if (parsed.scenes && parsed.versions) {
          const id = generateUUID();
          for (const v of parsed.versions || []) {
            for (const r of v.rows || []) {
              if (r.type === 'DAYBREAK' && r.daybreakCallTime == null) {
                r.daybreakCallTime = '08:00';
              }
            }
          }
          const migrationResult = migrateLegacyProject(parsed);
          if (migrationResult.migrated) {
            _pendingLegacyMigrationNotice = migrationResult;
          }
          localStorage.setItem(getProjectStorageKey(id), JSON.stringify(migrationResult.project));
          localStorage.removeItem(LEGACY_KEY);
          const meta: ProjectMeta = { id, title: migrationResult.project.title || 'Project', lastModified: Date.now(), createdAt: Date.now() };
          saveProjectListToStorage([meta]);
          setProjectList([meta]);
          dispatch({ type: 'LOAD', payload: migrationResult.project });
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
    }

    const validIds = new Set(list.map(p => p.id));
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith('lemon_schedule_') && key !== INDEX_KEY) {
        const m = key.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
        if (m && !validIds.has(m[0])) localStorage.removeItem(key);
      }
    }

    setInitialized(true);
  }, []);

  const postSaveHandlerRef = useRef<((project: Project) => Promise<void>) | null>(null);
  const registerPostSaveHandler = useCallback((handler: ((project: Project) => Promise<void>) | null) => {
    postSaveHandlerRef.current = handler;
  }, []);

  // Consolidated save pipeline — localStorage for local projects, Drive for cloud projects
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveProjectRef = useRef(state.present);
  saveProjectRef.current = state.present;

  useEffect(() => {
    (window as any).__dumpSchedule = () => {
      const project = saveProjectRef.current;
      const version = project.versions.find(v => v.id === project.activeVersionId);
      if (!version) return console.log('No active version');
      const rows = version.rows.filter(r => r.containerId != null).sort((a, b) => {
        if ((a.containerId || 0) !== (b.containerId || 0)) return (a.containerId || 0) - (b.containerId || 0);
        return a.order - b.order;
      });
      const firstDb = rows.find(r => r.type === 'DAYBREAK');
      let sectionBase = firstDb?.daybreakCallTime || '08:00';
      let elapsed = 0;
      const addMins = (t: string, m: number) => {
        const [h, min] = t.split(':').map(Number);
        const d = new Date(0, 0, 0, h, min + m);
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      };
      const table: any[] = [];
      let sectionNum = 0;
      for (const r of rows) {
        if (r.type === 'DAYBREAK') {
          const call = addMins(sectionBase, elapsed);
          const section = sectionNum++;
          table.push({
            section,
            type: r.pinned ? 'DAYBREAK(pinned)' : 'DAYBREAK',
            id: r.id.slice(0, 6),
            callTime: call,
            dbCallTime: r.daybreakCallTime,
            duration: '',
            sceneNum: '',
            desc: r.daybreakLabel || (r.pinned ? 'section 0' : `End of Day`),
          });
          sectionBase = r.daybreakCallTime || sectionBase;
          elapsed = 0;
        } else {
          const call = addMins(sectionBase, elapsed);
          const scene = r.sceneId ? project.scenes.find(s => s.id === r.sceneId) : null;
          const dur = r.type === 'SCENE' ? (r.estimatedDuration || 0) : r.type === 'BREAK' ? (r.breakDuration || 0) : 0;
          elapsed += dur;
          table.push({
            section: sectionNum,
            type: r.type,
            id: r.id.slice(0, 6),
            callTime: call,
            dbCallTime: '',
            duration: dur > 0 ? `${dur}m` : '',
            sceneNum: scene?.sceneNumber || '',
            desc: r.type === 'NOTE' ? (r.noteText || '').slice(0, 30) : r.type === 'BREAK' ? r.breakLabel : scene?.set || '',
          });
        }
      }
      console.table(table);
    };
    (window as any).__dumpSectionTotals = () => {
      const project = saveProjectRef.current;
      const version = project.versions.find(v => v.id === project.activeVersionId);
      if (!version) return console.log('No active version');
      const containerRows = version.rows.filter(r => r.containerId != null && r.containerId !== -1).sort((a, b) => {
        if ((a.containerId || 0) !== (b.containerId || 0)) return (a.containerId || 0) - (b.containerId || 0);
        return a.order - b.order;
      });
      const nonShootSet = buildNonShootSet(version.nonShootDates);
      const startDate = version.productionStart || new Date().toISOString().slice(0, 10);
      const firstDaybreak = containerRows.find(r => r.type === 'DAYBREAK');
      const callTimeBase = firstDaybreak?.daybreakCallTime || '08:00';
      const { sections } = computeRowData(containerRows, project.scenes, startDate, nonShootSet, callTimeBase);
      if (sections.length === 0) return console.log('No sections (no daybreaks found)');
      const table: any[] = [];
      let totalEst = 0;
      let totalPages = 0;
      let totalBreak = 0;
      for (const s of sections) {
        table.push({
          section: s.index,
          label: s.label || '(pinned)',
          date: s.date,
          chronoDay: s.chronoDay,
          rows: s.rows.length,
          EST: s.sums.shoot > 0 ? `${s.sums.shoot}m` : '0',
          pages: s.sums.pages > 0 ? s.sums.pages.toFixed(3) : '0',
          break: s.sums.break > 0 ? `${s.sums.break}m` : '0',
          total: s.sums.total > 0 ? `${s.sums.total}m` : '0',
          endTime: s.sums.endTime,
        });
        totalEst += s.sums.shoot;
        totalPages += s.sums.pages;
        totalBreak += s.sums.break;
      }
      console.group(`Section Totals — ${sections.length} sections`);
      console.table(table);
      console.log('Totals:', `EST: ${totalEst}m`, `Pages: ${totalPages.toFixed(3)}`, `Break: ${totalBreak}m`, `Total: ${totalEst + totalBreak}m`);
      console.log('SectionSums map:', Object.fromEntries(sections.map(s => [s.index, s.sums])));
      console.groupEnd();
    };
  }, []);

  useEffect(() => {
    if (!currentProjectId) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      const project = saveProjectRef.current;
      const meta = projectList.find(p => p.id === currentProjectId);
      const isCloud = !!meta?.driveFileId;

      if (isCloud) {
        if (skipSaveRef.current) { skipSaveRef.current = false; return; }
        if (auth.isSignedIn && auth.accessToken && isOnline && meta?.driveFileId) {
          try {
            const newFileId = await pushProjectAndUpdateIndex(
              auth.accessToken, project, meta.driveFileId,
            );
            driveFileIdRef.current = newFileId;
            lastSaveFailedRef.current = false;
            setRealOnline(true);
            setProjectList(prev => {
              const updated = prev.map(p =>
                p.id === currentProjectId
                  ? { ...p, title: project.title, driveFileId: newFileId, lastModified: Date.now() }
                  : p
              );
              saveProjectListToStorage(updated);
              return updated;
            });
            setDriveSaveError(false);
          } catch (err: any) {
            console.error('Drive save failed:', err);
            if (err?.message?.includes('401')) {
              auth.refreshToken();
              setTimeout(async () => {
                try {
                  const token = sessionStorage.getItem('lemon_google_token');
                  if (token && meta?.driveFileId) {
                    await pushProjectAndUpdateIndex(token, project, meta.driveFileId);
                    setDriveSaveError(false);
                    lastSaveFailedRef.current = false;
                    setRealOnline(true);
                  }
                } catch {
                  // Give up — user can manually retry
                }
              }, 2000);
            } else {
              lastSaveFailedRef.current = true;
              setRealOnline(false);
            }
            setDriveSaveError(true);
          }
        } else {
          lastSaveFailedRef.current = true;
          setRealOnline(false);
          setDriveSaveError(true);
        }
      } else {
        try {
          localStorage.setItem(getProjectStorageKey(currentProjectId), JSON.stringify(project));
          setStorageQuotaError(false);
        } catch (e: any) {
          if (e.name === 'QuotaExceededError') {
            setStorageQuotaError(true);
            console.error('localStorage quota exceeded — project not saved');
          } else {
            console.error('localStorage save failed:', e);
          }
          return;
        }
        setProjectList(prev => {
          const existing = prev.find(p => p.id === currentProjectId);
          if (!existing) return prev;
          const updated = prev.map(p =>
            p.id === currentProjectId
              ? { ...p, title: project.title, lastModified: Date.now() }
              : p
          );
          saveProjectListToStorage(updated);
          return updated;
        });
        postSaveHandlerRef.current?.(project).catch(() => {});
      }
    }, 500);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [state.present, currentProjectId, auth.isSignedIn, auth.accessToken, isOnline]);

  // Clear sync errors and force a fresh sync when the user re-authenticates
  // Also block editing when the user signs out while editing a cloud project
  const prevSignedInRef = useRef(auth.isSignedIn);
  useEffect(() => {
    const meta = projectListRef.current.find(p => p.id === currentProjectId);
    if (auth.isSignedIn && !prevSignedInRef.current) {
      if (meta?.driveFileId) {
        setDriveSaveError(false);
      }
    } else if (!auth.isSignedIn && prevSignedInRef.current) {
      if (meta?.driveFileId) {
        setRealOnline(false);
        setDriveSaveError(true);
      }
    }
    prevSignedInRef.current = auth.isSignedIn;
  }, [auth.isSignedIn, currentProjectId]);

  // When the token becomes invalid (silent refresh failed), block editing
  const prevNeedsReauthRef = useRef(auth.needsReauth);
  useEffect(() => {
    const meta = projectListRef.current.find(p => p.id === currentProjectId);
    if (!meta?.driveFileId) return;
    if (auth.needsReauth && !prevNeedsReauthRef.current) {
      setRealOnline(false);
      setDriveSaveError(true);
    } else if (!auth.needsReauth && prevNeedsReauthRef.current) {
      setDriveSaveError(false);
    }
    prevNeedsReauthRef.current = auth.needsReauth;
  }, [auth.needsReauth, currentProjectId]);

  // Catch-up sync when reconnecting after being offline with a pending error
  const prevOnlineRef = useRef(isOnline);
  useEffect(() => {
    if (isOnline && !prevOnlineRef.current) {
      const meta = projectListRef.current.find(p => p.id === currentProjectId);
      if (meta?.driveFileId && driveSaveError) {
        const token = sessionStorage.getItem('lemon_google_token');
        if (token) {
          pushProjectAndUpdateIndex(token, { ...presentRef.current }, meta.driveFileId)
            .then(() => { setDriveSaveError(false); lastSaveFailedRef.current = false; setRealOnline(true); })
            .catch(() => {});
        }
      }
    }
    prevOnlineRef.current = isOnline;
  }, [isOnline, currentProjectId, driveSaveError]);

  // Heartbeat: conditional HEAD ping when navigator says online but last save failed
  useEffect(() => {
    if (!navigator.onLine || !lastSaveFailedRef.current) return;
    if (realOnline) return;

    const ping = async () => {
      try {
        const res = await fetch('https://www.googleapis.com/drive/v3/about?fields=kind', {
          method: 'HEAD',
        });
        if (res.ok || res.status === 401 || res.status === 403) {
          setRealOnline(true);
          lastSaveFailedRef.current = false;
        }
      } catch {
        // Still offline
      }
    };

    const interval = setInterval(ping, 30_000);
    return () => clearInterval(interval);
  }, [realOnline]);

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

  // Flush current project to localStorage immediately (local projects only)
  const flushCurrentProject = useCallback(() => {
    if (!currentProjectId) return;
    const meta = projectList.find(p => p.id === currentProjectId);
    if (!meta || meta.driveFileId) return;
    try {
      localStorage.setItem(getProjectStorageKey(currentProjectId), JSON.stringify(state.present));
      setStorageQuotaError(false);
    } catch (e: any) {
      if (e.name === 'QuotaExceededError') setStorageQuotaError(true);
      return;
    }
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
  }, [currentProjectId, state.present, projectList]);

  // Guard to skip the save-pipeline push right after creating a cloud project
  const skipSaveRef = useRef(false);

  const createProject = useCallback(async (title?: string, cloud?: boolean): Promise<string> => {
    flushCurrentProject();
    const newProject = makeBlankProject(title);
    const id = newProject.id;

    if (cloud && auth.isSignedIn && auth.accessToken) {
      try {
        const newFileId = await pushProjectAndUpdateIndex(auth.accessToken, newProject);
        const meta: ProjectMeta = {
          id, title: newProject.title, lastModified: Date.now(), createdAt: Date.now(),
          driveFileId: newFileId,
        };
        setProjectList(prev => { const u = [...prev, meta]; return u; });
        dispatch({ type: 'LOAD', payload: newProject });
        setCurrentProjectId(id);
        driveFileIdRef.current = newFileId;
        skipSaveRef.current = true;
        return id;
      } catch (e) {
        console.error('Failed to upload new project to Drive:', e);
      }
    }

    localStorage.setItem(getProjectStorageKey(id), JSON.stringify(newProject));
    const meta: ProjectMeta = { id, title: newProject.title, lastModified: Date.now(), createdAt: Date.now() };
    setProjectList(prev => { const u = [...prev, meta]; saveProjectListToStorage(u); return u; });
    dispatch({ type: 'LOAD', payload: newProject });
    setCurrentProjectId(id);
    return id;
  }, [flushCurrentProject, auth.isSignedIn, auth.accessToken]);

  const openProject = useCallback(async (id: string, cloudDriveFileId?: string) => {
    flushCurrentProject();
    const meta = projectList.find(p => p.id === id);
    const driveFileId = meta?.driveFileId || cloudDriveFileId;

    if (driveFileId && auth.accessToken) {
      try {
        const project = await readDriveProject(auth.accessToken, driveFileId);
        if (meta && meta.title !== project.title) {
          project.title = meta.title;
        }
        setProjectList(prev => {
          if (prev.find(p => p.id === project.id)) return prev;
          return [...prev, {
            id: project.id,
            title: project.title,
            lastModified: Date.now(),
            createdAt: Date.now(),
            driveFileId,
          }];
        });
        dispatch({ type: 'LOAD', payload: project });
        setCurrentProjectId(project.id);
        driveFileIdRef.current = driveFileId;
      } catch (e) {
        console.error('Failed to open cloud project:', e);
      }
    } else {
      const project = loadProjectFromStorage(id);
      if (project) {
        dispatch({ type: 'LOAD', payload: project });
        setCurrentProjectId(id);
      }
    }
  }, [flushCurrentProject, auth.accessToken, projectList]);

  const deleteProject = useCallback(async (id: string, cloudDriveFileId?: string) => {
    const meta = projectList.find(p => p.id === id);
    const driveFileId = meta?.driveFileId || cloudDriveFileId;
    if (driveFileId && auth.isSignedIn && auth.accessToken) {
      try {
        await removeFromDrive(auth.accessToken, driveFileId);
        await removeFromDriveIndex(auth.accessToken, id);
      } catch (e) {
        console.error('Failed to delete project from Drive:', e);
      }
    }

    if (!driveFileId) {
      localStorage.removeItem(getProjectStorageKey(id));
    }

    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.includes(id)) localStorage.removeItem(key);
    }

    const currentIndex = loadProjectListFromStorage();
    const remaining = currentIndex.filter(p => p.id !== id);
    saveProjectListToStorage(remaining);
    setProjectList(prev => prev.filter(p => p.id !== id));

    if (currentProjectId === id) {
      setCurrentProjectId(null);
    }
  }, [currentProjectId, openProject, projectList, auth.isSignedIn, auth.accessToken]);

  const renameProject = useCallback((id: string, title: string, driveFileId?: string) => {
    if (currentProjectId === id) {
      dispatch({ type: 'UPDATE_PROJECT', payload: { title } });
    }
    let existingMeta: ProjectMeta | undefined;
    setProjectList(prev => {
      const idx = prev.findIndex(p => p.id === id);
      if (idx >= 0) {
        existingMeta = prev[idx];
        const updated = [...prev];
        updated[idx] = { ...updated[idx], title };
        saveProjectListToStorage(updated);
        return updated;
      }
      if (!driveFileId) return prev;
      const updated = [...prev, { id, title, lastModified: Date.now(), createdAt: Date.now(), driveFileId }];
      saveProjectListToStorage(updated);
      return updated;
    });
    if (driveFileId && auth.accessToken) {
      if (currentProjectId === id) {
        pushProjectAndUpdateIndex(auth.accessToken, { ...presentRef.current, title }, driveFileId)
          .catch(e => console.error('Failed to push rename to Drive:', e));
      } else {
        readDriveProject(auth.accessToken, driveFileId)
          .then(project => {
            project.title = title;
            pushProjectAndUpdateIndex(auth.accessToken, project, driveFileId)
              .catch(e => console.error('Failed to push rename to Drive:', e));
          })
          .catch(e => console.error('Failed to read project for rename:', e));
      }
    }
  }, [currentProjectId, auth.accessToken]);

  const duplicateProject = useCallback(async (id: string, cloudDriveFileId?: string) => {
    const meta = projectList.find(p => p.id === id);
    const driveFileId = meta?.driveFileId || cloudDriveFileId;
    if (!meta && !driveFileId) return;

    let original: Project | null = null;
    if (driveFileId && auth.accessToken) {
      try {
        original = await readDriveProject(auth.accessToken, driveFileId);
      } catch (e) {
        console.error('[duplicate] failed to read cloud project:', e);
        return;
      }
    } else if (!driveFileId) {
      original = id === currentProjectId ? state.present : loadProjectFromStorage(id);
    }
    if (!original) return;

    flushCurrentProject();
    const newId = generateUUID();
    const newProject: Project = {
      ...original,
      id: newId,
      title: `${original.title} Copy`,
      versions: original.versions.map(v => ({
        ...v,
        id: generateUUID(),
        rows: v.rows.map(r => ({ ...r, id: generateUUID() }))
      })),
      ribbonDesigns: original.ribbonDesigns || [],
      activeRibbonId: original.activeRibbonId || '',
    };

    if (driveFileId && auth.accessToken) {
      const newFileId = await pushProjectAndUpdateIndex(auth.accessToken, newProject);
      const newMeta: ProjectMeta = { id: newId, title: newProject.title, lastModified: Date.now(), createdAt: Date.now(), driveFileId: newFileId };
      setProjectList(prev => [...prev, newMeta]);
    } else {
      localStorage.setItem(getProjectStorageKey(newId), JSON.stringify(newProject));
      const newMeta: ProjectMeta = { id: newId, title: newProject.title, lastModified: Date.now(), createdAt: Date.now() };
      setProjectList(prev => { const u = [...prev, newMeta]; saveProjectListToStorage(u); return u; });
    }
  }, [flushCurrentProject, currentProjectId, state.present, projectList, auth.accessToken]);

  const importProjectFromData = useCallback((data: Project): string => {
    flushCurrentProject();
    const id = generateUUID();
    const migrationResult = migrateLegacyProject(data);
    if (migrationResult.migrated) {
      _pendingLegacyMigrationNotice = migrationResult;
    }
    localStorage.setItem(getProjectStorageKey(id), JSON.stringify(migrationResult.project));
    const meta: ProjectMeta = { id, title: migrationResult.project.title || 'Imported Project', lastModified: Date.now(), createdAt: Date.now() };
    setProjectList(prev => { const u = [...prev, meta]; saveProjectListToStorage(u); return u; });
    dispatch({ type: 'LOAD', payload: migrationResult.project });
    setCurrentProjectId(id);
    return id;
  }, [flushCurrentProject]);

  const updateProjectMeta = useCallback((id: string, updates: Partial<ProjectMeta>) => {
    setProjectList(prev => {
      const updated = prev.map(p => p.id === id ? { ...p, ...updates } : p);
      saveProjectListToStorage(updated);
      return updated;
    });
    if (id === currentProjectId && 'driveFileId' in updates) {
      driveFileIdRef.current = updates.driveFileId;
    }
  }, [currentProjectId]);

  const closeProject = useCallback(() => {
    setCurrentProjectId(null);
  }, []);

  const retryDriveSync = useCallback(async () => {
    if (!currentProjectId) return;
    const meta = projectList.find(p => p.id === currentProjectId);
    if (!meta?.driveFileId) return;
    const token = sessionStorage.getItem('lemon_google_token') ?? auth.accessToken;
    if (!token) return;
    try {
      await pushProjectAndUpdateIndex(token, { ...presentRef.current }, meta.driveFileId);
      setDriveSaveError(false);
      lastSaveFailedRef.current = false;
      setRealOnline(true);
    } catch (err: any) {
      if (err?.message?.includes('401')) {
        auth.refreshToken();
        setTimeout(async () => {
          try {
            const token = sessionStorage.getItem('lemon_google_token');
            if (token && meta?.driveFileId) {
              await pushProjectAndUpdateIndex(token, { ...presentRef.current }, meta.driveFileId);
              setDriveSaveError(false);
              lastSaveFailedRef.current = false;
              setRealOnline(true);
            }
          } catch {
            setDriveSaveError(true);
          }
        }, 2000);
      } else {
        lastSaveFailedRef.current = true;
        setRealOnline(false);
      }
      setDriveSaveError(true);
    }
  }, [currentProjectId, auth.accessToken, projectList]);

  const consumeLegacyMigrationNotice = useCallback((): LegacyMigrationResult | null => {
    const result = _pendingLegacyMigrationNotice;
    _pendingLegacyMigrationNotice = null;
    return result;
  }, []);

  return (
    <ProjectContext.Provider value={{
      state,
      dispatch: guardedDispatch,
      projectList,
      currentProjectId,
      initialized,
      readOnly: !realOnline,
      createProject,
      openProject,
      deleteProject,
      renameProject,
      duplicateProject,
      importProjectFromData,
      updateProjectMeta,
      registerPostSaveHandler,
      driveSaveError,
      storageQuotaError,
      retryDriveSync,
      closeProject,
      consumeLegacyMigrationNotice,
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

export function useIsCloudProject(): boolean {
  const { projectList, currentProjectId } = useProject();
  return !!projectList.find(p => p.id === currentProjectId)?.driveFileId;
}
