import React, { ReactNode } from 'react';

/**
 * ItemRow — the interactive row inside an `CardSection` (element events
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
 *  - Trailing actions (e.g. the remove X) SWALLOW their own clicks — they
 *    never open the editor.
 *
 * Narrow-width wrapping: the row is a wrap-flexbox (`flex-wrap`). The default
 * body wrapper (`flex-1 min-w-0`) shrinks, never wraps — pass `bodyClass` with
 * a min-width basis (e.g. `ITEM_ROW_BODY_WRAP`) to make the note area stack
 * onto its own full-width line under the fixed-width title cell below a width
 * threshold, sizes untouched at normal widths.
 */
export interface ItemRowProps {
  /** Row-wide click — opens the item's editor. */
  onClick: () => void;
  /** Primary label cell (the date) — focusable, pointer cursor, highlights with the row. */
  title: ReactNode;
  /** Label cell classes (sizing; default = the w-44 date look). */
  titleClass?: string;
  /** Tooltip on the row. */
  titleAttr?: string;
  /** Body (note text etc.) — clicks never bubble to the row. */
  children?: ReactNode;
  /** Body wrapper classes (default `flex-1 min-w-0`; pass a min-width basis
   *  like `ITEM_ROW_BODY_WRAP` to let the body wrap below the title on narrow
   *  rows). */
  bodyClass?: string;
  /** Trailing actions (e.g. the remove X) — clicks never bubble to the row. */
  trailing?: ReactNode;
  /** data-* attributes for tests/agents (e.g. `{ 'data-element-event-date': '2026-08-12' }`). */
  dataProps?: Record<string, string>;
}

/** The shared interactive-row recipe (single source — the dark RuleCard row
 *  uses it too): row-wide click opens the editor, hover fill, pointer,
 *  rounded (the rows sit with gaps inside the CardSection's padded band). Wraps
 *  (`flex-wrap gap-y-1`) so a narrow row stacks its body below the title. */
export const ITEM_ROW_CLASS = 'group flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-1.5 hover:bg-zinc-800/60 transition-colors cursor-pointer rounded-md';

/** Body wrapper that makes the note area drop to its own line under the title
 *  when the row can't fit both side-by-side (≈208px basis — under a fixed
 *  `w-44`/`w-56` title + the trailing X, the body wraps instead of clipping). */
export const ITEM_ROW_BODY_WRAP = 'flex-1 min-w-[13rem]';

export function ItemRow({ onClick, title, titleClass, titleAttr, children, bodyClass, trailing, dataProps }: ItemRowProps) {
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
        className={titleClass || 'w-44 shrink-0 text-left text-[11px] font-medium text-zinc-300 group-hover:text-zinc-100 transition-colors cursor-pointer'}
      >
        {title}
      </button>
      <div className={bodyClass || 'flex-1 min-w-0'}>{children}</div>
      {trailing && <div className="shrink-0" onClick={(e) => e.stopPropagation()}>{trailing}</div>}
    </div>
  );
}
