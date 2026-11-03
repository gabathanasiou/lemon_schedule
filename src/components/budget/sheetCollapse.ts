/**
 * Collapse state for the Budget sheet (roadmap 340/349). VIEW-ONLY and per
 * session: module-level so a tab/day switch (the view unmounting) keeps it,
 * never project/undo/presence state. Shared by the Budget and Cost Report
 * modes so switching views never resets the bands.
 */
const COLLAPSED_CATEGORIES = new Set<string>();
const COLLAPSED_ACCOUNTS = new Set<string>();

export function collapsedCategoryIds(): ReadonlySet<string> {
  return COLLAPSED_CATEGORIES;
}

export function collapsedAccountIds(): ReadonlySet<string> {
  return COLLAPSED_ACCOUNTS;
}

export function isCategoryCollapsed(id: string): boolean {
  return COLLAPSED_CATEGORIES.has(id);
}

export function isAccountCollapsed(id: string): boolean {
  return COLLAPSED_ACCOUNTS.has(id);
}

export function toggleCategoryCollapse(id: string): void {
  if (COLLAPSED_CATEGORIES.has(id)) COLLAPSED_CATEGORIES.delete(id);
  else COLLAPSED_CATEGORIES.add(id);
}

export function toggleAccountCollapse(id: string): void {
  if (COLLAPSED_ACCOUNTS.has(id)) COLLAPSED_ACCOUNTS.delete(id);
  else COLLAPSED_ACCOUNTS.add(id);
}

/** Selecting a category in the rail (or adding one) unfolds every band — the
 *  user is navigating, not preserving a collapsed view. */
export function clearBudgetCollapse(): void {
  COLLAPSED_CATEGORIES.clear();
  COLLAPSED_ACCOUNTS.clear();
}
