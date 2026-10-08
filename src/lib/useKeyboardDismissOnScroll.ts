import { useEffect } from 'react';
import { IS_COARSE } from './device';

/**
 * Native `UIScrollView.keyboardDismissMode = .onDrag`, brought to the touch
 * web: when a finger drags a scrollable surface that does NOT contain the
 * focused editor, the keyboard dismisses instead of the page fighting the
 * gesture. Scrolling a surface the field lives in (a form body, a grid) keeps
 * the keyboard — dragging within the editing context should not abort the
 * edit.
 *
 * HIG (Virtual keyboards · iOS/iPadOS): the keyboard is part of the layout —
 * keep it and the interface from covering each other. Safari only dismisses
 * on document scroll; our shell owns its inner scrollers, so the gesture has
 * to be honored here.
 */
export function useKeyboardDismissOnScroll() {
  useEffect(() => {
    if (!IS_COARSE || typeof document === 'undefined') return;
    let startY: number | null = null;
    let startTarget: Element | null = null;

    const scrollableAncestor = (el: Element | null): Element | null => {
      while (el && el !== document.body) {
        const s = getComputedStyle(el);
        if (/(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 4) return el;
        el = el.parentElement;
      }
      return null;
    };

    const onTouchStart = (e: TouchEvent) => {
      startY = e.touches[0]?.clientY ?? null;
      startTarget = e.target as Element | null;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (startY == null) return;
      const y = e.touches[0]?.clientY ?? startY;
      if (Math.abs(y - startY) < 12) return; // a tap, not a drag
      startY = null;
      const active = document.activeElement as HTMLElement | null;
      if (!active) return;
      const tag = active.tagName;
      if (tag !== 'INPUT' && tag !== 'TEXTAREA' && !active.isContentEditable) return;
      // Editor-attached floating panels (`.click-outside-ignore` — the
      // EntityDropdown/Autocomplete/ref panels the field itself opened) are
      // an extension of the edit, even though they portal to <body> and never
      // contain the input. Scrolling the suggestion list must NOT blur: the
      // editor's commit-on-blur would close the dropdown mid-scroll
      // (roadmap 206).
      if (startTarget?.closest?.('.click-outside-ignore')) return;
      const scroller = scrollableAncestor(startTarget);
      // Dragging the surface the field lives in keeps the keyboard; dragging
      // anything else (list, page) dismisses it.
      if (scroller && scroller.contains(active)) return;
      active.blur();
    };
    const onTouchEnd = () => { startY = null; startTarget = null; };

    document.addEventListener('touchstart', onTouchStart, { passive: true, capture: true });
    document.addEventListener('touchmove', onTouchMove, { passive: true, capture: true });
    document.addEventListener('touchend', onTouchEnd, { passive: true, capture: true });
    document.addEventListener('touchcancel', onTouchEnd, { passive: true, capture: true });
    return () => {
      document.removeEventListener('touchstart', onTouchStart, { capture: true });
      document.removeEventListener('touchmove', onTouchMove, { capture: true });
      document.removeEventListener('touchend', onTouchEnd, { capture: true });
      document.removeEventListener('touchcancel', onTouchEnd, { capture: true });
    };
  }, []);
}
