import { parseSearchTags } from '@gabriel/ui-kit';

/**
 * Row filter for Glide grids (roadmap 172). A grid is not a record picker, so
 * this is a plain display filter over the cells the user can SEE: type
 * comma-separated tags and a row stays only if every tag appears somewhere in
 * its displayed values (case-insensitive), the same AND semantics as the
 * manager search. The filter never touches project data — clearing it restores
 * every row.
 *
 * `wholeWordTags` (the "smart" vocabulary — see `sceneFilterVocabulary`) makes
 * those exact tags match a WHOLE word instead of a substring: `int` stops
 * matching "into"/"point" and `night` stops matching "Overnight". Any tag not
 * in the set keeps substring matching, so partial names/sets still work.
 */
export interface GlideFilterOptions {
  /** Lowercased tags that must match as whole words. */
  wholeWordTags?: ReadonlySet<string>;
}

const WORD_CHAR = /[\p{L}\p{N}]/u;

/** True when `tag` occurs in `haystack` as a complete word/token. */
function hasWholeWord(haystack: string, tag: string): boolean {
  let from = 0;
  while (from <= haystack.length) {
    const at = haystack.indexOf(tag, from);
    if (at < 0) return false;
    const before = at === 0 ? '' : haystack[at - 1];
    const after = at + tag.length >= haystack.length ? '' : haystack[at + tag.length];
    if (!WORD_CHAR.test(before) && !WORD_CHAR.test(after)) return true;
    from = at + 1;
  }
  return false;
}

export function filterGlideRows<T>(
  rows: readonly T[],
  query: string,
  valuesOf: (row: T) => readonly string[],
  options?: GlideFilterOptions,
): T[] {
  const tags = parseSearchTags(query);
  if (tags.length === 0) return rows as T[];
  const wholeWordTags = options?.wholeWordTags;
  return rows.filter(row => {
    const haystack = valuesOf(row)
      .filter(Boolean)
      .join('\n')
      .toLowerCase();
    return tags.every(tag =>
      wholeWordTags?.has(tag) ? hasWholeWord(haystack, tag) : haystack.includes(tag));
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
