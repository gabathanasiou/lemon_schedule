# Budgeting & cost tracking — master plan

Status: **proposal for roadmap 334** (2026-10-30). Market/report evidence:
`docs/BUDGETING-RESEARCH.md`. UI, Day Manager and report surfaces:
`docs/BUDGETING-SURFACES.md`. Nothing here is built yet. Read all three before
adding budget, expense, overtime or budget-report code.

## 1. Decisions already made

- **No AI in the app.** No model calls, prompts, generated content or AI branding. The debug bridge / local MCP is the external-agent seam.
- **Top-level Budget tab** with `Budget` / `Cost Report` / `Expenses` / `Library`; project-level visibility for now (viewers see it; online view permissions later). Decided 2026-10-30.
- **Estimate-first, but complete authoring**: model, versions, grid, templates, library, live schedule links, Top Sheet + Account Detail print. Cost tracking and overtime follow. Decided 2026-10-30.
- **Overtime covers crew + cast** (same modal, separate tabs). Decided 2026-10-30.
- **Fixed three levels** — Category (top sheet) → Account (cost report) → Line (detail). No arbitrary nesting in v1.
- **Money is integer minor units (cents).** Percentages/quantities are plain numbers; money rounds half-up at the line boundary. No float dollars.
- **Per-line currency from day one.** A base currency in settings, a currency table, a per-line currency + optional fx override; line amounts display in their currency, account/category/grand totals convert to base. Missing rates are a warning, never 1:1.
- **Default template:** Feature + Blank; Commercial/AICP later. **ETC default:** remaining budget. **OT default:** 10h base, 1.5× after 10, 2× after 12 (editable); cast gets a separate SAG-style preset. **Generated lines:** live-linked by default (pin per line; lock freezes). Decided 2026-10-30.
- **Budget versions are a third independent axis** (schedule / calendar / budget). The chart of accounts and library are shared; only line values are per version. Reuse `ItemManagerDropdown` + the existing version/trash/active pattern; copy-on-write clone, no deep chart clone. Compare is a later phase.
- **Schedule links are live, with no sync button.** `source` lines derive quantity from the schedule at read time; `qtyOverride` pins it, `rateOverride` pins a rate; a locked version freezes linked quantities. Blank/manual budgets are first-class, and "From schedule" is an option — individual lines can link later.
- **Reports use the Reports Designer engine**: `budgetTable` + budget collections/fields, custom layouts on the same block tree; PDF via the print pipeline, CSV/JSON via budget exporters. No second report engine.
- **Formula input reuses the token grammar and `#REF!`/`#VALUE!` conventions**, but arithmetic is a small budget evaluator; the Glide editor is a lightweight overlay, not the rich-text token editor.
- **Editable grid = the Glide fork**; report/print tables = the DOM report renderer. Two renderers, one read model.
- **`NumberInput` already exists** (draft/clamp/steppers/scrub); only add a `suffix` or thin `MoneyField`/`PercentField` wrapper — no second numeric primitive.
- **Budget is project state** — undoable, synced, shared, in `.lemon`. A view-only collaborator can read it; do not claim secrecy (see §6).

## 2. Vision — "the budget that knows your schedule"

Lemon already owns the stripboard, calendar, DOOD, crew roster, calls,
locations, elements and report designer. The loop we can own:

```
stripboard / DOOD / crew roster / call sheet
        │ quantities, days, rates, OT
        ▼
      Budget ──────────────► Reports Designer (Top Sheet, Account Detail,
        │                     Cost Report, Hot Cost, Cashflow)
        │ budget vs actual
        ▼
  Day Manager expenses + overtime
        │
        ▼
  Cost Report (Budget · Actual · Committed · ETC · EFC · Variance)
```

Not "MMB in a browser": the budget that refreshes when the schedule moves and
the cost report fed by the day you are actually shooting.

**Non-goals (v1):** payroll processing, bank payments, cards, receipt storage,
tax filing, AI, MMB binary import, episodic amortization, AICP bid forms.

## 3. Domain model

Add to `src/types.ts` (canonical; no parallel budget types). All optional
additions so old projects need no migration.

