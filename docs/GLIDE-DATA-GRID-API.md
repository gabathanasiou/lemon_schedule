# Glide Data Grid — upstream API field guide

Status: **read this before building a grid or debugging canvas behaviour.** Covers
the library itself (`@glideapps/glide-data-grid`, vendored at 6.0.4-alpha24).
App war stories: `docs/GLIDE-BREAKDOWN.md`; unused features + storybook tour:
`docs/GLIDE-FEATURE-CATALOGUE.md`; kit wrapper: `../ui-kit/docs/GLIDE-API.md`.
The vendored typings win when this file disagrees.

Official docs: <https://docs.grid.glideapps.com/> ·
full index: <https://docs.grid.glideapps.com/llms.txt> ·
storybook: <https://glideapps.github.io/glide-data-grid>

## 1. Mental model

Glide is a **canvas** grid, not a virtualized DOM table. There is no element per
cell, so:

- the grid never owns your data — it asks for one cell at a time through
  `getCellContent` and tells you when the user edited one;
- nothing repaints by itself when your data changes — either render a new
  `getCellContent` identity (whole-grid redraw) or invalidate cells with the
  ref's `updateCells`;
- an editor is a **DOM overlay** positioned over the canvas, normally portalled
  into `#portal`; controls painted into cells are drawings, not DOM;
- coordinates are always `[col, row]`, never `[row, col]`; a row-marker gutter
  is **not** a column, so data indexes are unchanged but some callbacks offset.

Three props are mandatory:

```tsx
<DataEditor
  columns={columns}          // memoized GridColumn[]
  rows={rows.length}
  getCellContent={getCellContent} // memoized (col,row) => GridCell
/>
```

Plus the two page-level requirements that are easy to forget:

```html
<!-- Glide's overlay portal, last child of <body> -->
<div id="portal" style="position: fixed; left: 0; top: 0; z-index: 9999;"></div>
```

```ts
import "@glideapps/glide-data-grid/dist/index.css"; // without it the grid has zero height
```

The grid needs a size: `width`/`height` (number = px, or any CSS size) or a
sized parent. `height: "100%"` only works if the parent actually has height.

## 2. Data & measurement props

| Prop | Type | Notes |
| --- | --- | --- |
| `columns` | `readonly GridColumn[]` | Memoize. `title` + `id` (stable, not the index) are the minimum; `width` makes `id` optional. |
| `rows` | `number` | Total row count. |
| `getCellContent` | `(cell: Item) => GridCell` | Memoize. Called for visible cells (and offscreen cells once copy is enabled). |
| `rowHeight` | `number \| (index) => number` | Default 34. Variable rows supported. |
| `headerHeight` | `number` | Default 36. |
| `groupHeaderHeight` | `number` | Defaults to `headerHeight`. |
| `width` / `height` | `number \| string` | Grid size. |
| `freezeColumns` | `number` | Frozen left columns, always visible. |
| `freezeTrailingRows` | `number` | Frozen bottom rows. |
| `overscrollX` / `overscrollY` | `number` | Scrollable space past the content (useful for resizing the last column / leaving breathing room). |
| `initialSize` | `[number, number]` | Skips the first-paint measurement flicker. |
| `minColumnWidth` / `maxColumnWidth` | `number` | Default max 500; values below 50 clamp to 50. |
| `maxColumnAutoWidth` | `number` | Caps auto-sizing; defaults to `maxColumnWidth`. |
| `scaleToRem` | `boolean` | Scales theme metrics with the root font size. |
| `verticalBorder` | `boolean \| (col) => boolean` | Per-column left border. |
| `getCellsForSelection` | `true \| (rect, abortSignal) => CellArray \| (() => Promise<CellArray>)` | Enables copy and offscreen inspection. `true` reuses `getCellContent`. |

`GridColumn` also supports `group`, `icon`, `overlayIcon`, `hasMenu`, `style`,
`grow`, `themeOverride` and per-column `trailingRowOptions`.

## 3. Editing lifecycle

Cells opt in with `allowOverlay: true` (show the editor/preview) and
`readonly: false` (accept changes). `allowOverlay: false` still permits
type-to-edit where a renderer allows it; the two flags are independent.

1. The user activates a cell (double-click, Enter/Space, or type-to-open) and
   Glide raises `onCellActivated` / opens the overlay.
