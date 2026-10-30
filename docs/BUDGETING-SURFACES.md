# Budgeting — surfaces plan (UI, Day Manager, reports)

Status: **companion to `docs/BUDGETING.md`** (roadmap 334). The domain model,
engine, store and phases live there; the market evidence is
`docs/BUDGETING-RESEARCH.md`. This file owns the screens and the report block.

## 1. Budget tab — navigation & shell

- `src/lib/appNav.ts`: add `'budget'` to `AppTabId`, `TAB_LABELS` (`Budget`),
  `TAB_ORDER` (between Production and Reports; ⌘/Ctrl+8), and
  `SUB_TAB_LABELS.budget = { budget: 'Budget', cost: 'Cost Report', expenses:
  'Expenses', library: 'Library' }`.
- `src/components/AppHeader.tsx`: `TAB_ICONS.budget` (Wallet), tab row/popout.
- `src/App.tsx`: render `<BudgetTab subTab onSubTabChange headerTarget />`; add
  to popout maps and File → Print where appropriate.
- `isPhoneSupportedPlace` returns false for Budget in v1 (phone read-only
  summary/expense capture later); desktop/iPad are the authoring surfaces.
- All navigation goes through `go()`; never raw `setActiveTab`.
- PageToolbar: light, four sub-tabs, merged budget title/currency in the header
  portal. `ProjectChromeScope` supplies the project accent; no hand-written
  colours.

## 2. Budget view

### Layout

```
┌ toolbar: Templates · Generate · Add · View · Print · More ───────────────┐
│ KPI strip: Grand total · ATL · BTL · Post · Fringes · Contingency · Net  │
├──────────────┬──────────────────────────────────────────────────────────┤
│ Categories   │ Grid: Account/Description · Qty · Unit · Rate · X ·     │
│ 1000 ATL     │       Fringes · Total (+ optional columns)               │
│ 2000 Prod    │  ▸ 1000 ABOVE THE LINE                     1,350,000    │
│ ...          │    1100 Story & Rights                       120,000    │
│              │      1101 Screenplay purchase  1 Allow 120,000 120,000   │
├──────────────┴──────────────────────────────────────────────────────────┤
│ Footer: Fringes · Contingency · Grand total · % of budget by group       │
└─────────────────────────────────────────────────────────────────────────┘
```

- **Toolbar:** version picker (`ItemManagerDropdown` — create/rename/duplicate/
  select/delete/lock), `Templates`, `Add` (category/account/line/markup),
  `View` (columns, expand/collapse all, show zeros/fringes, currency, pin all
  linked), `Print`, `More` (Export CSV/JSON, Import CSV, Duplicate, Settings).
  No "sync" button — linked lines update live.
- **Summary strip:** Grand total, Above the line, Below the line, Post, Fringes,
  Contingency/markups, Net (credits later), % of budget by group.
- **Left rail:** categories with totals; search filters/jumps; collapses to
  icons on narrow screens. It is navigation, not a second tree editor.
- **Empty state:** `Blank`, `Feature`, `From schedule` cards + Import CSV. Both
  blank and schedule-generated budgets are first-class; a blank budget can link
  individual lines later. `budget === undefined` is the only trigger.
- **Linked lines:** a link badge on the row; `Pin` (quantity/rate override) and
  `Unpin` in the row menu; a "N lines follow the schedule" summary. A locked
  version shows a lock and frozen quantities.

### Grid rows

- Category header: number, name, group total, % of grand, disclosure.
- Account header: number, name, base/fringe/total, disclosure.
- Line: description, qty, unit, rate, X, fringe chips, total; optional groups/
  location/phase/notes.
- Markup/credit rows at the bottom.
- One sheet, expand in place (Saturation-style), with MMB keyboard/level
  shortcuts as accelerators. No separate Top Sheet/Accounts/Details screens.

### Columns

Default: Account/Description (frozen), Qty, Unit, Rate, X, Currency, Fringes,
Total. `Rate`/line `Subtotal` display in the line's currency; `Total` is the
base-converted amount (header `Total (base)`), with the line-currency value on
hover/in the row detail. Account/category/grand totals are base.
Optional: Use (suppress), Groups, Location, Set, Phase, Start/End, Cap, OT,
Notes. Cost columns belong to the Cost Report view, not here.

### Interactions

- Inline edit (money/percent/quantity/text), Enter/Tab, type-to-edit, copy/
  paste/fill/clear, multi-select, right-click insert line/account/category,
  duplicate, delete, apply fringe/group, expand/collapse, drag reorder within a
  level, column resize, keyboard navigation.
