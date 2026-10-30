# Budgeting & cost tracking — master manual

Status: **phase 1 LANDED (2026-10-30, roadmap 334)** — budget authoring,
versions and budget reports are built and in the app. Phases 2-4 below are
forward-looking. Market/report evidence: `docs/BUDGETING-RESEARCH.md`. Screens
and the report block: `docs/BUDGETING-SURFACES.md`. Execution packages:
`docs/BUDGETING-PHASES.md`. Read this file before adding budget, expense,
overtime or budget-report code.

## 1. Decisions (standing)

- **No AI in the app.** No model calls, prompts, generated content or AI
  branding. The debug bridge / local MCP is the external-agent seam.
- **Top-level Budget tab** with `Budget` / `Cost Report` / `Expenses` /
  `Library`. In phase 1 only Budget and Library are live: Cost Report and
  Expenses are deliberate placeholder states until phase 2. Project-level
  visibility for now (viewers see it); share/permission copy is phase 2.
- **Estimate-first authoring is complete.** Model, versions, grid, templates,
  library, live schedule links, Top Sheet / Account Detail / Budget Health
  prints and CSV/JSON export ship. Cost tracking and overtime follow.
- **Fixed three levels** — Category (top sheet) → Account (cost report) → Line
  (detail). No arbitrary nesting.
- **Money is integer minor units (cents).** Percentages/quantities are plain
  numbers; money rounds half-up once at the line boundary. No float dollars.
- **Per-line currency from day one.** Base currency + symbol in settings, a
  currency table, a per-line currency and optional `fxRate`; line amounts
  display in their currency, account/category/grand totals convert to base.
  A missing rate is a warning and contributes 0 — never a silent 1:1.
- **Templates:** Blank, Feature and From schedule. Commercial/AICP stay later.
  **Generated lines are live-linked**; pin per line; locking a version freezes
  every linked quantity.
- **Budget versions are a third independent axis** (schedule / calendar /
  budget). The chart and library are shared; only lines are per version; Create
  and Duplicate both clone the current version copy-on-write.
- **Schedule links are live, with no sync button.** `source` lines derive
  quantity from the schedule at read time; `qtyOverride` pins it,
  `rateOverride` can pin a rate (data/agent seam only in phase 1). A locked
  version pins live-linked quantities.
- **Reports use the Reports Designer engine**: one `budgetTable` leaf + budget
  collections/fields; no second report engine. Phase-1 modes are
  `topsheet` / `accounts` / `lines`; later modes fall back to `topsheet`.
- **Formula input is a small arithmetic evaluator**, not the rich-text token
  editor. No `eval`, no cross-line `{{line.*}}` references in v1.
- **The editable grid is the shared `InlineGlideTable` recipe**, not a
  bespoke Glide fork. Report/print tables are the DOM report renderer.
- **`NumberInput` is the one numeric primitive**; `MoneyField`/`PercentField`
  are thin app-level adapters over it (`components/budget/fields.tsx`).
- **Budget is project state** — undoable, synced, shared, in `.lemon`. A
  viewer or shared file sees it; do not claim secrecy (§6).

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

Phase 1 covers the top half: the estimate that follows the schedule. The cost
report and day-expense loop are phases 2-3.

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
                 fringePosting?; templateKey?; locked?; notes? }
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

