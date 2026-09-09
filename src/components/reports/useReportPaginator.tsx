import React, { useLayoutEffect, useRef, useState } from 'react';
import { ReportBlock } from '../../types';
import { ReportCtx, ReportScopeFilter, RibbonPrintOptions } from '../../lib/reportData';
import { ReportFieldDef } from '../../lib/reportFields';
import { BodyChunk, FragmentPartUnit, PageChunk, splittableKind } from '../../lib/reportPagination';
import { REPORT_PAGE_METRICS, blockGapMargin } from './reportStyle';
import { ReportBlockView } from './ReportBlockView';

// Measured pagination for reports. The structural pages from paginateBlocks
// (top-level pageBreak splits) are rendered offscreen ONCE (ReportMeasureContainer),
// element heights are read from the real engine's layout, and content is split
// into page-sized chunks. Both print and preview render the SAME chunks, so the
// preview always equals the print (reportPagination.md rule 7).
//
// A `pageBreak` block ANYWHERE in the render is a hard chunk boundary: the
// block renders a zero-height `data-rm-pagebreak` marker, the walker emits a
// `break` unit for it, and fillPages closes the current page there (a break at
// the START of a page is a no-op — items that render nothing produce no pages).
// Containers that cannot be sliced (columns/callSheetEdit) get `breakBefore`:
// the whole container starts a new page when it contains a break.
//
// Granularity (universal):
//  - whole blocks keep together (move to the next page when they don't fit);
//  - repeat/relative items dissolve into their CHILDREN (whole blocks, split
//    ribbons between strips, split tables between rows repeating the header,
//    split nested repeats between items) — items fill pages contiguously;
//  - tables split between ROWS, repeating the column header on continuation
//    pages (classic "thead repeats" behavior);
//  - ribbons split between STRIPS/note/break/daybreak units — never mid-strip;
//  - day boxes split between strips, dropping the box border on fragments.
//
// Oversized single units (taller than a page) stay put and overflow — same
// behavior as the browser's automatic pagination today.

interface PaginatorParams {
  measureRef: React.RefObject<HTMLDivElement | null>;
  pages: ReportBlock[][];
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
  callSheetBlocks?: ReportBlock[];
  onReady?: () => void;
}

/** One step of a repeat fragment path: the item index at this nesting level
 *  and (for a child container) which child of it. A WHOLE item ends with a
 *  childless `{ item }` step. */
interface FlatStep {
  item: number;
  child?: number;
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
  /** Dissolved repeat metadata: the `{ item, child }` path from the top-level
   *  repeat down to the unit's leaf (undefined for top-level non-repeat
   *  blocks). `local` is the leaf position (row/strip/nested-item index; -1 =
   *  table header). A `unitKind: 'break'` unit is a hard page boundary (h=0). */
  path?: FlatStep[];
  unitKind?: 'whole' | 'ribbon' | 'table' | 'repeat' | 'break';
  /** Unit must START a new page (a pageBreak exists inside an unsplittable
   *  container — the whole container moves to the next page). */
  breakBefore?: boolean;
}

function marginTopOf(el: HTMLElement): number {
  return parseFloat(getComputedStyle(el).marginTop) || 0;
}

function wholeUnit(wrapper: HTMLElement, extra: Partial<FlatUnit> = {}): FlatUnit {
  // The wrapper's marginTop is the block's gap (roadmap 33) — read it into
  // gapBefore so page budgets include the spacing between stacked blocks
  // (mirrors the header-margin and repeat rowGap reads). The first wrapper in
  // a page has margin 0 (.rm-body > :first-child / inline isFirst), so a block
  // that opens a page never pays the gap.
  return { h: wrapper.offsetHeight, gapBefore: marginTopOf(wrapper), pageStartExtra: 0, el: wrapper, local: 0, blockEl: wrapper, ...extra };
}


/** Columns-grid table: one unit per row, plus a header unit (local -1) when
 *  showHeader. Continuation rows reserve the repeated header height. */
