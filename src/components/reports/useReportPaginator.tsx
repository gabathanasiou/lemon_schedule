import React, { useLayoutEffect, useRef, useState } from 'react';
import { ReportBlock } from '../../types';
import { ReportCtx, ReportScopeFilter, RibbonPrintOptions } from '../../lib/reportData';
import { ReportFieldDef } from '../../lib/reportFields';
import { BodyChunk, FragmentPartUnit, PageChunk, PageItem } from '../../lib/reportPagination';
import { REPORT_PAGE_METRICS } from './reportStyle';
import { PageItemBody, ReportBlockView } from './ReportBlockView';

// Measured pagination for reports. The structural pages from buildReportPages
// are rendered offscreen ONCE (ReportMeasureContainer), element heights are
// read from the real engine's layout, and content is split into page-sized
// chunks. Both print and preview render the SAME chunks, so the preview always
// equals the print (reportPagination.md rule 7).
//
// Granularity:
//  - whole blocks keep together (move to the next page when they don't fit);
//  - repeats split between ITEMS;
//  - tables split between ROWS, repeating the column header on continuation
//    pages (classic "thead repeats" behavior);
//  - ribbons split between STRIPS/note/break/daybreak units — never mid-strip;
//  - day boxes split between strips, dropping the box border on fragments.
//
// Oversized single units (taller than a page) stay put and overflow — same
// behavior as the browser's automatic pagination today.

interface PaginatorParams {
  measureRef: React.RefObject<HTMLDivElement | null>;
  pages: PageItem[][];
  headerBlocks?: ReportBlock[];
  footerBlocks?: ReportBlock[];
  headerSkipFirst?: boolean;
  footerSkipFirst?: boolean;
  page: 'portrait' | 'landscape';
  ctx: ReportCtx;
  fieldMap: Record<string, ReportFieldDef>;
  scopeFilter?: ReportScopeFilter;
  ribbonOverrides?: Record<string, RibbonPrintOptions>;
  previewLimit?: boolean;
  onReady?: () => void;
}

/** DOM-data contract between the measurement container and the walker. */
interface FlatUnit {
  h: number;
  gapBefore: number;
  /** Extra height consumed when this unit OPENS a page (a repeated table
   *  header renders at the top of a continuation chunk). */
  pageStartExtra: number;
  el: HTMLElement;
  local: number;
  blockEl: HTMLElement;
  /** Fragment-split metadata: which child of the repeat fragment this unit
   *  belongs to, and the splittable kind of that child. Whole children and
   *  non-splittable blocks carry `unitKind: 'whole'`. */
  fragChild?: number;
  unitKind?: 'whole' | 'ribbon' | 'table' | 'repeat';
}

function wholeUnit(wrapper: HTMLElement): FlatUnit {
  return { h: wrapper.offsetHeight, gapBefore: 0, pageStartExtra: 0, el: wrapper, local: 0, blockEl: wrapper };
}

/** Columns-grid table: one unit per row, plus a header unit (local -1) when
 *  showHeader. Continuation rows reserve the repeated header height. */
function flattenTable(scope: HTMLElement, blockEl: HTMLElement, kind: 'table' | 'whole', fragChild?: number): FlatUnit[] {
  const containers = scope.querySelectorAll('.report-table-cols');
  const first = containers[0] as HTMLElement | undefined;
  if (first && first.classList.contains('rm-row')) {
    // rows-matrix: one self-contained grid per row group (label header is
    // inside each group) — no repeated header needed.
    return Array.from(containers).map((c, i): FlatUnit => ({ h: (c as HTMLElement).offsetHeight, gapBefore: 0, pageStartExtra: 0, el: c as HTMLElement, local: i, blockEl, fragChild, unitKind: 'table' }));
  }
  if (first) {
    const headerEl = first.querySelector(':scope > .rm-header') as HTMLElement | null;
    const headerH = headerEl ? headerEl.offsetHeight : 0;
    const rows = Array.from(first.children).filter(c => c.classList.contains('rm-row')) as HTMLElement[];
    const units = rows.map((el, i): FlatUnit => ({
      h: el.offsetHeight,
      gapBefore: 0,
      // A continuation chunk renders the column header again at its top
      // (classic "thead repeats") — reserve that height when a row opens a
      // page. local -1 marks the header unit (folded into row ranges below).
      pageStartExtra: headerH > 0 && i > 0 ? headerH : 0,
      el,
      local: i,
      blockEl,
      fragChild,
      unitKind: 'table',
    }));
    if (headerEl) units.unshift({ h: headerH, gapBefore: 0, pageStartExtra: 0, el: headerEl, local: -1, blockEl, fragChild, unitKind: 'table' } as FlatUnit);
    return units;
  }
  return [{ ...wholeUnit(scope), blockEl, fragChild, unitKind: kind } as FlatUnit];
}

