import { ChipColor, tokenChipCss } from './reportFields';

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

/** Trailing open token prefix right before the caret — either an unclosed
 *  `{{…` or a bare `@` (with optional word chars after it). Both behave the
 *  same: they stay in the text and the dropdown filters on what follows. */
const TRIGGER_RE = /(\{\{[^{}]*|@\w*)$/;

export interface TokenChipStyle extends ChipColor {
  /** Display text — the attribute label. Defaults to the raw {{token}}. */
  label?: string;
}

export type TokenStyleFor = (field: string) => TokenChipStyle | null | undefined;

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
      span.setAttribute('data-rt-raw', p.text);
      span.setAttribute('contenteditable', 'false');
      // Flat tag look via the shared chip CSS. The left margin gets +1px
      // because the caret (≈1px wide) is drawn inside the left gap but starts
      // clear on the right — equal visual clearance both sides.
      span.style.cssText = tokenChipCss(
        color ? { text: color.text, bg: color.bg } : { text: '#52525b', bg: 'rgba(82, 82, 91, 0.12)' },
        '0 3px 0 2px',
      );
      span.style.fontStyle = 'normal';
      span.textContent = color?.label ? color.label : p.text;
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

/** Replaces every chip span with its text content (safe to call any time).
 *  Chips may display a label (data-rt-raw holds the real {{token}}), so the
 *  raw text is restored — never the displayed label. */
export function undecorateTokens(el: HTMLElement): void {
  el.querySelectorAll('span[data-rt-token]').forEach(span => {
    const raw = span.getAttribute('data-rt-raw');
    if (raw) {
      span.replaceWith(document.createTextNode(raw));
    } else {
      const frag = document.createDocumentFragment();
      while (span.firstChild) frag.appendChild(span.firstChild);
      span.replaceWith(frag);
    }
  });
}

/** If the caret sits where Chrome renders nothing (an element boundary or an
 *  empty text node — common right after a trailing chip), snap it to the
 *  nearest visible text edge: the start of the next non-chip text node, else
 *  the end of the previous one, else an appended empty anchor node. Pure caret
 *  fix-up — never touches chip markup. */
export function ensureCaretVisible(el: HTMLElement): void {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);
  if (!el.contains(range.startContainer)) return;
  const c = range.startContainer;
  if (c.nodeType === Node.TEXT_NODE) {
    if ((c as Text).data.length > 0) return; // normal text caret — visible
  } else if (range.getClientRects().length > 0) {
    return; // element-boundary caret that renders
  }
  const isChipText = (t: Node): boolean =>
    t.nodeType === Node.TEXT_NODE && (t.parentElement?.hasAttribute('data-rt-token') ?? false);
  const place = (t: Text, offset: number) => {
    const r = document.createRange();
    r.setStart(t, offset);
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
  };
  const fromNode = c.nodeType === Node.TEXT_NODE
    ? (c as Text)
    : ((c as HTMLElement).childNodes[range.startOffset] ?? null);
  if (fromNode && fromNode !== c && fromNode.nodeType === Node.TEXT_NODE && !isChipText(fromNode)) {
    place(fromNode as Text, 0);
    return;
  }
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  walker.currentNode = fromNode ?? el;
  let n = walker.nextNode();
  while (n) {
    if (!isChipText(n)) { place(n as Text, 0); return; }
    n = walker.nextNode();
  }
  const prevNode = c.nodeType === Node.TEXT_NODE
    ? (c as Text).previousSibling ?? null
    : ((c as HTMLElement).childNodes[range.startOffset - 1] ?? null);
  if (prevNode && prevNode !== c && prevNode.nodeType === Node.TEXT_NODE && !isChipText(prevNode)) {
    place(prevNode as Text, (prevNode as Text).data.length);
    return;
  }
  const walker2 = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  walker2.currentNode = prevNode ?? el;
  let m = walker2.previousNode();
  while (m) {
    if (!isChipText(m)) { place(m as Text, (m as Text).data.length); return; }
    m = walker2.previousNode();
  }
  const anchor = document.createTextNode('');
  el.appendChild(anchor);
  place(anchor, 0);
}

/** The first/last non-chip text node of the editor (chip labels are skipped). */
export function edgeTextNodes(el: HTMLElement): { first: Text | null; last: Text | null } {
  let first: Text | null = null;
  let last: Text | null = null;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let n: Node | null;
  while ((n = walker.nextNode())) {
    const t = n as Text;
    if (t.parentElement?.hasAttribute('data-rt-token')) continue;
    if (!first) first = t;
    last = t;
  }
  return { first, last };
}

/** The source text of a text node for offset math: chip text nodes count as
 *  their raw {{token}} (labels are display-only). */
function textNodeSource(t: Text): string {
  const chip = t.parentElement;
  if (chip?.hasAttribute('data-rt-token')) {
    return chip.getAttribute('data-rt-raw') || t.data;
  }
  return t.data;
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
 *  node for token matching — element-boundary carets return an empty tail).
 *  Chip text nodes contribute their raw {{token}} so offsets match the
 *  undecorated serialization. */
export function textBeforeCaret(el: HTMLElement, range: Range): string {
  let out = '';
  const start = range.startContainer;
  if (start.nodeType !== Node.TEXT_NODE) return out;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let n: Node | null;
  while ((n = walker.nextNode())) {
    const t = n as Text;
    if (t === start) {
      out += textNodeSource(t).slice(0, range.startOffset);
      break;
    }
    out += textNodeSource(t);
  }
  return out;
}

/** The filter prefix of the open trigger at the end of `text`: `{{pag` or
 *  `@pag` → "pag"; a bare `{{`/`@` → "". Null when no trigger is open. */
export function matchOpenToken(text: string): string | null {
  const m = TRIGGER_RE.exec(text);
  if (!m) return null;
  const t = m[1];
  return t.startsWith('{{') ? t.slice(2) : t.slice(1);
}

/** Inserts `{{field}}` at the caret. If the caret sits right after an open
 *  `{{prefix` or a bare `@…` trigger, that prefix is replaced; otherwise the
 *  token is inserted at the caret. Returns the new caret range, or null when
 *  the editor isn't focused with a usable selection. */
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
    const m = TRIGGER_RE.exec(text.slice(0, caret));
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
