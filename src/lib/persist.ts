import { useState, useEffect, useCallback, useSyncExternalStore, SetStateAction } from 'react';
import type { ReportViewMode } from '../types';

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

/** The allow-list (also the presence follow wire validation — presence.ts). */
export const VIEW_MODE_VALUES: readonly ViewMode[] = ['portrait', 'landscape', 'full'];

const VIEW_MODE_KEY = 'lemon_schedule_view_mode';
export const VIEW_WIDTHS: Record<ViewMode, number | null> = { portrait: 730, landscape: 1060, full: null };

export function useViewMode(): [ViewMode, (m: ViewMode) => void, number | null] {
  const [mode, setMode] = useState<ViewMode>(() => {
    try {
      const stored = localStorage.getItem(VIEW_MODE_KEY);
      return VIEW_MODE_VALUES.find(v => v === stored) ?? 'portrait';
    } catch { return 'portrait'; }
  });

  const setViewMode = useCallback((m: ViewMode) => {
    setMode(m);
    try { localStorage.setItem(VIEW_MODE_KEY, m); } catch {}
  }, []);

  return [mode, setViewMode, VIEW_WIDTHS[mode]];
}

/** Fields/Values display mode (roadmap 203) — ONE per-user pref shared by the
 *  Reports Designer and the Call Sheet editor (roadmap 212), so the mode you
 *  edit in follows you between the two surfaces. Default Values. */
const REPORT_VIEW_MODE_KEY = 'lemon_schedule_report_view_mode';

