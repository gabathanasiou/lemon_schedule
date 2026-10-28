import {
  CHROME_BAR_INSET_PX,
  CHROME_CLUSTER_GAP_PX,
  CHROME_ITEM_GAP_PX,
  CHROME_TAB_GAP_PX,
} from './chromeSpacing';

/**
 * Chrome geometry audit (roadmap 264) — walks every rendered bar marked with
 * `data-chrome-bar` and checks it against the `chromeSpacing` scale:
 *
 *  - the first/last item's CONTENT edge sits on the bar's 16px rail
 *    (content edge = box edge + the element's own padding, so a control that
 *    hangs into the margin with the File-trigger recipe still passes), and
 *  - sibling gaps inside the bar are one of the scale's rhythms
 *    (4 joined tabs · 8 inside a cluster · 16 between clusters).
 *
 * Exposed as `window.__lemonSchedule.auditChrome()` (dev tooling) and asserted
 * by the seeded smoke spec — adding a toolbar item that drifts fails a test
 * instead of shipping. Conservative by design: gaps whose spacing is
 * layout-driven (flex-grow · `margin: auto` · justify-between) are skipped,
 * as is any subtree marked `data-chrome-skip` (deliberate overlaps, e.g. the
 * presence bubble stack). Zero false positives in the suite is the goal.
 */

export interface ChromeAuditViolation {
  /** The bar's `data-chrome-bar` name. */
  bar: string;
  kind: 'rail' | 'gap';
  detail: string;
}

const ALLOWED_GAPS = [CHROME_TAB_GAP_PX, CHROME_ITEM_GAP_PX, CHROME_CLUSTER_GAP_PX];
const TOLERANCE_PX = 1;
const MAX_DEPTH = 4;
/** Controls whose internals belong to the primitive, not the bar rhythm. */
const INTERACTIVE = 'button, a, input, select, textarea, label, [role="button"], [role="tab"]';
/** Joined-control primitives (Seg groups, tablists) own their internal rhythm. */
const JOINED_PRIMITIVE = '[role="group"], [role="tablist"], [role="radiogroup"]';

function visibleBox(el: Element): DOMRect | null {
  const cs = getComputedStyle(el);
  if (cs.display === 'none' || cs.visibility === 'hidden') return null;
  if (cs.position === 'absolute' || cs.position === 'fixed') return null;
  let r = el.getBoundingClientRect();
  if (r.width < 0.5 || r.height < 0.5) return null;
  /* Clipped descendants (a collapsed tab/menu label lives in a 0-width
     overflow-hidden track) have a layout rect outside their clip box. The
     audit must measure what is VISIBLE, or the hidden label's chevron reads as
     content past the bar's rail (roadmap 324). */
  for (let p = el.parentElement; p; p = p.parentElement) {
    const ps = getComputedStyle(p);
    if (ps.overflowX === 'visible' && ps.overflowY === 'visible') continue;
    const pr = p.getBoundingClientRect();
    const left = Math.max(r.left, pr.left);
    const top = Math.max(r.top, pr.top);
    const right = Math.min(r.right, pr.right);
    const bottom = Math.min(r.bottom, pr.bottom);
    if (right - left < 0.5 || bottom - top < 0.5) return null;
    r = new DOMRect(left, top, right - left, bottom - top);
  }
  return r;
}

function paddingPx(el: Element, side: 'Left' | 'Right'): number {
  const raw = getComputedStyle(el)[`padding${side}` as 'paddingLeft'];
  return parseFloat(raw) || 0;
}

function isSkipped(el: Element): boolean {
  return (el as HTMLElement).dataset?.chromeSkip !== undefined;
}

function describe(el: Element): string {
  const key =
    el.getAttribute('data-presence-anchor') ||
    el.getAttribute('data-testid') ||
    el.getAttribute('aria-label') ||
    '';
  const text = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 28);
  return `${key || el.tagName.toLowerCase()}${text ? ` "${text}"` : ''}`;
}

