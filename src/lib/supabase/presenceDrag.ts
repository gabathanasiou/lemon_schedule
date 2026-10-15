/**
 * Peer-drag protocol (roadmap 235) — the wire shapes, parser and pure
 * resolve/held helpers for the "ghost + soft lock" presence feature.
 *
 * Split out of `presence.ts` (which had grown past the monolith threshold)
 * and re-exported there, so `presence.ts` stays the ONE import seam for the
 * channel, the provider and the surfaces. Rules (docs/COLLABORATION.md §9):
 * ephemeral only — never persisted, never a room action, never `track()`;
 * the claim rides its own `drag` broadcast and the POSITION rides the existing
 * `cursor` frames (`drag: true`), so a drag costs ~3-4 small messages total.
 */

/** The tiny "never trust a payload" readers are shared with presence.ts
 *  (`presenceWire.ts`) — same length caps, same quiet drops. */
import { num, str } from './presenceWire';

/** The surface a peer's live drag belongs to. `calendar-day` is a whole-day
 *  block drag (the calendar day HEADER) — its ghost is the day chip, and its
 *  claim covers the day's rows plus the synthetic day marker
 *  (`dayDragItemId`) so the day itself locks too. */
export const DRAG_SURFACES = ['schedule', 'calendar', 'calendar-day'] as const;
export type DragSurface = (typeof DRAG_SURFACES)[number];

/** Drag-claim cadence (sender) and staleness window (receiver): a ~5s
 *  heartbeat while the item is held, TTL > heartbeat so one dropped frame
 *  cannot flicker a peer's lock. A killed tab's claim expires via the TTL —
 *  degrading to today's last-drop-wins, never corruption. */
export const DRAG_HEARTBEAT_MS = 5_000;
export const DRAG_TTL_MS = 12_000;

/** Cap on the item ids one claim frame carries (a cosmetic awareness payload,
 *  never trusted) — a huge multi-select still locks its first N items. */
export const MAX_DRAG_ITEMS = 50;

/** One drag claim as it travels the wire; `surface: null` is the RELEASE edge
 *  (drop/cancel/Esc/blur). The item-id list rides START + heartbeats only —
 *  the moving POSITION rides the existing cursor frames (`drag: true`). */
export interface PresenceDragState {
  userId: string;
  clientId: string;
  surface: DragSurface | null;
  itemIds: string[];
  ts: number;
}

/** Synthetic held-item id for a whole-day (calendar day-header) drag — the
 *  claim carries it next to the day's row ids so the day header locks too. */
export function dayDragItemId(sectionIndex: number): string {
  return `day:${sectionIndex}`;
}

export function parseDayDragItemId(id: string): number | null {
  const m = /^day:(\d+)$/.exec(id);
  if (!m) return null;
  const index = Number(m[1]);
  return Number.isFinite(index) ? index : null;
}

/** One drag signal as the receiver tracks it: the payload plus the local
 *  RECEIPT time (`at`) — TTL/ordering compare within one clock, parity with
 *  the overlay cue (sender clocks are not comparable across machines). */
export interface PresenceDragSample {
  userId: string;
  surface: DragSurface | null;
  itemIds: string[];
  ts: number;
  at: number;
}

/** A peer's live drag as the surfaces consume it (one per user, newest window
 *  wins, TTL-expired dropped). */
export interface PresencePeerDrag {
  userId: string;
  name: string;
  surface: DragSurface;
  /** The held items in wire order (the day marker first for `calendar-day`). */
  itemIds: string[];
}

/** The holder of one held item, as the "held" ring + hint consume it. */
export interface PresenceHeldItem {
  userId: string;
  name: string;
}

/** Parse a drag claim: `surface: null` is the RELEASE edge, unknown surfaces
 *  are dropped (never trusted as a release), and the item-id list is capped —
 *  a malformed list clamps to empty rather than rejecting the claim (the lock
 *  matters more than the ghost). */
export function parseDragPayload(raw: unknown): PresenceDragState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const userId = str(r.userId, 64);
  const clientId = str(r.clientId, 64);
  const ts = num(r.ts);
  if (!userId || !clientId || ts == null) return null;
  if (r.surface === null) return { userId, clientId, surface: null, itemIds: [], ts };
  const surface = DRAG_SURFACES.find(s => s === r.surface);
  if (!surface) return null;
  const itemIds: string[] = [];
  if (Array.isArray(r.itemIds)) {
    for (const v of r.itemIds) {
      if (itemIds.length >= MAX_DRAG_ITEMS) break;
      const id = str(v, 128);
      if (id) itemIds.push(id);
    }
  }
  return { userId, clientId, surface, itemIds, ts };
}

/** Active drag claims per user: newest window wins (multi-window parity with
 *  cursors/overlays), a release edge clears, and a signal older than `ttlMs`
 *  is stale — a killed tab or a paused heartbeat releases the lock without a
 *  drop event. */
export function resolveDragClaims(
  samples: Iterable<PresenceDragSample>,
  now: number,
  ttlMs = DRAG_TTL_MS,
): Map<string, { surface: DragSurface; itemIds: string[] }> {
  const newest = new Map<string, PresenceDragSample>();
  for (const s of samples) {
    const prev = newest.get(s.userId);
    if (!prev || s.ts >= prev.ts) newest.set(s.userId, s);
  }
  const claims = new Map<string, { surface: DragSurface; itemIds: string[] }>();
  for (const [userId, s] of newest) {
    if (s.surface && now - s.at <= ttlMs) claims.set(userId, { surface: s.surface, itemIds: s.itemIds });
  }
  return claims;
}

/** The item → holder map every surface shares: an item id in here renders
 *  "held" in its holder's colour and refuses MOVE/REMOVE paths. First holder
 *  wins when two peers somehow claim the same item. */
export function heldItemsOf(drags: Iterable<PresencePeerDrag>): Map<string, PresenceHeldItem> {
  const held = new Map<string, PresenceHeldItem>();
  for (const d of drags) {
    for (const id of d.itemIds) {
      if (!held.has(id)) held.set(id, { userId: d.userId, name: d.name });
    }
  }
  return held;
}
