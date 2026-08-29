import { test, expect } from '@playwright/test';
import { openSeededProject } from './helpers';

test('calendar travel/hold: status dropdown, event cards, header icons, tooltip, body chips, DOODS cells', async ({ page }) => {
  await openSeededProject(page);

  await page.getByRole('button', { name: 'Calendar' }).click();
  const dayCell = page.locator('[data-date-key="2026-08-10"]');
  await expect(dayCell).toBeVisible();
  const header = dayCell.locator('[class*="flex items-center justify-between"]').first();

  // Double-click a day header opens the day events modal (no events → empty state)
  await header.dblclick();
  await expect(page.getByText('Day Events —', { exact: false })).toBeVisible();
  await expect(page.getByText('No events on this day', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Done' }).click();

  // Set Travel via context menu, then manage the day → add FISHERMAN's travel card
  await header.click({ button: 'right' });
  await page.getByText('Travel', { exact: true }).click();
  await expect(dayCell.getByText('TRAVEL', { exact: true })).toBeVisible();

  await header.click({ button: 'right', force: true });
  await page.getByText('Manage Travel/Hold…').click();
  // Add Event opens the shared adder pre-targeted to this day (Travel preselected)
  await page.getByRole('button', { name: 'Add Event' }).click();
  const adder = page.getByRole('dialog').last();
  await expect(adder.getByRole('heading', { name: 'Add Events' })).toBeVisible();
  await adder.locator('input').first().click();
  await page.getByText('FISHERMAN', { exact: true }).first().click();
  await adder.getByRole('button', { name: 'Create', exact: true }).click();
  // The travel card lists FISHERMAN with its category label
  const travelCard = page.locator('[data-event-card="travel"]');
  await expect(travelCard).toContainText('FISHERMAN');
  await expect(travelCard).toContainText('Cast');
  await page.getByRole('button', { name: 'Done' }).click();
  const planeIcon = dayCell.locator('svg[style*="rgb(147, 51, 234)"]');
  await expect(planeIcon).toBeVisible();

  await planeIcon.hover();
  const tip = page.locator('.fixed.px-2\\.5').filter({ hasText: 'Traveling' }).first();
  await expect(tip).toBeVisible();
  await expect(tip).toContainText('FISHERMAN');

  // Hold day: label on the calendar, then attach ALL cast via the adder's All checkbox
  const day2 = page.locator('[data-date-key="2026-08-11"]');
  const header2 = day2.locator('[class*="flex items-center justify-between"]').first();
  await header2.click({ button: 'right' });
  await page.getByText('Hold', { exact: true }).click();
  await expect(day2.getByText('HOLD', { exact: true })).toBeVisible();
  await expect(day2.getByText('Double click to set up')).toBeVisible();

  await header2.dblclick({ force: true });
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Add Event' }).click();
  const adder2 = page.getByRole('dialog').last();
  await page.getByText('All', { exact: true }).last().click();
  await adder2.getByRole('button', { name: 'Create', exact: true }).click();
  // The hold card shows the whole-category row "All Cast"
  await expect(page.locator('[data-event-card="hold"]')).toContainText('All Cast');
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(day2.getByText('All Cast', { exact: true })).toBeVisible();

  await day2.locator('button', { has: page.locator('svg[style*="rgb(220, 38, 38)"]') }).hover();
  const allTip = page.locator('.fixed.px-2\\.5').filter({ hasText: 'On Hold' }).first();
  await expect(allTip).toContainText('All Cast');

  // Conflict flag on the right of the header (if present)
  const headerBox = await header.boundingBox();
  const flagDay = page.locator('[data-date-key]').filter({ has: page.locator('svg.lucide-flag.fill-red-400') }).first();
  if (await flagDay.count() > 0) {
    const flagBox = await flagDay.locator('svg.lucide-flag.fill-red-400').first().boundingBox();
    const fHeaderBox = await flagDay.locator('[class*="flex items-center justify-between"]').first().boundingBox();
    expect(flagBox!.x + flagBox!.width / 2).toBeGreaterThan(fHeaderBox!.x + fHeaderBox!.width / 2);
  }

  // Reports DOODS shows the T cell
  await page.getByRole('button', { name: 'Reports' }).click();
  const fisherRow = page.locator('tr', { hasText: 'FISHERMAN' }).first();
  await expect(fisherRow).toContainText('T');
});
