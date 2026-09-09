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
    bgIconHeader: '#ffffff',
    fgIconHeader: '#52525b',
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

/** The Day Manager's calm zinc palette — the Glide grid's counterpart to the
 *  `tableStyles.ts` light tables (zinc-50 header, zinc-200 rules, neutral
 *  selection). Used by the Day Times sheet so it reads as the same surface. */
export function createDayTimesTheme(fontSize: number): Theme {
  return createGlideTheme(fontSize, {
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
    headerFontStyle: `600 ${Math.max(10, fontSize - 1)}px`,
    cellVerticalPadding: 2,
    cellHorizontalPadding: 8,
  });
}
