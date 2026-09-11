# Import & Export — Agent Manual

Status: read this before touching any import/export work.

## Mental model (3 bullets)
1. All parsers live in `src/lib/import/` (barrel `index.ts`); every import
   flows through `commitImport()`, which batches all dispatches into ONE undo
   entry.
2. Two families: **append parsers** (CSV / FDX / Fountain → `ImportResult`,
   ImportDialog review stage) and **new-project-only parsers** (MSD / SEX →
   build a COMPLETE `Project` handed to `importProjectFromData` — no append,
   no review stage).
3. Movie Magic Scheduling formats (MSD/SEX) carry the real domain quirks:
   cast Board IDs, page eighths, sheet-order scene numbering, MMS stripboards
   → Lemon versions/sections.

## New-project-only rule (user decision — do not change)

- `.msd` (roadmap 40) and `.sex` (roadmap 41) imports are gated to project
  creation — no append-into-current flow, no ImportDialog review stage.
- `fdx` / `csv` / `fountain` keep the existing append flow.

## MSD — EPSF "Movie Schedule Data" (roadmap 40)

- `parseMsdFile` builds a COMPLETE `Project` via `importProjectFromData`,
  new-project-only.
- Reference parser: `tools/msd_probe.py`; golden: `e2e/fixtures/wonderful-life.expected.json`.
- **Cast ids are sequential integers in MMS roster order** = the "Board IDs"
  MMS assigns (ElementMgr registry order — George=1, Mary=2; the UI calls them
  "Board ID"; `scene.cast` stores the ids; sheet-only names append after the
  roster).
- `pageCount` = `formatPageCount(total)` + total `pageCountDecimal`;
  `scriptPageNumbers` (script start page — MSD attr / FDX `<Page>` break
  markers, first-class Scene field for future full-FDX render).
- ProductionInfo named roles → crew roster
  (director/producer/upm/firstAD/artDirector/setDecorator).
- Scenes sorted by MMS SheetNumber (= script order; the glide positions match).
- ColorSettings → palette (ColorGrid → `colorPalette.sceneColors`,
  Hilite→selectedStrip*, DayStrip→dayHeader*, Banner→note*).
- Daybreaks ONLY between ScheduleDay groups, pinned anchors day 1.
- **Calendar versions (roadmap 74)**: one `CalendarVersion` per DISTINCT MMS
  calendar (`CalendarMgr`), named by the MMS name — including ones no board
  references (nothing a real file defines is lost). Each carries
  `productionStart`, `prepStart`, `postEnd`, `weeklyDaysOff` (MMS `DaysOff`
  Sun=0..Sat=6 → Lemon Mon=0..Sun=6) + materialized `nonShootDates`
  (Off/Holiday→`holiday`, CompanyTravel→`travel`, window-bounded). No board↔
  calendar linking — the active calendar version is just the first one.
  Files without a `CalendarMgr` get a blank `c01` (same fallback as LOAD).

## SEX — Scheduling Exchange `SSI*` (roadmap 41)

- `parseSexFile` / `exportSexFile` in `src/lib/import/sex.ts`.
- Breakdown-only in the wild; scenes → Boneyard.
- `#\0\0\0` records: type 1 scene header / type 2 element (flag = category
  index) / type 3 page eighths.
- Export writes the Final-Draft-neutral zero-filled header (MMS 5/6/10 all
  accept it).
- Reference parser: `tools/sex_probe.py`; golden: `e2e/fixtures/lair-v10.expected.json`.

## Script body retention (roadmap 123 Phase 0)

- The append parsers (FDX / Fountain) retain the **screenplay body** alongside
  the breakdown data in the SAME pass: `ImportResult.script` (`ScriptDocument`,
  defined in `src/types.ts`, built via `src/lib/script/`). CSV has no body.
- `ScriptDocument` = `{ format, titlePage?, scenes: [{ sceneNumber, scriptPage?,
  blocks }] }`; blocks are compact `[type, text]` tuples
  (`heading | action | character | parenthetical | dialogue | dual_left |
  dual_right | transition | shot | page_break`). Scene breakdown fields are NOT
  duplicated — the body is separate.
- `parseFDX` maps `Paragraph Type` → blocks (Scene Heading/Character/Action also
  drive the breakdown; parenthetical/dialogue/transition/shot are body-only) and
  keeps `<Page>` markers as `page_break` blocks. Final Draft tagged runs
  (`<Text TagNumber>`) resolve to breakdown elements via `TagData` /
  `FDX_CATEGORY_MAP` **and stay in the body prose** — a tagged word is still
  screenplay text (regression guard in `e2e/script-retention.spec.ts`), and is
  the seed for 132's annotation spans. `parseFountain` maps the fountain-js token
  stream (incl. `dual_dialogue_begin/end` + `dialogue_begin.dual` →
  `dual_left`/`dual_right`).
- `commitImport()` dispatches `SET_SCRIPT_DOCUMENT` in its existing
  `BATCH_START`/`BATCH_COMMIT` — one undo entry. The reducer makes the new body
  `scriptDocument` and the previous current `scriptBaseline` (the item 38
  conflict reference; a body without a baseline treats itself as the baseline
  on LOAD). `UPDATE_SCRIPT_DOCUMENT` updates the body WITHOUT rotating the
  baseline (Phase 2 annotations).
