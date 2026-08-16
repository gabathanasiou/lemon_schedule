// Shared "table look" for the reports designer (roadmap 28). Table cells AND
// text/field blocks consume the same border color, table header background and
// the auto-text-color luminance helper, so future table-look changes happen in
// ONE place and update both.

/** Cell border for bordered tables and bordered text blocks. */
export const REPORT_BORDER_COLOR = '#d4d4d8';

/** Table column-header / rows-matrix label background. */
export const REPORT_TABLE_HEADER_BG = '#f4f4f5';

/** The shared border string — 'none' when the block/table has borders off. */
export function getReportBorder(showBorders: boolean): string {
  return showBorders ? `1px solid ${REPORT_BORDER_COLOR}` : 'none';
}

/** WCAG relative luminance of a 3/6-digit hex color (0 = black, 1 = white).
 *  Unparseable input counts as light so text stays black on it. */
export function relativeLuminance(hex: string): number {
  const m = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return 1;
  let h = m[1];
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h, 16);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}

/** Auto text color on a background fill: white on dark, black on light.
 *  Threshold ~WCAG midpoint between black and white text contrast. */
export function autoTextColor(background?: string): string {
  if (!background) return '#000';
  return relativeLuminance(background) >= 0.2 ? '#000' : '#fff';
}
