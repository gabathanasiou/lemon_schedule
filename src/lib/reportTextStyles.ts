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

export { generateUUID };
