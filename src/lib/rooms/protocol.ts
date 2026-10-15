/**
 * S4 room wire protocol (docs/COLLABORATION.md §6 S4).
 *
 * The room is one Durable Object per shared project (`workers/rooms`) running the
 * app's own pure reducer. Clients speak this protocol over a WebSocket, and this
 * module is the ONE place the wire shapes live — the worker and the app both
 * import it, so a change here is a change on both sides.
 *
 * Auth: the FIRST client message is `hello`, carrying a room token. Tokens never
 * ride the URL (query strings land in proxy/browser logs); until `hello` is
 * accepted the room only answers `error`.
 *
 * Payloads: project state travels as the localStorage/Drive codec blob
 * (`base64(gzip(json))` — `src/lib/projectCodec.ts`), so there is exactly one
 * project codec everywhere. Actions travel as the app's `Action` objects,
 * unchanged — that is what "multiplayer by construction" means.
 *
 * Guards here are SHAPE checks only (a JSON object with the right fields). Whether
 * an action type is real, allowed, or applicable is the room's business — it runs
 * the same reducer the client runs, so semantic validation has one home.
 */
import type { Action } from '../../store/reducer';

export type RoomRole = 'owner' | 'editor' | 'viewer';

export const ROOM_ROLES: readonly RoomRole[] = ['owner', 'editor', 'viewer'];

export interface RevisionedAction {
  rev: number;
  userId: string;
  action: Action;
}

/** client → room */
export type RoomClientMessage =
  | { t: 'hello'; token: string; projectId: string }
  | { t: 'init'; project: string }
  | { t: 'act'; actionId: string; action: Action }
  | { t: 'sync' }
  /** Per-user undo/redo (S4): the room rebases the caller's own latest unit
   *  and re-syncs everyone through `welcome` — no new server→client shape. */
  | { t: 'undo' }
  | { t: 'redo' };

/** room → client */
export type RoomServerMessage =
  | { t: 'welcome'; userId: string; role: RoomRole; rev: number; project: string; replay: RevisionedAction[] }
  | { t: 'needInit' }
  | { t: 'remote'; rev: number; userId: string; actionId: string; action: Action }
  | { t: 'rejected'; actionId: string; reason: string }
  /** Per-USER undo/redo availability, pushed to ONE socket whenever it changes
   *  (join, that user's own action, undo, redo) — drives the header buttons'
   *  enablement without the client modelling the room's log. */
  | { t: 'undoState'; canUndo: boolean; canRedo: boolean }
  | { t: 'error'; message: string };

export function encodeRoomMessage(msg: RoomClientMessage | RoomServerMessage): string {
  return JSON.stringify(msg);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

function isRev(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0;
}

function isRoomRole(v: unknown): v is RoomRole {
  return typeof v === 'string' && (ROOM_ROLES as readonly string[]).includes(v);
}

function looksLikeAction(v: unknown): v is Action {
  return isRecord(v) && isNonEmptyString(v.type);
}

function parseRevisionedAction(v: unknown): RevisionedAction | null {
  if (!isRecord(v)) return null;
  if (!isRev(v.rev) || !isNonEmptyString(v.userId) || !looksLikeAction(v.action)) return null;
  return { rev: v.rev, userId: v.userId, action: v.action };
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Shape-validate one message received by the room. Null = unparseable / malformed. */
export function parseRoomClientMessage(raw: string): RoomClientMessage | null {
  const v = parseJson(raw);
  if (!isRecord(v)) return null;
  switch (v.t) {
    case 'hello':
      if (!isNonEmptyString(v.token) || !isNonEmptyString(v.projectId)) return null;
      return { t: 'hello', token: v.token, projectId: v.projectId };
    case 'init':
      if (!isNonEmptyString(v.project)) return null;
      return { t: 'init', project: v.project };
    case 'act':
      if (!isNonEmptyString(v.actionId) || !looksLikeAction(v.action)) return null;
      return { t: 'act', actionId: v.actionId, action: v.action };
    case 'sync':
      return { t: 'sync' };
    case 'undo':
      return { t: 'undo' };
    case 'redo':
      return { t: 'redo' };
    default:
      return null;
  }
}

/** Shape-validate one message received by a client. Null = unparseable / malformed. */
export function parseRoomServerMessage(raw: string): RoomServerMessage | null {
  const v = parseJson(raw);
  if (!isRecord(v)) return null;
  switch (v.t) {
    case 'welcome': {
      if (!isNonEmptyString(v.userId) || !isRoomRole(v.role) || !isRev(v.rev)) return null;
      if (!isNonEmptyString(v.project) || !Array.isArray(v.replay)) return null;
      const replay: RevisionedAction[] = [];
      for (const entry of v.replay) {
        const parsed = parseRevisionedAction(entry);
        if (!parsed) return null;
        replay.push(parsed);
      }
      return { t: 'welcome', userId: v.userId, role: v.role, rev: v.rev, project: v.project, replay };
    }
    case 'needInit':
      return { t: 'needInit' };
    case 'remote':
      if (!isRev(v.rev) || !isNonEmptyString(v.userId)) return null;
      if (!isNonEmptyString(v.actionId) || !looksLikeAction(v.action)) return null;
      return { t: 'remote', rev: v.rev, userId: v.userId, actionId: v.actionId, action: v.action };
    case 'rejected':
      if (!isNonEmptyString(v.actionId) || !isNonEmptyString(v.reason)) return null;
      return { t: 'rejected', actionId: v.actionId, reason: v.reason };
    case 'undoState':
      if (typeof v.canUndo !== 'boolean' || typeof v.canRedo !== 'boolean') return null;
      return { t: 'undoState', canUndo: v.canUndo, canRedo: v.canRedo };
    case 'error':
      if (!isNonEmptyString(v.message)) return null;
      return { t: 'error', message: v.message };
    default:
      return null;
  }
}
