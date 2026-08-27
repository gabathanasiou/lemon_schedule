import { NonShootDate, ProjectRule, RuleType, RuleViolation } from '../types';
import { getTypeListGroups, NON_SHOOT_ALL, isAllKeys, resolveElementName } from './nonShootHelpers';
import { getMarkableDayTypes, getDayType } from './dayTypes';
import { getLabel, DEFAULT_CATEGORY_LABELS, ELEMENT_CATEGORIES } from './categories';

/**
 * Canonical module for the Calendar Events surface (roadmap items 45/46).
 * Everything event-related that the UI needs is computed here — the card
 * model, rule-run splitting, and the date permutations for drags. NEVER
 * re-derive this logic in components.
 *
 * Events are NOT a new data model: a day's "events" are its
 * `NonShootDate` entry (status + `lists` attachments) plus date-scoped
 * rules (`rule.dates`) — nothing is non-shoot-specific.
 */

/* ------------------------------------------------------------------ */
/* Card model                                                          */
/* ------------------------------------------------------------------ */

export type EventCard =
  | { id: string; kind: 'status'; dateKey: string; statusKey: string }
  | { id: string; kind: 'attachment'; dateKey: string; status: string; category: string; keys: string[]; all: boolean; comment?: string }
  /** One card per rule per date. `everyday` = the rule has no dates (or is a
   *  CAST_* rule) and therefore shows a card on every calendar day —
   *  display-only (no drag/delete). `violated`/`message` = this rule is
   *  broken on this day (conflict emphasis). */
  | { id: string; kind: 'rule'; dateKey: string; rule: ProjectRule; everyday: boolean; violated: boolean; message?: string };

export function eventCardId(card: EventCard): string {
  return card.id;
}

export const cardDateKey = (card: EventCard): string => card.dateKey;

/* ------------------------------------------------------------------ */
/* Filter model (persisted via arrays — Sets aren't serializable)      */
/* ------------------------------------------------------------------ */

export interface EventsFilter {
  /** null = all statuses shown, array = only these day-type keys. */
  statuses: string[] | null;
  attachments: boolean;
  flags: boolean;
  /** null = all rule types shown, array = only these types. */
  rules: RuleType[] | null;
}

export const DEFAULT_EVENTS_FILTER: EventsFilter = {
  statuses: null,
  attachments: true,
  flags: true,
  rules: null,
};

export function filterCard(card: EventCard, filter: EventsFilter | undefined): boolean {
  if (!filter) return true;
  switch (card.kind) {
    case 'status':
      return filter.statuses == null || filter.statuses.includes(card.statusKey);
    case 'attachment':
      return !!filter.attachments && (filter.statuses == null || filter.statuses.includes(card.status));
    case 'rule':
      return filter.rules == null || filter.rules.includes(card.rule.type);
  }
}

/* ------------------------------------------------------------------ */
/* Date helpers                                                        */
/* ------------------------------------------------------------------ */

/** Sorted ascending ISO date keys. */
export function sortDateKeys(dates: string[]): string[] {
  return [...dates].sort((a, b) => a.localeCompare(b));
}

/* ------------------------------------------------------------------ */
/* Day events assembly                                                 */
/* ------------------------------------------------------------------ */

/** Rank of a day type key in the manager's order (unknowns sort last). */
export function typeRankOf(project: any, status: string): number {
  const typeOrder = getMarkableDayTypes(project).map(t => t.key);
  const i = typeOrder.indexOf(status);
  return i === -1 ? typeOrder.length : i;
}

/** Rank of an attachment category: cast first, then ELEMENT_CATEGORIES order. */
export function categoryRankOf(category: string): number {
  if (category === 'cast') return 0;
  const i = ELEMENT_CATEGORIES.findIndex(c => c.key === category);
  return i === -1 ? ELEMENT_CATEGORIES.length : 1 + i;
}

