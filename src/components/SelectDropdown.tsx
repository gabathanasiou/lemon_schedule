import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { useDropdown, useOpenHandler, DD_ITEM } from '../lib/dropdown';
import { useSmartPosition, useFixedPosition } from '../lib/useSmartPosition';
import { advanceRibbonFocus } from '../lib/ribbonEditNav';
import { IS_COARSE } from '../lib/device';



interface SelectDropdownProps {
  value: string;
  onChange: (val: string) => void;
  options: string[];
  className?: string;
  readOnly?: boolean;
  placeholder?: string;
  positioning?: 'relative' | 'fixed';
  standalone?: boolean;
  autoFocus?: boolean;
  onTabExit?: (el: HTMLElement) => void;
  style?: React.CSSProperties;
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
  autoFocus = false,
  onTabExit,
  style,
}) => {
  const [open, setOpen] = useState(false);
  const initialIdx = options.indexOf(value);
  const [highlightedIndex, setHighlightedIndex] = useState(initialIdx >= 0 ? initialIdx : 0);
  const ref = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0, maxH: 288 } as { top: number; left: number; width: number; maxH: number; bottom?: number; ready?: boolean });

  const handleOpen = useOpenHandler(setOpen);

  useEffect(() => {
    if (autoFocus && !readOnly && ref.current) {
      const input = ref.current.querySelector('input');
      input?.focus();
      handleOpen();
    }
  }, [autoFocus, readOnly, handleOpen]);

  useSmartPosition(ref, positioning === 'relative' && open);

  useDropdown(open, ref, () => setOpen(false));

  useFixedPosition(ref, positioning === 'fixed' && open, (p) => setPos({ ...p, ready: true }));

  useEffect(() => {
    if (open) setPos(p => ({ ...p, ready: false }));
  }, [open]);

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

  const commit = (val: string) => {
    onChange(val);
    setOpen(false);
  };

  if (readOnly) return <span className={className}>{value || '?'}</span>;

  const inputClasses = standalone
    ? `w-full border border-zinc-300 rounded-md ${IS_COARSE ? 'px-4 py-3 text-base' : 'px-3 py-2 text-sm'} focus:outline-none focus:ring-2 focus:ring-zinc-900 text-left`
    : 'bg-transparent outline-none uppercase cursor-pointer w-full text-left h-full hover:bg-black/[0.09] focus:bg-black/[0.18]';

  return (
    <div ref={ref} className={standalone ? '' : `relative h-[1lh] ${className || ''}`} onMouseDown={e => e.stopPropagation()} onContextMenu={e => { e.preventDefault(); e.stopPropagation(); }}>
      <input
        value={value}
        readOnly
        onClick={() => { setHighlightedIndex(options.indexOf(value) >= 0 ? options.indexOf(value) : 0); handleOpen(); }}
        placeholder={standalone ? placeholder : ''}
        className={`${inputClasses} ${standalone ? '' : (className || '')}`}
        style={standalone ? style : { ...style, color: 'transparent', caretColor: '#2563eb' }}
        onKeyDown={e => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightedIndex(i => Math.min(i + 1, options.length - 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightedIndex(i => Math.max(i - 1, 0)); }
          if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault();
            commit(options[highlightedIndex]);
            if (e.key === 'Tab') onTabExit?.(ref.current?.querySelector('input') as HTMLInputElement);
          }
          if (e.key === 'Escape') setOpen(false);
        }}
      />
      {!standalone && (
        <span className={`absolute inset-0 truncate pointer-events-none uppercase whitespace-nowrap text-left ${value ? '' : 'italic opacity-50'}`} style={style}>
          {value || placeholder}
        </span>
      )}
      {open && (
        <div
          ref={scrollRef}
          className={
            positioning === 'fixed'
              ? 'z-[9999] bg-white border border-zinc-200 rounded-md shadow-lg p-1 max-h-48 overflow-y-auto min-w-[120px]'
              : `absolute top-full left-0 z-[100] bg-white border border-zinc-200 rounded-lg shadow-lg p-1 max-h-48 overflow-y-auto mt-1 min-w-[120px]`
          }
          style={positioning === 'fixed' ? { position: 'fixed', left: pos.left, width: pos.width, maxHeight: pos.maxH, visibility: pos.ready ? 'visible' : 'hidden', ...(pos.bottom != null ? { bottom: pos.bottom } : { top: pos.top }) } : {}}
        >
          {options.map((opt, i) => (
            <div
              key={opt}
              className={DD_ITEM(i === highlightedIndex)}
              onTouchStart={() => {}}
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
