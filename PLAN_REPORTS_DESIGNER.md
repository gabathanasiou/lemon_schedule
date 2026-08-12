# Plan: Reports Designer + Production Info (final scope)

**Branch:** `feature/reports-designer`. **Reference:** Movie Magic Scheduling report set (One-Liner, DOODs, Scene Breakdown, Cast List, Production Report). **Process:** Phase 0 standalone prototype (`~/Documents/Software Apps/report_designer_concept`, built; see its `INTEGRATION_PLAN.md` for validated UX + gotchas), then Phase 1 integration into lemon_schedule.

---

## Locked Scope

1. **Canvas IS the document** — blocks render with real project data (Webflow-style). No separate live preview. A **Preview** button (header) shows the clean print view; Exit Preview / Esc returns. Print works from both modes.
2. **Block set:** `Text` · `Attribute` · `Repeat` · `Table` · `Columns` · `Ribbon` · `PageBreak` · `Spacer`.
3. **Contextual attributes only.** Every attribute list (palette, text-token picker, table cell picker) shows only the fields valid for the current context + always-available statics (Production/Project). The palette shows a context chip ("Inside: Repeat over Days"). **Generic Attribute block** inserts empty with a "Select field…" state and opens the context-valid picker (covers "just show the director's phone here"). Clicking a specific palette attribute inserts it pre-bound.
4. **Production = plain static attributes.** No key-positions concept in the reports designer: `director`, `producer`, `firstAD`, … are attributes that resolve from crew roles (`{{director}}`, `{{director.phone}}`). The Production tab keeps its Key Positions card as a data-entry convenience only.
5. **Sheet # = position in the glide breakdown** — `scenes.findIndex(s => s.id === scene.id) + 1` (scenes-array order), NOT stripboard order.
6. **Table block = ribbon-shaped grid bound to a collection.** `colWidths` + `tableRows` (multiple design rows per item, all repeating per item) + **merge groups via `computeMergeGroups`** semantics (per-item instance; merges never cross item boundaries; `page-break-inside: avoid` per item). Column widths **drag-resize only** (pointer capture, Shift = scale right — `RibbonTab.startResize` pattern). No number inputs. Optional header row (field labels).
7. **Table orientation toggle** — `repeatAxis: 'rows' | 'columns'`. Rows (default) = items become rows (current). Columns (transposed) = items become columns: fixed field-per-row design, equal content-sized columns, optional header field showing item identity (Scene #, element name). Transposed mode is single-row-per-field (multi-row/merges are rows-mode only in v1).
8. **DOODs stays built-in — parked.** No matrix mode, no dayMatrix block, no nested-repeat axes inside tables in v1. (A two-axis pivot would be required to rebuild DOODs from blocks; explicitly deferred. DOOD-style aggregates — Work/Hold/Travel/Start/Finish — remain available as element/cast attributes.)
9. **Columns block (Notion-style)** — `cols: { id, width }[]`, each column holding a block list. Created two ways: palette "Columns" block (2 equal columns, add/split controls) AND drag-to-edge gesture (left/right dropzone edges on siblings wrap both into a 2-column layout). **No column-count cap; no columns-inside-columns.** Column resize: hand-rolled ribbon-style (no new dep). Block drag in integration: **dnd-kit** (already a dependency; PointerSensor for iPad) — prototype uses HTML5 DnD.
10. **Crew is roles-first** — role → one or more people; empty roles skipped everywhere (list, repeats, tokens render empty). Crew repeat = **per-person** rows in v1 (no crew-by-role).
11. **Hide-if-empty** on Text/Attribute: `Show / Hide text / Hide block`.
12. **Ribbon block** reuses the print ribbon pipeline: modes `single` (inside scene-scoped repeat), `day` (inside Days repeat), `all` (top level, respects print-time day filter); Ribbon Design picker in toolbar.
13. **Unified Report print dialog** — design list + scope filters ("Days to print" when a top-level Days repeat or Ribbon-`all` exists; category dropdown when a top-level Elements repeat exists) + page-size override + page numbers. Existing 4 printouts keep their own dialogs.
14. **Table cell config deferred** (label override, prefix/suffix, cell padding, header styling) — future iteration.
15. **Deferred table customization**: ribbon cell parity beyond field/width/align, plus merges already in scope (item 6) — everything else (prefix/suffix/padding/label overrides) is future.

---

## Phase 0 — Prototype (`~/Documents/Software Apps/report_designer_concept`)

Standalone Vite + React + Tailwind, hardcoded sample data. **Built and validated:** WYSIWYG canvas with thin-outline block cards on a light-gray document column; chrome bar only on the selected block (direct-child CSS selector — nested descendants must not show chromes); repeat blocks preview children against the first item; palette click + drag; dropzones between blocks (constant idle size — expanding all zones mid-drag breaks the native drop); block drag-to-reorder with solid-background ghost (`setDragImage` clone: `#fff` bg + blue outline + shadow, source dimmed); preview toggle; print.

**Gotchas recorded in `INTEGRATION_PLAN.md` (do not re-learn):**
- `dataTransfer.getData()` is empty during `dragover` — record `{targetId, pos}` intent in a ref at dragover; read the payload at `drop`/`dragend`.
- React defers state from continuous events (`dragover`) — drive active-zone highlight via direct DOM (`data-active` attr + CSS), not state.
- `findBlock` must return `parent: null` for root blocks, or root inserts/moves silently no-op.
- Field getters must be crash-proof: try/catch + item truthiness guard at the value boundary; scenes-scope fields (`day`, `date`, `callTime`) are legitimately reused against DayInfo items — do not shape-check by scope.
- Table column pickers only offer fields valid for the repeat's collection.

Remaining prototype work before integration: table multi-row/merges + transposed toggle, Columns block + edge gesture, empty-state Attribute block, day-filter in print.

---

## Phase 1 — Data Model (`src/types.ts`)

```ts
export interface CrewPerson { id: string; name: string; phone?: string; email?: string; }
export interface CrewRole { key: string; label: string; builtin?: boolean; }

export interface ProductionInfo {
  company?: string; studio?: string;
  productionOffice?: string; address?: string; phone?: string; email?: string;
  startDate?: string; wrapDate?: string;   // wrapDate auto from last section
}

export type ReportCollection =
  | 'scenes' | 'days' | 'cast' | 'elements' | 'crew'
  | 'scenesOfDay' | 'scenesOfElement';

export type EmptyBehavior = 'show' | 'hideText' | 'hideBlock';
export type RibbonMode = 'single' | 'day' | 'all';
export type RepeatAxis = 'rows' | 'columns';

export interface ReportTableColumn {        // rows-mode: ribbon-shaped
  id: string; field: string; width: number; align?: 'left' | 'center' | 'right';
}
export interface ReportTableRow {           // multiple design rows per item
  id: string; cells: { id: string; field: string; align?: 'left' | 'center' | 'right' }[];
}

export interface ReportBlock {
  id: string;
  type: 'text' | 'field' | 'repeat' | 'table' | 'columns' | 'ribbon' | 'pageBreak' | 'spacer';
  // text / field
  text?: string;                 // {{tokens}}
  field?: string;                // empty = "Select field…" state
  prefix?: string; suffix?: string;
  emptyBehavior?: EmptyBehavior;
  // repeat
  collection?: ReportCollection;
  category?: string;             // for 'elements'
  children?: ReportBlock[];
  gap?: number;                  // pt between items
  // table (repeat + table shape)
  repeatAxis?: RepeatAxis;
  colWidths?: number[];          // rows-mode
  tableRows?: ReportTableRow[];  // rows-mode
  showHeader?: boolean;
  headerField?: string;          // columns-mode (item identity row)
  // columns
  cols?: { id: string; width: number; blocks: ReportBlock[] }[];
  // ribbon
  ribbonId?: string; ribbonMode?: RibbonMode;
  // style
  fontFamily?: string; fontSize?: number; bold?: boolean; italic?: boolean;
  align?: 'left' | 'center' | 'right'; paddingV?: number; paddingH?: number;
  // spacer
  height?: number;
}

export interface ReportDesign { id: string; name: string; createdAt: number; page: 'portrait' | 'landscape'; blocks: ReportBlock[]; }
export interface ReportTrashItem { design: ReportDesign; deletedAt: number; }
```

`Project` gains: `productionInfo`, `crewRoles` (built-in seed: Producer, Line Producer, Director, 1st AD, 2nd AD, UPM, Production Manager, Production Coordinator, Script Supervisor, Production Accountant, DoP, Camera Operator, 1st/2nd AC, DIT, Sound Mixer, Boom Op, Production Designer, Art Director, Set Decorator, Costume Designer, Makeup, Hair, Key Grip, Dolly Grip, Gaffer, Locations, Stunts, Special Effects, Casting Director, Editor, VFX Supervisor, PAs), `crew: Record<string, CrewPerson[]>`, `reportDesigns`, `activeReportId`, `reportTrash`.

---

## Store (`src/store/actions/reports.ts` — mirrors `design.ts`)

| Action | Payload |
|---|---|
| `ADD_REPORT_DESIGN` / `UPDATE_REPORT_DESIGN` / `UPDATE_REPORT_PAGE` / `RENAME_REPORT_DESIGN` / `SET_ACTIVE_REPORT` / `DELETE_REPORT_DESIGN` / `RESTORE_REPORT_FROM_TRASH` | ribbon trash pattern; deep-clone blocks |
| `SET_PRODUCTION_INFO` | `Partial<ProductionInfo>` merge |
| `ADD_CREW_ROLE` / `RENAME_CREW_ROLE` / `DELETE_CREW_ROLE` | rename updates assignments; delete-with-people = confirm + remove |
| `ADD_CREW_PERSON` / `UPDATE_CREW_PERSON` / `DELETE_CREW_PERSON` / `REORDER_CREW_PERSON` | within a role |

Register in `Action` union + switch; seed in `makeBlankProject` + `LOAD` defaults (incl. stale `activeReportId` fix); `reportTrash` in storage 30-day expiry; carry `reportDesigns`/`activeReportId` in `duplicateProject`.

---

## Field & Collection Registry

`src/lib/reportFields.ts` — `FieldDef { key, label, group, scope, align?, defaultWidth?, get(ctx, item) }`; `get` wrapped try/catch + item guard (see gotchas). `src/lib/reportData.ts` — resolvers reusing `computeRowData`, `splitSections`/`useDaybreakSections`, `loadCategoryElements`, `isElementMarked`; **extract DOOD per-element stats from `Dood.tsx` into shared `src/lib/nonShootStats.ts`** (one source of truth, AGENTS rule 4).

| Collection | Attributes |
|---|---|
| **Scenes** (`scenes`, `scenesOfDay`, `scenesOfElement`) | Scene # · Sheet # (scenes-array index + 1) · Script Day · Call Time (computed) · Duration (formatted) · Day (chrono) · Date · Int/Ext · Set · Day/Night · Page Count · Description · Notes · Cast (names) · Background Actors · every element category (resolved names) |
| **Elements** | Name · Category · Scene Count · Attached Scenes (#s) · Total Pages · Shoot Days · Work/Hold/Travel Days · Start/Finish Date |
| **Cast** | ID · Name · Work/Hold/Travel Days · Start/Finish Date |
| **Days** | Day # · Date · Call Time · End Time · Total Pages · Shoot · Break · Day Label · Scene Count · First/Last Scene # |
| **Crew** | Role · Name · Phone · Email |
| **Production** (static) | Company · Studio · Production Office · Address · Phone · Email · Start Date · Wrap Date · crew-resolved: Director, Producer, Line Producer, 1st AD, UPM (`{{x.phone}}`/`{{x.email}}`) |
| **Project** (static) | Title · Version · Draft # |

---

## Designer UI (`src/components/reports/` — mirrors `src/components/ribbon/`)

- **`ReportDesigner.tsx`** — composition root, only `useProject()` consumer; local working copy committed via `UPDATE_REPORT_DESIGN` (no Save button); refs for keyboard; keyboard on `useCurrentWindow`: Delete/Backspace, Cmd/C+V, ↑/↓, Esc.
- **Header portal**: `ItemManagerDropdown` (create/rename/duplicate/delete/import/export `.report`/reset) + Page Size + Preview toggle + Print.
- **`ReportPalette.tsx`** — Blocks (Text, Attribute, Repeat, Table, Columns, Ribbon, Page Break, Spacer) + Attributes gated by context chip; click + drag.
- **`ReportDesignerCanvas.tsx`** — light-gray page column; thin 1px outlines on every card; chrome bar on selection only; repeat children preview first item; dropzones (above/below + left/right edges for columns gesture); card drag with ghost; direct-DOM active-zone highlight; table shows resize-tab bar + column chips; columns show per-column block lists + resize handles.
- **`ReportToolbar.tsx`** — Structure / Block / Style labeled rows (ribbon-toolbar pattern): text content + Insert attribute, field picker, repeat collection/category/gap, table orientation + columns/rows editor, columns add/split, ribbon mode + design, font/size/bold/italic/align, emptyBehavior, spacer height. Column width = drag only.
- **`ReportContextMenu.tsx`** — `elementFromPoint` re-target trick.
- **`ReportBlockView.tsx` + `ReportPrint.tsx`** — tree-walk renderer; merges via shared `computeMergeGroups`; ribbon block delegates to the print ribbon pipeline (`PrintRowParts`); `@page` per design; pageBreak = `page-break-before: always`; `page-break-inside: avoid` per repeat item/table row/column.
- **Placement**: ReportsTab 3rd sub-tab `designer`; App `reportsSubTab` union + `toggleSubPopout` fallback + `SubTabPopoutFrame` (`sub_reports_designer`).

---

## Production Tab (`src/components/ProductionTab.tsx` — new top-level tab)

Light PageToolbar, two sub-tabs (state lifted to App for pop-out):
- **Project Details** — company, studio, production office, address, phone, email, start date (wired to `version.productionStart`), wrap date (auto, read-only) + **Key Positions** card (Director, Producer, Line Producer, 1st AD, UPM — people shown, add-person dropdown assigns role; two-way with Crew).
- **Crew** — role sections (non-empty only): header (label + count) + person rows (Name · Phone · Email, inline edit, add/remove/reorder). Add person = role dropdown (catalog incl. empty roles) or "+ New role…". "Manage Roles" dropdown: add/rename/delete (delete-with-people confirm).

---

## Print Flow

- **`ReportPrintDialog.tsx`** — design list + real-data preview + page-size override + page numbers + scope filters (days multi-select when top-level Days repeat or Ribbon-`all`; category dropdown when top-level Elements repeat). Persist `lemon_schedule_report_print_{project.id}`.
- **`App.tsx`** — `reportPrint` state; title swap + `afterprint` + `setTimeout(window.print(), 200)` (PrintSchedule pattern); early return renders `<ReportPrint>`.
- **Entry points**: File → Print → "Report…" (top); ReportsTab toolbar Print → dialog; designer header Print → active design.

---

## Seed Templates (`src/lib/reportTemplates.ts`)

One-Liner (Repeat Scenes → table) · Cast List · Element Breakdown (Repeat Elements + nested scenesOfElement table + totals) · Scene Breakdown (per-scene sections) · Crew Contact Sheet (production fields + crew table) · Call Sheet (Repeat Days → header, Ribbon-day or scenes table, crew). DOODs/stripboard/breakdown-sheet remain built-in printouts.

---

## Mobile / iPad

`IS_COARSE` touch targets + `group-active` press feedback; `touchAction: none` during drags/resizes; click-to-insert palette; dnd-kit PointerSensor for block drag (integration); preview toggle instead of side-by-side; pop-out `!IS_COARSE`. New shortcuts in `HelpModal.tsx`; `AGENTS.md` updated (field registry, block model, composition root, dropzone/dnd gotchas).

---

## Files

- **New:** `src/lib/{reportFields,reportData,reportTemplates,reportStyle,nonShootStats}.ts` · `src/store/actions/reports.ts` · `src/components/reports/{ReportDesigner,ReportPalette,ReportDesignerCanvas,ReportToolbar,ReportContextMenu,ReportBlockView,ReportPrint,ReportPrintDialog}.tsx` · `src/components/ProductionTab.tsx`
- **Edited:** `types.ts` · `reducer.ts` · `storage.ts` · `provider.tsx` (duplicateProject) · `App.tsx` · `AppHeader.tsx` · `ReportsTab.tsx` · `Dood.tsx` (shared nonShootStats) · `HelpModal.tsx` · `AGENTS.md`
- **E2E:** `reports-designer.spec.ts` (design create/edit, contextual attributes, table + transposed, columns, Production crew/roles, print with stubbed `window.print()`) + extend `seeded-smoke.spec.ts`
- **Split rule:** designer files ~700 lines → extract presentational modules + barrel.

---

## Commit Plan (each: `npm run lint`; playwright at milestones)

| Step | Commit |
|---|---|
| 0 | `docs: add reports designer and production info plan` |
| 1 | `add production info, crew roles and report design types + store slice` |
| 2 | `add report field registry and collection resolvers (shared dood stats)` |
| 3 | `add report templates and block renderer` |
| 4 | `add production tab with project details and crew` |
| 5 | `add reports designer sub-tab (palette, canvas, toolbar, context menu, preview)` |
| 6 | `add unified report print dialog and print flow` |
| 7 | `add reports designer e2e coverage; update help modal and AGENTS.md` |

---

## Non-Goals (v1)

- DOODs/stripboard/breakdown-sheet rebuilt as blocks (built-ins stay); matrix/pivot tables and dayMatrix block (parked — required only if DOODs-from-blocks becomes a goal)
- Table cell label override, prefix/suffix, cell padding, header styling (deferred)
- Crew-by-role collection; print-time filters on nested repeats; arbitrary query/filter on repeats
- Columns inside columns; column-count cap (deliberately unlimited)
