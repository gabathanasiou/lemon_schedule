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

/** Toggles .cv-visible on each .cv-chunk inside the stripboard scroller. */
export function applyChunkVisibility(scroller: HTMLElement): void {
  const buffer = Math.round(scroller.clientHeight * BUFFER_VIEWPORTS);
  const viewTop = scroller.scrollTop;
  const viewBottom = viewTop + scroller.clientHeight;
  const from = viewTop - buffer;
  const to = viewBottom + buffer;
  const chunks = scroller.querySelectorAll('.cv-chunk');
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i] as HTMLElement;
    const top = c.offsetTop;
    const bottom = top + c.offsetHeight;
    c.classList.toggle('cv-visible', bottom >= from && top <= to);
  }
}

/** Registers a resize listener so the buffer follows viewport changes. */
export function useChunkResize(scrollerRef: React.RefObject<HTMLElement | null>): void {
  const ref = useRef(scrollerRef);
  ref.current = scrollerRef;
  useEffect(() => {
    const onResize = () => {
      const el = ref.current?.current;
      if (el) applyChunkVisibility(el);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
}
