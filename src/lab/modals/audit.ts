import type { LabAuditIssue, LabAuditSurface } from '../../lib/labState';
import type { ModalSurfaceMeta } from './types';
import { capabilitiesForSurface } from './capabilities';

/**
 * DOM contrast audit for the Modals Studio (roadmap 374 agent tooling).
 *
 * Scans the OPEN modal in its current theme and reports:
 *  - low-contrast text/controls (WCAG threshold: 4.5, or 3 for large text);
 *  - dark form controls / dropdown triggers on a LIGHT surface (the recurring
 *    "light modal still shows dark chips" family).
 *
 * It is deliberately page-side (needs computed colours). The studio drives it
 * surface by surface; the debug bridge / MCP exposes the result so an agent
 * can audit a whole group without screenshots.
 */

type RGB = [r: number, g: number, b: number, a: number];

function srgbFromLinear(v: number): number {
  const c = Math.max(0, Math.min(1, v));
  return c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
}

/** Parse rgb()/rgba() and oklch() (Tailwind v4 / kit tokens often compute to
 *  oklch; missing that made danger buttons look transparent). */
function parseColor(value: string): RGB | null {
  const rgb = value.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)/i);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), rgb[4] === undefined ? 1 : Number(rgb[4])];

  const lch = value.match(/oklch\(\s*([\d.]+)(%?)[,\s]+([\d.]+)(%?)[,\s]+([\d.]+)(?:deg)?(?:[,\s/]+([\d.]+)(%?))?\s*\)/i);
  if (lch) {
    const L = Number(lch[1]) / (lch[2] === '%' ? 100 : 1);
    const C = Number(lch[3]) / (lch[4] === '%' ? 100 : 1);
    const H = (Number(lch[5]) * Math.PI) / 180;
    const a = C * Math.cos(H);
    const b = C * Math.sin(H);
    const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
    const l = l_ ** 3;
    const m = m_ ** 3;
    const s = s_ ** 3;
    const r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
    const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
    const bl = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
    const alpha = lch[6] === undefined ? 1 : Number(lch[6]) / (lch[7] === '%' ? 100 : 1);
    return [srgbFromLinear(r) * 255, srgbFromLinear(g) * 255, srgbFromLinear(bl) * 255, alpha];
  }
  return null;
}

function blend(top: RGB, bottom: RGB): RGB {
  const a = top[3] + bottom[3] * (1 - top[3]);
  if (a <= 0) return [0, 0, 0, 0];
  return [
    (top[0] * top[3] + bottom[0] * bottom[3] * (1 - top[3])) / a,
    (top[1] * top[3] + bottom[1] * bottom[3] * (1 - top[3])) / a,
    (top[2] * top[3] + bottom[2] * bottom[3] * (1 - top[3])) / a,
    a,
  ];
}

function luminance([r, g, b]: RGB): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(fg: RGB, bg: RGB): number {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

function isVisible(el: Element): boolean {
  const node = el as HTMLElement;
  if (node.hidden) return false;
  const cs = getComputedStyle(node);
  if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
  const rect = node.getBoundingClientRect();
  return rect.width > 0.5 && rect.height > 0.5;
}

function effectiveBackground(el: Element): RGB {
  const layers: RGB[] = [];
  const rect = el.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;

  /* A selected pill (kit Seg) paints as a SIBLING behind the label, so the
     label's own background is transparent. Pick up the topmost sibling whose
     rect covers the label's centre before walking the ancestors. */
  const parent = el.parentElement;
  if (parent) {
    for (const sibling of parent.children) {
      if (sibling === el || sibling.contains(el) || el.contains(sibling)) continue;
      const color = parseColor(getComputedStyle(sibling).backgroundColor);
      if (!color || color[3] <= 0.2) continue;
      const r = sibling.getBoundingClientRect();
      if (cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom) {
        layers.push(color);
        break;
      }
    }
  }

  let node: Element | null = el;
  while (node) {
    const color = parseColor(getComputedStyle(node).backgroundColor);
    if (color && color[3] > 0.01) {
      layers.push(color);
      if (color[3] >= 0.99) break;
    }
    node = node.parentElement;
  }
  let result: RGB = [255, 255, 255, 1];
  for (let i = layers.length - 1; i >= 0; i--) result = blend(layers[i], result);
  return result;
}

function selectorOf(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const classes = [...el.classList].filter((c) => !c.startsWith('ui-')).slice(0, 2);
  const aria = el.getAttribute('aria-label') || el.getAttribute('placeholder') || '';
  return `${tag}${classes.length ? '.' + classes.join('.') : ''}${aria ? `[${aria.slice(0, 32)}]` : ''}`;
}

function directText(el: Element): string {
  return [...el.childNodes]
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent || '')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'SVG', 'PATH', 'CIRCLE', 'RECT', 'LINE', 'POLYLINE', 'G', 'DEFS', 'NOSCRIPT']);

