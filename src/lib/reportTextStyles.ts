import { Project, ReportTextStyle } from '../types';
import { generateUUID } from './utils';

// Named text styles for the reports designer — Word/Pages-style: a block links
// to a style via `textStyle`; direct block props (fontSize/bold/italic/…) are
// "direct formatting" on top of the style. Editing a style updates every
// linked block. Missing registry falls back to defaults at runtime (alpha —
// no migration).

export const DEFAULT_TEXT_STYLES: ReportTextStyle[] = [
  { id: 'ts-h1', name: 'Heading 1', fontSize: 20, bold: true },
  { id: 'ts-h2', name: 'Heading 2', fontSize: 16, bold: true },
  { id: 'ts-h3', name: 'Heading 3', fontSize: 13, bold: true },
  { id: 'ts-body', name: 'Body', fontSize: 10 },
  { id: 'ts-caption', name: 'Caption', fontSize: 8, italic: true },
];

export function getDefaultTextStyles(): ReportTextStyle[] {
  return JSON.parse(JSON.stringify(DEFAULT_TEXT_STYLES));
}

export function getTextStyles(project: Project): ReportTextStyle[] {
  return project.reportTextStyles || DEFAULT_TEXT_STYLES;
}

export function getTextStyleById(project: Project, id?: string): ReportTextStyle | undefined {
  if (!id) return undefined;
  return getTextStyles(project).find(s => s.id === id);
}

export function newTextStyle(name: string, styles: ReportTextStyle[]): ReportTextStyle {
  return {
    id: `ts-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    name,
    fontSize: styles[0]?.fontSize ?? 10,
  };
}

/** Resolve linked run markers (`<span data-text-style="id">`, roadmap 193) to
 *  inline typography AT RENDER TIME — the seam `resolveReportTokensHtml`
 *  calls, so editing a style restyles every marked run in the canvas, preview
 *  and print. A missing/deleted id renders as plain text (no error marker).
 *  Direct formatting nests INSIDE the marker (mark priority), so its inline
 *  style wins where both apply. */
export function resolveReportTextStyleSpans(html: string, project: Project): string {
  if (!html || !html.includes('data-text-style')) return html;
  return html.replace(/<span([^>]*\bdata-text-style="([^"]*)"[^>]*)>/gi, (_m, attrs: string, id: string) => {
    const style = getTextStyleById(project, id);
    const rest = attrs.replace(/\s*data-text-style="[^"]*"/i, '');
    if (!style) return `<span${rest}>`;
    const named = [
      `font-size: ${style.fontSize}pt`,
      style.fontFamily ? `font-family: ${style.fontFamily.replace(/"/g, '&quot;')}` : '',
      style.bold ? 'font-weight: 700' : '',
      style.italic ? 'font-style: italic' : '',
    ].filter(Boolean).join('; ');
    // Direct formatting (a nested span in practice) still wins conflicts: its
    // declarations come LAST so they override the named style's.
    const direct = /\s*style="([^"]*)"/i.exec(rest);
    const merged = [named, direct?.[1].trim()].filter(Boolean).join('; ');
    const bare = direct ? rest.replace(direct[0], '') : rest;
    return `<span${bare} style="${merged}">`;
  });
}

export { generateUUID };
