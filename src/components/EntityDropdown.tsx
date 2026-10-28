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
 * - Use `e.id` for cast deduplication/existence checks in `SortableRibbon.updateScene`
 * - Use `e.name` for non-cast deduplication/existence checks everywhere
 * - In `store.tsx:ADD_ELEMENT`: cast uses `element.id`, non-cast uses `element.name`
 *
 * **Never mix ID-based matching with name-based matching for the same category.**
 *
 * ## Architecture (roadmap 322)
 *
 * This module is now a **thin adapter**: the kit's `PickerField` owns the
 * field, the searchable panel, commit-on-close and the key↔label model; this
 * file only maps the app's storage contract (a comma-separated string, cast by
 * Board ID, non-cast by name) onto it. There is no second picker
 * implementation — `inline`/`wrap` are the cell editors, `chip` the modal
 * trigger.
 */

import React, { useCallback, useMemo } from 'react';
import { PickerField, type PickerItem, type SearchMenuGroup } from '@gabriel/ui-kit';
import { Scene } from '../types';
import { boardLabel } from '../lib/elements';
import { IS_COARSE, useHardwareKeyboard } from '../lib/device';
import { useKeyboardMode, useBoardIdDisplay } from '../lib/persist';

export interface EntityItem {
  id: string;
  name: string;
  /** Optional group label — the panel renders a header when the group changes
   *  (crew by department, locations by type, categories by group). */
  group?: string;
  /** Render as a highlighted TAG (whole-department link rows). */
  accent?: boolean;
  /** Element categories only: the per-category Board ID (roadmap 305). The
   *  default renderer prefixes "N. " in name mode and the closed chip reads
   *  "N. NAME"; it is display-only — commits stay name/id valued. */
  boardId?: string;
  /** Extra searchable text (an email in the people picker) shown as the row
   *  subtitle when it matches. */
  detail?: string;
}

