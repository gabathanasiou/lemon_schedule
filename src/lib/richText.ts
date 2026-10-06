export { sanitizeRichText, stripRichText, escapeHtml, normalizeSpaces } from '@gabriel/ui-kit';

/** Stable `dangerouslySetInnerHTML` prop. React's commitUpdate compares prop
 *  values by reference and an inline `{ __html }` object changes identity on
 *  every render — so React re-parses the HTML and REPLACES the DOM subtree,
 *  which can kill a click/dblclick gesture mid-press (the cursor's node is
 *  detached between mousedown and mouseup). Cache the prop by its HTML string
 *  so unchanged content keeps ONE identity (used by the report canvas text
 *  blocks and free-table cells). */
const htmlPropCache = new Map<string, { __html: string }>();
export function htmlProp(html: string): { __html: string } {
  let prop = htmlPropCache.get(html);
  if (!prop) {
    if (htmlPropCache.size > 500) htmlPropCache.clear();
    prop = { __html: html };
    htmlPropCache.set(html, prop);
  }
  return prop;
}
