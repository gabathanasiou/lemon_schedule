import { useCallback, useEffect, useState } from 'react';

/**
 * Persisted per-project glide column widths (localStorage). Widths are stored
 * unscaled; callers apply the font-size scale when rendering and before saving.
 */
export function useGlideColumnWidths(storageKey: string): [Record<string, number>, (key: string, unscaledWidth: number) => void] {
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch { return {}; }
  });

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(columnWidths));
  }, [storageKey, columnWidths]);

  const setColWidth = useCallback((key: string, unscaledWidth: number) => {
    setColumnWidths(prev => ({ ...prev, [key]: Math.max(40, Math.round(unscaledWidth)) }));
  }, []);

  return [columnWidths, setColWidth];
}
