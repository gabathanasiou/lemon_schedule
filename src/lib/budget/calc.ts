import type {
  BudgetAccount, BudgetCategory, BudgetGroupKind, BudgetLine, BudgetMarkup,
  BudgetSettings, BudgetVersion, MoneyCents, Project,
} from '../../types';
import {
  activeBudgetVersion, budgetVersionSettings,
} from './model';
import { evaluateFormula, evaluateGlobals } from './formula';
import { computeLineFringes, fringeRangeBases, roundHalfUp } from './fringes';
import { computeScheduleQuantities, computeSystemGlobals, scheduleQtyFor, ScheduleQuantities } from './scheduleSync';
import { currencySymbolOf } from './format';

/**
 * `computeBudget(project)` — the ONE read model for budget totals
 * (`docs/BUDGETING.md` §4). Pure, memoizable, never mutates project state.
 * Every surface and report renders from this; no component does arithmetic.
 */

export interface BudgetError {
  message: string;
  lineId?: string;
  accountId?: string;
  categoryId?: string;
}

export interface FringeLineItem {
  id: string;
  name: string;
  cents: number;
  percent?: number;
}

export interface ComputedBudgetLine {
  line: BudgetLine;
  account: BudgetAccount;
  category: BudgetCategory;
  qty: number;
  rateCents: number;
  multiplier: number;
  /** Amounts in the line's own currency. */
  localBaseCents: MoneyCents;
  localFringeCents: MoneyCents;
  localTotalCents: MoneyCents;
  /** Amounts converted to the base currency (account/grand totals use these). */
  baseCents: MoneyCents;
  fringeCents: MoneyCents;
  totalCents: MoneyCents;
  currency: string;
  currencySymbol: string;
  fringes: FringeLineItem[];
  errors: string[];
  /** True when the quantity follows the schedule right now. */
  linked: boolean;
  /** True when a linked line's quantity is pinned by an override. */
  pinned: boolean;
  /** The quantity the schedule says, even when overridden (drift display). */
  scheduleQty?: number;
}

export interface ComputedBudgetAccount {
  account: BudgetAccount;
  category: BudgetCategory;
  lines: ComputedBudgetLine[];
  baseCents: MoneyCents;
  fringeCents: MoneyCents;
  totalCents: MoneyCents;
  errors: BudgetError[];
}

export interface ComputedBudgetCategory {
  category: BudgetCategory;
  accounts: ComputedBudgetAccount[];
  baseCents: MoneyCents;
  fringeCents: MoneyCents;
  totalCents: MoneyCents;
  /** Share of grand total, 0–100 (one decimal in the UI). */
  percentOfGrand: number;
  inBudget: boolean;
  errors: BudgetError[];
}

export interface ComputedBudgetMarkup {
  markup: BudgetMarkup;
  cents: MoneyCents;
  /** +1 (markup/charge) or −1 (discount/credit). */
  sign: 1 | -1;
}

export interface BudgetModel {
  budget: Project['budget'] & object;
  version: BudgetVersion;
  settings: BudgetSettings;
  categories: ComputedBudgetCategory[];
  markups: ComputedBudgetMarkup[];
  globals: Record<string, number>;
  globalErrors: Record<string, string>;
  /** Grand totals in base cents. */
  totals: {
    baseCents: MoneyCents;
    fringeCents: MoneyCents;
    markupCents: MoneyCents;
    grandTotalCents: MoneyCents;
    byGroup: Record<BudgetGroupKind, MoneyCents>;
    percentByGroup: Record<BudgetGroupKind, number>;
  };
  errors: BudgetError[];
  linkedLineCount: number;
  pinnedLineCount: number;
  lineCount: number;
}

function roundToCents(value: number): MoneyCents {
  return roundHalfUp(value);
}

function lineSourceMissing(project: Project, line: BudgetLine): string | null {
  const source = line.source;
  if (!source) return null;
  switch (source.kind) {
    case 'shootDays':
    case 'perDay':
      return null;
    case 'crewRole': {
      const role = project.crewRoles?.find(r => r.key === source.roleKey);
      if (!role) return `Crew role "${source.roleKey}" no longer exists`;
      if (source.personId) {
        const people = project.crew?.[source.roleKey] || [];
        if (!people.some(p => p.id === source.personId)) return 'Linked crew member no longer exists';
      }
      return null;
    }
    case 'cast':
      return (project.castMembers || []).some(c => c.id === source.castId) ? null : 'Linked cast member no longer exists';
    case 'location':
      return (project.locations || []).some(l => l.id === source.locationId) ? null : 'Linked location no longer exists';
    case 'element': {
      const list = source.category === 'cast'
        ? (project.castMembers || []).map(c => ({ id: c.id, name: c.name }))
        : project.breakdownElements?.[source.category] || [];
      return list.some(e => (e.id === source.key) || (e.name === source.key)) ? null : 'Linked element no longer exists';
    }
    default:
      return null;
  }
}

