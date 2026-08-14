import React, { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { sanitizeRichText } from '../../lib/richText';
import { ReportFieldDef, searchReportFields, fieldChipColor } from '../../lib/reportFields';
import {
  decorateTokens, undecorateTokens, syncChipSelection, normalizeCaretOutOfChip, ensureCaretVisible, edgeTextNodes,
  textBeforeCaret, matchOpenToken, insertTokenAtCaret,
} from '../../lib/reportTokens';
import TokenAutocomplete, { TokenAcState } from './TokenAutocomplete';

// contentEditable rich-text editor for report text blocks. Stored value is
// sanitized HTML (see lib/richText.ts). Formatting commands run through
// execCommand with styleWithCSS so they produce spans with inline styles the
// sanitizer whitelists. External value syncs only while the editor isn't
// focused (typing never resets the caret). `{{field}}` tokens are plain text
// and survive sanitization untouched.
//
// Token chips + autocomplete (lib/reportTokens.ts): complete {{field}} tokens
// render as colored chip spans, but ONLY while the caret isn't inside them —
// chips are decoration, unwrapped before anything is serialized, so the stored
// format never changes. Typing `{{` opens the attribute autocomplete.

export interface RichTextEditorHandle {
  exec: (command: string, value?: string) => void;
  focus: () => void;
  /** Inserts `{{field}}` at the caret (replacing an open `{{prefix`). */
  insertToken: (field: string) => void;
}

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Scope-filtered attributes for the token autocomplete. */
  fields?: ReportFieldDef[];
}

const MAX_AC_H = 240;

/** Collapsed range at a character offset from the editor's text start (chip
 *  text nodes count as their raw {{token}} length, matching the serialized
 *  text). */
function rangeAtOffset(el: HTMLElement, offset: number): Range | null {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let n: Node | null;
  let remaining = Math.max(0, offset);
  let lastText: Text | null = null;
  while ((n = walker.nextNode())) {
    const t = n as Text;
    lastText = t;
    const chip = t.parentElement;
    const len = chip?.hasAttribute('data-rt-token')
      ? (chip.getAttribute('data-rt-raw') || t.data).length
      : t.data.length;
    if (len >= remaining) {
      const r = document.createRange();
      r.setStart(t, remaining);
      r.collapse(true);
      return r;
    }
    remaining -= len;
  }
  if (lastText) {
    const r = document.createRange();
    r.setStart(lastText, lastText.data.length);
    r.collapse(true);
    return r;
  }
  return null;
}