- Every operation commits on blur/Enter, never per keystroke. Bulk operations
  are one `BULK_UPDATE_BUDGET_LINES`/`BATCH` undo entry.
- Read-only (`locked`): hide add/delete/edit affordances; cells static;
  print/export remain.

### Glide wiring (reuse the fork; no second grid engine)

- Build `BudgetGrid` on the same `DataEditor` + `createGlideCellEditor` +
  `controlCellRenderers` + `createGlideTheme` + `useGlideFill`/`planGridPaste`
  used by `BreakdownTabGlide`/`InlineGlideTable`.
- `freezeColumns` pins Account/Description; horizontal scroll for the rest.
- Category/account rows are regular rows with `staticCell` totals and a
  `kitGlyphCell` chevron; expanding rebuilds the row list (cheap, memoized).
- Money cells: `kind:'money'` editor (overlay `MoneyField` built on the kit
  `NumberInput`, §10). Percent: `kind:'percent'`. Formula: `kind:'formula'`
  with global/line autocomplete.
- Unit/account/category pickers: `kitPickerCell` + shared `PickerField` editor;
  fringes/groups: multi-select chips.
- Row actions: `kitGlyphCell`/`kitGlyphGroupCell` in one actions column; no DOM
  per row.
- Selection/paste/copy/fill/undo use the existing Glide plumbing; a bulk commit
  calls `onCommit` once with an edits array.
- Presence: reuse the existing `InlineGlideTable` presence scope in phase E; no
  new presence engine.

### Versions

- Toolbar `ItemManagerDropdown` (same component as schedule/calendar versions):
  create, rename, duplicate, select, delete/restore, lock.
- The **chart of accounts + library are shared** across versions; each
  `BudgetVersion` owns its `lines`. `cloneBudgetVersion` maps line objects by
  reference (copy-on-write), so a new version does not deep-clone the chart or
  untouched lines. Trash: 30-day TTL + newest 10; never delete the last version.
- Locking a version freezes editing and pins every schedule-linked quantity so
  an approved budget cannot drift; unlocking does not silently unpin.
- Compare (two versions, variance) is phase 4; v1 versions are for scenarios,
  approvals and history.

### Per-user prefs (`src/lib/persist.ts`)

Collapsed rows, visible columns, sidebar width, cost filter, last template.
Never project state. Key names `lemon_schedule_budget_*`.

## 3. Cost Report view

- Toolbar: as-of `DatePicker` (default today), period menu (all / week / custom),
  level (accounts/lines), show zero, print, export CSV.
- KPI strip: Budget, Actual, Committed, EFC, Variance, % Used.
- Grid rows: category → account → line. Columns: Account/Description, Budget,
  Actual, Committed, ETC, EFC, Variance, % Used, EFC reason. Expand to lines.
- ETC is editable inline; a reason is prompted when EFC ≠ budget; approved
  overage is an optional column.
- Negative variance is red; positive is green; zero neutral. Colour is a
  secondary cue, never the only one (text/icon too).
- Account-level expenses without a line roll into an "Unallocated" child row.
- Empty/no-budget state links to Budget.

## 4. Expenses view

- Toolbar: `Add expense`, `Import CSV`, filters (date range, status, account,
  day, method), group by day/account, print expense detail.
- Table: Date, Description, Account, Vendor, Method, Status, Amount, PO.
- Footer totals: Actual, Committed, Petty cash, This period.
- Row click opens `ExpenseModal`; bulk select/approve is later.
- Read-only hides add/edit; the ledger still prints.

## 5. Library view

Editable tables (`InlineGlideTable` is a good fit):
Fringes (name/calc/rate/cutoff/groups/posting/color), Globals (symbol/
description/unit/value/formula; system rows read-only), Groups (name/color/
in-budget), Units (name/plural/type/hours), Currencies (code/symbol/rate to
base; the line picker uses this), Markups (name/kind/calc/percent/amount/scope/
marks up/compound/cap).
Each row shows "Used by N lines" + a "Where used" jump. Deleting an in-use
definition warns and offers convert-to-value (globals) or clear-from-lines
(fringes/groups).

## 6. Day Manager — Expenses card

### Wiring

- `src/lib/dayTabs.ts`: add `'expenses'` to `DAY_MANAGER_TABS` and its label.
- `daySectionRegistry.tsx`: add an `expenses` section (`wide: true`,
  `tabs: ['all','overview','expenses']`, `copyable: false`, `summary` = count +
  actual/committed total, `hideWhenEmpty: false` so the CTA always shows).
