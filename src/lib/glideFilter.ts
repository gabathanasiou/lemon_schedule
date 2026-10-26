import { parseSearchTags } from './managerSearch';

/**
 * Row filter for Glide grids (roadmap 172). A grid is not a record picker, so
 * this is a plain display filter over the cells the user can SEE: type
 * comma-separated tags and a row stays only if every tag appears somewhere in
 * its displayed values (case-insensitive), the same AND semantics as the
 * manager search. The filter never touches project data — clearing it restores
 * every row.
 */
export function filterGlideRows<T>(
  rows: readonly T[],
  query: string,
  valuesOf: (row: T) => readonly string[],
): T[] {
  const tags = parseSearchTags(query);
  if (tags.length === 0) return rows as T[];
  return rows.filter(row => {
    const haystack = valuesOf(row)
      .filter(Boolean)
      .join('\n')
      .toLowerCase();
    return tags.every(tag => haystack.includes(tag));
  });
}
