/**
 * React seam for the S4 room transport — mounts a `RoomClient` for the open
 * shared project and tears it down on project switch / sign-out.
 *
 * The callbacks are read through a ref, so the socket survives re-renders and
 * only reconnects when the TARGET changes (project, user, or the rooms URL).
 * `status` feeds `diagnostics()` and the header room-status badge; pending
 * counts feed the badge's offline-queue tooltip (roadmap 239). Dev builds
 * ensure the local worker first (`roomsEnv.ensureRoomsWorkerInDev`, roadmap
 * 246) — with `roomsUrl()` as the ONE read of VITE_ROOMS_URL + its dev fallback.
 */
import { useEffect, useRef, useState, type RefObject } from 'react';
import { RoomClient, type RoomQueueInfo, type RoomRemote, type RoomStatus, type RoomWelcome } from './roomClient';
import { ensureRoomsWorkerInDev, roomsUrl } from './roomsEnv';
import type { Action } from '../../store/reducer';

export interface UseRoomTransportOptions {
  /** The open project's Supabase row id; null = not a shared project. */
  onlineId: string | null;
  /** The signed-in user's id; null = signed out. */
  userId: string | null;
  getToken: (projectId: string) => Promise<string>;
  getInitProject: () => string | null;
  onWelcome: (welcome: RoomWelcome) => void;
  onRemote: (remote: RoomRemote) => void;
  /** A buffered offline action is being replayed — apply it locally too. */
  onReplayQueued?: (action: Action) => void;
  /** The offline buffer changed (pending/dropped counts). */
  onPendingChange?: (info: RoomQueueInfo) => void;
  onUndoState?: (state: { canUndo: boolean; canRedo: boolean }) => void;
  onError?: (message: string) => void;
}

export function useRoomTransport(opts: UseRoomTransportOptions): {
  clientRef: RefObject<RoomClient | null>;
  status: RoomStatus;
} {
  const [status, setStatus] = useState<RoomStatus>('closed');
  const clientRef = useRef<RoomClient | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const url = roomsUrl();
  const { onlineId, userId } = opts;

  useEffect(() => {
    if (!url || !onlineId || !userId) {
      setStatus('closed');
      return;
    }
    const base = url.replace(/\/+$/, '');
    let cancelled = false;
    const start = async () => {
      // Dev: the local worker is brought up (or confirmed) BEFORE the client
      // connects — the dev server owns the launcher (roadmap 246). Failures
      // are ignored here; the client's reconnect loop + the header badge are
      // the degraded path.
      await ensureRoomsWorkerInDev(base).catch(() => {});
      if (cancelled) return;
      const client = new RoomClient({
        url: `${base}/room/${encodeURIComponent(onlineId)}`,
        projectId: onlineId,
        getToken: () => optsRef.current.getToken(onlineId),
        getInitProject: () => optsRef.current.getInitProject(),
        onWelcome: (welcome) => optsRef.current.onWelcome(welcome),
        onRemote: (remote) => optsRef.current.onRemote(remote),
        onReplayQueued: (action) => optsRef.current.onReplayQueued?.(action),
        onPendingChange: (info) => optsRef.current.onPendingChange?.(info),
        onUndoState: (s) => optsRef.current.onUndoState?.(s),
        onError: (message) => optsRef.current.onError?.(message),
        onStatus: setStatus,
      });
      clientRef.current = client;
      client.start();
    };
    void start();
    return () => {
      cancelled = true;
      clientRef.current?.stop();
      clientRef.current = null;
      setStatus('closed');
    };
  }, [url, onlineId, userId]);

  return { clientRef, status };
}
