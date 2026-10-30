# Budgeting — surfaces manual (Budget tab, reports, later phases)

Status: **phase 2 LANDED (2026-10-30, roadmap 334)** — Budget, Cost Report,
Expenses and Library are all live, plus the Day Manager Expenses card.
Companion to `docs/BUDGETING.md` (model, engine, store, phases); market evidence
is `docs/BUDGETING-RESEARCH.md`. This file owns the screens and the
`budgetTable` report block. Read it before changing `src/components/budget/`,
the budget/cost report fields/collections or the print templates.

## 1. Budget tab — navigation & shell

- `src/lib/appNav.ts`: `'budget'` is an `AppTabId`, `TAB_LABELS.budget =
  'Budget'`, `TAB_ORDER` puts it between Production and Reports (⌘/Ctrl+8);
  `SUB_TAB_LABELS.budget = { budget: 'Budget', cost: 'Cost Report', expenses:
  'Expenses', library: 'Library' }`.
- `src/components/AppHeader.tsx`: `TAB_ICONS.budget` = Wallet. `src/App.tsx`
  renders `<BudgetTab subTab onSubTabChange onPrintDesign>` and registers the
  Budget tab pop-out. All user navigation goes through `go()`; never raw
  `setActiveTab`.
- `isPhoneSupportedPlace` excludes Budget (phone authoring is later); desktop
  and iPad are the surfaces.
- `BudgetTab.tsx` is the composition root: one project/`computeBudget` read,
  sub-tab switch, version menu, empty state, JSON import. It passes `readOnly`
  and the computed model down; `BudgetView`/`BudgetLibraryView` take the store
  only for `dispatch`, and no row component calls `useProject()`.
- `PageToolbar` hosts the four sub-tabs plus the `BudgetVersionMenu` in
  `rightContent`. The page is a light `ThemeScope`; project chrome comes from
  `ProjectChromeScope`.
- **Cost Report** (`CostReportView.tsx`): as-of date + period menu, KPI strip,
  expandable category → account → line rows, inline ETC + reason, Print via
  `ReportPrintDialog` and CSV. **Expenses** (`ExpensesView.tsx`): filters, Add
  expense, Import CSV, the Glide ledger, footer totals and the shared
  `ExpenseModal`. Both replace the phase-1 placeholders; neither is a second
  budget engine (they read `computeCostReport`).
- **Empty state** (`BudgetEmptyState.tsx`) is the only trigger when
  `project.budget === undefined`, regardless of sub-tab: Blank, Feature, From
  schedule cards, Import budget JSON, and a "linked quantities update live —
  no sync button" note. From schedule shows preview counts (shoot days, crew /
  cast / location lines), not a wizard. The disclosure line states budgets are
  project state and visible to viewers.
- `BudgetTab` owns the hidden JSON file input and the replace-budget confirm;
  `BudgetView` has its own Import button with the same parse + confirm.

## 2. Budget view (`BudgetView.tsx`, `BudgetGrid.tsx`)

- **Layout:** KPI strip, category rail on the left, one always-expanded sheet in
  the centre and a footer totals line. Category and account rows are inline
  bands (grey), line rows white; markup rows sit beneath with signed totals.
