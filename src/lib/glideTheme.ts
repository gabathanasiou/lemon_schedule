import { type Theme } from '@glideapps/glide-data-grid';
import { getDefaultTheme } from '@glideapps/glide-data-grid';

export function createGlideTheme(fontSize: number, overrides?: Partial<Theme>): Theme {
  const base = getDefaultTheme();
  return {
    ...base,
    accentColor: '#2563eb',
    accentFg: '#ffffff',
    accentLight: '#dbeafe',
    textDark: '#18181b',
    textMedium: '#71717a',
    textLight: '#a1a1aa',
    textBubble: '#18181b',
    bgIconHeader: '#71717a',
    fgIconHeader: '#ffffff',
    textHeader: '#71717a',
    textHeaderSelected: '#1e40af',
    bgCell: '#ffffff',
    bgCellMedium: '#fafafa',
    bgHeader: '#ffffff',
    bgHeaderHasFocus: '#fafafa',
    bgHeaderHovered: '#f4f4f5',
    bgBubble: '#f4f4f5',
    bgBubbleSelected: '#dbeafe',
    bgSearchResult: '#fef08a',
    borderColor: '#e4e4e7',
    drilldownBorder: '#e4e4e7',
    linkColor: '#2563eb',
    cellHorizontalPadding: 8,
    cellVerticalPadding: 4,
    headerFontStyle: `500 ${fontSize}px`,
    baseFontStyle: `${fontSize}px`,
    markerFontStyle: `500 ${fontSize}px`,
    fontFamily: 'Inter, Roboto, -apple-system, BlinkMacSystemFont, avenir next, avenir, segoe ui, helvetica neue, helvetica, Ubuntu, noto, arial, sans-serif',
    editorFontSize: `${fontSize}px`,
    lineHeight: 1.4,
    ...overrides,
  };
}

/** Cell colours the Day grid hosts use for their `themeOverride`s. Kept next
 *  to the grid theme so a light grid never gets dark overrides (or vice
 *  versa) — e.g. the crew roster's muted role column + amber override call. */
export function dayTimesCellColors(mode: 'light' | 'dark') {
  return mode === 'dark'
    ? { muted: '#a1a1aa', faint: '#71717a', override: '#fbbf24' }
    : { muted: '#52525b', faint: '#71717a', override: '#b45309' };
}

/** The Day Manager's calm zinc palette — the Glide grid's counterpart to the
 *  `tableStyles.ts` light tables (zinc-50 header, zinc-200 rules, neutral
 *  selection). Used by the Day Times sheet so it reads as the same surface.
 *  `mode` follows the ambient kit theme: the Day Manager page is light, the
 *  Call Times modal (crew template) is dark. */
export function createDayTimesTheme(fontSize: number, mode: 'light' | 'dark' = 'light'): Theme {
  const shared = {
    headerFontStyle: `600 ${Math.max(10, fontSize - 1)}px`,
    cellVerticalPadding: 2,
    cellHorizontalPadding: 8,
  };
  if (mode === 'dark') {
    return createGlideTheme(fontSize, {
      ...shared,
      accentColor: '#a1a1aa',
      accentFg: '#18181b',
      accentLight: '#3f3f46',
      textDark: '#ffffff',
      textMedium: '#a1a1aa',
      textLight: '#71717a',
      textBubble: '#ffffff',
      textHeader: '#a1a1aa',
      textHeaderSelected: '#ffffff',
      bgIconHeader: '#27272a',
      fgIconHeader: '#a1a1aa',
      bgCell: '#18181b',
      bgCellMedium: '#1c1c1f',
      bgHeader: '#27272a',
      bgHeaderHasFocus: '#3f3f46',
      bgHeaderHovered: '#3f3f46',
      bgBubble: '#27272a',
      bgBubbleSelected: '#3f3f46',
      bgSearchResult: '#422006',
      borderColor: '#3f3f46',
      drilldownBorder: '#3f3f46',
      linkColor: '#e4e4e7',
    });
  }
  return createGlideTheme(fontSize, {
    ...shared,
    accentColor: '#18181b',
    accentFg: '#ffffff',
    accentLight: '#e4e4e7',
    textHeaderSelected: '#18181b',
    bgHeader: '#fafafa',
    bgHeaderHasFocus: '#f4f4f5',
    bgHeaderHovered: '#f4f4f5',
    bgBubbleSelected: '#e4e4e7',
    bgIconHeader: '#fafafa',
    linkColor: '#18181b',
  });
}
