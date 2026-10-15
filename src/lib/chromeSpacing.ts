/**
 * ONE spacing scale for every chrome bar (roadmap 264) — the app header,
 * every `PageToolbar` mini tab bar (each tab's sub-tabs, popout frames, the
 * dark Call Sheet variant) and the popout `VersionToolbar` all read these
 * constants, so the edge rails line up and the rhythm never drifts.
 *
 * The rule: **16 outside, 8 inside** — a bar's outer inset (the edge rail)
 * and the gap between clusters both read 16px; items inside one cluster sit
 * 8px apart. Tab strips keep their tighter 4px rhythm (joined pills).
 * A control whose own padding would push its content inward hangs a negative
 * margin equal to that padding (the File trigger recipe, roadmap 247): the
 * hover box extends into the margin while the label lands on the rail.
 * A deliberately overlapping stack (presence bubbles) opts out of the gap
 * check with `data-chrome-skip`.
 *
 * `auditChrome()` (`src/lib/chromeAudit.ts`, exposed on the debug bridge)
 * checks the rendered geometry against these numbers and the seeded smoke
 * spec asserts a clean audit — a new toolbar item that breaks the scale
 * fails a test instead of shipping.
 *
 * MUST NOT: hand-copy an inset/gap into the icon-dock math — `AppHeader`
 * `syncTabLayout` and `PageToolbar.syncTabsDock` derive from the *_PX values
 * below. Change the scale HERE, never in a bar.
 */

/** Edge rail — every bar's outer horizontal inset. */
export const CHROME_BAR_INSET = 'px-4';
/** Between clusters inside a bar. */
export const CHROME_CLUSTER_GAP = 'gap-4';
/** The cluster gap as a margin — for a cluster whose neighbours are spaced by
 *  their parent's item gap instead (the header's identity cluster). */
export const CHROME_CLUSTER_MARGIN = 'ml-4';
/** Inside one cluster. */
export const CHROME_ITEM_GAP = 'gap-2';
/** Tab strips are joined pills — their own tighter rhythm. */
export const CHROME_TAB_GAP = 'gap-1';

/** Tailwind's spacing unit is 0.25rem = 4px and the app never changes it. */
const UNIT_PX = 4;
const px = (cls: string) => Number(cls.slice(cls.indexOf('-') + 1)) * UNIT_PX;

/** Pixel twins for measurement code (dock math, the chrome audit) — never rendered. */
export const CHROME_BAR_INSET_PX = px(CHROME_BAR_INSET);
export const CHROME_CLUSTER_GAP_PX = px(CHROME_CLUSTER_GAP);
export const CHROME_ITEM_GAP_PX = px(CHROME_ITEM_GAP);
export const CHROME_TAB_GAP_PX = px(CHROME_TAB_GAP);
