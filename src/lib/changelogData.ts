/**
 * Lazy access to the public CHANGELOG.md (audit P7).
 *
 * The file is ~95 KB of raw markdown; importing it statically put the whole
 * string literal into the entry chunk and parsed its ~1 000 lines at boot just
 * to read one title. The dynamic import gives Rollup one separate chunk, fetched
 * only when the boot lockup or What's New asks for it — and both share this one
 * promise, so the second caller reuses the first fetch.
 */
import { parseChangelog, type ChangelogDay } from './changelog';

let daysPromise: Promise<ChangelogDay[]> | null = null;

/** The parsed changelog days, newest first. Cached for the page's lifetime. */
export function loadChangelogDays(): Promise<ChangelogDay[]> {
  if (!daysPromise) {
    daysPromise = import('../../CHANGELOG.md?raw')
      .then(({ default: raw }) => parseChangelog(raw))
      .catch(error => {
        // A deploy can rotate the chunk URL under a long-lived tab. The
        // changelog is a nice-to-have, so a miss reads as "no updates" (and
        // resets the cache so the next open retries) instead of throwing.
        daysPromise = null;
        console.warn('[changelog] load failed:', error instanceof Error ? error.message : String(error));
        return [];
      });
  }
  return daysPromise;
}

/** The newest day's title — the boot screen's one-line "what's new". */
export async function loadLatestChangelogTitle(): Promise<string | undefined> {
  return (await loadChangelogDays())[0]?.title;
}
