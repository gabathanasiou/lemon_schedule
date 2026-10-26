/**
 * Day Manager category tabs (roadmap 315) — pure ids shared by the page and
 * the app-nav hash. `overview` is the default (and is omitted from the hash);
 * `all` is the full stacked page. Every other key maps to one registry
 * section. Keep this list and the `tabs` metadata in `daySectionRegistry.tsx`
 * in sync.
 */
export const DAY_MANAGER_TABS = ['overview', 'all', 'locations', 'scenes', 'callTimes', 'crew'] as const;

export type DayManagerTab = (typeof DAY_MANAGER_TABS)[number];

export const DAY_MANAGER_TAB_LABELS: Record<DayManagerTab, string> = {
  all: 'All',
  overview: 'Overview',
  locations: 'Locations',
  scenes: 'Scenes',
  callTimes: 'Call Times',
  crew: 'Crew',
};

export function isDayManagerTab(value: unknown): value is DayManagerTab {
  return typeof value === 'string' && (DAY_MANAGER_TABS as readonly string[]).includes(value);
}
