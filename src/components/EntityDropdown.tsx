import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Scene } from '../types';
import { useProject } from '../store';
import { useDropdown, useOpenHandler, sortCastMembers } from '../lib/dropdown';
import { useSmartPosition } from '../lib/useSmartPosition';

export const DD_ITEM_CLASS = (active: boolean) =>
  `w-full text-left px-2 py-1 text-xs rounded cursor-pointer transition-colors flex items-center gap-2 ${active ? 'bg-blue-50 text-blue-700 hover:bg-blue-100' : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'}`;

export const DD_PANEL_CLASS = (positioning: string) =>
  positioning === 'fixed'
    ? 'z-[9999] bg-white border border-zinc-200 rounded-md shadow-lg p-1 max-h-48 overflow-y-auto min-w-[200px]'
    : 'absolute top-full left-0 z-[100] bg-white border border-zinc-200 rounded-lg shadow-lg p-1 max-h-56 overflow-y-auto mt-1 min-w-[180px]';

export const DD_INPUT_CLASS = (standalone: boolean) =>
  standalone
    ? 'w-full border border-zinc-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900'
    : 'text-inherit placeholder:text-inherit placeholder:opacity-50 bg-transparent w-full h-full outline-none text-left';

export interface EntityItem {
  id: string;
  name: string;
}

interface EntityDropdownProps {
  value: string;
  onChange: (val: string) => void;
  className?: string;
  readOnly?: boolean;
  placeholder?: string;
  positioning?: 'relative' | 'fixed';
  mode?: 'single' | 'multi';
  showSceneCounts?: boolean;
  scenes?: Scene[];
  standalone?: boolean;
  /** Custom entity list. Uses store castMembers when omitted. */
  items?: EntityItem[];
  /** Fields to search against. Defaults to ['id', 'name']. */
  searchFields?: ('id' | 'name')[];
  /** Custom item renderer. Defaults to "id. name". */
  renderItem?: (item: EntityItem, selected: boolean) => React.ReactNode;
  /** Custom sorter. Defaults to selected-first then numeric id. */
  sortItems?: (items: EntityItem[], selectedIds: string[]) => EntityItem[];
  /** Custom filter. Defaults to substring match on searchFields. */
  filterItem?: (item: EntityItem, query: string) => boolean;
  /** Called per item in the dropdown — e.g. to show a badge count. */
  itemBadge?: (item: EntityItem) => string | null;
  /** Start with the dropdown open (editors that should show suggestions immediately) */
  defaultOpen?: boolean;
  /** Auto-focus the input on mount */
  autoFocus?: boolean;
  /** Display mode: 'id' (cast, default) or 'name' (non-cast). Controls checked matching and default renderer. */
  displayMode?: 'id' | 'name';
}