/** Cards for ONE day, sorted: status → attachments → rules. */
export function computeDayEvents(
  project: any,
  dateKey: string,
  entry: NonShootDate | undefined | null,
  violations: RuleViolation[] | undefined | null,
  rules: ProjectRule[],
  filter?: EventsFilter,
): EventCard[] {
  const cards: EventCard[] = [];

  if (entry?.status) {
    cards.push({ id: `ev-status-${dateKey}`, kind: 'status', dateKey, statusKey: entry.status });
  }

  const groups = getTypeListGroups(entry).sort((a, b) => {
    const r = typeRankOf(project, a.status) - typeRankOf(project, b.status);
    if (r !== 0) return r;
    return categoryRankOf(a.category) - categoryRankOf(b.category);
  });
  const nameOf = (key: string, category: string) => resolveElementName(key, category, project);
  for (const g of groups) {
    const keys = isAllKeys(g.keys) ? g.keys : [...g.keys].sort((a, b) => nameOf(a, g.category).localeCompare(nameOf(b, g.category)));
    cards.push({
      id: `ev-att-${dateKey}-${g.status}-${g.category}`,
      kind: 'attachment',
      dateKey,
      status: g.status,
      category: g.category,
      keys: g.keys,
      all: isAllKeys(g.keys),
      comment: entry?.comments?.[g.status]?.[g.category],
    });
  }

  // Rules: one card per date for dated rules; every-day/global rules get a
  // card on EVERY day (display-only). A violated rule carries its message.
  for (const rule of rules) {
    const hasDates = 'dates' in rule && rule.dates != null && rule.dates.length > 0;
    if (hasDates && !rule.dates!.includes(dateKey)) continue;
    const v = violations?.find(v => v.ruleId === rule.id);
    cards.push({
      id: `ev-rule-${dateKey}-${rule.id}`,
      kind: 'rule',
      dateKey,
      rule,
      everyday: !hasDates,
      violated: !!v,
      message: v?.message,
    });
  }

  return cards.filter(c => filterCard(c, filter));
}

/* ------------------------------------------------------------------ */
/* Date permutations (day drag in events mode)                         */
/* ------------------------------------------------------------------ */

/**
 * Applies a date mapping to the version's event state — `NonShootDate`
 * entries exchange `.date` and every rule's `dates` get the same
 * transposition. A permutation (bijection over the involved dates) never
 * collides: a rule covering both swapped dates stays, one covering only one
 * follows the day.
 */
export function applyDatePermutation(
  nonShootDates: NonShootDate[],
  rules: ProjectRule[],
  mapping: Map<string, string>,
): { nonShootDates: NonShootDate[]; rules: ProjectRule[] } {
  const mapDate = (d: string) => mapping.get(d) ?? d;

  const nextEntries = new Map<string, NonShootDate>();
  for (const ns of nonShootDates || []) {
    const next = { ...ns, date: mapDate(ns.date) };
    nextEntries.set(next.date, next);
  }
  const nextNonShootDates = Array.from(nextEntries.values());

  const nextRules = rules.map(rule => {
    if (!('dates' in rule) || !rule.dates?.length) return rule;
    const seen = new Set<string>();
    const dates = sortDateKeys(rule.dates.map(mapDate));
    const deduped = dates.filter(d => (seen.has(d) ? false : (seen.add(d), true)));
    return { ...rule, dates: deduped } as ProjectRule;
  });

  return { nonShootDates: nextNonShootDates, rules: nextRules };
}

export type PermutationMode = 'swap' | 'before' | 'after';

/**
 * Builds the date mapping for an events-mode day drag over `sortedDates` (the
 * full visible-day list — must include any date a rule covers in the range).
 * `swap` exchanges the two days; `before`/`after` rotate the range so the
 * source day lands right before/after the target day (every involved date
 * shifts by one — a bijection, so `NonShootDate` entries and rule dates can
 * be mapped without collisions).
 */
