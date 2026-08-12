import { ReportBlock } from '../types';
import { ReportCtx, ReportCollectionItem, resolveCollection } from './reportData';
import { paginateBlocks } from './reportBlocks';

// Page-level layout for reports: top-level page breaks split pages, and a
// repeat whose children END with a page break (the per-item "one page each"
// pattern) is expanded so every repeated item gets its own page. Structural
// page divs with forced breaks at the TOP level work in every engine (Safari
// included) — no forced breaks nested inside break-inside: avoid wrappers.

export type PageItem = ReportBlock | { repeatItem: ReportBlock; item: ReportCollectionItem };

/** Strips pageBreak blocks from the very start and end of a block list. */
export function stripEdgeBreaks(list: ReportBlock[]): ReportBlock[] {
  let start = 0;
  let end = list.length;
  while (start < end && list[start].type === 'pageBreak') start++;
  while (end > start && list[end - 1].type === 'pageBreak') end--;
  return list.slice(start, end);
}

/** True when the repeat's children end with a page break (per-item pages). */
export function hasTrailingBreak(b: ReportBlock): boolean {
  const children = b.children || [];
  return children.length > 0 && children[children.length - 1].type === 'pageBreak';
}

export function buildReportPages(blocks: ReportBlock[], ctx: ReportCtx): PageItem[][] {
  const pages: PageItem[][] = [];
  for (const pageBlocks of paginateBlocks(blocks)) {
    if (pageBlocks.length === 0) {
      pages.push([]); // blank page from consecutive top-level breaks
      continue;
    }
    let current: PageItem[] = [];
    for (const b of pageBlocks) {
      if (b.type === 'repeat' && hasTrailingBreak(b)) {
        const items = resolveCollection(ctx, b.collection, b.category, undefined, undefined) as ReportCollectionItem[];
        if (items.length > 0) {
          current.push({ repeatItem: b, item: items[0] });
          pages.push(current);
          current = [];
          for (let i = 1; i < items.length; i++) {
            pages.push([{ repeatItem: b, item: items[i] }]);
          }
          continue;
        }
      }
      current.push(b);
    }
    if (current.length > 0) pages.push(current);
  }
  return pages;
}

export { paginateBlocks };
