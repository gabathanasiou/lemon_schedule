import { ReportBlock } from '../types';
import { ReportCtx, ReportCollectionItem, ReportScopeFilter, filterItemsByScope, resolveCollectionItems } from './reportData';
import { paginateBlocks } from './reportBlocks';

// Page-level layout for reports: top-level page breaks split pages, and a
// repeat whose children END with a page break (the per-item "one page each"
// pattern) is expanded so every repeated item gets its own page. Structural
// page divs with forced breaks at the TOP level work in every engine (Safari
// included) — no forced breaks nested inside break-inside: avoid wrappers.

export type PageItem = ReportBlock | { repeatItem: ReportBlock; item: ReportCollectionItem; itemIndex?: number };

// Measured-pagination chunks. `useReportPaginator` (components/reports)
// renders the structural pages offscreen, measures element heights and splits
// content into page-sized chunks. Whole blocks stay whole (BlockChunk) — a
// block is only chunked when it actually splits across pages.

export type BodyChunk =
  | { kind: 'block'; block: ReportBlock }
  | { kind: 'repeatItem'; repeatItem: ReportBlock; item: ReportCollectionItem; itemIndex?: number }
  | {
      kind: 'repeatItemPart';
      repeatItem: ReportBlock;
      item: ReportCollectionItem;
      itemIndex?: number;
      /** One part per repeat child present on this page (in child order). */
      parts: FragmentPartUnit[];
    }
  | { kind: 'repeat'; block: ReportBlock; itemStart: number; itemEnd: number }
  | { kind: 'table'; block: ReportBlock; rowStart: number; rowEnd: number; repeatHeader: boolean }
  | { kind: 'ribbon'; block: ReportBlock; unitStart: number; unitEnd: number };

/** A slice of one child of a split repeat-item fragment. No range = the whole
 *  child renders. Exactly one of ribbonRange/tableRowRange/itemRange applies. */
export interface FragmentPartUnit {
  childIndex: number;
  ribbonRange?: [number, number];
  tableRowRange?: [number, number];
  repeatTableHeader?: boolean;
  itemRange?: [number, number];
}

export interface PageChunk {
  header: boolean;
  footer: boolean;
  body: BodyChunk[];
}

/** True when the repeat's children contain ANY page break. Any break inside
 *  repeat children means "one item per page" (the Call Sheet pattern) — the
 *  breaks themselves are redundant once each item owns a page, so they are
 *  dropped in per-item rendering (FragmentBody filters them). */
export function hasItemBreaks(b: ReportBlock): boolean {
  const children = b.children || [];
  return children.length > 0 && children.some(c => c.type === 'pageBreak');
}

export function buildReportPages(blocks: ReportBlock[], ctx: ReportCtx, scopeFilter?: ReportScopeFilter): PageItem[][] {
  const pages: PageItem[][] = [];
  for (const pageBlocks of paginateBlocks(blocks)) {
    if (pageBlocks.length === 0) {
      pages.push([]); // blank page from consecutive top-level breaks
      continue;
    }
    let current: PageItem[] = [];
    for (const b of pageBlocks) {
      if (b.type === 'repeat' && hasItemBreaks(b)) {
        const items = filterItemsByScope(
          resolveCollectionItems(ctx, b.collection, b.category, undefined, undefined, b) as ReportCollectionItem[],
          b.collection,
          b.collection === 'elements' ? b.category : undefined,
          scopeFilter,
        );
        if (items.length > 0) {
          current.push({ repeatItem: b, item: items[0], itemIndex: 0 });
          pages.push(current);
          current = [];
          for (let i = 1; i < items.length; i++) {
            pages.push([{ repeatItem: b, item: items[i], itemIndex: i }]);
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
