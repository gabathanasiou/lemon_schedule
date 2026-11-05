import { describe, it, expect, vi, afterEach } from 'vitest';
import type { BudgetLine } from '../../types';
import { makeBlankProject } from '../../store/reducer';
import { computeBudget } from '../budget/calc';
import { buildBudgetRows, buildCostRows, collapseBudgetRows, filterBudgetRows } from '../budget/gridRows';
import { computeCostReport } from '../budget/costReport';
import { makeExpense } from '../budget/model';
import { formatMoney } from '../budget/format';
import { applyRatesToCurrencies, fetchDailyRates, formatRatesSyncedAt } from '../budget/rates';
import { currencySymbolFor, DEFAULT_BUDGET_CURRENCIES, makeBudgetLine, mergeDefaultCurrencies, settingsWithCurrency } from '../budget/model';
import { templateBudget } from '../budget/templates';
import { currencyForTimeZone, defaultBudgetSettingsForTimeZone } from '../budget/currencyDefaults';
import { expenseStatusTone, EXPENSE_STATUS_TONES } from '../budget/statusTones';
import { periodRange, periodLabel } from '../budget/period';

function sampleModel() {
  const p = makeBlankProject('Grid Rows');
  p.budget = templateBudget('feature');
  const budget = p.budget;
  const account = budget.accounts[0];
  const line: BudgetLine = makeBudgetLine({ accountId: account.id, description: 'Lens rental', qty: 2, rateCents: 5000, unit: 'unit-day', notes: 'From the camera house' });
  budget.versions[0].lines = [line];
  return { model: computeBudget(p)!, line, project: p };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('budget currency defaults (item 354)', () => {
  it('maps the project timezone to a currency code', () => {
    expect(currencyForTimeZone('Europe/Athens')).toBe('EUR');
    expect(currencyForTimeZone('Europe/London')).toBe('GBP');
    expect(currencyForTimeZone('America/Toronto')).toBe('CAD');
    expect(currencyForTimeZone('America/New_York')).toBe('USD');
    expect(currencyForTimeZone('Asia/Tokyo')).toBe('JPY');
    expect(currencyForTimeZone('Australia/Sydney')).toBe('AUD');
    expect(currencyForTimeZone(undefined)).toBe('USD');
  });

  it('derives the symbol and keeps template settings', () => {
    expect(defaultBudgetSettingsForTimeZone('Europe/Athens')).toMatchObject({ currency: 'EUR', currencySymbol: '€' });
    const blank = templateBudget('blank', { currency: 'EUR', currencySymbol: '€' });
    expect(blank.settings).toMatchObject({ currency: 'EUR', currencySymbol: '€', templateKey: 'blank' });
  });

  it('can print the ISO code beside the symbol when a cell has room', () => {
    expect(formatMoney(1150000, { currency: 'EUR', currencySymbol: '€' }, { showCode: true })).toBe('€ (EUR) 11,500');
    expect(formatMoney(1150000, { currency: 'EUR', currencySymbol: '€' })).toBe('€11,500');
  });
});

describe('budget grid rows (roadmap 342/340)', () => {
  it('builds category → account → line and markups', () => {
    const { model } = sampleModel();
    const rows = buildBudgetRows(model, null, model.settings);
    expect(rows[0].kind).toBe('category');
    expect(rows.some(r => r.kind === 'line' && r.item === 'Lens rental')).toBe(true);
    // Every line carries its band ids so the filter can keep a parent.
    const line = rows.find(r => r.kind === 'line')!;
    expect(line.catId).toBeTruthy();
    expect(line.accId).toBeTruthy();
  });

  it('filters by category text, keeps its children, and never reorders', () => {
    const { model } = sampleModel();
    const rows = buildBudgetRows(model, null, model.settings);
    const firstCat = rows[0];
    const tag = firstCat.item.split('  ')[0];
    const filtered = filterBudgetRows(rows, tag);
    expect(filtered[0]).toBe(firstCat);
    expect(filtered.some(r => r.kind === 'line')).toBe(true);
    // Order is preserved relative to the source.
    const indices = filtered.map(r => rows.indexOf(r));
    expect([...indices].sort((a, b) => a - b)).toEqual(indices);
  });

  it('keeps the band when a child matches, and ANDs comma tags', () => {
    const { model } = sampleModel();
    const rows = buildBudgetRows(model, null, model.settings);
    const hit = filterBudgetRows(rows, 'lens');
    expect(hit.map(r => r.kind)).toEqual(expect.arrayContaining(['category', 'account', 'line']));
    expect(hit.some(r => r.kind === 'line')).toBe(true);
    expect(filterBudgetRows(rows, 'lens, camera').some(r => r.kind === 'line')).toBe(true);
    expect(filterBudgetRows(rows, 'lens, no-such-tag').length).toBe(0);
    expect(filterBudgetRows(rows, '').length).toBe(rows.length);
  });

  it('marks bands with children so the disclosure glyph only appears there', () => {
    const { model } = sampleModel();
    const rows = buildBudgetRows(model, null, model.settings);
    const firstCat = rows[0];
    const firstAcc = rows.find(r => r.kind === 'account')!;
    expect(firstCat.hasChildren).toBe('1');
    expect(firstAcc.hasChildren).toBe('1');
    expect(rows.find(r => r.kind === 'line')!.hasChildren).toBe('');
    // An account with no lines carries no disclosure.
    const emptyAcc = buildBudgetRows(model, null, model.settings).find(r => r.kind === 'account' && !r.hasChildren);
    expect(emptyAcc?.hasChildren ?? '').toBe('');
  });

  it('collapses children of a collapsed band', () => {
    const { model } = sampleModel();
    const rows = buildBudgetRows(model, null, model.settings);
    const cat = rows[0];
    const collapsed = collapseBudgetRows(rows, new Set([cat.id]), new Set());
    expect(collapsed.some(r => r.catId === cat.id && r.kind !== 'category')).toBe(false);
    const account = rows.find(r => r.kind === 'account')!;
    const acctCollapsed = collapseBudgetRows(rows, new Set(), new Set([account.id]));
    expect(acctCollapsed.some(r => r.accId === account.id && r.kind === 'line')).toBe(false);
    // Band totals stay: the band row itself is still present.
    expect(acctCollapsed.some(r => r.key === account.key)).toBe(true);
  });
});

describe('currency polish + rate sync (roadmap 341)', () => {
  it('seeds common currencies with blank rates and keeps hand-edited rows', () => {
    expect(DEFAULT_BUDGET_CURRENCIES.length).toBeGreaterThanOrEqual(25);
    expect(DEFAULT_BUDGET_CURRENCIES.find(c => c.code === 'EUR')?.rateToBase).toBeUndefined();
    const merged = mergeDefaultCurrencies([{ code: 'EUR', symbol: '€€', rateToBase: 1.2 }]);
    expect(merged.find(c => c.code === 'EUR')?.symbol).toBe('€€');
    expect(merged.find(c => c.code === 'EUR')?.rateToBase).toBe(1.2);
    expect(merged.some(c => c.code === 'JPY')).toBe(true);
  });

  it('derives the settings symbol from the chosen currency', () => {
    expect(currencySymbolFor('GBP', DEFAULT_BUDGET_CURRENCIES)).toBe('£');
    expect(currencySymbolFor('ZZZ', DEFAULT_BUDGET_CURRENCIES)).toBe('ZZZ');
    const next = settingsWithCurrency({ currency: 'USD', currencySymbol: '$', decimals: 0 }, 'JPY', DEFAULT_BUDGET_CURRENCIES);
    expect(next.currency).toBe('JPY');
    expect(next.currencySymbol).toBe('¥');
  });

  it('applies rates as reciprocal to-base values, base = 1, unknown keeps its rate', () => {
    const next = applyRatesToCurrencies(
      [{ code: 'USD', symbol: '$', rateToBase: 1 }, { code: 'EUR', symbol: '€' }, { code: 'ZZZ', rateToBase: 3 }],
      'USD',
      { EUR: 0.5 },
    );
    expect(next.find(c => c.code === 'USD')?.rateToBase).toBe(1);
    expect(next.find(c => c.code === 'EUR')?.rateToBase).toBe(2);
    expect(next.find(c => c.code === 'ZZZ')?.rateToBase).toBe(3);
  });

  it('fetches the provider and rejects a bad base', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      calls.push(String(url));
      return new Response(JSON.stringify({ base: 'USD', date: '2026-10-30', rates: { EUR: 0.8 } }), { status: 200 });
    }));
    const ok = await fetchDailyRates('USD');
    expect(calls[0]).toBe('https://api.frankfurter.dev/v1/latest?from=USD');
    expect(ok.base).toBe('USD');
    expect(ok.rates.EUR).toBe(0.8);
    expect(formatRatesSyncedAt('2026-10-30T16:42:00.000Z')).toMatch(/^2026-10-30 \d\d:\d\d$/);

    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })));
    await expect(fetchDailyRates('AED')).rejects.toThrow(/not published/i);
  });
});

