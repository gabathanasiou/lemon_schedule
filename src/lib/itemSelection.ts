import { MAX_SELECTION_ITEMS, type PresenceItemSelection } from './supabase/presence';
import { cssEscape } from './utils';

/**
 * DOM-surface peer selection (roadmap 234 stage 2) — the pure half of the
 * item-id protocol every DOM surface shares with the canvas grids: encode the
 * local selection for the wire, resolve a peer's ids to this instance's
 * elements, and compare measured outline rects cheaply.
 *
 * Items are OPAQUE ids: each surface defines its own vocabulary and resolves
 * them inside its own root — the element wearing
 * `data-presence-surface="<scope>"` (parity with the canvas grids'
 * `data-presence-grid`). The renderer lives in
 * `src/components/PeerItemOutlines.tsx`. Vitest: `src/lib/__tests__/itemSelection.test.ts`.
 */

/** The attribute a DOM surface's root wears — its value IS the scope the
 *  surface publishes under, and resolution never leaves that root. */
export const PRESENCE_SURFACE_ATTR = 'data-presence-surface';

/** id → the elements that wear an outline for it on this client. More than
 *  one element per id is fine (a report table column is every cell of it). */
export type ItemResolver = (id: string, root: ParentNode) => Element[];

/** The wire selection for a local item list: capped, empty/blank ids dropped,
 *  `null` when nothing is selected (parity with the grid half's no-range). */
export function itemSelectionOf(scope: string, items: readonly string[]): PresenceItemSelection | null {
  const ids: string[] = [];
  for (const id of items) {
    if (ids.length >= MAX_SELECTION_ITEMS) break;
    if (id) ids.push(id);
  }
  return ids.length > 0 ? { scope, items: ids } : null;
}

/** The default resolver: every element under `root` whose `attr` equals the
 *  id (escaped — ids are arbitrary strings from the wire). */
export function itemsByAttribute(attr: string): ItemResolver {
  return (id, root) => {
    if (!id) return [];
    return Array.from(root.querySelectorAll(`[${attr}="${cssEscape(id)}"]`));
  };
}

/** One measured outline, in viewport coordinates (the layer is `fixed`). */
export interface PeerOutlineRect {
  userId: string;
  item: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Change detector for the measured rects: quantized to whole pixels and
 *  sorted, so sub-pixel scroll jitter never re-renders the layer. */
export function outlineRectSignature(rects: readonly PeerOutlineRect[]): string {
  return rects
    .map(r => `${r.userId}§${r.item}§${Math.round(r.left)}§${Math.round(r.top)}§${Math.round(r.width)}§${Math.round(r.height)}`)
    .sort()
    .join('|');
}
