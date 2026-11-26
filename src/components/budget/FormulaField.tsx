import React from 'react';
import { createPortal } from 'react-dom';
import { BookOpen } from 'lucide-react';
import { inputCls, useOverlayMorph } from '@gabriel/ui-kit';
import { useDropdownPosition, type DropdownPanelPos } from '../../lib/useDropdownPosition';
import { overlayMorphOptIn } from '../../lib/overlayMotion';
import { useCurrentDocument } from '../../lib/popoutTarget';
import { isImeConfirm } from '../../lib/keys';
import {
  formulaFragmentAt, insertFormulaText, searchFormulaBook, formulaBookKindLabel,
  type FormulaBookEntry,
} from '../../lib/budget/formulaBook';
import { FormulaBookModal } from './FormulaBookModal';

/**
 * Formula input (roadmap 346): a plain-text field with caret-aware
 * autocomplete over the ONE formula registry (`lib/budget/formulaBook.ts`) and
 * a searchable book. Never the kit `RichTextEditor` — formulas are plain
 * expressions the evaluator parses. Commits on blur/Enter, never per keystroke.
 */
export function FormulaField({
  value, onCommit, entries, readOnly, ariaLabel, placeholder,
}: {
  value: string;
  onCommit: (value: string) => void;
  entries: FormulaBookEntry[];
  readOnly?: boolean;
  ariaLabel?: string;
  placeholder?: string;
}) {
  const doc = useCurrentDocument();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const anchorRef = React.useRef<HTMLDivElement>(null);
  const [draft, setDraft] = React.useState(value);
  const [focused, setFocused] = React.useState(false);
  const [caret, setCaret] = React.useState(value.length);
  const [highlight, setHighlight] = React.useState(0);
  const [dismissedAt, setDismissedAt] = React.useState<number | null>(null);
  const [bookOpen, setBookOpen] = React.useState(false);
  const [pos, setPos] = React.useState<DropdownPanelPos | null>(null);

  React.useEffect(() => {
    if (!focused) setDraft(value);
  }, [value, focused]);

  const { fragment } = formulaFragmentAt(draft, caret);
  const suggestions = React.useMemo(() => {
    if (!focused || dismissedAt === caret) return [];
    const matches = searchFormulaBook(entries, fragment);
    // Prefer prefix matches, then substring matches; registry order inside each.
    const lower = fragment.toLowerCase();
    return [
      ...matches.filter(e => e.key.toLowerCase().startsWith(lower)),
      ...matches.filter(e => !e.key.toLowerCase().startsWith(lower)),
    ].slice(0, 12);
  }, [entries, focused, fragment, dismissedAt, caret]);
  const suggestionsOpen = suggestions.length > 0;

  React.useEffect(() => { setHighlight(0); }, [fragment]);
  useDropdownPosition({
    anchorRef,
    panelRef,
    open: suggestionsOpen,
    maxHeight: 220,
    gap: 2,
    onPosition: setPos,
  });
  const morphRef = useOverlayMorph<HTMLDivElement>({
    visible: suggestionsOpen,
    morph: overlayMorphOptIn(),
    anchor: () => anchorRef.current?.getBoundingClientRect() ?? null,
    ref: panelRef,
    cloneOnUnmount: true,
  });

  const commit = () => {
    const next = draft.trim();
    if (next !== value.trim()) onCommit(next);
  };

  const applySuggestion = (entry: FormulaBookEntry) => {
    const { next, caret: after } = insertFormulaText(draft, caret, entry.insert);
    setDraft(next);
    setCaret(after);
    setDismissedAt(after);
    setFocused(true);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(after, after);
    });
  };

  const closeSuggestions = () => setFocused(false);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (suggestionsOpen) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(h => (h + 1) % suggestions.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(h => (h - 1 + suggestions.length) % suggestions.length); return; }
      if ((e.key === 'Enter' && !isImeConfirm(e) && !e.shiftKey) || e.key === 'Tab') {
        e.preventDefault();
        const entry = suggestions[highlight];
        if (entry) applySuggestion(entry);
        return;
      }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeSuggestions(); return; }
    }
    if (e.key === 'Enter' && !isImeConfirm(e) && !e.shiftKey) {
      e.preventDefault();
      commit();
      inputRef.current?.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setDraft(value);
      inputRef.current?.blur();
    }
  };

  // The book inserts at the end of the expression (the field keeps focus).
  const insertFromBook = (entry: FormulaBookEntry) => {
    const { next, caret: after } = insertFormulaText(draft, draft.length, entry.insert);
    setDraft(next);
    setCaret(after);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(after, after);
    });
  };

  return (
    <div ref={anchorRef} className="relative flex items-center min-w-0 w-full" data-formula-field>
      <input
        ref={inputRef}
        className={`${inputCls('md')} w-full pr-8 font-mono`}
        value={draft}
        readOnly={readOnly}
        aria-label={ariaLabel}
        placeholder={placeholder}
        spellCheck={false}
        onChange={(e) => {
          setDraft(e.target.value);
          setCaret(e.target.selectionStart ?? e.target.value.length);
          setDismissedAt(null);
          setFocused(true);
        }}
        onSelect={(e) => setCaret((e.target as HTMLInputElement).selectionStart ?? 0)}
        onFocus={() => setFocused(true)}
        onBlur={() => { setFocused(false); commit(); }}
        onKeyDown={onKeyDown}
      />
      <button
        type="button"
        className="absolute right-1.5 p-1 rounded text-[color:var(--ui-text-faint)] hover:text-[color:var(--ui-text-strong)] hover:bg-[var(--ui-item-hover-bg)]"
        title="Formula book"
        aria-label={`Formula book${ariaLabel ? ` for ${ariaLabel}` : ''}`}
        onClick={() => setBookOpen(true)}
      >
        <BookOpen className="w-3.5 h-3.5" />
      </button>

      {suggestionsOpen && pos && createPortal(
        <div
          ref={morphRef}
          style={{ position: 'fixed', top: pos.top, left: Math.max(8, pos.left), width: Math.max(240, anchorRef.current?.getBoundingClientRect().width ?? 240), maxHeight: pos.maxH, zIndex: 10001, pointerEvents: 'auto' }}
          className="overflow-y-auto scrollbar-custom rounded-lg border border-[color:var(--ui-border)] bg-[var(--ui-panel-bg)] shadow-2xl py-1"
          data-formula-suggestions
          onMouseDown={(e) => e.preventDefault()}
        >
          {suggestions.map((entry, index) => (
            <button
              key={`${entry.kind}:${entry.key}`}
              type="button"
              onClick={() => applySuggestion(entry)}
              onMouseEnter={() => setHighlight(index)}
              className={`w-full flex items-start gap-2 px-2.5 py-1.5 text-left ${index === highlight ? 'bg-[var(--ui-item-hover-bg)]' : ''}`}
            >
              <span className="shrink-0 mt-0.5 text-[9px] uppercase tracking-wide text-[color:var(--ui-text-faint)] w-12 truncate">{formulaBookKindLabel(entry.kind).split(' ')[0]}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-mono font-semibold text-[color:var(--ui-text-strong)]">{entry.key}{entry.kind === 'function' ? '(' : ''}</span>
                <span className="block text-[10px] text-[color:var(--ui-text-muted)] truncate">{entry.detail}</span>
              </span>
            </button>
          ))}
        </div>,
        doc?.body ?? document.body,
      )}

      <FormulaBookModal
        open={bookOpen}
        onClose={() => setBookOpen(false)}
        entries={entries}
        readOnly={readOnly}
        onInsert={insertFromBook}
      />
    </div>
  );
}