function markupQualifies(
  markup: BudgetMarkup,
  category: BudgetCategory,
  accounts: ComputedBudgetAccount[],
): boolean {
  const except = markup.except;
  if (except) {
    if (except.categories?.includes(category.id)) return false;
    if (except.groups?.includes(category.group)) return false;
  }
  const scope = markup.appliesTo || { all: true };
  if (except?.accounts && accounts.every(a => except.accounts!.includes(a.account.id))) return false;
  if (scope.all) return true;
  if (scope.categories?.includes(category.id)) return true;
  if (scope.groups?.includes(category.group)) return true;
  if (scope.accounts && accounts.some(a => scope.accounts!.includes(a.account.id))) return true;
  return false;
}

function qualifiedCents(
  markup: BudgetMarkup,
  category: BudgetCategory,
  accounts: ComputedBudgetAccount[],
  mode: 'base' | 'fringes' | 'both',
): number {
  if (!markupQualifies(markup, category, accounts)) return 0;
  const except = markup.except;
  const scope = markup.appliesTo || { all: true };
  let base = 0;
  let fringes = 0;
  for (const a of accounts) {
    if (except?.accounts?.includes(a.account.id)) continue;
    // A qualifier by account sums only those accounts.
    if (!scope.all && !scope.categories?.includes(category.id) && !scope.groups?.includes(category.group) && scope.accounts && !scope.accounts.includes(a.account.id)) continue;
    base += a.baseCents;
    fringes += a.fringeCents;
  }
  if (mode === 'base') return base;
  if (mode === 'fringes') return fringes;
  return base + fringes;
}

/** Compute a markup's cents from the active categories (scope-aware). */
function computeMarkups(
  markups: BudgetMarkup[],
  categories: ComputedBudgetCategory[],
): { rows: ComputedBudgetMarkup[]; totalCents: number } {
  const rows: ComputedBudgetMarkup[] = [];
  let total = 0;
  let priorQualified = 0;
  const sorted = [...markups].sort((a, b) => a.sort - b.sort);
  for (const markup of sorted) {
    const mode = markup.marksUp || 'both';
    let base = 0;
    for (const cat of categories) {
      if (!cat.inBudget) continue;
      base += qualifiedCents(markup, cat.category, cat.accounts, mode);
    }
    if (markup.compound) base += priorQualified;
    let cents = markup.calc === 'percent'
      ? roundToCents((base * (markup.percent || 0)) / 100)
      : Math.abs(markup.amountCents || 0);
    if (markup.capCents != null) cents = Math.min(cents, Math.abs(markup.capCents));
    const sign: 1 | -1 = markup.kind === 'discount' || markup.kind === 'credit' ? -1 : 1;
    total += sign * cents;
    priorQualified += cents;
    rows.push({ markup, cents, sign });
  }
  return { rows, totalCents: total };
}

export interface ComputeBudgetOptions {
  versionId?: string;
  /** Reuse an already-computed schedule read (one per surface). */
  quantities?: ScheduleQuantities;
  /** Precomputed system globals (derived from the quantities when omitted). */
  systemGlobals?: Record<string, number>;
}

