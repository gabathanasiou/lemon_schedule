/**
 * Agent bridge client — the app side of the local MCP WebSocket bridge.
 *
 * The app connects OUT to the helper process (`tools/mcp/lemon-mcp.mjs`) that
 * the AI client spawns; the helper only ever listens on 127.0.0.1. This module
 * owns the wire protocol and the method whitelist; the React glue lives in
 * `useAgentBridge.ts`.
 *
 * Security rules (see docs/API.md):
 * - Never `eval`: the helper can only call the whitelisted methods below.
 * - Never expose the OAuth token/session or the undo history (`getState`).
 * - Writes are refused while the project is read-only and for irreversible /
 *   history-resetting actions (LOAD, EMPTY_TRASH).
 */
import { ACTION_TYPES, type Action } from '../store/reducer';
import type { LemonAgentBridge } from './debugBridge';

export const AGENT_BRIDGE_URL = 'ws://127.0.0.1:3939/?role=app';
export const AGENT_BRIDGE_ENABLED_KEY = 'lemon_agent_bridge_enabled';
/** 24h suppression key for the first-use help modal (see lib/warnings.ts). */
export const AGENT_BRIDGE_HELP_SUPPRESS_KEY = 'lemon_schedule_agent_bridge_help';
export const AGENT_BRIDGE_MAX_ACTIONS = 500;
export const AGENT_BRIDGE_RECONNECT_MS = 2000;
export const AGENT_BRIDGE_PROTOCOL_VERSION = 1;

export type AgentBridgeStatus = 'off' | 'connecting' | 'connected' | 'error';

/** The bridge is a local developer feature for now (roadmap 145 ships it as a
 *  desktop app) — only offer it when the app itself runs on loopback, so
 *  visitors to the hosted site never see a dead menu item. */
export function isAgentBridgeAvailable(): boolean {
  if (typeof window === 'undefined' || !window.location) return false;
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1';
}

/** Actions the bridge refuses: LOAD replaces the project + clears history,
 *  EMPTY_TRASH is irreversible. Both stay UI-only. */
export const AGENT_BRIDGE_BLOCKED_ACTIONS = new Set(['LOAD', 'EMPTY_TRASH']);

export class AgentBridgeError extends Error {}

function asActionList(actions: unknown): Action[] {
  if (!Array.isArray(actions) || actions.length === 0) {
    throw new AgentBridgeError('Expected a non-empty array of actions.');
  }
  if (actions.length > AGENT_BRIDGE_MAX_ACTIONS) {
    throw new AgentBridgeError(`Too many actions (${actions.length}); max ${AGENT_BRIDGE_MAX_ACTIONS} per call.`);
  }
  for (const action of actions) {
    if (!action || typeof action !== 'object' || typeof (action as Action).type !== 'string') {
      throw new AgentBridgeError('Every action must be an object with a string .type.');
    }
    if (!ACTION_TYPES.has((action as Action).type)) {
      throw new AgentBridgeError(
        `Unknown action type '${(action as Action).type}'. Call get_schema for the full list.`,
      );
    }
    if (AGENT_BRIDGE_BLOCKED_ACTIONS.has((action as Action).type)) {
      throw new AgentBridgeError(`${(action as Action).type} is blocked over the agent bridge — ask the user to use the UI.`);
    }
  }
  return actions as Action[];
}

/**
 * Validate + dispatch a batch. `atomic` (default) wraps it in one undo entry.
 * Refuses read-only projects (offline cloud) before mutating anything.
 */
export function applyActionsToBridge(
  bridge: LemonAgentBridge,
  actions: unknown,
  atomic = true,
): { applied: number } {
  const list = asActionList(actions);
  if (bridge.diagnostics().readOnly) {
    throw new AgentBridgeError('The project is read-only (offline cloud project); writes are refused.');
  }
  if (atomic) bridge.dispatch({ type: 'BATCH_START' });
  try {
    for (const action of list) bridge.dispatch(action);
  } finally {
    if (atomic) bridge.dispatch({ type: 'BATCH_COMMIT' });
  }
  return { applied: list.length };
}

/**
 * Whitelisted request handler. Unknown methods are rejected; reads return the
 * bridge's deep clones, writes funnel through the one mutation path.
 */
export function createAgentBridgeRequestHandler(
  bridge: LemonAgentBridge,
): (method: string, params?: unknown) => Promise<unknown> {
  return async (method, params) => {
    switch (method) {
      case 'getProject':
        return bridge.getProject();
      case 'getProjectList':
        return bridge.getProjectList();
      case 'getCurrentProjectId':
        return bridge.getCurrentProjectId();
      case 'getVersion':
        return bridge.getVersion((params as { versionId?: string } | undefined)?.versionId ?? null);
      case 'getRows':
        return bridge.getRows((params as { versionId?: string } | undefined)?.versionId ?? null);
      case 'getSceneValues':
        return bridge.getSceneValues();
      case 'getCalendarVersion':
        return bridge.getCalendarVersion();
      case 'diagnostics':
        return bridge.diagnostics();
      case 'applyActions': {
        const p = (params ?? {}) as { actions?: unknown; atomic?: boolean };
        return applyActionsToBridge(bridge, p.actions, p.atomic !== false);
      }
      case 'makeScene':
        return bridge.makeBlankScene((params as { partial?: Record<string, unknown> } | undefined)?.partial);
      case 'undo':
        bridge.undo();
        return { ok: true };
      case 'redo':
        bridge.redo();
        return { ok: true };
      default:
        throw new AgentBridgeError(`Unknown bridge method '${method}'.`);
    }
  };
}

export interface BridgeRequestMessage {
  v: 1;
  id: number;
  method: string;
  params?: unknown;
}

interface BridgeResponseMessage {
  v: 1;
  id: number;
  ok: boolean;
  result?: unknown;
  error?: string;
}

/**
 * Wire protocol: one JSON request/response per frame. Malformed frames are
 * ignored (never crash the app); handler errors come back as `ok:false`.
 */
export function createAgentBridgeProtocol(
  handle: (method: string, params?: unknown) => Promise<unknown>,
  send: (message: BridgeResponseMessage) => void,
): (raw: unknown) => Promise<void> {
  return async (raw) => {
    if (typeof raw !== 'string') return;
    let msg: unknown;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    const req = msg as Partial<BridgeRequestMessage> | null;
    if (
      !req ||
      req.v !== AGENT_BRIDGE_PROTOCOL_VERSION ||
      typeof req.id !== 'number' ||
      typeof req.method !== 'string'
    ) {
      return;
    }
    try {
      const result = await handle(req.method, req.params);
      send({ v: 1, id: req.id, ok: true, result: result === undefined ? null : result });
    } catch (err) {
      send({ v: 1, id: req.id, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  };
}

/** ISO hello frame sent on connect so the helper can report which project is open. */
export function buildAgentBridgeHello(bridge: LemonAgentBridge) {
  const project = bridge.getProject();
  return {
    v: 1 as const,
    type: 'hello' as const,
    role: 'app' as const,
    appVersion: bridge.version,
    projectId: bridge.getCurrentProjectId(),
    projectTitle: project?.title ?? null,
    readOnly: bridge.diagnostics().readOnly,
  };
}
