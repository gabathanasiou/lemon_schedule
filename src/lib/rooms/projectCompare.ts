/**
 * Structural project compare (roadmap 242) — the ONE deep-equal the room uses
 * to decide whether a rebuilt state still equals `present` (a blocked undo) and
 * whether a redo's baseline is still the room's state (redo safety).
 *
 * Deliberately STRUCTURAL, not a `JSON.stringify` compare: object key ORDER is
 * an artefact of the fold history (a snapshot + replay can insert keys in a
 * different order than the incremental fold did) and is never a difference in
 * meaning. Arrays compare by index; primitives by `===`; a key whose value is
 * `undefined` reads as absent (JSON drops those on the wire).
 */
export function projectsEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  const aArray = Array.isArray(a);
  if (aArray !== Array.isArray(b)) return false;
  if (aArray) {
    const x = a as unknown[];
    const y = b as unknown[];
    if (x.length !== y.length) return false;
    for (let i = 0; i < x.length; i++) {
      if (!projectsEqual(x[i], y[i])) return false;
    }
    return true;
  }
  const x = a as Record<string, unknown>;
  const y = b as Record<string, unknown>;
  const xKeys = Object.keys(x).filter(k => x[k] !== undefined);
  const yKeys = Object.keys(y).filter(k => y[k] !== undefined);
  if (xKeys.length !== yKeys.length) return false;
  for (const key of xKeys) {
    if (!Object.prototype.hasOwnProperty.call(y, key) || y[key] === undefined) return false;
    if (!projectsEqual(x[key], y[key])) return false;
  }
  return true;
}
