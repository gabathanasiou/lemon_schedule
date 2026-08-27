import { test, expect } from '@playwright/test';
import { openSeededProject } from './helpers';

/** Calendar View prefs: "Expand Day Cells" (default ON) sizes strips-mode day
 *  cells to their content; turning it off returns the fixed 170px rows. */
test('calendar view: day cells expand by default; Expand Day Cells toggle restores fixed height', async ({ page }) => {
  await openSeededProject(page);
  await page.getByRole('button', { name: 'Calendar' }).click();

  // Pick the section with the most strips — its cell is the tallest.
  const richDate = await page.evaluate(() => {
    const rows = (window as any).__lemonSchedule.getRows();
    const secs = (rows?.sections || []).filter((s: any) => !s.isPinned);
    let best: any = null;
    for (const s of secs) {
      if (s.rows.length > (best?.rows.length ?? 0)) best = s;
    }
    return best ? best.date : '';
  });
  expect(richDate).toBeTruthy();

  const cell = page.locator(`[data-date-key="${richDate}"]`).first();
  await expect(cell).toBeVisible();

  const height = async () => (await cell.boundingBox())!.height;

  // Default = expanded: the cell grows past the fixed 170px.
  const expandedH = await height();
  expect(expandedH).toBeGreaterThan(170);

  // View menu → Expand Day Cells (on) → off: fixed 170px rows.
  await page.getByRole('button', { name: 'View' }).click();
  await page.getByRole('button', { name: 'Expand Day Cells' }).click();
  await page.keyboard.press('Escape');
  await expect.poll(height).toBe(170);

  // Toggle back on: expands again, and the pref persisted.
  await page.getByRole('button', { name: 'View' }).click();
  await page.getByRole('button', { name: 'Expand Day Cells' }).click();
  await page.keyboard.press('Escape');
  await expect.poll(height).toBeGreaterThan(170);

  await page.reload();
  await page.getByText('Town - Jason', { exact: true }).first().click();
  await page.getByRole('button', { name: 'Calendar' }).click();
  await page.getByRole('button', { name: 'View' }).click();
  await expect(page.getByRole('button', { name: 'Expand Day Cells' })).toBeVisible();
  await page.keyboard.press('Escape');
  const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('lemon_schedule_calendar_view') || '{}').expandDays);
  expect(persisted).toBe(true);
});
