import { getPresenceGridScope } from './presenceResolvers';
import { PRESENCE_ANCHOR_ATTR } from './presenceAnchors';
import type { PresenceAnchor } from './supabase/presence';
import { cssEscape } from './utils';

/**
 * Presence anchor geometry (roadmap 229 S3, shared with the peer drag ghosts
 * of roadmap 235) — resolving a peer's SEMANTIC anchor (`row` / `date` / `day`
 * / `grid` / `dom` / `screen`) into a viewport point on THIS client, with this
 * client's own scroll, column widths and font scale. Raw pixels are never
 * sent; the point is derived here for rendering only.
 */

/** The element a shareable cursor anchor is attached to. */
export function anchorElement(anchor: PresenceAnchor): HTMLElement | null {
  switch (anchor.kind) {
    case 'row':
      return document.querySelector<HTMLElement>(`[data-row-id="${cssEscape(anchor.rowId)}"]`);
    case 'date':
      return document.querySelector<HTMLElement>(`[data-date-key="${cssEscape(anchor.date)}"]`);
    case 'day': {
      if (anchor.section) {
        const card = document.querySelector<HTMLElement>(`[data-day-manager] [data-section="${cssEscape(anchor.section)}"]`);
        if (card) return card;
      }
      return document.querySelector<HTMLElement>('[data-day-manager] [data-day-sections]')
        ?? document.querySelector<HTMLElement>('[data-day-manager]');
    }
    case 'dom':
      return document.querySelector<HTMLElement>(`[${PRESENCE_ANCHOR_ATTR}="${cssEscape(anchor.key)}"]`);
    default:
      return null;
  }
}

/** Anchors that resolve outside this client's viewport are hidden (user
 *  decision 2026-10-12: hide, no edge chips). */
export function inViewport(r: { left: number; top: number; width: number; height: number }): boolean {
  return r.left + r.width > 0 && r.left < window.innerWidth && r.top + r.height > 0 && r.top < window.innerHeight;
}

/** Anchor → viewport point (element rect + the position inside it), or null
 *  when the anchor cannot be shown on this client (element gone, scrolled off,
 *  unregistered grid). Unclamped — callers decide their own edge handling. */
export function resolveAnchorPoint(anchor: PresenceAnchor): { left: number; top: number } | null {
  if (anchor.kind === 'screen') {
    return {
      left: Math.min(Math.max(anchor.xr * window.innerWidth, 0), window.innerWidth - 4),
      top: Math.min(Math.max(anchor.yr * window.innerHeight, 0), window.innerHeight - 4),
    };
  }
  let rect: { left: number; top: number; width: number; height: number } | null = null;
  let fx = 0.5;
  let fy = 0.5;
  if (anchor.kind === 'grid') {
    // Registered canvas grid (Glide Breakdown): cell → THIS client's rect.
    const located = getPresenceGridScope(anchor.scope)?.locate(anchor) ?? null;
    if (located) {
      rect = located;
      fx = anchor.fx;
      fy = anchor.fy;
    }
  } else {
    const el = anchorElement(anchor);
    if (el) {
      const r = el.getBoundingClientRect();
      rect = { left: r.left, top: r.top, width: r.width, height: r.height };
      fx = anchor.fx;
      fy = anchor.fy;
    }
  }
  if (!rect || rect.width === 0 || rect.height === 0 || !inViewport(rect)) return null;
  return { left: rect.left + fx * rect.width, top: rect.top + fy * rect.height };
}
