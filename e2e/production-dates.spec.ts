import { test, expect } from '@playwright/test';
import { openSeededProject, activeCalendar, seedDayDates, waitForOverlaySettle } from './helpers';

/** Production Dates Manager (roadmap 54, MMS-style): prep/prod/post window +
 *  weekly days-off in ONE modal — replaces the old START input + Days Off
 *  button. Days-off apply/save SYNC MMS-style across the SCHEDULED span
 *  (production start → the stripboard's last shooting day; post end only
 *  extends the window): pattern weekdays become Day Off (marked `pattern`),
 *  unchecking a weekday removes ONLY those pattern-created statuses —
 *  hand-made statuses and event cards always survive. All dates are derived
 *  from the seed's active calendar version (seed-agnostic). */

async function openProdDates(page: import('@playwright/test').Page) {
  // .first() = the header tab (the Calendar sub-tab duplicates the name)
  await page.getByRole('button', { name: 'Calendar' }).first().click();
  await page.getByRole('button', { name: 'Production Dates' }).click();
  await expect(page.getByRole('heading', { name: 'Production Dates' })).toBeVisible();
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

const pad = (n: number) => String(n).padStart(2, '0');
const dateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (iso: string, n: number) => {
  const [y, m, d] = iso.split('-').map(Number);
  return dateKey(new Date(y, m - 1, d + n));
};

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
    // Scope the month-nav to THIS menu — a previously-closed picker's menu can
    // still be mounted mid close-morph (data-state="open"), and an unfiltered
    // "Next month" locator would then hit a strict-mode violation.
    if (new Date(y, m - 1, 1) > cur) await menu.getByRole('button', { name: 'Next month' }).click();
    else await menu.getByRole('button', { name: 'Previous month' }).click();
  }
  throw new Error('navTo guard exceeded');
}

/** Clicks a date field by its current trigger label, navigates, picks a day. */
async function pickDate(page: import('@playwright/test').Page, trigger: string, y: number, m: number, day: number) {
  await page.getByRole('button', { name: trigger, exact: true }).first().click();
  // Wait for the previous picker's close morph to finish + this one to settle
  // (only one menu must be open; the morph is ~220ms scale+fade).
  await waitForOverlaySettle(page);
  await navTo(page, trigger, y, m);
  await page.getByRole('menu', { name: trigger }).getByRole('button', { name: String(day), exact: true }).click();
}

async function versionSummary(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const s = (window as any).__lemonSchedule;
    const st = s.getState().present;
    const cal = (st.calendarVersions || []).find((c: any) => c.id === st.activeCalendarVersionId) || (st.calendarVersions || [])[0];
    return {
      prepStart: cal.prepStart || '',
      productionStart: cal.productionStart || '',
      postEnd: cal.postEnd || '',
      weeklyDaysOff: (cal.weeklyDaysOff || []).join(','),
      statuses: (cal.nonShootDates || []).map((n: any) => ({ date: n.date, status: n.status, pattern: !!n.pattern })),
    };
  });
}

/** Clears every day status so the weekly pattern is the only skip source. */
async function clearStatuses(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    const s = (window as any).__lemonSchedule;
    const st = s.getState().present;
    const cal = (st.calendarVersions || []).find((c: any) => c.id === st.activeCalendarVersionId) || (st.calendarVersions || [])[0];
    s.dispatch({ type: 'UPDATE_CALENDAR_VERSION', payload: { id: cal.id, nonShootDates: [] } });
  });
}

