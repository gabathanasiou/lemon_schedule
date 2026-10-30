import { describe, it, expect } from 'vitest';
import { makeBlankProject } from '../../store/reducer';
import { featureBudget } from '../budget/templates';
import { activeBudgetVersion, makeBudgetLine } from '../budget/model';
import { computeBudget } from '../budget/calc';
import { budgetReportColumnDefs, buildBudgetReport } from '../reportBudget';
import { buildReportCtx, resolveCollection } from '../reportData';

function makeBudgetProject() {
  const project = makeBlankProject('Budget Report Test');
  project.budget = featureBudget();
  const atl = project.budget.accounts.find(a => a.number === '1100')!;
  const btl = project.budget.accounts.find(a => a.number === '2100')!;
  const version = activeBudgetVersion(project.budget)!;
  version.lines = [
    makeBudgetLine({ accountId: atl.id, description: 'Screenplay', qty: 1, rateCents: 600000, sort: 0 }),
    // A zero line so the showZero filter has something to hide.
    makeBudgetLine({ accountId: btl.id, description: 'Office', qty: 1, rateCents: 0, sort: 0 }),
  ];
  return project;
}

function makeReportProject() {
  return computeBudget(makeBudgetProject())!;
}

describe('budget report read model', () => {
  it('builds a top sheet with category rows, markups and the grand total', () => {
    const model = makeReportProject();
    const report = buildBudgetReport(model, { mode: 'topsheet' })!;
    expect(report.mode).toBe('topsheet');

    const atl = report.rows.find(r => r.kind === 'category' && r.cells.number === '1000')!;
    expect(atl.cells.subtotal).toBe(600000);
    expect(atl.cells.total).toBe(600000);
    expect(atl.keepWithNext).toBe(true);

    // Zero categories are hidden by default.
    expect(report.rows.some(r => r.cells.number === '2000')).toBe(false);

    const grand = report.rows.find(r => r.kind === 'grand')!;
    expect(grand.cells.total).toBe(660000); // 10% feature contingency
    expect(report.totals.grandTotalCents).toBe(660000);
  });

  it('shows zero rows when asked', () => {
    const model = makeReportProject();
    const report = buildBudgetReport(model, { mode: 'topsheet', showZero: true })!;
    expect(report.rows.some(r => r.kind === 'category' && r.cells.number === '2000')).toBe(true);
  });

  it('builds account and line detail rows from the same computed model', () => {
    const model = makeReportProject();
    const accounts = buildBudgetReport(model, { mode: 'accounts' })!;
    expect(accounts.rows.some(r => r.kind === 'account' && r.cells.number === '1100')).toBe(true);
    expect(accounts.rows.some(r => r.kind === 'line')).toBe(false);

    const lines = buildBudgetReport(model, { mode: 'lines' })!;
    const line = lines.rows.find(r => r.kind === 'line')!;
    expect(line.cells.description).toBe('Screenplay');
    expect(line.cells.total).toBe(600000);
    expect(line.cells.rate).toBe(600000);
  });

  it('honours column subsets and the display toggles', () => {
    const model = makeReportProject();
    const plain = buildBudgetReport(model, { mode: 'lines', showPercent: false, showFringes: false })!;
    const keys = plain.columns.map(c => c.key);
    expect(keys).not.toContain('percent');
    expect(keys).not.toContain('fringes');
    expect(keys).toContain('total');

    const subset = buildBudgetReport(model, { mode: 'topsheet', columns: ['name', 'total'] })!;
    expect(subset.columns.map(c => c.key)).toEqual(['name', 'total']);
    expect(subset.columns.reduce((sum, c) => sum + c.width, 0)).toBeCloseTo(100, 1);
  });

  it('marks money columns and returns null without a budget', () => {
    const money = budgetReportColumnDefs('topsheet').filter(c => c.money).map(c => c.key);
    expect(money).toEqual(['subtotal', 'fringes', 'total']);
    expect(buildBudgetReport(null)).toBeNull();
  });

  it('resolves the four budget collections from the one ctx budget', () => {
    const project = makeBudgetProject();
    const ctx = buildReportCtx(project, project.versions[0], project.calendarVersions[0], { sections: [], computedRows: [] });
    expect(ctx.budget?.totals.grandTotalCents).toBe(660000);

    const categories = resolveCollection(ctx, 'budgetCategories', undefined, undefined) as any[];
    expect(categories.map(c => c.category.number)).toEqual(['1000', '2000', '3000', '4000']);

    const accounts = resolveCollection(ctx, 'budgetAccounts', undefined, undefined) as any[];
    expect(accounts.length).toBe(project.budget!.accounts.length);
    const atlStory = accounts.find(a => a.account.number === '1100')!;
    expect(atlStory.category.number).toBe('1000');

    const lines = resolveCollection(ctx, 'budgetLines', undefined, undefined) as any[];
    expect(lines.map(l => l.line.description)).toContain('Screenplay');

    const ofAccount = resolveCollection(ctx, 'budgetLinesOfAccount', undefined, atlStory) as any[];
    expect(ofAccount.map(l => l.line.description)).toEqual(['Screenplay']);
  });
});
