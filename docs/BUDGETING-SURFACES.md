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
- **KPI strip:** Grand total, ATL, BTL, Post, Fringes, Contingency — all base
  cents through `formatMoney(model.settings)`. `SectionTile` is local to the
  view (not a promoted kit primitive).
- **Left rail:** "All categories" + one button per category with number, name,
  % of grand and total. Clicking filters the sheet to that category (local
  state, not project state); it is navigation, not a tree editor.
- **One sheet, always expanded.** Category and account rows are inline bands:
  category row = `#e8e8ea` with strong text, account row = `#f6f6f7`; both
  show number+name, fringe and total columns (qty/unit/rate/X/currency blank).
  Markup rows sit at the bottom with signed totals. No collapse/disclosure,
  no drag reorder and no column resize in phase 1; range selection, copy/paste
  and fill use the shared `InlineGlideTable` plumbing and commit as one batch.

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
  opens. No DOM picker per cell.
- **Actions:** an (i) glyph (`infoGlyphCell`) sits in a trailing info column
  just left of the persistent trash column and opens the row's first action —
  Edit category/account (node modal), Line details (line modal); **category
  rows also carry a + glyph** that adds a line to the category's first account
  (creating a General account when empty) **without opening a modal**. The trash
  column (`rowActions`) deletes category/account/line/markup after a confirm.
  Right-click (`rowMenuItems`) lists the same actions above the generic
  copy/paste items. Markup rows have trash only.
- **Locked/read-only:** `readOnly = !canWrite || version.locked` hides the add
  buttons, (i), trash and context actions; cells render on the grey disabled
  surface; print/export remain.

### Modals

- **`BudgetLineModal`** — description, qty, rate, multiplier; schedule link
  picker (shoot days, role/person, cast, locations) with Pin/Unpin and a
  "following the schedule — N units" / "pinned at N (schedule now M)" line;
  unit and currency pickers; notes; fringe and group checklists; advanced qty/
  rate/X formula overrides with the system-global hint. Duplicate / Delete in
  the footer, total in the footer, Done hero. Every write commits on
  blur/pick; no Save button.
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

1. **Budget settings** — base currency picker, symbol, decimals (whole/2dp),
   negatives (minus/parentheses), fringe posting (Top sheet/Category/Account),
   and a read-only cost-context line (line count · linked · grand total).
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
     another global).
   - **Units** — name, plural, type (Time/Quantity/Flat/Percent), hours.
   - **Currencies** — code, symbol, rate to base (blank = missing rate).
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

- Filters: From/To, status, method, account (grouped by category; "Unallocated"
  = no account) and production day; **Clear** resets. Add expense creates an
  actual expense and opens the modal; Import CSV parses Date/Description/
  Account/Vendor/Method/Status/Amount/Currency/PO/Day/Notes/Receipt into
  `BULK_ADD_EXPENSES` (unmatched accounts/POs stay blank; skipped rows reported).
- Ledger = shared `InlineGlideTable`: Date, Description, Account, Vendor,
  Method, Status, Amount, PO. Editable = white, read-only = grey; (i) opens
  the modal, trash deletes, right-click mirrors the actions; copy/paste/fill
  ride the shared grid plumbing. Footer: Actual · Committed · Petty cash ·
  This period.
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
  count + Actual; the card shows the compact table with Actual/Committed
  totals, Add expense and a **Create a budget** CTA without a budget.
- `DayManagerPage` root-owns the shared `ExpenseModal` (`actions.openExpense`).
  Copy-from-day does **not** copy expenses; call sheets never print costs by
  default.

## 5. Reports — `budgetTable` block

### Block + inspector

`ReportBlock.type` includes `'budgetTable'`; it is a project-wide LEAF like
`callTimes`/`crewTable` — top level, inside `columns` or any non-day container,
**never inside a `days` repeat and not inside a Call Sheet zone**
(`blockAllowedIn` rejects both with an explanation). Palette entry: "Budget
Table" (Wallet) in the Budget group; `makeReportBlock('budgetTable')` defaults
`budgetMode: 'topsheet'`.

```ts
budgetMode?: 'topsheet' | 'accounts' | 'lines' | 'costReport' | 'hotCost' | 'cashflow' | 'comparison';
budgetCategories?: string[];   // selected category ids; unset = all
budgetAccounts?: string[];     // selected account ids; unset = all
budgetColumns?: string[];      // subset of the mode's columns
showZero?: boolean;            // default false
showFringes?: boolean;         // default true
showNotes?: boolean;           // default false
showPercent?: boolean;         // default true
costAsOf?: string; costPeriod?: { from; to };   // typed, phase 2 only
```