function flattenTable(scope: HTMLElement, blockEl: HTMLElement, kind: 'table' | 'whole', path?: FlatStep[]): FlatUnit[] {
  const containers = scope.querySelectorAll('.report-table-cols');
  const first = containers[0] as HTMLElement | undefined;
  // The scope wrapper's marginTop is the block's gap (roadmap 33) — paid
  // before the block's first unit so tables budget their spacing too.
  const blockGap = marginTopOf(scope);
  if (first && first.classList.contains('rm-row')) {
    // rows-matrix: one self-contained grid per row group (label header is
    // inside each group) — no repeated header needed.
    return Array.from(containers).map((c, i): FlatUnit => ({ h: (c as HTMLElement).offsetHeight, gapBefore: i === 0 ? blockGap : 0, pageStartExtra: 0, el: c as HTMLElement, local: i, blockEl, path, unitKind: 'table' }));
  }
  if (first) {
    const headerEl = first.querySelector(':scope > .rm-header') as HTMLElement | null;
    const headerH = headerEl ? headerEl.offsetHeight : 0;
    const rows = Array.from(first.children).filter(c => c.classList.contains('rm-row')) as HTMLElement[];
    const units = rows.map((el, i): FlatUnit => ({
      h: el.offsetHeight,
      // The block's own gap rides on the FIRST row's gapBefore (a header-less
      // table) — a header unit below gets it instead. Each row also pays its
      // own marginTop (grid-block inter-table gap, item 116).
      gapBefore: (i === 0 && !headerEl ? blockGap : 0) + marginTopOf(el),
      // A continuation chunk renders the column header again at its top
      // (classic "thead repeats") — reserve that height when a row opens a
      // page. Row 0 does too: if it opens a page its header unit stayed on the
      // previous page, and `rowRange[0] === 0` still renders the header (an
      // orphaned header — reserved here so the budget stays honest). local -1
      // marks the header unit (folded into row ranges below).
      pageStartExtra: headerH,
      el,
      local: i,
      blockEl,
      path,
      unitKind: 'table',
    }));
    if (headerEl) units.unshift({ h: headerH, gapBefore: blockGap, pageStartExtra: 0, el: headerEl, local: -1, blockEl, path, unitKind: 'table' } as FlatUnit);
    return units;
  }
  return [{ ...wholeUnit(scope, { blockEl, path, unitKind: kind }) } as FlatUnit];
}

/** One repeat item's children: each child block flows independently (whole
 *  children move whole, ribbons split between strips, tables between rows,
 *  nested repeats dissolve RECURSIVELY) and a pageBreak child is a hard break.
 *  `prefix` is the path to this item's repeat level; every unit gets a path
 *  step `{ item: itemIndex, child: ci }` so `assembleChunks` can rebuild the
 *  nested part tree at ANY depth. The child's kind comes from `data-rm-kind`
 *  (the block type), NEVER from a descendant query — a nested repeat contains
 *  a table, and matching that table would flatten the repeat as one giant
 *  table (the overflow bug). */
function flattenFragChildren(
  fragChildren: HTMLElement[],
  blockEl: HTMLElement,
  itemIndex: number,
  prefix: FlatStep[],
): FlatUnit[] {
  const units: FlatUnit[] = [];
  for (let ci = 0; ci < fragChildren.length; ci++) {
    const el = fragChildren[ci];
    const path = [...prefix, { item: itemIndex, child: ci }];
    if (el.querySelector(':scope > [data-rm-pagebreak]')) {
      units.push({ h: 0, gapBefore: 0, pageStartExtra: 0, el, local: -1, blockEl, path, unitKind: 'break' });
      continue;
    }
    const kind = el.getAttribute('data-rm-kind') || 'block';
    if (kind === 'ribbon') {
      const ribbonUnits = Array.from(el.querySelectorAll('.rm-ribbon-unit')) as HTMLElement[];
      if (ribbonUnits.length > 0) {
        const blockGap = marginTopOf(el);
        for (const [ri, ru] of ribbonUnits.entries()) {
          units.push({ h: ru.offsetHeight, gapBefore: ri === 0 ? blockGap : 0, pageStartExtra: 0, el: ru, local: ri, blockEl, path, unitKind: 'ribbon' });
        }
        continue;
      }
    } else if (kind === 'table') {
      units.push(...flattenTable(el, blockEl, 'table', path));
      continue;
    } else if (kind === 'repeat') {
      // A nested repeat dissolves into ITS items — and each of those items
      // dissolves again (flattenRepeatContent recurses), so a tall nested item
      // splits at row/strip granularity instead of overflowing (roadmap 120).
      units.push(...flattenRepeatContent(el, blockEl, path));
      continue;
    }
    units.push({
      ...wholeUnit(el, { blockEl, path, unitKind: 'whole', breakBefore: !!el.querySelector('[data-rm-pagebreak]') }),
    });
  }
  return units;
}