/** The leftmost CONTENT edge inside a subtree (absolute/zero boxes ignored). */
function contentLeft(el: Element): number {
  let min = Infinity;
  const scan = (node: Element) => {
    if (isSkipped(node) && node !== el) return;
    const r = visibleBox(node);
    if (r) min = Math.min(min, r.left + paddingPx(node, 'Left'));
    node.querySelectorAll(':scope > *').forEach(scan);
  };
  scan(el);
  return min;
}

/** The rightmost CONTENT edge inside a subtree. */
function contentRight(el: Element): number {
  let max = -Infinity;
  const scan = (node: Element) => {
    if (isSkipped(node) && node !== el) return;
    const r = visibleBox(node);
    if (r) max = Math.max(max, r.right - paddingPx(node, 'Right'));
    node.querySelectorAll(':scope > *').forEach(scan);
  };
  scan(el);
  return max;
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

function isFlexLike(el: Element): boolean {
  const d = getComputedStyle(el).display;
  return d.includes('flex') || d.includes('grid');
}

function grows(el: Element): boolean {
  return parseFloat(getComputedStyle(el).flexGrow) > 0;
}

function checkGaps(el: Element, bar: string, depth: number, out: ChromeAuditViolation[]): void {
  if (depth > MAX_DEPTH || !isFlexLike(el)) return;
  const justify = getComputedStyle(el).justifyContent;
  const spacingIsLayoutDriven =
    justify === 'space-between' || justify === 'space-around' || justify === 'space-evenly';
  const kids = Array.from(el.children).filter(c => visibleBox(c) && !isSkipped(c));

  if (!spacingIsLayoutDriven) {
    for (let i = 1; i < kids.length; i++) {
      const a = kids[i - 1];
      const b = kids[i];
      if (grows(a) || grows(b)) continue;
      if (getComputedStyle(b).marginLeft === 'auto') continue;
      const gap = round(visibleBox(b)!.left - visibleBox(a)!.right);
      if (!ALLOWED_GAPS.some(allowed => Math.abs(gap - allowed) <= TOLERANCE_PX)) {
        out.push({
          bar,
          kind: 'gap',
          detail: `${describe(a)} → ${describe(b)}: ${gap}px apart (allowed ${ALLOWED_GAPS.join('/')}px)`,
        });
      }
    }
  }

  for (const kid of kids) {
    if (kid.matches(INTERACTIVE) || kid.matches(JOINED_PRIMITIVE)) continue;
    checkGaps(kid, bar, depth + 1, out);
  }
}

/** Audit every chrome bar under `root` against the `chromeSpacing` scale. */
export function auditChrome(root: ParentNode = document): ChromeAuditViolation[] {
  const out: ChromeAuditViolation[] = [];
  root.querySelectorAll<HTMLElement>('[data-chrome-bar]').forEach(bar => {
    const name = bar.dataset.chromeBar || 'bar';
    const barRect = visibleBox(bar);
    if (!barRect) return;
    const kids = Array.from(bar.children).filter(c => visibleBox(c) && !isSkipped(c));
    if (!kids.length) return;

    // A horizontally scrolled bar has slid its rail off the viewport edge.
    let scrolled = false;
    for (let p = bar.parentElement; p; p = p.parentElement) {
      if (p.scrollLeft > 0) { scrolled = true; break; }
    }
    if (!scrolled) {
      const left = round(contentLeft(kids[0]) - (barRect.left + CHROME_BAR_INSET_PX));
      const right = round(barRect.right - CHROME_BAR_INSET_PX - contentRight(kids[kids.length - 1]));
      if (Math.abs(left) > TOLERANCE_PX) {
        out.push({ bar: name, kind: 'rail', detail: `left edge ${left > 0 ? '+' : ''}${left}px off the rail (${describe(kids[0])})` });
      }
      if (Math.abs(right) > TOLERANCE_PX) {
        out.push({ bar: name, kind: 'rail', detail: `right edge ${right > 0 ? '+' : ''}${right}px off the rail (${describe(kids[kids.length - 1])})` });
      }
    }

    checkGaps(bar, name, 0, out);
  });
  return out;
}
