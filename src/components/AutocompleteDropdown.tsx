import React, { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useOverlayMorph } from '@gabriel/ui-kit';
import { useDropdown, useOpenHandler, useEscapeCapture, DD_ITEM } from '../lib/dropdown';
import { useSmartPosition, useFixedPosition } from '../lib/useSmartPosition';
import { overlayMorphOptIn } from '../lib/overlayMotion';
import { IS_COARSE, useHardwareKeyboard } from '../lib/device';
import { useKeyboardMode } from '../lib/persist';

/** Case-insensitive fuzzy score for a query against an option:
 *  substring beats in-order subsequence; the query is split on whitespace and
 *  EVERY token must match (in order), so "new york" and "los ang" both find
 *  America/New_York / America/Los_Angeles despite the underscore. -1 = no match. */
const fuzzyScore = (query: string, option: string): number => {
  const q = query.trim().toLowerCase();
  const o = option.toLowerCase();
  if (!q) return -1;
  let cursor = 0;
  let score = 0;
  for (const tok of q.split(/\s+/)) {
    if (!tok) continue;
    const idx = o.indexOf(tok, cursor);
    if (idx >= 0) {
      score += 5000 - idx;
      cursor = idx + tok.length;
    } else {
      let i = cursor;
      for (const ch of tok) {
        const at = o.indexOf(ch, i);
        if (at < 0) return -1;
        i = at + 1;
      }
      score += 1000 - i + tok.length;
      cursor = i;
    }
  }
  return score;
};

interface AutocompleteDropdownProps {
  value: string;
  onChange: (val: string) => void;
  options: string[];
  className?: string;
  readOnly?: boolean;
  placeholder?: string;
  positioning?: 'relative' | 'fixed';
  standalone?: boolean;
  normalize?: (val: string) => string;
  /** Start with the dropdown open (editors that should show suggestions immediately) */
  defaultOpen?: boolean;
  /** Auto-focus the input on mount */
  autoFocus?: boolean;
  /** Show all options without filtering (for short predetermined lists) */
  showAll?: boolean;
  /** Fuzzy matching (exact > prefix > substring > in-order subsequence) —
   *  for long lists like timezones where substring-only filtering misses
   *  partial-word queries ("newyork" still finds America/New_York). */
  fuzzy?: boolean;
  /** Called when the dropdown is dismissed by clicking outside or committing. Not called on Escape. */
  onExit?: () => void;
  /** Called when Tab is pressed - allows passing movement to Glide's onFinishedEditing */
  onTabExit?: () => void;
  portalTarget?: HTMLElement | null;
  /** Grow the inline editor's width with its content (`field-sizing: content`)
   *  instead of filling the cell — for spreadsheet overlay editors so long
   *  values stay visible while typing. */
  autoGrow?: boolean;
}

