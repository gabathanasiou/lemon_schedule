/**
 * Project-chrome theme (roadmap 248) — ONE source for the colored chrome of
 * the three project kinds:
 *
 *   local  — a device project: zinc chrome.
 *   drive  — a Google Drive project: BLUE chrome.
 *   shared — a shared (collaboration) project: EMERALD chrome.
 *
 * `useProjectTheme()` (store/provider) resolves the open project to one of
 * these; every surface that used to branch on an `isCloud` boolean derives
 * its colors here — never from ad-hoc blue checks. `useIsOnlineProject()`
 * stays as the SEMANTIC predicate (shared only); this module is the chrome
 * source.
 *
 * The pure helpers are unit-tested; components consume either the class
 * tokens (`PROJECT_CHROME`) or the kit-primitive accent values.
 */

/** The open project's chrome identity. */
export type ProjectTheme = 'local' | 'drive' | 'shared';

export function projectThemeOf(
  meta: { driveFileId?: string | null; onlineId?: string | null } | undefined | null,
): ProjectTheme {
  if (meta?.onlineId) return 'shared';
  if (meta?.driveFileId) return 'drive';
  return 'local';
}

/** Kit `Button` accent (`cloud` prop): false = zinc, true = blue, 'emerald' = shared. */
export type ProjectAccent = false | true | 'emerald';

export function projectAccentOf(theme: ProjectTheme): ProjectAccent {
  return theme === 'shared' ? 'emerald' : theme === 'drive';
}

/** DropdownMenu / ContextMenu theme for project chrome. */
export function projectMenuThemeOf(theme: ProjectTheme): 'dark' | 'blue' | 'emerald' {
  return theme === 'shared' ? 'emerald' : theme === 'drive' ? 'blue' : 'dark';
}

/** `Seg` track theme for LIGHT project toolbars (dark surfaces stay 'dark'). */
export function projectSegThemeOf(theme: ProjectTheme): 'light' | 'blue' | 'emerald' {
  return theme === 'shared' ? 'emerald' : theme === 'drive' ? 'blue' : 'light';
}

/** Modal shell theme (roadmap 302): the project accent + surface treatment.
 *  Normal app modals (local, Drive and shared) are NEUTRAL surfaces — the
 *  project colour lives in the chrome (header/tabs), not in the modal body.
 *  The accent stays available for a deliberate local override or an explicit
 *  accent-tinted surface. */
export function projectModalThemeOf(theme: ProjectTheme): {
  accent: 'zinc' | 'blue' | 'emerald';
  surface: 'neutral' | 'accent';
} {
  return {
    accent: theme === 'shared' ? 'emerald' : theme === 'drive' ? 'blue' : 'zinc',
    surface: 'neutral',
  };
}

/** Class tokens shared by the project-chrome surfaces. */
export const PROJECT_CHROME: Record<ProjectTheme, {
  /** Dark chrome bar fill (app header, popout version toolbar). */
  bar: string;
  /** `bar` as a hex — the status-bar / `meta[theme-color]` tint applied by
   *  `useStatusBarTheme()`. Keep in sync with `bar`'s Tailwind colour. */
  barHex: string;
  /** Quiet hover wash on the dark bar (triggers, icon buttons, cluster). */
  barHover: string;
  /** Focus ring on the editable project title. */
  titleRing: string;
  /** Compact action fill on light pages (Sort / Boneyard buttons). */
  action: string;
  /** Presence overflow bubble. */
  bubble: string;
}> = {
  local: {
    bar: 'bg-zinc-950',
    barHex: '#09090b',
    barHover: 'hover:bg-zinc-800',
    titleRing: 'focus:ring-1 focus:ring-zinc-600',
    action: 'bg-zinc-900 hover:bg-zinc-800 text-white',
    bubble: 'bg-zinc-800 text-zinc-200 ring-1 ring-white/25 hover:bg-zinc-700',
  },
  drive: {
    bar: 'bg-blue-950',
    barHex: '#172554',
    barHover: 'hover:bg-blue-900/60',
    titleRing: 'focus:ring-1 focus:ring-blue-600',
    action: 'bg-blue-950 hover:bg-blue-900 text-white',
    bubble: 'bg-blue-900 text-white ring-1 ring-white/25 hover:bg-blue-800',
  },
  shared: {
    bar: 'bg-emerald-950',
    barHex: '#022c22',
    barHover: 'hover:bg-emerald-900/60',
    titleRing: 'focus:ring-1 focus:ring-emerald-600',
    action: 'bg-emerald-950 hover:bg-emerald-900 text-white',
    bubble: 'bg-emerald-900 text-white ring-1 ring-white/25 hover:bg-emerald-800',
  },
};
