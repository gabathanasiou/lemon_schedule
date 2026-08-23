# Roadmap — Future Implementations Checklist

Checklist of features narrated by the user for future sessions. Read this before
starting a new session; work items here are the pending product work. Status:
`[ ]` not started, `[~]` in progress, `[x]` done.

---

## 1. Ribbon Block outside a Repeater (`[ ]`)

Block types today: `text | field | repeat | table | columns | ribbon | pageBreak | spacer`
(see `docs/REPORTS-DESIGNER.md`). A **Ribbon block placed outside any Repeater**
should:

- **Default to showing ALL ribbons of the schedule** (not just a sample).
- **Preview**: show only the first four + an indication that there are more
  ("+ N more" style hint).
- Add a **special property to toggle displaying day breaks** on/off.
- When on, day breaks display **1:1 from the stripboard**, exactly like the
  ribbons do.

Related bugs to fix while here:
- **Notes currently display weirdly** in the ribbon block — they must display
  **1:1 with the stripboard**.
- **Breaks same as notes** — 1:1 with the stripboard.

## 2. REMINDER: Location Manager fix + wire locations into scenes (`[ ]`)

**Reminder: the Location Manager needs to be fixed.**

- Wire locations so they can be linked/input into scenes.
- **There is no location column/type on scenes** even though it exists in the
  scene sheet — wire them together (one source of truth; scene sheet and
  stripboard/glide must agree).

## 3. Custom reports — proper page breaks, no element cutoff (`[x]`)
- Done: paginator already splits blocks at safe boundaries — wholeUnit/fragments — no mid-content cutoff; no code change needed this session.

- Page breaks must be used properly: **no element cutoff** (a block/element
  must never be sliced across a page boundary mid-content).
- Be smart about how tables/other elements break between pages **when content
  is too large** (split tables cleanly, move whole blocks, etc.).
- The current schedule print implementation already handles this —
  see `docs/print-system.md` (per-block tables in `PrintSchedule.tsx` /
  `DaySection`). **Follow a similar logic to the print engine for custom
  reports.** Existing spec: `docs/REPORT_PRINTING_AND_PAGE_BREAKS.md`
  (`paginateBlocks` in `src/lib/reportBlocks.ts` — read before touching).

## 4. Reports page print button skips the modal (`[x]`)

- The **print button in the Reports page currently skips the print report
  modal** — it must open the modal first (same as the designer flow).

## 5. Custom report print modal polish (`[x]`)

- Improve the **custom report print modal to closely match the style of the
  print schedule modal** (`PrintDialog` — grouped checklists, days selector,
  etc.). Right now it's subpar.
- Done: modal matches the PrintDialog chrome (max-w-3xl, Printer icon, Reset,
  "Print / Save PDF", per-project page-size persistence). Top-level REPEAT
  blocks show pre-checked item checklists (no All/Selected toggle — unchecking
  limits that block); TABLES always print all items — no controls.
  Every ribbon block in the design (top-level OR nested in a repeat/columns/
  header/footer) gets its own panel: Ribbon Layout picker, Cell Borders
  (None/Vertical/Horizontal/Both), Call times / Durations / Note rows / Break
  rows / Day breaks toggles, a live dummy preview (real design, daybreak half +
  2 strips + note/break rows so every toggle is visible) — all inherited from
  the block's own options, print-only (design untouched). Page Size override
  (From design / Portrait / Landscape, persisted). Overrides flow through the
  paginator as `ribbonOverrides` (per block id) + `page`.

## 6. Repeater type for Locations / Location Types (`[x]`)
- Done: `locations` / `locationTypes` / `locationsOfType` collections through
  the shared typed-parent registry (`TYPED_PARENT_COLLECTIONS`,
  `reportBlocks.ts` — categories→elements pattern); Locations repeats/tables
  get a Type filter (`block.category`, CollectionMenu Locations submenu);
  merged Location attribute family (`locationName`, `locationAddress`,
  `locationPhone`, `locationMapLink`… — scope `locations` + day contexts)
  resolving per-item via `locationsOfItem`/`pickLocation` (`reportData.ts` —
  DB entry vs the `getReportLocation` day seam; London stub until item 2).
  Per-block `locationChoice` (type key) picks another location once a day has
  several (Show-location picker renders when >1 exist); no migration — old
  `dayLocation*` keys removed. Weather fields are location-aware too
  (sunrise/sunset/weather resolve per resolved location, date from the
  nearest day ancestor, empty until a day is in scope; prefetch warms
  design-referenced pins via `designLocationsIn`).

- Add a **new repeating type + table inside the report designer that repeats
  locations and location types** (both — location types exist).
- Pattern: **same as categories → elements** repeaters.
- **Make that logic shared** so future databases can plug into the repeater
  pipeline without new per-collection code.

## 7. Bug: remove the Link block from the report designer (`[x]`)

- Remove the **Link block** from the block palette/designer.

## 8. Bug: Attribute-block links not clickable in print (`[x]`)

- A **text block** with an inserted link prints a **pressable link**.
- Selecting the **same attribute via an attribute block** produces a link that
  is **NOT clickable** in print.
- The attribute block must **match the text block behavior**.
- Fixed: `fieldValueNode` auto-detects scheme-guarded URLs in plain attribute
  values (field blocks AND table cells).

