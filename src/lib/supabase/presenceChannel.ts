import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './client';
import {
  anchorKey,
  createThrottle,
  MAX_DRAG_ITEMS,
  mergePeers,
  parseAccessPayload,
  parseCursorPayload,
  parseDragPayload,
  parseOverlayPayload,
  parseSavePayload,
  parseScrollPayload,
  parseSelectionPayload,
  parseViewPayload,
  presenceTopic,
  selectionKey,
  type DragSurface,
  type LocalOverlayKind,
  type PointerKind,
  type PresenceAccessEvent,
  type PresenceAnchor,
  type PresenceCursor,
  type PresenceDragState,
  type PresenceGridSelection,
  type PresenceMeta,
  type PresenceOverlayState,
  type PresencePeer,
  type PresenceSavePing,
  type PresenceScroll,
  type PresenceScrollSample,
  type PresenceSelectionUpdate,
  type PresenceView,
  type PresenceViewUpdate,
  type Throttle,
} from './presence';

/**
 * The ONE Realtime channel for the open shared project (roadmap 229 S3) — the
 * transport half of the presence module. Manual: docs/COLLABORATION.md §6/§9.
 *
 * `presence.ts` owns the wire shapes + pure logic; this module owns the
 * Supabase-touching side: the channel class, its diagnostics snapshot and the
 * local save bus the store feeds (S3.5).
 *
 * Transport split (user bug 2026-10-12 — channels kept dying):
 * - Presence `track()` = identity + a view snapshot, sent ONLY on (re)join
 *   (Supabase caps presence calls at 5 per client per 30s; exceeding it
 *   closes the channel).
 * - Everything fast is a broadcast: `view` (place/scene/switches, ~7/s cap),
 *   `cursor` (~12/s), `scroll` (~5/s), `save` (per save). A peer's view on
 *   the receiver = newest of the meta snapshot vs the latest broadcast.
 * - On a peer's presence `join`, answer once with our view so new joiners
 *   see where everyone is without waiting for their next move (debounced).
 */

// ---------------------------------------------------------------------------
// Local save bus (store → presence, S3.5)
// ---------------------------------------------------------------------------

type LocalSaveListener = (revision: number) => void;
const localSaveListeners = new Set<LocalSaveListener>();

/** Called by the store after a successful online save of the open project —
 *  the presence layer turns it into a broadcast save ping. */
export function notifyLocalSave(revision: number): void {
  for (const cb of [...localSaveListeners]) {
    try {
      cb(revision);
    } catch {
      // listener errors must not break the save pipeline
    }
  }
}

export function subscribeLocalSaves(cb: LocalSaveListener): () => void {
  localSaveListeners.add(cb);
  return () => {
    localSaveListeners.delete(cb);
  };
}

// ---------------------------------------------------------------------------
// Diagnostics (module-level snapshot — read by the store's debug bridge)
// ---------------------------------------------------------------------------

export type PresenceChannelStatus = 'idle' | 'connecting' | 'connected' | 'error';

export interface PresenceDiagnostics {
  active: boolean;
  topic: string | null;
  status: PresenceChannelStatus;
  peerCount: number;
  /** Peers currently rendering a live pointer. */
  cursorCount: number;
  /** Last successful cursor send (ms epoch, 0 = none). */
  lastCursorAt: number;
  /** Input modality of the last cursor we published (roadmap 241). */
  cursorPointer: PointerKind | null;
  /** The local-overlay cue this window is announcing (roadmap 240). */
  localOverlay: LocalOverlayKind | null;
  /** The grid selection this window last PUBLISHED, as its wire key (`scope|…`),
   *  or null when it holds none (roadmap 234). */
  localSelection: string | null;
  /** The drag claim this window is announcing (roadmap 235), or null. */
  localDrag: DragSurface | null;
  /** Last cursor payload received from a peer (0 = none). */
  lastCursorRecvAt: number;
  /** Last view payload received from a peer (0 = none). */
  lastViewRecvAt: number;
  /** Last overlay signal received from a peer (0 = none). */
  lastOverlayRecvAt: number;
  /** Last grid-selection update received from a peer (0 = none, roadmap 234). */
  lastSelectionRecvAt: number;
  /** Last drag signal received from a peer (0 = none, roadmap 235). */
  lastDragRecvAt: number;
  /** Presence `track()` calls made by this channel — must stay ≤5 per 30s
   *  (Supabase caps presence calls per client; past it the channel is
   *  shut down). One per (re)join by design. */
  trackCount: number;
  error: string | null;
}

