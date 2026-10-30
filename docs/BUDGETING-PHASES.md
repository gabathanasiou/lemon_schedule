# Budgeting — AI phase work packages

Status: **execution guide for roadmap 334.** Read `docs/BUDGETING.md` (model,
engine, store), `docs/BUDGETING-SURFACES.md` (UI/Day Manager/reports) and
`docs/BUDGETING-RESEARCH.md` (market evidence) first. This file turns the plan
into complete, AI-executable phases: scope, exact seams, actions, acceptance
criteria, tests, docs and pitfalls.

## 0. How an agent should work

**Read order before coding:** `AGENTS.md` → `docs/BUDGETING.md` →
`docs/BUDGETING-SURFACES.md` → `docs/STORE-AND-SYNC.md` →
`docs/REPORTS-DESIGNER.md` → `docs/GLIDE-BREAKDOWN.md` →
`docs/UI-PRIMITIVES.md` → `docs/TESTING.md` → `docs/SECURITY.md`.

**One phase per branch/worktree.** If another agent is active, load the
`parallel-work` skill. Do not start phase 2/3/4 before phase 1's acceptance
criteria pass. Within a phase, commit in this order:

1. types + migration + factories + store actions/cases + `ACTION_TYPES`
2. pure engine + Vitest
3. UI surfaces (grid/views/modals)
4. report fields/collections/block + print
5. e2e + manual pass + docs + roadmap + version bump

**Definition of done for every phase:**
- `npm run lint` clean (tsc + doc budget + e2e lint).
- `npm run test:unit` green; new pure maths has tests.
- Full Playwright suite for any logic/data/store change (rule 7), or the
  smart subset during work; never claim done on a failing suite.
- Manual visual check per `docs/TESTING.md` for anything a human can confirm by
  looking (columns, alignment, chips, modal layout, print pagination).
- `docs/ROADMAP.md` phase status updated; `docs/BUDGETING*.md` corrected if the
  implementation diverges; `AGENTS.md` one-line pointer added at phase 1 wrap.
- `docs/API.md` + `npm run mcp:schema` updated when actions/factories change.
- Version bump at the phase wrap (one bump per phase/work, not per commit).

**AI guardrails (MUST NOT):**
- No second budget engine, grid engine, report engine, store/context, or modal
  shell. Reuse `computeBudget`/`computeCostReport`, the Glide fork, the Reports
  Designer block tree, `useProject()` once per surface, kit primitives.
- No per-row `useProject()`; no deriving totals in a component; no mutating
  computed rows; no `any` casts for budget shapes.
- No per-keystroke persistence; commit on blur/Enter, bulk ops in one
  `BATCH_START`/`BATCH_COMMIT`.
- No hardcoded union/legal rates, no bank/SSN/card data, no receipt blobs.
- No in-app AI/model calls. The bridge/MCP is the only agent seam.
- No "sync" button. Schedule links are live; pin/lock is the control.

**Debug bridge / MCP (every phase):** all writes go through the same `Action`
union the UI uses; add `makeBlankBudget`, `makeBudgetVersion`, `makeBudgetLine`,
`makeExpense`, `makePurchaseOrder` factories and a `budgetSummary()` read helper
to `src/lib/debugBridge.ts`. Run `npm run mcp:schema`; verify a bridge read/write
and a viewer write refusal in e2e.

---

## Phase 1 — Budget authoring, versions & reports

### Goal
A complete authoring tool: create a budget (blank or from schedule), edit the
chart/details, use fringes/globals/groups/units/markups, switch versions, and
print/export it through the Reports Designer. No cost tracking, no overtime yet.

