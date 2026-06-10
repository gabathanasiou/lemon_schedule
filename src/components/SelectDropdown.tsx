import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { useDropdown, useOpenHandler } from '../lib/dropdown';
import { useSmartPosition } from '../lib/useSmartPosition';

const DD_ITEM = (active: boolean) =>
  `px-2 py-1 text-xs rounded cursor-pointer font-[Helvetica,sans-serif] font-normal transition-colors ${active ? 'bg-blue-50 text-blue-700' : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'}`;

interface SelectDropdownProps {
  value: string;
  onChange: (val: string) => void;
  options: string[];
  className?: string;
  readOnly?: boolean;
  placeholder?: string;
  positioning?: 'relative' | 'fixed';
  standalone?: boolean;
}

export const SelectDropdown: React.FC<SelectDropdownProps> = ({
  value,
  onChange,
  options,
  className,
  readOnly,
  placeholder,
  positioning = 'relative',
  standalone = false,
}) => {
  const [open, setOpen] = useState(false);
  const initialIdx = options.indexOf(value);
  const [highlightedIndex, setHighlightedIndex] = useState(initialIdx >= 0 ? initialIdx : 0);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });

  const handleOpen = useOpenHandler(setOpen);

  useSmartPosition(ref, positioning === 'relative' && open);

  useDropdown(open, ref, () => setOpen(false));

  useEffect(() => {
    if (!open || positioning === 'relative') return;
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    }
  }, [open, positioning]);

  const commit = (val: string) => {
    onChange(val);
    setOpen(false);
  };

  if (readOnly) return <span className={className}>{value || '—'}</span>;

  const inputClasses = standalone
    ? 'w-full border border-zinc-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 text-left'
    : 'bg-transparent outline-none uppercase text-inherit cursor-pointer w-full text-left';

  return (
    <div ref={ref} className={standalone ? '' : `relative ${className || ''}`} onMouseDown={e => e.stopPropagation()}>
      <input
        value={value}
        readOnly
        onClick={() => { setHighlightedIndex(options.indexOf(value) >= 0 ? options.indexOf(value) : 0); handleOpen(); }}
        placeholder={placeholder}
        className={`${inputClasses} ${standalone ? '' : (className || '')}`}
        onKeyDown={e => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightedIndex(i => Math.min(i + 1, options.length - 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightedIndex(i => Math.max(i - 1, 0)); }
          if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); commit(options[highlightedIndex]); }
          if (e.key === 'Escape') setOpen(false);
        }}
      />
      {open && (
        <div
          className={
            positioning === 'fixed'
              ? 'z-[9999] bg-white border border-zinc-200 rounded-md shadow-lg p-1 max-h-48 overflow-y-auto min-w-[120px]'
              : `absolute top-full left-0 z-[100] bg-white border border-zinc-200 rounded-lg shadow-lg p-1 max-h-48 overflow-y-auto mt-1 min-w-[120px]`
          }
          style={positioning === 'fixed' ? { position: 'fixed', top: pos.top, left: pos.left, width: pos.width } : {}}
        >
          {options.map((opt, i) => (
            <div
              key={opt}
              className={DD_ITEM(i === highlightedIndex)}
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
