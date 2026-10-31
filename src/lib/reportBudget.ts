import type { BudgetSettings, MoneyCents, Project, ReportBlock } from '../types';
import type { BudgetModel, ComputedBudgetAccount, ComputedBudgetCategory, ComputedBudgetLine } from './budget/calc';
import { computeCostReport, type CostRow } from './budget/costReport';

/**
 * `reportBudget.ts` — the ONE read model for budget report tables
 * (`docs/BUDGETING-SURFACES.md` §8). Built entirely on `computeBudget`
 * (`lib/budget/calc.ts`); this module never re-derives line/account totals,
 * it only shapes rows and columns for print.
 *
 * Phase 2 adds the `costReport` mode, built on `computeCostReport`:
 * Budget/Actual/Committed/ETC/EFC/Variance/% used/Reason per category,
 * account and line (plus Unallocated rows).
 *
 * The remaining `ReportBlock.budgetMode` values (`hotCost`, `cashflow`) belong
 * to later phases; until their engines land they fall back to `topsheet`
 * rather than rendering a lying table.
 *
 * Phase 4 adds `comparison`: the same account rows, read from two versions and
 * shaped as Original / Budget / Variance / Var %. Read-only: the block names
 * the versions, the active budget version never changes.
 */

export type BudgetReportMode = 'topsheet' | 'accounts' | 'lines' | 'costReport' | 'comparison';

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
  costReport: 'Cost Report — Budget vs Actual',
  comparison: 'Budget — Version Comparison',
};

