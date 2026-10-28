import React, { useMemo } from 'react';
import { PickerField, type PickerItem, type SearchMenuGroup } from '@gabriel/ui-kit';

/**
 * Light/dark grouped selection picker (locations by type, crew by department,
 * a position's element categories) — a thin adapter over the shared
 * `PickerField` (roadmap 322). The kit owns the panel, the grouped catalogue,
 * the search box that matches both the row label and its category, selection,
 * positioning, flip, touch dismissal and coarse sizing.
 *
 * Sections are searchable accordions: a header expands/collapses its group and
 * never selects anything, while its TICK is the group select-all. Value fields
 * commit on close (one change, one undo entry); single selects commit on pick.
 * There is no second picker implementation.
 */
export interface GroupedSelectItem {
  id: string;
  name: string;
  group?: string;
  hint?: string;
  /** Action row (e.g. "Add new location…") — renders in emerald. */
  accent?: boolean;
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
  /** Whole-group value: the header tick stores this token instead of selecting
   *  every member (crew "whole department" tags cover future joiners). */
  groupToken?: (group: string) => string;
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
  groupToken,
}) => {
  const hintById = useMemo(() => new Map(items.map(i => [i.id, i.hint])), [items]);
  const accentById = useMemo(() => new Set(items.filter(i => i.accent).map(i => i.id)), [items]);

  const pickerItems = useMemo<PickerItem[]>(() => {
    const rows: PickerItem[] = items.map(item => ({
      id: item.id,
      label: item.name,
      group: item.group,
      /* The subtitle (crew role, location address) is part of the search index —
         typing "1st AC" finds the person holding it. */
      detail: item.hint,
    }));
    if (!groupToken) return rows;
    /* One hidden value per group: the header tick stores this tag (never a row,
       never searchable) so a whole department covers future joiners. */
    const tags: PickerItem[] = [];
    const seen = new Set<string>();
    for (const item of items) {
      if (!item.group || seen.has(item.group)) continue;
      seen.add(item.group);
      tags.push({ id: groupToken(item.group), label: `All ${item.group}`, group: item.group, hidden: true });
    }
    return [...rows, ...tags];
  }, [items, groupToken]);

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
      appearance={mode === 'single' ? 'chip' : 'morph'}
      mode={mode === 'single' ? 'single' : 'multiple'}
      display={mode === 'single' ? 'names' : 'count'}
      values={selectedIds}
      onChange={onChange}
      items={pickerItems}
      groups={groups}
      browse="accordion"
      groupToken={groupToken}
      theme={theme}
      /* Bare check glyph instead of the checkbox box — the same tick-list look
         as every EntityDropdown panel. */
      indicator="check"
      collapsedWidth={160}
      expandedWidth={300}
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
