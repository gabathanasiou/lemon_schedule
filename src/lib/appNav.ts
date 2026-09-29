/**
 * App navigation places (roadmap 176): tabs + sub-tabs are addressable places
 * with hash routes (`#/production/days`) and a browser-history stack, so the
 * browser back/forward buttons (and the header's `< previous place` button)
 * undo app navigation like iOS screen transitions.
 *
 * Pure model only — App.tsx owns the React state and the `history` wiring.
 * The stack rides in `history.state`, so back labels survive a reload; targets
 * (scene/day/sheet jumps) travel in the entry but NOT in the hash — a reload
 * restores the place, not the one-shot target.
 */

export type AppTabId = 'breakdown' | 'schedule' | 'calendar' | 'design' | 'rules' | 'production' | 'reports';

export interface AppPlace {
  tab: AppTabId;
  /** Sub-tab id within the tab (see SUB_TAB_LABELS). */
  sub?: string;
  /** Sub-sub level for mode-bearing sub-tabs (SUB_MODES): the Days
   *  Day Manager/Call Sheet, the Crew/Locations manager/Glide views. */
  mode?: string;
  /** Schedule jump: reveal this scene (one-shot target). */
  sceneId?: string;
  /** Sheet jump: open at this sheet index (one-shot target). */
  sheetIndex?: number;
  /** Day Manager jump: this section index (one-shot target). */
  daySection?: number;
}

export interface NavStack {
  stack: AppPlace[];
  index: number;
}

export const TAB_LABELS: Record<AppTabId, string> = {
  breakdown: 'Breakdown',
  schedule: 'Schedule',
  calendar: 'Calendar',
  design: 'Design',
  rules: 'Rules',
  production: 'Production',
  reports: 'Reports',
};

/** Sub-tab id → label, per tab. Also the parse allow-list. */
export const SUB_TAB_LABELS: Partial<Record<AppTabId, Record<string, string>>> = {
  breakdown: { sheet: 'Sheet', script: 'Script', elements: 'Element Manager', glide: 'Glide Breakdown' },
  calendar: { calendar: 'Calendar', dayTypes: 'Day Types' },
  design: { ribbons: 'Ribbon Designer', colors: 'Colors', designer: 'Reports Designer' },
  reports: { doods: 'Day Out of Days', elementBreakdown: 'Element Breakdown' },
  production: { days: 'Day Manager', crew: 'Crew', locations: 'Locations' },
};

/** Sub-sub modes per `tab/sub` — the first entry is the default. */
export const SUB_MODES: Record<string, readonly string[]> = {
  'production/days': ['manager', 'callsheet'],
  'production/crew': ['manager', 'glide'],
  'production/locations': ['manager', 'glide'],
};

/** Place label per `tab/sub/mode` (falls back to the sub-tab label). */
const MODE_LABELS: Record<string, string> = {
  'production/days/manager': 'Day Manager',
  'production/days/callsheet': 'Call Sheet',
  'production/crew/manager': 'Crew',
  'production/crew/glide': 'Crew Glide',
  'production/locations/manager': 'Locations',
  'production/locations/glide': 'Locations Glide',
};

const TAB_IDS = Object.keys(TAB_LABELS) as AppTabId[];

export function isAppTabId(value: unknown): value is AppTabId {
  return typeof value === 'string' && TAB_IDS.includes(value as AppTabId);
}

/** The mode-bearing key for a place ('production/crew'), or null. */
function modeKey(place: AppPlace): string | null {
  const key = place.sub ? `${place.tab}/${place.sub}` : '';
  return key && SUB_MODES[key] ? key : null;
}

/** The effective sub-sub mode; places without one mean the default (manager). */
export function modeOf(place: AppPlace): string | null {
  const key = modeKey(place);
  if (!key) return null;
  const modes = SUB_MODES[key];
  return place.mode && modes.includes(place.mode) ? place.mode : modes[0];
}

/** Places are the same when tab + sub (+ the sub-sub mode) match; one-shot
 *  targets are not part of identity (re-clicking the active tab must not push
 *  a duplicate entry). */
export function samePlace(a: AppPlace, b: AppPlace): boolean {
  return a.tab === b.tab && (a.sub ?? null) === (b.sub ?? null) && modeOf(a) === modeOf(b);
}
export function initStack(place: AppPlace): NavStack {
  return { stack: [place], index: 0 };
}

/** Pushes a place, truncating any forward history and de-duping the current entry. */
export function pushPlace(nav: NavStack, place: AppPlace): NavStack {
  const current = nav.stack[nav.index];
  if (current && samePlace(current, place)) {
    // Same screen: swap the entry in place (its target may have changed).
    const stack = nav.stack.slice();
    stack[nav.index] = place;
    return { stack, index: nav.index };
  }
  const stack = [...nav.stack.slice(0, nav.index + 1), place];
  return { stack, index: stack.length - 1 };
}

export function currentPlace(nav: NavStack): AppPlace {
  return nav.stack[nav.index];
}

export function previousPlace(nav: NavStack): AppPlace | null {
  return nav.index > 0 ? nav.stack[nav.index - 1] : null;
}

/** Place label: the sub-sub mode when known ("Call Sheet", "Crew Glide"),
 *  else the sub-tab label, else the tab. */
export function placeLabel(place: AppPlace): string {
  const key = modeKey(place);
  const mode = modeOf(place);
  if (key && mode && MODE_LABELS[`${key}/${mode}`]) return MODE_LABELS[`${key}/${mode}`];
  const sub = place.sub ? SUB_TAB_LABELS[place.tab]?.[place.sub] : undefined;
  return sub || TAB_LABELS[place.tab];
}

/** Hash route path without the leading `#/` — e.g. "production/days/callsheet"
 *  (the default manager mode is omitted). */
export function placeToHash(place: AppPlace): string {
  const sub = place.sub && SUB_TAB_LABELS[place.tab]?.[place.sub] ? `/${place.sub}` : '';
  const mode = modeOf(place);
  const modeSegment = mode && mode !== 'manager' ? `/${mode}` : '';
  return `${place.tab}${sub}${modeSegment}`;
}

/** Parses `#/production/days/callsheet` (or "production/crew/glide") back to a
 *  place; invalid tabs/subs/modes are ignored rather than trusted. */
export function parsePlaceHash(hash: string): AppPlace | null {
  const path = hash.replace(/^#\/?/, '').replace(/\/+$/, '');
  if (!path) return null;
  const [tab, sub, mode] = path.split('/').map(part => decodeURIComponent(part || ''));
  if (!isAppTabId(tab)) return null;
  const place: AppPlace = { tab };
  if (sub && SUB_TAB_LABELS[tab]?.[sub]) place.sub = sub;
  const key = place.sub ? `${tab}/${place.sub}` : '';
  if (place.sub && mode && (SUB_MODES[key] || []).includes(mode)) place.mode = mode;
  return place;
}

/** True when `value` looks like a NavStack persisted in `history.state`. */
export function isNavStack(value: unknown): value is NavStack {
  if (!value || typeof value !== 'object') return false;
  const nav = value as NavStack;
  return Array.isArray(nav.stack) && nav.stack.length > 0 &&
    typeof nav.index === 'number' && nav.index >= 0 && nav.index < nav.stack.length &&
    nav.stack.every(p => !!p && isAppTabId((p as AppPlace).tab) &&
      ((p as AppPlace).mode === undefined || typeof (p as AppPlace).mode === 'string'));
}
