/**
 * DOOD start/work/finish cell appearance — ONE visual language for the SWF
 * column in the Day Manager's inline Glide grids (editable stage grids AND the
 * stage-less fallback grids, roadmap 107). Letters come from `DayView` entries'
 * `dood` field. Deliberately PLAIN — no colour coding: the SWF letter reads as
 * normal read-only text, a muted dash when the element doesn't work that day.
 */
export function doodCellStyle(letter: string): { fg: string } {
  return { fg: letter ? '#71717a' : '#a1a1aa' };
}

/** Display text for the SWF cell (empty → a muted dash keeps the cell tidy). */
export function doodCellText(letter: string): string {
  return letter || '—';
}