### Data (`src/types.ts`)
Add exactly the types in `docs/BUDGETING.md` §3:
`BudgetCategory`, `BudgetAccount`, `BudgetLine`, `BudgetLineSource`,
`BudgetFringe`, `BudgetFringeRange`, `BudgetGroup`, `BudgetGlobal`,
`BudgetUnit`, `BudgetCurrency`, `BudgetMarkup`, `BudgetSettings`, `Budget`,
`BudgetVersion`, `BudgetVersionTrashItem`; `Project.budget?: Budget`.
`Budget` has `versions`, `activeVersionId`, `versionTrash`; the chart/library
(fringes/groups/globals/units/currencies/markups/settings) is **shared** across
versions. `BudgetLine` has `source`, `qtyOverride`, `rateOverride`.

### Store (`src/store/actions/budget.ts` + `reducer.ts`)
Actions (also in `ACTION_TYPES`):
`ADD/UPDATE/DELETE_BUDGET_CATEGORY`, `..._ACCOUNT`, `..._LINE`,
`BULK_UPDATE_BUDGET_LINES`, `SET_BUDGET_LIBRARY`, `UPDATE_BUDGET_SETTINGS`,
`APPLY_BUDGET_TEMPLATE`, `IMPORT_BUDGET`; `NEW/RENAME/DELETE/RESTORE/SET_ACTIVE/
LOCK/UNLOCK_BUDGET_VERSION`; `LINK/UNLINK/PIN/UNPIN_BUDGET_LINE`.

- `makeBlankProject` leaves `budget` undefined; `makeBlankBudget` creates one
  version (`v01`), default units/currencies/settings.
- `migrateBudget(project)` idempotent (arrays/defaults/legacy aliases) in
  `loadBaseline` and import paths; never auto-create on load.
- `cloneBudgetVersion` shares the chart/library and maps line objects by
  reference (COW); editing a line replaces only that line object.
- `pruneBudgetVersionTrash` (30-day TTL + newest 10) in `storage.ts`; prune on
  load/delete. Never delete the last version.
- `lockBudgetVersion(project, versionId)` pure helper computes `pinned`
  quantities from the schedule and returns `LOCK_BUDGET_VERSION`; the reducer
  never computes schedule quantities.
- Version picker reuses kit `ItemManagerDropdown` (create/rename/duplicate/
  select/delete) with `theme="light"`, label "Budget"; delete goes to
  `versionTrash`; lock is a separate menu action.
- Bulk edits = one `BULK_UPDATE_BUDGET_LINES`; pastes/fills/applies fringe are
  one undo entry.

### Engine (`src/lib/budget/`)
`model.ts` (factories/defaults/templates), `formula.ts` (numbers/operators/
globals/`{{line.*}}` arithmetic, no `eval`, cycle/unknown = `#ERR`), `calc.ts`
(`computeBudget(project)` over the active version + schedule quantities),
`fringes.ts` (percent/fixed/flat, cutoff, ranges, posting, rounding),
`format.ts` (money/percent), `scheduleSync.ts` (`computeScheduleQuantities`,
source resolution), `templates/feature.ts`, `templates/blank.ts`,
`reportTemplates.ts`, `export.ts` (CSV/JSON).
- `effectiveQty = source && qtyOverride == null ? scheduleQty(source) : qtyOverride ?? qty`;
  `effectiveRate = rateOverride ?? rateCents`.
- Line base/fringe/total in cents, round half-up at the line only.
- Format-linked lines never mutate stored `qty`; the computed model carries the
  derived value. A missing source target is a `BudgetError` (show 0 + warning,
  never crash).
- `computeScheduleQuantities` uses the same day/section/DOOD data as the
  stripboard/DOOD; pass it in from `useDaybreakSections`/`useDayViews` rather
  than re-deriving inside the budget engine. Memoize once per surface.
- `lockBudgetVersion` pins all linked quantities so an approved version cannot
  drift when the schedule changes.