function flattenRepeat(scope: HTMLElement, blockEl: HTMLElement, fragChild?: number): FlatUnit[] {
  const col = scope.querySelector('.rm-repeat-col');
  const items = col ? Array.from(col.children).filter(c => c.classList.contains('rm-item')) as HTMLElement[] : [];
  if (items.length === 0) return [{ ...wholeUnit(scope), blockEl, fragChild, unitKind: 'repeat' } as FlatUnit];
  const gap = parseFloat(getComputedStyle(col).rowGap || '') || 8;
  const once = scope.querySelector('.rm-once') as HTMLElement | null;
  const units = items.map((el, i): FlatUnit => ({ h: el.offsetHeight, gapBefore: i === 0 ? 0 : gap, pageStartExtra: 0, el, local: i, blockEl, fragChild, unitKind: 'repeat' }));
  if (once) units[units.length - 1].h += once.offsetHeight + gap;
  return units;
}

function flattenBlock(wrapper: HTMLElement): FlatUnit[] {
  const kind = wrapper.getAttribute('data-rm-kind') || 'block';
  if (kind === 'block' && wrapper.hasAttribute('data-rm-fragment-index')) {
    // A per-item repeat fragment. Universal split: every child block can flow
    // to the next page on its own — whole blocks move whole, ribbons split
    // between strips, tables split between rows (header repeats), nested
    // repeats split between items.
    const fragChildren = Array.from(wrapper.querySelectorAll('.rm-frag-child')) as HTMLElement[];
    if (fragChildren.length > 0) {
      const units: FlatUnit[] = [];
      let splittable = 0;
      for (let ci = 0; ci < fragChildren.length; ci++) {
        const el = fragChildren[ci];
        const ribbonUnits = Array.from(el.querySelectorAll('.rm-ribbon-unit')) as HTMLElement[];
        if (ribbonUnits.length > 0) {
          splittable++;
          for (const [ri, ru] of ribbonUnits.entries()) {
            units.push({ h: ru.offsetHeight, gapBefore: 0, pageStartExtra: 0, el: ru, local: ri, blockEl: wrapper, fragChild: ci, unitKind: 'ribbon' });
          }
          continue;
        }
        if (el.querySelector('.report-table-cols')) {
          units.push(...flattenTable(el, wrapper, 'table', ci));
          continue;
        }
        if (el.querySelector('.rm-repeat-col')) {
          units.push(...flattenRepeat(el, wrapper, ci));
          continue;
        }
        units.push({ h: el.offsetHeight, gapBefore: 0, pageStartExtra: 0, el, local: -1, blockEl: wrapper, fragChild: ci, unitKind: 'whole' });
      }
      if (units.length > 0) return units;
    }
    return [wholeUnit(wrapper)];
  }
  if (kind === 'repeat') {
    return flattenRepeat(wrapper, wrapper);
  }
  if (kind === 'table') {
    return flattenTable(wrapper, wrapper, 'table');
  }
  if (kind === 'ribbon') {
    const units = Array.from(wrapper.querySelectorAll('.rm-ribbon-unit')) as HTMLElement[];
    if (units.length === 0) return [wholeUnit(wrapper)];
    return units.map((el, i) => ({ h: el.offsetHeight, gapBefore: 0, pageStartExtra: 0, el, local: i, blockEl: wrapper, unitKind: 'ribbon' }));
  }
  return [wholeUnit(wrapper)];
}