export function buildPermutation(sortedDates: string[], sourceDate: string, targetDate: string, mode: PermutationMode): Map<string, string> {
  const i0 = sortedDates.indexOf(sourceDate);
  const j = sortedDates.indexOf(targetDate);
  if (i0 === -1 || j === -1 || i0 === j) return new Map();
  const mapping = new Map<string, string>();
  if (mode === 'swap') {
    mapping.set(sourceDate, targetDate);
    mapping.set(targetDate, sourceDate);
    return mapping;
  }
  const len = sortedDates.length;
  // insert mode: the source day ends at position j2 (the slot right after
  // the target for 'after'; clamped to the last slot).
  let j2 = mode === 'before' ? j : Math.min(j + 1, len - 1);
  if (j2 === i0) return new Map();
  const lo = Math.min(i0, j2);
  const hi = Math.max(i0, j2);
  const range = sortedDates.slice(lo, hi + 1);
  // rotate right so the source element (at i0) lands at j2
  const k = (j2 - i0 + range.length) % range.length;
  if (k === 0) return new Map();
  const rotated = [...range.slice(range.length - k), ...range.slice(0, range.length - k)];
  range.forEach((d, i) => mapping.set(d, rotated[i]));
  return mapping;
}

/* ------------------------------------------------------------------ */
/* Single-card / chip drags                                            */
/* ------------------------------------------------------------------ */

export interface MoveNonShootDateResult {
  next: NonShootDate[];
  changed: boolean;
}

/**
 * Moves the entry of `fromDate` to `toDate` — swapping `.date` with an
 * existing entry on the target (exact swap semantics, no merge).
 */
export function moveNonShootDate(nonShootDates: NonShootDate[], fromDate: string, toDate: string): MoveNonShootDateResult {
  if (fromDate === toDate) return { next: nonShootDates, changed: false };
  const entries = nonShootDates || [];
  const src = entries.find(n => n.date === fromDate);
  if (!src) return { next: nonShootDates, changed: false };
  const tgt = entries.find(n => n.date === toDate);
  const next = entries.map(n => {
    if (n.date === fromDate) return { ...n, date: toDate };
    if (tgt && n.date === toDate) return { ...n, date: fromDate };
    return n;
  });
  if (tgt) {
    // entry ordering: re-sort by date for stable storage
    next.sort((a, b) => a.date.localeCompare(b.date));
  }
  return { next, changed: true };
}

export type RuleDateOpResult =
  | { changed: true; dates: string[] | undefined }
  | { changed: false; blocked: true };

/** Moves ONE date of a rule to `targetDate` (rule-card drag): the source date
 *  leaves, the target joins. `DATE_RESTRICTION` floors at one date (moving
 *  its last date is blocked); date-optional types drop to "every day"
 *  (dates become undefined) when the last date moves. */
export function moveRuleDate(rule: ProjectRule, fromDate: string, toDate: string): RuleDateOpResult {
  if (!('dates' in rule) || !rule.dates?.length || fromDate === toDate) return { changed: false, blocked: true };
  const remaining = rule.dates.filter(d => d !== fromDate);
  if (remaining.length === 0) {
    if (rule.type === 'DATE_RESTRICTION') return { changed: false, blocked: true };
    return { changed: true, dates: [toDate] };
  }
  return { changed: true, dates: sortDateKeys([...remaining, toDate]) };
}

/** Removes ONE date from a rule (card delete). Same floor rules as
 *  `moveRuleDate` — removing a no-date rule's date is always blocked. */
export function removeRuleDate(rule: ProjectRule, dateKey: string): RuleDateOpResult {
  if (!('dates' in rule) || !rule.dates?.length) return { changed: false, blocked: true };
  const remaining = rule.dates.filter(d => d !== dateKey);
  if (remaining.length === rule.dates.length) return { changed: false, blocked: true };
  if (remaining.length === 0) {
    if (rule.type === 'DATE_RESTRICTION') return { changed: false, blocked: true };
    return { changed: true, dates: undefined };
  }
  return { changed: true, dates: sortDateKeys(remaining) };
}

