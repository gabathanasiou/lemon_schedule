/**
 * Tab navigation between ribbon editors (per-row edit mode).
 * Moves focus to the next editable input in the current strip; when the strip
 * has no more editors, makes the next strip editable via onRowNavigate (its
 * first field auto-focuses on mount).
 */
export function advanceRibbonFocus(el: HTMLElement | null | undefined, onRowNavigate?: (rowId: string) => void): void {
  if (!el || !(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement)) return;
  const rowEl = el.closest('[data-row-id]');
  if (!rowEl) return;
  const editors = Array.from(rowEl.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea'))
    .filter(e => e.type !== 'hidden');
  const idx = editors.indexOf(el);
  const next = editors[idx + 1];
  if (next) {
    next.focus();
    next.select?.();
    next.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    return;
  }
  if (!onRowNavigate) return;
  const rows = Array.from(rowEl.parentElement?.querySelectorAll('[data-row-id]') ?? []);
  const ri = rows.indexOf(rowEl);
  const nextRow = rows[ri + 1];
  if (nextRow) {
    onRowNavigate(nextRow.getAttribute('data-row-id') || '');
    // the next strip's editors mount on the following commit - focus its
    // first editor then (Tab entry point; other nav paths focus themselves)
    setTimeout(() => {
      const first = nextRow.querySelector<HTMLInputElement | HTMLTextAreaElement>('input:not([type="hidden"]), textarea');
      if (first) {
        first.focus();
        first.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    }, 0);
  }
}
