import {
  Action,
  State,
  reducer,
  makeBlankProject,
  getSceneFieldValue,
  BUILTIN_SCENE_KEYS,
  ACTION_TYPES,
} from '../store/reducer';
import { computeRowData, buildNonShootSet } from './daybreakUtils';
import {
  autoDaybreaks as computeAutoDaybreaks,
  deleteAllDaybreaks as computeDeleteAllDaybreaks,
  insertRow as computeInsertRow,
  moveRows as computeMoveRows,
  setStripboardOrder as computeSetStripboardOrder,
  sortRows as computeSortRows,
  type AutoDaybreaksOptions,
  type InsertRowOptions,
  type MoveRowsOptions,
  type SortRowsOptions,
} from './scheduleOps';
import { createBlankScene } from './sceneFactory';
import { deserializeProject } from './projectCodec';
import { auditScriptMap, repairScriptMap, type RepairResult, type ScriptIntegrityReport } from './scriptIntegrity';
import { formatSceneHeading, normalizeSceneNumber, scriptSceneOf } from './script';
import {
  REPORT_BLOCK_TYPES,
  COLLECTION_LABELS,
  COLLECTION_ORDER,
  CONTEXTUAL_COLLECTIONS,
  NON_SCOPABLE_COLLECTIONS,
  TYPED_PARENT_COLLECTIONS,
  makeReportBlock as createReportBlock,
} from './reportBlocks';
import { getReportFieldDefs } from './reportFields';
import { buildDayViews, type DayView } from './dayView';
import { computeViolationIndex } from './violations';
import { computeElementDayStats } from './elementDayStats';
import { generateUUID } from './utils';
import type { Project, Scene, CalendarVersion, CustomCategoryDef, ScriptBlock, ScheduleRow, ReportBlock, ReportDesign } from '../types';
import type { ProjectMeta } from '../store/storage';

/**
 * Agentic debug bridge — a read/write window over the store for AI agents,
 * exposed as `window.__lemonSchedule`. See AGENTS.md "Agentic Debug Bridge".
 *
 * Design rules (AGENTS.md):
 * - Writes go through the SAME dispatch the UI uses (never re-implemented logic).
 * - Reads reuse the canonical computed paths (computeRowData / getSceneFieldValue).
 * - Secrets (OAuth token, session) are never exposed.
 * - Gated: dev builds always; prod/preview only with localStorage `LEMON_AGENT=1`.
 */

export interface AgentBridgeConnectivitySnapshot {
  isOnline: boolean;
  realOnline: boolean;
  driveSaveError: boolean;
  driveRetryPending: boolean;
  driveErrorMsg: string | null;
  lastProbeAt: number;
  lastProbeOk: boolean;
  lastProbeError: string | null;
  saveRetryCount: number;
  lastPayloadBytes: number;
  signedIn: boolean;
  needsReauth: boolean;
  projectIsCloud: boolean;
  navigatorOnLine: boolean;
  readOnly: boolean;
}

interface AgentBridgeApi {
  getState: () => State;
  getProject: () => Project;
  dispatch: (action: Action) => void;
  getProjectList: () => ProjectMeta[];
  getCurrentProjectId: () => string | null;
  getConnectivity: () => AgentBridgeConnectivitySnapshot;
}

export interface AgentBridgeRowSnapshot {
  id: string;
  type: string;
  order: number;
  isDaybreak: boolean;
  daybreakCallTime?: string;
  estimatedDuration?: number;
  breakDuration?: number;
  sceneId?: string;
  computedCallTime?: string;
  computedElapsed?: number;
  computedDayElapsed?: number;
  daybreakLabel?: string;
  daybreakDate?: string;
  sectionTotal?: number;
  sectionEndTime?: string;
}

export interface AgentBridgeSectionsSnapshot {
  index: number;
  label: string;
  date: string;
  chronoDay: number;
  isPinned: boolean;
  rows: string[];
  sums: { total: number; pages: number; shoot: number; break: number; endTime: string };
}

