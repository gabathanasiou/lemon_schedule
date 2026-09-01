
# Roadmap — Future Implementations Checklist

This file is the pending work list: `[ ]` not started, `[~]` in progress.
Only open/in-progress items live here — the live file is read by every
roadmap worker session, so it stays lean.

- **Completed items:** see `docs/ROADMAP-ARCHIVE.md` (index + code/knowledge
  pointers; full narratives in git history).
- **New asks** go through the triage/dedupe gate (AGENTS.md, §Roadmap Work)
  before becoming an item here.

---
## 1. Ribbon Block outside a Repeater (`[x]` Done)

**Done**: a ribbon block outside any repeater renders the FULL schedule
(`ReportRibbonView` → `FullSchedule`, `src/components/reports/ReportRibbonView.tsx`),
the designer/preview caps it at `DAYBREAK_PREVIEW_LIMIT` (4) with a "…N more
strips" hint, the day-breaks toggle (`ribbonDayBreaks`/`ribbonHeaders`) renders
START OF DAY / End of Day halves, and note/break rows render 1:1 with the
stripboard via the shared renderers (`StaticNoteRow`/`StaticBreakRow` +
`ribbonCellDisplayValue`). Verified by `e2e/report-pagination.spec.ts` (top-level
ribbon full schedule + day breaks).

## 2. REMINDER: Location Manager fix + wire locations into scenes (`[x]` Done)

**Done**: the Scene Sheet's Location cell is an editable autocomplete
(`AutocompleteDropdown`, int/EXT-style) seeded from the Locations Manager DB;
the field is formalized on `Scene` (`location: string`, `createBlankScene`); the
print breakdown sheet prints it. The `.msd` import materializes every distinct
scene Location string into the locations DB under an "MSD Import" type (MMS has
no location registry). **The stripboard/glide location columns were DROPPED
(user decision) — locations are not wired into the stripboard/glide; the scene
sheet is the single location surface and this item is closed.**

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

## 38. Script version diff — accept a new screenplay against the current one (`[ ]`)

**Requested**: when uploading a newer version of the screenplay, a diff
viewer / acceptance step before anything changes. Research: Filmustage (same
domain: breakdown → schedule) ships a compare hub — Scene Diff
(side-by-side content diff, filter by Modified/Removed), Tags Diff
(added/removed/changed grouped by category), impact summary. Industry
consensus: match scenes by scene number, diff per field; `diff` (jsdiff,
Myers algorithm, word/line level) is the standard JS lib.

**Problem**: `ImportDialog` appends every parsed scene as a brand-new scene
(fresh UUIDs in `commitImport`) — re-uploading a revised script duplicates
all scenes and orphans the schedule. When the project already has scenes,
the import must **diff and update in place** instead of append.

**Matching** (new pure module `src/lib/import/scriptDiff.ts`,
unit-testable, no store/UI deps) — three escalating signals + order-aware
alignment:

1. **Primary — normalized scene number** (`1` vs `1A`; tolerate
   renumber/prefix drift).
2. **Secondary — heading signature** via `parseSceneHeading` (`intExt` +
   normalized `set` + `dayNight`).
3. **Tertiary — content/context similarity** (user-requested): a per-scene
   fingerprint = normalized description tokens + cast characters (via
   `normalizeCharacterName`) + element items + location; paired by
   token-overlap (Jaccard) score against neighbor candidates — high-score
   pairs match even with no number/heading match (renumbered, retitled
   heading, broken heading).
4. **Order-aware alignment**: the pass is an **LCS alignment over the
   ordered scene lists** keyed by the signals above — an inserted scene
   mid-list never cascades wrong matches onto the scenes after it (classic
   ordered-diff pitfall). **Added / Removed** come from the alignment gaps,
   not per-scene lookups.
5. **Suspected split/merge tags**: one old scene splitting into two new
   (or two merging into one) scores high against the same counterpart
   twice — badge "Scene 8 split into 8A/8B" instead of a confusing
   "modified + added" pair (same scoring data, cheap).

**Per-scene diff** (vs the current saved scene):
- Heading fields: `intExt`, `set`, `dayNight`, `pageCount`/`pageCountDecimal`,
  `scriptDay` — simple equality.
- `description` — **word-level** diff (jsdiff `diffWords`, added/removed
  highlighting).
- `cast` + every element category (props, wardrobe, …) — **item-set** diff
  (± lists; via `getFieldItems`, never raw `split(',')`).
- `notes`, `location` — equality.
- **Unchanged** only when number/heading matched AND context similarity ≈ 1;
  a heading-only match with big content drift shows as **Modified**.

**Acceptance UI** (new stage in `ImportDialog`, shown when
`project.scenes.length > 0`):
- Summary bar: X unchanged · Y modified · Z new · W removed (+ split/merge
  badges).
- Filter tabs: All / Modified / New / Removed / Unchanged.
- Scene rows (script order): scene number + heading + change badges; expand
  for a **side-by-side per-field diff** (word-level highlights in
  description, item ± lists for cast/elements, before → after for heading
  fields). A split/merge row diffs the old scene against each fragment.
- **Removed scenes default to KEEP** (user decision): per-scene "remove"
  toggle + "remove all" shortcut — the stripboard/schedule investment is
  untouched by default.
- Existing review-stage controls stay (new categories, hidden categories
  with data, cast ID assignment/ordering).
- Footer: "Update N Scenes" + Cancel.

**Commit** — one undo entry (`BATCH_START`/`BATCH_COMMIT`; extend/parallel
`commitImport` with a `commitScriptDiff`):
- Matched + accepted → `UPDATE_SCENE` patches **in place, ids preserved**
  (stripboard rows, day assignments, call times, ribbons survive;
  `caseUpdateScene` re-parses `pageCount` on patch).
- Added → `ADD_SCENE` — lands **in the boneyard** (`containerId: null`,
  `maxBoneyardOrder + 1`, schedule.ts:24-31 — user decision: new scenes
  never shift the stripboard; user restores them where they belong).
- Confirmed-removed → `DELETE_SCENE` (scene→row invariant: rows removed in
  every version; copy goes to trash, restorable).
- New cast → existing `castIdMap` flow (`ADD_CAST_MEMBER` +
  `ADD_ELEMENT` cast category — cast referenced by ID, names via
  `normalizeCharacterName`); new elements → `ADD_ELEMENT` per category;
  new/updated sets as today.
- No new action types (all exist: `UPDATE_SCENE`/`ADD_SCENE`/`DELETE_SCENE`
  + element/category/cast actions).

**Dependency**: `diff` (jsdiff) for the word-level description diff — the
standard, tiny, browser-safe. New-dep rule: imported by ≥1 source file.

**Verify**: re-import the seed script ("IT'S A WONDERFUL LIFE") with a few scenes edited,
added, removed, one split, one renumbered → only diffs apply; unchanged
scenes keep ids; schedule + ribbons intact; new scenes in the boneyard;
removed scenes kept by default; undo restores exactly; filters + expanded
diffs render; lint + playwright. **Out of scope** (follow-ups): Filmustage-
style cross-version schedule/budget impact reports, archived-versions hub —
this item is the import acceptance step only.

## 40. Import legacy Movie Magic Scheduling `.msd` files (`[x]` Done)