### UI (`src/components/budget/`)
`BudgetTab.tsx` root (project read once, sub-tab, prefs, modals), `BudgetView`,
`BudgetToolbar`, `BudgetSidebar`, `BudgetGrid`, `BudgetSummaryBar`,
`BudgetTemplatesModal`, `BudgetVersionMenu` (wraps `ItemManagerDropdown`),
`LibraryView` + `FringesTable`/`GlobalsTable`/`GroupsTable`/`UnitsTable`/
`CurrenciesTable`/`MarkupsTable`, `BudgetSettingsCard`, `FormulaField`.
- App nav: add `'budget'` to `AppTabId`, labels/order (⌘8), sub-tabs, AppHeader
  icon, App.tsx render/popout. Route through `go()`.
- Grid: Glide fork, frozen Account/Description, expandable category/account/
  line rows, static totals, `kitGlyphCell` chevrons/actions, `kind:'money'`/
  `'percent'`/`'formula'` editors, `MoneyField`/`PercentField` on the kit
  `NumberInput`.
- Empty state: `Blank`, `Feature`, `From schedule`; Import CSV. Blank is
  first-class; "From schedule" previews lines then creates linked lines.
- Row menu: insert/duplicate/delete, apply fringe/group, pin/unpin, link/unlink,
  notes. Locked version/read-only hides edits.
- Library: editable tables; "used by N lines" + where-used; delete in-use warns.

### Reports (`src/lib/reportBudget.ts`, `src/components/reports/`)
- `ReportBlock.type` += `'budgetTable'` with `budgetMode`/category/account/
  columns/zero/fringes/notes/percent; leaf; allowed top-level/in `columns`.
- `ReportCtx` += `budget: BudgetModel` (computed once in `buildReportCtx`).
- `ReportCollection` += `budgetCategories`, `budgetAccounts`, `budgetLines`,
  `budgetLinesOfAccount`; fields for budget/category/account/line money and
  totals; `fieldScopeFor`/`reportBlocks.ts` labels/order/validity; `money`
  marker/right alignment.
- `reports/ReportBudgetTable.tsx` reuses `ReportGridBlock`'s `.report-table-cols`
  / `.rm-row` recipe + `data-rm-header` + the paginator; keep-with-next for
  category/account headers.
- Built-in transient designs (`lib/budget/reportTemplates.ts`): Top Sheet,
  Account Detail, Budget Health. Budget → Print opens `ReportPrintDialog`;
  "Save as design" uses `ADD_REPORT_DESIGN`.
- `Budget → Export` CSV/JSON via `lib/budget/export.ts`; no XLSX dep.
- Formula input: expression field in the grid with global/line autocomplete;
  reuse `TOKEN_RE`/`parseToken` and `#REF!`/`#VALUE!` conventions where useful,
  but keep the arithmetic evaluator in `lib/budget/formula.ts` (the report free
  table is token/cell-ref resolution, not arithmetic).

### Acceptance (phase 1)
1. New project → Budget tab shows the empty state; Blank/Feature/From schedule
   each create a valid budget with one version.
2. Feature template creates categories/accounts; adding a line and editing
   qty/rate/X updates account/category/grand totals; undo/redo work.
3. Fringes (percent/fixed/flat/cutoff/range), globals/formulas, groups,
   units, markups/contingency compute correctly and survive reload.
4. Per-line currency: change a line's currency/rate; its `Total (base)` converts,
   account/grand totals stay base, missing rate warns, and a currency-round-trip
   survives reload.
5. Versions: create from current, rename, switch, duplicate, delete/restore,
   lock/unlock; last version cannot be deleted; editing an account name shows in
   every version (chart shared); duplicate lines are COW until edited.
6. Schedule link: a line linked to shoot days changes when the calendar's
   production-day count changes; pinning freezes it; locking a version freezes
   all linked lines; manual lines never change. No sync button exists.
7. Blank budget stays manual; a line can be linked later; generated lines are
   previewed before creation.
8. Top Sheet/Account Detail/Budget Health print with correct totals, repeated
   headers, page numbers and money formatting; "Save as design" creates an
   editable design.
9. CSV/JSON export round-trips the active version; viewer read-only hides edits
   and the bridge/MCP refuses writes.