export const AutocompleteDropdown: React.FC<AutocompleteDropdownProps> = ({
  value,
  onChange,
  options,
  className,
  readOnly,
  placeholder,
  positioning = 'relative',
  standalone = false,
  normalize = v => v.toUpperCase(),
  defaultOpen = false,
  autoFocus: autoFocusProp = false,
  showAll = false,
  onExit,
  onTabExit,
  portalTarget,
  fuzzy = false,
  autoGrow = false,
}) => {
  const [open, setOpen] = useState(defaultOpen);
  const [keyboardMode] = useKeyboardMode();
  const hwKeyboard = useHardwareKeyboard();
  const [val, setVal] = useState(value);
  const [highlightedIndex, setHighlightedIndex] = useState(() => {
    const idx = options.findIndex(opt => normalize(opt) === normalize(value));
    if (idx >= 0) return idx;
    if (showAll && value) {
      const partialIdx = options.findIndex(opt => normalize(opt).includes(normalize(value)));
      return partialIdx >= 0 ? partialIdx : 0;
    }
    return 0;
  });
  const ref = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  /** True while the user has typed since the dropdown opened — a click-open
   *  (no typing yet) shows ALL options, not a pre-filtered query. */
  const typedRef = useRef(false);
  /* Fixed panels stay INVISIBLE until the positioning rAF flips `ready` —
     the panel must never paint a frame at (0,0) before it is positioned. */
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0, maxH: 288, ready: false } as { top: number; left: number; width: number; maxH: number; bottom?: number; ready?: boolean });
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const handleOpen = useOpenHandler(setOpen);

  /* The shared overlay morph (the modal FLIP language — EntityDropdown
     panels use the same recipe): grow out of the trigger, close morph plays
     on a pinned clone since the parent unmounts the panel to close. */
  const anchor = useCallback(() => {
    const el = ref.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  }, []);
  const setContentRef = useOverlayMorph({
    visible: true,
    morph: overlayMorphOptIn(),
    ref: scrollRef,
    anchor,
    cloneOnUnmount: true,
  });
  const setPanelRef = React.useCallback((node: HTMLDivElement | null) => {
    scrollRef.current = node;
    setContentRef(node);
  }, [setContentRef]);

  // Escape dismisses ONLY this dropdown — never the enclosing modal.
  useEscapeCapture(open, () => { typedRef.current = false; setOpen(false); setVal(value); });

  useSmartPosition(ref, positioning === 'relative' && open);

  useDropdown(open, ref, () => {
    if (val !== value) onChange(val);
    onExit?.();
    typedRef.current = false;
    setOpen(false);
    setVal(value);
  }, scrollRef);

  useFixedPosition(ref, positioning === 'fixed' && open, (p) => setPos({ ...p, ready: true }));

  useEffect(() => {
    if (open) setPos(p => ({ ...p, ready: false }));
  }, [open]);

  useEffect(() => {
    return () => { if (highlightTimer.current) clearTimeout(highlightTimer.current); };
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!open || !el) return;
    const onWheel = (e: WheelEvent) => {
      if (el.scrollHeight > el.clientHeight) {
        e.preventDefault();
        el.scrollTop += e.deltaY;
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [open]);

  const filtered = useMemo(() => {
    if (showAll || !open || !val || !typedRef.current) return options;
    const q = normalize(val);
    if (fuzzy) {
      return options
        .map(opt => ({ opt, s: fuzzyScore(q, opt) }))
        .filter(x => x.s >= 0)
        .sort((a, b) => b.s - a.s)
        .map(x => x.opt);
    }
    return options.filter(opt => normalize(opt).includes(q));
  }, [options, val, open, normalize, showAll, fuzzy]);

  const commit = (opt: string) => {
    typedRef.current = false;
    if (opt !== value) onChange(opt);
    onExit?.();
    setOpen(false);
  };

  if (readOnly) return <span className={className}>{value || '?'}</span>;

  const inputClasses = standalone
    ? 'w-full bg-white border border-zinc-300 rounded px-2 py-1 text-xs text-zinc-800 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-400 text-left'
    : 'bg-transparent outline-none uppercase text-inherit w-full text-left';

  return (
    <div ref={ref} className={standalone ? 'relative' : `relative ${autoGrow ? 'w-max ' : ''}${className || ''}`} onMouseDown={e => e.stopPropagation()} onContextMenu={e => { e.preventDefault(); e.stopPropagation(); }}>
      <input
        autoFocus={autoFocusProp}
        readOnly={IS_COARSE && !hwKeyboard && keyboardMode === 'off'}
        value={open ? val : value}
        onChange={e => { typedRef.current = true; const typed = normalize(e.target.value); setVal(typed); if (highlightTimer.current) clearTimeout(highlightTimer.current); if (showAll) { highlightTimer.current = setTimeout(() => { const idx = options.findIndex(opt => normalize(opt).includes(typed)); setHighlightedIndex(idx >= 0 ? idx : 0); }, 150); } else { setHighlightedIndex(0); } if (!open) { standalone ? setOpen(true) : handleOpen(); } }}
        onClick={() => { setVal(value); typedRef.current = false; if (!open) { const idx = options.findIndex(opt => normalize(opt) === normalize(value)); setHighlightedIndex(idx >= 0 ? idx : 0); standalone ? setOpen(true) : handleOpen(); } }}
        onFocus={() => { typedRef.current = false; if (!open) { standalone ? setOpen(true) : undefined; } }}
        placeholder={placeholder}
        style={autoGrow && !standalone ? { width: 'auto', fieldSizing: 'content', maxWidth: 400 } as React.CSSProperties : undefined}
        className={`${inputClasses} ${standalone ? '' : (className || '')}`}
        onKeyDown={e => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightedIndex(i => Math.min(i + 1, filtered.length - 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightedIndex(i => Math.max(i - 1, 0)); }
          if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            const match = filtered[highlightedIndex] || filtered[0];
            if (match) commit(match);
          }
          if (e.key === 'Tab') {
            e.preventDefault();
            const match = filtered[highlightedIndex] || filtered[0];
            const opt = match || normalize(val);
            if (opt !== value) onChange(opt);
            (onTabExit || onExit)?.();
            typedRef.current = false;
            setOpen(false);
            setVal(value);
          }
          if (e.key === 'Escape') { typedRef.current = false; setOpen(false); setVal(value); }
        }}
      />
      {open && filtered.length > 0 && (() => {
        const panel = (
         <div
          ref={setPanelRef}
          className={
            positioning === 'fixed'
              ? 'click-outside-ignore z-[9999] bg-white border border-zinc-200 rounded-md shadow-lg p-1 max-h-48 overflow-y-auto min-w-[160px]'
              : `click-outside-ignore absolute top-full left-0 z-[100] bg-white border border-zinc-200 rounded-lg shadow-lg p-1 max-h-48 overflow-y-auto mt-1 min-w-[160px]`
          }
          style={positioning === 'fixed' ? { position: 'fixed', left: pos.left, width: pos.width, maxHeight: pos.maxH, visibility: pos.ready ? 'visible' : 'hidden', ...(pos.bottom != null ? { bottom: pos.bottom } : { top: pos.top }) } : {}}
        >
          {filtered.map((opt, i) => (
            <div
              key={opt}
              className={`${DD_ITEM(i === highlightedIndex)} uppercase`}
              onTouchStart={() => {}}
              onMouseDown={e => { e.preventDefault(); commit(opt); }}
            >
              {opt}
            </div>
          ))}
        </div>
        );
        return portalTarget && positioning === 'fixed'
          ? createPortal(panel, portalTarget)
          : panel;
      })()}
    </div>
  );
};