- `DayManagerPage.tsx`: add `expenses` to `DAY_TAB_OPTIONS` (Receipt icon) and
  own the Expense/Overtime modals at the root (like `AddCrewMemberModal`), so
  the copy modal/popout never nests a modal. Extend `DaySectionActions`:
  `openExpense?: (expenseId?: string) => void`, `openOvertime?: () => void`.
- `ExpensesSection.tsx`: the day's expenses (`project.expenses` filtered by
  `dayDate === day.date`, or `dayNumber === day.chronoDay`), compact table
  (Description, Account, Vendor, Status, Amount), Actual/Committed totals,
  `+ Add expense`, and a "Create a budget" CTA when `!project.budget`.
- `ExpenseModal.tsx`: date (default the day), account picker (grouped by
  category), optional line picker, description, vendor, amount, currency,
  method, status, PO link, receipt URL, notes. One `ADD/UPDATE_EXPENSE`; no
  per-keystroke saves. `MoneyField`; `SearchMenu`/`PickerField`.
- Copy-from-day: expenses are actuals and are **not** copied. Overtime settings
  are crew assumptions; include `overtime` in the crew section's `extract`.
- Call sheets: do not print costs/expenses/OT amounts on crew call sheets by
  default. Cost visibility is a producer/report-designer choice.
- Reports: `expensesOfDay` collection + `dayExpenseTotal`/`dayActualTotal`/
  `dayCommittedTotal`.

## 7. Overtime — Crew card button + modal

- `CrewSection.tsx` header gains an **Overtime** button (`Timer` icon) with a
  badge `Xh · $Y` (hours always; cost when rates exist) → `actions.openOvertime`.
  Shown in the Day Manager and day popout; hidden read-only when no OT data;
  disabled when no crew.
- `OvertimeModal.tsx` (kit `Modal` + `Seg` tabs Day / Departments / Crew / Cast):
  - Day: policy source (Project default / Day override), base hours, tiers,
    allowance, actual wrap, note; live totals.
  - Departments: one row per department with crew count, base/tier override,
    computed OT hours, cost; "Apply to all" / "Reset".
  - Crew: one row per assigned person (name, role, rate/unit, call, hours, OT
    hours, cost), per-person overrides; no-rate warning.
  - Cast: one row per cast member working the day (name, rate/per, work day,
    guarantee, OT hours, cost); default policy from `CastMember.overtime` /
    project preset; SAG-style tiers are editable, never hardcoded.
  - Footer: `Post to expenses` (ghost), Cancel (ghost), Save (hero). Posting
    asks one confirm (one expense per department vs one total) and creates
    `status='actual'`, `method='payroll'` expenses.
  - Estimates only; say so once, not on every row.
- Data flow: `computeDayOvertime(project, day)` resolves policy + rates; the
  modal writes `DayMeta.overtime` via `patchMeta` and expenses via dispatch.
  The Day Manager never computes OT itself.
- No date/wrap: use the section's computed wrap and label it "estimated from
  schedule". No call/rate: show hours only.
- Budget projection: schedule-driven lines may use the same policy to estimate
  crew/cast OT in the budget (phase F); actual OT in the modal is independent.

## 8. Reports Designer + print

### New block

`ReportBlock.type` gains `'budgetTable'`:

```ts
budgetMode?: 'topsheet' | 'accounts' | 'lines' | 'costReport' | 'hotCost' | 'cashflow' | 'comparison';
budgetCategories?: string[];   // selected category ids; unset = all
budgetAccounts?: string[];     // selected account ids; unset = all
budgetColumns?: string[];      // subset of the mode's columns
showZero?: boolean;
showFringes?: boolean;
showNotes?: boolean;
showPercent?: boolean;
costAsOf?: string;             // ISO; unset = print date
costPeriod?: { from: string; to: string };
```

- A leaf like `callTimes`/`crewTable`; top level and in `columns`, not inside
  `days` for budget modes. `hotCost` is the only day-scoped mode and may sit
  inside a `days` repeat.
- Read model: `src/lib/reportBudget.ts` (rows per mode, columns, totals) built
  from `computeBudget`/`computeCostReport`; never re-derive in the view.
- Renderer: `reports/ReportBudgetTable.tsx` reuses `ReportGridBlock`'s
  `.report-table-cols`/`.rm-row` recipe, `data-rm-header` for page-break header
  repetition, and the existing paginator. Category/account headers are
  keep-with-next (never strand at a page bottom).
