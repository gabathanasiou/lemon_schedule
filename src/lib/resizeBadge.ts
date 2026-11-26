/**
 * ONE live resize pill for every drag gesture (roadmap 367) — the image's
 * px badge, column percentages, row heights. Imperative DOM because the drags
 * themselves are imperative (document listeners + direct style writes), and
 * the badges must live in the gesture's own document (pop-out windows too).
 */

export type ResizeBadgeTone = 'default' | 'warning';

export interface ResizeBadgeHandle {
  update: (text: string, clientX: number, clientY: number, tone?: ResizeBadgeTone) => void;
  remove: () => void;
}

/** One badge anchored above a column (percent badges, roadmap 367 follow-up). */
export interface ResizeBadgeItem {
  text: string;
  /** Viewport x to centre the pill on. */
  centerX: number;
  /** Viewport y of the anchor's TOP edge — the pill sits above it. */
  bottom: number;
  tone?: ResizeBadgeTone;
}

export interface ResizeBadgeGroupHandle {
  update: (items: readonly ResizeBadgeItem[]) => void;
  remove: () => void;
}

const BADGE_STYLE = [
  'position:fixed',
  'z-index:10050',
  'pointer-events:none',
  'padding:1px 6px',
  'border-radius:4px',
  'color:#fff',
  'font-size:10px',
  'font-weight:500',
  'line-height:1.5',
  'font-variant-numeric:tabular-nums',
  'white-space:nowrap',
  'box-shadow:0 1px 2px rgba(0,0,0,0.25)',
].join(';');

const toneBg = (tone: ResizeBadgeTone = 'default') => (tone === 'warning' ? '#b45309' : '#18181b');

function makeBadge(doc: Document): HTMLDivElement {
  const el = doc.createElement('div');
  el.setAttribute('data-resize-badge', '');
  el.style.cssText = BADGE_STYLE;
  doc.body.appendChild(el);
  return el;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Create a badge bound to `doc`; it stays hidden until the first update. */
export function createResizeBadge(doc: Document): ResizeBadgeHandle {
  let node: HTMLDivElement | null = null;

  return {
    update(text, clientX, clientY, tone = 'default') {
      node ??= makeBadge(doc);
      node.textContent = text;
      node.style.background = toneBg(tone);
      const view = doc.defaultView;
      const vw = view?.innerWidth ?? 0;
      const vh = view?.innerHeight ?? 0;
      const w = node.offsetWidth;
      const h = node.offsetHeight;
      const pad = 8;
      // Prefer above-right of the pointer; flip/clamp so it never leaves the
      // viewport (the finger covers the touch case, so sit further up).
      let left = clientX + 14;
      let top = clientY - h - 14;
      if (vw > 0 && left + w > vw - pad) left = clientX - w - 14;
      left = vw > 0 ? clamp(left, pad, Math.max(pad, vw - w - pad)) : left;
      if (top < pad) top = clientY + 20;
      top = vh > 0 ? clamp(top, pad, Math.max(pad, vh - h - pad)) : top;
      node.style.left = `${Math.round(left)}px`;
      node.style.top = `${Math.round(top)}px`;
    },
    remove() {
      node?.remove();
      node = null;
    },
  };
}

/** A pool of pills, one above each affected column (e.g. "32.5%" per column). */
export function createResizeBadgeGroup(doc: Document): ResizeBadgeGroupHandle {
  let nodes: HTMLDivElement[] = [];

  return {
    update(items) {
      // Reuse nodes; trim extras from the previous frame.
      while (nodes.length > items.length) nodes.pop()?.remove();
      const view = doc.defaultView;
      const vw = view?.innerWidth ?? 0;
      const pad = 8;
      items.forEach((item, i) => {
        const node = nodes[i] ?? (nodes[i] = makeBadge(doc));
        node.textContent = item.text;
        node.style.background = toneBg(item.tone);
        const w = node.offsetWidth;
        const h = node.offsetHeight;
        let left = item.centerX - w / 2;
        left = vw > 0 ? clamp(left, pad, Math.max(pad, vw - w - pad)) : left;
        const top = clamp(item.bottom - h - 4, pad, Math.max(pad, (view?.innerHeight ?? 0) - h - pad));
        node.style.left = `${Math.round(left)}px`;
        node.style.top = `${Math.round(top)}px`;
      });
    },
    remove() {
      for (const node of nodes) node.remove();
      nodes = [];
    },
  };
}
