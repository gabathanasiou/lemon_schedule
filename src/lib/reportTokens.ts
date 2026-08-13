// DOM helpers for the reports text editor's {{token}} chips + autocomplete.
//
// Chips are decoration ONLY: the stored value stays plain `{{field}}` text.
// `decorateTokens` wraps complete tokens in `data-rt-token` spans (skipping
// the text node the caret is in so tokens stay editable), `undecorateTokens`
// unwraps them back to text before anything is serialized. The sanitizer never
// sees chip markup — the stored format never changes.

/** A complete, well-formed token: `{{key}}` with no inner braces. Non-global —
 *  a shared global regex's lastIndex would flip-flop `.test()` results. */
export const TOKEN_TEXT_RE = /\{\{[^{}]+\}\}/;

/** Trailing open token prefix right before the caret (`{{` or `{{pag`). */
const OPEN_TOKEN_RE = /\{\{[^{}]*$/;

export interface TokenChipStyle {
  text: string;
  bg: string;
}

export type TokenStyleFor = (field: string) => TokenChipStyle;

export interface CaretInfo {
  node: Text;
  offset: number;
}

function collectTextNodes(el: HTMLElement): Text[] {
  const out: Text[] = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let n: Node | null;
  while ((n = walker.nextNode())) {
    const t = n as Text;
    if (t.parentElement?.hasAttribute('data-rt-token')) continue;
    out.push(t);
  }
  return out;
}

/** Wraps complete tokens in non-editable chip spans. The caret's own text node
 *  is split at the caret first (left part decorates, right part stays plain) so
 *  tokens before the caret chip up even while the caret sits right after them
 *  — typing `{{draftNumber}}` then a space closes the token into a chip. The
 *  caret's node is never removed, so the caret never gets detached.
 *
 *  Note: decoration runs over a snapshot array, NOT a live TreeWalker — a
 *  walker whose current node gets removed skips everything after it. */
export function decorateTokens(el: HTMLElement, caret?: CaretInfo | null, styleFor?: TokenStyleFor | null): void {
  const skip = new Set<Text>();
  for (const t of collectTextNodes(el)) {
    if (caret && t === caret.node) {
      if (TOKEN_TEXT_RE.test(t.data.slice(0, caret.offset))) {
        const right = t.splitText(caret.offset);
        skip.add(right);
      } else {
        skip.add(t);
      }
    }
  }
  for (const t of collectTextNodes(el)) {
    if (skip.has(t)) continue;
    if (t.parentElement?.hasAttribute('data-rt-token')) continue;
    decorateTextNode(t, styleFor);
  }
}

function decorateTextNode(t: Text, styleFor?: TokenStyleFor | null): void {
  const text = t.data;
  const parts: { text: string; token: boolean }[] = [];
  const re = new RegExp(TOKEN_TEXT_RE.source, 'g');
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index), token: false });
    parts.push({ text: m[0], token: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), token: false });
  if (parts.length === 1 && !parts[0].token) return;
  const parent = t.parentNode;
  if (!parent) return;
  let prev: Node | null = null;
  const anchor = () => (prev ? prev.nextSibling : t);
  for (const p of parts) {
    if (p.token) {
      const key = p.text.slice(2, -2).trim();
      const color = styleFor?.(key) ?? null;
      const span = document.createElement('span');
      span.setAttribute('data-rt-token', '1');
      span.setAttribute('contenteditable', 'false');
      span.style.borderRadius = '999px';
      span.style.padding = '1px 6px';
      span.style.fontWeight = '600';
      span.style.fontStyle = 'normal';
      span.style.color = '#ffffff';
      span.style.background = color ? color.text : '#52525b';
      span.textContent = p.text;
      parent.insertBefore(span, anchor());
      prev = span;
    } else if (p.text) {
      const node = document.createTextNode(p.text);
      parent.insertBefore(node, anchor());
      prev = node;
    }
  }
  parent.removeChild(t);
}