/** Greedy page fill over a flat unit list. Returns unit-index lists, one per
 *  page. Units taller than the whole budget stay put and overflow (today's
 *  browser behavior). */
function fillPages(units: FlatUnit[], budget: number): number[][] {
  const pages: number[][] = [];
  let cur: number[] = [];
  let used = 0;
  units.forEach((u, i) => {
    const opening = cur.length === 0;
    if (!opening && used + u.gapBefore + u.h > budget) {
      if (u.h > budget) {
        cur.push(i);
        used += u.gapBefore + u.h;
        return;
      }
      pages.push(cur);
      cur = [i];
      used = u.pageStartExtra + u.h;
      return;
    }
    used += (opening ? u.pageStartExtra : u.gapBefore) + u.h;
    cur.push(i);
  });
  pages.push(cur);
  return pages;
}

function assembleChunks(page: number[], flat: FlatUnit[], blockById: Map<string, ReportBlock>, items: PageItem[]): BodyChunk[] {
  const out: BodyChunk[] = [];
  let i = 0;
  while (i < page.length) {
    const first = flat[page[i]];
    const blockEl = first.blockEl;
    const kind = blockEl.getAttribute('data-rm-kind') || 'block';
    const block = blockById.get(blockEl.getAttribute('data-rm-block-id') || '');
    let j = i;
    while (j + 1 < page.length && flat[page[j + 1]].blockEl === blockEl) j++;
    const last = flat[page[j]];
    i = j + 1;
    if (kind === 'block') {
      // Per-item repeat fragments carry only a fragment index on the WRAPPER
      // (unit elements are strips/children inside it).
      const fragIdxAttr = blockEl.getAttribute('data-rm-fragment-index');
      if (fragIdxAttr !== null) {
        const frag = items[Number.parseInt(fragIdxAttr, 10)];
        if (frag && 'repeatItem' in frag) {
          const total = flat.filter(u => u.blockEl === blockEl).length;
          const pageUnits = page.map(k => flat[k]).filter(u => u.blockEl === blockEl);
          if (pageUnits.length === total) {
            out.push({ kind: 'repeatItem', repeatItem: frag.repeatItem, item: frag.item, itemIndex: frag.itemIndex });
            continue;
          }
          // Split: group this page's units by child, build a part per child.
          const parts: FragmentPartUnit[] = [];
          const byChild = new Map<number, FlatUnit[]>();
          for (const u of pageUnits) {
            if (u.fragChild === undefined) continue;
            const arr = byChild.get(u.fragChild) || [];
            arr.push(u);
            byChild.set(u.fragChild, arr);
          }
          const totals = new Map<number, number>();
          for (const u of flat) {
            if (u.blockEl === blockEl && u.fragChild !== undefined) totals.set(u.fragChild, (totals.get(u.fragChild) || 0) + 1);
          }
          for (const [ci, units] of [...byChild.entries()].sort((a, b) => a[0] - b[0])) {
            const kind2 = units[0]?.unitKind || 'whole';
            if (kind2 === 'whole' || units.length === (totals.get(ci) || units.length)) {
              parts.push({ childIndex: ci });
              continue;
            }
            const locals = units.filter(u => u.local >= 0).map(u => u.local);
            if (kind2 === 'ribbon') {
              parts.push({ childIndex: ci, ribbonRange: [Math.min(...locals), Math.max(...locals) + 1] });
            } else if (kind2 === 'repeat') {
              parts.push({ childIndex: ci, itemRange: [Math.min(...locals), Math.max(...locals) + 1] });
            } else if (kind2 === 'table') {
              const hasHeader = units.some(u => u.local === -1);
              parts.push({
                childIndex: ci,
                tableRowRange: [Math.min(...locals), Math.max(...locals) + 1],
                repeatTableHeader: !hasHeader && Math.min(...locals) > 0,
              });
            }
          }
          out.push({ kind: 'repeatItemPart', repeatItem: frag.repeatItem, item: frag.item, itemIndex: frag.itemIndex, parts });
          continue;
        }
      }
      if (block) out.push({ kind: 'block', block });
      continue;
    }
    const total = flat.filter(u => u.blockEl === blockEl).length;
    if (first.local === 0 && last.local === total - 1) {
      out.push({ kind: 'block', block });
      continue;
    }
    if (kind === 'repeat') {
      out.push({ kind: 'repeat', block, itemStart: first.local, itemEnd: last.local + 1 });
    } else if (kind === 'table') {
      // Table units include the column-header unit (local -1) when showHeader
      // — rowStart/rowEnd are ROW indices (locals >= 0). The header repeats on
      // continuation chunks (rowStart > 0); the chunk holding the header unit
      // renders the real header (rowStart === 0).
      const pageUnits = page.map(k => flat[k]).filter(u => u.blockEl === blockEl);
      const pageRows = pageUnits.filter(u => u.local >= 0);
      const pageHasHeader = pageUnits.some(u => u.local === -1);
      const minRow = pageRows.length > 0 ? pageRows[0].local : -1;
      const maxRow = pageRows.length > 0 ? pageRows[pageRows.length - 1].local : -1;
      const rowTotal = flat.filter(u => u.blockEl === blockEl && u.local >= 0).length;
      if (pageHasHeader && minRow === 0 && maxRow === rowTotal - 1) {
        out.push({ kind: 'block', block });
      } else {
        out.push({ kind: 'table', block, rowStart: Math.max(0, minRow), rowEnd: maxRow + 1, repeatHeader: !pageHasHeader && minRow > 0 });
      }
    } else if (kind === 'ribbon') {
      out.push({ kind: 'ribbon', block, unitStart: first.local, unitEnd: last.local + 1 });
    }
  }
  return out;
}