/** Repeat/relative items. When the item has child wrappers (`.rm-frag-child`)
 *  they dissolve into independent units (universal fragment splitting); an
 *  item without children stays one atomic unit. `prefix` is the path to this
 *  repeat's items (empty for a top-level repeat; the parent `{ item, child }`
 *  step for a nested one). */
function flattenRepeatContent(scope: HTMLElement, blockEl: HTMLElement, prefix: FlatStep[]): FlatUnit[] {
  const col = scope.querySelector('.rm-repeat-col');
  const items = col ? Array.from(col.children).filter(c => c.classList.contains('rm-item')) as HTMLElement[] : [];
  if (items.length === 0) return [{ ...wholeUnit(scope, { blockEl, path: prefix, unitKind: 'repeat' }) } as FlatUnit];
  const gap = parseFloat(getComputedStyle(col).rowGap || '') || 8;
  const once = scope.querySelector('.rm-once') as HTMLElement | null;
  // The scope wrapper's marginTop is the block's gap (roadmap 33) — paid
  // before the repeat's FIRST content unit so it budgets its spacing too.
  // A nested scope reads its own `.rm-frag-child` wrapper margin.
  const blockGap = marginTopOf(scope);
  const units: FlatUnit[] = [];
  for (let ii = 0; ii < items.length; ii++) {
    const itemEl = items[ii];
    const children = Array.from(itemEl.children).filter(c => c.classList.contains('rm-frag-child')) as HTMLElement[];
    if (children.length === 0) {
      units.push({ h: itemEl.offsetHeight, gapBefore: ii === 0 ? blockGap : gap, pageStartExtra: 0, el: itemEl, local: 0, blockEl, path: [...prefix, { item: ii }], unitKind: 'whole' });
      continue;
    }
    const start = units.length;
    units.push(...flattenFragChildren(children, blockEl, ii, prefix));
    // The block gap (first item) / item gap (later items) applies before the
    // item's first CONTENT unit (breaks never consume it).
    const firstContent = units.slice(start).findIndex(u => u.unitKind !== 'break');
    if (firstContent >= 0) units[start + firstContent].gapBefore += ii === 0 ? blockGap : gap;
  }
  // Summary tables (`rm-once` — e.g. elementsOfCategory tables) fold into the
  // last item: they render once after the final item (renderOnce logic).
  if (once) {
    const lastUnit = [...units].reverse().find(u => u.unitKind !== 'break');
    if (lastUnit) lastUnit.h += once.offsetHeight + gap;
    else return [wholeUnit(scope, { blockEl, path: prefix, unitKind: 'repeat' })];
  }
  return units;
}

function flattenBlock(wrapper: HTMLElement): FlatUnit[] {
  const kind = wrapper.getAttribute('data-rm-kind') || 'block';
  if (kind === 'repeat') {
    return flattenRepeatContent(wrapper, wrapper, []);
  }
  if (kind === 'table') {
    return flattenTable(wrapper, wrapper, 'table');
  }
  if (kind === 'ribbon') {
    const units = Array.from(wrapper.querySelectorAll('.rm-ribbon-unit')) as HTMLElement[];
    if (units.length === 0) return [wholeUnit(wrapper)];
    const blockGap = marginTopOf(wrapper);
    return units.map((el, i) => ({ h: el.offsetHeight, gapBefore: i === 0 ? blockGap : 0, pageStartExtra: 0, el, local: i, blockEl: wrapper, unitKind: 'ribbon' }));
  }
  // 'block' (whole): text/field/columns/callSheetEdit/… — an unsplittable
  // container (columns/callSheetEdit) with a pageBreak inside starts a new
  // page as a unit.
  return [{ ...wholeUnit(wrapper, { breakBefore: !!wrapper.querySelector('[data-rm-pagebreak]') }) } as FlatUnit];
}

