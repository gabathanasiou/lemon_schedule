import { parseSearchTags } from '@gabriel/ui-kit';
import type { BudgetModel, ComputedBudgetLine } from './calc';
import type { BudgetSettings } from '../../types';
import { formatMoney } from './format';

/**
 * The Budget sheet's flattened row model (roadmap 334 phase 2 + 342). One
 * builder feeds the grid, the display-only row filter and the unit tests — the
 * component never re-derives row text.
 */
export type BudgetRowKind = 'category' | 'account' | 'line' | 'markup';

export interface BudgetGridRow extends Record<string, string> {
  key: string;
  kind: BudgetRowKind;
  id: string;
  /** Ancestor ids (bands) — the filter keeps a band when a child matches. */
  catId: string;
  accId: string;
  /** `'1'` when the band actually has child rows (the disclosure chevron is
   *  only shown then — roadmap 340 follow-up). Always `''` for lines/markups. */
  hasChildren: string;
  /** Everything a filter tag may match (never the raw money strings). */
  searchText: string;
  item: string;
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

/**
 * Display-only row filter (roadmap 342): comma tags AND together over the
 * category/account/line text. A band stays when it OR any descendant matches,
 * a child stays when it OR an ancestor band matches — never reorders rows.
 */
export function filterBudgetRows(rows: BudgetGridRow[], query: string): BudgetGridRow[] {
  const tags = parseSearchTags(query).map(t => t.toLowerCase());
  if (tags.length === 0) return rows;
  const matches = (row: BudgetGridRow) => tags.every(tag => row.searchText.includes(tag));

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
    } else if (row.kind === 'line') {
      if (row.catId) descendantsByCat.set(row.catId, true);
      if (row.accId) descendantsByAcc.set(row.accId, true);
    }
  }
  return rows.filter(row => {
    if (matches(row)) return true;
    if (row.kind === 'category') return descendantsByCat.get(row.id) === true;
    if (row.kind === 'account') return descendantsByAcc.get(row.id) === true || matchedCats.has(row.catId);
    if (row.kind === 'line') return matchedCats.has(row.catId) || matchedAccs.has(row.accId);
    return false;
  });
}

/** View-only collapse (roadmap 340): drop children of collapsed bands. */
export function collapseBudgetRows(
  rows: BudgetGridRow[],
  collapsedCategories: ReadonlySet<string>,
  collapsedAccounts: ReadonlySet<string>,
): BudgetGridRow[] {
  return rows.filter(row => {
    if (row.kind === 'category') return true;
    if (collapsedCategories.has(row.catId)) return false;
    if (row.kind === 'account') return true;
    if (row.kind === 'markup') return true;
    return !collapsedAccounts.has(row.accId);
  });
}
