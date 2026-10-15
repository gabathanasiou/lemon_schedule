import { cssEscape } from './utils';
import type { ItemResolver } from './itemSelection';

/**
 * The Report Designer's peer-selection vocabulary (roadmap 234 stage 2) —
 * shared by the publishing half (`reportSelectionItems`) and the resolving
 * half (`resolveReportItem`), so the two can never drift.
 *
 * Items:
 * - a plain `ReportBlock.id` → the block's card (`[data-block-id]`);
 * - `col:<blockId>:<colIndex>` → every cell of the selected table column
 *   (`.report-table-cols [data-table-col-ci]` / the free table's band cells).
 *
 * The Call Sheet / zone designer keeps its own scope once item 212 lands; the
 * resolution is root-scoped to `data-presence-surface="report-designer"`, so
 * it can never leak into another canvas holding the same block ids.
 */

const COL_PREFIX = 'col:';

/** The ids one designer selection publishes: the selected block, or the
 *  selected column (selecting a column clears the block selection — one
 *  highlight at a time, parity with the canvas chrome). */
export function reportSelectionItems(
  selId: string | null,
  selCol: { colsId: string; colIndex: number } | null,
): string[] {
  if (selCol) return [`${COL_PREFIX}${selCol.colsId}:${selCol.colIndex}`];
  return selId ? [selId] : [];
}

export const resolveReportItem: ItemResolver = (id, root) => {
  if (id.startsWith(COL_PREFIX)) {
    const rest = id.slice(COL_PREFIX.length);
    const at = rest.lastIndexOf(':');
    const blockId = at > 0 ? rest.slice(0, at) : '';
    const colIndex = at > 0 ? rest.slice(at + 1) : '';
    if (!blockId || !/^\d+$/.test(colIndex)) return [];
    const card = root.querySelector(`[data-block-id="${cssEscape(blockId)}"]`);
    return card ? Array.from(card.querySelectorAll(`[data-table-col-ci="${colIndex}"]`)) : [];
  }
  const card = root.querySelector(`[data-block-id="${cssEscape(id)}"]`);
  return card ? [card] : [];
};
