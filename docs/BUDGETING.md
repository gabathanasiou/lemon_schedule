# Budgeting & cost tracking — master manual

Status: **phases 1-3 LANDED (2026-10-30, roadmap 334)** — budget authoring,
versions, budget reports, expenses/POs, the live cost report and crew/cast
overtime are built. Phase 4 below is forward-looking. Market/report evidence:
`docs/BUDGETING-RESEARCH.md`. Screens and the report block:
`docs/BUDGETING-SURFACES.md`. Execution packages:
`docs/BUDGETING-PHASES.md`. Read this file before adding budget, expense,
overtime or budget-report code.

## 1. Decisions (standing)

- **No AI in the app.** No model calls/prompts/generated content/branding; the debug bridge/MCP is the agent seam.
- **Top-level Budget tab** with `Budget` / `Cost Report` / `Expenses` /
  `Library` — all live. Viewers see the project budget (share copy remains).
- **Fixed three levels** — Category (top sheet) → Account (cost report) → Line
  (detail). No arbitrary nesting.
- **Money is integer minor units (cents).** Percentages/quantities are plain
  numbers; money rounds half-up once at the line boundary. No float dollars.
- **Per-line currency from day one.** Base currency + symbol in settings, a
  currency table, a per-line currency and optional `fxRate`; line amounts
  display in their currency, account/category/grand totals convert to base.
  A missing rate is a warning and contributes 0 — never a silent 1:1.
- **Templates:** Blank, Feature and From schedule. Commercial/AICP stay later.
  **Generated lines are live-linked**; pin per line; lock freezes quantities.
- **Budget versions are a third independent axis** (schedule / calendar /
  budget): chart/library shared, only lines per version; Create/Duplicate clone
  copy-on-write.
- **Schedule links are live, with no automatic sync.** `source` lines derive
  quantity at read time; `qtyOverride` pins it (`rateOverride` is an
  agent/data seam); a locked version pins linked quantities. The manual
  **review sync** (roadmap 348, §4) only refreshes stored snapshots, adds
  missing sources and resolves dead links — it never changes a rate.
- **Reports use the Reports Designer engine**: one `budgetTable` leaf + budget
  collections/fields; no second report engine. Modes are `topsheet` /
  `accounts` / `lines` / `costReport`; `hotCost` / `cashflow` / `comparison`
  fall back to `topsheet` until their engines land.
- **Formula input is a small arithmetic evaluator** with safe functions, not
  the rich-text token editor (no `eval`, no cross-line refs). **The editable
  grid is the shared `InlineGlideTable`**; report/print tables are DOM.
- **`NumberInput` is the one numeric primitive**; `MoneyField`/`PercentField`
  are thin app-level adapters over it (`components/budget/fields.tsx`).
- **Budget is project state** — undoable, synced, shared, in `.lemon`. A
  viewer or shared file sees it; do not claim secrecy (§6).

## 2. Vision — "the budget that knows your schedule"

Lemon already owns the stripboard, calendar, DOOD, crew roster, calls,
locations, elements and report designer. The loop we own:

```
stripboard/DOOD/crew roster ─► Budget ─► Reports (Top Sheet, Account Detail, Cost Report, prints)
        (quantities, rates, OT)  │ budget vs actual
        Day Manager expenses + overtime ─► Cost Report (Actual · Committed · ETC · EFC · Variance)
```

Phases 1-3 cover the loop; phase 4 is advanced (compare, cashflow, incentives).
**Non-goals (v1):** payroll processing, bank payments, cards, receipt storage,
tax filing, AI, MMB binary import, episodic amortization, AICP bid forms.

## 3. Domain model (shipped)

Canonical types live in `src/types.ts` (no parallel budget types). Additions
are optional — projects without a budget need no migration.

