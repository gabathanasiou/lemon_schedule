import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useProject } from '../../store';
import { useDialog } from '../../components/Dialog';
import { useSupabaseAuth } from './auth';
import { isSupabaseConfigured } from './client';
import { getPresenceGridScope } from '../presenceResolvers';
import { applyPresenceScrollSample } from '../presenceScroll';
import { getLocalOverlayKind, subscribeLocalOverlays } from '../localOverlaySignal';
import { presenceDiagnostics, ProjectPresenceChannel, subscribeLocalSaves, type PresenceChannelStatus } from './presenceChannel';
import {
  acceptCursor,
  OVERLAY_TTL_MS,
  pointerFractions,
  pointerKindOf,
  presenceViewToPlace,
  resolveOverlayCues,
  screenFractions,
  type LocalOverlayKind,
  type PresenceAnchor,
  type PresenceOverlayState,
  type PresencePeer,
  type PresenceScrollSample,
  type PresenceView,
  type PresenceViewUpdate,
  type PointerKind,
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
  /** Broadcast our place (called from App on every navigation, and from the
   *  mounted surfaces when an in-page view switch changes). */
  publishView: (view: PresenceView | null) => void;
  /** Broadcast a scroll sample (throttled in the channel) — no-op without a
   *  channel, so surfaces can call it unconditionally. */
  publishScroll: (sample: PresenceScrollSample) => void;
  /** The local user changed the view with a click (navigation, the View
   *  menu, a Calendar sub-view/month jump, a Sheet flip) — exits follow.
   *  Scrolling NEVER does (user decision 2026-10-13): look around freely, the
   *  leader's next scroll re-syncs you. */
  noteUserViewChange: () => void;
  /** True while the project channel is running (stable, render-free check —
   *  surfaces skip their sampling work when presence is off). */
  isActive: () => boolean;
  follow: (userId: string) => void;
  stopFollowing: () => void;
  /** App + mounted surfaces register their follow appliers; returns the
   *  unregister. Every applier receives each distinct followed view. */
  registerFollowApplier: (fn: (view: PresenceView) => void) => () => void;
}

const EMPTY_STATE: PresenceStateValue = { peers: [], followingId: null, status: 'idle', active: false };
const EMPTY_ACTIONS: PresenceActionsValue = {
  publishView: () => {},
  publishScroll: () => {},
  noteUserViewChange: () => {},
  isActive: () => false,
  follow: () => {},
  stopFollowing: () => {},
  registerFollowApplier: () => () => {},
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
  // 4. Free pointer: viewport-relative fallback (rendered only while the peer
  //    is on the same place as us — see sameViewPlace in presence.ts).
  return { kind: 'screen', ...screenFractions(e.clientX, e.clientY, window.innerWidth, window.innerHeight) };
}