- **Toolbar:** Add Category, Add Markup, a linked-lines summary ("N lines follow
  the schedule" / "No lines linked"), Print (design menu + Save as design),
  Export (CSV / JSON), Import (JSON). No sync button, no View/columns menu, no
  Templates menu after creation (templates live in the empty state).
- **KPI strip:** Grand total, ATL, BTL, Post, Fringes, Contingency via
  `formatMoney(model.settings)`; `SectionTile` stays view-local.
- **Left rail:** "All categories" + one button per category with number, name,
  % of grand and total. Clicking filters the sheet to that category (local
  state, not project state); it is navigation, not a tree editor. Right-click
  a category → Edit category / Add account / Delete category (confirm) then
  **+ New category**; right-click blank rail space → New category (roadmap
  339, kit `ContextMenu`). A trailing **+ New category** row keeps the action
  discoverable; read-only shows no rail menu.
- **One sheet.** Category and account rows are inline bands (category
  `#e8e8ea`, account `#f6f6f7`), both showing number+name/fringe/total; markup
  rows sit at the bottom with signed totals. No drag reorder or column resize;
  range selection/copy/paste/fill ride the shared `InlineGlideTable` plumbing
  and commit as one batch.

### Grid columns & editability

| Column | Editable | Notes |
| --- | --- | --- |
| Account / Description | line: description; category/account: number + name | Category/account commit parses `"1200  Producers"` → number + name; a bare name keeps the number |
| Qty | line | On a live-linked line this writes `qtyOverride` (pins); otherwise `qty` |
| Unit | line | Painted enum picker over the library units; typed unknown values are ignored |
| Rate | line | Money string; commits `rateCents` (2dp display) |
| X | line | Numeric multiplier |
| Cur | line | Painted enum picker over the currency codes |
| Fringes | line | Painted entity multi-picker; typed unknown names create library fringes in the SAME batch |
| Groups | line | Painted entity multi-picker; typed unknown names create library groups in the same batch |
| Total | read-only | The line's LOCAL total (line currency); category/account totals are base |

- The grid is the shared **`InlineGlideTable`**, not a bespoke Glide fork:
  auto-fit columns, content height, one commit per edit, presence scope
  `budget:detail` keyed by row key.
- **Colour coding is the shared grid rule** (`docs/UI-PRIMITIVES.md` §Glide
  grids / `docs/DESIGN-LANGUAGE.md`): editable cells are the white input
  surface at rest (near-white hover); read-only cells are the neutral grey
  disabled surface; a row's own `themeOverride.bgCell` (the category/account
  bands) wins over the disabled tint. Never hand-tint editable cells.
- **Painted pickers:** unit/currency/fringe/group cells render through the kit
  `kitPickerCell` chevron lane and open the SAME overlay editor a double-click
  opens. No DOM picker per cell. The Fringes picker is a per-row `getEditor`
  config (roadmap 338): each item's subtitle is the canonical
  `computeBudget → computedLine.fringes[].cents` contribution plus the library
  definition (`+ $1,200 · 10%`), `—` when not applied; the line modal's
  Fringes checklist shows the same `secondary`. Never re-derive fringe maths.
- **Overlay geometry (roadmap 347):** every Glide cell editor (this sheet,
  Library, Expenses, Day Times, Crew, Breakdown) uses Glide's cell padding —
  no `disablePadding` picker overlay — so the popout text sits at the cell's
  own margins/size/alignment.
- **Actions:** an (i) glyph (`infoGlyphCell`) sits in a trailing info column
  just left of the persistent trash column and opens that row's **inspect/edit**
  target — category/account → the node modal, line → the line modal
  (roadmap 335: the target is explicit per row kind, NEVER "the first
  context-menu action"; markup rows have no editor). **Category rows also carry
  a + glyph** that adds a line to the category's first account (creating a
  General account when empty) **without opening a modal**. **Shift+Enter**
  quick-adds in the focused row's context (`InlineGlideTable.onAddRow`), or
  appends when nothing is focused; the selection lands on the new row.
  Right-click **Add line…** asks a count (1–100) and creates N lines in ONE
  batch (`BUDGET_START`/`BATCH_COMMIT`) in the row's account. Both are
  disabled by `readOnly || version.locked`. The trash column (`rowActions`)
  deletes category/account/line/markup after a confirm. Right-click
  (`rowMenuItems`) lists the same actions above the generic copy/paste items.
  Markup rows have trash only.
- **Collapse/expand (roadmap 340):** a leading canvas disclosure glyph
  (`disclosureGlyphCell`) folds a category's accounts+lines or an account's
  lines; totals stay. It is drawn ONLY when the band has child rows (childless
  bands keep a blank lane; Left/Right navigates normally). Left/Right toggles a
  band — view-only, survives tab switches, works read-only. **Picking a category
  in the rail (or All / adding one) unfolds every band.** Copy/cut skip it.
- **Bands & header (roadmap 343):** `rowThemeOverride` paints EVERY cell of a
  category/account band — data and the trailing info/actions lanes — with the
  band colour; hover never punches a grey hole. The sheet runs
  `heightMode="fill"` so Glide scrolls its rows under a pinned column header.
- **Row filter (roadmap 342):** the toolbar's shared `GlideFilter`
  (`MorphSearchField`) filters the sheet display-only; comma tags AND over
  category/account/line text (unit, currency, fringe/group names, notes). Bands
  survive when a child matches and rows never reorder. The filtered list is the
  grid's own row list (edits/paste/fill use its indices); totals/KPIs stay
  whole-budget and the footer shows a **Filtered** cue. Per-user view state;
  works read-only.
