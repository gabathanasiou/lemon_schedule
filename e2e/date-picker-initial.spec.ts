import { test, expect } from '@playwright/test';
import { openSeededProject, waitForOverlaySettle } from './helpers';

/** Date picker open month (roadmap 68): the picker seeds its visible month on
 *  mount from the field's picked date, else the active calendar version's
 *  production start, else real today. Exercised through the Production Dates
 *  modal (one surface, all three cases): each of the three date rows opens
 *  its DateField chrome panel (kit DropdownMenu + kit DatePicker). */

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];
const monthLabel = (y: number, m: number) => `${MONTHS[m - 1]} ${y}`;

async function openProdDates(page: import('@playwright/test').Page) {
  // .first() = the header tab (the Calendar sub-tab duplicates the name)
  await page.getByRole('button', { name: 'Calendar' }).first().click();
  await page.getByRole('button', { name: 'Production Dates' }).click();
  await expect(page.getByRole('heading', { name: 'Production Dates' })).toBeVisible();
}

async function setCalendarVersion(page: import('@playwright/test').Page, patch: Record<string, string>) {
  await page.evaluate((p) => {
    const s = (window as any).__lemonSchedule;
    const st = s.getState().present;
    const id = st.activeCalendarVersionId || st.calendarVersions[0].id;
    s.dispatch({ type: 'UPDATE_CALENDAR_VERSION', payload: { id, ...p } });
  }, patch);
}

/** The date-trigger button inside the Production Dates row for `label`. */
function fieldTrigger(page: import('@playwright/test').Page, label: string) {
  return page
    .getByRole('dialog')
    .locator('div.flex.items-center.justify-between.py-1')
    .filter({ has: page.getByText(label, { exact: true }) })
    .getByRole('button')
    .first();
}

async function openPicker(page: import('@playwright/test').Page, label: string) {
  await fieldTrigger(page, label).click();
  // The picker menu morphs open (~220ms) and a previously-Escaped picker can
  // still be unmounting — wait for overlays to settle so exactly one menu is
  // open (unfiltered getByRole('menu') would hit a strict-mode violation).
  await waitForOverlaySettle(page);
  await expect(page.getByRole('menu')).toBeVisible();
}

test('opens on the picked date, else the production start', async ({ page }) => {
  await openSeededProject(page);
  await setCalendarVersion(page, { productionStart: '2026-08-10', prepStart: '', postEnd: '' });
  await openProdDates(page);

  // Production Start holds a date → the panel opens on August 2026 (not today).
  await openPicker(page, 'Production Start');
  await expect(page.getByRole('button', { name: 'Select year and month' })).toHaveText('August 2026');
  await page.keyboard.press('Escape');

  // Post End is EMPTY → falls back to the production start month.
  await openPicker(page, 'Post End');
  await expect(page.getByRole('button', { name: 'Select year and month' })).toHaveText('August 2026');
});

test('no production start → opens on real today', async ({ page }) => {
  await openSeededProject(page);
  await setCalendarVersion(page, { productionStart: '', prepStart: '', postEnd: '' });
  await openProdDates(page);

  const today = new Date();
  await openPicker(page, 'Production Start');
  await expect(page.getByRole('button', { name: 'Select year and month' })).toHaveText(
    monthLabel(today.getFullYear(), today.getMonth() + 1),
  );
});