export function computeBudget(project: Project, options: ComputeBudgetOptions = {}): BudgetModel | null {
  const budget = project.budget;
  if (!budget) return null;
  const version = options.versionId
    ? budget.versions.find(v => v.id === options.versionId) || activeBudgetVersion(budget)
    : activeBudgetVersion(budget);
  if (!version) return null;

  const settings = budgetVersionSettings(budget, version);
  const quantities = options.quantities ?? computeScheduleQuantities(project);
  const systemGlobals = options.systemGlobals ?? computeSystemGlobals(project, quantities);
  const { values: globals, errors: globalErrors } = evaluateGlobals(budget.globals || [], systemGlobals);

  const errors: BudgetError[] = [];
  const groupInBudget = new Map((budget.groups || []).map(g => [g.id, g.inBudget !== false]));
  const accountById = new Map(budget.accounts.map(a => [a.id, a]));

  const linesByAccount = new Map<string, BudgetLine[]>();
  const validLines: BudgetLine[] = [];
  for (const line of version.lines || []) {
    if (!accountById.has(line.accountId)) {
      errors.push({ message: `Line "${line.description}" points at a missing account`, lineId: line.id });
      continue;
    }
    validLines.push(line);
    if (!linesByAccount.has(line.accountId)) linesByAccount.set(line.accountId, []);
    linesByAccount.get(line.accountId)!.push(line);
  }

  // First pass: effective qty/rate/X and the local base for every line. Fringe
  // range bases need every line before any line total can be finalised.
  interface LineMath { qty: number; rateCents: number; multiplier: number; localBaseCents: number; errors: string[]; }
  const mathById = new Map<string, LineMath>();
  for (const line of validLines) {
    const lineErrors: string[] = [];
    const qtyFormula = evaluateFormula(line.qtyFormula, globals);
    const rateFormula = evaluateFormula(line.rateFormula, globals);
    const multFormula = evaluateFormula(line.multiplierFormula, globals);
    if (qtyFormula.error) lineErrors.push(`Qty ${qtyFormula.error}`);
    if (rateFormula.error) lineErrors.push(`Rate ${rateFormula.error}`);
    if (multFormula.error) lineErrors.push(`X ${multFormula.error}`);
    const qty = qtyFormula.error
      ? 0
      : line.qtyFormula
        ? qtyFormula.value
        : line.source
          ? (line.qtyOverride ?? scheduleQtyFor(line.source, quantities))
          : (line.qtyOverride ?? line.qty);
    const rateCents = rateFormula.error
      ? 0
      : line.rateFormula
        ? rateFormula.value
        : (line.rateOverride ?? line.rateCents);
    const multiplier = multFormula.error
      ? 0
      : line.multiplierFormula
        ? multFormula.value
        : line.multiplier;
    const unit = (budget.units || []).find(u => u.id === line.unit);
    const rawBase = unit?.type === 'percent'
      ? roundToCents((rateCents * qty * multiplier) / 100)
      : roundToCents(qty * rateCents * multiplier);
    const localBaseCents = line.capCents != null ? Math.min(rawBase, line.capCents) : rawBase;
    mathById.set(line.id, { qty, rateCents, multiplier, localBaseCents, errors: lineErrors });
  }

  const rangeBases = fringeRangeBases(validLines.map(line => ({
    line,
    localBaseCents: mathById.get(line.id)?.localBaseCents || 0,
  })));
  const rangeSeen = new Set<string>();

  const categories: ComputedBudgetCategory[] = [];
  const sortedCategories = [...budget.categories].sort((a, b) => a.sort - b.sort || a.number.localeCompare(b.number));
  for (const category of sortedCategories) {
    const catErrors: BudgetError[] = [];
    const accounts: ComputedBudgetAccount[] = [];
    const catAccounts = budget.accounts
      .filter(a => a.categoryId === category.id)
      .sort((a, b) => a.sort - b.sort || a.number.localeCompare(b.number));
    for (const account of catAccounts) {
      const lines: ComputedBudgetLine[] = [];
      const accErrors: BudgetError[] = [];
      const accountLines = (linesByAccount.get(account.id) || []).sort((a, b) => a.sort - b.sort);
      for (const line of accountLines) {
        const math = mathById.get(line.id)!;
        const lineErrors = [...math.errors];
        const missing = lineSourceMissing(project, line);
        if (missing) lineErrors.push(missing);
        const scheduleQty = line.source ? scheduleQtyFor(line.source, quantities) : undefined;
        const { qty, rateCents, multiplier, localBaseCents } = math;

        const isRangeAnchor = !line.fringeRangeId || !rangeSeen.has(line.fringeRangeId);
        if (line.fringeRangeId && isRangeAnchor) rangeSeen.add(line.fringeRangeId);
        const fringeResult = computeLineFringes(
          line,
          localBaseCents,
          budget.fringes || [],
          line.fringeRangeId ? rangeBases.get(line.fringeRangeId) : undefined,
          isRangeAnchor,
        );
        const localFringeCents = fringeResult.cents;
        const localTotalCents = localBaseCents + localFringeCents;

        // Per-line currency conversion. A missing rate is a warning and yields
        // 0 base — never a silent 1:1 (docs/BUDGETING.md §1).
        const lineCurrency = line.currency || settings.currency || 'USD';
        let fx = 1;
        if (line.fxRate != null && line.fxRate > 0) fx = line.fxRate;
        else if (lineCurrency !== (settings.currency || 'USD')) {
          const info = (budget.currencies || []).find(c => c.code === lineCurrency);
          if (info?.rateToBase && info.rateToBase > 0) fx = info.rateToBase;
          else {
            fx = 0;
            lineErrors.push(`Missing FX rate for ${lineCurrency}`);
          }
        }
        const baseCents = roundToCents(localBaseCents * fx);
        const fringeCents = roundToCents(localFringeCents * fx);
        const totalCents = baseCents + fringeCents;

        lines.push({
          line,
          account,
          category,
          qty,
          rateCents,
          multiplier,
          localBaseCents,
          localFringeCents,
          localTotalCents,
          baseCents,
          fringeCents,
          totalCents,
          currency: lineCurrency,
          currencySymbol: currencySymbolOf(lineCurrency, budget.currencies || [], settings.currencySymbol),
          fringes: fringeResult.items.map(f => ({
            id: f.fringe.id,
            name: f.fringe.name,
            cents: roundToCents(f.cents * fx),
            percent: f.fringe.percent,
          })),
          errors: lineErrors,
          linked: !!line.source && line.qtyOverride == null,
          pinned: !!line.source && line.qtyOverride != null,
          scheduleQty,
        });
        for (const e of lineErrors) accErrors.push({ message: e, lineId: line.id, accountId: account.id });
      }
      const baseCents = lines.reduce((s, l) => s + l.baseCents, 0);
      const fringeCents = lines.reduce((s, l) => s + l.fringeCents, 0);
      accounts.push({
        account,
        category,
        lines,
        baseCents,
        fringeCents,
        totalCents: baseCents + fringeCents,
        errors: accErrors,
      });
    }
    const baseCents = accounts.reduce((s, a) => s + a.baseCents, 0);
    const fringeCents = accounts.reduce((s, a) => s + a.fringeCents, 0);
    const totalCents = baseCents + fringeCents;
    categories.push({
      category,
      accounts,
      baseCents,
      fringeCents,
      totalCents,
      percentOfGrand: 0,
      inBudget: groupInBudget.get(category.group) !== false,
      errors: catErrors,
    });
  }

  const { rows: markups, totalCents: markupTotal } = computeMarkups(budget.markups || [], categories);
  const inBudgetCats = categories.filter(c => c.inBudget);
  const grandBase = inBudgetCats.reduce((s, c) => s + c.baseCents, 0);
  const grandFringes = inBudgetCats.reduce((s, c) => s + c.fringeCents, 0);
  const grandTotalCents = grandBase + grandFringes + markupTotal;
  for (const cat of categories) {
    cat.percentOfGrand = grandTotalCents === 0 ? 0 : (cat.totalCents / grandTotalCents) * 100;
  }

  const byGroup: Record<BudgetGroupKind, MoneyCents> = { atl: 0, btl: 0, post: 0, other: 0 };
  for (const cat of inBudgetCats) byGroup[cat.category.group] = (byGroup[cat.category.group] || 0) + cat.totalCents;
  const percentByGroup = { ...byGroup } as Record<BudgetGroupKind, number>;
  for (const key of Object.keys(percentByGroup) as BudgetGroupKind[]) {
    percentByGroup[key] = grandTotalCents === 0 ? 0 : (byGroup[key] / grandTotalCents) * 100;
  }

  let linkedLineCount = 0;
  let pinnedLineCount = 0;
  let lineCount = 0;
  for (const cat of categories) {
    for (const acc of cat.accounts) {
      for (const line of acc.lines) {
        lineCount++;
        if (line.linked) linkedLineCount++;
        if (line.pinned) pinnedLineCount++;
      }
    }
  }

  return {
    budget,
    version,
    settings,
    categories,
    markups,
    globals,
    globalErrors,
    totals: {
      baseCents: grandBase,
      fringeCents: grandFringes,
      markupCents: markupTotal,
      grandTotalCents,
      byGroup,
      percentByGroup,
    },
    errors,
    linkedLineCount,
    pinnedLineCount,
    lineCount,
  };
}

/** Flat computed lines in stripboard order — reports and CSV use this. */
export function flatBudgetLines(model: BudgetModel): ComputedBudgetLine[] {
  return model.categories.flatMap(c => c.accounts.flatMap(a => a.lines));
}

/** Find one computed account/category for a line's context. */
export function accountById(model: BudgetModel, accountId: string): ComputedBudgetAccount | undefined {
  for (const cat of model.categories) {
    const hit = cat.accounts.find(a => a.account.id === accountId);
    if (hit) return hit;
  }
  return undefined;
}