10. `ItemManagerDropdown` version menu matches schedule/calendar behaviour; trash
   restore works; project file size stays sane at 1,000 lines.
11. No per-row `useProject()`, no second report/grid engine, no hardcoded rates.

### Tests/docs
Vitest: line maths/rounding, fringe cutoff/range, formula cycles, markup scope/
compound, version COW/lock, schedule source resolution, template apply. E2E:
create-from-template, edit/totals/undo/reload, version switch/lock, schedule
change→linked qty, print, export, viewer refusal. Docs: `BUDGETING*.md`,
`REPORTS-DESIGNER.md`, `UI-KIT.md`, `API.md`, `AGENTS.md` pointer, roadmap.
Extend `scripts/smart-test.mjs` `RULES` with budget specs.

### Pitfalls
- Do not put `budget` in a new context/store; it is project state.
- Do not clone the chart/library per version; share them.
- Do not deep-clone lines on version create; COW only.
- Do not compute schedule quantities inside the reducer; pass pinned values.
- Do not use the rich-text token editor for the Glide formula cell.
- Do not print without `ReportPrintDialog`.

---

## Phase 2 — Cost tracking

### Goal
Turn the budget into a live cost report: expenses, POs, actual/committed/ETC/
EFC/variance, and a Day Manager Expenses card.

### Data/store
`Expense`, `PurchaseOrder` types in `src/types.ts`; `Project.expenses`,
`Project.purchaseOrders`. Actions: `ADD/UPDATE/DELETE_EXPENSE`,
`BULK_ADD_EXPENSES`, `ADD/UPDATE/DELETE_PURCHASE_ORDER`. Expenses are
project-level; the Day Manager filters `dayDate`/`dayNumber` (never stores the
ledger in day meta). Seeds/factories + migration.

### Engine
`lib/budget/costReport.ts`: `computeCostReport(project, { asOf, from, to })`
returning account/line rows with Budget/Actual/Committed/ETC/EFC/Variance/
%Used/Reason and an "Unallocated" child for account-level expenses. ETC default
`max(0, budget − actual − committed)`; override/reason; approved overage.
POs optional: committed = committed expenses + open PO remaining.

### UI
`CostReportView` (as-of/period, KPI strip, expandable rows, inline ETC/reason),
`ExpensesView` (filters/group/add/import), `ExpenseModal`; `ExpenseSection` in
the Day Manager (`dayTabs`, registry, `DAY_TAB_OPTIONS`, root-owned modal,
`DaySectionActions.openExpense`). `CostReport`/`Expenses` sub-tabs become live.
Read-only hides edits.

### Reports
`costReport`, `expenses`, `expensesOfDay`, `purchaseOrders` collections/fields;
`budgetTable` modes `costReport`; cost report print template; expense CSV.
`expensesOfDay` fields: date/description/account/vendor/amount/status/method/
PO/day; day totals. Cost report `cr*` fields.

### Acceptance/tests/docs
Expense → actual in the cost report; committed; ETC/EFC/variance; account-level
unallocated; PO commitment; Day Manager add/edit/reload; period/as-of; print;
CSV; viewer/bridge refusal; 500 expenses perf. Vitest cost-report maths; e2e
expense/day/print. Docs: `BUDGETING*.md`, `REPORTS-DESIGNER.md` (collections/
fields), `API.md`, roadmap.

---

## Phase 3 — Overtime

### Goal
Crew + cast overtime from the day's calls/wrap, with project/day/department/
person overrides, a Crew card modal, and post-to-expenses.

### Data/store
`OvertimeTier`, `OvertimePolicy` on `ProductionInfo`, `OvertimeOverride`,
`DayOvertime` on `DayMeta`; `CrewPerson.rateCents/rateUnit/guaranteeHours/
overtime`, `CastMember.guaranteeHours/overtime`. No new action for OT settings:
use `patchDayMeta`/`UPDATE_ROW`; posting is `BULK_ADD_EXPENSES`. Add `Cast`
tab fields to the existing cast details modal/rate columns in Crew Manager.

