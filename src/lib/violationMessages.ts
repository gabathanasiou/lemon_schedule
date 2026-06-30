/**
 * Central source of truth for all rule violation message text.
 *
 * Exports helper functions used by `rulesEngine.ts` to construct both full
 * `message` strings (for backward compat) and `detail` strings (for grouped
 * tooltip display without repeating the cast name).
 *
 * ### Single-cast details (shown under cast member header in ViolationContent)
 * - `maxHoursDetail(maxHours, over)`
 * - `dateRestrictionDetail()`
 * - `timeWindowDetail(ws?, we?)`
 *
 * ### Multi-cast messages (shown in "General" section, include cast names)
 * - `castConflictMessage(groupA, groupB)`
 * - `castSceneFlagMessage(castNames)`
 *
 * ### Formatting helpers
 * - `formatCastId(id, castMembers)` → `"1. John Smith"`
 * - `formatCastIds(ids, castMembers)` → `"1. John Smith, 2. Jane Doe"`
 */

import { CastMember } from '../types';

/** Resolves a raw cast ID to "ID. Name" format (e.g. `"1. John Smith"`). Falls back to raw ID if cast member not found. */
export function formatCastId(id: string, castMembers: CastMember[]): string {
  const cm = castMembers.find(c => c.id === id);
  return cm ? `${cm.id}. ${cm.name}` : id;
}

/** Formats multiple cast IDs into a comma-separated "ID. Name" list. */
export function formatCastIds(ids: string[], castMembers: CastMember[]): string {
  return ids.map(id => formatCastId(id, castMembers)).join(', ');
}

/** Detail for MAX_HOURS violation — shown under cast member header. */
export function maxHoursDetail(maxHours: number, over: number): string {
  return `Limit is ${maxHours}h (+${over.toFixed(1)}h over)`;
}

/** Detail for DATE_RESTRICTION violation — shown under cast member header. */
export function dateRestrictionDetail(): string {
  return 'Unavailable on this date';
}

/** Raw time-window description without "Only available" prefix (for use in full messages). */
export function timeWindowLabel(ws?: string, we?: string): string {
  if (ws && we) return `${ws}–${we}`;
  if (ws) return `after ${ws}`;
  if (we) return `before ${we}`;
  return '';
}

/** Detail for TIME_WINDOW violation — shown under cast member header (includes "Only available" prefix). */
export function timeWindowDetail(ws?: string, we?: string): string {
  return `Only available ${timeWindowLabel(ws, we)}`;
}

/** Full message for CAST_CONFLICT — shown in "General" section of tooltip. */
export function castConflictMessage(groupA: string, groupB: string): string {
  return `Cast conflict: ${groupA} and ${groupB} both scheduled this day`;
}

/** Full message for CAST_SCENE_FLAG — shown in "General" section of tooltip. */
export function castSceneFlagMessage(castNames: string): string {
  return `Scene includes flagged cast: ${castNames}`;
}