```ts
/** Integer minor units (cents). Every money field is one of these. */
export type MoneyCents = number;
export type BudgetGroupKind = 'atl' | 'btl' | 'post' | 'other';
export type BudgetLineKind = 'labor' | 'purchase' | 'rental' | 'allowance' | 'flat';
export type CrewRateUnit = 'hour' | 'day' | 'week' | 'month' | 'flat';
export interface BudgetCategory {
  id: string; number: string; name: string; group: BudgetGroupKind;
  sort: number; color?: string; notes?: string; locked?: boolean;
}
export interface BudgetAccount {
  id: string; categoryId: string; number: string; name: string;
  sort: number; notes?: string; locked?: boolean;
}
export interface BudgetLine {
  id: string; accountId: string; description: string;
  kind?: BudgetLineKind;
  qty: number; unit: string; rateCents: MoneyCents; multiplier: number;
  qtyFormula?: string; rateFormula?: string; multiplierFormula?: string;
  currency?: string; fxRate?: number;
  fringes?: string[]; fringeRangeId?: string; groups?: string[];
  locationId?: string; setId?: string;
  phase?: 'prep' | 'shoot' | 'wrap' | 'post';
  startDate?: string; endDate?: string;
  capCents?: MoneyCents; notes?: string;
  etcCents?: MoneyCents; etcReason?: string; approvedOverageCents?: MoneyCents;
  original?: { qty: number; rateCents: MoneyCents; multiplier: number; totalCents: MoneyCents };
  /** Schedule link: quantity/rate derive from the schedule unless pinned. */
  source?: BudgetLineSource;
  qtyOverride?: number; rateOverride?: MoneyCents;
  sort: number;
}
export type BudgetLineSource =
  | { kind: 'shootDays'; label?: string }
  | { kind: 'crewRole'; roleKey: string; personId?: string }
  | { kind: 'cast'; castId: string }
  | { kind: 'location'; locationId: string }
  | { kind: 'element'; category: string; key: string }
  | { kind: 'perDay'; method?: string };
export interface BudgetVersion {
  id: string; name: string; createdAt: number; updatedAt: number;
  lines: BudgetLine[];
  /** Per-version overrides for settings (currency/fringe posting); unset = Budget.settings. */
  settings?: Partial<BudgetSettings>;
  /** Approved scenario: editing is frozen and linked quantities are pinned. */
  locked?: boolean; lockedAt?: number; note?: string;
}
export interface BudgetVersionTrashItem { version: BudgetVersion; deletedAt: number; }

export interface BudgetFringe {
  id: string; name: string;
  calc: 'percent' | 'fixedPerUnit' | 'flat';
  percent?: number;            // 7.65 means 7.65%
  amountCents?: MoneyCents;
  cutoffCents?: MoneyCents;
  groups?: string[];
  posting?: 'topsheet' | 'category' | 'account';
  color?: string; notes?: string;
}
export interface BudgetGroup {
  id: string; name: string; color?: string;
  inBudget?: boolean;          // false = excluded from totals (MMB InBT off)
  notes?: string;
}

/** Lines sharing a fringeRangeId form one cutoff range (MMB fringe range). */
export interface BudgetFringeRange { id: string; name: string; }
export interface BudgetGlobal {
  id: string; symbol: string; description?: string; unit?: string;
  value?: number; formula?: string; system?: boolean;
}
export interface BudgetUnit {
  id: string; name: string; plural: string;
  type: 'time' | 'quantity' | 'flat' | 'percent';
  hours?: number; color?: string;
}
export interface BudgetCurrency { code: string; symbol?: string; rateToBase?: number; }
export interface BudgetMarkup {
  id: string; name: string;
  kind: 'markup' | 'discount' | 'charge' | 'credit';
  calc: 'percent' | 'flat'; percent?: number; amountCents?: MoneyCents;
  appliesTo?: { all?: boolean; categories?: string[]; accounts?: string[]; groups?: string[] };
  except?: { categories?: string[]; accounts?: string[]; groups?: string[] };
  marksUp?: 'base' | 'fringes' | 'both'; compound?: boolean;
  capCents?: MoneyCents; capType?: 'none' | 'qualifiedSpend' | 'credit';
  discountPercent?: number; sort: number;
}
export interface BudgetSettings {
  currency: string; currencySymbol?: string; decimals: 0 | 2;
  negativeStyle?: 'minus' | 'parentheses';
  fringePosting?: 'topsheet' | 'category' | 'account';
  templateKey?: string; locked?: boolean; notes?: string;
}
export interface Budget {
  /** Shared across every version — the non-duplication boundary. */
  categories: BudgetCategory[]; accounts: BudgetAccount[];
  fringes: BudgetFringe[]; fringeRanges?: BudgetFringeRange[];
  groups: BudgetGroup[]; globals: BudgetGlobal[];
  units: BudgetUnit[]; currencies: BudgetCurrency[]; markups: BudgetMarkup[];
  settings: BudgetSettings;
  versions: BudgetVersion[]; activeVersionId: string;
  versionTrash?: BudgetVersionTrashItem[];
  createdAt?: number; updatedAt?: number;
}
export type ExpenseMethod = 'pettyCash' | 'check' | 'eft' | 'card' | 'invoice' | 'payroll' | 'other';
export type ExpenseStatus = 'draft' | 'committed' | 'actual' | 'paid' | 'void';
export interface Expense {
  id: string; date: string; accountId: string; lineId?: string;
  description: string; vendor?: string; amountCents: MoneyCents;
  currency?: string; fxRate?: number;
  method: ExpenseMethod; status: ExpenseStatus; poId?: string;
  dayDate?: string; dayNumber?: number;
  department?: string; personId?: string; castId?: string;
  receiptUrl?: string; notes?: string; createdAt?: number; updatedAt?: number;
}
export type PurchaseOrderStatus = 'draft' | 'approved' | 'open' | 'partial' | 'closed' | 'void';
export interface PurchaseOrder {
  id: string; number: string; vendor: string;
  accountId?: string; lineId?: string; amountCents: MoneyCents;
  currency?: string; issuedDate: string; expectedDate?: string;
  status: PurchaseOrderStatus; description?: string; notes?: string;
  createdAt?: number; updatedAt?: number;
}
export interface OvertimeTier { afterHours: number; multiplier: number; }
export interface OvertimePolicy {
  baseHours: number; tiers: OvertimeTier[];
  allowanceHours?: number;
  sixthDay?: number; seventhDay?: number; holiday?: number;
  mealPenaltyCents?: MoneyCents; turnaroundHours?: number;
}
export interface OvertimeOverride {
  baseHours?: number; tiers?: OvertimeTier[]; allowanceHours?: number;
  hours?: number; rateCents?: MoneyCents; rateUnit?: CrewRateUnit; note?: string;
}
export interface DayOvertime {
  baseHours?: number; tiers?: OvertimeTier[]; allowanceHours?: number;
  actualWrap?: string; note?: string;
  departments?: Record<string, OvertimeOverride>;
  people?: Record<string, OvertimeOverride>;  // crew person id
}
```

