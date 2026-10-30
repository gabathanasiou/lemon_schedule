import type {
  Budget, BudgetAccount, BudgetCategory, BudgetFringe, BudgetGlobal,
  BudgetGroup, BudgetLine, BudgetMarkup, BudgetSettings, BudgetUnit,
  BudgetVersion, BudgetVersionTrashItem, Project,
} from '../../types';
import { generateUUID } from '../utils';

/**
 * Budget model factories, defaults and version helpers. Canonical plan:
 * `docs/BUDGETING.md` §3. Money fields are integer cents; this module never
 * formats or computes a total (that is `calc.ts`), it only constructs valid
 * shapes and keeps shared chart/library objects shared.
 */

export const BUDGET_TRASH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const BUDGET_TRASH_KEEP = 10;

export const DEFAULT_BUDGET_SETTINGS: BudgetSettings = {
  currency: 'USD',
  currencySymbol: '$',
  decimals: 0,
  negativeStyle: 'minus',
  fringePosting: 'topsheet',
};

export const DEFAULT_BUDGET_UNITS: BudgetUnit[] = [
  { id: 'unit-day', name: 'Day', plural: 'Days', type: 'time', hours: 10 },
  { id: 'unit-week', name: 'Week', plural: 'Weeks', type: 'time', hours: 50 },
  { id: 'unit-hour', name: 'Hour', plural: 'Hours', type: 'time', hours: 1 },
  { id: 'unit-flat', name: 'Flat', plural: 'Flat', type: 'flat' },
  { id: 'unit-allow', name: 'Allow', plural: 'Allow', type: 'flat' },
  { id: 'unit-percent', name: '%', plural: '%', type: 'percent' },
];

export const DEFAULT_BUDGET_CURRENCIES = [
  { code: 'USD', symbol: '$', rateToBase: 1 },
  // No default rate: converting a foreign line without a rate is a warning, not
  // a silent 1:1 (docs/BUDGETING.md §1).
  { code: 'EUR', symbol: '€', rateToBase: undefined },
  { code: 'GBP', symbol: '£', rateToBase: undefined },
];

export const DEFAULT_BUDGET_GROUPS: BudgetGroup[] = [
  { id: 'grp-atl', name: 'Above the Line', color: '#2563eb', inBudget: true },
  { id: 'grp-btl', name: 'Below the Line', color: '#059669', inBudget: true },
  { id: 'grp-post', name: 'Post Production', color: '#7c3aed', inBudget: true },
  { id: 'grp-other', name: 'Other', color: '#71717a', inBudget: true },
];

/** Numeral label after the highest existing one, preserving gaps. */
export function nextBudgetNumber(existing: string[], width = 4): string {
  let max = 0;
  for (const n of existing) {
    const v = parseInt(String(n).replace(/[^\d]/g, ''), 10);
    if (Number.isFinite(v) && v > max) max = v;
  }
  return String(max + 1).padStart(width, '0');
}

export function makeBudgetCategory(partial: Partial<BudgetCategory> = {}): BudgetCategory {
  return {
    id: partial.id || generateUUID(),
    number: partial.number ?? '',
    name: partial.name ?? 'New Category',
    group: partial.group ?? 'other',
    sort: partial.sort ?? 0,
    color: partial.color,
    notes: partial.notes,
    locked: partial.locked,
  };
}

export function makeBudgetAccount(partial: Partial<BudgetAccount> & { categoryId: string }): BudgetAccount {
  return {
    id: partial.id || generateUUID(),
    categoryId: partial.categoryId,
    number: partial.number ?? '',
    name: partial.name ?? 'New Account',
    sort: partial.sort ?? 0,
    notes: partial.notes,
    locked: partial.locked,
  };
}

export function makeBudgetLine(partial: Partial<BudgetLine> & { accountId: string }): BudgetLine {
  return {
    id: partial.id || generateUUID(),
    accountId: partial.accountId,
    description: partial.description ?? 'New Line',
    kind: partial.kind,
    qty: partial.qty ?? 1,
    unit: partial.unit ?? 'unit-flat',
    rateCents: partial.rateCents ?? 0,
    multiplier: partial.multiplier ?? 1,
    qtyFormula: partial.qtyFormula,
    rateFormula: partial.rateFormula,
    multiplierFormula: partial.multiplierFormula,
    currency: partial.currency,
    fxRate: partial.fxRate,
    fringes: partial.fringes,
    fringeRangeId: partial.fringeRangeId,
    groups: partial.groups,
    locationId: partial.locationId,
    setId: partial.setId,
    phase: partial.phase,
    startDate: partial.startDate,
    endDate: partial.endDate,
    capCents: partial.capCents,
    notes: partial.notes,
    etcCents: partial.etcCents,
    etcReason: partial.etcReason,
    approvedOverageCents: partial.approvedOverageCents,
    original: partial.original,
    source: partial.source,
    qtyOverride: partial.qtyOverride,
    rateOverride: partial.rateOverride,
    sort: partial.sort ?? 0,
  };
}