### Planned additions (phases 2-3 — NOT in `types.ts` yet)
`Expense` + `PurchaseOrder` + `Project.expenses`/`purchaseOrders` (phase 2);
`OvertimeTier`/`OvertimePolicy` on `ProductionInfo`, `OvertimeOverride` +
`DayOvertime` on `DayMeta`, `CrewPerson.rateCents/rateUnit/guaranteeHours/
overtime`, `CastMember.guaranteeHours/overtime` (phase 3). Field definitions
are in `docs/BUDGETING-PHASES.md`; do not add them piecemeal.

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
| `scheduleSync.ts` | `computeScheduleQuantities`, `scheduleQtyFor`, `computeSystemGlobals`, `lockBudgetVersion` |
| `format.ts` | `formatMoney`, `parseMoney`, `formatPercent`, `currencySymbolOf` |
| `templates/index.ts` | `templateBudget('blank'|'feature')`, feature chart, 10% contingency markup |
| `templates/fromSchedule.ts` | Preview counts + `buildBudgetFromSchedule` |
| `reportTemplates.ts` | Three transient `ReportDesign`s (Top Sheet, Account Detail, Budget Health) |
| `export.ts` | CSV + lossless JSON export, JSON import/parse, filename |

Not built yet: `costReport.ts` (phase 2), `overtime.ts` (phase 3), binary/MMB
import.

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

