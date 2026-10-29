# Glide Breakdown — Agent Manual

Status: **read this before touching the Glide breakdown grid (`BreakdownTabGlide.tsx`) or
`InlineGlideTable`.** These are hard-won gotchas; the canvas is opaque to the DOM and does not
auto-repaint.

## Kit runtime + painted control cells (experiment branch `experiment/kit-glide`)

- **One grid runtime:** every grid resolves `@glideapps/glide-data-grid` to the kit's vendored fork
  (`vendor/glide-data-grid`, aliased in `vite.config.ts` + `tsconfig.json`). The npm package stays in
  `package.json` for the kit's peer contract, but NOTHING resolves to it. The fork carries the DOM
  cells, same-frame scroll paint and content-space bounds from kit `docs/GLIDE.md`.
- **Row actions are painted, not DOM:** `kitGlyphCell` from
  `@gabriel/ui-kit/glide-controls` (the lean subpath; it keeps Glide EXTERNAL so the app owns the one
  runtime). The Breakdown's action column is **trash only**; adding a row is Glide's **trailing
  phantom row** (the add button lives on the Scene # column, never the trash column — otherwise the
  new row's trash lands under the pointer and the same click deletes it). Pressing that add button
  appends and Glide opens the Scene # editor on the new row (native `onRowAppended`, no manual
  scroll); `overscrollY` leaves the playground's space under the last row. The **Crew and Locations
  Glide pages use the same phantom trailing row** (add button on the first editable column,
  `onRowAppended` creates the blank entity and Glide opens the clicked cell); `InlineGlideTable` and
  `GlideGridShell` row actions use the same painted cells.
- **The Breakdown has NO picker chevrons:** its entity columns are plain text cells (double-click /
  type opens the app editor). `InlineGlideTable` wraps entity/enum cells in `kitPickerCell` so the
  crew tables (Person, Report To) and the Day Manager Locations grid show the dropdown chevron.
  I/E and D/N use the app entity picker (`allowFreeText: false`) — the kit PickerField panel, not the
  old AutocompleteDropdown, so it matches the playground.
- **Crew Glide category pickers:** the Role column is an **accordion grouped by department**
  (`crewRoleGroup` + `departmentOrder`) over a **fixed catalogue** — no "Add …" row; new roles come
  from the Crew Manager. The Element Categories multi-select is also fixed (`allowFreeText: false`) —
  typing an unknown category shows "No matches". Location type categories stay flat and can still be
  created from the grid.
- **Kit dependency:** `@gabriel/ui-kit` is the released **v0.1.173** GitHub tag (the kit's Glide
  branch merged into kit main; `./glide-controls` built with Glide external).
- **Verify:** `e2e/glide-breakdown`, `crew-glide`, `day-times-glide`, `locations`,
  `glide-clipboard`, `glide-first-edit` (the last one catches the type-to-open first-key swallow).

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
- **NEW rows run the element guard too** (roadmap 255): `BreakdownTabGlide.ensureElements` calls the
  shared `addNewElements` (`src/lib/newCastNaming.tsx`) for an existing row's edit AND for the rows
  the ADD ROW and a PASTE create — a cast NAME typed into the add row used to land raw in
  `scene.cast` with no member and no naming modal. Never dispatch `ADD_SCENE` with entity values
  without it; the stripboard and Scene Sheet commit paths call the same helper, so cast rules live
  in exactly one place.
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
- **`kind: 'time'` editors** (roadmap 301 sweep): call-time / precall / crew-call columns
  pass `{ kind: 'time' }` (`DayTimesGlide` stage keys, `PrecallsGlide` editable keys,
  `CrewRosterEditor` `call`). Desktop keeps Glide's stock `TextCellEntry` (the same
  textarea + seeded selection + alignment contract); touch opens the shared
  `TimeKeypad` (`src/components/TimeKeypad.tsx`, also used by `TimeField`) instead of the
  OS keyboard. The keypad renders into the grid's `#portal` and carries
  `click-outside-ignore`, so Glide's `ClickOutsideContainer` does not close the cell
  overlay on the first key; commit writes through the normal `onFinishedEditing` path.
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

## Row filter (roadmap 172)

Every Glide page has one row filter in its toolbar — `GlideFilter`
(`src/components/GlideFilter.tsx`) wrapping the kit **`MorphSearchField`**: a
`Filter` button that morphs into the text field. The term survives collapsing
(click into the grid and the toolbar stays compact with the filter applied and a
`shown / total` count); Escape clears + collapses; click-away only collapses.
While active the collapsed button **names the term** and swaps its magnifier for
a funnel (no accent tint); the expanded field's leading icon matches.

- **Semantics**: comma-separated tags, ALL must match (AND), case-insensitive —
  the same `parseSearchTags` as the manager search. The Breakdown matches
  **EVERY scene field** (`sceneFilterValues`, `src/lib/glideFilter.ts`), not
  just the columns currently on screen: hidden/custom breakdown categories,
  sheet/script-page numbers, the scene location, unit/sequence, etc. Only
  internal ids and the script-anchored `cutAnchor` are excluded — "everything
  except the actual script". Cast contributes `id name` so the displayed Board
  ID + performer name both search. Rows are never reordered.