export const presenceDiagnostics: PresenceDiagnostics = {
  active: false,
  topic: null,
  status: 'idle',
  peerCount: 0,
  cursorCount: 0,
  lastCursorAt: 0,
  cursorPointer: null,
  localOverlay: null,
  localSelection: null,
  localDrag: null,
  lastCursorRecvAt: 0,
  lastViewRecvAt: 0,
  lastOverlayRecvAt: 0,
  lastSelectionRecvAt: 0,
  lastDragRecvAt: 0,
  trackCount: 0,
  error: null,
};

export function getPresenceDiagnostics(): PresenceDiagnostics {
  return { ...presenceDiagnostics };
}

// ---------------------------------------------------------------------------
// Channel manager
// ---------------------------------------------------------------------------

export interface PresenceIdentity {
  userId: string;
  name: string;
  avatarUrl: string | null;
  isGuest: boolean;
}

export interface PresenceChannelHandlers {
  onPeers: (peers: PresencePeer[]) => void;
  onCursor: (cursor: PresenceCursor) => void;
  onSavePing: (ping: PresenceSavePing) => void;
  /** A followed peer's scroll sample (follow completeness). */
  onScroll: (scroll: PresenceScroll) => void;
  /** A peer's view update (rides a broadcast — presence `track` is limited). */
  onView: (update: PresenceViewUpdate) => void;
  /** A peer's local-overlay cue edge/heartbeat (roadmap 240). */
  onOverlay: (state: PresenceOverlayState) => void;
  /** A peer's grid-selection update — `selection: null` clears (roadmap 234). */
  onSelection: (update: PresenceSelectionUpdate) => void;
  /** A peer's drag claim — `surface: null` releases (roadmap 235). */
  onDrag: (state: PresenceDragState) => void;
  /** Access-change event addressed to THIS user (role change or revocation). */
  onAccess: (event: PresenceAccessEvent) => void;
  onStatus: (status: PresenceChannelStatus) => void;
}

const CURSOR_EVENT = 'cursor';
const DRAG_EVENT = 'drag';
const OVERLAY_EVENT = 'overlay';
const SAVE_EVENT = 'save';
const SCROLL_EVENT = 'scroll';
const SELECTION_EVENT = 'selection';
const VIEW_EVENT = 'view';
const ACCESS_EVENT = 'access';

/**
 * ONE private Realtime channel for the open shared project. Start/stop is
 * idempotent; `stop()` unsubscribes and untracks so peers see the leave
 * immediately (no ghost bubbles).
 */
export class ProjectPresenceChannel {
  private channel: RealtimeChannel | null = null;
  private throttle: Throttle<PresenceCursor> | null = null;
  private scrollThrottle: Throttle<PresenceScrollSample> | null = null;
  private viewThrottle: Throttle<PresenceView | null> | null = null;
  private selectionThrottle: Throttle<PresenceGridSelection | null> | null = null;
  private lastAnchorKey = '';
  private lastAnchor: PresenceAnchor | null = null;
  private lastPointerKind: PointerKind | null = null;
  /** The drag flag of the last cursor frame we actually SENT — the claim's
   *  START/END edges flip it and force one frame (roadmap 235). */
  private lastCursorDrag = false;
  /** True while this window is announcing a live drag claim. */
  private dragActive = false;
  private lastScrollKey = '';
  private lastViewKey = '';
  private lastSelectionKey = '';
  private lastView: PresenceView | null = null;
  private viewPublished = false;
  private lastJoinAnswerAt = 0;
  private lastMeta: PresenceMeta | null = null;
  private stopped = false;

  constructor(
    private readonly projectId: string,
    private readonly identity: PresenceIdentity,
    private readonly clientId: string,
    private readonly handlers: PresenceChannelHandlers,
  ) {}

