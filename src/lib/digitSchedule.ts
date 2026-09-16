import { ScheduleRow } from '../types';
import { renumberRows } from './daybreakUtils';

/**
 * Digit scheduling (roadmap 47): typing a day number on selected boneyard
 * rows schedules them to that section. The whole computation is pure — the
 * caller owns the dispatch and the resulting selection — so the boundary math
 * (which day, insert just before that day's closing daybreak, fractional
 * ordering, renumber) has one home.
 */

/** The board's day targets, in order (index 0 = Day 1) — every non-pinned
 *  DAYBREAK. The pinned anchor is NOT a target: it is the day-1 boundary, not
 *  a production day. */
export function targetDaybreaks(rows: ScheduleRow[]): ScheduleRow[] {
  return rows
    .filter(r => r.type === 'DAYBREAK' && r.containerId != null && !r.pinned)
    .sort((a, b) => (a.containerId || 0) - (b.containerId || 0) || a.order - b.order);
}

/**
 * Moves `rowIds` into the day with the given 1-based number, inserting them
 * just before that day's closing daybreak. Returns the renumbered row array,
 * or `null` when the day number is out of range (the invalid input the caller
 * must ignore rather than mis-schedule).
 */
export function scheduleRowsToDay(
  rows: ScheduleRow[],
  rowIds: string[],
  daybreaks: ScheduleRow[],
  dayNum: number,
): ScheduleRow[] | null {
  if (!Number.isInteger(dayNum) || dayNum < 1 || dayNum > daybreaks.length) return null;
  const target = daybreaks[dayNum - 1];
  const moved = rows.map(r => rowIds.includes(r.id)
    ? { ...r, containerId: 1, order: target.order - 0.5 + rowIds.indexOf(r.id) * 0.01 }
    : r);
  moved.sort((a, b) => {
    if ((a.containerId || 0) !== (b.containerId || 0)) return (a.containerId || 0) - (b.containerId || 0);
    return a.order - b.order;
  });
  return renumberRows(moved);
}