/** Replaces every chip span with its text content (safe to call any time). */
export function undecorateTokens(el: HTMLElement): void {
  el.querySelectorAll('span[data-rt-token]').forEach(span => {
    const frag = document.createDocumentFragment();
    while (span.firstChild) frag.appendChild(span.firstChild);
    span.replaceWith(frag);
  });
}

/** If the caret ended up INSIDE a chip span (edge-click quirk after blur /
 *  refocus), move it to the boundary nearest the click and return true.
 *  Otherwise the caret would be invisible and typing would mutate the token. */
export function normalizeCaretOutOfChip(el: HTMLElement): boolean {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return false;
  const range = sel.getRangeAt(0);
  if (range.startContainer.nodeType !== Node.TEXT_NODE) return false;
  const parent = (range.startContainer as Text).parentElement;
  if (!parent || !parent.hasAttribute('data-rt-token')) return false;
  const token = parent.textContent || '';
  const after = range.startOffset > token.length / 2;
  const r = document.createRange();
  if (after) r.setStartAfter(parent);
  else r.setStartBefore(parent);
  r.collapse(true);
  sel.removeAllRanges();
  sel.addRange(r);
  return true;
}

/** Toggles the selected-state class on every chip covered by the current
 *  selection (chip click, Shift+arrow, mouse drag). Pure class changes — safe
 *  to call on every selectionchange without disturbing the selection. */
export function syncChipSelection(el: HTMLElement): void {
  const sel = window.getSelection();
  const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
  const chips = el.querySelectorAll<HTMLElement>('span[data-rt-token]');
  if (!range || range.collapsed) {
    for (const c of chips) c.classList.remove('rt-token-selected');
    return;
  }
  for (const c of chips) {
    const r = document.createRange();
    r.selectNode(c);
    const selected = range.compareBoundaryPoints(Range.START_TO_START, r) <= 0
      && range.compareBoundaryPoints(Range.END_TO_END, r) >= 0;
    c.classList.toggle('rt-token-selected', selected);
  }
}

/** Full text of the editor up to the range's start (caret must be in a text
 *  node for token matching — element-boundary carets return an empty tail). */
export function textBeforeCaret(el: HTMLElement, range: Range): string {
  let out = '';
  const start = range.startContainer;
  if (start.nodeType !== Node.TEXT_NODE) return out;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let n: Node | null;
  while ((n = walker.nextNode())) {
    const t = n as Text;
    if (t === start) {
      out += t.data.slice(0, range.startOffset);
      break;
    }
    out += t.data;
  }
  return out;
}

/** The trailing open `{{prefix` (possibly empty) at the end of `text`. */
export function matchOpenToken(text: string): string | null {
  const m = OPEN_TOKEN_RE.exec(text);
  return m ? m[0].slice(2) : null;
}

/** Inserts `{{field}}` at the caret. If the caret sits right after an open
 *  `{{prefix`, that prefix is replaced; otherwise the token is inserted at the
 *  caret. Returns the new caret range, or null when the editor isn't focused
 *  with a usable selection. */
export function insertTokenAtCaret(el: HTMLElement, field: string): Range | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!el.contains(range.startContainer)) return null;
  const token = `{{${field}}}`;
  const node = range.startContainer;
  if (node.nodeType === Node.TEXT_NODE) {
    const tn = node as Text;
    const text = tn.data;
    const caret = range.startOffset;
    const m = OPEN_TOKEN_RE.exec(text.slice(0, caret));
    if (m) {
      const start = caret - m[0].length;
      const right = tn.splitText(start);
      right.data = `${token}${text.slice(caret)}`;
      const out = document.createRange();
      out.setStart(right, token.length);
      out.collapse(true);
      return out;
    }
  }
  range.deleteContents();
  const tn = document.createTextNode(token);
  range.insertNode(tn);
  const out = document.createRange();
  out.setStart(tn, token.length);
  out.collapse(true);
  return out;
}
