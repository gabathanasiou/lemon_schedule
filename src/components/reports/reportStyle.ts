import { ReportBlock, Project } from '../../types';
import { CSSProperties } from 'react';
import { getTextStyles } from '../../lib/reportTextStyles';

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
    color: '#000',
  };
}

export const REPORT_PAGE_WIDTHS: Record<'portrait' | 'landscape', number> = {
  portrait: 794,
  landscape: 1123,
};
