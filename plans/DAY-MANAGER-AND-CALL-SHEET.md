# Day Manager + Call Sheet Editor — Full Plan

**Status:** items **98 shipped**, **99 core shipped** (settings/helper/sections/crew/`crewOfDay`+`dayNotes`; element/department/location collections remain), **100 filter half shipped** (lookup tokens remain), **101 shipped** (inline Glide grids for call times + crew); completion of **item 10** remaining.
**Audience:** the implementing agent. This doc is deliberately exhaustive so you do **not**
re-research. Line numbers were captured while planning (Sep 2026) — if a file has moved,
search the quoted symbol names, not the numbers.

**Read order before starting:** `AGENTS.md` → this doc → `docs/REPORTS-DESIGNER.md`
(only for item 10/100 work) → `docs/DESIGN-LANGUAGE.md` (before building any UI).

---

## 0. Kickoff prompt (copy-paste to the implementing agent)

> Implement roadmap **item 98**, then **99 → 100 → 10**, in `lemon_schedule` on the current
> branch (one agent, one item at a time, no worktrees).
>
> **Read first, fully, before any code:** `AGENTS.md`; `plans/DAY-MANAGER-AND-CALL-SHEET.md`
> (every finding, locked decision D1–D21, file map and UX spec — do **not** re-research;
> verify line numbers if files drifted); `docs/DESIGN-LANGUAGE.md` before any UI;
> `docs/REPORTS-DESIGNER.md` before items 100/10.
>
> **Start with item 98's first slice:** `daybreakMeta` type + `src/lib/dayMeta.ts`, then
> carry it through `useCalendarDrag` insert/swap, then the delete warnings. Commit that
> before building the page.
>
> **Rules:** follow the decisions log exactly — if reality contradicts it, stop and ask.
> Small focused commits (imperative, one revertible unit each). Modularity: one canonical
> `DayView`, registry-driven sections, no hardcoded section/stage/field lists; section
> components are pure props-in/patch-out (never `useProject()`). Reuse/extend shared
> primitives (`TimeField`, `DurationField`, grouped `EntityDropdown`); never fork. Every
> change runs `npm run lint`; logic/store changes run the full `npx playwright test`
> before done. New specs are seed-agnostic via the debug bridge and get RULES entries in
> `scripts/smart-test.mjs`. Update docs (AGENTS.md, DESIGN-LANGUAGE, REPORTS-DESIGNER) in
> the same commits; flip roadmap `[ ]` → `[x]` with a one-line Done note and refresh
> `docs/ROADMAP-ARCHIVE.md`. One patch version bump when the milestone wraps (rule 8).
> Ask blocking questions directly (question tool); ping ntfy first.
>
> **Per item, report:** what shipped, tests run, deviations from the plan (and update this
> doc in the same commit if you deviate).

---

## 1. Product intent (the user's asks, in order)

1. A **Day Manager**: one surface to edit a production day's properties (call time, day
   type, notes, master location, key locations, crew, per-element call times) and see the
   whole day (scenes, cast, elements, events, violations, call sheet) in one place.
2. **Master location + key locations per day**, fed to call sheets, the map block and
   weather (the report location seam is currently a hardcoded London stub).
3. **Attach crew to a day** (per-person call times, department precalls), with a
   project-level "usual crew" template. Item 11 (crew↔element-category links) stays separate.
4. **Call times for every element** (not just cast): an *optional* 1st-AD helper that
   computes stages backwards from the element's first scene appearance, with configurable
   stage labels/leads and per-element overrides. Expression boxes: absolute times or
   relative offsets (`-1h` = one hour before the next stage).
5. **A call sheet editor**: pick a report design, preview/print it scoped to one day, and
   edit a per-day `callSheetEdit` zone. Free-write tables (transportation plans) with `@`
   field tokens. Advance schedule via the existing Relative block.
6. **Reports-designer references**: filter a repeat/table to chosen items (e.g. crew roles)
   and look up a specific item's attributes anywhere (lookup tokens).
7. **UX bar**: professional, calm, efficient; modular, registry-driven, no hardcoded lists;
   Word-like hand-editing; pop-out day windows + cross-day copy/paste for producers/1st ADs.

## 2. Decisions log (locked — do not relitigate)

