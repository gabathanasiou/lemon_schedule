# Table Column UX — Ribbon-Style Canvas Editing (Plan)

Status: **planned, not implemented.** The reports designer's table columns are
currently edited exclusively in the toolbar strip (field picker + B/I/align/
skip per column, add/remove only at the end). Columns cannot be rearranged,
a specific column cannot be deleted, and columns can only be appended. This
plan brings the interaction model of the Ribbon Designer (and the Notion-style
`columns` block) to report tables.

## Goal

- Click a table column to select it, edit it from a floating chrome bar
- Drag columns to reorder them (with move buttons as backup)
- Insert columns anywhere; delete any specific column
- Full per-column controls (field, bold, italic, align, skip-empty) in one place

## Changes

### `src/lib/reportBlocks.ts` — three new pure helpers
- `moveTableColumn(blocks, tableId, from, to)` — reorder, re-normalize widths
- `insertTableColumn(blocks, tableId, index, column?)` — insert at any index
  (defaults to an empty-field column)
- `removeTableColumn(blocks, tableId, index)` — guarded to keep ≥1 column

### `src/components/reports/ReportDesignerCanvas.tsx` — table column chrome
- Clicking a table header/cell (columns-mode) → `onSelectCol({ colsId, colIndex })`
  (the `ColSel` type already exists; it's just not wired for tables yet)
- Selected column: header highlight + floating `column-chrome` bar with grip,
  compact field picker, B / I / align / EyeOff, insert before/after,
  move left/right, delete
- **Drag to reorder**: pointer-drag on the header (same `pointerdown` → window
  `pointermove/up` pattern as `TableResizeBar`), live drop indicator at column
  boundaries, `moveTableColumn` on release
- Right-click a table cell → `onMenu(e, id, colIndex)` for column-mode context menu
- Existing `TableResizeBar` (ribbon-style drag-to-resize) stays

### `src/components/reports/ReportContextMenu.tsx` — column mode for tables
- Change field (field list, table's scope), Move left/right, Insert before/after,
  Delete column
- "Add text block" stays columns-block-only

### `src/components/reports/ReportDesigner.tsx` + `ReportToolbar.tsx`
- `selCol` gating extends to tables (`selBlock.type === 'table'`); toolbar shows
  "Column N of M" mode with field/style/move/insert/delete when a column is
  selected, plus a hint to click a header on the canvas
- Keyboard Delete/Backspace on a selected table column deletes it (the columns
  block already does this)
- The compact all-columns strip remains as the quick list + end add/remove

## Scope

- Columns-mode tables get the full canvas treatment
- Rows-mode (matrix) tables keep toolbar-only editing for now (their chunked
  groups don't map to clickable columns cleanly)

## Verification

- `npm run lint`
- Existing `report-designer-move` e2e suite
- Canvas probe: select column → chrome appears; drag reorder persists;
  insert/delete at any index
