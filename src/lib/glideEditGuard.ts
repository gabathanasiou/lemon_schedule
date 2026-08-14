import { useCallback, useRef } from 'react';

/**
 * Guards glide ADD-ROW creation against duplicate commits. Glide's custom
 * editors (EntityDropdown) can fire onCellEdited twice for one edit — once
 * from the editor's own commit and once from Glide's overlay close on Enter.
 * Editing an existing row is idempotent so duplicates are harmless; creating
 * from the add-row must only happen once.
 */
export function useDedupeCellCommit(windowMs = 800): (key: string) => boolean {
  const lastRef = useRef<{ key: string; time: number } | null>(null);
  return useCallback((key: string): boolean => {
    const now = Date.now();
    const last = lastRef.current;
    if (last && last.key === key && now - last.time < windowMs) return false;
    lastRef.current = { key, time: now };
    return true;
  }, [windowMs]);
}
