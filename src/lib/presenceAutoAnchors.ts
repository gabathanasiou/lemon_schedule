import { PRESENCE_ANCHOR_ATTR } from './presenceAnchors';

/**
 * Automatic pointer anchors for interactive chrome (roadmap 236, user request
 * 2026-10-15: "all buttons everywhere").
 *
 * Every `button` / `[role="button"]` that lacks an EXPLICIT
 * `data-presence-anchor` gets a stable key derived from its AUTHORED identity
 * — `data-testid` → `aria-label` → `title` → its own visible text. Two
 * clients rendering the same control derive the same key, so a peer's pointer
 * lands on the same button without hand-keying hundreds of call sites.
 *
 * Rules (keep them true):
 * - Explicit `data-presence-anchor` always wins — use it whenever a label is
 *   shared by several controls on one page ("Column" × add/delete) or is
 *   per-user dynamic (a "Show/Hide pane" title).
 * - Never derive from DOM structure/position — only from authored attributes.
 * - A label that changes per user is not a mismatch BUG: the two clients
 *   derive different keys, the anchor doesn't resolve, and the pointer hides
 *   (hide-don't-fake, exactly like an unknown row id).
 * - Only the key string is written to the DOM (an attribute) — no behavior.
 *
 * The stamping runs from the presence provider (main window only — parity
 * with publishing) and is inert without a shared project; the debug-bridge
 * inspector (`presenceAnchorAt`) reads the stamped DOM, so coverage is
 * auditable in any build.
 */

/** Derived-key namespaces — never collide with the explicit surface keys. */
export const AUTO_ANCHOR_PREFIX = 'ui:';

const MAX_KEY_PART = 60;

/** Whitespace-collapsed, length-capped identity part. */
function normalize(value: string): string | null {
  const compact = value.replace(/\s+/g, ' ').trim();
  return compact ? compact.slice(0, MAX_KEY_PART) : null;
}

/** The minimal element surface the derivation reads (unit-testable). */
export interface AutoAnchorSource {
  getAttribute(name: string): string | null;
  textContent?: string | null;
}

/** The auto key for an authored identity, or null when the control has none.
 *  Precedence: test id → accessible name → tooltip title → visible text. */
export function autoAnchorKeyFor(el: AutoAnchorSource): string | null {
  const testid = normalize(el.getAttribute('data-testid') ?? '');
  if (testid) return `${AUTO_ANCHOR_PREFIX}testid:${testid}`;
  const label = normalize(el.getAttribute('aria-label') ?? '');
  if (label) return `${AUTO_ANCHOR_PREFIX}label:${label}`;
  const title = normalize(el.getAttribute('title') ?? '');
  if (title) return `${AUTO_ANCHOR_PREFIX}title:${title}`;
  const text = normalize(el.textContent ?? '');
  if (text) return `${AUTO_ANCHOR_PREFIX}text:${text}`;
  return null;
}

/** The interactable controls that participate in auto anchors — native + ARIA
 *  buttons, links, and form controls. Text-entry surfaces (textarea /
 *  contenteditable) stay out: their surrounding row/box anchor covers them and
 *  their value is data, not identity. Menus/rows have their own systems. */
const CONTROL_SELECTOR = 'button, [role="button"], a[href], input, select';

/** Start stamping auto anchors under `root` (default: the document body) and
 *  keep up with the app via a MutationObserver. Returns the stop function. */
export function startAutoAnchorStamps(root: ParentNode & Node = document.body): () => void {
  /** Keys WE wrote — lets React's own attributes (or a later explicit key)
   *  take over, and lets a label change repaint the stamp. */
  const stamped = new WeakMap<Element, string>();

  const stamp = (el: Element) => {
    if (!el.matches?.(CONTROL_SELECTOR)) return;
    const current = el.getAttribute(PRESENCE_ANCHOR_ATTR);
    const mine = stamped.get(el);
    // Someone else owns this attribute now (explicit key / another stamper).
    if (mine !== undefined && current !== mine) {
      stamped.delete(el);
      return;
    }
    if (current !== null && mine === undefined) return; // explicit from the start
    const key = autoAnchorKeyFor(el);
    if (key === null) {
      if (mine !== undefined) {
        stamped.delete(el);
        el.removeAttribute(PRESENCE_ANCHOR_ATTR);
      }
      return;
    }
    if (current !== key) el.setAttribute(PRESENCE_ANCHOR_ATTR, key);
    stamped.set(el, key);
  };

  const visit = (node: Node) => {
    if (!(node instanceof Element)) return;
    if (node.matches(CONTROL_SELECTOR)) stamp(node);
    node.querySelectorAll(CONTROL_SELECTOR).forEach(stamp);
  };

  visit(root as unknown as Element);

  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'attributes') {
        stamp(record.target as Element);
        continue;
      }
      for (const node of record.addedNodes) visit(node);
    }
  });
  observer.observe(root, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-testid', 'aria-label', 'title', PRESENCE_ANCHOR_ATTR],
  });
  return () => observer.disconnect();
}
