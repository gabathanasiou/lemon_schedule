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
- **Range fill** (roadmap 139/144): committing a single edit while a multi-cell selection is active
  writes that value as ONE commit. `expandRangeFill` (`src/lib/glidePaste.ts`) builds the edits;
  `InlineGlideTable.onCellsEdited` expands them across the selection and `editableKeys` is the
  compatibility filter (read-only IDs / names / `actions` skipped). The two whole-grid engines fill
  only the EDITED COLUMN — VERTICAL, never sideways — because their columns are different kinds, so
  an entity value (Set, Cast, Role, a category) can never leak into I/E or Phone:
  `BreakdownTabGlide.onCellEdited` (also exempts scene numbers) and `GlideGridShell`
  (`src/lib/glideShell.tsx` — Crew Glide / Locations Glide, also exempts the add row). Both wrap the
  per-row `commitEdit` calls in `BATCH_START`/`BATCH_COMMIT`; new elements/categories/roles dedupe,
  so filling a brand-new value creates ONE item (and one cast-naming modal).
- **Multi-value confirm** (roadmap 144): a comma-list column (`isMultiValue(...)` in the scenes grid;
  a `multiValue` flag on the shell column — crew *Element Categories*) REPLACES every selected row's
  whole list, so a >1-row spread opens `useDialog().confirm` first (`danger`, no suppress): Confirm
  runs the batch, Cancel keeps the edit on just the edited cell. Single-value entity columns
  (Set / I/E / D/N, Role, Type) fill directly. Paste is NOT confirmed (a 2D block is fuzzier) — the
  fill handle copies the same value, so its outcome is unchanged. **Element links fold into this ONE
  confirm** (roadmap 180): `useLinkedEditGuard.collectRemovals` previews the linked elements the
  fill's removed anchors would cascade out, the message lists them, and the batch runs with
  `{ cascadeRemovals: true }` so the guard applies the cascade INLINE — one prompt and one undo entry
  (never a per-row guard dialog dispatching outside the batch). A single-value fill that would remove
  linked anchors gets the same one-shot prompt before running.
- **ONE stable `provideEditor` per grid lifetime** (roadmap 149): build it with
  `createGlideCellEditor(() => optsRef.current)` from a ref, never as a `useMemo` on config
  identities. Recreating the callback recreated the cached editor components → Glide remounted the
  OPEN overlay on every parent re-render (Shift's `setShiftHeld`, keystrokes via state) and typing
  reset to the seed. Call sites: `InlineGlideTable`, `BreakdownTabGlide`, `glideShell`.
- **Double-click activation vs. the editor's outside-close** (roadmap 180): Glide's permissive
  double-click detection (any two mouseups <500ms apart) can activate the editor on the FIRST mouseup
  of a double-click, so the second mousedown lands just after the EntityDropdown mounted and would
  close it (outside `pointerdown`) or blur-commit it. `useDropdown` (`src/lib/dropdown.ts`) tracks the
  opening pointerdown and swallows an outside press that is within a few px of it inside the
  double-click window (`DOUBLE_CLICK_MS`/`DOUBLE_CLICK_SLOP_PX`) — both the close and the default
  focus change — so the gesture never dismisses the editor it opened. Fast clicks elsewhere are
  untouched. Without this the grid is dead to double-click edits after an edit + dialog (typing/Enter
  still worked, which is how the e2e caught it).
- **`kind: 'text'` editors** (crew Glide Name, `uppercase: true` via `GlideColumnDef.uppercase`):
  a plain input, because Glide's built-in editor is unavailable to custom columns. It focuses on
  mount, selects the value when the overlay was opened on the stored value, uppercases live per
  keystroke, and re-takes focus on blur (Glide's a11y cell can steal it right after opening, e.g.
  the trailing add row). Enter commits like the entity dropdown (canvas keeps focus, arrows
  keep navigating) instead of Glide's clip region moving the selection to the a11y cell.
- **The overlay text matches the cell's alignment** (item 223): `contentAlign` is canvas-draw-only
  and Glide's stock TextCell editor ignores it, so centered/right cells used to edit left-aligned.
  `createGlideCellEditor` now styles the overlay: a configured `kind:'text'` editor inherits the
  column's `align` on its input, and a centered/right column with NO configured editor gets Glide's
  own `TextCellEntry` re-wrapped with `style={{ textAlign }}` (`cfg: null` in the per-column editor
  box) — the stock textarea, the `seededTextCell` selection (`validatedSelection`) and the
  `#portal textarea` contract all stay intact. Left columns keep the untouched default editor, so
  `InlineGlideTable` ALWAYS supplies `provideEditor` (its opts ref is never null).
- **Grids INSIDE a modal get their own overlay layer** (roadmap 155): the shared `#portal` sits at
  z-9999, BELOW modal content (z-10000), so a cell editor in a modal (Call Times → Crew template)
  rendered invisible/unclickable. `InlineGlideTable` creates a `[data-glide-overlay-layer]` element
  (fixed 0,0, z-10001, pointer-events re-enabled — Radix modal mode sets body `pointer-events:none`)
  and `stopPropagation`s its own focus events, plus a document-capture guard for the focusout fired
  on the dialog when focus moves INTO the layer — Radix's FocusScope otherwise yanks focus back on
  every keystroke (edit-on-type re-opened the cell per key: "only one character sticks").
  `useEscapeCapture` (`src/lib/dropdown.ts`) listens on the WINDOW capture phase so a dropdown's Esc
  always beats the dialog's document listener, regardless of mount order. The Glide editors pass
  `onEscape` into EntityDropdown/AutocompleteDropdown (`createGlideCellEditor`): one Esc closes the
  dropdown AND cancels the whole cell-edit overlay (`onFinishedEditing(undefined, [0,0])` — no
  commit), so the edit popout never lingers.