- Grammar: numbers, `+ - * /`, parentheses, unary minus and global symbols.
  No functions, no property access, no `{{line.*}}` cross-line references.
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
```

- Every type is in BOTH the `Action` union and `ACTION_TYPES` ("KEEP IN
  SYNC"). Bulk UI operations wrap `BATCH_START`/`BATCH_COMMIT` so a paste or a
  fringe apply is one undo entry.
- `NEW_BUDGET_VERSION` copies `cloneFromId`'s line array by reference
  (copy-on-write); an omitted/null id creates a BLANK version. The UI's Create
  adds `vNN` blank; Duplicate clones the current version as `<name> Copy`. The
  chart/library is never cloned.
- `LOCK_BUDGET_VERSION` pins only live-linked lines (`source` set,
  `qtyOverride == null`) using the UI-computed map; `locked` freezes editing.
- `migrateBudget(project)` runs in the reducer's `LOAD` (every local/Drive/
  online/room load path): fills missing arrays/defaults, repairs activeVersion,
  and prunes `versionTrash` (30-day TTL + newest 10). Never creates a budget.
- `DELETE_BUDGET_VERSION` also prunes trash; the last version cannot be
  deleted (the case returns state unchanged).
- Persistence is plain JSON — no `projectCodec` change. Undo is the normal
  reducer history (50 states); edits return new arrays only for the changed
  slice.
- Room worker folds the same reducer; budget cases are pure/DOM-free.
- Phase-2 actions (`ADD_EXPENSE` …) do not exist yet.

## 6. Security & permissions
- Budget is project state; a viewer or shared `.lemon` sees it. **Do not claim
  secrecy.**
- `locked = readOnly || !canEdit` (plus `version.locked`) gates every write;
  the bridge/MCP refuses writes for viewers. Test it.
- No bank/SSN/card numbers or receipt blobs in state; `receiptUrl` is a link
  only (phase 2).
- Sharing must say "Viewers can see the budget" before a view-only link
  (phase 2). A UI hide toggle is not security.
- True producer-only privacy needs a separate Supabase document/RLS or
  encryption with a key not shared to viewers — a separate architecture
  decision.
- Run the security-review relevance check when touching sharing/roles/room
  writes; never auto-run the full audit.

## 7. Surfaces (summary — manual: `docs/BUDGETING-SURFACES.md`)

- Budget tab (⌘8) between Production and Reports; sub-tabs Budget / Cost Report
  / Expenses / Library. Budget and Library are live; Cost Report and Expenses
  show "next phase" states. Phone chrome is unsupported in v1.
- Budget view: KPI strip, category rail, one expanded sheet (category and
  account bands + line rows), toolbar (Category, Markup, linked-line summary,
  Print, Export, Import), footer totals.
- Grid: shared `InlineGlideTable`; painted kit pickers (unit/currency enum,
  fringe/group entity multi); an (i) glyph opens the node/line editor; a
  persistent trash column deletes; right-click exposes the same row actions.
- Library: settings card, system-values card, and editable tables for fringes,
  groups (colour swatch cell → group modal with the shared `ColorField`),
  globals, units, currencies and markups.
- Versions: shared `ItemManagerDropdown` + lock/unlock, version trash restore.
- Reports: `budgetTable` leaf (three modes), budget collections/fields, three
  transient print designs + "Save as design"; Print always via
  `ReportPrintDialog`.

## 8. Phases

Detailed packages: **`docs/BUDGETING-PHASES.md`**.

**1 — Budget authoring, versions & reports — LANDED (2026-10-30).** Model +
shared chart/library, versions + trash + lock, Budget tab, `InlineGlideTable`
sheet, templates (Blank/Feature/From schedule), fringes/globals/groups/units/
markups, per-line currency + fx/base totals, live schedule links, `budgetTable`
+ budget fields/collections, three prints, CSV/JSON export + JSON import.
Divergences from the original plan (authoritative):
- Cost Report and Expenses are placeholders, not built.
- Formula grammar has no `{{line.*}}` cross-line references.
- Fringes apply by named id or shared group; percent fringes sharing a
  `fringeRangeId` apply once over the range sum (first line owns it).
- Version **lock** pins live-linked quantities (UI computes via
  `lockBudgetVersion`, reducer applies); **unlock does not unpin**.
- Version **Create adds a blank version**; **Duplicate clones** the active
  version copy-on-write.
- The grid is the shared `InlineGlideTable`, not a bespoke Glide fork.
- Reports support `topsheet`/`accounts`/`lines`; `costReport`, `hotCost`,
  `cashflow` and `comparison` fall back to `topsheet` until their engines land.
- Import is JSON only (CSV is export-only); no template wizard, no "used by N"
  jump (delete still warns with the in-use count).
- The fringe **group tagging** and **range id** fields exist in the model and
  engine but have no Library/line UI yet (import/agent only).
- Markup scope/caps fields exist in the model but only name/kind/calc/percent/
  amount/compound are editable; phase-1 markups apply to every in-budget
  category (base + fringes) unless compound is on.

**2 — Cost tracking.** Expenses/POs, Cost Report view (replacing the
placeholder), Day Manager Expenses card/modal, actuals/committed/ETC/EFC/
variance, `costReport`/`expenses` report collections, cost report print,
expense CSV.

**3 — Overtime.** Crew + cast rates/guarantees, project/day/dept/person
overrides, Crew card modal (Day/Departments/Crew/Cast), hours/cost,
post-to-expenses, report fields, version-lock interaction.

**4 — Advanced.** Version compare/Original-Variance, cashflow, incentives/
credits, currency report, AICP, episodic, approvals/petty-cash depth, MMB
import/export. Compare remains phase 4 (no phase-1 compare UI was built).

## 9. Verification & docs
- `npm run lint` (tsc + doc budget + roadmap hygiene + e2e lint) and
  `npm run test:unit` for the pure maths (`src/lib/__tests__/budget.test.ts`,
  `reportBudget.test.ts`).
- Full E2E for logic/data/store changes (rule 7); `e2e/budget.spec.ts` covers
  create-from-template, persistence and linked/lock behaviour. Extend
  `scripts/smart-test.mjs` `RULES` when adding specs.
- Perf: 1,000 lines; no per-row `useProject()`; `computeBudget` memoized once
  per surface; watch file size.
- Security: viewer read-only, MCP refusal, no secrets in state.
- Docs: this file, `BUDGETING-SURFACES.md`, `BUDGETING-PHASES.md`,
  `REPORTS-DESIGNER.md`, `API.md`, one-line `AGENTS.md` pointer. Version bump
  at the work's wrap.

## 10. Relations
`depends on` **315** (Day Manager tabs), **146** (crew slots) + **99** (call
times) for OT, **157** (cast rates), **66** (calendar counts), **97** (MCP).
`relates to` **333**, **311/248**, **322**, **202**, **172**, **123**, **308**,
**230**. No existing budget item; this is new.