export function useReportViewMode(): [ReportViewMode, (m: ReportViewMode) => void] {
  const [mode, setMode] = useState<ReportViewMode>(() => {
    try { return localStorage.getItem(REPORT_VIEW_MODE_KEY) === 'fields' ? 'fields' : 'values'; } catch { return 'values'; }
  });

  const setReportViewMode = useCallback((m: ReportViewMode) => {
    setMode(m);
    try { localStorage.setItem(REPORT_VIEW_MODE_KEY, m); } catch {}
  }, []);

  return [mode, setReportViewMode];
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

/** Board ID prefixes in element display surfaces (roadmap 321): `all` shows
 *  every category's number, `cast` only cast (the pre-305 look, the default).
 *  Device-local per-user pref — report/print surfaces keep their numbers
 *  regardless. */
export type BoardIdDisplay = 'all' | 'cast';

export const BOARD_ID_DISPLAY_VALUES: readonly BoardIdDisplay[] = ['all', 'cast'];

const BOARD_ID_DISPLAY_KEY = 'lemon_schedule_board_id_display';

let _boardIdDisplay: BoardIdDisplay = (() => {
  try {
    const stored = localStorage.getItem(BOARD_ID_DISPLAY_KEY);
    return BOARD_ID_DISPLAY_VALUES.find(v => v === stored) ?? 'cast';
  } catch { return 'cast'; }
})();
const _boardIdDisplayListeners = new Set<() => void>();

export function getBoardIdDisplay(): BoardIdDisplay {
  return _boardIdDisplay;
}

export function setBoardIdDisplay(mode: BoardIdDisplay) {
  _boardIdDisplay = mode;
  try { localStorage.setItem(BOARD_ID_DISPLAY_KEY, mode); } catch {}
  _boardIdDisplayListeners.forEach(fn => fn());
}

/** Subscribe/read the pref from anywhere (EntityDropdown panels + the Scene
 *  Sheet toolbar toggle). */
export function useBoardIdDisplay(): [BoardIdDisplay, (m: BoardIdDisplay) => void] {
  const mode = useSyncExternalStore(
    (fn) => {
      _boardIdDisplayListeners.add(fn);
      return () => { _boardIdDisplayListeners.delete(fn); };
    },
    getBoardIdDisplay,
    getBoardIdDisplay,
  );
  return [mode, setBoardIdDisplay];
}

export type CellBorders = 'none' | 'vertical' | 'horizontal' | 'both';

/** The allow-list (also the presence follow wire validation — presence.ts). */
export const CELL_BORDER_VALUES: readonly CellBorders[] = ['none', 'vertical', 'horizontal', 'both'];

const CELL_BORDERS_KEY = 'lemon_schedule_cell_borders';

export function useCellBorders(): [CellBorders, (m: CellBorders) => void] {
  const [mode, setMode] = useState<CellBorders>(() => {
    try {
      const stored = localStorage.getItem(CELL_BORDERS_KEY);
      return CELL_BORDER_VALUES.find(v => v === stored) ?? 'none';
    } catch { return 'none'; }
  });

  const setBorders = useCallback((m: CellBorders) => {
    setMode(m);
    try { localStorage.setItem(CELL_BORDERS_KEY, m); } catch {}
  }, []);

  return [mode, setBorders];
}

export const SS_FONT_SIZE_MIN = 8;
export const SS_FONT_SIZE_MAX = 20;
export const SS_FONT_SIZE_DEFAULT = 11;
const SS_FONT_SIZE_KEY = 'lemon_schedule_ss_font_size';

export function useSpreadsheetFontSize(defaultSize?: number): [number, (n: number) => void] {
  const fallback = defaultSize ?? SS_FONT_SIZE_DEFAULT;
  const [size, setSize] = useState<number>(() => {
    try {
      const stored = localStorage.getItem(SS_FONT_SIZE_KEY);
      const n = parseInt(stored || '', 10);
      return n >= SS_FONT_SIZE_MIN && n <= SS_FONT_SIZE_MAX ? n : fallback;
    } catch { return fallback; }
  });

  const setFontSize = useCallback((n: number) => {
    const clamped = Math.max(SS_FONT_SIZE_MIN, Math.min(SS_FONT_SIZE_MAX, n));
    setSize(clamped);
    try { localStorage.setItem(SS_FONT_SIZE_KEY, String(clamped)); } catch {}
  }, []);

  return [size, setFontSize];
}

// ---- per-user design editing focus (roadmap 233) -----------------------------
// A design surface has TWO identities: the design CONTENTS (project state —
// `project.reportDesigns` / `project.ribbonDesigns`, synced by the room like
// any other data) and the per-user EDITING FOCUS (which design this person is
// editing). The focus lives here, never in the project, so one collaborator
// switching designs never switches anyone else's editor.

export const REPORT_ACTIVE_DESIGN_KEY = 'lemon_schedule_report_active_design';
export const RIBBON_ACTIVE_DESIGN_KEY = 'lemon_schedule_ribbon_active_design';

/** Resolve an editing focus against the designs that actually exist: the
 *  stored pick wins; else the project-level default (`activeReportId` /
 *  `activeRibbonId` — kept valid on LOAD for older files and first runs);
 *  else the first design. A pick that belongs to another project (or a
 *  deleted design) never resolves and is never rewritten, so switching
 *  projects and back restores it. */
export function resolveActiveDesignId(
  stored: string | null | undefined,
  designIds: readonly string[],
  fallback?: string | null,
): string {
  if (stored && designIds.includes(stored)) return stored;
  if (fallback && designIds.includes(fallback)) return fallback;
  return designIds[0] || '';
}

/** The per-user editing focus for a design surface.
 *  `setActiveDesignId('')` clears the pick (resolve to the project's default). */
export function useActiveDesignId(
  storageKey: string,
  designs: readonly { id: string }[],
  fallback?: string | null,
): [string, (id: string) => void] {
  const [stored, setStored] = useState<string | null>(() => {
    try { return localStorage.getItem(storageKey); } catch { return null; }
  });
  const setActiveDesignId = useCallback((id: string) => {
    setStored(id || null);
    try {
      if (id) localStorage.setItem(storageKey, id);
      else localStorage.removeItem(storageKey);
    } catch { /* ignore */ }
  }, [storageKey]);
  return [resolveActiveDesignId(stored, designs.map(d => d.id), fallback), setActiveDesignId];
}

const GLIDE_SMOOTH_SCROLL_KEY = 'lemon_schedule_glide_smooth_scroll';

export function useGlideSmoothScroll(isCoarse: boolean): [boolean, (v: boolean) => void] {
  const [mode, setMode] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(GLIDE_SMOOTH_SCROLL_KEY);
      return stored !== null ? stored === 'true' : isCoarse;
    } catch { return isCoarse; }
  });

  const setSmooth = useCallback((v: boolean) => {
    setMode(v);
    try { localStorage.setItem(GLIDE_SMOOTH_SCROLL_KEY, String(v)); } catch {}
  }, []);

  return [mode, setSmooth];
}
