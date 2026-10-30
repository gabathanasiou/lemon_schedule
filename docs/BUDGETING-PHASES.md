# Budgeting — AI phase work packages

Status: **execution guide for roadmap 334.** **Phases 1-2 are LANDED
(2026-10-30)** — their shipped reality is recorded in the phase sections and
the two companion manuals. Phases 3-4 are forward-looking. Read
`docs/BUDGETING.md` (model, engine, store), `docs/BUDGETING-SURFACES.md`
(UI/Day Manager/reports) and `docs/BUDGETING-RESEARCH.md` (market evidence)
first. This file turns the plan into complete, AI-executable phases: scope,
exact seams, actions, acceptance criteria, tests, docs and pitfalls.

## 0. How an agent should work

**Read order before coding:** `AGENTS.md` → `docs/BUDGETING.md` →
`docs/BUDGETING-SURFACES.md` → `docs/STORE-AND-SYNC.md` →
`docs/REPORTS-DESIGNER.md` → `docs/GLIDE-BREAKDOWN.md` →
`docs/UI-PRIMITIVES.md` → `docs/TESTING.md` → `docs/SECURITY.md`.

**One phase per branch/worktree.** If another agent is active, load the
`parallel-work` skill. Do not start phase 3/4 before phase 2's acceptance
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
  shell. Reuse `computeBudget` (`computeCostReport` once phase 2 lands), the
  shared `InlineGlideTable`/Glide recipe, the Reports Designer block tree,
  `useProject()` once per surface, kit primitives.
- No per-row `useProject()`; no deriving totals in a component; no mutating
  computed rows; no `any` casts for budget shapes.
- No per-keystroke persistence; commit on blur/Enter, bulk ops in one
  `BATCH_START`/`BATCH_COMMIT`. No hardcoded union/legal rates, no bank/SSN/card
  data, no receipt blobs.
- No in-app AI/model calls. The bridge/MCP is the only agent seam.
- No "sync" button. Schedule links are live; pin/lock is the control.

**Debug bridge / MCP (every phase):** all writes go through the same `Action`
union the UI uses. Phase 1 shipped `makeBlankBudget`, `makeBudgetVersion`,
`makeBudgetLine` and `budgetSummary()` in `src/lib/debugBridge.ts` (plus the
derived MCP action schema); phase 2 adds `makeExpense`/`makePurchaseOrder`,
phase 3 the overtime factories if they are needed. Run `npm run mcp:schema`;
verify a bridge read/write and a viewer write refusal in e2e.

---

## Phase 1 — Budget authoring, versions & reports — LANDED

### Status (2026-10-30)
Shipped: types/factories/migration, engine, store actions, Budget/Library, the
shared `InlineGlideTable` sheet, line/node/group modals, `budgetTable` +
collections/fields/prints, CSV/JSON, bridge `budgetSummary`, unit + e2e.
Divergences (authoritative): no `{{line.*}}` refs; shared grid (no Glide fork);
fringe ranges are engine/data-only (group tags editable); Create = blank and
Duplicate = clone; lock pins via `lockBudgetVersion`, unlock does not unpin;
JSON import only; markup scope/caps not editable. Phase 2 replaced the
Cost Report/Expenses placeholders and added the `costReport` mode.

### Goal
A complete authoring tool: create a budget (blank, feature or from schedule),
edit the chart/details, use fringes/globals/groups/units/markups, switch
versions, and print/export it through the Reports Designer. No cost tracking,
no overtime yet.

### Data (`src/types.ts`)
Shipped: `MoneyCents`, `BudgetGroupKind`, `BudgetLineKind`,
`BudgetCategory`, `BudgetAccount`, `BudgetLine`, `BudgetLineSource`,
`BudgetFringe`, `BudgetFringeRange`, `BudgetGroup`, `BudgetGlobal`,
`BudgetUnit`, `BudgetCurrency`, `BudgetMarkup`, `BudgetSettings`, `Budget`,
`BudgetVersion`, `BudgetVersionTrashItem`, `Project.budget?: Budget`.
`Budget` has `versions`, `activeVersionId`, `versionTrash`; the chart/library
(fringes/groups/globals/units/currencies/markups/settings) is **shared** across
versions. `BudgetLine` has `source`, `qtyOverride`, `rateOverride` (the last is
a data seam only — no UI writes it in phase 1).
`Expense`/`PurchaseOrder` (phase 2) and the overtime types (phase 3) are NOT in
`types.ts` yet; do not add them without their phase.