Widen existing types (optional only):

```ts
interface Project { budget?: Budget; expenses?: Expense[]; purchaseOrders?: PurchaseOrder[]; }
interface ProductionInfo { overtime?: OvertimePolicy; }   // works before a budget exists
interface DayMeta { overtime?: DayOvertime; }             // copyable with crew
interface CrewPerson {
  rateCents?: MoneyCents; rateUnit?: CrewRateUnit; guaranteeHours?: number;
  overtime?: OvertimeOverride; loanOut?: boolean; affiliation?: string;
}
interface CastMember { guaranteeHours?: number; overtime?: OvertimeOverride; }
```

`CastMember.rate`/`per` already exist. Crew rates are new; OT hours still compute
without them (cost shows a warning).

### Invariants
- A line belongs to one account; an account to one category. `number` is a label, not a reference; lines use stable ids. Numbers should be unique (warn on duplicates).
- Deleting an account with lines/expenses needs reassign or an explicit "move expenses to Unassigned"; never orphan silently.
- All money fields are cents; never store a float dollar amount. Totals are base-currency cents; per-line currency converts through `fxRate`/`currencies`.

## 4. Engine (`src/lib/budget/`)

Pure, framework-free, Vitest-covered. One barrel `src/lib/budget/index.ts`.

| Module | Responsibility |
| --- | --- |
| `types.ts` / `model.ts` | Canonical re-exports + factories (`makeBudget`, `makeCategory`, `makeAccount`, `makeLine`, default units/currencies/settings) |
| `formula.ts` | Safe parser/evaluator: numbers, `+ - * / ( )`, global symbols; no `eval`; cycle/unknown = `#ERR` |
| `calc.ts` | `computeBudget(project): BudgetModel` — line base/fringes/total, account/category totals, markups/credits, grand total, errors |
| `fringes.ts` | Fringe application, cutoffs, ranges, posting, rounding |
| `costReport.ts` | `computeCostReport(project, filter)` — Budget/Actual/Committed/ETC/EFC/Variance/%Used, account/line rollups, orphans |
| `overtime.ts` | Policy resolution, day/crew OT, 6th/7th day, rounding |
| `scheduleSync.ts` | System globals, schedule quantities, generated-line diff/refresh |
| `format.ts` | `formatMoney(cents, settings)`, `parseMoney`, `formatPercent` |
| `templates/*.ts` | Feature / commercial / blank chart of accounts + starter lines |
| `reportTemplates.ts` | Transient `ReportDesign` objects for built-in prints |
| `importExport.ts` | CSV/JSON import/export (no binary MMB in v1) |

