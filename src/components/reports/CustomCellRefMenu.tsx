import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getDropdownClasses, useDropdownTheme, useItemSize } from '@gabriel/ui-kit';
import { useDropdownPosition, type DropdownPanelPos } from '../../lib/useDropdownPosition';
import { useCurrentDocument } from '../../lib/popoutTarget';
import { CellRef } from '../../lib/reportTableMerges';

// The `=` referencing menu (roadmap 190) — its OWN dropdown, NOT the `@` item
// popup: cell refs are table structure, not semantic items. Typing `=` in an
// empty cell opens it (the `=` key is intercepted before the editor, see
// CustomTable); direction entries insert the relative token at the caret and
// "Pick a cell…" enters click-a-cell mode.
//
// Chrome + rows reuse the kit menu language verbatim (ui-menu / ui-item /
// useItemSize / useDropdownTheme) so it is visually the SAME surface as the
// `@` autocomplete; positioning goes through the ONE dropdown engine.

export type CellRefMenuAction = 'left' | 'right' | 'above' | 'below' | 'pick';

export interface CellRefMenuEntry { id: CellRefMenuAction; label: string; }

export const CELL_REF_MENU_ENTRIES: CellRefMenuEntry[] = [
  { id: 'left', label: '← Cell left' },
  { id: 'right', label: '→ Cell right' },
  { id: 'above', label: '↑ Cell above' },
  { id: 'below', label: '↓ Cell below' },
  { id: 'pick', label: '▦ Pick a cell…' },
];

export function filterCellRefMenu(query: string): CellRefMenuEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return CELL_REF_MENU_ENTRIES;
  return CELL_REF_MENU_ENTRIES.filter(e => e.label.toLowerCase().includes(q));
}

const MENU_MAX_HEIGHT = 240;

interface CustomCellRefMenuProps {
  /** The formula cell the menu hangs off (stable `data-cell` id). */
  focus: CellRef;
  query: string;
  highlight: number;
  onPick: (id: CellRefMenuAction) => void;
  onHover: (index: number) => void;
}

const CustomCellRefMenu: React.FC<CustomCellRefMenuProps> = ({ focus, query, highlight, onPick, onHover }) => {
  const anchorMarkerRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, maxH: MENU_MAX_HEIGHT, ready: false });
  const currentDocument = useCurrentDocument();
  useLayoutEffect(() => {
    const card = anchorMarkerRef.current?.closest('[data-block-id]');
    if (!card) return;
    const cell = card.querySelector<HTMLElement>(`[data-cell="${focus.rowId}:${focus.colId}"]`);
    const el = cell instanceof HTMLElement ? cell : (card as HTMLElement);
    anchorRef.current = el;
    setAnchor(el);
  }, [focus.rowId, focus.colId]);
  useDropdownPosition({
    anchorRef,
    panelRef,
    contentRef: scrollRef,
    open: !!anchor,
    maxHeight: MENU_MAX_HEIGHT,
    onPosition: useCallback((p: DropdownPanelPos) => {
      setPos({ top: p.top, left: p.left, maxH: p.maxH, ready: true });
    }, []),
  });

  const theme = useDropdownTheme();
  const classes = getDropdownClasses(theme);
  const itemSize = useItemSize();
  const entries = filterCellRefMenu(query);
  const portalTarget = currentDocument?.body ?? document.body;

  return (
    <>
      <div ref={anchorMarkerRef} className="chrome-anchor" aria-hidden />
      {anchor && createPortal(
        <div
          ref={panelRef}
          className="click-outside-ignore ui-menu rounded-lg shadow-xl p-1 flex flex-col min-w-[220px] overflow-y-auto"
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: 280, maxHeight: MENU_MAX_HEIGHT, visibility: pos.ready ? 'visible' : 'hidden', zIndex: 10002 }}
          // A portaled React child still bubbles to the block card's onClick —
          // that read as a card click and exited Values editing (dead pick).
          // Swallow the interaction on the menu root (roadmap 208).
          onMouseDown={e => { e.preventDefault(); e.stopPropagation(); }}
          onPointerDown={e => e.stopPropagation()}
          onClick={e => e.stopPropagation()}
        >
          <div ref={scrollRef} style={{ maxHeight: pos.maxH - 8 }}>
            {query && <div className={`${classes.headerPad} ${classes.headerText}`}>= {query}</div>}
            {entries.length === 0 && <div className="px-2 py-1 text-xs text-zinc-500 text-center">No matches</div>}
            {entries.map((e, i) => (
              <div
                key={e.id}
                role="option"
                style={itemSize}
                className={`w-full text-left rounded flex items-center gap-2 outline-none cursor-pointer select-none ${classes.itemDefault}${i === highlight ? ' ui-item-highlighted' : ''}`}
                onPointerEnter={() => onHover(i)}
                onClick={() => onPick(e.id)}
              >
                <span className={`${classes.icon} shrink-0 flex items-center`}>
                  <span className="block w-2 h-2 rounded-full" style={{ background: '#0f766e' }} />
                </span>
                <span className="flex-1 truncate">{e.label}</span>
              </div>
            ))}
          </div>
        </div>,
        portalTarget,
      )}
    </>
  );
};

export default CustomCellRefMenu;
