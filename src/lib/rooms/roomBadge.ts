import type { RoomQueueInfo, RoomStatus } from './roomClient';

/**
 * The header room-status badge state (roadmap 239) — a pure mapping from the
 * transport status to what the cloud indicator should show. The badge is PURE
 * UI: it explains the degraded state, it changes no behavior.
 *
 * Stage 2 (built) buffers edits made while the room is not open in the client
 * and replays them after the next welcome, so the 'unreachable' copy may
 * promise the sync and show the PENDING COUNT ("N changes queued"). A full
 * buffer drops the oldest and the drop is surfaced in the same tooltip.
 */
export type RoomBadgeState = 'hidden' | 'connecting' | 'unreachable';

export interface RoomBadgeInput {
  /** The build has a rooms URL (`VITE_ROOMS_URL`) — without it the app runs
   *  its pre-S4 shared mode (blob saves + save ping) and there is no room to
   *  be unreachable. */
  roomsConfigured: boolean;
  /** The open project is a shared (Supabase) project. */
  onlineProject: boolean;
  /** The connectivity probe says we are online (`readOnly === false`) — when
   *  the whole network is down the offline banner owns that message. */
  networkOnline: boolean;
  status: RoomStatus;
}

/** 'hidden' = no badge (not a shared project / rooms not configured / the
 *  network itself is offline). 'connecting' while the room is still joining;
 *  'unreachable' for a down or retrying room. Callers apply a short grace
 *  before showing anything so a normal join never flashes the badge. */
export function roomBadgeState({ roomsConfigured, onlineProject, networkOnline, status }: RoomBadgeInput): RoomBadgeState {
  if (!roomsConfigured || !onlineProject || !networkOnline) return 'hidden';
  if (status === 'open') return 'hidden';
  return status === 'idle' || status === 'connecting' || status === 'syncing' ? 'connecting' : 'unreachable';
}

/** The badge tooltip text (empty for 'hidden'). `queue` carries the offline
 *  buffer's pending/dropped counts (roadmap 239 stage 2). */
export function roomBadgeText(state: RoomBadgeState, queue: RoomQueueInfo = { pending: 0, dropped: 0 }): string {
  const changes = (n: number) => `${n} change${n === 1 ? '' : 's'}`;
  const droppedNote = queue.dropped > 0 ? ` (${changes(queue.dropped)} dropped — the queue was full)` : '';
  switch (state) {
    case 'connecting':
      return queue.pending > 0
        ? `Connecting to collaborators — ${changes(queue.pending)} queued to sync.${droppedNote}`
        : 'Connecting to collaborators…';
    case 'unreachable':
      return queue.pending > 0
        ? `Collaboration server unreachable — ${changes(queue.pending)} queued locally, syncing when the connection returns.${droppedNote}`
        : 'Collaboration server unreachable — keep working; changes queue locally until the connection returns.';
    default:
      return '';
  }
}
