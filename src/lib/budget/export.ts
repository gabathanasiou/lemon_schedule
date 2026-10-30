import type { Budget, BudgetLine, Project } from '../../types';
import { activeBudgetVersion, migrateBudget } from './model';
import { computeBudget, flatBudgetLines } from './calc';
import { formatMoney } from './format';

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

export function formatLineMoney(cents: number, model: NonNullable<ReturnType<typeof computeBudget>>): string {
  return formatMoney(cents, model.settings);
}