### Store (`src/store/actions/budget.ts` + `reducer.ts`)
Actions (also in `ACTION_TYPES`):
`ADD/UPDATE/DELETE_BUDGET_CATEGORY`, `..._ACCOUNT` (DELETE payload
`{ id, reassignToId? }`), `..._LINE`, `BULK_UPDATE_BUDGET_LINES`,
`SET_BUDGET_LIBRARY` (key `fringes|groups|globals|units|currencies|markups|
fringeRanges`), `UPDATE_BUDGET_SETTINGS`, `APPLY_BUDGET_TEMPLATE { key:
'blank'|'feature', id? }`, `IMPORT_BUDGET { budget }`;
`NEW/RENAME/DELETE/RESTORE_BUDGET_VERSION_FROM_TRASH/SET_ACTIVE/LOCK/UNLOCK_
BUDGET_VERSION`; `LINK/UNLINK/PIN/UNPIN_BUDGET_LINE`.

- `makeBlankProject` leaves `budget` undefined; `makeBlankBudget` creates one
  version (`v01`), default units/currencies/groups/settings.
- `migrateBudget(project)` idempotent in the reducer's `LOAD` (every load path);
  never auto-creates.
- `cloneBudgetVersion` shares the chart/library and maps line objects by
  reference (COW); editing a line replaces only that line object.
- `pruneBudgetVersionTrash` (30-day TTL + newest 10) in `model.ts`; pruned on
  load and delete. Never delete the last version.
- `lockBudgetVersion(project, versionId)` lives in `scheduleSync.ts` and is
  pure: it computes `pinned` quantities from the schedule; the **UI** calls it
  and dispatches `LOCK_BUDGET_VERSION`. The reducer only applies the map and
  never computes schedule data. `UNLOCK_BUDGET_VERSION` does not unpin.
- Version picker reuses kit `ItemManagerDropdown` (create/rename/duplicate/
  select/delete/trash) with `theme="light"`, label "Budget"; Create and
  Duplicate both clone the active version (COW); lock is a separate button.
- Bulk edits = one `BULK_UPDATE_BUDGET_LINES`; pastes/fills/fringe or group
  creation are one `BATCH_START`/`BATCH_COMMIT` undo entry.

### Engine (`src/lib/budget/`)
`model.ts` (factories/defaults/version helpers/trash/migration), `formula.ts`
(numbers, `+ - * /`, parentheses, unary minus, global symbols; no `eval`, no
functions, no `{{line.*}}` cross-line refs; `#REF!`/`#DIV/0!`/`#VALUE!`/
`#CYCLE!`), `calc.ts` (`computeBudget(project)` over the active version +
schedule quantities), `fringes.ts` (percent/fixed/flat, cutoff, ranges,
rounding), `format.ts` (money/percent), `scheduleSync.ts`
(`computeScheduleQuantities`, `scheduleQtyFor`, `computeSystemGlobals`,
`lockBudgetVersion`), `templates/index.ts` (Blank/Feature),
`templates/fromSchedule.ts`, `reportTemplates.ts`, `export.ts` (CSV/JSON export
+ JSON import). `costReport.ts`/`overtime.ts` belong to phases 2/3.
- `qty = eval(qtyFormula) else source ? (qtyOverride ?? scheduleQty) : (qtyOverride ?? qty)`;
  `rateCents = eval(rateFormula) else rateOverride ?? rateCents`;
  `multiplier = eval(multiplierFormula) else multiplier`. A formula wins over a
  source/override; a formula error is 0 + a line warning.
