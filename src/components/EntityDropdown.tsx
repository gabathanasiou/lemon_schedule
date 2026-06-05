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
}

export const EntityDropdown: React.FC<EntityDropdownProps> = ({
  value,
  onChange,
  className,
  readOnly,
  placeholder = 'Cast',
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

  useEffect(() => {
    if (open) committedRef.current = false;
  }, [open]);

  const currentIds = mode === 'multi'
    ? val.split(',').map(x => x.trim()).filter(Boolean)
    : localIds;

  const handleClose = useCallback(() => {
    if (committedRef.current) return;
    committedRef.current = true;
    if (mode === 'multi') {
      onChange(val.split(',').map(x => x.trim()).filter(Boolean).join(', '));
    } else {
      onChange(localIds.join(', '));
    }
    setOpen(false);
    setQuery('');
  }, [mode, val, localIds, onChange]);

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
      onChange(localIds.join(', '));
    }
    setOpen(false);
    setQuery('');
  }, [mode, val, localIds, onChange]);

  const defaultFilter = useCallback((item: EntityItem, q: string) => {
    const lower = q.toLowerCase();
    return searchFields.some(f => item[f].toLowerCase().includes(lower));
  }, [searchFields]);

  const doFilter = filterItem ?? defaultFilter;
  const searchQuery = mode === 'multi' ? '' : query;
  const filtered = items.filter(m => !searchQuery || doFilter(m, searchQuery));
  const doSort = sortItems ?? sortCastMembers;
  const sorted = doSort(filtered, currentIds);

  const defaultRenderer = (item: EntityItem, checked: boolean) => (
    <>
      <span className="text-zinc-400 shrink-0">{item.id}.</span>
      <span className="truncate flex-1">{item.name || '—'}</span>
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
          if (!open) { standalone ? setOpen(true) : handleOpen(); }
        }}
        onFocus={() => { if (!open) { standalone ? setOpen(true) : handleOpen(); } }}
        placeholder={placeholder}
        className={`${DD_INPUT_CLASS(standalone)} ${standalone ? '' : (className || '')}`}
        onKeyDown={e => {
          if (e.key === 'Escape') { setOpen(false); setQuery(''); }
          if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); commit(); }
        }}
      />
      {open && (
        <div
          className={DD_PANEL_CLASS(positioning)}
          style={positioning === 'fixed' ? { position: 'fixed', top: pos.top, left: pos.left, width: pos.width } : {}}
        >
          {sorted.length > 0 ? sorted.map(m => {
            const checked = currentIds.includes(m.id);
            return (
              <button
                key={m.id}
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => toggle(m.id)}
                className={DD_ITEM_CLASS(checked)}
              >
                {renderItem ? renderItem(m, checked) : defaultRenderer(m, checked)}
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
