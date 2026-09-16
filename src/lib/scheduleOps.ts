import { Scene, ScheduleRow } from '../types';
import { insertionOrder, renumberRows } from './daybreakUtils';
import { getContainerBlock } from './containers';
import { getLockedTiebreakerResult } from './sortCriteria';

/**
 * Canonical, pure stripboard edit operations — the ONE source of truth for
 * whole-board transforms that both the UI and the agent/MCP surface perform.
 *
 * The stripboard is a SINGLE ordered list (`containerId` 1) whose days are
 * DAYBREAK rows; `containerId` null is the boneyard. Array order is the truth
 * (`computeRowData` walks `rows` in order) — `order` is the numeric key other
 * surfaces sort by. These functions never mutate their input.
 *
 * Consumers:
 * - `ScheduleTab` (auto daybreaks / delete-all daybreaks) — exact extraction.
 * - `debugBridge` → `agentBridgeClient` → MCP tools (roadmap 97 stage 2).
 *
 * Retiming (scene duration, break length, day start time) is NOT here: it is a
 * single `UPDATE_ROW` and goes through the generic action path (see API.md).
 */

export type DaybreakMode = 'duration' | 'pages';
export type DisplacedRowAction = 'boneyard' | 'delete';
export type ScheduleContainer = 'stripboard' | 'boneyard';

export interface AutoDaybreaksOptions {
  mode: DaybreakMode;
  threshold: number;
  /** What to do with stripboard NOTE rows when the board is re-split (UI default: boneyard). */
  notesAction: DisplacedRowAction;
  /** What to do with stripboard BREAK rows when the board is re-split (UI default: boneyard). */
  breaksAction: DisplacedRowAction;
}

function containerIdFor(container: ScheduleContainer): number | null {
  return container === 'stripboard' ? 1 : null;
}

function makeDaybreak(containerId: number | null, newId: () => string): ScheduleRow {
  return {
    id: newId(),
    type: 'DAYBREAK',
    containerId,
    order: 0,
    daybreakLabel: 'DAYBREAK',
    daybreakCallTime: '08:00',
  };
}

/**
 * Split the stripboard into production days by running time (`duration`) or
 * page count (`pages`). Destructive in the same way as the toolbar action: it
 * drops every existing daybreak and re-splits the board, so the caller decides
 * where displaced NOTE/BREAK rows go (`boneyard` or `delete`).
 */
export function autoDaybreaks(
  rows: ScheduleRow[],
  scenes: Scene[],
  opts: AutoDaybreaksOptions,
  newId: () => string,
): ScheduleRow[] {
  const { mode, threshold, notesAction, breaksAction } = opts;
  if (!(threshold > 0)) throw new Error('autoDaybreaks needs a positive threshold.');

  let working = rows.filter(r => r.type !== 'DAYBREAK' || r.pinned);

  const inSet = (r: ScheduleRow, set: Set<string>) => set.has(r.id);
  const notes = new Set(working.filter(r => r.containerId !== null && r.type === 'NOTE').map(r => r.id));
  const breaks = new Set(working.filter(r => r.containerId !== null && r.type === 'BREAK').map(r => r.id));

  working = notesAction === 'boneyard'
    ? working.map(r => inSet(r, notes) ? { ...r, containerId: null } : r)
    : working.filter(r => !inSet(r, notes));
  working = breaksAction === 'boneyard'
    ? working.map(r => inSet(r, breaks) ? { ...r, containerId: null } : r)
    : working.filter(r => !inSet(r, breaks));

  const pinnedRows = working.filter(r => r.pinned);
  const scheduled = working.filter(r => r.containerId !== null && r.type !== 'DAYBREAK');
  const boneyard = working.filter(r => r.containerId === null && r.type !== 'DAYBREAK');

  scheduled.sort((a, b) => {
    if (a.containerId !== b.containerId) return (a.containerId || 0) - (b.containerId || 0);
    return a.order - b.order;
  });

  const result: ScheduleRow[] = [];
  let accumulator = 0;
  for (const row of scheduled) {
    const scene = row.sceneId ? scenes.find(s => s.id === row.sceneId) : null;
    const rowValue = mode === 'duration'
      ? (row.estimatedDuration || 0)
      : (scene?.pageCountDecimal || 0);

    if (accumulator > 0 && accumulator + rowValue > threshold) {
      result.push(makeDaybreak(row.containerId, newId));
      accumulator = 0;
    }
    accumulator += rowValue;
    result.push(row);
  }
  if (result.length > 0) {
    result.push(makeDaybreak(result[result.length - 1].containerId, newId));
  }

  return renumberRows([...pinnedRows, ...result, ...boneyard]);
}