const RichTextEditor = React.forwardRef<RichTextEditorHandle, RichTextEditorProps>(({ value, onChange, placeholder, disabled, className, fields }, ref) => {
  const elRef = useRef<HTMLDivElement>(null);
  const acRef = useRef<HTMLDivElement>(null);
  const [ac, setAc] = useState<TokenAcState | null>(null);
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;
  const lastRangeRef = useRef<Range | null>(null);
  // Character offset of the caret at blur time — decoration between blur and
  // refocus replaces the saved range's text node, so offsets are the reliable
  // way to restore the caret when the toolbar inserts a token.
  const blurOffsetRef = useRef(0);

  const caretRange = (): Range | null => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const r = sel.getRangeAt(0);
    const el = elRef.current;
    return el && el.contains(r.startContainer) ? r : null;
  };

  const styleForToken = (key: string): { text: string; bg: string; label?: string } => {
    const def = fieldsRef.current?.find(f => f.key === key);
    if (def) {
      const color = fieldChipColor(def.group);
      return { text: color.text, bg: color.bg, label: def.label };
    }
    return { text: '#52525b', bg: 'rgba(82, 82, 91, 0.12)' };
  };

  const refreshChips = useCallback(() => {
    const el = elRef.current;
    if (!el) return;
    const focused = document.activeElement === el;
    const range = focused ? caretRange() : null;
    // The split-at-caret logic protects the caret's own node, so decorating
    // under a non-collapsed selection (chip click-select, drag, formatted
    // selection) is safe — ranges adjust to the new markup automatically.
    const caret = range && range.startContainer.nodeType === Node.TEXT_NODE
      ? { node: range.startContainer as Text, offset: range.startOffset }
      : null;
    decorateTokens(el, caret, styleForToken);
    if (focused) ensureCaretVisible(el);
  }, []);

  const updateAutocomplete = useCallback(() => {
    const el = elRef.current;
    if (!el || disabledRef.current || !fieldsRef.current || fieldsRef.current.length === 0) { setAc(null); return; }
    const range = caretRange();
    if (!range || !range.collapsed) { setAc(null); return; }
    const before = range.startContainer.nodeType === Node.TEXT_NODE ? textBeforeCaret(el, range) : '';
    // Open when the text right before the caret ends with an unclosed `{{` or
    // a bare `@` — both stay visible and filter on what follows.
    const prefix = matchOpenToken(before);
    if (prefix === null) { setAc(null); return; }
    const items = searchReportFields(fieldsRef.current, prefix);
    if (items.length === 0) { setAc(null); return; }
    let rect = range.getBoundingClientRect();
    if (!rect.width && !rect.height) rect = el.getBoundingClientRect();
    const below = rect.bottom + MAX_AC_H + 12 < window.innerHeight;
    setAc(prev => {
      if (prev && prev.prefix === prefix && prev.items === items) {
        return { ...prev, x: rect.left, y: below ? rect.bottom : rect.top, below };
      }
      return { x: rect.left, y: below ? rect.bottom : rect.top, below, prefix, items, highlight: 0 };
    });
  }, []);

  const pickToken = useCallback((field: ReportFieldDef) => {
    setAc(null);
    const el = elRef.current;
    if (!el || disabledRef.current) return;
    const range = insertTokenAtCaret(el, field.key);
    if (!range) return;
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    onChange(sanitizeRichText(el.innerHTML));
    refreshChips();
  }, [onChange, refreshChips]);

  const commitValue = useCallback(() => {
    const el = elRef.current;
    if (!el) return;
    undecorateTokens(el);
    onChange(sanitizeRichText(el.innerHTML));
  }, [onChange]);

  useEffect(() => {
    const el = elRef.current;
    if (!el || document.activeElement === el) return;
    if (el.innerHTML !== value) {
      el.innerHTML = value || '';
      refreshChips();
    } else {
      refreshChips();
    }
  }, [value, refreshChips]);

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    refreshChips();
  }, [refreshChips]);

  useEffect(() => {
    const onSelectionChange = () => {
      const el = elRef.current;
      if (!el || document.activeElement !== el) return;
      const range = caretRange();
      if (!range) return;
      normalizeCaretOutOfChip(el);
      lastRangeRef.current = caretRange() ?? range;
      updateAutocomplete();
      refreshChips();
      syncChipSelection(el);
    };
    const onDocMouseDown = (e: MouseEvent) => {
      const el = elRef.current;
      const t = e.target as Node;
      if (el && ac && !el.contains(t) && !acRef.current?.contains(t)) setAc(null);
    };
    // selectionchange fires on the DOCUMENT, not the window — a window
    // listener never runs for real caret moves.
    document.addEventListener('selectionchange', onSelectionChange);
    window.addEventListener('mousedown', onDocMouseDown);
    return () => {
      document.removeEventListener('selectionchange', onSelectionChange);
      window.removeEventListener('mousedown', onDocMouseDown);
    };
  }, [ac, updateAutocomplete, refreshChips]);

  useImperativeHandle(ref, () => ({
    exec: (command: string, execValue?: string) => {
      const el = elRef.current;
      if (!el || disabledRef.current) return;
      undecorateTokens(el);
      el.focus();
      try {
        document.execCommand('styleWithCSS', false, 'true');
        document.execCommand(command, false, execValue);
      } catch { /* execCommand can throw in odd states */ }
      commitValue();
      updateAutocomplete();
      refreshChips();
    },
    focus: () => elRef.current?.focus(),
    insertToken: (field: string) => {
      const el = elRef.current;
      if (!el || disabledRef.current) return;
      el.focus();
      // Make the DOM plain so the restored range/offset map cleanly to text.
      undecorateTokens(el);
      const sel = window.getSelection();
      let restored = false;
      if (lastRangeRef.current && el.contains(lastRangeRef.current.startContainer)) {
        sel?.removeAllRanges();
        sel?.addRange(lastRangeRef.current);
        restored = true;
      }
      if (!restored) {
        const r = rangeAtOffset(el, blurOffsetRef.current);
        if (r) {
          sel?.removeAllRanges();
          sel?.addRange(r);
        }
      }
      const def = fieldsRef.current?.find(f => f.key === field);
      pickToken((def ?? { key: field }) as ReportFieldDef);
    },
  }), [commitValue, updateAutocomplete, refreshChips, pickToken]);

  return (
    <>
      <div
        ref={elRef}
        contentEditable={!disabled}
        suppressContentEditableWarning
        spellCheck={false}
        data-placeholder={placeholder}
        className={`richtext-editor ${className || ''}`}
        onInput={() => {
          const el = elRef.current;
          if (!el) return;
          normalizeCaretOutOfChip(el);
          undecorateTokens(el);
          onChange(sanitizeRichText(el.innerHTML));
          updateAutocomplete();
          refreshChips();
        }}
        onKeyDown={e => {
          // Home: Chrome quirks with a leading chip — snap to the true start
          // (the first non-chip text node) so the caret is visible and
          // Shift+Arrow from there selects the chips in order.
          if (e.key === 'Home') {
            e.preventDefault();
            const el = elRef.current;
            const first = el ? edgeTextNodes(el).first : null;
            if (first) {
              const r = document.createRange();
              r.setStart(first, 0);
              r.collapse(true);
              const sel = window.getSelection();
              sel?.removeAllRanges();
              sel?.addRange(r);
              updateAutocomplete();
            }
            return;
          }
          if (!ac) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setAc(s => s && { ...s, highlight: Math.min(s.highlight + 1, s.items.length - 1) }); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setAc(s => s && { ...s, highlight: Math.max(s.highlight - 1, 0) }); }
          else if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault();
            const s = ac;
            const f = s.items[s.highlight] ?? s.items[0];
            if (f) pickToken(f);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            setAc(null);
          }
        }}
        onMouseDown={e => {
          // Clicking a chip selects the whole chip (so Backspace/Delete removes
          // it, typing replaces it, and the formatting toolbar can target it).
          const t = e.target as HTMLElement;
          if (e.button !== 0 || !t.hasAttribute?.('data-rt-token')) return;
          e.preventDefault();
          const el = elRef.current;
          if (!el) return;
          el.focus();
          const range = document.createRange();
          range.setStartBefore(t);
          range.setEndAfter(t);
          const sel = window.getSelection();
          sel?.removeAllRanges();
          sel?.addRange(range);
          syncChipSelection(el);
        }}
        onPaste={() => {
          // let the browser paste; the sanitizer runs onInput right after
          setTimeout(() => {
            const el = elRef.current;
            if (!el) return;
            undecorateTokens(el);
            onChange(sanitizeRichText(el.innerHTML));
            updateAutocomplete();
            refreshChips();
          }, 0);
        }}
        onFocus={() => {
          // Chips stay put on focus — clicking text never unwraps tokens.
          updateAutocomplete();
        }}
        onBlur={() => {
          setAc(null);
          const el = elRef.current;
          if (el) {
            const range = caretRange();
            blurOffsetRef.current = range && range.startContainer.nodeType === Node.TEXT_NODE
              ? textBeforeCaret(el, range).length
              : (el.textContent?.length ?? 0);
          }
          commitValue();
          refreshChips();
        }}
      />
      {ac && (
        <TokenAutocomplete
          state={ac}
          rootRef={acRef}
          onHighlight={i => setAc(s => s && { ...s, highlight: i })}
          onPick={pickToken}
        />
      )}
    </>
  );
});

RichTextEditor.displayName = 'RichTextEditor';

export default RichTextEditor;
