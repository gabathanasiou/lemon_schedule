import type { CastMember } from '../../types';
import type { ImportCharacter } from './shared';

/**
 * Build the import's name → cast-id map, REUSING an existing member's id when
 * the (uppercased) name already exists — cast is referenced by id, so
 * re-importing must never create a duplicate member for the same name. Only
 * genuinely new characters get fresh sequential Board IDs (in the given order,
 * skipping ids already in use).
 */
export function buildCastIdMap(
  orderedCharacters: ImportCharacter[],
  existingCastMembers: CastMember[],
  startAt = 1,
): Map<string, string> {
  const byName = new Map<string, string>();
  const used = new Set<string>();
  for (const c of existingCastMembers || []) {
    byName.set(c.name.toUpperCase(), String(c.id));
    used.add(String(c.id));
  }

  let next = startAt;
  const map = new Map<string, string>();
  for (const ch of orderedCharacters) {
    const key = ch.name.toUpperCase();
    const existing = byName.get(key);
    if (existing) {
      map.set(ch.name, existing);
      continue;
    }
    while (used.has(String(next))) next++;
    map.set(ch.name, String(next));
    used.add(String(next));
    next++;
  }
  return map;
}

/** First unused sequential Board ID (for the UI hint). */
export function firstFreeCastId(existingCastMembers: CastMember[]): number {
  const used = new Set((existingCastMembers || []).map(c => String(c.id)));
  let n = 1;
  while (used.has(String(n))) n++;
  return n;
}
