import { ReportBlock } from '../../types';
import { CSSProperties } from 'react';

// Single source for report block typography/spacing (screen + print). Like
// getRibbonCellBaseStyle for the reports designer.

export function getReportBlockBaseStyle(b: ReportBlock): CSSProperties {
  return {
    fontFamily: b.fontFamily || 'Helvetica',
    fontSize: b.fontSize || 10,
    fontWeight: b.bold ? 700 : 400,
    fontStyle: b.italic ? 'italic' : 'normal',
    textAlign: b.align || 'left',
    padding: `${b.paddingV ?? 2}px ${b.paddingH ?? 4}px`,
    color: '#000',
  };
}

export const REPORT_PAGE_WIDTHS: Record<'portrait' | 'landscape', number> = {
  portrait: 794,
  landscape: 1123,
};
