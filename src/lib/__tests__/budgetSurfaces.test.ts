import { describe, it, expect, vi, afterEach } from 'vitest';
import type { BudgetLine } from '../../types';
import { makeBlankProject } from '../../store/reducer';
import { computeBudget } from '../budget/calc';
import { buildBudgetRows, collapseBudgetRows, filterBudgetRows } from '../budget/gridRows';
import { applyRatesToCurrencies, fetchDailyRates, formatRatesSyncedAt } from '../budget/rates';
import { currencySymbolFor, DEFAULT_BUDGET_CURRENCIES, makeBudgetLine, mergeDefaultCurrencies, settingsWithCurrency } from '../budget/model';
import { templateBudget } from '../budget/templates';
import { expenseStatusTone, EXPENSE_STATUS_TONES } from '../budget/statusTones';

function sampleModel() {
  const p = makeBlankProject('Grid Rows');
  p.budget = templateBudget('feature');
  const budget = p.budget;
  const account = budget.accounts[0];
  const line: BudgetLine = makeBudgetLine({ accountId: account.id, description: 'Lens rental', qty: 2, rateCents: 5000, unit: 'unit-day', notes: 'From the camera house' });
  budget.versions[0].lines = [line];
  return { model: computeBudget(p)!, line };
}

afterEach(() => {
  vi.unstubAllGlobals();
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
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ base: 'USD', date: '2026-10-30', rates: { EUR: 0.8 } }), { status: 200 })));
    const ok = await fetchDailyRates('USD');
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
