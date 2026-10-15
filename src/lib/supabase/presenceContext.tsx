import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useProject } from '../../store';
import { useDialog } from '../../components/Dialog';
import { useSupabaseAuth } from './auth';
import { isSupabaseConfigured } from './client';
import { resolvePointerAnchor } from '../presenceAnchors';
import { applyPresenceScrollSample } from '../presenceScroll';
import { getLocalOverlayKind, subscribeLocalOverlays } from '../localOverlaySignal';
import { presenceDiagnostics, ProjectPresenceChannel, subscribeLocalSaves, type PresenceChannelStatus } from './presenceChannel';
import {
  acceptCursor,
  DRAG_HEARTBEAT_MS,
  DRAG_TTL_MS,
  freezeCursorFor,
  heldItemsOf,
  OVERLAY_TTL_MS,
  pointerKindOf,
  presenceViewToPlace,
  resolveDragClaims,
  resolveOverlayCues,
  type DragSurface,
  type LocalOverlayKind,
  type PresenceAnchor,
  type PresenceDragState,
  type PresenceHeldItem,
  type PresenceOverlayState,
  type PresencePeer,
  type PresencePeerDrag,
  type PresencePeerSelection,
  type PresenceScrollSample,
  type PresenceSelection,
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
  /** Broadcast a selection (roadmap 234; a grid rectangle or a DOM surface's
   *  item list) — throttled/idle-skipped in the channel. Only the CURRENT
   *  owner (the surface that last held a non-empty selection) may clear it; a
   *  non-owner's clear is ignored so closing one window cannot wipe another
   *  window's live selection. */
  publishSelection: (owner: object, selection: PresenceSelection | null) => void;
  /** Release the selection ownership on blur/unmount — publishes the clear
   *  ONLY when `owner` is the current owner. */
  releaseSelection: (owner: object) => void;
  /** Announce a live drag claim (roadmap 235) — start/heartbeat/re-start all
   *  ride this; the provider owns the ~5s heartbeat. No-op without a channel,
   *  so surfaces can call it unconditionally. */
  publishDrag: (surface: DragSurface, itemIds: string[]) => void;
  /** Release the drag claim (drop/cancel/Esc/blur) — the END edge. */
  releaseDrag: () => void;
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
  /** The local window's latest pointer position (viewport coords) or null
   *  before the first event — the collision fade reads it (roadmap 244).
   *  Never leaves this window. */
  getLocalPointer: () => { x: number; y: number } | null;
  /** The LOCAL published view — what this window last broadcast (App place +
   *  the mounted surface's overrides). The pointer overlay's document gate
   *  compares a peer's view against it (roadmap 236); stable, ref-read, so
   *  nothing re-renders on navigation. */
  getLocalView: () => PresenceView | null;
}

const EMPTY_STATE: PresenceStateValue = { peers: [], followingId: null, status: 'idle', active: false };
const EMPTY_ACTIONS: PresenceActionsValue = {
  publishView: () => {},
  publishScroll: () => {},
  publishSelection: () => {},
  releaseSelection: () => {},
  publishDrag: () => {},
  releaseDrag: () => {},
  noteUserViewChange: () => {},
  isActive: () => false,
  follow: () => {},
  stopFollowing: () => {},
  registerFollowApplier: () => () => {},
  getLocalPointer: () => null,
  getLocalView: () => null,
};

const PresenceStateContext = createContext<PresenceStateValue>(EMPTY_STATE);
const PresenceActionsContext = createContext<PresenceActionsValue>(EMPTY_ACTIONS);
/**
 * Peer grid selections (roadmap 234) — a SEPARATE context: its value changes
 * only when a selection does, so the grid surfaces (which re-render with
 * `highlightRegions`) never subscribe to the ~12/s cursor feed.
 */
const PresenceSelectionsContext = createContext<PresencePeerSelection[]>([]);
/**
 * Peer drag claims (roadmap 235) — its own context for the same reason: the
 * value changes only on a claim edge (start/end/TTL), never on cursor or
 * heartbeat traffic.
 */
const PresenceDragsContext = createContext<PresencePeerDrag[]>([]);

export function usePresenceState(): PresenceStateValue {
  return useContext(PresenceStateContext);
}

