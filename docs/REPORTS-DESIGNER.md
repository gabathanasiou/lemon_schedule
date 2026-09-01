# Reports Designer — Agent Guide

Read this before touching anything in the Reports Designer. It's the orientation
map; deep dives live in the linked specs. The system is deliberately built on
three pillars — block tree, collection resolver, field registry — each with ONE
canonical implementation. Never re-derive them.

## Where it lives

- The **Reports Designer is a sub-tab of the Design tab** (`DesignTab.tsx`, sub-tab `designer: 'Reports Designer'`), NOT the Reports tab. It also has a pop-out slot in `App.tsx`.
- The **Reports tab is a different feature**: hand-built DOODs + Element Breakdown views (`DoodsTab.tsx`, `ElementBreakdownView.tsx`). They are NOT block-based and don't use the designer pipeline.
- Rendering is shared: the same `ReportBlockView` tree renders in designer canvas, `ReportPreview`, and print (`ReportPrint.tsx`). One change renders everywhere.

## The three pillars (canonical — don't re-derive)

1. **Block tree** — `types.ts:301` `ReportBlock` (types: `text | field | repeat | table | columns | ribbon | pageBreak | spacer`; repeat/table are containers). `ReportDesign` = `blocks/header/footer/page`. All tree ops go through `lib/reportBlocks.ts` helpers (`insertInto`, `listOwnerOf`, `moveIntoChildren`, …) — never hand-roll tree manipulation. New blocks come from `makeReportBlock(type, partial)`. Render-time props: `background`/`border` on text/field blocks (auto text color via relative luminance).

2. **Collection resolver** — `lib/reportData.ts`: `resolveCollection` (base list per collection) + `resolveCollectionItems` (applies category filters, `scopedToParent` Lego intersection, nested context). EVERY repeat/table iterates through it. Never build a parallel item list in a view.
   - Context-passing contract (item/parentCollection/parentCategory/outerItem/scopeFilter/aux): `docs/REPORTS-LEGO-CONTEXT.md` — canonical, read before touching `resolveCollectionItems`/`ReportRepeatView`/`ReportTableView`.
   - `ReportProductionTotals` (shootDays/shootMin/pages/scenes/…) is computed ONCE in `buildReportCtx` from daybreak `SectionInfo` — never recompute day/section math in the designer. `reportData.ts` only derives report-shaped projections on top of the canonical daybreak computation.

3. **Field registry** — `lib/reportFields.ts`: every attribute is a `ReportFieldDef` (`key/label/group/scope/get(ctx, item, aux)`) registered in `getReportFieldDefs(project)`. The palette, token picker, and table pickers all filter by scope (`fieldsForScope`). Views resolve values via `reportFieldValueByKey` — never read raw scene properties in a view. Breakdown attributes (cast, backgroundActors, element/custom categories) are pickable inside day repeaters (`days`/`daysOfCast` scopes) and resolve per-day as the union of that day's scenes' values (`dayBreakdownValue`, `reportFields.ts`), composed with the ancestor `sceneScope` intersection like smart fields. Scene Info/Shooting fields stay scene-only.

## What already exists (check before building anything)

- **Smart fields** (`SMART_FIELDS`, `reportFields.ts:238`): `shootTime`, `breakTime`, `smartPages` — context-aware sums (top level = production totals, day = day total, scene = own value, element/cast/category = Lego-scoped sum over scenes). Plus `smartElementCount`/`smartSceneCount` — contextual **counts** (day → distinct elements/scenes that day, category → scoped to the ancestor chain, element → 1, top level → totals). Counts run over SCHEDULED scenes only (`sceneInfos`); cast counts by ID.
- **Precomputed counts as fields**: per-day `daySceneCount`/`dayTotalPages`; per-element `sceneCount`/`totalPages`/`workDays`/`holdDays`/`travelDays`; per-category `categoryElementCount`/`categorySceneCount`/`categoryOccurrences`; production `totalScenes`/`totalShootDays`/`totalShootTime`/`totalBreakTime`/`schedulePages`.
- **Document Counter**: `counter` field + block `counterStart` — an iteration INDEX, not a count.
- **There is NO generic sum/aggregate/count attribute on blocks.** If a task asks for one, first check whether the count/sum already exists as a field (above) or as DOOD totals (`lib/nonShootStats.ts` `deriveDood` — the single DOOD engine, reused by report aggregates via `computeElementStats`). If you add aggregation, add it as a field/collection behavior in the registry — not as view logic.

