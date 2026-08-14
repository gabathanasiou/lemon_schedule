import { useEffect } from 'react';

/**
 * Native paste interception for glide grids (extracted from BreakdownTabGlide).
 *
 * Glide binds its own paste handler on the window in the capture phase when a
 * DataEditor mounts — AFTER this module is imported — and it pastes from an
 * async navigator.clipboard.read(), so a paste event we also handle would paste
 * twice (its async result lands last and wins). Registering the listener here,
 * before any DataEditor exists, guarantees our capture listener runs first,
 * claims the event, and Glide never sees it.
 *
 * Active only while at least one glide grid is mounted. Multiple mounted grids
 * in the same window each receive the paste (only one is ever visible).
 */

let installed = false;
const handlers = new Set<(text: string) => void>();

if (typeof window !== 'undefined') {
  installed = true;
  window.addEventListener('paste', (e: ClipboardEvent) => {
    if (handlers.size === 0) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    const text = e.clipboardData?.getData('text/plain');
    if (!text) return;
    e.preventDefault();
    // Glide's own paste handler sits on the same window in the same capture
    // phase — stopPropagation alone can't stop it (same-node listeners still
    // run), and its async clipboard read would paste a second time on top.
    e.stopImmediatePropagation();
    for (const h of handlers) h(text);
  }, true);
}

/** Routes window paste events to this grid's handler while mounted. */
export function useGlidePasteInterception(pasteText: (text: string) => void): void {
  useEffect(() => {
    handlers.add(pasteText);
    return () => { handlers.delete(pasteText); };
  }, [pasteText]);
}
