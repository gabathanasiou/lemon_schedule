import { parseSearchTags } from '@gabriel/ui-kit';
import type { BudgetModel, ComputedBudgetLine } from './calc';
import type { CostReportModel, CostRow } from './costReport';
import type { BudgetSettings } from '../../types';
import { formatMoney, formatPercent } from './format';

/**
 * The Budget sheet's flattened row models (roadmap 334 phase 2 + 342 + 349).
 * One builder per view feeds the grid, the display-only row filter and the
 * unit tests — the component never re-derives row text. Both views share the
 * same band/search/collapse contract (`SheetRowBase`).
 */
export type BudgetRowKind = 'category' | 'account' | 'line' | 'markup';
export type CostGridRowKind = 'category' | 'account' | 'line' | 'unallocated';

/** The fields every sheet row must expose so filter/collapse work unchanged. */
export interface SheetRowBase extends Record<string, string> {
  key: string;
  kind: string;
  id: string;
  /** Ancestor ids (bands) — the filter keeps a band when a child matches. */
  catId: string;
  accId: string;
  /** `'1'` when the band actually has child rows (the disclosure chevron is
   *  only shown then — roadmap 340 follow-up). Always `''` for leaves. */
  hasChildren: string;
  /** Everything a filter tag may match (never the raw money strings). */
  searchText: string;
  item: string;
}

export interface BudgetGridRow extends SheetRowBase {
  kind: BudgetRowKind;
  qty: string;
  unit: string;
  rate: string;
  x: string;
  cur: string;
  curSymbol: string;
  fringes: string;
  groups: string;
  total: string;
}

export interface CostGridRow extends SheetRowBase {
  kind: CostGridRowKind;
  /** The budget line edited by the ETC/reason cells ('' on bands). */
  lineId: string;
  /** `'1'` when ETC is an explicit override, not the computed remainder. */
  hasEtc: string;
  /** `'1'` for an out-of-budget category and its children. */
  notInBudget: string;
  budget: string;
  actual: string;
  committed: string;
  /** Editable seed for the ETC cell (2dp); '' on bands/unallocated. */
  etc: string;
  etcDisplay: string;
  efc: string;
  variance: string;
  varianceTone: '' | 'good' | 'bad';
  percent: string;
  reason: string;
}

function itemLabel(number: string | undefined, name: string): string {
  return number ? `${number}  ${name}` : name;
}

function lineTotalLabel(line: ComputedBudgetLine, settings: BudgetSettings): string {
  return formatMoney(line.localTotalCents, { ...settings, currencySymbol: line.currencySymbol });
}

const norm = (parts: (string | undefined | null)[]) => parts.filter(Boolean).join(' ').toLowerCase();

/** Flatten the computed model into grid rows (category → account → line, then
 *  markups). `focusCategoryId` narrows to one category like the rail. */
