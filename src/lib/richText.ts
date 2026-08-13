// Lightweight rich-text storage for report text blocks: `block.text` holds
// sanitized HTML. Whitelist-based sanitizer — anything outside the allowed tag
// set is unwrapped (text kept), style attributes are filtered to a small set
// of CSS props. `{{field}}` tokens pass through untouched (they resolve at
// render time in resolveReportTokensHtml).

const ALLOWED_TAGS = new Set(['b', 'strong', 'i', 'em', 'u', 's', 'strike', 'br', 'div', 'p', 'span']);

const STYLE_PROPS = new Set([
  'font-family', 'font-size', 'font-weight', 'font-style', 'text-decoration', 'text-align', 'color',
]);

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
  if (!ALLOWED_TAGS.has(tag)) {
    // unwrap: replace the element with its sanitized children
    const frag = document.createDocumentFragment();
    for (const child of Array.from(el.childNodes)) frag.appendChild(sanitizeNode(child));
    return frag;
  }
  const out = document.createElement(tag);
  const style = el.getAttribute('style');
  const cleaned = sanitizeStyle(style || '');
  if (cleaned) out.setAttribute('style', cleaned);
  for (const child of Array.from(el.childNodes)) out.appendChild(sanitizeNode(child));
  return out;
}

export function sanitizeRichText(html: string): string {
  if (!html || !html.includes('<')) return html;
  const template = document.createElement('template');
  template.innerHTML = html;
  const frag = document.createDocumentFragment();
  for (const child of Array.from(template.content.childNodes)) frag.appendChild(sanitizeNode(child));
  const serialized = new XMLSerializer().serializeToString(frag);
  return serialized.replace(/<strong(\s|>)/gi, '<b$1').replace(/<em(\s|>)/gi, '<i$1');
}

/** Removes all markup — used for showKeys previews and empty-value checks. */
export function stripRichText(html: string): string {
  if (!html || !html.includes('<')) return html;
  const template = document.createElement('template');
  template.innerHTML = html;
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
