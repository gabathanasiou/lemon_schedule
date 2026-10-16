import { useEffect } from 'react';
import { scrollableAncestor } from './scrollable';

/** Input types that never open the on-screen keyboard (apple-web-app skill). */
const NON_TEXT_INPUT_TYPES = new Set([
  'checkbox', 'radio', 'range', 'color', 'file', 'image', 'button', 'submit', 'reset',
]);

/** Breathing room kept between the focused field and the keyboard's top edge. */
const VISIBLE_MARGIN_PX = 12;

/** Follow-up passes after focus: one once the focus event settles, one after
 *  the keyboard animation + any field-driven re-layout (EntityDropdown opens
 *  its panel on focus, which can move the field). Event-driven re-checks on
 *  `visualViewport` resize cover the keyboard's own animation. */
const SETTLE_DELAYS_MS = [0, 320];

/** True for elements the on-screen keyboard exists for. */
export function opensKeyboard(el: Element | null): el is HTMLElement {
  if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled;
  if (el instanceof HTMLInputElement) {
    return !el.readOnly && !el.disabled && !NON_TEXT_INPUT_TYPES.has(el.type);
  }
  return el instanceof HTMLElement && el.isContentEditable;
}

/**
 * Pixels to scroll so `rect` sits inside `band` — positive = push up (the
 * keyboard covers the bottom), negative = pull down (the field sits above the
 * visible band). 0 when it already fits. Pure for the unit pin.
 */
export function focusScrollDelta(
  rect: { top: number; bottom: number },
  band: { top: number; bottom: number },
): number {
  if (rect.bottom > band.bottom) return rect.bottom - band.bottom;
  if (rect.top < band.top) return rect.top - band.top;
  return 0;
}

/** Scroll the focused field into the keyboard-free band of the visual
 *  viewport — idempotent, a no-op whenever the field already fits. Also snaps
 *  the DOCUMENT home: the keyboard's focus pan can scroll it (the phone
 *  shell's bleed gives it real scroll range by design, roadmap 273) and no
 *  finger is on that gesture — the field then rides its own scroller. */
function ensureVisible(el: HTMLElement): void {
  const vv = window.visualViewport;
  if (!vv || vv.scale > 1) return; // no API, or pinch-zoomed — hands off (skill recipe)
  if (vv.height >= window.innerHeight - 1) return; // no keyboard covering the layout viewport
  const root = document.scrollingElement;
  if (root && root.scrollTop !== 0) root.scrollTop = 0;
  const delta = focusScrollDelta(el.getBoundingClientRect(), {
    top: vv.offsetTop + VISIBLE_MARGIN_PX,
    bottom: vv.offsetTop + vv.height - VISIBLE_MARGIN_PX,
  });
  if (delta === 0) return;
  scrollableAncestor(el)?.scrollBy({ top: delta });
}

/**
 * Keeps the focused field above the on-screen keyboard (roadmap 272).
 *
 * Why: Safari's own focus-scroll is unreliable on iPadOS — probe 2026-10-16
 * showed fixed modals *mostly* scroll (flaky when the field sits below the
 * fold) and plain pages never restore; the browser can leave a field under the
 * keyboard entirely. This is the deterministic net: on focus, and again while
 * the keyboard animates (visualViewport resize), the field is scrolled inside
 * its OWN scroller (`scrollableAncestor`) to sit in the visible band.
 *
 * Deliberately behavioural: desktop and keyboard-less states no-op (the band
 * equals the layout viewport), pinch-zoom is left alone, and the browser's
 * own scroll is never fought — passes only correct when the field is still
 * hidden. Mounted once in `App.tsx`; surfaces MUST NOT hand-roll their own
 * focus scrolling. Sibling: `useKeyboardDismissOnScroll` (dismiss on drag).
 */
export function useKeyboardEnsureVisible(): void {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    let timers: number[] = [];
    const clearTimers = () => {
      for (const t of timers) clearTimeout(t);
      timers = [];
    };

    const scheduleFor = (el: HTMLElement) => {
      clearTimers();
      for (const delay of SETTLE_DELAYS_MS) {
        timers.push(window.setTimeout(() => {
          // Focus may have moved on (and the field may be detached) by now.
          if (document.activeElement !== el && !el.contains(document.activeElement)) return;
          ensureVisible(el);
        }, delay));
      }
    };

    const onFocusIn = (e: FocusEvent) => {
      if (opensKeyboard(e.target as Element | null)) scheduleFor(e.target as HTMLElement);
    };
    const onViewportResize = () => {
      const active = document.activeElement;
      if (opensKeyboard(active)) ensureVisible(active);
    };

    document.addEventListener('focusin', onFocusIn, true);
    window.visualViewport?.addEventListener('resize', onViewportResize);
    return () => {
      clearTimers();
      document.removeEventListener('focusin', onFocusIn, true);
      window.visualViewport?.removeEventListener('resize', onViewportResize);
    };
  }, []);
}
