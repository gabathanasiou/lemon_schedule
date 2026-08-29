import { test, expect } from '@playwright/test';
import { openSeededProject } from './helpers';

/** Production Dates Manager (roadmap 54, MMS-style): prep/prod/post window +
 *  weekly days-off in ONE modal — replaces the old START input + Days Off
 *  button. Days-off apply/save SYNC MMS-style across the SCHEDULED span
 *  (production start → the stripboard's last shooting day; post end only
 *  extends the window): pattern weekdays become Day Off (marked `pattern`),
 *  unchecking a weekday removes ONLY those pattern-created statuses —
 *  hand-made statuses and event cards always survive. The seeded project's
 *  ACTIVE version starts Mon 2026-08-10 with 22 shooting days and every
 *  weekend already statused Aug 1 → Sep 27. */

async function openProdDates(page: import('@playwright/test').Page) {
  // .first() = the header tab (the Calendar sub-tab duplicates the name)
  await page.getByRole('button', { name: 'Calendar' }).first().click();
  await page.getByRole('button', { name: 'Production Dates' }).click();
  await expect(page.getByRole('heading', { name: 'Production Dates' })).toBeVisible();
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

/** Navigates the DateField chrome (popover menu, named after its trigger) to (y, m). */
async function navTo(page: import('@playwright/test').Page, trigger: string, y: number, m: number) {
  const target = `${MONTHS[m - 1]} ${y}`;
  const menu = page.getByRole('menu', { name: trigger });
  let guard = 0;
  while (guard++ < 36) {
    const txt = await menu.textContent();
    const match = txt?.match(/(January|February|March|April|May|June|July|August|September|October|November|December) \d{4}/);
    if (match?.[0] === target) return;
    const cur = match ? new Date(match[0] + ' 1') : new Date();
    if (new Date(y, m - 1, 1) > cur) await page.getByRole('button', { name: 'Next month' }).click();
    else await page.getByRole('button', { name: 'Previous month' }).click();
  }
  throw new Error('navTo guard exceeded');
}

/** Clicks a date field by its current trigger label, navigates, picks a day. */
async function pickDate(page: import('@playwright/test').Page, trigger: string, y: number, m: number, day: number) {
  await page.getByRole('button', { name: trigger, exact: true }).first().click();
  await navTo(page, trigger, y, m);
  await page.getByRole('menu', { name: trigger }).getByRole('button', { name: String(day), exact: true }).click();
}

async function versionSummary(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const s = (window as any).__lemonSchedule;
    const st = s.getState().present;
    const v = st.versions.find((x: any) => x.id === st.activeVersionId);
    return {
      prepStart: v.prepStart || '',
      productionStart: v.productionStart || '',
      postEnd: v.postEnd || '',
      weeklyDaysOff: (v.weeklyDaysOff || []).join(','),
      statuses: (v.nonShootDates || []).map((n: any) => ({ date: n.date, status: n.status, pattern: !!n.pattern })),
    };
  });
}

/** Clears every day status so the weekly pattern is the only skip source. */
async function clearStatuses(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    const s = (window as any).__lemonSchedule;
    const st = s.getState().present;
    const v = st.versions.find((x: any) => x.id === st.activeVersionId);
    s.dispatch({ type: 'UPDATE_VERSION', payload: { id: v.id, nonShootDates: [] } });
  });
}