/** Greedy page fill over a flat unit list. Returns unit-index lists, one per
 *  page. `break` units close the current page (no-op at the page start so
 *  empty items produce no pages); `breakBefore` units force a new page first.
 *  Units taller than the whole budget stay put and overflow (today's browser
 *  behavior). */
function fillPages(units: FlatUnit[], budget: number): number[][] {
  const pages: number[][] = [];
  let cur: number[] = [];
  let used = 0;
  let curHasContent = false;
  units.forEach((u, i) => {
    if (u.unitKind === 'break') {
      // A break closes the page only when the page holds real content — a
      // break behind all-nothing children (an empty item) is a no-op, so
      // empty items never produce blank pages.
      if (curHasContent) {
        pages.push(cur);
        cur = [];
        used = 0;
        curHasContent = false;
      }
      return;
    }
    if (u.breakBefore && curHasContent) {
      pages.push(cur);
      cur = [];
      used = 0;
      curHasContent = false;
    }
    if (cur.length > 0 && used + u.gapBefore + u.h > budget) {
      if (u.h > budget) {
        cur.push(i);
        used += u.gapBefore + u.h;
        if (u.h > 0) curHasContent = true;
        return;
      }
      pages.push(cur);
      cur = [i];
      used = u.pageStartExtra + u.h;
      curHasContent = u.h > 0;
      return;
    }
    used += (cur.length === 0 ? u.pageStartExtra : u.gapBefore) + u.h;
    cur.push(i);
    if (u.h > 0) curHasContent = true;
  });
  // Drop a trailing page with no content: items that render nothing after the
  // last real content leave only zero-height units and no-op breaks behind.
  // The explicit blank page from consecutive TOP-LEVEL pageBreaks is a
  // structural page (items.length === 0) handled by computeChunks, not here.
  if (curHasContent) pages.push(cur);
  return pages;
}

/** Count non-break units keyed by every path prefix (item and child nodes).
 *  A node is FULLY present on a page iff its page count equals its total. */
function countByPrefix(units: FlatUnit[]): Map<string, number> {
  const counts = new Map<string, number>();
  const bump = (k: string) => counts.set(k, (counts.get(k) || 0) + 1);
  for (const u of units) {
    if (!u.path || u.unitKind === 'break') continue;
    for (let d = 0; d < u.path.length; d++) {
      const step = u.path[d];
      const ik = `${JSON.stringify(u.path.slice(0, d))}#i${step.item}`;
      bump(ik);
      if (step.child !== undefined) bump(`${ik}#c${step.child}`);
    }
  }
  return counts;
}

function nodeFull(key: string, totals: Map<string, number>, present: Map<string, number>): boolean {
  const t = totals.get(key);
  return t !== undefined && t > 0 && present.get(key) === t;
}

/** One child container's fragment: a whole child (`childIndex` only) when every
 *  unit is present, else a row/strip range, or — for a nested repeat — a nested
 *  `itemRange` + `itemParts` rebuilt recursively. */
function buildChildPart(
  childUnits: FlatUnit[],
  totals: Map<string, number>,
  present: Map<string, number>,
  depth: number,
  prefix: FlatStep[],
  item: number,
  child: number,
): FragmentPartUnit {
  const childKey = `${JSON.stringify(prefix)}#i${item}#c${child}`;
  if (nodeFull(childKey, totals, present)) return { childIndex: child };
  if (childUnits.some(u => u.path!.length > depth + 1)) {
    const nested = buildRepeatLevel(childUnits, totals, present, depth + 1, [...prefix, { item, child }]);
    return { childIndex: child, itemRange: [nested.itemStart, nested.itemEnd], itemParts: nested.perItemParts };
  }
  const locals = childUnits.filter(u => u.local >= 0).map(u => u.local);
  const min = Math.min(...locals);
  const max = Math.max(...locals);
  const kind = childUnits[0]?.unitKind || 'whole';
  if (kind === 'ribbon') return { childIndex: child, ribbonRange: [min, max + 1] };
  if (kind === 'table') {
    const hasHeader = childUnits.some(u => u.local === -1);
    return { childIndex: child, tableRowRange: [min, max + 1], repeatTableHeader: !hasHeader && min > 0 };
  }
  return { childIndex: child };
}

