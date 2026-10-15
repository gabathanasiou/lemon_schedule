import { getPresenceGridScope } from './presenceResolvers';
import { pointerFractions, screenFractions, type PresenceAnchor } from './supabase/presence';

/**
 * Sender-side pointer → anchor resolution (roadmap 229 S3; extended by 236) —
 * the ONE chain shared by the global live-pointer tracker
 * (`presenceContext.tsx`) and the debug-bridge coverage inspector
 * (`presenceAnchorAt` in `src/lib/debugBridge.ts`).
 *
 * Order (first hit wins):
 *  1. a registered canvas grid's cell (`data-presence-grid` → scope probe);
 *  2. the semantic element under the pointer — `data-row-id` row, `data-date-key`
 *     calendar cell, Day Manager section, or the generic `data-presence-anchor`
 *     element (roadmap 236: report blocks, ribbon cells, sheet fields, nav);
 *  3. the nearest anchored item within ~40px (gutters/margins snap);
 *  4. the viewport-relative `screen` fallback so a cursor exists EVERYWHERE.
 *
 * Keys are explicit and stable across clients — never derived from DOM
 * structure or text. An anchor that does not resolve on the receiving client
 * hides the pointer (docs/COLLABORATION.md §9).
 */

/** The attribute an element wears to expose a stable, namespaced, cross-client
 *  pointer-anchor key (`report:<designId>:block:<id>`, `nav:tab:<tabId>`, …).
 *  Assign it in the SHARED component that renders the element (roadmap 236). */
export const PRESENCE_ANCHOR_ATTR = 'data-presence-anchor';

/** Any element that carries a shareable item anchor. */
const ITEM_SELECTOR = `[data-row-id], [data-date-key], [data-section], [data-day-sections], [${PRESENCE_ANCHOR_ATTR}]`;

/** Build the element-based anchor for a pointer over `el` (null when `el`
 *  isn't over a shareable item). */
function elementAnchor(el: Element, clientX: number, clientY: number): PresenceAnchor | null {
  const row = el.closest('[data-row-id]');
  const rowId = row?.getAttribute('data-row-id');
  if (row && rowId && !rowId.startsWith('empty-')) {
    return { kind: 'row', rowId, ...pointerFractions(clientX, clientY, row.getBoundingClientRect()) };
  }
  const cell = el.closest('[data-date-key]');
  const date = cell?.getAttribute('data-date-key');
  if (cell && date) {
    return { kind: 'date', date, ...pointerFractions(clientX, clientY, cell.getBoundingClientRect()) };
  }
  const dayManager = el.closest('[data-day-manager]');
  if (dayManager) {
    const dayIndex = Number(dayManager.getAttribute('data-day-manager-day'));
    if (Number.isFinite(dayIndex)) {
      const sectionEl = el.closest('[data-section]') ?? el.closest('[data-day-sections]') ?? dayManager;
      const section = sectionEl.getAttribute('data-section') ?? undefined;
      return { kind: 'day', sectionIndex: dayIndex, section, ...pointerFractions(clientX, clientY, sectionEl.getBoundingClientRect()) };
    }
  }
  const dom = el.closest(`[${PRESENCE_ANCHOR_ATTR}]`);
  const key = dom?.getAttribute(PRESENCE_ANCHOR_ATTR);
  if (dom && key) {
    return { kind: 'dom', key, ...pointerFractions(clientX, clientY, dom.getBoundingClientRect()) };
  }
  return null;
}

/** Nearest anchored item within ~40px — hovering a gutter/margin lands the
 *  pointer on the row/cell beside it instead of falling back to raw pixels. */
function nearestItemElement(x: number, y: number): Element | null {
  if (typeof document === 'undefined' || typeof document.elementFromPoint !== 'function') return null;
  for (const dy of [8, -8, 16, -16, 24, -24, 32, -32, 40, -40]) {
    for (const dx of [0, 12, -12]) {
      const el = document.elementFromPoint(x + dx, y + dy);
      if (!el) continue;
      const item = el.closest(ITEM_SELECTOR);
      if (item) return item;
    }
  }
  return null;
}

/** Resolve one pointer position into a shareable cursor anchor: a registered
 *  canvas-grid cell; else the semantic element under the pointer; else the
 *  nearest item within ~40px; else the viewport-relative `screen` fallback so
 *  a cursor exists EVERYWHERE (headers, toolbars, dialogs, empty space).
 *  Popout windows have their own document/window — the main window's pointer
 *  is what the team shares (docs/COLLABORATION.md §9). */
export function resolvePointerAnchor(clientX: number, clientY: number, target?: Element | null): PresenceAnchor {
  const el = target ?? null;
  if (el && typeof el.closest === 'function') {
    // 1. Canvas grids (Glide): the registered scope maps the pointer to a cell.
    const gridEl = el.closest('[data-presence-grid]');
    const scope = gridEl?.getAttribute('data-presence-grid');
    if (scope) {
      const hit = getPresenceGridScope(scope)?.probe(clientX, clientY);
      if (hit) return { kind: 'grid', scope, ...hit };
    }
    // 2. The shareable element under the pointer.
    const direct = elementAnchor(el, clientX, clientY);
    if (direct) return direct;
    // 3. Gutters/margins: snap to the nearest item (≤40px).
    const near = nearestItemElement(clientX, clientY);
    const snapped = near ? elementAnchor(near, clientX, clientY) : null;
    if (snapped) return snapped;
  }
  // 4. Free pointer: viewport-relative fallback (rendered only while the peer
  //    is on the same place as us — see sameViewPlace in presence.ts).
  return { kind: 'screen', ...screenFractions(clientX, clientY, window.innerWidth, window.innerHeight) };
}

/** Debug-bridge inspector (roadmap 236): the anchor that WOULD be published at
 *  a viewport point, so anchor coverage is auditable by hovering. Reads the
 *  topmost element itself (`elementFromPoint`) — the live tracker passes the
 *  event's own target instead. */
export function probeAnchorAt(clientX: number, clientY: number): PresenceAnchor {
  const el = typeof document !== 'undefined' && typeof document.elementFromPoint === 'function'
    ? document.elementFromPoint(clientX, clientY)
    : null;
  return resolvePointerAnchor(clientX, clientY, el);
}
