import type { RoomStatus } from './roomClient';

/**
 * The header room-status badge state (roadmap 239 stage 1) — a pure mapping
 * from the transport status to what the cloud indicator should show. The
 * badge is PURE UI: it explains the degraded state, it changes no behavior.
 *
 * Stage 1 has no offline queue, so the 'unreachable' copy must not promise
 * one — while the room is not `open` on a shared project, edits still apply
 * locally but are not streamed (guardedDispatch's sendAction returns false)
 * and the room's next `welcome` replaces them. The header badge is the
 * honest warning for that window (stage 2 adds the queue + the pending count).
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

/** The badge tooltip text (empty for 'hidden'). */
export function roomBadgeText(state: RoomBadgeState): string {
  switch (state) {
    case 'connecting':
      return 'Connecting to collaborators…';
    case 'unreachable':
      return 'Collaboration server unreachable — changes aren\u2019t reaching your collaborators right now.';
    default:
      return '';
  }
}
