import React, { useEffect, useRef } from 'react';
import { ReportFieldDef, fieldChipColor } from '../../lib/reportFields';

// Caret-anchored attribute autocomplete for the reports text editor. Plain
// fixed-position popover (no portal) — rows show the attribute's group color,
// keyboard navigation is driven by the editor's keydown handler.

export interface TokenAcState {
  x: number;
  y: number;
  below: boolean;
  prefix: string;
  items: ReportFieldDef[];
  highlight: number;
}

interface TokenAutocompleteProps {
  state: TokenAcState;
  onHighlight: (index: number) => void;
  onPick: (field: ReportFieldDef) => void;
  rootRef: React.RefObject<HTMLDivElement | null>;
}

const MAX_H = 240;
const W = 280;

const TokenAutocomplete: React.FC<TokenAutocompleteProps> = ({ state, onHighlight, onPick, rootRef }) => {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    const active = el?.querySelector<HTMLElement>('[data-ac-active="1"]');
    active?.scrollIntoView({ block: 'nearest' });
  }, [state.highlight]);

  const { x, y, below, items, highlight } = state;
  const style: React.CSSProperties = below
    ? { left: x, top: y + 6, maxHeight: MAX_H }
    : { left: x, top: y - 6, maxHeight: MAX_H, transform: 'translateY(-100%)' };

  return (
    <div
      ref={rootRef}
      className="ac-token-popover bg-zinc-950/95 backdrop-blur-md border border-zinc-800 rounded-lg shadow-2xl p-1 min-w-[220px] overflow-y-auto"
      style={{ position: 'fixed', width: W, zIndex: 9999, ...style }}
      onMouseDown={e => e.preventDefault()}
    >
      <div ref={listRef}>
        {items.map((f, i) => {
          const color = fieldChipColor(f.group);
          return (
            <button
              key={f.key}
              type="button"
              data-ac-active={i === highlight ? '1' : undefined}
              onMouseEnter={() => onHighlight(i)}
              onClick={() => onPick(f)}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-xs rounded transition-colors ${i === highlight ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-300'}`}
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color.text }} />
              <span className="truncate flex-1">{f.label}</span>
              <span className="shrink-0 text-[9px] text-zinc-600">{f.group}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default TokenAutocomplete;