## 9. Map block location awareness (`[x]`)
- Done: the map block's inherited-location mode now resolves through the same
  seam as the location fields — `pickLocation(ctx, item, locationChoice)`:
  first location by default, or the per-block "Show location" picker
  (shared `LocationChoiceRow` in blockControls, rendered for map blocks with
  the day-location checkbox when several locations resolve). Unset pins (no
  inherited day, no own pin) show the "Add a location…" hint instead of a
  bare 0,0 map — the missing `!loc` guard crashed right after placement;
  regression-covered by report-sun-weather-map.spec (fresh pinless block).

- The **Map block should be smart about which location it shows**, or allow
  picking via a **dropdown**.
- Future-proofing: when the **Day Manager** lands, a single day may have
  **multiple locations attached** — the block must choose intelligently
  (default = first) and/or let the user select another.

## 10. Future: CallSheet Designer (`[~]`)

- A **CallSheet Designer**: a **variant of the Report Designer** sharing the
  same code — almost a toggle.
- Instead of designing reports, you pick a **call sheet template created in
  the reports designer**, then **edit it individually for every day**.
- To make per-day editing easy, add a **"call sheet edit block"** in the
  reports designer: in the call sheet editor you're **only allowed to put or
  not put things inside that block**; everything else remains static and taken
  from the template.
- Block container implemented (`[x]`): new `callSheetEdit` block type
  (palette + renderer + tree support). The reports designer CANNOT drop
  blocks into it (drop-zones are type-derived — repeat/table only), so it's a
  locked zone; the future callsheet designer opts in. Children rendering is
  forward-compatible.

## 11. Link crew positions to element categories (`[ ]`)

- Let the user **link a crew position with an element category**: e.g. HMU →
  Makeup, Grip → G&E, etc.
- **Ship sensible defaults** for the standard positions/categories (HMU →
  Makeup, Sound → Sound, etc.) out of the box, still fully editable by the
  user.
- The link must be **manageable from both sides**:
  - **Element Manager**: pick which crew positions are associated with a
    category.
  - **Crew Manager**: pick which element categories are associated with a
    position.
  - The **Glide Crew tab** must also allow managing the link per crew
    position.
- Both sides must stay in sync (one source of truth for the mapping).
- **Reports designer (when this lands)**: crew must become rule-bearing —
  `ruleBearingAncestor`/`parentScenesOf` (`lib/reportData.ts:620`, LEGO spec)
  gain a linked-category scene rule so crew repeats/tables scope for real
  ("Only crew in this day"), scoped crew labels/checkbox come back, and the
  interim honest-label special case from item 25 is removed.

## 12. Report preview: truncate table rows (`[x]`)
- Done: `TABLE_PREVIEW_LIMIT = 6` (`ReportBlockView.tsx:617`) + "+N more" row.
  Truncation is **designer canvas only** (`editorTableLimit` — the canvas table
  branch sets it); the preview and print always render every row (per user
  decision: "it should show normally on the preview and the print").

- In the **report preview**, tables currently render **all rows**.
- Change it to render only the **first 6 rows**, followed by a
  **"+N more" row** (N = remaining rows) indicating the rest are hidden.
- Full content must still be rendered in **print** — truncation is a
  preview-only behavior.

## 13. Spacer block preview: label + line thickness options (`[x]`)

- In the **report preview**, when the Spacer block's style is **"none"**,
  show a **"SPACER" label** so the empty spacer is visible in the canvas. `[x]`
  (designer canvas only — print/preview stay clean).
- When the style is **"line"**, expose **thickness options** for the line
  (e.g. thin/medium/thick, or a px value) in the block's properties. `[x]`
  (px input 1–8 in the block properties; `spacerThickness` honored by canvas,
  preview and print — all share `ReportBlockView`).

## 14. Text block editor: don't scale font size (`[x]`)

- In the **text block editor**, the rich text editor currently renders the
  text at its **actual size** (true to the preview).
- It should instead render text at a **normal/comfortable editing size** —
  only the **preview** reflects the real text size.
- Fixed: the editor wrapper in `blockControls.tsx` pins a 14px base — the
  block's real `fontSize` is only applied by the preview/print renderers.

## 15. Emails/phones in tables: clickable but not blue/underlined (`[x]`)

- In report **tables** (and anywhere `fieldValueNode` renders link fields),
  **email and phone cells** are currently **blue and underlined**.
- They must stay **clickable** but render like normal cell text — drop the
  link-blue/underline styling while keeping the anchor behavior.
- Fixed: `fieldValueNode` anchors inherit surrounding typography
  (`color: inherit`, no underline); the explicit Link block keeps link styling.

## 16. Text-token item formatting (affixes) + chip editor (`[x]`)

- Extend the token syntax: `{{field|itemPrefix|itemSuffix|itemSeparator}}` —
  empty segments = defaults (no prefix, no suffix, ", " separator); tokens
  without pipes behave exactly as today (back-compat).
- Resolution: `resolveToken` (`lib/reportFields.ts`) parses the pipes and
  applies `applyItemAffixes` for multi-value fields (plain prefix/suffix for
  single values). One change covers canvas chips, preview AND print (all
  token paths flow through `resolveToken`).
- Editor UX: clicking a token chip in the text editor opens an "Item
  formatting" popover (Item prefix / Item suffix / Item separator); Apply
  rewrites ONLY that chip's token via the kit's `replaceToken` handle
  (ui-kit v0.1.29 `onTokenClick`/`replaceToken`). **Superseded by item 19** —
  the popover is gone; the controls now live in the block properties panel
  (list attributes only).