### Line maths (exact)

```
qty        = eval(line.qtyFormula)
             ?? (line.source && line.qtyOverride == null ? scheduleQty(line.source) : (line.qtyOverride ?? line.qty))
rateCents  = eval(line.rateFormula)       ?? line.rateOverride ?? line.rateCents
multiplier = eval(line.multiplierFormula) ?? line.multiplier
baseCents  = roundHalfUp(qty * rateCents * multiplier)
           // unit.type='percent': roundHalfUp(rateCents * qty / 100 * multiplier)
baseCents  = roundHalfUp(baseCents * (line.fxRate ?? currency.rateToBase ?? 1))
```

- Round only at the line boundary; sum integer cents after.
- Fringe percent: `roundHalfUp(min(base, cutoff) * percent / 100)`; cutoff per
  line, or per `fringeRangeId` sum when set.
- Fixed-per-unit: `amountCents * qty * multiplier`; flat: once per line.
- `line.totalCents = baseCents + fringeCents`.
- Account/category totals sum line totals; markups apply after category totals;
  `grandTotal = categories + markups − credits`.
- Every computed line carries its fringe breakdown, effective percent and any
  formula error so UI/report can explain a number.

### Globals / formulas

- Grammar: numbers, `+ - * /`, parentheses, global symbols, unary minus. No
  functions in v1.
- Globals may reference other globals; evaluate topologically; cycle/unknown =
  `#ERR` + message, never crash.
- System globals (read-only) from the active schedule/calendar: `SHOOT_DAYS`,
  `PREP_DAYS`, `PREP_WEEKS`, `WRAP_DAYS`, `WRAP_WEEKS`, `TOTAL_WEEKS`,
  `POST_WEEKS`. Recompute at read time; never store stale values.
- Deleting a global converts its uses to the last value (MMB behaviour) after a
  confirm, or leaves `#ERR` if it cannot.

### Cost report maths

```
budget      = line/account budget total (incl. allocated fringes/markups)
actual      = Σ expenses status actual|paid, date ≤ asOf
committed   = Σ expenses status committed + open PO remaining
etc         = line.etcCents ?? max(0, budget − actual − committed)
efc         = actual + committed + etc
variance    = budget + approvedOverage − efc
percentUsed = (actual + committed) / (budget + approvedOverage)
```

- ETC is manual judgement; auto defaults to remaining budget so untouched lines
  forecast at budget. A line already over budget has negative variance with ETC 0.
