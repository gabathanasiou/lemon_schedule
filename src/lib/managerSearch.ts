/**
 * Deep manager search (roadmap 172). The sidebar used to filter category
 * NAMES only; this module searches every record's fields (crew phone numbers,
 * location addresses, cast performer details, Board IDs …) with comma-separated
 * tags. All tags must match (AND), matching is case-insensitive.
 *
 * Pure logic — the manager shells build `SearchRecord`s from their own configs
 * and hand the hits to `SidebarNav`.
 */

export interface ManagerSearchField {
  key: string;
  label: string;
  value: string;
}

export interface ManagerSearchRecord {
  categoryKey: string;
  categoryLabel: string;
  rowKey: string;
  /** The row's display name (identity field). */
  label: string;
  fields: ManagerSearchField[];
}

export interface ManagerSearchHit {
  categoryKey: string;
  categoryLabel: string;
  rowKey: string;
  label: string;
  /** A short "Field: value" snippet for the matched attribute (when the row
   *  label itself was not what matched). */
  detail?: string;
}

/** Comma-separated tags, trimmed and lowercased; empty segments dropped. */
export function parseSearchTags(query: string): string[] {
  return query.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
}

function detailFor(record: ManagerSearchRecord, tags: string[], labelMatch: boolean): string | undefined {
  if (labelMatch) return undefined;
  for (const tag of tags) {
    for (const field of record.fields) {
      if (!field.value || !field.value.toLowerCase().includes(tag)) continue;
      const value = field.value.trim();
      const short = value.length > 48 ? `${value.slice(0, 47)}…` : value;
      return `${field.label}: ${short}`;
    }
  }
  return undefined;
}

/** Does one record match every tag? */
export function matchRecord(record: ManagerSearchRecord, tags: string[]): { matched: boolean; detail?: string } {
  if (tags.length === 0) return { matched: false };
  const label = record.label.toLowerCase();
  const category = record.categoryLabel.toLowerCase();
  const values = record.fields.map(f => f.value.toLowerCase());
  const haystack = [label, category, ...values].join('\n');
  if (!tags.every(t => haystack.includes(t))) return { matched: false };
  const labelMatch = tags.every(t => label.includes(t) || category.includes(t));
  return { matched: true, detail: detailFor(record, tags, labelMatch) };
}

/** All matching records, in category/record order, one hit per record. */
export function searchManagerRecords(records: ManagerSearchRecord[], query: string): ManagerSearchHit[] {
  const tags = parseSearchTags(query);
  if (tags.length === 0) return [];
  const out: ManagerSearchHit[] = [];
  for (const record of records) {
    const { matched, detail } = matchRecord(record, tags);
    if (!matched) continue;
    out.push({
      categoryKey: record.categoryKey,
      categoryLabel: record.categoryLabel,
      rowKey: record.rowKey,
      label: record.label,
      detail,
    });
  }
  return out;
}