/** Remove every non-pinned daybreak, keeping all other rows in place. Mirrors
 *  the stripboard toolbar's "Delete All" (day details on those breaks go too). */
export function deleteAllDaybreaks(rows: ScheduleRow[]): ScheduleRow[] {
  return renumberRows(rows.filter(r => r.type !== 'DAYBREAK' || r.pinned));
}

interface AnchorOptions {
  beforeRowId?: string | null;
  afterRowId?: string | null;
  toIndex?: number | null;
}

interface Placement {
  insertIndex: number;
  /** The row the moved/inserted rows go BEFORE (array order); undefined = append. */
  anchorRow: ScheduleRow | undefined;
}

/**
 * Resolves where an insertion lands among a container's rows: `containerRows`
 * is the container's ordered pool, `insertIndex` the spot within it, and
 * `anchorRow` the array-order boundary to splice before. The pinned daybreak
 * always opens the stripboard, so index 0 is clamped below it.
 */
function computePlacement(
  pool: ScheduleRow[],
  target: ScheduleContainer,
  opts: AnchorOptions,
): Placement {
  const containerRows = pool
    .filter(r => (getContainerBlock(r) === target))
    .sort((a, b) => a.order - b.order);

  let insertIndex: number;
  if (opts.afterRowId) {
    const i = containerRows.findIndex(r => r.id === opts.afterRowId);
    insertIndex = i >= 0 ? i + 1 : containerRows.length;
  } else if (opts.beforeRowId) {
    const i = containerRows.findIndex(r => r.id === opts.beforeRowId);
    insertIndex = i >= 0 ? i : containerRows.length;
  } else if (opts.toIndex != null) {
    insertIndex = Math.max(0, Math.min(opts.toIndex, containerRows.length));
  } else {
    insertIndex = containerRows.length;
  }

  if (target === 'stripboard' && insertIndex === 0 && containerRows[0]?.pinned) insertIndex = 1;

  let anchorRow = containerRows[insertIndex];
  if (!anchorRow && target === 'stripboard') {
    // Appending to the stripboard: land after the last stripboard row, above
    // the boneyard block.
    anchorRow = pool.find(r => getContainerBlock(r) === 'boneyard');
  }
  return { insertIndex, anchorRow };
}

function spliceAt(pool: ScheduleRow[], rows: ScheduleRow[], anchorRow: ScheduleRow | undefined): ScheduleRow[] {
  const out: ScheduleRow[] = [];
  let placed = false;
  for (const row of pool) {
    if (!placed && anchorRow && row.id === anchorRow.id) {
      out.push(...rows);
      placed = true;
    }
    out.push(row);
  }
  if (!placed) out.push(...rows);
  return out;
}

export interface MoveRowsOptions extends AnchorOptions {
  /** Rows to move (relative order preserved). */
  rowIds: string[];
  /** Target container; defaults to the anchor row's container, else stripboard. */
  toContainer?: ScheduleContainer;
}

/**
 * Move one or more rows to a position on the stripboard or in the boneyard
 * (both directions) — the canonical form of the drag-and-drop reorder. Uses
 * fractional ordering (like the interactive paths) so untouched rows keep
 * their object identity (the stripboard memo contract). The pinned daybreak
 * can never move, and an insert above it is clamped to sit just below it.
 */