- Prompt for an EFC reason when EFC ≠ budget.
- Account-level expenses without `lineId` roll into an "Unallocated" child row.
- POs are optional in v1; committed expenses give the same signal. POs/matching
  are phase D.
- Period filter `from`/`to` for period actuals/variance; EFC stays as-of total.

### Overtime maths

Resolution: **project `ProductionInfo.overtime` → day `DayMeta.overtime` →
department → person**. Each level may override base hours, tiers, allowance,
actual hours, rate/unit.

```
hours      = actualWrap − call (lunch deducted) or explicit override
regular    = min(hours, baseHours)
ot         = max(0, hours − regular − allowanceHours)
hourly     = rateCents / (guaranteeHours ?? unit hours ?? 10)
tier cost  = hours in each [afterHours, nextAfterHours) × hourly × multiplier
total      = regular × hourly + Σ tier costs
```

- 6th/7th day multipliers from the calendar workweek; default off until set.
- Meal penalties/turnaround modelled but not auto-computed in v1.
- Estimator, not payroll compliance. Never hardcode union rates.
- Posting OT creates expenses (`method='payroll'`, `status='actual'`, dayDate,
  department account) and never rewrites the budget silently.

## 5. Store & sync

### Actions (add to `Action` **and** `ACTION_TYPES`)

```
ADD_BUDGET_CATEGORY / UPDATE_BUDGET_CATEGORY / DELETE_BUDGET_CATEGORY
ADD_BUDGET_ACCOUNT  / UPDATE_BUDGET_ACCOUNT  / DELETE_BUDGET_ACCOUNT
ADD_BUDGET_LINE     / UPDATE_BUDGET_LINE     / DELETE_BUDGET_LINE
BULK_UPDATE_BUDGET_LINES           // paste/fill/apply fringe/group; one undo
SET_BUDGET_LIBRARY / UPDATE_BUDGET_SETTINGS
APPLY_BUDGET_TEMPLATE              // { key, id? }
IMPORT_BUDGET                      // { budget } (CSV/JSON; one undo)

NEW_BUDGET_VERSION { name, cloneFromId?, id? }
RENAME_BUDGET_VERSION / DELETE_BUDGET_VERSION / RESTORE_BUDGET_VERSION_FROM_TRASH
SET_ACTIVE_BUDGET_VERSION
LOCK_BUDGET_VERSION { id, pinned?: Record<string, number> }  // UI computes pinned qty
UNLOCK_BUDGET_VERSION
LINK_BUDGET_LINE { lineId, source } / UNLINK_BUDGET_LINE { lineId, keepQty? }
PIN_BUDGET_LINE { lineId, qty? } / UNPIN_BUDGET_LINE { lineId }

ADD_EXPENSE / UPDATE_EXPENSE / DELETE_EXPENSE / BULK_ADD_EXPENSES
ADD_PURCHASE_ORDER / UPDATE_PURCHASE_ORDER / DELETE_PURCHASE_ORDER
```

- Cases in `src/store/actions/budget.ts`; `reducer.ts` imports them and lists
  every type in `ACTION_TYPES` ("KEEP IN SYNC").
- UI mutations go through `dispatch`; bulk ops wrap `BATCH_START`/`BATCH_COMMIT`
  so a paste is one undo entry.
- OT edits use the existing day-meta path: `patchDayMeta` → `UPDATE_ROW` with
  `daybreakMeta.overtime`. No new action.
- "Post OT" is a `BULK_ADD_EXPENSES` batch.
- `makeBlankProject` does **not** create a budget; `budget === undefined` shows
  the Budget tab's empty state/template picker.
- `migrateBudget(project)` (idempotent arrays/defaults/legacy aliases) runs in
  `loadBaseline` and import paths beside `migrateProjectLinks`/
  `migrateElementBoardIds`. Never auto-create a budget on load.
