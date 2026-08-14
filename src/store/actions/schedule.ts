import { Project, ScheduleRow, ScheduleVersion, Scene, TrashItem, VersionTrashItem } from '../../types';
import { generateUUID, parsePageCount } from '../../lib/utils';
import type { Action, State } from '../reducer';
import { ensurePinnedDaybreak } from '../rows';

export type ApplyChange = (p: Project) => State;

export function caseUpdateProject(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'UPDATE_PROJECT') return state;
  return applyChange({ ...state.present, ...action.payload });
}

export function caseAddScene(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'ADD_SCENE') return state;
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
}

export function caseUpdateScene(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'UPDATE_SCENE') return state;
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

export function caseDeleteScene(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'DELETE_SCENE') return state;
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

export function caseRestoreScene(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'RESTORE_SCENE') return state;
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

export function caseEmptyTrash(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'EMPTY_TRASH') return state;
  return applyChange({
    ...state.present,
    trash: [],
    versionTrash: [],
    rulesTrash: [],
    colorRulesTrash: [],
    ribbonTrash: [],
    elementsTrash: [],
    categoryTrash: [],
    crewTrash: [],
  });
}

export function caseSortScenes(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'SORT_SCENES') return state;
  const sorted = [...state.present.scenes].sort((a, b) => 
    a.sceneNumber.localeCompare(b.sceneNumber, undefined, { numeric: true, sensitivity: 'base' })
  );
  return applyChange({ ...state.present, scenes: sorted });
}

export function caseSortScenesBy(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'SORT_SCENES_BY') return state;
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

export function caseInsertSceneAt(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'INSERT_SCENE_AT') return state;
  const { index, scene } = action.payload;
  const updated = [...state.present.scenes.slice(0, index), scene, ...state.present.scenes.slice(index)];
  return applyChange({ ...state.present, scenes: updated });
}

export function caseUpdateVersion(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'UPDATE_VERSION') return state;
  const payload = { ...action.payload };
  if (payload.rows) {
    payload.rows = ensurePinnedDaybreak(payload.rows);
  }
  return applyChange({
    ...state.present,
    versions: state.present.versions.map(v => v.id === payload.id ? { ...v, ...payload, updatedAt: Date.now() } : v)
  });
}

export function caseUpdateRow(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'UPDATE_ROW') return state;
  const { versionId, rowId, updates } = action.payload;
  return applyChange({
    ...state.present,
    versions: state.present.versions.map(v => {
      if (v.id !== versionId) return v;
      const idx = v.rows.findIndex(r => r.id === rowId);
      if (idx === -1) return v;
      const rows = [...v.rows];
      rows[idx] = { ...rows[idx], ...updates };
      return { ...v, rows, updatedAt: Date.now() };
    }),
  });
}

export function caseNewVersion(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'NEW_VERSION') return state;
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

export function caseDeleteVersion(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'DELETE_VERSION') return state;
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

export function caseRestoreVersionFromTrash(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'RESTORE_VERSION_FROM_TRASH') return state;
  const item = (state.present.versionTrash || []).find(t => t.version.id === action.payload);
  if (!item) return state;
  return applyChange({
    ...state.present,
    versions: [...state.present.versions, item.version],
    versionTrash: (state.present.versionTrash || []).filter(t => t.version.id !== action.payload)
  });
}

export function caseRenameVersion(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'RENAME_VERSION') return state;
  const { id, name } = action.payload;
  return applyChange({
    ...state.present,
    versions: state.present.versions.map(v => v.id === id ? { ...v, name, updatedAt: Date.now() } : v)
  });
}

export function caseSetActiveVersion(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'SET_ACTIVE_VERSION') return state;
  return applyChange({ ...state.present, activeVersionId: action.payload });
}

export function caseImportScenes(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'IMPORT_SCENES') return state;
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
}
