import { useCallback, useEffect, useState } from 'react';

/**
 * Persisted per-project glide column widths (localStorage). Widths are stored
 * unscaled; callers apply the font-size scale when rendering and before saving.
 */
export function useGlideColumnWidths(
  storageKey: string,
): [
  Record<string, number>,
  (key: string, unscaledWidth: number) => void,
  () => void,
  (widths: Record<string, number>) => void,
] {
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch { return {}; }
  });

  // Switching project / sheet remounts nothing — reload that key's widths.
  useEffect(() => {
    try { setColumnWidths(JSON.parse(localStorage.getItem(storageKey) || '{}')); }
    catch { setColumnWidths({}); }
  }, [storageKey]);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(columnWidths));
  }, [storageKey, columnWidths]);

  const setColWidth = useCallback((key: string, unscaledWidth: number) => {
    setColumnWidths(prev => ({ ...prev, [key]: Math.max(40, Math.round(unscaledWidth)) }));
  }, []);

  /** Replaces the whole map — the first native resize freezes the current
   *  rendered widths, so the untouched columns never snap back to design. */
  const setAllColumnWidths = useCallback((widths: Record<string, number>) => {
    const next: Record<string, number> = {};
    for (const [key, value] of Object.entries(widths)) next[key] = Math.max(40, Math.round(value));
    setColumnWidths(next);
  }, []);

  /** Clears every saved width — the caller falls back to its sizing mode
   *  (Budget/Cost: "fit columns to width"). */
  const resetColumnWidths = useCallback(() => setColumnWidths({}), []);

  return [columnWidths, setColWidth, resetColumnWidths, setAllColumnWidths];
}
