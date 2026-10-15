import { isAppTabId, modeOf, type AppPlace, type AppTabId } from '../appNav';
import { CELL_BORDER_VALUES, VIEW_MODE_VALUES, type CellBorders, type ViewMode } from '../persist';

/**
 * Presence + live refresh + follow completeness (roadmap 229 S3/S3.5 + follow)
 * — the wire shapes, parsers and pure merge/throttle logic. The Supabase
 * transport (the channel class, diagnostics, the save bus) lives in
 * `presenceChannel.ts`. Manual: docs/COLLABORATION.md §6/§9.
 *
 * Rules (docs/COLLABORATION.md §4/§9):
 * - ONE private channel per project id (`project:<uuid>`), members only — the
 *   server authorizes with RLS on realtime.messages (`supabase/tests/rls_s3.sql`).
 * - Ephemeral ONLY: never written to the database, never inside the Project.
 * - Payloads are cosmetic identity: parse, clamp, and never trust them for
 *   permissions or for mutating project state beyond the S3.5 LOAD flow.
 * - Presence `track()` is capped by Supabase at **5 calls per client per
 *   30 seconds** — past it the server SHUTS THE CHANNEL DOWN
 *   (`ClientPresenceRateLimitReached`). So views (place + scene + view
 *   switches) ride a throttled `view` broadcast; `track()` happens only on
 *   (re)join, carrying the view snapshot for late joiners.
 * - Cursors (~12/s) and scroll samples (~5/s) are broadcasts too; bursts
 *   coalesce into one trailing send (timer + a next-emit flush, so
 *   background-tab timer throttling cannot freeze the pointer one item
 *   behind), and skip when idle; stale timestamps drop per client.
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

/** The Calendar sub-view allow-list (Strips vs Events) — presence wire. */
export const CALENDAR_VIEW_VALUES = ['strips', 'events'] as const;
export type CalendarView = (typeof CALENDAR_VIEW_VALUES)[number];

/** The view state a follower applies — the addressable part of AppPlace plus
 *  the in-page view switches that don't change the place (follow completeness,
 *  roadmap 229). Pref-shaped fields are validated against their allow-lists;
 *  the follower's surfaces apply them through their own hooks. */
