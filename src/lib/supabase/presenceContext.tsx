import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useProject } from '../../store';
import { useSupabaseAuth } from './auth';
import { isSupabaseConfigured } from './client';
import {
  acceptCursor,
  ProjectPresenceChannel,
  presenceViewToPlace,
  subscribeLocalSaves,
  type PresenceAnchor,
  type PresenceChannelStatus,
  type PresencePeer,
  type PresenceView,
} from './presence';

/**
 * Presence provider (roadmap 229 S3) — owns the ONE private channel for the
 * open shared project and the ephemeral peer state.
 *
 * Two contexts, deliberately split:
 * - `usePresenceActions()` is STABLE — the app shell, the stripboard, the
 *   calendar and the Day Manager publish their view/cursor through it without
 *   re-rendering when cursor traffic arrives (~10/s per peer).
 * - `usePresenceState()` changes with presence — only the small UI surfaces
 *   (header cluster, cursor overlay, follow pill) subscribe.
 *
 * Gating: no Supabase env, no signed-in account, or a local/Drive project ⇒
 * no channel, empty peers, everything invisible. Teardown stops the channel
 * (untrack + unsubscribe) on project close/sign-out.
 */
export interface PresenceStateValue {
  peers: PresencePeer[];
  /** The peer being followed (their view drives ours), or null. */
  followingId: string | null;
  status: PresenceChannelStatus;
  /** True while the project channel is running. */
  active: boolean;
}

export interface PresenceActionsValue {
  /** Broadcast our place (called from App on every navigation). */
  publishView: (view: PresenceView | null) => void;
  /** Broadcast a semantic cursor anchor (throttled + idle-skipped). */
  publishCursor: (anchor: PresenceAnchor | null) => void;
  follow: (userId: string) => void;
  stopFollowing: () => void;
  /** App registers the one function that applies a followed view. */
  registerFollowApplier: (fn: ((view: PresenceView) => void) | null) => void;
}

const EMPTY_STATE: PresenceStateValue = { peers: [], followingId: null, status: 'idle', active: false };
const EMPTY_ACTIONS: PresenceActionsValue = {
  publishView: () => {},
  publishCursor: () => {},
  follow: () => {},
  stopFollowing: () => {},
  registerFollowApplier: () => {},
};

const PresenceStateContext = createContext<PresenceStateValue>(EMPTY_STATE);
const PresenceActionsContext = createContext<PresenceActionsValue>(EMPTY_ACTIONS);

export function usePresenceState(): PresenceStateValue {
  return useContext(PresenceStateContext);
}

export function usePresenceActions(): PresenceActionsValue {
  return useContext(PresenceActionsContext);
}

/** Per-tab client id (sessionStorage): two windows of one user are two clients,
 *  deduped per user for bubbles/cursors (docs/COLLABORATION.md §9). */