## Extending (recipes)

- **New field**: add a `ReportFieldDef` to the right array in `reportFields.ts` (scope must match the item it reads; `smart` scope = universal contextual). Legacy renames go in `LEGACY_FIELD_ALIASES`.
- **New collection**: add to `ReportCollection` (`types.ts:273`) + a branch in `resolveCollection` (`reportData.ts`) + labels/contextual rules in `reportBlocks.ts` (`contextualCollectionsFor`, `parentCollectionOf`, `scopedCollectionLabel`) + the picker will pick it up from the base collections list in `blockControls.tsx`/`CollectionMenu.tsx`. **Typed parent collections** (categories→elements, locationTypes→locations) plug into `TYPED_PARENT_COLLECTIONS` (`reportBlocks.ts`) — the menus/defaults/table-field-scope pipeline is shared; only the `resolveCollection` branch + ctx data are per-collection. Flat DBs (`locations`) filter by type via `block.category` (CollectionMenu's Locations submenu); they are NON-rule-bearing (`NON_SCOPABLE_COLLECTIONS` — no Lego scoping, like crew).
- **Location attributes** (scope `locations` + day contexts): one merged family (`locationName`/`locationAddress`/`locationPhone`/`locationMapLink`… + sunrise/sunset/weather) resolving per-item via `locationsOfItem`/`pickLocation` (`reportData.ts`) — a locations-DB item reads its own entry, a day resolves through the `getReportLocation` seam (London stub until the Location Manager wiring lands). Single-valued fields render the item's FIRST location; `block.locationChoice` (type key, "Show location" picker — visible only when >1 locations resolve) picks another. Weather needs an in-scope day (item's date, else the nearest day ancestor's date) and is prefetched at design-referenced pins (`designLocationsIn` + `prepareSunWeatherForCtx(ctx, design)`).
- **`relative` block** (roadmap 27): a mini-repeater over the PARENT repeat's post-scope resolved list (`parentList.slice(idx + offset, idx + offset + count)`). The parent repeat/relative views pass `parentItems` + `itemIndex` down; nested relative blocks inside split repeat items resolve from the parent view's already-scoped list. Renders like a repeat (`.rm-repeat-col`/`.rm-item`) so paginator fragment splitting applies untouched. Palette entry gated to repeat contexts (no current item at top level).

## Hard-won gotchas

- `aux.index` is 0-based; `counterStart` (block prop) decides where the Counter field starts.
- Nested `elementsOfCategory` repeats render their same-collection tables **once per category** (summary tables — the `onceTables` special case in `ReportRepeatView`, `ReportBlockView.tsx:273`). Don't "fix" this; it's intentional.
- Table axis: `columns` = attributes as columns (one row per item), `rows` = matrix (attributes as rows). `tableItemCollection`/`tableFieldScope` derive the effective collection/field scope — use them, don't inline.
- Pagination (`useReportPaginator` + `lib/reportPagination.ts`): structural pages split at TOP-LEVEL `pageBreak` blocks (`paginateBlocks` — leading no-op, consecutive → blank pages, trailing dropped); there is no per-item expansion. A `pageBreak` ANYWHERE in the render (repeat/relative children included) is a hard chunk boundary: the block renders an invisible `data-rm-pagebreak` marker, the walker emits a `break` unit and the fill closes the page there — a trailing pageBreak per repeat item gives one page per item naturally. Repeat/relative items DISSOLVE into their children (whole blocks, ribbons by strips, tables by rows with repeated headers, nested repeats between items — `perItemParts`); items that render nothing produce no pages (a break at a page start is a no-op); unsplittable containers (columns/callSheetEdit) containing a break start on a new page as a whole unit; explicit blank pages survive only from consecutive top-level breaks. Splitting/geometry/budget rules: `docs/REPORT_PRINTING_AND_PAGE_BREAKS.md` §2-3. Design changes → `UPDATE_REPORT_DESIGN` (store `actions/reports.ts`); designs are versioned and trashed like other entities.
- **Skip-empty filter**: `SKIP_EMPTY_TEST`/`SKIP_EMPTY_LABEL` (`lib/reportData.ts`) — per-collection emptiness tests for typed-parent rollups (categories → `elementCount > 0`, locationTypes → `count > 0`; counts built once in `buildReportCtx`). `resolveCollectionItems` applies it when `skipEmptyCategories !== false` (default ON); the repeat/table "Filters" checkbox renders automatically per registered collection ("Skip types with no locations" etc.). A future database registers its test + item count here and both the filter and the chrome follow — no per-collection code.
- Print scoping: `ReportScopeFilter`/`filterItemsByScope` — repeat views MUST apply it after `resolveCollectionItems` (see `ReportRepeatView`). Scopes cover top-level REPEATS only; TABLES always print all items.
- Empty collections: render `emptyHint` in designer, render nothing in print/preview.
- The canvas editor (`ReportDesignerCanvas.tsx`) uses `elementFromPoint` behind a `pointer-events: none` backdrop for right-click targeting — same pattern as the ribbon context menu.
- The block editor panel (`BlockEditorContent`, `blockControls.tsx`) is ONE component rendered in BOTH the floating chrome and the pinned toolbar — any change applies to both surfaces. Sections stack: **Style** (typography + named styles) → **Outline** (background fill + border toggle — never rendered for `link` blocks) → **Padding** (Pad V/H) → **Content**. Palette attributes are `type: 'text'` blocks carrying a `{{field}}` token (never `type: 'field'`), so the text-block controls ARE the attribute-block controls.
- DnD edge zones: dropping on a block's left/right edge **wraps** it in a new 2-column block — UNLESS the target's immediate owner is a `columns` block, in which case the drop **adds a new column to that container** (left edge = before the target's column, right edge = after), reusing the gutter's `insertColumnAt`/`moveIntoNewColumn`/`duplicateIntoNewColumn` via the shared `insertNewColumn`/`moveToNewColumn`/`duplicateToNewColumn` handlers in `ReportDesigner.tsx` — never a nested columns block. Blocks nested in a repeat inside a column get no edge zones. Escape deselects the selected block/column; the block chrome has a far-right ✕ deselect button.

## Printing flow (custom reports)

Print NEVER fires directly — every entry point opens `ReportPrintDialog`
(`components/reports/ReportPrintDialog.tsx`) first: designer toolbar Print
(`ReportDesigner.tsx:351`) and File → Print → Custom Reports
(`AppHeader.tsx:135`) both call `setCustomReportPrint(design)` in `App.tsx`.
The dialog calls `onPrint(scopes, printOptions)` → `handleReportPrint`
(`App.tsx:624`) → `ReportPrint` renders through the measured paginator; it
signals `onReady` and only then does `window.print()` fire.

### Dialog invariants (MUST NOT)

1. **Never print without the dialog** — `handleReportPrint(design)` called
   straight from a button was the direct-print bug (main-window DesignTab);
   every entry point goes through `setCustomReportPrint`.
2. **Scopes cover top-level REPEATS only** — `scopeFor` in
   `ReportPrintDialog.tsx` matches `block.type === 'repeat'`; TABLES always
   print all items — never add table controls to the dialog.
3. **Ribbon overrides are print-only** — `RibbonPrintOptions`/`ReportPrintOptions`
   (`reportData.ts:123`) never mutate the `ReportDesign`. Keyed by block id,
   they apply to every ribbon block anywhere in the design (nested in repeats/
   columns/header/footer — `collectRibbonBlocks`).
4. **Ribbon defaults come from the block's own props every time the dialog
   opens** — ribbon settings are never persisted; only `page` persists
   (`lemon_schedule_report_print_page_{projectId}`).
5. **Overrides flow through `ReportRibbonView`'s `overrides` prop**
   (`ReportRibbonView.tsx:544`) and replace the block's flags entirely when
   present. The modal preview is `RibbonDummyPreview` (`ReportRibbonView.tsx:635`)
   — dummy daybreak + strips + note/break rows rendered with the REAL row
   renderers and the override flags, so every toggle is visible.

## Verify

- `npm run lint` after every change (tsc --noEmit).
- `npx playwright test` — `seeded-smoke.spec.ts` exercises the designer with the seeded "IT'S A WONDERFUL LIFE" project; perf harness in `docs/PERF-DIAGNOSIS.md`.
- Manual: Design → Reports Designer → Print (toolbar) or File → Custom Reports → the modal MUST open first — never a direct print.
