import { ReportBlock, Project } from '../../types';
import { CSSProperties } from 'react';
import { getTextStyles } from '../../lib/reportTextStyles';
import { autoTextColor, getReportBorder } from '../../lib/reportLook';

// Single source for report block typography/spacing (screen + print). Like
// getRibbonCellBaseStyle for the reports designer.
//
// A block can link to a named text style (`block.textStyle`): the style sets
// the base typography and explicit block props override it (direct formatting
// on top of a style — Word/Pages semantics). The project's style registry
// falls back to defaults when the project never customized it.

export function getReportBlockBaseStyle(b: ReportBlock, project?: Project): CSSProperties {
  const style = b.textStyle && project ? getTextStyles(project).find(s => s.id === b.textStyle) : undefined;
  return {
    fontFamily: b.fontFamily || style?.fontFamily || 'Helvetica',
    fontSize: b.fontSize ?? style?.fontSize ?? 10,
    fontWeight: b.bold ?? style?.bold ?? false ? 700 : 400,
    fontStyle: b.italic ?? style?.italic ?? false ? 'italic' : 'normal',
    textAlign: b.align || 'left',
    padding: `${b.paddingV ?? 2}px ${b.paddingH ?? 4}px`,
    // Auto text color: white on dark backgrounds, black on light (roadmap 28).
    color: autoTextColor(b.background),
    ...(b.background ? { background: b.background } : {}),
    ...(b.border ? { border: getReportBorder(true) } : {}),
  };
}

export const REPORT_PAGE_WIDTHS: Record<'portrait' | 'landscape', number> = {
  portrait: 794,
  landscape: 1123,
};

// Canonical page geometry for measured pagination (print + preview MUST use
// the same numbers — the preview lies otherwise). Derivation, @96dpi:
//  - contentWidth:  A4 minus 12mm side margins (Safari ignores @page margins
//    and uses its dialog's 0.5in margins instead — 210mm - 25.4mm = 697px is
//    the binding constraint for portrait).
//  - contentHeight: conservative so one measured page fits EVERY common
//    sheet: portrait bound by US Letter (279.4mm - 25.4mm = 960px), landscape
//    bound by A4 (210mm - 25.4mm = 697px). The slack also absorbs WebKit
//    reflow drift between the measurement pass and the final render.
export const REPORT_PAGE_PADDING = {
  v: Math.round((14 * 96) / 25.4), // 14mm top/bottom (~53px)
  h: Math.round((12 * 96) / 25.4), // 12mm sides (~45px)
} as const;

export const REPORT_PAGE_METRICS: Record<'portrait' | 'landscape', { width: number; contentWidth: number; contentHeight: number }> = {
  portrait: { width: 697 + REPORT_PAGE_PADDING.h * 2, contentWidth: 697, contentHeight: 880 },
  landscape: { width: 960 + REPORT_PAGE_PADDING.h * 2, contentWidth: 960, contentHeight: 620 },
};

// ---- block gap (roadmap 33) ---------------------------------------------------
// Every stacked block gets a vertical margin above it in the PREVIEW and PRINT
// (the designer canvas stays flush per the item 26 veto). The single global
// default matches the repeat item gap (`gap ?? 8`); there is NO per-block
// control (user decision). pageBreak blocks never get a margin; spacer blocks
// stay exact manual spacing tools. Repeat ITEM spacing remains the flex `gap`
// on `.rm-repeat-col` — item wrappers are not blocks, so the item gap is never
// doubled; the blocks INSIDE an item get this margin instead (first child of
// the item suppressed). The paginator reads the wrapper margin into `gapBefore`
// so page budgets include the spacing.

export const DEFAULT_BLOCK_GAP = 8;

/** The vertical gap (px) above a block in a stacked list. The first block in
 *  each stack stays flush (clean page top); pageBreak/spacer blocks never get
 *  one. */
export function blockGapMargin(b: ReportBlock, isFirst: boolean): number {
  if (isFirst || b.type === 'pageBreak' || b.type === 'spacer') return 0;
  return DEFAULT_BLOCK_GAP;
}