function computeChunks(
  container: HTMLElement,
  pages: PageItem[][],
  headerSkipFirst: boolean,
  footerSkipFirst: boolean,
  contentHeight: number,
): PageChunk[] {
  const out: PageChunk[] = [];
  const pageEls = container.querySelectorAll('.rm-page');
for (let pi = 0; pi < pageEls.length; pi++) {
    const pageEl = pageEls[pi];
    const headerZone = pageEl.querySelector('.rm-header-zone') as HTMLElement | null;
    const footerZone = pageEl.querySelector('.rm-footer-zone') as HTMLElement | null;
    const headerH = headerZone ? headerZone.offsetHeight : 0;
    const footerH = footerZone ? footerZone.offsetHeight : 0;
    // offsetHeight excludes margins; mirror the render's .report-page-header
    // margin-bottom in the budget so one page never overflows its content box.
    const headerMargin = headerZone ? (parseFloat(getComputedStyle(headerZone).marginBottom) || 0) : 0;
    const budget = contentHeight - headerH - footerH - headerMargin;
    const bodyEl = pageEl.querySelector('.rm-body');
    const blocks = bodyEl ? Array.from(bodyEl.children).filter(c => c.classList.contains('rm-block')) as HTMLElement[] : [];
    const flat: FlatUnit[] = [];
    const blockById = new Map<string, ReportBlock>();
    const items = pages[pi] || [];
    for (const wrapper of blocks) {
      const id = wrapper.getAttribute('data-rm-block-id') || '';
      const block = id ? items.find(it => !('repeatItem' in it) && it.id === id) as ReportBlock | undefined : undefined;
      if (block) blockById.set(id, block);
      flat.push(...flattenBlock(wrapper));
    }
    const measurable = flat
      .map((u, i) => ({ u, i }))
      .filter(x => x.u.h > 0);
    const fill = fillPages(measurable.map(x => x.u), budget);
    for (const page of fill) {
      const globalIdx = out.length;
      const header = !(headerSkipFirst && globalIdx === 0);
      const footer = !(footerSkipFirst && globalIdx === 0);
      if (page.length === 0 && measurable.length === 0) {
        out.push({ header, footer, body: [] });
        continue;
      }
      const reindexed = page.map(k => measurable[k].i);
      out.push({ header, footer, body: assembleChunks(reindexed, flat, blockById, items) });
    }
  }
  return out;
}

