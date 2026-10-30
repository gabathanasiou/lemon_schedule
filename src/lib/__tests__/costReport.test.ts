import { describe, it, expect } from 'vitest';
import type { Expense, Project } from '../../types';
import { makeBlankProject } from '../../store/reducer';
import { featureBudget } from '../budget/templates';
import { activeBudgetVersion, makeBudgetLine, makeExpense, makePurchaseOrder } from '../budget/model';
import { computeCostReport, expensesOfDay, summarizeExpenses } from '../budget/costReport';

/**
 * Cost-tracking maths (roadmap 334 phase 2). Pure engine tests: Actual,
 * Committed, ETC, EFC, Variance, % used, Unallocated rollups, PO commitment,
 * as-of/period filters and approved overage. The UI renders these numbers; it
 * never re-derives them.
 */

function makeCostProject(): Project {
  const project = makeBlankProject('Cost Report Test');
  project.budget = featureBudget();
  return project;
}

function accountId(project: Project, number: string): string {
  return project.budget!.accounts.find(a => a.number === number)!.id;
}

function addLine(project: Project, number: string, partial: Partial<Parameters<typeof makeBudgetLine>[0]> = {}) {
  const version = activeBudgetVersion(project.budget)!;
  const line = makeBudgetLine({
    accountId: accountId(project, number),
    description: 'Test line',
    qty: 1,
    rateCents: 100000,
    ...partial,
    sort: version.lines.length,
  });
  version.lines = [...version.lines, line];
  return line;
}

function addExpense(project: Project, partial: Partial<Expense>): Expense {
  const expense = makeExpense(partial);
  project.expenses = [...(project.expenses || []), expense];
  return expense;
}