/** Mode gate (see the module comment). */
export function budgetReportMode(mode: ReportBlock['budgetMode'] | undefined): BudgetReportMode {
  if (mode === 'accounts' || mode === 'lines' || mode === 'costReport' || mode === 'comparison') return mode;
  return 'topsheet';
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
  costReport: [
    { key: 'number', label: 'Account', width: 7, align: 'center' },
    { key: 'name', label: 'Account / Description', width: 24, align: 'left' },
    { key: 'budget', label: 'Budget', width: 9, align: 'right', money: true },
    { key: 'actual', label: 'Actual', width: 9, align: 'right', money: true },
    { key: 'committed', label: 'Committed', width: 9, align: 'right', money: true },
    { key: 'etc', label: 'ETC', width: 8, align: 'right', money: true },
    { key: 'efc', label: 'EFC', width: 9, align: 'right', money: true },
    { key: 'variance', label: 'Variance', width: 9, align: 'right', money: true },
    { key: 'percent', label: '% Used', width: 6, align: 'right', percent: true },
    { key: 'reason', label: 'Reason', width: 10, align: 'left' },
  ],
  comparison: [
    { key: 'number', label: '#', width: 7, align: 'center' },
    { key: 'name', label: 'Account', width: 35, align: 'left' },
    { key: 'original', label: 'Original', width: 16, align: 'right', money: true },
    { key: 'budget', label: 'Budget', width: 16, align: 'right', money: true },
    { key: 'variance', label: 'Variance', width: 16, align: 'right', money: true },
    { key: 'percent', label: 'Var %', width: 10, align: 'right', percent: true },
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

// ---- cost report mode (roadmap 334 phase 2) ---------------------------------

export interface CostReportOptions {
  asOf?: string;
  from?: string;
  to?: string;
  /** Selected category ids; unset = all, an empty array selects none. */
  categories?: string[];
  /** Selected account ids; unset = all, an empty array selects none. */
  accounts?: string[];
  /** Subset of the mode's column keys; unset/empty = the mode's defaults. */
  columns?: string[];
  showZero?: boolean;
  showPercent?: boolean;
}

function costRowOf(row: CostRow): BudgetReportRow {
  return {
    key: row.key,
    kind: row.kind === 'category' ? 'category' : row.kind === 'account' ? 'account' : 'line',
    depth: row.depth,
    bold: row.kind === 'category' || row.kind === 'account',
    keepWithNext: row.kind === 'category' || row.kind === 'account',
    cells: {
      number: row.number,
      name: row.name,
      description: row.name,
      budget: row.budgetCents,
      actual: row.actualCents,
      actualAsOf: row.actualAsOfCents,
      committed: row.committedCents,
      etc: row.etcCents,
      efc: row.efcCents,
      variance: row.varianceCents,
      percent: row.percentUsed,
      reason: row.etcReason || '',
      notes: row.etcReason || '',
    },
  };
}

/**
 * The `costReport` print table: Budget/Actual/Committed/ETC/EFC/Variance/% used/
 * Reason, one row per category/account/line (plus account + project
 * "Unallocated" rows). Built on `computeCostReport` — never re-derived here.
 */
export function buildCostReportReport(
  project: Project,
  budget: BudgetModel | null | undefined,
  options: CostReportOptions = {},
): BudgetReportModel | null {
  if (!budget) return null;
  const cost = computeCostReport(project, {
    asOf: options.asOf,
    from: options.from,
    to: options.to,
    budget,
  });
  if (!cost) return null;

  const columns = budgetReportColumns({
    mode: 'costReport',
    columns: options.columns,
    showPercent: options.showPercent,
  });
  const categoryFilter = options.categories ? new Set(options.categories) : null;
  const accountFilter = options.accounts ? new Set(options.accounts) : null;
  const visible = (row: CostRow) => options.showZero === true
    || [row.budgetCents, row.actualCents, row.committedCents, row.etcCents, row.efcCents].some(v => v !== 0);
  const rows: BudgetReportRow[] = [];

  for (const cat of cost.categories) {
    if (categoryFilter && !categoryFilter.has(cat.categoryId)) continue;
    const accounts = cat.accounts.filter(a => !accountFilter || accountFilter.has(a.accountId));
    const accountRows = accounts.map(account => {
      const lines = account.lines.filter(visible);
      const unallocatedVisible = !!account.unallocated && visible(account.unallocated);
      return { account, lines, unallocatedVisible };
    }).filter(a => visible(a.account.row) || a.lines.length > 0 || a.unallocatedVisible);
    if (accountRows.length === 0 && !visible(cat.row)) continue;

    rows.push(costRowOf(cat.row));
    for (const { account, lines, unallocatedVisible } of accountRows) {
      rows.push(costRowOf(account.row));
      for (const line of lines) rows.push(costRowOf(line));
      if (unallocatedVisible && account.unallocated) rows.push(costRowOf(account.unallocated));
    }
  }

  // Project-level expenses with no valid account — never inside a category
  // filter (it is not part of the chart).
  if (!categoryFilter && cost.unallocated && (options.showZero === true || visible(cost.unallocated))) {
    rows.push(costRowOf(cost.unallocated));
  }

  return {
    mode: 'costReport',
    title: MODE_TITLES.costReport,
    columns,
    rows,
    totals: {
      baseCents: cost.totals.actualAsOfCents,
      fringeCents: cost.totals.committedCents,
      markupCents: cost.totals.etcCents,
      grandTotalCents: cost.totals.efcCents,
    },
    settings: cost.settings,
  };
}

// ---- version comparison mode (roadmap 334 phase 4) --------------------------

/** Account identity across two versions. The chart is shared, so numbers are
 *  labels and ids are stable; the number pair is the display/matching label
 *  with the stable id as the fallback for a blank number. No reference is ever
 *  stored from this key. */
function categoryKey(cat: ComputedBudgetCategory): string {
  return cat.category.number || cat.category.id;
}

function accountKey(cat: ComputedBudgetCategory, account: ComputedBudgetAccount): string {
  return `${categoryKey(cat)}/${account.account.number || account.account.id}`;
}

function comparisonCells(originalCents: MoneyCents, budgetCents: MoneyCents): Record<string, number | undefined> {
  const variance = budgetCents - originalCents;
  return {
    original: originalCents,
    budget: budgetCents,
    variance,
    percent: originalCents === 0 ? undefined : (variance / originalCents) * 100,
  };
}

/**
 * The comparison print: category/account rows from TWO `computeBudget` models,
 * read-only. `budget` is the primary (current) version, `original` is the
 * baseline. Variance is signed `budget − original`; Var % is blank when the
 * original is 0 (never a divide-by-zero lie). Money stays integer cents.
 */
export function buildComparisonReport(
  budget: BudgetModel | null | undefined,
  original: BudgetModel | null | undefined,
  options: BudgetReportOptions = {},
): BudgetReportModel | null {
  if (!budget || !original) return null;
  const columns = budgetReportColumns({
    mode: 'comparison',
    columns: options.columns,
    showPercent: options.showPercent,
  });
  const categoryFilter = options.categories ? new Set(options.categories) : null;
  const accountFilter = options.accounts ? new Set(options.accounts) : null;
  const visible = (originalCents: MoneyCents, budgetCents: MoneyCents) =>
    options.showZero === true || originalCents !== 0 || budgetCents !== 0;

  const originalCategoriesById = new Map(original.categories.map(cat => [cat.category.id, cat]));
  const originalCategoriesByNumber = new Map(original.categories.map(cat => [categoryKey(cat), cat]));
  const originalAccountsById = new Map<string, ComputedBudgetAccount>();
  const originalAccountsByNumber = new Map<string, ComputedBudgetAccount>();
  for (const cat of original.categories) {
    for (const account of cat.accounts) {
      originalAccountsById.set(account.account.id, account);
      originalAccountsByNumber.set(accountKey(cat, account), account);
    }
  }

  const rows: BudgetReportRow[] = [];
  for (const cat of budget.categories) {
    if (categoryFilter && !categoryFilter.has(cat.category.id)) continue;
    // The chart is shared, so the id always matches; the number pair is the
    // documented fallback (numbers are labels, never stored references).
    const originalCategory = originalCategoriesById.get(cat.category.id)
      || originalCategoriesByNumber.get(categoryKey(cat));
    const accounts: { account: ComputedBudgetAccount; original?: ComputedBudgetAccount }[] = [];
    for (const account of cat.accounts) {
      if (accountFilter && !accountFilter.has(account.account.id)) continue;
      const originalAccount = originalAccountsById.get(account.account.id)
        || originalAccountsByNumber.get(accountKey(cat, account));
      if (!visible(originalAccount?.totalCents ?? 0, account.totalCents)) continue;
      accounts.push({ account, original: originalAccount });
    }
    if (accounts.length === 0) continue;

    rows.push({
      key: `category:${cat.category.id}`,
      kind: 'category',
      depth: 0,
      bold: true,
      keepWithNext: true,
      cells: {
        number: cat.category.number,
        name: cat.category.name,
        description: cat.category.name,
        ...comparisonCells(originalCategory?.totalCents ?? 0, cat.totalCents),
        notes: cat.category.notes,
      },
    });

    for (const { account, original: originalAccount } of accounts) {
      rows.push({
        key: `account:${account.account.id}`,
        kind: 'account',
        depth: 1,
        bold: true,
        cells: {
          number: account.account.number,
          name: account.account.name,
          description: account.account.name,
          ...comparisonCells(originalAccount?.totalCents ?? 0, account.totalCents),
          notes: account.account.notes,
        },
      });
    }
  }

  if (rows.length > 0) {
    const budgetSubtotal = budget.totals.baseCents + budget.totals.fringeCents;
    const originalSubtotal = original.totals.baseCents + original.totals.fringeCents;
    if (budget.totals.markupCents !== 0 || original.totals.markupCents !== 0) {
      rows.push({
        key: 'subtotal',
        kind: 'subtotal',
        depth: 2,
        bold: true,
        cells: { name: 'Subtotal', ...comparisonCells(originalSubtotal, budgetSubtotal) },
      });
      rows.push({
        key: 'markups',
        kind: 'markup',
        depth: 2,
        cells: { name: 'Markups & credits', ...comparisonCells(original.totals.markupCents, budget.totals.markupCents) },
      });
    }
    rows.push({
      key: 'grand',
      kind: 'grand',
      depth: 2,
      bold: true,
      cells: {
        name: 'Grand total',
        ...comparisonCells(original.totals.grandTotalCents, budget.totals.grandTotalCents),
      },
    });
  }

  return {
    mode: 'comparison',
    title: `Budget — ${budget.version.name} vs ${original.version.name}`,
    columns,
    rows,
    totals: {
      baseCents: budget.totals.baseCents,
      fringeCents: budget.totals.fringeCents,
      markupCents: budget.totals.markupCents,
      grandTotalCents: budget.totals.grandTotalCents,
    },
    settings: budget.settings,
  };
}
