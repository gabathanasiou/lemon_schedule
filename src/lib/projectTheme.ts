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
 * The pure helpers are unit-tested. Components consume the kit-primitive
 * accent values through `ProjectChromeScope` (roadmap 311); `PROJECT_CHROME`
 * keeps only the browser status-bar hex.
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

/** The kit accent name for ThemeScope (`zinc` / `blue` / `emerald`). */
export type ProjectAccentName = 'zinc' | 'blue' | 'emerald';

export function projectAccentNameOf(theme: ProjectTheme): ProjectAccentName {
  return theme === 'shared' ? 'emerald' : theme === 'drive' ? 'blue' : 'zinc';
}

/** Kit `Button` accent (`cloud` prop): false = zinc, true = blue, 'emerald' = shared. */
export type ProjectAccent = false | true | 'emerald';

export function projectAccentOf(theme: ProjectTheme): ProjectAccent {
  return theme === 'shared' ? 'emerald' : theme === 'drive';
}

/** Tab-row selection pill fill (roadmap 258/311). Zinc keeps the mode-aware
 *  white/ink pill. Accent chrome uses the mode-correct accent pill: on DARK
 *  chrome that is `--ui-accent-pill-bg` (A800), NOT `--ui-tab-pill-accent`
 *  (A950 — the same colour as the dark header fill, so the pill vanished on
 *  Drive/shared projects). Light toolbars keep the deep A950 tint. */
export function tabPillFillOf(accent: ProjectAccentName, mode: 'light' | 'dark'): string {
  if (accent === 'zinc') return 'bg-[var(--ui-tab-pill-plain)]';
  return mode === 'dark' ? 'bg-[var(--ui-accent-pill-bg)]' : 'bg-[var(--ui-tab-pill-accent)]';
}

/** Modal shell theme (roadmap 333): the project accent ON an accent surface —
 *  the kit's updated modal look (painted inner header card, neutral body,
 *  accent hierarchy), matching the app header. Local resolves to zinc, which
 *  is the same near-black header as before. The modal CTA keeps the identity
 *  accent even on a neutral surface (kit `identityAccent`), so a future
 *  zinc-only preference stays a one-line map here. */
export function projectModalThemeOf(theme: ProjectTheme): {
  accent: 'zinc' | 'blue' | 'emerald';
  surface: 'neutral' | 'accent';
} {
  return {
    accent: projectAccentNameOf(theme),
    surface: 'accent',
  };
}

/** The status-bar / `meta[theme-color]` tint per project kind. The in-app
 *  chrome fill comes from the kit tokens (`--ui-accent-header-bg`) via
 *  `ProjectChromeScope` — this hex is only for browser chrome (roadmap 265). */
export const PROJECT_CHROME: Record<ProjectTheme, { barHex: string }> = {
  local: { barHex: '#09090b' },
  drive: { barHex: '#172554' },
  shared: { barHex: '#022c22' },
};