```ts
Project.budget?: Budget;              // undefined until the user creates one
Budget {
  categories; accounts;               // shared chart of accounts
  fringes; fringeRanges; groups; globals; units; currencies; markups; settings;
  versions; activeVersionId; versionTrash?; createdAt?; updatedAt?;
}
BudgetLine {
  id; accountId; description; kind?;
  qty; unit; rateCents; multiplier;                       // money in cents
  qtyFormula?; rateFormula?; multiplierFormula?;
  currency?; fxRate?;
  fringes?; fringeRangeId?; groups?;
  locationId?; setId?; phase?; startDate?; endDate?; capCents?; notes?;
  etcCents?; etcReason?; approvedOverageCents?; original?; // reserved for phase 2/4
  source?; qtyOverride?; rateOverride?; sort;
}
BudgetVersion { id; name; createdAt; updatedAt; lines; settings?; locked?; lockedAt?; note? }
BudgetFringe { id; name; calc: 'percent'|'fixedPerUnit'|'flat'; percent?; amountCents?;
               cutoffCents?; groups?; posting?; color?; notes? }
BudgetGroup { id; name; color?; inBudget?; notes? }
BudgetGlobal { id; symbol; description?; unit?; value?; formula?; system? }
BudgetUnit { id; name; plural; type: 'time'|'quantity'|'flat'|'percent'; hours?; color? }
BudgetCurrency { code; symbol?; rateToBase? }
BudgetMarkup { id; name; kind: 'markup'|'discount'|'charge'|'credit';
               calc: 'percent'|'flat'; percent?; amountCents?;
               appliesTo?; except?; marksUp?; compound?; capCents?; capType?;
               discountPercent?; sort }
BudgetSettings { currency; currencySymbol?; decimals: 0|2; negativeStyle?;
                 fringePosting?; ratesSyncedAt?; templateKey?; locked?; notes? }

// Cost tracking (phase 2) — project state, never a per-day ledger.
Project.expenses?: Expense[];         // filters by dayDate/dayNumber in Day Manager
Project.purchaseOrders?: PurchaseOrder[];
Expense { id; date; description; accountId?; lineId?; vendor?;
          amountCents; currency?; method; status; poId?; receiptUrl?;
          notes?; dayDate?; dayNumber?; createdAt?; updatedAt? }
PurchaseOrder { id; number; vendor?; description?; issuedDate?;
                accountId?; lineId?; amountCents; status; notes? }
// status: planned | committed | actual | paid | void
// method: card | cash | cheque | transfer | payroll | pettyCash | other
// PO status: open | partial | received | cancelled
```

Defaults (`lib/budget/model.ts`): units Day/Week/Hour/Flat/Allow/%, currencies
USD (rate 1), EUR and GBP (no default rate), four groups (ATL/BTL/Post/Other),
settings USD / symbol `$` / whole units / minus negatives / topsheet posting.

### Invariants
- A line belongs to one account; an account to one category. `number` is a
  label, not a reference; ids stay stable. New numbers follow the highest.
- Deleting an account either reassigns its lines (`reassignToId`) or deletes
  them explicitly; never orphan. Deleting a category deletes its accounts and
  their lines in every version.
- All money fields are cents; never store a float dollar amount. Line totals
  are computed in the line's currency and converted to base cents.
- The chart/library is shared by every version. A version's `lines` array is
  the only per-version data; never clone the chart per version.
- `makeBlankProject` never creates a budget; `migrateBudget` normalizes arrays
  and defaults on every LOAD but never auto-creates one.

### Overtime (phase 3, shipped)
`ProductionInfo.overtime`/`castOvertime` (`OvertimePolicy` with `dailyHours`,
`tiers`, 6th/7th multipliers), `DayMeta.overtime` (`DayOvertime`: actual times,
policy, `OvertimeOverride[]`, posted stamp), `CrewPerson.rateCents/rateUnit/
guaranteeHours/overtime`, `CastMember.rateCents/rateUnit/guaranteeHours/
overtime`. Everything is optional; older projects need no migration.

## 4. Engine (`src/lib/budget/`)

Pure, framework-free, Vitest-covered. No barrel in phase 1 — modules import
each other directly.

