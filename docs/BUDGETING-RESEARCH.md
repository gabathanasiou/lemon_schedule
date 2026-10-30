# Budgeting — market research reference

Status: **research reference for roadmap 334.** The product/architecture plan is
`docs/BUDGETING.md`; this file is the evidence base (tools, features, reports,
industry maths). Read both before designing a budget surface.

Scope: feature/UX/report research for film, TV and commercial production
budgeting, cost reporting and production accounting. Researched 2026-10-30.
Pricing is deliberately omitted except where it explains positioning.

---

## 1. What the market converges on

Every serious tool has the same core: **three levels** (Top Sheet → Accounts →
Detail lines), a **library of assumptions** (fringes, globals/formulas, groups/
tags, units, currencies, markups/charges/credits), **one calculation engine**
(budget, cost report, cashflow, exports), a **report layer** (Top Sheet,
Account Detail, Cost Report, setup/notes/comparison), and **actuals** during
production (invoices, POs, petty cash, payroll → Budget/Actual/Committed/ETC/
EFC/Variance).

Modern tools add real-time collaboration, phases/scenarios, saved views, rate
packs, tax-incentive modelling, receipt/P-card actualisation, a PDF/report
builder, APIs/MCP, and script/schedule-driven quantities.

Lemon's opening is not "another Movie Magic". It is **the budget that already
knows the stripboard, the DOOD, the crew roster and the call sheet**.

---

## 2. Tool landscape

| Tool | Type / positioning | Standout features | Gaps / notes |
| --- | --- | --- | --- |
| **Movie Magic Budgeting (EP)** | Desktop + cloud-synced; studio/network standard | 3 levels; fringes with cutoffs + ranges; globals; groups (suppress/roll-up); units with hours; currencies; contractual charges; credits/incentives; sub-budgets; versions/history; budget comparison; report setup with cover/header/footer; SmartAccounting link | Dated UI; desktop-first; real-time collaboration limited; MMB file expected by studios/bond companies; no meaningful AI |
| **Showbiz Budgeting 10 (Cast & Crew / Media Services)** | Desktop + Showbiz Cloud; commercials/indie to tentpole | 100+ templates incl. AICP; actualisation (payroll imports, credit/check/EFT/invoice, petty cash, POs); 5 editable OT tiers; fringe ranges + fringe grouping; phases; dynamic currency links; detail attachments; cost reports, PO logs, petty cash reports | Clunky UI; desktop-first; cloud is an add-on; commercial emphasis |
| **Hot Budget (Hot Bricks)** | Mac Excel workbook; commercial/AICP | AICP native; original/running/actual side-by-side; PO/petty cash/payroll logs; integrated OT calculator; travel budget; timecard CSV import; contingency; currency converter; quick PDF cost summary | Single-user; Mac-only; no real cloud; budgeting + logs, not a full accounting system |
| **Saturation.io** | Cloud; modern indie/commercial | Phases (Estimate/Committed/Actual/Rollup); fringe groups/cutoffs; markups/discounts with scope + compounding; globals + formulas in Qty/Rate/X; units; rate packs; tax-incentive packs; POs; actuals; P-cards; saved views + share links; PDF builder; API/MCP | Not AICP-native; newer than MMB; AI is a separate layer (excluded for us) |
| **Line Budgeter (line.pm)** | Cloud; modern production finance | 3 levels with drill-down; smart groups (Cast/Crew/Vendor profile rows with hire/rate/pay-hours); bracket-path line references; formulas/data references/universals; line caps; batch fringes/incentives; compare budgets; sub-budgets; cashflow report with tranches/holdback; report wizard; MMB import/export | Newer entrant; premium reports gated; complex for beginners |
| **Wrapbook** | Payroll + production accounting | Cost tracking/POs/petty cash; budget import (Hot Budget/MMB/Showbiz); cost reports + EFC dashboard; approvals; payroll actuals; AI invoice/PO matching (excluded) | Not a full budget builder; best when payroll runs through Wrapbook |
| **EP SmartAccounting** | Production accounting | Real-time cost report/EFC; SmartPO + Payables; approvals by amount/dept/location/currency; multi-currency; audit packets; payroll/AP/JE together | Pairs with MMB; not a standalone budget authoring tool |
| **GreenSlate** | Payroll + accounting | Payroll/onboarding, GL, approvals, reporting | Same category as Wrapbook/EP |
| **Storiara** | Script-to-breakdown → schedule → budget | Budget drafted from breakdown + schedule; rate tables + union/guild rates; cast paid days from DOOD; sync from project; contingency/bond; incentive estimates; actuals/POs/petty cash/cost report; MMB import/export | Small-production focus; AI script parsing (excluded for us) |
| **RivetAI** | Script-to-breakdown/schedule/budget | Studio templates (Netflix/Disney/HBO/BBC…); budget health KPIs (cost/shoot day, ATL/BTL, committed, variance); tax-incentive map; industry benchmarks; scenarios; fringes; script-revision staleness prompts; MCP | AI-first; pre-production, not a full accounting ledger |
| **Filmustage** | AI breakdown → budget template | Budget template generated from breakdown + schedule; DOOD; local rate estimates; export with formulas; MMB export; AI agent | AI-first; budget depth below MMB/Saturation |
| **Studiovity** | All-in-one production suite | Top sheet + department detail; globals; fringes; multi-currency; mobile; script breakdown/schedule | Budget depth below dedicated tools |
| **Yamdu** | Production management | Budgeting with Dynamic Globals linked to shooting/production schedule; time cards; CO2 budgeting; broad PM | Budget is one module in a bigger suite |
| **Celtx** | All-in-one indie | Script → breakdown → budget; templates; cloud | Basic budget depth |
| **StudioBinder** | All-in-one | Budget templates/top sheet; scheduling/call sheets | Basic budget depth |
| **Dolly / CASHét** | Production cards/expense | Instant crew cards; point-of-sale coding to budget lines; receipts; vendor ACH/check; incentive-ready spend | Not budgeting; feeds actuals |
| **RollCredits** | AI-first payroll/payments/cards | Payroll, payments, P-cards, AI reconciliation | Not a budget authoring tool |