export function makeBudgetFringe(partial: Partial<BudgetFringe> = {}): BudgetFringe {
  return {
    id: partial.id || generateUUID(),
    name: partial.name ?? 'New Fringe',
    calc: partial.calc ?? 'percent',
    percent: partial.percent ?? 0,
    amountCents: partial.amountCents ?? 0,
    cutoffCents: partial.cutoffCents,
    groups: partial.groups,
    posting: partial.posting,
    color: partial.color,
    notes: partial.notes,
  };
}

export function makeBudgetGroup(partial: Partial<BudgetGroup> = {}): BudgetGroup {
  return {
    id: partial.id || generateUUID(),
    name: partial.name ?? 'New Group',
    color: partial.color,
    inBudget: partial.inBudget,
    notes: partial.notes,
  };
}

export function makeBudgetGlobal(partial: Partial<BudgetGlobal> = {}): BudgetGlobal {
  return {
    id: partial.id || generateUUID(),
    symbol: (partial.symbol || 'NUMBER').toUpperCase(),
    description: partial.description,
    unit: partial.unit,
    value: partial.value ?? 0,
    formula: partial.formula,
    system: partial.system,
  };
}

export function makeBudgetUnit(partial: Partial<BudgetUnit> = {}): BudgetUnit {
  return {
    id: partial.id || generateUUID(),
    name: partial.name ?? 'New Unit',
    plural: partial.plural ?? 'New Units',
    type: partial.type ?? 'quantity',
    hours: partial.hours,
    color: partial.color,
  };
}

export function makeBudgetMarkup(partial: Partial<BudgetMarkup> & { sort: number }): BudgetMarkup {
  return {
    id: partial.id || generateUUID(),
    name: partial.name ?? 'Contingency',
    kind: partial.kind ?? 'markup',
    calc: partial.calc ?? 'percent',
    percent: partial.percent ?? 0,
    amountCents: partial.amountCents ?? 0,
    appliesTo: partial.appliesTo ?? { all: true },
    except: partial.except,
    marksUp: partial.marksUp ?? 'both',
    compound: partial.compound ?? false,
    capCents: partial.capCents,
    capType: partial.capType ?? 'none',
    discountPercent: partial.discountPercent,
    sort: partial.sort,
  };
}

export function makeBudgetVersion(partial: Partial<BudgetVersion> & { name: string }): BudgetVersion {
  const now = Date.now();
  return {
    id: partial.id || generateUUID(),
    name: partial.name,
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
    lines: partial.lines ?? [],
    settings: partial.settings,
    locked: partial.locked,
    lockedAt: partial.lockedAt,
    note: partial.note,
  };
}

/** A blank-but-valid budget: one empty version and the default library. */
export function makeBlankBudget(name = 'v01', partial: Partial<Budget> = {}): Budget {
  const version = makeBudgetVersion({ name, id: partial.activeVersionId });
  const now = Date.now();
  return {
    categories: partial.categories ?? [],
    accounts: partial.accounts ?? [],
    fringes: partial.fringes ?? [],
    fringeRanges: partial.fringeRanges ?? [],
    groups: partial.groups ?? DEFAULT_BUDGET_GROUPS.map(g => ({ ...g })),
    globals: partial.globals ?? [],
    units: partial.units ?? DEFAULT_BUDGET_UNITS.map(u => ({ ...u })),
    currencies: partial.currencies ?? DEFAULT_BUDGET_CURRENCIES.map(c => ({ ...c })),
    markups: partial.markups ?? [],
    settings: { ...DEFAULT_BUDGET_SETTINGS, ...(partial.settings || {}) },
    versions: partial.versions ?? [version],
    activeVersionId: partial.activeVersionId ?? version.id,
    versionTrash: partial.versionTrash ?? [],
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
  };
}