export interface AgentBridgeSceneSnapshot {
  id: string;
  sceneNumber: string;
  values: Record<string, string>;
}

/** One scene's breakdown row + its retained screenplay body (or null when the
 *  scene number is unknown). `blocks` reuse the canonical `ScriptBlock` shape. */
export interface AgentBridgeSceneScriptSnapshot {
  sceneNumber: string;
  sceneId: string | null;
  heading: string | null;
  scriptPage?: string;
  blocks: ScriptBlock[];
  scene: Scene | null;
}

export interface AgentBridgeScheduleOpResult {
  applied: boolean;
  versionId: string;
  rowCount: number;
  /** Present for auto-daybreak: number of daybreaks after the split. */
  daybreaks?: number;
}

export interface AgentBridgeAutoDaybreaksParams extends AutoDaybreaksOptions {
  versionId?: string | null;
}

export interface AgentBridgeMoveRowsParams extends MoveRowsOptions {
  versionId?: string | null;
}

export interface AgentBridgeReorderRowsParams {
  versionId?: string | null;
  /** Full stripboard order (a permutation of its current rows, daybreaks included). */
  orderedRowIds: string[];
}

export interface AgentBridgeInsertRowParams extends Omit<InsertRowOptions, 'row'> {
  versionId?: string | null;
  /** Row to insert; `id` is generated when omitted (containerId/order are set by the op). */
  row: Partial<ScheduleRow> & { type: ScheduleRow['type'] };
}

export interface AgentBridgeSortRowsParams extends SortRowsOptions {
  versionId?: string | null;
}

export interface AgentBridgeDeleteAllDaybreaksParams {
  versionId?: string | null;
}

/** Serializable Reports-Designer vocabulary (the builder's dictionary). */
export interface AgentBridgeReportRegistry {  collections: {
    key: string;
    label: string;
    /** Contextual child (only valid inside its parent repeat/table). */
    contextual: boolean;
    /** Respects the Lego scope filter (repeat/relative); false = always all. */
    scoped: boolean;
    /** Typed-parent child collection (e.g. elementsOfCategory ← categories). */
    typedChildOf: string | null;
  }[];
  fields: {
    key: string;
    label: string;
    group: string;
    scope: string;
    multiValue?: boolean;
    dayList?: boolean;
    link?: boolean;
    defaultWidth?: number;
  }[];
  blockTypes: string[];
}

/** One production day's headline numbers (full detail via getDay). */
export interface AgentBridgeDayOverview {
  sectionIndex: number;
  chronoDay: number;
  date: string;
  label: string;
  callTime: string;
  firstCall: string;
  wrap: string;
  status: string | null;
  sceneCount: number;
  castCount: number;
  elementCount: number;
  locations: string[];
  masterLocation: string | null;
  note: string | null;
  violationCount: number;
  sums: { total: number; pages: number; shoot: number; break: number; endTime: string };
}

export interface AgentBridgeElementStats {
  key: string;
  startDate?: string;
  finishDate?: string;
  workDays: number;
  totalDays: number;
  statusCounts: Record<string, number>;
}

