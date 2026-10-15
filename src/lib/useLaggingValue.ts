import { useEffect, useState, startTransition } from 'react';

/**
 * Mirrors `value` into the tree after the current frame has been painted,
 * committing inside a transition (roadmap 263).
 *
 * Why: a header-tab click flushes synchronously (discrete event), so mounting
 * the newly selected surface lands in the SAME task as the click — the
 * stripboard builds every row there, and the pill's own position update plus
 * its glide are queued behind one uninterruptible ~100ms mount (several
 * hundred ms on iPad / bloated projects). Splitting the surface identity onto
 * this hook keeps the click task to the cheap nav/pill commit; the heavy
 * surface mounts a frame later inside a transition React can time-slice, so
 * the pill finishes its glide while the rows build.
 *
 * One rAF is deliberate: rAF callbacks run inside the frame, BEFORE its
 * style/layout/paint, and React schedules transition work as a fresh macrotask
 * — so the click frame (pill at its new position, its transition armed) always
 * paints before any mount work begins. A second rAF only delays the surface.
 *
 * Use for values that select which heavy surface is MOUNTED (tab/sub-tab
 * identity, page modes). Never for the pill/nav state itself, presence
 * publishing, or plain data props (targets, indices, categories).
 */
export function useLaggingValue<T>(value: T): T {
  const [lagged, setLagged] = useState(value);
  useEffect(() => {
    if (Object.is(lagged, value)) return;
    // ONE rAF: callbacks run inside the frame, BEFORE its style/layout/paint,
    // and React schedules transition work as a fresh macrotask — so the click
    // frame (pill at its new position, transition armed) always paints before
    // any mount work starts. A second rAF would only delay the surface.
    const raf = requestAnimationFrame(() => {
      startTransition(() => setLagged(value));
    });
    return () => cancelAnimationFrame(raf);
  }, [value, lagged]);
  return lagged;
}
