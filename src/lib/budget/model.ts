import type {
  Budget, BudgetAccount, BudgetCategory, BudgetCurrency, BudgetFringe, BudgetGlobal,
  BudgetGroup, BudgetLine, BudgetMarkup, BudgetSettings, BudgetUnit,
  BudgetVersion, BudgetVersionTrashItem, Expense, ExpenseMethod, ExpenseStatus,
  Project, PurchaseOrder, PurchaseOrderStatus,
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

export const DEFAULT_BUDGET_CURRENCIES: BudgetCurrency[] = [
  { code: 'USD', symbol: '$', rateToBase: 1 },
  // No default rate: converting a foreign line without a rate is a warning, not
  // a silent 1:1 (docs/BUDGETING.md §1). "Sync rates" fills them in (roadmap 341).
  { code: 'EUR', symbol: '€', rateToBase: undefined },
  { code: 'GBP', symbol: '£', rateToBase: undefined },
  { code: 'CAD', symbol: 'CA$', rateToBase: undefined },
  { code: 'AUD', symbol: 'A$', rateToBase: undefined },
  { code: 'NZD', symbol: 'NZ$', rateToBase: undefined },
  { code: 'JPY', symbol: '¥', rateToBase: undefined },
  { code: 'CNY', symbol: 'CN¥', rateToBase: undefined },
  { code: 'HKD', symbol: 'HK$', rateToBase: undefined },
  { code: 'SGD', symbol: 'S$', rateToBase: undefined },
  { code: 'INR', symbol: '₹', rateToBase: undefined },
  { code: 'KRW', symbol: '₩', rateToBase: undefined },
  { code: 'CHF', symbol: 'CHF', rateToBase: undefined },
  { code: 'SEK', symbol: 'kr', rateToBase: undefined },
  { code: 'NOK', symbol: 'kr', rateToBase: undefined },
  { code: 'DKK', symbol: 'kr', rateToBase: undefined },
  { code: 'PLN', symbol: 'zł', rateToBase: undefined },
  { code: 'CZK', symbol: 'Kč', rateToBase: undefined },
  { code: 'HUF', symbol: 'Ft', rateToBase: undefined },
  { code: 'RON', symbol: 'lei', rateToBase: undefined },
  { code: 'TRY', symbol: '₺', rateToBase: undefined },
  { code: 'BRL', symbol: 'R$', rateToBase: undefined },
  { code: 'MXN', symbol: 'MX$', rateToBase: undefined },
  { code: 'ZAR', symbol: 'R', rateToBase: undefined },
  { code: 'AED', symbol: 'AED', rateToBase: undefined },
  { code: 'SAR', symbol: 'SAR', rateToBase: undefined },
  { code: 'ILS', symbol: '₪', rateToBase: undefined },
  { code: 'THB', symbol: '฿', rateToBase: undefined },
  { code: 'MYR', symbol: 'RM', rateToBase: undefined },
  { code: 'IDR', symbol: 'Rp', rateToBase: undefined },
  { code: 'PHP', symbol: '₱', rateToBase: undefined },
  { code: 'TWD', symbol: 'NT$', rateToBase: undefined },
  // Item 354 — timezone-derived defaults need these in the library.
  { code: 'UAH', symbol: '₴', rateToBase: undefined },
  { code: 'RSD', symbol: 'дин', rateToBase: undefined },
  { code: 'RUB', symbol: '₽', rateToBase: undefined },
  { code: 'ARS', symbol: 'AR$', rateToBase: undefined },
  { code: 'COP', symbol: 'COL$', rateToBase: undefined },
  { code: 'CLP', symbol: 'CLP$', rateToBase: undefined },
  { code: 'PEN', symbol: 'S/', rateToBase: undefined },
];

/** Currency rows a budget should have: the defaults, keeping any existing row
 *  (and its hand-edited symbol/rate) by code (roadmap 341 — additive only). */
export function mergeDefaultCurrencies(existing: BudgetCurrency[] | undefined): BudgetCurrency[] {
  const byCode = new Map((existing || []).map(c => [c.code.toUpperCase(), c]));
  for (const def of DEFAULT_BUDGET_CURRENCIES) {
    if (!byCode.has(def.code)) byCode.set(def.code, { ...def });
  }
  return [...byCode.values()];
}

/** The selected currency's symbol — the ONE derived value for
 *  `BudgetSettings.currencySymbol` (never a second editable source). */
export function currencySymbolFor(code: string, currencies: BudgetCurrency[] | undefined): string {
  const hit = (currencies || []).find(c => c.code.toUpperCase() === code.toUpperCase());
  return hit?.symbol || hit?.code || code || DEFAULT_BUDGET_SETTINGS.currencySymbol || '$';
}

/** Settings after picking a base currency: derive the symbol in the same
 *  write so formatting never reads a stale one (roadmap 341). */
export function settingsWithCurrency(settings: BudgetSettings, code: string, currencies: BudgetCurrency[] | undefined): BudgetSettings {
  return { ...settings, currency: code, currencySymbol: currencySymbolFor(code, currencies) };
}

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
  // Explicit `cloneFromId` = duplicate; omitted/null = a BLANK version
  // (the version menu's Create action, matching the schedule version flow).
  const source = cloneFromId ? budget.versions.find(v => v.id === cloneFromId) : undefined;
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
  // Additive currency seed (roadmap 341): keep hand-edited rows/rates and add
  // any default code the saved budget predates.
  const mergedCurrencies = mergeDefaultCurrencies(b.currencies);
  if (mergedCurrencies.length !== (b.currencies || []).length) { b.currencies = mergedCurrencies; changed = true; }
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

// ---- cost tracking (roadmap 334 phase 2) ------------------------------------

export const EXPENSE_STATUSES: ExpenseStatus[] = ['planned', 'committed', 'actual', 'paid', 'void'];
export const EXPENSE_STATUS_LABELS: Record<ExpenseStatus, string> = {
  planned: 'Planned',
  committed: 'Committed',
  actual: 'Actual',
  paid: 'Paid',
  void: 'Void',
};

export const EXPENSE_METHODS: ExpenseMethod[] = ['card', 'cash', 'cheque', 'transfer', 'payroll', 'pettyCash', 'other'];
export const EXPENSE_METHOD_LABELS: Record<ExpenseMethod, string> = {
  card: 'Card',
  cash: 'Cash',
  cheque: 'Cheque',
  transfer: 'Transfer',
  payroll: 'Payroll',
  pettyCash: 'Petty cash',
  other: 'Other',
};

export const PURCHASE_ORDER_STATUSES: PurchaseOrderStatus[] = ['open', 'partial', 'received', 'cancelled'];
export const PURCHASE_ORDER_STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  open: 'Open',
  partial: 'Partially invoiced',
  received: 'Received',
  cancelled: 'Cancelled',
};

