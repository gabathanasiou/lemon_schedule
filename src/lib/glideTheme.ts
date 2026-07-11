import { type Theme } from '@glideapps/glide-data-grid';
import { getDefaultTheme } from '@glideapps/glide-data-grid';

export function createGlideTheme(fontSize: number): Theme {
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
    fontFamily: 'system-ui, -apple-system, sans-serif',
    editorFontSize: `${fontSize}px`,
    lineHeight: 1.4,
  };
}