2. `provideEditor(cell)` returns a component (or `{ editor, ... }`) whose props
   include `value`, `onChange`, `onFinishedEditing`, `isHighlighted`,
   `initialValue`, `validatedSelection`, `forceEditMode` and `portalElementRef`.
3. `onChange` updates the in-editor value. `onFinishedEditing(newValue,
   movement)` closes the overlay; `movement` is `[-1|0|1, -1|0|1]`. Passing no
   value = cancel/discard.
4. Glide then calls `onCellEdited(cell, newValue)` — or `onCellsEdited(edits)`
   for a batch (paste/fill). Returning `true` from `onCellsEdited` suppresses
   the per-cell callbacks.
5. You write the value; the grid re-reads it from `getCellContent`. Nothing is
   cached by Glide.

Related props:

| Prop | Purpose |
| --- | --- |
| `onCellEdited` / `onCellsEdited` | Commit one / a batch. Batch is one commit for undo and storage. |
| `validateCell` | Return `false` to reject (shows invalid state) or a cell to coerce the value. |
| `coercePasteValue` | Transform a pasted string per target cell. |
| `onDelete` | Return `false` to block, `true` to delete the selection, or a replacement `GridSelection`. |
| `onFillPattern` | `preventDefault()` to replace the fill handle's behaviour. |
| `onRowAppended` | Enables the trailing add row. Return `"top"`/`"bottom"`/an index to control placement. |
| `trailingRowOptions` | `hint`, `addIcon`, `sticky`, `tint`, `targetColumn` (grid level); `themeOverride`, `disabled` (column level). |
| `onDeleteRows` | Absolute row indexes after a row deletion gesture. |

**The editor's value contract is the #1 source of app bugs:** the overlay opens
on `cell.data`, never `displayData`. Computed cells that need to edit the
displayed value must put it in `data` (our `seededTextCell` helper does this)
and suppress "open + Enter" no-op commits so a seed never becomes a stored
override.

## 4. Selection

```ts
interface GridSelection {
  current?: { cell: Item; range: Rectangle; rangeStack: readonly Rectangle[] };
  columns: CompactSelection;
  rows: CompactSelection;
}
```

- `current.cell` gets the focus ring; `current.range` always includes it and is
  what copy/delete/fill act on; `rangeStack` holds extra ranges in
  `range-select: "multi-rect"` mode.
- `rows` / `columns` are explicit row/column selections, separate from a range
  that merely covers them. `CompactSelection` is a sparse set: iterate it, or
  use `first()`/`last()`/`hasIndex()`; avoid `toArray()` on huge selections.
- Selection is **controlled**: pass `gridSelection` and echo
  `onGridSelectionChange` back, or the grid appears frozen.
- `rangeSelect`: `"none" | "cell" | "rect" | "multi-cell" | "multi-rect"`
  (default `rect`). `columnSelect` / `rowSelect`: `"none" | "single" | "multi"`.
- `*SelectionBlending`: `"exclusive"` (default — selecting one kind clears the
  others) or `"mixed"`.
- `drawFocusRing`, `fillHandle`, `spanRangeBehavior` (`"default"` inflates a
  range to include full spans; `"allowPartial"` does not), `highlightRegions`
  (colour + rect, `style: "dashed" | "solid" | "no-outline" | "solid-outline"`;
  opacity blends), `onSelectionCleared` (Escape), `rowSelectionMode`.
- Row markers: `rowMarkers` (`number`, `checkbox`, `both`,
  `clickable-number`, …), `rowMarkerWidth`, `rowMarkerStartIndex`,
  `rowMarkerTheme`. Always frozen; they do not shift column indexes.

**Rectangle bounds are exclusive**: iterate `x < rect.x + rect.width`, never
`<=`. Our peer-selection and fill code depend on this.

## 5. Clipboard, fill, delete

- Copy is off until `getCellsForSelection` is supplied. It is called with the
  selection rectangle (possibly offscreen) and must return row-major
  `CellArray`, or a thunk for async data. `copyData` on a cell overrides what
  that cell contributes; `copyHeaders` includes headers.
- Paste: `onPaste={true}` reuses `onCellEdited`; a callback receives the parsed
  `values` matrix and may return `false` to handle it itself. The grid never
  appends rows for an oversized paste — return `false` and grow the data first.
- `allowedFillDirections` (`"horizontal" | "vertical" | "orthogonal" | "any"`)
  and `onFillPattern` govern the fill handle. `Ctrl/Cmd+D` / `Ctrl/Cmd+R` are
  opt-in keybindings (`downFill` / `rightFill`); copy/cut/paste/delete/clear
  are built in.
