import { describe, it, expect } from 'vitest';
import { makeBlankProject } from '../../store/reducer';
import { featureBudget } from '../budget/templates';
import { activeBudgetVersion, makeBudgetLine } from '../budget/model';
import { computeBudget } from '../budget/calc';
import { budgetReportColumnDefs, budgetReportMode, buildBudgetReport, buildComparisonReport, buildCostReportReport } from '../reportBudget';
import { makeExpense } from '../budget/model';
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

  it('renders the costReport mode from the cost read model', () => {
    const project = makeBudgetProject();
    const line = activeBudgetVersion(project.budget!)!.lines[0];
    project.expenses = [makeExpense({ lineId: line.id, accountId: line.accountId, amountCents: 30000, status: 'actual', date: '2026-01-10' })];
    const report = buildCostReportReport(project, computeBudget(project)!, { asOf: '2026-12-31' })!;
    expect(report.mode).toBe('costReport');
    expect(report.columns.map(c => c.key)).toEqual(['number', 'name', 'budget', 'actual', 'committed', 'etc', 'efc', 'variance', 'percent', 'reason']);
    const lineRow = report.rows.find(r => r.kind === 'line' && r.cells.description === 'Screenplay')!;
    expect(lineRow.cells.actual).toBe(30000);
    expect(lineRow.cells.budget).toBe(600000);
    expect(report.totals.grandTotalCents).toBeGreaterThanOrEqual(30000);
  });
});

describe('budget version comparison', () => {
  /** Feature budget with a second version whose Screenplay line is 750k. */
  function makeComparisonModels() {
    const project = makeBudgetProject();
    const base = activeBudgetVersion(project.budget!)!;
    const next = {
      ...base,
      id: 'v02',
      name: 'v02',
      lines: base.lines.map(line => (line.description === 'Screenplay'
        ? { ...line, rateCents: 750000 }
        : line)),
    };
    project.budget!.versions = [base, next];
    project.budget!.activeVersionId = next.id;
    return {
      project,
      base,
      primary: computeBudget(project, { versionId: next.id })!,
      original: computeBudget(project, { versionId: base.id })!,
    };
  }

  it('gates comparison as its own live mode', () => {
    expect(budgetReportMode('comparison')).toBe('comparison');
    expect(budgetReportColumnDefs('comparison').map(c => c.key))
      .toEqual(['number', 'name', 'original', 'budget', 'variance', 'percent']);
  });

  it('shapes Original / Budget / Variance / Var % at account level', () => {
    const { primary, original } = makeComparisonModels();
    const report = buildComparisonReport(primary, original)!;
    expect(report.mode).toBe('comparison');
    expect(report.title).toContain('v02 vs v01');

    const category = report.rows.find(r => r.kind === 'category' && r.cells.number === '1000')!;
    expect(category.cells.original).toBe(600000);
    expect(category.cells.budget).toBe(750000);
    expect(category.cells.variance).toBe(150000);
    expect(category.cells.percent).toBe(25);

    const account = report.rows.find(r => r.kind === 'account' && r.cells.number === '1100')!;
    expect(account.cells.original).toBe(600000);
    expect(account.cells.budget).toBe(750000);
    expect(account.cells.variance).toBe(150000);

    // Zero categories/accounts hide by default (the Office line is zero both).
    expect(report.rows.some(r => r.cells.number === '2100')).toBe(false);

    // The 10% contingency markup differences ride the subtotal/markup/grand rows.
    const markup = report.rows.find(r => r.kind === 'markup')!;
    expect(markup.cells.original).toBe(60000);
    expect(markup.cells.budget).toBe(75000);
    expect(markup.cells.variance).toBe(15000);
    const grand = report.rows.find(r => r.kind === 'grand')!;
    expect(grand.cells.original).toBe(660000);
    expect(grand.cells.budget).toBe(825000);
    expect(grand.cells.variance).toBe(165000);
  });

  it('keeps variance signed and Var % blank without an original', () => {
    const { primary, original } = makeComparisonModels();
    const reversed = buildComparisonReport(original, primary)!;
    const grand = reversed.rows.find(r => r.kind === 'grand')!;
    expect(grand.cells.variance).toBe(-165000);

    // A version with no budget lines has a zero original; % is not a lie.
    const emptyProject = makeBlankProject('Empty Compare');
    emptyProject.budget = featureBudget();
    const emptyVersion = { ...activeBudgetVersion(emptyProject.budget)!, id: 'empty', name: 'empty', lines: [] };
    emptyProject.budget.versions = [...emptyProject.budget.versions, emptyVersion];
    const emptyOriginal = computeBudget(emptyProject, { versionId: 'empty' })!;
    const newCategory = buildComparisonReport(primary, emptyOriginal)!.rows
      .find(r => r.kind === 'category' && r.cells.number === '1000')!;
    expect(newCategory.cells.original).toBe(0);
    expect(newCategory.cells.percent).toBeUndefined();
  });

  it('honours showZero, column subsets and the % toggle', () => {
    const { primary, original } = makeComparisonModels();
    const all = buildComparisonReport(primary, original, { showZero: true })!;
    expect(all.rows.some(r => r.cells.number === '2100')).toBe(true);

    const subset = buildComparisonReport(primary, original, { columns: ['name', 'variance'], showPercent: false })!;
    expect(subset.columns.map(c => c.key)).toEqual(['name', 'variance']);
    expect(subset.columns.reduce((sum, c) => sum + c.width, 0)).toBeCloseTo(100, 1);

    expect(buildComparisonReport(null, original)).toBeNull();
    expect(buildComparisonReport(primary, null)).toBeNull();
  });

  it('reads another version through the report context without changing the active one', () => {
    const { project, base, primary } = makeComparisonModels();
    const ctx = buildReportCtx(project, project.versions[0], project.calendarVersions[0], { sections: [], computedRows: [] });
    expect(ctx.budget?.version.id).toBe(primary.version.id);
    expect(ctx.budgetForVersion?.(base.id)?.totals.grandTotalCents).toBe(660000);
    expect(ctx.budgetForVersion?.(base.id)?.version.name).toBe('v01');
    // An unknown id renders a hint, never a silent self-comparison.
    expect(ctx.budgetForVersion?.('missing')).toBeUndefined();
    expect(project.budget!.activeVersionId).toBe(primary.version.id);
  });
});