- **Locked/read-only:** `readOnly = !canWrite || version.locked` hides the add
  buttons, (i), trash and context actions; cells render on the grey disabled
  surface; print/export remain.

### Modals

- **`BudgetLineModal`** — description, qty, rate, multiplier; schedule link
  picker (shoot days, role/person, cast, locations) with Pin/Unpin and a
  "following the schedule — N units" / "pinned at N (schedule now M)" line;
  unit and currency pickers; notes; fringe and group checklists; advanced qty/
  rate/X formula overrides (roadmap 346: the shared `FormulaField` —
  caret-aware autocomplete over system/project globals + ROUND/MIN/MAX/ABS/
  CLAMP, and a searchable **formula book** per field; plain text, never the
  rich-text editor). Duplicate / Delete in the footer, total in the footer,
  Done hero. Every write commits on blur/pick; no Save button.
- **`BudgetNodeModal`** — category/account number, name, notes; category also
  group (ATL/BTL/Post/Other) and colour (`ColorField`); Add account/line and
  Delete actions. Number is a label; ids stay stable.
- **`BudgetGroupModal`** — group name, colour (`ColorField`), In budget
  (Yes/No), notes, Delete. Opened by the Library's colour swatch cell.
- No separate markup editor yet: the Library table edits name/kind/calc/
  percent/amount/compound; scope/cap fields are model-only.

## 3. Versions & lock (`BudgetVersionMenu.tsx`)