/** Audit the topmost visible modal against the studio's current surface. */
export function auditCurrentSurface(
  surface: ModalSurfaceMeta,
  requestedTheme: 'light' | 'dark',
): LabAuditSurface {
  const capabilities = capabilitiesForSurface(surface);
  const modals = [...document.querySelectorAll<HTMLElement>('.ui-modal')].filter(isVisible);
  const modal = modals[modals.length - 1];
  if (!modal) {
    return { id: surface.id, title: surface.title, kind: surface.kind, capabilities, issues: [], note: 'No modal rendered in this surface/fixture.' };
  }

  const theme = (modal.getAttribute('data-mode') as 'light' | 'dark' | null) ?? requestedTheme;
  const issues: LabAuditIssue[] = [];
  const seen = new Set<string>();

  const check = (el: Element) => {
    if (SKIP_TAGS.has(el.tagName)) return;
    if (el.getAttribute('aria-hidden') === 'true') return;
    if (el.matches(':disabled, [aria-disabled="true"]') || el.closest('[aria-disabled="true"]')) return;
    if (!isVisible(el)) return;
    const field = el.matches('input, textarea, select');
    const picker = el.matches('[aria-haspopup], [data-search-trigger], [data-picker-field], [role="combobox"]');
    const text = field
      ? ((el as HTMLInputElement).value || el.getAttribute('placeholder') || el.getAttribute('aria-label') || '').trim()
      : directText(el);
    if (!text) return;

    const cs = getComputedStyle(el);
    const fg = parseColor(cs.color);
    if (!fg) return;
    const bg = effectiveBackground(el);
    const contrast = contrastRatio(fg, bg);
    const fontSize = parseFloat(cs.fontSize) || 12;
    const bold = Number(cs.fontWeight) >= 600;
    const large = fontSize >= 18.66 || (bold && fontSize >= 14.66);
    const threshold = large ? 3 : 4.5;
    const isDark = luminance(bg) < 0.2;

    let kind: LabAuditIssue['kind'] | null = null;
    if (contrast < threshold) kind = 'low-contrast';
    else if (theme === 'light' && isDark && (field || picker) && !(el as HTMLElement).style.backgroundColor) kind = 'dark-on-light';
    if (!kind) return;

    const selector = selectorOf(el);
    const key = `${kind}|${selector}|${text.slice(0, 24)}`;
    if (seen.has(key)) return;
    seen.add(key);
    issues.push({
      kind,
      tag: el.tagName.toLowerCase(),
      selector,
      text: text.slice(0, 80),
      bg: `rgb(${Math.round(bg[0])}, ${Math.round(bg[1])}, ${Math.round(bg[2])})`,
      fg: `rgb(${Math.round(fg[0])}, ${Math.round(fg[1])}, ${Math.round(fg[2])})`,
      contrast: Math.round(contrast * 100) / 100,
    });
  };

  check(modal);
  for (const el of modal.querySelectorAll('*')) check(el);

  return {
    id: surface.id,
    title: surface.title,
    kind: surface.kind,
    capabilities,
    issues: issues.slice(0, 40),
  };
}
