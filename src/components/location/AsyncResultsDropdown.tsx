import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { useDropdown, useEscapeCapture } from '../../lib/dropdown';
import { useFixedPosition } from '../../lib/useSmartPosition';
import { IS_COARSE, useHardwareKeyboard } from '../../lib/device';
import { useKeyboardMode } from '../../lib/persist';
import DropdownPanel from '../DropdownPanel';

// Reusable async-search dropdown (dark — the shared entity-dropdown panel
// look): typing debounces a search and the results float in the shared
// DropdownPanel under the input (they never push surrounding layout down).
// Picking calls onPick; Escape or clicking outside closes the panel. T
// carries the data each result needs. Built on the shared dark panel (morph +
// touch/wheel scroll + visual-viewport keyboard clamp via the kit hooks) so
// the picker behaves like every other dropdown on iPad.

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
  const scrollRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const seq = useRef(0);
  const searchRef = useRef(search);
  searchRef.current = search;
  const [keyboardMode] = useKeyboardMode();
  const hwKeyboard = useHardwareKeyboard();

  /* Fixed positioning + the same pos/ready contract as DropdownPanel: the
     panel stays invisible until the positioning rAF flips `ready`. */
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0, maxH: 288, ready: false } as { top: number; left: number; width: number; maxH: number; bottom?: number; ready?: boolean });

  useEscapeCapture(open, () => setOpen(false));

  useFixedPosition(ref, open, (p) => setPos({ ...p, ready: true }));

  useDropdown(open, ref, () => setOpen(false), panelRef);

  useEffect(() => {
    if (open) setPos(p => ({ ...p, ready: false }));
  }, [open]);

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
          readOnly={IS_COARSE && !hwKeyboard && keyboardMode === 'off'}
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
        <DropdownPanel
          dark
          positioning="fixed"
          pos={pos}
          panelRef={panelRef}
          scrollRef={scrollRef}
          dropdownItems={results.map(r => ({ id: r.key, name: r.label }))}
          currentIds={[]}
          highlightedIndex={highlighted}
          itemKey={(m) => m.id}
          searchQuery=""
          hasExactMatch
          renderItem={(m) => <span className="truncate">{m.name}</span>}
          defaultRenderer={(m) => <span className="truncate">{m.name}</span>}
          onItemClick={(m) => pick(results.find(r => r.key === m.id) as T)}
          onItemHover={(i) => setHighlighted(i)}
          onHoverLeave={() => setHighlighted(-1)}
          onCommit={() => {}}
          portalTarget={null}
          anchorRef={ref}
        />
      )}
    </div>
  );
}
