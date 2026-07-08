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

export type KeyboardMode = 'on' | 'off';

const KEYBOARD_MODE_KEY = 'lemon_schedule_keyboard_mode';

let _keyboardMode: KeyboardMode = 'off';
let _keyboardModeListeners = new Set<() => void>();

export function getKeyboardMode(): KeyboardMode {
  return _keyboardMode;
}

export function setKeyboardMode(m: KeyboardMode) {
  _keyboardMode = m;
  try { localStorage.setItem(KEYBOARD_MODE_KEY, m); } catch {}
  _keyboardModeListeners.forEach(fn => fn());
}

export function useKeyboardMode(): [KeyboardMode, (m: KeyboardMode) => void] {
  const [, tick] = useState(0);
  useEffect(() => {
    const stored = (() => {
      try {
        const s = localStorage.getItem(KEYBOARD_MODE_KEY);
        return s === 'on' || s === 'off' ? s : 'off';
      } catch { return 'off' as const; }
    })();
    if (stored !== _keyboardMode) {
      _keyboardMode = stored;
    }
    const fn = () => tick(n => n + 1);
    _keyboardModeListeners.add(fn);
    return () => { _keyboardModeListeners.delete(fn); };
  }, []);
  return [getKeyboardMode(), setKeyboardMode];
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
