/**
 * React seam for the S4 room transport — mounts a `RoomClient` for the open
 * shared project and tears it down on project switch / sign-out.
 *
 * The callbacks are read through a ref, so the socket survives re-renders and
 * only reconnects when the TARGET changes (project, user, or the rooms URL).
 * The status is exposed for diagnostics; UI surfaces come later.
 */
import { useEffect, useRef, useState, type RefObject } from 'react';
import { RoomClient, type RoomRemote, type RoomStatus, type RoomWelcome } from './roomClient';

export interface UseRoomTransportOptions {
  /** The open project's Supabase row id; null = not a shared project. */
  onlineId: string | null;
  /** The signed-in user's id; null = signed out. */
  userId: string | null;
  getToken: (projectId: string) => Promise<string>;
  getInitProject: () => string | null;
  onWelcome: (welcome: RoomWelcome) => void;
  onRemote: (remote: RoomRemote) => void;
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

  const url = import.meta.env.VITE_ROOMS_URL as string | undefined;
  const { onlineId, userId } = opts;

  useEffect(() => {
    if (!url || !onlineId || !userId) {
      setStatus('closed');
      return;
    }
    const base = url.replace(/\/+$/, '');
    const client = new RoomClient({
      url: `${base}/room/${encodeURIComponent(onlineId)}`,
      projectId: onlineId,
      getToken: () => optsRef.current.getToken(onlineId),
      getInitProject: () => optsRef.current.getInitProject(),
      onWelcome: (welcome) => optsRef.current.onWelcome(welcome),
      onRemote: (remote) => optsRef.current.onRemote(remote),
      onUndoState: (s) => optsRef.current.onUndoState?.(s),
      onError: (message) => optsRef.current.onError?.(message),
      onStatus: setStatus,
    });
    clientRef.current = client;
    client.start();
    return () => {
      client.stop();
      clientRef.current = null;
      setStatus('closed');
    };
  }, [url, onlineId, userId]);

  return { clientRef, status };
}
