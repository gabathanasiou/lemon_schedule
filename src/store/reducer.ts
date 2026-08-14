import { Project, Scene, ScheduleVersion, ScheduleRow, ProjectRule, CastMember, SceneRibbonColumn, SCENE_RIBBON_DEFAULTS, RibbonDesign, RibbonRow, CustomCategoryDef, SceneColorPalette, ColorRule, ReportBlock, CrewRole, CrewPerson, ProductionInfo, ReportTextStyle } from '../types';
import { generateUUID, normalizePunctuation } from '../lib/utils';
import { getDefaultRibbonRows, getDefaultColWidths, DEFAULT_COLOR_PALETTE } from '../lib/ribbonUtils';
import { ensurePinnedDaybreak, ensureAllScenesHaveRows } from './rows';
import {
  caseUpdateProject, caseAddScene, caseUpdateScene, caseDeleteScene, caseRestoreScene,
  caseEmptyTrash, caseSortScenes, caseSortScenesBy, caseInsertSceneAt, caseUpdateVersion, caseUpdateRow,
  caseNewVersion, caseDeleteVersion, caseRestoreVersionFromTrash, caseRenameVersion,
  caseSetActiveVersion, caseImportScenes,
} from './actions/schedule';
import {
  caseAddRule, caseUpdateRule, caseDeleteRule, caseRestoreRuleFromTrash,
  caseAddCastMember, caseUpdateCastMember, caseDeleteCastMember,
  caseAddElement, caseUpdateElement, caseDeleteElement, caseMergeElements, caseRestoreElementFromTrash,
  caseAddCustomCategory, caseRenameCustomCategory, caseUpdateCustomCategory,
  caseDeleteCustomCategory, caseRestoreCategoryFromTrash, caseHideCategory, caseShowCategory,
  caseRestoreHiddenCategory, caseSetCategoryLabel,
} from './actions/breakdown';
import {
  caseUpdateSceneRibbon, caseAddRibbonDesign, caseUpdateRibbonDesign, caseDeleteRibbonDesign,
  caseRestoreRibbonFromTrash, caseSetRibbonCellPaddingV, caseSetRibbonCellPaddingH,
  caseSetRibbonEdgePadding, caseRenameRibbonDesign, caseSetActiveRibbon,
  caseSetColorPalette, caseAddColorRule, caseUpdateColorRule, caseDeleteColorRule,
  caseRestoreColorRuleFromTrash, caseReorderColorRules,
} from './actions/design';
import {
  caseAddReportDesign, caseUpdateReportDesign, caseUpdateReportPage, caseRenameReportDesign,
  caseSetActiveReport, caseDeleteReportDesign, caseRestoreReportFromTrash,
  caseSetProductionInfo, caseAddCrewRole, caseRenameCrewRole, caseDeleteCrewRole,
  caseAddCrewPerson, caseUpdateCrewPerson, caseDeleteCrewPerson, caseReorderCrewPerson,
  caseRestoreCrewPersonFromTrash, caseSortCrewBy,
  caseSetReportTextStyles,
} from './actions/reports';
import { DEFAULT_CREW_ROLES, getDefaultReportDesigns } from '../lib/reportTemplates';
import { isMultiValue, getFieldItems } from '../lib/categories';