- Visual cue: chips with custom formatting render with a `*` on their label
  (editor chips + canvas `TokenPreview`).

## 17. Report designer iPad-friendly (`[ ]`)

- The **report designer must work on iPad** — both the **looks** and the
  **designer preview/canvas itself**.
- **Drag & drop does not work on iPads** (HTML5 DnD is desktop-only; pen =
  touch = coarse pointer) — the palette → canvas and block reordering flows
  must fall back to touch-friendly interactions (tap to add, move via
  controls) or a pointer-based drag shim.
- Audit everything touch-related in the designer:
  - canvas scrolling/panning over block cards,
  - selecting blocks/cells, column reorder grips, resize handles,
  - hover-dependent affordances (any-hover gating, hover-reveal),
  - the floating chrome panels (coarse-pointer sizing/padding),
  - drop zones / edge zones during drag.
- Visual audit on iPad viewport (730px portrait / 1060px landscape per
  `useViewMode`): palette, chrome panels, tables, preview.
- **WebKit play-test (required before done)**: Playwright WebKit + touch
  emulation (`playwright.ipad.config.ts` — `devices['iPad Pro 11']`,
  `hasTouch`) covering palette → canvas block drag, block reordering, resize
  handles (table columns + columns-block gutters), edge/zone drops, column
  reorder grips. Touch fallbacks: tap-to-add from the palette; pointer-based
  drag shim (`touch-action: none` — the ribbon dragger pattern, item 24) or
  move-via-controls. Re-run after item 24 lands (shared draggers).

## 18. Move local→cloud bumps the project's modified time (`[x]`)

- Moving a project **from Local to Cloud (Drive)** changes its
  `lastModified` to the time the move happened.
- Why it currently does: the cloud copy must not appear OLDER than the local
  one, or a later sync could overwrite the moved file (modified time going
  backwards = regression).
- Desired: **preserve the original modified time** across the move where
  safe (write the cloud file, then carry the original `lastModified` over
  instead of stamping "now"), while keeping the overwrite protection above.
- Fixed: `handleMoveToDrive` passes `p.lastModified` to both the local index
  (`updateProjectMeta`) and the Drive index entry (new optional param on
  `pushProjectAndUpdateIndex`).

## 19. Token chip affix editor: list-only + inline in the properties panel (`[x]`)

- Today, clicking ANY token chip in the text block editor opens the "Item
  formatting" popover (`ChipOptionsPopover` in
  `src/components/reports/RichTextEditor.tsx`) with Item prefix / Item suffix /
  Item separator — even for single-value attributes.
- **Fix 1 — list-only**: only show these options for **multi-value ("list")
  attributes** (detect via the field registry `multiValue` /
  `isMultiValue(field, customCategories)` — never raw `split(',')`). Clicking a
  single-value chip opens nothing (typed `{{field|prefix|suffix}}` still
  resolves as today per roadmap 16).
- **Fix 2 — no popup**: remove the popover entirely; render the affix inputs
  in the block properties panel instead.
- **Replace the "Layout" section** (`styleLayoutCell` in `blockControls.tsx` —
  Pad V / Pad H inputs via `LayoutControls`): the user never uses it. Put the
  affix section in that slot for text blocks (field/link blocks can keep the
  padding inputs).
- Needs a per-chip target without the popover: lift the clicked-chip state up
  (the `onTokenClick` handle already exists at the adapter level — forward it
  to `ContentControls`) and have the panel's affix inputs patch ONLY that
  chip's token via `replaceToken`. Keep the `*` customized-chip cue.
- Fixed: popover deleted; `RichTextEditor` forwards `onTokenClick` up;
  `BlockEditorContent` tracks the clicked chip and renders `ChipAffixSection`
  BELOW the Padding (Pad V/H) section (text blocks only, multi-value fields
  only, live per-keystroke patches via `replaceToken`, ✕ clears the selection);
  `parseToken`/`composeTokenKey` shared in `lib/reportFields.ts`. The padding
  controls were kept for text blocks too — they had become unreachable anyway
  (palette attributes ARE text blocks with a token, so the old field-only
  Layout slot never rendered).

## 20. Reports designer: edge-drop inside a column + deselect UX (`[x]`)

