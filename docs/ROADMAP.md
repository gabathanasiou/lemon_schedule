
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

---

## Session handoff

- Repo branch: `main` (push before ending session).
- Next session: pick items above in order; re-read `docs/REPORTS-DESIGNER.md`
  before touching the designer, `docs/REPORT_PRINTING_AND_PAGE_BREAKS.md`
  before print/pagination work, `docs/IMPORT-EXPORT.md` before import/export
  work.
