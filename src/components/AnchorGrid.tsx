import React from 'react';

export interface AnchorGridProps<X extends string, Y extends string> {
  /** Ordered axis values (e.g. left / center / right). */
  columns: readonly X[];
  /** Ordered axis values (e.g. top / center / bottom). */
  rows: readonly Y[];
  column: X;
  row: Y;
  onChange: (next: { column: X; row: Y }) => void;
  /** Per-cell accessible label/title (e.g. "Align left, anchor top"). */
  label: (column: X, row: Y) => string;
  ariaLabel: string;
  title?: string;
  disabled?: boolean;
}

/**
 * The Photoshop-style anchor grid — a compact bare tic-tac-toe of squares.
 * One cell = the anchor (column + row); the selected cell is the accent square.
 * Generic over the axis values so any future two-axis anchor/alignment control
 * can reuse it (the image block's Align × Content anchor is the first user).
 */
export function AnchorGrid<X extends string, Y extends string>({
  columns,
  rows,
  column,
  row,
  onChange,
  label,
  ariaLabel,
  title,
  disabled,
}: AnchorGridProps<X, Y>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      title={title ?? ariaLabel}
      className="grid gap-[2px]"
      style={{ gridTemplateColumns: `repeat(${columns.length}, 11px)` }}
    >
      {rows.map(r =>
        columns.map(c => {
          const active = c === column && r === row;
          const cellLabel = label(c, r);
          return (
            <button
              key={`${c}-${r}`}
              type="button"
              disabled={disabled}
              aria-label={cellLabel}
              aria-pressed={active}
              title={cellLabel}
              onClick={() => onChange({ column: c, row: r })}
              className={`h-[11px] w-[11px] rounded-[2px] transition-[background-color,opacity] disabled:opacity-40 ${
                active
                  ? 'bg-sky-400 opacity-100'
                  : 'bg-[var(--ui-text-faint)] opacity-30 hover:opacity-70'
              }`}
            />
          );
        }),
      )}
    </div>
  );
}
