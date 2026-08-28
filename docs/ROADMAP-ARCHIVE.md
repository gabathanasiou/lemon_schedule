# Roadmap Archive — Completed Items (Index)

Index of completed roadmap items. Full narrative for each item lives in git
history (the commit that flipped `[ ]` → `[x]`); canonical knowledge lives in
`AGENTS.md` / `docs/*.md` / the code pointers below.

How to use: grep this file for a feature term before asking for or
implementing anything. If it hits, the work is done — read the pointers, don't
re-implement. Numbers are stable: `AGENTS.md`, commands, and other items
cross-reference them; never renumber.

| # | Item | Knowledge / code pointers |
|---|---|---|
| 3 | Custom reports — proper page breaks, no element cutoff | `docs/REPORT_PRINTING_AND_PAGE_BREAKS.md`; `paginateBlocks` in `src/lib/reportBlocks.ts` |
| 4 | Reports page print button skips the modal | Reports tab print button opens the print modal first (reports UI) |
| 5 | Custom report print modal polish | PrintDialog-style chrome, per-block ribbon options/overrides — `docs/REPORT_PRINTING_AND_PAGE_BREAKS.md` |
| 6 | Repeater type for Locations / Location Types | Typed-parent registry `TYPED_PARENT_COLLECTIONS` (`src/lib/reportBlocks.ts`); `locationsOfItem`/`pickLocation` (`src/lib/reportData.ts`); `docs/REPORTS-DESIGNER.md` |
| 7 | Bug: remove the Link block from the report designer | Block palette/registry `src/lib/reportBlocks.ts` |
| 8 | Bug: Attribute-block links not clickable in print | `fieldValueNode` URL auto-detect (field blocks AND table cells) — `ReportBlockView.tsx` |
| 9 | Map block location awareness | `pickLocation` seam (`src/lib/reportData.ts`); `LocationChoiceRow` (`blockControls.tsx`) |
| 12 | Report preview: truncate table rows | `TABLE_PREVIEW_LIMIT` (designer canvas only) — `ReportBlockView.tsx` |
| 13 | Spacer block preview: label + line thickness options | `spacerThickness` honored by canvas/preview/print — `ReportBlockView.tsx`, `blockControls.tsx` |
| 14 | Text block editor: don't scale font size | Editor pins 14px base; real `fontSize` only in preview/print — `blockControls.tsx` |
| 15 | Emails/phones in tables: clickable but not blue/underlined | `fieldValueNode` anchors inherit typography — `ReportBlockView.tsx` |
| 16 | Text-token item formatting (affixes) + chip editor | `resolveToken`/`applyItemAffixes` (`src/lib/reportFields.ts`) — superseded by #19 |
| 18 | Move local→cloud bumps the project's modified time | `handleMoveToDrive` carries `p.lastModified` — `src/store/provider.tsx` |
| 19 | Token chip affix editor: list-only + inline in the properties panel | `parseToken`/`composeTokenKey` (`src/lib/reportFields.ts`); `ChipAffixSection` (`blockControls.tsx`); `RichTextEditor.tsx` |
| 20 | Reports designer: edge-drop inside a column + deselect UX | Hoisted new-column handlers, `listOwnerOf` — `ReportDesigner.tsx` |
| 21 | New text blocks start empty | `makeReportBlock('text')` defaults empty — `src/lib/reportBlocks.ts` |
| 22 | Day-repeater text fields can't pick the "Breakdown" attribute type | `dayBreakdownValue` — `src/lib/reportFields.ts` |
| 23 | Bug: table column-width resize broken with multiple rows | Fixed with #24 — shared dragger `src/components/columnResize.tsx` |
| 24 | Extract the ribbon designer's resize draggers into a shared component | `useColumnResize` + `ColumnResizeStrip` — `src/components/columnResize.tsx` |
| 25 | Repeater/table "over" menus: hide self-redundant collections | `isSelfRepeat` — `src/lib/reportBlocks.ts` |
| 26 | Block gap: default 10px vertical spacing between blocks (**REVERTED**) | REMOVED per user decision; re-requested as #33 — see git history |
| 27 | `relative` block — next/previous-item context shifter | `resolveRelativeItems` (`src/lib/reportBlocks.ts`); `ReportRelativeView`; `docs/REPORTS-LEGO-CONTEXT.md` |
| 28 | Text/field blocks: border + background with auto text color | Shared look + luminance helper — `src/lib/reportLook.ts` |
| 29 | Ribbon block: full designer parity + sample-cell fallbacks | `formatCellText` + `ribbonCellDisplayValue` (canvas/preview only, never print) — `src/lib/ribbonUtils.ts` |
| 30 | Bug: repeaters auto page-break when NO pageBreak is present | Positional pageBreak markers only — `src/lib/reportPagination.ts`; `docs/REPORT_PRINTING_AND_PAGE_BREAKS.md` |
| 31 | Bug: location types | `designLocationsIn` (`src/lib/reportData.ts`); `caseRestoreLocation` + `collectionPickPatch` (`src/store/actions/reports.ts`) |
| 32 | Bug: blank pages from repeat items that render nothing | `computeChunks` drop rule + `SKIP_EMPTY_*` registry — `useReportPaginator.tsx`, `src/lib/reportData.ts` |
| 33 | Block gap in preview + print (like the repeat item gap) | `DEFAULT_BLOCK_GAP` + `blockGapMargin` (preview/print only, canvas flush) — `src/lib/reportStyle.ts` |
| 34 | Table block resize grabbers: match the ribbon designer's style | `ColumnResizeStrip` tab variant — `src/components/columnResize.tsx` |
| 35 | Location picker: static center pin, drag the map to place | `src/components/location/LocationPickerModal.tsx` (teardrop + `CenterProbe`) |
| 36 | Map block chrome: click the location name to change it | Map block properties — `blockControls.tsx` |
| 37 | Map block chrome: remove the "Address" note row | Map block properties — `blockControls.tsx` |
| 39 | Custom day types — extend the calendar's day-status infrastructure | **AGENTS.md §Day Types & Non-Shoot Status** (canonical); `src/lib/dayTypes.ts`; `caseSetDayTypes` (`src/store/actions/reports.ts`) |
| 41 | Import & export `.sex` (Scheduling Exchange) files | `docs/IMPORT-EXPORT.md`; `src/lib/import/sex.ts`; reference `tools/sex_probe.py`, golden `e2e/fixtures/lair-v10.expected.json` |
| 42 | Element Manager: per-day-type columns | `computeElementDayStats` — `src/lib/elementDayStats.ts` |
| 44 | Linked elements — anchors with one-way element links | **AGENTS.md §Element Links** (canonical); `src/lib/elementLinks.ts`; `useLinkedEditGuard` write-path seam |
| 46 | Events everywhere — Element Manager events (+ span-chip resize DROPPED; cards count like day status) | **AGENTS.md §Day Types & Non-Shoot Status** (events count everywhere, work-wins cells); `src/lib/elementEvents.ts` (`computeElementAttachments`, `ruleRefersToElement`); `src/components/elements/ElementEventsModal.tsx`; `DayEventsModal` `preseedItems`; shared `RuleEditorPanel`; DOOD event days `deriveDood` (`src/lib/nonShootStats.ts`); span-chip resize superseded by item 45's per-date rule cards |
| 49 | Manager pages cleanup — table borders, input squeeze, toolbar buttons | **AGENTS.md §UI Primitives** + `docs/DESIGN-LANGUAGE.md` §Buttons; kit `@gabriel/ui-kit` v0.1.33 `Button` (barrel `src/components/Button.tsx`); borders/min-w in `src/lib/managerShell.tsx`, `src/components/ElementManager.tsx`; all tab toolbars (schedule/calendar/breakdown/design/reports) converted onto kit Button |
| 52 | Bug: map location selector modal should default to the current location | `LocationPickerModal` `initial` prop (`src/components/location/LocationPickerModal.tsx`) — open seeds center/place/address from the saved pin; wired in the Locations manager `AddressCell` (`src/lib/locationManagerConfig.tsx`) and the reports map block (`blockControls.tsx`). Same commit added the **editable street-number address** (manual override — typed address survives when the geocoder only matches the street, e.g. thinly-mapped OSM house numbers) |
| 53 | Locations manager: name falls back to address; nearest hospital/police on ui-kit dropdowns | `resolvedName` (`src/lib/locationManagerConfig.tsx`) — display + save-seam fallback chain name → address → place → lat,lng (blank identity never stored); `NearbyCell` kit `DropdownMenu`/`DropdownItem` pickers (sort-menu recipe, self-row excluded, checked glyph); smart-test rule `src/components/location/**` |
| 53 | Element Manager: Board-ID lock + Auto-ID warning (+ manager table polish) | `project.lockedElementIds` (per-category) + `TOGGLE_ELEMENT_LOCK` (`src/store/actions/breakdown.ts`); lock icon next to the Board ID input (`ElementManager.tsx`); Auto-ID confirms (DNWA) and skips locked ids; dropdown triggers are click-to-toggle (`onOpenChange`, no manual onClick); pinned columns sticky via inset-shadow dividers + `group-hover` rows |
| 57 | Anchor icon in EntityDropdown for anchored elements | `anchoredKeys` prop (`EntityDropdown.tsx`, both panel themes); `anchoredKeysFor` (`src/lib/elementLinks.ts`); wired in Link Manager, Scene Sheet, stripboard, Glide, day-modal attachments + rule editor |