- Line base/fringe/total in cents, round half-up at the line only; `capCents`
  caps the local base; fx converts base + fringe separately.
- A fringe applies when the line names it OR shares one of its groups. A
  percent fringe over lines sharing a `fringeRangeId` applies ONCE over the
  range sum, attached to the first line; fixed/flat stay per line.
- Linked lines never mutate stored `qty`; the computed model carries the
  derived value. A missing source target is a `BudgetError` (show 0 + warning,
  never crash).
- `computeScheduleQuantities` uses the same canonical day views as the
  Day Manager/DOOD (`computeRowData` + `buildDayViews`); memoize the model once
  per surface (`computeBudget(project, { quantities })` accepts a reuse).
- `lockBudgetVersion` pins all live-linked quantities so an approved version
  cannot drift when the schedule changes.

### UI (`src/components/budget/`)
Shipped files: `BudgetTab.tsx` (root, one project read, sub-tabs, version menu,
empty state, JSON import), `BudgetView` (toolbar, KPI strip, rail, grid,
modals), `BudgetGrid`, `BudgetVersionMenu`, `BudgetEmptyState`,
`BudgetLibraryView`, `BudgetLineModal`, `BudgetNodeModal`, `BudgetGroupModal`,
`fields.tsx` (`BudgetInput`, `NumberField`, `MoneyField`, `PercentField`).
- App nav: `'budget'` in `AppTabId`, labels/order (⌘8), sub-tabs, AppHeader
  Wallet icon, App.tsx render/popout. Route through `go()`.
- Grid: the shared `InlineGlideTable` recipe (NOT a bespoke Glide fork):
  auto-fit columns, content height, category/account inline bands, static
  totals, painted `kitPickerCell` pickers (unit/currency/fringe/group), a
  trailing (i) glyph + persistent trash column, right-click row menu,
  presence scope `budget:detail`.
- Shared grid colour rule: editable = white input surface at rest; read-only =
  neutral grey disabled; caller band colours win. `MoneyField`/`PercentField`
  wrap the kit `NumberInput`; no second numeric primitive.
- Empty state: `Blank`, `Feature`, `From schedule`; Import budget JSON.
  "From schedule" shows preview counts and creates linked lines (no wizard).
  Import is JSON only (CSV is export-only).
- Row menu/line modal: duplicate/delete, pin/unpin, link/unlink, fringes/groups,
  formula overrides. Locked version/read-only hides edits.
- Library: editable tables + settings/system-values cards. An in-use delete
  warns with the count and clears the references; a where-used jump is not
  built. Fringe group/range tagging has no UI yet.

### Reports (`src/lib/reportBudget.ts`, `src/components/reports/`)
- `ReportBlock.type` += `'budgetTable'` with `budgetMode`/category/account/
  columns/zero/fringes/notes/percent; project-wide leaf (top level, columns or
  a non-day container), never inside a Days repeat or a Call Sheet zone.
- Phase-1 modes: `topsheet`, `accounts`, `lines`; `costReport`/`hotCost`/
  `cashflow`/`comparison` are typed but fall back to `topsheet`.
- `ReportCtx` += `budget: BudgetModel` (computed once in `buildReportCtx`).
- `ReportCollection` += `budgetCategories`, `budgetAccounts`, `budgetLines`,
  `budgetLinesOfAccount`; budget document + item fields; `fieldScopeFor`/
  `reportBlocks.ts` labels/order/validity; `money` marker/right alignment.
  `costReport`/`expenses`/`purchaseOrders` collections are phase 2 — not built.
- `reports/ReportBudgetTable.tsx` reuses `ReportGridBlock`'s `.report-table-cols`
  / `.rm-row` recipe + `data-rm-header` + the paginator; keep-with-next for
  category/account headers.
- Built-in transient designs (`lib/budget/reportTemplates.ts`): Top Sheet,
  Account Detail, Budget Health. Budget → Print opens `ReportPrintDialog`;
  "Save as design" uses `ADD_REPORT_DESIGN`.