export function activeBudgetVersion(budget: Budget | undefined): BudgetVersion | undefined {
  if (!budget) return undefined;
  return budget.versions.find(v => v.id === budget.activeVersionId) || budget.versions[0];
}

export function budgetVersionSettings(budget: Budget, version: BudgetVersion): BudgetSettings {
  return { ...budget.settings, ...(version.settings || {}) };
}

/** Effective settings for the project's active budget version. */
export function budgetSettingsOf(project: Project): BudgetSettings | undefined {
  const budget = project.budget;
  if (!budget) return undefined;
  const version = activeBudgetVersion(budget);
  return version ? budgetVersionSettings(budget, version) : { ...budget.settings };
}

/**
 * Copy-on-write version clone: the chart of accounts and library stay shared
 * with the source; the line array is shared by reference until an edit
 * replaces it (every store case maps to a NEW array). Never deep-clone.
 */
export function cloneBudgetVersion(
  budget: Budget,
  name: string,
  cloneFromId?: string | null,
  id?: string,
): { version: BudgetVersion; budgetPatch: Partial<Budget> } {
  const source = cloneFromId
    ? budget.versions.find(v => v.id === cloneFromId)
    : activeBudgetVersion(budget);
  const version = makeBudgetVersion({
    id,
    name,
    lines: source?.lines ?? [],
    settings: source?.settings,
  });
  return {
    version,
    budgetPatch: { versions: [...budget.versions, version], activeVersionId: version.id },
  };
}

/** 30-day TTL + keep the newest 10 (the schedule/calendar trash contract). */
export function pruneBudgetVersionTrash(items: BudgetVersionTrashItem[] | undefined, now = Date.now()): BudgetVersionTrashItem[] {
  if (!items || items.length === 0) return [];
  const fresh = items
    .filter(i => now - i.deletedAt <= BUDGET_TRASH_TTL_MS)
    .sort((a, b) => b.deletedAt - a.deletedAt)
    .slice(0, BUDGET_TRASH_KEEP);
  return fresh;
}

/**
 * Idempotent read normalization (mirrors `migrateProjectLinks`). Runs on every
 * load path through the reducer's LOAD case. Never creates a budget.
 */
export function migrateBudget(project: { budget?: Budget }): boolean {
  const b = project.budget;
  if (!b) return false;
  let changed = false;
  const ensure = <K extends keyof Budget>(key: K, fallback: NonNullable<Budget[K]>) => {
    if (!b[key]) { (b as any)[key] = fallback; changed = true; }
  };
  ensure('categories', []);
  ensure('accounts', []);
  ensure('fringes', []);
  ensure('fringeRanges', []);
  ensure('groups', DEFAULT_BUDGET_GROUPS.map(g => ({ ...g })));
  ensure('globals', []);
  ensure('units', DEFAULT_BUDGET_UNITS.map(u => ({ ...u })));
  ensure('currencies', DEFAULT_BUDGET_CURRENCIES.map(c => ({ ...c })));
  ensure('markups', []);
  ensure('versionTrash', []);
  if (!b.settings) { b.settings = { ...DEFAULT_BUDGET_SETTINGS }; changed = true; }
  else {
    for (const [k, v] of Object.entries(DEFAULT_BUDGET_SETTINGS)) {
      if ((b.settings as any)[k] === undefined) { (b.settings as any)[k] = v; changed = true; }
    }
  }
  if (!Array.isArray(b.versions) || b.versions.length === 0) {
    b.versions = [makeBudgetVersion({ name: 'v01' })];
    b.activeVersionId = b.versions[0].id;
    changed = true;
  }
  if (!b.activeVersionId || !b.versions.some(v => v.id === b.activeVersionId)) {
    b.activeVersionId = b.versions[0].id;
    changed = true;
  }
  for (const v of b.versions) {
    if (!Array.isArray(v.lines)) { v.lines = []; changed = true; }
    if (!v.name) { v.name = 'v01'; changed = true; }
    if (!v.createdAt) { v.createdAt = Date.now(); changed = true; }
    if (!v.updatedAt) { v.updatedAt = v.createdAt; changed = true; }
  }
  // Trash is bounded on every read path.
  const pruned = pruneBudgetVersionTrash(b.versionTrash);
  if (pruned.length !== (b.versionTrash || []).length) { b.versionTrash = pruned; changed = true; }
  return changed;
}