| Module | Responsibility |
| --- | --- |
| `src/types.ts` | Canonical budget shapes (§3) |
| `model.ts` | Factories, defaults, `nextBudgetNumber`, version clone/active/settings, `pruneBudgetVersionTrash`, `migrateBudget` |
| `formula.ts` | Safe tokenizer/parser/evaluator; `#REF!`/`#DIV/0!`/`#VALUE!`/`#CYCLE!`; `formulaSymbols` |
| `calc.ts` | **`computeBudget(project)`** — the ONE read model: line maths, fringe/markup application, category/account/grand totals, errors, link counts |
| `fringes.ts` | `roundHalfUp`, fringe applicability/amounts, range bases |
| `scheduleSync.ts` | `computeScheduleQuantities`, `scheduleQtyFor`, `computeSystemGlobals`, `lockBudgetVersion`, the canonical source key/description/account map |
| `diff.ts` | **`computeScheduleBudgetDiff(project, versionId)`** — the ONE review-sync read model: add/update/remove/keep/check rows grouped category → account → department → line, before/after totals, the apply payload |
| `format.ts` | `formatMoney`, `parseMoney`, `formatPercent`, `currencySymbolOf` |
| `templates/index.ts` | `templateBudget('blank'|'feature')`, feature chart, 10% contingency markup |
| `templates/fromSchedule.ts` | Preview counts + `buildBudgetFromSchedule` |
| `reportTemplates.ts` | Four transient `ReportDesign`s (Top Sheet, Account Detail, Budget Health, Cost Report) |
| `export.ts` | CSV + lossless JSON export, JSON import/parse, filename, cost-report CSV |
| `expenseCsv.ts` | Expense CSV export + tolerant import (aliases, unmatched → Unallocated) |
| `costReport.ts` | **`computeCostReport(project, {asOf, from, to})`** — the ONE cost read model: Actual/Committed/ETC/EFC/Variance/% used rows + expense/day rollups |
| `gridRows.ts` | Budget sheet rows (`buildBudgetRows`) + the display-only filter (`filterBudgetRows`) + collapse (`collapseBudgetRows`) — never a component-side matcher |
| `rates.ts` | Manual FX sync: Frankfurter (keyless ECB) fetch, reciprocal `rateToBase`, `applyRatesToCurrencies`, stamp formatting |
| `formulaBook.ts` | ONE registry for formula autocomplete + the book (system/project globals + safe functions, fragment/insert helpers) |
| `statusTones.ts` | ONE status→tone map for Glide status cells (expense + PO lifecycles) |
| `overtime.ts` | **`computeDayOvertime`** — policy resolution (project → day → dept → person), actual hours, guarantees, tiers, 6th/7th day, crew/cast/department rows, post-to-expenses builder |

Not built yet: binary/MMB import.

### Line maths (exact)

```
qty        = eval(qtyFormula)        // formula wins over source and override
             else line.source ? (line.qtyOverride ?? scheduleQty(source))
                              : (line.qtyOverride ?? line.qty)
rateCents  = eval(rateFormula)       else line.rateOverride ?? line.rateCents
multiplier = eval(multiplierFormula) else line.multiplier
rawBase    = unit.type === 'percent'
             ? qty * rateCents * multiplier / 100
             : qty * rateCents * multiplier
localBase  = rawBase capped by line.capCents when set   // roundHalfUp at this boundary
fx         = line.fxRate > 0 ? line.fxRate
             : same currency ? 1
             : currency.rateToBase > 0 ? currency.rateToBase
             : 0 + "Missing FX rate" warning
baseCents  = roundHalfUp(localBase * fx)
fringeCents= roundHalfUp(localFringeCents * fx)
totalCents = baseCents + fringeCents
```

- A formula error sets its value to 0 and adds `Qty #REF!` / `Rate #VALUE!` to
  the line's errors; the UI shows the warning, the engine never throws.
- Round only at the line boundary; sum integer cents after.
- `localBaseCents`/`localFringeCents`/`localTotalCents` stay in the line's
  currency; `baseCents`/`fringeCents`/`totalCents` are base cents.
- Account/category totals sum line totals; markups apply after category totals
  (phase-1 UI exposes name/kind/calc/percent/amount/compound only, so markups
  apply to all in-budget categories, base + fringes, non-compound default);
  `grandTotal = in-budget categories + signed markups`.
- Groups with `inBudget: false` are excluded from grand totals and the KPI
  strip, but their computed rows stay visible.
- Every computed line carries `fringes` (id/name/cents/percent), `errors`,
  `linked`, `pinned` and `scheduleQty` so the UI/report can explain a number.