export interface EntityDropdownProps {
  value: string;
  onChange: (val: string) => void;
  className?: string;
  readOnly?: boolean;
  placeholder?: string;
  mode?: 'single' | 'multi' | 'select';
  showSceneCounts?: boolean;
  scenes?: Scene[];
  standalone?: boolean;
  /** Custom entity list. Uses store castMembers when omitted. */
  items?: EntityItem[];
  /** Fields to search against. Defaults to ['id', 'name']. Include 'group' to
   *  let a query match the dropdown group header (e.g. typing "set" lists every
   *  location whose type is Set). */
  searchFields?: ('id' | 'name' | 'group')[];
  /** Custom item renderer. Defaults to "id. name". */
  renderItem?: (item: EntityItem, selected: boolean) => React.ReactNode;
  /** Custom sorter. Defaults to catalogue order. */
  sortItems?: (items: EntityItem[], selectedIds: string[]) => EntityItem[];
  /** Called per item in the dropdown - e.g. to show a badge count. */
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
  /** Called when Escape dismisses the dropdown — hosts may exit the enclosing
   *  editor too (Glide cancels the cell edit). Not called on commit/outside. */
  onEscape?: () => void;
  /** Called when Tab is pressed - allows passing movement to Glide's onFinishedEditing */
  onTabExit?: (el?: HTMLElement) => void;
  /** Grouped panels: `open` (default; every group visible) or `accordion`
   *  (folded type/role groups, one open) — the location Report-to cell uses
   *  the same accordion as the department picker. */
  browse?: 'open' | 'accordion';
  /** Auto-convert typed and selected values to uppercase (e.g. set fields like "INT. POLICE STATION") */
  uppercase?: boolean;
  /** Portal target element for the dropdown panel (escapes clipping containers) */
  portalTarget?: HTMLElement | null;
  /** Skip the auto-append of ', ' when opening a cell - used when a key press replaced the cell value */
  skipComma?: boolean;
  /** Spreadsheet cell editors: select the existing value on open so typing
   *  REPLACES it. False when the overlay was opened BY the first typed key
   *  (the key already replaced the value) — selecting then would eat the next
   *  keystroke. Default true. */
  selectAllOnOpen?: boolean;
  style?: React.CSSProperties;
  /** Visual style: 'default' (thin transparent inline editor) or 'chip' (dark
   *  bordered button-like trigger with chevron — for modal rows like the link
   *  manager / color rules; panel behavior identical). */
  variant?: 'default' | 'chip';
  /** Grow the inline editor's width with its content (`field-sizing: content`)
   *  instead of filling the cell — for spreadsheet overlay editors so long
   *  comma-lists (cast, breakdown categories) stay visible while typing. */
  autoGrow?: boolean;
  /** Wrap the closed value onto multiple lines (`whitespace-normal`) instead
   *  of truncating, and stretch the write hitbox to the whole cell: the
   *  wrapper grows with content (`min-h-[1lh]`, no fixed `h-[1lh]`) and the
   *  transparent input becomes `absolute inset-0`. Opt-in per surface — the
   *  stripboard and Glide cells keep the single-line truncated cell; the
   *  Scene Sheet cells and the chip variant (Link Manager linked rows) wrap.
   *  Pass with a stretching container (`flex flex-col` + `flex-1`) for the
   *  full-box hit. */
  wrapValue?: boolean;
  /** Resolve the CLOSED value against `items` the way the chip variant does —
   *  cast reads "1. FISHERMAN" instead of raw ids, non-cast keeps its names.
   *  The committed value stays untouched. For cell displays (SceneSheet)
   *  that want the readable closed form without the chip chrome. */
  resolveClosed?: boolean;
  /** How committed VALUES identify an item. Defaults to `displayMode` (id for
   *  `id`, name for `name`). Use `'id'` for id-valued catalogs that DISPLAY
   *  names (crew people, locations). */
  resolveBy?: 'id' | 'name';
  /** Called for each committed item segment that has NO matching entry in
   *  `items` — lets callers auto-create new elements (cast → the naming modal
   *  flow). Fires on every commit (pick/Enter/Tab/blur) against the final
   *  value, so free-typed "Add new" entries create too. */
  onCreateItem?: (item: string) => void;
  /** Item keys that act as element-link anchors — an Anchor icon is shown next
   *  to them in the panel. Keys use `itemKey` space (cast: `e.id`, others:
   *  `e.name`; names matched case-insensitively). See `anchoredKeysFor`. */
  anchoredKeys?: Set<string>;
}

/** `panelMinWidth` is a Tailwind class ("min-w-[220px]"); the kit takes a
 *  number. Read the px value, ignore anything else. */
function panelWidthOf(panelMinWidth?: string): number | undefined {
  const match = panelMinWidth?.match(/\[(\d+)px\]/);
  return match ? Number(match[1]) : undefined;
}