- `reportBlocks.ts`: add to `TITLED_BLOCK_TYPES`/`titleRepeatable`/
  `reportTitleAutoLabel`; `blockControls.tsx` gets a Budget section (mode,
  categories/accounts multi-picker, columns, zero/fringes/notes/percent,
  as-of/period); palette entry in a "Budget" group.
- `ReportBlockView.tsx`: add the case; pass `ctx.budget`/`ctx.costReport`.
- `ReportCtx` gains `budget?: BudgetModel` (computed once in `buildReportCtx`)
  and `costReport?: CostReportModel` (computed for the filter).
- Money formatting: `ReportFieldDef.money?: boolean`, right-aligned; `get`
  returns `formatBudgetMoney(ctx, cents)`. Add `scope: 'budget'` fields for
  cover/exec text: `budgetGrandTotal`, `budgetAtl`, `budgetBtl`, `budgetPost`,
  `budgetFringes`, `budgetContingency`, `budgetNet`, `budgetActual`,
  `budgetCommitted`, `budgetEfc`, `budgetVariance`.

### Collections + fields

Add to `ReportCollection`: `budgetCategories`, `budgetAccounts`, `budgetLines`,
`costReport`, `expenses`, `expensesOfDay`, `purchaseOrders`.

- `budgetCategories`/`budgetAccounts`/`budgetLines` — base collections with
  budget fields; `budgetLinesOfAccount` as a contextual child of
  `budgetAccounts` for account-detail repeats.
- `costReport` — one item per account (or line) with Budget/Actual/Committed/
  ETC/EFC/Variance/%Used/Reason; `costReportOfAccount` child optional.
- `expenses` — base ledger; `expensesOfDay` — contextual child of `days`.
- `purchaseOrders` — base ledger.
- `fieldScopeFor` maps each to its scope; `reportBlocks.ts`
  `COLLECTION_LABELS`/`COLLECTION_ORDER`/`NON_SCOPABLE_COLLECTIONS` updated.
- Field families: `budget*`, `cr*`, `expense*`, `po*`; crew fields gain
  `crewRate`, `crewRateUnit`, `crewHours`, `crewOtHours`, `crewOtCost`,
  `crewDayCost`; day fields gain `dayExpenseTotal`, `dayActualTotal`,
  `dayCommittedTotal`, `dayOvertimeHours`, `dayOvertimeCost`; department fields
  gain `deptOtHours`, `deptOtCost`.

### Built-in print templates

`src/lib/budget/reportTemplates.ts` returns transient `ReportDesign` objects
(not seeded into every project):

1. **Budget — Top Sheet** (landscape): cover optional; Account, Name, %, Page,
   Subtotal, Fringes, Total; summary rows; page numbers.
2. **Budget — Account Detail** (landscape): category/account headers, lines,
   subtotals, notes; repeating headers.
3. **Cost Report** (landscape): KPI row; Budget/Actual/Committed/ETC/EFC/
   Variance/%Used/Reason; category/grand totals; as-of date; signature.
4. **Budget Health** (portrait, 1 page): grand total, ATL/BTL/Post, fringes,
   contingency, net, cost per shoot day, cast/crew days, top accounts.
5. **Hot Cost** (phase D/E, day-scoped).
6. **Cashflow** (phase G).
7. **Budget Comparison** (phase G).

The Budget tab's **Print** menu opens `ReportPrintDialog` with these designs;
"Save as design" clones one into `project.reportDesigns` via
`ADD_REPORT_DESIGN` so it becomes editable in Design → Reports Designer. Never
auto-seed all projects with budget designs.

### Custom blocks & exports

- **Custom blocks:** use the existing block tree (`text`, `field`, `repeat`,
  `table`, `columns`, `image`, …) over the new budget collections/fields. A
  `budgetTable` leaf is only for subtotal/total rows that generic repeats cannot
  express. A genuinely new visual (e.g. budget-health bars) is a new leaf in the
  same `ReportBlock` union/renderer — never a parallel report engine.
- **PDF:** the existing `ReportPrintDialog` → `ReportPrint` → measured
  paginator. Built-in budget designs are transient; "Save as design" clones one
  into `reportDesigns`.
- **CSV/JSON:** `lib/budget/export.ts` serialises the current version's lines,
  the cost report, or the full budget; Budget → Export and a `budgetTable`
  block's export action use it. No XLSX dependency in v1 (CSV opens in Excel).