### Fringes (exact)

- **A fringe applies to a line when the line names it (`line.fringes`) OR the
  line shares one of the fringe's groups (`fringe.groups` → `line.groups`).**
- Percent: `roundHalfUp(min(base, cutoffCents ?? base) * percent / 100)`.
- Fixed per unit: `roundHalfUp(amountCents * line.qty * line.multiplier)`.
- Flat: `roundHalfUp(amountCents)` once per line.
- **Fringe ranges**: lines sharing a `fringeRangeId` are summed for the
  percent base; a percent fringe applies ONCE over that range sum, attached to
  the FIRST line (by computed line order), and 0 to the others. Fixed-per-unit
  and flat fringes stay per line. There is no range-editor UI in phase 1; the
  data field and engine are live for imports/agents.
- Posting (`topsheet`/`category`/`account`) is stored and editable in settings,
  but phase-1 totals always show fringes as their own column and roll them into
  account/category totals; posting presentation is a later report refinement.

### Globals / formulas

- Grammar: numbers, `+ - * /`, parentheses, unary minus, global symbols and
  the safe functions `ROUND/MIN/MAX/ABS/CLAMP` (arity-checked). No property
  access, no `{{line.*}}` cross-line references, no `eval`.
- Globals may reference other globals; evaluation is topological; cycles are
  `#CYCLE!`, unknown symbols `#REF!`, division by zero `#DIV/0!`, syntax
  `#VALUE!`. Errors are values + messages, never crashes.
- System globals (read-only, recomputed from the active schedule/calendar):
  `SHOOT_DAYS`, `PREP_DAYS`, `PREP_WEEKS`, `WRAP_DAYS`, `WRAP_WEEKS`,
  `POST_WEEKS`, `TOTAL_WEEKS`. `WRAP_DAYS`/`WRAP_WEEKS` are currently 0 (the
  calendar model has no wrap window); prep/post "weeks" divide days by 5.

### Schedule quantities (`scheduleSync.ts`)

- `computeScheduleQuantities(project)` builds from the SAME canonical day view
  the Day Manager/DOOD use (`computeRowData` + `buildDayViews`): shoot days,
  prep/post days, per-crew-person and per-role production days, cast work days,
  location days (master + key), element days (category + key).
- `scheduleQtyFor(source, quantities)` resolves a line's live quantity. A
  missing target resolves 0 and `calc.ts` adds a warning — never a crash.
- `lockBudgetVersion(project, id)` is PURE and UI-side: it computes the pinned
  map; the reducer applies `LOCK_BUDGET_VERSION` and never derives schedule
  data. `UNLOCK_BUDGET_VERSION` does not unpin.

### Review sync (`diff.ts`, roadmap 348)

A reviewed diff, not a live-link replacement. `computeScheduleBudgetDiff`
classifies every linked line and every working source:

- `add` — a working crew person/cast member/location/shoot-day with no line
  yet; mapped to the existing chart account (2400/2100/1400/3200) at rate 0.
  Never creates an account.
- `update` — a live line whose **stored** `qty` snapshot drifted from the
  schedule (the sheet already shows the live value; the review refreshes the
  snapshot so exports/unlinks see the right number).
- `remove` — the source now counts 0. Off by default.
- `keep` — pinned or qty-formula lines; never written.
- `check` — a missing account mapping or a stale target; informational, fix the
  line/chart first.