- **Edge-drop inside a column adds a column to that container**: dragging a
  block onto the left/right edge of a block that lives inside a `columns`
  block inserts a NEW column into that columns block (left edge → before the
  target's column, right edge → after) instead of the top-level behavior of
  wrapping the target in a new columns block. Reuses the gutter drop ops
  (`insertColumnAt` / `moveIntoNewColumn` / `duplicateIntoNewColumn` via the
  existing new-column handlers — hoisted in `ReportDesigner.tsx` and shared by
  both paths); `listOwnerOf` resolves the owning columns block, so no nested
  columns blocks ever form. Blocks nested in a repeat inside a column keep no
  edge zones (same as before).
- **Escape deselects the selected block** (hides the floating chrome) — same
  key that already deselects columns/closes menus.
- **Deselect button in the block chrome header** (far-right ✕, matching the
  column chrome) — wired through the existing `trailing` slot in
  `BlockEditorContent` (the toolbar mode already had one).

## 21. New text blocks start empty (`[x]`)

- Adding a text block (palette click/drag, context-menu Insert Above/Below,
  Add child, repeat/column empty-drop, zone empty click) previously
  pre-filled it with "Text — {{title}}" ("Line {{title}}" for Add child).
- Fixed: `makeReportBlock('text')` defaults to empty text (`reportBlocks.ts`);
  the canvas already renders empty text blocks as blank selectable cards with
  the editor placeholder ("Type text… type @ to insert an attribute").

---

## 22. Day-repeater text fields can't pick the "Breakdown" attribute type (`[x]`)
- Done: Breakdown attributes pickable inside day repeaters, resolving per-day via `dayBreakdownValue` in `reportFields.ts`.

- In the reports designer, a text field (also field blocks, table columns and
  the palette) inside a repeater over **days** offers no "Breakdown" group in
  the attribute picker / `@` autocomplete.
- Why: every Breakdown-group field is scene-scope — `cast` + `backgroundActors`
  (`SCENE_FIELDS`, `lib/reportFields.ts:94-95`) and all element/custom
  categories (`buildCategorySceneFields`, `:415-445`, group 'Breakdown') —
  and the picker filters by context via `fieldsForScope`
  (`reportFields.ts:635-651`). A days context only includes `days` + global/
  smart, so Breakdown never appears inside a day repeater (`contextFields` at
  `blockControls.tsx:427`). Breakdown fields appear only in scene contexts
  today: `scenes`, `scenesOfDay`, `scenesOfElement`, `scenesOfCast`,
  `elementsOfCategory`.
- Desired: Breakdown attributes pickable inside day repeaters, resolving
  per-day with the same parenting/Lego logic the repeaters use — the union of
  that day's scenes' values (Cast Members List → distinct cast working that
  day; Props → distinct props across that day's scenes), composed with the
  ancestor `sceneScope` intersection like the smart fields (`smartScenesOf`
  `reportFields.ts:246-261` already resolves day items via `it.section.index`).
- Touch points: `fieldsForScope` day-context inclusion; day-item-aware
  resolution in `reportFieldValueByKey`/`resolveToken`; picker/autocomplete
  plumbing in `blockControls.tsx`.
- Verify: seeded project — days repeat + `{{cast}}`/`{{props}}` resolve
  differently per day; nested days→scenes behavior unchanged.

## 23. Bug: table column-width resize broken when the table has multiple rows (`[x]`)
- Fixed with item 24: shared dragger applies widths by column index to header AND every body row; the clear-then-patch reflow bug was the root cause.

- Repro: reports designer, columns-axis table with several data rows →
  select the table (resize bar appears above it) → drag a resize handle.
- `TableResizeBar` (`ReportDesignerCanvas.tsx:948-1007`) applies widths to ALL
  `[data-col-ci]` cells via `columns.findIndex(c => c.id === ...)` — the
  attribute carries the column **id** while `data-table-col-ci` carries the
  index (`ReportBlockView.tsx:771`); prime suspect, plus the top-anchored
  handle strip and the `normalizeColWidths` commit (`ribbonDefaults.ts:79`).
- Fix + verify: 1-row and multi-row tables (header + all body cells track the
  drag), commit lands in the design, preview/print reflect the widths; add a
  Playwright assertion if practical. Expected to be superseded by item 24's
  shared dragger swap — verify there.

## 24. Extract the ribbon designer's resize draggers into a shared component (`[x]`)
- `src/components/columnResize.tsx` (useColumnResize + ColumnResizeStrip) consumed by RibbonTab, RibbonDesignerGrid and TableResizeBar; columns gutters deduped too.

- The ribbon designer's resize tabs (`RibbonDesignerGrid.tsx:51-73`) +
  pointer logic (`startResize`, `RibbonTab.tsx:410-481`) are the gold
  standard: pointer capture, `touch-action: none` during drag,
  document-level move/up, live CSS on grid + tab bar + previews, MIN_PCT
  clamps, Shift = scale all right columns, store commit on release. Works
  for touch/pen (coarse-pointer sizing variants).
- The reports table's `TableResizeBar` (`ReportDesignerCanvas.tsx:948-1007`)
  re-implements a thinner version (no touch handling, no pointer capture,
  id-lookup width application).
- Plan: extract a shared column-resize dragger (component + pointer logic)
  in `src/components/` consumed by BOTH RibbonDesignerGrid and
  TableResizeBar — the ribbon behavior becomes the single standard; delete
  the duplicate. Also benefits the columns-block gutter resize and item 17
  (iPad designer).
- Verify: ribbon designer resizes identically (desktop + touch), table
  resize fixed (item 23) with the shared dragger, `npm run lint` +
  playwright.

## 25. Repeater/table "over" menus: hide self-redundant collections (`[x]`)
- `isSelfRepeat` in reportBlocks.ts gates both menus (current value exempt); Elements self-category grays out; crew labels/checkbox honest until item 11.

- Problem: nested repeat/table menus offer every base collection in every
  context; self-repeats produce 1-item (or combinatorial) nonsense — e.g. a
  Days repeat inside a Days repeat ("days of this day").
- Menus today: `blockControls.tsx:705` (repeat) / `NestedTableMenu:498` build
  `[...contextualCollectionsFor(parent), ...baseValidCollections(parent)]` —
  `validCollections` (`reportBlocks.ts:369`) only gates the contextual
  variants.
- Hide (self-redundant):
  - `days` under day-item parents (`days`, `daysOfCast`);
  - `scenes` under scene-item parents (`scenes`, `scenesOfDay`,
    `scenesOfElement`, `scenesOfCast`);
  - `crew` under `crew`;
  - gray out the parent's own category in the Elements submenu under
    element/cast-item parents (`elements` same category, `elementsOfCategory`
    same category, `cast`/`scenesOfCast` → category `cast`).
- Keep (user decision): `categories` under `categories` (≈ all categories in
  the parent's scenes — intentional), `violationTypes` under
  `violationTypes` (rare cross-type overlaps).
- Implementation: `isSelfRepeat(parent, collection, parentCategory,
  category)` in `lib/reportBlocks.ts` (single source of truth); filter the
  two menu call sites, ALWAYS exempting the current value so existing
  designs stay editable and keep rendering (no migration); `CollectionMenu`
  gains `disabledCategories` for the grayed self-category.
- Crew interim (until item 11 lands): crew stays available in nested
  repeaters but honest — no "(of this crew member)" decoration, no "Only … in
  this crew member" checkbox; same for every option nested inside a crew
  repeater (crew ancestors are non-rule-bearing — `ruleBearingAncestor`,
  `reportData.ts:620`). When crew↔category linkage lands (item 11) crew
  becomes rule-bearing and this special case is removed.
- Verify: menu contents per parent context (repeat + table), current-value
  exemption, seeded project renders unchanged, lint + playwright.

## 26. Block gap: default 10px vertical spacing between blocks (`[x]` REVERTED)
- Done: implemented (default 16px, preview/print only, canvas flush per veto) then REMOVED entirely per user decision — the feature sucked. `blockGap` prop, `DEFAULT_BLOCK_GAP`/`blockGapMargin`, the Gap (px) chrome input and the paginator gap accounting are all gone; blocks stack flush again (the repeat's own "Item gap (px)" remains the only gap control).

- Problem: blocks stack flush — no breathing room top/bottom in the design
  body, repeat children, or columns.
- New prop `blockGap?: number` (px, vertical) on ReportBlock. Render-time
  global default **10** (`blockGap ?? 10`) so existing designs get spacing
  with no migration (user decision). Vertical only — sides stay flush.
- Chrome: "Gap (px)" number input for every block type (mirroring the
  repeat's "Item gap (px)" row, `blockControls.tsx:729-733`).
- Rendering (canvas + preview + print must match — rule 8 of
  `docs/REPORT_PRINTING_AND_PAGE_BREAKS.md`):
  - Canvas: `renderBlocks` card wrapper (`ReportDesignerCanvas.tsx:286`)
    gets `marginTop`, skipped for the first block in each stack (body,
    repeat children, columns — everywhere).
  - Print/preview: `ReportMeasureContainer` `.rm-block` wrappers
    (`useReportPaginator.tsx:398`) AND `ReportChunkPage` chunk mounts
    (`ReportBlockView.tsx:496-506`) get the same marginTop; first-child CSS
    suppression (`.rm-body > :first-child`, `.report-page-content >
    :first-child`) keeps page tops clean.
  - Pagination: `wholeUnit` reads the wrapper's computed `marginTop` into
    `gapBefore` (mirrors the header-margin read `useReportPaginator.tsx:295`
    and the repeat rowGap read `:100`) so page budgets include the spacing;
    nested repeat-fragment margins live inside the item → `offsetHeight`
    already includes them (no change).
  - Columns: hardcoded `gap: 8` (`ReportBlockView.tsx:196`) replaced by the
    block-gap margins for parity.
- Exclusions: `pageBreak` blocks get no margin; spacer blocks remain for
  exact manual spacing.
- Verify: canvas = preview = print, no page overflow with many blocks;
  `npm run lint`; `npx playwright test --config=playwright.ipad.config.ts
  report-pagination` (budget assertion, both engines) + standard suite.

## 27. `relative` block — next/previous-item context shifter (`[x]`)
- Done: `relative` block type (offset/count steppers + resolved-target label
  in chrome); `resolveRelativeItems` slices the parent repeat's post-scope
  list via `parentItems`/`itemIndex` threading (exact in repeat/relative
  views; fragment fallback resolves the top-level list in `FragmentBody`);
  `ReportRelativeView` mirrors the repeat view (`.rm-repeat-col`/`.rm-item`)
  so paginator fragment splitting applies; palette gated to repeat contexts;
  `insertInto`/context menu treat it as a container; print dialog collects
  ribbons inside it.

- New `ReportBlock` type `'relative'`: `offset?: number` (default `+1`,
  negative = previous) + `count?: number` (default `1`; explicit only — no
  "until end" mode) + `children`. A mini-repeater: resolves
  `parentList.slice(idx + offset, idx + offset + count)` — `parentList` is
  the parent repeat's post-scope resolved list, `idx` the current item's
  index; children render once per item with full Lego context (`ancestors =
  [item, ...ancestors]`).
- Use case: call sheet template — inside a Days repeat, `relative(+1,1)` +
  ribbon child renders the NEXT day's boxed section; `relative(+1,2)` stacks
  the next two days. Tables of `scenesOfDay`, smart fields and
  `scopedToParent` all compose against the target item for free.
- No collection picker: the relative unit IS the parent's collection — inside
  days it's the next/previous DAY, scenes the next SCENE (stripboard order),
  elements/cast the next element of its category, categories/crew/
  violationTypes likewise. Cross-collection via nesting (`cast → days ☑scoped
  → relative(+1)` = the member's next workday). Relative-inside-relative
  allowed (offset 2 does the same).
- Placement: gated to repeat/relative children only — no top level (no
  current item); palette entry shown only in repeat contexts; inserting a
  relative into a selected container appends as a child.
- Implementation:
  - `types.ts` + `makeReportBlock('relative')` (offset 1, count 1).
  - `ReportRepeatView` passes its post-scope resolved list to children
    (`parentItems`); `ReportRelativeView` finds the current item's index
    (identity; key fallback via `reportItemKey` for rebuilt items like
    violation types) and slices.
  - Extract `ReportRepeatView`'s per-item fragment renderer into a shared
    helper reused by the relative view — the paginator's universal fragment
    splitting (`.rm-frag-child`, `data-rm-fragment-index`) applies untouched.
  - Tree ops: `insertInto` (`reportBlocks.ts:158`) treats `relative` as a
    container; `insertScopeFor` falls through to the nearest repeat's
    collection (`b.collection || ctx` already propagates).
  - Chrome: Offset + Count steppers + resolved-target preview in the designer
    ("→ Day 4 · Wed 12 Mar"); `BLOCK_TYPE_META` icon.
  - Item gap reuses the repeat's `gap`; blockGap (item 26) applies to the
    block itself; pageBreak children filtered like any nested container.
- Update `docs/REPORTS-LEGO-CONTEXT.md` (parentItems addition to the context
  contract) alongside.
- Verify: call sheet template (days repeat + ribbon + relative(+1,1) + ribbon
  → next day's boxed section; relative(+1,2) → two stacked sections; last day
  → empty), scoped cast→days→relative chain, lint + playwright.

## 28. Text/field blocks: border + background with auto text color (`[x]`)
- Done: background/border on text/field blocks + auto text color; shared `src/lib/reportLook.ts`.

- New props on text + field blocks (the `isTextLike` family minus link):
  `background?: string` (hex) + `border?: boolean` (default off). Goal: build
  custom tables from columns of bordered cells — no column-level styling
  needed; the columns block stays a transparent layout container and nothing
  overrides the cell.
- Auto text color: `getReportBlockBaseStyle` (`reportStyle.ts:13`) computes
  `#fff` on dark backgrounds / `#000` on light (relative-luminance helper)
  instead of the hardcoded `color: '#000'` (`:22`). Black bg → white text.
- Extract the table look into one shared module (new `src/lib/reportLook.ts`):
  `getReportBorder(showBorders)` → `1px solid #d4d4d8` (today hardcoded at
  `ReportBlockView.tsx:614`), the table header bg `#f4f4f5` (`:694`), and the
  luminance helper. Table cells AND text blocks consume it — future table-look
  changes happen in one place and update both.
- Render everywhere automatically: the designer canvas, preview and print all
  render text blocks through `ReportBlockView` (`ReportDesignerCanvas.tsx:416`)
  — the border/background shows live in the editor (WYSIWYG) and identically
  in preview/print (colors print via the global `print-color-adjust: exact`).
  The added border height is measured correctly by the paginator
  (`offsetHeight` includes borders).
- Chrome: StyleControls gains a "Background" `ColorField` + "Border" toggle
  (text/field blocks).
- Notes: full-box border (all 4 sides) — adjacent bordered cells double their
  shared edge only when touching (gap 0; columns space 12px apart so custom
  tables stay clean). Link blocks excluded (fixed blue link color unreadable
  on dark bg). Named text styles stay typography-only.
- Verify: custom table (columns row + bordered cells + black header cells →
  white text auto), canvas = preview = print, seeded project, lint +
  playwright.

## 29. Ribbon block: full designer parity + sample-cell fallbacks (`[x]`)
- Affixes via shared formatCellText everywhere; sample fallbacks (ribbonCellDisplayValue) gated to canvas/preview, never print; empty-project sample trio.

- Part A — 1:1 parity audit: diff every RibbonDesign setting between the
  ribbon designer/stripboard pipeline and `ReportRibbonView`.
  - CONFIRMED GAP: cell affixes don't render — `Strip` uses
    `getFieldValue(cell.field, sceneDataFor(it))` directly
    (`ReportRibbonView.tsx:136-138`); only call-time cells apply prefix/
    suffix via a local `fmt` (`:46`). Fix: every cell (strips, daybreak
    halves, note/break rows) uses the shared `formatCellText`
    (`ribbonUtils.ts:114`); delete the local `fmt`.
  - Audit checklist: text cells (textContent), align/verticalAlign/wrap/
    truncation/overflow, merge groups (h/v), cell padding V/H, edge padding,
    colWidths, cell borders (`getCellBorderProps`), duration incl. the `↑`
    zero marker, pageCount, computedCallTime, day header/footer + strip
    colors (`sceneStyle`), note/break rows + daybreak halves 1:1 with the
    stripboard, custom field labels, print-dialog hidden-field toggles.
- Part B — sample fallbacks (empty projects / empty values / custom
  categories), adopting the LivePreview pattern (`RibbonLivePreview.tsx:85-
  103`):
  - cell value = real value → sample (`getFieldValueFromSample`, sample
    sceneNumber) → field label (`FIELD_MAP`/customFieldLabels) in italic +
    reduced opacity — every cell always shows something, including custom
    categories (their name in italics);
  - affixes only on real values (LivePreview: `val ? c.prefix : undefined`);
  - empty project (no days): render the PREVIEW_SAMPLES trio (INT DAY / EXT
    DAY / INT NIGHT) instead of the "schedule is empty" hint so the design
    stays visible;
  - shared helper (e.g. `ribbonCellDisplayValue(cell, scene, { sample })`) in
    `ribbonUtils` used by Strip + halves + note/break rows — one source;
  - scope: designer canvas + preview only (documented preview affordance like
    the table "+N more") — print NEVER renders samples.
- Verify: seeded project (affixes print 1:1 with the stripboard), empty
  project shows the design on canvas/preview, custom category cells show the
  label in italics, lint + playwright.

## 30. Bug: repeaters auto page-break when NO pageBreak is present (`[ ]`)

- **Reported**: a repeat with no `pageBreak` block inside it still splits its
  items across pages ("auto page break") — expected: without an explicit
  pageBreak the repeat's items keep together (the repeat moves whole, or at
  most fills pages contiguously) — per-item page breaks only come from a
  pageBreak child ("one page per item", the Call Sheet pattern).
- Suspects to check first (read `docs/REPORT_PRINTING_AND_PAGE_BREAKS.md`
  before touching):
  - `hasItemBreaks` (`lib/reportPagination.ts:53`) fires "one page per item"
    on ANY pageBreak child — verify it isn't matching a break nested in a
    child container (columns/relative/callSheetEdit children) or a
    pageBreak the design didn't intentionally place.
  - `buildReportPages` (`reportPagination.ts:58`) expands repeats with item
    breaks into one fragment per item — confirm the trigger, not the shape.
  - The measured paginator (`useReportPaginator.tsx` `fillPages`) splits
    repeats BETWEEN items to fill the page budget — confirm whether the
    reported "auto page break" is this budget split being too aggressive
    (e.g. first item pushed to a new page when the repeat would fit) or the
    per-item expansion above.
- Verify: repeat without pageBreaks renders items back-to-back (canvas =
  preview = print), one page when it fits, contiguous overflow pages when it
  doesn't; repeat WITH a pageBreak child still does one item per page;
  seeded project + lint + playwright.

## 31. Bug: location types (`[x]`)
- Done: per-type ("Locations (of this type)") tables now warm ALL location
  pins for the weather prefetch (`designLocationsIn` — only flat
  `locations` blocks filter by `b.category`); deleting a type records its
  human label on the trashed locations (`LocationTrashItem.typeLabel`),
  so restore re-creates the type with the real label, never the slug; the
  CollectionMenu Locations submenu gains an **"All types"** option that
  clears `block.category` back to all locations (checkmark when unfiltered).
  All three verified by e2e/location-types.spec.ts (prefetch request pins,
  manager delete → trash labels, menu pick + clear). Restore itself has no
  UI dispatcher yet — the restore branch is covered by inspection.
- **Latent bug fixed while verifying**: `updateBlock` spreads
  (`{...b, ...patch}`) and never deletes absent keys, so switching a block
  to a collection WITHOUT a category left the old `category` in place
  (invisible for Scenes/Days, visible for Locations/Elements). The three
  collection-pick call sites now use `collectionPickPatch` which sets
  `category: undefined` explicitly.

Known issues to fix together (all in the locations/type machinery):

- **Weather prefetch skips per-type location tables**: `designLocationsIn`
  (`reportData.ts`) filters a `locationsOfType` block's pins by
  `b.category` — that collection has no category picker, so the filter
  matches nothing and NO location pins get warmed for weather fields inside
  a Location Types → "Locations (of this type)" table. Per-type tables must
  warm ALL pinned locations (the parent type repeat picks per-type at render
  time); only flat `locations` blocks filter by `b.category`.
- **Restore loses the type's human label**: `caseRestoreLocation`
  (`store/actions/reports.ts`) recreates a deleted type with
  `{ key: location.type, label: location.type }` — the label is the slug
  ("unitbase"), not the original label ("Unit Base"). Delete should record
  the type's label with the trashed locations (or with the type itself) so
  restore re-creates it faithfully.
- **No way to clear the Locations type filter**: the CollectionMenu
  Locations submenu sets `block.category` but nothing clears it — once a
  repeat/table is filtered to one type it can never go back to "all
  locations". Add an "All types" option (mirroring the default state).
- Verify: per-type table weather resolves (mock API), delete + restore a
  type keeps the label, type filter clears back to all locations, lint +
  playwright.

## 32. Bug: blank pages from repeat items that render nothing (e.g. empty location types) (`[ ]`)

- **Reported**: a Repeat over Location Types (one page per item — pageBreak
  child, the call-sheet pattern) prints a BLANK page for a type with no
  locations instead of skipping it — the type's only child is the
  "Locations (of this type)" table, which renders null in print when empty.
  Universal: ANY page whose content renders nothing shows as a blank page —
  a per-item page for an empty item, or a top-level block that renders null
  (empty table/repeat/relative at top level).
- Root cause: `computeChunks` (`useReportPaginator.tsx:317`) emits a
  `{ body: [] }` chunk whenever a page has ZERO measurable units — including
  pages that HAD items (`items.length > 0` — per-item expansion or a
  top-level block) whose rendered height measured 0. Only pages from
  consecutive top-level pageBreaks (`items.length === 0`, `paginateBlocks`
  pushed `[]`) are legitimately blank.
- Fix (universal, primary): in `computeChunks`, skip pages where
  `items.length > 0 && measurable.length === 0` (the page rendered nothing →
  drop it); keep explicit blank pages (`items.length === 0`). This drops
  header/footer-only pages too (the shared header is on every page — an
  empty body page is still an empty page).
- Secondary (design decision, matches "instead of skipping"): skip EMPTY
  location types by default — `resolveCollectionItems` for `locationTypes`
  drops `count === 0` types unless opted out (mirror the `categories`
  skip-empty flag: `skipEmptyCategories !== false` → a parallel flag or
  reuse it), so empty types never iterate in canvas/preview/print.
- Related: item 30 (repeaters auto page-break without a pageBreak) — same
  pagination area; fix both in one session.
- Verify: empty location type produces no page in canvas/preview/print; a
  type WITH locations still gets its page; consecutive explicit pageBreaks
  still produce blank pages; empty top-level table prints nothing; seeded
  project + lint + playwright.

## 33. Block gap in preview + print (like the repeat item gap) (`[ ]`)

- **Requested**: EVERY block gets the same vertical gap the repeat's ITEMS
  have (the `gap ?? 8` between `.rm-item`s) — body/header/footer blocks,
  repeat children, columns children — in the PREVIEW and PRINT. The designer
  CANVAS stays flush (per the item 26 veto — "canvas flush per veto" was the
  previous decision; the gap is a print/preview affordance, not an editing
  affordance).
- **No duplicated gaps** (user clarification): the repeat's ITEM spacing
  stays the flex `gap` on `.rm-repeat-col` — item wrappers are NOT blocks,
  so they get no margin and the item gap is never doubled. The blocks inside
  an item (repeat children, currently flush — `.rm-repeat-child` divs in
  normal flow) get the margin instead (first child of the item suppressed).
  Columns children drop their hardcoded flex `gap: 8`
  (`ReportBlockView.tsx:197`) in favor of the uniform margin — one spacing
  mechanism everywhere. First-child suppression per stack: body, header,
  footer, repeat item, columns child list.
- This is a re-request of item 26 ("Block gap: default 10px…") which was
  implemented (default 16px, preview/print only, canvas flush) then REMOVED
  per user decision. Read the item 26 notes for the full prior
  implementation: `blockGap` prop + `DEFAULT_BLOCK_GAP`/`blockGapMargin`,
  render-time margin on `.rm-block` wrappers (`ReportMeasureContainer`
  `useReportPaginator.tsx:398`) + chunk mounts (`ReportBlockView.tsx:496-
  506`), first-child CSS suppression (`.rm-body > :first-child`,
  `.report-page-content > :first-child`), `wholeUnit` reads the wrapper's
  computed marginTop into `gapBefore` so page budgets include it
  (`useReportPaginator.tsx:295` mirrors the header-margin read), repeat
  item gap read at `:100`, columns `gap: 8` replaced by the margins.
- Differences vs the reverted 26: default should match the repeat item gap
  (8px — or reuse the same default constant), and there is NO per-block
  "Gap (px)" control (user decision) — a single global default for every
  block type, no chrome input. The repeat's existing "Item gap (px)" control
  keeps governing ITS item spacing (items aren't blocks — no conflict).
- Exclusions (as before): `pageBreak` blocks get no margin; spacer blocks
  remain for exact manual spacing; a second veto of the feature is a
  legitimate outcome — keep the change isolated and easy to revert.
- Verify: canvas = flush, preview = print = gap (same as repeat items),
  no page overflow with many blocks, paginator budgets include the spacing;
  `npm run lint` + `npx playwright test --config=playwright.ipad.config.ts
  report-pagination` (budget assertion, both engines) + standard suite.

## 34. Table block resize grabbers: match the ribbon designer's style (`[x]`)
- Done: `TableResizeBar` switched to the shared `ColumnResizeStrip` tab
  variant (the slim bar variant deleted — the tab is the only visual);
  the handle strip is an IN-FLOW band between the table's label row and
  the table itself (`-mb-2` flush against the table's top), so the tabs
  never overlap the header cells and the selected block's floating chrome
  can never cover them. Tabs reset the old `title` tooltip. Spec updated
  for the canvas truncation reality (+N more bar from roadmap 12).

- **Requested**: the table block's resize grabbers should look and behave
  like the ribbon designer's resize tabs. Both already share the same
  dragger (`useColumnResize`, `src/components/columnResize.tsx` — roadmap
  24) but render different visuals: the ribbon grid uses
  `ColumnResizeStrip variant="tab"` (triangle tab + line, blue hover, the
  gold standard), the table's `TableResizeBar`
  (`ReportDesignerCanvas.tsx:1019`) uses `variant="bar"` (slim 6px blue
  bars).
- Fix: `TableResizeBar` switches to the tab variant (or the bar variant is
  deleted and tab is the only visual). Watch the strip geometry: the table's
  handle strip is top-anchored (`absolute -top-2.5 h-5`,
  `ReportDesignerCanvas.tsx:1018`) while the tab variant anchors at the
  strip's bottom (`bottom-0`) — tabs would hug the table's top edge; give
  the strip room (taller strip and/or reposition) so the tabs sit like the
  ribbon's. Coarse-pointer sizing variants (`IS_COARSE`) come free with the
  shared strip.
- Verify: table resize looks/behaves like the ribbon designer (desktop +
  touch), item 23 regression (multi-row widths track) still passes, lint +
  playwright.

---

## Session handoff

- Repo branch: `main` (push before ending session).
- Next session: pick items above in order; re-read `docs/REPORTS-DESIGNER.md`
  before touching the designer, `docs/REPORT_PRINTING_AND_PAGE_BREAKS.md`
  before print/pagination work.