### Feature matrix (what "serious" means)

Legend: ● strong, ◐ partial, ○ absent/weak.

| Capability | MMB | Showbiz | Hot Budget | Saturation | Line.pm | Wrapbook | Storiara | RivetAI |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Top Sheet → Accounts → Lines | ● | ● | ● | ● | ● | ◐ | ● | ● |
| Globals / formulas | ● | ● | ◐ | ● | ● | ○ | ◐ | ◐ |
| Fringes + cutoffs + ranges | ● | ● | ◐ | ● | ● | ◐ | ● | ● |
| Groups / tags / suppression | ● | ● | ◐ | ● | ● | ◐ | ◐ | ◐ |
| Units with hour equivalence | ● | ● | ◐ | ● | ● | ○ | ◐ | ◐ |
| Multi-currency | ◐ | ● | ◐ | ● | ● | ◐ | ◐ | ● |
| Markups / charges / credits | ● | ● | ◐ | ● | ● | ○ | ◐ | ● |
| Incentives / credits | ● | ◐ | ○ | ● | ● | ◐ | ● | ● |
| Overtime tiers | ◐ | ● | ● | ● | ● | ◐ | ◐ | ◐ |
| Versions / compare | ● | ◐ | ◐ | ● | ● | ◐ | ◐ | ● |
| Sub-budgets / scenarios | ● | ◐ | ◐ | ● | ● | ○ | ◐ | ● |
| Actuals | ◐ | ● | ◐ | ● | ◐ | ● | ● | ◐ |
| POs | ◐ | ● | ● | ● | ◐ | ● | ● | ◐ |
| Petty cash | ◐ | ● | ● | ◐ | ◐ | ● | ● | ○ |
| Cost report / EFC | ◐ | ● | ◐ | ● | ◐ | ● | ● | ◐ |
| Cashflow | ○ | ◐ | ◐ | ◐ | ● | ◐ | ○ | ○ |
| Real-time collaboration | ◐ | ◐ | ○ | ● | ◐ | ● | ◐ | ◐ |
| Granular permissions | ◐ | ● | ○ | ● | ◐ | ● | ◐ | ● |
| Report builder / PDF | ● | ● | ● | ● | ● | ● | ◐ | ◐ |
| MMB import/export | ● | ● | ○ | ◐ | ● | ◐ | ● | ◐ |
| API / MCP | ◐ | ○ | ○ | ● | ○ | ○ | ○ | ● |
| Mobile | ◐ | ◐ | ○ | ● | ◐ | ● | ◐ | ◐ |

---

## 3. UI patterns worth stealing

### 3.1 Three-level mental model, one surface

- **MMB** navigates Topsheet → Accounts → Details with tree/breadcrumb and
  keyboard shortcuts. Powerful, but screen-switching hides context.