  start(): void {
    if (!supabase || this.channel) return;
    this.stopped = false;
    const topic = presenceTopic(this.projectId);
    presenceDiagnostics.active = true;
    presenceDiagnostics.topic = topic;
    presenceDiagnostics.status = 'connecting';
    presenceDiagnostics.error = null;
    this.handlers.onStatus('connecting');

    this.throttle = createThrottle<PresenceCursor>((cursor) => {
      void this.channel?.send({ type: 'broadcast', event: CURSOR_EVENT, payload: cursor });
      presenceDiagnostics.lastCursorAt = cursor.ts;
    }, 80); // ~12/s — smooth Canva-style gliding within the free-tier message budget

    this.scrollThrottle = createThrottle<PresenceScrollSample>((sample) => {
      const payload: PresenceScroll = { ...sample, userId: this.identity.userId, clientId: this.clientId, ts: Date.now() };
      void this.channel?.send({ type: 'broadcast', event: SCROLL_EVENT, payload });
    }, 200); // ~5/s — scroll mirroring reads smooth without a flood

    // Views ride this throttled broadcast, never `track()`: presence calls are
    // limited to 5 per client per 30s (Supabase free tier) and exceeding them
    // shuts the channel down (`ClientPresenceRateLimitReached`).
    this.viewThrottle = createThrottle<PresenceView | null>((view) => {
      const payload: PresenceViewUpdate = { userId: this.identity.userId, clientId: this.clientId, view, ts: Date.now() };
      void this.channel?.send({ type: 'broadcast', event: VIEW_EVENT, payload });
    }, 150);

    // Grid selections (roadmap 234) change at user pace, far slower than
    // cursors — the same throttle/coalesce recipe keeps a drag-select to a few
    // messages per second. A clear (`null`) always rides the newest frame.
    this.selectionThrottle = createThrottle<PresenceGridSelection | null>((selection) => {
      const payload: PresenceSelectionUpdate = { userId: this.identity.userId, clientId: this.clientId, selection, ts: Date.now() };
      void this.channel?.send({ type: 'broadcast', event: SELECTION_EVENT, payload });
    }, 150);

    const channel = supabase.channel(topic, {
      config: { private: true, presence: { key: this.identity.userId, enabled: true } },
    });
    this.channel = channel;

    channel
      .on('presence', { event: 'sync' }, () => {
        if (this.stopped) return;
        this.emitPeers();
      })
      .on('presence', { event: 'join' }, (payload) => {
        if (this.stopped) return;
        // Someone new joined: they missed our views (tracks only happen on
        // join). Answer with ours once — debounced so a join burst is not a
        // broadcast storm.
        if (payload?.key === this.identity.userId) return;
        const now = Date.now();
        if (now - this.lastJoinAnswerAt < 1000) return;
        this.lastJoinAnswerAt = now;
        this.broadcastViewNow();
      })
      .on('broadcast', { event: CURSOR_EVENT }, ({ payload }) => {
        if (this.stopped) return;
        const cursor = parseCursorPayload(payload);
        if (cursor && cursor.userId !== this.identity.userId) {
          presenceDiagnostics.lastCursorRecvAt = Date.now();
          this.handlers.onCursor(cursor);
        }
      })
      .on('broadcast', { event: OVERLAY_EVENT }, ({ payload }) => {
        if (this.stopped) return;
        const state = parseOverlayPayload(payload);
        if (state && state.userId !== this.identity.userId) {
          presenceDiagnostics.lastOverlayRecvAt = Date.now();
          this.handlers.onOverlay(state);
        }
      })
      .on('broadcast', { event: SELECTION_EVENT }, ({ payload }) => {
        if (this.stopped) return;
        const update = parseSelectionPayload(payload);
        if (update && update.userId !== this.identity.userId) {
          presenceDiagnostics.lastSelectionRecvAt = Date.now();
          this.handlers.onSelection(update);
        }
      })
      .on('broadcast', { event: DRAG_EVENT }, ({ payload }) => {
        if (this.stopped) return;
        const state = parseDragPayload(payload);
        if (state && state.userId !== this.identity.userId) {
          presenceDiagnostics.lastDragRecvAt = Date.now();
          this.handlers.onDrag(state);
        }
      })
      .on('broadcast', { event: SAVE_EVENT }, ({ payload }) => {
        if (this.stopped) return;
        const ping = parseSavePayload(payload);
        if (ping && ping.userId !== this.identity.userId) this.handlers.onSavePing(ping);
      })
      .on('broadcast', { event: SCROLL_EVENT }, ({ payload }) => {
        if (this.stopped) return;
        const scroll = parseScrollPayload(payload);
        if (scroll && scroll.userId !== this.identity.userId) this.handlers.onScroll(scroll);
      })
      .on('broadcast', { event: VIEW_EVENT }, ({ payload }) => {
        if (this.stopped) return;
        const update = parseViewPayload(payload);
        if (update && update.userId !== this.identity.userId) {
          presenceDiagnostics.lastViewRecvAt = Date.now();
          this.handlers.onView(update);
        }
      })
      .on('broadcast', { event: ACCESS_EVENT }, ({ payload }) => {
        if (this.stopped) return;
        const event = parseAccessPayload(payload);
        // Only act on events addressed to THIS user (a role change for a
        // colleague is not our business).
        if (event && event.userId === this.identity.userId) this.handlers.onAccess(event);
      })
      .subscribe((status, err) => {
        if (this.stopped) return;
        if (status === 'SUBSCRIBED') {
          presenceDiagnostics.status = 'connected';
          this.handlers.onStatus('connected');
          // ONE track per (re)join — the meta carries identity + the view
          // snapshot for late joiners (presence calls are capped at 5 per
          // client per 30s; navigation never tracks).
          if (this.lastMeta) {
            presenceDiagnostics.trackCount += 1;
            void this.channel?.track(this.lastMeta);
          }
          // Peers already on the channel won't see another track from us —
          // make sure they get our current view, then pick up theirs.
          this.broadcastViewNow();
          this.emitPeers();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          presenceDiagnostics.status = 'error';
          presenceDiagnostics.error = err?.message ?? status;
          this.handlers.onStatus('error');
        } else if (status === 'CLOSED') {
          presenceDiagnostics.status = 'connecting';
          this.handlers.onStatus('connecting');
        }
      });
  }

