import { ReportBlock } from '../types';
import { paginateBlocks } from './reportBlocks';

// Page-level layout for reports. Structural pages come from `paginateBlocks`
// (top-level pageBreak splits only). A `pageBreak` block ANYWHERE in the
// render — top level or nested in repeat/relative children — forces a page
// break at its position; the measured paginator (components/reports) turns
// break markers into hard chunk boundaries. There is NO special "one page
// per item" expansion: a repeat whose children end with a pageBreak produces
// one page per item naturally.
//
// Measured-pagination chunks. `useReportPaginator` (components/reports)
// renders the structural pages offscreen, measures element heights and splits
// content into page-sized chunks. Whole blocks stay whole (BlockChunk) — a
// block is only chunked when it actually splits across pages.

export type BodyChunk =
  | { kind: 'block'; block: ReportBlock }
  | {
      kind: 'repeat';
      block: ReportBlock;
      itemStart: number;
      itemEnd: number;
      /** Per item in [itemStart, itemEnd): `null` = whole item, an array =
       *  child-part slices (one part per repeat child present on this page). */
      perItemParts: (FragmentPartUnit[] | null)[];
    }
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

export { paginateBlocks };