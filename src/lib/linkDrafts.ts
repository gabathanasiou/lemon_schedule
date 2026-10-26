import type { Link } from '../types';
import { getFieldItems } from './categories';
import { getOutgoingLinks, makeLink } from './links';

/**
 * Draft rows for a link card (roadmap 308). ONE representation for the Link
 * Manager and the Element View panel: a row is a linked "category" + a comma
 * list of values. Synthetic categories `crew` and `location` are the
 * non-element targets; every other key is a real element category.
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

/** One row per linked category for one element anchor (comma lists joined). */
export function draftRowsFromLinks(
  links: Link[] | undefined,
  anchorCategory: string,
  anchorValue: string,
): LinkDraftRow[] {
  const byCategory = new Map<string, LinkDraftRow>();
  for (const l of getOutgoingLinks(links, 'element', anchorCategory, anchorValue)) {
    const key = l.linkedKind === 'crew' ? CREW_TARGET : l.linkedKind === 'location' ? LOCATION_TARGET : (l.linkedCategory || '');
    if (!key) continue;
    const row = byCategory.get(key);
    if (!row) {
      byCategory.set(key, { id: l.id, linkedCategory: key, linkedValue: l.linkedValue });
      continue;
    }
    const items = getFieldItems(key, row.linkedValue);
    const exists = items.some(v => key === 'cast' ? v === l.linkedValue : v.toLowerCase() === l.linkedValue.toLowerCase());
    if (!exists) row.linkedValue = [...items, l.linkedValue].join(', ');
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
    for (const value of getFieldItems(row.linkedCategory, row.linkedValue)) {
      const key = `${row.linkedCategory}\u0000${row.linkedCategory === 'cast' ? value : value.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (row.linkedCategory === CREW_TARGET) {
        out.push(makeLink('element', anchorCategory, anchorValue, 'crew', undefined, value));
      } else if (row.linkedCategory === LOCATION_TARGET) {
        out.push(makeLink('element', anchorCategory, anchorValue, 'location', undefined, value));
      } else {
        out.push(makeLink('element', anchorCategory, anchorValue, 'element', row.linkedCategory, value));
      }
    }
  }
  return out;
}
