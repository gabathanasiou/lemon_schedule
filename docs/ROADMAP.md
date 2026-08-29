
# Roadmap — Future Implementations Checklist

This file is the pending work list: `[ ]` not started, `[~]` in progress.
Only open/in-progress items live here — the live file is read by every
roadmap worker session, so it stays lean.

- **Completed items:** see `docs/ROADMAP-ARCHIVE.md` (index + code/knowledge
  pointers; full narratives in git history).
- **New asks** go through the triage/dedupe gate (AGENTS.md, §Roadmap Work)
  before becoming an item here.

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

**Verify**: re-import the seed script (Town) with a few scenes edited,
added, removed, one split, one renumbered → only diffs apply; unchanged
scenes keep ids; schedule + ribbons intact; new scenes in the boneyard;
removed scenes kept by default; undo restores exactly; filters + expanded
diffs render; lint + playwright. **Out of scope** (follow-ups): Filmustage-
style cross-version schedule/budget impact reports, archived-versions hub —
this item is the import acceptance step only.

## 40. Import legacy Movie Magic Scheduling `.msd` files (`[ ]`)

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

## 60. Print dialogs' dropdowns → ui-kit base (`[ ]`)

**Requested**: the print menus' dropdowns should use the ui-kit dropdowns — so they inherit the animation system (overlay morph) and the mobile sizing.

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

## 63. BUG: Glide entity-dropdown cell swallows the first keystroke after a refresh (`[ ]`)

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

## 66. Calendar versions — independent production dates + events (`[ ]`)

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
