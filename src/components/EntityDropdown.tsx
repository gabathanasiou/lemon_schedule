/**
 * ## Entity Reference Rules (cast vs non-cast)
 *
 * Cast members are referenced by **numeric IDs** (e.g. `"1, 2, 3"`).
 * All other breakdown elements (props, wardrobe, vehicles, etc.) are referenced by **names** (e.g. `"Prop Gun, Mug"`).
 *
 * ### How to use this component correctly:
 *
 * | Rule | Cast | Non-cast |
 * |---|---|---|
 * | `displayMode` | `"id"` | `"id"` (default) or `"name"` |
 * | `value` | comma-separated IDs: `"1, 2, 3"` | comma-separated names: `"Prop Gun, Mug"` |
 * | `onChange` output | comma-separated IDs | comma-separated names |
 * | Item matching key | `e.id` | `e.id \|\| e.name` |
 * | Existence check | compare by `e.id` | compare by `e.name \|\| e.id` |
 *
 * ### Calling code MUST:
 * - Pass `displayMode="id"` when rendering cast fields (stores IDs in `scene.cast`)
 * - Use `e.id` for cast deduplication/existence checks in `SortableRow.updateScene`
 * - Use `e.name` for non-cast deduplication/existence checks everywhere
 * - In `store.tsx:ADD_ELEMENT`: cast uses `element.id`, non-cast uses `element.name`
 *
 * **Never mix ID-based matching with name-based matching for the same category.**
 */

import React, { useState, useRef, useCallback, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Scene } from '../types';
import { useProject } from '../store';
import { useDropdown, sortCastMembers } from '../lib/dropdown';
import { useSmartPosition, useFixedPosition } from '../lib/useSmartPosition';
import { IS_COARSE } from '../lib/device';
import { useKeyboardMode } from '../lib/persist';

const DD_ITEM_BASE = IS_COARSE ? 'px-3 py-2 text-sm' : 'px-2 py-1 text-xs';

export const DD_ITEM_CLASS = (active: boolean) =>
  `w-full text-left ${DD_ITEM_BASE} rounded cursor-pointer transition-colors active:transition-none flex items-center gap-2 ${active ? 'bg-blue-50 text-blue-700 hover:bg-blue-100 active:bg-blue-200' : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 active:bg-zinc-200 active:text-zinc-900'}`;

const DD_INPUT_TOUCH = IS_COARSE ? 'px-4 py-3 text-base' : 'px-3 py-2 text-sm';

export const DD_PANEL_CLASS = (positioning: string) =>
  positioning === 'fixed'
    ? 'z-[9999] bg-white border border-zinc-200 rounded-md shadow-lg p-1 min-w-[200px] flex flex-col'
    : 'absolute top-full left-0 z-[100] bg-white border border-zinc-200 rounded-lg shadow-lg p-1 mt-1 min-w-[180px] flex flex-col';

