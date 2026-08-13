# Table Column UX — Ribbon-Style Canvas Editing

Status: **implemented** (editor-polish branch, Stage 6). The reports designer's
table columns are now edited directly on the canvas:

- Click a table header/cell → the column is selected (a floating chrome bar
  appears with a compact field picker, B/I/align/skip-empty, insert before/
  after, move left/right, delete, deselect).
- **Drag columns to reorder** by grabbing any cell (pointer-drag with a drop
  indicator; widths stay normalized).
- Insert columns at any index; delete any specific column.
- Right-click a table cell → column-mode context menu (change field, move,
  insert, delete).
- Widths are still resized by dragging the resize tabs above the header
  (`TableResizeBar`), and the toolbar shows column ops (Before/After/Delete +
  hint) in column mode.
- Keyboard Delete/Backspace on a selected column deletes it.
- Rows-mode (matrix) tables keep toolbar-only editing — their chunked groups
  don't map to clickable columns.

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