function presenceClientId(): string {
  try {
    const key = 'lemon_presence_client_id';
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
    const id = crypto.randomUUID();
    sessionStorage.setItem(key, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

export function PresenceProvider({ children }: { children: React.ReactNode }) {
  const { projectList, currentProjectId, applyPeerSave } = useProject();
  const auth = useSupabaseAuth();
  const account = auth.account;

  const [peers, setPeers] = useState<PresencePeer[]>([]);
  const [followingId, setFollowingId] = useState<string | null>(null);
  const [status, setStatus] = useState<PresenceChannelStatus>('idle');
  const [active, setActive] = useState(false);

  const channelRef = useRef<ProjectPresenceChannel | null>(null);
  const peersRef = useRef<PresencePeer[]>([]);
  const followingRef = useRef<string | null>(null);
  const viewRef = useRef<PresenceView | null>(null);
  const applierRef = useRef<((view: PresenceView) => void) | null>(null);
  const lastAppliedFollowRef = useRef('');
  // `${userId}:${clientId}` → latest accepted cursor (stale ts dropped).
  const cursorMapRef = useRef(new Map<string, { userId: string; anchor: PresenceAnchor; ts: number }>());
  const clientId = useMemo(presenceClientId, []);
  const applyPeerSaveRef = useRef(applyPeerSave);
  applyPeerSaveRef.current = applyPeerSave;

  const stopFollowing = useCallback(() => {
    followingRef.current = null;
    setFollowingId(null);
  }, []);
  const stopFollowingRef = useRef(stopFollowing);
  stopFollowingRef.current = stopFollowing;

  const clearPeers = useCallback(() => {
    cursorMapRef.current.clear();
    peersRef.current = [];
    setPeers([]);
    setActive(false);
    setStatus('idle');
    followingRef.current = null;
    setFollowingId(null);
  }, []);

  /** Merge the presence list with the latest cursor per user (multi-window:
   *  one marker per person, newest window wins). */
  const rebuildPeers = useCallback((base: PresencePeer[]) => {
    const cursors = cursorMapRef.current;
    const known = new Set(base.map(p => p.userId));
    for (const [key, c] of [...cursors]) if (!known.has(c.userId)) cursors.delete(key);
    const newest = new Map<string, { anchor: PresenceAnchor; ts: number }>();
    for (const c of cursors.values()) {
      const prev = newest.get(c.userId);
      if (!prev || c.ts > prev.ts) newest.set(c.userId, { anchor: c.anchor, ts: c.ts });
    }
    const next = base.map(p => {
      const c = newest.get(p.userId);
      return c ? { ...p, cursor: c.anchor, cursorTs: c.ts } : p;
    });
    peersRef.current = next;
    setPeers(next);
  }, []);

  // ---- channel lifecycle (one private channel per open shared project) -----
  const onlineId = projectList.find(p => p.id === currentProjectId)?.onlineId ?? null;
  useEffect(() => {
    if (!isSupabaseConfigured || !onlineId || !account) {
      channelRef.current?.stop();
      channelRef.current = null;
      clearPeers();
      return;
    }
    const channel = new ProjectPresenceChannel(
      onlineId,
      {
        userId: account.id,
        name: account.name || account.email || 'Collaborator',
        avatarUrl: account.avatarUrl,
        isGuest: account.isAnonymous,
      },
      clientId,
      {
        onPeers: (next) => rebuildPeers(next),
        onCursor: (cursor) => {
          const key = `${cursor.userId}:${cursor.clientId}`;
          const prev = cursorMapRef.current.get(key);
          if (!acceptCursor(prev?.ts, cursor.ts)) return;
          cursorMapRef.current.set(key, { userId: cursor.userId, anchor: cursor.anchor, ts: cursor.ts });
          rebuildPeers(peersRef.current);
        },
        onSavePing: (ping) => { void applyPeerSaveRef.current(ping.revision); },
        onStatus: (next) => setStatus(next),
      },
    );
    channelRef.current = channel;
    setActive(true);
    channel.start();
    // Late joiner: share the place we are already on.
    channel.publishView(viewRef.current);
    return () => {
      channel.stop();
      if (channelRef.current === channel) channelRef.current = null;
      clearPeers();
    };
  }, [onlineId, account?.id, account?.name, account?.avatarUrl, account?.isAnonymous, clientId, rebuildPeers, clearPeers]);

  // ---- S3.5: our successful online saves ride the channel -------------------
  useEffect(() => subscribeLocalSaves((revision) => {
    channelRef.current?.publishSave(revision);
  }), []);

  // ---- follow mode ---------------------------------------------------------
  // Applying a followed view is App's job (it owns navigation); we only keep
  // the "who" and call the registered applier when their place changes.
  useEffect(() => {
    if (!followingId) {
      lastAppliedFollowRef.current = '';
      return;
    }
    const peer = peers.find(p => p.userId === followingId);
    if (!peer?.view) return;
    if (!presenceViewToPlace(peer.view)) return;
    const key = JSON.stringify(peer.view);
    if (key === lastAppliedFollowRef.current) return;
    lastAppliedFollowRef.current = key;
    applierRef.current?.(peer.view);
  }, [followingId, peers]);

  // A followed peer who leaves (presence gone for good) ends follow mode; the
  // grace window absorbs a reconnect blip rather than flashing out of follow.
  useEffect(() => {
    if (!followingId) return;
    if (peers.some(p => p.userId === followingId)) return;
    const timer = setTimeout(() => {
      if (followingRef.current === followingId && !peersRef.current.some(p => p.userId === followingId)) {
        followingRef.current = null;
        setFollowingId(null);
      }
    }, 5000);
    return () => clearTimeout(timer);
  }, [followingId, peers]);

  // Esc exits follow mode (any manual navigation exits too — App calls
  // stopFollowing from its one navigation entry point).
  useEffect(() => {
    if (!followingId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') stopFollowingRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [followingId]);

  // ---- stable action surface ----------------------------------------------
  const publishView = useCallback((view: PresenceView | null) => {
    viewRef.current = view;
    channelRef.current?.publishView(view);
  }, []);
  const publishCursor = useCallback((anchor: PresenceAnchor | null) => {
    channelRef.current?.publishCursor(anchor);
  }, []);
  const follow = useCallback((userId: string) => {
    followingRef.current = userId;
    setFollowingId(userId);
  }, []);
  const registerFollowApplier = useCallback((fn: ((view: PresenceView) => void) | null) => {
    applierRef.current = fn;
  }, []);

  const actions = useMemo<PresenceActionsValue>(() => ({
    publishView,
    publishCursor,
    follow,
    stopFollowing,
    registerFollowApplier,
  }), [publishView, publishCursor, follow, stopFollowing, registerFollowApplier]);

  const state = useMemo<PresenceStateValue>(() => ({ peers, followingId, status, active }), [peers, followingId, status, active]);

  return (
    <PresenceActionsContext.Provider value={actions}>
      <PresenceStateContext.Provider value={state}>
        {children}
      </PresenceStateContext.Provider>
    </PresenceActionsContext.Provider>
  );
}