export const EntityDropdown: React.FC<EntityDropdownProps> = ({
  value,
  onChange,
  className,
  readOnly,
  placeholder = 'Type...',
  positioning = 'relative',
  mode = 'multi',
  showSceneCounts = false,
  scenes,
  standalone = false,
  items: externalItems,
  searchFields = ['id', 'name'],
  renderItem,
  sortItems,
  filterItem,
  itemBadge,
  defaultOpen = false,
  autoFocus: autoFocusProp = false,
  displayMode = 'name',
}) => {
  const { state } = useProject();
  const storeItems = state.present.castMembers ?? [];
  const items = externalItems ?? storeItems;
  const [open, setOpen] = useState(defaultOpen);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const committedRef = useRef(false);

  const handleOpen = useOpenHandler(setOpen);

  useSmartPosition(ref, positioning === 'relative' && open);

  // --- Multi mode: val = full comma-separated text (like CastEditor) ---
  // --- Single mode: query + localIds (search-then-select pattern) ---
  const [val, setVal] = useState(value);
  useEffect(() => {
    if (mode === 'multi') setVal(value);
  }, [value, mode]);
  const [query, setQuery] = useState('');
  const [localIds, setLocalIds] = useState<string[]>(() =>
    (value || '').split(',').map(x => x.trim()).filter(Boolean)
  );
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  useEffect(() => {
    if (open) { committedRef.current = false; setHighlightedIndex(-1); }
  }, [open]);

  const itemKey = useCallback((m: EntityItem) => displayMode === 'name' ? m.name : (m.id || m.name), [displayMode]);

  const currentIds = mode === 'multi'
    ? val.split(',').map(x => x.trim()).filter(Boolean)
    : localIds;

  const handleClose = useCallback(() => {
    if (committedRef.current) return;
    committedRef.current = true;
    if (mode === 'multi') {
      onChange(val.split(',').map(x => x.trim()).filter(Boolean).join(', '));
    } else {
      onChange(localIds.length > 0 ? localIds.join(', ') : query);
    }
    setOpen(false);
    setQuery('');
  }, [mode, val, localIds, query, onChange]);

  useDropdown(open, ref, handleClose);

  useEffect(() => {
    if (!open || positioning === 'relative') return;
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    }
  }, [open, positioning]);

  const toggle = useCallback((id: string) => {
    if (mode === 'single') {
      setLocalIds([id]);
      setQuery('');
      committedRef.current = true;
      onChange(id);
      setOpen(false);
      return;
    }
    setVal(prev => {
      const ids = prev.split(',').map(x => x.trim()).filter(Boolean);
      const idx = ids.indexOf(id);
      if (idx >= 0) ids.splice(idx, 1);
      else ids.push(id);
      return ids.join(', ');
    });
  }, [mode, onChange]);

  const commit = useCallback(() => {
    if (committedRef.current) return;
    committedRef.current = true;
    if (mode === 'multi') {
      onChange(val.split(',').map(x => x.trim()).filter(Boolean).join(', '));
    } else {
      onChange(localIds.length > 0 ? localIds.join(', ') : query);
    }
    setOpen(false);
    setQuery('');
  }, [mode, val, localIds, query, onChange]);

  const defaultFilter = useCallback((item: EntityItem, q: string) => {
    const lower = q.toLowerCase();
    return searchFields.some(f => item[f].toLowerCase().includes(lower));
  }, [searchFields]);

  const doFilter = filterItem ?? defaultFilter;
  const lastSegment = mode === 'multi'
    ? val.split(',').map(x => x.trim()).filter(Boolean).pop() || ''
    : '';
  const searchQuery = mode === 'multi' ? lastSegment : query;
  const filtered = items.filter(m => !searchQuery || doFilter(m, searchQuery));
  const doSort = sortItems ?? sortCastMembers;
  const sorted = (mode === 'multi' && searchQuery)
    ? [...items].sort((a, b) => {
        const q = searchQuery.toLowerCase();
        const aMatch = a.name.toLowerCase().includes(q) || a.id.toLowerCase().includes(q);
        const bMatch = b.name.toLowerCase().includes(q) || b.id.toLowerCase().includes(q);
        if (aMatch !== bMatch) return aMatch ? -1 : 1;
        const aSel = currentIds.includes(itemKey(a));
        const bSel = currentIds.includes(itemKey(b));
        if (aSel !== bSel) return aSel ? -1 : 1;
        return a.id.localeCompare(b.id, undefined, { numeric: true });
      })
    : doSort(filtered, currentIds);

  const hasExactMatch = searchQuery.length > 0 && items.some(m =>
    m.id.toLowerCase() === searchQuery.toLowerCase() ||
    m.name.toLowerCase() === searchQuery.toLowerCase()
  );
  const syntheticItem: EntityItem = { id: searchQuery, name: searchQuery };
  const dropdownItems = (searchQuery && !hasExactMatch) ? [syntheticItem, ...sorted] : sorted;

  const defaultRenderer = (item: EntityItem, checked: boolean) => (
    <>
      {displayMode === 'id' && <span className="text-zinc-400 shrink-0">{item.id}.</span>}
      <span className="truncate flex-1">{displayMode === 'id' ? (item.name && item.name !== item.id ? item.name : '—') : (item.name || '—')}</span>
      {showSceneCounts && scenes && (
        <span className="text-[10px] text-zinc-400">
          {scenes.filter(s => s.cast.split(',').map(x => x.trim()).includes(item.id)).length} scenes
        </span>
      )}
      {itemBadge && itemBadge(item) && (
        <span className="text-[10px] text-zinc-400">{itemBadge(item)}</span>
      )}
    </>
  );

  if (readOnly) {
    return <span className={className}>{value || '—'}</span>;
  }

  const displayValue = open
    ? (mode === 'multi' ? val : (standalone ? query : (query || localIds.join(', '))))
    : (value || '');

  return (
    <div ref={ref} className={standalone ? '' : `relative ${className || ''}`} onMouseDown={e => e.stopPropagation()}>
      <input
        autoFocus={autoFocusProp}
        value={displayValue}
        onChange={e => {
          if (mode === 'multi') { setVal(e.target.value); } else { setQuery(e.target.value); }
          setHighlightedIndex(-1);
          if (!open) { standalone ? setOpen(true) : handleOpen(); }
        }}
        onFocus={() => { if (!open) { standalone ? setOpen(true) : handleOpen(); } }}
        placeholder={placeholder}
        className={`${DD_INPUT_CLASS(standalone)} ${standalone ? '' : (className || '')}`}
        onKeyDown={e => {
          if (e.key === 'Escape') { setOpen(false); setQuery(''); setHighlightedIndex(-1); }
          if (e.key === 'Tab') { e.preventDefault(); commit(); }
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (dropdownItems.length === 0) return;
            setHighlightedIndex(prev => Math.min(prev + 1, dropdownItems.length - 1));
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (dropdownItems.length === 0) return;
            setHighlightedIndex(prev => Math.max(prev - 1, 0));
          }
          if (e.key === 'Enter') {
            e.preventDefault();
            if (highlightedIndex >= 0 && highlightedIndex < dropdownItems.length) {
              const item = dropdownItems[highlightedIndex];
              toggle(itemKey(item));
              setHighlightedIndex(-1);
            } else {
              commit();
            }
            (document.activeElement as HTMLElement)?.blur();
          }
        }}
      />
      {open && (
        <div
          className={DD_PANEL_CLASS(positioning)}
          style={positioning === 'fixed' ? { position: 'fixed', top: pos.top, left: pos.left, width: pos.width } : {}}
        >
          {dropdownItems.length > 0 ? dropdownItems.map((m, idx) => {
            const checked = currentIds.includes(itemKey(m));
            const highlighted = highlightedIndex === idx;
            const isSynthetic = searchQuery && !hasExactMatch && idx === 0;
            return (
              <button
                key={isSynthetic ? '__new__' : m.id}
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => toggle(itemKey(m))}
                onMouseEnter={mode === 'single' ? () => setHighlightedIndex(idx) : undefined}
                className={`${DD_ITEM_CLASS(checked)} ${highlighted ? (checked ? 'bg-blue-100 text-blue-700' : 'bg-zinc-100 text-zinc-900') : ''}`}
              >
                {isSynthetic ? (
                  <span className="truncate flex-1 italic text-zinc-500">Add &quot;{m.name}&quot;</span>
                ) : (
                  renderItem ? renderItem(m, checked) : defaultRenderer(m, checked)
                )}
              </button>
            );
          }) : (
            <div className="px-2 py-1 text-xs text-zinc-400 text-center">No matches</div>
          )}
        </div>
      )}
    </div>
  );
};
