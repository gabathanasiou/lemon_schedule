/**
 * The nearest ancestor that actually scrolls `el` vertically (overflow-y auto/
 * scroll with real overflow), stopping at `<body>` — a match for how the app's
 * shell nests its scrollers (each page/modal/grid owns its own). Shared by the
 * keyboard helpers (`useKeyboardDismissOnScroll`, `useKeyboardEnsureVisible`);
 * returns null when nothing scrolls (callers no-op — the document does not
 * scroll in this app).
 */
export function scrollableAncestor(el: Element | null): Element | null {
  while (el && el !== document.body) {
    const s = getComputedStyle(el);
    if (/(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 4) return el;
    el = el.parentElement;
  }
  return null;
}

/** The nearest ancestor that scrolls in EITHER axis. The page-pan blocker must
 *  recognise horizontal-only scrollers (the PageToolbar mini tab bar is
 *  `overflow-x-auto` with no vertical overflow) — treating one as "no scroller"
 *  made it preventDefault the drag, so the tab bar could not be swiped. */
export function scrollingAncestor(el: Element | null): Element | null {
  while (el && el !== document.body) {
    const s = getComputedStyle(el);
    const scrollsY = /(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 4;
    const scrollsX = /(auto|scroll)/.test(s.overflowX) && el.scrollWidth > el.clientWidth + 4;
    if (scrollsX || scrollsY) return el;
    el = el.parentElement;
  }
  return null;
}