Grouped category → account → department (crew) → line. `totalRows` is
add+update+remove+check (the toolbar's "N updates"); keep rows are deliberate.
Apply is ONE `BATCH_START`/`BATCH_COMMIT` (`BULK_UPDATE_BUDGET_LINES` + adds +
explicit deletes) and `buildScheduleDiffApply` refuses a locked version or a
non-active version. Read-only shows the review with Apply disabled. The money
summary is cost-neutral by construction (links are live; adds are rate 0).

### Cost report maths (`costReport.ts`)

```
actual    = Σ expenses status actual|paid, date ≤ asOf
committed = Σ committed expenses WITHOUT a poId
            + Σ open/partial PO remaining
etc       = line.etcCents ?? max(0, budget − actual − committed)
efc       = actual + committed + etc
variance  = budget + approvedOverage − efc
% used    = (actual + committed) / (budget + approvedOverage)
```

- Expense `amountCents` is base-currency cents; `currency` is a payment label
  and is never FX-converted in phase 2.
- A `lineId` rolls into that line; account-level expenses roll into the
  account's **Unallocated** child; no valid account = one project-level
  Unallocated row. Stale ids degrade there.
- A `from`/`to` period narrows only the DISPLAYED Actual; EFC, variance and
  % used stay as-of. Void expenses never count; totals exclude out-of-budget
  categories while their rows remain visible.

## 5. Store & sync

### Actions (shipped; in `src/store/actions/budget.ts`, wired in `reducer.ts`)

```
ADD/UPDATE/DELETE_BUDGET_CATEGORY
ADD/UPDATE/DELETE_BUDGET_ACCOUNT            // DELETE payload { id, reassignToId? }
ADD/UPDATE/DELETE_BUDGET_LINE
BULK_UPDATE_BUDGET_LINES                    // { updates: [{ id, updates }] } — one undo
LINK_BUDGET_LINE { lineId, source } / UNLINK_BUDGET_LINE { lineId, keepQty? }
PIN_BUDGET_LINE { lineId, qty? }    / UNPIN_BUDGET_LINE (lineId)
SET_BUDGET_LIBRARY { key, value }            // fringes|groups|globals|units|currencies|markups|fringeRanges
UPDATE_BUDGET_SETTINGS { ...Partial<BudgetSettings> }
APPLY_BUDGET_TEMPLATE { key: 'blank'|'feature', id? }
IMPORT_BUDGET { budget }                     // replaces chart/library/versions; one undo

NEW_BUDGET_VERSION { name, cloneFromId?, id? }
RENAME_BUDGET_VERSION { id, name }
DELETE_BUDGET_VERSION (id)                   // moves to versionTrash; last version protected
RESTORE_BUDGET_VERSION_FROM_TRASH (id)
SET_ACTIVE_BUDGET_VERSION (id)
LOCK_BUDGET_VERSION { id, pinned? } / UNLOCK_BUDGET_VERSION (id)

ADD/UPDATE/DELETE_EXPENSE            // UPDATE { id, updates }
BULK_ADD_EXPENSES (Expense[])       // CSV/OT posting — one undo
ADD/UPDATE/DELETE_PURCHASE_ORDER    // UPDATE { id, updates }
```

- Every type is in BOTH the `Action` union and `ACTION_TYPES` ("KEEP IN
  SYNC"). Bulk UI operations wrap `BATCH_START`/`BATCH_COMMIT` so a paste or a
  fringe apply is one undo entry.
- `NEW_BUDGET_VERSION` copies `cloneFromId`'s line array by reference
  (copy-on-write); an omitted/null id creates a BLANK version. The chart/library
  is never cloned. `LOCK_BUDGET_VERSION` pins only live-linked lines using the
  UI-computed map; `locked` freezes editing.
- `migrateBudget` + `migrateCostTracking` run in `LOAD` (local/Drive/online/
  room): fill arrays/defaults, repair activeVersion, prune `versionTrash`
  (30-day TTL + newest 10). Never auto-creates a budget or expense.
- Expenses/POs are project arrays; the Day Manager filters by `dayDate`/
  `dayNumber` and never stores a ledger in `daybreakMeta`. `ADD_PURCHASE_ORDER`
  allocates `PO-####` when no number is supplied.
- Persistence is plain JSON — no `projectCodec` change. Undo is the normal
  reducer history (50 states); room cases are pure/DOM-free. PO editing is
  action/bridge-only in phase 2; the expense modal links an existing PO.

## 6. Security & permissions
- Budget is project state; a viewer or shared `.lemon` sees it. **Do not claim
  secrecy.**
- `locked = readOnly || !canEdit` (plus `version.locked`) gates every write;
  the bridge/MCP refuses writes for viewers. Test it.
- No bank/SSN/card numbers or receipt blobs in state; `receiptUrl` is a link
  only. Sharing must say "Viewers can see the budget" before a view-only link;
  a UI hide toggle is not security.
- True producer-only privacy needs a separate Supabase document/RLS or
  encryption whose key is not shared to viewers — a separate architecture call.
- Run the security-review relevance check when touching sharing/roles/room
  writes; never auto-run the full audit.

## 7. Surfaces (summary — manual: `docs/BUDGETING-SURFACES.md`)

- Budget tab (⌘8) between Production and Reports; sub-tabs Budget / Cost Report / Expenses / Library — all live. Phone unsupported.
- Budget view: KPI strip, category rail, one sheet, toolbar (Category, Markup,
  **GlideFilter**, linked summary, **schedule review**, Print/Export/Import),
  footer totals. **+** quick-add, Shift+Enter in context, count-batched Add
  line…, view-only band collapse, painted bands, pinned header.
- Cost Report: as-of/period, Budget/Actual/Committed/EFC/Variance/%Used KPI,
  expandable category → account → line, inline ETC + reason, Print/CSV.
- Expenses: date/status/account/day/method filters, Add expense, Import CSV,
  Glide ledger with the shared tone map, footer totals, shared `ExpenseModal`;
  the Day Manager card is the same `ExpensesGrid` filtered by day.
- Overtime: Crew card button + `OvertimeModal` (Day/Departments/Crew/Cast,
  overrides, no-rate warning, **Post to expenses** in one batch).
- Grid/library/versions: shared `InlineGlideTable` (painted pickers, (i) opens
  the editor, trash deletes, display-only filter); ~30 currencies, derived
  symbol, **Sync rates**, `ItemManagerDropdown` + trash; `FormulaField` book.
- Reports: `budgetTable` leaf (four modes), budget/cost collections/fields,
  four transient prints + Save as design.

## 8. Phases

Detailed packages: **`docs/BUDGETING-PHASES.md`**.

**1 — Budget authoring, versions & reports — LANDED (2026-10-30).** Model +
shared chart/library, versions + trash + lock, Budget tab, shared grid,
Blank/Feature/From-schedule templates, fringes/globals/groups/units/markups,
per-line currency + fx/base totals, live links, `budgetTable` + fields/
collections, three prints, CSV/JSON export + JSON import. Divergences: no
`{{line.*}}` refs; fringe ranges apply once over the range sum; lock pins links
and unlock does not unpin; Create = blank, Duplicate = clone; JSON-only import;
fringe range and markup scope/cap stay model-only.

**2 — Cost tracking — LANDED (2026-10-30).** Expenses/POs, Cost Report,
Expenses ledger + shared ExpenseModal, Day Manager card, Actual/Committed/ETC/
EFC/variance, cost collections/fields, cost mode + print + CSV. Divergences:
PO authoring is action/bridge-only; no approval workflow.

**3 — Overtime — LANDED (2026-10-30).** Crew + cast rates/guarantees,
project/day/dept/person overrides, `OvertimeModal`, hours/cost, post-to-
expenses (one batch), report fields and `overtimeSummary`. Divergences: numeric
cast rates/project presets are data/bridge-editable (cast details keeps the MMS
text rate); no extra version-lock coupling.

**4 — Advanced.** Version compare/Original-Variance, cashflow, incentives/credits, currency report, AICP/episodic, approvals/petty-cash, MMB import/export (no compare UI built).

## 9. Verification & docs
- `npm run lint` + `npm run test:unit` (budget/reportBudget/costReport/
  budgetSurfaces/diff suites); full E2E for logic/data/store changes (rule 7) —
  `e2e/budget.spec.ts` covers template/persistence, links/lock, the review
  sync, expense → cost report, the Day Manager card and the grid invariants.
- Perf: 1,000 lines / 500 expenses; no per-row `useProject()`; read models
  memoized once per surface. Security: viewer read-only, MCP refusal, no
  secrets/receipt blobs. Docs: this file, `BUDGETING-SURFACES.md`,
  `BUDGETING-PHASES.md`, `REPORTS-DESIGNER.md`, `API.md`. Version bump at wrap.

## 10. Relations
`depends on` **315**, **146**+**99** (OT), **157**, **66**, **97**;
`relates to` **333**, **311/248**, **322**, **202**, **172**, **123**, **308**, **230**.
