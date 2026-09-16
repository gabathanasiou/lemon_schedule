import { Scene } from '../types';

/**
 * Shared scene-sort comparators — the ONE source of truth for ordering scenes
 * by a criterion (used by the stripboard/calendar sort UI and the agent/MCP
 * `sort_rows` op). Criteria are evaluated in order, so `['set','day_night',
 * 'int_ext']` reads as "group by set, then day/night, then INT/EXT".
 */

/** Order values by their position in an explicit list (unknown values last). */
export function compareByCustomOrder(order: string[], getValue: (scene: Scene) => string): (a: Scene, b: Scene) => number {
  return (a, b) => {
    const valA = getValue(a);
    const valB = getValue(b);
    const idxA = order.indexOf(valA);
    const idxB = order.indexOf(valB);
    const posA = idxA === -1 ? order.length : idxA;
    const posB = idxB === -1 ? order.length : idxB;
    return posA - posB;
  };
}

/**
 * Compare two scenes by `lockedCriteria` in order (the first non-zero wins) —
 * the tiebreaker chain. `primaryCriterion` is skipped (it is compared
 * separately by the caller). Ascending; the caller applies any direction.
 */
export function getLockedTiebreakerResult(
  lockedCriteria: string[],
  primaryCriterion: string,
  sceneA: Scene,
  sceneB: Scene,
  customSortOrders: Record<string, string[]>,
  rowAEstimatedDuration?: number,
  rowBEstimatedDuration?: number,
): number {
  for (const lock of lockedCriteria) {
    if (lock === primaryCriterion) continue;
    let result = 0;
    if (lock === 'scene_number') {
      result = sceneA.sceneNumber.localeCompare(sceneB.sceneNumber, undefined, { numeric: true, sensitivity: 'base' });
    } else if (lock === 'script_day') {
      result = sceneA.scriptDay.localeCompare(sceneB.scriptDay, undefined, { numeric: true, sensitivity: 'base' });
    } else if (lock === 'page_count') {
      result = (sceneA.pageCountDecimal || 0) - (sceneB.pageCountDecimal || 0);
    } else if (lock === 'duration') {
      result = (rowAEstimatedDuration || 0) - (rowBEstimatedDuration || 0);
    } else if (lock === 'int_ext') {
      const order = customSortOrders['int_ext'];
      if (order) { result = compareByCustomOrder(order, s => s.intExt)(sceneA, sceneB); }
      else { result = sceneA.intExt.localeCompare(sceneB.intExt); }
    } else if (lock === 'day_night') {
      const order = customSortOrders['day_night'];
      if (order) { result = compareByCustomOrder(order, s => s.dayNight)(sceneA, sceneB); }
      else { result = sceneA.dayNight.localeCompare(sceneB.dayNight); }
    } else {
      const valA = String((sceneA as any)[lock] ?? '');
      const valB = String((sceneB as any)[lock] ?? '');
      result = valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' });
    }
    if (result !== 0) return result;
  }
  return 0;
}
