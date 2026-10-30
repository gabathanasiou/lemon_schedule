import type {
  BudgetLine, BudgetSettings, Expense, ExpenseStatus, MoneyCents, Project, PurchaseOrder,
} from '../../types';
import { computeBudget, type BudgetModel } from './calc';
import { isoToday } from './model';

/**
 * `computeCostReport(project, { asOf, from, to })` — the ONE read model for
 * cost tracking (roadmap 334 phase 2). Built on `computeBudget`; this module
 * NEVER re-derives budget money. It only attributes expenses/POs to the chart
 * and derives Actual/Committed/ETC/EFC/Variance/% used.
 *
 * The maths (docs/BUDGETING.md §4, docs/BUDGETING-SURFACES.md §7):
 *
 *   actual    = Σ expenses status actual|paid, date ≤ asOf
 *   committed = Σ committed expenses WITHOUT a poId
 *               + Σ open/partial PO remaining (amount − expenses charged to it)
 *   etc       = line.etcCents ?? max(0, budget − actual − committed)
 *   efc       = actual + committed + etc
 *   variance  = budget + approvedOverage − efc
 *   % used    = (actual + committed) / (budget + approvedOverage)
 *
 * A `from`/`to` period narrows the DISPLAYED Actual (period views); EFC,
 * variance and % used always use the as-of actual ("EFC stays as-of").
 * Expenses with no `lineId` roll into the account's "Unallocated" child;
 * expenses with no `accountId` roll into a project-level "Unallocated" row.
 */

export type CostRowKind = 'category' | 'account' | 'line' | 'unallocated';

export interface CostRow {
  key: string;
  kind: CostRowKind;
  /** 0 = category, 1 = account, 2 = line. */
  depth: 0 | 1 | 2;
  categoryId?: string;
  accountId?: string;
  lineId?: string;
  number: string;
  name: string;
  budgetCents: MoneyCents;
  approvedOverageCents: MoneyCents;
  /** Actual for the selected period (=== actualAsOfCents without a period). */
  actualCents: MoneyCents;
  /** Actual through the as-of date — EFC/variance/% used use this. */
  actualAsOfCents: MoneyCents;
  committedCents: MoneyCents;
  etcCents: MoneyCents;
  efcCents: MoneyCents;
  varianceCents: MoneyCents;
  /** (actualAsOf + committed) / (budget + approved overage) × 100. */
  percentUsed: number;
  /** True when the line's ETC is an explicit override, not the remainder. */
  etcOverride: boolean;
  etcReason?: string;
  /** False for out-of-budget categories (rows stay visible, excluded from totals). */
  inBudget: boolean;
  /** The budget line a line row edits (inline ETC/reason). */
  line?: BudgetLine;
}

export interface CostAccountNode {
  accountId: string;
  number: string;
  name: string;
  row: CostRow;
  lines: CostRow[];
  /** Account-level expenses (no line) — present only when non-zero. */
  unallocated?: CostRow;
}

export interface CostCategoryNode {
  categoryId: string;
  number: string;
  name: string;
  inBudget: boolean;
  row: CostRow;
  accounts: CostAccountNode[];
}

export interface CostTotals {
  budgetCents: MoneyCents;
  /** Contingency/markups already inside `budgetCents`. */
  markupCents: MoneyCents;
  approvedOverageCents: MoneyCents;
  actualCents: MoneyCents;
  actualAsOfCents: MoneyCents;
  committedCents: MoneyCents;
  etcCents: MoneyCents;
  efcCents: MoneyCents;
  varianceCents: MoneyCents;
  percentUsed: number;
}

export interface CostReportModel {
  settings: BudgetSettings;
  versionId: string;
  asOf: string;
  from?: string;
  to?: string;
  categories: CostCategoryNode[];
  /** Project-level expenses/POs with no (valid) account. */
  unallocated: CostRow | null;
  totals: CostTotals;
  expenseCount: number;
  purchaseOrderCount: number;
  /** True when a period filter narrowed the displayed Actual. */
  periodApplied: boolean;
}