export interface LemonAgentBridge {
  version: string;
  help: () => string[];
  isInstalled: () => boolean;
  getState: () => State;
  getProject: () => Project;
  getProjectList: () => ProjectMeta[];
  getCurrentProjectId: () => string | null;
  getVersion: (versionId?: string | null) => { id: string; name: string; calendarVersionId?: string; calendarVersionName?: string } | null;
  getCalendarVersion: () => CalendarVersion | null;
  getRows: (versionId?: string | null) => {
    projectId: string;
    versionId: string;
    rows: AgentBridgeRowSnapshot[];
    sections: AgentBridgeSectionsSnapshot[];
  };
  getSceneValues: () => { columns: string[]; rows: AgentBridgeSceneSnapshot[] };
  getSceneScript: (sceneNumber: string) => AgentBridgeSceneScriptSnapshot | null;
  diagnostics: () => AgentBridgeConnectivitySnapshot;
  decodeProject: (raw: string) => Project;
  auditScript: () => ScriptIntegrityReport;
  repairScript: () => RepairResult;
  autoDaybreaks: (params: AgentBridgeAutoDaybreaksParams) => AgentBridgeScheduleOpResult;
  deleteAllDaybreaks: (params?: AgentBridgeDeleteAllDaybreaksParams) => AgentBridgeScheduleOpResult;
  moveRows: (params: AgentBridgeMoveRowsParams) => AgentBridgeScheduleOpResult;
  insertRow: (params: AgentBridgeInsertRowParams) => AgentBridgeScheduleOpResult;
  reorderRows: (params: AgentBridgeReorderRowsParams) => AgentBridgeScheduleOpResult;
  sortRows: (params: AgentBridgeSortRowsParams) => AgentBridgeScheduleOpResult;
  dispatch: (action: Action) => void;
  undo: () => void;
  redo: () => void;
  pastCount: () => number;
  futureCount: () => number;
  batch: (fn: () => void) => void;
  onAction: (cb: (action: Action) => void) => () => void;
  makeBlankScene: (partial?: Partial<Scene>) => Scene;
  makeBlankProject: (title?: string) => Project;
  getReportRegistry: () => AgentBridgeReportRegistry;
  getReportDesign: (reportId: string) => ReportDesign | null;
  makeReportBlock: (params: Partial<ReportBlock> & { type: ReportBlock['type'] }) => ReportBlock;
  getDays: (versionId?: string | null) => {
    projectId: string;
    versionId: string;
    calendarVersionId: string | null;
    days: AgentBridgeDayOverview[];
  };
  getDay: (params?: { versionId?: string | null; sectionIndex?: number; chronoDay?: number; date?: string } | null) => DayView | null;
  getViolations: (versionId?: string | null) => {
    total: number;
    byDay: { sectionIndex: number; chronoDay: number; date: string; label: string; violations: unknown[] }[];
    byScene: { sceneId: string; violations: unknown[] }[];
  };
  getElementStats: (category: string) => { category: string; elements: AgentBridgeElementStats[] };
  historyDepth: () => { past: number; future: number };
  newId: () => string;
}

declare global {
  interface Window {
    __lemonSchedule?: LemonAgentBridge;
    __lemonScheduleDebug?: { throwOnDispatchError?: boolean };
  }
}

export const AGENT_BRIDGE_VERSION = '1.0.0';
export const AGENT_MODE_LOCALSTORAGE_KEY = 'LEMON_AGENT';

