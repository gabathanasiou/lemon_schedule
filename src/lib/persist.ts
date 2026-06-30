import { useState, useEffect, useCallback, SetStateAction } from 'react';

export function usePersistState<T>(storageKey: string, defaults: T): [T, (value: SetStateAction<T>) => void, () => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      return stored ? { ...defaults, ...JSON.parse(stored) } : defaults;
    } catch {
      return defaults;
    }
  });

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(value)); } catch {}
  }, [storageKey, value]);

  const reset = useCallback(() => {
    setValue(defaults);
    try { localStorage.removeItem(storageKey); } catch {}
  }, [storageKey, defaults]);

  return [value, setValue, reset];
}

export type ViewMode = 'portrait' | 'landscape' | 'full';

const VIEW_MODE_KEY = 'lemon_schedule_view_mode';
const VIEW_WIDTHS: Record<ViewMode, number | null> = { portrait: 730, landscape: 1060, full: null };

export function useViewMode(): [ViewMode, (m: ViewMode) => void, number | null] {
  const [mode, setMode] = useState<ViewMode>(() => {
    try {
      const stored = localStorage.getItem(VIEW_MODE_KEY);
      return (stored === 'portrait' || stored === 'landscape' || stored === 'full') ? stored : 'portrait';
    } catch { return 'portrait'; }
  });

  const setViewMode = useCallback((m: ViewMode) => {
    setMode(m);
    try { localStorage.setItem(VIEW_MODE_KEY, m); } catch {}
  }, []);

  return [mode, setViewMode, VIEW_WIDTHS[mode]];
}

export type CellBorders = 'none' | 'vertical' | 'horizontal' | 'both';

const CELL_BORDERS_KEY = 'lemon_schedule_cell_borders';

export function useCellBorders(): [CellBorders, (m: CellBorders) => void] {
  const [mode, setMode] = useState<CellBorders>(() => {
    try {
      const stored = localStorage.getItem(CELL_BORDERS_KEY);
      return (stored === 'vertical' || stored === 'horizontal' || stored === 'both') ? stored : 'none';
    } catch { return 'none'; }
  });

  const setBorders = useCallback((m: CellBorders) => {
    setMode(m);
    try { localStorage.setItem(CELL_BORDERS_KEY, m); } catch {}
  }, []);

  return [mode, setBorders];
}
