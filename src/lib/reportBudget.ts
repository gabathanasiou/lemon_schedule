import type { BudgetSettings, MoneyCents, ReportBlock } from '../types';
import type { BudgetModel, ComputedBudgetAccount, ComputedBudgetCategory, ComputedBudgetLine } from './budget/calc';

/**
 * `reportBudget.ts` — the ONE read model for budget report tables
 * (`docs/BUDGETING-SURFACES.md` §8). Built entirely on `computeBudget`
 * (`lib/budget/calc.ts`); this module never re-derives line/account totals,
 * it only shapes rows and columns for print.
 *
 * Phase 1 implements the three authoring modes:
 *   topsheet → one row per category + subtotal/markups/grand total
 *   accounts → category headers + one row per account + grand total
 *   lines    → category/account headers + line rows + account subtotals
 *
 * The remaining `ReportBlock.budgetMode` values (`costReport`, `hotCost`,
 * `cashflow`, `comparison`) belong to later phases; until their engines land
 * they fall back to `topsheet` rather than rendering a lying table.
 */

export type BudgetReportMode = 'topsheet' | 'accounts' | 'lines';

export type BudgetReportRowKind = 'category' | 'account' | 'line' | 'subtotal' | 'markup' | 'grand';

export interface BudgetReportColumn {
  key: string;
  label: string;
  /** Percent of the table width (columns are rescaled to sum to 100). */
  width: number;
  align: 'left' | 'center' | 'right';
  /** Value is money in integer minor units (cents). */
  money?: boolean;
  /** Value is a percentage (0–100). */
  percent?: boolean;
}

export interface BudgetReportRow {
  key: string;
  kind: BudgetReportRowKind;
  /** 0 = category, 1 = account, 2 = line/subtotal. */
  depth: 0 | 1 | 2;
  /** Cell values by column key — money/percent/number stay NUMERIC (money in
   *  cents); the renderer formats them through the budget settings. */
  cells: Record<string, string | number | undefined>;
  /** The `rate` cell is in the line's own currency. */
  currencySymbol?: string;
  /** Category/account headers never strand at a page bottom. */
  keepWithNext?: boolean;
  bold?: boolean;
}

export interface BudgetReportTotals {
  baseCents: MoneyCents;
  fringeCents: MoneyCents;
  markupCents: MoneyCents;
  grandTotalCents: MoneyCents;
}

export interface BudgetReportModel {
  mode: BudgetReportMode;
  title: string;
  columns: BudgetReportColumn[];
  rows: BudgetReportRow[];
  totals: BudgetReportTotals;
  settings: BudgetSettings;
}

export interface BudgetReportOptions {
  mode?: ReportBlock['budgetMode'];
  /** Selected category ids; unset = all, an empty array selects none. */
  categories?: string[];
  /** Selected account ids; unset = all, an empty array selects none. Applied
   *  to the account/line modes (a top sheet is a category summary). */
  accounts?: string[];
  /** Subset of the mode's column keys; unset/empty = the mode's defaults. */
  columns?: string[];
  showZero?: boolean;
  showFringes?: boolean;
  showNotes?: boolean;
  showPercent?: boolean;
}

const MODE_TITLES: Record<BudgetReportMode, string> = {
  topsheet: 'Budget — Top Sheet',
  accounts: 'Budget — Accounts',
  lines: 'Budget — Line Detail',
};

/** Phase-1 mode gate (see the module comment). */
export function budgetReportMode(mode: ReportBlock['budgetMode'] | undefined): BudgetReportMode {
  return mode === 'accounts' || mode === 'lines' ? mode : 'topsheet';
}

