import React, { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import { useDropdown, useOpenHandler } from '../lib/dropdown';
import { useSmartPosition } from '../lib/useSmartPosition';

const DD_ITEM = (active: boolean) =>
  `px-2 py-1 text-xs rounded cursor-pointer font-[Helvetica,Arial,sans-serif] font-normal transition-colors ${active ? 'bg-blue-50 text-blue-700' : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'}`;

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
}) => {
  const [open, setOpen] = useState(defaultOpen);
  const [val, setVal] = useState(value);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });

  const handleOpen = useOpenHandler(setOpen);

  useSmartPosition(ref, positioning === 'relative' && open);

  useDropdown(open, ref, () => {
    setOpen(false);
    setVal(value);
  });

  useEffect(() => {
    if (!open || positioning === 'relative') return;
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    }
  }, [open, positioning]);

  const filtered = useMemo(
    () => (showAll || !open || !val ? options : options.filter(opt => opt.includes(normalize(val)))),
    [options, val, open, normalize, showAll]
  );

  const commit = (opt: string) => {
    onChange(opt);
    setOpen(false);
  };

  if (readOnly) return <span className={className}>{value || '—'}</span>;

  const inputClasses = standalone
    ? 'w-full border border-zinc-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 text-left'
    : 'bg-transparent outline-none uppercase text-inherit w-full text-left';

  return (
    <div ref={ref} className={standalone ? '' : `relative ${className || ''}`} onMouseDown={e => e.stopPropagation()}>
      <input
        autoFocus={autoFocusProp}
        value={open ? val : value}
        onChange={e => { const typed = normalize(e.target.value); setVal(typed); if (showAll) { const idx = options.findIndex(opt => opt.includes(typed)); setHighlightedIndex(idx >= 0 ? idx : 0); } else { setHighlightedIndex(0); } if (!open) { standalone ? setOpen(true) : handleOpen(); } }}
        onClick={() => { setVal(value); if (!open) { standalone ? setOpen(true) : handleOpen(); } }}
        onFocus={() => { if (!open) { standalone ? setOpen(true) : undefined; } }}
        placeholder={placeholder}
        className={`${inputClasses} ${standalone ? '' : (className || '')}`}
        onKeyDown={e => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightedIndex(i => Math.min(i + 1, filtered.length - 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightedIndex(i => Math.max(i - 1, 0)); }
          if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); commit(filtered[0] ? filtered[highlightedIndex] : normalize(val)); }
          if (e.key === 'Escape') { setOpen(false); setVal(value); }
        }}
      />
      {open && filtered.length > 0 && (
        <div
          className={
            positioning === 'fixed'
              ? 'z-[9999] bg-white border border-zinc-200 rounded-md shadow-lg p-1 max-h-48 overflow-y-auto min-w-[160px]'
              : `absolute top-full left-0 z-[100] bg-white border border-zinc-200 rounded-lg shadow-lg p-1 max-h-48 overflow-y-auto mt-1 min-w-[160px]`
          }
          style={positioning === 'fixed' ? { position: 'fixed', top: pos.top, left: pos.left, width: pos.width } : {}}
        >
          {filtered.map((opt, i) => (
            <div
              key={opt}
              className={`${DD_ITEM(i === highlightedIndex)} uppercase`}
              onMouseDown={e => { e.preventDefault(); commit(opt); }}
            >
              {opt}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