export function moveRows(rows: ScheduleRow[], opts: MoveRowsOptions): ScheduleRow[] {
  if (opts.beforeRowId && opts.afterRowId) throw new Error('Pass either beforeRowId or afterRowId, not both.');

  const ids = [...new Set(opts.rowIds)];
  if (ids.length === 0) throw new Error('moveRows needs at least one row id.');
  const idSet = new Set(ids);
  const byId = new Map(rows.map(r => [r.id, r]));

  for (const id of ids) {
    const row = byId.get(id);
    if (!row) throw new Error(`Unknown row id '${id}'.`);
    if (row.pinned) throw new Error('The pinned daybreak cannot be moved.');
    if (getContainerBlock(row) === 'clipboard') throw new Error(`Row '${id}' is on the clipboard and cannot be moved.`);
  }

  for (const anchorId of [opts.beforeRowId, opts.afterRowId]) {
    if (!anchorId) continue;
    const anchor = byId.get(anchorId);
    if (!anchor) throw new Error(`Unknown anchor row id '${anchorId}'.`);
    if (idSet.has(anchorId)) throw new Error('Cannot anchor a move to a row that is being moved.');
  }

  const anchorId = opts.beforeRowId || opts.afterRowId || null;
  const anchor = anchorId ? byId.get(anchorId) : undefined;
  const anchorBlock = anchor ? getContainerBlock(anchor) : null;
  if (anchorBlock === 'clipboard') throw new Error('Cannot move rows next to a clipboard row.');
  const target: ScheduleContainer = opts.toContainer
    ?? (anchorBlock === 'boneyard' ? 'boneyard' : 'stripboard');

  const remaining = rows.filter(r => !idSet.has(r.id));
  const { insertIndex, anchorRow } = computePlacement(remaining, target, opts);
  const containerRows = remaining
    .filter(r => getContainerBlock(r) === target)
    .sort((a, b) => a.order - b.order);

  const baseOrder = insertionOrder(containerRows, insertIndex);
  const moved = ids.map((id, j) => {
    const row = byId.get(id)!;
    const order = ids.length > 1 ? baseOrder + j * 0.01 : baseOrder;
    return getContainerBlock(row) === target
      ? { ...row, order }
      : { ...row, containerId: containerIdFor(target), order };
  });

  return spliceAt(remaining, moved, anchorRow);
}

export interface InsertRowOptions extends AnchorOptions {
  /** Fully-formed row (id assigned by caller); `containerId` is set by the op. */
  row: ScheduleRow;
  /** Target container (default: stripboard). */
  container?: ScheduleContainer;
}

/**
 * Insert a new row (NOTE / BREAK / DAYBREAK) at a position — the canonical form
 * of the context menu's "add row" on the stripboard or the boneyard. Fractional
 * ordering keeps every untouched row's identity.
 */
export function insertRow(rows: ScheduleRow[], opts: InsertRowOptions): ScheduleRow[] {
  if (opts.beforeRowId && opts.afterRowId) throw new Error('Pass either beforeRowId or afterRowId, not both.');
  const { row } = opts;
  if (!row || !row.id) throw new Error('insertRow needs a row with an id.');
  if (rows.some(r => r.id === row.id)) throw new Error(`A row with id '${row.id}' already exists.`);
  if (row.pinned) throw new Error('Do not insert a pinned row — the pinned daybreak is created with the version.');

  const anchorId = opts.beforeRowId || opts.afterRowId || null;
  const anchorRowRef = anchorId ? rows.find(r => r.id === anchorId) : undefined;
  if (anchorId && !anchorRowRef) throw new Error(`Unknown anchor row id '${anchorId}'.`);
  const anchorBlock = anchorRowRef ? getContainerBlock(anchorRowRef) : null;
  if (anchorBlock === 'clipboard') throw new Error('Cannot insert next to a clipboard row.');
  const target: ScheduleContainer = opts.container
    ?? (anchorBlock === 'boneyard' ? 'boneyard' : 'stripboard');

  const { insertIndex, anchorRow } = computePlacement(rows, target, opts);
  const containerRows = rows
    .filter(r => getContainerBlock(r) === target)
    .sort((a, b) => a.order - b.order);

  const placed = { ...row, containerId: containerIdFor(target), order: insertionOrder(containerRows, insertIndex) };
  return spliceAt(rows, [placed], anchorRow);
}

/**
 * Set the stripboard's row order explicitly (the whole-board variant of
 * `moveRows`). `orderedRowIds` must be a permutation of the CURRENT stripboard
 * rows (including daybreaks); boneyard/clipboard rows keep their relative
 * order after it. The pinned daybreak is forced to the front.
 */
