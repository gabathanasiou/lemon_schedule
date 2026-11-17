# Glide Data Grid — features we don't use (yet)

Status: **read with `docs/GLIDE-DATA-GRID-API.md`** before adding a grid feature
by hand. This is the capability catalogue taken from the official storybook
(`6.0.4-alpha25`, one patch ahead of our vendored `6.0.4-alpha24`): what Glide
already does, what we currently use, and where the gaps could pay off. It is a
menu, not a plan — nothing here is scheduled.

Storybook: <https://glideapps.github.io/glide-data-grid/?path=/story/>
Source of every demo: `packages/core/src/docs/examples/*.stories.tsx` in
[`glideapps/glide-data-grid`](https://github.com/glideapps/glide-data-grid).

## 1. What we already use

| Capability | Where |
| --- | --- |
| Text cells + custom painted cells | Breakdown, Crew, Locations, Budget, Day Manager, kit `glide-controls` |
| `span` | Budget header bands (`BudgetGrid` `HEADER_SPAN`) |
| `Boolean` cell | Locations "master" column |
| Custom `provideEditor` (pickers, time keypad, text) | `createGlideCellEditor`, all grids |
| Selection, copy/cut/paste, fill handle | `BreakdownTabGlide`, `InlineGlideTable`, `GlideShell` |
| Trailing add row (`onRowAppended`, `trailingRowOptions`) | Breakdown / Crew / Locations |
| Row markers (object form, `clickable-number`, start 1) | Breakdown / `GlideShell` |
| Frozen first column | Breakdown / `GlideShell` |
| Column resize + persisted widths | `useGlideColumnWidths` |
| Smooth scroll, overscroll | `useGlideSmoothScroll`, Breakdown `overscrollY` |
| Cell/header context menus | Breakdown, all grids |
| Row bands | `InlineGlideTable.rowThemeOverride` (per-cell override), Budget |
| Hover tooltip + ribbon highlight | `InlineGlideTable.onItemHovered` (Call Sheet) |
| Grid theme from app tokens | `createGlideTheme(fontSize)` |
| `editOnType`, `cellActivationBehavior="double-click"` | Breakdown / Inline / Shell |
| `getContentBounds` + DOM-cell layer | vendored fork, kit `GlideSheet` |

Two corrections to common assumptions:

- **There is no grid-level `readonly` prop.** `readonly` is per cell (and per
  editor). The app passes `readonly={locked}` to `DataEditor` for intent, but
  Glide ignores it; the cells carry the real flag.
- **Peer selection is ours, not Glide's `highlightRegions`.** The DOM overlay
  draws peer colours/tags because it needs names, editing dots and
  per-instance geometry; `highlightRegions` is still useful for local hints.

## 2. Column layout & headers

| Feature | API | Demo |
| --- | --- | --- |
| Grow to fill | `grow: number` on `GridColumn`; weights share leftover px | `…--stretch-column-size` |
| Span | `span: [start, end]` on the cell (inclusive) | `…--span-cell` |
| Grouped headers | `group: string` on columns; `getGroupDetails`, `groupHeaderHeight` | `…--column-groups`, `…--column-group-collapse` |
| Header menu affordance | `hasMenu`, `menuIcon`, `onHeaderMenuClick(col, bounds)` | `…--header-menus`, docs `--menus` |
| Header icons | `icon`, `overlayIcon`, `headerIcons` | `…--custom-header-icons` |
| Right-hand panel | `rightElement`, `rightElementProps: { sticky, fill }` | `…--right-element`, `…--new-column-button` |
| Pinned bottom rows | `freezeTrailingRows: number` | `…--freeze-rows` |
| Variable rows | `rowHeight: (index) => number` | `…--row-and-header-sizes` |
| Wrapping text | cell `allowWrapping`, `experimental.hyperWrapping` | `…--wrapping-text` |

Caveats:

- **`grow` is a layout wish, not a resize.** `width` is the base size and
  `grow` only distributes the **leftover** pixels in proportion to its weight
  (100px + 100px base with 120px slack and `grow: 1` / `grow: 2` → +40px /
  +80px); a column never shrinks below its width. Once the user drags a column,
  Glide reports `newSizeWithGrow`; drop `grow` for that column (the demo does
  exactly this), or it keeps redistributing and fights the drag.
- **Spans require agreement.** Every cell inside the span must return the same
  `span` and content; a span is always split at a frozen/non-frozen boundary.
  `spanRangeBehavior: "default"` inflates selections to cover spans.
- **Group collapse is not built in.** The demo implements it by listening to
  `onGroupHeaderClicked`, calling `preventDefault()`, and setting the group's
  columns to `width: 8`. `getGroupDetails` can also supply an icon, a theme
  override and group-header action buttons; `onGroupHeaderRenamed` supports
  inline renames.
- **`onHeaderMenuClick` ≠ `onHeaderContextMenu`.** The first is the visible
  `hasMenu` chevron (bounds in page space, ready for a popover); the second is
  right-click. We only wire the latter today.

## 3. Row presentation & grouping

| Feature | API | Demo |
| --- | --- | --- |
| Row theme bands | `getRowThemeOverride(row) => Partial<Theme>` | `…--theme-per-row`, `…--row-hover` |
| Collapsible row sections | `rowGrouping: RowGroupingOptions` + `useRowGrouping` | `…--row-grouping` |
| Row marker variants | `rowMarkers` object: `checkbox`, `checkbox-visible`, `both`, `number`, `clickable-number`; `checkboxStyle`, `headerTheme`, `headerAlwaysVisible`, `headerDisabled` | `…--row-markers`, `…--automatic-row-markers` |
| Selection hints | `highlightRegions: { color, range, style }[]`; style `solid`, `dashed`, `no-outline`, `solid-outline` | `…--highlight-cells` |
| Update flash | cell `lastUpdated: performance.now()` | `…--rapid-updates`, docs `--streaming-data` |
| Row hover | `onItemHovered` + `getRowThemeOverride` | `…--row-hover` |

Details:

- **`getRowThemeOverride` is the cheapest row paint.** It runs per row during
  draw; return only `{ bgCell, bgCellMedium, textDark }` where needed and
  memoize by row key. Cell `themeOverride` still wins. Our `InlineGlideTable`
  instead applies a per-cell override so it also covers the synthetic
  info/action lanes — correct, but more allocations than the native callback.
- **The update flash is 500 ms and uses `theme.bgSearchResult`** (the pale
  yellow search highlight by default). Glide reads `lastUpdated` from the cell
  returned by `getCellContent` and needs `updateCells` to invalidate it; the
  fade is driven by the grid's animation queue, so it costs nothing if no cell
  carries a fresh timestamp.
- **`rowGrouping` is a row mapper, not a data model.** `RowGroupingOptions` is
  `{ groups: { headerIndex, isCollapsed, subGroups? }[], height, themeOverride?,
  navigationBehavior?: "normal" | "skip" | "skip-up" | "skip-down" | "block",
  selectionBehavior?: "allow-spanning" | "block-spanning" }`. `useRowGrouping`
  returns `mapper` (grid row → path/original index/isGroupHeader),
  `getRowGroupingForPath` and `updateRowGroupingByPath`; the host renders group
  rows itself (often `LoadingCell`). It supports nested groups and folding.
- **Selection serialization** has a first-class API: `CompactSelection.create()`
  and `.items` round-trip a `GridSelection` (see `…--selection-serialization`).
  Our presence wire encodes ranges by hand today.

## 4. Theming & drawing

| Layer | API | Notes |
| --- | --- | --- |
| Grid | `theme: Partial<Theme>` | flat keys; defaults fill gaps; canvas cannot read CSS vars |
| Column | `GridColumn.themeOverride` | also styles the header (and icon) |
| Row | `getRowThemeOverride` | cheapest per-row paint |
| Cell | `BaseGridCell.themeOverride` | most expensive; prefer higher layers |
| Group header | `getGroupDetails().overrideTheme`, theme `bgGroupHeader`, `bgGroupHeaderHovered`, `textGroupHeader` | group name/icon/actions too |
| Drawing | `drawCell`, `drawHeader` | call `drawContent()` first to paint under, after to paint over |
| Header icons | `headerIcons` SVG-string factories | receive `{ fgColor, bgColor }` |
| Editor | `editorBloom: [x, y]`, `editorFontSize` | bloom grows the overlay beyond the cell |
| Hover affordance | cell `hoverEffect`, `hoverEffectTheme` | text/number/uri only; draws an edit-style hover tint |
| Metrics | `cellHorizontalPadding`, `cellVerticalPadding`, `lineHeight`, `roundingRadius`, `checkboxMaxSize`, `scaleToRem` | theme/top-level props |

Theme key groups worth knowing (all `Partial<Theme>`):

- Surfaces/text: `bgCell`, `bgCellMedium`, `bgHeader`, `bgHeaderHasFocus`,
  `bgHeaderHovered`, `bgBubble`, `bgBubbleSelected`, `bgSearchResult`.
- Text: `textDark`, `textMedium`, `textLight`, `textBubble`, `textHeader`,
  `textHeaderSelected`, `linkColor`.
- Accents: `accentColor`, `accentFg`, `accentLight`, `bgIconHeader`,
  `fgIconHeader`, `drilldownBorder`, `borderColor`, `horizontalBorderColor`,
  `headerBottomBorderColor`, `resizeIndicatorColor`.
- Type: `fontFamily`, `baseFontStyle`, `headerFontStyle`, `markerFontStyle`,
  `editorFontSize`, `lineHeight`.
- Bubbles: `bubbleHeight`, `bubblePadding`, `bubbleMargin`.

`lastUpdated` and `highlightRegions` are the two easiest “live” visuals to add
without custom drawing. `drawCell`/`drawHeader` are for branded chrome, not for
per-cell content (custom renderers exist for that).

## 5. Interaction, reordering & drag

| Feature | API | Demo |
| --- | --- | --- |
| Activation gesture | `cellActivationBehavior: "double-click" \| "single-click" \| "second-click"`; per-cell `activationBehaviorOverride` | `…--cell-activated-event` |
| Type-to-edit | `editOnType` | used by us |
| Reorder columns | `onColumnMoved(start, end)`; veto with `onColumnProposeMove(start, end) => boolean` | `…--rearrange-columns` |
| Reorder rows | `onRowMoved(start, end)` | `…--reorder-rows` |
| Drag OUT of the grid | `isDraggable: boolean \| "header" \| "cell"` + `onDragStart` (`dataTransfer.setData`) | `…--drag-source` |
| Drop INTO the grid | `onDragOverCell(cell, dataTransfer)`, `onDrop(cell, dataTransfer)`, `onDragLeave` | `…--drop-events` |
| Keyboard fills | `keybindings.downFill` / `rightFill`; `allowedFillDirections` | `…--fill-handle` |
| Built-in search | `showSearch`, `searchValue`, `searchResults`, `onSearchValueChange`, `onSearchResultsChanged`, `onSearchClose` | docs `--search`, `…--search-as-filter` |
| Tooltips | `onItemHovered(args)` + a DOM layer | `…--tooltips` |

Caveats:

- **Reordering is a promise from you.** `onColumnMoved` only reports the move;
  you must reorder `columns` *and* remap `getCellContent`, selection, clipboard
  and presence column keys. Freeze columns and the row-marker gutter complicate
  the index math; `onColumnProposeMove` is the guard (e.g. keep an actions
  column last).
- **Row reorder is dangerous for the Breakdown.** Scene order is owned by the
  schedule/stripboard; use it only where the row list is a user-owned list
  (Budget lines, maybe manager tables).
- **`isDraggable` disables many interactions** (it is an HTML drag source).
  Use `"header"` / `"cell"` to narrow it; pair with `onDragStart` to set the
  payload. Drops are external drags only — internal row moves are `onRowMoved`.
- **Built-in search is a cell finder, not a filter.** It highlights matches and
  drives `searchResults`; our `GlideFilter` is a filtered row list with its own
  toolbar. Don't bolt the built-in search on top of the filter.

## 6. Cell kinds we don't use

| Kind | What it gives | Possible fit |
| --- | --- | --- |
| `NumberCell` | numeric editor, decimals, separators, negatives | Budget money — but we store integer cents and format deliberately; audit before migrating |
| `UriCell` | link styling, `onClickUri`, hover | Call-sheet/Drive links, websites in the Locations DB |
| `ImageCell` | thumbnails (`data: string[]`) | Location photos, cast headshots |
| `BubbleCell` | compact read-only tag list | Scene elements / cast summaries in a read-only view |
| `DrilldownCell` | tag + image pills (read-only) | Link previews |
| `MarkdownCell` | markdown in the overlay | Notes / descriptions |
| `RowIDCell` | primary-key styling | Board IDs / record IDs |
| `LoadingCell` | skeleton row | cloud/Drive reads, slow imports |
| `ProtectedCell` | stars for hidden data | locked/restricted cells |

`BooleanCell` is already used (Locations). `CustomCell` is our workhorse; the
kit's painted controls and the app's info/disclosure cells are custom renderers.

### Extra cells package

`@glideapps/glide-data-grid-cells` (same monorepo, MIT, 6.0.4-alpha25) ships 13
ready-made custom renderers/editors — a good reference even where we build our
own. Demo: `?path=/story/extra-packages-cells--custom-cells`.

| Cell | Data | Use |
| --- | --- | --- |
| `SparklineCell` | `values`, `yAxis`, `graphKind` line/bar/area, `color` | Trends in a row: budget variance, day hours |
| `TagsCell` | `tags`, `possibleTags` (tag + colour), editable | Read-only/editable tag lists |
| `UserProfileCell` | `image`, `initial`, `tint`, `name` | Cast/crew identity column |
| `TreeViewCell` | `text`, `isOpen`, `canOpen`, `depth`, `onClickOpener` | Budget hierarchy / outline rows |
| `StarCell` | `label`, `rating` | Ratings (little fit here) |
| `RangeCell` | `value`, `min`, `max`, `step`, `label`, `color` | Compact numeric sliders |
| `DropdownCell` | `value`, `allowedValues` (react-select) | Single select — our `PickerField` already covers this |
| `MultiSelectCell` | `values`, `options`, `allowCreation`, `allowDuplicates` | Multi select — our entity pickers cover this |
| `DatePickerCell` | `date`, `displayDate`, `format` date/datetime/time, `min`/`max`, `timezoneOffset` | Event/date cells |
| `LinksCell` | `links: { title, href?, onClick? }[]` | Multiple links per cell |
| `ButtonCell` | `title`, `onClick`, colours, radius | Read-only action button — painted glyphs are cheaper |
| `SpinnerCell` | nothing | Loading/working animation |
| `ArticleCell` | `markdown` (Toast UI editor) | Rich notes; very heavy dependency |

Adoption caveats:

- It lists `@glideapps/glide-data-grid` as an exact **dependency**, not a peer.
  Our Vite/tsconfig alias still collapses everything to the vendored runtime,
  but installing the package adds the npm tree; check the lockfile and bundle.
- `@toast-ui/editor` (Article), `react-select` (Dropdown/MultiSelect) and
  `@linaria/react` are real weight. Import individual cell exports rather than
  `allCells` unless you genuinely want the set.
- The DOM-editor cells (dropdown, multi-select, date picker) are a second
  picker language next to our kit `PickerField`; prefer the painted/simple ones
  (sparkline, tags, profile, tree view, spinner) or build on our own cells.

## 7. Where the gaps could pay off in lemon_schedule

Ranked by value ÷ effort. **Not scheduled** — this is input for the roadmap.

| Candidate | Why it fits | Effort / risk | Relation |
| --- | --- | --- | --- |
| Grouped Breakdown headers | Scene / Elements / Script / Schedule bands make a 15+ column sheet readable; group actions could collapse a band | Low / low | new |
| `freezeTrailingRows` on Budget | Pin a totals/footer row while scrolling the sheet (where one exists) | Low / low | Budget surfaces |
| `lastUpdated` flash on paste/fill/peer commit | Shows exactly what a bulk edit or a collaborator changed; 500 ms, no custom drawing | Low–med / low | presence, 349 |
| `hoverEffect` on editable Inline cells | Extra “this is editable” affordance on top of the blue tint | Low / low | 322 pickers |
| `grow` in `GlideShell` | Fill leftover width instead of a blank right band; drop grow after a user resize | Low / low | — |
| `hasMenu` + `onHeaderMenuClick` | Makes the existing column menus discoverable (today: right-click only) | Low / low | — |
| `onColumnMoved` + `onColumnProposeMove` | Per-user column order in Breakdown/Budget; persist like widths | Med / med | 233, 349 |
| `allowWrapping` + variable rows | Long descriptions/notes instead of truncation | Med / med | — |
| `rowGrouping` | Native collapsible sections for Budget or manager tables; replaces hand-built bands | High / high | 337/340/343 |
| Drag in/out (`isDraggable`, `onDrop`) | Drag a cast member or location onto a scene cell | High / high | — |

Already planned elsewhere: **328** covers scene-colour row bands through
`getRowThemeOverride`; **330** moves the Element Manager onto the kit Glide
runtime; **326/327** are the canvas-control / DOM-grid experiments.

## 8. Storybook index

Base URL: `https://glideapps.github.io/glide-data-grid/?path=/story/<id>`.
Demos referenced above (all under `glide-data-grid-dataeditor-demos--` unless
noted):

| Id | Shows |
| --- | --- |
| `stretch-column-size` | `grow` |
| `span-cell` | cell spans + `spanRangeBehavior` |
| `column-groups` | `group` + `getGroupDetails` |
| `column-group-collapse` | group collapse via header click |
| `rearrange-columns` | `onColumnMoved` + `onColumnProposeMove` |
| `reorder-rows` | `onRowMoved` |
| `drag-source` | `isDraggable` + `onDragStart` |
| `drop-events` | `onDragOverCell` / `onDrop` |
| `theme-support` | whole-grid theme |
| `theme-per-column` | `GridColumn.themeOverride` |
| `theme-per-row` | `getRowThemeOverride` |
| `row-hover` | hover + row theme |
| `highlight-cells` | `highlightRegions` styles |
| `rapid-updates` | `lastUpdated` + `updateCells` |
| `custom-drawing` | `drawCell` / `drawHeader` |
| `custom-header-icons` | `headerIcons` |
| `header-menus` | `hasMenu` + `onHeaderMenuClick` |
| `row-grouping` | `rowGrouping` + `useRowGrouping` |
| `tooltips` | `onItemHovered` |
| `trailing-row-options` | per-column add-row hints/icons/targets |
| `right-element` | sticky/fill side panel |
| `new-column-button` | add-column button in `rightElement` |
| `freeze-rows` | `freezeTrailingRows` |
| `wrapping-text` | `allowWrapping` |
| `all-cell-kinds` | every built-in cell |
| `cell-activated-event` | activation behaviour |
| `selection-serialization` | `CompactSelection.create` / `.items` |
| `search-as-filter` | controlled search + filtered rows |
| Docs: `glide-data-grid-docs--theming` | theming walkthrough |
| Docs: `glide-data-grid-docs--column-grouping` | grouping walkthrough |