| # | Decision | Rationale |
|---|---|---|
| D1 | Day Manager is a **page**: Production → new sub-tab **"Days"**. | Production is the logistics tab (Crew/Locations/glides), supports sub-tab pop-outs. |
| D2 | Call-time settings + usual crew template = Production → new sub-tab **"Call Times"**. | Two focused surfaces beat one crowded one (user decision). |
| D3 | Calendar keeps `Calendar \| Day Types` (rename "Day Breakdown" → "Day Types"). | Ends the naming collision with the new Day Manager. |
| D4 | Day properties live on the **governing DAYBREAK row** as `daybreakMeta`. | Production days move with daybreaks; events stay date-keyed. Row storage travels with the day, survives clones, undo restores. |
| D5 | Delete of a daybreak carrying details **warns first**; undo restores. | User concern: "what happens if the daybreak is deleted?" No silent loss. |
| D6 | One canonical module `src/lib/dayMeta.ts` owns the shape/access/write. | "Central source of truth" in practice; nothing reads the raw field. |
| D7 | Modular section architecture: `DayView` + `daySectionRegistry`. | Sections reusable in the page, pop-outs, copy modal, future modals; no hardcoded lists. |
| D8 | Locations: master + key locations from the Locations DB, inline create via the address picker; scene-derived locations shown too. | Coordinates are needed for map/weather. |
| D9 | Call times are an **optional helper**: computed on read from settings + schedule; only overrides stored. | "Should really be a helper and optional." |
| D10 | Stages are **configurable** (labels + default leads); default Pickup → Arrive → HMUA → Costume → On Set. | User choice; "configurable stage labels". |
| D11 | Expression boxes accept absolute (`7:30`, `730`) or relative (`-1h`, `-45m`, `+30m`) values; relative is to the **next** (later) stage. | User: "write -1hr and mean start this 1hr earlier than the next call stage". |
| D12 | Day crew = explicit list with full-roster fallback; per-person call overrides; department precalls; usual crew template. | User chose option 1 + template. |
| D13 | Item 11 (crew↔element-category links) is **not** a prerequisite for day crew. | Attaching crew is independent of report/rule scoping. |
| D14 | Free-write table = **extend the existing table block** with a custom-rows mode (literal cells, `@` tokens). | User choice; reuses table chrome + paginator. |
| D15 | Advance schedule = existing **Relative** block (`+1` ahead), relabeled; no new block. | The "advance block" the user remembered is the Relative block. |
| D16 | Report references: **filtered rows first**, lookup tokens second; **keep** the existing Key Positions fields. | User: "not sure about removing them" → leave them. |
| D17 | Per-day call-sheet editing happens in a **full-surface mode inside Days** (Back · design picker · Reset · Print). | Multi-step/complex → page, per design language. |
| D18 | **Day pop-out windows + a shared day clipboard** are in scope for item 98. | The producer cross-day copy/paste workflow. |
| D19 | Shared duration/time inputs: extract `DurationField`, add `TimeField` (touch keypad). | User: "any duration input should use our shared duration input elements with the mobile modals". |
| D20 | New primitives are ui-kit promotion candidates (item 56 path), not forked. | AGENTS.md rules 1/4. |
| D21 | Day Manager = sections editor **+ live call-sheet preview** (desktop split, iPad toggle). No paper-shaped editor. | WYSIWYG payoff without rebuilding editors inside a print layout; the preview host is shared with item 10. |

## 3. Current-state findings (canonical — do not re-derive)

### 3.1 Day/section model

- `ScheduleRow` — `src/types.ts:41-68`. `type: SCENE | BREAK | NOTE | DAYBREAK`.
  Daybreak fields: `daybreakLabel`, `daybreakCallTime`, `daybreakDate` (legacy/computed),
  `pinned`. **No other per-day field exists.**
- `NonShootDate` — `src/types.ts:89-109`: `{ date, status?, pattern?, lists?, comments? }`.
  `lists[statusKey][category][elementKey]` (cast = Board IDs, others = names, `'*'` = whole
  category). `comments[statusKey][category][elementKey]` = per-element notes. Date-keyed on
  `CalendarVersion.nonShootDates`.
- `CalendarVersion` — `src/types.ts:125-139`: `nonShootDates`, `productionStart`, `prepStart`,
  `postEnd`, `weeklyDaysOff`. `ScheduleVersion` (`:111-123`) only has `rows`.
- Section derivation — `src/lib/daybreakUtils.ts`: `splitSections` (`:108-122`; each DAYBREAK
  closes the section above it); `computeRowData` (`:124-281`); date cursor `getDate`
  (`:159-163`) skips statused dates; `sectionBaseTime = r.daybreakCallTime || callTimeBase ||
  '08:00'` (`:224`) — **the daybreak above a section governs its call time**;
  `advanceDateCursor` (`:55-62`). `ComputedRow` (`:11-24`), `SectionInfo` (`:37-43`),
  `SectionSums` (`:29-35`).
- Canonical read hook — `src/lib/useDaybreakSections.ts` returns
  `{ productionDays, sections, productionSections, sectionDateMap, sectionLabelMap,
  sceneToSection, formatSectionDate, nonShootSet, activeVersion, project, chronoDayMap,
  productionChronoDayMap, nextSectionDateMap, daybreakRowToSection, computedRows,
  sectionSums, startDate }` (`:103-121`).
- The **daybreak above section i** is `sections[i-1].daybreakRow` (pinned for day 1).
  Two ad-hoc copies of this logic exist: `reportData.ts:482` and `violations.ts:42-43`
  (`above?.daybreakCallTime || s.daybreakRow?.daybreakCallTime || '08:00'`) — consolidate
  into `dayMeta.ts` when implementing (rule 4).

### 3.2 What moves with a day on restructure (critical for D4)

`src/components/calendar/useCalendarDrag.ts` (strips mode):

- Shared write path `applyRowsAndStatus` (`:165-175`): `UPDATE_VERSION` (rebuilt rows) +
  `UPDATE_CALENDAR_VERSION` (`applyNonShootDateMapping(nonShootDates, mapping)`).
- Insert (`:177-211`): snapshots each day's call time (`:183-186`), splices the block,
  rotates call times onto the new governing daybreaks (`:192-196`), builds an old→new date
  mapping for the affected range (`:200-207`).
- Swap (`:214-246`): exchanges content (`:222-224`) and call times between the two
  governing daybreaks (`:226-235` — **skipped when either index is 0**, the pinned row),
  two-way date mapping (`:237-243`).
- `applyNonShootDateMapping` — `src/lib/events.ts:264-272`: remaps `ns.date` and spreads
  the rest (status/lists/comments/pattern travel). Called in **both** strips insert and swap.
- Events mode (`useEventsDrag.ts:179-196`): permutes `NonShootDate.date` **and rule dates**;
  stripboard rows/call times untouched.
- Rules' dates are **not** remapped in strips mode.
- **Daybreak deletion**: there is **no `DELETE_ROW` action**. `useStripboardContextMenu.ts`
  `:264-272` filters the row out and dispatches `UPDATE_VERSION` — **no confirm**. Sections
  merge; later days re-derive dates from the cursor; `nonShootDates` linger on their dates.
  Keyboard Delete does the same (`useScheduleKeyboard.ts:115-124`). Bulk ops do warn:
  Clear All Day Breaks (`ScheduleTab.tsx:696-710`), Sort (`:1000-1013`), Auto Daybreak
  (`:899-972`).