- **Line.pm** keeps the same levels with drill-down and a persistent header
  band; smart-group profile rows collapse to one line.
- **Saturation** puts the whole budget in one expandable grid: accounts expand
  into sub-accounts/lines, collapse back to the Top Sheet. This is the best
  modern compromise: industry mental model, one context.

**Lemon recommendation:** one Budget sheet with category/account rows that
expand in place, plus a category rail for navigation. Keep MMB keyboard/level
shortcuts as accelerators, not separate screens.

### 3.2 Phase columns

Saturation's Estimate / Committed / Actual / Rollup columns on every row is the
clearest way to show budget vs live cost without leaving the sheet. Rollups are
formulas (`@Estimate - @Actual`). Phases can be filtered, hidden, locked,
reordered, saved as views.

**Lemon recommendation:** Budget view = Estimate detail; Cost Report view =
Budget / Actual / Committed / ETC / EFC / Variance. Reuse one read model; do not
build a second grid engine.

### 3.3 Library / tools panes

MMB keeps Fringes/Groups/Globals/Units/Currencies/Charges/Credits in a dockable
Tools pane; Saturation puts them in a Library. Both let you apply a tool to
selected lines and see the calculated split.

**Lemon recommendation:** a Budget → Library view with editable tables; line
cells use the shared pickers (`PickerField`/`SearchMenu`) and show chips. A
"Where used" count per definition.

### 3.4 Smart groups (hire profiles)

Line.pm's Cast/Crew/Vendor smart groups hold the hire story (name, role, city,
hire type, dates, ratebook, affiliation, loan-out, rate/scale, guarantee, days
per week, pay hours), collapsible to one line.

**Lemon recommendation:** skip the full smart-group UI in v1. Add crew rates +
guarantee/pay-hours (needed for OT) and use a per-line "source" link to crew/
cast/location/element for the same traceability with less UI.

### 3.5 Overtime translator

Showbiz shows straight and OT rates side by side in the detail window; Saturation
has a tier calculator (base hours + OT hours × multiplier, per line). Both are
line-level. Lemon has something neither has: **the day's calls and wrap**, so OT
can be computed per day, department and person, then posted to actuals.

### 3.6 Report wizards / builders

MMB uses Report Setup with Included Sections (Cover, Topsheet, Category Summary,
Account Details, Chart of Accounts, Budget Info, Notes, Setup Reports), column
control and cover/header/footer templates. Line.pm uses a 5-step wizard, saved
reports and custom slices. Saturation has a drag-and-drop PDF builder.

**Lemon recommendation:** the Reports Designer already is the builder. Add a
`budgetTable` block + budget fields/collections, ship built-in print templates,
and keep the existing print dialog/paginator. No second report engine.

### 3.7 Collaboration and sharing

Saturation: real-time editing, saved views, read-only share links scoped to
accounts. Showbiz Cloud: per-collaborator view/edit, per-phase, per-function.
Lemon already has real-time rooms, presence, roles and view-only links.

**Lemon recommendation:** budget follows project roles in v1; per-account view
scoping is later. Flag the privacy limitation (viewers see the project blob).

## 4. Reports and print inventory

### 4.1 Top Sheet

Purpose: one-page executive summary; the page studios/financiers read first.

Typical columns: **Acct, Name, % of Total, Page, Subtotal, T&F (tax & fringe),
Incentives, Total**. Summary stack: Total → Applied T&F → Gross Total → Applied
Incentives → Net Total. Production Totals rows split ATL/BTL. Original/Variance
columns optional.

### 4.2 Account Detail

Purpose: the full budget by account, with line detail.

Line columns: Line #, Description, Type/kind, Location, Phase, Dates, Qty/Amount,
Unit, X, Rate, Currency, Subtotal, T&F, Incentives, Total. Optional: groups,
notes, smart-group profile fields, user-defined columns. Account and category
subtotals; total at the end; fringe ranges bracketed; suppressed lines greyed.

### 4.3 Cost Report (weekly / as-of)

Purpose: budget vs actual vs commitment vs forecast.

Columns (industry-standard):

| Column | Meaning |
| --- | --- |
| Account / Description | Chart of accounts row |
| Budget | Approved/original budget |
| Period Actual | Spend in the reporting period |
| Actual to Date | Cumulative paid/invoiced actuals |
| POs / Committed | Approved POs + committed costs not yet invoiced |
| Total to Date | Actual to date + committed |
| ETC | Estimate to complete (judgement; manual override) |
| EFC | Estimated final cost = Actual + Committed + ETC |
| Variance | Budget − EFC (negative = over) |
| % Used / % Complete | (Actual + Committed) ÷ Budget, or progress |
| Approved Overage | Adds to total budget |
| Total Budget | Budget + approved overage |
| EFC Reason | Why the forecast changed |

