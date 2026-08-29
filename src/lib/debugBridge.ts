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
import { createBlankScene } from './sceneFactory';
import { generateUUID } from './utils';
import type { Project, Scene, CustomCategoryDef } from '../types';
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

export interface LemonAgentBridge {
  version: string;
  help: () => string[];
  isInstalled: () => boolean;
  getState: () => State;
  getProject: () => Project;
  getProjectList: () => ProjectMeta[];
  getCurrentProjectId: () => string | null;
  getVersion: (versionId?: string | null) => { id: string; name: string; productionStart: string } | null;
  getRows: (versionId?: string | null) => {
    projectId: string;
    versionId: string;
    rows: AgentBridgeRowSnapshot[];
    sections: AgentBridgeSectionsSnapshot[];
  };
  getSceneValues: () => { columns: string[]; rows: AgentBridgeSceneSnapshot[] };
  diagnostics: () => AgentBridgeConnectivitySnapshot;
  dispatch: (action: Action) => void;
  undo: () => void;
  redo: () => void;
  pastCount: () => number;
  futureCount: () => number;
  batch: (fn: () => void) => void;
  onAction: (cb: (action: Action) => void) => () => void;
  makeBlankScene: (partial?: Partial<Scene>) => Scene;
  makeBlankProject: (title?: string) => Project;
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

let installed: { api: AgentBridgeApi; listeners: Set<(action: Action) => void> } | null = null;

/**
 * Called by ProjectProvider once on mount. Replaces any previous bridge and
 * returns an uninstall function (production/dev-mode remount safe).
 */
export function installAgentBridge(api: AgentBridgeApi): () => void {
  if (!isAgentModeEnabled()) return () => {};
  installed = { api, listeners: new Set() };
  const bridge: LemonAgentBridge = buildBridge();
  window.__lemonSchedule = bridge;
  return () => {
    if (window.__lemonSchedule === bridge) delete window.__lemonSchedule;
    if (installed?.api === api) installed = null;
  };
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
    '  getVersion(versionId?)       → active (or given) schedule version meta',
    '  getRows(versionId?)          → computed stripboard rows in order + sections (call times, daybreaks, sums)',
    '  getSceneValues()             → Glide grid truth: every scene, every column value (canvas is opaque to the DOM)',
    '  diagnostics()                → connectivity/sync snapshot (probe result, Drive save error, payload size, retries)',
    '  pastCount() / futureCount()  → undo/redo stack depths',
    '',
    'Writes (same Action union the UI uses; see src/store/reducer.ts — ~95 types):',
    '  dispatch(action)             → apply any store action; throws with a helpful prefix on invalid/shape errors',
    '  batch(fn)                    → wrap multiple dispatches in BATCH_START/BATCH_COMMIT (one undo entry)',
    '  undo() / redo()              → step the history stacks (NOTE: LOAD resets history)',
    '',
    'Observation:',
    '  onAction(cb)                 → subscribe to every dispatched action; returns an unsubscribe fn',
    '',
    'Factories (build valid entities without hand-crafting ids/fields):',
    '  makeBlankScene(partial?)     → complete Scene with a fresh id',
    '  makeBlankProject(title?)     → complete blank Project (pinned daybreak, default design/reports)',
    '  newId()                      → fresh uuid',
    '',
    'Invariants to respect: every scene needs a SCENE row (ADD_SCENE creates one); cast referenced by ID;',
    'the daybreak above a section owns its base call time. Prefer dispatches over hand-editing state.',
  ];

  const getRows = (versionId?: string | null) => {
    const project = api().getProject();
    const version = project.versions.find((v) => v.id === (versionId || project.activeVersionId)) || project.versions[0];
    if (!version) return { projectId: project.id, versionId: '', rows: [], sections: [] };
    const { computedRows, sections } = computeRowData(
      version.rows,
      project.scenes,
      version.productionStart,
      buildNonShootSet(version.nonShootDates),
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
      return version
        ? { id: version.id, name: version.name, productionStart: version.productionStart }
        : null;
    },
    getRows,
    getSceneValues,
    diagnostics: () => deepClone(api().getConnectivity()),
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
    newId: () => generateUUID(),
  };
}