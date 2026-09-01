import { test, expect } from '@playwright/test';
import { openSeededProject, seedTitle, waitForOverlaySettle } from './helpers';

/** WebKit quirk: clicking a fixed kit-menu item over a deep-scrolled virtualized
 *  calendar grid can miss (Playwright's hit-test finds the grid underneath even
 *  though the menu is the painted top layer). A DOM click on the item is
 *  semantically identical — the menu IS on top and the item IS the target. */
async function clickMenuButton(page: import('@playwright/test').Page, name: string) {
  await page.getByRole('button', { name, exact: true }).evaluate((el) => (el as HTMLElement).click());
}

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

  // The grid virtualizes months — scroll to the bottom so the richest day's
  // cell mounts (its month may be beyond the initial viewport).
  await page.locator('[data-cal-grid]').evaluate(el => { el.scrollTop = el.scrollHeight; });
  const cell = page.locator(`[data-date-key="${richDate}"]`).first();
  await expect(cell).toBeVisible();

  const height = async () => (await cell.boundingBox())!.height;

  // Default = expanded: the cell grows past the fixed 170px.
  const expandedH = await height();
  expect(expandedH).toBeGreaterThan(170);

  // View menu → Expand Day Cells (on) → off: fixed 170px rows.
  await page.getByRole('button', { name: 'View' }).click();
  // The menu morphs open (~220ms) — a mid-morph item is at a transformed
  // position and the click can land on whatever is underneath it.
  await waitForOverlaySettle(page);
  await clickMenuButton(page, 'Expand Day Cells');
  await page.keyboard.press('Escape');
  await expect.poll(height).toBe(170);

  // Toggle back on: expands again, and the pref persisted.
  await page.getByRole('button', { name: 'View' }).click();
  await waitForOverlaySettle(page);
  await clickMenuButton(page, 'Expand Day Cells');
  await page.keyboard.press('Escape');
  await expect.poll(height).toBeGreaterThan(170);

  await page.reload();
  await page.getByText(seedTitle(), { exact: true }).first().click();
  await page.getByRole('button', { name: 'Calendar' }).click();
  await page.getByRole('button', { name: 'View' }).click();
  await waitForOverlaySettle(page);
  await expect(page.getByRole('button', { name: 'Expand Day Cells' })).toBeVisible();
  await page.keyboard.press('Escape');
  const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('lemon_schedule_calendar_view') || '{}').expandDays);
  expect(persisted).toBe(true);
});