export interface CostReportOptions {
  asOf?: string;
  from?: string;
  to?: string;
  /** Reuse an already-computed budget read (one per surface). */
  budget?: BudgetModel | null;
  versionId?: string;
}

interface SpendBucket {
  actualAsOf: MoneyCents;
  actualPeriod: MoneyCents;
  committed: MoneyCents;
}

function emptyBucket(): SpendBucket {
  return { actualAsOf: 0, actualPeriod: 0, committed: 0 };
}

function addBucket(into: SpendBucket, from: SpendBucket): void {
  into.actualAsOf += from.actualAsOf;
  into.actualPeriod += from.actualPeriod;
  into.committed += from.committed;
}

export function expenseStatusOf(expense: Expense): ExpenseStatus {
  return expense.status || 'actual';
}

/** `actual`/`paid` money that has left (or been invoiced to) the production. */
export function isActualExpense(expense: Expense): boolean {
  const status = expenseStatusOf(expense);
  return status === 'actual' || status === 'paid';
}

export function isCommittedExpense(expense: Expense): boolean {
  return expenseStatusOf(expense) === 'committed';
}

function inPeriod(date: string | undefined, from?: string, to?: string): boolean {
  if (!date) return true;
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

function beforeOrOn(date: string | undefined, asOf: string): boolean {
  if (!date) return true;
  return date <= asOf;
}

/** ISO date string ordering is safe; a missing `asOf` means today. */
export function computeCostReport(project: Project, options: CostReportOptions = {}): CostReportModel | null {
  const model = options.budget ?? computeBudget(project, options.versionId ? { versionId: options.versionId } : {});
  if (!model) return null;
  const settings = model.settings;
  const asOf = options.asOf || isoToday();
  const from = options.from || undefined;
  const to = options.to || undefined;
  const periodApplied = !!(from || to);
  const expenses = project.expenses || [];
  const purchaseOrders = project.purchaseOrders || [];

  const lineBuckets = new Map<string, SpendBucket>();
  const accountBuckets = new Map<string, SpendBucket>();
  const projectBucket = emptyBucket();

  // Valid ids, so a stale reference degrades to "Unallocated" instead of a
  // phantom row (never a crash, never a lost expense).
  const accountIds = new Set(model.categories.flatMap(c => c.accounts.map(a => a.account.id)));
  const lineAccount = new Map<string, string>();
  for (const cat of model.categories) {
    for (const acc of cat.accounts) {
      for (const line of acc.lines) lineAccount.set(line.line.id, acc.account.id);
    }
  }

  const bucketFor = (expense: Expense): SpendBucket => {
    const lineId = expense.lineId && lineAccount.has(expense.lineId) ? expense.lineId : undefined;
    if (lineId) {
      if (!lineBuckets.has(lineId)) lineBuckets.set(lineId, emptyBucket());
      return lineBuckets.get(lineId)!;
    }
    const accountId = expense.accountId && accountIds.has(expense.accountId) ? expense.accountId : undefined;
    if (accountId) {
      if (!accountBuckets.has(accountId)) accountBuckets.set(accountId, emptyBucket());
      return accountBuckets.get(accountId)!;
    }
    return projectBucket;
  };

  for (const expense of expenses) {
    if (expenseStatusOf(expense) === 'void') continue;
    const actual = isActualExpense(expense);
    const committed = isCommittedExpense(expense);
    if (!actual && !committed) continue;
    const bucket = bucketFor(expense);
    if (actual && beforeOrOn(expense.date, asOf)) {
      bucket.actualAsOf += expense.amountCents || 0;
      if (inPeriod(expense.date, from, to)) bucket.actualPeriod += expense.amountCents || 0;
    }
    // A committed expense covered by a PO is counted through the PO's
    // remaining balance instead (avoid double counting).
    if (committed && !expense.poId) bucket.committed += expense.amountCents || 0;
  }

  // Open/partial PO remaining = committed spend not yet invoiced. Expenses
  // charged to the PO are already counted through their own status (actual or
  // committed); planned ones are not spend yet, so they never reduce the PO.
  for (const po of purchaseOrders) {
    if (po.status === 'received' || po.status === 'cancelled') continue;
    const charged = expenses
      .filter(e => e.poId === po.id && (isActualExpense(e) || isCommittedExpense(e)))
      .reduce((sum, e) => sum + (e.amountCents || 0), 0);
    const remaining = Math.max(0, (po.amountCents || 0) - charged);
    if (remaining === 0) continue;
    const lineId = po.lineId && lineAccount.has(po.lineId) ? po.lineId : undefined;
    const accountId = po.accountId && accountIds.has(po.accountId) ? po.accountId : undefined;
    if (lineId) {
      if (!lineBuckets.has(lineId)) lineBuckets.set(lineId, emptyBucket());
      lineBuckets.get(lineId)!.committed += remaining;
    } else if (accountId) {
      if (!accountBuckets.has(accountId)) accountBuckets.set(accountId, emptyBucket());
      accountBuckets.get(accountId)!.committed += remaining;
    } else {
      projectBucket.committed += remaining;
    }
  }

  const rowMath = (
    budgetCents: MoneyCents,
    overageCents: MoneyCents,
    bucket: SpendBucket,
    etcCents: MoneyCents,
    etcOverride: boolean,
  ): Omit<CostRow, 'key' | 'kind' | 'depth' | 'number' | 'name' | 'line' | 'inBudget' | 'etcReason' | 'categoryId' | 'accountId' | 'lineId'> => {
    const efcCents = bucket.actualAsOf + bucket.committed + etcCents;
    const denominator = budgetCents + overageCents;
    return {
      budgetCents,
      approvedOverageCents: overageCents,
      actualCents: bucket.actualPeriod,
      actualAsOfCents: bucket.actualAsOf,
      committedCents: bucket.committed,
      etcCents,
      efcCents,
      varianceCents: denominator - efcCents,
      percentUsed: denominator > 0 ? ((bucket.actualAsOf + bucket.committed) / denominator) * 100 : 0,
      etcOverride,
    };
  };

  const categories: CostCategoryNode[] = [];
  for (const cat of model.categories) {
    const accountNodes: CostAccountNode[] = [];
    for (const acc of cat.accounts) {
      const lineRows: CostRow[] = [];
      const accBucket = emptyBucket();
      for (const line of acc.lines) {
        const bucket = lineBuckets.get(line.line.id) || emptyBucket();
        addBucket(accBucket, bucket);
        const budget = line.totalCents;
        const overage = line.line.approvedOverageCents ?? 0;
        const override = line.line.etcCents != null;
        const etc = override
          ? (line.line.etcCents as number)
          : Math.max(0, budget - bucket.actualAsOf - bucket.committed);
        lineRows.push({
          key: `line:${line.line.id}`,
          kind: 'line',
          depth: 2,
          categoryId: cat.category.id,
          accountId: acc.account.id,
          lineId: line.line.id,
          number: acc.account.number,
          name: line.line.description,
          inBudget: cat.inBudget,
          etcReason: line.line.etcReason,
          line: line.line,
          ...rowMath(budget, overage, bucket, etc, override),
        });
      }
      const unallocatedBucket = accountBuckets.get(acc.account.id);
      let unallocated: CostRow | undefined;
      if (unallocatedBucket && (unallocatedBucket.actualAsOf || unallocatedBucket.committed || unallocatedBucket.actualPeriod)) {
        addBucket(accBucket, unallocatedBucket);
        unallocated = {
          key: `unallocated:${acc.account.id}`,
          kind: 'unallocated',
          depth: 2,
          categoryId: cat.category.id,
          accountId: acc.account.id,
          number: acc.account.number,
          name: 'Unallocated',
          inBudget: cat.inBudget,
          ...rowMath(0, 0, unallocatedBucket, 0, false),
        };
      }
      // Account ETC is the sum of its lines' ETC — an unallocated spend has no
      // remaining estimate of its own (it is already spent).
      const accountEtc = lineRows.reduce((s, r) => s + r.etcCents, 0);
      const accountOverage = lineRows.reduce((s, r) => s + r.approvedOverageCents, 0);
      const accountRow: CostRow = {
        key: `account:${acc.account.id}`,
        kind: 'account',
        depth: 1,
        categoryId: cat.category.id,
        accountId: acc.account.id,
        number: acc.account.number,
        name: acc.account.name,
        inBudget: cat.inBudget,
        ...rowMath(acc.totalCents, accountOverage, accBucket, accountEtc, lineRows.some(r => r.etcOverride)),
      };
      accountNodes.push({
        accountId: acc.account.id,
        number: acc.account.number,
        name: acc.account.name,
        row: accountRow,
        lines: lineRows,
        unallocated,
      });
    }
    const catBucket = emptyBucket();
    for (const acc of accountNodes) {
      addBucket(catBucket, {
        actualAsOf: acc.row.actualAsOfCents,
        actualPeriod: acc.row.actualCents,
        committed: acc.row.committedCents,
      });
    }
    const catEtc = accountNodes.reduce((s, a) => s + a.row.etcCents, 0);
    const catOverage = accountNodes.reduce((s, a) => s + a.row.approvedOverageCents, 0);
    categories.push({
      categoryId: cat.category.id,
      number: cat.category.number,
      name: cat.category.name,
      inBudget: cat.inBudget,
      row: {
        key: `category:${cat.category.id}`,
        kind: 'category',
        depth: 0,
        categoryId: cat.category.id,
        number: cat.category.number,
        name: cat.category.name,
        inBudget: cat.inBudget,
        ...rowMath(cat.totalCents, catOverage, catBucket, catEtc, accountNodes.some(a => a.row.etcOverride)),
      },
      accounts: accountNodes,
    });
  }

  let unallocated: CostRow | null = null;
  if (projectBucket.actualAsOf || projectBucket.committed || projectBucket.actualPeriod) {
    unallocated = {
      key: 'unallocated:project',
      kind: 'unallocated',
      depth: 0,
      number: '',
      name: 'Unallocated',
      inBudget: true,
      ...rowMath(0, 0, projectBucket, 0, false),
    };
  }

  const inBudget = categories.filter(c => c.inBudget);
  const sum = (pick: (row: CostRow) => number) =>
    inBudget.reduce((s, c) => s + pick(c.row), 0) + (unallocated ? pick(unallocated) : 0);
  const budgetCents = model.totals.grandTotalCents;
  const approvedOverageCents = sum(r => r.approvedOverageCents);
  const actualAsOfCents = sum(r => r.actualAsOfCents);
  const committedCents = sum(r => r.committedCents);
  const etcCents = sum(r => r.etcCents);
  const efcCents = actualAsOfCents + committedCents + etcCents;
  const denominator = budgetCents + approvedOverageCents;

  return {
    settings,
    versionId: model.version.id,
    asOf,
    from,
    to,
    categories,
    unallocated,
    totals: {
      budgetCents,
      markupCents: model.totals.markupCents,
      approvedOverageCents,
      actualCents: sum(r => r.actualCents),
      actualAsOfCents,
      committedCents,
      etcCents,
      efcCents,
      varianceCents: denominator - efcCents,
      percentUsed: denominator > 0 ? ((actualAsOfCents + committedCents) / denominator) * 100 : 0,
    },
    expenseCount: expenses.length,
    purchaseOrderCount: purchaseOrders.length,
    periodApplied,
  };
}

/** Flat printable rows: category → account → line (+ Unallocated). */
export function flatCostRows(model: CostReportModel): CostRow[] {
  const rows: CostRow[] = [];
  for (const cat of model.categories) {
    rows.push(cat.row);
    for (const acc of cat.accounts) {
      rows.push(acc.row);
      rows.push(...acc.lines);
      if (acc.unallocated) rows.push(acc.unallocated);
    }
  }
  if (model.unallocated) rows.push(model.unallocated);
  return rows;
}

/** The budget line behind a line row, if any. */
export function costLineRow(model: CostReportModel, lineId: string): CostRow | undefined {
  for (const cat of model.categories) {
    for (const acc of cat.accounts) {
      const hit = acc.lines.find(l => l.lineId === lineId);
      if (hit) return hit;
    }
  }
  return undefined;
}

// ---- expenses helpers (Day Manager, reports, footers) -----------------------

/** Expenses attributed to one production day (date OR chrono number). */
export function expensesOfDay(project: Project, day: { date?: string; chronoDay?: number | null }): Expense[] {
  const date = day.date || '';
  const number = day.chronoDay ?? null;
  return (project.expenses || []).filter(e =>
    (!!date && e.dayDate === date) || (number != null && e.dayNumber === number));
}

export interface ExpenseSummary {
  count: number;
  actualCents: MoneyCents;
  actualAsOfCents: MoneyCents;
  committedCents: MoneyCents;
  plannedCents: MoneyCents;
  pettyCashCents: MoneyCents;
  /** Actual inside the optional from/to period. */
  periodActualCents: MoneyCents;
}

/** Footer/totals rollup for a filtered expense list (never state). */
export function summarizeExpenses(
  expenses: Expense[],
  options: { asOf?: string; from?: string; to?: string } = {},
): ExpenseSummary {
  const asOf = options.asOf || isoToday();
  const summary: ExpenseSummary = {
    count: 0,
    actualCents: 0,
    actualAsOfCents: 0,
    committedCents: 0,
    plannedCents: 0,
    pettyCashCents: 0,
    periodActualCents: 0,
  };
  for (const expense of expenses) {
    const status = expenseStatusOf(expense);
    if (status === 'void') continue;
    summary.count += 1;
    const amount = expense.amountCents || 0;
    if (expense.method === 'pettyCash') summary.pettyCashCents += amount;
    if (status === 'planned') summary.plannedCents += amount;
    if (status === 'committed') summary.committedCents += amount;
    if (status === 'actual' || status === 'paid') {
      summary.actualCents += amount;
      if (beforeOrOn(expense.date, asOf)) summary.actualAsOfCents += amount;
      if (inPeriod(expense.date, options.from, options.to)) summary.periodActualCents += amount;
    }
  }
  return summary;
}

/** Display label for an expense's account ("1200 Producers" / "Unallocated").
 *  A line-only expense resolves through the line's account (the same bucket
 *  the cost report uses). */
export function expenseAccountLabel(project: Project, expense: Expense): string {
  const budget = project.budget;
  if (!budget) return 'Unallocated';
  if (expense.lineId) {
    const line = budget.versions.flatMap(v => v.lines).find(l => l.id === expense.lineId);
    const lineAccount = line ? budget.accounts.find(a => a.id === line.accountId) : undefined;
    if (lineAccount) return `${lineAccount.number} ${lineAccount.name}`.trim();
  }
  const account = budget.accounts.find(a => a.id === expense.accountId);
  if (!account) return 'Unallocated';
  return `${account.number} ${account.name}`.trim();
}

/** Purchase orders still carrying commitment (open/partial). */
export function openPurchaseOrders(project: Project): PurchaseOrder[] {
  return (project.purchaseOrders || []).filter(po => po.status === 'open' || po.status === 'partial');
}
