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
  // via the date buttons that spawn the calendar chrome panel (portaled to the
  // page root — never scoped to the modal).
  const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const targetKey = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}`;
  const now = new Date();
  const navTo = async (key: string) => {
    let cur = monthKey(now);
    const target = targetKey(parseInt(key.slice(0, 4), 10), parseInt(key.slice(5, 7), 10));
    let guard = 0;
    while (cur !== target && guard++ < 24) {
      if (cur < target) await page.getByRole('button', { name: 'Next month' }).first().click();
      else await page.getByRole('button', { name: 'Previous month' }).first().click();
      cur = monthKey(new Date(parseInt(cur.slice(0, 4), 10), parseInt(cur.slice(5, 7), 10) - 1 + (cur < target ? 1 : -1), 1));
    }
  };
  // Each Production Window row: label + its DateField chip (stable regardless
  // of the current label text).
  const rowFor = (label: string) =>
    page.locator('div.flex.items-center.justify-between', { hasText: label }).first();
  const chipIn = (label: string) => rowFor(label).locator('button[type="button"]').first();
  const pickDate = async (label: string, y: number, m: number, day: number) => {
    await chipIn(label).click();
    await navTo(targetKey(y, m));
    await page.getByRole('button', { name: String(day), exact: true }).first().click();
  };
  await pickDate('Prep Start', 2026, 7, 1);
  await pickDate('Production Start', 2026, 8, 10);
  await pickDate('Post End', 2026, 9, 30);
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
