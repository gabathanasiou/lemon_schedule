import React, { useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import DropdownMenu from '../../DropdownMenu';
import DropdownItem from '../../DropdownItem';

/**
 * Light grouped picker for the Day Manager (locations by type, crew by
 * department). Renders the kit light `DropdownMenu` with a group header row
 * whenever the group changes — the "grouped dropdown" language without forking
 * `EntityDropdown` (which is a text-cell editor, not a selection picker).
 */
export interface GroupedSelectItem {
  id: string;
  name: string;
  group?: string;
  hint?: string;
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
  /** Optional row after the items (e.g. "New location…"). */
  footer?: React.ReactNode;
}

const TRIGGER_CLS = 'flex w-full items-center justify-between gap-2 rounded border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-800 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-400 disabled:opacity-50';

export const GroupedSelect: React.FC<GroupedSelectProps> = ({
  items,
  selectedIds,
  onChange,
  mode = 'multi',
  placeholder = 'Select…',
  className = '',
  disabled,
  footer,
}) => {
  const label = (() => {
    const picked = items.filter(i => selectedIds.includes(i.id));
    if (picked.length === 0) return '';
    if (mode === 'single') return picked[0]?.name || '';
    return picked.map(p => p.name).join(', ');
  })();

  let lastGroup: string | undefined;
  const [open, setOpen] = useState(false);

  return (
    <div className={className}>
      <DropdownMenu
        open={open}
        onClose={() => setOpen(false)}
        onOpenChange={setOpen}
        theme="light"
        width="w-72"
        trigger={
          <button type="button" disabled={disabled} className={TRIGGER_CLS}>
            <span className={`truncate ${label ? '' : 'text-zinc-400'}`}>{label || placeholder}</span>
            <ChevronDown className="w-3 h-3 shrink-0 text-zinc-400" />
          </button>
        }
      >
        {items.map(item => {
          const selected = selectedIds.includes(item.id);
          const header = item.group && item.group !== lastGroup ? item.group : null;
          if (item.group) lastGroup = item.group;
          return (
            <React.Fragment key={item.id}>
              {header && <div className="px-2 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">{header}</div>}
              <DropdownItem
                selected={selected}
                keepOpen={mode === 'multi'}
                trailing={mode === 'multi' && selected ? <Check className="w-3.5 h-3.5" /> : undefined}
                onClick={() => {
                  if (mode === 'single') {
                    onChange(selected ? [] : [item.id]);
                    setOpen(false);
                  } else {
                    onChange(selected ? selectedIds.filter(id => id !== item.id) : [...selectedIds, item.id]);
                  }
                }}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span className="truncate">{item.name}</span>
                  {item.hint && <span className="text-[10px] text-zinc-400 shrink-0">{item.hint}</span>}
                </span>
              </DropdownItem>
            </React.Fragment>
          );
        })}
        {footer}
      </DropdownMenu>
    </div>
  );
};

export default GroupedSelect;