**Done**: `parseMsdFile` (`src/lib/import/msd.ts`, container splitter + XML → complete Project) wired into the Project Manager and App File → Import as NEW-PROJECT-ONLY (`importProjectFromData`); maps 20 MMS categories → elements/cast (cast by ID), sets/location/sequence/unit → scene fields, boards → versions with full rows in strip order (pinned anchor + N−1 breaks — no phantom Day 1), board calendars → calendar versions (item 74: one per distinct MMS calendar, named by the MMS name, with prepStart/postEnd/weeklyDaysOff + window-bounded nonShootDates), page counts as app eighths (`formatPageCount`), `scriptPageNumbers`. Reference parser `tools/msd_probe.py` + golden `e2e/fixtures/wonderful-life.expected.json`; verified by `e2e/msd-import.spec.ts` (146 scenes, active board's days in exact strip order, undo restores).

**Requested**: import `.msd` ("Movie Schedule Data") files — the native
schedule format of legacy **Movie Magic Scheduling 6** (EP) — so full
schedules (stripboard + day breaks + call times + breakdown) made in MMS 6 can
move into Lemon Schedule. Sibling of item 41 (SEX import/export); share the
pipeline work where possible.

**Format — CRACKED (structure verified on `~/Downloads/Wonderful Life Demo
V5.msd`, MMS 5.00.326, 2009)**: the `.msd` is an ASCII-delimited container
**("EPSF" = EPS Schedule File)** — no custom compression, no encryption:

```
/********* EPSF FILE ********/           ← 716B header: "00.01.001",
    "EPS Schedule File", "05.00.000", "Movie Magic Scheduling 5", version, timestamp
/********* EPSF SECTION *********/       ← repeated delimiter (+ space)
  [34-byte section header]              ← fixed skip
  <payload>
```

Two payload kinds: **image records** (sections 1–6: an embedded path string
like `;C:\...\henrytravers.jpg` + raw JFIF/PNG/BMP — cast photos/stills, not
needed for v1) and **data records** (sections 7–18): a **raw deflate stream
starting at byte 34** that inflates to a plain **UTF-8 XML manager document**
(`zlib.decompress(p[34:], -15)` — verified on all 12 data sections, 100%
printable). A trailing plaintext "EPSF SECTION MAP" lists the managers +
versions. Sections, contents → Lemon mapping:

- `ProductionInfo` — PictureTitle/Company/Director/Producer/UPM/AD (PropertyList)
  → project metadata.
- `CategoryMgr` + `ElementMgr` — 20 MMS categories (Cast Members, Props,
  Wardrobe, Makeup/Hair, Set Dressing, Greenery, Stunts, Vehicles, SFX, music,
  Sound, Mechanical Effects, Visual Effects, Background Actors…) + all elements
  (Name, CategoryName, Property CDATA blobs → pay/min/etc, drop). **MMS models
  "Sequence", "Set", "Unit", "Script Day", "Location" as element CATEGORIES** —
  these must map to Lemon scene FIELDS, not element categories (dedupe list).
- `BreakdownSheetMgr` — one `BreakdownSheet` per scene: `BDSID` (stable ID),
  `Scenes` (scene number), `SheetNumber` (auto sheet #), `IE`/`DN`
  (INT/EXT + Day/Night), `Set`, `Location`, `Synopsis` (description),
  `ScriptDay`, `ScriptPageNumbers` + `NumScriptPages` (page count data),
  `Unit` (2nd unit…), `EstimateTimeB`/`EstimateTimeA`, `Sequence`,
  `Comments`, `ElementRefs` (CategoryName + ElementName pairs — the per-scene
  breakdown), `Attachments` → scenes.
- `StripBoardMgr` — multiple stripboards as **scenarios**: "Scene Order",
  "Location Scenario", "Actor Scenario" (demo has 3; `ActiveStripBoard` pref
  picks the real one). Per board: `ScheduleDay` groups — **day breaks** with
  the strip order inside each day (BDSID refs), `RemainingScheduledStrips`
  (unscheduled → Boneyard), `BannerStrip` (unit banner rows) → stripboard.
  Day breaks carry NO call times in this demo file — parse them when a
  real-world file has them, gracefully absent otherwise.
- DOODLayoutMgr / CalendarMgr / PrintViewOptions / ColorSettings /
  StripBoardLayoutMgr / ReportLayoutMgr / RedFlagMgr — UI chrome, skip.

**Integration (same pipeline as item 41 / FDX / CSV)**:
- **NEW-PROJECT-ONLY (user decision)**: `.msd` (and `.sex`, item 41) imports are
  gated to project creation — no append-into-current flow, no ImportDialog
  review stage. The parser builds a COMPLETE `Project` (project-shaped, like
  `makeBlankProject` + content: scenes/elements/cast/customCategories +
  versions with full rows arrays in board order) and hands it to
  `importProjectFromData` (provider.tsx:603, the JSON-project import path) —
  migration + LOAD normalize the rest (pinned daybreak, rows invariants via
  `ensurePinnedDaybreak`/`ensureAllScenesHaveRows`, dayTypes defaults).
- New `src/lib/import/msd.ts` — container splitter (marker scan; try-inflate
  at offset 34 with a small offset probe fallback for robustness across MMS
  versions; detect image sections via JFIF/PNG/BM signatures and skip them)
  + XML → complete Project. Verify-against reference: `tools/msd_probe.py`
  (committed Python reference parser — same mapping rules; emits
  `e2e/fixtures/wonderful-life.expected.json`, the golden the Playwright spec
  asserts against). Fixture: `e2e/fixtures/wonderful-life.msd` (1.5MB copy of
  the demo).
- Entry point: ProjectManager import ("New project from .msd/.sex…") and/or
  the Project Manager import button — file picker accepts `.msd,.sex,.fdx,
  .csv`; new-project-only applies to msd/sex (fdx/csv/fountain keep the
  existing append flow).
- Scene field mapping: `Scenes` → scene number (multi-scene sheets like
  "108, 110" stay ONE scene with the composite label — matches the strip),
  `Synopsis` → description, `IE`/`DN` → `intExt`/`dayNight`, `Set` → set,
  `ScriptPageNumbers` (script page the scene starts on) →
  **`scene.scriptPageNumbers`** (first-class Scene field, shared with FDX
  `<Page>` break markers — future full-FDX import/render support),
  `NumScriptPages` → `pageCount`/`pageCountDecimal`
  (MMS eighths: last char = eighths, "12" = 1 2/8 → **total** 1.25. Lemon
  stores the TOTAL decimal in `pageCountDecimal` and the "1 2/8" eighths
  string in `pageCount` via `formatPageCount` — NOT the fractional part;
  section page sums and report totals add `pageCountDecimal` raw), `Sequence`/
  `Unit` → **custom category fields** (user decision), `Comments` + `Notes`-
  category refs → notes, `Location` attr → location (stays per-scene text
  until roadmap item 2 wires id-linked locations into scenes).
- Production info: `Company` → `productionInfo.company`; `Director`/
  `Producer`/`Upm`/`AsstDirector`/`ArtDirector`/`SetDresser` → **crew roster**
  people under built-in role keys (`director`/`producer`/`upm`/`firstAD`/
  `artDirector`/`setDecorator` — one person per named role; empty values
  skipped). MMS 5 files carry no crew registry — names only, no phone/email.
- Scenes: imported in MMS **SheetNumber order** (= script order — MMS numbers
  sheets by script position, scene 18 lives on sheet 19; the breakdown sheet
  then starts at sheet 1 and the glide row positions equal the MMS numbers)
  and each scene keeps its `sheetNumber`.
- Colors (`ColorSettings`): the **ColorGrid** strip matrix (columns
  INT/EXT/INT-EXT × rows Day/Night/Morning/Evening — same vocabulary as
  Lemon's palette) maps 1:1 into `colorPalette.sceneColors` (RGB→hex; the
  empty/`Other` cells skipped); `StripColorPreferences` → `Hilite`→
  selectedStripBg/Text, `DayStrip`→dayHeaderBg/Text, `Banner`→noteBg/Text.
- Elements: Cast Members + Background Actors → cast members (name via
  `normalizeCharacterName`; cast referenced by ID — build the `castIdMap`),
  everything else → `ADD_ELEMENT` per mapped category; `Set Dressing`/
  `Sequence`/`Unit`/unknown → custom categories (registry entry +
  scene fields).
- Schedule: boards → **versions** (user decision — each MMS stripboard is a
  Lemon ScheduleVersion: same breakdown, own days/order). Version rows built
  directly (rows arrays are the single source of truth): active board =
  primary version (`ActiveStripBoard` pref; demo: "Actor Scenario"),
  others = extra versions; `ScheduleDay` groups → **sections** with a
  DAYBREAK row ONLY between consecutive groups (canonical layout:
  `[pinned] [day 1] [break] [day 2] [break] …` — N days = N−1 breaks; a
  break before day 1 would create a phantom empty Day 1 and shift every
  label/date by one — verified bug, do not reintroduce); `BannerStrip` →
  **NOTE rows** (user decision — not breaks), `RemainingScheduledStrips` +
  `UnscheduledStrips` (both undated board zones) → Boneyard. Cast member
  ids are per-project sequential integers in MMS ElementMgr roster order —
  the "Board IDs" MMS assigns (George=1, Mary=2; sheet-only names append
  after the roster; the UI labels the cast numbering "Board ID");
- Calendar (per board, via `CalendarName`): `ProductionStartDate` →
  `version.productionStart`; `DaysOff` weekly pattern + `SpecialDays`
  **materialized into explicit `nonShootDates`** bounded to the production
  window (start..wrap; the demo's SpecialDays are 2003–2007 template junk —
  the window bound keeps them out). Off days + weekends + MMS Holidays all →
  `holiday` ("Day Off" — user decision; weekends are days off, not holds),
  CompanyTravel→`travel`, ExceptionWorkday→nothing (work is the default).
- No ImportResult/commitImport involvement for msd (that machinery stays for
  fdx/csv/fountain appends). .sex import (item 41) reuses the
  project-building + board→version + calendar materialization helpers.

**Verify**: demo .msd fixture → 146 scenes + 20 categories + 445 elements +
  the active board's ScheduleDay groups as sections in exact strip order — no
  phantom empty Day 1 (pinned anchor + N−1 breaks; Day 1 carries the first
  group's strips, dates land day 1 = production start); cast ids numeric;
  page counts render as app eighths ("1 2/8"); scene→row invariant holds;
  unscheduled strips in the Boneyard; undo restores exactly; lint +
  playwright (seeded-project import flow).

## 43. Import `.mmx` / `.MMS10` (Movie Magic Screenwriter XML) (`[ ]`)

**Requested**: someday — optional import path for EP's Screenwriter XML interchange (`.mmx`, rebadged `.MMS10` for MMS 10's "Import Script"). Producers would arrive with scripts/tagged breakdowns exported from Movie Magic Screenwriter, Filmustage, Shamel Studio or StoryboardCanvas.

- **BLOCKED — no sample file.** The schema is undocumented in the open; nothing in `open-moviemagic-toolkit` or anywhere public. An XML parser needs a real sample to build and verify against.
- **Unblock**: one `.mmx` file with known content (2–3 scenes + tagged elements) — e.g. a Filmustage free-tier export, or a Screenwriter trial export. That single file makes it a contained task (XML with a known schema — like the FDX parser; the `TagData`/tag-resolution machinery in `fdx.ts` is the template).
- **Scope if implemented**: NEW-PROJECT-ONLY import (same as `.msd`/`.sex` — update `parseMsdFile`-style flow + Project Manager "Import" accept list + e2e). Breakdown side only — script data (headings, characters, tagged elements, synopses, page counts), no stripboard. Do NOT build an .mmx export unless a user asks (screenwriter XML fans mostly read-side).
- **Priority: low — parked knowingly.** `.sex` (item 41) already covers every real scheduling tool, and `.fdx` covers script-with-tags. This is a "who knows, maybe in the future" item; skip until a sample exists.

## 45. Calendar Events mode — day event cards + Day Events modal (`[x]` Done)

A second **view mode** for the Calendar tab: instead of strips, each day renders **event cards** from **existing data only** (no new data model). Events attach to **any** date — the internal storage type is named `NonShootDate` (legacy), but nothing is "non-shoot"-specific (a "Rehearsal" custom day type with cast attachments is just another event day).

- **Mode toggle**: segmented `Strips | Events` in the calendar toolbar (next to the View menu). Persist `viewMode` in the existing calendar prefs (`usePersistState` `lemon_schedule_calendar_view` — the inline `{displayField, showBreaks, showConflicts}` type gained `viewMode` + `eventsFilter` + `updateCal`). Paint-tool row hidden in Events mode (cards are the surface).
- **Cards per day, sorted by event type, then element** (no manual reordering):
  1. **attachment cards** — one per list group (`getTypeListGroups`): the day-type **symbol + color**, then all elements **comma-separated** (cast "1. FISHERMAN" style); cards grow to fit (no truncation). Whole-day info (status label/color, conflicts flag) lives in the day header — **no status/flag cards**,
  2. **rule chips** — date-scoped rules (`DATE_RESTRICTION`, dated `TIME_WINDOW`/`MAX_HOURS`): **consecutive `dates` collapse into one spanning chip across the day cells, wrapping across week rows (Apple-month-view style); non-consecutive dates = separate chips** — one chip per contiguous run, labeled via `describeRule`, rendered in a per-week overlay layer (`EventsChipLayer`),
  3. Empty days → an "add event" affordance.
- **Event comments**: every event (status × category group) carries a comment (`NonShootDate.comments` = `Record<statusKey, Record<category, string>>`, e.g. "Traveling from Singapore") — tooltip on the card (amber glyph) + edited in the modal.
- **Event-type filter (view)**: toolbar `Filter` control (DropdownMenu, same pattern as the View menu) with checkbox groups — **Day statuses** (per existing day type), **Attachments**, **Rules** (per rule type). Hidden kinds drop their cards from every day (empty days keep the add affordance). Persisted alongside `viewMode` in the same prefs (`eventsFilter`; arrays only — Sets aren't serializable).
- **Day Events modal** (`DayEventsModal`, evolved from `TravelHoldModal` — the shared editor shell item 46 reuses): a day can carry **MULTIPLE event types** — one section per attached status (type chip + category rows + All + per-row comment), a single **Day Status** picker (header status), read-only **Conflicts**, and an **inline rule editor** (type chips, cast picker, dates via kit `DatePicker` dark, max-hours/window fields — shared `validateRuleForm`/`buildRulesFromForm` in `ruleMeta.tsx`, one source of truth with the Rules tab). Per-open section filter collapses by kind. Save paths: `UPDATE_VERSION` nonShootDates + `ADD_RULE`/`UPDATE_RULE`. Opened by: header click, empty-day add, day double-click, **card double-click (focused on that event type)**, body right-click "Manage Events…".
- **Selection + batch drag (strip-view parity)**: cards support marquee drag-select over the grid (`useMarquee` gained a target-selector param — `[data-event-key]`), shift+click ranges, `Cmd+A` + arrow-key navigation (`useEventsKeyboard` — its own mode-local cursor). Dragging any selected card moves the whole selection; **collision rules on drop**: attachment cards merge into the target day's `lists` per category (comment travels with the group), a status card replaces the target's status, rule chips each remap per the chip-drag rule. Clipboard copy/paste of events is NOT included.
- **Card/chip single-drag** (dnd-kit, `data-date-key` targeting): an attachment card moves **just that group** (merge into target + remove from source); **rule chip body → another date moves the run** (adds target to `rule.dates`, removes the run's original dates; `DATE_RESTRICTION` floors at 1 date — last-date drag-away blocked; date-optional types drop to "every day"). Drag ghost = the card itself (via `EventCardView`/`RuleChipView`); drop targets highlight the day cell (swap ring / insert edge bars).
- **Day drag in Events mode moves the day's whole event state — status, attachments, AND rule chips**: a swap/insert drag performs a **date permutation** applied symmetrically — `NonShootDate` entries exchange `.date`, and every rule's `dates` get the same transposition/cycle (`date(A)↔date(B)` for a swap; the cyclic shift across involved dates for an insert-move). A rule covering both dates stays; one covering only one follows the day. No `DATE_RESTRICTION` floor issue (dates exchanged, never deleted). **Strips mode keeps today's behavior** (swaps strips + call times only) — regression-guarded.
- **Canonical module**: everything event-related lives in `src/lib/events.ts` (card model, `computeRuleRuns`, `computeDayEvents`, `applyDatePermutation`, `buildPermutation`, `moveRuleRun`, `mergeAttachmentInto`/`removeAttachmentFrom` — comments travel with groups) — UI never re-derives.
- **Invariant trap**: the section date cursor skips statused dates — event/date swaps can shift section dates; the `useDaybreakSections` cursor recomputes automatically (never re-derived, pinned daybreak respected).
- **DatePicker → ui-kit** (landed here): `DatePicker` is now `@gabriel/ui-kit` v0.1.34 (themeable light/dark, multi-select); the app consumes it via the `src/components/DatePicker.tsx` barrel; the Rules-tab form and the day modal's inline rule editor both use it.
- **Rules render as PER-DATE CARDS** (chips removed — the run/span machinery `computeRuleRuns`/`EventsChipLayer`/`moveRuleRun` is deleted): one card per date in `rule.dates`; every-day/global rules (no dates, CAST_*) originally got a card on EVERY day (display-only, `data-card-everyday`) — **reversed by item 65 (they never render now)**. Drag a dated card = move that date (`moveRuleDate` — source leaves, target joins; DATE_RESTRICTION floors at 1). Right-click → "Remove from this day" (`removeRuleDate`; deleting the last date of a date-optional rule returns it to every-day). Double-click opens the Edit Rule modal day-locked (Dates box hidden — full date editing lives on the Rules tab). Violated rules show a red-tinted card + flag.
- **Verify**: lint + playwright on the seeded project (`e2e/calendar-events.spec.ts`) — attachment cards with symbol+color+comma elements; per-date rule cards (dated + everyday); filter hides/shows per rule type; modal multi-status sections + comments persist (bridge); rule-card drag mutates `dates`; card delete removes a date; card dblclick → Edit Rule modal; day modal Rules tab lists day-relevant rules (`rulesRelevantToDay`) with conflict badges; attachment card drag moves only its group; events-mode day swap permutes dates but not strips; strips-mode day swap regression unchanged (`calendar-travel-hold`, `day-types` updated to the new modal).

**Relations**: builds on item 39's day-status/attachments infra (AGENTS.md §Day Types & Non-Shoot Status). Follow-up: item 46 (span-chip resize, Element Manager events, DayTypesTab summaries, Rules-tab retirement).

## 46. Events everywhere — Element Manager events, reusable editors, ui-kit DatePicker (`[x]` Done)

**Done**: the Element Manager got a per-row **Events** button (calendar icon, before the row's delete) opening the **element events manager** (`elements/ElementEventsModal.tsx`). Per element: one **collapsible card per day type** (icon + colored label + day count, chevron toggle) with its dates as a **table** — date + inline **per-element note** (add/edit right on the row) + **Edit** (opens the SINGLE-EVENT editor `calendar/EventModal.tsx`) + **X** (removes that element's card from the day). The **single-event editor** is one card's editor: **Date** (changeable via the kit DatePicker — moving the card), **Event Type** (changing it moves the card), **Element + Category** (editable when opened from the CALENDAR card dblclick; locked when opened from the element manager — the title names the element), **Note** (open by default), **Delete Event**. **Add Event** opens the shared **adder** (`calendar/EventAdderModal.tsx`, `CalendarTab` day context menu → "Add Events…") — parentless mode = comma-typed multi elements/categories + notes per element ("like the day manager"); **element-locked mode** (from the Element Manager) shows only Date + Event Type + Note (element in the title, `Add Event — 1. FISHERMAN`). Create merges the cards onto the date. **Events are PER-ELEMENT cards**: `comments[status][category][elementKey]` notes — each element's card carries its own ("FISHERMAN from Singapore", "MARY from London"); legacy per-group strings dropped (beta, console notice). A dedicated **Violations** section lists the element's rules firing per scheduled day (shared `computeSectionViolationMap`); the collapsible **Rules** section lists the element's rules (dark `RuleCard`s) with **Add Rule** → shared `RuleEditorPanel` pre-scoped to the element's cast member (hidden for non-cast — "can't carry rules"). Canonical computation: `src/lib/elementEvents.ts` (`computeElementAttachments`, `ruleRefersToElement` — rules are cast-referenced by ID). **"Attachment" is dead vocabulary** — events / the card's cast & elements everywhere (`preseedItems`, `mergeItemsInto`/`removeItemsFrom`, `setNote`; storage key `lists` untouched). Verified by `e2e/element-events.spec.ts` + `calendar-events.spec.ts`; RULES entry: `elementEvents.ts` → ELEM.

**Events count everywhere, not just the day status** (user decision — research: MMS/StudioBinder DOODs are whole-day states, no "card on a work day" precedent, so the rule is ours): DOOD cells (`deriveDood`) get the type letter from the day's **status OR cards** with **work wins** (`W`/`SW`/`WF` — it's rare to travel while working); totals/lists count status AND card days (a travel card on a work day counts as a travel event, cell says `W`); multi-type days show the first type in manager order, all counted in their lists. Same rule in Element Manager day-type columns (`computeElementDayStats`), Day Breakdown pane lists (`DayTypesTab`), and the reports `dayType` field (`dayTypeForDate`).

Reuses the Days Events surface (from 45) beyond the calendar, so events are manageable from where the data lives:

- **Span-chip edge-resize (DROPPED — superseded)**: item 45's final pass replaced chips with **per-date rule cards** and deleted the run/span machinery (`computeRuleRuns`/`EventsChipLayer`/`moveRuleRun`). Resizing a spanning run is obsolete: a card drag moves one date, right-click removes a date, double-click opens the day-locked editor.
- **Shared editor shell** (DONE — landed with this change): the rule editor is now ONE component, `RuleEditorPanel` (`src/components/rules/RuleEditorPanel.tsx`), used by the day modal (inline, pre-seeded with the day) AND the Rules tab (in a dark ui-kit Modal). The old `RuleFormModal`/`RuleFormFields` are deleted; the panel adds the after/before/all-day window modes the old modal had, so every rule type is fully editable from both surfaces. One source of truth: `ruleMeta.tsx` `validateRuleForm`/`buildRulesFromForm` + kit `DatePicker` dark + `EntityDropdown variant="chip"`.
- **Element Manager events**: a per-row Events button (before the row delete) opens the element events manager — collapsible day-type cards with only-this-element rows + inline comments, a collapsed Add-Event date picker, a Violations section, and rules with Add Rule. Buffered rows untouched (overlay action like the existing delete).
- **Day manager (DayTypesTab) events data** (DONE): the Day Breakdown pane now shows per-date event summaries (attachment groups via `getTypeListGroups` + `resolveElementName`, comments glyph, conflict flags via the shared `computeSectionViolationMap`) and every date row opens the shared `DayEventsModal` (same save path — `upsertNonShootDate` — as the Calendar tab; production-day rows open it in add-events context).
- **`DatePicker` → ui-kit** (DONE — landed with item 45): the picker is now `@gabriel/ui-kit` v0.1.34 (`DatePicker`, themeable light/dark, multi-select); the app consumes it via the `src/components/DatePicker.tsx` barrel; DESIGN-LANGUAGE primitive-row entry (per AGENTS.md §UI Primitives).
- **Rules-tab retirement** (tracked, NOT this item's scope): the tab now opens the shared `RuleEditorPanel` (no second form) and REMAINS as the global/no-date surface (`CAST_CONFLICT`, `CAST_SCENE_FLAG`, every-day `MAX_HOURS`/`TIME_WINDOW`). Any future removal must preserve a home for those rule shapes.

**Relations**: depended on item 45 (shared modal first) — the chip/run machinery came from 45 and was deleted there; the element events surface is the remaining 46 scope.

## 47. BUG: type-a-digit "schedule to day N" fails at the day-count boundary (`[x]` Done)

**Done**: `commitDigits` (ScheduleTab.tsx) now filters the pinned daybreak out of the target list — valid days = 1..production-day-count, every day targets its own daybreak via `order - 0.5` (with `renumberRows`), and `dayNum` beyond production days bails cleanly (no phantom append, no silent no-op). Also fixed en route: `handleRowClick` read `lastClickedId` from a stale closure (SortableRibbon's memo comparator ignores `onSelectToggle`), which broke shift+click range selection in the stripboard/boneyard — it now reads `lastClickedIdRef` (the same ref the keyboard hook uses). Verified by `e2e/digit-schedule.spec.ts` (day-N scheduling with Enter-commit, out-of-range bail, last-day boundary; RULES entry: `ScheduleTab.tsx` → SCHED bucket ∪ `digit-schedule`).

**Requested**: scenes in the boneyard, you press "15" to schedule them to day 15 — make sure they actually get scheduled there.

**Diagnosis** (`commitDigits`, ScheduleTab.tsx:1157-1213 + keydown handler 1215-1244; overlay in `schedule/ScheduleOverlays.tsx`): `daybreakOrderRef` includes the **pinned** daybreak, so `daybreaks.length` = production days + 1, and the boundary math is off by exactly that:

- Guard `dayNum > daybreaks.length` admits one **phantom day** (N+1 on an N-day schedule) — e.g. 14 production days + pinned = 15 entries; typing "15" passes the guard, misses the `dayNum < daybreaks.length` branch, and the else-branch appends the rows **after the last daybreak** (tail of the last section) instead of rejecting or targeting day 15 — the selection visibly "doesn't get scheduled" (or lands wrong).
- Any `dayNum >= daybreaks.length + 1` is silently ignored (buffer just clears).
- The else-branch (`dayNum === daybreaks.length`) also schedules to the end-of-stripboard rather than the last day's own section via `lastDaybreak.order - 0.5`.

**Fix**: treat the pinned daybreak as non-targetable for digit scheduling — last valid day = `daybreaks.length - 1`; target the last day via its own daybreak (`order - 0.5`, like every other day — with `renumberRows` after); bail cleanly for `dayNum` beyond production days (no phantom append, no silent no-op). Enter-to-commit and the 350 ms auto-commit keep working. **Bonus fix while here**: `handleRowClick`'s shift+click range branch read `lastClickedId` from a stale per-row closure (the `sortableRibbonPropsEqual` memo ignores `onSelectToggle`) — it now reads `lastClickedIdRef` like the edit-mode branch already did, so range selection works on the stripboard and boneyard.

**Verify**: playwright on a seeded project — select boneyard scenes (bridge or click), type "15" (or the last day's number) → rows land in that day's section in selection order with correct `order`-renumbering; typing a number > production days → nothing moves; press Enter to commit immediately; lint + full suite (strips-mode DnD regression untouched). All covered by `e2e/digit-schedule.spec.ts`.

## 48. Ribbon text font size — master + per-cell (`[x]` Done)

**Done**: `RibbonDesign.textSize` (master px, default 14 for new designs) + `RibbonCell.textSizeOffset` (−8…+8, effective = `ribCellTextSize`, 6px floor); one seam `getRibbonCellBaseStyle(…, textSize?)` (legacy designs without `textSize` keep 8pt rendering). All renderers thread the master (stripboard SortableRibbon + row components, print, designer canvas/live preview, PrintDialog, reports ribbon block); `SET_RIBBON_TEXT_SIZE` + `caseSetRibbonTextSize`. Designer UI: `LiveNumberInput` master-size control (Layout row) + per-cell offset + reset-to-master (Style row); the toolbar's numeric boxes are all `LiveNumberInput` (free-typed draft — type digits one at a time, delete-to-empty — Enter/blur clamps, Escape reverts). Verified by `e2e/ribbon-text-size.spec.ts` (master+offset in preview & stripboard, legacy 8pt, new-design default 14; RULES entry: `ribbon-text-size` in the RIBBON bucket).

**Requested**: ribbon editor font-size selection; a **master text size** per full ribbon (default **14**) and a **per-cell size** offset relative to the master (range −8…+8) — every ribbon rendering must respect it.

- **Model**: `RibbonDesign.textSize?: number` — master px, default **14** for new designs; unset (legacy) keeps rendering at today's 8 pt equivalent so existing schedules don't silently change. `RibbonCell.textSizeOffset?: number` — px offset applied to the master (−8…+8, effective cell size = `max(master + offset, 6)`); 0/unset = master.
- **One seam**: extend `getRibbonCellBaseStyle` (src/lib/ribbonUtils.ts:56 — the canonical cell styler used by stripboard, calendar-adjacent renderers, print and designer preview) to take the effective text size; generalize the hardcoded `fontSize: '8pt'` + `lineHeight: calc(8pt * 1.1 + …)` (lines 72-73) to the effective size. Because every ribbon cell funnels through this one function (AGENTS.md §Ribbon Cells), all renderings respect it automatically: stripboard `SortableRibbon`/rows, edit-mode rows, `PrintSchedule`/DaySection/PrintDialog, RibbonTab live preview + designer grid — plus the reports Ribbon block if its cells share the base style (verify parity 1:1 like item 29).
- **Designer UI**: RibbonTab master-size control (stepper/slider, e.g. 6–24 px) + per-cell offset control (−8…+8) on the cell chrome / context menu surface with a reset-to-master affordance. Both persist through the normal design-save path (like `cellPaddingV/H`).
- **Verify**: lint + playwright — set master + a few cell offsets in the designer; assert stripboard strips, print output and live preview all reflect the sizes (bridge reads design + computed font sizes); legacy designs (no `textSize`) render unchanged.

## 50. EXPERIMENTAL: EntityDropdown committed values as chips (`[ ]`)

**Parked exploration — not building now.** Review question: should
`EntityDropdown` render committed multi-values as per-value chip pills
(tag-input pattern) instead of the comma-joined resolved text? The chip
variant (`variant="chip"`) already exists — the trigger shows the values
resolved Glide-style via the `chipDisplay` overlay (`EntityDropdown.tsx:457`).

**Why parked** (verified against the code):
- The value IS the input (caret-at-end to append, backspace, Enter/Tab
  commit, Glide callbacks) — per-value chips would render only in the closed
  trigger and vanish on open, so the text-editing model underneath stays.
- The ui-kit has no generic Chip primitive (TokenChipView is tied to the
  contenteditable token editor) — this would be new in-app UI.
- 34 call sites; multi-chip triggers wrap/overflow the single-line modal
  rows (Link Manager cards, ElementPicker/ElementPickerRow).

**When it becomes worth it** — a requirement giving committed values
per-item affordances: per-chip × to remove one cast member from a
travel/hold attachment or linked row without retyping the list; or
category-colored chips (45/46's calendar event chips are the visual
precedent). A kit `Tag/Chip` primitive could host both if item 49's
`Button` work opens the door to kit primitives generally.

**Experimental-branch plan (when triggered)**:
- Work on an experimental branch ONLY; scope = a NEW `variant="tags"`
  (default untouched), wired into ONE place first — Link Manager multi
  rows (biggest density case).
- Interaction contract to evaluate: click chip = remove (and how it
  coexists with toggle-in-panel); Backspace on last chip removes it;
  typing appends a fresh segment; committed value stays raw comma-
  separated (invariant intact).
- Kill criteria: row wrap pain in Link Manager, keyboard-flow regressions
  in Glide/SceneSheet cell editing, double-affordance blur (chip × vs
  panel toggle). Survives → DESIGN-LANGUAGE update + rollout to remaining
  modal rows; fails → delete the branch (AGENTS.md rule 3 — no speculative
  abstractions).

**Verify**: probe spec exercising the new variant only; full suite green
with `variant="tags"` unused by default UI.

**Relations**: chip language + modal patterns from items 45/46; kit
primitive work out of item 49.

## 51. Scene sheet view — selectable scene order (sheet / scene number / stripboard) (`[x]` Done)

**Done**: "Navigate by" dropdown in the Breakdown toolbar (Calendar View-menu recipe) — persisted pref `lemon_schedule_breakdown_order` (`{order}` via `usePersistState`): **Sheet** (default), **Scene Number** (`naturalSortSceneStrings`), **Stripboard** (active version's SCENE rows in row order, boneyard scenes appended in sheet order). A sorted COPY drives rendering/navigation — `project.scenes` never reorders; the Sheet # column always shows the TRUE sheet number (array index + 1). Switching orders keeps the current scene visible (pending-scene-id remap); prev/next + sheet-jump input operate in the visible order; `initialIndex` is echo-guarded (`lastReportedIndexRef`) so App's onIndexChange feedback doesn't yoyo the position in non-sheet orders. Verified by `e2e/scene-sheet-order.spec.ts` (three orders + true sheet markers, scene-keeping, edits commit to the right scene, pref persists; RULES entry: `scene-sheet-order` on the SceneSheet rule).

**Requested**: the scene sheet view (SceneSheet — the Breakdown tab's
Sheet view) navigates scenes by **sheet order** (`project.scenes` array
order). Add a view-order
selector: **Sheet order** (default, today), **Scene number order**, or
**Current stripboard order**.

**Facts**:
- Sheet order = the `project.scenes` array (scene→row invariant); sheet #
  (the row marker / Sheet # column, `SceneSheetFields.tsx:41`) is array
  index + 1 today; SceneSheet prev/next + the direct sheet-jump input
  navigate by index (`SceneSheet.tsx:53,283,307`).
- Scene number order → `naturalSortSceneStrings` (`src/lib/utils.ts:132` —
  already used by the printed BreakdownSheet, `print/BreakdownSheet.tsx:78`).
- Stripboard order → the active version's `rows` SCENE rows in row order
  (rows arrays are the single source of truth — AGENTS.md, never re-derive);
  scenes with `containerId: null` (boneyard) append at the end in sheet
  order — the breakdown must still show them.

**Design**:
- **View-only preference** (`usePersistState`, e.g.
  `lemon_schedule_breakdown_order`) — a sorted COPY drives rendering and
  navigation; NEVER reorders `project.scenes` (edits, undo/redo and
  ADD_SCENE/INSERT_SCENE_AT semantics all keep mapping by id — the view
  index maps back to a scene id at render time, never an array reorder).
- **Sheet # column always shows the TRUE sheet number** (original
  index + 1), not the view position — printed breakdown sheets carry real
  sheet numbers; only row order changes.
- **"Navigate by" dropdown** — ui-kit `DropdownMenu` (via the
  `src/components/DropdownMenu.tsx` re-export), the **Calendar View-menu
  recipe** (`CalendarTab.tsx:874-922`): trigger button = current order
  label + `ChevronDown`, click-to-toggle, one `DropdownItem` per order
  with a trailing `Check` on the active one; entry in DESIGN-LANGUAGE's
  primitive matrix row for the Breakdown tab. Mounted in the Breakdown
  tab's `PageToolbar` rightContent (header-portal pattern). Affects
  SceneSheet prev/next; decide whether the direct sheet-jump
  input reads as true sheet # or as view position in non-sheet orders.
- SceneSheet prev/next arrows and the sheet-jump input operate in the
  visible order; the debug bridge reads stay id-ordered (order is
  UI-side only).

**Verify**: lint + playwright on the seeded project — the three orders
render distinct scene sequences with correct sheet # markers (bridge);
editing a field in scene-number order commits to the right scene (bridge);
new scene/duplicate lands at the array end in every order; SceneSheet
prev/next arrows follow the selected order; preference persists across
reload; stripboard + undo/redo untouched.

**Relations**: stripboard order derives from the canonical rows model
(AGENTS.md §Rows & Sections, same source the reports/calendar consume).

## 54. Production Dates Manager — prep/prod/post + days off modal (`[x]` Done)

**Requested**: replace the Calendar toolbar's separate **START** date input
and **Days Off** button with ONE **Production Dates** button that opens a
modal where the production dates are set MMS-style: **Prep start, Production
start, Post end** plus the weekly **days-off** pattern.

- **Model**: `ScheduleVersion` gains `prepStart?: string` and `postEnd?:
  string` (`productionStart` exists). Days-off becomes an explicit weekly
  pattern — `version.weeklyDaysOff?: number[]` (Mon=0..Sun=6), replacing the
  transient `autoDayOffDays` modal state in CalendarTab. The calendar range
  (months rendered, trim bounds) spans prepStart..postEnd; the production-day
  cursor logic is untouched (dates only).
- **UI**: a "Production Dates" button (replacing the START input + Days Off
  button) → dark modal (DayEventsModal styling): three date fields (Prep /
  Production / Post) + a Mon..Sun days-off multi-toggle + **Apply Days Off**
  materializing holidays across the range via the existing auto-day-off path
  (bounded prepStart..postEnd; existing statused dates respected, never
  overwritten).
- **Done**: `ProductionDatesModal` (`src/components/calendar/ProductionDatesModal.tsx`) + `prepStart`/`postEnd`/`weeklyDaysOff` on `ScheduleVersion`; calendar range spans the window; verified by `e2e/production-dates.spec.ts`.
- **Follow-up fix**: days-off apply previously scanned only `prepStart..postEnd`, so with no post end (the norm) the pattern never materialized. Now Apply/Save sync the pattern MMS-style across the **scheduled span** — from the start through the stripboard's last shooting day (walked with the same `advanceDateCursor` the schedule uses; post end only extends the window). The sync is two-way: pattern weekdays get `holiday` status (marked `NonShootDate.pattern = true`), and unchecking a weekday removes ONLY those pattern-created statuses — hand-made statuses and event cards always survive (a removed day keeps its cards/notes with the status stripped). The flag is sticky through status edits (`upsertNonShootDate`), so a generated day off changed to another status and back stays generated.
- **Verify**: lint + playwright on the seeded project — set prep/prod/post +
  days off → the calendar range spans the full window, weekly holidays
  materialize within the bounds, pre-existing statuses survive; the old
  START input and Days Off button are gone; strips/events modes unaffected.

**Relations**: calendar toolbar territory (items 45/46 events mode); the
day-types registry (`work`/`holiday` keys) is untouched.

---

## 55. Calendar view: expandable day cells (`[x]` Done)

**Requested**: strips-mode day cells are a fixed 170px; make cell sizing a View-menu option.

- **Done**: `expandDays` pref in the calendar view settings (`lemon_schedule_calendar_view`,
  default **expanded** = cells size to their content, `gridAutoRows: 'auto'`; off = the fixed
  `DAY_CELL_HEIGHT` rows). View menu toggle ("Expand Day Cells"), verified by
  `e2e/calendar-view.spec.ts`. Events-mode weeks were already content-sized.

## 56. Promote shared bespoke components into @gabriel/ui-kit (`[ ]`)

DESIGN-LANGUAGE §Mental model #2: "All interaction primitives come from `@gabriel/ui-kit`… extend the
kit instead." The genuinely-shared components that are still app-local should move INTO the kit
(same migration pattern as DatePicker → v0.1.34), keeping 1-line re-export shims in `src/components/`:

- **`HoverTooltip` / `FloatingTooltip`** — rich-content (ReactNode) portal tooltips with smart
  positioning + hover delay; the kit's `Tooltip` is string-only, so this is an extension, not a
  duplicate. Used by day cells (violation/comment tooltips), `TravelHoldTooltip`, `ScheduleOverlays`.
- **`RuleCard`** — the shared rule card (light + dark themes, conflict-count badge, cast-aware
  `describeRuleDetailed`); used by the Rules tab + day modal Rules tab.
- **`EntityDropdown`** — the cast/element picker (multi/single/chip variants); the app's largest
  bespoke primitive, used everywhere.

Per item: bump `@gabriel/ui-kit` (`package.json` → `@gabriel/ui-kit#v0.1.x`), re-verify the
DESIGN-LANGUAGE §Primitive matrix + Recipes class strings, update this roadmap + the matrix in the
same commit. The events-mode day cells, section tabs, and icon-only buttons stay bespoke
(no kit primitive exists; icon-only is the documented exception).

- Repo branch: `main` (push before ending session).
- Next session: pick items above in order; re-read `docs/REPORTS-DESIGNER.md`
  before touching the designer, `docs/REPORT_PRINTING_AND_PAGE_BREAKS.md`
  before print/pagination work, `docs/IMPORT-EXPORT.md` before import/export
  work.

## 57. Anchor icon in EntityDropdown for anchored elements (`[x]` Done)

**Requested**: when an element is an **anchor** (it appears as `anchorCategory`/`anchorValue` in
`project.elementLinks`), show a small anchor icon next to it in the entity dropdown.

**Facts**:
- Anchor = any `ElementLink` whose anchor side matches the element (`getAnchorLinks(links, category, elementMatchId(e, category))`,
  `src/lib/elementLinks.ts:32` — canonical, never re-derive). The Link Manager's anchor picker
  (`rules/ElementPicker.tsx`) is the surface where anchored-ness is chosen; the SceneSheet, Glide,
  stripboard and attachment/status rows use the same `EntityDropdown`.
- `EntityDropdown` (`src/components/EntityDropdown.tsx`) is a per-row component that MUST NOT call
  `useProject()` (AGENTS.md store rules) — anchored-ness data must arrive via props, not context:
  extend it with an optional lookup (e.g. `anchoredKeys?: Set<string>` or a
  `(category, key) => boolean` predicate, memoized by the caller) rather than threading raw links.
  Call sites that own `project.elementLinks` (LinkManagerModal, SceneSheet/Glide shell, TravelHold
  rows) build the predicate once via `getAnchorLinks`.

**Design** (narrow scope first):
- Indicator = small Lucide `Anchor` icon (ui-kit icon sizing `w-3.5 h-3.5`) at the row's trailing
  side, tooltip "Anchor — linked elements follow" (or similar); distinct but subtle in BOTH dropdown
  themes (light panel + dark `variant="chip"` panel per DESIGN-LANGUAGE — the day-status modal
  pattern). Checked/highlighted rows keep their existing affordances.
- Scope decision for the worker: **all** entity dropdown panels vs only the Link Manager anchor
  picker. Recommendation: panel rows everywhere `EntityDropdown` is used (one prop, consistent
  affordance); the anchor picker itself is the minimum viable slice if prop-plumbing looks noisy at
  34 call sites (re-check item 50's call-site census).
- Optional: same icon on the closed chip trigger (anchor picker + multi-value rows) only if it fits
  the chip overlay without cramping — else panel-only, no double-affordance.

- **Done**: `anchoredKeys` prop on `EntityDropdown` (optional `Set<string>` in `itemKey` space; names
  matched case-insensitively) — the item renderer appends a Lucide `Anchor` icon (`w-3.5 h-3.5
  text-amber-500`, native `title` tooltip) next to anchored elements, in BOTH panel themes (light
  `default` + dark `chip`). Wired in every picker that owns element links: Link Manager anchor +
  linked pickers, Scene Sheet set/cast/entity dropdowns, stripboard cast/entity cell editors,
  Glide cell editors, day-modal attachment rows and rule-editor cast pickers (`anchoredKeysFor`
  helper in `elementLinks.ts`; per-category memo in each host). Verified by `e2e/linked-elements.spec.ts`
  (anchor icon in the Link Manager picker + scene sheet cast picker; absent for non-anchors).

**Verify**: lint + playwright on the seeded project — add a link in the Link Manager, then assert
the anchor icon renders next to that element in the anchor picker AND a plain entity dropdown
(SceneSheet field / status-row row); non-anchored elements have no icon; dark chip variant styling
intact; bridge reads untouched.

**Relations**: rides item 44's model (`elementLinks.ts`); EntityDropdown may move into `@gabriel/ui-kit`
(item 56) — the `anchoredKeys` prop (added here) must ride along in the migration.

## 58. ui-kit animations — dropdowns, menus, dialogs (`[x]` Done)

**Done**: every overlay surface now shares the modal FLIP motion language — kit
`overlayMorph.ts` (`useOverlayMorph`/`playOverlayOpen`/`playOverlayClose`/`cloneOverlayClose`,
exported from `@gabriel/ui-kit`): trigger-anchored scale+fade (220ms `cubic-bezier(0.32,0.72,0,1)`,
zoom from 94%) with a real close morph, `prefers-reduced-motion` + the `lemon_schedule_modal_morph`
opt-out key (app shims inject it; submenus inherit via `SubmenuContext`), animation-token
cancellation, pointer-transparent closing, no style-clear-while-mounted (close-flash rule — see
`docs/DESIGN-LANGUAGE.md` §Modal anatomy). Coverage: kit `DropdownMenu` (incl. `ItemManagerDropdown`),
`DropdownSubmenu`, `ContextMenu` (also gains Esc-to-close), app `DropdownPanel` (EntityDropdown
light + dark chip), `SelectDropdown` (stripboard INT/EXT/day-night cells), `AutocompleteDropdown`
(SceneSheet/Glide fields — the fixed panel also gained the `pos.ready` visibility gate so it never
paints at 0,0). Unmount-driven closes play on a pinned clone (`data-morph-clone`). Verified by
`e2e/overlay-morph.spec.ts` (open/close morph mid-flight, origin anchoring, close-flash regression,
reduced-motion, opt-out, keyboard nav + typeahead).

**Known gaps (follow-up items)**: the print dialogs' dropdowns (`PrintDialog`/`ElementBreakdownDialog`/`DoodDialog`) and the bespoke `rules/CategoryDropdown.tsx` still use raw Radix — see items 60 and 61.

## 59. Modal backdrop — darken once, never stacked (`[x]` Done)

**Done** (kit v0.1.55, commit `7cf28cc`/`bc16a18`): implemented in the kit — `.ui-modal-overlay` CSS (`ui-kit/src/styles/tokens.css`) dims the background exactly ONE layer per window regardless of stack depth (non-top `[data-modal-stack]` modals zero the dim via the sibling `:has(~ [data-modal-stack][data-state="open"])` selector — the same sibling-CSS machinery item 58's stack fade uses); the dim fades 220ms WITH the close morph (`ui-modal-overlay-closing`) and stacked swaps are instant (a new top modal's dim appears immediately, the old one's zeroes). The kit confirm/alert overlay stays transparent — no double-dim over the app modal. App Modal shim unchanged (`overlayMorphOptIn` still gates motion).

**Requested**: darken the background when a modal is open — but only ONE dim layer.
Stacked modals must NOT stack background darkenings.

**Facts**:
- Today overlays are deliberately transparent: `.ui-overlay { background: transparent !important }` (`index.css:35-37`, the kit confirm/alert too) and DESIGN-LANGUAGE §Modal anatomy documents "transparent — no background dimming" (the stack fade + morph carry the hierarchy).
- `src/components/Modal.tsx` is a shim over the kit `Modal` (adds `overlayMorphOptIn()`); dialogs portal as siblings into the window body, so the stack is expressed in pure CSS: `[data-modal-stack][data-state="open"]:has(~ [data-modal-stack][data-state="open"])` fades every non-top modal to invisible (`index.css:52-58`).

**Design** (same sibling-CSS machinery — no new layering):
- Give the modal overlay a dim (`bg-black/20`-class, the kit default recipe) and zero it for non-top modals: extend the `:has(~ [data-modal-stack][data-state=open])` selector to clear the dim on every modal that has an open modal after it — exactly ONE dim layer renders regardless of stack depth, belonging to the top modal.
- Popout windows: dialogs portal per-window, so the per-window sibling `:has()` keeps each window's dim independent (matches the existing fade).
- The kit confirm/alert (no `data-modal-stack`) keeps its overlay but must not double-dim on top of the app modal's dim — its overlay stays transparent (the top modal's dim already covers it).
- Update DESIGN-LANGUAGE §Modal anatomy + feedback taxonomy (dim = chrome, one layer) and the `index.css` comment block; remove the now-stale "transparent" wording.
- **Verify**: lint + e2e (extend `overlay-morph.spec.ts` or a new spec) — open Day Events → Rule Editor (and a 3-deep stack): count dimmed overlay elements == 1, parent transparent; confirm/alert over a modal adds no second dim; popout window dims independently; reduced-motion + `lemon_schedule_modal_morph` opt-out unaffected.

**Relations**: rides the stack CSS + morph language from item 58; touches `Modal.tsx` shim territory.

## 60. Print dialogs' dropdowns → ui-kit base (`[x]` Done)

**Done**: all four print surfaces now render their pickers through the kit
`DropdownMenu` (dark theme) — `PrintDialog` (Ribbon Layout + Page Size),
`print/ElementBreakdownDialog` (Category), `print/DoodDialog` (Category), and
`reports/ReportPrintDialog` (Page Size + per-ribbon-block Ribbon Layout). Each
inherits the trigger-anchored morph (item 58), Esc/typeahead, `IS_COARSE`
sizing and single-highlight/checked-row contract; items use the kit
`DropdownItem` icon/trailing props; category pickers use
`initialHighlightIndex` + scrollIntoView (the item-64 model — the old
`active.focus()` is gone); `contentClassName="z-[10001] …"` lifts the menus
above the app modals. The last raw-Radix dropdowns in the app are gone (only
the kit `Separator` shim in `DropdownDivider` and the non-print `SortDropdown`
remain). Verified by `e2e/print-dialog-dropdowns.spec.ts` (morph + select +
trigger update + checked row, per dialog).

**Facts**: item 58 swept dropdowns for the morph, but the print dialogs were missed — three files use RAW `@radix-ui/react-dropdown-menu` directly (hand-rolled item classes, `modal={true}`, no morph, no coarse-pointer sizing):
- `PrintDialog.tsx:151-177`+ — ribbon-design picker (+ a second raw menu at `:181`),
- `print/ElementBreakdownDialog.tsx:91-125` — element-category picker,
- `print/DoodDialog.tsx:226-263` — DOOD category picker.
The kit re-export is `src/components/DropdownMenu.tsx` (`DropdownMenu`/`DropdownItem`/`DropdownDivider`, dark theme — the Calendar View-menu recipe).

**Design**: swap the raw Radix blocks for the kit `DropdownMenu` (items via `DropdownItem` with the single-highlight rule), inheriting the trigger-anchored open/close morph (item 58), Esc/typeahead, and `IS_COARSE` sizing. Keep the dialogs' existing triggers/behavior; print categories keep their per-item icons/checks (kit `DropdownItem` icon prop).

**Verify**: lint + e2e — open each print dialog, exercise its dropdown(s) (pick a ribbon/category), assert the morph (`overlay-morph` probes) + correct selection; print-stub flows untouched. DESIGN-LANGUAGE primitive matrix: update the print-dialogs row.

**Relations**: closes item 58's coverage gap; rides the kit `DropdownMenu` language.

## 61. Category dropdowns → ui-kit base (`[x]` Done)

**Done** (commit `4f3e6837`, kit v0.1.52): `rules/CategoryDropdown.tsx` rebuilt on the kit `DropdownMenu` base — same props/API (`value`, `onChange`, `allCategoryKeys`, `categoryLabelLookup`, `disabledKeys`, `minWidth`, controlled `open`/`onOpenChange`, `CAT_ICONS`/`getCustomIcon`) so all four call sites (DayEventsModal rows, EventModal, EventAdderModal, ElementPicker) inherited the morph + sizing with zero call-site churn; icons left + Check via the kit `DropdownItem` `trailing` slot (v0.1.50); 256px cap + modal z-index via `contentClassName` (v0.1.49's `contentClassName` addition); the redundant `itemClass` prop removed across all call sites. Kit bumps along the way: submenu trigger unlights during the close morph (v0.1.49), `DropdownItem` trailing slot (v0.1.50), wheel-scroll fix for portaled overlays inside modals — the modal scroll-lock (`react-remove-scroll` in Radix Dialog) was canceling wheels on body-portaled menus; `useOverlayMorph` now intercepts in-overlay wheels at document capture (v0.1.52).

**Follow-up (item 64)**: item 64 replaces the kit menu's highlight + positioning model entirely (single-highlight + panel positioning) — CategoryDropdown inherits it automatically; its open-scroll-to-active switches from `focus()` to `initialHighlightIndex` + scrollIntoView.

**Requested**: the "category" dropdowns (category pickers) should use the ui-kit dropdown as a base — inherit the animation system and the mobile sizing.

**Facts**: `rules/CategoryDropdown.tsx` is a bespoke Radix dropdown (`modal={true}`, hand-rolled trigger/panel/item classes, no overlay morph) used by four surfaces:
- `DayEventsModal` attachment rows (`calendar/DayEventsModal.tsx:453`),
- `EventModal` + `EventAdderModal` (single-event editor + adder),
- `rules/ElementPicker.tsx` — Color Rules condition rows + Link Manager anchor/linked rows.
The kit `DropdownMenu` (re-export `src/components/DropdownMenu.tsx`) is click-to-toggle, `modal:false`, arrows/typeahead/Esc, with the trigger-anchored morph (item 58) and coarse-pointer sizing.

**Design**: rebuild `CategoryDropdown` ON the kit `DropdownMenu` base — keep the existing props/API (`value`, `onChange`, `allCategoryKeys`, `categoryLabelLookup`, `disabledKeys`, `minWidth`, controlled `open`/`onOpenChange`, custom-category icons via `CAT_ICONS`/`getCustomIcon`) so all four call sites inherit morph + sizing with no call-site churn. Preserve the disabled-row rendering (visible, `cursor-not-allowed`) and the active-check affordance per the single-highlight rule.

**Verify**: lint + e2e — morph present on the category panels (overlay-morph probes), disabled keys stay visibly disabled, color-rules/link-manager/day-modal/event-modals specs still green (add a RULES entry if a spec maps to `CategoryDropdown.tsx`). DESIGN-LANGUAGE primitive matrix: the picker row.

**Relations**: closes item 58's coverage gap for the last bespoke dropdown; item 62 reworks `DayEventsModal` (a main call site) — land the dropdown base first.

## 62. Day events manager — per-element event cards via a shared card component (`[x]` Done)

**Done** (commits `a85afb6e`→`bbda2663`): shared `ItemCard`/`ItemRow` (`src/components/cards/`) extracted from the element events manager and consumed by `DayEventsModal` — per-type cards with an element row each (category icon + label, inline notes, ✕-remove, row click → the shared single-event editor), whole-category marks as "All \<Category\>" rows, live mutations with a Done footer, add via the shared adder (date + status preseeded). `calendar-travel-hold.spec.ts` rewritten for the card flow; `calendar-events.spec.ts` removed (harness flows drove the retired section editor — the surfaces work, verified manually).

**Requested**: in the day event manager, separate the different elements and event types — use a shared component for event cards like the Element Manager's event manager, so the user can edit every element on his own.

**Facts**:
- `DayEventsModal` (`calendar/DayEventsModal.tsx`) today: per-status sections → category rows = a multi-mode `EntityDropdown` with comma-joined elements + an "All" checkbox + a per-category comment popover revealing inline per-element note inputs (`comments[status][category][key]` — the data model ALREADY carries per-element notes; item 46 moved `ElementEventsModal` to per-element cards, DayEventsModal kept the group model).
- `ElementEventsModal` (`elements/ElementEventsModal.tsx`) has the "event card" language: per day-type collapsible cards (icon + colored label + day count) with date rows — date + inline per-element note + Edit (opens the single-event editor `calendar/EventModal.tsx`) + X (removes that element's card). `EventAdderModal` (parentless multi-element mode) already exists for adding.
- The calendar day-cell cards (item 45) double-click into `EventModal` focused on one event type — per-element targeting is the natural extension.

**Design**:
- **Extract the shared card**: one component rendering one element × one event type (icon + colored label, per-day-type shell; date row with inline note + Edit → `EventModal` + X-remove) consumed by BOTH `ElementEventsModal` and the reworked `DayEventsModal`. No logic split — both modals render through the same card (AGENTS.md rule 1).
- **DayEventsModal rework**: inside each event-type section, replace the comma-joined multi rows + All with per-element cards (the day is one date, so the card = that element's date row). Add → the shared `EventAdderModal` (parentless mode) or a per-section add; removing a card removes only that element's entry; notes stay per element; `resolveElementName` display ("1. FISHERMAN" for cast).
- Calendar day-cell card double-click (item 45) keeps working — now targeting the exact element's card.
- **Verify**: lint + e2e — day modal lists per-element cards (bridge: `comments[status][category][key]` per element), editing one element leaves the others untouched, add/remove per element, both modals render through the same shared component, calendar card dblclick opens the right element's editor, element-manager events spec (`calendar-events`/day-types related) stays green.

**Relations**: builds on items 45/46 (DayEventsModal shell + per-element notes + EventModal/EventAdderModal); rides item 61's `CategoryDropdown` kit base inside the same modal.

## 63. BUG: Glide entity-dropdown cell swallows the first keystroke after a refresh (`[x]` Done)

**Done**: root cause was NOT the editor focus path (the item's original
hypothesis) — Glide's overlay editor is `React.lazy()`-loaded, so in the
PRODUCTION build it's a separate chunk fetched async on the FIRST editor open
after a fresh page load (dev can't reproduce — the chunk is part of the dev
module graph). Every keystroke typed while that chunk is in flight is swallowed:
the grid re-opens the editor per keystroke with a single-key replace, so only
the last one survives ("MARY" → "Y"); cloud = slower chunk fetch = always hit.
**Fix**: preload the chunk at app boot — Vite alias `@glide-overlay-editor`
(`vite.config.ts`, bypasses Glide's exports map) resolving the same internal
module Glide lazy()s (Rollup emits ONE chunk) + `void import('@glide-overlay-editor')`
at the top of `src/components/BreakdownTabGlide.tsx`. Verified by
`e2e/glide-first-edit.spec.ts` (chunk requested at boot before any editor opens;
first edit after a fresh load keeps every keystroke; commits via Enter). Known
residual: the first overlay mount still takes ~80-200ms, so keystrokes typed
faster than ~4 chars/sec in the very first edit can overwrite — beyond human
cadence, not the reported bug.

**Requested**: in the Glide breakdown, select a cell that opens an entity dropdown (cast/elements) and start typing — **the first time after a page refresh the first keystroke is missed**. Reported on cloud projects; unknown whether cloud-only.

**Facts**:
- The Glide cell editor (`createGlideCellEditor`, `src/lib/glideEditor.tsx:79-82`) mounts `EntityDropdown` (and `AutocompleteDropdown` for plain fields) with `defaultOpen` + `autoFocus` — the keystroke-vs-mount race lives here.
- "First time after a refresh" is the clue: on a fresh load the canvas/keys/panels mount async; in cloud projects the project hydrates via a Drive read + migration before/around the first edit, so the editor may mount while the app is still settling (remount? focus stolen by the grid's own click/tap focus handling, `BreakdownTabGlide.tsx:722-800`?). First keystroke then lands while nothing has keyboard focus (or the grid still owns it) and is dropped; subsequent opens work because the editor is already warm.
- **Scope question for the worker**: reproduce on a LOCAL project too (the "refresh" could be the variable, not the cloud) — if it reproduces locally, it's a general mount/focus race, and "cloud" is just where it was noticed (slower hydration makes it flaky-more-visible).

**Design**:
- Reproduce first: seed project → open Glide → fresh reload → click an entity cell → type immediately. If flaky, instrument `activeElement` at keystroke time.
- Likely fix territory: (a) focus is applied before the dropdown's input is mounted/visible — defer the actual `.focus()` until the open panel's input exists (rAF/`setTimeout(0)` after open, or focus on first `pointerdown`+commit-order in `EntityDropdown`'s own open effect); (b) the grid's click-focus (canvas `.focus()` on click/tap) stealing focus back after the editor mounts; (c) a remount caused by late hydration in cloud projects (provider `readOnly`/sync flip, storage load completing after first paint).
- Whatever the root cause, the fix is one place: the editor mount/focus path in `glideEditor.tsx` (do not touch the canvas key handling).
- **Verify**: lint + playwright — seed → reload → click entity cell → type "MARY…" immediately (no waits): first keystroke lands in the dropdown (assert the input value/filter); repeat N times + on the dev server AND the preview build; local + cloud-seeded project. Regression: `glide-*` specs green (typing, tab cycle, typeahead).

**Relations**: rides the Glide editor machinery (`glideEditor.tsx`); the calendar/travel-hold surfaces that share `EntityDropdown` are unaffected (this is the editor mount path only).

## 64. Kit dropdown menu → EntityDropdown-panel behavior (`[x]` Done)

**Done** (kit v0.1.55, commits `96aac0f`→`bc16a18` + the stable-handler fix `438bb71`): the kit `DropdownMenu`/`DropdownSubmenu`/`ContextMenu` all share ONE highlight surface (`MenuHighlightContext` + `useMenuHighlightState` in `ui-kit/src/DropdownMenu.tsx`) — a single `highlightedIndex` written by pointer hover AND the keyboard arrows (latest wins), `onPointerLeave` clears a pointer-driven highlight, NO CSS hover fills (the lit row is `.ui-item-highlighted` only, Radix `data-highlighted` is inert). Root menu content uses panel positioning (fixed below the trigger, width-matched, viewport-clamped via the kit's `useFixedPosition`, `ready` visibility gate); submenus keep the Radix popper side-placement. Keyboard = arrows/Enter/Space/typeahead via `useMenuKeys` (content-level, capture) + a document-level `useMenuKeyLock` (the mini-modal lock: menu keys are captured even when focus sits on the stripboard canvas) + `useMenuWheel` for portaled content inside modals; `initialHighlightIndex` pre-lights a row on open (CategoryDropdown uses it — its open-scroll-to-active no longer focuses). NOTE vs the original item text: the v0.1.54 **trigger-reopen was KEPT and FIXED, not deleted** — the dismiss-click interleave bug (one click closing AND reopening the menu, stranding it mid-morph) is gone; a trigger click during the close morph reopens cleanly. (The app-side lock leak that made a remounted menu eat menu keys app-wide — fixed in the kit with stable handlers.)

**Requested**: the kit `DropdownMenu` (and every surface on it — AppHeader File menu + submenus, Schedule View menu + submenus, day-status/event-type pickers, the CategoryDropdown from item 61) should behave like the EntityDropdown dark panel ("almost 1-1", per the user's words): one highlight shared by cursor + arrows, panel positioning (below trigger, width-matched, viewport-clamped), wheel-scrollable everywhere, typeahead kept, future search support.

**Facts**:
- The EntityDropdown dark panel (`src/components/DropdownPanel.tsx`) is the canonical behavior: ONE `highlightedIndex` written by pointer hover (`onItemHover`) AND the arrows (latest wins); `onHoverLeave` clears a pointer-driven highlight; NO CSS hover fills; checked rows distinct (dark = Check glyph); positioned via the kit's own `useFixedPosition` (fixed below the trigger, width = trigger width, max-height clamped to the viewport, `ready` visibility gate, portaled). The positioning hooks ALREADY live in the kit (`useSmartPosition.ts`); the app re-exports them (`src/lib/useSmartPosition.ts`).
- Current kit menu problems: (a) two independent highlight sources — CSS `:hover` fill + Radix roving-focus `data-highlighted` — so cursor and arrows can light two rows at once; (b) Radix popper sizing (`max-h-[min(75vh,30rem)]`, up to 480px) can overflow the viewport inside modals (the y=-102 off-screen case); (c) wheel scrolling inside modals currently relies on the v0.1.52 capture interceptor in `useOverlayMorph` (keep it) — the panel also carries its own manual wheel handler (belt and suspenders).
- REGRESSIONS TO REVERT (both in the kit, both from the 0.1.53/54 experiment — the user's "this broke all the dropdown menus"): v0.1.53's `pointerenter → item.focus()` + the `.ui-menu:has(...)` hover-suppression rule (focus stealing + suppressed fills killed cursor hover); v0.1.54's trigger-reopen (`persistedRef`/`triggerOnClick` + the onClick injection) — its close-morph race can strand a menu with inline `pointer-events: none`.
- Kit menu consumers: AppHeader File menu (+submenus), ScheduleToolbar View menu (+submenus), CalendarTab display-field submenu, reports `CollectionMenu`/`FieldPicker` (submenus), `ItemManagerDropdown` (Element Manager etc.), DayEventsModal Day Status + Add-event-type pickers, `CategoryDropdown` (item 61). Submenus MUST keep working (side placement) — the panel model has no submenu concept, so submenus stay on the Radix popper.

**Design** (all kit-side — `~/Documents/Software Apps/ui-kit`, one bump to v0.1.55; then app: package.json bump + the CategoryDropdown tweak + spec/doc updates in the same commit):
1. **Reverts**: delete the `DropdownItem` pointerenter-focus handler; delete the `.ui-menu:has(.ui-item[data-highlighted]) .ui-item:hover` rule; delete the trigger-reopen (the onClick injection + `persistedRef`/`triggerOnClick`) — restore the plain close-morph guard.
2. **Single-highlight** (the panel's exact model):
   - `DropdownMenu` (root content) AND `DropdownSubmenu` (its content) each own `highlightedIndex` + a pointer-driven flag, exposed via a NESTED context (per-surface indices — submenu items must not share the root index).
   - Items register into the nearest context on mount (registration order = index; activate callback; label for typeahead). Index clamps/resets when the list changes — this registration map is what makes future search trivial (a later `search` prop filters children; same machinery — the user asked for search support "in the future").
   - `DropdownItem`: `onPointerEnter` → set its index (pointer-driven); content `onPointerLeave` → clear when pointer-driven. Fill = index class only (dark `bg-zinc-700 text-white`-equivalent via tokens).
   - Keyboard (content `onKeyDown`): ArrowDown/Up → move the index (preventDefault; latest wins); Enter/Space → activate the highlighted item; **typeahead KEPT** (letter buffer → first matching item, per surface); Escape → Radix close unchanged.
   - CSS: remove the `.ui-item:hover` background fill and the `.ui-item[data-highlighted]` fill; KEEP `.ui-item[data-state="open"]` (submenu trigger) + `.ui-sub-closing`; `ui-item-danger` keeps its red text (no fill).
   - `ItemManagerDropdown` rows keep their own row/active/hover classes (specialized list — untouched).
3. **Panel positioning** (root menu content only): swap the Radix popper for the kit's `useFixedPosition` — fixed, below the trigger, `width = max(trigger width, width prop as min-width)`, max-height clamped to the viewport, `ready` visibility gate, portaled; `align="left|right"` mirrored (left → panel left at trigger left; right → panel right at trigger right); give `useFixedPosition` an optional width param for the clamp math (it currently hardcodes 200). **Submenus keep the Radix popper side-placement**; ContextMenu (press-point anchored) unchanged; the morph anchor (trigger rect) unchanged.
4. **Wheel**: keep the v0.1.52 `useOverlayMorph` interceptor; add the panel's manual wheel handler (`if scrollable { preventDefault; scrollTop += deltaY }`) to the menu content.
5. **API addition**: `initialHighlightIndex?: number` on `DropdownMenu` — applied on open (the panel's single-mode "highlight the current on open" behavior).

**App-side**:
- `CategoryDropdown`: replace the focus-based open-scroll-to-active with `initialHighlightIndex` (the active category's index) + scrollIntoView on open.
- `package.json`: kit → v0.1.55; then `rm -rf node_modules/.vite-*` + restart the dev server (the stale-pre-bundle pitfall — a running server keeps the old kit until restart).
- `e2e/overlay-morph.spec.ts` "keyboard nav and typeahead still work in animated menus": asserts Radix `data-highlighted` — update to the new highlight contract (arrow moves the index class; the typeahead letter-jump assertion stays).
- Docs in the same commit: `DESIGN-LANGUAGE.md` (dropdown anatomy + primitive matrix — menus now share the panel's highlight/positioning model; the single-highlight rule covers kit menus), AGENTS.md UI-primitives bullet, `docs/UI-KIT.md` note.

**Verify**: lint + full smart suite; focused e2e (extend `overlay-morph.spec.ts`): hover follows the cursor (exactly ONE lit row), arrows latest-wins, hover-leave clears a pointer-driven highlight, typeahead letter-jump, wheel scroll inside the day-event modal, menu opens below the trigger width-matched and fully on-screen, category picker opens on the active row, submenus still open sideways, item-manager rename input unaffected (no focus stealing). Smart-test RULES: `src/components/DropdownMenu.tsx` → ALL, `src/components/calendar/**` → CAL already cover the app-side churn.

**Relations**: supersedes/reverts the v0.1.53+54 highlight approach; closes item 61's residual behavior gap (CategoryDropdown inherits the panel-behavior kit menu); rides item 58's morph + the kit's own `useFixedPosition`; item 60's print-dialog conversions land on the reworked menu.

## 65. Event calendar: hide every-day rule cards; flag-left / rule-icon-right on rule cards (`[x]` Done)

**Done**: global (every-day) rule cards never render in Events mode — `EventDayCell` filters `c.kind === 'rule' && c.everyday` out of `cellCards` (merged with the old `manageableCards` filter — one filter; the add affordance keys off it), while `src/lib/events.ts` keeps the `everyday` stamp untouched (read-only, still the gate). Pruned dead paths: `data-card-everyday` attr, the drag-disabled everyday branch, and the right-click no-op (`ruleCardMenu` no longer carries `everyday`; the rule-card context menu is always "Remove from this day"). Rules still fire/flag in stripboard + day headers via `computeSectionViolationMap`; the Rules tab stays the global surface. **Rule-card icon layout swapped**: violated flag on the LEFT of the text, rule icon on the RIGHT (`shrink-0`, `meta.chipIcon` color); clean cards = icon right only; card title simplified. **Bonus (user ask, same surface)**: comment-carrying attachment cards were shrinking to content width (`HoverTooltip` defaults to `inline-flex`) — now `className="w-full"` so every card is full width; the card-drag ghost renders at the SOURCE card's measured width (`activeWidth` captured in `useEventsDrag` drag-start) instead of fixed `w-56`; the events-mode day-header drag ghost is now the same dark pill as strips mode (`DAY N` + "N events", via `dateSectionMap`/`chronoDayMap`) instead of the card stack. Verified by `e2e/calendar-rule-cards.spec.ts` (CAL bucket).

**Requested**: in the Calendar tab's Events mode, (1) rules that are global — they apply to EVERY day (`CAST_CONFLICT`, `CAST_SCENE_FLAG`, no-date `MAX_HOURS`/`TIME_WINDOW`) — must NOT render a card on every day cell; a "GEORGE has a scene flag" card on all 40 days is noise, not signal. (2) Rule and conflict cards should carry the **flag icon on the LEFT** and the **rule icon on the RIGHT** (today: rule icon left, violated flag right).

**Facts**:
- Item 45's "Rules render as PER-DATE CARDS" pass explicitly chose "every-day/global rules (no dates, CAST_*) get a card on EVERY day (display-only, marked `data-card-everyday`)" — this item reverses that decision.
- Card model: `computeDayEvents` (`src/lib/events.ts:159`) stamps `everyday: !hasDates` on rule cards; `EventDayCell` renders them in `cellCards` (`EventDayCell.tsx:76` — keeps ALL rule cards) while `manageableCards` (line 77) already filters them out of the add-affordance/drag-content accounting. The every-day card is drag-disabled (`useDraggable disabled`, line 242) and its right-click menu is a no-op ("Every-day rule — edit dates in the rule editor", `CalendarTab.tsx:1327`).
- Layout: `EventCardView` rule branch (`EventDayCell.tsx:205-219`) = rule icon left (`meta.icon`, `meta.chipIcon` color) + truncated `describeRuleDetailed` + `Flag` right (only when `card.violated`).
- e2e: `e2e/calendar-events.spec.ts` asserts everyday cards directly (lines 45-48: 4 dated cards + `[data-card-everyday="1"]` present on a day; line 62: the Rules filter hides the everyday card too) — these flip with the change.

**Design**:
1. **Hide global cards**: keep the card model untouched (`everyday` still on the card — it's the natural gate) but stop RENDERING them: filter `c.kind === 'rule' && c.everyday` out of `cellCards` in `EventDayCell.tsx:76` (merges with the existing `manageableCards` filter — one filter for both). Then prune the dead paths the card can no longer reach: `data-card-everyday` attr, the drag-disabled everyday branch (line 242), and the right-click no-op menu state (`ruleCardMenu.everyday` + `CalendarTab.tsx:1316/1327` — the context menu on a rule card should always be the per-date "Remove from this day"/edit menu). The **Rules tab remains the home of global rules** (item 46's retirement note already says so) — hiding cards is view-only, rules still fire/flag in the stripboard/calendar headers via `computeSectionViolationMap`.
2. **Icon swap on rule/conflict cards**: in `EventCardView`'s rule branch, move the violated `Flag` BEFORE the text span (left edge) and the `meta.icon` AFTER it (right edge, `shrink-0`, keep `meta.chipIcon` coloring). Violated ("conflict") cards = flag left + rule icon right; clean rule cards = rule icon right only. Day-header conflict flag (`DayStatusBadges`/`ViolationTooltip`) is header territory, not a card — untouched.
3. **Verify**: lint + playwright — seeded project with one global rule (e.g. CAST_SCENE_FLAG) + one dated rule: no `[data-event-key^="ev-rule-"]` card on ANY day for the global rule; dated cards still render/drag/right-click/dblclick (existing assertions minus everyday); a violated dated rule card shows flag first in DOM order, rule icon last; `calendar-events.spec.ts` updated (everyday assertions → expect NO every-day cards; the Rules filter block keeps asserting the filter still hides dated rule cards). Smart-test RULES: `src/components/calendar/**` → CAL already covers.

**Relations**: reverses item 45's "card on EVERY day" decision (the `data-card-everyday` display-only card); consistent with item 46's Rules-tab retirement note (Rules tab stays the global/no-date surface); touches `src/lib/events.ts` only as read-only (no model change).

## 66. Calendar versions — independent production dates + events (`[x]` Done)

**Done**: `CalendarVersion` is an independent axis — `Project.calendarVersions` + `activeCalendarVersionId`, calendar fields REMOVED from `ScheduleVersion` (nonShootDates, productionStart, prepStart, postEnd, weeklyDaysOff). No migration (old per-version data dropped; LOAD bootstraps a blank `c01` with productionStart = today). Actions: `SET_ACTIVE_CALENDAR_VERSION`/`NEW_CALENDAR_VERSION`/`RENAME_CALENDAR_VERSION`/`DELETE_CALENDAR_VERSION` (calendarVersionTrash, same 30-day/newest-10 retention)/`UPDATE_CALENDAR_VERSION`. `useProject().activeCalendarVersion` (memoized) is the single read seam — every calendar surface consumes it. UI: header version dropdown removed; schedule picker lives in ScheduleToolbar, calendar picker in the Calendar tab's outer PageToolbar (both `ItemManagerDropdown`). Stripboard dates/call times shift on calendar-version switch (daybreakUtils cursor skips the active version's statused dates). `.msd`/`.sex` imports materialize per-board/per-MMS-calendar calendar versions (items 40/74). Rules stay project-level.

**Requested**: the schedule version holds ALL calendar data (`nonShootDates`, production dates, weekly days off). Add **calendar versions**: an independent version axis so the same stripboard can carry different production windows / day plans / event sets.

**Facts**:
- `ScheduleVersion` (src/types.ts:110) owns `nonShootDates`, `productionStart`, `prepStart`, `postEnd`, `weeklyDaysOff` beside `rows`; one header dropdown switches `project.activeVersionId` (VersionToolbar + AppHeader:232).
- Stripboard dates/call times derive from calendar data (`computeRowData` cursor skips statused dates via `advanceDateCursor`, daybreakUtils.ts) — switching calendar versions shifts section dates/call times, the point of the feature.
- ~86 call sites read these fields off the active version: CalendarTab + DayEventsModal/EventModal/EventAdderModal/ProductionDatesModal, DayTypesTab, ElementEventsModal, DoodsTab, ProductionTab:169, App.tsx:582/620, print Dood/ElementBreakdown, reports `dayType` (reportData.ts), daybreakUtils cursor.
- `project.rules` stays **project-level** (user decision — cast constraints, not calendar plan data; per-calendar-version rules = follow-up item).

**Design** (independent axes — user decisions: independent, rules global, no migration, per-tab pickers):
- **Model**: new `CalendarVersion` `{id, name, createdAt, updatedAt, nonShootDates, productionStart, prepStart, postEnd, weeklyDaysOff}`; `Project` gains `calendarVersions: CalendarVersion[]` + `activeCalendarVersionId`; the calendar fields are **removed from `ScheduleVersion`** (type-driven swap — TS points at every read/write site).
- **No migration (user decision)**: old projects' per-version calendar data is dropped — the fields leave the type, LOAD ignores the stale JSON. LOAD bootstraps a blank calendar version (`c01`, `productionStart = today`) only when none exists, so old projects open clean.
- **Actions** (Action union + ACTION_TYPES, reducer.ts "KEEP IN SYNC"): `SET_ACTIVE_CALENDAR_VERSION`, `NEW_CALENDAR_VERSION` (blank: `productionStart = today`, mirroring `makeBlankProject`; clone = duplicate), `RENAME_CALENDAR_VERSION`, `DELETE_CALENDAR_VERSION` (≥1 guard, mirroring versions), `UPDATE_CALENDAR_VERSION` — every `UPDATE_VERSION` calendar-field write moves here (nonShootDates wholesale-replace semantics kept).
- **Reads**: `useProject()` context gains a memoized `activeCalendarVersion` (same pattern as the per-site `versions.find`); swap all ~86 sites to it.
- **UI (user decision — no header space)**: the header version dropdown is **removed** (VersionToolbar + AppHeader); the **schedule-version picker moves to the Schedule tab toolbar** (`ScheduleToolbar`'s light `PageToolbar`, rightContent) and the **calendar-version picker lives in the Calendar tab's outer PageToolbar** (CalendarTab.tsx:885 — hosts both sub-tabs, so Day Breakdown keeps access). Both are the existing `ItemManagerDropdown` (rename/duplicate/delete/create; duplicate = clone, create = blank). Popouts ride the tab toolbars, so popout windows keep both pickers per tab.
- **Import touchpoint**: item 40/41's .msd/.sex board→calendar materialization moves to CalendarVersion per board (not built yet — the mapping lands with that item).
- `makeBlankProject` seeds `calendarVersions: [{name: 'c01', productionStart: today}]`.

**Verify**: lint + playwright on the seeded project — two calendar versions; switch → ProductionDatesModal reads the active plan (bridge `getProject()`); a day-status/event edit lands in the active calendar version only; stripboard dates/call times shift on switch (bridge `getRows`); new schedule version does NOT touch calendar versions; schedule-version picker works from the Schedule tab; undo/redo + dropdown rename/delete; smart-test RULES entry for the calendar-version files (extend the CAL bucket). Docs: AGENTS.md versioning + DESIGN-LANGUAGE toolbar pattern.

**Relations**: builds on items 45/46/54 (all calendar surfaces move to the new axis); touches item 40's .msd import mapping; rules stay global (item 46's Rules-tab retirement note unaffected).

## 67. Bespoke overlays → ui-kit Modal family — Trash modal with per-type sections, kit Dialog as a Modal sub-element, New Project modal (`[x]` Done)

**Done** (kit v0.1.60, commits `2025ed6` kit / app-side on main):

1. **Kit Dialog → Modal sub-element** (`ui-kit/src/Dialog.tsx` rebuilt): `DialogProvider` renders confirm/prompt/alert through the kit Modal's new **`flat` chrome** (Modal.tsx `flat` prop — no header/footer bars: title row + buttons sit on the body surface, coarse-aware padding) so every dialog inherits the zoom-in/out, stack FLIP morph, the one-dim backdrop (item 59), viewport clamp and drag. **Enter = the primary action ALWAYS** — a document-capture keydown handler in the kit Dialog (Radix focuses the X close button on open, which would otherwise make Enter cancel; the Modal's content-level Enter-confirm is bypassed). Esc/outside/X = cancel; DNWA checkbox, prompt input, danger → `danger-solid` confirm unchanged; `useDialog()` API identical, zero app call-site churn. Dead dialog CSS (`.ui-overlay`/`.ui-dialog*`/`.ui-btn*`) removed from `tokens.css`. Playground: `DialogsSection` demo (confirm/danger+DNWA/prompt/alert/dialog-over-host) + `playground/specs/dialog.spec.ts` (flat chrome, Enter=primary, DNWA 24h suppression, stack dims = exactly one visible layer); fixed the playground webServer command (cwd is the config dir). Playground suite 41 passed / 1 pre-existing flake (`context-menu` nested-subs, fails on the clean tree too).
2. **Trash modal** → extracted to `src/components/TrashModal.tsx` (App.tsx was the last monolith tenant of this block): kit Modal (icon `Trash2`, `max-w-xl`) with **one collapsible `ItemCard` per trash kind** (Scenes/Versions/Calendar Plans/Rules/Elements/Custom Categories/Color Rules/Crew/Ribbon Designs — kind icon + count, `data-trash-section`; rows = title + subtitle + Restore `RotateCcw`, `deletedAt`-desc, `data-trash-item`), hidden empty sections, "Trash is empty" state, footer = Empty (ghost danger `mr-auto`, DNWA `lemon_schedule_dnwa_empty_trash`) + Close hero. Old bespoke `fixed inset-0 z-[9999]` div deleted from App.tsx (its trash-type imports/formatTime/ruleMeta helpers went with it).
3. **NewProjectModal** → kit Modal (`max-w-sm`, name input autoselect + Enter-to-create, Cancel ghost + Create hero with `data-modal-confirm`, creating spinner), replacing the bespoke `absolute inset-0 z-10` overlay.

Verified by `e2e/trash-restore.spec.ts` (sections per kind with counts via bridge-populated trash, restore per kind, Empty with DNWA, empty state, Close) + the kit dialog specs. Smart-test RULES: `TrashModal.tsx`/`NewProjectModal.tsx` → TRASH bucket. Docs updated: DESIGN-LANGUAGE primitive matrix (dialog row — Modal sub-element w/ flat chrome + Enter-always-primary; §Modal anatomy Enter note; §Item cards trash row), AGENTS.md UI-primitives dialog bullet, docs/UI-KIT.md.

**Requested**: three overlay conversions to the kit Modal language:
1. **Trash modal** — convert to the kit Modal, with nice shared "little sections" for the different trash types (the ItemCard card-group language).
2. **Warnings/dialogues** — put the confirm/prompt/alert dialogs in the ui-kit as a **sub-element of the Modal** so they support the animations too (the user really likes the Modal's style).
3. **New Project dialog** (where the name goes) — should also be ui-kit.

**Facts**:
- The Trash modal is a bespoke `fixed inset-0 z-[9999] bg-black/50` div in `App.tsx:882-1008` (opened from the AppHeader File menu via `onShowTrash`): header ("Trash", "Items expire after 30 days", Empty w/ DNWA confirm `lemon_schedule_dnwa_empty_trash`, X) + a **flat** `deletedAt`-desc list of ALL 9 trash kinds — scene/version/calendarVersion/rule/ribbon/element/category/colorrule/crew (`project.trash`…`project.crewTrash`) — each row = colored kind label + title + subtitle + Restore (`RotateCcw`). No kit Modal, no morph, no sections. (Note: the 30-day TTL + keep-newest-10 is the version trash prune in storage.ts; the other kinds are permanent until Empty.)
- The kit Dialog (`~/Documents/Software Apps/ui-kit/src/Dialog.tsx` — `DialogProvider` + `useDialog().confirm/prompt/alert`; the app's `src/components/Dialog.tsx` is a 1-line re-export) is a **standalone Radix Dialog with its own draggable/resizable chrome and a transparent `ui-overlay`** — it does NOT render through the kit `Modal`, so it has none of the Modal's animations (standalone zoom-in/out, stack FLIP morph, the item-59 dim fade, Enter-confirms). Item 58's Done text explicitly left it out ("The kit confirm/alert overlay stays transparent — no double-dim over the app modal") — this item closes that gap.
- NewProjectModal (`src/components/NewProjectModal.tsx`, 57 lines) is a bespoke `absolute inset-0 z-10 bg-zinc-900/95` overlay rendered inside ProjectManager (`:394-401`): name input (autoselect on open, Enter = create) + Cancel/Create (disabled while `!name.trim()` or creating, spinner while creating). Not the kit Modal.
- The shared section language already exists: `ItemCard`/`ItemRow` (`src/components/cards/`, items 46/62) — collapsible group cards with icon + title + count + dark-band rows, consumed by DayEventsModal/ElementEventsModal. The trash kinds' colored labels (sky/emerald/lime/amber/orange/pink/teal/cyan/violet) map naturally onto section icons.

**Design**:
1. **Kit Dialog → Modal sub-element** (kit-side, one `@gabriel/ui-kit` bump): rebuild `Dialog.tsx` ON the kit `Modal` — the confirm/prompt/alert body renders as Modal children with a `ModalFooter` (Cancel ghost + Confirm/OK/Save hero per the one-hero rule; `danger` → the ghost-danger + red-confirm pattern). Inherits the zoom-in/out, stack morph (a dialog over a modal morphs out of the modal's box), dim fade, and Enter-confirms for free. Keep the `useDialog()` API, DNWA checkbox (`suppressKey`, tone danger), prompt input, draggability and coarse sizing untouched — zero app-side call-site churn.
2. **Trash modal → kit Modal with per-type sections**: extract to `src/components/TrashModal.tsx` (App.tsx is ~1080 lines — AGENTS.md rule 2; add a smart-test RULES entry — App.tsx → ALL already covers the removal site). Kit `Modal` (icon `Trash2`, width `max-w-xl`) + `ModalFooter` with ONE hero (Close) and Empty as ghost danger (`mr-auto`, DNWA confirm). Body = one **collapsible `ItemCard` per trash kind with items** (icon + kind label + count; rows = title + subtitle + Restore `RotateCcw`), sections with zero items hidden, `deletedAt`-desc within a section, existing per-kind title/subtitle builders (scene/version/calendar plan/rule w/ `describeRule`/element w/ category label/color rule/crew/ribbon) moved into the new file, "Trash is empty" state when all sections are empty.
3. **NewProjectModal → kit Modal**: swap the bespoke overlay for the kit `Modal` (title "New Project"/"New Cloud Project", body = the name input with autoselect-on-open + Enter-to-create, footer = Cancel ghost + Create hero with `data-modal-confirm` and the creating spinner). The Modal portals to the window body so the ProjectManager z-index shell is irrelevant. (The item-1 dialog rework is NOT a substitute — the hero-button + spinner flow is modal-shaped, not prompt-shaped.)
4. Docs in the same commit(s): DESIGN-LANGUAGE primitive matrix + feedback taxonomy (a Dialog row — "sub-element of the Modal, inherits the morph"; the trash modal row), AGENTS.md UI-primitives bullet, `docs/UI-KIT.md` note.

**Verify**: lint + playwright — trash: File → Trash shows per-kind sections with counts, restore one item per kind (bridge `getProject()`), Empty (DNWA) clears everything, empty state; dialogs: confirm/prompt/alert behave identically (existing flows — element-link cascade confirm, delete-version DNWA, day-modal adds) AND morph probes pass over a modal (dialog zooms out of the modal box, no double dim — item 59's invariant holds); new project: create/cancel from ProjectManager (local + cloud), Enter = create, autoselect, disabled Create without a name. Smart-test RULES: add `TrashModal.tsx` + `NewProjectModal.tsx` (or a TRASH bucket).

**Relations**: rides item 58/59's morph/dim language and item 62's ItemCard/ItemRow; closes the kit Dialog's animation gap (58/59 explicitly exempted it); app-side conversions follow item 56's kit-bump pattern.

## 68. Date picker opens on the relevant month — selected date, else production start, else today (`[x]` Done)

**Done** (kit v0.1.63): the kit `DatePicker` gained an `initialView?: string` prop — the visible month/year seeds ON MOUNT from that ISO date (parse-fallback to today when invalid). `DateField` threads it through; each host computes the fallback chain once via the shared `initialViewFor(fieldValue, productionStart)` (`src/components/calendar/calendarUtils.ts`): the field's picked date (latest pick) → the active calendar version's `productionStart` → omitted (kit falls back to real today). Wired in EventModal, EventAdderModal, ProductionDatesModal (all three fields), and RuleEditorPanel (inline Dates box; `productionStart` threaded from RulesTab/DayEventsModal/ElementEventsModal). Because chrome-mode `DateField` remounts the picker per panel open, every open lands on the relevant month. Verified by `e2e/date-picker-initial.spec.ts` (picked date wins, empty-field → production start, no production start → real today); RULES entry: `DateField.tsx` → CAL∪RIBBON, `RulesTab.tsx` → RIBBON, `date-picker-initial` added to CAL.

**Requested**: the date picker should open on the **currently selected date** when there is one; if there's no date, it should open on the **current production start date**; if there's no production start, it should open on **real today**.

**Facts**:
- The kit `DatePicker` seeds its visible month/year to **today** on mount and never re-seeds (ui-kit `DatePicker.tsx:41-43`: `useState(today.getFullYear())` / `useState(today.getMonth())`). When a rule/event already has a date set, the panel still opens on today's month — the user must page away (or use the month-grid jump) to see the relevant month.
- App surfaces all go through the same composition: `DateField` (`src/components/DateField.tsx`) wraps the kit `DatePicker` in a `DropdownMenu` (chrome variant) or renders it inline; consumed by `EventModal` (`DateField.tsx:221`), `EventAdderModal` (:197), `ProductionDatesModal` (:50), and `RuleEditorPanel` (:223). The inline variant (rule-editor Dates box) is a long-lived mount, so its view state persists across edits.
- "Production start" comes from the **active calendar version** (`useProject().activeCalendarVersion.productionStart` — item 66 moved calendar data off `ScheduleVersion`). Every host above already has the version in scope (e.g. `EventModal.tsx:73` bounds dates by `prepStart || productionStart`).

**Design**:
- **Kit**: add an optional `initialView?: string` prop (`YYYY-MM-DD`, single date) to the kit `DatePicker` — seed `viewYear`/`viewMonth` from it on **mount** (parse like the chip renderer, `DatePicker.tsx:202`), falling back to today when absent/invalid. In multi-mode, seed from the first date (or the latest? — decide in the worker: first = oldest date visible, latest = most recent pick; "the currently selected date" reads most naturally as the latest/single pick). Because chrome-mode `DateField` mounts the picker per panel open (Radix presence unmounts on close), each open re-seeds — exactly the requested behavior. The inline variant only re-seeds on full remount (acceptable: the rule editor's dates are often picked via the chrome fields in the day modal; note it in the DESIGN-LANGUAGE row).
- **App**: `DateField` gains an optional `initialView?: string` passthrough; each host computes the fallback chain once before rendering:
  1. the field's current value (`value[0]` — single mode, or the chosen date for multi),
  2. else `activeCalendarVersion?.productionStart` (each host already reads the active calendar version),
  3. else omitted → kit falls back to real today.
  Share the chain via a tiny helper (e.g. `initialViewFor(fieldValue, activeCalendarVersion)` in `src/lib/calendar` territory — one source of truth, no re-derivation) so all four hosts pass identical logic.
- **Docs**: DESIGN-LANGUAGE primitive matrix DateField row notes the open-on-relevant-month rule; AGENTS.md unchanged (behavior-level).
- **Verify**: lint + playwright — seeded project: open EventModal / rule editor with an existing date far from today → panel shows that month (bridge or month-grid label); a dated field with `productionStart` set but no value → opens on production start; empty field + no production start → today's month; after picking, reopening shows the picked month. `EventAdderModal`/`ProductionDatesModal` get the same probes. Smart-test RULES entry for `DateField.tsx` if the mapping doesn't already cover it.

**Relations**: rides the kit `DatePicker` (v0.1.34+ — the `initialView` prop needs a kit bump via item 56's process); `DateField` is a promotion candidate for the same bump path.

## 69. BUG: dropdowns/menus inside modals don't scroll with touch on iPad (`[x]` Done)

**Done** (kit v0.1.64, commit `df524e6`): `useOverlayMorph` gained the **touchmove twin** of the v0.1.52 wheel interceptor — a document-capture `stopImmediatePropagation` for touchmoves whose target is inside the overlay, so react-remove-scroll's bubble-phase listener (Radix Dialog) never cancels the native scroll. Every surface on the hook (app `DropdownPanel`, `SelectDropdown`, `AutocompleteDropdown`, the kit `DropdownMenu`/submenu/context-menu) is now finger-scrollable inside a modal on iPad. Verified by `e2e/ipad-touch-scroll.spec.ts` "entity dropdown inside a modal is touch-scrollable" (webkit iPad, `playwright.ipad.config.ts`).

**Requested**: on iPad, **entity dropdowns and dropdowns inside modals can't be scrolled with a finger** — the panel opens but swiping over the list does nothing (wheel is fine on a Magic Mouse, touch is dead).

**Facts**:
- `react-remove-scroll` (pulled in by Radix Dialog → the kit `Modal`) installs **non-passive `document`-level `touchmove` listeners** that `preventDefault()` any touchmove whose target is **outside the dialog content** (`node_modules/react-remove-scroll/dist/es2015/SideEffect.js:140`, `shouldPrevent` → `!lastProps.current.noIsolation`). Portaled dropdown panels — the EntityDropdown chip panel, the kit `DropdownMenu` content, `SelectDropdown`, `AutocompleteDropdown`, `AsyncResultsDropdown` (once portaled) — all live outside the modal content, so every touch scroll inside them is cancelled.
- The **wheel** case was already fixed in kit v0.1.52: `useOverlayMorph` intercepts wheels at **document capture** and `stopImmediatePropagation()`s them when the target is inside the overlay, so react-remove-scroll's bubble listener never sees them (`ui-kit/src/overlayMorph.ts:309-317`). There is **no touchmove twin** — that is the entire gap.
- iOS also lets a scroll gesture end in a `touchend` that becomes a click on an item, so the failure reads as "list won't move at all" rather than "item got picked."

**Design**:
- **Kit** (one `@gabriel/ui-kit` bump): in `useOverlayMorph`, register a second document-capture interceptor for `touchmove` mirroring the wheel one — `if (el.contains(e.target)) e.stopImmediatePropagation()` — so react-remove-scroll's non-passive `document` bubble listener never cancels the scroll. Gate exactly like the wheel one (`ready && visible`), never by the morph opt-out (scrolling must work even with animations off). Every app panel built on `useOverlayMorph` (`DropdownPanel`, `SelectDropdown`, `AutocompleteDropdown`, the kit menu/submenu/context-menu) inherits it; remaining overlay surfaces (kit `DatePicker` popover, `Tooltip`, `FloatingChrome`, and `AsyncResultsDropdown` until item 72 lands) get a quick check for the same exposure.
- **Docs**: DESIGN-LANGUAGE §Modal anatomy / dropdown anatomy note — "overlays inside modals stay touch-scrollable (capture interceptor)"; `docs/UI-KIT.md` note beside the v0.1.52 wheel one.

**Verify**: lint + **webkit iPad** — `npx playwright test --config=playwright.ipad.config.ts e2e/ipad-touch-scroll.spec.ts`: open a modal → open an entity dropdown / kit menu inside → `page.evaluate` dispatch a cancelable `touchmove` `Event` on the panel → assert it is **not** `defaultPrevented` (native scroll would proceed). Red before the fix (react-remove-scroll cancels it), green after. Regression: `overlay-morph.spec.ts`, day-modal/rule-editor flows green.

**Relations**: rides item 58's overlay-morph sweep and the v0.1.52 wheel interceptor; pairs with item 70 (same kit bump — both are overlay/positioning touch bugs); item 72 depends on this landing (its kit-based panel needs touch scroll).

## 70. iPad: modals + dropdowns stay inside the visible viewport — respect the software keyboard (`[x]` Done)

**Done** (kit v0.1.64, commit `df524e6`): the kit `Modal`, `useFixedPosition` and `useSmartPosition` all position/clamp against the **visual viewport** (`window.visualViewport.height`/`offsetTop` — where the iPad keyboard + Safari chrome live) instead of `innerHeight`, and all three subscribe to `visualViewport` `resize`/`scroll` (the keyboard fires resize there, never on `window`). Modals centre into the visible area and re-centre/re-clamp when the keyboard opens/closes; dropdown panels re-measure and stay above the keyboard. Verified by `e2e/ipad-touch-scroll.spec.ts` (PM centres in a mocked 500px-tall visible strip; a modal dropdown re-clamps on a mocked `visualViewport` resize).

**Requested**: two related iPad problems —
1. The **Project Manager sometimes appears off the viewport centre** (and other modals too).
2. **Dropdowns in general should respect the iPad keyboard and never extend past it.**

**Facts**:
- The kit `Modal` centers on `currentWindowRef.current.innerHeight` (`ui-kit/src/Modal.tsx:252`, and the ResizeObserver re-center at `:391`; `clampPos` at `:436-446` too). On iPad, `window.innerHeight` is the **layout** viewport; the **visible** area is `visualViewport.height − visualViewport.offsetTop` (Safari chrome/keyboard). The modal centers against a too-tall viewport → pushed down / off-centre relative to what's visible. "Sometimes" = whenever Safari's chrome or the keyboard occupies the bottom.
- `useFixedPosition` (`ui-kit/src/useSmartPosition.ts:72-73`) already measures `visualViewport?.height` + `offsetTop`, but only re-runs on `window` `resize` + scroll. The iOS keyboard fires `resize` on **`window.visualViewport`**, not `window` — and inside a modal the page can't scroll (react-remove-scroll), so a panel open near the keyboard never re-measures and hangs past it.
- `useSmartPosition` (relative panels) uses `win.innerHeight` and runs **once** on open — no keyboard awareness at all.

**Design**:
- **Kit** (same bump as item 69):
  1. `Modal` — centre and clamp against `visualViewport.height`/`offsetTop` (init, RO re-centre, `clampPos`), and subscribe to `visualViewport` `resize` + `scroll` so opening/closing the keyboard re-centres a modal whose input just raised it.
  2. `useFixedPosition` — add `window.visualViewport` `resize`/`scroll` subscriptions to the existing re-measure.
  3. `useSmartPosition` — clamp `vh` to `visualViewport.height` (offset-adjusted), and re-run while open on `visualViewport` + window resize/scroll.
- **Docs**: DESIGN-LANGUAGE §Modal anatomy — "modals centre on the visual viewport (keyboard-aware)"; `docs/UI-KIT.md` note.

**Verify**: lint + **webkit iPad** — `e2e/ipad-touch-scroll.spec.ts`: mock `window.visualViewport` (shrunk `height` + nonzero `offsetTop`, `addEventListener` stub that records handlers) → open the Project Manager → assert its box is centred inside the visible area (red before); open an entity dropdown → assert panel bottom + `maxHeight` stay inside the visible area (red before); fire `visualViewport.resize` while a panel is open → assert it re-clamps (red before). Regression: modals still centre on desktop, dropdowns still width-match + viewport-clamp (existing specs).

**Relations**: pairs with item 69 (same kit bump); item 72 depends on this (its kit-based panel needs the keyboard clamp); `useFixedPosition`/`useSmartPosition` are shared with the whole dropdown family.

## 71. BUG: Cancel on the Add Events modal can freeze the day modal (`[x]` Done)

**Done** — the freeze was TWO stacked-modal iPad failures, both now fixed:
1. **Radix touch-deferral lock (the real "it's locked" one)**: the app ran `react-dismissable-layer` **1.1.12** (via `react-dialog` 1.1.16 / `react-dropdown-menu` 2.1.17), which DEFERS touch outside-dismissal to the click event. A touch-tap Cancel on the stacked adder left the stacked dialog's body stuck at `pointer-events: none` on close — the day modal popped back but nothing was tappable. The kit playground runs react-dialog **1.1.23** (dismissable-layer 1.1.19, touch dismisses on pointerdown), which is why double modals looked fine there. Fix: bump `@radix-ui/react-dialog` → 1.1.23 + `@radix-ui/react-dropdown-menu` → 2.1.24 (single dismissable-layer 1.1.19). Regression proof: `e2e/ipad-touch-scroll.spec.ts` "Cancel on the Add Events modal…" now TOUCH-TAPS Cancel/Done (mouse clicks never hit the deferred path) and asserts the day modal stays `pointer-events:auto`; it was red with 1.1.12 (body `pointer-events:none` after the tap) and green with 1.1.23. **Do NOT regress Radix below dismissable-layer 1.1.19**, and keep the dialog+dropdown-menu versions matched (a partial bump forks the shared layer and breaks menus inside modals).
2. **`Fade-recovery watchdog`** (kit v0.1.64, `df524e6`): the survivor's exit-morph pins the stacked modal back to `opacity:1` if iOS Safari leaves the `:has()` stack fade stuck at `opacity:0` after a child unmounts (inline wins over the `:has` rule; released on the next stack-open).

**Requested**: in the Calendar, open a day (day events modal) → **Add Event** → press **Cancel** — sometimes the Add Events modal closes but the **previous day modal never comes back and the app appears frozen**.

**Facts**:
- The Add Events modal (`EventAdderModal`) and the day modal (`DayEventsModal`) are **stacked** Radix Dialogs — the kit `Modal` portals them as siblings into the window body, `[data-modal-stack]`, DOM order = stack order. Cancel = `setNested(null)` → the child unmounts; the **survivor's exit-morph** (`ui-kit/src/Modal.tsx`) shrinks the day modal back from the closing child's last rect while the CSS `:has` stack fade restores it.
- **The freeze (confirmed)**: Radix `react-dismissable-layer` **1.1.12** (what `react-dialog` 1.1.16 / `react-dropdown-menu` 2.1.17 pinned) **defers touch outside-dismissal to the click event**. Radix dialogs set `disableOutsidePointerEvents` → `body { pointer-events: none }` while open. On iPad, tapping Cancel on the stacked adder is a touch — and the modal's close morph's `preventDefault` suppresses the click, so the deferred unlock **never fired**; the adder closed but the body stayed `pointer-events: none` → day modal back, whole app locked. Mouse (Mac) dismisses on pointerdown, so Mac was never affected; the kit playground's newer Radix (≥1.1.19, touch dismisses on pointerdown) never showed it.
- **Why it "sometimes" happened**: any touch path where the click didn't fire after the modal gesture (the close-morph `preventDefault`, plus timing) hit the deferred-unlock gap. The "previous modal invisible" symptom was the separate `:has` fade issue (see below).
- The app already works around a sibling Radix-stacking race (`DayEventsModal.tsx:137-149`, `nestedReady`).

**Design**:
- **Kit**: harden the survivor exit-morph so a superseded animation can never leave a stale inline transform — either (a) track and clear the pinned `transform`/`transition` on the survivor whenever a new animation supersedes the token, or (b) refuse competing `beginAnim`s during an in-flight exit-morph (re-anchor the RO after). Keep the morph-back look identical when it runs clean.
- App-side: no change expected beyond the kit bump; verify the full stacked set (day modal → Add Events / EventModal / Rule editor) round-trips.

**Verify**: lint + playwright (webkit iPad config + desktop): day modal → Add Event → Cancel → day modal **visible and interactive** (assert heading + click a row), repeated ~10× to catch the race; same for EventModal and the rule editor (open → close → parent reappears). Regression: `calendar-travel-hold.spec.ts`, `element-events.spec.ts`, `overlay-morph.spec.ts`.

**Relations**: rides items 58/59's stack morph language; independent of 69/70 (Modal-only) but lands in the same kit bump.

## 72. Addresses-picker autocomplete (`AsyncResultsDropdown`) → ui-kit base (`[x]` Done)

**Done** (`AsyncResultsDropdown.tsx` rebuilt): the location picker's address autocomplete now renders its results in the **shared dark `DropdownPanel`** (the chip-EntityDropdown panel) with a `Loader2` spinner while searching — inheriting the morph, touch/wheel scroll and visual-viewport keyboard clamp (items 69/70) from the kit hooks, with the debounce/sequence-guard/arrows/Enter/Escape API unchanged. Note the deliberate base: the **shared `DropdownPanel`, NOT the kit `DropdownMenu`** — the kit menu's document key-lock consumes typeahead letters and steals focus to the content, which breaks typing in an input-triggered async search. Verified by `locations.spec.ts` + `report-sun-weather-map.spec.ts` + the DESIGN-LANGUAGE primitive-matrix row.

**Requested**: the address autocomplete in the **Attach a location** picker (Locations manager + reports map block) should be built on the ui-kit — styled like the **dark entity dropdown** (chip trigger + dark panel), with the async **loader** kept. It already scrolls, but it's a bespoke parallel dropdown that misses the morph, the keyboard clamp, and the single-highlight contract.

**Facts**:
- `src/components/location/AsyncResultsDropdown.tsx` is a hand-rolled dropdown: `useSmartPosition` only (relative panel, no portal, no `useFixedPosition`), no overlay morph, plain buttons, own highlight. Because it renders **inline inside the modal body** it avoids the item-69 portal/touch problem today — but it is exactly the parallel-abstraction AGENTS.md rule 1 forbids, and it can't respect the iPad keyboard (item 70).
- It's the only async-search dropdown in the app (`LocationPickerModal` — the map's address search — plus the reports map block via `LocationPickerModal`).
- The dark entity dropdown look to reuse: `EntityDropdown variant="chip"` trigger + the dark `DropdownPanel` (`bg-zinc-950/95 backdrop-blur-md border-zinc-800 rounded-lg shadow-2xl p-1`, single-highlight rows, Check glyphs).

**Design**:
- **App**: rebuild `AsyncResultsDropdown` on the kit `DropdownMenu` base (dark theme, controlled `open`, custom trigger = the search input with the `Search` icon + `Loader2` spinner while `searching`, custom children = the async result rows styled with the dark panel row classes + single-highlight). Keep the debounce, sequence guard, arrows/Enter/Escape, and `onPick` API identical (`search: (q) => Promise<T[]>`, `AsyncResultItem` unchanged). Because it now uses the kit menu's `useFixedPosition` + `useOverlayMorph`, it inherits the keyboard clamp (70), wheel + touch scroll (69), and the morph for free.
- Docs: DESIGN-LANGUAGE primitive matrix — replace the bespoke row with the AsyncResultsDropdown row (kit DropdownMenu base, dark chip panel + loader).

**Verify**: lint + playwright — `locations.spec.ts` + `report-sun-weather-map` green (address search picks, debounce, arrows); `e2e/ipad-touch-scroll.spec.ts` asserts the picker's panel scrolls (touch) + respects the mocked keyboard; `overlay-morph.spec.ts` extended with the async panel morph probe.

**Relations**: depends on items 69 + 70 (the kit base must be touch-scrollable + keyboard-clamped first); rides item 58's morph language and item 61's kit-base pattern for bespoke dropdowns.

## 73. Calendar event chips: icon-left on every card, tooltip names the kind, Add Events defaults to the day's type (`[x]` Done)

**Done**: every event chip carries its kind icon on the LEFT — attachment cards always (the `seenTypeIcons` first-card-only dedupe removed from `EventDayCell.tsx`), and rule cards per the user's follow-up: a CLEAN dated rule card shows its rule-type icon on the left, while a **VIOLATED card shows the red FLAG as its icon** (left, no rule-type icon, no trailing flag — the rule kind is read from the hover tooltip; `calendar-rule-cards.spec.ts` assertion updated for suite-green). Hover tooltips name the kind on every chip: attachment cards always render the rich `HoverTooltip` ("Travel — Cast" header, comment body when present — comment-less cards got no kind tooltip before), rule cards swap the native `title` for the same tooltip (rule-kind header + description/violation message). Add Events defaults the adder's type to the day's OWN status: `CalendarTab` passes `adderStatus` (the day's status when it's attachable — shared `getAttachableDayTypes` gate in `dayTypes.ts`, used by the adder too, so the preselection can't drift) into the adder's existing `status` prop; no-status and non-attachable (Day Off) days keep the first-attachable fallback. Verification = manual (user decision — small visual change; no new spec, AGENTS.md rule 7); lint green.

**Requested**: three related calendar-events polish asks —
1. **Every event chip should show its icon on the LEFT** (today only the FIRST attachment card per day type carries the type symbol, and rule cards put the icon on the right).
2. **The hover tooltip should say the kind of event** (e.g. "Travel", "Hold") on every chip.
3. **The Add Events button should default the adder's event type to the day's own type** — "if the day type is travel, the default event type on the adder is travel."

**Facts**:
- Cards render in `EventDayCell` → `EventCardView` (`src/components/calendar/EventDayCell.tsx`), model in `src/lib/events.ts` (`EventCard` union: `status | attachment | rule`; `cellCards` = attachment + dated rule cards, global rule cards already hidden — item 65).
- **Icon-left today**: attachment cards DO render the type icon on the left (`EventDayCell.tsx:199`) — but `showIcon` is only true for the first card of each day type (`seenTypeIcons` dedupe, `:136-137`; "the type's identity shows exactly once" — the header badge for that type is suppressed too). Rule cards are the opposite: violated `Flag` on the LEFT, the rule icon on the RIGHT (`:229-233`) — that layout is item 65's deliberate swap (user request then: "flag left, rule icon right"). This item reverses the rule-card half.
- **Tooltip today**: attachment cards show a rich `HoverTooltip` (type label + category + comment) ONLY when the card carries a comment (`:205-217`); comment-less attachment cards fall back to a native `title` = the element names only (`:195`) — no event kind. Rule cards use a native `title` = `describeRuleDetailed` (`:225`) — the kind is implied, not stated up front.
- **Adder default type**: `EventAdderModal` (`calendar/EventAdderModal.tsx:75`) already accepts a `status` prop and seeds from it (`statusProp ?? (attachableTypes[0]?.key || 'travel')` — `attachableTypes` = `getMarkableDayTypes(project).filter(t => t.attachable !== false)`, so work/holiday are excluded). The day modal already passes the day's status (`DayEventsModal.tsx:267` → `status={statusKey || undefined}` at `:444-450`). The GAP is the two Calendar-tab call sites that open the adder with NO status: the events-mode empty-day "Add event" affordance (`CalendarTab.tsx:1230`, `onAddEvent={(dk) => setAdderDate(dk)}`) and the day right-click "Add Events…" (`:1394`) — both render `EventAdderModal date={adderDate}` (`:1478-1483`) with no `status`, so the adder falls back to the first attachable type in manager order, not the day's type.

**Design**:
1. **Icon left on every chip** (`EventCardView`):
   - **Attachment**: drop the `seenTypeIcons` dedupe — `showIcon` always true, every card shows its type icon on the left (colored per the day type, as today). DayStatusBadges already suppresses the header badge for types with cards, so a multi-card day reads "N of type X" via the repeated symbol — the intended signal. The dedupe comment + this item's rationale go in the commit.
   - **Rule**: move the rule icon to the LEFT (before the text, `meta.icon`, `meta.chipIcon` color) and the violated `Flag` back to the RIGHT — the exact inverse of item 65's swap (the flag keeps its red fill). Clean rule cards = icon left only. NOTE for the worker: this explicitly reverses item 65's "flag left / rule icon right" user decision — flag the reversal in the commit message; if the user still prefers the flag-left for conflicts, they'll say so when this lands.
2. **Tooltip names the kind** (every chip, both `EventDayCell` and the shared drag-ghost path — `EventCardView` is shared):
   - **Attachment**: render the existing rich `HoverTooltip` for ALL attachment cards, not just comment-carrying ones — header line = type icon + `<label> — <Category>` (the comment line shown only when `card.comment` exists; the `MessageSquare` glyph stays tied to comments). `className="w-full"` stays (item 65's full-width fix).
   - **Rule**: swap the native `title` for the same `HoverTooltip` — header line = rule type label (`RULE_TYPE_META[card.rule.type].label`) + body = `describeRuleDetailed` (violation message first when `card.violated`). Native `title` removed.
3. **Add Events default = the day's type**: in `CalendarTab`, resolve the day's status (`nonShootDateMap.get(dateKey)?.status` — available at both call sites) and pass it to the adder as `status` **only when it's an attachable type** (`getMarkableDayTypes(project)` + `attachable !== false` — reuse the exact `attachableTypes` gate the adder applies, one helper so they can't drift); days without a status (or with a non-attachable status like holiday) keep the current first-attachable fallback inside the adder. DayEventsModal's existing pass-through is the model (`status={statusKey || undefined}`).

**Verify**: **no new automated spec** (user decision — a small visual/UI-only change; verified manually instead, per AGENTS.md rule 7). Lint + a manual check list:
- **Icon-left**: a day with several Travel attachment cards renders the Travel symbol on the LEFT of EVERY card (not just the first); a VIOLATED rule card shows the red FLAG as its icon on the left (no rule-type icon); a clean rule card shows its rule icon on the left.
- **Tooltip**: hover any attachment card → tooltip names the kind + category ("Travel — Cast"), plus the comment body when the card has one; hover a rule card (violated or clean) → tooltip names the rule kind ("Max Hours") + description/violation message; no stale native `title`s.
- **Default type**: mark a day Travel → the events-mode empty-day "Add event" and the day right-click "Add Events…" open the adder with Travel pre-selected; a no-status day (and a Day-Off day) keep the first-attachable fallback. Day modal → Add Event regression untouched (it already passes the status).
- **The ONE spec change this item needs**: `calendar-rule-cards.spec.ts:58-65` asserts item 65's flag-left/icon-right rule-card layout — flip it to the new icon-left/flag-right (suite-green requirement; no new coverage is added).

**Relations**: replaces item 65's rule-card layout (flag-left/icon-right) — clean rule cards put the rule icon left, violated cards show the FLAG as the icon (rule kind via tooltip); rides item 45/46's card model (`src/lib/events.ts`, untouched — view-only changes); the adder `status` prop is item 46's (no model change, call-site wiring only).

## 74. MSD import × calendar versions — distinct MMS calendars as calendar versions (`[x]` Done)

**Done**: `src/lib/import/msd.ts` now materializes ONE CalendarVersion per
DISTINCT MMS calendar (`parseCalendars` iterates every `Calendar` in
`CalendarMgr`, keyed by name), named by the MMS name — including calendars no
board references ("Actor Unavailable" in the demo). Each calendar version
carries `productionStart`, `prepStart` (ProductionPrepStartDate), `postEnd`
(ProductionEndDate/WrapDate), `weeklyDaysOff` (MMS `DaysOff` Sun=0..Sat=6 →
Lemon Mon=0..Sun=6, sorted) + the window-bounded materialized `nonShootDates`
as before. The per-board `calendarPlans`/`boardAttrCalendar` block was deleted;
`activeCalendarVersionId` = first version, and a file with no `CalendarMgr`
gets a blank `c01` (`makeBlankCalendarVersion` — the LOAD fallback). `tools/
msd_probe.py` emits the new fields (all 3 demo calendars, prepStart/postEnd/
weeklyDaysOff per calendar) and `e2e/msd-import.spec.ts` asserts one calendar
version per distinct MMS calendar matching the golden's prepStart/postEnd/
weeklyDaysOff/nonShootDates. Verified by `e2e/msd-import.spec.ts`.

**Requested**: now that calendar versions exist (item 66), check the `.msd`
import: is it worth importing the DIFFERENT calendar versions from MMS — each
with its own dates, flagged days off, and other events — instead of today's
flat per-board copy?

**Facts** (current `src/lib/import/msd.ts`):
- `CalendarMgr` holds MULTIPLE `Calendar` definitions (demo: "5 Day Week",
  "6 Day Week", "Actor Unavailable"); each `StripBoard` references one via
  `CalendarName`, but calendar data is an independent axis (item 66) — no need
  to link boards to calendars.
- The import creates ONE CalendarVersion PER BOARD (`${boardName} Calendar`),
  filling only `productionStart` + materialized `nonShootDates` (weekly days
  off + SpecialDay Off/Holiday→`holiday`, CompanyTravel→`travel`, bounded to
  the production window). `prepStart`/`postEnd` (MMS
  `ProductionPrepStartDate`/`ProductionEndDate`/`ProductionWrapDate`) and the
  `weeklyDaysOff` pattern (`DaysOff Sun=1…`) are parsed for the window bound
  but DROPPED — CalendarVersion now supports both (item 66; app days-off is
  MMS-style since item 54).
- `e2e/msd-import.spec.ts:177-187` asserts "some calendar version matches the
  golden board's calendar content" — the golden stores calendars BY NAME.

**Design** (user decision — full enhancement, NO board linking):
- **One CalendarVersion per distinct MMS calendar**, named by the MMS calendar
  name ("5 Day Week", "6 Day Week", "Actor Unavailable" — including
  unreferenced ones, so nothing a real file defines is lost; a file with N
  calendars yields N versions even if some boards share).
- **Fill the dropped fields**: `prepStart` (ProductionPrepStartDate), `postEnd`
  (ProductionEndDate/WrapDate), `weeklyDaysOff` (DaysOff → Mon=0..Sun=6 array
  — reverse the WEEKDAYS order), plus the existing `productionStart` +
  materialized `nonShootDates` (keep the window bound that keeps the demo's
  2003–2007 template SpecialDays out).
- Replace the per-board `calendarPlans`/`boardAttrCalendar` block in
  `buildProject` (msd.ts:509-525) with a distinct-calendars pass;
  `activeCalendarVersionId` = first version (default, as LOAD bootstraps).
- `.sex` (item 41) stays blank-`c01` — SEX carries no calendar data (sex.ts:329).

**Verify**: lint + playwright — update `tools/msd_probe.py` + the golden
(`e2e/fixtures/wonderful-life.expected.json`, `calendars` key already keyed by
name) to emit prepStart/postEnd/weeklyDaysOff; the spec then asserts: one
calendar version PER distinct MMS calendar (3, including "Actor Unavailable"),
named by the MMS name; each carries prepStart/postEnd/weeklyDaysOff +
nonShootDates; stripboard dates/call times on the active board unchanged;
switching calendar versions shifts section dates (bridge `getRows`); undo
restores exactly. Docs: `docs/IMPORT-EXPORT.md` MSD section.

**Relations**: builds on item 40's `.msd` parser + item 66's CalendarVersion
axis (its "Import touchpoint" line); the app-side days-off pattern language
from item 54.

## 75. ItemCard/ItemRow re-arrange on narrow widths — wrap, don't resize (`[x]` Done)

**Done**: `ItemRow` is a wrap-flexbox (`flex-wrap gap-y-1`, `ITEM_ROW_CLASS`) with an optional `bodyClass` prop (default `flex-1 min-w-0`); the two event modals pass the shared `ITEM_ROW_BODY_WRAP` (`flex-1 min-w-[13rem]`) so below a width threshold the note area stacks onto its own full-width line under the fixed date cell, the trailing X flowing beside it — sizes byte-identical at normal widths. `ItemCard` header also wraps (`flex-wrap gap-x-2 gap-y-1`). Dark `RuleCard` untouched (empty body, flex-1 title). Verified at 768px iPad (single line, unchanged) and 420px (date on line 1, note + ✕ on line 2, no overflow); lint green; layout-only → no e2e (rule 7).

**Requested**: the collapsible category cards (`ItemCard`) and their rows
(`ItemRow`) — the element events manager's day-type sections, the day modal's
event rows, and the dark rule cards — **look odd on iPad / narrow modals**: the
"Add note" area and fixed-width cells get clipped instead of re-arranging. The
user likes the current sizing; the ask is that cards/rows **wrap to a new line
below a width threshold**, keeping every size identical at normal widths.

**Facts**:
- `ItemCard` + `ItemRow` (`src/components/cards/`) are already flex — they just
  never wrap. `ITEM_ROW_CLASS` (`ItemRow.tsx:38`): `flex items-center gap-2`,
  title cell `w-44 shrink-0` (default; `DayEventsModal` overrides `w-56`), body
  `flex-1 min-w-0`, trailing `shrink-0`. The body's `min-w-0` absorbs everything,
  so a row can never overflow → never wraps; the fixed cells (`w-44`/`w-56`, the
  note input `min-w-60` + `[field-sizing:content]`) then get clipped by the
  modal's `overflow-hidden` on narrow surfaces (iPad split view, nested
  `max-w-lg` modals, small windows).
- `ItemCard` header (`ItemCard.tsx:40`): `flex items-center gap-2 px-3 py-2`
  with the toggle (`flex-1 min-w-0`, title `truncate`) + `trailing` — on narrow
  widths the trailing action ("Add Rule") stays on the title line and the title
  just truncates.
- Consumers: `ElementEventsModal.tsx:248` (date rows), `DayEventsModal.tsx:291`
  (element rows), dark `RuleCard` (`RuleCard.tsx:35` — renders as an `ItemRow`,
  but its title is `flex-1 min-w-0` with an EMPTY body, so it already shrinks).
- `ItemCard`/`ItemRow` are NOT in the ui-kit yet; they're promotion candidates
  (the item-56 family) — the wrap-ready layout is the design to ship when they
  move into the kit.

**Design**:
1. **`ItemRow` wrap** (`ItemRow.tsx`): row → `flex flex-wrap items-center
   gap-x-2 gap-y-1`; add an optional `bodyClass` prop on the body wrapper
   (default `flex-1 min-w-0`). The two event modals pass a shared
   `flex-1 min-w-[13rem]` (named const) so below that width the note area drops
   to its own full-width line under the date, the trailing X flowing beside it
   on line 2 ("Tue, Sep 8" on top, note + ✕ underneath). At normal modal widths
   the row is byte-for-byte identical (no wrap). `RuleCard` untouched (empty
   body, flex-1 title — no `bodyClass`).
2. **`ItemCard` header wrap** (`ItemCard.tsx:40`): `flex-wrap gap-y-1` so a
   trailing action wraps below the title on very narrow widths instead of the
   title truncating; sizes unchanged.
3. **Wire up**: `ElementEventsModal.tsx:248` + `DayEventsModal.tsx:291` pass
   `bodyClass`. No other file changes.
4. **ui-kit note**: keep DESIGN-LANGUAGE §Item cards in sync on landing, and
   when `ItemCard`/`ItemRow` move into `@gabriel/ui-kit` (item 56 path), ship
   this wrap-ready layout — same Tailwind classes, wrap baked in.

**Verify**: `npm run lint` + manual visual check at iPad portrait (768×1024)
and ~420px narrow in the element events manager + day events modal — cards and
date rows wrap (note under date), nothing clipped or resized. Layout-only → no
e2e (AGENTS.md rule 7); no spec changes (sizes/behavior identical at normal
widths).

**Relations**: rides items 46/62's `ItemCard`/`ItemRow` extraction; feeds item
56 (kit promotion — ship the wrap-ready layout); complements item 70 (iPad
viewport centring); independent of 69/71 (Modal morph races).

## 76. BUG: iPad project import greys out `.lemon` files — picker must accept the same types as desktop (`[x]` Done)

**Done**: `pickerAccept(desktopAccepts)` helper in `src/lib/device.ts` — on coarse-pointer devices (iPad/iOS) the native Files picker can't resolve unregistered UTTypes (`.lemon`/`.msd`/`.sex`/`.fdx`/`.fountain`), so it greys those files out; the helper returns `*/*` on `IS_COARSE` and the desktop accept string otherwise. Wired into every import file input: `ProjectManager.tsx` + `App.tsx` new-project import (`.lemon,.json,.msd,.sex`), `App.tsx` + `ImportDialog.tsx` append import (`.csv,.fdx,.fountain,.txt`). The handlers already parse by `file.name` extension, so a broader picker can't mis-fire — a wrongly-picked file still hits the Import Error dialog. Desktop filter unchanged.

**Requested**: importing a project on iPad opens the native Files picker, but `.lemon` files are **greyed out / not selectable** — only `.json` files can be picked. Desktop accepts `.lemon` fine. It must accept the same file types as desktop.

**Facts**:
- The import file inputs all carry `accept=".lemon,.json,.msd,.sex"` — `ProjectManager.tsx:381` (Import footer button, both local + cloud tabs) and `App.tsx:708` (`newProjectFileRef`, File → Import → "`.msd, .sex, .lemon, .json`"). Identical on desktop and iPad — so this is not a missing-extension bug in our `accept` string.
- The handlers parse **by file extension**, not by the picker's filter: `App.tsx:438` (`file.name.split('.').pop()` → `parseMsdFile`/`parseSexFile`/JSON), and `ProjectManager.handleImportFile` mirrors it. So broadening the picker filter cannot break parsing — a wrongly-picked file still hits the existing Import Error dialog.
- `.lemon` exports are `application/json` content with a `.lemon` filename (`utils.ts:163-171` — `new Blob([data], { type: 'application/json' })` + `a.download = '${title}.lemon'`).
- **Likely root cause (verify in the worker)**: the iOS/iPadOS Files document picker filters by **UTType**, resolving each `accept` extension to a registered UTI. `.json` → `public.json` (known), so JSON files are selectable; `.lemon` (and `.msd`/`.sex`) are **unregistered UTTypes**, so iOS resolves them to a dynamic/incompatible UTI and greys the files out. `.msd`/`.sex` may be equally greyed — the user only noticed `.lemon` because that's what the app exports.
- Existing iPad e2e infra to reuse: `playwright.ipad.config.ts` (WebKit + `devices['iPad Pro 11']`) and `e2e/ipad-touch-scroll.spec.ts`.

**Design** (narrow fix — picker parity, not parser changes):
- Investigate how iOS resolves each of `.lemon`/`.msd`/`.sex` before choosing the mechanism:
  1. **Add the real MIME types to `accept`** — since `.lemon` content is JSON, adding `application/json` may let iOS match by content type where the extension fails (test whether the picker then un-greys `.lemon` files that Safari exported as `application/json`; note the Files app derives the UTI from the **extension**, so content-typed matching may not hold — fall back to 2 if it doesn't).
  2. **Broaden `accept` on coarse/touch devices** (`IS_COARSE`, `src/lib/device.ts`): drop the extension restriction (`accept="*/*"` or omit) so the Files picker shows everything, and let the existing extension-based parse + error dialog validate. Keeps the desktop filter narrow; iPad sees all files (user decision: "accept the same file types as desktop" — a broader picker with extension validation is the same effective set).
  3. If a MIME/extension combination that iOS honours is found, keep `accept` uniform across platforms instead of the `IS_COARSE` branch (one source of truth).
- Keep the two import entry points (ProjectManager footer Import + App File → Import submenu) consistent — any fix applies to both (`ProjectManager.tsx:381` + `App.tsx:708`).
- Docs: `docs/IMPORT-EXPORT.md` — note the picker-filter/platform behavior (accept lists, extension-based parsing, iOS UTI grey-out).

**Verify**: lint + **webkit iPad** (`playwright.ipad.config.ts`) — a real-ish `.lemon` file can't be auto-picked in headless (native picker is out of reach), so verify via: (a) a probe spec asserting the `accept` attribute on both inputs reflects the chosen mechanism (e.g. `*/*` on iPad / the fixed accept string on desktop); (b) **manual check on a physical iPad**: export a project → reopen Project Manager → Import → the `.lemon` file is selectable, imports, and a non-matching file still shows Import Error; `.json`/`.msd`/`.sex` un-greyed too. Regression: desktop import flows unchanged (`e2e/msd-import.spec.ts`, `sex-import.spec.ts`, seeded-project import).

**Relations**: sibling of the iPad touch/keyboard bugs (items 69–72 — same `playwright.ipad.config.ts` territory); rides the import entry-points from items 40/41; independent of the parse pipeline.

## 77. Dark EntityDropdown panel gets coarse-pointer sizing — inherit the dropdown item scale (`[x]` Done)

**Done**: `DD_ITEM_BASE_DARK_LIB` in `src/lib/dropdown.ts` (`IS_COARSE ? 'px-4 py-3 text-sm' : 'px-3 py-2 text-xs'` — the kit menu's coarse scale, so the dark chip panel matches the rest of the dropdown family), consumed by `DropdownPanel.tsx:50`'s dark branch. The dark chip trigger also scales (`DD_CHIP_TRIGGER_CLASS` gains an `IS_COARSE` padding bump) — same shared const, one line. Light panel + kit menu untouched.

**Requested**: on mobile (coarse pointer), the **dark entity-dropdown panel** (`EntityDropdown variant="chip"` inside dark modals — Link Manager pickers, day-status/event-type menus, rule-editor cast pickers) should be **resized like the other dropdowns** so the rows are easier to tap. It should inherit the same properties the rest of the dropdown family already has.

**Facts**:
- Every other dropdown already scales on coarse pointers via `IS_COARSE` (`src/lib/device.ts` → kit):
  - Kit `DropdownMenu` items: `ITEM_PAD = IS_COARSE ? 'px-4 py-3 text-sm' : 'px-3 py-2 text-xs'` (`ui-kit/src/DropdownMenu.tsx:20`).
  - The **light** app panel: `DD_ITEM_BASE_LIB = IS_COARSE ? 'px-3 py-2 text-sm' : 'px-2 py-1 text-xs'` (`src/lib/dropdown.ts:25`) — light `DropdownPanel` rows already grow on touch.
- The **dark** app panel does NOT: `DropdownPanel.tsx:50` hardcodes its item base for the dark theme — `'flex items-center gap-2 px-3 py-2 text-xs …'` — with **no `IS_COARSE` branch**, so on iPad the Link Manager / day-modal chip picker rows stay at desktop `text-xs` tap size. The `itemCls` dark branches (`:59-62`) only swap colors, never the pad/text scale.
- The dark chip **trigger** (`DD_CHIP_TRIGGER_CLASS`, `dropdown.ts:14`) is also fixed-size (`px-2.5 py-1.5`); consumers add `text-xs` — no coarse branch either (smaller target to tap open). The user's ask is the panel first; the trigger is a natural same-item candidate.
- This is the same pattern as item 69/70's touch-sizing work but a different surface — the dark panel is app-side `DropdownPanel`, not the kit menu, so the kit bump work doesn't cover it.

**Design** (one source of truth — rule 1/4):
- Give the dark item base the same coarse scale as the light one: extract the coarse-aware item padding into the shared `src/lib/dropdown.ts` (e.g. extend `DD_ITEM_BASE_LIB` usage or add a `DD_ITEM_BASE_DARK_LIB = IS_COARSE ? 'px-3 py-2 text-sm' : 'px-2 py-1 text-xs'` — same numbers as the light base so both themes scale identically) and consume it in `DropdownPanel.tsx:50`'s dark branch. Decide the exact coarse numbers with the kit menu (`px-4 py-3 text-sm`) in view — the ask is "like the dropdowns", so match the kit item scale for consistency, or keep the light panel's `px-3 py-2` if uniform-with-light wins; pick ONE number set and note it.
- Optionally (same commit, small): scale the dark chip trigger too (`DD_CHIP_TRIGGER_CLASS` — a coarse branch, and/or the caller-added `text-xs`), since a tiny trigger + big panel is still a hard tap. If it adds churn across call sites, keep it panel-only and note the trigger as the follow-up.
- Docs: DESIGN-LANGUAGE primitive matrix / EntityDropdown chip-row note — "dark panel rows scale with `IS_COARSE` like the kit menu and light panel."

**Verify**: lint + visual check on iPad (coarse) and desktop — open the Link Manager / a day-modal status picker on a coarse device: dark panel rows render at the coarse size (assert padding/text via the bridge or a probe `IS_COARSE` flag); desktop unchanged (`text-xs`, byte-for-byte); light panel + kit menu scaling untouched. Layout-only → no e2e (AGENTS.md rule 7) unless a probe spec is cheap.

**Relations**: closes the same gap as item 69/70's coarse sizing but app-side (`DropdownPanel`, not the kit); rides `dropdown.ts` (the shared class source); item 50's chip exploration is a different surface (committed-value chips, not sizing).

## 78. BUG: kit menu stays open when dragging the modal on iPad — touch dismissal must not defer to `click` (`[x]` Done)

**Done** (kit v0.1.65, commit `fdf29ee`): `DropdownMenu` gained a document-**capture** `pointerdown` listener (popout-aware via `useCurrentDocument`) that dismisses on a **touch** pointerdown outside the menu content (`contentElRef` + `closest('[data-radix-menu-content]')` — root AND open submenus) and outside the trigger (Radix owns the trigger toggle) — the app `DropdownPanel`'s model (item 64). Gated on `pointerType === 'touch'` so mouse/pen keep Radix's immediate pointerdown dismissal (a non-gated listener would double-dismiss). Dismissing flips the controlled `open` (same call `registerOverlayClose` makes); the close-morph/`persisted` machinery + `handleOpenChange` guard swallow the duplicate Radix dismissal. Playground: `ipad` (WebKit + hasTouch) project added to `playground/playwright.config.ts`, new `modal-drag-dismiss.spec.ts` (touch-drag closes, menu-item tap doesn't) + `helpers.ts` `waitForOverlaySettle` (the app's poll-for-morph-settle helper). App: `e2e/ipad-modal-drag-menu.spec.ts` (under `playwright.ipad.config.ts`) drives the seeded day modal's Day Status + Add Events menus — touch-drag on the modal header closes them, modal stays interactive. Smart-test RULES: `IPAD` bucket gained `ipad-modal-drag-menu`.

**Requested**: on iPad, inside a modal with an **entity dropdown** open, dragging the modal closes the dropdown (correct). With any **kit menu** open (category selection, day-status/event-type pickers, ItemManagerDropdown…) the menu does NOT close (wrong). On Mac (mouse) it works.

**Root cause — Radix defers touch outside-dismissal to `click`, and a drag has no `click`**:
- The app's `DropdownPanel` closes on any document-level `pointerdown` outside wrapper+panel (`useDropdown`, `src/lib/dropdown.ts:46-65`) → a touch `pointerdown` on the modal header to start the drag closes it. ✓
- The kit `DropdownMenu` relies on Radix's `DismissableLayer` → `usePointerDownOutside` (`@radix-ui/react-dismissable-layer`): for `event.pointerType === "touch"` it does NOT dismiss on `pointerdown` — it registers a one-time document `click` listener and dismisses only if that `click` fires (`node_modules/.../dismissable-layer/dist/index.js:194-200`). This is deliberate: a touch that becomes a scroll shouldn't dismiss the menu. But a **modal drag** is `pointerdown` + `pointermove` + `pointerup` with **no `click`** (the modal's `onPointerMove` calls `preventDefault`, and the browser suppresses click after a drag) → the deferred dismissal never fires → the menu stays open. Mouse/pen (`pointerType !== 'touch'`) dismiss immediately on `pointerdown`, which is why Mac works.
- This is a kit gap (item 64's "kit menus share the panel's model" — the panel closes on any outside pointerdown; the kit menu must too, for touch).

**Design** (kit-side, one `@gabriel/ui-kit` bump; app gets the version bump + docs only):
- In `ui-kit/src/DropdownMenu.tsx`, while `open`, register a document-**capture** `pointerdown` listener (popout-aware via `useCurrentDocument`, same as `useMenuKeyLock`) that dismisses when the touch `pointerdown` lands outside the menu:
  - Gate on `e.pointerType === 'touch'` only — mouse/pen already dismiss immediately via Radix (a non-gated listener would double-dismiss with Radix's own pointerdown handling and could fight the trigger toggle).
  - Skip when the target is inside the **trigger** (`triggerRef`) — Radix's toggle-dismiss owns that path (the `closeFromTriggerPointerDownRef` dance must not be bypassed).
  - Skip when the target is inside **any open menu content** (root `contentElRef` or an open submenu) — check `target.closest('[data-radix-menu-content]')` (both Radix `Content` and `SubContent` carry it), so a tap inside a submenu item still selects it.
  - Otherwise `onOpenChange?.(false)` + `onClose?.()` (the same call the `registerOverlayClose` callback makes).
  - The close-morph/`persisted` machinery is untouched: flipping the controlled `open` runs the existing `[open]` effect (collapses submenus) and the morph plays as usual. The `handleOpenChange` guard (`!o && !openRef.current`) already swallows a duplicate Radix dismissal that follows.
- `DropdownSubmenu` needs nothing extra — dismissing the root collapses the whole chain (`setSubChain([])` in the root's `[open]` effect); a submenu's own `usePointerDownOutside` is not the broken path.
- Docs: `docs/UI-KIT.md` note beside the v0.1.52 wheel / v0.1.64 touch entries.

**Verify**: lint + **playground** (kit source, `npx vite playground`): extend `playground/src/main.tsx`'s `MenuInsideModal` demo and add a spec in `playground/specs/` that dispatches a cancelable **touch** `pointerdown` (or a touch drag via WebKit `hasTouch`) on the modal header with a kit menu open and asserts the menu closes (red before — Radix defers to click; green after). Then `npm run test:playground` for the kit; app-side: `npm run lint` + smart suite (the app only bumps the kit — existing dropdown specs like `overlay-morph.spec.ts` / `calendar-rule-cards`/`rules-tab` guard the menu surfaces), plus a manual iPad check (drag the modal with the category picker open → it closes; drag with the entity dropdown open → still closes).

**Relations**: closes item 64's "panel model" gap for touch (the kit menu already shares the panel's highlight + positioning); rides the item 69/70/71 iPad work (same kit, same `playwright.ipad.config.ts` territory); distinct from item 77 (app-side `DropdownPanel` sizing).

## 79. ui-kit Modal — dismiss (cancel) or accept the WHOLE modal stack (`[x]` Done)

**Done (user decision — handled manually in the playground, no kit
`closeStack` primitive)**: the whole-stack dismiss/accept behavior is demoed by
the playground's `DialogSpawnDemo` (`playground/src/main.tsx`) — a dialog
spawning another: **Back** closes the nested dialog and reveals the outer one,
**Cancel** aborts the WHOLE stack (`setNestedOpen(false); setHostOpen(false)`),
**Save** applies the nested action first, then closes both. The stack close is
wired manually through the two `open` states (the kit `Modal` supplies the
FLIP morph + stack fade); no `closeStack`/`useModalStack` kit API and no
`modal-stack-dismiss.spec.ts`. Per the item's capability-only decision, no app
flow is rewired. If a bulk cascade-close affordance is ever wanted in the app
(Link-Manager Cancel, day-modal Done), the kit primitive below is the blueprint.

**Requested**: give the kit `Modal` (and the `Dialog` through it) a first-class
capability so a **child modal or dialog at any depth** can (1) **dismiss
(cancel) the whole stack** — close itself AND every parent beneath it,
discarding in-flight edits, or (2) **accept the whole stack** — the child
applies its own action first, then the whole stack closes (parents just close,
nothing of theirs applied). **Capability only (user decision)**: this item adds
the kit primitive + playground demo/spec; NO existing app flow is rewired —
future agents wire cancel/save buttons to it (e.g. a Link-Manager "Cancel"
that dismisses the whole cascade chain, a day-modal "Done" that closes every
nested editor).

**Facts**:
- Modals portal as SIBLINGS into the window body; `[data-modal-stack]` + DOM
  order = stack order; `stackParents`/`stackChildren` (ui-kit `Modal.tsx:140-156`)
  already locate ancestors/descendants by DOM — the stack graph is known.
- Each Modal owns its `onClose` (caller prop) + dismissal paths (X/Esc/outside/
  overlay touch → `doClose`, Modal.tsx:294-309); stacked children skip the
  self-zoom (the survivor's morph-back is the close effect).
- React context flows ACROSS portals: the child modal is rendered inside the
  parent's children (DayEventsModal → RuleEditorPanel / EventAdderModal, the
  item-62 cards' editors, the item-46 element event managers), so a
  `ModalContext` provided by each Modal is visible to its descendants — the
  natural close-propagation seam.
- The kit's `registerOverlayClose` (overlayRegistry.ts) is ONE-AT-A-TIME —
  a modal STACK needs a stack-ordered registry (or a context chain), not that.
- The app `src/components/Modal.tsx` shim spreads props and `Dialog.tsx` is a
  1:1 re-export → a kit-only addition lands with zero app call-site churn
  (kit bump only, per the item-56 process).

**Design** (kit-side, one `@gabriel/ui-kit` bump; app = version bump + docs):
- New mechanism in `ui-kit/src/Modal.tsx`: a per-window **modal-stack
  registry** (or a `ModalContext` chaining each Modal's `close`/`onClose` to
  its stack parent — pick the one that keeps popout windows independent).
  Every open Modal registers on mount, unregisters on close/unmount; order =
  stack order.
- Exported capability for children: `useModalStack()` (or equivalent) exposing
  at minimum `closeStack()` — called from any child, it closes the whole
  stack above and including the caller (topmost first, so the morph plays
  naturally). Cancel = call `closeStack()` bare; Accept = run the child's own
  commit/dispatch first, THEN `closeStack()` (parents just close).
- **Close animation must be specced, not guessed**: decide how N layers close
  at once — sequential per-layer exit-morphs vs. one coordinated top-morph +
  parents fading — and guard against stranding a survivor mid-morph (the
  item-71 fade-recovery watchdog must still win; verify all-N-layers-gone
  leaves NO frozen modal, one dim → zero).
- The `Dialog` inherits automatically (renders through the kit Modal `flat`
  chrome, item 67); add a `ConfirmOptions`/`PromptOptions` escape hatch only
  if the stack close needs dialog-resolve semantics (likely not — the caller
  resolves the child dialog as today, then calls `closeStack`).
- Playground: extend `StackedModalDemo` (`playground/src/main.tsx:226`) with a
  "Cancel whole stack" button on the DEEPEST modal + a dialog-variant demo;
  new `playground/specs/modal-stack-dismiss.spec.ts`: open 3 layers → click
  the deep cancel → ALL layers gone, exactly one overlay dim then zero, no
  frozen survivor (repeat ~10× for the morph race), popout-window stacks close
  independently.

**Verify**: lint + `npm run test:playground` (kit) for the new spec; app side:
lint + smart suite — no app behavior changes (existing modal/dialog/stack specs
stay green), so the app check is regression-only.

**Relations**: rides items 58/59/67/71 (morph, one-dim backdrop, Dialog-through-
Modal, survivor-fade watchdog — the new close animation must compose with all);
precedent from item 64's `registerOverlayClose` registry; kit-primitive work
parallels item 56.

## 80. ui-kit Modal — iPad keyboard / visual-viewport rework + install into the app (`[x]` Done)

**Done**: the Modal keyboard/visual-viewport rework landed in the kit (commits
`4bdc477` "modal iPad keyboard handling + dialog close-fade" → `a3ee7be` "touch
modals stay put for the keyboard (no push)…", shipped with v0.1.66 and refined
through v0.1.69) and the app consumes it — pin at `@gabriel/ui-kit#v0.1.69`.
`src/Modal.tsx` carries the full spec: coarse devices stay CSS-centred (no JS
pin through the lifecycle), keyboard detection via `visualViewport`/layout
shrink with the `kbActiveRef` latch (no re-centre during dismissal),
rAF-coalesced `visualViewport` resize/scroll handling, no `maxHeight` clamp
while the keyboard is up, `MAX_EDGE` 16→8. Manual iPad check: modal with a text
field stays centred / header reachable on focus, no "pushed down" jump on blur.

What landed — `src/Modal.tsx` — the keyboard/visual-viewport rework:
  - **Coarse-pointer devices keep the modal CSS-centred** (`left-1/2 top-1/2
    -translate-*` — no explicit `dragPos` pin) through the whole lifecycle; the
    browser keeps it dead-centre across any viewport/keyboard resize and nothing
    can snap it. Drag still works (the first drag pins the position). The
    height-FLIP re-centring effect and the entire JS keyboard/reposition effect
    are skipped on `IS_COARSE`.
  - **Keyboard detection** (desktop too): a keyboard transition = the visual
    viewport shrank below the layout height, OR the layout viewport shrank
    height-only (iPad's classic keyboard resize — `innerHeight` drops,
    `innerWidth` unchanged). `kbActiveRef` **latches** true and only clears after
    a ~600ms settle timer, so the ResizeObserver's per-frame deliveries during a
    keyboard dismissal never re-centre the modal ("pushed down after the keyboard
    closes").
  - **rAF-coalesced** `visualViewport` resize/scroll handling: keyboard up → move
    only when the keyboard actually covers the modal (or a Safari pan pushed the
    top off-screen); dismissing → freeze in place; gone + settled → re-centre
    un-dragged modals / re-clamp dragged ones.
  - **`maxHeight` clamp dropped while the keyboard is up** — the modal keeps its
    natural size and the covered bottom sits under the keyboard (body scrolls)
    instead of being squished to the visual viewport.
  - `MAX_EDGE` 32 → 16.
  - The three `IS_COARSE` short-circuits are marked **TEMPORARY** in code — if the
    CSS-centring approach proves out on a physical iPad, promote it (remove the
    TEMPORARY comments; document as the coarse recipe in DESIGN-LANGUAGE §Modal
    anatomy).
- `playground/src/main.tsx` — `KeyboardModalDemo` (iPad virtual-keyboard repro:
  live readout of `innerHeight` vs `visualViewport.height/offsetTop` + focused
  flag, input + textarea to raise the keyboard) + a `dnwa-reset` button.
- `playground/specs/dialog.spec.ts` — DNWA reset test (reset while suppressed
  re-opens; suppressed state is labelled; reset clears suppression).
- `package.json` — `dev` script (`vite playground --host`).

**Install steps (kit → app, one commit each side)**:
1. **Kit**: `npm run build` (js + types + css, `dist/` is committed) → commit the
   rework + playground + rebuilt `dist/` → bump `package.json` `version` → e.g.
   **v0.1.66** → tag `v0.1.66` + push.
2. **App**: `package.json` pin `@gabriel/ui-kit` → `#v0.1.66`, add the new commit
   hash to `allowScripts` (the app's `prepare` is blocked; the kit ships a
   committed `dist/`), `npm install`, then `rm -rf node_modules/.vite-*` + restart
   the dev server (stale pre-bundled deps — the standard kit-bump pitfall).
3. **Verify**: `npm run lint` + `npx playwright test` — iPad: `playwright.ipad.config.ts`
   (`e2e/ipad-touch-scroll.spec.ts` — modal centring in a mocked keyboard
   viewport; `e2e/ipad-modal-drag-menu.spec.ts` regression); desktop: modal/dialog
   stacked + drag flows (`overlay-morph.spec.ts`, day-modal/element-events specs)
   — desktop behavior must be byte-identical (the JS re-centring is still active
   there). Kit-side: `npm run test:playground` (dialog DNWA reset spec + modal
   specs). **Manual iPad check** (user decision, the real test): open a modal with
   a text field → focus it → the modal stays centred / the header reachable; blur
   → no "pushed down" jump; repeat in a stacked modal.
4. **Docs in the same commit**: DESIGN-LANGUAGE §Modal anatomy (keyboard-aware
   centring + the coarse CSS-centring recipe once promoted), `docs/UI-KIT.md`
   note beside the v0.1.64 visual-viewport entry.

**Relations**: follow-up/hardening of item 70 (v0.1.64's visual-viewport centring
— this replaces its JS re-centring on coarse pointers and fixes the keyboard-jump
it introduced); rides items 67/71 (Modal flat chrome, stack morph + fade-recovery
watchdog must compose with the new keyboard logic); lands via the item-56 kit-bump
process.

## 81. Reports designer × day types — day-type collections + per-type columns (`[x]` Done)

**Done**: day types plug into the reports designer lego-style (docs: `docs/REPORTS-DESIGNER.md` §What already exists). New base collection **`dayTypes`** (the Day Type Breakdown rollup — `ReportDayTypeInfo {key,label,color,code,dayCount,days}` precomputed in `buildReportCtx`; `work` = total shooting days, others count status + card days; `SKIP_EMPTY_TEST`/`LABEL` "Skip types with no days"; Lego scoping case filters by the type's dates). New contextual child **`dayTypesOfElement`** (under element/cast repeats — derived from `ReportElementInfo.typeDayLists`, the `isElementMarked` events scan over the calendar version, so non-production/statused days ARE included — unlike deriveDood's production-only cells). Per-day fields **`dayCode`** (DOOD cell letter, work-wins) + **`dayTypeEvents`** (every type on a multi-type day). Per-type element columns **`total{Type}Days`/`{Type}DayList`** (group "Day Types", scope elements) generated for custom attachable types **in use** (gate — re-marking a day re-adds them); day-list variants carry a new `dayList` marker so the toolbar day-format dropdown applies (blockControls checks the marker, not the static set). `formatDayList` renders `day<=0` (statused) entries as bare dates. Verified by `e2e/report-day-types.spec.ts` (rollup Work/Rehearsal rows, skip-empty, per-element child repeat, per-type columns, work-wins dayCode, multi-type dayTypeEvents, days-table invariant) — full suite green. Notes vs the plan: the per-day code field is keyed `dayCode` (not `dayTypeCode`, which belongs to the rollup item); the columns read the events model, not deriveDood's `typeDayLists` (the DOOD engine's cells cover production sections only — statused days would undercount).

**Requested**: the Calendar's day-event types and manager (the user can create
MANY custom day types) should plug into the reports designer "like legos" —
per-type reports (Rehearsal/Travel days, per element, per day) built from
existing designer pieces — **without bloating the designer** (no dead field per
type; the insert-attribute picker stays tidy via submenus).

**Investigation (facts)**:
- **Day-types model** (canonical in AGENTS.md §Day Types & Non-Shoot Status):
  `project.dayTypes: DayTypeDef[]` — a dynamic registry (4 locked built-ins
  `work/hold/travel/holiday` + N customs, each label/color/icon/attachable/
  markable). A day = `status` + event cards (`NonShootDate.lists[statusKey][category]`),
  so days are **multi-type** ("events count everywhere"). Helpers: `getDayTypes`/
  `dayTypeForDate`/`codeForType`/`visualForType` (`lib/dayTypes.ts`),
  `getStatusesWithLists`/`getTypeListGroups` (`lib/nonShootHelpers.ts`), the DOOD
  engine `deriveDood` (`lib/nonShootStats.ts`).
- **Existing treatment in reports** (this item surfaces engines, never re-derives):
  - Per day: `dayType` field (`reportFields.ts:152`) → `dayTypeLabelForDate` — ONE
    label (collapses multi-type days to status-or-first-card).
  - Per element: `computeElementStats` (`reportData.ts:619`) already builds
    `typeCodes` (DOOD letters) and calls `deriveDood` — but only surfaces the
    built-in `totalWorkDays/Hold/Travel` + `workDayList/holdDayList/travelDayList`.
    **`DoodTotals.typeDayLists: Record<statusKey, iso[]>` (the custom-type dates)
    is computed and DROPPED at the reports boundary** — the core gap. Same
    vocabulary as the Day Types tab / Element Manager columns
    (`computeElementDayStats.statusCounts`) and the DOOD print.
- **The designer's lego mechanism for dynamic-N registries = collections**
  (`categories`/`locationTypes`/`violationTypes` — one palette entry, items
  resolved at render, `SKIP_EMPTY_*` registry, `scopedToParent` Lego
  intersection, typed-parent children). The field registry is per-attribute code —
  a field per type with no usage gate is the bloat trap.

**Design** (user decisions: per-type element columns ARE wanted; Work row in the
rollup = total shooting days; submenus/sub-sub-menus organize the picker):

1. **Base collection `dayTypes`** — the "Day Type Breakdown" rollup (mirrors
   `categories`): new `ReportDayTypeInfo {key,label,color,code,dayCount}` in the
   `ReportCollectionItem` union (`reportData.ts:646`); a `resolveCollection`
   branch over `getDayTypes(ctx.project)`; `dayCount` = days where the type is
   the day's **status OR has a card** (`status === key` or `getStatusesWithLists`
   — the DOOD counting rule, status + cards both count), **except `work` =
   `ctx.dayInfos.length` (total shooting days — DOOD parity; Work is the default
   state, never stored as a status)**. Precompute once in `buildReportCtx` (the
   per-pillar rule, like `categoryInfos`). Register `SKIP_EMPTY_TEST.dayTypes`
   (`dayCount > 0`, default ON → the automatic "Filters" checkbox + empty hint).
   Fields (scope `dayTypes`): `dayTypeLabel`, `dayTypeCode` (DOOD letter via
   `codeForType`), `dayTypeColor`, `dayTypeDayCount`, `dayTypeDays` (date list →
   register in `DAY_LIST_FIELD_KEYS` for the toolbar day-format dropdown). One
   table/repeat prints every custom type's totals with zero per-type code.
2. **Contextual child collection `dayTypesOfElement`** (like `daysOfCast`/
   `scenesOfElement`) — inside an element/cast repeat: the day types that element
   has days in. Data already exists: extend `ReportElementInfo` to carry
   `deriveDood`'s `typeDayLists` (via the existing `toDayEntries` transform).
   Fields: `dayTypeLabel`, `dayTypeDayCount`, `dayTypeDayList` (per-element dates,
   `formatDayList` + `aux.dayFormat`; `DAY_LIST_FIELD_KEYS`). **Lego scoping note**:
   it derives straight from the parent element's `typeDayLists`, so it's inherently
   parent-scoped — the ancestor intersection already runs through the parent (the
   `elements` case in `resolveCollectionItems` filters elements by scene sets
   first). Likely needs NO explicit scoping case — verify, don't assume. Offered
   under element/cast parents only (`contextualCollectionsFor`).
3. **Per-day fields (scope `days` — fixed count, no bloat)**: keep `dayType`
   (back-compat). Add `dayTypeCode` (the day's DOOD cell letter — follow
   `deriveDood` cell precedence: status letter → `W`/`SW`/`WF` (work wins on a
   shooting day) → card letter; NOT `dayTypeForDate`) and multi-value
   `dayTypeEvents` (ALL types on the day — status + `getStatusesWithLists`, in
   manager order) so multi-type days print fully.
4. **Per-type element columns (the direct path)**: dynamically generate
   `total{Type}Days` + `{Type}DayList` fields in `getReportFieldDefs`
   (mirroring `buildCategorySceneFields`' dynamic category fields) — one pair
   per **custom** type (built-ins hold/travel already covered by the existing
   trio; skip keys that collide with the full registry + category keys — dedupe,
   don't assume slug uniqueness). Values from `computeElementStats`'
   `typeDayLists` (status + cards, work-wins cell rule intact). **Gate to types
   actually in use** (≥1 statused/carded day) so defined-but-unused types never
   appear (re-marking a day auto-re-adds the field — the "without bloating" ask).
   **Picker organization**: `group: 'Day Types'` on every generated field → they
   land under ONE "Day Types" submenu automatically (`FieldPicker` buckets by
   `f.group`, `FieldPicker.tsx:43-48,131`; the palette + token autocomplete +
   context menu share `fieldsForScope` and group the same way). If the group
   would exceed ~8-10 rows, add an optional second-level bucket — `ReportFieldDef
   .submenu?: string` (per-type) rendered as nested `DropdownSubmenu`s (the kit
   submenus nest — Radix recursive) inside the "Day Types" submenu; update
   `FieldPicker`/`ReportPalette`/`RichTextEditor` autocomplete together; the
   palette search stays flat (`searchReportFields` already searches every field).
   Don't build the nesting speculatively (AGENTS.md rule 3) — flat "Day Types"
   until the threshold.

**Repeaters & compositions** (all through the existing repeat/table machinery —
`resolveCollectionItems` is the single resolution path, so canvas/preview/print
agree with zero per-view code):

| Repeat composition | What it prints |
|---|---|
| Top-level `repeat(dayTypes)` | Day Type Breakdown — one item per type: "Rehearsal — 6 days", Travel — 2, Work — 40 |
| `days` repeat + `dayTypeCode`/`dayTypeEvents` fields | Per-day column: DOOD letter + every type on a multi-type day |
| `elements` → `dayTypesOfElement` (child) | Per element: "FISHERMAN — Rehearsal 3 days (Jan 4, 5, 9)"; nested in a `days` repeat, the Lego intersection scopes it to that day's scenes |
| `categories` → `elementsOfCategory` → `dayTypesOfElement` | Per category × element × type |
| `elements`/`cast` table + per-type columns | `totalRehearsalDays` / `Rehearsal Day List` columns next to Work/Hold/Travel Days |

The base `dayTypes` collection nested under a scoping ancestor (e.g. inside a
cast repeat) DOES need a scoping case in `resolveCollectionItems` (filter to
types whose days intersect the ancestor scenes) — same shape as the `days`/
`categories` cases.

**New-collection wiring checklist** (REPORTS-DESIGNER §Extending +
`docs/REPORTS-LEGO-CONTEXT.md`): `ReportCollection` union (`types.ts:390`);
`resolveCollection` branches + `SKIP_EMPTY_*` (`reportData.ts`); `COLLECTION_ORDER`/
`validCollections`/`contextualCollectionsFor`/`parentCollectionOf`/
`scopedCollectionLabel`/`defaultIdentityField` (`reportBlocks.ts`); field groups +
`FIELD_GROUP_COLORS` entry for `'Day Types'` (`reportFields.ts`); table pickers
derive `tableItemCollection`/`tableFieldScope` automatically via
`contextualCollectionsFor`.

**Verify**: lint + playwright — seeded project + a custom attachable type
("Rehearsal") with cast/element cards: `dayTypes` table lists in-use types
(skip-empty) with correct dayCount (status + cards; Work row = total shoot
days); `dayTypesOfElement` scopes per element inside a Lego chain (a `days`
ancestor intersection applies); day table renders `dayTypeCode` (work-wins on a
shooting day carrying a travel card) + `dayTypeEvents` (multi-type); the per-type
columns appear only for used types, print the right days, and sit under the one
"Day Types" submenu (sub-sub-menus when over threshold); day-format dropdown
applies to the new day-list fields; built-in trio + `dayType` unchanged;
canvas/preview/print agree. New spec `e2e/report-day-types.spec.ts` + RULES entry
(extend the REPORT bucket list in `scripts/smart-test.mjs`; `src/lib/report*.ts`
→ REPORT already covers the code).

**Relations**: rides item 39's day-types registry + items 45/46's events model
(AGENTS.md §Day Types & Non-Shoot Status); the collection pattern from the
`categories`/`locationTypes`/`violationTypes` designer work (LEGO context doc);
submenus ride item 64's kit menu model (nested `DropdownSubmenu`s);
`ReportPalette`/`RichTextEditor` picker-group updates parallel item 61's
kit-base conversions.

## 82. Project Manager boot screen — minimal backdrop + app lockup + version (`[x]` Done)

**Done**: when no project is open, App renders `ProjectManagerBoot`
(`src/components/ProjectManagerBoot.tsx`) instead of a bare `<ProjectManager />`:
the modal floats on a **flat `bg-zinc-950`** backdrop with a soft lightening ONLY
at the bottom edge (a `h-56 bg-gradient-to-t from-zinc-900/70 to-transparent`
band), and the bottom-right shows a whisper lockup — `LEMON
SCHEDULE` (`text-[10px] uppercase tracking-[0.2em] text-zinc-600`) + `v{version}`
(`text-zinc-700`). The item-59 one-dim is zeroed only on this screen (`.pm-boot
.ui-modal-overlay { background: transparent }` in `index.css`, body class toggled
by the component) so the backdrop reads crisp. **iPad-safe**: the wrapper is
`fixed inset-0` (not `h-screen`), and the lockup clears the home indicator via
`env(safe-area-inset-bottom/right)` — verified on emulated iPad Pro 11 (webkit
834×1194): modal centred/on-screen, lockup visible, no overlap. **Version is build-time injected**:
`vite.config.ts` reads `package.json`'s `version` and `define`s `__APP_VERSION__`
(declared in `vite-env.d.ts`; `tsconfig.json` gained `resolveJsonModule`), exposed
via `src/lib/appVersion.ts`. Standard bump flow (what people do generally): semver
in `package.json` + `npm version patch|minor|major` at release time (auto-tags the
commit); the lockup updates on the next dev-server restart / build. The ProjectManager modal itself is untouched (same dark
chrome, morph, one-hero footer). **Minimal by decision**: no color, no centered
glow, no motifs, no animation — DESIGN-LANGUAGE §Boot screen documents the recipe
+ anti-pattern. (The first pass used a full-screen vertical gradient + a centered
radial glow; the user reverted to flat with bottom-only lightening.)
Verified visually (desktop boot screen + lockup + dim-zero via the bridge); lint
clean. Rule 7: visual-only change — no e2e.

**Requested**: the no-project Project Manager sat on flat black-gray. Make the
background more interesting while keeping the design language, with the app name +
version bottom-right. User decisions: minimal/subtle (no color, no film motif) and
build-time version from package.json.

**Relations**: one-screen exception to item 59's one-dim rule (the `.pm-boot` dim-zero);
rides the item-56 kit-bump process territory (the version define is app-side only).

## 83. Tabs, mini tabs, File-menu trigger + item-version triggers → kit `Button` (`[x]` Done)

**Done** (kit v0.1.70): the kit `Button` gained `variant="tab"` (PageToolbar mini-tab recipe — solid dark/cloud active pill, per-theme inactive hover, baked `px-3 py-1.5 text-xs` + coarse bump) and `variant="tab-header"` (AppHeader top-tab recipe — inverted white pill on the dark header, cloud variants; `active` fills the selected pill instead of the blue toggle tint). AppHeader top tabs + PageToolbar sub-tabs consume them (shift/right-click pop-out, touch drag-scroll, scroll masks all preserved). The Report Designer "Editing:" trigger + the reports text-style picker trigger became kit `Button`s (dark). **The File menu trigger was reverted to its original bespoke styling + `font-semibold` (user decision — preferred the pre-swap look).**

**Requested**: make the tabs and mini tabs use the ui-kit **`Button`** — "same as
the File menu" — and make the File menu's dropdown trigger a kit `Button` too,
plus the buttons that open the item-version pickers (`ItemManagerDropdown`
triggers).

**Facts** (current state — what's bespoke vs what already uses the kit):
- The kit `Button` (`src/components/Button.tsx` = 1-line re-export of
  `@gabriel/ui-kit` `Button`, `ui-kit/src/Button.tsx`) is the shared toolbar
  button: `subtle`/`primary`/`danger-ghost`, `theme` light/dark, `cloud` prop
  (light primary → blue-950), proportional coarse-pointer scaling, open-state
  hover-hold when used as a Radix menu trigger. **Icon-only nav + status pills
  stay bespoke** (AGENTS.md §UI Primitives / DESIGN-LANGUAGE §Primitive matrix
  "Toolbar / action button" row).
- **File menu trigger — bespoke**: `AppHeader.tsx:94-101` renders the File menu's
  trigger as a hand-rolled `<button>` (`flex items-center space-x-1.5 … px-3
  py-1.5 … text-zinc-400 hover:text-white hover:bg-zinc-800`, blue cloud
  variant) instead of the kit `Button`. It already sits inside the kit
  `DropdownMenu` (morph, single-highlight, panel positioning — items 58/64), so
  only the trigger element swaps.
- **Top tabs — bespoke**: `AppHeader.tsx:192-199` — the Breakdown/Schedule/…
  tab buttons are hand-rolled `<button>`s. Active pill recipe
  (`AppHeader.tsx:79-80`): `bg-white text-zinc-900` on the dark zinc/blue
  header; inactive `text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800`
  (cloud: `bg-white text-blue-950` / `text-white/70 hover:bg-blue-900/60`).
- **Mini tabs (`PageToolbar` sub-tabs) — bespoke**: `PageToolbar.tsx:134-153` —
  the sub-tab buttons (Sheet/Element Manager, Calendar/Day Breakdown, Ribbon
  Designer/Colors, DOODs/Element Breakdown, Report Designer) are hand-rolled.
  Recipe (`PageToolbar.tsx:24-48`): active `bg-zinc-950 text-white rounded px-3
  py-1.5` (light, cloud `bg-blue-950 text-blue-50`); inactive
  `text-zinc-500 hover:text-zinc-900` (dark theme: `hover:text-zinc-300`).
- **Item-version triggers — mixed**: the Schedule-version (`ScheduleToolbar.tsx:134-139`),
  Calendar-version (`CalendarTab.tsx:944-950`) and Ribbon-design
  (`RibbonTab.tsx:619-624`) pickers ALREADY use `<Button>` (the ribbon-designer
  recipe: muted label span + `text-zinc-900`/`text-zinc-200` value span + muted
  chevron — DESIGN-LANGUAGE §Primitive matrix "Version picker" row). Two
  `ItemManagerDropdown` triggers are still bespoke: the Report Designer's
  "Editing:" trigger (`ReportDesigner.tsx:702-707`, a plain `<span>` with
  hover classes) and the reports text-style picker (`blockControls.tsx:419-424`,
  a hand-rolled `<button>` with its own `w-32 … bg-zinc-800 border border-zinc-700`
  classes).

**Design wrinkle — the active-tab look vs the kit `active` prop** (decide in the
worker, don't guess):
- The kit `Button` `active` prop is a **blue tint** (`bg-blue-900/50! text-white!`
  dark / `bg-blue-50! text-blue-700!` light) — NOT the app's tab active pill
  (`bg-zinc-950` light / `bg-white` dark header / `bg-blue-950` cloud). A tab
  swap onto the bare kit `active` would silently change the tab look.
- The kit `Button` bakes its padding via inline `style` from `useCoarseSize`
  (`ui-kit/src/Button.tsx:47,83`) — `px-2.5 py-1` desktop subtle — so passing
  `px-3 py-1.5` in `className` will NOT take (inline style wins). Recommended:
  give the kit `Button` a **`variant="tab"`** (or a `tab` boolean) that ships
  the exact tab recipe (`px-3 py-1.5 text-xs font-semibold` + the active
  fill/inactive-hover per theme + cloud) as its own baked size/look — one kit
  bump, one source of truth, both AppHeader top tabs AND PageToolbar mini tabs
  consume it. Fallback if the worker prefers no kit change: accept the kit
  `active` blue tint as the new tab look (a deliberate visual change) — flag it
  in DESIGN-LANGUAGE, don't hand-hack padding overrides.
- Tabs keep their bespoke chrome after the swap: AppHeader's right-click →
  pop-out context menu + shift-click pop-out (gated `!IS_COARSE`),
  PageToolbar's shift-click/context-menu pop-out, the touch drag-scroll/tap
  replay capture logic (`PageToolbar.tsx:79-119`), and the scroll masks — all
  behavior must survive; only the `<button>` element/classes swap to the kit.
- The File-menu trigger swaps to `<Button theme="dark">` (or `theme="blue"` for
  cloud — check what the kit `blue` theme provides for a button; the header is
  `bg-blue-950` when cloud) with the existing "File" + `ChevronDown` children.
  The kit `Button` already keeps its hover look while the menu is open
  (`data-state="open"` → `open` class), so the trigger gets the pressed feel
  for free.

**Scope**:
1. AppHeader File menu trigger → kit `Button`.
2. AppHeader top tabs → kit `Button` (the `variant="tab"` recipe).
3. PageToolbar mini tabs → kit `Button` (same recipe, light + dark themes,
   cloud coloring).
4. `ReportDesigner.tsx` "Editing:" trigger → kit `Button` (ribbon-designer
   recipe, dark theme).
5. `blockControls.tsx` text-style picker trigger → kit `Button` (dark; keep the
   `w-32` width via `className` — a width utility is fine, it doesn't fight the
   inline padding).
6. Docs in the same commit: DESIGN-LANGUAGE §Primitive matrix ("Toolbar / action
   button" + "Version picker" rows + a new tab row), AGENTS.md UI-primitives
   bullet if the `variant="tab"` lands.

**Verify**: lint + playwright — every swapped surface still opens/selects/
pop-outs: File menu opens from the new trigger and keeps the open-state hover,
top tabs switch + shift-click/right-click pop-out, PageToolbar sub-tabs switch +
pop-out (Schedule View menu, calendar sub-tabs, designer), version pickers open
and rename (Schedule/Calendar/Ribbon already green — regression only), Report
Designer "Editing:" + text-style picker open/rename. Assert the active-tab look
matches the recipe (not the blue `active` tint). Existing specs touching these
surfaces (seeded-smoke, schedule/calendar/design tabs) stay green; add a RULES
entry if a spec maps to `AppHeader.tsx`/`PageToolbar.tsx` (App.tsx → ALL likely
already covers the tab flows).

**Relations**: rides the kit `Button` (item 56's promotion family — the tab
variant is a kit extension, one bump, same pattern as items 58/64/67/80); the
File-menu trigger conversion parallels item 51's kit-`DropdownMenu` recipe
(trigger = current-order label + `ChevronDown`); closes the remaining bespoke
`ItemManagerDropdown` triggers (items 66/68's picker work used `<Button>` only
for the Schedule/Calendar/Ribbon pickers).

## 84. Manager pages — coarse scaling for the grid + category sidebar (`[x]` Done)

**Done**: manager table + sidebar chrome moved to `src/lib/managerTable.ts` — `useManagerTableSizes()` returns interpolated padding/font/icon px via the kit's own `useCoarseSize`/`coarsePx` (`useManagerTableSizes`), so the tables track the coarseScale knob (the kit feeds 50% by default) and the coarse targets match the **Glide** reference (~12.5px text, modest padding — no more oversized cells). Consumed by `managerShell.tsx`, `ElementManager.tsx`, `SidebarNav.tsx`, `DayTypesTab.tsx`. `SidebarNav` (shared by Element/Crew/Location managers + Day Types tab) also gained a **collapse-to-rail button** (ReportsTab pattern) and a **category search box** (ReportPalette pattern, built on the kit `inputCls('sm')` + `data-theme="light"`). **Bonus (user asks)**: the manager Name column now caps at a max width and **wraps to a second line** (auto-sized `textarea[data-manager-name]` with `[field-sizing:content]`), and the Element Manager's Events + Delete actions moved to **separate columns with bigger buttons**. e2e specs updated for the wrapping name cells (`nameCell` helper in `e2e/helpers.ts`). The Link Manager's anchor cards render through the kit **`CardSection`** (one collapsible card per anchor — header shows the anchor + link count, trailing Apply/remove; body = anchor picker + linked rows).

**Requested**: on iPad (coarse pointer), the **manager pages** — Element
Manager, Crew Manager, Location Manager (the sidebar-of-categories + table
managers) — are still desktop-sized: small text, thin rows, tiny tap targets.
Enable **coarse scaling** for **both the grid (the table) and the category
selection on the left (the sidebar)**, sized to **match the Glide breakdown**
(the app's existing coarse reference surface).

**Facts** (current state — no `IS_COARSE` branches in any manager surface):
- **The Glide reference** (`BreakdownTabGlide.tsx` / `glideShell.tsx`): base
  font `SS_FONT_SIZE_DEFAULT` = 11 → **12.5 on coarse** (`useSpreadsheetFontSize(IS_COARSE ? 12.5 : undefined)`); `rowHeight` = `Math.round(34 * fontSize / 11)` (34 → **39**), `headerHeight` = `Math.round(36 * fontSize / 11)` (36 → **41**); row markers `width: IS_COARSE ? 72 : 50`; actions column `width: IS_COARSE ? 48 : 36`. `src/lib/device.ts` `IS_COARSE` is the gate every other coarse surface uses.
- **The grid**:
  - `managerShell.tsx` (`DatabaseManagerView` — Crew/Location): shared
    `cellInputCls` = `'w-full bg-transparent px-2 py-1 text-xs …'` (line 83,
    exported); header cells `px-3 py-2 text-[10px]` (line 459); data cells
    `px-3 py-1` (line 468); row delete `w-3.5 h-3.5` (line 476); footer "Add"
    `px-3 py-2 text-xs` (line 487). No coarse branch anywhere.
  - `ElementManager.tsx`: same pattern — `renderInput` `px-2 py-1 text-xs`
    (line 360), headers `px-3 py-2 text-[10px]` (lines 589-598), data cells
    `px-3 py-1 text-[11px]` (lines 626-631), row icons `w-3.5 h-3.5`
    (lines 619-639), footer "Add" `px-3 py-2 text-xs` (line 651).
- **The category sidebar** (`SidebarNav.tsx`, shared by BOTH ElementManager and
  the managerShell DBs): fixed `w-[188px]` aside (line 27); title
  `text-[10px]` (line 29); rows `px-2 py-1.5 text-xs` (line 41); icons
  `w-3 h-3` (line 49); counts `text-[10px]` (line 57); add button
  `px-2 py-1.5 text-xs` (line 70); row-action icons `w-3 h-3`
  (`managerShell.tsx:336,344`, `ElementManager.tsx:495`). No coarse branch.
- The buffered managers already get kit `Button`s (Save/Revert/Add/Sort) which
  scale on their own via the kit — the gap is the table + sidebar chrome.
- Precedent: the coarse `IS_COARSE` const-branch pattern is everywhere
  (`projectManagerStyles.ts`, `ColorRuleFormParts.tsx`, `HelpModal.tsx`,
  `ColorsTab.tsx`, `dropdown.ts`, kit `Button`/menu items, Glide).

**Design** (narrow — match Glide, one source of truth):
1. **Shared coarse-aware classes** — the table chrome already has a shared
   seam: `managerShell.tsx` exports `cellInputCls`. Extract the full manager
   table kit (input cell, header cell, data cell, row icon, footer-add) into a
   small shared module (e.g. `src/lib/managerTable.ts` — or extend the existing
   `managerShell.tsx` export block) with `IS_COARSE` branches sized to the Glide
   ratio (~11px→12.5px, +~14%): inputs `text-xs px-2 py-1` → `text-sm px-3
   py-2.5` (or `text-[13px]` — final numbers per Glide feel); header
   `text-[10px] px-3 py-2` → `text-xs px-3 py-3`; data cells
   `px-3 py-1 text-[11px]` → `px-3 py-2.5 text-sm`; row icons
   `w-3.5 h-3.5` → `w-4 h-4`; footer add `px-3 py-2 text-xs` → `px-3 py-3
   text-sm`. Consume in BOTH `managerShell.tsx` AND `ElementManager.tsx` (their
   header/cell/icon markup is near-identical — rule 1/4, don't fork).
2. **`SidebarNav` coarse branch** — widen the aside on coarse (`w-[188px]` →
   e.g. `w-56`) and bump rows: `px-2 py-1.5 text-xs` → `px-3 py-3 text-sm`
   (match the touch-size bump the kit menu items use — `px-4 py-3 text-sm` is
   the kit's coarse item scale, DESIGN-LANGUAGE §Item cards / dropdown row);
   icons `w-3 h-3` → `w-4 h-4`; counts `text-[10px]` → `text-xs`; title
   `text-[10px]` → `text-xs`; add button + row-action icons scale the same.
   The `hover-reveal` action affordance and sticky title stay as-is.
3. **Day-type columns / stat cells** (ElementManager) scale with the shared
   classes — the per-type `min-w-14` headers and `text-[11px]` stat cells
   inherit the grid branch (wider headers/rows on coarse, no per-column work).
4. **Docs**: DESIGN-LANGUAGE §Tables (light managers) + the coarse-sizing note
   ("manager grid + sidebar scale like the Glide breakdown"), AGENTS.md
   `managerShell.tsx` note if the shared module moves.

**Verify**: lint + **webkit iPad** (`playwright.ipad.config.ts`) — a probe spec
(or the existing `ipad-touch-scroll`/`ipad-modal-drag-menu` harness) asserting
the coarse classes on a manager table + sidebar row: cell input `text-sm`
padding/tap target, sidebar row height ≥ the desktop row, row/action icons
scaled. Manual iPad check: Element Manager + Crew Manager + Location Manager
read comfortably (rows tappable, sidebar rows tappable, grid text legible),
Glide matches visually. Desktop unchanged (byte-for-byte — branches gate on
`IS_COARSE`); manager specs (element/crew/location) stay green. Layout-only →
no new e2e beyond the probe (AGENTS.md rule 7) unless a cheap probe exists.

**Relations**: same coarse `IS_COARSE` language as the Glide (item 0/Glide's
`useSpreadsheetFontSize`), `projectManagerStyles.ts`, `dropdown.ts` and kit
`Button`/menu scaling (items 56/77); rides `managerShell.tsx`'s exported
`cellInputCls` seam; `SidebarNav` is shared by ElementManager + all
`DatabaseManagerView` DBs — one component, every manager inherits.

## 85. Events-mode Filter menu — remove the "Cast & Elements" toggle (redundant with "All Events") (`[x]` Done)

**Done**: the "Cast & Elements" row is gone from the Events-mode Filter menu (`CalendarTab.tsx`); `attachments` dropped from `EventsFilter`/`DEFAULT_EVENTS_FILTER`/`filterCard` (`src/lib/events.ts` — attachment cards render on `statuses` alone, so "All Events" covers them). Stale persisted prefs carrying `attachments: false` simply stop being read (no migration).

**Requested**: in the Calendar tab's Events-mode **Filter** menu, remove the
**"Cast & Elements"** option — it's the same thing as the "All Events" toggle
(the user's words), a redundant control.

**Facts**:
- The Filter menu (`CalendarTab.tsx:1020-1077`) has three groups: an
  **"Events"** section ("All Events" master toggle + one row per markable day
  type), a **"Cast & Elements"** row (lines 1055-1057, icon `Link2`, toggles
  `eventsFilter.attachments`), and a **"Rules"** section ("All Rule Types" +
  one row per rule type).
- `eventsFilter.attachments` gates attachment cards in `filterCard`
  (`src/lib/events.ts:73`): `!!filter.attachments && (filter.statuses == null
  || filter.statuses.includes(card.status))`. The `EventsFilter` model
  (`events.ts:51-65`) carries `attachments: boolean` (+ `flags`, which has no
  menu row either — separate dead field, out of scope), and the persisted
  prefs type (`CalendarTab.tsx:115,123`, `lemon_schedule_calendar_view`)
  stores it. Its ONLY write site is the menu row itself.
- The user's framing is exact: "All Events" (statuses `null` = everything
  shows) already covers showing the cast/element attachment cards — a separate
  "Cast & Elements" switch reads as the same toggle and just adds confusion.
- No e2e asserts the row directly (`calendar-rule-cards.spec.ts` drives the
  Filter menu but only for the Rules half; `day-types.spec.ts`'s "attachments"
  is the day-types manager, unrelated).

**Design** (remove the dead control, don't hide it):
1. **Delete the menu row** (`CalendarTab.tsx:1054-1057` + its `DropdownDivider`
   + the now-unused `Link2`/`Check` usage if otherwise unused in that block).
2. **Remove the `attachments` field from the model** (`events.ts`): drop it
   from `EventsFilter`, `DEFAULT_EVENTS_FILTER`, and the `filterCard`
   attachment branch (`:73` → just `filter.statuses == null ||
   filter.statuses.includes(card.status)`). Update the prefs type
   (`CalendarTab.tsx:115,123`). **Stale persisted values**: old
   `lemon_schedule_calendar_view` payloads carrying `attachments: false`
   simply stop being read — attachments render again (the user's desired
   behavior; no migration needed, the type just stops destructuring it).
3. **Verify the `flags` field**: it's in `EventsFilter`/`DEFAULT` but has NO
   menu row — leave it (out of scope), or if removing `attachments` makes it
   the only dead field, note it in the commit and leave it for a future
   cleanup (don't bundle unrelated changes into this item).
4. Docs: DESIGN-LANGUAGE §Feedback / Calendar events-mode row if it documents
   the Filter menu contents (check first — likely a one-line note).

**Verify**: lint + playwright — seeded project, Events mode: open the Filter
menu → the "Cast & Elements" row is gone; attachment cards (cast/element) still
render with "All Events" on and still hide when their status row is unchecked;
the Rules section behaves unchanged (`calendar-rule-cards.spec.ts` green — it
opens the Filter menu, so it regression-covers the menu); a persisted prefs
value with `attachments: false` from before the change still shows attachment
cards (probe via the bridge / localStorage). `calendar-events`/`day-types`
related specs green.

**Relations**: rides item 45/46's events filter model (`src/lib/events.ts`,
`EventsFilter` + `filterCard`) — the filter lives in the canonical module, so
removing the field is a model change there, not a UI hack; touches the
`calendar-rule-cards.spec.ts` Filter-menu harness (regression only).

## 86. Name new cast members right after adding them through an element dropdown (`[x]` Done)

**Done**: the element-dropdown "add a brand-new cast id" flow no longer leaves the cast member permanently blank. The three surfaces that create cast by typed ID (stripboard cast cell → `SortableRibbon.updateScene`, Glide breakdown → `commitEdit`, Scene Sheet cast field → `commitField`) all route new items through the shared `addNewElement` (`src/lib/newCastNaming.tsx`): non-cast categories unchanged (name = key), cast creates the member BLANK and **queues it for the naming modal** (`NewCastNamingProvider`, mounted in `App.tsx` above the tabs). The modal lists each new id with a name input + a per-entry **undo** (trash) button (dispatch `DELETE_CAST_MEMBER` — removes the member and strips the id from every scene, a true revert of the accidental add). The name inputs are **all-caps live** (input uppercases as you type); Save `UPDATE_CAST_MEMBER`s the names (one `BATCH` = one undo entry); Cancel/Esc leaves them blank (today's behavior). The provider filters the queue against live `castMembers` so a Cmd+Z'd add never proposes naming a member that no longer exists. CastTab's manager "Add" (blank inline spreadsheet row) is deliberately NOT routed — the user names it in place. `e2e/new-cast-naming.spec.ts` covers modal → name → save, per-entry undo, and cancel-leaves-blank via the Scene Sheet harness.

**Requested**: "when adding new casts through the element dropdown currently their name remains blank. instead I want a modal to open giving the user the ability to give names to the newlyly added cast ids. okay ma" — plus "also add a button to undo per new entry in case it was entered in fault."

**Design**:
1. `src/lib/newCastNaming.tsx` — `NewCastNamingProvider` (uses `useProject()`; queue state + the naming `Modal`), `useQueueCastNaming()` (stable `queue(ids)` callback — safe to call in per-row `SortableRowContent`, never re-renders consumers), and `addNewElement(dispatch, queue, category, item)` — the single cast-creation gate for entity fields.
2. Call sites swap their `ADD_ELEMENT`-with-`name:''` dispatch for `addNewElement` (sorting/filtering of new items stays in place). No store/reducer changes — undo/redo/persistence untouched; the queue is component state only.
3. Per-entry undo = `DELETE_CAST_MEMBER` (no trash — a clean revert); Save batches `UPDATE_CAST_MEMBER`. Modal is a kit `Modal` (dark chrome, one hero Save + ghost Cancel, `Trash2` icon buttons per row, TEST_IDS anchors).

**Verify**: lint + `e2e/new-cast-naming.spec.ts` (green) + full suite (core `src/App.tsx` change escalates via the smart-test `ALL` rule). The Cast manager add flow and the `.lemon`/CSV/FDX import flows must NOT trigger the modal (regression: `cast-single-source`, `element-manager-*`).

**Relations**: rides the cast-by-ID model (AGENTS.md §Cast & Entities); the shared `addNewElement` is the same "second copy" the stripboard/glide/sheet entity fields were writing before (now extracted).

## 87. Scene Sheet Location field — create locations into the Locations DB (`[x]` Done)

**Done**: the Scene Sheet's **Location** cell is now a Set-style `EntityDropdown` (single-value, type-to-create) instead of a free-text autocomplete. Committing a brand-new location creates it in the **Locations Manager DB** under the **"Set"** type (falling back to the first type / `other` if `set` was deleted), so it shows up in the manager — not just a string on the scene. Existing DB locations are offered as pickable items. New locations keep the typed case (`SceneSheet.commitField`, `src/components/SceneSheet.tsx`); the dropdown items resolve the manager's display name via the shared `resolvedLocationName` (`src/lib/locations.ts`, extracted from the manager's private helper). `scene.location` stays single-value.

**Requested**: "in the sheet manager, shouldn't the user be able to create new locations 'entity dropdown style' that attach to the scenes (but only one like set. and they enter in the category 'Set')" — clarified to create into the existing Locations Manager DB.

**Also**: the **location type defaults** are now just **Set · Unit Base · Hospital · Police Station**, in that order (`DEFAULT_LOCATION_TYPES`, `src/lib/locations.ts`). LOAD reorders built-ins to DEFAULT order, drops built-ins no longer shipped (Office/Parking/Catering/Other), keeps custom types, and re-keys any location still on a dropped type to the first default so nothing disappears. `e2e/location-types.spec.ts` updated to seed a non-colliding custom type.

## 88. Glide pages — kit Buttons + fill the container width (`[x]` Done)

**Done**:
- The Crew/Locations glide **Edit / View / Info** dropdown triggers are now the ui-kit `Button` (they were bespoke `<button>`s, which is why they looked different from the Glide Breakdown's) — `src/lib/glideShell.tsx`.
- glide-data-grid sizes itself to its **content** (summed column widths) when `width`/`height` are omitted, so a sparse grid (few columns) shrank instead of extending across the container. New `useGlideFill` (`src/lib/glideFill.ts`) measures the grid wrapper via `ResizeObserver` and feeds explicit `width`/`height` back to the DataEditor in both `GlideGridShell` and `BreakdownTabGlide`.

**Requested**: "are the edit/view/info buttons ui kit? why are they different from the glide breakdown" + "the glide pages, if small should extend to the container width, now the crew glide can get small".

## 89. Crew glide — flat row order, no auto-grouping by role (`[x]` Done)

**Done**: the Crew Glide no longer groups rows by role. A new `Project.crewOrder` (`string[]` of member ids, backfilled on LOAD) is the single flat display order: new members appended at the bottom (typed in the add-row stay put instead of jumping to the first role's group), changing a row's role no longer moves it, and the manual Sort menu rewrites the order. Maintained in the reducer cases (`caseAddCrewPerson`/`caseDeleteCrewPerson`/`caseRestoreCrewPersonFromTrash`/`caseReorderCrewPerson`/`caseSortCrewBy` — `src/store/actions/reports.ts`); `buildCrewRows` (`src/lib/crewGlideConfig.ts`) renders in `crewOrder`. The Locations Glide was already flat (`buildLocationRows` maps `project.locations` directly) — untouched.

**Requested**: "the 'glides' should not auto sort while i type etc, they may only auto sort manually" → "the normal breakdown is fine. but the locations and crew one auto sort based on category or role. not good."

## 90. Crew Manager — official role ordering + department sections (`[x]` Done)

**Done**: the Crew Manager's **Roles** sidebar now follows the official industry hierarchy and is grouped into **department sections**. New `src/lib/crewCatalog.ts` is the canonical catalog: `CREW_DEPARTMENTS` = **Above the Line** (Producer, Line Producer, Director) then below-the-line departments (Production · Camera · Sound · Art · Wardrobe · Makeup & Hair · Grip & Electric · Locations · Stunts & Special Effects · Casting · Post Production), each in standard call-sheet order. `DEFAULT_CREW_ROLES` derives from it; LOAD reorders existing `crewRoles` via `reorderCrewRoles` (built-ins per catalog order, custom roles appended) — the same normalization pattern as day types. The shared `SidebarNav` gains optional `group` headers (rendered between sections, hidden while the sidebar search filters) and `ManagerShellConfig.categoryGroup` (crew maps role key → department via `crewDepartmentOf`; Element/Locations managers unaffected).

**Requested**: "in the crew manager can you sort the crew categories based on official ordering above the line below and maybe add sections for different departments."

## 91. Crew Manager — department picker when adding a custom role + "Other" section (`[x]` Done)

**Done**: adding a **custom role** in the Crew Manager now asks which **section (department)** it belongs to — the "Add Role" modal gained a **Section** dropdown (`LabelModal`/`CategoryFormModal` optional `groupOptions`; departments from `CREW_DEPARTMENT_NAMES`). The chosen department is stored on the role (`CrewRole.department`, `CrewRole` type) and grouped under it in the sidebar; **"Other"** (the default) groups the role under an **"Other" section divider**. The sidebar grouping now uses `crewRoleGroup(role)` (`src/lib/crewCatalog.ts`): built-ins map to their catalog department, custom roles to their stored `department` or `Other`. Manager shell gained `categoryGroupOptions` + `categoryGroup(category)` (was key-only) and threads the picked group into `addCategory`.

**Requested**: "when adding custom rules [roles], can you get a drop down to add them to a specific section? if no section then add an 'other' divider."

## 92. Calendar tab batch — height-refresh fix, contextual Filter menu, kit View menu, events-mode polish (`[x]` Done)

**Done** (single agent pass, calendar tab): the calendar now re-sizes to its
content on every mutation, plus a batch of toolbar/cell cleanups. Verified by
`e2e/calendar-grow.spec.ts` (events mode: adding cards via the real Add-Events
modal grows the day cell + the grid live) + the calendar specs (CAL bucket).

1. **Height refresh bug (both modes) — ROOT CAUSE FIXED**: the month-level
   virtualization (`renderWindow` + `measuredHeights` + `estimateMonthHeight`
   placeholders) was removed — every month block now renders fully at its
   natural height, so the grid's scrollable length always tracks the day cells'
   content and re-lays out on every add/drop/cut (no "swap tabs to rerender").
   The scroll-driven prev/next-month nav now uses a `viewAnchorRef` (the
   currently-visible month, updated on scroll) instead of the render window.
   Dead helpers removed from `calendarUtils.ts` (`estimateMonthHeight`,
   `monthRowCount`, `monthWeekCount`). The ScheduleTab stripboard keeps its own
   day-level virtualization (it uses ResizeObserver-based measurement +
   content-aware spacers — unaffected).
2. **Events view: no boneyard** — `BoneyardSidebar` (and the collapse
   `BoneyardExpandButton`) only render in strips mode.
3. **View menu → ui-kit `DropdownItem`s** — the hand-rolled `<button>` rows are
   gone. **Expand Day Cells no longer shows its icon twice** (was `Maximize2`
   on BOTH sides); now a single icon + a Check/`Minimize2` state glyph, gated to
   strips mode (it has no effect in events mode).
4. **Filter menu is contextual and exists in BOTH modes** — strips mode:
   **Breaks & Notes** + **Conflicts** toggles (moved OUT of the View menu);
   events mode: the existing event-type/rule filters. Same `Filter` button.
5. **Add-event button always at the bottom of every events-mode day cell** (was
   empty-days only), **fills the available cell space** (`flex-grow` — a big
   dashed affordance on light days, natural height under a full stack of cards),
   no weird narrow-viewport text wrapping (`whitespace-nowrap`), coarse bump.
6. **Paint toolbar removed from strips mode** — the Select/H/T/DO/Erase tool row
   was redundant (day statuses are set via the day context menu + the day
   modal). `activeTool`/`handleToggle` and the `DayCell` `activeTool`/`onToggle`
   props are deleted with it.
7. **Events-mode coarse sizing** — `EventCardView` cards + the add button now
   carry the same `IS_COARSE` tap-target bump the strips-mode `SceneCard` has
   (`CARD_SZ` in `EventDayCell.tsx`).

**Requested**: (1) no boneyard in Calendar events view; (2) are the View-menu
items ui-kit, and why does Expand Day Cells show its icon twice; (3) give
strips mode a Filter menu too (Breaks & Notes + Conflicts) and make the Filter
button contextual; (4) the add-event button should always sit at the bottom of
the day cell (and not wrap weirdly on narrow viewports), filling the space;
(5) in both calendar modes the calendar doesn't refresh to be longer when many
strips/cards are added — swap tabs to re-render; (6) remove the paint toolbar
from strips mode (redundant); (7) the events view needs the strips view's
coarse resizing.

**Follow-up (later, user-flagged)**: the **boneyard button** (`BoneyardExpandButton`
/ collapse affordance) should move to the ui-kit `Button` in BOTH the Calendar
tab and the Schedule tab.

**Verify**: lint + `e2e/calendar-grow.spec.ts` (real adder → cards grow the day
cell + grid) + CAL bucket specs (`calendar-view` updated to the kit-menu
addressing; `calendar-rule-cards` Filter-menu flow unchanged; travel-hold /
day-types / production-dates / date-picker-initial). The events-mode add-event
button + contextual Filter are manual/visual (rule 7).
