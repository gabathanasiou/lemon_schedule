/**
 * The ONE presence-motion model (roadmap 229 S3 pointers, reused by the
 * roadmap 235 drag ghosts): exponential approach toward a target point.
 *
 * A plain CSS transition must NOT be used for these — the cursor feed is
 * ~12/s, so every update restarted the transition mid-flight and the pointer
 * stuttered instead of gliding (reported 2026-10-15). Callers own the rAF loop
 * (and write the transform per frame); this module owns the math so every
 * gliding presence surface eases identically.
 */

/** Time constant to close 63% of the distance to the target (~110ms reads as
 *  a smooth chase against the ~12/s cursor feed). */
export const SMOOTH_TAU_MS = 110;
/** Distance below which the point is simply ON target. */
export const SNAP_PX = 0.4;

export interface GlidePoint {
  left: number;
  top: number;
}

/** Step `cur` toward `target` in place; snaps onto the target (returns true)
 *  once within `SNAP_PX`. `reduced` snaps instantly (prefers-reduced-motion). */
export function glideStep(cur: GlidePoint, target: GlidePoint, dtMs: number, reduced = false): boolean {
  const k = reduced ? 1 : 1 - Math.exp(-Math.min(64, dtMs) / SMOOTH_TAU_MS);
  cur.left += (target.left - cur.left) * k;
  cur.top += (target.top - cur.top) * k;
  if (Math.abs(target.left - cur.left) < SNAP_PX && Math.abs(target.top - cur.top) < SNAP_PX) {
    cur.left = target.left;
    cur.top = target.top;
    return true;
  }
  return false;
}