  private buildMeta(view: PresenceView | null): PresenceMeta {
    return {
      userId: this.identity.userId,
      clientId: this.clientId,
      name: this.identity.name,
      avatarUrl: this.identity.avatarUrl,
      isGuest: this.identity.isGuest,
      view,
      ts: Date.now(),
    };
  }

  private emitPeers(): void {
    const state = (this.channel?.presenceState() ?? {}) as Record<string, unknown[]>;
    const peers = mergePeers(state, this.identity.userId);
    presenceDiagnostics.peerCount = peers.length;
    this.handlers.onPeers(peers);
  }

  /** Broadcast our place/state. Rides the throttled `view` event (with an
   *  idle skip) — NEVER `track()`, which is capped at 5 calls per client per
   *  30s and shuts the channel down past it. The meta snapshot is kept fresh
   *  for the next (re)join track. */
  publishView(view: PresenceView | null): void {
    this.lastView = view;
    this.viewPublished = true;
    this.lastMeta = this.buildMeta(view);
    const key = JSON.stringify(view ?? null);
    if (key === this.lastViewKey) return;
    this.lastViewKey = key;
    this.viewThrottle?.emit(view);
  }

  /** Send our current view right now (join paths — bypasses the idle skip). */
  private broadcastViewNow(): void {
    if (!this.viewPublished) return;
    const payload: PresenceViewUpdate = {
      userId: this.identity.userId,
      clientId: this.clientId,
      view: this.lastView,
      ts: Date.now(),
    };
    void this.channel?.send({ type: 'broadcast', event: VIEW_EVENT, payload });
  }

  /** Broadcast our cursor anchor + input modality; skipped when BOTH are
   *  unchanged (idle) and throttled to ~20/s with coalescing. A change of the
   *  input kind alone re-sends (the glyph must follow a modality switch); the
   *  drag flag (roadmap 235) is part of the idle key too, so a claim's
   *  START/END edge reaches peers as one extra frame carrying the CURRENT
   *  anchor — the position stream itself needs no new messages. */
  publishCursor(anchor: PresenceAnchor | null, pointer: PointerKind = 'mouse'): void {
    this.lastAnchor = anchor;
    const key = anchorKey(anchor);
    if (!key) return;
    const drag = this.dragActive;
    if (key === this.lastAnchorKey && pointer === this.lastPointerKind && drag === this.lastCursorDrag) return;
    this.lastAnchorKey = key;
    this.lastPointerKind = pointer;
    this.lastCursorDrag = drag;
    presenceDiagnostics.cursorPointer = pointer;
    this.sendCursor(anchor!, pointer, drag);
  }