/** ISO `YYYY-MM-DD` for today (local, never UTC-shifted). */
export function isoToday(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function makeExpense(partial: Partial<Expense> = {}): Expense {
  const now = Date.now();
  return {
    id: partial.id || generateUUID(),
    date: partial.date || isoToday(),
    description: partial.description ?? 'New expense',
    accountId: partial.accountId,
    lineId: partial.lineId,
    vendor: partial.vendor,
    amountCents: partial.amountCents ?? 0,
    currency: partial.currency,
    method: partial.method ?? 'card',
    status: partial.status ?? 'actual',
    poId: partial.poId,
    receiptUrl: partial.receiptUrl,
    notes: partial.notes,
    dayDate: partial.dayDate,
    dayNumber: partial.dayNumber,
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
  };
}

/** `PO-1001`, `PO-1002`, … after the highest existing suffix. */
export function nextPurchaseOrderNumber(existing: string[]): string {
  let max = 1000;
  for (const n of existing) {
    const hit = /(\d+)\s*$/.exec(String(n || ''));
    const value = hit ? parseInt(hit[1], 10) : NaN;
    if (Number.isFinite(value) && value > max) max = value;
  }
  return `PO-${max + 1}`;
}

export function makePurchaseOrder(partial: Partial<PurchaseOrder> & { number?: string } = {}): PurchaseOrder {
  const now = Date.now();
  return {
    id: partial.id || generateUUID(),
    number: partial.number || '',
    vendor: partial.vendor,
    description: partial.description,
    issuedDate: partial.issuedDate,
    accountId: partial.accountId,
    lineId: partial.lineId,
    amountCents: partial.amountCents ?? 0,
    status: partial.status ?? 'open',
    notes: partial.notes,
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
  };
}

/**
 * Idempotent read normalization for cost tracking. Runs on every load path
 * (local/Drive/online/room) beside `migrateBudget`. ARRAYS ONLY — a project
 * without expenses/POs gets empty arrays, never derived data.
 */
export function migrateCostTracking(project: { expenses?: Expense[]; purchaseOrders?: PurchaseOrder[] }): boolean {
  let changed = false;
  if (!Array.isArray(project.expenses)) { project.expenses = []; changed = true; }
  if (!Array.isArray(project.purchaseOrders)) { project.purchaseOrders = []; changed = true; }
  return changed;
}