describe('cost report', () => {
  it('derives Actual, Committed, ETC, EFC, Variance and % used on a line', () => {
    const project = makeCostProject();
    const line = addLine(project, '1100', { rateCents: 100000 });
    addExpense(project, { lineId: line.id, accountId: line.accountId, amountCents: 25000, status: 'actual', date: '2026-01-10' });
    addExpense(project, { lineId: line.id, accountId: line.accountId, amountCents: 10000, status: 'committed', date: '2026-01-12' });

    const report = computeCostReport(project, { asOf: '2026-05-01' })!;
    expect(report).not.toBeNull();
    const row = report.categories.flatMap(c => c.accounts).flatMap(a => a.lines).find(r => r.lineId === line.id)!;

    expect(row.budgetCents).toBe(100000);
    expect(row.actualCents).toBe(25000);
    expect(row.actualAsOfCents).toBe(25000);
    expect(row.committedCents).toBe(10000);
    expect(row.etcCents).toBe(65000); // max(0, 100000 - 25000 - 10000)
    expect(row.efcCents).toBe(100000);
    expect(row.varianceCents).toBe(0);
    expect(row.percentUsed).toBeCloseTo(35, 1);

    expect(report.totals.actualCents).toBe(25000);
    expect(report.totals.committedCents).toBe(10000);
    expect(report.totals.etcCents).toBe(65000);
    expect(report.totals.efcCents).toBe(100000);
    // The feature template carries a 10% contingency markup on top of the line.
    expect(report.totals.budgetCents).toBe(110000);
    expect(report.totals.varianceCents).toBe(10000);
    expect(report.totals.percentUsed).toBeCloseTo((35000 / 110000) * 100, 4);
  });

  it('uses an explicit ETC override and approved overage', () => {
    const project = makeCostProject();
    const line = addLine(project, '1100', { rateCents: 100000, approvedOverageCents: 5000, etcCents: 20000, etcReason: 'Reshoot' });
    addExpense(project, { lineId: line.id, accountId: line.accountId, amountCents: 30000, status: 'actual', date: '2026-01-10' });

    const row = computeCostReport(project)!.categories.flatMap(c => c.accounts).flatMap(a => a.lines).find(r => r.lineId === line.id)!;
    expect(row.etcOverride).toBe(true);
    expect(row.etcReason).toBe('Reshoot');
    expect(row.etcCents).toBe(20000);
    expect(row.efcCents).toBe(50000);
    expect(row.varianceCents).toBe(55000); // 100000 + 5000 - 50000
    expect(row.percentUsed).toBeCloseTo((30000 / 105000) * 100, 4);
  });

  it('rolls account-level expenses into the account Unallocated child', () => {
    const project = makeCostProject();
    const account = accountId(project, '1100');
    addExpense(project, { accountId: account, amountCents: 4200, status: 'actual', date: '2026-01-10' });

    const node = computeCostReport(project)!.categories.flatMap(c => c.accounts).find(a => a.accountId === account)!;
    expect(node.unallocated).toBeTruthy();
    expect(node.unallocated!.name).toBe('Unallocated');
    expect(node.unallocated!.actualCents).toBe(4200);
    expect(node.row.actualCents).toBe(4200);
    expect(node.row.etcCents).toBe(0);
  });

  it('keeps project-level expenses in one Unallocated row outside the chart', () => {
    const project = makeCostProject();
    addExpense(project, { amountCents: 900, status: 'actual', date: '2026-01-10' });

    const report = computeCostReport(project)!;
    expect(report.unallocated).toBeTruthy();
    expect(report.unallocated!.actualCents).toBe(900);
    expect(report.totals.actualCents).toBe(900);
  });

  it('counts open PO remaining as Committed without double-counting its expenses', () => {
    const project = makeCostProject();
    const account = accountId(project, '1100');
    const po = makePurchaseOrder({ number: 'PO-1001', accountId: account, amountCents: 50000, status: 'open' });
    project.purchaseOrders = [po];
    // Actual money already invoiced against the PO.
    addExpense(project, { accountId: account, poId: po.id, amountCents: 20000, status: 'actual', date: '2026-01-10' });

    const node = computeCostReport(project)!.categories.flatMap(c => c.accounts).find(a => a.accountId === account)!;
    expect(node.row.actualCents).toBe(20000);
    expect(node.row.committedCents).toBe(30000); // 50000 - 20000 already actual
    expect(node.row.efcCents).toBe(50000); // actual 20000 + committed 30000 + ETC 0 (budget 0)

    // A received/cancelled PO carries no commitment.
    project.purchaseOrders = [{ ...po, status: 'received' }];
    const received = computeCostReport(project)!.categories.flatMap(c => c.accounts).find(a => a.accountId === account)!;
    expect(received.row.committedCents).toBe(0);
  });

  it('filters Actual by as-of and period while EFC stays as-of', () => {
    const project = makeCostProject();
    const line = addLine(project, '1100', { rateCents: 100000 });
    addExpense(project, { lineId: line.id, accountId: line.accountId, amountCents: 30000, status: 'actual', date: '2026-01-15' });
    addExpense(project, { lineId: line.id, accountId: line.accountId, amountCents: 5000, status: 'paid', date: '2026-02-15' });

    const january = computeCostReport(project, { asOf: '2026-01-31' })!;
    const janLine = january.categories.flatMap(c => c.accounts).flatMap(a => a.lines).find(r => r.lineId === line.id)!;
    expect(janLine.actualCents).toBe(30000);
    expect(janLine.actualAsOfCents).toBe(30000);
    expect(janLine.efcCents).toBe(100000);

    const feb = computeCostReport(project, { asOf: '2026-02-28', from: '2026-02-01', to: '2026-02-28' })!;
    const febLine = feb.categories.flatMap(c => c.accounts).flatMap(a => a.lines).find(r => r.lineId === line.id)!;
    expect(febLine.actualCents).toBe(5000); // displayed period Actual
    expect(febLine.actualAsOfCents).toBe(35000); // EFC/variance stay as-of
    expect(febLine.efcCents).toBe(100000);
    expect(feb.totals.actualCents).toBe(5000);
    expect(feb.totals.actualAsOfCents).toBe(35000);
    expect(feb.periodApplied).toBe(true);
  });

  it('ignores void expenses and stale references degrade to Unallocated', () => {
    const project = makeCostProject();
    addExpense(project, { accountId: 'missing', amountCents: 700, status: 'actual', date: '2026-01-10' });
    addExpense(project, { accountId: accountId(project, '1100'), amountCents: 999, status: 'void', date: '2026-01-10' });

    const report = computeCostReport(project)!;
    expect(report.unallocated?.actualCents).toBe(700);
    expect(report.totals.actualCents).toBe(700);
    expect(report.expenseCount).toBe(2);
  });
});

describe('expense day rollups', () => {
  it('matches a day by date or chrono day and summarises actual/committed/petty cash', () => {
    const project = makeCostProject();
    addExpense(project, { amountCents: 1000, status: 'actual', date: '2026-01-10', dayDate: '2026-01-10', dayNumber: 3 });
    addExpense(project, { amountCents: 2000, status: 'committed', date: '2026-01-10', dayNumber: 3 });
    addExpense(project, { amountCents: 500, status: 'actual', method: 'pettyCash', date: '2026-01-10', dayDate: '2026-01-10' });
    addExpense(project, { amountCents: 9999, status: 'actual', date: '2026-01-11', dayNumber: 4 });

    const dayExpenses = expensesOfDay(project, { date: '2026-01-10', chronoDay: 3 });
    expect(dayExpenses).toHaveLength(3);
    const summary = summarizeExpenses(dayExpenses, { asOf: '2026-01-31' });
    expect(summary.count).toBe(3);
    expect(summary.actualCents).toBe(1500);
    expect(summary.committedCents).toBe(2000);
    expect(summary.pettyCashCents).toBe(500);
  });
});