- **Daybreak insertion**: `useStripboardContextMenu.ts:232-235` (`add_daybreak`, fractional
  order, `daybreakCallTime: '08:00'`).
- **Key stability**: `daybreakRow.id` is regenerated on `NEW_VERSION` clone
  (`src/store/actions/schedule.ts:189-197`) and possibly for the pinned row
  (`src/store/rows.ts:12-23`); `section.index` is derived; dates are derived. Row *values*
  (including `daybreakMeta`) copy through the clone spread.

**Implication:** put day properties on the governing daybreak row (D4), extend the
insert/swap rotation to carry the meta bundle alongside `daybreakCallTime` (including the
index-0/pinned edge case — decide and document), and add the delete warning (D5).

### 3.3 Store write paths

`src/store/reducer.ts` Action union + `ACTION_TYPES` ("KEEP IN SYNC"):

- `UPDATE_ROW { versionId, rowId, updates: Partial<ScheduleRow> }` — `actions/schedule.ts:165-179`.
  **Preferred for dayMeta patches** (single-row).
- `UPDATE_VERSION { ...Partial<ScheduleVersion>, id }` — `:153-163` (whole rows array; the
  call-time input path via `StripBlock.tsx:176-180`).
- `UPDATE_CALENDAR_VERSION` — `:281-288` (the ONLY calendar-field write path).
- `SET_DAY_TYPES` — `actions/reports.ts:417-430`. `UPDATE_PROJECT` — `actions/schedule.ts:9-12`.
  `SET_PRODUCTION_INFO` — `actions/reports.ts:134-140` (merge).
- No day-specific action exists; none is needed (dayMeta rides `UPDATE_ROW`).

### 3.4 Day UI surfaces today

- `src/components/calendar/DayEventsModal.tsx` (484 lines): props
  `{ dateKey, violations?, rules?, initialStatus?, initialRule?, onClose }` (`:26-37`).
  Tabs **Events / Conflicts / Rules**; per-day-type `CardSection`s of `ItemRow`s with
  inline per-element notes; live mutations via `upsertNonShootDate` +
  `UPDATE_CALENDAR_VERSION`; nested `EventModal` / `EventAdderModal` / `RuleEditorPanel`.
  Opened from `CalendarTab.tsx:1438-1447` and `DayTypesTab.tsx:342-350`.
- `src/components/calendar/DayTypesTab.tsx` (353 lines): the Calendar "Day Breakdown"
  sub-tab — day-TYPE registry sidebar + per-date event summaries; production days from
  `useDaybreakSections` (`:74-82`); row click opens DayEventsModal.
- `src/components/calendar/CalendarTab.tsx` (1452 lines): day header click →
  DayEventsModal (`:1221`), right-click day context menu (`:1324-1346`: statuses,
  Add Events…, Manage Events…, Clear Status), events-mode card dblclick → EventModal.
- `src/components/ScheduleTab.tsx` (1557 lines): daybreak rows render
  `SortableRowDaybreak.tsx` (call-time `CellInput` at `:185-194`/`:269-276`); **no day
  context menu**; daybreak double-click is a no-op (`:188-206`); Delete silently removes a
  daybreak (`useScheduleKeyboard.ts:115-124`).
- `src/components/elements/ElementEventsModal.tsx` (419 lines): the reference
  comprehensive manager — collapsible `CardSection`s per day type, `ItemRow`s with inline
  notes, Violations section, Rules section with `RuleCard` + Add Rule.
- **Primitives**: there is no `ItemCard` in the repo; the shared card is the ui-kit
  `CardSection`, the row is `src/components/cards/ItemRow.tsx` (`ITEM_ROW_CLASS`,
  `ITEM_ROW_BODY_WRAP`). `ItemCard.tsx` is the app-local group card (dark). Violations:
  `computeSectionViolationMap` (`rulesEngine.ts:202-221`), `rulesRelevantToDay` (`:191-197`).
- **Duration/time inputs**: `DurationKeypad` (`src/components/DurationKeypad.tsx`,
  props `:7-19`; portal keypad, `isTouchMode` gate via `useTouchMode` in
  `src/lib/useMarquee.tsx:43-46`). The `isTouchMode ? DurationKeypad : CellInput` recipe is
  **duplicated** at `SortableRibbon.tsx:376-403`, `SortableRowBreak.tsx:70-102,149-174`,
  `SortableRowNote.tsx:78-95,134-145`, `AddBannerModal.tsx:185-206,242-266`. Parse/format:
  `parseDuration`/`formatDuration` (`utils.ts:67-102`), `parseTime`/`addMinutesToTime`
  (`utils.ts:105-123`). **No `normalizeTime` exists** — add one in the shared field.
- `src/components/ProductionTab.tsx`: sub-tabs `details | crew | crewGlide | locations |
  locationsGlide` (`:24`); details sections Project Details / Dates / Key Positions;
  `commitInfo` → `SET_PRODUCTION_INFO` (`:112`). `productionInfo` type at
  `src/types.ts:380-391`.
- Pop-outs: `src/components/popout/PopoutFrames.tsx` (`PopoutFrame`, `SubTabPopoutFrame`),
  App-level `poppedOutTabs`/`poppedOutSubTabs` + window refs + `cascadePosition()`.

### 3.5 Locations & crew

- `ProjectLocation` — `src/types.ts:353-370`: `{ id, name, type, address?, place?, lat?,
  lng?, contactName?, phone?, email?, notes?, nearby?: { hospitalId?, policeId? } }`.
  Types reuse `CrewRole` shape in `project.locationTypes`; `DEFAULT_LOCATION_TYPES`
  (`src/lib/locations.ts:8-13`): Set / Unit Base / Hospital / Police Station.
  `resolvedLocationName` (`:43-58`). Actions `ADD_/UPDATE_/DELETE_LOCATION` +
  `SORT_LOCATIONS_BY` (`actions/reports.ts:343-410`); inline address picker =
  `src/components/location/LocationPickerModal.tsx`.
