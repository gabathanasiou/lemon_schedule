import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './client';
import { isAppTabId, type AppPlace, type AppTabId } from '../appNav';

/**
 * Presence + live refresh (roadmap 229 S3/S3.5) — the ONE module for the
 * per-project Realtime channel, the wire shapes, and the pure merge/throttle
 * logic. Manual: docs/COLLABORATION.md §6/§9.
 *
 * Rules (docs/COLLABORATION.md §4/§9):
 * - ONE private channel per project id (`project:<uuid>`), members only — the
 *   server authorizes with RLS on realtime.messages (`supabase/tests/rls_s3.sql`).
 * - Ephemeral ONLY: never written to the database, never inside the Project.
 * - Payloads are cosmetic identity: parse, clamp, and never trust them for
 *   permissions or for mutating project state beyond the S3.5 LOAD flow.
 * - Cursors are throttled (~20/s), bursts coalesce into one trailing send
 *   (timer + a next-emit flush, so background-tab timer throttling cannot
 *   freeze the pointer one item behind), and skipped when idle; stale
 *   timestamps are dropped per client.
 * - Multi-window: the same user in two tabs holds two presence entries under
 *   one key; bubbles dedupe by user (newest view wins) and the newest cursor
 *   per user renders. Documented, accepted.
 */

export const PRESENCE_TOPIC_PREFIX = 'project:';

export function presenceTopic(projectId: string): string {
  return `${PRESENCE_TOPIC_PREFIX}${projectId}`;
}

// ---------------------------------------------------------------------------
// Wire shapes
// ---------------------------------------------------------------------------

/** The view state a follower applies — the addressable part of AppPlace. */
export interface PresenceView {
  tab: AppTabId;
  sub?: string;
  mode?: string;
  /** Schedule jump: the scene the peer is looking at. */
  sceneId?: string;
  /** Day Manager jump: the peer's production day (section index). */
  daySection?: number;
}

/** Semantic cursor anchor — ids that survive scroll, reorder and zoom, plus
 *  the pointer's position WITHIN the anchored element (`fx`/`fy` ∈ 0..1 of its
 *  rect). When the pointer is over nothing shareable (headers, toolbars,
 *  dialogs, Glide canvas, empty space) the anchor is `screen`: viewport-
 *  relative coordinates (`xr`/`yr` ∈ 0..1), rendered scaled ONLY while that
 *  peer is on the same tab — approximate by design, but the cursor still
 *  exists. Raw pixels are never sent (docs/COLLABORATION.md §9). */
export type PresenceAnchor =
  | { kind: 'row'; rowId: string; fx: number; fy: number }
  | { kind: 'date'; date: string; fx: number; fy: number }
  | { kind: 'day'; sectionIndex: number; section?: string; fx: number; fy: number }
  | { kind: 'grid'; scope: string; rowKey: string; colKey: string; rowIndex: number; colIndex: number; fx: number; fy: number }
  | { kind: 'screen'; xr: number; yr: number; chrome?: boolean };

/** What this tab tracks in Realtime Presence (who's here + where). */
export interface PresenceMeta {
  userId: string;
  /** Per-tab id: two windows of one user are two clients (deduped by user). */
  clientId: string;
  name: string;
  avatarUrl: string | null;
  isGuest: boolean;
  view: PresenceView | null;
  ts: number;
}

export interface PresenceCursor {
  userId: string;
  clientId: string;
  anchor: PresenceAnchor;
  ts: number;
}

export interface PresenceSavePing {
  userId: string;
  revision: number;
  ts: number;
}

/** A peer as the UI consumes it: identity + latest view + latest cursor. */
export interface PresencePeer {
  userId: string;
  name: string;
  avatarUrl: string | null;
  isGuest: boolean;
  view: PresenceView | null;
  cursor: PresenceAnchor | null;
  cursorTs: number;
  ts: number;
}

// ---------------------------------------------------------------------------
// Parsing (never trust a payload — cosmetic identity only)
// ---------------------------------------------------------------------------

const MAX_NAME = 80;
const MAX_STR = 240;

function str(v: unknown, max = MAX_STR): string | null {
  return typeof v === 'string' && v.length > 0 ? v.slice(0, max) : null;
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Pointer position within the anchor element (defaults to its centre). */
function fractions(r: Record<string, unknown>): { fx: number; fy: number } {
  return { fx: clamp01(num(r.fx) ?? 0.5), fy: clamp01(num(r.fy) ?? 0.5) };
}

export function parseView(raw: unknown): PresenceView | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!isAppTabId(r.tab)) return null;
  const view: PresenceView = { tab: r.tab };
  const sub = str(r.sub);
  if (sub) view.sub = sub;
  const mode = str(r.mode);
  if (mode) view.mode = mode;
  const sceneId = str(r.sceneId);
  if (sceneId) view.sceneId = sceneId;
  const daySection = num(r.daySection);
  if (daySection != null) view.daySection = Math.trunc(daySection);
  return view;
}

