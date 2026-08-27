import { test, expect } from '@playwright/test';
import { openSeededProject } from './helpers';

/** Production Dates Manager (roadmap 54): MMS-style prep/prod/post window +
 *  weekly days-off in ONE modal — replaces the old START input + Days Off
 *  button. Days-off apply materializes holidays without touching existing
 *  statuses; the calendar range spans the window. */
test('production dates: window + days off modal replaces START/Days Off', async ({ page }) => {
  await openSeededProject(page);
  await page.getByRole('button', { name: 'Calendar' }).click();
  await expect(page.locator('[data-date-key="2026-08-10"]')).toBeVisible();

  // Old controls gone, single Production Dates button present
  await expect(page.locator('text=START')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Days Off' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Production Dates' }).click();
  await expect(page.getByRole('heading', { name: 'Production Dates' })).toBeVisible();
  await expect(page.getByText('Prep Start', { exact: true })).toBeVisible();
  await expect(page.getByText('Production Start', { exact: true })).toBeVisible();
  await expect(page.getByText('Post End', { exact: true })).toBeVisible();

  // Set the window: prep 2026-07-01, prod 2026-08-10 (existing), post 2026-09-30
  const dateInputs = page.locator('input[type="date"]');
  await dateInputs.nth(0).fill('2026-07-01');
  await dateInputs.nth(1).fill('2026-08-10');
  await dateInputs.nth(2).fill('2026-09-30');
  await page.getByRole('button', { name: 'Save' }).click();

  // Version persisted via the bridge
  await expect.poll(() => page.evaluate(() => {
    const s = (window as any).__lemonSchedule;
    const st = s.getState().present;
    const v = st.versions.find((x: any) => x.id === st.activeVersionId);
    return `${v.prepStart}|${v.productionStart}|${v.postEnd}|${(v.weeklyDaysOff || []).join(',')}`;
  })).toBe('2026-07-01|2026-08-10|2026-09-30|5,6');

  // Calendar range now starts at the prep date (July 2026 visible)
  await expect(page.locator('text=JULY 2026').first()).toBeVisible();

  // Apply days off: Sat/Sun pattern over the window → July 4/5 (weekend) become holidays,
  // pre-existing statuses (e.g. the seed's 2026-08-15 holiday) untouched.
  await page.getByRole('button', { name: 'Production Dates' }).click();
  await page.getByRole('button', { name: 'Apply Days Off' }).click();
  await expect(page.getByText(/Marked \d+ days off/)).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();

  const holidays = await page.evaluate(() => {
    const s = (window as any).__lemonSchedule;
    const st = s.getState().present;
    const v = st.versions.find((x: any) => x.id === st.activeVersionId);
    return (v.nonShootDates || [])
      .filter((n: any) => n.status === 'holiday' && n.date >= '2026-07-01' && n.date <= '2026-09-30')
      .map((n: any) => n.date)
      .sort();
  });
  // July 4/5 2026 = Sat/Sun — added by the apply
  expect(holidays).toContain('2026-07-04');
  expect(holidays).toContain('2026-07-05');
  // seed weekend statuses still present (08-15, 08-16, ...)
  expect(holidays).toContain('2026-08-15');
  expect(holidays).toContain('2026-08-16');

  // Events mode still works after the range change
  await page.getByRole('button', { name: 'Events', exact: true }).click();
  await expect(page.locator('[data-cal-day]').first()).toBeVisible();
});
