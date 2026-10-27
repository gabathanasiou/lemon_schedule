/**
 * Deep manager search records (roadmap 172).
 *
 * The managers build one `ManagerSearchRecord` per row (category + row key +
 * identity label + searchable fields) and hand it to `SidebarNav` as a kit
 * `SearchMenuItem`. Matching is the KIT's (`searchMenuContent` /
 * `parseSearchTags` from `@gabriel/ui-kit`) — do not re-implement the matcher
 * here: the jump-and-flash highlight must use the exact hits the search panel
 * showed (roadmap 318).
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
  /** Right-hand subtitle — a field VALUE (cast → the artiste name), never a
   *  `"Label: value"` string: the kit matcher searches the detail text, so a
   *  field label here would make searching "board"/"phone" return every row. */
  detail?: string;
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