export function parseAnchor(raw: unknown): PresenceAnchor | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.kind === 'screen') {
    const xr = num(r.xr);
    const yr = num(r.yr);
    if (xr == null || yr == null) return null;
    return { kind: 'screen', xr: clamp01(xr), yr: clamp01(yr), ...(r.chrome === true ? { chrome: true } : {}) };
  }
  if (r.kind === 'grid') {
    const scope = str(r.scope, 64);
    const rowKey = str(r.rowKey, 128);
    const colKey = str(r.colKey, 128);
    const rowIndex = num(r.rowIndex);
    const colIndex = num(r.colIndex);
    if (!scope || !rowKey || !colKey || rowIndex == null || colIndex == null) return null;
    return {
      kind: 'grid',
      scope,
      rowKey,
      colKey,
      rowIndex: Math.max(0, Math.trunc(rowIndex)),
      colIndex: Math.max(0, Math.trunc(colIndex)),
      ...fractions(r),
    };
  }
  const pos = fractions(r);
  if (r.kind === 'row') {
    const rowId = str(r.rowId);
    return rowId ? { kind: 'row', rowId, ...pos } : null;
  }
  if (r.kind === 'date') {
    const date = str(r.date, 10);
    return date ? { kind: 'date', date, ...pos } : null;
  }
  if (r.kind === 'day') {
    const sectionIndex = num(r.sectionIndex);
    if (sectionIndex == null) return null;
    const section = str(r.section);
    return { kind: 'day', sectionIndex: Math.trunc(sectionIndex), ...(section ? { section } : {}), ...pos };
  }
  return null;
}

export function parsePresenceMeta(raw: unknown): PresenceMeta | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const userId = str(r.userId, 64);
  const clientId = str(r.clientId, 64);
  const ts = num(r.ts);
  if (!userId || !clientId || ts == null) return null;
  return {
    userId,
    clientId,
    ts,
    name: str(r.name, MAX_NAME) ?? 'Someone',
    avatarUrl: str(r.avatarUrl) ?? null,
    isGuest: r.isGuest === true,
    view: parseView(r.view),
  };
}

export function parseCursorPayload(raw: unknown): PresenceCursor | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const userId = str(r.userId, 64);
  const clientId = str(r.clientId, 64);
  const ts = num(r.ts);
  const anchor = parseAnchor(r.anchor);
  if (!userId || !clientId || ts == null || !anchor) return null;
  return { userId, clientId, anchor, ts };
}

export function parseSavePayload(raw: unknown): PresenceSavePing | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const userId = str(r.userId, 64);
  const revision = num(r.revision);
  const ts = num(r.ts);
  if (!userId || revision == null || revision <= 0 || ts == null) return null;
  return { userId, revision: Math.trunc(revision), ts };
}

// ---------------------------------------------------------------------------
// Pure merge / throttle / decision helpers
// ---------------------------------------------------------------------------

/** Presence state (key → metas) → one peer per user, newest meta wins (the
 *  multi-window dedupe), self excluded, deterministic order. */
