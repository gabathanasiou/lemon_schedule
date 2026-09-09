import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import DropdownPanel from '../../DropdownPanel';
import { EntityItem } from '../../EntityDropdown';
import { useDropdown, useEscapeCapture, DD_CHIP_TRIGGER_CLASS } from '../../../lib/dropdown';
import { useFixedPosition } from '../../../lib/useSmartPosition';
import { usePortalTarget } from '../../../lib/popoutTarget';

/**
 * Light/dark grouped selection picker (locations by type, crew by department,
 * a position's element categories). A REAL multi-select dropdown — a trigger
 * that shows the picked names, opening the shared `DropdownPanel` (dark chip
 * panel / light panel) with group headers. Rendered through `DropdownPanel`,
 * NOT the kit `DropdownMenu`: the panel flips above the trigger when there
 * isn't room below (the kit menu's `bottom`-anchored flip lands off-screen
 * inside a modal's transformed popper wrapper).
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
  /** Dark chrome theme (overlays / the call-sheet editor header). */
  theme?: 'light' | 'dark';
}

const TRIGGER_CLS = 'flex w-full items-center justify-between gap-2 rounded border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-800 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-400 disabled:opacity-50';
const TRIGGER_CLS_DARK = `flex w-full items-center justify-between gap-2 ${DD_CHIP_TRIGGER_CLASS} text-xs`;

export const GroupedSelect: React.FC<GroupedSelectProps> = ({
  items,
  selectedIds,
  onChange,
  mode = 'multi',
  placeholder = 'Select…',
  className = '',
  disabled,
  theme = 'light',
}) => {
  const dark = theme === 'dark';
  const portalTarget = usePortalTarget();
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0, maxH: 288 } as { top: number; left: number; width: number; maxH: number; bottom?: number; ready?: boolean });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);
  useDropdown(open, triggerRef, close, panelRef);
  useEscapeCapture(open, close);
  useFixedPosition(triggerRef, open, (p) => setPos({ ...p, ready: true }));

  const dropdownItems: EntityItem[] = useMemo(
    () => items.map(i => ({ id: i.id, name: i.name, group: i.group })),
    [items],
  );
  const hintById = useMemo(() => new Map(items.map(i => [i.id, i.hint])), [items]);

  const label = (() => {
    const picked = items.filter(i => selectedIds.includes(i.id));
    if (picked.length === 0) return '';
    if (mode === 'single') return picked[0]?.name || '';
    return picked.map(p => p.name).join(', ');
  })();

  const toggle = (item: EntityItem) => {
    const selected = selectedIds.includes(item.id);
    if (mode === 'single') {
      onChange(selected ? [] : [item.id]);
      setOpen(false);
    } else {
      onChange(selected ? selectedIds.filter(id => id !== item.id) : [...selectedIds, item.id]);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setOpen(true);
        setHighlightedIndex(0);
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(i => Math.min(items.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(i => Math.max(0, i - 1));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const item = items[highlightedIndex];
      if (item) toggle({ id: item.id, name: item.name, group: item.group });
    }
  };

  return (
    <div className={className}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={dark ? TRIGGER_CLS_DARK : TRIGGER_CLS}
      >
        <span className={`truncate ${label ? '' : dark ? 'text-zinc-500' : 'text-zinc-400'}`}>{label || placeholder}</span>
        <ChevronDown className={`w-3 h-3 shrink-0 ${dark ? 'text-zinc-500' : 'text-zinc-400'}`} />
      </button>
      {open && (
        <DropdownPanel
          positioning="fixed"
          pos={pos}
          panelRef={panelRef}
          scrollRef={scrollRef}
          dropdownItems={dropdownItems}
          currentIds={selectedIds}
          highlightedIndex={highlightedIndex}
          itemKey={m => m.id}
          searchQuery=""
          hasExactMatch
          renderItem={item => (
            <span className="flex items-center gap-2 min-w-0">
              <span className="truncate">{item.name}</span>
              {hintById.get(item.id) && <span className={`text-[10px] shrink-0 ${dark ? 'text-zinc-500' : 'text-zinc-400'}`}>{hintById.get(item.id)}</span>}
            </span>
          )}
          defaultRenderer={item => <span className="truncate">{item.name}</span>}
          onItemClick={item => toggle(item)}
          onItemHover={setHighlightedIndex}
          onHoverLeave={() => setHighlightedIndex(-1)}
          onCommit={() => {}}
          portalTarget={portalTarget ?? document.body}
          dark={dark}
          anchorRef={triggerRef}
        />
      )}
    </div>
  );
};

export default GroupedSelect;