export function buildBudgetRows(
  model: BudgetModel,
  focusCategoryId: string | null,
  settings: BudgetSettings,
): BudgetGridRow[] {
  const units = model.budget.units || [];
  const fringes = model.budget.fringes || [];
  const groups = model.budget.groups || [];
  const unitName = (id: string) => units.find(u => u.id === id)?.name || '';
  const namesById = (ids: string[] | undefined, list: { id: string; name: string }[]) =>
    (ids || []).map(id => list.find(x => x.id === id)?.name || '').filter(Boolean).join(', ');

  const out: BudgetGridRow[] = [];
  for (const cat of model.categories) {
    if (focusCategoryId && cat.category.id !== focusCategoryId) continue;
    const catText = norm([cat.category.number, cat.category.name]);
    out.push({
      key: `cat:${cat.category.id}`, kind: 'category', id: cat.category.id,
      catId: cat.category.id, accId: '',
      hasChildren: cat.accounts.length > 0 ? '1' : '',
      searchText: catText,
      item: itemLabel(cat.category.number, cat.category.name),
      qty: '', unit: '', rate: '', x: '', cur: '', curSymbol: '',
      fringes: formatMoney(cat.fringeCents, settings),
      groups: '',
      total: formatMoney(cat.totalCents, settings),
    });
    for (const acc of cat.accounts) {
      const accText = norm([cat.category.number, cat.category.name, acc.account.number, acc.account.name]);
      out.push({
        key: `acc:${acc.account.id}`, kind: 'account', id: acc.account.id,
        catId: cat.category.id, accId: acc.account.id,
        hasChildren: acc.lines.length > 0 ? '1' : '',
        searchText: accText,
        item: itemLabel(acc.account.number, acc.account.name),
        qty: '', unit: '', rate: '', x: '', cur: '', curSymbol: '',
        fringes: formatMoney(acc.fringeCents, settings),
        groups: '',
        total: formatMoney(acc.totalCents, settings),
      });
      for (const line of acc.lines) {
        const unit = unitName(line.line.unit);
        const fringeNames = namesById(line.line.fringes, fringes);
        const groupNames = namesById(line.line.groups, groups);
        out.push({
          key: `line:${line.line.id}`, kind: 'line', id: line.line.id,
          catId: cat.category.id, accId: acc.account.id,
          hasChildren: '',
          searchText: norm([
            catText, accText, line.line.description, line.line.notes, unit,
            line.currency, fringeNames, groupNames,
          ]),
          item: line.line.description,
          qty: String(line.qty),
          unit,
          rate: (line.rateCents / 100).toFixed(2),
          x: String(line.multiplier),
          cur: line.currency,
          curSymbol: line.currencySymbol,
          fringes: fringeNames,
          groups: groupNames,
          total: lineTotalLabel(line, settings),
        });
      }
    }
  }
  for (const markup of model.markups) {
    const signed = markup.sign * markup.cents;
    const item = `${markup.markup.name} — ${markup.markup.calc === 'percent' ? `${markup.markup.percent || 0}%` : 'flat'}`;
    out.push({
      key: `markup:${markup.markup.id}`, kind: 'markup', id: markup.markup.id,
      catId: '', accId: '',
      hasChildren: '',
      searchText: norm([markup.markup.name, item]),
      item,
      qty: '', unit: '', rate: '', x: '', cur: '', curSymbol: '', fringes: '', groups: '',
      total: formatMoney(signed, settings),
    });
  }
  return out;
}

function varianceLabel(cents: number, settings: BudgetSettings): string {
  if (cents === 0) return '—';
  return cents > 0
    ? `↓ ${formatMoney(cents, settings)} under`
    : `↑ ${formatMoney(-cents, settings)} over`;
}

function costAmounts(row: CostRow, settings: BudgetSettings) {
  return {
    budget: formatMoney(row.budgetCents, settings),
    actual: formatMoney(row.actualCents, settings),
    committed: formatMoney(row.committedCents, settings),
    etc: row.kind === 'line' ? (row.etcCents / 100).toFixed(2) : '',
    etcDisplay: formatMoney(row.etcCents, settings),
    efc: formatMoney(row.efcCents, settings),
    variance: varianceLabel(row.varianceCents, settings),
    varianceTone: row.varianceCents > 0 ? 'good' as const : row.varianceCents < 0 ? 'bad' as const : '' as const,
    percent: formatPercent(row.percentUsed, 1),
    reason: row.etcReason || '',
    hasEtc: row.etcOverride ? '1' : '',
  };
}

/** Flatten `computeCostReport` into the same sheet contract as the Budget
 *  rows (category → account → line, plus the two Unallocated buckets). */
