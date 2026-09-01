import { test, expect } from '@playwright/test';
import { openSeededProject, seedDayDates } from './helpers';

/** Regression coverage for the calendar-height work: day cells + the grid
 *  must size to their content and re-size on every mutation (add/drop/cut),
 *  in BOTH calendar modes. The month virtualization was removed so months
 *  always render at real heights. */

async function measureEventsDay(page: import('@playwright/test').Page, key: string) {
  return page.evaluate((k) => {
    const grid = document.querySelector('[data-cal-grid]') as HTMLElement | null;
    const day = grid?.querySelector(`[data-cal-day][data-date-key="${k}"]`) as HTMLElement | null;
    return {
      scrollH: grid ? grid.scrollHeight : null,
      dayH: day ? day.offsetHeight : null,
      cards: day ? day.querySelectorAll('[data-event-key]').length : null,
    };
  }, key);
}

test('events mode: day cell + grid grow live when many cards are added via the adder UI', async ({ page }) => {
  await openSeededProject(page);
  const days = await seedDayDates(page);
  const target = days[1] ?? days[0];
  const castIds = await page.evaluate(() => {
    const b: any = (window as any).__lemonSchedule;
    const p = b.getProject();
    return (p.castMembers || []).slice(0, 10).map((m: any) => String(m.id));
  });
  expect(castIds.length).toBeGreaterThan(4);

  await page.getByRole('button', { name: 'Calendar' }).click();
  await page.getByRole('button', { name: 'Events', exact: true }).click();
  await page.waitForSelector('[data-cal-day]');

  const before = await measureEventsDay(page, target);

  const dayCell = page.locator(`[data-cal-day][data-date-key="${target}"]`);
  await dayCell.click({ button: 'right', position: { x: 40, y: 60 } });
  await page.getByText('Add Events…', { exact: true }).click();
  const adder = page.getByRole('dialog').last();
  await expect(adder.getByRole('heading', { name: 'Add Events' })).toBeVisible();
  await adder.locator('input').first().click();
  await adder.locator('input').first().fill(castIds.join(', '));
  await adder.locator('input').first().press('Enter');
  await adder.getByRole('button', { name: 'Create', exact: true }).click();

  const after = await measureEventsDay(page, target);
  expect(after.cards ?? 0).toBeGreaterThan(before.cards ?? 0);
  expect(after.dayH ?? 0).toBeGreaterThan(before.dayH ?? 0);
  expect(after.scrollH ?? 0).toBeGreaterThan(before.scrollH ?? 0);
});
