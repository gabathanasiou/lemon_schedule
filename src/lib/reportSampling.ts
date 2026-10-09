import type { ReportBlock } from '../types';
import { resolveCollectionItems, type ReportCtx, type ReportDayInfo } from './reportData';
import { reportFieldValueByKey, ITEM_SCOPES, TOKEN_RE, parseToken, type ReportFieldDef } from './reportFields';

// Which item the designer canvas samples for a repeat's template preview.
// Shared (roadmap 197) so the canvas and the designer day picker (roadmap 198)
// agree on what is on screen — never re-derive the heuristic.

/** The canvas samples ONE item for the repeat's template preview. Day-scoped
 *  repeats (`days`/`daysOfCast`) sample the designer's picked day
 *  (`previewSectionIndex`, roadmap 198) — unset (All days) = the FIRST
 *  production day of the ACTIVE schedule/calendar, the day preview/print page 1
 *  renders. Other collections pick the first item that resolves the most ITEM
 *  data — sampling a data-less scene (no cast/breakdown attached) would show
 *  raw {{tokens}} on the canvas while print/preview render the real items from
 *  later scenes. Document fields ({{pageCount}}, {{title}}…) resolve from
 *  ctx/aux, never from item data, so they're excluded from the comparison. */
export function sampleRepeatItem(
  ctx: ReportCtx,
  b: ReportBlock,
  fieldMap: Record<string, ReportFieldDef>,
  parentItem: any,
  parentCategory?: string,
  ancestors?: any,
  previewSectionIndex?: number,
): any {
  const items = resolveCollectionItems(ctx, b.collection, b.category, parentItem, parentCategory, b, ancestors);
  if (items.length === 0) return undefined;
  // Day-scoped repeats sample the designer's picked production day (items come
  // from ctx.dayInfos — never re-derived). Unset = the FIRST production day of
  // the ACTIVE schedule/calendar, so canvas matches preview/print page 1
  // (roadmap 197); the data-rich heuristic below used to show Day 2+ values
  // while preview page 1 was blank.
  if (b.collection === 'days' || b.collection === 'daysOfCast') {
    if (previewSectionIndex != null) {
      const picked = items.find(it => (it as ReportDayInfo).section?.index === previewSectionIndex);
      if (picked) return picked;
    }
    return items[0];
  }
  const itemTokens = new Set<string>();
  for (const cb of (b.children || [])) {
    if (cb.type === 'text' && cb.text) {
      for (const m of cb.text.matchAll(TOKEN_RE)) {
        const base = parseToken(m[1]).field.split('.')[0];
        const def = fieldMap[base];
        if (def && ITEM_SCOPES.has(def.scope)) itemTokens.add(m[1]);
      }
    } else if (cb.type === 'field' && cb.field) {
      const def = fieldMap[cb.field];
      if (def && ITEM_SCOPES.has(def.scope)) itemTokens.add(cb.field);
    }
  }
  if (itemTokens.size === 0) return items[0];
  let best = items[0];
  let bestMissing = Infinity;
  for (const it of items) {
    let missing = 0;
    for (const raw of itemTokens) {
      const base = parseToken(raw).field.split('.')[0];
      if (!reportFieldValueByKey(ctx, fieldMap, base, it, undefined)) missing++;
    }
    if (missing === 0) return it;
    if (missing < bestMissing) { bestMissing = missing; best = it; }
  }
  return best;
}
