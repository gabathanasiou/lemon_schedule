import type { PresenceScrollSample, ScrollSurface } from './supabase/presence';
import { cssEscape } from './utils';

/**
 * Presence scroll mirroring (roadmap 229 follow completeness) — the ONE seam
 * between the presence layer and the scrollable surfaces (stripboard,
 * Calendar, Scene Sheet, Glide grid). Manual: docs/COLLABORATION.md §9.
 *
 * Sender: a mounted surface samples the SEMANTIC item at its top edge
 * (`sampleDomScroll` → the item's key + how far into it the container is
 * scrolled) and publishes it through the presence channel. Never pixels —
 * keys survive scroll, reflow, reorder and per-user layout settings.
 *
 * Receiver: the presence layer pushes a followed peer's sample to the
 * surface's registered `apply` (the surface owns its own DOM/scroll API), so
 * a canvas grid can use its scroll API instead of DOM math.
 *
 * The user-decision rule (2026-10-13) — a manual scroll by the FOLLOWER exits
 * follow — lives in the surface hook (`usePresenceScrollSurface`): DOM
 * surfaces compare the applied scrollTop to filter their own echo, and all
 * surfaces treat a wheel/touch gesture as the user.
 */

/** A local sample: the item key + 0..1 into it, plus an optional coarse
 *  fallback anchor (stripboard: the containing day block). */
export interface ScrollItemSample {
  key: string;
  off: number;
  fkey?: string;
  foff?: number;
}

/** The rendered-surface hooks' DOM descriptor (sticky chrome + optional
 *  coarse fallback items). */
export interface DomScrollDescriptor {
  container: HTMLElement | null;
  selector: string;
  keyAttr: string;
  /** Sticky chrome inside the container the top edge hides under (px). */
  sticky?: number;
  /** Coarse, always-mounted fallback items (stripboard day blocks). */
  fallback?: { selector: string; keyAttr: string };
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * The semantic item at the container's top edge: the LAST item whose top sits
 * above `scrollTop + sticky` — for grid layouts (Scene Sheet cards, Calendar
 * weeks) the whole row shares one offsetTop, so the walk-back returns the
 * row's first item and `off` measures into that row.
 *
 * Desktop-grade perf: items are found with a binary search over `offsetTop`
 * (monotonic in DOM order — one layout read, the rest cached) plus a single
 * calibration rect; no per-item `getBoundingClientRect`.
 */
export function topVisibleItem(
  container: HTMLElement | null,
  itemSelector: string,
  keyAttr: string,
  sticky = 0,
): { key: string; off: number } | null {
  if (!container) return null;
  const items = container.querySelectorAll<HTMLElement>(itemSelector);
  if (items.length === 0) return null;
  const first = items[0];
  // Calibrate the items' offsetTop space against the container's scroll space
  // (their offsetParent may sit above the container).
  const containerTop = container.getBoundingClientRect().top;
  const contentOrigin = first.offsetTop - (first.getBoundingClientRect().top - containerTop + container.scrollTop);
  const threshold = container.scrollTop + sticky;
  let lo = 0;
  let hi = items.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (items[mid].offsetTop - contentOrigin <= threshold) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (found < 0) return null; // scrolled above the first item (overscroll)
  let start = found;
  while (start > 0 && items[start - 1].offsetTop === items[found].offsetTop) start--;
  const item = items[start];
  const key = item.getAttribute(keyAttr);
  if (!key) return null;
  const itemTop = item.offsetTop - contentOrigin;
  const height = item.offsetHeight || 1;
  return { key, off: clamp01((threshold - itemTop) / height) };
}

/**
 * Align one anchor on THIS client's layout: the item's top edge at
 * `containerTop + sticky`, minus `off` of its height. Returns the actual
 * (browser-clamped) scrollTop so the caller can recognise its own echo, or
 * null when the item isn't mounted.
 */
export function scrollItemToTop(
  container: HTMLElement | null,
  itemSelector: string,
  keyAttr: string,
  key: string,
  off: number,
  sticky = 0,
): number | null {
  if (!container) return null;
  const el = container.querySelector<HTMLElement>(`${itemSelector}[${keyAttr}="${cssEscape(key)}"]`);
  if (!el) return null;
  const containerTop = container.getBoundingClientRect().top;
  const rect = el.getBoundingClientRect();
  container.scrollTop = container.scrollTop + (rect.top - containerTop) - sticky - clamp01(off) * rect.height;
  return container.scrollTop;
}

/** Sample a DOM surface: the primary top-edge item plus (when the descriptor
 *  has one) the coarse fallback item — e.g. the stripboard's visible day. */
export function sampleDomScroll(desc: DomScrollDescriptor): ScrollItemSample | null {
  const sticky = desc.sticky ?? 0;
  const primary = topVisibleItem(desc.container, desc.selector, desc.keyAttr, sticky);
  if (!primary || !desc.fallback) return primary;
  const fb = topVisibleItem(desc.container, desc.fallback.selector, desc.fallback.keyAttr, sticky);
  return fb ? { ...primary, fkey: fb.key, foff: fb.off } : primary;
}

/** Apply a followed sample to a DOM surface. The primary item wins; when it
 *  isn't mounted (the receiver's render window is elsewhere) the coarse
 *  fallback lands the view first — the item then renders, and one re-align
 *  after paint puts it exactly at the top edge. */
export function applyDomScroll(desc: DomScrollDescriptor, sample: PresenceScrollSample): number | null {
  const sticky = desc.sticky ?? 0;
  const applied = scrollItemToTop(desc.container, desc.selector, desc.keyAttr, sample.key, sample.off, sticky);
  if (applied != null) return applied;
  if (!desc.fallback || sample.fkey === undefined) return null;
  const landed = scrollItemToTop(desc.container, desc.fallback.selector, desc.fallback.keyAttr, sample.fkey, sample.foff ?? 0, sticky);
  if (landed == null) return null;
  const container = desc.container;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    scrollItemToTop(container, desc.selector, desc.keyAttr, sample.key, sample.off, sticky);
  }));
  // The fallback position is not tracked as our echo: the re-align above
  // lands a few frames later, and publishing the corrected position is fine.
  return null;
}

/** True when `currentTop` matches the position we just applied from a peer
 *  (within 1px) — i.e. this scroll event is our own programmatic apply, not
 *  the user. */
export function isAppliedScroll(appliedTop: number | null, currentTop: number): boolean {
  return appliedTop != null && Math.abs(currentTop - appliedTop) < 1;
}

// ---------------------------------------------------------------------------
// Surface registry (receiver side)
// ---------------------------------------------------------------------------

type PresenceScrollApply = (sample: PresenceScrollSample) => void;
const surfaces = new Map<ScrollSurface, PresenceScrollApply>();

/** Register the mounted surface's scroll target; returns the unregister. */
export function registerPresenceScrollSurface(surface: ScrollSurface, apply: PresenceScrollApply): () => void {
  surfaces.set(surface, apply);
  return () => {
    if (surfaces.get(surface) === apply) surfaces.delete(surface);
  };
}

/** Push a followed peer's scroll sample to its surface (false when the
 *  surface isn't mounted here — e.g. the peer is on another tab). */
export function applyPresenceScrollSample(sample: PresenceScrollSample): boolean {
  const apply = surfaces.get(sample.surface);
  if (!apply) return false;
  apply(sample);
  return true;
}