Summary rows by category and grand total. Period variance optional. Cost reports
are produced weekly during principal photography for producer, studio/network,
bond company and investors.

### 4.4 Hot Cost (daily)

Purpose: tomorrow-morning estimate of what yesterday cost vs what the budget
allowed, so the UPM can still act.

Blocks: report info (day, sets, sources, distribution); schedule vs actual
(crew call, first shot, lunch, company move, camera wrap, last out, pages,
scenes, background/stand-ins, meals); cost variances by account (budget for the
day, actual, over/under, note, fringes on labour overages); running total by
shoot day; known costs ahead; overage-to-date + known vs contingency share.

### 4.5 Cashflow

Purpose: spread the budget over time for financiers/bond companies.

Columns: Acct, Description, Budget Total, then weekly/bi-monthly/monthly
tranches, each headed with period number + end date. Summary rows: Total ATL,
Total BTL, Budget Total per period, Holdback (N%), Tranche Total, Total Drawn.
Built from location/phase dates; lines with no dates fall outside the timeline.
Landscape; CSV export.

### 4.6 Budget Comparison

Purpose: what changed between drafts/scenarios.

Columns: current Total + one or two compare budgets + Variance + %. Accounts
matched by number/name; accounts only in the current budget show 0 in compare;
accounts only in compare append read-only with negative variance. Read-only while
comparing; flags allowed. Original/Variance is a separate mode (current vs its
own saved snapshot).

### 4.7 Other reports

- **Chart of Accounts** — category/account numbers and names.
- **Budget Information** — title, currency, counts (categories/accounts/lines/
  fringes/globals/units/locations).
- **Notes / Setup** — all notes; fringes, globals, groups, units, locations,
  sets, currencies, charges, credits (rates/caps/totals/usage).
- **Cover / Header / Footer** — dynamic tags (page number, today, file name,
  created/modified, base currency, counts).
- **PO Log** — PO #, date, vendor, purpose, account, amount, method, invoiced/
  committed/paid, status, void/returned. **Petty Cash Envelope** — float,
  custodian/department, advance, envelope #, limit, receipt lines, summary by
  account, reconciliation, sign-offs. **Expense Detail** — date, vendor,
  description, account, amount, status, method, PO, day.
- **Cashflow / Currency** — spend by currency. **Cast Cost / DOOD Cost** —
  work/hold/travel days, rate, cost, fringes. **Crew Cost** — person, role/dept,
  days, rate, OT, fringes, total. **Location Cost** — location, days, fees.
- **Incentive Summary** — qualified spend, rate, cap type, credit, discount, net
  credit. **AICP Bid Form** — sections A–X (post Q–W; X free-form). **Episodic
  Budget / Amortization** — pattern/amort plus per-episode topsheets.

### 4.8 Print mechanics

Landscape for Top Sheet/Cost Report/Cashflow; portrait for notes/cover.
Repeat table headers on every page; keep category/account headers with the next
row; page numbers; cover/header/footer; title page; signature block; optional
watermark; PDF and CSV (cashflow); never print without the report dialog.

## 5. Overtime and labour maths (generic, configurable)

The tool must not hardcode union rules; agreements differ and change. Model a
generic engine with editable tiers and presets.

Common patterns found:

- **SAG-AFTRA** (examples): 8-hour minimum call; 1.5× after 8; 2× after 10 on
  some agreements; 2× after 12 on others; background OT in tenths; additional
  day's pay after 16 hours on some schedules. P&H ~22% (2026 example).
- **IATSE** (examples): 8-hour minimum; 1.5× hours 9–12; 2× after 12; 3× after
  15 elapsed; 6th day 1.5× (2× after 12); 7th day starts at 2× (3× after 15);
  turnaround/meal penalties separate.
- **Non-union CA**: 1.5× after 8, 2× after 12 (labour code), rates negotiable
  above minimums.
- **Day rates** usually include a guaranteed number of hours (8/10/12); hourly
  equivalent = day rate ÷ guaranteed hours. Weekly rates need days/week and
  guaranteed hours.
- **OT allowance**: many budgets include hours 11–12 on every shoot day; the hot
  cost only prices time past the allowance.
- **Fringes apply to OT**; fringes on labour overages belong in the hot cost.