export function setStripboardOrder(rows: ScheduleRow[], orderedRowIds: string[]): ScheduleRow[] {
  const strip = rows.filter(r => getContainerBlock(r) === 'stripboard');
  const byId = new Map(strip.map(r => [r.id, r]));
  if (orderedRowIds.length !== strip.length) {
    throw new Error(
      `orderedRowIds must list all ${strip.length} stripboard rows (got ${orderedRowIds.length}). ` +
      'Pass the full stripboard order including daybreaks; boneyard rows are not part of it.',
    );
  }
  const seen = new Set<string>();
  for (const id of orderedRowIds) {
    if (!byId.has(id)) throw new Error(`Unknown stripboard row id '${id}'.`);
    if (seen.has(id)) throw new Error(`Duplicate stripboard row id '${id}'.`);
    seen.add(id);
  }

  const ordered = orderedRowIds.map(id => byId.get(id)!);
  const pinnedIdx = ordered.findIndex(r => r.pinned);
  if (pinnedIdx > 0) {
    const [pinned] = ordered.splice(pinnedIdx, 1);
    ordered.unshift(pinned);
  }

  const rest = rows.filter(r => getContainerBlock(r) !== 'stripboard');
  return renumberRows([...ordered, ...rest]);
}

export interface SortCriterionSpec {
  /** Sort key: a built-in (scene_number, script_day, page_count, duration,
   *  int_ext, day_night) or any scene field / custom category. */
  key: string;
  direction?: 'asc' | 'desc';
}

export interface SortRowsOptions {
  /** Ordered criteria — the first is primary, the rest are tiebreakers
   *  ("group by set, then day/night, then INT/EXT"). */
  criteria: SortCriterionSpec[];
  /** Explicit value order per criterion, e.g. { int_ext: ['INT','EXT','INT/EXT'] }. */
  customOrders?: Record<string, string[]>;
  /** Drop existing non-pinned daybreaks first (the UI always does). Default true. */
  removeDaybreaks?: boolean;
}

/**
 * Sort the stripboard's scene rows by an ordered list of criteria — the
 * canonical form of the toolbar Sort (hierarchical: first criterion wins, the
 * rest break ties). Non-scene rows follow the sorted scenes within their
 * container; boneyard rows are untouched. Like the UI, this drops existing
 * daybreaks (and their day details) unless `removeDaybreaks:false`.
 */
export function sortRows(rows: ScheduleRow[], scenes: Scene[], opts: SortRowsOptions): ScheduleRow[] {
  if (!opts.criteria || opts.criteria.length === 0) throw new Error('sortRows needs at least one criterion.');
  const customOrders = opts.customOrders ?? {};
  const removeDaybreaks = opts.removeDaybreaks !== false;
  const sceneOf = (r: ScheduleRow) => (r.sceneId ? scenes.find(s => s.id === r.sceneId) ?? null : null);

  const pinnedRows = rows.filter(r => r.pinned);
  const base = removeDaybreaks ? rows.filter(r => r.type !== 'DAYBREAK' || r.pinned) : rows;
  const movable = base.filter(r => !r.pinned && r.containerId !== null);
  const boneyard = base.filter(r => r.containerId === null);

  const containers = [...new Set(movable.map(r => r.containerId as number))].sort((a, b) => a - b);
  const orderedScheduled: ScheduleRow[] = [];
  for (const container of containers) {
    const group = movable.filter(r => r.containerId === container);
    const sceneRows = group.filter(r => r.type === 'SCENE');
    const nonSceneRows = group.filter(r => r.type !== 'SCENE');
    sceneRows.sort((a, b) => {
      const sa = sceneOf(a);
      const sb = sceneOf(b);
      if (!sa || !sb) return 0;
      for (const c of opts.criteria) {
        const dir = c.direction === 'desc' ? -1 : 1;
        const result = getLockedTiebreakerResult(
          [c.key], '', sa, sb, customOrders, a.estimatedDuration, b.estimatedDuration,
        ) * dir;
        if (result !== 0) return result;
      }
      return 0;
    });
    orderedScheduled.push(...sceneRows, ...nonSceneRows);
  }

  return renumberRows([...pinnedRows, ...orderedScheduled, ...boneyard]);
}
