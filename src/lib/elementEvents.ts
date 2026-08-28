import { NonShootDate, ProjectRule, RuleViolation } from '../types';
import { getTypeListGroups, NON_SHOOT_ALL } from './nonShootHelpers';

/**
 * Canonical module for the Element Manager's per-element events surface
 * (roadmap item 46). Everything the element events manager needs is computed
 * here — the element's day-type events (statuses AND cards), its rules and
 * its violations. NEVER re-derive this logic in components.
 *
 * Identity follows `elementMatchId` (cast = Board ID, every other category =
 * name); rules reference cast members by ID only, so non-cast elements never
 * match a rule (`ruleRefersToElement` always false for them).
 */

/** One event group on a date: the element is marked under `status` ×
 *  `category` (`'*'` = the whole category is marked — the element is covered
 *  but not listed). Comment travels with its group. */
export interface ElementEventGroup {
  status: string;
  category: string;
  keys: string[];
  comment?: string;
}

/** The day-type events grouped per date (attachment-only — the element's
 *  marked groups via the day's status OR a card). */
export function computeElementAttachments(
  entries: NonShootDate[] | undefined,
  refKey: string,
): Map<string, ElementEventGroup[]> {
  const byDate = new Map<string, ElementEventGroup[]>();
  for (const entry of entries || []) {
    const groups: ElementEventGroup[] = [];
    for (const g of getTypeListGroups(entry)) {
      if (g.keys.includes(NON_SHOOT_ALL) || g.keys.includes(refKey)) {
        groups.push({
          status: g.status,
          category: g.category,
          keys: [...g.keys],
          comment: entry.comments?.[g.status]?.[g.category],
        });
      }
    }
    if (groups.length > 0) byDate.set(entry.date, groups);
  }
  return byDate;
}

/** True when a rule references the element (rules are cast-referenced by
 *  ID — `castId` for single rules, `castIds`/`conflictCastIds` for cast
 *  rules; compare by the canonical match key). */
export function ruleRefersToElement(rule: ProjectRule, refKey: string): boolean {
  if (rule.type === 'MAX_HOURS' || rule.type === 'DATE_RESTRICTION' || rule.type === 'TIME_WINDOW') {
    return rule.castId === refKey;
  }
  if (rule.type === 'CAST_CONFLICT') {
    return rule.castIds.includes(refKey) || rule.conflictCastIds.includes(refKey);
  }
  return rule.castIds.includes(refKey);
}

export interface ElementEventsData {
  /** Date → the element's marked groups (statuses AND cards; never rule
   *  coverage — rules carry their own dates in `rules`). */
  attachments: Map<string, ElementEventGroup[]>;
  /** Every rule referencing the element (dated + every-day + cast rules). */
  rules: ProjectRule[];
  /** Firing day → violations of the element's rules only. */
  violations: Map<string, RuleViolation[]>;
}

export function computeElementEvents(
  entries: NonShootDate[] | undefined,
  refKey: string,
  rules: ProjectRule[],
  violationsByDate: Map<string, RuleViolation[]>,
): ElementEventsData {
  const allRules = rules.filter(r => ruleRefersToElement(r, refKey));

  const violations = new Map<string, RuleViolation[]>();
  for (const [date, vs] of violationsByDate || []) {
    const mine = vs.filter(v => v.ruleId && allRules.some(r => r.id === v.ruleId));
    if (mine.length > 0) violations.set(date, mine);
  }

  return { attachments: computeElementAttachments(entries, refKey), rules: allRules, violations };
}