export function mergePeers(state: Record<string, unknown[]>, selfUserId: string): PresencePeer[] {
  const byUser = new Map<string, PresenceMeta>();
  for (const metas of Object.values(state ?? {})) {
    for (const raw of metas ?? []) {
      const meta = parsePresenceMeta(raw);
      if (!meta || meta.userId === selfUserId) continue;
      const prev = byUser.get(meta.userId);
      if (!prev || meta.ts > prev.ts) byUser.set(meta.userId, meta);
    }
  }
  return [...byUser.values()]
    .map((m): PresencePeer => ({
      userId: m.userId,
      name: m.name,
      avatarUrl: m.avatarUrl,
      isGuest: m.isGuest,
      view: m.view,
      cursor: null,
      cursorTs: 0,
      ts: m.ts,
    }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.userId.localeCompare(b.userId));
}

/** Drop stale cursor broadcasts: only a strictly newer ts for that client wins. */
export function acceptCursor(prevTs: number | undefined, incomingTs: number): boolean {
  return prevTs == null || incomingTs > prevTs;
}

/** Pointer position within the anchor element's rect as 0..1 fractions — the
 *  durable "where inside this row/cell" half of a live cursor. */
export function pointerFractions(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
): { fx: number; fy: number } {
  return {
    fx: rect.width > 0 ? clamp01((clientX - rect.left) / rect.width) : 0.5,
    fy: rect.height > 0 ? clamp01((clientY - rect.top) / rect.height) : 0.5,
  };
}

/** Stable key for idle-skip comparisons; the pointer position is quantized to
 *  1% of the element so micro-jitter doesn't re-broadcast. */
export function anchorKey(anchor: PresenceAnchor | null): string {
  if (!anchor) return '';
  const q = (v: number) => Math.round(v * 100);
  if (anchor.kind === 'screen') return `screen:${anchor.chrome ? 1 : 0}:${q(anchor.xr)}:${q(anchor.yr)}`;
  const pos = `${q(anchor.fx)}:${q(anchor.fy)}`;
  switch (anchor.kind) {
    case 'row':
      return `row:${anchor.rowId}:${pos}`;
    case 'date':
      return `date:${anchor.date}:${pos}`;
    case 'day':
      return `day:${anchor.sectionIndex}:${anchor.section ?? ''}:${pos}`;
    case 'grid':
      return `grid:${anchor.scope}:${anchor.rowKey}:${anchor.colKey}:${anchor.rowIndex}:${anchor.colIndex}:${pos}`;
  }
}

/** Viewport-relative pointer position (the `screen` anchor fallback). */
export function screenFractions(clientX: number, clientY: number, width: number, height: number): { xr: number; yr: number } {
  return {
    xr: width > 0 ? clamp01(clientX / width) : 0.5,
    yr: height > 0 ? clamp01(clientY / height) : 0.5,
  };
}

export interface Throttle<T> {
  /** Leading send now when the window elapsed; otherwise queue the sample and
   *  coalesce — it flushes via a trailing timer AND opportunistically on the
   *  next emit (background tabs throttle `setTimeout`, which alone could
   *  freeze the pointer one item behind for peers). */
  emit(value: T): void;
}

/** ~20/s cursor throttle: leading send, coalesce the burst, one trailing send
 *  (timer + next-emit flush). `now` is injectable so the timing is unit-testable. */
export function createThrottle<T>(send: (value: T) => void, intervalMs = 100, now: () => number = Date.now): Throttle<T> {
  // -Infinity guarantees the very first emit is always a leading send.
  let lastSentAt = Number.NEGATIVE_INFINITY;
  let pending: T | undefined;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const fire = () => {
    timer = null;
    if (pending === undefined) return;
    const value = pending;
    pending = undefined;
    lastSentAt = now();
    send(value);
  };

  return {
    emit(value: T) {
      const at = now();
      if (pending !== undefined) {
        if (at - lastSentAt < intervalMs) {
          pending = value; // still coalescing
          return;
        }
        // The trailing timer is overdue (hidden-tab throttling) — flush now.
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        send(pending);
        pending = undefined;
        lastSentAt = at;
      }
      if (at - lastSentAt >= intervalMs) {
        lastSentAt = at;
        send(value);
        return;
      }
      pending = value;
      if (!timer) timer = setTimeout(fire, Math.max(0, intervalMs - (at - lastSentAt)));
    },
  };
}

/** S3.5 decision: ignore older/equal revisions; otherwise apply when clean,
 *  ask (chip) when the local client has unsaved edits — never clobber. */
export type PeerSaveDecision = 'ignore' | 'apply' | 'prompt';

export function decidePeerSave(
  remoteRevision: number,
  localRevision: number,
  hasUnsavedChanges: boolean,
): PeerSaveDecision {
  if (!(remoteRevision > localRevision)) return 'ignore';
  return hasUnsavedChanges ? 'prompt' : 'apply';
}

/** The one-shot target fields travel with the view so a follower lands on the
 *  same scene/day the leader is looking at. */
export function placeToPresenceView(place: AppPlace): PresenceView {
  const view: PresenceView = { tab: place.tab };
  if (place.sub) view.sub = place.sub;
  if (place.mode) view.mode = place.mode;
  if (place.sceneId) view.sceneId = place.sceneId;
  if (place.daySection != null) view.daySection = place.daySection;
  return view;
}

/** Validate a remote view into an AppPlace (null when the tab is unknown). */
export function presenceViewToPlace(view: unknown): AppPlace | null {
  const parsed = parseView(view);
  if (!parsed) return null;
  const place: AppPlace = { tab: parsed.tab };
  if (parsed.sub) place.sub = parsed.sub;
  if (parsed.mode) place.mode = parsed.mode;
  if (parsed.sceneId) place.sceneId = parsed.sceneId;
  if (parsed.daySection != null) place.daySection = parsed.daySection;
  return place;
}

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
  onStatus: (status: PresenceChannelStatus) => void;
}

const CURSOR_EVENT = 'cursor';
const SAVE_EVENT = 'save';

/**
 * ONE private Realtime channel for the open shared project. Start/stop is
 * idempotent; `stop()` unsubscribes and untracks so peers see the leave
 * immediately (no ghost bubbles).
 */
export class ProjectPresenceChannel {
  private channel: RealtimeChannel | null = null;
  private throttle: Throttle<PresenceCursor> | null = null;
  private lastAnchorKey = '';
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
