import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { useDropdown } from '../../lib/dropdown';
import { useSmartPosition } from '../../lib/useSmartPosition';

// Reusable async-search dropdown (dark, matches the app's menu styling):
// typing debounces a search and the results float in a panel under the input
// (they never push surrounding layout down). Picking calls onPick; Escape or
// clicking outside closes the panel. T carries the data each result needs.

export interface AsyncResultItem {
  key: string;
  label: string;
}

const DEBOUNCE = 400;

export function AsyncResultsDropdown<T extends AsyncResultItem>({
  value,
  onValueChange,
  search,
  onPick,
  placeholder,
}: {
  value: string;
  onValueChange: (q: string) => void;
  search: (q: string) => Promise<T[]>;
  onPick: (item: T) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<T[]>([]);
  const [searching, setSearching] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const seq = useRef(0);
  const searchRef = useRef(search);
  searchRef.current = search;

  useSmartPosition(ref, open);

  const close = useCallback(() => setOpen(false), []);
  useDropdown(open, ref, close, panelRef);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const runSearch = useCallback((q: string) => {
    if (timer.current) clearTimeout(timer.current);
    if (!q.trim()) {
      setResults([]);
      setSearching(false);
      setOpen(false);
      return;
    }
    setSearching(true);
    setOpen(true);
    const s = ++seq.current;
    timer.current = setTimeout(async () => {
      const items = await searchRef.current(q);
      if (seq.current !== s) return;
      setResults(items);
      setHighlighted(0);
      setSearching(false);
    }, DEBOUNCE);
  }, []);

  const pick = (item: T) => {
    onPick(item);
    setResults([]);
    setSearching(false);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative" onMouseDown={e => e.stopPropagation()} onContextMenu={e => { e.preventDefault(); e.stopPropagation(); }}>
      <div className="relative">
        <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          value={value}
          onChange={e => { onValueChange(e.target.value); runSearch(e.target.value); }}
          onFocus={() => { if (value.trim() && (results.length > 0 || searching)) setOpen(true); }}
          onKeyDown={e => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setHighlighted(i => Math.min(i + 1, results.length - 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setHighlighted(i => Math.max(i - 1, 0)); }
            if (e.key === 'Enter') { e.preventDefault(); const m = results[highlighted]; if (m) pick(m); }
            if (e.key === 'Escape') { setOpen(false); }
          }}
          placeholder={placeholder}
          className="w-full bg-zinc-950 border border-zinc-700 rounded-md pl-9 pr-8 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-zinc-500"
        />
        {searching && (
          <Loader2 className="w-3.5 h-3.5 text-zinc-500 absolute right-3 top-1/2 -translate-y-1/2 animate-spin" />
        )}
      </div>
      {open && (
        <div
          ref={panelRef}
          className="click-outside-ignore absolute top-full left-0 right-0 z-[1100] mt-1 bg-zinc-900 border border-zinc-700 rounded-md shadow-lg py-1 max-h-48 overflow-y-auto"
        >
          {results.length > 0 ? results.map((r, i) => (
            <button
              key={r.key}
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => pick(r)}
              onMouseEnter={() => setHighlighted(i)}
              className={`w-full text-left px-3 py-1.5 text-[11px] transition-colors ${i === highlighted ? 'bg-zinc-700 text-white' : 'text-zinc-300 hover:bg-zinc-800'}`}
            >
              {r.label}
            </button>
          )) : (
            <div className="px-3 py-1.5 text-[11px] text-zinc-500">No matches</div>
          )}
        </div>
      )}
    </div>
  );
}
