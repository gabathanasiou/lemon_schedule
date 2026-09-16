# Glide Breakdown — Agent Manual

Status: **read this before touching the Glide breakdown grid (`BreakdownTabGlide.tsx`) or
`InlineGlideTable`.** These are hard-won gotchas; the canvas is opaque to the DOM and does not
auto-repaint.

## Glide breakdown grid (`src/components/BreakdownTabGlide.tsx`)

- **`provideEditor` gets RAW indices (+1 row marker offset)** — `dataCol = col - 1`; every other
  callback gets adjusted 0-based indices. Always use `COLUMNS[col].key`, never hardcoded indices.
- **`onFinishedEditing` MUST receive the latest value** (`latestRef.current` via useRef) — calling it
  empty = cancel/discard.
- Canvas doesn't auto-repaint: bulk ops → `gridRef.current?.updateCells(damageList)` in
  `setTimeout(0)`; undo/redo → full-grid `updateCells` effect on `scenes`.
- All bulk ops wrap dispatches in `BATCH_START`/`BATCH_COMMIT`.
- Glide `Rectangle` bounds are exclusive — iterate with `<`, never `<=`.
- Row markers: `clickable-number`, `startIndex: 1`. Row-click selection doesn't set `current.range` —
  synthesize from `gridSelection.rows`.
- Context menu position = `bounds.x + localEventX`, `bounds.y + localEventY`; always
  `preventDefault()`.
- `drawCell` for the actions column (red trash icon, preloaded via `new Image()` data URL).
- **The overlay editor is `React.lazy()`-loaded (a separate PROD chunk) — `void
  import('@glide-overlay-editor')` at the top of this file preloads it at boot** (roadmap 63):
  without it the FIRST edit after a fresh page load suspends while the chunk fetches and swallows
  every keystroke ("MARY" → "Y"; dev can't reproduce). The alias lives in `vite.config.ts` + a
  tsconfig path. Do NOT remove the preload as "unused" — it's the fix, and Rollup dedupes it onto
  Glide's own chunk.

## `InlineGlideTable` (`src/components/InlineGlideTable.tsx`)

- The shared compact grid for page cards (Day Manager Call Times + Crew): columns auto-fit the card,
  the grid is content-height with no scrollbars, EDITABLE cells carry a light-blue fill that deepens
  on the hovered row while read-only cells stay plain with faint text + a neutral hover (never a
  gray box; fully read-only grids don't tint), and each edit/paste/fill/clear commits ONCE via
  `onCommit`.
- Same repaint gotcha — a full-grid `updateCells` effect on `rows`/`COLUMNS` (without it the canvas
  looks stale until an interaction). Reuse it for manager pages instead of forking a grid.
- Optional `rowTooltip`/`onRowHover` drive the Call Sheet editor's first-scene hover tooltip +
  ribbon strip highlight (`SceneHighlightContext`, `reports/sceneHighlight.tsx`); the tooltip follows
  the cursor and dismisses on `pointerleave` (floating chromes).
- **Computed cells seed the editor** (roadmap 141). Glide's text editor seeds from the cell's raw
  `data`, never `displayData` — so a cell whose value is COMPUTED used to open blank. Use
  `seededTextCell(seed, { displayData })` (`src/lib/glideCells.ts`): it puts the seed in `data` and
  sets `selectionRange` so the overlay opens with it fully selected (type replaces it). Seed order =
  stored override → the DEFAULT expression that produced the value (a stage `lead` like `-1h`, a
  department precall like `-30m`) → the resolved time (`DayTimesGlide` / `CrewTableGlide`). Guard the
  commit with `isSeededNoop(prior, seed, value)` before writing an override, or Enter/blur on an
  unchanged cell pins a spurious override.
- **Range fill** (roadmap 139): committing a single edit while a multi-cell selection is active writes
  that value to every writable cell in the selection as ONE commit. `expandRangeFill`
  (`src/lib/glidePaste.ts`) builds the edits; `InlineGlideTable.onCellsEdited` expands them and
  `editableKeys` is the compatibility filter (read-only IDs / names / `actions` are skipped). The
  two whole-grid engines fill only the EDITED COLUMN (their columns are heterogeneous) and exempt
  entity/category columns: `BreakdownTabGlide.onCellEdited` also exempts scene numbers, and
  `GlideGridShell` (`src/lib/glideShell.tsx` — Crew Glide / Locations Glide) exempts `kind:'category'`
  columns and the add row. Both wrap the per-row `commitEdit` calls in
  `BATCH_START`/`BATCH_COMMIT`. Paste arrives as many edits and is never expanded; the fill handle
  copies the same value, so its outcome is unchanged.
