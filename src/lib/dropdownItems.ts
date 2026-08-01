import { EntityItem } from '../components/EntityDropdown';
import { sortCastMembers } from './dropdown';

export interface DropdownItemBuildOptions {
  mode: 'multi' | 'select' | 'single' | string;
  displayMode: 'id' | 'name' | string;
  keepAlphabetical: boolean;
  searchFields: string[];
  filterItem?: (item: EntityItem, q: string) => boolean;
  sortItems?: (items: EntityItem[], ids: string[]) => EntityItem[];
}

/** Filters + sorts items and synthesizes the "Add new" entry for unmatched queries. */
export function buildDropdownItems(
  items: EntityItem[],
  currentIds: string[],
  itemKey: (m: EntityItem) => string,
  searchQuery: string,
  val: string,
  query: string,
  mode: 'multi' | 'select' | 'single' | string,
  opts: DropdownItemBuildOptions,
): { dropdownItems: EntityItem[]; hasExactMatch: boolean; effectiveQuery: string; syntheticItem: EntityItem | null } {
  const displayMode = opts.displayMode as 'id' | 'name';
  const { keepAlphabetical, searchFields } = opts;
  const filterItem = opts.filterItem ?? ((item: EntityItem, q: string) => {
    const lower = q.toLowerCase();
    return searchFields.some(f => item[f].toLowerCase().includes(lower));
  });
  const lastSegment = mode === 'select'
    ? val.trim()
    : mode === 'multi'
      ? val.split(',').map(x => x.trim()).filter(Boolean).pop() || ''
      : '';
  const effectiveSearchQuery = mode === 'multi' || mode === 'select' ? lastSegment : query;
  const hasExactMatch = effectiveSearchQuery.length > 0 && items.some(m =>
    m.id.toLowerCase() === effectiveSearchQuery.toLowerCase() ||
    m.name.toLowerCase() === effectiveSearchQuery.toLowerCase()
  );
  const effectiveQuery = (mode === 'multi' && hasExactMatch) ? '' : effectiveSearchQuery;

  const filtered = items.filter(m => !effectiveQuery || filterItem(m, effectiveQuery));
  const doSort = opts.sortItems ?? ((list: EntityItem[], ids: string[]) => {
    if (keepAlphabetical) return [...list].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    return sortCastMembers(list, ids, displayMode);
  });
  const sorted = ((mode === 'multi' || mode === 'select') && effectiveQuery)
    ? [...items].sort((a, b) => {
        const q = effectiveSearchQuery.toLowerCase();
        const aMatch = a.name.toLowerCase().includes(q) || a.id.toLowerCase().includes(q);
        const bMatch = b.name.toLowerCase().includes(q) || b.id.toLowerCase().includes(q);
        if (aMatch !== bMatch) return aMatch ? -1 : 1;
        const aSel = currentIds.includes(itemKey(a));
        const bSel = currentIds.includes(itemKey(b));
        if (aSel !== bSel) return aSel ? -1 : 1;
        return a.id.localeCompare(b.id, undefined, { numeric: true });
      })
    : doSort(filtered, currentIds);

  const syntheticItem: EntityItem | null = (effectiveQuery && !hasExactMatch) ? { id: effectiveSearchQuery, name: effectiveSearchQuery } : null;
  const dropdownItems = syntheticItem ? [syntheticItem, ...sorted] : sorted;

  return { dropdownItems, hasExactMatch, effectiveQuery, syntheticItem };
}