- `Budget → Export` CSV/JSON via `lib/budget/export.ts`; no XLSX dep.
- Formula entry: plain expression inputs in `BudgetLineModal` ("Formula
  overrides (advanced)") with a system-global hint. There is **no** in-grid
  formula editor or autocomplete; the arithmetic evaluator stays in
  `lib/budget/formula.ts` (the report free table is token/cell-ref resolution,
  not arithmetic).

### Acceptance (phase 1 — LANDED)
1. New project → Budget tab shows the empty state; Blank/Feature/From schedule
   each create a valid budget with one version.
2. Feature template creates 4 categories / 25 accounts; adding a line and
   editing qty/rate/X updates account/category/grand totals; undo/redo work.
3. Fringes (percent/fixed/flat/cutoff/range engine), globals/formulas,
   groups, units and markups/contingency compute and survive reload. Fringe
   group/range tagging and markup scope/caps are model-only (no UI).
4. Per-line currency: change a line's currency/rate; local totals stay in that
   currency, account/grand totals stay base, a missing rate warns, and the
   value survives reload.
5. Versions: create/duplicate (both COW clones of the active version), rename,
   switch, delete/restore, lock/unlock; last version cannot be deleted; editing
   an account name shows in every version (chart shared). There is no blank
   "new version" action.
6. Schedule link: a line linked to shoot days changes when the production-day
   count changes; editing Qty pins it; Pin/Unpin in the line modal; locking a
   version pins every live-linked quantity and unlock does not unpin; manual
   lines never change. No sync button exists.
7. Blank budget stays manual; a line can be linked later; From schedule shows
   preview counts (not a line-by-line wizard) and creates linked lines.
8. Top Sheet/Account Detail/Budget Health print with correct totals, repeated
   headers, page numbers and money formatting; "Save as design" creates an
   editable design.
9. CSV exports the active version; JSON exports the whole budget (chart/
   library/all versions) and JSON import replaces the budget (there is no CSV
   import). Viewer read-only hides edits and the bridge/MCP refuses writes.
10. `ItemManagerDropdown` version menu matches schedule/calendar behaviour;
   trash restore works; project file size stays sane at 1,000 lines.
11. No per-row `useProject()`, no second report/grid engine, no hardcoded rates.

Deferred from the original acceptance: cost report (phase 2), rich
currency-round-trip import (JSON carries raw cents; no re-import UI beyond the
whole budget), viewer-refusal e2e (covered by the shared bridge/MCP tests),
and a print-per-template e2e (print is manual-verified; the read model is unit
tested).

### Tests/docs
Vitest: line maths/rounding, fringe applicability/cutoff/range, formula
cycles/errors, markup behaviour, version COW/lock, schedule source resolution,
template apply, report rows/columns (`reportBudget.test.ts`). E2E
(`e2e/budget.spec.ts`): create-from-template + persistence, schedule
change → linked qty, pin and lock. Docs: `BUDGETING*.md`, `REPORTS-DESIGNER.md`,
`UI-PRIMITIVES.md`/`DESIGN-LANGUAGE.md` (grid colour rule), `API.md`,
`AGENTS.md` pointer. Extend `scripts/smart-test.mjs` `RULES` with the budget
spec.

### Pitfalls
- Do not put `budget` in a new context/store; it is project state. Do not clone
  the chart/library per version; share them.
- Do not deep-clone lines on version create; COW only.
- Do not compute schedule quantities inside the reducer; pass pinned values.
- Do not use the rich-text token editor for the budget formula fields (plain
  expression inputs; no cross-line refs in v1).
- Do not print without `ReportPrintDialog`.

---

## Phase 2 — Cost tracking — LANDED (2026-10-30)

> Shipped: `BUDGETING.md` §8 + `BUDGETING-SURFACES.md` §4b; PO authoring is bridge-only.

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
`CostReportView` (as-of/period, KPI strip, expandable rows, inline ETC/reason)
replaces the phase-1 Cost Report placeholder; `ExpensesView` (filters/group/
add/import) + `ExpenseModal` replace the Expenses placeholder; `ExpenseSection`
in the Day Manager (`dayTabs`, registry, `DAY_TAB_OPTIONS`, root-owned modal,
`DaySectionActions.openExpense`). Read-only hides edits.

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

### Phase-2 follow-ups (roadmap 335-347 SHIPPED; 348 open)
- **335** Budget sheet `(i)` = inspect/edit only: explicit per-row target (category/account → node modal, line → line modal), never context-menu-first.
- **336** Day Manager Expenses onto the shared `InlineGlideTable`: inline commit-on-blur edits, (i) → `ExpenseModal`, modal-less quick-add row; keep the day filter, summary, CTA and read-only rules.
- **337** Budget Glide bulk entry: context-menu "Add line…" count → N lines in one batch; Shift+Enter adds/focuses a row via the shared keyboard hook.
- **338** Fringe pickers show each fringe's computed line contribution
  (`computeBudget` → `computedLine.fringes[].cents`), never re-derived.
- **339/340** Category navigation: rail context menu + trailing "+ New category"
  (kit `ContextMenu`, no second editor); Glide category bands get a disclosure chevron that collapses children as view-only state.
- **341** Currency library: derive the symbol from the chosen currency (remove the symbol input), seed common currencies, add manual "Sync rates" (no-key provider + CSP, base = 1, one batch, last-synced stamp).
- **342** Budget quick filter: shared `GlideFilter`/`MorphSearchField`,
  display-only AND tags over category/account/line text; totals stay whole.
- **343** Budget Glide visuals: band colour every cell + sticky header.
- **344** UI control-face/reuse audit: morph/transform search + action fields over always-inline search; category accordions for grouped catalogues; reuse `CardSection`/`DaySectionCard`, `DayPicker`, `SearchMenu` — no bespoke rewrites.
- **345** Glide status cells: one shared status→tone map painting `bgCell` + text (expenses first), label always visible; editable tint is the explicit white-cell exception.
- **346** Formula book/autocomplete: plain-text `FormulaField` (not RichTextEditor), shared symbol/function registry, searchable book + caret insert; safe v1 functions; no cross-line refs.
- **347** Glide open-editor geometry: picker overlays use Glide's cell padding so every popout matches the cell's margins/size (shared `createGlideCellEditor`).
- **348** Schedule review sync: pure diff (add/update/remove/keep/check) grouped category → account → department; “X updates” modal with before/after totals and per-row apply, one batch; never rates/chart/manual lines; locked/read-only refuse.
Silent-break cases live in `e2e/budget.spec.ts` within the 71/292 caps; visual checks are manual.
---

## Phase 3 — Overtime — LANDED (2026-10-30)

> Shipped in `src/lib/budget/overtime.ts` + `OvertimeModal` (334 stays open for
> phase 4). Divergences: numeric cast rates/project policy are data/bridge-
> editable (Crew Manager exposes crew rates; cast details keeps the MMS text
> rate); no extra version-lock coupling.

### Goal
Crew + cast overtime from the day's calls/wrap, with project/day/department/
person overrides, a Crew card modal, and post-to-expenses.

### Data/store
`OvertimePolicy` on `ProductionInfo`, `DayOvertime` on `DayMeta`,
`CrewPerson`/`CastMember` rate/guarantee/overtime. No new action: settings use
`patchDayMeta`/`UPDATE_ROW`, posting uses `BULK_ADD_EXPENSES`.

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
Policy resolution; hours/cost; no-rate; post-to-expenses batch; copy-day; report
fields; viewer refusal. Vitest `overtime.test.ts`; e2e modal/post/reload.

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

Each sub-package gets its own acceptance/tests/docs; no half-built "advanced mode".

---

## Cross-phase checklist

- **Actions:** every new type in `Action` + `ACTION_TYPES`; bridge/MCP schema regenerated; write refusal tested.
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
- **Perf & security:** 1,000 lines + 500 expenses; no secrets; viewer read-only;
  sharing warning; security-review relevance check on roles/room writes.