### Engine
`lib/budget/overtime.ts`: `resolveOvertimePolicy(project, day, dept, person)`,
`computeDayOvertime(project, day)`, `computeCrewOvertime`, `computeCastOvertime`.
Effective policy project → day → dept → person; hours from actualWrap/call or
override; guarantee/rate basis; tiers/allowance; 6th/7th day; fringes optional.
No hardcoded union rules; presets editable. `lockBudgetVersion` interaction:
OT actuals are expenses, not line values; a locked budget cannot have line edits.

### UI
Crew card header **Overtime** button + badge (`Xh · $Y`); root-owned
`OvertimeModal` with `Seg` tabs Day/Departments/Crew/Cast; computed rows,
overrides, no-rate warning, `Post to expenses` confirm; `DaySectionActions.
openOvertime`; copy-day includes `DayMeta.overtime` via crew extract. Read-only
hides/disable.

### Reports
Crew fields `crewRate/rateUnit/hours/otHours/otCost/dayCost`; day fields
`dayOvertimeHours/Cost`, `dayExpenseTotal`; department fields `deptOtHours/
Cost`; cast fields (rate/per, OT hours/cost). Existing `crewOfDay`/
`departmentCallsOfDay` collections consume them.

### Acceptance/tests/docs
Policy resolution; crew/cast hours/cost; no-rate hours; post-to-expenses batch;
copy-day; lock/version; report fields; viewer refusal. Vitest OT maths; e2e
modal/post/reload. Docs: `BUDGETING-SURFACES.md` §7, `REPORTS-DESIGNER.md`,
`API.md`, roadmap.

---

## Phase 4 — Advanced (separate sub-packages)

Ship each as its own branch/PR; do not bundle.

1. **Version compare + Original/Variance.** Match accounts by number; two
   compare versions; read-only compare mode; `original` snapshot; variance
   columns. Reuse `ItemManagerDropdown`/`reportTemplates`.
2. **Cashflow.** Line phase/start/end/spread; weekly/monthly tranches; holdback;
   `budgetTable` cashflow mode; landscape print + CSV.
3. **Incentives/credits.** `BudgetIncentive` definitions; qualified groups/
   tags/locations; cap types QS/CR; discount; net total; incentive summary print.
4. **Multi-currency UI.** Per-line currency/fx UI, currency report, rate table;
   base totals stay cents.
5. **AICP / episodic.** Commercial template + bid form; pattern/amort and
   per-episode topsheets; only if the app supports episodes.
6. **Approvals / petty cash depth.** PO/invoice approvals, petty cash envelopes,
   reconciliation; role-gated.
7. **MMB import/export.** CSV/Excel bridge first; binary MMB only if a stable
   format/mapping is verified.

Each sub-package gets its own acceptance/tests/docs; no "advanced mode" flag
that leaves half-built surfaces live.

---

## Cross-phase checklist

- **Actions:** every new type in `Action` + `ACTION_TYPES`; bridge/MCP schema
  regenerated; write refusal tested.
- **Selectors:** one `computeBudget`/`computeCostReport` per surface; memoized;
  no component arithmetic.
- **Versions:** chart/library shared; lines COW; lock freezes links; trash
  bounded.
- **Schedule:** no sync button; linked quantities live; pin/unpin; locked
  versions frozen; missing source is a warning not a crash.
- **Reports:** one block tree/renderer/paginator; budget fields/collections;
  money formatting; print dialog always.
- **Kit:** reuse `NumberInput`; add only suffix/MoneyField/PercentField; no
  duplicate primitives.
- **Perf:** 1,000 lines + 500 expenses; tab-switch/edit timings; file size.
- **Security:** no secrets; viewer read-only; sharing warning; security-review
  relevance check when touching roles/room writes.