function chunkSigEq(a: PageChunk[], b: PageChunk[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const ca = a[i];
    const cb = b[i];
    if (ca.header !== cb.header || ca.footer !== cb.footer || ca.body.length !== cb.body.length) return false;
    for (let j = 0; j < ca.body.length; j++) {
      const x = ca.body[j] as any;
      const y = cb.body[j] as any;
      if (x.kind !== y.kind) return false;
      if (x.kind === 'repeatItem') {
        if (x.block.id !== y.block.id || x.item !== y.item) return false;
      } else if (x.kind === 'repeatItemPart') {
        if (x.block.id !== y.block.id || x.item !== y.item || x.parts.length !== y.parts.length) return false;
        for (let p = 0; p < x.parts.length; p++) {
          const xp = x.parts[p] as any;
          const yp = y.parts[p] as any;
          if (xp.childIndex !== yp.childIndex) return false;
          if (JSON.stringify([xp.ribbonRange, xp.tableRowRange, xp.repeatTableHeader, xp.itemRange]) !== JSON.stringify([yp.ribbonRange, yp.tableRowRange, yp.repeatTableHeader, yp.itemRange])) return false;
        }
      } else if (x.kind === 'repeat') {
        if (x.block.id !== y.block.id || x.itemStart !== y.itemStart || x.itemEnd !== y.itemEnd) return false;
      } else if (x.kind === 'table') {
        if (x.block.id !== y.block.id || x.rowStart !== y.rowStart || x.rowEnd !== y.rowEnd || x.repeatHeader !== y.repeatHeader) return false;
      } else if (x.kind === 'ribbon') {
        if (x.block.id !== y.block.id || x.unitStart !== y.unitStart || x.unitEnd !== y.unitEnd) return false;
      } else if (x.block.id !== y.block.id) {
        return false;
      }
    }
  }
  return true;
}

/** Offscreen render of the structural pages. Heights are read from here in a
 *  layout effect; it must stay in the DOM while the chunks are displayed. */