test('production dates: window + days off modal replaces START/Days Off', async ({ page }) => {
  await openSeededProject(page);

  // Old controls gone, single Production Dates button present
  await expect(page.locator('text=START')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Days Off' })).toHaveCount(0);
  await openProdDates(page);
  await expect(page.getByText('Prep Start', { exact: true })).toBeVisible();
  await expect(page.getByText('Production Start', { exact: true })).toBeVisible();
  await expect(page.getByText('Post End', { exact: true })).toBeVisible();

  // Set the window: prep 2026-07-01, post 2026-09-30 (production start stays
  // the seeded 2026-08-10 — re-picking a pre-filled date would toggle it off)
  await pickDate(page, 'Pick a date', 2026, 7, 1);  // Prep Start (first empty field)
  await pickDate(page, 'Pick a date', 2026, 9, 30); // Post End (only empty field left)
  await page.getByRole('button', { name: 'Save' }).click();

  // Window + pattern persisted; Save ALSO materialized the days off
  // (MMS-style) — the July weekends are new, August's are untouched.
  await expect.poll(async () => {
    const v = await versionSummary(page);
    return `${v.prepStart}|${v.productionStart}|${v.postEnd}|${v.weeklyDaysOff}`;
  }).toBe('2026-07-01|2026-08-10|2026-09-30|5,6');
  const afterSave = await versionSummary(page);
  const dates = afterSave.statuses.filter(s => s.status === 'holiday').map(s => s.date);
  expect(dates).toContain('2026-07-04');  // materialized by SAVE across the window
  expect(dates).toContain('2026-07-26');
  expect(dates).toContain('2026-08-15');  // pre-existing weekend, untouched

  // Calendar range now starts at the prep date (July 2026 visible)
  await expect(page.locator('text=JULY 2026').first()).toBeVisible();

  // Apply Days Off is idempotent: every pattern day in the window is already statused
  await page.getByRole('button', { name: 'Production Dates' }).click();
  await page.getByRole('button', { name: 'Apply Days Off' }).click();
  await expect(page.getByText(/No new days off to add/)).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();

  // Events mode still works after the range change
  await page.getByRole('button', { name: 'Events', exact: true }).click();
  await expect(page.locator('[data-cal-day]').first()).toBeVisible();
});

test('days off apply across the scheduled span without a post end (MMS-style)', async ({ page }) => {
  await openSeededProject(page);
  await clearStatuses(page);

  await openProdDates(page);
  await page.getByRole('button', { name: 'Apply Days Off' }).click();
  await expect(page.getByText(/Marked \d+ days off/)).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();

  const result = await page.evaluate(() => {
    const s = (window as any).__lemonSchedule;
    const st = s.getState().present;
    const v = st.versions.find((x: any) => x.id === st.activeVersionId);
    const holidays = new Set((v.nonShootDates || [])
      .filter((n: any) => n.status === 'holiday').map((n: any) => n.date));
    const rows = s.getRows();
    return {
      start: v.productionStart,
      sectionDates: rows.sections.map((sec: any) => sec.date),
      holidays: [...holidays].sort(),
    };
  });

  // sections[0] is the pinned anchor (stays on the start date); sections[1..]
  // are the production days. Day 1 = Mon Aug 10; day 6 = Mon Aug 17 — the
  // first weekend was skipped by the pattern. No section ever sits on a
  // Saturday or Sunday.
  expect(result.sectionDates[0]).toBe(result.start);
  expect(result.sectionDates[1]).toBe('2026-08-10');
  expect(result.sectionDates[6]).toBe('2026-08-17');
  for (const d of result.sectionDates.slice(1)) {
    const js = new Date(d + 'T00:00:00').getDay();
    expect([0, 6], `section on weekend ${d}`).not.toContain(js);
  }

  // Every Saturday/Sunday between the start and the last scheduled day is off
  const last = result.sectionDates[result.sectionDates.length - 1];
  const cur = new Date(result.start + 'T00:00:00');
  const end = new Date(last + 'T00:00:00');
  const expected: string[] = [];
  while (cur <= end) {
    const js = cur.getDay();
    if (js === 0 || js === 6) {
      const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`;
      expected.push(key);
    }
    cur.setDate(cur.getDate() + 1);
  }
  expect(expected.length).toBeGreaterThan(0);
  for (const d of expected) expect(result.holidays).toContain(d);
});

test('saving the modal alone materializes the days-off pattern', async ({ page }) => {
  await openSeededProject(page);
  await clearStatuses(page);

  await openProdDates(page);
  await page.getByRole('button', { name: 'Save' }).click(); // no Apply click

  const v = await versionSummary(page);
  expect(v.weeklyDaysOff).toBe('5,6');
  const added = v.statuses.filter(s => s.status === 'holiday' && s.date >= v.productionStart);
  expect(added.length).toBeGreaterThan(0);
  expect(added.every(s => s.pattern)).toBe(true);
});

test('unchecking a weekday removes only pattern-created days off (MMS-style)', async ({ page }) => {
  await openSeededProject(page);
  await clearStatuses(page);

  // A hand-made Saturday holiday — the pattern must never touch or remove it
  await page.evaluate(() => {
    const s = (window as any).__lemonSchedule;
    const st = s.getState().present;
    const v = st.versions.find((x: any) => x.id === st.activeVersionId);
    s.dispatch({ type: 'UPDATE_VERSION', payload: {
      id: v.id,
      nonShootDates: [...(v.nonShootDates || []), { date: '2026-08-15', status: 'holiday' }],
    } });
  });

  await openProdDates(page);
  await page.getByRole('button', { name: 'Apply Days Off' }).click();
  await expect(page.getByText(/Marked \d+ days off/)).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();

  // Pattern-created statuses carry the flag; the hand-made Saturday does not
  const afterApply = await versionSummary(page);
  const flagged = afterApply.statuses.filter(s => s.status === 'holiday' && s.pattern);
  expect(flagged.length).toBeGreaterThan(0);
  expect(afterApply.statuses.find(s => s.date === '2026-08-15')?.pattern).toBe(false);

  // Uncheck SATURDAY and save: pattern-created Saturdays are removed,
  // Sundays stay, and the hand-made Saturday survives.
  await page.getByRole('button', { name: 'Production Dates' }).click();
  await page.getByRole('button', { name: 'SAT', exact: true }).click();
  await page.getByRole('button', { name: 'Save' }).click();

  const after = await versionSummary(page);
  expect(after.weeklyDaysOff).toBe('6');
  const holidays = after.statuses.filter(s => s.status === 'holiday').map(s => s.date);
  const isSat = (d: string) => new Date(d + 'T00:00:00').getDay() === 6;
  const isSun = (d: string) => new Date(d + 'T00:00:00').getDay() === 0;
  const sats = holidays.filter(isSat);
  const suns = holidays.filter(isSun);
  expect(sats).toEqual(['2026-08-15']); // hand-made survives, pattern-created gone
  expect(suns.length).toBeGreaterThan(0); // Sundays untouched
});

test('a generated day off cycled through another status stays generated (sticky flag)', async ({ page }) => {
  await openSeededProject(page);
  await clearStatuses(page);
  await openProdDates(page);
  await page.getByRole('button', { name: 'Apply Days Off' }).click();
  await expect(page.getByText(/Marked \d+ days off/)).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();

  const DAY = '2026-08-22'; // a generated Saturday in the span
  const cell = page.locator(`[data-date-key="${DAY}"]`);
  const header = cell.locator('[class*="flex items-center justify-between"]').first();
  const dialog = page.getByRole('dialog');

  // Day Off → Travel via the day modal (rebuilds the entry on save). The
  // day-off header is an aria-disabled drag handle (no section) — force.
  await header.dblclick({ force: true });
  await expect(page.getByText('Day Events —', { exact: false })).toBeVisible();
  await dialog.getByRole('button', { name: 'Day Off', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Travel' }).click();
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByText('Day Events —', { exact: false })).toBeHidden();

  // Travel → Day Off again
  await header.dblclick({ force: true });
  await expect(page.getByText('Day Events —', { exact: false })).toBeVisible();
  await dialog.getByRole('button', { name: 'Travel', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Day Off' }).click();
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByText('Day Events —', { exact: false })).toBeHidden();

  // the generated flag survived the round trip
  const flag = await page.evaluate((d) => {
    const s = (window as any).__lemonSchedule;
    const st = s.getState().present;
    const v = st.versions.find((x: any) => x.id === st.activeVersionId);
    const n = (v.nonShootDates || []).find((x: any) => x.date === d);
    return { status: n?.status, pattern: !!n?.pattern };
  }, DAY);
  expect(flag).toEqual({ status: 'holiday', pattern: true });

  // so unchecking Saturday still undoes it
  await openProdDates(page);
  await page.getByRole('button', { name: 'SAT', exact: true }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  const after = await versionSummary(page);
  expect(after.statuses.some(s => s.date === DAY && s.status === 'holiday')).toBe(false);
  expect(after.statuses.some(s => s.date === '2026-08-23' && s.status === 'holiday')).toBe(true);
});