test('production dates: window + days off modal replaces START/Days Off', async ({ page }) => {
  await openSeededProject(page);
  const cal = await activeCalendar(page);
  const prodStart = cal.productionStart;
  const weekly = cal.weeklyDaysOff || [5, 6];
  const days = await seedDayDates(page);
  const lastSection = days[days.length - 1];
  const [pY, pM] = prodStart.split('-').map(Number);
  const prepY = pM === 1 ? pY - 1 : pY;
  const prepM = pM === 1 ? 12 : pM - 1;
  const prep = `${prepY}-${pad(prepM)}-01`;
  const post = addDays(lastSection, 21);

  // Old controls gone, single Production Dates button present
  await expect(page.locator('text=START')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Days Off' })).toHaveCount(0);
  await openProdDates(page);
  await expect(page.getByText('Prep Start', { exact: true })).toBeVisible();
  await expect(page.getByText('Production Start', { exact: true })).toBeVisible();
  await expect(page.getByText('Post End', { exact: true })).toBeVisible();

  // Set the window (production start stays the seeded value — re-picking a
  // pre-filled date would toggle it off)
  const [postY, postM, postD] = post.split('-').map(Number);
  const [prepY2, prepM2] = prep.split('-').map(Number);
  await pickDate(page, 'Pick a date', prepY2, prepM2, 1);   // Prep Start (first empty field)
  await pickDate(page, 'Pick a date', postY, postM, postD); // Post End (only empty field left)
  await page.getByRole('button', { name: 'Save' }).click();

  // Window + pattern persisted; Save ALSO materialized the days off
  // (MMS-style) — the prep-month weekends are new, the seed's are untouched.
  await expect.poll(async () => {
    const v = await versionSummary(page);
    return `${v.prepStart}|${v.productionStart}|${v.postEnd}|${v.weeklyDaysOff}`;
  }).toBe(`${prep}|${prodStart}|${post}|${weekly.join(',')}`);
  const afterSave = await versionSummary(page);
  const dates = afterSave.statuses.filter(s => s.status === 'holiday').map(s => s.date);
  // The first prep-month Saturday was materialized by SAVE across the window
  const firstPrepSat = dateKey(new Date(prepY2, prepM2 - 1, 1 + ((6 - new Date(prepY2, prepM2 - 1, 1).getDay() + 7) % 7)));
  expect(dates).toContain(firstPrepSat);
  expect(dates).toContain(prodStart); // pre-existing statused weekend, untouched

  // Calendar range now starts at the prep date (the prep month is visible)
  await expect(page.locator(`text=${MONTHS[prepM2 - 1].toUpperCase()} ${prepY2}`).first()).toBeVisible();

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
  const cal = await activeCalendar(page);
  const prodStart = cal.productionStart;
  const weekly: number[] = cal.weeklyDaysOff || [5, 6];
  await clearStatuses(page);

  await openProdDates(page);
  await page.getByRole('button', { name: 'Apply Days Off' }).click();
  await expect(page.getByText(/Marked \d+ days off/)).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();

  const result = await page.evaluate(() => {
    const s = (window as any).__lemonSchedule;
    const st = s.getState().present;
    const cal = (st.calendarVersions || []).find((c: any) => c.id === st.activeCalendarVersionId) || (st.calendarVersions || [])[0];
    const holidays = new Set((cal.nonShootDates || [])
      .filter((n: any) => n.status === 'holiday').map((n: any) => n.date));
    const rows = s.getRows();
    return {
      start: cal.productionStart,
      sectionDates: rows.sections.map((sec: any) => sec.date),
      holidays: [...holidays].sort(),
    };
  });

  // sections[0] is the pinned anchor — it sits on the first working date at
  // or after productionStart (the cursor skips statused day-off weekdays);
  // sections[1..] are the production days. No section ever sits on a day-off
  // weekday. (weeklyDaysOff uses Mon=0; JS getDay uses Sun=0 — translate.)
  const offDow = weekly.map(d => (d + 1) % 7);
  {
    const anchor = new Date(result.start + 'T00:00:00');
    while (offDow.includes(anchor.getDay())) anchor.setDate(anchor.getDate() + 1);
    expect(result.sectionDates[0]).toBe(dateKey(anchor));
  }
  for (const d of result.sectionDates.slice(1)) {
    const jsDow = new Date(d + 'T00:00:00').getDay();
    expect(offDow, `section on day-off weekday ${d}`).not.toContain(jsDow);
  }

  // Every day-off weekday between the start and the last scheduled day is off
  const last = result.sectionDates[result.sectionDates.length - 1];
  const expected: string[] = [];
  const cur = new Date(result.start + 'T00:00:00');
  const end = new Date(last + 'T00:00:00');
  while (cur <= end) {
    if (offDow.includes(cur.getDay())) expected.push(dateKey(cur));
    cur.setDate(cur.getDate() + 1);
  }
  expect(expected.length).toBeGreaterThan(0);
  for (const d of expected) expect(result.holidays).toContain(d);
});

test('saving the modal alone materializes the days-off pattern', async ({ page }) => {
  await openSeededProject(page);
  const cal = await activeCalendar(page);
  const prodStart = cal.productionStart;
  const weekly = cal.weeklyDaysOff || [5, 6];
  await clearStatuses(page);

  await openProdDates(page);
  await page.getByRole('button', { name: 'Save' }).click(); // no Apply click

  const v = await versionSummary(page);
  expect(v.weeklyDaysOff).toBe(weekly.join(','));
  const added = v.statuses.filter(s => s.status === 'holiday' && s.date >= prodStart);
  expect(added.length).toBeGreaterThan(0);
  expect(added.every(s => s.pattern)).toBe(true);
});

test('unchecking a weekday removes only pattern-created days off (MMS-style)', async ({ page }) => {
  await openSeededProject(page);
  const cal = await activeCalendar(page);
  const prodStart = cal.productionStart;
  const weekly: number[] = cal.weeklyDaysOff || [5, 6];
  await clearStatuses(page);

  // A hand-made day-off on the first calendar day after the start — the
  // pattern must never touch or remove it. Translate JS getDay (Sun=0) to the
  // app's weekday (Mon=0): appDow = (jsDow - 1 + 7) % 7.
  const handMade = addDays(prodStart, 1);
  const handMadeJsDow = new Date(handMade + 'T00:00:00').getDay();
  const handMadeDow = (handMadeJsDow - 1 + 7) % 7;
  await page.evaluate(({ date }) => {
    const s = (window as any).__lemonSchedule;
    const st = s.getState().present;
    const cal = (st.calendarVersions || []).find((c: any) => c.id === st.activeCalendarVersionId) || (st.calendarVersions || [])[0];
    s.dispatch({ type: 'UPDATE_CALENDAR_VERSION', payload: {
      id: cal.id,
      nonShootDates: [...(cal.nonShootDates || []), { date, status: 'holiday' }],
    } });
  }, { date: handMade });

  await openProdDates(page);
  await page.getByRole('button', { name: 'Apply Days Off' }).click();
  await expect(page.getByText(/Marked \d+ days off/)).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();

  // Pattern-created statuses carry the flag; the hand-made one does not
  const afterApply = await versionSummary(page);
  const flagged = afterApply.statuses.filter(s => s.status === 'holiday' && s.pattern);
  expect(flagged.length).toBeGreaterThan(0);
  expect(afterApply.statuses.find(s => s.date === handMade)?.pattern).toBe(false);

  // Uncheck the day-off weekday the hand-made falls on and save: pattern-
  // created ones of that weekday are removed, the other weekday stays, and
  // the hand-made day survives.
  const WEEKDAY_LABELS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
  const dayLabel = WEEKDAY_LABELS[handMadeDow];
  const other = weekly.find(d => d !== handMadeDow)!;
  await page.getByRole('button', { name: 'Production Dates' }).click();
  await page.getByRole('button', { name: dayLabel, exact: true }).click();
  await page.getByRole('button', { name: 'Save' }).click();

  const after = await versionSummary(page);
  expect(after.weeklyDaysOff).toBe(String(other));
  const holidays = after.statuses.filter(s => s.status === 'holiday').map(s => s.date);
  const isDow = (d: string, appDow: number) => (new Date(d + 'T00:00:00').getDay() - 1 + 7) % 7 === appDow;
  const made = holidays.filter(d => isDow(d, handMadeDow));   // hand-made weekday: only the hand-made survives
  const kept = holidays.filter(d => isDow(d, other));          // other weekday: pattern-created stay
  expect(made).toEqual([handMade]);
  expect(kept.length).toBeGreaterThan(0);
});

test('a generated day off cycled through another status stays generated (sticky flag)', async ({ page }) => {
  await openSeededProject(page);
  const cal = await activeCalendar(page);
  const prodStart = cal.productionStart;
  await clearStatuses(page);
  await openProdDates(page);
  await page.getByRole('button', { name: 'Apply Days Off' }).click();
  await expect(page.getByText(/Marked \d+ days off/)).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();

  const DAY = await page.evaluate((start) => {
    const [y, m, d] = start.split('-').map(Number);
    const cur = new Date(y, m - 1, d + 1);
    while (cur.getDay() !== 6) cur.setDate(cur.getDate() + 1);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${cur.getFullYear()}-${pad(cur.getMonth() + 1)}-${pad(cur.getDate())}`;
  }, prodStart);
  const cell = page.locator(`[data-date-key="${DAY}"]`);
  await expect(cell).toBeVisible();
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
    const cal = (st.calendarVersions || []).find((c: any) => c.id === st.activeCalendarVersionId) || (st.calendarVersions || [])[0];
    const n = (cal.nonShootDates || []).find((x: any) => x.date === d);
    return { status: n?.status, pattern: !!n?.pattern };
  }, DAY);
  expect(flag).toEqual({ status: 'holiday', pattern: true });

  // so unchecking Saturday still undoes it
  await openProdDates(page);
  await page.getByRole('button', { name: 'SAT', exact: true }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  const after = await versionSummary(page);
  expect(after.statuses.some(s => s.date === DAY && s.status === 'holiday')).toBe(false);
  const sunday = addDays(DAY, 1);
  expect(after.statuses.some(s => s.date === sunday && s.status === 'holiday')).toBe(true);
});