export const DD_INPUT_CLASS = (standalone: boolean) =>
  standalone
    ? `w-full border border-zinc-300 rounded-md ${DD_INPUT_TOUCH} focus:outline-none focus:ring-2 focus:ring-zinc-900`
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
  /** Show a "Press Enter to commit" hint at the bottom of the dropdown panel */
  commitHint?: boolean;
  /** Sort items alphabetically by name without pulling selected to top. Scroll to selected item on open. */
  keepAlphabetical?: boolean;
  /** Override the min-width of the dropdown panel (Tailwind class, e.g. "min-w-[250px]") */
  panelMinWidth?: string;
  /** Called when the dropdown is dismissed by clicking outside (handleClose). Not called on Enter/Tab commit. */
  onExit?: () => void;
  /** Called when Tab is pressed — allows passing movement to Glide's onFinishedEditing */
  onTabExit?: () => void;
  /** Auto-convert typed and selected values to uppercase (e.g. set fields like "INT. POLICE STATION") */
  uppercase?: boolean;
  /** Portal target element for the dropdown panel (escapes clipping containers) */
  portalTarget?: HTMLElement | null;
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
  commitHint = false,
  keepAlphabetical = false,
  panelMinWidth,
  onExit,
  onTabExit,
  uppercase = false,
  portalTarget,
}) => {
  const { state } = useProject();
  const storeItems = state.present.castMembers ?? [];
  const items = externalItems ?? storeItems;
  const [open, setOpen] = useState(defaultOpen);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0, maxH: 288 });
  const committedRef = useRef(false);
  const syntheticRef = useRef(false);
  const [keyboardMode] = useKeyboardMode();

  const forceOpen = useCallback(() => {
    committedRef.current = false;
    setOpen(true);
  }, [setOpen]);

  useSmartPosition(ref, positioning === 'relative' && open);

  // --- Multi mode: val = full comma-separated text (like CastEditor) ---
  // --- Single mode: query + localIds (search-then-select pattern) ---
  const [val, setVal] = useState(() => {
    if (mode === 'multi' && value.trim().length > 0 && value.trimEnd().at(-1) !== ',') {
      return value.trimEnd() + ', ';
    }
    return value;
  });
  useEffect(() => {
    if (syntheticRef.current) { syntheticRef.current = false; return; }
    if (mode === 'multi' || mode === 'select') {
      let v = value;
      if (mode === 'multi' && v.trim().length > 0 && v.trimEnd().at(-1) !== ',') {
        v = v.trimEnd() + ', ';
      }
      setVal(v);
    }
    if (mode === 'single') setLocalIds(value.trim() ? [uppercase ? value.trim().toUpperCase() : value.trim()] : []);
  }, [value, mode]);
  const [query, setQuery] = useState('');
  const [localIds, setLocalIds] = useState<string[]>(() => {
    if (mode === 'single') return value.trim() ? [uppercase ? value.trim().toUpperCase() : value.trim()] : [];
    return (value || '').split(',').map(x => x.trim()).filter(Boolean);
  });
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    committedRef.current = false;
    if (open) setHighlightedIndex(-1);
  }, [open]);

  useLayoutEffect(() => {
    if (highlightedIndex < 0 || !panelRef.current) return;
    const btn = panelRef.current.querySelector(`[data-ei="${highlightedIndex}"]`) as HTMLElement;
    if (btn) btn.scrollIntoView({ block: 'nearest' });
  }, [highlightedIndex]);

  useLayoutEffect(() => {
    if (!open || !keepAlphabetical || !panelRef.current) return;
    const checked = panelRef.current.querySelector('[data-checked="true"]') as HTMLElement;
    if (checked) checked.scrollIntoView({ block: 'nearest' });
  }, [open, keepAlphabetical]);

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

  const itemKey = useCallback((m: EntityItem) => displayMode === 'name' ? m.name : (m.id || m.name), [displayMode]);

  const currentIds = mode === 'multi' || mode === 'select'
    ? val.split(',').map(x => x.trim()).filter(Boolean)
    : localIds;

  const sortAndJoin = useCallback((raw: string) => {
    const ids = raw.split(',').map(x => x.trim()).filter(Boolean);
    if (displayMode === 'id' && mode === 'multi') {
      ids.sort((a, b) => {
        const na = parseInt(a, 10);
        const nb = parseInt(b, 10);
        if (!isNaN(na) && !isNaN(nb)) return na - nb;
        if (!isNaN(na)) return -1;
        if (!isNaN(nb)) return 1;
        return a.localeCompare(b, undefined, { numeric: true });
      });
    }
    return ids.join(', ');
  }, [displayMode, mode]);

  const handleClose = useCallback(() => {
    if (committedRef.current) return;
    committedRef.current = true;
    const newVal = mode === 'multi' || mode === 'select'
      ? sortAndJoin(val)
      : (query || (localIds.length > 0 ? localIds[0] : ''));
    if (newVal !== value) onChange(newVal);
    setOpen(false);
    setQuery('');
    onExit?.();
  }, [mode, val, localIds, query, onChange, sortAndJoin, onExit, value]);

  useDropdown(open, ref, handleClose, panelRef);

  useFixedPosition(ref, positioning === 'fixed' && open, setPos);

  const toggle = useCallback((id: string) => {
    if (mode === 'single') {
      const sel = uppercase ? id.toUpperCase() : id;
      setLocalIds([sel]);
      setQuery('');
      committedRef.current = true;
      onChange(sel);
      setOpen(false);
      onExit?.();
      return;
    }
    if (mode === 'select') {
      setVal(id);
      committedRef.current = true;
      onChange(id);
      setOpen(false);
      onExit?.();
      return;
    }
    setVal(prev => {
      const ids = prev.split(',').map(x => x.trim()).filter(Boolean);
      const idx = ids.indexOf(id);
      if (idx >= 0) ids.splice(idx, 1);
      else ids.push(id);
      return ids.join(', ') + (ids.length > 0 ? ', ' : '');
    });
  }, [mode, onChange, onExit, uppercase]);

  const commit = useCallback(() => {
    if (committedRef.current) return;
    committedRef.current = true;
    const newVal = mode === 'multi' || mode === 'select'
      ? sortAndJoin(val)
      : (query || (localIds.length > 0 ? localIds[0] : ''));
    if (newVal !== value) onChange(newVal);
    onExit?.();
    setOpen(false);
    setQuery('');
  }, [mode, val, localIds, query, onChange, sortAndJoin, value, onExit]);

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
  const hasExactMatch = searchQuery.length > 0 && items.some(m =>
    m.id.toLowerCase() === searchQuery.toLowerCase() ||
    m.name.toLowerCase() === searchQuery.toLowerCase()
  );
  const effectiveQuery = (mode === 'multi' && hasExactMatch) ? '' : searchQuery;
  const filtered = items.filter(m => !effectiveQuery || doFilter(m, effectiveQuery));
  const doSort = sortItems ?? ((items: EntityItem[], ids: string[]) => {
    if (keepAlphabetical) return [...items].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    return sortCastMembers(items, ids, displayMode as 'id' | 'name');
  });
  const sorted = ((mode === 'multi' || mode === 'select') && effectiveQuery)
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

  const syntheticItem: EntityItem = { id: searchQuery, name: searchQuery };
  const dropdownItems = (effectiveQuery && !hasExactMatch) ? [syntheticItem, ...sorted] : sorted;

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

  if (readOnly && !open) {
    return <span className={className} onAuxClick={forceOpen}>{value || '—'}</span>;
  }

  const displayValue = open
    ? (mode === 'multi' || mode === 'select' ? val : (standalone ? query : (query || localIds.join(', '))))
    : (value || '');

  return (
    <div ref={ref} className={standalone ? '' : `relative ${className || ''}`} onMouseDown={e => e.stopPropagation()} onContextMenu={e => { e.preventDefault(); e.stopPropagation(); }} onAuxClick={forceOpen}>
      <input
        autoFocus={autoFocusProp}
        readOnly={IS_COARSE && keyboardMode === 'off'}
        value={displayValue}
        onChange={e => {
          const raw = uppercase ? e.target.value.toUpperCase() : e.target.value;
          if (mode === 'multi' || mode === 'select') { setVal(raw); } else { setQuery(raw); if (mode === 'single' && !raw.trim()) setLocalIds([]); }
          setHighlightedIndex(-1);
          forceOpen();
        }}
        onFocus={forceOpen}
        onClick={forceOpen}
        onBlur={() => commit()}
        placeholder={placeholder}
        className={`${DD_INPUT_CLASS(standalone)} ${standalone ? '' : (className || '')}`}
        onKeyDown={e => {
          if (e.key === 'Escape') { committedRef.current = true; setOpen(false); setQuery(''); setHighlightedIndex(-1); }
          if (e.key === 'Tab') {
            e.preventDefault();
            let forceCommit = false;
            let selectedValue: string | null = null;
            if (highlightedIndex >= 0 && highlightedIndex < dropdownItems.length) {
              const item = dropdownItems[highlightedIndex];
              const isSynth = effectiveQuery && !hasExactMatch && highlightedIndex === 0;
              const key = itemKey(item);
              if (isSynth) {
                if (mode === 'single') {
                  selectedValue = uppercase ? key.toUpperCase() : key;
                } else {
                  const segments = val.split(',').map(x => x.trim()).filter(Boolean);
                  const committedIds = segments.slice(0, -1);
                  if (!committedIds.includes(key)) committedIds.push(key);
                  selectedValue = sortAndJoin(committedIds.join(', '));
                  forceCommit = true;
                }
              } else if (mode === 'multi') {
                const trimmed = val.trim();
                const hasQuery = trimmed.length > 0 && trimmed[trimmed.length - 1] !== ',';
                if (hasQuery) {
                  const segments = val.split(',').map(x => x.trim()).filter(Boolean);
                  const committedIds = segments.slice(0, -1);
                  const idx = committedIds.indexOf(key);
                  if (idx >= 0) committedIds.splice(idx, 1);
                  else committedIds.push(key);
                  selectedValue = committedIds.length > 0 ? sortAndJoin(committedIds.join(', ')) : key;
                } else {
                  const ids = val.split(',').map(x => x.trim()).filter(Boolean);
                  const idx = ids.indexOf(key);
                  if (idx >= 0) ids.splice(idx, 1);
                  else ids.push(key);
                  selectedValue = sortAndJoin(ids.join(', '));
                }
              } else {
                selectedValue = uppercase ? key.toUpperCase() : key;
              }
              setHighlightedIndex(-1);
            }
            const newVal = selectedValue !== null
              ? selectedValue
              : mode === 'multi' || mode === 'select'
                ? sortAndJoin(val)
                : (query || (localIds.length > 0 ? localIds[0] : ''));
            if (newVal !== value || forceCommit) { committedRef.current = true; onChange(newVal); }
            (onTabExit || onExit)?.();
            setOpen(false);
            setQuery('');
          }
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
            e.stopPropagation();
            if (highlightedIndex >= 0 && highlightedIndex < dropdownItems.length) {
              const item = dropdownItems[highlightedIndex];
              const isSynth = effectiveQuery && !hasExactMatch && highlightedIndex === 0;
              const key = itemKey(item);
              if (isSynth) {
                if (mode === 'single') {
                  const sel = uppercase ? key.toUpperCase() : key;
                  setVal(sel);
                  setTimeout(() => {
                    if (sel !== value) { syntheticRef.current = true; onChange(sel); }
                    setOpen(false);
                    onExit?.();
                  }, 0);
                } else {
                  const segments = val.split(',').map(x => x.trim()).filter(Boolean);
                  const committedIds = segments.slice(0, -1);
                  if (!committedIds.includes(key)) committedIds.push(key);
                  const joined = sortAndJoin(committedIds.join(', '));
                  setVal(joined + ', ');
                  syntheticRef.current = true;
                  onChange(joined);
                }
              } else if (mode === 'multi') {
                const trimmed = val.trim();
                const hasQuery = trimmed.length > 0 && trimmed[trimmed.length - 1] !== ',';
                if (hasQuery) {
                  const segments = val.split(',').map(x => x.trim()).filter(Boolean);
                  const committedIds = segments.slice(0, -1);
                  const idx = committedIds.indexOf(key);
                  if (idx >= 0) committedIds.splice(idx, 1);
                  else committedIds.push(key);
                  const joined = committedIds.length > 0 ? sortAndJoin(committedIds.join(', ')) : key;
                  setVal(joined + ', ');
                  if (joined !== value) onChange(joined);
                } else {
                  toggle(key);
                }
              } else {
                toggle(key);
              }
              setHighlightedIndex(-1);
            } else {
              commit();
            }
          }
        }}
      />
      {open && (() => {
        const panel = (
        <div
          ref={panelRef}
          className={`click-outside-ignore ${DD_PANEL_CLASS(positioning)} ${panelMinWidth || ''}`}
          style={positioning === 'fixed' ? { position: 'fixed', top: pos.top, left: pos.left, width: pos.width } : {}}
        >
          <div ref={scrollRef} className="overflow-y-auto max-h-72" style={positioning === 'fixed' ? { maxHeight: pos.maxH - 16 } : undefined}>
          {dropdownItems.length > 0 ? dropdownItems.map((m, idx) => {
            const checked = currentIds.includes(itemKey(m));
            const highlighted = highlightedIndex === idx;
            const isSynthetic = searchQuery && !hasExactMatch && idx === 0;
            return (
              <>
              <button
                key={isSynthetic ? '__new__' : m.id}
                data-ei={idx}
                data-checked={checked ? 'true' : undefined}
                type="button"
                onMouseDown={e => e.preventDefault()}
                onTouchStart={() => {}}
                onPointerDown={e => { if (e.pointerType === 'pen') { const btn = e.currentTarget; btn.classList.add('pen-pulse'); setTimeout(() => btn.classList.remove('pen-pulse'), 350); } }}
                onClick={() => {
                  if (isSynthetic) {
                    const key = itemKey(m);
                    if (mode === 'single') {
                      const sel = uppercase ? key.toUpperCase() : key;
                      setVal(sel);
                      setTimeout(() => {
                        if (sel !== value) { syntheticRef.current = true; onChange(sel); }
                        setOpen(false);
                        onExit?.();
                      }, 0);
                    } else {
                      const segments = val.split(',').map(x => x.trim()).filter(Boolean);
                      const committedIds = segments.slice(0, -1);
                      if (!committedIds.includes(key)) committedIds.push(key);
                      const joined = sortAndJoin(committedIds.join(', '));
                      setVal(joined + ', ');
                      syntheticRef.current = true;
                      onChange(joined);
                    }
                  } else if (mode === 'multi') {
                    const trimmed = val.trim();
                    const hasQuery = trimmed.length > 0 && trimmed[trimmed.length - 1] !== ',';
                    if (hasQuery) {
                      const segments = val.split(',').map(x => x.trim()).filter(Boolean);
                      const committedIds = segments.slice(0, -1);
                      const key = itemKey(m);
                      const idx = committedIds.indexOf(key);
                      if (idx >= 0) committedIds.splice(idx, 1);
                      else committedIds.push(key);
                      const joined = committedIds.length > 0 ? sortAndJoin(committedIds.join(', ')) : key;
                      setVal(joined + ', ');
                      if (joined !== value) onChange(joined);
                    } else {
                      toggle(itemKey(m));
                    }
                  } else {
                    toggle(itemKey(m));
                  }
                }}
                onMouseEnter={mode === 'single' ? () => setHighlightedIndex(idx) : undefined}
className={isSynthetic
  ? `w-full text-left ${DD_ITEM_BASE} rounded cursor-pointer transition-colors active:transition-none flex items-center gap-2 text-zinc-400 ${highlighted ? 'bg-emerald-50 text-emerald-700' : 'hover:bg-emerald-50 hover:text-emerald-700'} active:bg-emerald-200 active:text-emerald-700`
  : `${DD_ITEM_CLASS(checked)} ${highlighted ? (checked ? 'bg-blue-100 text-blue-700' : 'bg-zinc-100 text-zinc-900') : ''}`
}
              >
                {isSynthetic ? (
                  <span className="truncate flex-1 italic">Add &quot;{m.name}&quot;</span>
                ) : (
                  renderItem ? renderItem(m, checked) : defaultRenderer(m, checked)
                )}
              </button>
              {isSynthetic && (
                <hr className="border-t border-zinc-200 my-1 mx-1" />
              )}
              </>
              );
          }) : (
            <div className="px-2 py-1 text-xs text-zinc-400 text-center">No matches</div>
          )}
          </div>
          {commitHint && (
            <button
              onClick={() => commit()}
              onTouchStart={() => {}}
              onPointerDown={e => { if (e.pointerType === 'pen') { const btn = e.currentTarget; btn.classList.add('pen-pulse'); setTimeout(() => btn.classList.remove('pen-pulse'), 350); } }}
              className="px-2 py-1 text-[10px] text-zinc-400 text-center border-t border-zinc-100 shrink-0 hover:bg-zinc-50 active:bg-zinc-100 transition-colors active:transition-none w-full cursor-pointer"
            >
              Press Enter to commit
            </button>
          )}
        </div>
        );
        return portalTarget && positioning === 'fixed'
          ? createPortal(panel, portalTarget)
          : panel;
      })()}
    </div>
  );
};
