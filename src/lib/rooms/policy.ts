/**
 * Room policy (S4) — which actions a room may transport, and who may write.
 *
 * The room runs the app's own reducer, so "is this a real action" is answered by
 * `ACTION_TYPES` (the same registry the agentic bridge validates against). On top
 * of that, three action types are NEVER accepted off the wire:
 *
 * - `LOAD` — a whole-state replace; the room owns state, a client never re-seeds
 *   mid-session (it would clobber concurrent peers).
 * - `UNDO` / `REDO` — the local reducer's stack rewind. In a room, per-user undo
 *   is a ROOM operation (rebase) applied to the shared log, never a transported
 *   action.
 */
import { ACTION_TYPES } from '../../store/reducer';
import type { RoomRole } from './protocol';

export const ROOM_REJECTED_ACTION_TYPES: ReadonlySet<string> = new Set(['LOAD', 'UNDO', 'REDO']);

export function isRoomActionAllowed(type: string): boolean {
  return ACTION_TYPES.has(type) && !ROOM_REJECTED_ACTION_TYPES.has(type);
}

/** owner + editor write; viewer is refuse-all (mirrors `canEdit` in the provider). */
export function roleCanWrite(role: RoomRole): boolean {
  return role !== 'viewer';
}
