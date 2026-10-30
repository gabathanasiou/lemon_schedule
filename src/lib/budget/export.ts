import type { Budget, BudgetLine, Project } from '../../types';
import { activeBudgetVersion, migrateBudget } from './model';
import { computeBudget, flatBudgetLines } from './calc';
import { formatMoney } from './format';
import type { CostReportModel } from './costReport';

/**
 * Budget CSV/JSON export + JSON import (`docs/BUDGETING-SURFACES.md` §8).
 * CSV is the human/Excel format; JSON is the lossless round-trip (the whole
 * budget, library included). No XLSX dependency in v1.
 */

function csvCell(value: string | number | undefined): string {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const CSV_HEADER = [
  'Category #', 'Category', 'Account #', 'Account', 'Description',
  'Qty', 'Unit', 'Rate', 'X', 'Currency', 'Fringes', 'Total (local)', 'Total (base)', 'Notes',
];

/** The active version as a flat CSV — one row per line; totals in cents. */
export function exportBudgetCsv(project: Project): string {
  const model = computeBudget(project);
  const rows: string[] = [CSV_HEADER.join(',')];
  if (model) {
    for (const line of flatBudgetLines(model)) {
      const unit = (model.budget.units || []).find(u => u.id === line.line.unit);
      rows.push([
        line.category.number,
        line.category.name,
        line.account.number,
        line.account.name,
        line.line.description,
        line.qty,
        unit?.name || line.line.unit,
        (line.rateCents / 100).toFixed(2),
        line.multiplier,
        line.currency,
        line.fringes.map(f => f.name).join('; '),
        (line.localTotalCents / 100).toFixed(2),
        (line.totalCents / 100).toFixed(2),
        line.line.notes || '',
      ].map(csvCell).join(','));
    }
    rows.push('');
    rows.push([csvCell('Category'), csvCell('Name'), csvCell('Fringes'), csvCell('Total (base)')].join(','));
    for (const cat of model.categories) {
      rows.push([csvCell(cat.category.number), csvCell(cat.category.name), csvCell(cat.fringeCents / 100), csvCell(cat.totalCents / 100)].join(','));
    }
  }
  return rows.join('\n');
}

/** Lossless JSON: the full budget (shared chart/library + every version). */
export function exportBudgetJson(project: Project): string {
  if (!project.budget) return '{}';
  return JSON.stringify({ format: 'lemon-budget', version: 1, budget: project.budget }, null, 2);
}

/** Parse the JSON export back to a Budget. Returns null on an invalid shape;
 *  the load migration fills any missing library arrays. */
export function parseBudgetJson(text: string): Budget | null {
  try {
    const parsed = JSON.parse(text) as { budget?: Budget } | Budget;
    const budget = (parsed as { budget?: Budget }).budget || (parsed as Budget);
    if (!budget || !Array.isArray(budget.versions) || budget.versions.length === 0) return null;
    const project = { budget } as Project;
    migrateBudget(project);
    return project.budget || null;
  } catch {
    return null;
  }
}

export function downloadFile(text: string, filename: string, mime: string): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Filename-safe base from the project title. */
export function budgetFilename(project: Project, ext: string): string {
  const base = (project.title || 'Budget').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-');
  const version = activeBudgetVersion(project.budget);
  return `${base}-${version?.name || 'budget'}.${ext}`;
}

/** Display helper for the export menu labels. */
export function budgetLineLabel(line: BudgetLine): string {
  return line.description || 'New Line';
}

// ---- cost report CSV (roadmap 334 phase 2) ----------------------------------

const COST_CSV_HEADER = [
  'Row', 'Category', 'Account', 'Description', 'Budget', 'Actual', 'Actual (as of)',
  'Committed', 'ETC', 'EFC', 'Variance', '% Used', 'Reason',
];

const centsText = (cents: number) => (cents / 100).toFixed(2);

/** Flat cost report CSV — one row per category/account/line/Unallocated, then
 *  the grand totals. Money in display units (cents/100) for Excel. */
export function exportCostReportCsv(model: CostReportModel): string {
  const rows: string[] = [COST_CSV_HEADER.join(',')];
  const line = (kind: string, category: string, account: string, description: string, row: {
    budgetCents: number; actualCents: number; actualAsOfCents: number;
    committedCents: number; etcCents: number; efcCents: number;
    varianceCents: number; percentUsed: number; etcReason?: string;
  }) => rows.push([
    kind, category, account, description,
    centsText(row.budgetCents), centsText(row.actualCents), centsText(row.actualAsOfCents),
    centsText(row.committedCents), centsText(row.etcCents), centsText(row.efcCents),
    centsText(row.varianceCents), row.percentUsed.toFixed(1), row.etcReason || '',
  ].map(csvCell).join(','));

  for (const cat of model.categories) {
    line('Category', `${cat.number} ${cat.name}`.trim(), '', cat.name, cat.row);
    for (const account of cat.accounts) {
      const accountLabel = `${account.number} ${account.name}`.trim();
      line('Account', `${cat.number} ${cat.name}`.trim(), accountLabel, account.name, account.row);
      for (const row of account.lines) line('Line', `${cat.number} ${cat.name}`.trim(), accountLabel, row.name, row);
      if (account.unallocated) line('Unallocated', `${cat.number} ${cat.name}`.trim(), accountLabel, 'Unallocated', account.unallocated);
    }
  }
  if (model.unallocated) line('Unallocated', '', '', 'Unallocated (project)', model.unallocated);
  line('Total', '', '', 'Grand total', {
    budgetCents: model.totals.budgetCents,
    actualCents: model.totals.actualCents,
    actualAsOfCents: model.totals.actualAsOfCents,
    committedCents: model.totals.committedCents,
    etcCents: model.totals.etcCents,
    efcCents: model.totals.efcCents,
    varianceCents: model.totals.varianceCents,
    percentUsed: model.totals.percentUsed,
  });
  return rows.join('\n');
}

/** Filename-safe base for the cost report export. */
export function costReportFilename(project: Project, ext = 'csv'): string {
  const base = (project.title || 'Cost-Report').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-');
  return `${base}-cost-report-${modelDateStamp()}.${ext}`;
}

function modelDateStamp(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function formatLineMoney(cents: number, model: NonNullable<ReturnType<typeof computeBudget>>): string {
  return formatMoney(cents, model.settings);
}