export interface PresenceView {
  tab: AppTabId;
  sub?: string;
  mode?: string;
  /** Schedule jump / Sheet: the scene the peer is looking at. */
  sceneId?: string;
  /** Sheet: the peer's position among scenes (`sceneId` wins when the
   *  follower uses a different Sheet order). */
  sheetIndex?: number;
  /** Day Manager jump: the peer's production day (section index). */
  daySection?: number;
  /** Stripboard View menu: A4 width / cell borders (per-user prefs). */
  viewMode?: ViewMode;
  cellBorders?: CellBorders;
  /** Calendar sub-view: Strips vs Events. */
  calendarView?: CalendarView;
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
  | { kind: 'screen'; xr: number; yr: number };

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

/** The peer's input modality (roadmap 241). Tracked centrally from pointer
 *  events, piggybacked on the cursor payload and re-sent only when it
 *  CHANGES — the pointer glyph renders per kind. */
export const POINTER_KINDS = ['mouse', 'touch', 'pen'] as const;
export type PointerKind = (typeof POINTER_KINDS)[number];

/** Never trust the wire: anything unknown reads as the mouse arrow. */
export function pointerKindOf(raw: unknown): PointerKind {
  return (POINTER_KINDS as readonly string[]).includes(raw as string) ? (raw as PointerKind) : 'mouse';
}

/** Pointer glyph per input kind — one mapping for the overlay (Vitest'd). */
export type PointerGlyph = 'arrow' | 'hand' | 'pen' | 'window';

export function pointerGlyph(pointer: PointerKind): PointerGlyph {
  return pointer === 'touch' ? 'hand' : pointer === 'pen' ? 'pen' : 'arrow';
}

/** The glyph a peer's marker renders (roadmap 244): the modal-window icon
 *  while their overlay cue says `modal` — the frozen pointer, aimed at a
 *  surface nobody else can see — otherwise their input-kind glyph. Menus keep
 *  the pointer-kind glyph (they are small and the pointer there is
 *  meaningful). The cue wins over the modality; on close the glyph returns to
 *  the input-kind icon. */
export function cursorGlyph(pointer: PointerKind, overlay: LocalOverlayKind | null): PointerGlyph {
  return overlay === 'modal' ? 'window' : pointerGlyph(pointer);
}

export interface PresenceCursor {
  userId: string;
  clientId: string;
  anchor: PresenceAnchor;
  pointer: PointerKind;
  ts: number;
}

/** Local-overlay cue (roadmap 240): the peer is inside a surface only THEY
 *  can see — a menu/dropdown or a modal — so their pointer (and header
 *  bubble) shows animated dots instead of looking parked. Ephemeral; rides a
 *  broadcast (never `track()`); open/close EDGES + a heartbeat so a killed
 *  tab clears via the TTL without a close event; multi-window = newest wins. */
export const LOCAL_OVERLAY_KINDS = ['menu', 'modal'] as const;
export type LocalOverlayKind = (typeof LOCAL_OVERLAY_KINDS)[number];

/** Heartbeat cadence while a local overlay is open (sender) and the
 *  receiver's staleness window — TTL > heartbeat so one dropped message
 *  cannot flicker the cue. */
export const OVERLAY_HEARTBEAT_MS = 6_000;
export const OVERLAY_TTL_MS = 12_000;

/** One overlay signal as it travels the wire; `kind: null` is the close
 *  EDGE (the sender left its local surface). */
export interface PresenceOverlayState {
  userId: string;
  clientId: string;
  kind: LocalOverlayKind | null;
  ts: number;
}

export interface PresenceSavePing {
  userId: string;
  revision: number;
  ts: number;
}

/** The scroll surfaces that mirror their position to followers
 *  (docs/COLLABORATION.md §9 — follow completeness). */
export const SCROLL_SURFACES = ['schedule', 'calendar', 'sheet', 'glide'] as const;
export type ScrollSurface = (typeof SCROLL_SURFACES)[number];

/** What a surface broadcasts: the SEMANTIC item at its top edge (`key` — the
 *  surface's own data-attribute value, e.g. a row, date cell, field box or
 *  Glide cell key) and how far into it the container is scrolled (`off` ∈
 *  0..1). Never pixels: keys survive scroll, reflow, reorder and per-user
 *  layout settings.
 *
 *  `fkey`/`foff` are an optional coarse fallback anchor (the stripboard's day
 *  blocks): when the primary item isn't mounted on the receiver yet — its
 *  render window is elsewhere — the fallback lands the view first, the item
 *  renders, and the receiver re-aligns on it. */
export interface PresenceScrollSample {
  surface: ScrollSurface;
  key: string;
  off: number;
  fkey?: string;
  foff?: number;
}

export interface PresenceScroll extends PresenceScrollSample {
  userId: string;
  clientId: string;
  ts: number;
}

/** Access-change push (S3): the server broadcasts a role change or a
 *  revocation (`role: null`) to the affected user on the project channel. */
export type PresenceAccessRole = 'owner' | 'editor' | 'viewer';

export interface PresenceAccessEvent {
  /** The user the event is about (clients ignore events for other people). */
  userId: string;
  /** New role, or null when access was revoked. */
  role: PresenceAccessRole | null;
  ts: number;
}

/** View updates ride a BROADCAST, not presence `track`: Supabase limits a
 *  client to **5 presence calls per 30 seconds** (free tier) and shuts the
 *  channel down past it — navigation-paced `track()` blew that instantly
 *  (Realtime `ClientPresenceRateLimitReached`, user report 2026-10-12).
 *  `track()` now happens only on (re)join, carrying the view snapshot for
 *  late joiners; peers learn every later change from these messages. */
export interface PresenceViewUpdate {
  userId: string;
  clientId: string;
  view: PresenceView | null;
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
  /** Latest input modality of the peer's pointer (roadmap 241). */
  pointer: PointerKind;
  /** The peer's local-overlay cue (roadmap 240): 'menu' | 'modal' while open
   *  and fresh (TTL), else null. */
  overlay: LocalOverlayKind | null;
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
  const sheetIndex = num(r.sheetIndex);
  if (sheetIndex != null) view.sheetIndex = Math.max(0, Math.trunc(sheetIndex));
  // In-page view switches: clamp to the allow-lists, drop anything else.
  const viewMode = VIEW_MODE_VALUES.find(v => v === r.viewMode);
  if (viewMode) view.viewMode = viewMode;
  const cellBorders = CELL_BORDER_VALUES.find(v => v === r.cellBorders);
  if (cellBorders) view.cellBorders = cellBorders;
  const calendarView = CALENDAR_VIEW_VALUES.find(v => v === r.calendarView);
  if (calendarView) view.calendarView = calendarView;
  return view;
}

export function parseAnchor(raw: unknown): PresenceAnchor | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.kind === 'screen') {
    const xr = num(r.xr);
    const yr = num(r.yr);
    if (xr == null || yr == null) return null;
    return { kind: 'screen', xr: clamp01(xr), yr: clamp01(yr) };
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
  return { userId, clientId, anchor, pointer: pointerKindOf(r.pointer), ts };
}

