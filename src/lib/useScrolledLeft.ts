import { useState, useEffect } from 'react';

/**
 * True while the element is horizontally scrolled (scrollLeft > 0). Drives
 * the pinned-column shadow in manager tables — the shadow only appears once
 * content actually slides under the sticky columns.
 */
export function useScrolledLeft(ref: React.RefObject<HTMLElement | null>): boolean {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setScrolled(el.scrollLeft > 0);
    update();
    el.addEventListener('scroll', update, { passive: true });
    return () => el.removeEventListener('scroll', update);
  }, [ref]);
  return scrolled;
}