/** Rebuild the nested per-item parts for ONE repeat level present on a page.
 *  `depth` indexes the path step for this level; `prefix` is the shared path
 *  prefix (length = depth). A `null` entry = the item renders whole. */
function buildRepeatLevel(
  pageUnits: FlatUnit[],
  totals: Map<string, number>,
  present: Map<string, number>,
  depth: number,
  prefix: FlatStep[],
): { itemStart: number; itemEnd: number; perItemParts: (FragmentPartUnit[] | null)[] } {
  const prefixJson = JSON.stringify(prefix);
  const byItem = new Map<number, FlatUnit[]>();
  for (const u of pageUnits) {
    const it = u.path![depth].item;
    const arr = byItem.get(it);
    if (arr) arr.push(u); else byItem.set(it, [u]);
  }
  const items = [...byItem.keys()].sort((a, b) => a - b);
  const itemStart = items[0];
  const itemEnd = items[items.length - 1] + 1;
  const perItemParts: (FragmentPartUnit[] | null)[] = Array.from({ length: itemEnd - itemStart }, () => null);
  for (const it of items) {
    const itemUnits = byItem.get(it)!;
    if (nodeFull(`${prefixJson}#i${it}`, totals, present)) continue; // whole item
    const byChild = new Map<number, FlatUnit[]>();
    for (const u of itemUnits) {
      const c = u.path![depth].child;
      if (c === undefined) continue;
      const arr = byChild.get(c);
      if (arr) arr.push(u); else byChild.set(c, [u]);
    }
    const parts: FragmentPartUnit[] = [];
    for (const [c, childUnits] of [...byChild.entries()].sort((a, b) => a[0] - b[0])) {
      parts.push(buildChildPart(childUnits, totals, present, depth, prefix, it, c));
    }
    perItemParts[it - itemStart] = parts;
  }
  return { itemStart, itemEnd, perItemParts };
}

