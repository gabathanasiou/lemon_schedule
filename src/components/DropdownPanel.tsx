import React from 'react';
import { createPortal } from 'react-dom';
import { EntityItem } from './EntityDropdown';
import { DD_PANEL_CLASS_LIB as DD_PANEL_CLASS, DD_ITEM_CLASS_LIB as DD_ITEM_CLASS, DD_ITEM_BASE_LIB as DD_ITEM_BASE } from '../lib/dropdown';

interface DropdownPanelProps {
  positioning: 'relative' | 'fixed' | string;
  pos: { top: number; left: number; width: number; maxH: number; bottom?: number };
  panelRef: React.RefObject<HTMLDivElement | null>;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  panelMinWidth?: string;
  dropdownItems: EntityItem[];
  currentIds: string[];
  highlightedIndex: number;
  itemKey: (m: EntityItem) => string;
  searchQuery: string;
  hasExactMatch: boolean;
  renderItem?: (item: EntityItem, checked: boolean) => React.ReactNode;
  defaultRenderer: (item: EntityItem, checked: boolean) => React.ReactNode;
  onItemClick: (item: EntityItem, isSynthetic: boolean) => void;
  onItemHover: (idx: number) => void;
  commitHint?: boolean;
  onCommit: () => void;
  portalTarget?: HTMLElement | null;
}

export default function DropdownPanel({
  positioning, pos, panelRef, scrollRef, panelMinWidth,
  dropdownItems, currentIds, highlightedIndex, itemKey,
  searchQuery, hasExactMatch, renderItem, defaultRenderer,
  onItemClick, onItemHover, commitHint, onCommit, portalTarget,
}: DropdownPanelProps) {
  const panel = (
    <div
      ref={panelRef}
      className={`click-outside-ignore ${DD_PANEL_CLASS(positioning)} ${panelMinWidth || ''}`}
      style={positioning === 'fixed' ? { position: 'fixed', left: pos.left, width: pos.width, ...(pos.bottom != null ? { bottom: pos.bottom } : { top: pos.top }) } : {}}
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
            onClick={() => onItemClick(m, isSynthetic)}
            onMouseEnter={onItemHover ? () => onItemHover(idx) : undefined}
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
          onClick={onCommit}
          onTouchStart={() => {}}
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
}
