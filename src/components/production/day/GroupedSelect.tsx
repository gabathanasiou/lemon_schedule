import React, { useMemo, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { DropdownMenu, DropdownItem, useKitTheme } from '@gabriel/ui-kit';
import { DD_TOKEN_TRIGGER_CLASS } from '../../../lib/dropdown';

/**
 * Light/dark grouped selection picker (locations by type, crew by department,
 * a position's element categories). The panel is the kit `DropdownMenu`:
 * `DropdownItem group=…` renders the category headers in plain AND searchable
 * modes, and the search box matches both the row label and its category — so
 * typing "set" keeps the whole Set group. The kit owns positioning, flip,
 * touch dismissal and coarse sizing.
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
  /** Force a trigger/menu mode; omitted = the ambient kit theme (a dark modal
   *  stays dark, the light Day Manager stays light). */
  theme?: 'light' | 'dark';
  /** Search input in the panel (default true). Category labels are searchable. */
  searchable?: boolean;
  searchPlaceholder?: string;
}

const TRIGGER_CLS = 'flex w-full items-center justify-between gap-2 rounded border border-[color:var(--ui-border-strong)] bg-[var(--ui-panel-bg)] px-2 py-1 text-xs text-[color:var(--ui-text)] outline-none focus:border-[color:var(--ui-input-focus-border)] focus:ring-1 focus:ring-[color:var(--ui-accent-focus)] disabled:opacity-50';
/* Legacy light trigger for an un-scoped caller (tokens would fall back to the
   :root dark values). An ambient kit scope covers every current usage. */
const TRIGGER_CLS_LEGACY = 'flex w-full items-center justify-between gap-2 rounded border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-800 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-400 disabled:opacity-50';
const TRIGGER_CLS_DARK = `flex w-full items-center justify-between gap-2 ${DD_TOKEN_TRIGGER_CLASS} text-xs`;

export const GroupedSelect: React.FC<GroupedSelectProps> = ({
  items,
  selectedIds,
  onChange,
  mode = 'multi',
  placeholder = 'Select…',
  className = '',
  disabled,
  theme,
  searchable = true,
  searchPlaceholder = 'Search…',
}) => {
  const ambient = useKitTheme();
  const resolvedMode = theme ?? ambient?.mode ?? 'light';
  const dark = resolvedMode === 'dark';
  const tokenized = !!ambient;
  const [open, setOpen] = useState(false);
  const hintById = useMemo(() => new Map(items.map(i => [i.id, i.hint])), [items]);
  const accentById = useMemo(() => new Set(items.filter(i => i.accent).map(i => i.id)), [items]);
  const tagById = useMemo(() => new Set(items.filter(i => i.tag).map(i => i.id)), [items]);

  const label = (() => {
    const picked = items.filter(i => selectedIds.includes(i.id));
    if (picked.length === 0) return '';
    if (mode === 'single') return picked[0]?.name || '';
    return picked.map(p => p.name).join(', ');
  })();

  const toggle = (item: GroupedSelectItem) => {
    const selected = selectedIds.includes(item.id);
    if (mode === 'single') {
      onChange(selected ? [] : [item.id]);
      setOpen(false);
    } else {
      onChange(selected ? selectedIds.filter(id => id !== item.id) : [...selectedIds, item.id]);
    }
  };

  const initialHighlightIndex = (() => {
    if (selectedIds.length === 0) return -1;
    return Math.max(0, items.findIndex(i => selectedIds.includes(i.id)));
  })();

  return (
    <div className={className}>
      <DropdownMenu
        open={open}
        onOpenChange={setOpen}
        theme={theme}
        width="w-72"
        searchable={searchable}
        searchPlaceholder={searchPlaceholder}
        initialHighlightIndex={initialHighlightIndex}
        trigger={
          <button
            type="button"
            disabled={disabled}
            className={dark ? TRIGGER_CLS_DARK : tokenized ? TRIGGER_CLS : TRIGGER_CLS_LEGACY}
          >
            <span className={`truncate ${label ? '' : tokenized || dark ? 'text-[color:var(--ui-text-faint)]' : 'text-zinc-400'}`}>{label || placeholder}</span>
            <ChevronDown className={`w-3 h-3 shrink-0 ${tokenized || dark ? 'text-[color:var(--ui-text-faint)]' : 'text-zinc-400'}`} />
          </button>
        }
      >
        {items.map(item => {
          const selected = selectedIds.includes(item.id);
          const hint = hintById.get(item.id);
          return (
            <DropdownItem
              key={item.id}
              group={item.group}
              selected={selected}
              keepOpen={mode === 'multi'}
              onClick={() => toggle(item)}
              className={tagById.has(item.id) ? (dark ? 'bg-amber-500/10 hover:bg-amber-500/15' : 'bg-amber-50 hover:bg-amber-100') : undefined}
              trailing={
                (hint || selected) ? (
                  <span className="flex items-center gap-1.5">
                    {hint && <span className="text-[10px] text-[color:var(--ui-text-faint)]">{hint}</span>}
                    {selected && <Check className="w-3 h-3" />}
                  </span>
                ) : undefined
              }
            >
              <span className={accentById.has(item.id) ? 'text-[color:var(--ui-confirm-hover)]' : undefined}>{item.name}</span>
            </DropdownItem>
          );
        })}
      </DropdownMenu>
    </div>
  );
};

export default GroupedSelect;