export const EntityDropdown: React.FC<EntityDropdownProps> = ({
  value,
  onChange: onChangeProp,
  className,
  readOnly,
  placeholder = 'Type...',
  mode = 'multi',
  showSceneCounts = false,
  scenes,
  standalone = false,
  items: externalItems,
  searchFields = ['id', 'name'],
  renderItem,
  sortItems,
  itemBadge,
  defaultOpen = false,
  autoFocus: autoFocusProp = false,
  selectAllOnOpen = true,
  displayMode = 'name',
  keepAlphabetical = false,
  panelMinWidth,
  onExit,
  onTabExit,
  onEscape,
  browse,
  uppercase = false,
  portalTarget,
  skipComma = false,
  style,
  variant = 'default',
  anchoredKeys,
  autoGrow = false,
  wrapValue = false,
  onCreateItem,
  resolveClosed = false,
  resolveBy,
}) => {
  const items = externalItems ?? [];
  const [boardIdDisplay] = useBoardIdDisplay();
  const [keyboardMode] = useKeyboardMode();
  const hwKeyboard = useHardwareKeyboard();
  /* Keyboard OFF on a touch device: the field still opens the picker but the
     text is not editable (no soft keyboard pops over the grid). */
  const typingBlocked = IS_COARSE && !hwKeyboard && keyboardMode === 'off';

  /* The key space: cast (and id-valued catalogs like crew/locations) store
     Board IDs; every other category stores the name. */
  const valueById = (resolveBy ?? (displayMode === 'id' ? 'id' : 'name')) === 'id';
  const keyOf = useCallback(
    (item: EntityItem) => (valueById ? item.id || item.name : item.name),
    [valueById],
  );

  const byKey = useMemo(() => {
    const map = new Map<string, EntityItem>();
    for (const item of items) map.set(keyOf(item), item);
    return map;
  }, [items, keyOf]);

  const pickerItems = useMemo<PickerItem[]>(() => items.map(item => ({
    id: keyOf(item),
    label: item.name || item.id,
    group: item.group,
    detail: item.detail,
    /* The contract's second search field: Board ID / element id. */
    keywords: searchFields.includes('id') ? item.id : undefined,
  })), [items, keyOf, searchFields]);

  const pickerByKey = useMemo(
    () => new Map(pickerItems.map(item => [item.id, item])),
    [pickerItems],
  );

  const groups = useMemo<SearchMenuGroup[]>(() => {
    const seen = new Map<string, number>();
    for (const item of items) {
      if (!item.group) continue;
      seen.set(item.group, (seen.get(item.group) ?? 0) + 1);
    }
    return [...seen].map(([key, count]) => ({ key, label: key, count }));
  }, [items]);

  const selected = useMemo(() => {
    if (mode !== 'multi') return value.trim() ? [value.trim()] : [];
    return value.split(',').map(segment => segment.trim()).filter(Boolean);
  }, [value, mode]);

  /* One commit path: the kit reports keys; the app stores a comma string.
     `uppercase` uppercases a picked single value (set fields) — typed text is
     already uppercased by the kit. */
  const handleChange = useCallback((next: string[]) => {
    const values = uppercase && mode !== 'multi' ? next.map(v => v.toUpperCase()) : next;
    onChangeProp(values.join(', '));
  }, [uppercase, mode, onChangeProp]);

  /* Show the create row on every surface (the old behaviour), even where the
     host only wants the typed value committed (no naming flow). */
  const handleCreate = useCallback((item: string) => { onCreateItem?.(item); }, [onCreateItem]);

  const pickerSort = useMemo(() => {
    if (sortItems) {
      return (list: PickerItem[], ids: string[]) => {
        const original = list.map(item => byKey.get(item.id)).filter(Boolean) as EntityItem[];
        return sortItems(original, ids)
          .map(item => pickerByKey.get(keyOf(item)))
          .filter(Boolean) as PickerItem[];
      };
    }
    if (keepAlphabetical) {
      return (list: PickerItem[]) => [...list].sort((a, b) =>
        a.label.localeCompare(b.label, undefined, { numeric: true }));
    }
    /* The old panel's order: checked rows first (they stay at the top while
       you work the list), then the catalogue's own order. Grouped lists keep
       their sections intact — floating rows across groups would split them. */
    if (groups.length === 0) {
      const byId = displayMode === 'id';
      return (list: PickerItem[], selectedIds: string[]) => {
        const checked = new Set(selectedIds);
        return [...list].sort((a, b) => {
          const as = checked.has(a.id);
          const bs = checked.has(b.id);
          if (as !== bs) return as ? -1 : 1;
          if (byId) {
            const na = parseInt(a.id, 10);
            const nb = parseInt(b.id, 10);
            if (!isNaN(na) && !isNaN(nb)) return na - nb;
          }
          return a.label.localeCompare(b.label, undefined, { numeric: true });
        });
      };
    }
    return undefined;
  }, [sortItems, keepAlphabetical, groups.length, displayMode, byKey, pickerByKey, keyOf]);

  const renderPickerItem = useCallback((pickerItem: PickerItem, checked: boolean) => {
    const item = byKey.get(pickerItem.id);
    if (!item) return pickerItem.label;
    if (renderItem) return renderItem(item, checked);
    const number = displayMode === 'id' ? item.id : item.boardId;
    const sceneCount = showSceneCounts && scenes
      ? scenes.filter(s => s.cast.split(',').map(x => x.trim()).includes(item.id)).length
      : null;
    return (
      <>
        {/* Board ID prefix: id mode already carries the number in `id` (cast);
            name mode reads the element's per-category number (roadmap 305). */}
        {number && <span className="shrink-0 text-[color:var(--ui-text-muted)]">{number}.</span>}
        <span className="flex-1 truncate">
          {displayMode === 'id' ? (item.name && item.name !== item.id ? item.name : '?') : (item.name || '?')}
        </span>
        {sceneCount !== null && (
          <span className="text-[10px] text-[color:var(--ui-text-muted)]">{sceneCount} scenes</span>
        )}
        {itemBadge?.(item) && (
          <span className="text-[10px] text-[color:var(--ui-text-muted)]">{itemBadge(item)}</span>
        )}
      </>
    );
  }, [byKey, renderItem, displayMode, showSceneCounts, scenes, itemBadge]);

  /* Closed face: raw committed values by default (cast reads "1, 2"); the chip
     and `resolveClosed` resolve them to "N. NAME" like the old chip did. */
  const formatDisplay = useCallback((values: string[]) => {
    const resolveNumbers = (variant === 'chip' || resolveClosed) && !readOnly;
    return values.map(segment => {
      if (!resolveNumbers) return segment;
      const item = byKey.get(segment);
      if (!item) return segment;
      if (displayMode === 'id') return `${item.id}. ${item.name && item.name !== item.id ? item.name : '—'}`;
      return boardLabel(boardIdDisplay === 'all' ? item.boardId : undefined, item.name || item.id);
    }).filter(Boolean).join(', ');
  }, [variant, resolveClosed, readOnly, byKey, displayMode, boardIdDisplay]);

  /* Cast edits as Board IDs ("1, 2, ") even though the closed face resolves
     names — the comma list stays the same id-value contract as the cell's raw
     value, and the search still matches names. */
  const formatEditing = useCallback((values: string[]) => {
    const joined = values.join(', ');
    if (mode !== 'multi') return joined;
    return skipComma || !joined ? joined : `${joined}, `;
  }, [mode, skipComma]);

  return (
    <PickerField
      values={selected}
      onChange={handleChange}
      items={pickerItems}
      groups={groups}
      resolveBy={valueById ? 'id' : 'label'}
      mode={mode === 'multi' ? 'multiple' : 'single'}
      appearance={variant === 'chip' ? 'chip' : wrapValue ? 'wrap' : 'inline'}
      display="names"
      formatDisplay={formatDisplay}
      formatEditing={displayMode === 'id' ? formatEditing : undefined}
      renderItem={renderPickerItem}
      anchoredKeys={anchoredKeys}
      placeholder={placeholder}
      readOnly={readOnly}
      inputReadOnly={typingBlocked}
      defaultOpen={defaultOpen || autoFocusProp}
      selectAllOnOpen={selectAllOnOpen}
      uppercase={uppercase}
      theme={variant === 'chip' ? 'dark' : undefined}
      className={className}
      style={style}
      panelWidth={panelWidthOf(panelMinWidth)}
      panelMinWidth={panelWidthOf(panelMinWidth) ?? 200}
      portalTarget={portalTarget}
      autoGrow={autoGrow}
      skipComma={skipComma}
      sortItems={pickerSort}
      onCreateItem={handleCreate}
      createLabel={typed => `Add "${typed}"`}
      onExit={onExit}
      onEscape={onEscape}
      onTabExit={onTabExit}
      browse={browse ?? (groups.length > 0 ? 'open' : undefined)}
      /* Tick list, not a form: a bare check glyph in the fixed slot (the old
         panel's look) instead of a checkbox box. */
      indicator="check"
    />
  );
};
