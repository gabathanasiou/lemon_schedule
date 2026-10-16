import { sanitizeRichText } from './richText';
import type { Project, ReportBlock, ReportDesign, ReportTrashItem } from '../types';

// Report rich text — the ONE stored-HTML sanitizer (roadmap 274, audit F1).
//
// Stored report markup (text blocks, free-table cells, headers/footers, table
// titles) reaches `dangerouslySetInnerHTML` through `resolveReportTokensHtml`.
// The editor's save path sanitizes, but every OTHER ingest path (a room peer's
// action, a hand-edited `.lemon`/localStorage blob, an agent write) stores
// markup verbatim — so this module enforces the kit's `sanitizeRichText`
// allowlist at the store ingest seams AND at the two render sinks.
//
// Sanitize BEFORE `resolveReportTokensHtml`: resolution injects trusted token
// chips whose styles (background/border-radius/padding/margin) are OUTSIDE the
// kit style allowlist — sanitizing the resolved HTML would strip them.
//
// Browser-only: `sanitizeRichText` parses through `document`. Node unit tests
// never call it with markup — they `vi.mock` this module (vitest runs without
// a DOM), exactly like the store wiring test does.

const MAX_CACHE = 500;
/** Memoized by stored string so unchanged content keeps ONE output identity
 *  (the `htmlProp` cache pattern in `richText.ts`) — the sinks re-sanitize on
 *  every render, and the token resolver downstream re-parses the result. */
const cache = new Map<string, string>();

/** Sanitize one stored rich-text string. Strings without markup pass through
 *  untouched (the kit sanitizer's own fast path) — DOM is only involved when
 *  there is markup to strip. */
export function sanitizeStoredReportHtml(html: string): string {
  if (!html || !html.includes('<')) return html;
  let out = cache.get(html);
  if (out === undefined) {
    if (cache.size > MAX_CACHE) cache.clear();
    out = sanitizeRichText(html);
    cache.set(html, out);
  }
  return out;
}

/** Every stored-HTML field on one block, in place (call on a clone). Nested
 *  containers mirror the block tree: table titles, repeat children, column
 *  layouts and free-table cells. `url` is NOT touched — link blocks are
 *  scheme-guarded at render (`ReportBlockView`). */
function sanitizeBlockInPlace(block: ReportBlock): void {
  if (typeof block.text === 'string') block.text = sanitizeStoredReportHtml(block.text);
  if (block.titleBlock) sanitizeBlockInPlace(block.titleBlock);
  for (const child of block.children || []) sanitizeBlockInPlace(child);
  for (const col of block.cols || []) {
    for (const nested of col.blocks || []) sanitizeBlockInPlace(nested);
  }
  for (const row of block.customRows || []) {
    if (row.cells) row.cells = row.cells.map(c => sanitizeStoredReportHtml(c));
  }
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Clone a block list and sanitize every stored-HTML field. Always returns
 *  fresh objects — store actions can stash the result without aliasing the
 *  action payload (replaces the old `JSON.parse(JSON.stringify(...))`). */
export function sanitizeReportBlocks(blocks: ReportBlock[]): ReportBlock[] {
  const cloned = clone(blocks);
  for (const block of cloned) sanitizeBlockInPlace(block);
  return cloned;
}

/** Sanitize one cloned design's three block lists in place. */
function sanitizeDesignInPlace(design: ReportDesign): void {
  design.blocks = sanitizeReportBlocks(design.blocks || []);
  if (design.header) design.header = sanitizeReportBlocks(design.header);
  if (design.footer) design.footer = sanitizeReportBlocks(design.footer);
}

export function sanitizeReportDesignsHtml(designs: ReportDesign[]): ReportDesign[] {
  return designs.map(design => {
    const cloned = clone(design);
    sanitizeDesignInPlace(cloned);
    return cloned;
  });
}

export function sanitizeReportTrashHtml(items: ReportTrashItem[]): ReportTrashItem[] {
  return items.map(item => {
    const cloned = clone(item);
    sanitizeDesignInPlace(cloned.design);
    return cloned;
  });
}

/** The load seam (`loadBaseline` — the single entrance for local, Drive,
 *  online and room-welcome projects): strips hostile markup from a decoded
 *  project before it becomes state. Identity when the project carries no
 *  report designs, so ordinary loads pay nothing. */
export function sanitizeProjectReportHtml(project: Project): Project {
  const designs = project.reportDesigns;
  const trash = project.reportTrash;
  const hasDesigns = !!designs && designs.length > 0;
  const hasTrash = !!trash && trash.length > 0;
  if (!hasDesigns && !hasTrash) return project;
  return {
    ...project,
    ...(hasDesigns ? { reportDesigns: sanitizeReportDesignsHtml(designs) } : {}),
    ...(hasTrash ? { reportTrash: sanitizeReportTrashHtml(trash) } : {}),
  };
}