export const ReportMeasureContainer = React.forwardRef<HTMLDivElement, {
  pages: PageItem[][];
  headerBlocks?: ReportBlock[];
  footerBlocks?: ReportBlock[];
  headerSkipFirst?: boolean;
  footerSkipFirst?: boolean;
  page: 'portrait' | 'landscape';
  ctx: ReportCtx;
  fieldMap: Record<string, ReportFieldDef>;
  scopeFilter?: ReportScopeFilter;
  ribbonOverrides?: Record<string, RibbonPrintOptions>;
  previewLimit?: boolean;
}>((props, ref) => {
  const { pages, headerBlocks, footerBlocks, headerSkipFirst, footerSkipFirst, page, ctx, fieldMap, scopeFilter, ribbonOverrides, previewLimit } = props;
  const metrics = REPORT_PAGE_METRICS[page];
  return (
    <div ref={ref} aria-hidden data-rm-container="true" style={{ position: 'absolute', left: -99999, top: 0, width: metrics.contentWidth, visibility: 'hidden', pointerEvents: 'none' }}>
      {pages.map((items, pi) => (
        <div key={pi} className="rm-page" data-rm-page={pi}>
          {!(headerSkipFirst && pi === 0) && headerBlocks && headerBlocks.length > 0 && (
            <div className="rm-header-zone" style={{ marginBottom: '8pt' }}>
              {headerBlocks.map(b => (
                <div key={b.id} className="rm-block" data-rm-kind="block" data-rm-block-id={b.id}>
                  <ReportBlockView block={b} ctx={ctx} fieldMap={fieldMap} scopeFilter={scopeFilter} aux={{ pageIndex: pi, pageCount: pages.length }} previewLimit={previewLimit} ribbonOverrides={ribbonOverrides} />
                </div>
              ))}
            </div>
          )}
          <div className="rm-body">
            {items.map((it, k) => (
              'repeatItem' in it ? (
                <div key={k} className="rm-block" data-rm-kind="block" data-rm-fragment-index={k}>
                  <PageItemBody pi={it} ctx={ctx} fieldMap={fieldMap} scopeFilter={scopeFilter} aux={{ pageIndex: pi, pageCount: pages.length }} previewLimit={previewLimit} ribbonOverrides={ribbonOverrides} />
                </div>
              ) : (
                <div key={it.id} className="rm-block" data-rm-kind={it.type === 'repeat' || it.type === 'table' || it.type === 'ribbon' ? it.type : 'block'} data-rm-block-id={it.id} data-rm-gap={it.type === 'repeat' ? (it.gap ?? 8) : 0}>
                  <ReportBlockView block={it} ctx={ctx} fieldMap={fieldMap} scopeFilter={scopeFilter} aux={{ pageIndex: pi, pageCount: pages.length }} previewLimit={previewLimit} ribbonOverrides={ribbonOverrides} />
                </div>
              )
            ))}
          </div>
          {!(footerSkipFirst && pi === 0) && footerBlocks && footerBlocks.length > 0 && (
            <div className="rm-footer-zone" style={{ paddingTop: "8pt" }}>
              {footerBlocks.map(b => (
                <div key={b.id} className="rm-block" data-rm-kind="block" data-rm-block-id={b.id}>
                  <ReportBlockView block={b} ctx={ctx} fieldMap={fieldMap} scopeFilter={scopeFilter} aux={{ pageIndex: pi, pageCount: pages.length }} previewLimit={previewLimit} ribbonOverrides={ribbonOverrides} />
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
});
ReportMeasureContainer.displayName = 'ReportMeasureContainer';

/** Measures content and returns the page chunks. `chunks` is null until the
 *  measurement layout effect has run (print must wait for it via onReady).
 *  `measured` turns true once the chunks are computed — callers unmount the
 *  measurement container then, so the hidden DOM (and its text) never
 *  pollutes the rendered pages. */
export function useReportPaginator({
  measureRef,
  pages,
  headerBlocks,
  footerBlocks,
  headerSkipFirst,
  footerSkipFirst,
  page,
  ctx,
  fieldMap,
  scopeFilter,
  ribbonOverrides,
  previewLimit,
  onReady,
}: PaginatorParams): { chunks: PageChunk[] | null; measured: boolean } {
  const metrics = REPORT_PAGE_METRICS[page];
  const [chunks, setChunks] = useState<PageChunk[] | null>(null);
  const [measured, setMeasured] = useState(false);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const sig = JSON.stringify([pages, ctx, fieldMap, scopeFilter, ribbonOverrides, headerSkipFirst, footerSkipFirst, previewLimit, page, metrics.contentHeight]);
  const lastSigRef = useRef<string | null>(null);
  const lastChunksRef = useRef<PageChunk[] | null>(null);

  useLayoutEffect(() => {
    if (lastSigRef.current !== sig) {
      // Inputs changed: the container may be unmounted — bring it back so the
      // next effect pass can measure it.
      setMeasured(false);
      lastSigRef.current = sig;
    }
    const el = measureRef.current;
    if (!el) return;
    const next = computeChunks(el, pages, !!headerSkipFirst, !!footerSkipFirst, metrics.contentHeight);
    lastChunksRef.current = next;
    if (!chunks || !chunkSigEq(chunks, next)) setChunks(next);
    setMeasured(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  React.useEffect(() => {
    if (chunks) onReadyRef.current?.();
  }, [chunks]);

  return { chunks, measured };
}