# Ribbon Cells — Agent Manual

Status: **read this before touching ribbon rendering (stripboard, print, designer canvas/preview,
reports ribbon block) or the Ribbon Designer.** `src/lib/ribbonUtils.ts` is the single source for
cell styling — never hardcode cell padding/font/text styles.

## Cell styling

- ALL ribbon cells MUST use `getRibbonCellBaseStyle(cell, cellPaddingV?, cellPaddingH?, span?,
  textSize?)` — never hardcode cell padding/font/text styles. Effective per-cell size =
  `ribCellTextSize(master, cell)` (master `RibbonDesign.textSize`, default 14 for new designs; legacy
  unset = 8pt rendering; `RibbonCell.textSizeOffset` −8…+8). All renderers (stripboard, print,
  designer canvas/preview, reports ribbon block) thread the master through; `SET_RIBBON_TEXT_SIZE`
  setter.
- Scene cell padding `cellPaddingV/H ?? 3`; banner pad `getNoteBreakPad(cellPaddingV, rowCount)` =
  `cellPaddingV * N + 6 * (N-1)` (matches scene height). `edgePadding` (default 3) applies to the
  outer ribbon container only.
- Padding/edge/textSize stored per `RibbonDesign`; setters `SET_RIBBON_CELL_PADDING_V/H`,
  `SET_RIBBON_EDGE_PADDING`, `SET_RIBBON_TEXT_SIZE`. Pass through ScheduleTab → StripBlock →
  SortableRibbon, PrintSchedule/DaySection, PrintDialog, RibbonTab. RibbonToolbar numeric boxes are
  `LiveNumberInput` (free-typed draft, commit clamps on change, Enter/blur finalize, Escape reverts) —
  never a clamped controlled input.

## View mode & borders

- View mode (`useViewMode`, `lemon_schedule_view_mode`): portrait 730px / landscape 1060px / full
  null. Cell borders (`useCellBorders`, `lemon_schedule_cell_borders`): none|vertical|horizontal|both
  via `getCellBorderProps(borders, textColor, isLastInRow, isLastRow)` (one-sided only).

## Ribbon designer (`RibbonTab`)

- Designs in `project.ribbonDesigns`, active `activeRibbonId`; live preview uses `PREVIEW_SAMPLES` +
  merge groups. The cell context menu re-targets via `elementFromPoint` behind a
  `pointer-events: none` backdrop.
