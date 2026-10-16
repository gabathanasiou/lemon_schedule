import { useEffect } from 'react';
import { IS_COARSE } from './device';
import { scrollableAncestor } from './scrollable';

/**
 * The document must never pan (roadmap 273): the frame is a window, and the
 * phone shell's bleed (roadmap 267) gives the document real scroll range by
 * design (a fixed shell was tried instead and kills the bleed — iOS clips
 * fixed paint at the inner viewport). A finger drag on any surface WITHOUT
 * its own scroller (the sticky header, toolbar gaps, sheet whitespace) would
 * otherwise pan the whole frame and leave it stuck, so exactly those gestures
 * are blocked. Scroller drags pass through untouched; two-finger pinch-zoom
 * keeps working; drags inside text fields (caret/selection) pass too
 * (overlays-and-keyboard touchmove etiquette, apple-web-app skill §6).
 *
 * Remaining document-scroll sources: overscroll CHAINS are contained by
 * `* { overscroll-behavior-y: contain }` (index.css, touch only), and the
 * keyboard's own focus-scroll is snapped home by `useKeyboardEnsureVisible`.
 */
export function useBlockPagePan(): void {
  useEffect(() => {
    if (!IS_COARSE || typeof document === 'undefined') return;
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 1) return; // pinch-zoom must keep working
      const target = e.target;
      if (!(target instanceof Element)) return;
      // Text entry / selection gestures belong to the field, never the page.
      if (target.closest('input, textarea, [contenteditable="true"]')) return;
      // A surface with its own scroller handles the gesture natively.
      if (scrollableAncestor(target)) return;
      if (e.cancelable) e.preventDefault();
    };
    document.addEventListener('touchmove', onTouchMove, { passive: false, capture: true });
    return () => document.removeEventListener('touchmove', onTouchMove, { capture: true });
  }, []);
}
