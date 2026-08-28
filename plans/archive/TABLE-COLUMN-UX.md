# Table Column UX — Ribbon-Style Canvas Editing

Status: **implemented** (editor-polish branch, Stage 6). The reports designer's
table columns are now edited directly on the canvas:

- Click a table header/cell → the column is selected; a floating chrome bar
  edits **that column** (field picker, B/I/align/skip-empty, insert before/
  after, move left/right, delete, deselect).
- **Drag columns to reorder** by grabbing any cell (pointer-drag with a drop
  indicator; widths stay normalized).
- Right-click a table cell → column-mode context menu (change field, move,
  insert, delete).
- Widths are still resized by dragging the resize tabs above the header
  (`TableResizeBar`).
- Keyboard Delete/Backspace on a selected column deletes it.
- Rows-mode (matrix) tables keep chrome-only settings (their chunked groups
  don't map to clickable columns).

The table block's floating editor (chrome) holds **table settings only**
(collection, layout axis, header row, borders, day format) — per-column
editing lives in the column chrome. The top toolbar is a slim status bar: all
block controls live in the floating editors above the canvas.

## Helpers (src/lib/reportBlocks.ts)

- `moveTableColumn(blocks, tableId, from, to)` — reorder, widths re-normalized
- `insertTableColumnAt(blocks, tableId, index, column?)` — insert at any index
- `removeTableColumnAt(blocks, tableId, index)` — guarded to keep ≥1 column

## Selection model

`ColSel { colsId, colIndex }` (already existed for the columns block) now also
serves columns-mode tables. Selection ops route through the same
zone-of/id machinery as everything else in ReportDesigner.

## Notes

- Pointer interaction on cells calls `preventDefault` on pointerdown (stops the
  block card's native HTML5 drag swallowing the events) and performs selection
  on pointerup; a `closest('[data-table-col-ci]')` guard keeps the card's click
  from clearing the column selection.
- Reorder drop index is computed from cell center points (+0.5px epsilon for
  sub-pixel pointer rounding).
- The floating editors are kept inside the visible canvas by JS repositioning
  (`repositionChrome`): the block chrome flips below its card when there's no
  room above, both chromes clamp their left edge, and they re-clamp on scroll.
