import type { Link, LinkKind } from '../types';
import { getFieldItems } from './categories';
import { getOutgoingLinks, makeLink } from './links';
import { crewDeptOfTargetId, crewDeptTargetId, isCrewDeptTargetId } from './linkTargets';

/**
 * Draft rows for a link card (roadmap 308). ONE representation for the Link
 * Manager and the Element View panel: a row is a linked "category" + a comma
 * list of values. Synthetic categories `crew` and `location` are the
 * non-element targets; every other key is a real element category.
 *
 * The crew row mixes person ids with `dept:<name>` tag tokens — the stored
 * "All <department>" association. `targetFromDraftValue` / `draftValueForLink`
 * are the ONE translation between draft tokens and canonical links; never
 * hand-roll the dept prefix anywhere else.
 */

export const CREW_TARGET = 'crew';
export const LOCATION_TARGET = 'location';

export interface LinkDraftRow {
  id: string;
  /** Element category, or CREW_TARGET / LOCATION_TARGET. */
  linkedCategory: string;
  linkedValue: string;
}

export function isSyntheticLinkCategory(category: string): boolean {
  return category === CREW_TARGET || category === LOCATION_TARGET;
}

/** Canonical link target for one draft value (crew / location / element). */
export function targetFromDraftValue(
  category: string,
  rawValue: string,
): { linkedKind: LinkKind; linkedCategory?: string; linkedValue: string } {
  if (category === CREW_TARGET) {
    return isCrewDeptTargetId(rawValue)
      ? { linkedKind: 'department', linkedValue: crewDeptOfTargetId(rawValue) }
      : { linkedKind: 'crew', linkedValue: rawValue };
  }
  if (category === LOCATION_TARGET) return { linkedKind: 'location', linkedValue: rawValue };
  return { linkedKind: 'element', linkedCategory: category, linkedValue: rawValue };
}

/** Draft row/category + value for one canonical link, or null when unlinkable. */
export function draftValueForLink(link: Link): { category: string; value: string } | null {
  if (link.linkedKind === 'crew' || link.linkedKind === 'department') {
    return {
      category: CREW_TARGET,
      value: link.linkedKind === 'department' ? crewDeptTargetId(link.linkedValue) : link.linkedValue,
    };
  }
  if (link.linkedKind === 'location') return { category: LOCATION_TARGET, value: link.linkedValue };
  if (link.linkedKind === 'element' && link.linkedCategory) {
    return { category: link.linkedCategory, value: link.linkedValue };
  }
  return null;
}

/** One row per linked category for one element anchor (comma lists joined). */
export function draftRowsFromLinks(
  links: Link[] | undefined,
  anchorCategory: string,
  anchorValue: string,
): LinkDraftRow[] {
  const byCategory = new Map<string, LinkDraftRow>();
  for (const link of getOutgoingLinks(links, 'element', anchorCategory, anchorValue)) {
    const mapped = draftValueForLink(link);
    if (!mapped) continue;
    const row = byCategory.get(mapped.category);
    if (!row) {
      byCategory.set(mapped.category, { id: link.id, linkedCategory: mapped.category, linkedValue: mapped.value });
      continue;
    }
    const items = getFieldItems(mapped.category, row.linkedValue);
    const exists = items.some(v => mapped.category === 'cast' ? v === mapped.value : v.toLowerCase() === mapped.value.toLowerCase());
    if (!exists) row.linkedValue = [...items, mapped.value].join(', ');
  }
  return [...byCategory.values()];
}

/** Canonical links for one element anchor from its draft rows. */
export function flattenLinkRows(
  anchorCategory: string,
  anchorValue: string,
  rows: LinkDraftRow[],
): Link[] {
  const out: Link[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row.linkedCategory || !row.linkedValue.trim()) continue;
    for (const rawValue of getFieldItems(row.linkedCategory, row.linkedValue)) {
      const target = targetFromDraftValue(row.linkedCategory, rawValue);
      const norm = target.linkedKind === 'element' && target.linkedCategory === 'cast'
        ? target.linkedValue
        : target.linkedValue.toLowerCase();
      const key = `${target.linkedKind}\u0000${target.linkedCategory || ''}\u0000${norm}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(makeLink('element', anchorCategory, anchorValue, target.linkedKind, target.linkedCategory, target.linkedValue));
    }
  }
  return out;
}
