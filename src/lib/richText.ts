// Lightweight rich-text storage for report text blocks: `block.text` holds
// sanitized HTML. Whitelist-based sanitizer — anything outside the allowed tag
// set is unwrapped (text kept), style attributes are filtered to a small set
// of CSS props. `{{field}}` tokens pass through untouched (they resolve at
// render time in resolveReportTokensHtml).
//
// Non-breaking spaces are normalized to regular spaces: contentEditable
// serializes leading/trailing spaces as `&nbsp;`, which would otherwise
// accumulate in stored text (visible as literal "&nbsp;" in key views and
// breaking word-wrap on print).

const ALLOWED_TAGS = new Set(['b', 'strong', 'i', 'em', 'u', 's', 'strike', 'br', 'div', 'p', 'span', 'a']);

const STYLE_PROPS = new Set([
  'font-family', 'font-size', 'font-weight', 'font-style', 'text-decoration', 'text-align', 'color',
]);

/** Anchors keep href/target/rel — but only http(s)/mailto targets. Anything
 *  else (e.g. javascript:) unwraps to plain text. */
const SAFE_HREF = /^(https?:\/\/|mailto:)/i;

function sanitizeStyle(style: string): string {
  if (!style) return '';
  const kept: string[] = [];
  for (const decl of style.split(';')) {
    const idx = decl.indexOf(':');
    if (idx < 0) continue;
    const prop = decl.slice(0, idx).trim().toLowerCase();
    const value = decl.slice(idx + 1).trim();
    if (STYLE_PROPS.has(prop) && value) kept.push(`${prop}: ${value}`);
  }
  return kept.join('; ');
}

function sanitizeNode(node: Node): Node {
  if (node.nodeType === Node.TEXT_NODE) return node;
  if (node.nodeType !== Node.ELEMENT_NODE) return document.createTextNode('');
  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();
  const unwrap = (): Node => {
    const frag = document.createDocumentFragment();
    for (const child of Array.from(el.childNodes)) frag.appendChild(sanitizeNode(child));
    return frag;
  };
  if (!ALLOWED_TAGS.has(tag)) return unwrap();
  if (tag === 'a') {
    const href = el.getAttribute('href') || '';
    if (!SAFE_HREF.test(href)) return unwrap();
  }
  const out = document.createElement(tag);
  const style = el.getAttribute('style');
  const cleaned = sanitizeStyle(style || '');
  if (cleaned) out.setAttribute('style', cleaned);
  if (tag === 'a') {
    out.setAttribute('href', el.getAttribute('href')!);
    const target = el.getAttribute('target');
    const rel = el.getAttribute('rel');
    if (target) out.setAttribute('target', target);
    if (rel) out.setAttribute('rel', rel);
  }
  for (const child of Array.from(el.childNodes)) out.appendChild(sanitizeNode(child));
  return out;
}

/** Replaces non-breaking spaces (entity or raw) with regular spaces. */
export function normalizeSpaces(text: string): string {
  return text.replace(/&nbsp;/g, ' ').replace(/\u00A0/g, ' ');
}

export function sanitizeRichText(html: string): string {
  const clean = normalizeSpaces(html);
  if (!clean || !clean.includes('<')) return clean;
  const template = document.createElement('template');
  template.innerHTML = clean;
  const frag = document.createDocumentFragment();
  for (const child of Array.from(template.content.childNodes)) frag.appendChild(sanitizeNode(child));
  const serialized = new XMLSerializer().serializeToString(frag);
  return serialized
    .replace(/<strong(\s|>)/gi, '<b$1').replace(/<\/strong>/gi, '</b>')
    .replace(/<em(\s|>)/gi, '<i$1').replace(/<\/em>/gi, '</i>')
    // Empty paragraphs collapse to zero height (Tailwind resets p margins) —
    // keep a <br> so blank lines survive into preview and print.
    .replace(/<p([^>]*)><\/p>/gi, '<p$1><br></p>');
}

/** Removes all markup — used for showKeys previews and empty-value checks. */
export function stripRichText(html: string): string {
  const clean = normalizeSpaces(html);
  if (!clean || !clean.includes('<')) return clean;
  const template = document.createElement('template');
  template.innerHTML = clean;
  return (template.content.textContent || '')
    .replace(/\u00A0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