export function isAgentModeEnabled(): boolean {
  if (import.meta.env.DEV) return true;
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(AGENT_MODE_LOCALSTORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function deepClone<T>(value: T): T {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

let installed: {
  api: AgentBridgeApi;
  listeners: Set<(action: Action) => void>;
  bridge: LemonAgentBridge;
} | null = null;

/**
 * Called by ProjectProvider once on mount. Replaces any previous bridge and
 * returns an uninstall function (production/dev-mode remount safe).
 *
 * The bridge object is ALWAYS installed in-module so the local WebSocket agent
 * bridge client (src/lib/agentBridgeClient.ts) can reach it on any build —
 * `window.__lemonSchedule` stays gated (DEV or LEMON_AGENT=1) as before.
 */
export function installAgentBridge(api: AgentBridgeApi): () => void {
  const bridge: LemonAgentBridge = buildBridge();
  installed = { api, listeners: new Set(), bridge };
  const exposeOnWindow = isAgentModeEnabled();
  if (exposeOnWindow) window.__lemonSchedule = bridge;
  return () => {
    if (exposeOnWindow && window.__lemonSchedule === bridge) delete window.__lemonSchedule;
    if (installed?.api === api) installed = null;
  };
}

/**
 * Internal accessor for the installed bridge (never null while the provider is
 * mounted). Consumed by the agent bridge WS client; NOT a window global unless
 * the agent-mode gate is on.
 */
export function getAgentBridge(): LemonAgentBridge | null {
  return installed?.bridge ?? null;
}

/** Called by ProjectProvider after every dispatch (bridge no-ops when uninstalled). */
export function notifyAgentBridge(action: Action): void {
  installed?.listeners.forEach((cb) => {
    try {
      cb(action);
    } catch {
      // listener errors must not break the app
    }
  });
}

function buildBridge(): LemonAgentBridge {
  const api = () => installed!.api;

  const help = (): string[] => [
    'Agentic debug bridge v' + AGENT_BRIDGE_VERSION + ' — read/write window over the app store.',
    'Gate: DEV builds always; prod/preview when localStorage LEMON_AGENT=1.',
    '',
    'Reads (all data is deep-cloned — mutate freely):',
    '  getState()                   → { past, present, future, _batchDepth, _batchBase } (full store)',
    '  getProject()                 → active Project (shorthand for getState().present)',
    '  getProjectList()             → localStorage project index (name/id/driveFileId)',
    '  getCurrentProjectId()        → selected project id or null',
    '  getVersion(versionId?)       → active (or given) schedule version meta (rows only; calendar data lives in calendar versions)',
    '  getRows(versionId?)          → computed stripboard rows in order + sections (call times, daybreaks, sums) — dates from the ACTIVE calendar version',
    '  getDays(versionId?)          → production days overview (date, call/first call/wrap, scene+cast counts, locations, sums, violation count)',
    '  getDay({sectionIndex|chronoDay|date}) → ONE day fully resolved: scenes + call times, cast/elements (DOOD codes), crew, locations, notes, breaks, violations, sums',
    '  getViolations(versionId?)    → rules violations across the schedule (by day + by scene)',
    '  getElementStats(category)    → per-element work/finish/total days + day-type counts (cast, props, …)',
    '  historyDepth()               → { past, future } undo/redo stack depth',
    '  getCalendarVersion()         → active calendar version meta (production window + nonShootDates)',
    '  getSceneValues()             → Glide grid truth: every scene, every column value (canvas is opaque to the DOM)',
    '  getSceneScript(num)          → ONE scene: breakdown row + retained screenplay blocks (matched by scene number; null if unknown)',
    '  decodeProject(raw)           → decode a persisted localStorage/Drive project string (gzip/base64 OR legacy plain JSON)',
    '  diagnostics()                → connectivity/sync snapshot (probe result, Drive save error, payload size, retries, readOnly)',
    '  auditScript()                → project↔scriptDocument integrity report (duplicate numbers, orphan/dangling bodies, missing rows)',
    '  pastCount() / futureCount()  → undo/redo stack depths',
    '',
    'Writes (same Action union the UI uses; see src/store/reducer.ts — ~95 types):',
    '  dispatch(action)             → apply any store action; throws with a helpful prefix on invalid/shape errors',
    '  repairScript()               → repair the script map (renumber/prune/rows) in ONE batch; returns counts',
    '  autoDaybreaks({mode,threshold,notesAction?,breaksAction?}) → re-split the stripboard into days (duration|pages); drops existing daybreaks',
    '  deleteAllDaybreaks()         → remove every non-pinned daybreak (day details go too)',
    '  moveRows({rowIds,toContainer?,beforeRowId?,afterRowId?,toIndex?}) → move rows within/between the stripboard and boneyard',
    '  insertRow({row,container?,beforeRowId?,afterRowId?,toIndex?}) → insert a NOTE/BREAK/DAYBREAK row (row needs an id — use newId())',
    '  reorderRows({orderedRowIds}) → set the stripboard order explicitly (full permutation incl. daybreaks)',
    '  sortRows({criteria:[{key,direction?}],customOrders?}) → hierarchical scene sort (set → day/night → INT/EXT …); drops daybreaks',
    '  batch(fn)                    → wrap multiple dispatches in BATCH_START/BATCH_COMMIT (one undo entry)',
    '  undo() / redo()              → step the history stacks (NOTE: LOAD resets history)',
    '',
    'Observation:',
    '  onAction(cb)                 → subscribe to every dispatched action; returns an unsubscribe fn',
    '',
    'Factories (build valid entities without hand-crafting ids/fields):',
    '  makeBlankScene(partial?)     → complete Scene with a fresh id',
    '  makeBlankProject(title?)     → complete blank Project (pinned daybreak, default design/reports)',
    '  makeReportBlock({type,...})  → valid ReportBlock (block types via getReportRegistry)',
    '  newId()                      → fresh uuid',
    '',
    'Reports Designer:',
    '  getReportRegistry()          → collections + field registry + block types (the builder dictionary)',
    '  getReportDesign(reportId)    → one design (blocks/header/footer); new projects seed templates incl. a Call Sheet',
    '',
    'Invariants to respect: every scene needs a SCENE row (ADD_SCENE creates one); cast referenced by ID;',
    'the daybreak above a section owns its base call time. Prefer dispatches over hand-editing state.',
  ];

  const getRows = (versionId?: string | null) => {    const project = api().getProject();
    const version = project.versions.find((v) => v.id === (versionId || project.activeVersionId)) || project.versions[0];
    if (!version) return { projectId: project.id, versionId: '', rows: [], sections: [] };
    const calendarVersion = project.calendarVersions.find((v) => v.id === project.activeCalendarVersionId) || project.calendarVersions[0];
    const { computedRows, sections } = computeRowData(
      version.rows,
      project.scenes,
      calendarVersion?.productionStart,
      buildNonShootSet(calendarVersion?.nonShootDates),
    );
    return {
      projectId: project.id,
      versionId: version.id,
      rows: computedRows.map((r) => deepClone(r) as unknown as AgentBridgeRowSnapshot),
      sections: sections.map((s) => ({
        index: s.index,
        label: s.label,
        date: s.date,
        chronoDay: s.chronoDay,
        isPinned: s.isPinned,
        rows: s.rows.map((r) => r.id),
        sums: { ...s.sums },
      })),
    };
  };

  /** Canonical day read-model pipeline — mirrors useDaybreakSections exactly
   *  (container rows → computeRowData → buildDayViews), so the bridge, the Day
   *  Manager and the report seams all read the same days. */
  const computeDayViewsFor = (versionId?: string | null) => {
    const project = api().getProject();
    const version = project.versions.find((v) => v.id === (versionId || project.activeVersionId)) || project.versions[0];
    if (!version) return null;
    const calendarVersion = project.calendarVersions.find((v) => v.id === project.activeCalendarVersionId) || project.calendarVersions[0];
    const containerRows = version.rows
      .filter((r) => r.containerId != null && r.containerId !== -1)
      .sort((a, b) => {
        if ((a.containerId || 0) !== (b.containerId || 0)) return (a.containerId || 0) - (b.containerId || 0);
        return a.order - b.order;
      });
    const nonShootSet = buildNonShootSet(calendarVersion?.nonShootDates);
    const startDate = calendarVersion?.productionStart || new Date().toISOString().slice(0, 10);
    const callTimeBase = containerRows.find((r) => r.type === 'DAYBREAK')?.daybreakCallTime || '08:00';
    const { computedRows, sections, sectionDateMap, sectionSums } = computeRowData(
      containerRows,
      project.scenes,
      startDate,
      nonShootSet,
      callTimeBase,
    );
    const productionSections = sections[0]?.isPinned
      ? sections.filter((_, i) => !(i === 0 && sections[i].isPinned))
      : sections;
    const days = buildDayViews({ project, sections, productionSections, sectionDateMap, computedRows, sectionSums, calendarVersion });
    return { project, version, calendarVersion, days, sections, productionSections };
  };

  const getDays = (versionId?: string | null) => {
    const ctx = computeDayViewsFor(versionId);
    if (!ctx) return { projectId: api().getProject().id, versionId: '', calendarVersionId: null, days: [] };
    return {
      projectId: ctx.project.id,
      versionId: ctx.version.id,
      calendarVersionId: ctx.calendarVersion?.id ?? null,
      days: ctx.days.map((d) => ({
        sectionIndex: d.sectionIndex,
        chronoDay: d.chronoDay,
        date: d.date,
        label: d.label,
        callTime: d.callTime,
        firstCall: d.firstCall,
        wrap: d.wrap,
        status: d.status ?? null,
        sceneCount: d.scenes.length,
        castCount: d.cast.length,
        elementCount: Object.values(d.elements).reduce((n, arr) => n + arr.length, 0),
        locations: [...d.sceneLocations],
        masterLocation: d.masterLocation?.name ?? null,
        note: d.meta?.note ?? null,
        violationCount: d.violations.length,
        sums: { ...d.sums },
      })),
    };
  };

  const getDay = (params?: { versionId?: string | null; sectionIndex?: number; chronoDay?: number; date?: string } | null) => {
    const ctx = computeDayViewsFor(params?.versionId);
    if (!ctx) return null;
    const { sectionIndex, chronoDay, date } = params ?? {};
    const day = sectionIndex != null
      ? ctx.days.find((d) => d.sectionIndex === sectionIndex)
      : chronoDay != null
        ? ctx.days.find((d) => d.chronoDay === chronoDay)
        : date
          ? ctx.days.find((d) => d.date === date)
          : undefined;
    return day ? deepClone(day) : null;
  };

  const getViolations = (versionId?: string | null) => {
    const ctx = computeDayViewsFor(versionId);
    if (!ctx) return { total: 0, byDay: [], byScene: [] };
    const index = computeViolationIndex(ctx.project, ctx.productionSections);
    const byDay = ctx.days
      .filter((d) => d.violations.length > 0)
      .map((d) => ({
        sectionIndex: d.sectionIndex,
        chronoDay: d.chronoDay,
        date: d.date,
        label: d.label,
        violations: deepClone(d.violations) as unknown[],
      }));
    const byScene = [...index.sceneViolations.entries()].map(([sceneId, violations]) => ({
      sceneId,
      violations: deepClone(violations) as unknown[],
    }));
    return { total: index.totalViolations, byDay, byScene };
  };

  const getSceneValues = () => {
    const project = api().getProject();
    const customKeys = (project.customCategories || []).map((c: CustomCategoryDef) => c.key);
    const columns = [...BUILTIN_SCENE_KEYS, ...customKeys];
    return {
      columns,
      rows: project.scenes.map((s) => ({
        id: s.id,
        sceneNumber: s.sceneNumber,
        values: Object.fromEntries(columns.map((k) => [k, getSceneFieldValue(s, k)])),
      })),
    };
  };

  const getSceneScript = (sceneNumber: string): AgentBridgeSceneScriptSnapshot | null => {
    const wanted = typeof sceneNumber === 'string' ? sceneNumber.trim() : '';
    if (!wanted) throw new Error('[lemon bridge] getSceneScript requires a sceneNumber');
    const project = api().getProject();
    const target = normalizeSceneNumber(wanted);
    const scene = project.scenes.find((s) => normalizeSceneNumber(s.sceneNumber) === target) ?? null;
    const scriptScene = scriptSceneOf(project.scriptDocument, wanted);
    if (!scene && !scriptScene) return null;
    const snapshot: AgentBridgeSceneScriptSnapshot = {
      sceneNumber: scene?.sceneNumber ?? scriptScene!.sceneNumber,
      sceneId: scene?.id ?? null,
      heading: scene ? formatSceneHeading(scene.intExt, scene.set, scene.dayNight) : null,
      blocks: scriptScene?.blocks ?? [],
      scene,
    };
    if (scriptScene?.scriptPage) snapshot.scriptPage = scriptScene.scriptPage;
    return deepClone(snapshot);
  };

  const dispatch = (action: Action) => {
    if (!action || typeof action !== 'object' || typeof action.type !== 'string') {
      throw new Error('[lemon bridge] dispatch expects an Action object with a string .type');
    }
    if (!ACTION_TYPES.has(action.type)) {
      throw new Error(
        `[lemon bridge] unknown action type '${action.type}'. Known types: ${[...ACTION_TYPES].join(', ')}`,
      );
    }
    try {
      api().dispatch(action);
    } catch (err) {
      throw new Error(`[lemon bridge] dispatch ${action.type} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const resolveVersion = (versionId?: string | null) => {
    const project = api().getProject();
    const version = project.versions.find((v) => v.id === (versionId || project.activeVersionId)) || project.versions[0];
    if (!version) throw new Error('[lemon bridge] no schedule version to edit');
    return { project, version };
  };

  const scheduleOpResult = (versionId: string, rows: ScheduleRow[]): AgentBridgeScheduleOpResult => ({
    applied: true,
    versionId,
    rowCount: rows.length,
    daybreaks: rows.filter((r) => r.type === 'DAYBREAK').length,
  });

  return {
    version: AGENT_BRIDGE_VERSION,
    help,
    isInstalled: () => !!installed,
    getState: () => deepClone(api().getState()),
    getProject: () => deepClone(api().getProject()),
    getProjectList: () => deepClone(api().getProjectList()),
    getCurrentProjectId: () => api().getCurrentProjectId(),
    getVersion: (versionId?: string | null) => {
      const project = api().getProject();
      const version = project.versions.find((v) => v.id === (versionId || project.activeVersionId)) || project.versions[0];
      const calendarVersion = project.calendarVersions.find((v) => v.id === project.activeCalendarVersionId) || project.calendarVersions[0];
      return version
        ? { id: version.id, name: version.name, calendarVersionId: calendarVersion?.id, calendarVersionName: calendarVersion?.name }
        : null;
    },
    getCalendarVersion: () => {
      const project = api().getProject();
      const v = project.calendarVersions.find((c) => c.id === project.activeCalendarVersionId) || project.calendarVersions[0] || null;
      return v ? deepClone(v) : null;
    },
    getRows,
    getSceneValues,
    getDays,
    getDay,
    getViolations,
    getElementStats: (category: string) => {
      if (!category) throw new Error('[lemon bridge] getElementStats needs a category key (e.g. cast, props).');
      const stats = computeElementDayStats(api().getProject(), category);
      return {
        category,
        elements: [...stats.entries()].map(([key, s]) => ({ key, ...deepClone(s) })),
      };
    },
    historyDepth: () => ({ past: api().getState().past.length, future: api().getState().future.length }),
    getSceneScript,
    decodeProject: (raw: string) => deserializeProject(raw),
    diagnostics: () => deepClone(api().getConnectivity()),
    auditScript: () => deepClone(auditScriptMap(api().getProject())),
    repairScript: () => repairScriptMap(dispatch, api().getProject()),
    autoDaybreaks: (params: AgentBridgeAutoDaybreaksParams) => {
      const { project, version } = resolveVersion(params.versionId);
      const rows = computeAutoDaybreaks(
        version.rows,
        project.scenes,
        {
          mode: params.mode,
          threshold: params.threshold,
          notesAction: params.notesAction ?? 'boneyard',
          breaksAction: params.breaksAction ?? 'boneyard',
        },
        generateUUID,
      );
      dispatch({ type: 'UPDATE_VERSION', payload: { id: version.id, rows } });
      return scheduleOpResult(version.id, rows);
    },
    deleteAllDaybreaks: (params?: AgentBridgeDeleteAllDaybreaksParams) => {
      const { version } = resolveVersion(params?.versionId);
      const rows = computeDeleteAllDaybreaks(version.rows);
      if (rows.length === version.rows.length) return { applied: false, versionId: version.id, rowCount: rows.length };
      dispatch({ type: 'UPDATE_VERSION', payload: { id: version.id, rows } });
      return scheduleOpResult(version.id, rows);
    },
    moveRows: (params: AgentBridgeMoveRowsParams) => {
      const { version } = resolveVersion(params.versionId);
      const rows = computeMoveRows(version.rows, params);
      dispatch({ type: 'UPDATE_VERSION', payload: { id: version.id, rows } });
      return scheduleOpResult(version.id, rows);
    },
    insertRow: (params: AgentBridgeInsertRowParams) => {
      const { version } = resolveVersion(params.versionId);
      const row: ScheduleRow = {
        id: params.row.id ?? generateUUID(),
        type: params.row.type,
        containerId: null,
        order: 0,
        ...params.row,
      };
      const rows = computeInsertRow(version.rows, { ...params, row });
      dispatch({ type: 'UPDATE_VERSION', payload: { id: version.id, rows } });
      return scheduleOpResult(version.id, rows);
    },
    reorderRows: (params: AgentBridgeReorderRowsParams) => {
      const { version } = resolveVersion(params.versionId);
      const rows = computeSetStripboardOrder(version.rows, params.orderedRowIds);
      dispatch({ type: 'UPDATE_VERSION', payload: { id: version.id, rows } });
      return scheduleOpResult(version.id, rows);
    },
    sortRows: (params: AgentBridgeSortRowsParams) => {
      const { project, version } = resolveVersion(params.versionId);
      const rows = computeSortRows(version.rows, project.scenes, params);
      dispatch({ type: 'UPDATE_VERSION', payload: { id: version.id, rows } });
      return scheduleOpResult(version.id, rows);
    },
    dispatch,
    undo: () => dispatch({ type: 'UNDO' }),
    redo: () => dispatch({ type: 'REDO' }),
    pastCount: () => api().getState().past.length,
    futureCount: () => api().getState().future.length,
    batch: (fn: () => void) => {
      dispatch({ type: 'BATCH_START' });
      try {
        fn();
      } finally {
        dispatch({ type: 'BATCH_COMMIT' });
      }
    },
    onAction: (cb: (action: Action) => void) => {
      if (!installed) return () => {};
      installed.listeners.add(cb);
      return () => installed?.listeners.delete(cb);
    },
    makeBlankScene: (partial?: Partial<Scene>) => createBlankScene(partial),
    makeBlankProject: (title?: string) => makeBlankProject(title),
    getReportRegistry: () => {
      const project = api().getProject();
      const typedByChild = new Map(TYPED_PARENT_COLLECTIONS.map((t) => [t.child as string, t.parent as string]));
      return deepClone<AgentBridgeReportRegistry>({
        collections: COLLECTION_ORDER.map((key) => ({
          key,
          label: COLLECTION_LABELS[key] ?? key,
          contextual: CONTEXTUAL_COLLECTIONS.has(key),
          scoped: !NON_SCOPABLE_COLLECTIONS.has(key),
          typedChildOf: typedByChild.get(key) ?? null,
        })),
        fields: getReportFieldDefs(project).map((f) => ({
          key: f.key,
          label: f.label,
          group: f.group,
          scope: f.scope,
          ...(f.multiValue ? { multiValue: true } : {}),
          ...(f.dayList ? { dayList: true } : {}),
          ...(f.link ? { link: true } : {}),
          ...(f.defaultWidth != null ? { defaultWidth: f.defaultWidth } : {}),
        })),
        blockTypes: [...REPORT_BLOCK_TYPES],
      });
    },
    getReportDesign: (reportId: string) => {
      const design = api().getProject().reportDesigns.find((d) => d.id === reportId);
      return design ? deepClone(design) : null;
    },
    makeReportBlock: (params: Partial<ReportBlock> & { type: ReportBlock['type'] }) => {
      if (!params || !params.type) throw new Error('[lemon bridge] makeReportBlock needs a block type.');
      const { type, ...partial } = params;
      return deepClone(createReportBlock(type, partial));
    },
    newId: () => generateUUID(),
  };
}