export function parseOverlayPayload(raw: unknown): PresenceOverlayState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const userId = str(r.userId, 64);
  const clientId = str(r.clientId, 64);
  const ts = num(r.ts);
  if (!userId || !clientId || ts == null) return null;
  // A null kind is a valid close edge; unknown kinds are ignored (never
  // trusted as a close).
  if (r.kind === null) return { userId, clientId, kind: null, ts };
  const kind = LOCAL_OVERLAY_KINDS.find(k => k === r.kind);
  return kind ? { userId, clientId, kind, ts } : null;
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

export function parseScrollPayload(raw: unknown): PresenceScroll | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const userId = str(r.userId, 64);
  const clientId = str(r.clientId, 64);
  const ts = num(r.ts);
  const key = str(r.key, 128);
  const off = num(r.off);
  const surface = SCROLL_SURFACES.find(s => s === r.surface);
  if (!userId || !clientId || ts == null || !key || off == null || !surface) return null;
  const scroll: PresenceScroll = { userId, clientId, surface, key, off: clamp01(off), ts };
  const fkey = str(r.fkey, 128);
  const foff = num(r.foff);
  if (fkey && foff != null) {
    scroll.fkey = fkey;
    scroll.foff = clamp01(foff);
  }
  return scroll;
}

const ACCESS_ROLES: readonly PresenceAccessRole[] = ['owner', 'editor', 'viewer'];

export function parseAccessPayload(raw: unknown): PresenceAccessEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const userId = str(r.userId, 64);
  const ts = num(r.ts);
  if (!userId || ts == null) return null;
  const role = r.role;
  if (role === null) return { userId, role: null, ts };
  if (typeof role === 'string' && (ACCESS_ROLES as readonly string[]).includes(role)) {
    return { userId, role: role as PresenceAccessRole, ts };
  }
  return null; // unknown role values are ignored (never lock on garbage)
}

export function parseViewPayload(raw: unknown): PresenceViewUpdate | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const userId = str(r.userId, 64);
  const clientId = str(r.clientId, 64);
  const ts = num(r.ts);
  if (!userId || !clientId || ts == null) return null;
  return { userId, clientId, view: parseView(r.view), ts };
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
      pointer: 'mouse',
      overlay: null,
      ts: m.ts,
    }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.userId.localeCompare(b.userId));
}

/** Drop stale cursor broadcasts: only a strictly newer ts for that client wins. */
export function acceptCursor(prevTs: number | undefined, incomingTs: number): boolean {
  return prevTs == null || incomingTs > prevTs;
}

/** One overlay signal as the receiver tracks it: the payload plus the local
 *  RECEIPT time (`at`) — TTL/ordering compare within one clock (sender clocks
 *  are not comparable across machines). */
export interface PresenceOverlaySample {
  userId: string;
  kind: LocalOverlayKind | null;
  at: number;
}

/** Active overlay cues per user: newest window wins (multi-window parity with
 *  cursors), and a signal older than `ttlMs` is stale — a killed tab or a
 *  paused heartbeat clears without a close event. */