- `Scene.location` is a **free-text name** (not an id); SceneSheet creates a missing DB
  entry on commit (`src/components/SceneSheet.tsx:184-202`, type `'set'` fallback).
- `CrewPerson` `{ id, name, phone?, email? }` (`types.ts:331-336`); `CrewRole`
  `{ key, label, builtin?, department? }` (`:338-345`); stored `project.crew` (role→people),
  `crewRoles`, `crewOrder`. Departments: `CREW_DEPARTMENTS` (`src/lib/crewCatalog.ts:16-110`),
  `DEFAULT_CREW_ROLES` (`:112`), `crewDepartmentOf` (`:117`). Crew actions
  (`actions/reports.ts:144-302`). **No per-day crew exists.**
- **No crew↔element-category link exists** — item 11 is open;
  `NON_SCOPABLE_COLLECTIONS` includes crew (`reportBlocks.ts:455`).

### 3.6 Reports designer & call sheet

- `buildReportCtx` — `src/lib/reportData.ts:432-627`; `ReportDayInfo` (`:131-144`);
  day loop (`:469-492`) sets `callTime` from the daybreak above. `dayCallTime` field exists
  (`reportFields.ts:161`), `dayEnd` is computed (`:162`); **no day location, no day notes,
  no day crew**.
- Location seam is a **London stub**: `getReportLocation` (`reportData.ts:26-44`),
  `locationsOfItem` (`:55-68`), `pickLocation` (`:72-80`). Consumers: location fields
  (`reportFields.ts:303-318`), sun/weather (`:258-262`), map block (`ReportMapView.tsx:73-79`),
  weather prefetch (`reportWeather.ts`).
- Crew report items: `buildReportCtx:558-564` (`{ role: label, name, phone, email }` — **no
  stable key**; `reportItemKey('crew')` returns `0`, `reportData.ts:289-303`; the print
  dialog filters crew by list position, `ReportPrintDialog.tsx:75`).
- Scope machinery: `ReportScope` (`:253-257`), `ReportScopeFilter` (`:264-266`),
  `filterItemsByScope` (`:328-342`), applied in `ReportRepeatView`/`ReportTableView` and
  `resolveRelativeItems`. `ReportPreview` accepts `scopeFilter` (`ReportPreview.tsx:20`);
  `ReportPrint` too (`ReportPrint.tsx:17`); `App.handleReportPrint` (`App.tsx:663-670`).
  Print dialog checklists only top-level repeats (`ReportPrintDialog.tsx:30-35`).
- `callSheetEdit` block: type union `types.ts:424`; renderer `ReportBlockView.tsx:298-340`
  (children render, dashed border always paints); palette `ReportPalette.tsx:31`; meta
  `blockControls.tsx:39`; **drop zones locked** — `insertInto` only descends into
  `repeat | table | relative` (`reportBlocks.ts:155-163`); canvas child zones only for
  repeat/relative (`ReportDesignerCanvas.tsx:380-443`); paginator treats it as one
  unsplittable unit (`useReportPaginator.tsx:206-224`).
- Table model: `ReportTableColumn { id, field, width, align?, bold?, italic?, skipEmpty? }`
  (`types.ts:401-409`) — **every column is a field key; cells never resolve text**.
  Table defaults `reportBlocks.ts:43-46`; rendering `ReportBlockView.tsx:648-717,817,837`.
- Tokens: `{{field}}` (`reportFields.ts:696`), `resolveReportTokensHtml` (`:771-812`);
  `@` trigger in `src/components/reports/RichTextEditor.tsx:28-57` (kit editor
  `insertToken`, placeholder "type @ to insert an attribute"). Table cells have **no**
  token editor.
- **"Advance block" does not exist.** The closest is the `relative` block (`relativeOffset`
  +1 = next item in the parent repeat; `resolveRelativeItems` `reportData.ts:994-1021`;
  chrome "Relative · 1 ahead" `ReportDesignerCanvas.tsx:364-365`). Inside a `days` repeat it
  prints the next production day.
- Built-in Call Sheet template `reportTemplates.ts:183-210`: `days` repeat → title text,
  weather/sun/location row, location map link, ribbon, **global** crew table, page break.
  **No `callSheetEdit` zone, no scenes table.**
- Hardcoded "Key Positions" fields: `keyPerson` (`reportFields.ts:78`) + `director`,
  `producer`, `lineProducer`, `firstAD`, `upm` (`:230-234`) — name only. **Keep them** (D16).
- Collections & fields: `ReportCollection` union `types.ts:393-396`; `resolveCollection`
  (`reportData.ts:756-868`); contextual children of `days` = only `scenesOfDay`
  (`reportBlocks.ts:441-449`); new-collection wiring checklist in `REPORTS-DESIGNER.md`
  §Extending + `docs/REPORTS-LEGO-CONTEXT.md`.

### 3.7 Industry research (call-sheet needs, mapped)

Sources: StudioBinder (call-sheet anatomy, staggering formulas), Production Slate checklist,
industry templates. Blocks and our status:

