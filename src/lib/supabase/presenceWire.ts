/**
 * Shared presence wire primitives — the tiny "never trust a payload" readers
 * every parser in the presence modules builds on (presence.ts and the peer-drag
 * protocol in presenceDrag.ts). Kept in their own module so the two protocol
 * modules share ONE implementation instead of growing a second copy.
 */

/** A non-empty string, length-capped (first match wins, extra is sliced off). */
export function str(v: unknown, max = 240): string | null {
  return typeof v === 'string' && v.length > 0 ? v.slice(0, max) : null;
}

/** A finite number (NaN/Infinity/strings all read as "missing"). */
export function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