**Lemon model:** base hours + ordered tiers + multipliers + allowance; resolve
project → day → department → person; rate basis hour/day/week with guarantee;
projected (scheduled wrap) vs actual (actual wrap / hours override); post the
actual to expenses. Cast OT is a separate later phase (SAG rules differ).

## 6. Cutting edge (and the no-AI decision)

The frontier is real, but most of it is **automation around the budget**, not a
better grid:

- **Script/schedule-driven quantities** — Storiara drafts a budget from the
  breakdown/schedule and syncs cast paid days from the DOOD; RivetAI links
  script revisions to budget staleness; Filmustage generates the budget template
  from breakdown + schedule. This is the strongest differentiator and Lemon
  already owns the schedule/DOOD/crew/call-sheet data.
- **Live actuals / EFC** — Saturation, Wrapbook, EP SmartAccounting refresh cost
  reports as transactions arrive, not overnight batches.
- **Point-of-sale coding / P-cards** — Dolly/CASHét/Saturation code spend to
  budget lines at the card swipe, with receipts on set.
- **Approval flows** — POs/invoices routed by amount/department/location/currency.
- **Rate packs / incentive packs / benchmarks** — Saturation, RivetAI, Line.pm.
- **Scenarios / phases / lock a bid** — Saturation, Line.pm, MMB.
- **APIs / MCP** — RivetAI and Saturation expose production tools to external AI
  clients; Lemon already has the debug bridge + loopback MCP. This is the right
  seam for any AI assistance: **external agent, no bundled AI**.
- **Local-first/offline** — rare in cloud tools; Lemon's local project + optional
  Drive/online sync is an advantage on set.

**Product decision (user, 2026-10-30): no AI bundled in the app.** Do not add
model calls, prompts, generated content or AI branding. The bridge/MCP is the
extension point if the user wants an external agent to draft or code.

## 7. What this means for Lemon

**Must-have v1:** 3-level chart of accounts in a modern expandable grid; Qty ×
Unit × Rate × X with integer-cent maths; fringes (percent/flat/per-unit, cutoff,
group, posting), globals/formulas, groups/tags, units, markups/contingency; Top
Sheet + Account Detail + Cost Report prints through the Reports Designer;
Feature/Commercial/Blank templates; undo/redo, persistence, collaboration,
read-only gate.

**Differentiators:** generate/refresh quantities from the stripboard/DOOD/crew
roster; Day Manager expenses + overtime feeding the cost report; branded budget
reports; bridge/MCP for external agents; local-first on set.

**Later:** versions/compare, cashflow, incentives, multi-currency, AICP,
episodic, PO/approval/petty-cash depth, MMB binary import/export.

---

## 8. Sources

Primary product/manual pages (accessed 2026-10-30):

