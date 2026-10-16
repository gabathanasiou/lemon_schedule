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
