import type { ReportBlock } from '../../types';
import { makeReportBlock } from '../reportBlocks';

/**
 * The one-click Budget View starter (roadmap 363): Repeat Budget Categories →
 * Repeat Budget Accounts → Table Budget Lines. The nested repeats narrow by
 * record relation (`resolveCollectionItems`), and the lines table is seeded
 * with the budget field columns. Tables are leaves, so the line table sits
 * INSIDE the accounts repeat — never inside another table.
 *
 * Users can still add anything else around it (title, grand total, page
 * breaks, columns); the preset is only the hierarchy skeleton.
 */
export function makeBudgetHierarchyBlock(): ReportBlock {
  const lines = makeReportBlock('table', { collection: 'budgetLines' });
  const accountHeader = makeReportBlock('text', {
    text: '{{budgetAccountNumber}}  {{budgetAccountName}} — {{budgetLineTotal}}',
  });
  accountHeader.fontSize = 10;
  const accounts = makeReportBlock('repeat', {
    collection: 'budgetAccounts',
    gap: 2,
    children: [accountHeader, lines],
  });
  const categoryHeader = makeReportBlock('text', {
    text: '{{budgetCategoryNumber}}  {{budgetCategoryName}} — {{budgetLineTotal}}',
  });
  categoryHeader.bold = true;
  categoryHeader.fontSize = 12;
  return makeReportBlock('repeat', {
    collection: 'budgetCategories',
    gap: 8,
    children: [categoryHeader, accounts],
  });
}