- Persistence/Drive need no special handling: works through the roadmap-124
  localStorage codec and the Drive upload as part of the Project.
- Read surfaces (roadmap 123 Phase 1 / 132 Part A): the Breakdown **Script
  sub-tab** (`src/components/ScriptView.tsx`) reads the whole body with
  scene-linked navigation into Sheet/Schedule, and the portable
  `SceneScriptPane` (`src/components/script/SceneScriptPane.tsx`) previews one
  scene on the right of Sheet / Glide. Both render through the shared
  `ScriptSceneText` (light theme) — never a second screenplay renderer.
- Body-aware diff / highlight-to-tag / hover preview / cuts are items **38** and
  **123 Phases 2–3** + **132** — not this section.

## New-project import parity (roadmap 126)

- ONE dispatcher, `parseNewProjectFile(file)` (`src/lib/import/buildProjectFromImport.ts`),
  serves both the Project Manager Import button and the File menu's "New project":
  `.msd`/`.sex`/`.lemon`/`.json` return a ready `Project`; FDX/Fountain/CSV return
  a parsed `ImportResult` that the shared `ImportDialog` reviews (rename, cast
  Board IDs, categories, heading mapping) in `mode="new-project"`, then
  `buildProjectFromImport` builds the project by replaying `commitImport` through
  the reducer. Accept list = `NEW_PROJECT_ACCEPT`.
- The project title defaults to the parsed title, else the filename
  (`fileBaseTitle`). Same fallback prefills the review's "Rename Project".
- **Cast is reused by NAME, never duplicated**: `buildCastIdMap(ordered, existing)`
  (`castIds.ts`) maps an incoming character whose (uppercased) name already
  exists to that member's id; only new names get fresh sequential Board IDs.
  Used by the append flow, the update flow, and `buildProjectFromImport`.

## Custom/localized heading values (roadmap 127)

- Scripts carry INT/EXT and day/night values the project doesn't know
  (localized `ΕΣΩΤ`, custom `DREAM`). `parseSceneHeading` surfaces an unrecognized
  INT/EXT prefix RAW and Greek `ΕΣΩΤ/ΕΞΩΤ` map to INT/EXT. Custom day/night is the
  tail after the last dash when it is a single word (`DREAM`, `ΝΥΧΤΑ`), a curated
  multi-word phrase (`MAGIC HOUR`, `LATER THAT NIGHT`), a short tail carrying a
  strong time token (`HOUR`/`TIME`/`LATER`/`DAWN`/…), or a value the project
  already knows via `knownDayNightPhrases(project)` (palette options + alias
  keys, threaded into `parseFDX`/`parseFountain`). Set qualifiers like
  `WING B`/`LIVING ROOM`/`DAY ROOM` stay in the set.
- On import, `collectUnknownHeadingValues` finds unknown values and the UI shows
  `HeadingValueMapper` (`src/components/import/`): **New option** (writes to
  `colorPalette.intExtOptions`/`dayNightOptions` — the Colors tab, the source of
  truth) or **Replace with** an existing value (recorded in
  `project.headingAliases`, so a later import of the same value is replaced
  silently). `applyHeadingMapping` rewrites the `ImportResult`;
  `buildHeadingMappingUpdate` produces the project patch.
- **Every entry point prompts**, after parse/review: plain/append
  (`ImportDialog`, before review), update diff (`ScriptUpdateModal`, at apply
  time for the values that survive the decisions), and new-project (`ImportDialog`
  `mode="new-project"`, between parsing and the review). Nothing silently folds
  unknown values into the palette. `.lemon`/`.json` (serialized projects) and
  MSD/SEX never prompt.

## Common tasks (agent recipes)

- **Parse CSV/FDX/Fountain** → `parseCSV`/`parseFDX`/`parseFountain` → `ImportResult`.
- **Commit an append import** → `commitImport()` (batches dispatches, one undo entry).
- **Export breakdown CSV** → `exportBreakdownCSV()` (visible columns).
- **Shared helpers**: `parseSceneHeading`, `FDX_CATEGORY_MAP`, `buildCSVLabelToKeyMap()`.

## File-picker accept lists (roadmap 76 — iPad/iOS)

- All import file inputs accept **`pickerAccept(desktop)`** (`src/lib/device.ts`):
  on coarse-pointer devices (iPad/iOS) the native Files picker resolves each
  `accept` extension to a UTType and greys out unregistered ones (`.lemon`,
  `.msd`, `.sex`, `.fdx`, `.fountain` — only `.json`/`.csv`/`.txt` are known),
  so the helper returns `*/*` on `IS_COARSE` and the desktop string otherwise.
- The parsers validate by `file.name` extension (`App.tsx:438`,
  `ProjectManager.handleImportFile`), so a broader picker can't mis-fire —
  a wrongly-picked file hits the existing Import Error dialog.
- Entry points: new-project import `ProjectManager.tsx` + `App.tsx`
  (`.lemon,.json,.msd,.sex`), append import `App.tsx` + `ImportDialog.tsx`
  (`.csv,.fdx,.fountain,.txt`).

## Verification checklist

1. `npm run lint`
2. `npx playwright test` — import/export specs, including the seeded-project
   import flow and the golden fixtures (`e2e/fixtures/*.expected.json`).