| Call-sheet block | Status |
|---|---|
| Production info, day #/date/type, general call, computed wrap | exists |
| Weather/sunrise/sunset/map | fields exist — resolve to the London stub until item 98 |
| Scene schedule (numbers, desc, cast, IE/DN, pages, times) | exists (scenes + ribbon) |
| Cast call times: pickup / arrive / HMUA / wardrobe / on-set; SWHF status | missing (item 99) |
| Background/extras counts + calls | missing (item 99, same matrix) |
| Crew calls by department + precalls; individual overrides | missing (item 99) |
| Day location/address/parking/unit base/holding/nearest hospital | missing (item 98) |
| Day notes / announcements / department notes | missing (item 98/99) |
| Advance schedule (tomorrow) | exists via Relative block (+1) — relabel |
| Transportation plans / free tables | missing (item 10 custom-rows table) |
| Walkies, medic, risk assessment, distribution/receipts | out of scope (not a distribution tool) |

Staggering behavior (the "1st AD assistant"): on-set = when the element first appears
(the scene's computed start time); earlier stages are computed **backwards** from the next
stage; departments are staggered relative to the general call (StudioBinder formula article).

## 4. Architecture

### 4.1 Storage — `daybreakMeta` + `src/lib/dayMeta.ts`

Add to `ScheduleRow` (DAYBREAK only):

```ts
export interface ElementCallTimes {
  pickup?: string; arrive?: string; hmua?: string; costume?: string; onSet?: string;
  note?: string;
}
export interface DayCrewCall { personId: string; callTime?: string; note?: string; }
export interface DayMeta {
  locationId?: string;                 // master location (Locations DB id)
  locationIds?: string[];              // key locations (DB ids, ordered)
  note?: string;                       // day notes / announcements
  crewIds?: string[];                  // day crew (empty/undefined = full roster)
  departmentPrecalls?: Record<string, string>;   // department key -> time expr
  elementCalls?: Record<string, Record<string, ElementCallTimes>>; // category -> key -> times
  callSheets?: Record<string, ReportBlock[]>;    // report design id -> per-day zone blocks
}
// ScheduleRow gains:
daybreakMeta?: DayMeta;   // governs the section BELOW this row (same convention as daybreakCallTime)
```

`src/lib/dayMeta.ts` (new, canonical):
- `daybreakAbove(sections, index)` (consolidates the two ad-hoc copies), `getDayMeta`,
  `isEmptyDayMeta`, `patchDayMeta(dispatch, versionId, row, patch)` (`UPDATE_ROW`; `row`
  carries id + current meta so the patch merges), `sectionCallTime`, `EMPTY_DAY_META`,
  `pruneDayMetaRefs(meta, { crewIds, locationIds })` helpers.
- Stage/lead computation lives in `src/lib/callTimes.ts` (item 99): stage defs from
  settings, `computeElementCallChain(day, elementKey, meta, settings)`, expression parsing
  (`parseTimeExpression`), resolved-vs-override logic.

Restructure handling:
- Extend `useCalendarDrag.ts` insert/swap to carry the whole `daybreakMeta` bundle the same
  way `daybreakCallTime` is rotated/exchanged. Decide the index-0/pinned behavior and
  document it in the code + AGENTS.md.
- Extend the delete paths (`useStripboardContextMenu.ts`, `useScheduleKeyboard.ts`) with a
  `useDialog` confirm when `!isEmptyDayMeta`; extend the bulk-op confirm copy
  (`ScheduleTab.tsx:696-710,1000-1013,899-972`).
- Prune dangling refs on `DELETE_CREW_PERSON` / `DELETE_LOCATION` (or render unresolved
  gracefully; choose one and test). **Chosen for now:** render gracefully — `pruneDayMetaRefs`
  is implemented and ready to wire with item 99's crew/location surfaces.

### 4.1.1 Deviations made during item 98 implementation (authoritative)

- `DayMeta` gained `crewCalls?: DayCrewCall[]` (the plan's shape listed `crewIds` but no
  per-person override home; item 99 needs it).
- `DayView.daybreakRow` is the **governing** daybreak (above the section), not
  `SectionInfo.daybreakRow` (which closes the section). Caught by the call-time/copy tests —
  patching the closing row would write the next day's properties.
- **Grouped picker**: added `EntityItem.group` + group headers to `DropdownPanel` and built
  `GroupedSelect` (light kit menu) for the Day Manager. `EntityDropdown` stays the text-cell
  editor — it is not the right base for a selection picker.
- **Report seam**: the London stub is deleted. `getReportLocation` resolves master → DB-matched
  scene location → blank; `partsFromPlace` (moved to `locations.ts`) fills city/postcode/country
  from the DB `place`; `prepareSunWeatherForCtx` warms every day's own resolved location.
- **Call-sheet default**: the preview pane defaults to a design named "Call Sheet", then the
  active design.
- `CopyDayModal` uses `DaySectionDef.extract` for meta sections and merges events inline;
  `useDayClipboard` is implemented (module state, cross-window) — the paste UI lands with the
  richer clipboard flow if needed.

### 4.2 Modularity — `DayView` + section registry (D7)

```
src/lib/dayView.ts                  canonical read model (one assembly, memoized)
src/components/production/day/
  DayManagerPage.tsx                composition root (sidebar + header + registry sections)
  daySectionRegistry.tsx            THE list: { id, title, icon, summary(day), Component,
                                    copyable, copyMode, emptyState }
  sections/DayDetailsSection.tsx
  sections/CallTimesSection.tsx
  sections/LocationsSection.tsx
  sections/ScenesSection.tsx
  sections/CastElementsSection.tsx
  sections/EventsSection.tsx
  sections/ConflictsSection.tsx
  sections/CallSheetSection.tsx
  CopyDayModal.tsx                  registry-driven; embeds sections read-only
  useDayClipboard.ts                section-driven copy/paste (session, cross-window)
  DayPopoutFrame.tsx                window frame for one date
src/components/TimeField.tsx        absolute/relative expression input + touch keypad
src/components/DurationField.tsx    extracted shared duration recipe
```

- `DayView` = `{ sectionIndex, chronoDay, date, label, daybreakRow, meta, callTime, wrap,
  status, events, scenes, cast, elements, locations, violations, sums }`, assembled once
  from `useDaybreakSections`, `dayMeta`, `nonShootHelpers`, `computeSectionViolationMap`,
  scenes/crew/locations. Sections never re-derive.
- Section props: `{ day: DayView; patchMeta; patchRow; readOnly? }` — **pure, no
  `useProject()`** (per store rules). Same component renders in the page, the pop-out, the
  copy modal preview, and future quick-edit modals.
- `CopyDayModal`: source picker (production days grouped by week, from
  `productionSections`), one checkbox row per `copyable` registry section with its live
  `summary(day)`, per-section `copyMode` (`replace`/`merge`), a confirm restating what is
  overwritten, one `BATCH_START/COMMIT` undo entry.
- Clipboard: `useDayClipboard` holds `{ sourceDate, payloads: Record<sectionId, unknown> }`
  in module state (shared across pop-out windows — same JS realm). Paste offers the
  registry's `applyPayload`.
- Pop-out: App-level `poppedOutDays` + window refs (mirror `poppedOutSubTabs`); desktop-only
  (`!IS_COARSE`); `cascadePosition()`; title `Day N — {date}`; renders `DayPopoutFrame` →
  the same page/detail with the sidebar collapsed.

### 4.3 New shared primitives

| Primitive | Requirements | Promotion |
|---|---|---|
| `TimeField` | text on desktop (`CellInput`), `DurationKeypad`-style keypad on touch; accepts `7:30`, `730`, `7:30am`, `-1h`, `-45m`, `+30m`; live resolved value; auto/override state; reset; `normalizeTime` helper (new) | high (kit, item 56 path) |
| `DurationField` | extract the duplicated `isTouchMode ? DurationKeypad : CellInput` recipe; `parseDuration`/`formatDuration` inside | high |
| `EntityItem.group` + grouped `DropdownPanel` | optional `group` on items + group headers (both themes, coarse sizing, single-highlight preserved); crew by department, categories by group, locations by type | high |
| `DayPicker` | production-day list grouped by week with type icons/flags | app-local |
| `DayPopoutFrame` + `useDayClipboard` | app scaffolding | app-local |

No forks: extend `EntityDropdown`/`DropdownPanel`, don't build a parallel picker.

### 4.4 UX blueprint

- **Two-layer model**: Production is a light page; all overlays dark. Cards, not walls.
- **Page**: sidebar (search + Filter menu + Sort menu; rows `DAY 3 · date · status pill ·
  scenes · conflict flag`, grouped by week; ↑/↓ + Enter keyboard) + sticky day header
  (status picker, inline call time, computed wrap, conflicts, actions Copy from day /
  Pop out day / Print call sheet, prev/next) + collapsible `CardSection`s with live
  summaries; collapsed state persisted.
- **Live call-sheet preview** (D21): the sections editor stays primary; the *real* call
  sheet renders beside it — desktop split view (editor left, paper right, collapsible),
  iPad/narrow a `Manage | Call Sheet` toggle in the day header. Same host as item 10's
  day-scoped preview (`ReportPreview` + `scopeFilter`, one page per day → cheap),
  debounced ~300ms so edits read as live. The day header mirrors the call-sheet top block
  (DAY N · date · general call · wrap · weather · master location). No paper-shaped editor:
  structured editing stays in the sections; only the `callSheetEdit` zone is template-driven.
- **Card highlights**: Call Times = category sub-cards + element rows + `TimeField` cells,
  row context menu (Copy/Paste/Clear overrides/Apply to category), multi-select +
  ⌘C/⌘V/⌘D; Locations = master row + key rows + grouped add picker with emerald
  "Create '<query>'…" → address modal; Scenes = light manager table + filters + row →
  Scene Sheet; Cast & Elements = per-category sub-cards; Events = existing cards + Manage
  events; Conflicts = `RuleCard` rows; Call Sheet = design picker + live preview + Edit
  this day.
- **Call-sheet editing**: full-surface mode (Back · day label · design picker · Reset ·
  Print) reusing the report-designer chrome; only the zone is editable.
- **Modals only for focused tasks** (Copy from day, address picker, print); nested modals
  allowed; Esc dismisses only the top layer.
- **Grouped dropdowns/submenus** for Add category, Filter, Sort, day pickers, location
  types; single-highlight/typeahead/coarse inherited from the kit.
- **Polish**: empty states with CTAs, loading/error per feedback taxonomy (no toasts),
  confirmations restate consequences, undo-first, micro-copy for domain terms, coarse
  sizing, keyboard parity + HelpModal entries, persisted prefs (sidebar filter/sort,
  collapsed cards, last day), performance (per-row props, memoized ids, `UPDATE_ROW`).

## 5. Roadmap items (implementation detail)

### 5.1 Item 98 — Day Manager page + day properties + locations

**Home**: Production sub-tab `Days` (`ProductionTab.tsx` sub-tab union `:24` + App.tsx
sub-tab wiring/popped-out frames; rename Calendar's "Day Breakdown" → "Day Types").
**Entry points**: calendar day right-click "Open Day Manager"; stripboard daybreak
double-click; Day Events modal footer — all switch to Production → Days with the day
selected (mirror the `handleOpenScheduleAtScene` pending-target pattern in App.tsx).

Tasks:
1. `daybreakMeta` type + `src/lib/dayMeta.ts` (4.1).
2. Carry through `useCalendarDrag` insert/swap; delete warnings (dialog + bulk copy).
3. `src/lib/dayView.ts` + `daySectionRegistry.tsx` + the section components (4.2).
4. `DayManagerPage` + sidebar (filter/sort/search/grouping/persisted prefs) + header
   (mirrors the call-sheet top block: DAY N · date · call · wrap · weather · master
   location).
5. **Live call-sheet preview** (D21): desktop split view (collapsible) / iPad
   `Manage | Call Sheet` toggle, reusing item 10's day-scoped `ReportPreview` host,
   debounced ~300ms; day-scoped so pagination stays one page.
6. Locations section: master/key pickers (`EntityDropdown` grouped by location type +
   inline address picker), scene-derived list, nearest hospital/police from `nearby`.
7. Wire the report seam: `getReportLocation`/`locationsOfItem` resolve the day master →
   DB-matched scene locations; remove the London stub (or keep only as a last resort —
   decide in code and note it).
8. `CopyDayModal` + `useDayClipboard` + `DayPopoutFrame` (+ App popout state).
9. `TimeField`/`DurationField` + grouped `EntityDropdown` (shared, 4.3).
10. Entry points + HelpModal shortcuts + docs (AGENTS.md dayMeta invariant,
    DESIGN-LANGUAGE recipes).

**Verify**: page renders/edits; meta survives drag/clone/undo; delete warning; master
location flows to report/weather/map; live preview updates for the selected day and prints
the same output; copy-from-day applies one undo entry; day pop-outs render and share the
clipboard; `e2e/day-manager.spec.ts` + RULES entry.

### 5.2 Item 99 — Day call-times helper + crew + report collections

**Shipped:** tasks 1, 2, 3, 4 and the settings/sections host (task 3's row clipboard/fill-down
landed with item 101's inline Glide grids); task 5 partially (`crewOfDay` + `dayNotes` +
stable `ReportCrewItem` keys). **Remaining:** task 5's `elementCallsOfDay` /
`departmentCallsOfDay` / `locationsOfDay`; task 6 docs beyond what landed.

Tasks:
1. `productionInfo.callTimes` settings (`CallStageDef[]` + per-category stage defaults) via
   `SET_PRODUCTION_INFO`; `project.crewTemplate` (usual crew + department precall defaults) via
   `UPDATE_PROJECT`. Host: Production → `Call Times` sub-tab (Stages / Category defaults /
   Department precalls / Usual crew template sections). **DONE.**
2. `src/lib/callTimes.ts`: `parseTimeExpression`, stage chain computation, on-set anchor
   from the element's first scene `computedCallTime` (cast by ID, others by name), override
   detection/reset. **DONE** (`computeElementCallChain`).
3. `CallTimesSection` (category sub-cards; Cast + Background Actors default; Add category
   via grouped picker; rows = element + `TimeField` cells + note; row context menu,
   multi-select, copy/paste/fill-down; "Calculated from Call Times settings" footer).
   **DONE — the HTML tables were replaced by the item-101 inline Glide grids, which supply the
   row clipboard/fill-down for free.**
4. Crew: `crewIds` attach (grouped by department), per-person `DayCrewCall` overrides,
   `departmentPrecalls`; "Use usual crew" + copy-from-day integration. **DONE.**
5. Report collections: `elementCallsOfDay`, `crewOfDay`, `departmentCallsOfDay`,
   `locationsOfDay` + `dayNotes` field; `ReportCrewItem` gains `roleKey` + `id` (stable
   keys); wire through the new-collection checklist (`reportData.ts` resolver, `reportBlocks.ts`
   labels/order/contextual/identity, `reportFields.ts` scope mapping). **`crewOfDay` + `dayNotes`
   DONE; the other three REMAIN.**
6. Docs: AGENTS.md (call-times helper + collections), DESIGN-LANGUAGE (`TimeField`/
   `DurationField` rows), `docs/REPORTS-DESIGNER.md` (new collections). **DONE for what shipped.**

**Verify**: chain math (on-set → pickup), expression parsing/preview/reset, precalls,
usual crew, copy-from-day; report tables print the right rows; `e2e/day-call-times.spec.ts`.

### 5.2.1 Item 101 deviations (authoritative)

- **Inline, not a sheet page.** The first cut opened the grid as a full-surface mode with a
  Back button. User feedback: that mode switch is confusing — embed the grid in the Day
  Manager instead. Now the Call Times card renders one grid per category (Cast first) and the
  Crew card uses the same grid. No `openCallTimesSheet` action / `sheetCategory` state.
- **Shared component.** The grid mechanics were extracted to
  `src/components/InlineGlideTable.tsx` (auto-fit columns, content height, no-scroll, overlay
  edit / fill / clipboard with one commit per op, centered headers, row hover). Day Times and
  Crew are thin data/rendering adapters; manager pages can reuse it.
- **`setElementCall` / `setCrewCall`.** The override write logic was extracted from the
  sections into `callTimes.ts` / `dayMeta.ts` so the grids and Copy-from-day share one path.
- **Glide canvas repaint.** The inline grids need the explicit full-grid `updateCells` effect
  on `rows`/`COLUMNS` change (same gotcha as `BreakdownTabGlide`/`glideShell`); without it the
  canvas looked stale until an interaction ("right-click renders it" / "doesn't resize when
  crew changes").
- **Crew columns** are `Name | Role | Call` (the Precall column was dropped — the precall
  shows as the muted fallback in the Call cell).

### 5.3 Item 100 — Reports designer: filtered rows + item lookups

**Shipped:** tasks 1 (filter; values are a comma input rather than a distinct-value checklist —
a follow-up polish), 2, 4. **Remaining:** task 3 (lookup tokens) and the canvas filtered badge.

Tasks:
1. `ReportBlock.itemFilter?: { field: string; values: string[] }` on repeat/table; one
   filter step beside `filterItemsByScope` (single resolution path so canvas/preview/print
   agree); designer "Filter rows" control (field picker + values) + filtered badge.
   **DONE except the distinct-value checklist + badge.**
2. `ReportCrewItem.roleKey`/`id` (stable keys, shared with item 99). **DONE.**
3. Lookup tokens: `@` picker "Reference an item…" → collection → item → attribute; resolver
   finds the item by stable key and returns the field; usable in text/free-table cells and
   headers. **REMAINING.**
4. Keep Key Positions fields (D16); note them as superseded. **DONE (kept).**
5. Docs: `docs/REPORTS-DESIGNER.md` (filters + lookup tokens), DESIGN-LANGUAGE if a new
   picker pattern lands. **DONE for the filter half.**

**Verify**: filter persists/narrows, empty state, renames survive; lookup token resolves in
text and free cells; `e2e/report-filters.spec.ts` + RULES. **Filter half verified.**

### 5.4 Item 10 — CallSheet Designer completion

Tasks:
1. Day-scoped preview/print: host around `ReportPreview`/`ReportPrint` with
   `scopeFilter = { scopes: [{ collection: 'days', include: [section.index] }] }`; design
   picker (grouped: Call Sheets / Other Reports); default the Call Sheet template. **The
   SAME host is embedded in the Day Manager's live preview pane (item 98) — build it once,
   share it.** The built-in Call Sheet template is a design deliverable: item 98's preview
   pane only feels like a call sheet if the template looks great.
2. Unlock the edit zone: extend `insertInto` (`reportBlocks.ts:155-163`), canvas child
   zones (`ReportDesignerCanvas.tsx:380-443`), context-menu "Add block inside"
   (`ReportContextMenu.tsx:107-114`), `insertScopeFor`; add a `callSheetEdit` branch to
   `ContentControls` (`blockControls.tsx`) and gate the dashed border to `hint` only
   (`ReportBlockView.tsx:316`).
3. Per-day storage: `daybreakMeta.callSheets[designId]: ReportBlock[]`; renderer uses
   per-day children when present, template children as default; "Reset to template".
4. Full-surface edit mode in Days (D17): toolbar (Back · day label · design picker ·
   Reset · Print) + zone canvas/palette.
5. Custom-rows table mode (D14): `ReportTableColumn` gains a text/cell mode or a parallel
   `customRows` structure; literal rows × columns; every cell a `RichTextEditor` with `@`
   tokens; reuse table chrome + paginator row-splitting (`useReportPaginator.flattenTable`);
   designer cell editor.
6. Advance: relabel the Relative block ("Advance / next day") and add it to the Call Sheet
   template; update the template with the edit zone, scenes table, day-scoped crew table,
   location row.
7. Docs: `docs/REPORTS-DESIGNER.md` + `docs/REPORT_PRINTING_AND_PAGE_BREAKS.md` (zone
   pagination semantics).

**Verify**: one-page-per-day preview/print; zone edits persist per day/design and don't
leak; free-table cells accept `@` tokens; advance renders tomorrow; `e2e/call-sheet-day.spec.ts`.

**Dependencies**: item 98 (day data/locations), item 99 (call-time/crew collections),
item 100 (filters/lookups). Landing order **98 → 99 → 100 → 10**.

## 6. Cross-cutting

- **Tests**: every item runs `npm run lint`; logic/store changes run the full suite (rule 7);
  new specs are seed-agnostic via the debug bridge (`seedLeadCast`, `seedDayDates`, …).
  Add RULES entries in `scripts/smart-test.mjs` (`src/components/production/day/**`,
  `dayMeta.ts`, `callTimes.ts`, `TimeField.tsx`, report filter files).
- **Docs in the same commits**: AGENTS.md (dayMeta invariant + call-times helper + report
  filters + grouped EntityDropdown), DESIGN-LANGUAGE (new primitive rows + Day Manager page
  recipe + expression input), `docs/REPORTS-DESIGNER.md`, `docs/UI-KIT.md` on any kit bump,
  HelpModal shortcuts.
- **Performance**: per-row components take props (never `useProject()`); memoized id
  sequences; `UPDATE_ROW` patches; one `DayView` assembly per day selection.
- **Version**: one coherent patch bump when the milestone wraps (rule 8) — the boot screen
  shows `package.json` version.

## 7. Open follow-ups (explicitly out of scope)

- Item 11 — crew positions ↔ element categories (reports/rules scoping).
- Per-day rules (rules stay project-level).
- Call-sheet distribution/receipts, walkie channels, medic/risk-assessment fields.
- SWHF cast status codes (possible later `castStatus` report field).
- Promoting `TimeField`/`DurationField`/grouped `EntityDropdown` into `@gabriel/ui-kit`
  (item 56 path) once proven in the app.
- The day-1/pinned-row meta edge case may deserve a follow-up fix if the chosen behavior
  proves surprising in use.

## 8. File map (new vs modified)

**New**: `src/lib/dayMeta.ts`, `src/lib/dayView.ts`, `src/lib/callTimes.ts`,
`src/components/TimeField.tsx`, `src/components/DurationField.tsx`,
`src/components/production/day/**`, `src/lib/useDayClipboard.ts` (or beside the components),
`src/components/InlineGlideTable.tsx` (item 101 — shared compact grid, also used by Crew).

**Modified (likely)**: `src/types.ts`, `src/store/reducer.ts` (only if a new action is
needed — prefer `UPDATE_ROW`), `src/components/calendar/useCalendarDrag.ts`,
`src/lib/useStripboardContextMenu.ts`, `src/lib/useScheduleKeyboard.ts`,
`src/components/ScheduleTab.tsx` (bulk confirms), `src/components/ProductionTab.tsx`,
`src/App.tsx` (sub-tab + popout wiring), `src/components/EntityDropdown.tsx` +
`src/components/DropdownPanel.tsx` (groups), `src/lib/reportData.ts`,
`src/lib/reportBlocks.ts`, `src/lib/reportFields.ts`, `src/components/reports/**`,
`src/lib/reportTemplates.ts`, `scripts/smart-test.mjs`, docs listed in §6.