`BudgetBlockControls.tsx` renders the Mode Seg (**Top Sheet / Accounts /
Lines / Cost Report**), category and account checklists, a column checklist
(at least one column is kept), and Zero rows / % used / Fringes / Notes
toggles (Fringes and Notes are hidden in Cost Report mode). Cost Report mode
also exposes **As of** and **Period from/to** date fields (`costAsOf` /
`costPeriod`). `hotCost` / `cashflow` / `comparison` remain reserved and fall
back to `topsheet`.

### Read model (`src/lib/reportBudget.ts`)

`buildBudgetReport(ctx.budget, options)` shapes rows/columns from `computeBudget`
— it never re-derives money. `budgetReportMode()` is the ONE phase gate.
Modes and columns:

- **topsheet** — one row per category plus (when markups are non-zero) a
  subtotal row, the markups/credits and the grand total. Columns: `#`,
  Account, %, Subtotal, Fringes, Total.
- **accounts** — category header + one row per account + totals. Columns:
  `#`, Account, %, Base, Fringes, (Notes), Total.
- **lines** — category header + account header + line rows + account subtotal
  (only when the account has more than one visible line) + totals. Columns:
  Account, Description, Qty, Unit, Rate, X, Cur, Fringes, %, (Notes), Total
  (base).
- **costReport** — `buildCostReportReport(project, budget, options)` (built on
  `computeCostReport`): category/account/line rows + Unallocated, columns
  `#`, Account / Description, Budget, Actual, Committed, ETC, EFC, Variance,
  % Used, Reason. `costAsOf` / `costPeriod` set the view; the period narrows
  Actual only. Category/account headers keep-with-next.