describe('status tones (roadmap 345)', () => {
  it('maps every expense status to a distinct readable tone', () => {
    for (const [status, tone] of Object.entries(EXPENSE_STATUS_TONES)) {
      expect(tone.bgCell).toMatch(/^#[0-9a-f]{6}$/i);
      expect(tone.textDark).toMatch(/^#[0-9a-f]{6}$/i);
      expect(expenseStatusTone(status as any)).toBe(tone);
    }
  });
});

describe('formula functions + book (roadmap 346)', () => {
  it('evaluates the safe function set and rejects bad names/arity', async () => {
    const { evaluateFormula, formulaSymbols } = await import('../budget/formula');
    expect(evaluateFormula('ROUND(2.345, 2)').value).toBeCloseTo(2.35, 6);
    expect(evaluateFormula('ROUND(2.5)').value).toBe(3);
    expect(evaluateFormula('MIN(3, 1, 2)').value).toBe(1);
    expect(evaluateFormula('MAX(3, 1, 2)').value).toBe(3);
    expect(evaluateFormula('ABS(-4)').value).toBe(4);
    expect(evaluateFormula('CLAMP(5, 0, 3)').value).toBe(3);
    expect(evaluateFormula('FOO(1)').error).toBe('#REF!');
    expect(evaluateFormula('ROUND()').error).toBe('#VALUE!');
    expect(evaluateFormula('ROUND(1, 2, 3)').error).toBe('#VALUE!');
    expect(evaluateFormula('MIN(SHOOT_DAYS, 4)', { SHOOT_DAYS: 9 }).value).toBe(4);
    expect(formulaSymbols('ROUND(SHOOT_DAYS * 2) + MY_RATE')).toEqual(['SHOOT_DAYS', 'MY_RATE']);
  });

  it('feeds autocomplete + book from one registry', async () => {
    const { buildFormulaBook, searchFormulaBook, formulaFragmentAt, insertFormulaText } = await import('../budget/formulaBook');
    const entries = buildFormulaBook({ SHOOT_DAYS: 12 }, [{ id: 'g1', symbol: 'MY_RATE', value: 5 }]);
    expect(entries.some(e => e.kind === 'system' && e.key === 'SHOOT_DAYS' && e.value === 12)).toBe(true);
    expect(entries.some(e => e.kind === 'project' && e.key === 'MY_RATE')).toBe(true);
    expect(entries.some(e => e.kind === 'function' && e.key === 'ROUND' && e.insert === 'ROUND(')).toBe(true);
    expect(searchFormulaBook(entries, 'shoot').map(e => e.key)).toContain('SHOOT_DAYS');
    expect(searchFormulaBook(entries, 'round, decimal').map(e => e.key)).toEqual(['ROUND']);

    const frag = formulaFragmentAt('Qty * SH', 8);
    expect(frag).toEqual({ start: 6, fragment: 'SH' });
    const inserted = insertFormulaText('Qty * SH', 8, 'SHOOT_DAYS');
    expect(inserted).toEqual({ next: 'Qty * SHOOT_DAYS', caret: 16 });
  });
});

describe('cost report period windows (roadmap 349)', () => {
  it('derives month, quarter and year ranges from the as-of date', () => {
    expect(periodRange('all', '2026-11-03')).toEqual({});
    expect(periodRange('month', '2026-11-03')).toEqual({ from: '2026-11-01', to: '2026-11-30' });
    expect(periodRange('quarter', '2026-11-03')).toEqual({ from: '2026-10-01', to: '2026-12-31' });
    expect(periodRange('year', '2026-11-03')).toEqual({ from: '2026-01-01', to: '2026-12-31' });
    expect(periodRange('month', '2028-02-10')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });

  it('leaves custom ranges to the picker and labels the selection', () => {
    expect(periodRange('custom', '2026-11-03')).toEqual({});
    expect(periodLabel('month', '', '')).toBe('This month');
    expect(periodLabel('custom', '', '')).toBe('Custom range');
    expect(periodLabel('custom', '2026-10-01', '2026-10-31')).toBe('2026-10-01 → 2026-10-31');
    expect(periodRange('month', '')).toEqual({});
  });
});

describe('cost report sheet rows (roadmap 349)', () => {
  function reportFor(spend: boolean) {
    const { model, line, project } = sampleModel();
    if (spend) {
      project.expenses = [
        makeExpense({ lineId: line.id, accountId: line.accountId, amountCents: 30000, status: 'actual', date: '2026-01-10' }),
        makeExpense({ accountId: line.accountId, amountCents: 5000, status: 'actual', date: '2026-01-11' }),
        makeExpense({ amountCents: 7000, status: 'actual', date: '2026-01-12' }),
      ];
    }
    const next = computeBudget(project)!;
    const report = computeCostReport(project, { asOf: '2026-12-31', budget: next })!;
    return { model: next, line, project, report, rows: buildCostRows(report, null, next.settings) };
  }

  it('flattens category → account → line and both Unallocated buckets', () => {
    const { model, line, report, rows } = reportFor(true);
    const category = rows.find(r => r.kind === 'category')!;
    expect(category.hasChildren).toBe('1');
    expect(category.notInBudget).toBe('');

    const lineRow = rows.find(r => r.kind === 'line' && r.lineId === line.id)!;
    expect(lineRow.actual).toBe(formatMoney(30000, model.settings));
    expect(lineRow.etc).toBe('0.00');
    expect(lineRow.hasEtc).toBe('');

    const accountUnallocated = rows.find(r => r.kind === 'unallocated' && r.item === 'Unallocated')!;
    expect(accountUnallocated.actual).toBe(formatMoney(5000, model.settings));
    const projectUnallocated = rows.find(r => r.key === 'unallocated:project')!;
    expect(projectUnallocated.actual).toBe(formatMoney(7000, model.settings));
    expect(report.unallocated).not.toBeNull();
  });

  it('carries an ETC override and reason on the line row', () => {
    const { line, project } = reportFor(false);
    line.etcCents = 12345;
    line.etcReason = 'VFX overage';
    const model = computeBudget(project)!;
    const report = computeCostReport(project, { asOf: '2026-12-31', budget: model })!;
    const rows = buildCostRows(report, null, model.settings);
    const lineRow = rows.find(r => r.kind === 'line' && r.lineId === line.id)!;
    expect(lineRow.hasEtc).toBe('1');
    expect(lineRow.etc).toBe('123.45');
    expect(lineRow.reason).toBe('VFX overage');
    expect(lineRow.varianceTone).toBe('bad');
    expect(lineRow.variance).toContain('over');
    expect(lineRow.etcDisplay).toBe(formatMoney(12345, model.settings));
  });

  it('filters and collapses through the shared sheet contract', () => {
    const { rows, line } = reportFor(true);
    const filtered = filterBudgetRows(rows, line.description);
    expect(filtered[0].kind).toBe('category');
    expect(filtered.some(r => r.kind === 'line' && r.lineId === line.id)).toBe(true);

    const category = rows.find(r => r.kind === 'category')!;
    const collapsed = collapseBudgetRows(rows, new Set([category.id]), new Set());
    expect(collapsed.some(r => r.catId === category.id && r.kind !== 'category')).toBe(false);

    const account = rows.find(r => r.kind === 'account')!;
    const accountCollapsed = collapseBudgetRows(rows, new Set(), new Set([account.id]));
    expect(accountCollapsed.some(r => r.accId === account.id && (r.kind === 'line' || r.kind === 'unallocated'))).toBe(false);
    expect(accountCollapsed.some(r => r.kind === 'account' && r.id === account.id)).toBe(true);
  });
});
