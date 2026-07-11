import React, { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useDropdown, useOpenHandler, DD_ITEM } from '../lib/dropdown';
import { useSmartPosition, useFixedPosition } from '../lib/useSmartPosition';
import { IS_COARSE } from '../lib/device';



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
  /** Called when the dropdown is dismissed by clicking outside or committing. Not called on Escape. */
  onExit?: () => void;
  /** Portal target element for the dropdown panel (escapes clipping containers) */
  portalTarget?: HTMLElement | null;
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
  portalTarget,
}) => {
  const [open, setOpen] = useState(defaultOpen);
  const [val, setVal] = useState(value);
  const [highlightedIndex, setHighlightedIndex] = useState(() => {
    const idx = options.findIndex(opt => opt === normalize(value));
    return idx >= 0 ? idx : 0;
  });
  const ref = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0, maxH: 288 });

  const handleOpen = useOpenHandler(setOpen);

  useSmartPosition(ref, positioning === 'relative' && open);

  useDropdown(open, ref, () => {
    if (val !== value) onChange(val);
    onExit?.();
    setOpen(false);
    setVal(value);
  }, scrollRef);

  useFixedPosition(ref, positioning === 'fixed' && open, setPos);

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

  const filtered = useMemo(
    () => (showAll || !open || !val ? options : options.filter(opt => opt.includes(normalize(val)))),
    [options, val, open, normalize, showAll]
  );

  const commit = (opt: string) => {
    if (opt !== value) onChange(opt);
    onExit?.();
    setOpen(false);
  };

  if (readOnly) return <span className={className}>{value || '—'}</span>;

  const inputClasses = standalone
    ? `w-full border border-zinc-300 rounded-md ${IS_COARSE ? 'px-4 py-3 text-base' : 'px-3 py-2 text-sm'} focus:outline-none focus:ring-2 focus:ring-zinc-900 text-left`
    : 'bg-transparent outline-none uppercase text-inherit w-full text-left';

  return (
    <div ref={ref} className={standalone ? '' : `relative ${className || ''}`} onMouseDown={e => e.stopPropagation()} onContextMenu={e => { e.preventDefault(); e.stopPropagation(); }}>
      <input
        autoFocus={autoFocusProp}
        readOnly={IS_COARSE}
        value={open ? val : value}
        onChange={e => { const typed = normalize(e.target.value); setVal(typed); if (showAll) { const idx = options.findIndex(opt => opt.includes(typed)); setHighlightedIndex(idx >= 0 ? idx : 0); } else { setHighlightedIndex(0); } if (!open) { standalone ? setOpen(true) : handleOpen(); } }}
        onClick={() => { setVal(value); if (!open) { const full = showAll ? options : options.filter(opt => opt.includes(normalize(value))); const idx = full.findIndex(opt => opt === normalize(value)); setHighlightedIndex(idx >= 0 ? idx : 0); standalone ? setOpen(true) : handleOpen(); } }}
        onFocus={() => { if (!open) { standalone ? setOpen(true) : undefined; } }}
        placeholder={placeholder}
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
            if (match && match !== value) onChange(match);
            setOpen(false);
          }
          if (e.key === 'Escape') { setOpen(false); setVal(value); }
        }}
      />
      {open && filtered.length > 0 && (() => {
        const panel = (
         <div
          ref={scrollRef}
          className={
            positioning === 'fixed'
              ? 'click-outside-ignore z-[9999] bg-white border border-zinc-200 rounded-md shadow-lg p-1 max-h-48 overflow-y-auto min-w-[160px]'
              : `click-outside-ignore absolute top-full left-0 z-[100] bg-white border border-zinc-200 rounded-lg shadow-lg p-1 max-h-48 overflow-y-auto mt-1 min-w-[160px]`
          }
          style={positioning === 'fixed' ? { position: 'fixed', top: pos.top, left: pos.left, width: pos.width, maxHeight: pos.maxH } : {}}
        >
          {filtered.map((opt, i) => (
            <div
              key={opt}
              className={`${DD_ITEM(i === highlightedIndex)} uppercase`}
              onTouchStart={() => {}}
              onPointerDown={e => { if (e.pointerType === 'pen') { const el = e.currentTarget; el.classList.add('pen-pulse'); setTimeout(() => el.classList.remove('pen-pulse'), 350); } }}
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