const COLUMN_DEFS: Record<BudgetReportMode, BudgetReportColumn[]> = {
  topsheet: [
    { key: 'number', label: '#', width: 8, align: 'center' },
    { key: 'name', label: 'Account', width: 45, align: 'left' },
    { key: 'percent', label: '%', width: 9, align: 'right', percent: true },
    { key: 'subtotal', label: 'Subtotal', width: 12, align: 'right', money: true },
    { key: 'fringes', label: 'Fringes', width: 11, align: 'right', money: true },
    { key: 'total', label: 'Total', width: 15, align: 'right', money: true },
  ],
  accounts: [
    { key: 'number', label: '#', width: 8, align: 'center' },
    { key: 'name', label: 'Account', width: 41, align: 'left' },
    { key: 'percent', label: '%', width: 8, align: 'right', percent: true },
    { key: 'subtotal', label: 'Base', width: 12, align: 'right', money: true },
    { key: 'fringes', label: 'Fringes', width: 12, align: 'right', money: true },
    { key: 'notes', label: 'Notes', width: 21, align: 'left' },
    { key: 'total', label: 'Total', width: 14, align: 'right', money: true },
  ],
  lines: [
    { key: 'number', label: 'Account', width: 9, align: 'center' },
    { key: 'description', label: 'Description', width: 25, align: 'left' },
    { key: 'qty', label: 'Qty', width: 6, align: 'right' },
    { key: 'unit', label: 'Unit', width: 6, align: 'center' },
    { key: 'rate', label: 'Rate', width: 9, align: 'right', money: true },
    { key: 'multiplier', label: 'X', width: 5, align: 'right' },
    { key: 'currency', label: 'Cur', width: 5, align: 'center' },
    { key: 'fringes', label: 'Fringes', width: 8, align: 'right' },
    { key: 'percent', label: '%', width: 6, align: 'right', percent: true },
    { key: 'notes', label: 'Notes', width: 12, align: 'left' },
    { key: 'total', label: 'Total (base)', width: 9, align: 'right', money: true },
  ],
};

/** Every column a mode can show (budget block chrome picker + read model). */
export function budgetReportColumnDefs(mode?: ReportBlock['budgetMode']): BudgetReportColumn[] {
  return COLUMN_DEFS[budgetReportMode(mode)].map(c => ({ ...c }));
}

function normalizedColumns(columns: BudgetReportColumn[]): BudgetReportColumn[] {
  const total = columns.reduce((sum, c) => sum + c.width, 0) || 1;
  return columns.map(c => ({ ...c, width: Math.round((c.width / total) * 10000) / 100 }));
}

/** The effective column list for a block's toggles/column subset. */
export function budgetReportColumns(options: BudgetReportOptions = {}): BudgetReportColumn[] {
  const mode = budgetReportMode(options.mode);
  let columns = COLUMN_DEFS[mode].map(c => ({ ...c }));
  if (options.showFringes === false) columns = columns.filter(c => c.key !== 'fringes');
  if (options.showPercent === false) columns = columns.filter(c => c.key !== 'percent');
  if (options.showNotes !== true) columns = columns.filter(c => c.key !== 'notes');
  if (options.columns && options.columns.length > 0) {
    const wanted = new Set(options.columns);
    columns = columns.filter(c => wanted.has(c.key));
  }
  return normalizedColumns(columns.length > 0 ? columns : COLUMN_DEFS[mode]);
}

function unitLabelOf(model: BudgetModel, unitId: string): string {
  const unit = (model.budget.units || []).find(u => u.id === unitId);
  return unit?.name || unitId;
}

function percentOfGrand(cents: MoneyCents, grand: MoneyCents): number {
  return grand === 0 ? 0 : (cents / grand) * 100;
}

function categoryRow(cat: ComputedBudgetCategory): BudgetReportRow {
  return {
    key: `category:${cat.category.id}`,
    kind: 'category',
    depth: 0,
    bold: true,
    keepWithNext: true,
    cells: {
      number: cat.category.number,
      name: cat.category.name,
      description: cat.category.name,
      percent: cat.percentOfGrand,
      subtotal: cat.baseCents,
      fringes: cat.fringeCents,
      total: cat.totalCents,
      notes: cat.category.notes,
    },
  };
}

function accountRow(model: BudgetModel, account: ComputedBudgetAccount, keepWithNext = false): BudgetReportRow {
  return {
    key: `account:${account.account.id}`,
    kind: 'account',
    depth: 1,
    bold: true,
    keepWithNext,
    cells: {
      number: account.account.number,
      name: account.account.name,
      description: account.account.name,
      percent: percentOfGrand(account.totalCents, model.totals.grandTotalCents),
      subtotal: account.baseCents,
      fringes: account.fringeCents,
      total: account.totalCents,
      notes: account.account.notes,
    },
  };
}

function lineRow(model: BudgetModel, line: ComputedBudgetLine): BudgetReportRow {
  return {
    key: `line:${line.line.id}`,
    kind: 'line',
    depth: 2,
    currencySymbol: line.currencySymbol,
    cells: {
      number: line.account.number,
      name: line.line.description,
      description: line.line.description,
      qty: line.qty,
      unit: unitLabelOf(model, line.line.unit),
      rate: line.rateCents,
      multiplier: line.multiplier,
      currency: line.currency,
      fringes: line.fringes.map(f => f.name).join(', '),
      subtotal: line.baseCents,
      total: line.totalCents,
      percent: percentOfGrand(line.totalCents, model.totals.grandTotalCents),
      notes: line.line.notes,
    },
  };
}

