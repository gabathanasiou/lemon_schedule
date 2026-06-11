import React, { useState, useRef, useCallback, useEffect, useLayoutEffect } from 'react';
import { Scene } from '../types';
import { useProject } from '../store';
import { useDropdown, useOpenHandler, sortCastMembers } from '../lib/dropdown';
import { useSmartPosition, useFixedPosition } from '../lib/useSmartPosition';

export const DD_ITEM_CLASS = (active: boolean) =>
  `w-full text-left px-2 py-1 text-xs rounded cursor-pointer transition-colors flex items-center gap-2 ${active ? 'bg-blue-50 text-blue-700 hover:bg-blue-100' : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'}`;

export const DD_PANEL_CLASS = (positioning: string) =>
  positioning === 'fixed'
    ? 'z-[9999] bg-white border border-zinc-200 rounded-md shadow-lg p-1 max-h-48 overflow-y-scroll min-w-[200px]'
    : 'absolute top-full left-0 z-[100] bg-white border border-zinc-200 rounded-lg shadow-lg p-1 max-h-56 overflow-y-scroll mt-1 min-w-[180px]';

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
  mode?: 'single' | 'multi' | 'select';
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

/**
 * EntityDropdown — shared multi/single-select dropdown for cast, props, sets, shoot days, etc.
 *
 * ## Modes (prop: `mode`)
 *
 * ### `multi` (default) — comma-separated input, click-to-toggle
 * The input IS the comma-separated value. Users type IDs/names separated by commas.
 * The last comma-separated segment acts as the search query.
 * Clicking an item toggles it in/out of the comma-separated list.
 * Commit normalises the list (trims, dedupes, joins with `', '`).
 *
 * **Where to use:** cast (everywhere), non-set breakdown categories (props, wardrobe,
 * stunts, etc.), shoot day selections, location filters, any multi-value field.
 *
 * **Used in:**
 * - SceneSheet cast field
 * - BreakdownTab cast editors
 * - BreakdownTab generic element editors (following the fix to use multi)
 * - SortableRow cast fields
 * - PrintDialog shoot day picker
 * - CalendarTab hold/travel cast picker
 * - Various dialog cast pickers (RuleFormFields, DoodDialog, etc.)
 *
 * ### `single` — search-then-select, commas allowed in value
 * The input is a free-text query that filters items. Clicking an item immediately
 * commits `onChange(id)` and closes the dropdown. **Commas in the value are not
 * treated as delimiters** — the entire value is kept as one unit. On Enter/Tab/blur
 * without clicking, the query text is committed as-is.
 *
 * **Where to use:** set fields (scene set names can contain commas like
 * "KITCHEN, FIRST FLOOR"), any single-value field where the value may contain
 * special characters.
 *
 * **Used in:**
 * - SceneSheet set field
 * - BreakdownTab SetEditor
 * - SortableRow set fields (dynamic ENTITY_FIELDS and explicit set column)
 *
 * ### `select` — single selection, immediate commit
 * Like multi but single-value. Entire `val` is the search query (not the last segment).
 * Clicking an item immediately commits `onChange(id)` and closes. On commit,
 * the value is normalised (split on commas, trimmed). Commas ARE treated as
 * delimiters in `select` mode.
 *
 * **Where to use:** legacy single-select fields that don't accept commas.
 * **Prefer `single` mode for new code** — it handles commas safely.
 *
 * **Used in:** SortableRow dynamic ENTITY_FIELDS for non-set fields (fallback
 * when text editing is disabled).
 *
 * ## Display Modes (prop: `displayMode`)
 *
 * - `'id'` — item keys are matched by `itemKey()` returning `m.id`. Used for cast
 *   where cast members have numeric IDs.
 * - `'name'` (default) — item keys are matched by `itemKey()` returning `m.name`.
 *   Used for props, wardrobe, sets, and all non-cast categories.
 *
 * ## Items (prop: `items`)
 *
 * When `items` is omitted, the dropdown uses `state.present.castMembers` from the
 * Zustand store. Pass a custom `EntityItem[]` for non-cast categories (sets,
 * props, wardrobe, etc.).
 *
 * ## Positioning (prop: `positioning`)
 *
 * - `'relative'` (default) — panel positioned below the input via absolute + top-full.
 *   Use for inline form fields, spreadsheet cells.
 * - `'fixed'` — panel positioned with fixed coordinates (avoids overflow clipping).
 *   Use in compact layouts where the parent has overflow:hidden.
 *
 * ## Editor vs Form Usage
 *
 * **Spreadsheet cell editors** (defaultOpen + autoFocus):
 * ```tsx
 * <EntityDropdown
 *   value={cell?.value || ''}
 *   onChange={val => { committedRef.current = true; onChange({ value: val }); exitEditMode(); }}
 *   defaultOpen autoFocus
 * />
 * ```
 * The `committedRef` pattern prevents double-commit from `toggle()` firing both
 * `onChange` and `handleClose()`.
 *
 * **Form fields** (interactive, no defaultOpen):
 * ```tsx
 * <EntityDropdown
 *   value={val('props')}
 *   onChange={v => update('props', v)}
 *   items={breakdownItems.props}
 *   mode="multi"
 * />
 * ```
 *
 * ## Synthetic Items ("Add" new items)
 * When the search query doesn't match any existing item by id or name, a
 * synthetic "Add" item appears at the top of the dropdown. Clicking it calls
 * `toggle(itemKey(m))` with the search query as the item key. The parent's
 * `onChange` receives the raw text value and is responsible for dispatching
 * `ADD_ELEMENT` if needed.
 */
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
    if (mode === 'multi' || mode === 'select') setVal(value);
    if (mode === 'single') setLocalIds(value.trim() ? [value.trim()] : []);
  }, [value, mode]);
  const [query, setQuery] = useState('');
  const [localIds, setLocalIds] = useState<string[]>(() => {
    if (mode === 'single') return value.trim() ? [value.trim()] : [];
    return (value || '').split(',').map(x => x.trim()).filter(Boolean);
  });
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) { committedRef.current = false; setHighlightedIndex(-1); }
  }, [open]);

  useLayoutEffect(() => {
    if (highlightedIndex < 0 || !panelRef.current) return;
    const btn = panelRef.current.querySelector(`[data-ei="${highlightedIndex}"]`) as HTMLElement;
    if (btn) btn.scrollIntoView({ block: 'nearest' });
  }, [highlightedIndex]);

  const itemKey = useCallback((m: EntityItem) => displayMode === 'name' ? m.name : (m.id || m.name), [displayMode]);

  const currentIds = mode === 'multi' || mode === 'select'
    ? val.split(',').map(x => x.trim()).filter(Boolean)
    : localIds;

  const handleClose = useCallback(() => {
    if (committedRef.current) return;
    committedRef.current = true;
    if (mode === 'multi' || mode === 'select') {
      onChange(val.split(',').map(x => x.trim()).filter(Boolean).join(', '));
    } else {
      onChange(query || (localIds.length > 0 ? localIds[0] : ''));
    }
    setOpen(false);
    setQuery('');
  }, [mode, val, localIds, query, onChange]);

  useDropdown(open, ref, handleClose);

  useFixedPosition(ref, positioning === 'fixed' && open, setPos);

  const toggle = useCallback((id: string) => {
    if (mode === 'single') {
      setLocalIds([id]);
      setQuery('');
      committedRef.current = true;
      onChange(id);
      setOpen(false);
      return;
    }
    if (mode === 'select') {
      setVal(id);
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
    if (mode === 'multi' || mode === 'select') {
      onChange(val.split(',').map(x => x.trim()).filter(Boolean).join(', '));
    } else {
      onChange(query || (localIds.length > 0 ? localIds[0] : ''));
    }
    setOpen(false);
    setQuery('');
  }, [mode, val, localIds, query, onChange]);

  const defaultFilter = useCallback((item: EntityItem, q: string) => {
    const lower = q.toLowerCase();
    return searchFields.some(f => item[f].toLowerCase().includes(lower));
  }, [searchFields]);

  const doFilter = filterItem ?? defaultFilter;
  const lastSegment = mode === 'select'
    ? val.trim()
    : mode === 'multi'
    ? val.split(',').map(x => x.trim()).filter(Boolean).pop() || ''
    : '';
  const searchQuery = mode === 'multi' || mode === 'select' ? lastSegment : query;
  const filtered = items.filter(m => !searchQuery || doFilter(m, searchQuery));
  const doSort = sortItems ?? sortCastMembers;
  const sorted = ((mode === 'multi' || mode === 'select') && searchQuery)
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
    ? (mode === 'multi' || mode === 'select' ? val : (standalone ? query : (query || localIds.join(', '))))
    : (value || '');

  return (
    <div ref={ref} className={standalone ? '' : `relative ${className || ''}`} onMouseDown={e => e.stopPropagation()}>
      <input
        autoFocus={autoFocusProp}
        value={displayValue}
        onChange={e => {
          if (mode === 'multi' || mode === 'select') { setVal(e.target.value); } else { setQuery(e.target.value); }
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
          }
        }}
      />
      {open && (
        <div
          ref={panelRef}
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
                data-ei={idx}
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