export const BUILTIN_SCENE_KEYS = new Set([
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

export function getSceneFieldValue(scene: Scene, category: string): string {
  if (BUILTIN_SCENE_KEYS.has(category)) {
    return String((scene as any)[category] ?? '');
  }
  return String((scene as any)[category] ?? '');
}

export function makeBlankProject(title = 'Untitled Project'): Project {
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
  const defaultReports = getDefaultReportDesigns();
  const defaultReport = defaultReports[0];
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
    productionInfo: {},
    crewRoles: DEFAULT_CREW_ROLES,
    crew: {},
    crewTrash: [],
    reportDesigns: defaultReports,
    activeReportId: defaultReport.id,
    reportTrash: [],
  };
}

export type Action =
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
  | { type: 'UPDATE_ROW', payload: { versionId: string; rowId: string; updates: Partial<ScheduleRow> } }
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
  | { type: 'MERGE_ELEMENTS'; payload: { category: string; renames: { oldName: string; newName: string }[]; removes: { id: string; name: string; toTrash: boolean }[]; adds: { id: string; name: string }[] } }
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
  // Reports Designer + Production Info
  | { type: 'ADD_REPORT_DESIGN'; payload: { name: string; cloneFromId?: string; blocks?: ReportBlock[]; page?: 'portrait' | 'landscape'; id?: string; header?: ReportBlock[]; footer?: ReportBlock[]; headerSkipFirst?: boolean; footerSkipFirst?: boolean } }
  | { type: 'UPDATE_REPORT_DESIGN'; payload: { id: string; blocks?: ReportBlock[]; header?: ReportBlock[]; footer?: ReportBlock[]; headerSkipFirst?: boolean; footerSkipFirst?: boolean } }
  | { type: 'UPDATE_REPORT_PAGE'; payload: { id: string; page: 'portrait' | 'landscape' } }
  | { type: 'RENAME_REPORT_DESIGN'; payload: { id: string; name: string } }
  | { type: 'SET_ACTIVE_REPORT'; payload: string }
  | { type: 'DELETE_REPORT_DESIGN'; payload: string }
  | { type: 'RESTORE_REPORT_FROM_TRASH'; payload: string }
  | { type: 'SET_PRODUCTION_INFO'; payload: Partial<ProductionInfo> }
  | { type: 'SET_REPORT_TEXT_STYLES'; payload: ReportTextStyle[] }
  | { type: 'ADD_CREW_ROLE'; payload: { role: CrewRole } }
  | { type: 'RENAME_CREW_ROLE'; payload: { key: string; label: string } }
  | { type: 'DELETE_CREW_ROLE'; payload: string }
  | { type: 'ADD_CREW_PERSON'; payload: { role: string; person: CrewPerson } }
  | { type: 'UPDATE_CREW_PERSON'; payload: { role: string; id: string; updates: Partial<CrewPerson>; toRole?: string } }
  | { type: 'DELETE_CREW_PERSON'; payload: { role: string; id: string } }
  | { type: 'REORDER_CREW_PERSON'; payload: { role: string; id: string; dir: -1 | 1 } }
  | { type: 'RESTORE_CREW_PERSON_FROM_TRASH'; payload: string }
  | { type: 'SORT_CREW_BY'; payload: { key: 'role' | 'name' | 'phone' | 'email'; direction: 'asc' | 'desc' } }

export interface State {
  past: Project[];
  present: Project;
  future: Project[];
  _batchDepth: number;
  _batchBase?: Project;
}

export function reducer(state: State, action: Action): State {
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
    // Stale activeRibbonId (points to a missing/deleted design) — fall back to
    // the first design so the ribbon designer edits reach a saved design.
    if (!p.activeRibbonId || !p.ribbonDesigns.some((d: any) => d.id === p.activeRibbonId)) {
      p.activeRibbonId = p.ribbonDesigns[0]?.id || '';
    }
    if (p.colorPalette) {
      if (!p.colorPalette.intExtOptions) p.colorPalette.intExtOptions = ['INT', 'EXT', 'INT/EXT'];
      if (!p.colorPalette.dayNightOptions) p.colorPalette.dayNightOptions = ['DAY', 'NIGHT', 'MORNING', 'EVENING'];
      if (!p.colorPalette.dayFooterBg) p.colorPalette.dayFooterBg = '#ffffff';
      if (!p.colorPalette.dayFooterText) p.colorPalette.dayFooterText = '#000000';
    }
    p = ensureAllScenesHaveRows(p);

    // Reports Designer + Production Info defaults
    p.productionInfo = p.productionInfo || {};
    p.crewRoles = p.crewRoles?.length ? p.crewRoles : DEFAULT_CREW_ROLES;
    p.crew = p.crew || {};
    p.crewTrash = p.crewTrash || [];
    p.reportTrash = p.reportTrash || [];
    if (!p.reportDesigns || p.reportDesigns.length === 0) {
      const defaultReports = getDefaultReportDesigns();
      p.reportDesigns = defaultReports;
      p.activeReportId = p.activeReportId || defaultReports[0].id;
    }
    // Stale activeReportId (points to a missing/deleted design) — fall back to
    // the first design so the reports designer edits reach a saved design.
    if (!p.activeReportId || !p.reportDesigns.some(d => d.id === p.activeReportId)) {
      p.activeReportId = p.reportDesigns[0]?.id || '';
    }

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
    case 'UPDATE_PROJECT': return caseUpdateProject(state, action, applyChange);
    case 'ADD_SCENE': return caseAddScene(state, action, applyChange);
    case 'UPDATE_SCENE': return caseUpdateScene(state, action, applyChange);
    case 'DELETE_SCENE': return caseDeleteScene(state, action, applyChange);
    case 'RESTORE_SCENE': return caseRestoreScene(state, action, applyChange);
    case 'EMPTY_TRASH': return caseEmptyTrash(state, action, applyChange);
    case 'SORT_SCENES': return caseSortScenes(state, action, applyChange);
    case 'SORT_SCENES_BY': return caseSortScenesBy(state, action, applyChange);
    case 'INSERT_SCENE_AT': return caseInsertSceneAt(state, action, applyChange);
    case 'UPDATE_VERSION': return caseUpdateVersion(state, action, applyChange);
    case 'UPDATE_ROW': return caseUpdateRow(state, action, applyChange);
    case 'NEW_VERSION': return caseNewVersion(state, action, applyChange);
    case 'DELETE_VERSION': return caseDeleteVersion(state, action, applyChange);
    case 'RESTORE_VERSION_FROM_TRASH': return caseRestoreVersionFromTrash(state, action, applyChange);
    case 'RENAME_VERSION': return caseRenameVersion(state, action, applyChange);
    case 'SET_ACTIVE_VERSION': return caseSetActiveVersion(state, action, applyChange);
    case 'IMPORT_SCENES': return caseImportScenes(state, action, applyChange);
    case 'ADD_RULE': return caseAddRule(state, action, applyChange);
    case 'UPDATE_RULE': return caseUpdateRule(state, action, applyChange);
    case 'DELETE_RULE': return caseDeleteRule(state, action, applyChange);
    case 'RESTORE_RULE_FROM_TRASH': return caseRestoreRuleFromTrash(state, action, applyChange);
    case 'ADD_CAST_MEMBER': return caseAddCastMember(state, action, applyChange);
    case 'UPDATE_CAST_MEMBER': return caseUpdateCastMember(state, action, applyChange);
    case 'DELETE_CAST_MEMBER': return caseDeleteCastMember(state, action, applyChange);
    case 'ADD_ELEMENT': return caseAddElement(state, action, applyChange);
    case 'UPDATE_ELEMENT': return caseUpdateElement(state, action, applyChange);
    case 'DELETE_ELEMENT': return caseDeleteElement(state, action, applyChange);
    case 'MERGE_ELEMENTS': return caseMergeElements(state, action, applyChange);
    case 'RESTORE_ELEMENT_FROM_TRASH': return caseRestoreElementFromTrash(state, action, applyChange);
    case 'ADD_CUSTOM_CATEGORY': return caseAddCustomCategory(state, action, applyChange);
    case 'RENAME_CUSTOM_CATEGORY': return caseRenameCustomCategory(state, action, applyChange);
    case 'UPDATE_CUSTOM_CATEGORY': return caseUpdateCustomCategory(state, action, applyChange);
    case 'DELETE_CUSTOM_CATEGORY': return caseDeleteCustomCategory(state, action, applyChange);
    case 'RESTORE_CATEGORY_FROM_TRASH': return caseRestoreCategoryFromTrash(state, action, applyChange);
    case 'HIDE_CATEGORY': return caseHideCategory(state, action, applyChange);
    case 'SHOW_CATEGORY': return caseShowCategory(state, action, applyChange);
    case 'RESTORE_HIDDEN_CATEGORY': return caseRestoreHiddenCategory(state, action, applyChange);
    case 'SET_CATEGORY_LABEL': return caseSetCategoryLabel(state, action, applyChange);
    case 'UPDATE_SCENE_RIBBON': return caseUpdateSceneRibbon(state, action, applyChange);
    case 'ADD_RIBBON_DESIGN': return caseAddRibbonDesign(state, action, applyChange);
    case 'UPDATE_RIBBON_DESIGN': return caseUpdateRibbonDesign(state, action, applyChange);
    case 'DELETE_RIBBON_DESIGN': return caseDeleteRibbonDesign(state, action, applyChange);
    case 'RESTORE_RIBBON_FROM_TRASH': return caseRestoreRibbonFromTrash(state, action, applyChange);
    case 'SET_RIBBON_CELL_PADDING_V': return caseSetRibbonCellPaddingV(state, action, applyChange);
    case 'SET_RIBBON_CELL_PADDING_H': return caseSetRibbonCellPaddingH(state, action, applyChange);
    case 'SET_RIBBON_EDGE_PADDING': return caseSetRibbonEdgePadding(state, action, applyChange);
    case 'RENAME_RIBBON_DESIGN': return caseRenameRibbonDesign(state, action, applyChange);
    case 'SET_ACTIVE_RIBBON': return caseSetActiveRibbon(state, action, applyChange);
    case 'SET_COLOR_PALETTE': return caseSetColorPalette(state, action, applyChange);
    case 'ADD_COLOR_RULE': return caseAddColorRule(state, action, applyChange);
    case 'UPDATE_COLOR_RULE': return caseUpdateColorRule(state, action, applyChange);
    case 'DELETE_COLOR_RULE': return caseDeleteColorRule(state, action, applyChange);
    case 'RESTORE_COLOR_RULE_FROM_TRASH': return caseRestoreColorRuleFromTrash(state, action, applyChange);
    case 'REORDER_COLOR_RULES': return caseReorderColorRules(state, action, applyChange);
    case 'ADD_REPORT_DESIGN': return caseAddReportDesign(state, action, applyChange);
    case 'UPDATE_REPORT_DESIGN': return caseUpdateReportDesign(state, action, applyChange);
    case 'UPDATE_REPORT_PAGE': return caseUpdateReportPage(state, action, applyChange);
    case 'RENAME_REPORT_DESIGN': return caseRenameReportDesign(state, action, applyChange);
    case 'SET_ACTIVE_REPORT': return caseSetActiveReport(state, action, applyChange);
    case 'DELETE_REPORT_DESIGN': return caseDeleteReportDesign(state, action, applyChange);
    case 'RESTORE_REPORT_FROM_TRASH': return caseRestoreReportFromTrash(state, action, applyChange);
    case 'SET_PRODUCTION_INFO': return caseSetProductionInfo(state, action, applyChange);
    case 'SET_REPORT_TEXT_STYLES': return caseSetReportTextStyles(state, action, applyChange);
    case 'ADD_CREW_ROLE': return caseAddCrewRole(state, action, applyChange);
    case 'RENAME_CREW_ROLE': return caseRenameCrewRole(state, action, applyChange);
    case 'DELETE_CREW_ROLE': return caseDeleteCrewRole(state, action, applyChange);
    case 'ADD_CREW_PERSON': return caseAddCrewPerson(state, action, applyChange);
    case 'UPDATE_CREW_PERSON': return caseUpdateCrewPerson(state, action, applyChange);
    case 'DELETE_CREW_PERSON': return caseDeleteCrewPerson(state, action, applyChange);
    case 'REORDER_CREW_PERSON': return caseReorderCrewPerson(state, action, applyChange);
    case 'RESTORE_CREW_PERSON_FROM_TRASH': return caseRestoreCrewPersonFromTrash(state, action, applyChange);
    case 'SORT_CREW_BY': return caseSortCrewBy(state, action, applyChange);
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