- `onDelete` is the single hook for clearing a selection; it can rewrite the
  target selection before deletion.

Our app deliberately owns clipboard parsing for ranges (`lib/glidePaste.ts`,
`lib/glideCells.ts`) so a paste is one batched commit and synthetic columns
(actions, info, disclosure) never leak into the buffer.

## 6. Styling & drawing

- `theme` is a flat `Partial<Theme>`; missing keys come from the default theme.
  Theme keys map to CSS variables (`--gdg-*`) and include `accentColor`,
  `accentFg`, `accentLight`, `textDark/Medium/Light/Bubble/Header`, `bgCell`,
  `bgCellMedium`, `bgHeader*`, `borderColor`, `cellHorizontalPadding`,
  `baseFontStyle`, `fontFamily`, `editorFontSize`, `lineHeight`.
- Precedence: cell `themeOverride` > `getRowThemeOverride(row)` > column
  `themeOverride` > grid `theme`. Cheaper to style higher in that tree; the row
  callback runs per paint, so keep it pure and fast (memoize by row key).
- `getRowThemeOverride` returning `{ bgCell, bgCellMedium, textDark }` paints a
  band across the whole row, including action columns.
- `drawCell(args, drawContent)` wraps a cell's paint: draw background, call
  `drawContent()` for the stock paint, then embellish. `drawHeader` does the
  same per header. Both receive canvas context, theme, rect, hover state and
  sprite manager.
- `customRenderers` register custom cell kinds: `isMatch`, `draw`, optional
  `measure`, `provideEditor`, `needsHover`/`needsHoverPosition`, `onClick`,
  `onSelect`, `onDelete`, `onPaste`. Custom cells are `kind: GridCellKind.Custom`
  and require `copyData`.
- Canvas cannot read CSS variables. Resolve app tokens to concrete colour
  strings before passing a theme (our `createGlideTheme` does this).
- Row markers use `rowMarkerTheme`; `headerIcons` maps names to SVG-string
  factories taking `{ fgColor, bgColor }`; `rightElement` / `rightElementProps`
  mount a DOM node at the end of the scroll region (sticky or filling).

## 7. Input, search, drag & drop

- Cell/header events: `onCellClicked`, `onCellActivated` (double-click,
  Enter/Space), `onCellContextMenu`, `onHeaderClicked`,
  `onHeaderContextMenu`, `onHeaderMenuClick`, `onItemHovered`, `onMouseMove`,
  `onKeyDown`/`onKeyUp`, `onVisibleRegionChanged(range, tx, ty, extras)`.
- Column/row mutation: `onColumnResize(Start/End)`, `onColumnMoved`,
  `onRowMoved`. You must apply the new width/order to `columns`; the grid only
  reports the gesture. `remeasureColumns` recomputes auto widths.
- Search: set `showSearch`, optionally control `searchValue` /
  `searchResults`, and observe `onSearchValueChange`,
  `onSearchResultsChanged`, `onSearchClose`. Ctrl/Cmd+F is the usual trigger;
  the grid only renders the box.
- Drag & drop: `isDraggable`, `onDragStart`, `onDragOverCell`, `onDrop`,
  `onDragLeave`.
- `keybindings` overrides are string accelerators or `false` (e.g.
  `{ downFill: "Ctrl+Shift+D" }`).

## 8. Imperative ref (`DataEditorRef`)

| Method | Use |
| --- | --- |
| `updateCells([{ cell: [c, r] }, …])` | Invalidate specific cells without changing callback identity. |
| `getBounds(col?, row?)` | Screen-space rect of a cell (or the scroll area). Stale for one frame during a scroll. |
| `scrollTo(col, row, dir?, paddingX?, paddingY?, options?)` | Scroll by cell or `{ amount, unit: "cell" \| "px" }`; optional alignment. |
| `appendRow(col, openOverlay?)` | Append through the trailing row and optionally open its editor. |
| `remeasureColumns(selection)` | Recompute auto widths (expensive). |
| `focus()` | Focus the grid. |
| `emit("copy" \| "paste" \| "delete" \| "fill-right" \| "fill-down")` | Run a keyboard command. |

Our fork adds `getContentBounds(col?, row?)` — the cell rect in **content**
space (scroll-independent), used by the DOM-cell layer because `getBounds` lags
a paint during scroll.