export function PresenceProvider({ children }: { children: React.ReactNode }) {
  const { projectList, currentProjectId, applyPeerSave, applyAccessPush, closeProject } = useProject();
  const dialog = useDialog();
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
  // App + mounted surfaces: every applier gets each distinct followed view
  // (App navigates; surfaces apply their in-page view switches).
  const appliersRef = useRef(new Set<(view: PresenceView) => void>());
  const lastAppliedFollowRef = useRef('');
  // `${userId}:${clientId}` → latest accepted cursor (stale ts dropped).
  const cursorMapRef = useRef(new Map<string, { userId: string; anchor: PresenceAnchor; pointer: PointerKind; ts: number }>());
  // `${userId}:${clientId}` → latest overlay signal (stale ts dropped). `at`
  // is the local RECEIPT time — TTL/ordering never compare sender clocks.
  const overlayMapRef = useRef(new Map<string, { userId: string; kind: PresenceOverlayState['kind']; ts: number; at: number }>());
  // Re-render when the newest overlay signal goes stale (TTL clear).
  const overlayExpiryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The last overlay kind this window published — redundant edge frames are
  // skipped (see the signal subscription below).
  const lastPublishedOverlayRef = useRef<LocalOverlayKind | null>(null);
  // `${userId}:${clientId}` → latest accepted scroll ts (stale drops).
  const scrollTsRef = useRef(new Map<string, number>());
  // `${userId}:${clientId}` → latest accepted view broadcast (stale drops).
  const viewMapRef = useRef(new Map<string, PresenceViewUpdate>());
  const clientId = useMemo(presenceClientId, []);
  const applyPeerSaveRef = useRef(applyPeerSave);
  applyPeerSaveRef.current = applyPeerSave;
  const applyAccessPushRef = useRef(applyAccessPush);
  applyAccessPushRef.current = applyAccessPush;
  const closeProjectRef = useRef(closeProject);
  closeProjectRef.current = closeProject;
  const dialogRef = useRef(dialog);
  dialogRef.current = dialog;

  const stopFollowing = useCallback(() => {
    followingRef.current = null;
    setFollowingId(null);
  }, []);
  const stopFollowingRef = useRef(stopFollowing);
  stopFollowingRef.current = stopFollowing;

  const clearPeers = useCallback(() => {
    cursorMapRef.current.clear();
    overlayMapRef.current.clear();
    if (overlayExpiryRef.current) {
      clearTimeout(overlayExpiryRef.current);
      overlayExpiryRef.current = null;
    }
    scrollTsRef.current.clear();
    viewMapRef.current.clear();
    peersRef.current = [];
    setPeers([]);
    setActive(false);
    setStatus('idle');
    followingRef.current = null;
    setFollowingId(null);
  }, []);

  /** Merge the presence list with the latest cursor + view + overlay per user
   *  (multi-window: one marker per person, newest window wins). */
  const rebuildPeers = useCallback((base: PresencePeer[]) => {
    const cursors = cursorMapRef.current;
    const overlays = overlayMapRef.current;
    const views = viewMapRef.current;
    const known = new Set(base.map(p => p.userId));
    for (const [key, c] of [...cursors]) if (!known.has(c.userId)) cursors.delete(key);
    for (const [key, o] of [...overlays]) if (!known.has(o.userId)) overlays.delete(key);
    for (const [key, v] of [...views]) if (!known.has(v.userId)) views.delete(key);
    const newestCursor = new Map<string, { anchor: PresenceAnchor; pointer: PointerKind; ts: number }>();
    for (const c of cursors.values()) {
      const prev = newestCursor.get(c.userId);
      if (!prev || c.ts > prev.ts) newestCursor.set(c.userId, { anchor: c.anchor, pointer: c.pointer, ts: c.ts });
    }
    // Newest VIEW per user: the presence meta's join-time snapshot vs the
    // latest `view` broadcast — both stamped by the same client's clock, so
    // comparing them is safe (a rejoin meta wins over older broadcasts).
    const newestView = new Map<string, { view: PresenceView | null; ts: number }>();
    for (const v of views.values()) {
      const prev = newestView.get(v.userId);
      if (!prev || v.ts > prev.ts) newestView.set(v.userId, { view: v.view, ts: v.ts });
    }
    const now = Date.now();
    const cues = resolveOverlayCues(overlays.values(), now);
    const next = base.map(p => {
      const c = newestCursor.get(p.userId);
      const v = newestView.get(p.userId);
      const view = v && v.ts >= p.ts ? v.view : p.view;
      return {
        ...p,
        view,
        pointer: c?.pointer ?? p.pointer,
        ...(c ? { cursor: c.anchor, cursorTs: c.ts } : {}),
        overlay: cues.get(p.userId) ?? null,
      };
    });
    presenceDiagnostics.cursorCount = next.filter(p => p.cursor).length;
    peersRef.current = next;
    setPeers(next);
    // An active cue must vanish when it goes stale (killed tab / paused
    // heartbeat) — schedule one re-render at the earliest expiry.
    if (overlayExpiryRef.current) {
      clearTimeout(overlayExpiryRef.current);
      overlayExpiryRef.current = null;
    }
    let soonest = Infinity;
    for (const o of overlays.values()) {
      if (!o.kind) continue;
      const expiry = o.at + OVERLAY_TTL_MS;
      if (expiry > now && expiry < soonest) soonest = expiry;
    }
    if (Number.isFinite(soonest)) {
      overlayExpiryRef.current = setTimeout(() => rebuildPeers(peersRef.current), Math.max(0, soonest - now) + 50);
    }
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
          cursorMapRef.current.set(key, { userId: cursor.userId, anchor: cursor.anchor, pointer: cursor.pointer, ts: cursor.ts });
          rebuildPeers(peersRef.current);
        },
        onOverlay: (state) => {
          const key = `${state.userId}:${state.clientId}`;
          const prev = overlayMapRef.current.get(key);
          // Equal timestamps are ACCEPTED (last write wins): a component with
          // two registrations releases them back-to-back, so a close edge can
          // share its millisecond with the redundant re-announce — dropping it
          // as "stale" left the cue stuck until the TTL (user report
          // 2026-10-15). The sender dedupes those frames too (belt and braces);
          // frames from one client arrive in send order.
          if (prev && state.ts < prev.ts) return;
          overlayMapRef.current.set(key, { userId: state.userId, kind: state.kind, ts: state.ts, at: Date.now() });
          rebuildPeers(peersRef.current);
        },
        onSavePing: (ping) => { void applyPeerSaveRef.current(ping.revision); },
        onScroll: (scroll) => {
          // Only a followed peer's scroll moves us; drop stale/duplicate
          // samples per client, then hand it to the mounted surface (if any).
          if (followingRef.current !== scroll.userId) return;
          const key = `${scroll.userId}:${scroll.clientId}`;
          const prev = scrollTsRef.current.get(key);
          if (prev != null && scroll.ts <= prev) return;
          scrollTsRef.current.set(key, scroll.ts);
          applyPresenceScrollSample(scroll);
        },
        onView: (update) => {
          const key = `${update.userId}:${update.clientId}`;
          const prev = viewMapRef.current.get(key);
          if (prev && update.ts <= prev.ts) return;
          viewMapRef.current.set(key, update);
          rebuildPeers(peersRef.current);
        },
        onAccess: (event) => {
          const previous = applyAccessPushRef.current(event.role);
          if (!event.role) {
            // Revoked: message first, then kicked out (project closes).
            void dialogRef.current
              .alert({ title: 'Access removed', message: 'You no longer have access to this shared project.' })
              .then(() => closeProjectRef.current());
            return;
          }
          if (event.role === 'viewer' && previous && previous !== 'viewer') {
            void dialogRef.current.alert({
              title: 'Your access changed',
              message: 'You have been moved to view only — you cannot make changes to this shared project.',
            });
          } else if (event.role !== 'viewer' && previous === 'viewer') {
            void dialogRef.current.alert({
              title: 'Your access changed',
              message: 'You can make changes again — edit access was restored.',
            });
          }
        },
        onStatus: (next) => setStatus(next),
      },
    );
    channelRef.current = channel;
    setActive(true);
    channel.start();
    // Late joiner: share the place we are already on.
    channel.publishView(viewRef.current);
    // …and the local-overlay cue if we are inside a menu/modal right now.
    const overlayKind = getLocalOverlayKind();
    if (overlayKind) {
      lastPublishedOverlayRef.current = overlayKind;
      channel.publishOverlay(overlayKind);
    }
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
  // Pointer events (not mouse events) also carry the input MODALITY
  // (roadmap 241) — a tap publishes the switch to touch even though no move
  // follows it.
  useEffect(() => {
    if (!active) return;
    const publish = (e: PointerEvent) => {
      channelRef.current?.publishCursor(resolvePointerAnchor(e), pointerKindOf(e.pointerType));
    };
    window.addEventListener('pointermove', publish, { passive: true, capture: true });
    window.addEventListener('pointerdown', publish, { passive: true, capture: true });
    return () => {
      window.removeEventListener('pointermove', publish, true);
      window.removeEventListener('pointerdown', publish, true);
    };
  }, [active]);

  // ---- local-overlay cue (roadmap 240) -------------------------------------
  // The shared primitives feed the app-level signal hub. Every EDGE publishes
  // the current kind (a close edge sends `null`); a change that re-announces
  // the SAME kind (a nested close falling back to its enclosing overlay) is
  // skipped — two frames in the same millisecond raced the close edge at the
  // receiver (the null was dropped as a same-ts stale and the dots stuck
  // until the TTL; user report 2026-10-15). Heartbeats always publish.
  // Inert without a channel (no shared project open).
  useEffect(() => subscribeLocalOverlays((reason) => {
    const kind = getLocalOverlayKind();
    if (reason === 'change' && kind === lastPublishedOverlayRef.current) return;
    lastPublishedOverlayRef.current = kind;
    channelRef.current?.publishOverlay(kind);
  }), []);

  // A stale cue must vanish even when the peer's window is gone; stop the
  // pending expiry timer when the provider unmounts.
  useEffect(() => () => {
    if (overlayExpiryRef.current) clearTimeout(overlayExpiryRef.current);
  }, []);

  // ---- S3.5: our successful online saves ride the channel -------------------
  useEffect(() => subscribeLocalSaves((revision) => {
    channelRef.current?.publishSave(revision);
  }), []);

  // ---- follow mode ---------------------------------------------------------
  // Applying a followed view is the registered appliers' job (App owns
  // navigation; mounted surfaces apply their in-page view switches). We only
  // keep the "who" and call every applier when their place changes.
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
    for (const apply of [...appliersRef.current]) apply(peer.view);
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
  const publishScroll = useCallback((sample: PresenceScrollSample) => {
    channelRef.current?.publishScroll(sample);
  }, []);
  const noteUserViewChange = useCallback(() => {
    if (followingRef.current) stopFollowingRef.current();
  }, []);
  const isActive = useCallback(() => channelRef.current != null, []);
  const follow = useCallback((userId: string) => {
    followingRef.current = userId;
    setFollowingId(userId);
  }, []);
  const registerFollowApplier = useCallback((fn: (view: PresenceView) => void) => {
    appliersRef.current.add(fn);
    return () => {
      appliersRef.current.delete(fn);
    };
  }, []);

  const actions = useMemo<PresenceActionsValue>(() => ({
    publishView,
    publishScroll,
    noteUserViewChange,
    isActive,
    follow,
    stopFollowing,
    registerFollowApplier,
  }), [publishView, publishScroll, noteUserViewChange, isActive, follow, stopFollowing, registerFollowApplier]);

  const state = useMemo<PresenceStateValue>(() => ({ peers, followingId, status, active }), [peers, followingId, status, active]);

  return (
    <PresenceActionsContext.Provider value={actions}>
      <PresenceStateContext.Provider value={state}>
        {children}
      </PresenceStateContext.Provider>
    </PresenceActionsContext.Provider>
  );
}
