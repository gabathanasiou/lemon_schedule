import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './client';
import {
  anchorKey,
  createThrottle,
  mergePeers,
  parseAccessPayload,
  parseCursorPayload,
  parseSavePayload,
  parseScrollPayload,
  presenceTopic,
  type PresenceAccessEvent,
  type PresenceAnchor,
  type PresenceCursor,
  type PresenceMeta,
  type PresencePeer,
  type PresenceSavePing,
  type PresenceScroll,
  type PresenceScrollSample,
  type PresenceView,
  type Throttle,
} from './presence';

/**
 * The ONE Realtime channel for the open shared project (roadmap 229 S3) — the
 * transport half of the presence module. Manual: docs/COLLABORATION.md §6/§9.
 *
 * `presence.ts` owns the wire shapes + pure logic; this module owns the
 * Supabase-touching side: the channel class, its diagnostics snapshot and the
 * local save bus the store feeds (S3.5).
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
  /** Last cursor payload received from a peer (0 = none). */
  lastCursorRecvAt: number;
  error: string | null;
}

export const presenceDiagnostics: PresenceDiagnostics = {
  active: false,
  topic: null,
  status: 'idle',
  peerCount: 0,
  cursorCount: 0,
  lastCursorAt: 0,
  lastCursorRecvAt: 0,
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
  /** Access-change event addressed to THIS user (role change or revocation). */
  onAccess: (event: PresenceAccessEvent) => void;
  onStatus: (status: PresenceChannelStatus) => void;
}

const CURSOR_EVENT = 'cursor';
const SAVE_EVENT = 'save';
const SCROLL_EVENT = 'scroll';
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
  private lastAnchorKey = '';
  private lastScrollKey = '';
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
    }, 50); // ~20/s — Canva-smooth gliding without hammering the channel

    this.scrollThrottle = createThrottle<PresenceScrollSample>((sample) => {
      const payload: PresenceScroll = { ...sample, userId: this.identity.userId, clientId: this.clientId, ts: Date.now() };
      void this.channel?.send({ type: 'broadcast', event: SCROLL_EVENT, payload });
    }, 120); // ~8/s — scroll mirroring reads smooth without a flood

    const channel = supabase.channel(topic, {
      config: { private: true, presence: { key: this.identity.userId, enabled: true } },
    });
    this.channel = channel;

    channel
      .on('presence', { event: 'sync' }, () => {
        if (this.stopped) return;
        this.emitPeers();
      })
      .on('broadcast', { event: CURSOR_EVENT }, ({ payload }) => {
        if (this.stopped) return;
        const cursor = parseCursorPayload(payload);
        if (cursor && cursor.userId !== this.identity.userId) {
          presenceDiagnostics.lastCursorRecvAt = Date.now();
          this.handlers.onCursor(cursor);
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
          // Re-track after every (re)join so a reconnect restores our state.
          if (this.lastMeta) void this.channel?.track(this.lastMeta);
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

  /** Broadcast our place (throttle-free: navigation is user-paced). */
  publishView(view: PresenceView | null): void {
    this.lastMeta = this.buildMeta(view);
    if (this.channel) void this.channel.track(this.lastMeta);
  }

  /** Broadcast our cursor anchor; skipped when unchanged (idle) and throttled
   *  to ~20/s with coalescing. */
  publishCursor(anchor: PresenceAnchor | null): void {
    const key = anchorKey(anchor);
    if (!key || key === this.lastAnchorKey) return;
    this.lastAnchorKey = key;
    this.throttle?.emit({
      userId: this.identity.userId,
      clientId: this.clientId,
      anchor: anchor!,
      ts: Date.now(),
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
    presenceDiagnostics.error = null;
    this.handlers.onStatus('idle');
  }
}