## 9. Cell kinds

Every cell extends `BaseGridCell`: `allowOverlay`, `lastUpdated` (a
`performance.now()` stamp that flashes the cell), `style: "normal" | "faded"`,
`themeOverride`, `span`, `contentAlign`, `cursor`, `copyData`,
`activationBehaviorOverride` (`"double-click" | "single-click" |
"second-click"`).

| Kind | Shape highlights |
| --- | --- |
| `Text` | `data`, `displayData`, `readonly?`, `allowWrapping?`, `selectionRange?`, `hoverEffect?` |
| `Number` | `data: number \| undefined`, `displayData`, `fixedDecimals?`, `allowNegative?`, `thousandSeparator?`, `decimalSeparator?` |
| `Boolean` | `data: boolean \| BooleanEmpty \| BooleanIndeterminate`, `allowOverlay: false`, `maxSize?` |
| `Uri` | `data`, `displayData?`, `onClickUri?`, `hoverEffect?` |
| `Image` | `data: string[]`, `displayData?`, `rounding?` |
| `Bubble` | `data: string[]` (read-only) |
| `Drilldown` | `data: { text; img? }[]` (read-only) |
| `Markdown` | `data` (rendered in the overlay) |
| `RowID` | `data: string` |
| `Protected` | no data — draws stars |
| `Loading` | `skeletonWidth?`, `skeletonHeight?`, `skeletonWidthVariability?` |
| `Custom` | `data`, required `copyData`; needs a registered renderer |

`selectionRange` is typed (`number | [start, end]`) but undocumented upstream;
it seeds the editor's selection and is how `seededTextCell` makes typing
replace a computed value.

## 10. Custom cells & editors

A custom renderer is one object:

```ts
const renderer: CustomRenderer<MyCell> = {
  kind: GridCellKind.Custom,
  isMatch: (c): c is MyCell => c.data.kind === "my-cell",
  draw: (args, cell) => { /* canvas paint; return void */ },
  measure: (ctx, cell, theme) => number,        // optional auto width
  provideEditor: () => EditorComponent,          // optional
  onClick: ({ cell, posX, posY, bounds, preventDefault }) => cell | undefined,
};
```

Register with `customRenderers={[renderer]}`. `draw` must not rely on DOM or
layout; use `measureTextCached` and the theme's metrics. A renderer that needs
pointer position sets `needsHoverPosition`; hover state arrives as
`hoverX`/`hoverY` plus `hoverAmount`.

`provideEditor` must be a **stable function identity**. Returning a fresh
component type on every render remounts an open overlay and drops keystrokes.
Keep live config in a ref rather than a dependency.

Column-level editor gotcha: `provideEditor` receives the grid column index,
which includes the row-marker gutter. With markers, `dataCol = col - 1`.

## 11. Performance rules

- Memoize `columns`, `getCellContent`, `provideEditor`, `getRowThemeOverride`
  and `customRenderers`. An unstable identity redraws the whole grid.
- `getCellContent` is a hot path: no allocations where avoidable, no heavy
  computation, no state updates. Build cells from cheap lookups/maps.
- Prefer `updateCells` for a handful of changed cells over a new callback
  identity.
- `getCellsForSelection` loosens the "visible only" guarantee — implement it
  deliberately if the data source is lazy.
- Avoid per-cell `themeOverride` when a row or column theme will do; keep
  `draw` free of layout reads and font parsing (cache measured strings).
- Use `onVisibleRegionChanged` to drive external data loading; it is called on
  scroll, so debounce work.
- Millions of rows are fine; rows are fetched on demand.

## 12. Our runtime: fork, wrappers, kit

- **One runtime.** `vite.config.ts` + `tsconfig.json` alias
  `@glideapps/glide-data-grid` (and its CSS) to `vendor/glide-data-grid/dist/…`,
  pinned `6.0.4-alpha24`. The npm entry stays only for the kit's peer contract;
  nothing resolves to it.
- **Fork deltas** (full list: `vendor/glide-data-grid/README.md`):
  `DataEditorWithDomCells` with `getDomCell`/`getDomHeaderCell`; same-frame
  scroll paint; `getContentBounds`; editor chrome matching the cell; header
  selection tint across a range; source maps stripped.
