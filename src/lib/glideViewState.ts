/**
 * Cross-view continuity for the shared `InlineGlideTable` (roadmap 349).
 *
 * The Budget sheet and its Cost Report mode render different row sets (Cost
 * adds Unallocated rows; Budget adds markup rows) and different columns. To
 * switch views without losing your place, we anchor both the viewport and the
 * selection to stable row keys:
 *
 * - `scroll` is the TOP VISIBLE row + the pixel offset into that row.
 * - `selection` is the current cell's row key + column key.
 *
 * On restore each anchor resolves independently: exact row key → its nearest
 * parent (a line → its account, an account → its category) → the same visible
 * index clamped. The scroll is then rebuilt in target pixels, so the row the
 * user was looking at stays at the same height in the window.
 */

export interface GlideViewRow {
  /** The shared grid always supplies one; optional keeps this helper
   *  structurally compatible with `Record<string, string>` rows. */
  key?: string;
  /** Budget/cost row kind when the grid provides one. */
  kind?: string;
  catId?: string;
  accId?: string;
}

export interface GlideViewColumn {
  key: string;
}

export interface GlideScrollAnchor {
  rowKey: string;
  /** Visible row index at the top edge (after collapse/filter). */
  rowIndex: number;
  /** Parent row key for the fallback (line → `acc:<id>`, account → `cat:<id>`). */
  parentKey?: string;
  /** Pixels scrolled past the top row (0 … rowHeight − 1). */
  offset: number;
}

export interface GlideSelectionAnchor {
  rowKey: string;
  rowIndex: number;
  parentKey?: string;
  colKey: string;
}

export interface GlideViewState {
  scroll: GlideScrollAnchor;
  selection: GlideSelectionAnchor | null;
}

export interface GlideViewRestore extends GlideViewState {
  /** A new token per view switch; the grid consumes each token once. */
  token: number;
}

export interface GlideRestoreTarget {
  rowIndex: number;
  colIndex: number;
  scrollTop: number;
}

/** The nearest row above a line/account, used when the exact row is missing. */
export function parentKeyForRow(row: GlideViewRow): string | undefined {
  if (row.kind === 'category' || row.kind === 'markup') return undefined;
  if (row.kind === 'account') return row.catId ? `cat:${row.catId}` : undefined;
  if (row.kind === 'line' || row.kind === 'unallocated') {
    if (row.accId) return `acc:${row.accId}`;
    return row.catId ? `cat:${row.catId}` : undefined;
  }
  // Key-prefix fallback for grids that do not carry a row kind.
  if (row.key.startsWith('acc:')) return row.catId ? `cat:${row.catId}` : undefined;
  if (row.key.startsWith('line:') || row.key.startsWith('unalloc:')) {
    if (row.accId) return `acc:${row.accId}`;
    return row.catId ? `cat:${row.catId}` : undefined;
  }
  return undefined;
}

function resolveRowIndex(
  rows: GlideViewRow[],
  anchor: Pick<GlideScrollAnchor, 'rowKey' | 'rowIndex' | 'parentKey'>,
): number {
  if (rows.length === 0) return -1;
  const exact = rows.findIndex(row => row.key === anchor.rowKey);
  if (exact >= 0) return exact;
  if (anchor.parentKey) {
    const parent = rows.findIndex(row => row.key === anchor.parentKey);
    if (parent >= 0) return parent;
  }
  return Math.max(0, Math.min(rows.length - 1, anchor.rowIndex));
}

/** Resolve one anchor to a row/column/scroll position in the target grid. */
export function resolveGlideViewRestore(
  view: GlideViewRestore,
  rows: GlideViewRow[],
  columns: GlideViewColumn[],
  rowHeight: number,
): GlideRestoreTarget | null {
  if (rows.length === 0 || columns.length === 0) return null;

  const scrollIndex = resolveRowIndex(rows, view.scroll);
  const selectionIndex = view.selection
    ? resolveRowIndex(rows, view.selection)
    : scrollIndex;

  const preferred = view.selection?.colKey || 'item';
  let colIndex = columns.findIndex(column => column.key === preferred);
  if (colIndex < 0) colIndex = columns.findIndex(column => column.key === 'item');
  if (colIndex < 0) colIndex = Math.max(0, columns.findIndex(column => column.key !== 'disclosure'));

  const offset = Math.max(0, Math.min(Math.max(0, rowHeight - 1), view.scroll.offset));
  return {
    rowIndex: selectionIndex,
    colIndex,
    scrollTop: Math.max(0, scrollIndex * rowHeight + offset),
  };
}
