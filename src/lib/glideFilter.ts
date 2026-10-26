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

/** Scene fields that are NOT user-facing content: stable ids and the
 *  script-anchored cut fragment (the "actual script" the grid filter must not
 *  search). */
const NON_CONTENT_SCENE_KEYS = new Set(['id', 'ghostOf', 'duplicateOf', 'cutAnchor']);

/**
 * Every value a scene exposes to the Glide Breakdown row filter: ALL of its own
 * fields — visible columns, hidden/custom breakdown categories, sheet/script
 * page numbers, scene location — not just the columns currently on screen.
 * Internal ids and the script fragment are excluded. Cast stores Board IDs, so
 * each one contributes `id name` and searching the displayed name works.
 */
export function sceneFilterValues(
  scene: Record<string, unknown>,
  castNameById: ReadonlyMap<string, string>,
): string[] {
  const values: string[] = [];
  for (const [key, raw] of Object.entries(scene)) {
    if (NON_CONTENT_SCENE_KEYS.has(key)) continue;
    if (key === 'cast') {
      for (const part of String(raw ?? '').split(',')) {
        const id = part.trim();
        if (!id) continue;
        const name = castNameById.get(id);
        values.push(name ? `${id} ${name}` : id);
      }
      continue;
    }
    if (typeof raw === 'string' || typeof raw === 'number') values.push(String(raw));
  }
  return values;
}
