import type { TDocumentDefinitions, PredefinedPageSize } from './pdfMakeSetup';
import { resolveSceneColor, getDayHeaderColors, getNoteBannerColors } from '../../../../lib/ribbonUtils';
import type { Project, SceneColorEntry, RibbonCell, RibbonRow } from '../../../../types';

export const PT_PER_MM = 72 / 25.4;

export function mmToPt(mm: number): number {
  return Math.round(mm * PT_PER_MM);
}

export const PAGE_MARGINS = {
  landscape: [mmToPt(8), mmToPt(10), mmToPt(8), mmToPt(10)] as [number, number, number, number],
  portrait: [mmToPt(12), mmToPt(10), mmToPt(12), mmToPt(10)] as [number, number, number, number],
};

export const PAGE_SIZES: Record<string, PredefinedPageSize> = {
  a4: 'A4',
  letter: 'LETTER',
};

export const DEFAULT_FONT_SIZE = 8;
export const DEFAULT_LINE_HEIGHT = 1.1;
export const DEFAULT_TEXT_COLOR = '#18181b';
export const SUBTITLE_COLOR = '#52525b';

export const DEFAULT_FONT = 'Helvetica';
export const TITLE_FONT_SIZE = 12;
export const SUBTITLE_FONT_SIZE = 8;

export const PRINT_COL_WIDTHS: Record<string, number> = {
  sc: 15,
  call: 20,
  dur: 30,
  ie: 34,
  set: 120,
  dn: 40,
  cast: 56,
  pgs: 34,
};

export function getRibbonColumnWidthsPt(
  cells: RibbonCell[],
  colWidths: number[],
  showTimes: boolean,
  showDurations: boolean,
): { widths: (number | string)[]; cellIndices: number[]; keep: boolean[] } {
  const keep: boolean[] = cells.map(c => {
    if (c.field === 'callTime' && !showTimes) return false;
    if (c.field === 'duration' && !showDurations) return false;
    return true;
  });

  let keepIndices: number[];
  if (keep.every(k => k)) {
    keepIndices = cells.map((_, i) => i);
  } else {
    keepIndices = [];
    for (let i = 0; i < colWidths.length; i++) {
      if (keep[i]) keepIndices.push(i);
    }
  }

  const filtered = keepIndices.map(i => colWidths[i]);
  const total = filtered.reduce((s, w) => s + w, 0);

  let widths: (number | string)[];
  if (total > 0) {
    const scale = 100 / total;
    widths = filtered.map(w => `${Math.round(w * scale * 100) / 100}%`);
  } else {
    widths = filtered.map(() => '*');
  }

  return { widths, cellIndices: keepIndices, keep };
}

export function getMarginPt(marginMm: number): number {
  return mmToPt(marginMm);
}

export const BASE_STYLE = {
  font: DEFAULT_FONT,
  fontSize: DEFAULT_FONT_SIZE,
  lineHeight: DEFAULT_LINE_HEIGHT,
  color: DEFAULT_TEXT_COLOR,
};

export const DAY_HEADER_STYLE = {
  font: DEFAULT_FONT,
  fontSize: DEFAULT_FONT_SIZE,
  lineHeight: DEFAULT_LINE_HEIGHT,
  color: '#ffffff',
  fillColor: '#000000',
  bold: true,
  alignment: 'center' as const,
};

export const STATUS_DAY_STYLE = {
  font: DEFAULT_FONT,
  fontSize: DEFAULT_FONT_SIZE,
  lineHeight: DEFAULT_LINE_HEIGHT,
  color: '#ffffff',
  fillColor: '#000000',
  alignment: 'center' as const,
};

export const NOTE_ROW_STYLE = {
  font: DEFAULT_FONT,
  fontSize: DEFAULT_FONT_SIZE,
  lineHeight: DEFAULT_LINE_HEIGHT,
  color: '#ffffff',
  fillColor: '#591b1b',
  alignment: 'center' as const,
};

export const BREAK_ROW_STYLE = {
  font: DEFAULT_FONT,
  fontSize: DEFAULT_FONT_SIZE,
  lineHeight: DEFAULT_LINE_HEIGHT,
  color: '#444444',
  fillColor: '#f5f5f5',
  alignment: 'center' as const,
};

export const BORDER_COLOR = '#000000';
export const TABLE_BORDER = [true, true, true, true] as [boolean, boolean, boolean, boolean];

export function sceneCellStyle(intExt: string, dayNight: string, colorEntries?: SceneColorEntry[]) {
  const { background, color } = resolveSceneColor(intExt, dayNight, colorEntries);
  return {
    font: DEFAULT_FONT,
    fontSize: DEFAULT_FONT_SIZE,
    lineHeight: DEFAULT_LINE_HEIGHT,
    color,
    fillColor: background,
  };
}

export const CAST_LIST_STYLE = {
  font: DEFAULT_FONT,
  fontSize: DEFAULT_FONT_SIZE,
  lineHeight: DEFAULT_LINE_HEIGHT,
  color: DEFAULT_TEXT_COLOR,
};

export const PAGE_NUMBER_STYLE = {
  font: DEFAULT_FONT,
  fontSize: 7,
  color: '#52525b',
};

export const TITLE_STYLE = {
  font: DEFAULT_FONT,
  fontSize: 12,
  lineHeight: 1.2,
  color: '#18181b',
  bold: true,
};

export const SUBTITLE_STYLE = {
  font: DEFAULT_FONT,
  fontSize: 8,
  lineHeight: 1.2,
  color: '#52525b',
};

export function formatDateLong(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const weekday = d.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();
  const day = d.getDate();
  const month = d.toLocaleDateString('en-US', { month: 'long' }).toUpperCase();
  const year = d.getFullYear();
  const suffixes = ['TH', 'ST', 'ND', 'RD'];
  const suffix = (day >= 11 && day <= 13) ? 'TH' : suffixes[day % 10] || 'TH';
  return `${weekday} ${day}${suffix} ${month} ${year}`;
}

export function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  const w = d.toLocaleDateString('en-US', { weekday: 'long' });
  const day = d.getDate();
  const suffixes = ['th', 'st', 'nd', 'rd'];
  const s = (day >= 11 && day <= 13) ? 'th' : suffixes[day % 10] || 'th';
  return `${w}, ${day}${s}`;
}
