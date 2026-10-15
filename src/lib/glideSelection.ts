import type { GridSelection } from '@glideapps/glide-data-grid';
import type { PresenceGridSelection } from './supabase/presence';

/**
 * Grid-selection geometry shared by every Glide surface (roadmap 234) — the
 * ONE place the local `GridSelection` → rectangle conversion, the wire
 * encode/decode for peer selections, and the colour helper live. Pure: the
 * Vitest home is `src/lib/__tests__/glideSelection.test.ts`.
 *
 * Ranges are always in GRID/data coordinates (what `getCellContent` and
 * `onGridSelectionChange` use) — renderers must not add the row-marker offset
 * themselves; Glide shifts `highlightRegions` internally.
 */

export interface GridRange {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** `CompactSelection` → the selected indices (bounded by `count`). */
function compactIndices(selection: { [Symbol.iterator](): Iterator<number> }, count: number): number[] {
  const out: number[] = [];
  for (const i of selection) {
    if (i >= 0 && i < count) out.push(i);
  }
  return out;
}

/**
 * The effective rectangle of a selection: the active range when there is one,
 * else the bounding box of the selected rows (all columns) or columns (all
 * rows). This is what copy/cut/clear and the peer-selection broadcast both
 * operate on — one conversion, never per-surface copies.
 */
export function effectiveGridRange(
  selection: GridSelection | null | undefined,
  rowCount: number,
  colCount: number,
): GridRange | null {
  if (!selection) return null;
  const current = selection.current?.range;
  if (current && current.width > 0 && current.height > 0) {
    return { x: current.x, y: current.y, width: current.width, height: current.height };
  }
  if (selection.rows.length > 0) {
    const rows = compactIndices(selection.rows, rowCount);
    if (rows.length === 0) return null;
    const first = rows[0];
    const last = rows[rows.length - 1];
    return { x: 0, y: first, width: colCount, height: last - first + 1 };
  }
  if (selection.columns.length > 0) {
    const cols = compactIndices(selection.columns, colCount);
    if (cols.length === 0) return null;
    const first = cols[0];
    const last = cols[cols.length - 1];
    return { x: first, y: 0, width: last - first + 1, height: rowCount };
  }
  return null;
}

/**
 * Resolve a wire key to a local index: the KEY when this client still has it
 * (rows reordered / a scene deleted), else the sender's index clamped into
 * range — never null for a non-empty list, so a highlight can still land
 * approximately instead of vanishing.
 */
export function indexOfKey(keys: string[], key: string, fallbackIndex: number): number | null {
  if (keys.length === 0) return null;
  const i = keys.indexOf(key);
  if (i >= 0) return i;
  const fallback = Number.isFinite(fallbackIndex) ? Math.trunc(fallbackIndex) : 0;
  return Math.min(Math.max(fallback, 0), keys.length - 1);
}

/**
 * Our rectangle → the wire selection: keys for both corners (the robust half)
 * plus our indices (the fallback). Ranges are clamped to real cells — the
 * spare/add rows of a grid are never broadcast.
 */
export function selectionRangeToWire(
  scope: string,
  range: GridRange,
  rowKeys: string[],
  colKeys: string[],
): PresenceGridSelection | null {
  const maxY = rowKeys.length - 1;
  const maxX = colKeys.length - 1;
  if (maxY < 0 || maxX < 0) return null;
  const clamp = (v: number, max: number) => Math.min(Math.max(Math.trunc(v), 0), max);
  const x1 = clamp(range.x, maxX);
  const y1 = clamp(range.y, maxY);
  const x2 = clamp(range.x + range.width - 1, maxX);
  const y2 = clamp(range.y + range.height - 1, maxY);
  if (range.width <= 0 || range.height <= 0 || range.x > maxX || range.y > maxY) return null;
  return {
    scope,
    anchor: { rowKey: rowKeys[y1], colKey: colKeys[x1], rowIndex: y1, colIndex: x1 },
    extent: { rowKey: rowKeys[y2], colKey: colKeys[x2], rowIndex: y2, colIndex: x2 },
  };
}

/** A peer's wire selection → this client's rectangle (keys first, indices as
 *  the clamped fallback). Null when the grid has no rows/columns to show it. */
export function resolveSelectionRange(
  selection: PresenceGridSelection,
  rowKeys: string[],
  colKeys: string[],
): GridRange | null {
  if (rowKeys.length === 0 || colKeys.length === 0) return null;
  const ax = indexOfKey(colKeys, selection.anchor.colKey, selection.anchor.colIndex);
  const ay = indexOfKey(rowKeys, selection.anchor.rowKey, selection.anchor.rowIndex);
  const ex = indexOfKey(colKeys, selection.extent.colKey, selection.extent.colIndex);
  const ey = indexOfKey(rowKeys, selection.extent.rowKey, selection.extent.rowIndex);
  if (ax == null || ay == null || ex == null || ey == null) return null;
  return {
    x: Math.min(ax, ex),
    y: Math.min(ay, ey),
    width: Math.abs(ax - ex) + 1,
    height: Math.abs(ay - ey) + 1,
  };
}

/** `#rgb` / `#rrggbb` → `rgba(…)`; anything else passes through untouched. */
export function withAlpha(color: string, alpha: number): string {
  let hex = color.trim();
  if (!hex.startsWith('#')) return color;
  hex = hex.slice(1);
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  if (hex.length !== 6 || !/^[0-9a-f]{6}$/i.test(hex)) return color;
  const n = parseInt(hex, 16);
  const a = Math.min(Math.max(alpha, 0), 1);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
