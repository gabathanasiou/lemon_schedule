/**
 * PostgREST page-at-a-time reader (roadmap 283, audit F11): the server caps one
 * `.select()` response at 1000 rows, so a bigger result must be walked with
 * `.range()`. `fetchPage(from, to)` returns ONE page (inclusive PostgREST
 * range) and the walk stops at the first short page — an exact multiple of the
 * page size costs one empty tail request. Errors reject through unchanged.
 */

export const SUPABASE_PAGE_SIZE = 1000;

export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => Promise<T[]>,
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += SUPABASE_PAGE_SIZE) {
    const page = await fetchPage(from, from + SUPABASE_PAGE_SIZE - 1);
    all.push(...page);
    if (page.length < SUPABASE_PAGE_SIZE) return all;
  }
}