- Movie Magic Budgeting — <https://www.ep.com/movie-magic-budgeting/>
- MMB manual: Apply Tools — <https://mmb-docs.ep.com/ApplyTools/Apply_Tools_Overview.html>
- MMB manual: Columns — <https://mmb-docs.ep.com/Budget_Navigation/columns.html>
- MMB manual: Fringes — <https://mmb-docs.ep.com/Setup/fringes.html>
- MMB manual: Globals — <https://mmb-docs.ep.com/Setup/globals.html>
- MMB manual: Groups — <https://mmb-docs.ep.com/Setup/groups.html>
- MMB manual: Units — <https://mmb-docs.ep.com/Setup/units.html>
- MMB manual: Charges — <https://mmb-docs.ep.com/Setup/charges.html>
- MMB manual: Credits — <https://mmb-docs.ep.com/Setup/credits.html>
- MMB manual: Sub-Budgets — <https://mmb-docs.ep.com/Sub_Budgets/Sub_Budget_Overview.html>
- MMB manual: Versions — <https://mmb-docs.ep.com/History_Versions/versions.html>
- MMB manual: Reports — <https://mmb-docs.ep.com/Reports_Printing/Reports_Overview.html>
- MMB manual: Included Sections — <https://mmb-docs.ep.com/Reports_Printing/Reports_Included_Sections.html>
- MMB manual: Cover/Header/Footer — <https://mmb-docs.ep.com/Reports_Printing/Header_Footer.html>
- MMB manual: Budget Comparison — <https://mmb-docs.ep.com/Comparison/Comparison_Overview.html>
- Showbiz Budgeting 10 — <https://store.castandcrew.com/product/showbiz-budgeting/>
- Saturation budgeting — <https://saturation.io/budgeting>
- Saturation help: intro/setup — <https://support.saturation.io/en/articles/16447605-set-up-your-budget-saturation-3-0>
- Saturation help: fringes — <https://support.saturation.io/en/articles/16446187-fringes-saturation-3-0>
- Saturation help: markups — <https://support.saturation.io/en/articles/16449639-markups-saturation-3-0>
- Saturation help: globals/formulas — <https://support.saturation.io/en/articles/16446164-globals-and-formulas-saturation-3-0>
- Saturation help: overtime — <https://support.saturation.io/en/articles/16450566-overtime-saturation-3-0>
- Saturation help: phases — <https://support.saturation.io/en/articles/17176872-phases-saturation-3-0>
- Saturation help: POs — <https://support.saturation.io/en/articles/16446413-purchase-orders-saturation-3-0>
- Saturation help: actualize — <https://support.saturation.io/en/articles/16497360-actualize-and-track-expenses-against-a-budget-saturation-3-0>
- Saturation cost report explainer — <https://saturation.io/blog/production-cost-report>
- Line Budgeter docs: reports — <https://docs.line.pm/docs/reports/overview>
- Line Budgeter docs: budget report — <https://docs.line.pm/docs/reports/budget-report>
- Line Budgeter docs: cashflow — <https://docs.line.pm/docs/reports/cashflow-report>
- Line Budgeter docs: topsheet — <https://docs.line.pm/docs/topsheet/ts-overview>
- Line Budgeter docs: details — <https://docs.line.pm/docs/details/dts-overview>
- Line Budgeter docs: smart groups — <https://docs.line.pm/docs/details/dts-smart-groups>
- Line Budgeter docs: line cap — <https://docs.line.pm/docs/details/dts-line-cap>
- Line Budgeter docs: compare — <https://docs.line.pm/docs/features/compare>
- Wrapbook: best budgeting software — <https://www.wrapbook.com/blog/best-film-budgeting-software>
- Wrapbook: production accounting — <https://www.wrapbook.com/platform/production-accounting>
- Wrapbook cost reports — <https://help.wrapbook.com/docs/cost-reports-pas>
- Wrapbook EFC dashboard — <https://help.wrapbook.com/docs/budget-efc-dashboard-pas>
- Wrapbook SAG rates — <https://www.wrapbook.com/blog/essential-guide-sag-rates>
- Wrapbook cash flow/PO log — <https://www.wrapbook.com/blog/how-to-manage-cash-flow-and-po-log>
- Hot Budget features — <https://hotbudget.com/feature/>
- Storiara budgeting — <https://storiara.com/feature/budgeting>
- Storiara hot cost template — <https://storiara.com/templates/hot-cost-report>
- Storiara petty cash log — <https://storiara.com/templates/petty-cash-log>
- Storiara vs Showbiz/MMB — <https://storiara.com/compare/showbiz-vs-movie-magic-budgeting>
- RivetAI budgeting — <https://www.rivetai.com/en/features/budgeting>
- RivetAI MCP — <https://www.rivetai.com/en/mcp>
- Filmustage budgeting — <https://filmustage.com/budgeting/>
- Studiovity 2026 comparison — <https://studiovity.com/5-best-film-budgeting-software-2026>
- Yamdu — <https://yamdu.com>
- EP SmartAccounting — <https://www.ep.com/smartaccounting/>
- GreenSlate — <https://greenslate.com>
- Dolly production expense guide — <https://www.dollycard.com/guides/best-production-expense-management>
- CMS Productions 2026 comparison — <https://cmsproductions.com/blog/best-film-commercial-production-budgeting-software-2026>
- Cost report structure (AU) — <https://www.countoutloud.com.au/cost-report-film-production-australia/>
- Media Services sample cost report — <https://www.mediaservices.com/pdf/sample_film_budget_cost_report_layout.pdf>
- AICP bidding resources — <https://aicp.com/business-resources/business-affairs-information/bidding-resources>
- AICP bid form update — <https://lbbonline.com/news/aicp-introduces-updated-and-revised-bid-form>
- IATSE 2024 Basic Agreement MOA — <https://iatse.net/wp-content/uploads/2024/07/2024-IATSE-Basic-Agreement-MOA-FINAL.pdf>
- IATSE Area Standards payroll guide — <https://www.ftvconsulting.com/how-to-pay-under-the-iatse-area-standards-agreement>
- Media Services fringe table — <https://laborguide.mediaservices.com/labor-guide/fringes>
