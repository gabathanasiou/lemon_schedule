import type { BudgetRowKind } from '../../lib/budget/gridRows';

const CATEGORY_BG = '#e8e8ea';
const ACCOUNT_BG = '#f6f6f7';
const STRONG_TEXT = '#18181b';
const ACCOUNT_TEXT = '#3f3f46';

export interface BudgetBandTheme {
  bgCell: string;
  textDark: string;
  textMedium: string;
  textLight: string;
}

/** The one band palette for category/account rows, shared by the Budget and
 *  Cost Report grids so the two modes never drift. */
export function budgetBandTheme(kind: BudgetRowKind | 'unallocated'): BudgetBandTheme | undefined {
  if (kind === 'category') return { bgCell: CATEGORY_BG, textDark: STRONG_TEXT, textMedium: STRONG_TEXT, textLight: STRONG_TEXT };
  if (kind === 'account') return { bgCell: ACCOUNT_BG, textDark: ACCOUNT_TEXT, textMedium: ACCOUNT_TEXT, textLight: ACCOUNT_TEXT };
  return undefined;
}