- **Wrapper choice** — do not add a fourth:
  - full-page database grids → `GlideShell` (`src/lib/glideShell.tsx`);
  - the Breakdown → `BreakdownTabGlide.tsx`;
  - compact grids inside cards/modals → `InlineGlideTable`;
  - kit playground/internal → `GlideSheet` (not a published entry).
- **Painted cells** come from `@gabriel/ui-kit/glide-controls`
  (`kitPickerCell`, `kitGlyphCell`, `kitGlyphGroupCell`,
  `controlCellRenderers`); editors come from `createGlideCellEditor`.
  Both keep Glide external so the app owns the single runtime.
- **Overlay layer.** A grid inside a modal needs its own
  `[data-glide-overlay-layer]` above the dialog (z-index 10001, pointer events
  re-enabled) or the editor renders under the dialog and Radix steals focus.

## 13. Debugging checklist

| Symptom | First suspect |
| --- | --- |
| Blank grid / zero height | Missing `dist/index.css`, or no sized parent. |
| Stale cells after a data change | New `getCellContent` identity or `updateCells` missing. |
| First keystroke after load is swallowed | Lazy overlay chunk still fetching; preload it (our `@glide-overlay-editor` boot import). |
| Typing resets to the seed after each key | `provideEditor` identity changing; editor remounting. |
| Double-click editor closes instantly | Outside-close handler treating the second mouseup as an outside click. |
| Editor invisible inside a modal | Overlay portal below the dialog; focus trapped by the dialog. |
| Wrong column edited | Row-marker offset (`col - 1`) not applied. |
| Range off by one | Exclusive `Rectangle` bounds. |
| Selection doesn't stick | `onGridSelectionChange` not echoed into `gridSelection`. |
| “q” saved instead of `EXT` | Type-to-open key committed as a value; strict pickers must only commit catalogue values. |
| Scroll paint lags on Safari | Stock deferred render; our fork commits the visible region in `flushSync`. |

## 14. Minimal recipes

Read-only grid:

```tsx
const columns = useMemo<GridColumn[]>(() => [
  { title: "Name", id: "name", width: 180 },
  { title: "Role", id: "role", width: 140 },
], []);
const getCellContent = useCallback(([col, row]: Item): GridCell => {
  const rowData = rows[row];
  const key = col === 0 ? "name" : "role";
  return { kind: GridCellKind.Text, data: rowData[key], displayData: rowData[key], allowOverlay: false };
}, [rows]);
```

Editable cell commit:

```tsx
const onCellEdited = useCallback(([col, row]: Item, next: EditableGridCell) => {
  if (next.kind !== GridCellKind.Text) return;
  updateRow(row, { [keyFor(col)]: next.data }); // then the grid re-reads getCellContent
}, []);
```

Painted action cell:

```tsx
getCellContent={([, row]) => kitGlyphCell({
  icon: "trash", label: `Delete ${rows[row].name}`,
  tone: "danger", onActivate: () => deleteRow(row),
})}
customRenderers={controlCellRenderers}
```

Row band from data: `getRowThemeOverride={useCallback((row) => rowThemeFor(rows[row]), [rows])}`.

## 15. Verify

- Pure selection/clipboard/fill logic → Vitest; never assert it again in e2e.
- E2E only for silent breaks: data loss, wrong committed value, persistence,
  cross-window sync. Canvas looks → numbered manual check (`docs/TESTING.md`);
  geometry tests read `data-column-widths`, never painted pixel positions.
- The kit's own Glide grid has `ui-kit` unit + playground coverage; app
  regressions usually surface in `e2e/glide-*`, `crew-glide`, `locations`,
  `day-times-glide`, `budget`.

## Reference index

- Welcome/quick start — <https://docs.grid.glideapps.com/welcome-to-glide-data-grid.md>
- DataEditor props — <https://docs.grid.glideapps.com/api/dataeditor.md>
- Cells — <https://docs.grid.glideapps.com/api/cells.md>
- Common types (GridColumn/Cell/Selection/Theme) — <https://docs.grid.glideapps.com/api/common-types.md>
- DataEditorRef — <https://docs.grid.glideapps.com/api/dataeditorref.md>
- Custom cells guide — <https://docs.grid.glideapps.com/guides/implementing-custom-cells.md>
- FAQ (why canvas, SSR, sorting/filtering) — <https://docs.grid.glideapps.com/faq.md>
- Our app manual — `docs/GLIDE-BREAKDOWN.md`
- Kit wrapper API — `../ui-kit/docs/GLIDE-API.md`
