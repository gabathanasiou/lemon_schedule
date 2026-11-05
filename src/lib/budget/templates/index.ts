import type { Budget, BudgetSettings } from '../../../types';
import {
  DEFAULT_BUDGET_CURRENCIES, DEFAULT_BUDGET_GROUPS, DEFAULT_BUDGET_SETTINGS,
  DEFAULT_BUDGET_UNITS, makeBudgetAccount, makeBudgetCategory, makeBudgetMarkup,
  makeBudgetVersion,
} from '../model';

/** Feature-film starter chart of accounts — three fixed levels, structure only
 *  (no zero-dollar placeholder lines). `docs/BUDGETING.md` §7. */
export function featureBudget(settings?: Partial<BudgetSettings>): Budget {
  const cats = {
    atl: makeBudgetCategory({ number: '1000', name: 'Above the Line', group: 'atl', sort: 0 }),
    btl: makeBudgetCategory({ number: '2000', name: 'Below the Line', group: 'btl', sort: 1 }),
    post: makeBudgetCategory({ number: '3000', name: 'Post Production', group: 'post', sort: 2 }),
    other: makeBudgetCategory({ number: '4000', name: 'Other', group: 'other', sort: 3 }),
  };
  const account = (categoryId: string, number: string, name: string, sort: number) =>
    makeBudgetAccount({ categoryId, number, name, sort });
  const accounts = [
    account(cats.atl.id, '1100', 'Story & Rights', 0),
    account(cats.atl.id, '1200', 'Producers', 1),
    account(cats.atl.id, '1300', 'Director', 2),
    account(cats.atl.id, '1400', 'Cast', 3),
    account(cats.atl.id, '1500', 'Travel & Living', 4),
    account(cats.btl.id, '2100', 'Production Staff', 0),
    account(cats.btl.id, '2200', 'Background Actors', 1),
    account(cats.btl.id, '2300', 'Set Design', 2),
    account(cats.btl.id, '2400', 'Set Operations', 3),
    account(cats.btl.id, '2500', 'Special Effects', 4),
    account(cats.btl.id, '2600', 'Wardrobe', 5),
    account(cats.btl.id, '2700', 'Makeup & Hair', 6),
    account(cats.btl.id, '2800', 'Lighting', 7),
    account(cats.btl.id, '2900', 'Camera', 8),
    account(cats.btl.id, '3000', 'Sound', 9),
    account(cats.btl.id, '3100', 'Transportation', 10),
    account(cats.btl.id, '3200', 'Locations', 11),
    account(cats.btl.id, '3300', 'Film & Stock', 12),
    account(cats.post.id, '4100', 'Post Production Staff', 0),
    account(cats.post.id, '4200', 'Post Sound', 1),
    account(cats.post.id, '4300', 'Visual Effects', 2),
    account(cats.post.id, '4400', 'Music', 3),
    account(cats.post.id, '4500', 'Deliverables', 4),
    account(cats.other.id, '5100', 'Insurance', 0),
    account(cats.other.id, '5200', 'Legal & Accounting', 1),
  ];
  const version = makeBudgetVersion({ name: 'v01' });
  return {
    categories: [cats.atl, cats.btl, cats.post, cats.other],
    accounts,
    fringes: [],
    fringeRanges: [],
    groups: DEFAULT_BUDGET_GROUPS.map(g => ({ ...g })),
    globals: [],
    units: DEFAULT_BUDGET_UNITS.map(u => ({ ...u })),
    currencies: DEFAULT_BUDGET_CURRENCIES.map(c => ({ ...c })),
    markups: [
      makeBudgetMarkup({ name: 'Contingency', calc: 'percent', percent: 10, marksUp: 'both', appliesTo: { all: true }, sort: 0 }),
    ],
    settings: { ...DEFAULT_BUDGET_SETTINGS, ...settings, templateKey: 'feature' },
    versions: [version],
    activeVersionId: version.id,
    versionTrash: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/** Commercial/AICP is a later phase — the key stays reserved. */
export function templateBudget(key: 'blank' | 'feature', settings?: Partial<BudgetSettings>): Budget {
  if (key === 'feature') return featureBudget(settings);
  const version = makeBudgetVersion({ name: 'v01' });
  return {
    categories: [],
    accounts: [],
    fringes: [],
    fringeRanges: [],
    groups: DEFAULT_BUDGET_GROUPS.map(g => ({ ...g })),
    globals: [],
    units: DEFAULT_BUDGET_UNITS.map(u => ({ ...u })),
    currencies: DEFAULT_BUDGET_CURRENCIES.map(c => ({ ...c })),
    markups: [],
    settings: { ...DEFAULT_BUDGET_SETTINGS, ...settings, templateKey: 'blank' },
    versions: [version],
    activeVersionId: version.id,
    versionTrash: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}