`showZero: false` hides zero rows; `showFringes: false` drops the column;
`showPercent: false` drops %; `showNotes` adds Notes. Category selection
filters both modes; account selection does not hide a top-sheet category.
Category/account rows carry `keepWithNext`; line/rate cells keep the line's
currency symbol; the `rate` column is in the line's currency, while `Total
(base)` and every account/category/grand total are base cents.

`ReportBudgetTable.tsx` renders the static table with the shared
`.report-table-cols` / `.rm-row` recipe, `data-rm-header` for header repetition
on continuation pages and `data-rm-keep-with-next` for headers. Money columns
are right-aligned and formatted through the budget settings (negative style
included); percent columns show one decimal; numeric cells use tabular
figures. No budget yet → the designer shows a hint, print/preview renders
nothing.

### Collections + fields (`reportData.ts`, `reportFields.ts`)

- Collections: `budgetCategories`, `budgetAccounts`, `budgetLines` (base) and
  `budgetLinesOfAccount` (contextual child of `budgetAccounts`); cost tracking
  adds `costReport`, `expenses`, `expensesOfDay` (child of `days`) and
  `purchaseOrders`. Items carry the canonical computed totals, not re-derived
  values.
- Document fields (scope `budget`): `budgetGrandTotal`, `budgetBaseTotal`,
  `budgetAtl`, `budgetBtl`, `budgetPost`, `budgetFringes`, `budgetContingency`,
  `budgetNet`, `budgetCostPerShootDay`.
- Item fields: `budgetCategoryNumber/Name`, `budgetAccountNumber/Name`,
  `budgetDescription`, `budgetQty`, `budgetUnit`, `budgetRate` (money, line
  currency), `budgetMultiplier`, `budgetCurrency`, `budgetLineTotal` (line
  total incl. fringes / account / category, base cents), `budgetLineTotalBase`,
  `budgetPercentOfGrand`, `budgetNotes`.
- Cost-tracking collections and fields (`costReport`, `expenses`,
  `expensesOfDay`, `purchaseOrders`; `cr*` / `expense*` / `po*` / day totals)
  are listed in `docs/REPORTS-DESIGNER.md`.
- `ReportFieldDef.money` drives right alignment; every money getter formats
  through `ctx.budget.settings`. `ReportCtx.budget` and `ctx.costReport` are
  computed ONCE in `buildReportCtx`, never per block.

### Built-in transient prints (`src/lib/budget/reportTemplates.ts`)

`budgetReportDesigns()` returns fresh `ReportDesign` objects (never seeded into
projects), in menu order:

1. **Budget — Top Sheet** (landscape): title + subtotal line + `topsheet`
   table (fringes/percent on, notes off).
2. **Budget — Account Detail** (landscape): title + `lines` table with notes,
   category/account keep-with-next, repeating header.
3. **Budget Health** (portrait executive summary): grand total hero, ATL/BTL/
   Post, fringes/contingency/net, cost per shoot day, then an `accounts` table.
4. **Cost Report — Budget vs Actual** (landscape): as-of/KPI line + the
   `costReport` table (Budget/Actual/Committed/ETC/EFC/Variance/%/Reason).

The Budget toolbar's **Print** menu passes a design to `onPrintDesign` →
`setCustomReportPrint` → `ReportPrintDialog` (never a direct `window.print()`).
The Cost Report view's Print menu does the same with the Cost Report design.
**Save as design** clones the chosen design into `project.reportDesigns` via
`ADD_REPORT_DESIGN`; after that it is editable in Design → Reports Designer.
Hot Cost / Cashflow / Comparison templates belong to later phases.

## 6. Schedule-driven budget (integral, no sync button)

- `computeScheduleQuantities(project)` (`lib/budget/scheduleSync.ts`) reads the
  SAME canonical day model as the Day Manager/DOOD (`computeRowData` +
  `buildDayViews`): shoot days, prep/post days, per-crew-person and per-role
  days, cast days, location days and element days.
- **From schedule** builds a Feature chart plus linked lines: one set-operations
  day-rate line (account 2400, qty = shoot days), one line per working crew
  person (2100), one per working cast member (1400, description `N. NAME`), one
  per used location (3200). Rates start at zero — the schedule knows days, not
  money. The empty-state card previews the counts only.
- **Live links:** a line with `source` derives quantity at read time. Editing
  Qty on such a line stores `qtyOverride` (pin); Pin/Unpin in the line modal
  freezes/restores the schedule quantity. Linked quantities never mutate the
  stored `qty`; a missing target resolves 0 + an amber warning.
- The link covers **quantity only**. Rate is the stored `rateCents` (the
  `rateOverride` field is a data/agent seam with no UI yet).
- **No refresh/sync button exists or should be added.** The summary says how
  many lines follow the schedule; a locked version shows frozen values.
- System globals work without generation (`=SHOOT_DAYS * 2`); `WRAP_DAYS`/
  `WRAP_WEEKS` are currently 0 and prep/post weeks divide days by 5.

## 7. Later phases (forward-looking — do not treat as built)

### Phase 2 — Cost Report & Expenses — LANDED (2026-10-30)

See §4b. PO authoring is action/bridge-only (no PO modal yet).

### Phase 3 — Overtime

- Crew card header **Overtime** button (badge `Xh · $Y`) + root-owned
  `OvertimeModal` with Day / Departments / Crew / Cast segments; policy
  project → day → department → person; no-rate warning; Post to expenses creates
  `status='actual'`, `method='payroll'` expenses in one batch. Day meta holds
  the settings; the Day Manager never computes OT itself.
- Report fields: `crewRate/rateUnit/hours/otHours/otCost/dayCost`,
  `dayOvertimeHours/Cost`, `deptOtHours/Cost`, cast rate/per + OT.

### Phase 4 — Advanced

Version compare/Original-Variance, cashflow, incentives/credits, currency
report, AICP/episodic, approvals/petty-cash depth, MMB import/export. Each is
its own branch; no "advanced mode" half-built surfaces.

## 8. UI-kit gaps (actual)

- **`NumberInput` exists** and stays the one numeric primitive.
  `NumberField`, `MoneyField` (dollars at the field, cents at the boundary) and
  `PercentField` live in `src/components/budget/fields.tsx`; promote them if a
  second feature needs them.
- **`ColorField` already exists** and is reused by the group/category modals.
- **No generic `Stat`/KPI tile**: `SectionTile` is local to `BudgetView`.
- **No generic `EmptyState`**: `BudgetEmptyState` is a budget-specific screen
  with the three template cards; promote only if reused.
- **Already sufficient:** `Button`, `Seg`, `DropdownMenu`/`ItemManagerDropdown`,
  `Checklist`, `Modal`/`ModalFooter`/`ModalFooterButton`, `PageToolbar`,
  `ThemeScope`, `InlineGlideTable`, the kit control cells
  (`kitPickerCell`/`kitGlyphCell`/`kitGlyphGroupCell`), and the app canvas
  glyphs (`infoGlyphCell`, `colorSwatchCell`).

## 9. Prefs & state

- Project state: the entire `Budget` (chart, library, versions, settings).
- Local component state: focused category, open line/node/group modal.
- Persisted keys: only dialog `suppressKey`s
  (`lemon_schedule_budget_delete_{category,account,line,markup,version}`,
  `lemon_schedule_budget_delete_library`,
  `lemon_schedule_budget_import_replace`,
  `lemon_schedule_expense_delete`). No budget-specific view prefs; the cost
  report's as-of/period and the ledger filters are local view state.
- The budget is never in a second context/store; `BudgetTab` reads the project
  once and passes the model/readOnly down. Children take the store only for
  `dispatch`; no row component calls `useProject()`.
