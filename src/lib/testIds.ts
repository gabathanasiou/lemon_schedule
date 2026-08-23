/**
 * Stable DOM anchors for agents (Playwright MCP / e2e / playwright-cli).
 * One source of truth — never scatter testid literals through components.
 * Prefer role/label/text queries first (Testing Library guidance); these are
 * for nodes that are otherwise hard to target: daybreak rows, palette items.
 */
export const TEST_IDS = {
  /** Root of a stripboard day (drop context for drag debugging). */
  stripboardDay: 'stripboard-day',
  /** Sortable daybreak row (both footer and next-day header). */
  daybreakRow: 'daybreak-row',
  /** "End of Day #N" footer row of a section. */
  sectionFooter: 'section-footer',
  /** "START OF DAY N" header row (contains the base call-time input). */
  nextDayHeader: 'next-day-header',
  /** Ribbon palette drag source button (sets dataTransfer 'text/field'). */
  paletteItem: 'palette-item',
} as const;