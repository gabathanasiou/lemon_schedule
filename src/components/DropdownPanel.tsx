import React from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';
import { useOverlayMorph } from '@gabriel/ui-kit';
import { overlayMorphOptIn } from '../lib/overlayMotion';
import { EntityItem } from './EntityDropdown';
import { DD_PANEL_CLASS_LIB as DD_PANEL_CLASS, DD_ITEM_CLASS_LIB as DD_ITEM_CLASS, DD_ITEM_BASE_LIB as DD_ITEM_BASE } from '../lib/dropdown';

/* The panel morph (trigger-anchored scale+fade, the modal FLIP language) is
   shared from the ui-kit; this app-side panel carries the app's opt-out flag
   (localStorage lemon_schedule_modal_morph === '0', documented in
   docs/DESIGN-LANGUAGE.md §Modal anatomy & rules). The close is ALWAYS
   unmount-driven (the parent removes this panel to close), so the reverse
   morph plays on a pinned clone — the modal's clone pattern. */

interface DropdownPanelProps {
  positioning: 'relative' | 'fixed' | string;
  pos: { top: number; left: number; width: number; maxH: number; bottom?: number; ready?: boolean };
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
  /** Pointer left the list — callers clear a pointer-driven highlight. */
  onHoverLeave?: () => void;
  commitHint?: boolean;
  onCommit: () => void;
  portalTarget?: HTMLElement | null;
  /** Dark menu surface for modal chips (variant="chip") — the dark design
   *  language used by the color-rules/link-manager pickers. */
  dark?: boolean;
  /** The trigger wrapper rect — the morph grows out of it. */
  anchorRef?: React.RefObject<HTMLElement | null>;
}

export default function DropdownPanel({
  positioning, pos, panelRef, scrollRef, panelMinWidth,
  dropdownItems, currentIds, highlightedIndex, itemKey,
  searchQuery, hasExactMatch, renderItem, defaultRenderer,
  onItemClick, onItemHover, onHoverLeave, commitHint, onCommit, portalTarget, dark = false, anchorRef,
}: DropdownPanelProps) {
  const ITEM_BASE = dark ? 'flex items-center gap-2 px-3 py-2 text-xs rounded transition-colors cursor-pointer select-none whitespace-nowrap w-full text-left' : DD_ITEM_BASE;
  const LIGHT_BASE = `w-full text-left ${DD_ITEM_BASE} rounded cursor-pointer transition-colors active:transition-none flex items-center gap-2`;
  // SINGLE-highlight rule (both themes): NO CSS hover fills — the one active
  // row is `highlightedIndex`, which pointer hover (onMouseEnter →
  // onItemHover) and the keyboard arrows both write; the latest interaction
  // wins and leaving the list clears a pointer-driven highlight. Checked rows
  // are visually distinct from the highlight (dark: Check glyph; light: blue).
  const itemCls = (checked: boolean, highlighted: boolean, synthetic: boolean): string => {
    if (dark) {
      if (synthetic) return `${ITEM_BASE} ${highlighted ? 'bg-emerald-800/70 text-emerald-100' : 'bg-emerald-900/40 text-emerald-300'}`;
      if (highlighted) return `${ITEM_BASE} bg-zinc-700 text-white`;
      if (checked) return `${ITEM_BASE} bg-zinc-800/40 text-zinc-100`;
      return `${ITEM_BASE} text-zinc-300`;
    }
    if (synthetic) {
      return `${LIGHT_BASE} text-zinc-400 ${highlighted ? 'bg-emerald-50 text-emerald-700' : ''}`;
    }
    if (highlighted) return `${LIGHT_BASE} ${checked ? 'bg-blue-100 text-blue-700' : 'bg-zinc-100 text-zinc-900'}`;
    if (checked) return `${LIGHT_BASE} bg-blue-50 text-blue-700 active:bg-blue-200`;
    return `${LIGHT_BASE} text-zinc-600 active:bg-zinc-200 active:text-zinc-900`;
  };
  const setContentRef = useOverlayMorph({
    visible: true,
    morph: overlayMorphOptIn(),
    ref: panelRef,
    anchor: () => {
      const el = anchorRef?.current;
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height };
    },
    cloneOnUnmount: true,
  });
  const setRef = React.useCallback((node: HTMLDivElement | null) => {
    panelRef.current = node;
    setContentRef(node);
  }, [panelRef, setContentRef]);
  const panel = (
    <div
      ref={setRef}
      className={`click-outside-ignore ${dark ? 'bg-zinc-950/95 backdrop-blur-md border border-zinc-800 rounded-lg shadow-2xl z-[10001] p-1 flex flex-col pointer-events-auto min-w-[200px]' : DD_PANEL_CLASS(positioning)} ${panelMinWidth || ''}`}
      style={positioning === 'fixed' ? { position: 'fixed', left: pos.left, width: pos.width, visibility: pos.ready ? 'visible' : 'hidden', ...(pos.bottom != null ? { bottom: pos.bottom } : { top: pos.top }) } : {}}
    >
      <div ref={scrollRef} className="overflow-y-auto max-h-72" style={positioning === 'fixed' ? { maxHeight: pos.maxH - 16 } : undefined} onMouseLeave={onHoverLeave}>
      {dropdownItems.length > 0 ? dropdownItems.map((m, idx) => {
        const checked = currentIds.includes(itemKey(m));
        const highlighted = highlightedIndex === idx;
        const isSynthetic = searchQuery && !hasExactMatch && idx === 0;
        const cls = itemCls(checked, highlighted, isSynthetic);
        return (
          <React.Fragment key={isSynthetic ? '__new__' : m.id}>
          <button
            data-ei={idx}
            data-checked={checked ? 'true' : undefined}
            type="button"
            onMouseDown={e => e.preventDefault()}
            onTouchStart={() => {}}
            onClick={() => onItemClick(m, isSynthetic)}
            onMouseEnter={onItemHover ? () => onItemHover(idx) : undefined}
            className={cls}
          >
            {isSynthetic ? (
              <span className="truncate flex-1 italic">Add &quot;{m.name}&quot;</span>
            ) : (
              renderItem ? renderItem(m, checked) : defaultRenderer(m, checked)
            )}
            {dark && checked && !isSynthetic && <Check className="w-3 h-3 text-zinc-400 shrink-0 ml-auto" />}
          </button>
          {isSynthetic && (
            <hr className={dark ? 'border-t border-zinc-800 my-1 mx-1' : 'border-t border-zinc-200 my-1 mx-1'} />
          )}
          </React.Fragment>
          );
      }) : (
        <div className={dark ? 'px-2 py-1 text-xs text-zinc-500 text-center' : 'px-2 py-1 text-xs text-zinc-400 text-center'}>No matches</div>
      )}
      </div>
      {commitHint && (
        <button
          onClick={onCommit}
          onTouchStart={() => {}}
          className={dark ? 'px-2 py-1 text-[10px] text-zinc-400 text-center border-t border-zinc-800 shrink-0 hover:bg-zinc-800 transition-colors w-full cursor-pointer' : 'px-2 py-1 text-[10px] text-zinc-400 text-center border-t border-zinc-100 shrink-0 hover:bg-zinc-50 active:bg-zinc-100 transition-colors active:transition-none w-full cursor-pointer'}
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