  /** Roadmap 235: the claim's START/END edges flip the drag flag with no
   *  pointer event of their own — push one frame so peers can position the
   *  ghost immediately (start) and stop carrying it (end). */
  private republishCursorDragFlag(): void {
    const anchor = this.lastAnchor;
    if (!anchor || !this.lastAnchorKey || this.dragActive === this.lastCursorDrag) return;
    this.lastCursorDrag = this.dragActive;
    this.sendCursor(anchor, this.lastPointerKind ?? 'mouse', this.dragActive);
  }

  private sendCursor(anchor: PresenceAnchor, pointer: PointerKind, drag: boolean): void {
    this.throttle?.emit({
      userId: this.identity.userId,
      clientId: this.clientId,
      anchor,
      pointer,
      ...(drag ? { drag: true as const } : {}),
      ts: Date.now(),
    });
  }

  /** Roadmap 235: announce a live drag claim (`surface: null` = the RELEASE
   *  edge). The sender owns the cadence — START/END edges + a ~5s heartbeat —
   *  so this always sends when called, exactly like the overlay cue. The
   *  item-id list is capped; position rides the cursor frames above. */
  publishDrag(surface: DragSurface | null, itemIds: string[]): void {
    const changed = (surface !== null) !== this.dragActive;
    this.dragActive = surface !== null;
    presenceDiagnostics.localDrag = surface;
    void this.channel?.send({
      type: 'broadcast',
      event: DRAG_EVENT,
      payload: {
        userId: this.identity.userId,
        clientId: this.clientId,
        surface,
        itemIds: surface ? itemIds.slice(0, MAX_DRAG_ITEMS) : [],
        ts: Date.now(),
      } satisfies PresenceDragState,
    });
    if (changed) this.republishCursorDragFlag();
  }

  /** Roadmap 240: announce the local-overlay cue (an open/close edge, or the
   *  heartbeat re-announce) — the sender owns the cadence, so this always
   *  sends when called. */
  publishOverlay(kind: LocalOverlayKind | null): void {
    presenceDiagnostics.localOverlay = kind;
    void this.channel?.send({
      type: 'broadcast',
      event: OVERLAY_EVENT,
      payload: { userId: this.identity.userId, clientId: this.clientId, kind, ts: Date.now() } satisfies PresenceOverlayState,
    });
  }

  /** Broadcast a scroll sample (~8/s with coalescing); skipped when the
   *  quantized position is unchanged (idle). */
  publishScroll(sample: PresenceScrollSample): void {
    const key = `${sample.surface}:${sample.key}:${Math.round(sample.off * 100)}`;
    if (key === this.lastScrollKey) return;
    this.lastScrollKey = key;
    this.scrollThrottle?.emit(sample);
  }

  /** Broadcast our grid selection (roadmap 234) — a rectangle on a registered
   *  surface, or `null` to clear (deselect / blur / unmount). Skipped when the
   *  key is unchanged (idle); throttled like views. */
  publishSelection(selection: PresenceGridSelection | null): void {
    const key = selectionKey(selection);
    if (key === this.lastSelectionKey) return;
    this.lastSelectionKey = key;
    presenceDiagnostics.localSelection = key || null;
    this.selectionThrottle?.emit(selection);
  }

  /** S3.5: tell peers our whole-blob save landed at `revision`. */
  publishSave(revision: number): void {
    void this.channel?.send({
      type: 'broadcast',
      event: SAVE_EVENT,
      payload: { userId: this.identity.userId, revision, ts: Date.now() } satisfies PresenceSavePing,
    });
  }

  stop(): void {
    this.stopped = true;
    this.throttle = null;
    this.scrollThrottle = null;
    this.viewThrottle = null;
    this.selectionThrottle = null;
    this.lastSelectionKey = '';
    this.dragActive = false;
    this.lastCursorDrag = false;
    this.lastAnchorKey = '';
    const channel = this.channel;
    this.channel = null;
    if (channel && supabase) {
      void channel.untrack().catch(() => {});
      void supabase.removeChannel(channel);
    }
    presenceDiagnostics.active = false;
    presenceDiagnostics.topic = null;
    presenceDiagnostics.status = 'idle';
    presenceDiagnostics.peerCount = 0;
    presenceDiagnostics.cursorPointer = null;
    presenceDiagnostics.localOverlay = null;
    presenceDiagnostics.localSelection = null;
    presenceDiagnostics.localDrag = null;
    presenceDiagnostics.error = null;
    this.handlers.onStatus('idle');
  }
}