- **Formula field:** the Glide `kind:'formula'` editor is a lightweight `=`
  expression input with global/line autocomplete. Reuse `TOKEN_RE`/`parseToken`
  and the `#REF!`/`#VALUE!` conventions; the arithmetic evaluator lives in
  `lib/budget/formula.ts` (the report free table is a token/cell-ref resolver,
  not an arithmetic engine).
- **Print scope:** the dialog selects categories/accounts; cost reports choose
  as-of/period. Never print without the dialog.

### Print mechanics to verify

- Header repeats on continuation pages; category/account headers keep with the
  next row; totals never orphan.
- Money right-aligned, negatives per `BudgetSettings.negativeStyle`; zero rows
  hidden by default in prints, shown in the editor.
- Page numbers/cover/header/footer use the existing report system.
- No direct `window.print()`; always the dialog + `ReportPrint` ready signal.

## 9. Schedule-driven budget (integral, no sync button)

- `computeScheduleQuantities(project)` counts shoot days, prep/wrap/post weeks,
  per-crew-role/person days across production days, cast work/hold/travel days
  (`deriveDood`/`elementDayStats`), location days (master + keys), element days,
  crew headcount per shoot day. Built once per read model from the same
  day/section data the stripboard/DOOD use.
- **Live links, not a sync step:** a line with `source` derives its quantity at
  read time. Editing qty sets `qtyOverride` (pin); editing rate sets
  `rateOverride`. Unlinked/manual lines never change. A locked budget version
  pins every linked line so an approved budget cannot drift.
- **Creation:** the new-budget picker offers `Blank`, `Feature`, `From
  schedule`. "From schedule" runs a preview wizard (crew labour, cast labour,
  location fees, per-day costs; department→account mapping; totals) and creates
  linked lines. Individual manual lines can be linked later via the row menu.
- **No "refresh" button:** the schedule changes, linked quantities follow. Show
  a link badge and a "N lines follow the schedule" summary; a locked version
  shows frozen values. No hidden overwrite of manual numbers.
- Crew labour: role/person day rate × days + OT estimate + fringes; one line per
  person/role (user can group). Cast labour: one line per cast member (`qty` =
  work days or weeks from `per`). Locations/elements only when the record has a
  rate.
- Rate book: role/person rates first; union/agency rate packs are editable JSON,
  never live-fetched. No hardcoded legal rates. Rate changes do not auto-rewrite
  existing lines (only quantities are live-linked by default).
- System globals work without generation: users can type `=SHOOT_DAYS * 2` in a
  qty field.
- **Industry note:** MMB/Hot Budget are manual; Storiara/Rivet/Filmustage
  generate drafts and expect review; no tool silently rewrites an approved
  budget. Lemon's live-link + pin + lock is the middle ground: automatic while
  authoring, frozen when approved.

## 10. UI-kit gaps (corrected)

**`NumberInput` already exists** — free-typed draft, clamp, Enter/blur, Escape,
steppers, arrow keys, drag-to-scrub. Do not build a second numeric primitive.

**Small additions needed:**
1. **`NumberInput` `suffix`/`prefix`** (or a thin `MoneyField`/`PercentField`
   wrapper) — currency symbol/grouping/negatives and `%` display. The engine
   stays the kit `NumberInput`; the wrapper only formats/parses.
2. **`MoneyField` / `PercentField`** (app-level first, promote if reused) — the
   two adapters above, using minor units at the boundary.
3. **`Stat` / `Metric`** — *this does not exist yet*; it was my proposed KPI
   tile (label, value, sublabel, tone) for the budget/cost header. `CardSection`
   can cover v1; promote only if a second consumer appears.
4. **`EmptyState`** — *does not exist yet*; a reusable icon/title/description/
   action block for empty tables/pages. Build app-level first; promote if reused.

**Nice-to-have:** `TreeList` (category rail), `FormulaInput` (expression +
autocomplete), publishing the kit's full `GlideSheet`, a `Money` formatter,
`Chart`/`Sparkline`.

**Already sufficient:** `Button`, `Seg`, `PickerField`, `SearchMenu`,
`EntityDropdown`, `DatePicker`, `Checklist`, `NumberInput`, `Modal`/
`ModalFooter`/`ModalFooterButton`, `ContextMenu`, `Tooltip`, `CardSection`,
`ThemeScope`/`ProjectChromeScope`, `useSlidingPill`, `TabFace`, and the Glide
control cells (`kitPickerCell`, `kitGlyphCell`, `kitGlyphGroupCell`).


