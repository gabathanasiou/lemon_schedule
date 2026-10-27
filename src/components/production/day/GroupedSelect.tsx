import React, { useMemo } from 'react';
import { PickerField, useKitTheme, type PickerItem, type SearchMenuGroup } from '@gabriel/ui-kit';

/**
 * Light/dark grouped selection picker (locations by type, crew by department,
 * a position's element categories) — a thin adapter over the shared
 * `PickerField` (roadmap 322). The kit owns the panel, the grouped catalogue,
 * the search box that matches both the row label and its category, selection,
 * positioning, flip, touch dismissal and coarse sizing.
 *
 * Value fields commit on close (one change, one undo entry); single selects
 * commit on pick. There is no second picker implementation.
 */
export interface GroupedSelectItem {
  id: string;
  name: string;
  group?: string;
  hint?: string;
  /** Action row (e.g. "Add new location…") — renders in emerald. */
  accent?: boolean;
  /** Whole-department tag row (roadmap 308) — amber background. */
  tag?: boolean;
}

export interface GroupedSelectProps {
  items: GroupedSelectItem[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  /** Single-select collapses the list to one id. */
  mode?: 'single' | 'multi';
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  /** Force a trigger/menu theme; omitted = the ambient kit theme (a dark modal
   *  stays dark, the light Day Manager stays light). */
  theme?: 'light' | 'dark';
  /** Grouped catalogue behaviour: `accordion` (default — headers expand one
   *  section at a time and are never selectable) or `open` (every section
   *  expanded; used where the "All <department>" rows must be visible and
   *  pickable, e.g. Element links). */
  browse?: 'open' | 'accordion';
}

export const GroupedSelect: React.FC<GroupedSelectProps> = ({
  items,
  selectedIds,
  onChange,
  mode = 'multi',
  placeholder = 'Select…',
  className = '',
  disabled,
  theme,
  browse = 'accordion',
}) => {
  const ambient = useKitTheme();
  const dark = (theme ?? ambient?.mode ?? 'light') === 'dark';

  const hintById = useMemo(() => new Map(items.map(i => [i.id, i.hint])), [items]);
  const accentById = useMemo(() => new Set(items.filter(i => i.accent).map(i => i.id)), [items]);

  const pickerItems = useMemo<PickerItem[]>(() => items.map(item => ({
    id: item.id,
    label: item.name,
    group: item.group,
    rowClassName: item.tag
      ? (dark ? 'bg-amber-500/10 hover:bg-amber-500/15' : 'bg-amber-50 hover:bg-amber-100')
      : undefined,
  })), [items, dark]);

  /* Group headers follow the item order; the kit searches the label AND the
     group name, so typing a type keeps its whole section. */
  const groups = useMemo<SearchMenuGroup[]>(() => {
    const seen = new Map<string, number>();
    for (const item of items) {
      if (!item.group) continue;
      seen.set(item.group, (seen.get(item.group) ?? 0) + 1);
    }
    return [...seen].map(([key, count]) => ({ key, label: key, count }));
  }, [items]);

  return (
    <PickerField
      appearance="chip"
      mode={mode === 'single' ? 'single' : 'multiple'}
      values={selectedIds}
      onChange={onChange}
      items={pickerItems}
      groups={groups}
      browse={browse}
      theme={theme}
      placeholder={placeholder}
      className={className}
      disabled={disabled}
      renderItem={item => {
        const accent = accentById.has(item.id);
        const hint = hintById.get(item.id);
        return (
          <>
            <span className={`flex-1 truncate ${accent ? 'text-[color:var(--ui-confirm-hover)]' : ''}`}>{item.label}</span>
            {hint && <span className="shrink-0 text-[10px] text-[color:var(--ui-text-faint)]">{hint}</span>}
          </>
        );
      }}
    />
  );
};

export default GroupedSelect;