function accountSubtotalRow(model: BudgetModel, account: ComputedBudgetAccount): BudgetReportRow {
  return {
    key: `subtotal:${account.account.id}`,
    kind: 'subtotal',
    depth: 1,
    bold: true,
    cells: {
      number: account.account.number,
      name: `Total ${account.account.number} ${account.account.name}`.trim(),
      percent: percentOfGrand(account.totalCents, model.totals.grandTotalCents),
      subtotal: account.baseCents,
      fringes: account.fringeCents,
      total: account.totalCents,
    },
  };
}

/** Budget-level rows after the categories: subtotal, markups/credits, grand. */
function totalRows(model: BudgetModel): BudgetReportRow[] {
  const rows: BudgetReportRow[] = [];
  const base = model.totals.baseCents;
  const fringes = model.totals.fringeCents;
  const grand = model.totals.grandTotalCents;
  const nontrivialMarkups = model.markups.filter(m => m.cents !== 0);
  if (nontrivialMarkups.length > 0) {
    rows.push({
      key: 'subtotal',
      kind: 'subtotal',
      depth: 2,
      bold: true,
      cells: {
        name: 'Subtotal',
        subtotal: base,
        fringes,
        total: base + fringes,
        percent: percentOfGrand(base + fringes, grand),
      },
    });
    for (const m of model.markups) {
      if (m.cents === 0) continue;
      rows.push({
        key: `markup:${m.markup.id}`,
        kind: 'markup',
        depth: 2,
        cells: {
          name: m.markup.name,
          ...(m.markup.calc === 'percent' ? { percent: (m.markup.percent || 0) * m.sign } : {}),
          total: m.sign * m.cents,
        },
      });
    }
  }
  rows.push({
    key: 'grand',
    kind: 'grand',
    depth: 2,
    bold: true,
    cells: {
      name: 'Grand total',
      subtotal: base,
      fringes,
      total: grand,
      percent: grand === 0 ? 0 : 100,
    },
  });
  return rows;
}

/** Build the printable budget table for one block configuration. `null` when
 *  the project has no budget (`ctx.budget` absent) — views render nothing. */
export function buildBudgetReport(
  model: BudgetModel | null | undefined,
  options: BudgetReportOptions = {},
): BudgetReportModel | null {
  if (!model) return null;
  const mode = budgetReportMode(options.mode);
  const columns = budgetReportColumns(options);
  const categoryFilter = options.categories ? new Set(options.categories) : null;
  const accountFilter = options.accounts ? new Set(options.accounts) : null;
  const visible = (cents: MoneyCents) => options.showZero === true || cents !== 0;
  const rows: BudgetReportRow[] = [];

  for (const cat of model.categories) {
    if (categoryFilter && !categoryFilter.has(cat.category.id)) continue;
    if (!visible(cat.totalCents)) continue;
    const accounts = cat.accounts.filter(a =>
      (!accountFilter || accountFilter.has(a.account.id)) && visible(a.totalCents));
    // A top sheet is a category summary: account selection never hides a
    // category (print scope picks categories for the top sheet).
    if (mode !== 'topsheet' && accounts.length === 0) continue;

    rows.push(categoryRow(cat));
    if (mode === 'accounts') {
      for (const account of accounts) rows.push(accountRow(model, account));
    } else if (mode === 'lines') {
      for (const account of accounts) {
        rows.push(accountRow(model, account, true));
        const lines = account.lines.filter(l => visible(l.totalCents));
        for (const line of lines) rows.push(lineRow(model, line));
        // A single-line account's subtotal would repeat its only line.
        if (lines.length > 1) rows.push(accountSubtotalRow(model, account));
      }
    }
  }

  if (rows.length > 0) rows.push(...totalRows(model));

  return {
    mode,
    title: MODE_TITLES[mode],
    columns,
    rows,
    totals: {
      baseCents: model.totals.baseCents,
      fringeCents: model.totals.fringeCents,
      markupCents: model.totals.markupCents,
      grandTotalCents: model.totals.grandTotalCents,
    },
    settings: model.settings,
  };
}