export function resolveOverlayCues(
  signals: Iterable<PresenceOverlaySample>,
  now: number,
  ttlMs = OVERLAY_TTL_MS,
): Map<string, LocalOverlayKind> {
  const newest = new Map<string, PresenceOverlaySample>();
  for (const s of signals) {
    const prev = newest.get(s.userId);
    if (!prev || s.at >= prev.at) newest.set(s.userId, s);
  }
  const cues = new Map<string, LocalOverlayKind>();
  for (const [userId, s] of newest) {
    if (s.kind && now - s.at <= ttlMs) cues.set(userId, s.kind);
  }
  return cues;
}

/** Cursor-freeze gate (roadmap 244): while a user's newest overlay cue is a
 *  FRESH `modal`, their incoming cursor frames are ignored — the pointer
 *  stays where it last was, because the peer is aiming at a surface nobody
 *  else can see (and typing there moves the mouse over it). Menus keep
 *  moving: they are small and the pointer over them is meaningful. A stale
 *  cue (killed tab) unfreezes like a close edge. */
export function freezeCursorFor(
  overlays: Iterable<PresenceOverlaySample>,
  userId: string,
  now: number,
  ttlMs = OVERLAY_TTL_MS,
): boolean {
  return resolveOverlayCues(overlays, now, ttlMs).get(userId) === 'modal';
}

/** Pointer-collision fade (roadmap 244): while the local pointer and a peer's
 *  marker stay within the NEAR threshold for the dwell time, the peer's
 *  marker + tag fade so the surface beneath stays readable; separation past
 *  the FAR threshold restores full opacity. The gap between the thresholds is
 *  hysteresis — a pointer hovering the boundary never flickers. */
export const COLLISION_NEAR_PX = 30;
export const COLLISION_FAR_PX = 60;
export const COLLISION_DWELL_MS = 2_000;

export interface CollisionDwellState {
  /** When proximity began (null while apart) and whether to fade. */
  since: number | null;
  faded: boolean;
}

export const COLLISION_DWELL_IDLE: CollisionDwellState = { since: null, faded: false };

/** One step of the per-peer dwell state machine. `Infinity` distance = no
 *  local pointer yet (never fades). Pure; returns the same state object when
 *  nothing changed so the caller can skip re-renders cheaply. */
export function stepCollisionDwell(state: CollisionDwellState, distancePx: number, now: number): CollisionDwellState {
  if (distancePx >= COLLISION_FAR_PX) {
    return state.since === null && !state.faded ? state : { since: null, faded: false };
  }
  if (distancePx > COLLISION_NEAR_PX) return state; // hysteresis band
  const since = state.since ?? now;
  const faded = state.faded || now - since >= COLLISION_DWELL_MS;
  return since === state.since && faded === state.faded ? state : { since, faded };
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
  if (anchor.kind === 'screen') return `screen:${q(anchor.xr)}:${q(anchor.yr)}`;
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

// ---------------------------------------------------------------------------
// Follow / visibility gating
// ---------------------------------------------------------------------------

/** A peer's pointer is shown ONLY while we are on the SAME place as them:
 *  same tab, same sub-tab, same sub-sub mode (Day Manager vs Call Sheet,
 *  Crew/Locations manager vs Glide). The header/toolbar pointers follow the
 *  same rule (user decision 2026-10-12). */
export function sameViewPlace(peerView: PresenceView | null | undefined, current: AppPlace): boolean {
  if (!peerView || !peerView.tab) return false;
  if (peerView.tab !== current.tab) return false;
  if ((peerView.sub ?? null) !== (current.sub ?? null)) return false;
  return modeOf({ tab: peerView.tab, sub: peerView.sub, mode: peerView.mode }) === modeOf(current);
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
 *  same scene/day/sheet the leader is looking at. In-page view switches
 *  (viewMode/cellBorders/calendarView) are NOT part of the place — the
 *  mounted surfaces apply those (presence.ts PresenceView doc). */
export function placeToPresenceView(place: AppPlace): PresenceView {
  const view: PresenceView = { tab: place.tab };
  if (place.sub) view.sub = place.sub;
  if (place.mode) view.mode = place.mode;
  if (place.sceneId) view.sceneId = place.sceneId;
  if (place.sheetIndex !== undefined) view.sheetIndex = place.sheetIndex;
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
  if (parsed.sheetIndex !== undefined) place.sheetIndex = parsed.sheetIndex;
  if (parsed.daySection != null) place.daySection = parsed.daySection;
  return place;
}
