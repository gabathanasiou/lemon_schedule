import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useProject } from '../../store';
import { useSupabaseAuth } from './auth';
import { isSupabaseConfigured } from './client';
import { getPresenceGridScope } from '../presenceResolvers';
import {
  acceptCursor,
  pointerFractions,
  presenceDiagnostics,
  ProjectPresenceChannel,
  presenceViewToPlace,
  screenFractions,
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
 *   re-rendering when cursor traffic arrives (~20/s per peer).
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
  follow: (userId: string) => void;
  stopFollowing: () => void;
  /** App registers the one function that applies a followed view. */
  registerFollowApplier: (fn: ((view: PresenceView) => void) | null) => void;
}

const EMPTY_STATE: PresenceStateValue = { peers: [], followingId: null, status: 'idle', active: false };
const EMPTY_ACTIONS: PresenceActionsValue = {
  publishView: () => {},
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

/** Any element that carries a shareable item anchor. */
const ITEM_SELECTOR = '[data-row-id], [data-date-key], [data-section], [data-day-sections]';

/** Build the element-based anchor for a pointer over `el` (null when `el`
 *  isn't over a shareable item). */
function elementAnchor(el: Element, clientX: number, clientY: number): PresenceAnchor | null {
  const row = el.closest('[data-row-id]');
  const rowId = row?.getAttribute('data-row-id');
  if (row && rowId && !rowId.startsWith('empty-')) {
    return { kind: 'row', rowId, ...pointerFractions(clientX, clientY, row.getBoundingClientRect()) };
  }
  const cell = el.closest('[data-date-key]');
  const date = cell?.getAttribute('data-date-key');
  if (cell && date) {
    return { kind: 'date', date, ...pointerFractions(clientX, clientY, cell.getBoundingClientRect()) };
  }
  const dayManager = el.closest('[data-day-manager]');
  if (dayManager) {
    const dayIndex = Number(dayManager.getAttribute('data-day-manager-day'));
    if (Number.isFinite(dayIndex)) {
      const sectionEl = el.closest('[data-section]') ?? el.closest('[data-day-sections]') ?? dayManager;
      const section = sectionEl.getAttribute('data-section') ?? undefined;
      return { kind: 'day', sectionIndex: dayIndex, section, ...pointerFractions(clientX, clientY, sectionEl.getBoundingClientRect()) };
    }
  }
  return null;
}

/** Nearest anchored item within ~40px — hovering a gutter/margin lands the
 *  pointer on the row/cell beside it instead of falling back to raw pixels. */
function nearestItemElement(x: number, y: number): Element | null {
  if (typeof document === 'undefined' || typeof document.elementFromPoint !== 'function') return null;
  for (const dy of [8, -8, 16, -16, 24, -24, 32, -32, 40, -40]) {
    for (const dx of [0, 12, -12]) {
      const el = document.elementFromPoint(x + dx, y + dy);
      if (!el) continue;
      const item = el.closest(ITEM_SELECTOR);
      if (item) return item;
    }
  }
  return null;
}

/** Resolve one pointer event into a shareable cursor anchor: a registered
 *  canvas-grid cell; else the semantic element under the cursor (row /
 *  calendar cell / Day Manager section); else the nearest item within ~40px;
 *  else the viewport-relative `screen` fallback so a cursor exists EVERYWHERE
 *  (headers, toolbars, dialogs, empty space). Popout windows have their own
 *  document/window — the main window's pointer is what the team shares
 *  (docs/COLLABORATION.md §9). */
function resolvePointerAnchor(e: MouseEvent): PresenceAnchor {
  const el = e.target as Element | null;
  if (el && typeof el.closest === 'function') {
    // 1. Canvas grids (Glide): the registered scope maps the pointer to a cell.
    const gridEl = el.closest('[data-presence-grid]');
    const scope = gridEl?.getAttribute('data-presence-grid');
    if (scope) {
      const hit = getPresenceGridScope(scope)?.probe(e.clientX, e.clientY);
      if (hit) return { kind: 'grid', scope, ...hit };
    }
    // 2. The shareable element under the pointer.
    const direct = elementAnchor(el, e.clientX, e.clientY);
    if (direct) return direct;
    // 3. Gutters/margins: snap to the nearest item (≤40px).
    const near = nearestItemElement(e.clientX, e.clientY);
    const snapped = near ? elementAnchor(near, e.clientX, e.clientY) : null;
    if (snapped) return snapped;
  }
  // 4. Free pointer: global chrome is shown to everyone; tab content only to
  //    peers on the same tab (approximate by design).
  const chrome = !!(el && typeof el.closest === 'function' && el.closest('header'));
  return { kind: 'screen', chrome, ...screenFractions(e.clientX, e.clientY, window.innerWidth, window.innerHeight) };
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
    presenceDiagnostics.cursorCount = next.filter(p => p.cursor).length;
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

  // ---- global live-pointer tracker -----------------------------------------
  // ONE listener for the whole app (no per-surface handlers that miss the
  // header/toolbars/dialogs): every pointer move publishes an anchor — the
  // semantic element under the cursor when there is one, else the
  // viewport-relative fallback. Throttling/idle-skip live in the channel.
  useEffect(() => {
    if (!active) return;
    const onMove = (e: MouseEvent) => {
      channelRef.current?.publishCursor(resolvePointerAnchor(e));
    };
    window.addEventListener('mousemove', onMove, { passive: true, capture: true });
    return () => window.removeEventListener('mousemove', onMove, true);
  }, [active]);

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
  const follow = useCallback((userId: string) => {
    followingRef.current = userId;
    setFollowingId(userId);
  }, []);
  const registerFollowApplier = useCallback((fn: ((view: PresenceView) => void) | null) => {
    applierRef.current = fn;
  }, []);

  const actions = useMemo<PresenceActionsValue>(() => ({
    publishView,
    follow,
    stopFollowing,
    registerFollowApplier,
  }), [publishView, follow, stopFollowing, registerFollowApplier]);

  const state = useMemo<PresenceStateValue>(() => ({ peers, followingId, status, active }), [peers, followingId, status, active]);

  return (
    <PresenceActionsContext.Provider value={actions}>
      <PresenceStateContext.Provider value={state}>
        {children}
      </PresenceStateContext.Provider>
    </PresenceActionsContext.Provider>
  );
}