- Trigger: `Budget: <name>` + lock icon + chevron; backed by the kit
  `ItemManagerDropdown` (`theme="light"`, label "Budget", header "BUDGET
  VERSIONS", minItems 1) with create, rename, duplicate, select, delete and
  trash restore.
- **Create adds a BLANK version** (`vNN`); **Duplicate clones the current
  version copy-on-write** (line array shared until edited) as `<name> Copy`.
  The chart and library are shared across every version.
- Delete moves the version to `versionTrash` (30-day TTL + newest 10); the
  last version is protected. Trash is a modal with Restore per row.
- **Lock:** a separate lock/unlock button. Locking confirms "freezes editing
  and pins every line that follows the schedule"; `BudgetTab` computes the
  pinned map with `lockBudgetVersion(project, id)` and dispatches
  `LOCK_BUDGET_VERSION`. The reducer only applies the map. **Unlock re-enables
  editing but does not unpin** — previously pinned quantities stay frozen.
- A locked version hides budget-content editing (`readOnly` prop); version
  management, switching, printing and export still work.
- Compare (two versions, variance) is phase 4.

## 4. Library view (`BudgetLibraryView.tsx`)

Top-to-bottom, one scroll surface:

1. **Budget settings** — base currency picker (the project chrome's light
   `DropdownMenu`), a **derived, read-only symbol** (roadmap 341: the currency
   row's symbol, edited only in the Currencies table; `currencySymbol` is kept
   populated in the same write), decimals (whole/2dp), negatives (minus/
   parentheses), fringe posting (Top sheet/Category/Account), and a read-only
   cost-context line (line count · linked · grand total).
2. **System values** — the seven system globals with live values; global
   formula errors in amber. This card is explanatory, not editable.
3. **Editable tables** (all `InlineGlideTable`, add button per card, delete
   warns; deleting an in-use fringe/group also clears it from the active
   version's lines in the same confirm, one batch):
   - **Fringes** — name, calc (Percent/Fixed per unit/Flat), percent, amount,
     cutoff, posting. Groups/range-id are not exposed here yet.
   - **Groups** — name, colour swatch cell, in-budget Yes/No; row (i) opens
     `BudgetGroupModal`. The colour cell is a native canvas swatch + hex drawn
     by `colorSwatchCell` — **no DOM cell** — and clicking it opens the modal
     where the shared `ColorField` does the picking.
   - **Globals** — symbol, description, value, formula (a global may reference
     another global). Row (i) opens `BudgetGlobalModal` with the shared
     `FormulaField` (autocomplete + formula book, roadmap 346).
   - **Units** — name, plural, type (Time/Quantity/Flat/Percent), hours.
   - **Currencies** — code, symbol, rate to base (blank = missing rate). ~30
     production currencies seed with blank rates (roadmap 341), so the card is
     **collapsible and closed by default** (one-line summary: base = 1 · rates
     set · examples); expanded it is capped at `h-80` with its own scroller.
     **Sync rates** (always in the header) fetches the keyless ECB feed
     (Frankfurter `.dev/v1`, base = 1, reciprocal `rateToBase`) and writes rates
     + `ratesSyncedAt` in ONE batch; a failure leaves every rate untouched.
     Hand editing wins; per-line `fxRate` is never touched.
   - **Markups** — name, kind (Markup/Discount/Charge/Credit), calc, percent,
     amount, compound.
- Deleting an in-use definition states "Used by N lines — those references
  will be cleared" (where-used jump is not built). Deletes are undoable.

## 4b. Cost Report & Expenses views

### Cost Report (`CostReportView.tsx`)

- Toolbar: as-of date, period menu, counts, Print + CSV. KPI strip: Budget,
  Actual, Committed, EFC, Variance (under/over + icon) and % Used. The table
  expands category → account → line; account-level spend sits under an
  "Unallocated" child and the project-level bucket is the final row.
- `computeCostReport(project, { asOf, from, to })` feeds every number; the view
  never does arithmetic. As-of defaults to today; the period menu offers all /
  month / quarter / year / custom range. **A period narrows the displayed
  Actual only — EFC/variance/% used stay as-of.** Out-of-budget categories stay
  visible with a "Not in budget" cue; variance is colour + icon + text
  ("under"/"over"), never colour alone.
- Line rows edit `ETC` with a `MoneyField` (commits `UPDATE_BUDGET_LINE {
  etcCents }` on blur) and `Reason` with a `BudgetInput` (`etcReason`); an
  override shows **Auto** to clear it. Edits are gated by `readOnly ||
  version.locked`. Print uses the Cost Report design via `ReportPrintDialog`;
  CSV writes the flat rows plus totals.

### Expenses (`ExpensesView.tsx`, `ExpensesGrid.tsx`, `ExpenseModal.tsx`)

- Filters: From/To, status, method, account (a `SearchMenu` accordion of
  categories with "All accounts"/"Unallocated" pinned) and production day (the
  shared `DayPickerList`, "All days" leading); **Clear** resets. Add expense creates an
  actual expense and opens the modal; Import CSV parses Date/Description/
  Account/Vendor/Method/Status/Amount/Currency/PO/Day/Notes/Receipt into
  `BULK_ADD_EXPENSES` (unmatched accounts/POs stay blank; skipped rows reported).
- Ledger = shared `InlineGlideTable`: Date, Description, Account, Vendor,
  Method, Status, Amount, PO. Editable = white, read-only = grey; (i) opens
  the modal, trash deletes, right-click mirrors the actions; copy/paste/fill
  ride the shared grid plumbing. **Status cells are tinted** by the ONE
  `lib/budget/statusTones.ts` map (planned amber / committed blue / actual
  emerald / paid teal / void neutral) with the label always painted; the tint
  is the deliberate editable-cell exception (rest + hover keep it). Footer:
  Actual · Committed · Petty cash · This period.
- `ExpenseModal` is the ONE editor (Budget + Day Manager): date, amount,
  description, vendor, method, status, currency, account, optional line, PO,
  receipt URL (http(s) only), notes. Fields commit on blur/pick; delete confirms
  with `lemon_schedule_expense_delete`; one hero footer button (Done).
  Read-only disables every write.

### Day Manager → Expenses

- `dayTabs`/`DAY_TAB_OPTIONS` include `expenses`; the registry section is
  `wide: true`, `copyable: false`, `tabs: ['all','overview','expenses']`.
- Filters `project.expenses` by `dayDate === day.date || dayNumber ===
  day.chronoDay`; **never stores a ledger in `daybreakMeta`**. The summary is
  count + Actual. The card is the SAME `ExpensesGrid` as the ledger (roadmap
  336) with commit-on-blur edits, (i) → the shared `ExpenseModal`, a persistent
  trash lane and right-click actions; **Add expense** quick-adds an editable
  row attributed to this day WITHOUT opening the modal. Actual/Committed
  totals and the **Create a budget** CTA remain; read-only hides every write.
- `DayManagerPage` root-owns the shared `ExpenseModal` (`actions.openExpense`).
  Copy-from-day does **not** copy expenses; call sheets never print costs by
  default.

## 5. Reports — `budgetTable` block

### Block + inspector

`ReportBlock.type` includes `'budgetTable'`; it is a project-wide LEAF like
`callTimes`/`crewTable` — top level, inside `columns` or any non-day container,
**never inside a `days` repeat or a Call Sheet zone** (`blockAllowedIn` rejects
both). Palette: "Budget Table" (Wallet) in the Budget group; `makeReportBlock`
defaults `budgetMode: 'topsheet'`.

```ts
budgetMode?: 'topsheet' | 'accounts' | 'lines' | 'costReport' | 'hotCost' | 'cashflow' | 'comparison';
budgetCategories?: string[];   // selected category ids; unset = all
budgetAccounts?: string[];     // selected account ids; unset = all
budgetColumns?: string[];      // subset of the mode's columns
budgetVersionId?: string;      // comparison: primary (unset = active)
budgetCompareVersionId?: string; // comparison: original/compare version
showZero?: boolean;            // default false
showFringes?: boolean;         // default true
showNotes?: boolean;           // default false
showPercent?: boolean;         // default true
costAsOf?: string; costPeriod?: { from; to };   // typed, phase 2 only
```

`BudgetBlockControls.tsx`: Mode Seg (Top Sheet / Accounts / Lines / Compare /
Cost Report), category/account/column checklists, Zero rows / % / Fringes /
Notes toggles (Fringes+Notes hidden in Cost Report + Compare), As-of/Period in
Cost Report, Budget/Compare-to `ItemManagerDropdown`s in Compare; `hotCost`/
`cashflow` stay reserved and fall back to `topsheet`.

### Read model (`src/lib/reportBudget.ts`)

`buildBudgetReport` shapes rows/columns from `computeBudget` (never re-derives money); `budgetReportMode()` is the ONE gate.
- **topsheet** — one row per category + subtotal/markups/grand total; `#`,
  Account, %, Subtotal, Fringes, Total.
- **accounts** — category header + one row per account + totals; `#`, Account, %, Base, Fringes, (Notes), Total.
- **lines** — category + account headers, line rows, account subtotal (only when >1 visible line), totals; Account, Description, Qty, Unit, Rate, X, Cur, Fringes, %, (Notes), Total (base).
- **costReport** — `buildCostReportReport` on `computeCostReport`: category/
  account/line rows + Unallocated; Budget/Actual/Committed/ETC/EFC/Variance/
  % Used/Reason. `costAsOf`/`costPeriod` narrow Actual only.
- **comparison** — `buildComparisonReport(primary, original, options)` reads two
  versions from `ctx.budgetForVersion` (memoized): category/account rows +
  subtotal/markups/grand with `#`, Account, Original, Budget, Variance
  (`budget − original`, signed cents), Var % (blank when original 0). Read-only.

`showZero` hides zero rows; `showFringes`/`showPercent` drop columns;
`showNotes` adds Notes. Category selection filters all modes; account selection
does not hide a top-sheet category. Line rate cells keep the line currency;
totals are base cents. `ReportBudgetTable.tsx` renders the shared
`.report-table-cols`/`.rm-row` recipe with header repetition + keep-with-next;
money right-aligns via the budget settings, percent one decimal. No budget →
designer hint; print renders nothing (compare hints when a version is missing).

### Collections + fields (`reportData.ts`, `reportFields.ts`)

Collections: `budgetCategories`, `budgetAccounts`, `budgetLines`,
`budgetLinesOfAccount` (child), plus `costReport`, `expenses`, `expensesOfDay`
(child of `days`) and `purchaseOrders` — all carry canonical computed totals.
Document fields: `budgetGrandTotal/BaseTotal/Atl/Btl/Post/Fringes/Contingency/
Net/CostPerShootDay`. Item fields: `budgetCategoryNumber/Name`, `budgetAccountNumber/
Name`, `budgetDescription/Qty/Unit/Rate/Multiplier/Currency/LineTotal/
LineTotalBase/PercentOfGrand/Notes`. Cost fields (`cr*`/`expense*`/`po*`/day
totals) are in `docs/REPORTS-DESIGNER.md`. `ReportFieldDef.money` drives
alignment; `ctx.budget`/`ctx.costReport` compute ONCE in `buildReportCtx`;
`ctx.budgetForVersion` memoizes extra versions for comparison.

### Built-in transient prints (`src/lib/budget/reportTemplates.ts`)

`budgetReportDesigns(budget)` returns fresh designs (never seeded): **Top
Sheet**, **Account Detail**, **Budget Health**, **Cost Report — Budget vs
Actual**, and **Version Comparison** (landscape, previous vs active) when a
second version exists. The Print menu passes a design to `onPrintDesign` →
`setCustomReportPrint` → `ReportPrintDialog` (never `window.print()`); **Save as
design** clones it via `ADD_REPORT_DESIGN`.

## 6. Schedule-driven budget (integral, no sync button)

- `computeScheduleQuantities` (`lib/budget/scheduleSync.ts`) reads the SAME
  canonical day model as the Day Manager/DOOD (`computeRowData` + `buildDayViews`):
  shoot/prep/post days, per-person/per-role crew days, cast days, location days
  and element days.
- **From schedule** = Feature chart + linked lines (shoot days → 2400; one per
  working crew person → 2100; one per working cast member → 1400 `N. NAME`; one
  per used location → 3200). Rates start at zero; the empty-state card previews
  counts only.
- **Live links:** a `source` line derives quantity at read time. Editing Qty
  stores `qtyOverride` (pin); Pin/Unpin freezes/restores it; a missing target is
  0 + an amber warning. Rate is stored `rateCents` (`rateOverride` stays a
  data/agent seam). **No refresh/sync button exists or should be added**;
  locking a version freezes linked quantities. System globals work without
  generation (`=SHOOT_DAYS * 2`); `WRAP_DAYS`/`WRAP_WEEKS` are 0, prep/post
  weeks divide days by 5.

## 7. Later phases (forward-looking — do not treat as built)

- **Phase 2 — Cost Report & Expenses — LANDED.** §4b. PO authoring is
  action/bridge-only (no PO modal yet).
- **Phase 3 — Overtime — LANDED (2026-10-30).** Crew card **Overtime** button
  (badge `Xh · $Y`) + root-owned `OvertimeModal` (Day/Departments/Crew/Cast):
  actual call/wrap, paid day, tier editor, 6th/7th multipliers, per-department
  and per-person overrides, no-rate warning, **Post to expenses** (actual/
  payroll, one batch). `DayMeta.overtime` owns the settings; copy-from-day
  carries it with the crew extract. Report fields `crewRate/rateUnit/hours/otHours/
  otCost/dayCost`, `dayOvertimeHours/Cost`, `deptOtHours/Cost`, cast numeric rates
  (data/bridge-editable today).
- **Phase 4 — Advanced.** Version compare (+ Original/Variance) — LANDED;
  cashflow, incentives/credits, currency report, AICP/episodic, approvals/
  petty-cash, MMB import/export remain; each its own branch.

## 8. UI-kit gaps (actual)

- `NumberInput` is the one numeric primitive (`fields.tsx` adapters:
  `NumberField`, `MoneyField`, `PercentField`); `ColorField` is reused. No
  generic `Stat`/`EmptyState`: `SectionTile`/`BudgetEmptyState` stay local.
- Already sufficient: `Button`, `Seg`, `DropdownMenu`/`ItemManagerDropdown`,
  `Checklist`, `Modal`/`ModalFooter`, `PageToolbar`, `ThemeScope`,
  `InlineGlideTable` + kit control cells, app glyphs (`infoGlyphCell`,
  `colorSwatchCell`, `disclosureGlyphCell`), `SearchMenu`, `DayPickerList`,
  `GlideFilter`, `FormulaField`.

## 9. Prefs & state

- Project state: the entire `Budget` (chart, library, versions, settings) +
  `project.expenses`/`purchaseOrders`. Local view state: focused category/rail
  menu, open modals, sheet row filter, band collapse (module-level per session),
  cost report as-of/period, ledger filters. No budget-specific persisted view
  prefs; the dialog `suppressKey`s are the only localStorage keys.
- The budget is never in a second context/store; `BudgetTab` reads the project
  once and passes the model/readOnly down. Children take the store only for
  `dispatch`; no row component calls `useProject()`.
