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

## SEX — Scheduling Exchange `SSI*` (roadmap 41)

- `parseSexFile` / `exportSexFile` in `src/lib/import/sex.ts`.
- Breakdown-only in the wild; scenes → Boneyard.
- `#\0\0\0` records: type 1 scene header / type 2 element (flag = category
  index) / type 3 page eighths.
- Export writes the Final-Draft-neutral zero-filled header (MMS 5/6/10 all
  accept it).
- Reference parser: `tools/sex_probe.py`; golden: `e2e/fixtures/lair-v10.expected.json`.

## Common tasks (agent recipes)

- **Parse CSV/FDX/Fountain** → `parseCSV`/`parseFDX`/`parseFountain` → `ImportResult`.
- **Commit an append import** → `commitImport()` (batches dispatches, one undo entry).
- **Export breakdown CSV** → `exportBreakdownCSV()` (visible columns).
- **Shared helpers**: `parseSceneHeading`, `FDX_CATEGORY_MAP`, `buildCSVLabelToKeyMap()`.

## Verification checklist

1. `npm run lint`
2. `npx playwright test` — import/export specs, including the seeded-project
   import flow and the golden fixtures (`e2e/fixtures/*.expected.json`).
