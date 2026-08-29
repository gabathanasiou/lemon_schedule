import React, { ReactNode } from 'react';

/**
 * ItemRow — the interactive row inside an `ItemCard` (element events
 * manager's date rows, extracted as the shared row for grouped lists).
 *
 * The click contract is baked in:
 * - The WHOLE row opens the item's editor (`onClick`, pointer cursor, hover
 *   fill) and the title cell highlights with the row (`group-hover`).
 * - The title cell is a focusable button (keyboard path) that triggers the
 *   same `onClick`.
 * - Body clicks BUBBLE to the row (the row opens the editor) — interactive
 *   elements inside the body (note text, the note input) must
 *   `stopPropagation` themselves.
 * - Trailing actions (e.g. the remove X) SWALLOW their own clicks — they
 *   never open the editor.
 */
export interface ItemRowProps {
  /** Row-wide click — opens the item's editor. */
  onClick: () => void;
  /** Primary label cell (the date) — focusable, pointer cursor, highlights with the row. */
  title: ReactNode;
  /** Label cell classes (sizing; default = the w-28 date look). */
  titleClass?: string;
  /** Tooltip on the row. */
  titleAttr?: string;
  /** Body (note text etc.) — clicks never bubble to the row. */
  children?: ReactNode;
  /** Trailing actions (e.g. the remove X) — clicks never bubble to the row. */
  trailing?: ReactNode;
  /** data-* attributes for tests/agents (e.g. `{ 'data-element-event-date': '2026-08-12' }`). */
  dataProps?: Record<string, string>;
}

/** The shared interactive-row recipe (single source — the dark RuleCard row
 *  uses it too): row-wide click opens the editor, hover fill, pointer,
 *  rounded (the rows sit with gaps inside the ItemCard's padded band). */
export const ITEM_ROW_CLASS = 'group flex items-center gap-2 px-3 py-1.5 hover:bg-zinc-800/60 transition-colors cursor-pointer rounded-md';

export function ItemRow({ onClick, title, titleClass, titleAttr, children, trailing, dataProps }: ItemRowProps) {
  return (
    <div
      onClick={onClick}
      title={titleAttr}
      className={ITEM_ROW_CLASS}
      {...dataProps}
    >
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        className={titleClass || 'w-28 shrink-0 text-left text-[11px] font-medium text-zinc-300 group-hover:text-zinc-100 transition-colors cursor-pointer'}
      >
        {title}
      </button>
      <div className="flex-1 min-w-0">{children}</div>
      {trailing && <div className="shrink-0" onClick={(e) => e.stopPropagation()}>{trailing}</div>}
    </div>
  );
}