export function buildCostRows(
  report: CostReportModel,
  focusCategoryId: string | null,
  settings: BudgetSettings = report.settings,
): CostGridRow[] {
  const out: CostGridRow[] = [];
  for (const cat of report.categories) {
    if (focusCategoryId && cat.categoryId !== focusCategoryId) continue;
    const notInBudget = cat.inBudget ? '' : '1';
    const catText = norm([cat.number, cat.name, notInBudget ? 'not in budget' : '']);
    out.push({
      key: `cat:${cat.categoryId}`, kind: 'category', id: cat.categoryId,
      catId: cat.categoryId, accId: '',
      hasChildren: cat.accounts.length > 0 ? '1' : '',
      searchText: catText,
      item: itemLabel(cat.number, cat.name) + (notInBudget ? ' (not in budget)' : ''),
      lineId: '', notInBudget,
      ...costAmounts(cat.row, settings),
    });
    for (const acc of cat.accounts) {
      const accText = norm([catText, acc.number, acc.name]);
      out.push({
        key: `acc:${acc.accountId}`, kind: 'account', id: acc.accountId,
        catId: cat.categoryId, accId: acc.accountId,
        hasChildren: acc.lines.length > 0 || !!acc.unallocated ? '1' : '',
        searchText: accText,
        item: itemLabel(acc.number, acc.name),
        lineId: '', notInBudget,
        ...costAmounts(acc.row, settings),
      });
      for (const line of acc.lines) {
        const lineId = line.lineId || '';
        out.push({
          key: lineId ? `line:${lineId}` : line.key, kind: 'line', id: lineId,
          catId: cat.categoryId, accId: acc.accountId,
          hasChildren: '',
          searchText: norm([accText, line.name, line.line?.notes, line.etcReason]),
          item: line.name,
          lineId, notInBudget,
          ...costAmounts(line, settings),
        });
      }
      if (acc.unallocated) {
        out.push({
          key: `unalloc:${acc.accountId}`, kind: 'unallocated', id: '',
          catId: cat.categoryId, accId: acc.accountId,
          hasChildren: '',
          searchText: norm([accText, 'unallocated']),
          item: 'Unallocated',
          lineId: '', notInBudget,
          ...costAmounts(acc.unallocated, settings),
        });
      }
    }
  }
  if (report.unallocated) {
    out.push({
      key: 'unallocated:project', kind: 'unallocated', id: '',
      catId: '', accId: '',
      hasChildren: '',
      searchText: 'unallocated project',
      item: 'Unallocated (project)',
      lineId: '', notInBudget: '',
      ...costAmounts(report.unallocated, settings),
    });
  }
  return out;
}

/**
 * Display-only row filter (roadmap 342): comma tags AND together over the
 * category/account/line text. A band stays when it OR any descendant matches,
 * a child stays when it OR an ancestor band matches — never reorders rows.
 */
export function filterBudgetRows<T extends SheetRowBase>(rows: T[], query: string): T[] {
  const tags = parseSearchTags(query).map(t => t.toLowerCase());
  if (tags.length === 0) return rows;
  const matches = (row: T) => tags.every(tag => row.searchText.includes(tag));

  const matchedCats = new Set<string>();
  const matchedAccs = new Set<string>();
  const descendantsByCat = new Map<string, boolean>();
  const descendantsByAcc = new Map<string, boolean>();
  for (const row of rows) {
    if (!matches(row)) continue;
    if (row.kind === 'category') matchedCats.add(row.id);
    else if (row.kind === 'account') {
      matchedAccs.add(row.id);
      if (row.catId) matchedCats.add(row.catId);
    } else if (row.kind === 'line' || row.kind === 'unallocated') {
      if (row.catId) descendantsByCat.set(row.catId, true);
      if (row.accId) descendantsByAcc.set(row.accId, true);
    }
  }
  return rows.filter(row => {
    if (matches(row)) return true;
    if (row.kind === 'category') return descendantsByCat.get(row.id) === true;
    if (row.kind === 'account') return descendantsByAcc.get(row.id) === true || matchedCats.has(row.catId);
    if (row.kind === 'line' || row.kind === 'unallocated') return matchedCats.has(row.catId) || matchedAccs.has(row.accId);
    return false;
  });
}

/** View-only collapse (roadmap 340): drop children of collapsed bands. */
export function collapseBudgetRows<T extends SheetRowBase>(
  rows: T[],
  collapsedCategories: ReadonlySet<string>,
  collapsedAccounts: ReadonlySet<string>,
): T[] {
  return rows.filter(row => {
    if (row.kind === 'category') return true;
    if (row.catId && collapsedCategories.has(row.catId)) return false;
    if (row.kind === 'account') return true;
    return !row.accId || !collapsedAccounts.has(row.accId);
  });
}