export function usePresenceActions(): PresenceActionsValue {
  return useContext(PresenceActionsContext);
}

/** One entry per user who currently has a grid selection (newest window wins). */
export function usePresenceSelections(): PresencePeerSelection[] {
  return useContext(PresenceSelectionsContext);
}

/** One entry per user who is currently dragging (newest window wins, TTL). */
export function usePresenceDrags(): PresencePeerDrag[] {
  return useContext(PresenceDragsContext);
}

/** The item → holder map the surfaces share (roadmap 235): a held item renders
 *  "held" in its holder's colour and refuses every MOVE/REMOVE path. */
export function useHeldItems(): Map<string, PresenceHeldItem> {
  const drags = usePresenceDrags();
  return useMemo(() => heldItemsOf(drags), [drags]);
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
  const { projectList, currentProjectId, applyPeerSave, applyAccessPush, closeProject } = useProject();
  const dialog = useDialog();
  const auth = useSupabaseAuth();
  const account = auth.account;

  const [peers, setPeers] = useState<PresencePeer[]>([]);
  const [followingId, setFollowingId] = useState<string | null>(null);
  const [status, setStatus] = useState<PresenceChannelStatus>('idle');
  const [active, setActive] = useState(false);
  // Grid selections are kept in a ref + a VERSION counter so the value handed
  // to the grids changes only when a selection does (never on cursor traffic).
  const [selectionVersion, setSelectionVersion] = useState(0);
  // Same recipe for drag claims (roadmap 235) — claim edges are rare (start/
  // end/heartbeat), so the drag consumers never see cursor traffic either.
  const [dragVersion, setDragVersion] = useState(0);

  const channelRef = useRef<ProjectPresenceChannel | null>(null);
  const peersRef = useRef<PresencePeer[]>([]);
  const followingRef = useRef<string | null>(null);
  const viewRef = useRef<PresenceView | null>(null);
  // App + mounted surfaces: every applier gets each distinct followed view
  // (App navigates; surfaces apply their in-page view switches).
  const appliersRef = useRef(new Set<(view: PresenceView) => void>());
  const lastAppliedFollowRef = useRef('');
  // `${userId}:${clientId}` → latest accepted cursor (stale ts dropped). The
  // `drag` flag (roadmap 235) rides the frame; the ghost layer positions from
  // drag-flagged frames only.
  const cursorMapRef = useRef(new Map<string, { userId: string; anchor: PresenceAnchor; pointer: PointerKind; drag: boolean; ts: number }>());
  // The local pointer position (viewport coords; roadmap 244 collision fade).
  const localPointerRef = useRef<{ x: number; y: number } | null>(null);
  // `${userId}:${clientId}` → latest overlay signal (stale ts dropped). `at`
  // is the local RECEIPT time — TTL/ordering never compare sender clocks.
  const overlayMapRef = useRef(new Map<string, { userId: string; kind: PresenceOverlayState['kind']; ts: number; at: number }>());
  // `${userId}:${clientId}` → latest selection (roadmap 234; grid rectangle or
  // DOM-surface item list). Ordering by the sender's ts within one client; the
  // user-level newest wins on resolve.
  const selectionMapRef = useRef(new Map<string, { userId: string; selection: PresenceSelection | null; ts: number }>());
  // Who owns the local OUTGOING selection — the surface that last published a
  // non-empty one. Only the owner may clear (blur/unmount/deselect), so
  // closing a second window cannot wipe the first window's live selection.
  const selectionOwnerRef = useRef<{ owner: object; selection: PresenceSelection } | null>(null);
  // `${userId}:${clientId}` → latest drag claim (roadmap 235). Ordering by the
  // sender's ts within one client (newest window wins on resolve); `at` is the
  // local RECEIPT time and the TTL compares against it.
  const dragMapRef = useRef(new Map<string, { userId: string; surface: DragSurface | null; itemIds: string[]; ts: number; at: number }>());
  // The local OUTGOING drag claim — re-announced on a (re)join and re-sent by
  // the heartbeat; null between drags.
  const localDragRef = useRef<{ surface: DragSurface; itemIds: string[] } | null>(null);
  const dragHeartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Re-resolve the incoming claims when the soonest TTL expiry passes (a
  // killed tab must lose its lock without a release edge).
  const dragExpiryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    selectionMapRef.current.clear();
    selectionOwnerRef.current = null;
    setSelectionVersion(v => v + 1);
    dragMapRef.current.clear();
    setDragVersion(v => v + 1);
    if (overlayExpiryRef.current) {
      clearTimeout(overlayExpiryRef.current);
      overlayExpiryRef.current = null;
    }
    if (dragExpiryRef.current) {
      clearTimeout(dragExpiryRef.current);
      dragExpiryRef.current = null;
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

  /** (Re)arm the TTL re-resolve at the soonest incoming-claim expiry — a
   *  killed tab must lose its lock without a release edge (roadmap 235). */
  const armDragExpiry = useCallback(() => {
    if (dragExpiryRef.current) {
      clearTimeout(dragExpiryRef.current);
      dragExpiryRef.current = null;
    }
    const now = Date.now();
    let soonest = Infinity;
    for (const d of dragMapRef.current.values()) {
      if (!d.surface) continue;
      const expiry = d.at + DRAG_TTL_MS - now;
      if (expiry > 0 && expiry < soonest) soonest = expiry;
    }
    if (!Number.isFinite(soonest)) return;
    dragExpiryRef.current = setTimeout(() => {
      dragExpiryRef.current = null;
      const at = Date.now();
      let pruned = false;
      for (const [key, d] of [...dragMapRef.current]) {
        if (d.surface && at - d.at > DRAG_TTL_MS) {
          dragMapRef.current.delete(key);
          pruned = true;
        }
      }
      if (pruned) setDragVersion(v => v + 1);
      armDragExpiry();
    }, soonest + 50);
  }, []);
  const armDragExpiryRef = useRef(armDragExpiry);
  armDragExpiryRef.current = armDragExpiry;

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
    // Selections are pruned per CLIENT, not per user: a closed window must not
    // leave its selection behind while another window of the same user stays.
    const liveClients = new Set<string>();
    for (const p of base) for (const clientId of p.clientIds) liveClients.add(`${p.userId}:${clientId}`);
    let selectionPruned = false;
    for (const key of [...selectionMapRef.current.keys()]) {
      if (!liveClients.has(key)) {
        selectionMapRef.current.delete(key);
        selectionPruned = true;
      }
    }
    if (selectionPruned) setSelectionVersion(v => v + 1);
    // Drag claims prune per client for the same reason.
    let dragPruned = false;
    for (const key of [...dragMapRef.current.keys()]) {
      if (!liveClients.has(key)) {
        dragMapRef.current.delete(key);
        dragPruned = true;
      }
    }
    if (dragPruned) setDragVersion(v => v + 1);
    const newestCursor = new Map<string, { anchor: PresenceAnchor; pointer: PointerKind; drag: boolean; ts: number }>();
    for (const c of cursors.values()) {
      const prev = newestCursor.get(c.userId);
      if (!prev || c.ts > prev.ts) newestCursor.set(c.userId, { anchor: c.anchor, pointer: c.pointer, drag: c.drag, ts: c.ts });
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
        cursorDrag: c?.drag ?? false,
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
          // Roadmap 244: while this user's newest overlay cue is fresh (menu,
          // dropdown, context menu or modal) their pointer is FROZEN — frames
          // are not applied (everything they aim at now lives on a surface we
          // cannot see).
          if (freezeCursorFor(overlayMapRef.current.values(), cursor.userId, Date.now())) return;
          cursorMapRef.current.set(key, { userId: cursor.userId, anchor: cursor.anchor, pointer: cursor.pointer, drag: cursor.drag === true, ts: cursor.ts });
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
        onSelection: (update) => {
          const key = `${update.userId}:${update.clientId}`;
          const prev = selectionMapRef.current.get(key);
          // Equal timestamps accepted (last write wins), frames per client
          // arrive in send order — the same recipe as the overlay cue.
          if (prev && update.ts < prev.ts) return;
          selectionMapRef.current.set(key, { userId: update.userId, selection: update.selection, ts: update.ts });
          setSelectionVersion(v => v + 1);
        },
        onDrag: (state) => {
          const key = `${state.userId}:${state.clientId}`;
          const prev = dragMapRef.current.get(key);
          // Same last-write-wins recipe as the overlay cue: equal timestamps
          // are accepted so a release edge sharing a millisecond with a
          // redundant re-announce is never dropped as stale.
          if (prev && state.ts < prev.ts) return;
          dragMapRef.current.set(key, { userId: state.userId, surface: state.surface, itemIds: state.itemIds, ts: state.ts, at: Date.now() });
          setDragVersion(v => v + 1);
          armDragExpiryRef.current();
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
    // …and our live grid selection, if a grid is holding one (late joiner).
    if (selectionOwnerRef.current) {
      channel.publishSelection(selectionOwnerRef.current.selection);
    }
    // …and our live drag claim, if a drag survived a channel restart.
    if (localDragRef.current) {
      channel.publishDrag(localDragRef.current.surface, localDragRef.current.itemIds);
    }
    return () => {
      channel.stop();
      if (channelRef.current === channel) channelRef.current = null;
      if (dragHeartbeatRef.current) {
        clearInterval(dragHeartbeatRef.current);
        dragHeartbeatRef.current = null;
      }
      localDragRef.current = null;
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
  // follows it. The same listener records the local position for the overlay's
  // collision fade (roadmap 244) — and pauses PUBLISHING while the local hub
  // reports ANY local overlay (menu, dropdown, context menu, modal — user
  // decision 2026-10-15): traffic while the pointer is over a surface nobody
  // else can see is noise, and the receiver-side freeze is the fallback for
  // multi-window cases.
  useEffect(() => {
    if (!active) return;
    const track = (e: PointerEvent) => {
      localPointerRef.current = { x: e.clientX, y: e.clientY };
      if (getLocalOverlayKind() !== null) return;
      channelRef.current?.publishCursor(resolvePointerAnchor(e.clientX, e.clientY, e.target as Element | null), pointerKindOf(e.pointerType));
    };
    window.addEventListener('pointermove', track, { passive: true, capture: true });
    window.addEventListener('pointerdown', track, { passive: true, capture: true });
    return () => {
      window.removeEventListener('pointermove', track, true);
      window.removeEventListener('pointerdown', track, true);
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

  // ---- local drag claims (roadmap 235) --------------------------------------
  // The provider owns the claim's lifecycle: a ~5s heartbeat while an item is
  // held (so a dropped START frame still locks within a heartbeat, and a
  // killed tab loses the lock via the receiver's TTL) and a RELEASE on blur /
  // hidden document — the local drag cannot survive either.
  useEffect(() => () => {
    if (dragExpiryRef.current) clearTimeout(dragExpiryRef.current);
    if (dragHeartbeatRef.current) clearInterval(dragHeartbeatRef.current);
  }, []);

  useEffect(() => {
    const release = () => {
      if (!localDragRef.current) return;
      channelRef.current?.publishDrag(null, []);
      localDragRef.current = null;
      if (dragHeartbeatRef.current) {
        clearInterval(dragHeartbeatRef.current);
        dragHeartbeatRef.current = null;
      }
    };
    const onVisibility = () => {
      if (document.hidden) release();
    };
    window.addEventListener('blur', release);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('blur', release);
      document.removeEventListener('visibilitychange', onVisibility);
    };
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
  const publishSelection = useCallback((owner: object, selection: PresenceSelection | null) => {
    if (selection) {
      selectionOwnerRef.current = { owner, selection };
      channelRef.current?.publishSelection(selection);
      return;
    }
    // A clear only counts from the owner — a second window closing must not
    // wipe the selection the first window is still holding.
    if (selectionOwnerRef.current?.owner !== owner) return;
    selectionOwnerRef.current = null;
    channelRef.current?.publishSelection(null);
  }, []);
  const releaseSelection = useCallback((owner: object) => {
    if (selectionOwnerRef.current?.owner !== owner) return;
    selectionOwnerRef.current = null;
    channelRef.current?.publishSelection(null);
  }, []);
  /** Start / re-announce a local drag claim (roadmap 235). The heartbeat is
   *  the provider's job; the surface only reports start and release. */
  const publishDrag = useCallback((surface: DragSurface, itemIds: string[]) => {
    if (dragHeartbeatRef.current) {
      clearInterval(dragHeartbeatRef.current);
      dragHeartbeatRef.current = null;
    }
    localDragRef.current = { surface, itemIds };
    channelRef.current?.publishDrag(surface, itemIds);
    dragHeartbeatRef.current = setInterval(() => {
      const current = localDragRef.current;
      if (current) channelRef.current?.publishDrag(current.surface, current.itemIds);
    }, DRAG_HEARTBEAT_MS);
  }, []);
  const releaseDrag = useCallback(() => {
    if (dragHeartbeatRef.current) {
      clearInterval(dragHeartbeatRef.current);
      dragHeartbeatRef.current = null;
    }
    if (!localDragRef.current) return;
    localDragRef.current = null;
    channelRef.current?.publishDrag(null, []);
  }, []);
  const noteUserViewChange = useCallback(() => {
    if (followingRef.current) stopFollowingRef.current();
  }, []);
  const isActive = useCallback(() => channelRef.current != null, []);
  const getLocalPointer = useCallback(() => localPointerRef.current, []);
  const getLocalView = useCallback(() => viewRef.current, []);
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
    publishSelection,
    releaseSelection,
    publishDrag,
    releaseDrag,
    noteUserViewChange,
    isActive,
    follow,
    stopFollowing,
    registerFollowApplier,
    getLocalPointer,
    getLocalView,
  }), [publishView, publishScroll, publishSelection, releaseSelection, publishDrag, releaseDrag, noteUserViewChange, isActive, follow, stopFollowing, registerFollowApplier, getLocalPointer, getLocalView]);

  // Newest selection per user (multi-window: newest window wins), self
  // excluded, clears already dropped. Only re-derived when a selection changed.
  const peerSelections = useMemo<PresencePeerSelection[]>(() => {
    const newest = new Map<string, { selection: PresenceSelection | null; ts: number }>();
    for (const s of selectionMapRef.current.values()) {
      const prev = newest.get(s.userId);
      if (!prev || s.ts >= prev.ts) newest.set(s.userId, { selection: s.selection, ts: s.ts });
    }
    const out: PresencePeerSelection[] = [];
    for (const [userId, s] of newest) {
      if (s.selection) out.push({ userId, selection: s.selection });
    }
    return out;
    // The version counter is the change signal (the map itself is a ref).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionVersion]);

  // Live drag claims (newest window wins, TTL handled by resolveDragClaims).
  // The signature keeps the array identity stable across heartbeats and
  // cursor traffic — subscribers re-render on claim EDGES only (roadmap 235).
  const dragsSignatureRef = useRef('');
  const dragsCacheRef = useRef<PresencePeerDrag[]>([]);
  const peerDrags = useMemo<PresencePeerDrag[]>(() => {
    const claims = resolveDragClaims(dragMapRef.current.values(), Date.now());
    const names = new Map(peersRef.current.map(p => [p.userId, p.name]));
    const out: PresencePeerDrag[] = [];
    for (const [userId, claim] of claims) {
      out.push({ userId, name: names.get(userId) ?? 'Someone', surface: claim.surface, itemIds: claim.itemIds });
    }
    const signature = out.map(d => `${d.userId}|${d.name}|${d.surface}|${d.itemIds.join(',')}`).sort().join('§');
    if (signature !== dragsSignatureRef.current) {
      dragsSignatureRef.current = signature;
      dragsCacheRef.current = out;
    }
    return dragsCacheRef.current;
    // The version counter is the change signal (the map itself is a ref).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragVersion]);

  const state = useMemo<PresenceStateValue>(() => ({ peers, followingId, status, active }), [peers, followingId, status, active]);

  return (
    <PresenceActionsContext.Provider value={actions}>
      <PresenceStateContext.Provider value={state}>
        <PresenceSelectionsContext.Provider value={peerSelections}>
          <PresenceDragsContext.Provider value={peerDrags}>
            {children}
          </PresenceDragsContext.Provider>
        </PresenceSelectionsContext.Provider>
      </PresenceStateContext.Provider>
    </PresenceActionsContext.Provider>
  );
}