function assembleChunks(page: number[], flat: FlatUnit[], blockById: Map<string, ReportBlock>): BodyChunk[] {
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
      if (block) out.push({ kind: 'block', block });
      continue;
    }
    if (kind === 'repeat') {
      // Dissolved repeat: group the page's units by their nested path. A page
      // may hold whole items (part = null) and partial items (parts) at ANY
      // depth — a nested repeat child carries its own itemRange + itemParts.
      const pageUnits = page.map(k => flat[k]).filter(u => u.blockEl === blockEl && u.unitKind !== 'break');
      if (!pageUnits.some(u => u.path && u.path.length > 0)) {
        // Not dissolved (empty/once-only repeat): the whole block moves as one.
        if (block) out.push({ kind: 'block', block });
        continue;
      }
      const blockUnits = flat.filter(u => u.blockEl === blockEl);
      const totals = countByPrefix(blockUnits);
      const present = countByPrefix(pageUnits);
      const built = buildRepeatLevel(pageUnits, totals, present, 0, []);
      if (block) out.push({ kind: 'repeat', block, itemStart: built.itemStart, itemEnd: built.itemEnd, perItemParts: built.perItemParts });
      continue;
    }
    const total = flat.filter(u => u.blockEl === blockEl && u.unitKind !== 'break').length;
    if (first.local === 0 && last.local === total - 1) {
      out.push({ kind: 'block', block });
      continue;
    }
    if (kind === 'table') {
      // Table units include the column-header unit (local -1) when showHeader
      // — rowStart/rowEnd are ROW indices (locals >= 0). The header repeats on
      // continuation chunks (rowStart > 0); the chunk holding the header unit
      // renders the real header (rowStart === 0).
      const pageUnits = page.map(k => flat[k]).filter(u => u.blockEl === blockEl && u.unitKind !== 'break');
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
  pages: ReportBlock[][],
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
      const block = id ? items.find(it => it.id === id) : undefined;
      if (block) blockById.set(id, block);
      flat.push(...flattenBlock(wrapper));
    }
    // A structural page whose blocks rendered nothing (empty table/repeat at
    // top level, header/footer-only pages) is dropped — only pages from
    // consecutive top-level pageBreaks ([], items.length === 0) are blank.
    if (items.length > 0 && !flat.some(u => u.h > 0)) continue;
    const fill = fillPages(flat, budget);
    const globalIdx = out.length;
    const header = !(headerSkipFirst && globalIdx === 0);
    const footer = !(footerSkipFirst && globalIdx === 0);
    if (items.length === 0 && flat.length === 0) {
      out.push({ header, footer, body: [] });
      continue;
    }
    for (const page of fill) {
      const idx = out.length;
      const h = !(headerSkipFirst && idx === 0);
      const f = !(footerSkipFirst && idx === 0);
      out.push({ header: h, footer: f, body: assembleChunks(page, flat, blockById) });
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
      if (x.kind === 'repeat') {
        if (x.block.id !== y.block.id || x.itemStart !== y.itemStart || x.itemEnd !== y.itemEnd) return false;
        if (JSON.stringify(x.perItemParts) !== JSON.stringify(y.perItemParts)) return false;
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
  pages: ReportBlock[][];
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
  callSheetBlocks?: ReportBlock[];
}>((props, ref) => {
  const { pages, headerBlocks, footerBlocks, headerSkipFirst, footerSkipFirst, page, ctx, fieldMap, scopeFilter, ribbonOverrides, previewLimit, callSheetBlocks } = props;
  const metrics = REPORT_PAGE_METRICS[page];
  return (
    <div ref={ref} aria-hidden data-rm-container="true" style={{ position: 'absolute', left: -99999, top: 0, width: metrics.contentWidth, visibility: 'hidden', pointerEvents: 'none' }}>
      {pages.map((items, pi) => (
        <div key={pi} className="rm-page" data-rm-page={pi}>
          {!(headerSkipFirst && pi === 0) && headerBlocks && headerBlocks.length > 0 && (
            <div className="rm-header-zone" style={{ marginBottom: '8pt' }}>
              {headerBlocks.map((b, i) => (
                <div key={b.id} className="rm-block" data-rm-kind="block" data-rm-block-id={b.id} style={{ marginTop: blockGapMargin(b, i === 0) }}>
                  <ReportBlockView block={b} ctx={ctx} fieldMap={fieldMap} scopeFilter={scopeFilter} aux={{ pageIndex: pi, pageCount: pages.length, callSheetBlocks }} previewLimit={previewLimit} ribbonOverrides={ribbonOverrides} />
                </div>
              ))}
            </div>
          )}
          <div className="rm-body">
            {items.map((it, k) => (
              <div key={it.id} className="rm-block" data-rm-kind={splittableKind(it.type)} data-rm-block-id={it.id} data-rm-gap={it.type === 'repeat' ? (it.gap ?? 8) : 0} style={{ marginTop: blockGapMargin(it, k === 0) }}>
                <ReportBlockView block={it} ctx={ctx} fieldMap={fieldMap} scopeFilter={scopeFilter} aux={{ pageIndex: pi, pageCount: pages.length, callSheetBlocks }} previewLimit={previewLimit} ribbonOverrides={ribbonOverrides} />
              </div>
            ))}
          </div>
          {!(footerSkipFirst && pi === 0) && footerBlocks && footerBlocks.length > 0 && (
            <div className="rm-footer-zone" style={{ paddingTop: "8pt" }}>
              {footerBlocks.map((b, i) => (
                <div key={b.id} className="rm-block" data-rm-kind="block" data-rm-block-id={b.id} style={{ marginTop: blockGapMargin(b, i === 0) }}>
                  <ReportBlockView block={b} ctx={ctx} fieldMap={fieldMap} scopeFilter={scopeFilter} aux={{ pageIndex: pi, pageCount: pages.length, callSheetBlocks }} previewLimit={previewLimit} ribbonOverrides={ribbonOverrides} />
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
  callSheetBlocks,
  onReady,
}: PaginatorParams): { chunks: PageChunk[] | null; measured: boolean } {
  const metrics = REPORT_PAGE_METRICS[page];
  const [chunks, setChunks] = useState<PageChunk[] | null>(null);
  const [measured, setMeasured] = useState(false);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const sig = JSON.stringify([pages, ctx, fieldMap, scopeFilter, ribbonOverrides, headerSkipFirst, footerSkipFirst, previewLimit, callSheetBlocks, page, metrics.contentHeight]);
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