- Version trash: `pruneBudgetVersionTrash` (30-day TTL + newest 10) in `storage.ts`, pruned on every load/delete like schedule/calendar trash. Never delete the last version.
- `cloneBudgetVersion` shares the chart/library and maps line objects by reference (copy-on-write); editing a line replaces only that line object. JSON still serialises per-version lines — the chart/library is what is not duplicated.
- `lockBudgetVersion` is a pure helper that computes `pinned` quantities from the schedule and returns the `LOCK_BUDGET_VERSION` action; the reducer never computes schedule quantities.
- Persistence: no `projectCodec` change (plain JSON). Watch size: 1,000 lines
  ≈ 300 KB; local copies already gzip; Drive/online are whole-blob.
- Undo: reducer keeps 50 states. Budget edits must return new arrays only for
  the changed slice (structural sharing), never clone the project for a cell.
- Room worker folds the same reducer; new cases must be pure/DOM-free. Re-run
  `npm run mcp:schema`; the bridge exposes the actions automatically.

## 6. Security & permissions
- Budget/expenses/POs are project state; a viewer or shared `.lemon` sees them. **Do not claim secrecy.**
- `locked = readOnly || !canEdit` gates every write; the bridge/MCP already refuses writes. Test it.
- No bank/SSN/card numbers or receipt blobs in state; `receiptUrl` is a link only.
- Sharing must say "Viewers can see the budget" before a view-only link (phase 2). A UI hide toggle is not security.
- True producer-only privacy needs a separate Supabase document/RLS or encryption with a key not shared to viewers — a separate architecture decision.
- Run the security-review relevance check when touching sharing/roles/room writes; never auto-run the full audit.

## 7. Phases (complete vertical slices)

Detailed AI work packages, file maps, acceptance criteria and guardrails:
**`docs/BUDGETING-PHASES.md`**. Do not start a later phase before its
dependency is solid.

**1 — Budget authoring, versions & reports.** Model/shared chart/library, versions, tab/nav, Glide grid, templates, fringes/globals/groups/units/markups, **per-line currency + fx/base totals**, live schedule links (no sync), blank/from-schedule, `budgetTable` + budget fields/collections, Top Sheet/Account Detail/Budget Health prints, CSV/JSON.
**2 — Cost tracking.** Expenses/POs, Cost Report view, Day Manager Expenses card/modal, actuals/committed/ETC/EFC/variance, `costReport`/`expenses` fields, cost report print, expense CSV.
**3 — Overtime.** Crew + cast rates/guarantee, project/day/dept/person overrides, Crew card modal (Day/Departments/Crew/Cast), hours/cost, post-to-expenses, report fields, version lock.
**4 — Advanced.** Version compare/Original-Variance, cashflow, incentives/credits, currency report, AICP, episodic, approvals/petty-cash depth, MMB import/export.

## 8. Verification & docs
- `npm run lint` + `npm run test:unit` for all pure maths.
- Full E2E for logic/data/store changes (rule 7); extend `smart-test` `RULES`; manual visual pass per `docs/TESTING.md`.
- Perf: 1,000 lines + 500 expenses; no per-row `useProject()`; memoized `computeBudget`; check file size.
- Security: viewer read-only, MCP refusal, no secrets in state.
- Docs: surfaces/research/`REPORTS-DESIGNER.md`/`UI-KIT.md`; one-line `AGENTS.md` pointer when phase 1 lands; version bump at the wrap.

## 9. Decisions & remaining question (2026-10-30)

Decided: Feature + Blank templates (Commercial/AICP later); per-line currency
from day one; OT 10h / 1.5× after 10 / 2× after 12 (cast separate SAG-style
preset); ETC = remaining budget; generated lines live-linked; compare is
phase 4 (recommended — versions themselves ship in phase 1).

**Only open question:** confirm compare in phase 4, or pull it into phase 1.
Compare is a read-only two-version variance view/report; it does not affect
authoring. Phase 4 keeps phase 1 focused.

## 10. Relations
`depends on` **315** (Day Manager tabs), **146** (crew slots) + **99** (call times) for OT, **157** (cast rates), **66** (calendar counts), **97** (MCP). `relates to` **333**, **311/248**, **322**, **202**, **172**, **123**, **308**, **230**. No existing budget item; this is new.
