import { normalizeTime, parseDuration } from './utils';

/**
 * Call-time expression parsing (item 99). A box accepts an ABSOLUTE time
 * (`7:30`, `730`, `7:30am`) or a RELATIVE offset (`-1h`, `-45m`, `+30m`).
 * Relative is measured from the NEXT (later) stage's call (D11). This module
 * is the single parser — TimeField, the call-times chain and the report
 * collections all go through it.
 */

export type TimeExpression =
  | { kind: 'absolute'; time: string }
  | { kind: 'relative'; minutes: number }
  | { kind: 'empty' };

export function parseTimeExpression(raw: string | undefined | null): TimeExpression {
  const s = (raw || '').trim();
  if (!s) return { kind: 'empty' };
  if (/^[+-]/.test(s)) {
    const minutes = parseDuration(s.replace(/^[+-]/, ''));
    if (!Number.isNaN(minutes) && minutes > 0) {
      return { kind: 'relative', minutes: s.startsWith('-') ? -minutes : minutes };
    }
    return { kind: 'empty' };
  }
  const time = normalizeTime(s);
  if (time) return { kind: 'absolute', time };
  return { kind: 'empty' };
}

/** True when the raw string parses to an absolute time or a relative offset. */
export function isValidTimeExpression(raw: string | undefined | null): boolean {
  return parseTimeExpression(raw).kind !== 'empty';
}

export { normalizeTime };
