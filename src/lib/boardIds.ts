/**
 * Board ID primitives (roadmap 257) — numeric labels assigned per element
 * category. Leaf module: NO store imports, so load-time migrations and the
 * reducer can allocate numbers without pulling the store barrel into a cycle.
 *
 * Element-facing helpers (`boardIdOf`, `isDuplicateBoardId`) live in
 * `elements.ts` — the canonical element module — and re-export these.
 */

/** Canonical numeric form of a Board ID ('' when blank/unusable). */
export function canonicalBoardId(value: string | null | undefined): string {
  const raw = String(value ?? '').trim();
  if (!/^\d+$/.test(raw)) return '';
  return String(parseInt(raw, 10));
}

/**
 * Next free Board ID continuing AFTER the highest used number (the cast
 * Auto-ID contract): gaps are never filled automatically, and every number in
 * `used` is skipped. Non-numeric values are ignored; `7` and `07` collide.
 */
export function nextBoardId(used: Iterable<string>): string {
  const taken = new Set<string>();
  let max = 0;
  for (const raw of used) {
    const id = canonicalBoardId(raw);
    if (!id) continue;
    taken.add(id);
    max = Math.max(max, parseInt(id, 10));
  }
  let n = max + 1;
  while (taken.has(String(n))) n++;
  return String(n);
}

/** "Sort by Board ID" comparator — numeric, blanks last. */
export function compareBoardIds(a: string, b: string): number {
  const ca = canonicalBoardId(a);
  const cb = canonicalBoardId(b);
  if (!ca) return cb ? 1 : 0;
  if (!cb) return -1;
  return parseInt(ca, 10) - parseInt(cb, 10);
}