/** Rebuilds a rule with new dates (used by chip drags / day permutations).
 *  Only meaningful for date-scoped rules — the callers narrow. */
export function withRuleDates(rule: ProjectRule & { dates?: string[] }, dates: string[] | undefined): ProjectRule {
  return dates === undefined
    ? { ...rule, dates: undefined } as ProjectRule
    : { ...rule, dates: sortDateKeys([...new Set(dates)]) } as ProjectRule;
}

/* ------------------------------------------------------------------ */
/* Attachment merge (batch drag into a target day)                     */
/* ------------------------------------------------------------------ */

/**
 * Merges an attachment card's keys into the target entry's lists for its
 * status × category (append without duplicates; NO_DUP with `'*'`).
 * A comment travels with the group when provided.
 */
export function mergeAttachmentInto(
  entry: NonShootDate | undefined,
  status: string,
  category: string,
  keys: string[],
  comment?: string,
): NonShootDate {
  const lists = { ...(entry?.lists || {}) };
  const statusLists = { ...(lists[status] || {}) };
  const prev = statusLists[category] || [];
  const merged = [...prev];
  for (const k of keys) {
    if (k === NON_SHOOT_ALL) {
      return {
        ...(entry || { date: entry?.date || '' }),
        lists: { ...lists, [status]: { ...statusLists, [category]: [NON_SHOOT_ALL] } },
        ...(comment ? { comments: { ...(entry?.comments || {}), [status]: { ...(entry?.comments?.[status] || {}), [category]: comment } } } : {}),
      };
    }
    if (!merged.includes(k)) merged.push(k);
  }
  const nextLists = { ...lists, [status]: { ...statusLists, [category]: merged } };
  return {
    ...(entry || { date: entry?.date || '' }),
    lists: nextLists,
    ...(comment ? { comments: { ...(entry?.comments || {}), [status]: { ...(entry?.comments?.[status] || {}), [category]: comment } } } : {}),
  };
}

/**
 * Removes an attachment group's keys from an entry (batch-drag source side).
 * The group's comment is dropped with it. Returns `undefined` when the entry
 * loses its status AND all its lists and should be dropped entirely.
 */
export function removeAttachmentFrom(
  entry: NonShootDate | undefined,
  status: string,
  category: string,
  keys: string[],
): NonShootDate | undefined {
  if (!entry) return undefined;
  const lists = { ...(entry.lists || {}) };
  const statusLists = { ...(lists[status] || {}) };
  const prev = statusLists[category] || [];
  const removing = keys.includes(NON_SHOOT_ALL) ? prev : keys;
  const remaining = prev.filter(k => !removing.includes(k) && k !== NON_SHOOT_ALL);
  if (remaining.length > 0) {
    statusLists[category] = remaining;
    lists[status] = statusLists;
  } else {
    delete statusLists[category];
    if (Object.keys(statusLists).length > 0) lists[status] = statusLists;
    else delete lists[status];
  }
  const comments = { ...(entry.comments || {}) };
  const statusComments = { ...(comments[status] || {}) };
  if (statusComments[category] !== undefined) {
    delete statusComments[category];
    if (Object.keys(statusComments).length > 0) comments[status] = statusComments;
    else delete comments[status];
  }
  if (Object.keys(lists).length === 0 && !entry.status) return undefined;
  const next: NonShootDate = { date: entry.date, ...(entry.status ? { status: entry.status } : {}) };
  if (Object.keys(lists).length > 0) next.lists = lists;
  if (Object.keys(comments).length > 0) next.comments = comments;
  return next;
}

/** Day-type label helper shared by cards (attachment card headers). */
export function categoryLabel(category: string, project: any): string {
  return getLabel(category, DEFAULT_CATEGORY_LABELS[category] || category, project?.categoryLabels || {});
}

/** Status label for an attachment card (e.g. "Travel", "Hold", custom). */
export function statusLabel(statusKey: string, project: any): string {
  return getDayType(project, statusKey)?.label || statusKey;
}