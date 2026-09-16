import type { NonShootDate } from '../types';
import { addDays, advanceDateCursor, buildNonShootSet } from './daybreakUtils';
import { toDateKey } from './utils';

/**
 * Weekly days-off sync (roadmap 54, MMS-style) — the pure materialization behind
 * the Production Dates modal's "Apply Days Off" / "Save". Given the window and
 * the pattern weekdays, it computes the next `nonShootDates`:
 *  - pattern weekdays without any entry get a `holiday` status (`pattern: true`);
 *  - pattern-created Day Off statuses on weekdays NO LONGER in the pattern are
 *    removed (cards/notes survive, the status is stripped);
 *  - everything else — hand-made statuses, cards, notes — is kept.
 * The modal owns the dispatch + the note copy; this owns the date math.
 */

export interface DaysOffSyncInput {
  prepStart: string;
  productionStart: string;
  postEnd: string;
  /** Mon-based weekdays (0=Mon..6=Sun) the pattern marks as days off. */
  daysOff: Iterable<number>;
  current: NonShootDate[];
  /** Number of production (non-pinned) stripboard days — the schedule length. */
  productionDayCount: number;
}

export type DaysOffSyncResult =
  | { kind: 'no-start' }
  | { kind: 'invalid-start' }
  | { kind: 'no-change' }
  | { kind: 'applied'; nonShootDates: NonShootDate[]; added: NonShootDate[]; removed: number };

/** Mon-based weekday (0=Mon..6=Sun) of an ISO date key. */
export function monBased(key: string): number {
  const js = new Date(key + 'T00:00:00').getDay();
  return js === 0 ? 6 : js - 1;
}

export function computeDaysOffSync(input: DaysOffSyncInput): DaysOffSyncResult {
  const { prepStart, productionStart, postEnd, current, productionDayCount } = input;
  const daysOff = new Set(input.daysOff);

  const from = prepStart || productionStart;
  if (!from) return { kind: 'no-start' };
  const fromDate = new Date(from + 'T00:00:00');
  if (isNaN(fromDate.getTime())) return { kind: 'invalid-start' };

  const nonShootSet = buildNonShootSet(current);
  const skip = (d: string) => nonShootSet.has(d) || daysOff.has(monBased(d));

  // Walk the same date cursor the stripboard uses: land N production days from
  // the production anchor, skipping statuses + pattern days.
  const anchor = productionStart || from;
  let cursor = anchor;
  for (let i = 0; i < productionDayCount; i++) {
    cursor = advanceDateCursor(cursor, skip);
    cursor = addDays(cursor, 1);
  }
  const lastShoot = addDays(cursor, -1);

  let to = lastShoot;
  if (postEnd && !isNaN(new Date(postEnd + 'T00:00:00').getTime()) && postEnd > to) to = postEnd;
  const toDate = new Date(to + 'T00:00:00');

  const existing = new Map(current.map(n => [n.date, n]));
  const added: NonShootDate[] = [];
  const walk = new Date(fromDate);
  while (walk <= toDate) {
    const key = toDateKey(walk);
    if (daysOff.has(monBased(key)) && !existing.has(key)) {
      added.push({ date: key, status: 'holiday', pattern: true });
    }
    walk.setDate(walk.getDate() + 1);
  }

  // Remove pattern-created holidays on weekdays that left the pattern. The
  // pattern is a global version property, so this is not span-bounded. If the
  // day carries cards/notes, keep the entry with the status stripped.
  let removed = 0;
  const retained: NonShootDate[] = [];
  for (const n of current) {
    if (n.status === 'holiday' && n.pattern && !daysOff.has(monBased(n.date))) {
      removed++;
      const hasContent = (n.lists && Object.keys(n.lists).length > 0) ||
        (n.comments && Object.keys(n.comments).length > 0);
      if (hasContent) retained.push({ ...n, status: undefined, pattern: undefined });
      continue;
    }
    retained.push(n);
  }

  if (added.length === 0 && removed === 0) return { kind: 'no-change' };
  return { kind: 'applied', nonShootDates: [...retained, ...added], added, removed };
}
