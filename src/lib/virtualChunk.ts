import React, { useEffect, useRef } from 'react';

/**
 * Row-level virtualization for the stripboard.
 *
 * Every project keeps all its rows in a single container (sections are
 * daybreak groups), so the day-level render window in ScheduleTab never
 * triggers — all rows stay mounted. Rendering 270+ rows of ribbon grids is
 * what made the stripboard lag on slower engines (iPad Safari).
 *
 * Rows are wrapped in "chunks" carrying `content-visibility: auto`
 * (skips layout/paint of offscreen chunks, with a remembered intrinsic size
 * so scroll metrics stay right). `applyChunkVisibility` (called from the
 * scroller's scroll handler) force-renders chunks inside a viewport buffer so
 * fast scrolling never flashes white.
 *
 * NOTE: IntersectionObserver + rootMargin can't drive this — elements with
 * `content-visibility: auto` that are currently skipped report
 * `isIntersecting: false` even inside the rootMargin (Chrome).
 */

/** Render this many scroller-heights of rows above/below the viewport. */
const BUFFER_VIEWPORTS = 1.5;

/**
 * Toggles .cv-visible on each .cv-chunk inside `scroller`.
 *
 * `mode` picks how chunk positions are measured:
 * - `offset` (default) — `offsetTop` against `scrollTop`. Requires the chunks'
 *   offset parent to be the scroller (the stripboard).
 * - `rect` — viewport rects against the scroller's rect. For scrollers whose
 *   chunks sit inside a positioned page sheet (the Script tab), where
 *   `offsetTop` is relative to that ancestor instead.
 *
 * All measurements happen in one phase before any class write: interleaving
 * reads with `classList.toggle` would force a fresh layout per chunk.
 */
export function applyChunkVisibility(scroller: HTMLElement, mode: 'offset' | 'rect' = 'offset'): void {
  const buffer = Math.round(scroller.clientHeight * BUFFER_VIEWPORTS);
  const chunks = scroller.querySelectorAll('.cv-chunk');
  const n = chunks.length;
  if (n === 0) return;
  const tops = new Array<number>(n);
  const bottoms = new Array<number>(n);
  let from: number;
  let to: number;
  if (mode === 'rect') {
    const sr = scroller.getBoundingClientRect();
    from = sr.top - buffer;
    to = sr.bottom + buffer;
    for (let i = 0; i < n; i++) {
      const r = chunks[i].getBoundingClientRect();
      tops[i] = r.top;
      bottoms[i] = r.bottom;
    }
  } else {
    const viewTop = scroller.scrollTop;
    from = viewTop - buffer;
    to = viewTop + scroller.clientHeight + buffer;
    for (let i = 0; i < n; i++) {
      const c = chunks[i] as HTMLElement;
      const top = c.offsetTop;
      tops[i] = top;
      bottoms[i] = top + c.offsetHeight;
    }
  }
  for (let i = 0; i < n; i++) {
    (chunks[i] as HTMLElement).classList.toggle('cv-visible', bottoms[i] >= from && tops[i] <= to);
  }
}

/** Registers a resize listener so the buffer follows viewport changes. */
export function useChunkResize(scrollerRef: React.RefObject<HTMLElement | null>, mode: 'offset' | 'rect' = 'offset'): void {
  const ref = useRef(scrollerRef);
  ref.current = scrollerRef;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  useEffect(() => {
    const onResize = () => {
      const el = ref.current?.current;
      if (el) applyChunkVisibility(el, modeRef.current);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
}
