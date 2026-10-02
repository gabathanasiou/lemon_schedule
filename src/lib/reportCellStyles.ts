import { ReportCellStyle, ReportCustomRow, ReportTableColumn } from '../types';

// Free-table per-cell typography overrides (roadmap 189). The ONE module for
// the `ReportBlock.cellStyles` map (`${rowId}:${colId}` keys) and the
// formatting reset that backs "reset to table default". Merge geometry lives
// in `reportTableMerges.ts`; this module never imports it at runtime.

export function cellStyleKey(rowId: string, colId: string): string {
  return `${rowId}:${colId}`;
}

const EMPTY: Record<string, ReportCellStyle> = {};

/** The cell's override, or undefined when it inherits the table defaults. */
export function getCellStyle(
  styles: Record<string, ReportCellStyle> | undefined,
  rowId: string,
  colId: string,
): ReportCellStyle | undefined {
  return (styles || EMPTY)[cellStyleKey(rowId, colId)];
}

/** Drops stale entries (unknown row/column ids). */
export function pruneCellStyles(
  styles: Record<string, ReportCellStyle> | undefined,
  rows: ReportCustomRow[],
  columns: ReportTableColumn[],
  headerRowId: string,
): Record<string, ReportCellStyle> {
  if (!styles || Object.keys(styles).length === 0) return {};
  const rowIds = new Set<string>([headerRowId, ...rows.map(r => r.id)]);
  const colIds = new Set(columns.map(c => c.id));
  const out: Record<string, ReportCellStyle> = {};
  for (const [key, style] of Object.entries(styles)) {
    const sep = key.indexOf(':');
    if (sep < 0) continue;
    if (!rowIds.has(key.slice(0, sep)) || !colIds.has(key.slice(sep + 1))) continue;
    if (Object.keys(style).length > 0) out[key] = style;
  }
  return out;
}

/** Merges `patch` into every key's override; fields set to `undefined` are
 *  removed (an override that becomes empty disappears). */
export function patchCellStyleKeys(
  styles: Record<string, ReportCellStyle> | undefined,
  keys: string[],
  patch: Partial<ReportCellStyle>,
): Record<string, ReportCellStyle> {
  const out: Record<string, ReportCellStyle> = { ...(styles || {}) };
  for (const key of keys) {
    const next: ReportCellStyle = { ...(out[key] || {}) };
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) delete (next as Record<string, unknown>)[k];
      else (next as Record<string, unknown>)[k] = v;
    }
    if (Object.keys(next).length > 0) out[key] = next;
    else delete out[key];
  }
  return out;
}

/** Removes the override for every key. */
export function clearCellStyleKeys(
  styles: Record<string, ReportCellStyle> | undefined,
  keys: string[],
): Record<string, ReportCellStyle> {
  const out: Record<string, ReportCellStyle> = { ...(styles || {}) };
  for (const key of keys) delete out[key];
  return out;
}

function escapeHtmlText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Strips inline marks (bold/italic/underline/strike/color/link) from ONE
 *  cell's stored HTML — text, paragraphs, line breaks and `{{tokens}}`
 *  survive. Backs the cell chrome's Reset. */
export function stripCellFormatting(html: string): string {
  if (!html || typeof DOMParser === 'undefined') return html;
  let root: HTMLElement | null = null;
  try {
    const doc = new DOMParser().parseFromString(`<div data-rm-reset>${html}</div>`, 'text/html');
    root = doc.querySelector('[data-rm-reset]');
  } catch {
    return html;
  }
  if (!root) return html;
  const serialize = (node: Node): string => {
    if (node.nodeType === 3) return escapeHtmlText((node as Text).data);
    if (node.nodeType !== 1) return '';
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    if (tag === 'br') return '<br>';
    const inner = Array.from(el.childNodes).map(serialize).join('');
    return tag === 'p' ? `<p>${inner}</p>` : inner;
  };
  return Array.from(root.childNodes).map(serialize).join('');
}
