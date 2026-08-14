import React, { useEffect, useRef } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { SuggestionOptions, SuggestionProps, SuggestionKeyDownProps } from '@tiptap/suggestion';
import { ReportFieldDef, fieldChipColor } from '../../lib/reportFields';

// Caret-anchored attribute autocomplete for the text editor, adapted to the
// @tiptap/suggestion render contract. The plugin filters `items` between
// onStart/onUpdate (items callback = searchReportFields); this renderer only
// renders the rows, tracks the highlight, and commits via `props.command`.
// Positioning is managed by the plugin's `props.mount` (Floating UI, flips
// above/below automatically, appended to document.body).

export type TokenSuggestionProps = SuggestionProps<ReportFieldDef, { field: string }>;

interface PopupState {
  holder: HTMLElement;
  root: Root;
  unmount: (() => void) | null;
  props: TokenSuggestionProps | null;
  highlight: number;
}

const MAX_H = 240;
const W = 280;

const TokenPopup: React.FC<{
  props: TokenSuggestionProps;
  highlight: number;
  onHighlight: (i: number) => void;
}> = ({ props, highlight, onHighlight }) => {
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const active = listRef.current?.querySelector<HTMLElement>('[data-ac-active="1"]');
    active?.scrollIntoView({ block: 'nearest' });
  }, [highlight]);
  return (
    <div className="ac-token-popover bg-zinc-950/95 backdrop-blur-md border border-zinc-800 rounded-lg shadow-2xl p-1 min-w-[220px] overflow-y-auto" style={{ width: W, maxHeight: MAX_H, zIndex: 9999 }} onMouseDown={e => e.preventDefault()}>
      <div ref={listRef}>
        {props.items.map((f, i) => {
          const color = fieldChipColor(f.group);
          return (
            <button
              key={f.key}
              type="button"
              data-ac-active={i === highlight ? '1' : undefined}
              onMouseEnter={() => onHighlight(i)}
              onClick={() => props.command({ field: f.key })}
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

/** The suggestion renderer for the Token extension's `@` trigger. */
export const TokenSuggestion: SuggestionOptions<ReportFieldDef, { field: string }>['render'] = () => {
  let popup: PopupState | null = null;

  const render = (props: TokenSuggestionProps) => {
    if (!popup) return;
    popup.props = props;
    const highlight = popup.highlight;
    popup.holder.style.display = props.items.length > 0 ? '' : 'none';
    popup.root.render(<TokenPopup props={props} highlight={highlight} onHighlight={(i) => { popup!.highlight = i; render(popup!.props!); }} />);
  };

  return {
    onStart(props) {
      const holder = document.createElement('div');
      holder.style.position = 'fixed';
      holder.style.zIndex = '9999';
      const root = createRoot(holder);
      popup = { holder, root, unmount: null, props, highlight: 0 };
      const unmount = props.mount(holder, {
        // The plugin anchors to the `@`-decoration's start; the caret sits at
        // its END, so shift the popup right by the anchor width — matches the
        // pre-TipTap popup, which anchored exactly at the caret.
        onPosition: ({ x, y, placement }) => {
          if (!popup) return;
          const rect = popup.props?.clientRect?.();
          const dx = rect && !placement.endsWith('-end') ? rect.width : 0;
          holder.style.left = `${x + dx}px`;
          holder.style.top = `${y}px`;
        },
      });
      popup.unmount = unmount;
      render(props);
    },
    onUpdate(props) {
      if (!popup) return;
      render(props);
    },
    onKeyDown({ event }: SuggestionKeyDownProps) {
      if (!popup?.props) return false;
      const { items, command } = popup.props;
      if (items.length === 0) return false;
      const key = event.key;
      if (key === 'ArrowDown') {
        event.preventDefault();
        popup.highlight = Math.min(popup.highlight + 1, items.length - 1);
        render(popup.props);
        return true;
      }
      if (key === 'ArrowUp') {
        event.preventDefault();
        popup.highlight = Math.max(popup.highlight - 1, 0);
        render(popup.props);
        return true;
      }
      if (key === 'Enter' || key === 'Tab') {
        event.preventDefault();
        command({ field: items[popup.highlight]?.key ?? items[0].key });
        return true;
      }
      return false;
    },
    onExit() {
      if (!popup) return;
      popup.unmount?.();
      popup.root.unmount();
      popup.holder.remove();
      popup = null;
    },
  };
};