- **Smart tags** (`src/lib/glideFilterVocabulary.ts`): a tag that exactly equals
  a project value is matched as a **WHOLE WORD**, not a substring. The
  vocabulary is DERIVED, never a literal list:
  - Colors: `colorPalette.intExtOptions` / `dayNightOptions` and the scene-colour
    matrix values (+ any I/E or D/N value actually used on a scene, for legacy
    imports).
  - Database: every cast member and breakdown-element name (all categories,
    including custom ones).
  - Locations: the Locations DB names.
  Everything else stays SUBSTRING, so partial names/sets still work. On the
  seed: `INT` → 77 (the real INT scenes; not the 126 rows "into"/"point" would
  add), `night` → 77 (not "Overnight"), `day` → 69 (one genuine standalone
  "day"), while `drug` → 8 (DRUGSTORE) and `main street` → 8 (both sets).
  Comma tags classify individually, then AND (`int, night` → 36). Crew and
  Locations Glide keep substring matching — their rows are name lists where
  partial typing is the point.
- **Display-only**: `allRows`/`allScenes` still feed Info counts, CSV export
  and the project; the grid indexes the FILTERED list everywhere
  (`rowsRef`/`scenesRef`). Editing, range fill, copy/cut/paste, delete and peer
  selections therefore act on the visible row objects — no stale-index edits.
  A new/pasted row may not match the active filter; it appears when the filter
  clears (never silently mutated to fit).
- **Breakdown specifics**: grid row → project index goes through
  `actualSceneIndex` for the Scene Sheet / pop-out (`openSheetAt`), and
  Insert/Duplicate map the visible anchor back into `project.scenes`.
  Data-list dropdowns (`setItems`, `castItems`) and the scene-number collision
  guard use the FULL list, never the filtered one.
- **Presence**: a peer row filtered out locally hides its highlight — never
  clamp it onto a different visible row.
- **Multiplayer**: filters are per-user view state, published as
  `PresenceView.glideFilter` through `useFollowView`. While following someone,
  your matching Glide page mirrors their query (and clears when they clear
  it); typing your own re-syncs on the leader's next view change. Filters never
  enter project data. See `docs/PRESENCE.md` §Follow.
- **Verify**: `src/lib/__tests__/glideFilter.test.ts` (tags/AND/display values,
  smart vocabulary + whole-word matching) + `e2e/glide-breakdown.spec.ts` and
  `e2e/crew-glide.spec.ts` "row filter" cases (counts change, smart term stays
  below the substring count, clearing restores, project ids unchanged).

## Peer selection highlights (roadmap 234)

Every Glide grid participates in peer-selection presence through ONE shared seam — never per-surface
copies:

- **`useGlidePeerSelection({ scope, selection, rowKeys, colKeys })`**
  (`src/lib/useGlidePeerSelection.ts`) publishes this instance's selection (via the presence
  channel's throttled/idle-skipped `selection` broadcast) and resolves the peers' selections for the
  same scope into Glide's native `highlightRegions` (peer colour fill + solid ring). Geometry lives
  in `src/lib/glideSelection.ts` (`effectiveGridRange` — also the shared copy/cut/clear rectangle —
  plus the wire encode/decode and `withAlpha`); wire shapes + parsers in
  `src/lib/supabase/presence.ts` (`PresenceGridSelection`, `parseSelectionPayload`, `selectionKey`).
- **`scope` names the LOGICAL grid, never the instance** — `breakdown-glide`, `crew-glide`,
  `locations-glide`, `day:<sectionIndex>:times:<category>`, `day:<sectionIndex>:crew:<dept>`,
  `callsheet:<sectionIndex>:…`. It must match across clients; the day/place identity in the scope is
  what keeps the highlight off a different day's table (there is no separate same-view gate).
- **Every mounted instance renders its own highlights with its own geometry**, so the highlight is
  correct through differing scroll/column widths/font scale and shows in pop-out windows and
  portalled canvases too; a selection made in ANY instance publishes (newest window wins per user).
- **Lifecycle**: deselect, `window.blur`, a hidden document and unmount all publish the clear edge;
  only the instance that last held a non-empty selection may clear (owner check in the presence
  provider), so closing one window never wipes another window's live selection. A closed window's
  selection is pruned by clientId on the next presence sync.
- **Opt-out**: omit `presenceScope` (`InlineGlideTable`) / `GlideShellConfig.presenceScope`
  (required there) — used for grids that live in a modal (template editors).
- Ranges are GRID/data coordinates; never add the row-marker offset yourself (Glide shifts
  `highlightRegions` internally). `Highlight.style: 'solid'` = fill + solid outline.
- Verify: pure helpers are Vitest (`src/lib/__tests__/glideSelection.test.ts`,
  `presence.test.ts`); the two-window harness (`workers/rooms/test/two-window-repro.mjs`, the
  selection section) drives a real drag-select in one window and asserts the other receives the
  frame AND paints the peer colour on the grid canvas (clears on the tab switch); the visual
  look is a rule-7 manual pass (docs/PRESENCE.md).
- DOM surfaces (stripboard rows, Calendar cards, Report Designer blocks/columns, Ribbon Designer
  cells — roadmap 234 stage 2) ride the SAME `selection` frame with an item-id list and their own
  renderer (`PeerItemOutlines`, `src/lib/itemSelection.ts`); this hook owns the grid rectangle half
  only — see docs/PRESENCE.md §Peer selection highlights (DOM surfaces).

