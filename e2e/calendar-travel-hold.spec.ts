import { test, expect } from '@playwright/test';
import { openSeededProject } from './helpers';

test('calendar travel/hold: modal, header icons, tooltip, body chips, DOODS cells', async ({ page }) => {
  await openSeededProject(page);

  await page.getByRole('button', { name: 'Calendar' }).click();
  const dayCell = page.locator('[data-date-key="2026-08-10"]');
  await expect(dayCell).toBeVisible();
  const header = dayCell.locator('[class*="flex items-center justify-between"]').first();

  // Double-click a day header opens the modal
  await header.dblclick();
  await expect(page.getByText('Travel / Hold —', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  // Right-click → Manage Travel/Hold → add a traveling cast member, one-click Save
  await header.click({ button: 'right' });
  await page.getByText('Manage Travel/Hold…').click();
  await page.locator('input.text-inherit').nth(0).click();
  await page.getByText('FISHERMAN', { exact: true }).first().click();
  await page.getByRole('button', { name: 'Save' }).click();
  const planeIcon = dayCell.locator('svg.fill-purple-400');
  await expect(planeIcon).toBeVisible();

  await planeIcon.hover();
  const tip = page.locator('.fixed.px-2\\.5').filter({ hasText: 'Traveling' }).first();
  await expect(tip).toBeVisible();
  await expect(tip).toContainText('FISHERMAN');

  // Day set to Hold via quick menu → body shows hold chips after adding hold cast
  await header.click({ button: 'right' });
  await page.getByText('Hold', { exact: true }).click();
    await expect(dayCell.getByText('HOLD', { exact: true })).toBeVisible();

  await dayCell.locator('button', { has: page.locator('svg.fill-purple-400') }).click({ force: true });
    await page.locator('input.text-inherit').nth(1).click();
  await page.getByText('SENKAR', { exact: true }).first().click();
  await page.getByRole('button', { name: 'Save' }).click();
  // Both travel + hold → single star icon instead of plane+pause
  await expect(dayCell.locator('svg.fill-amber-400')).toBeVisible();
  await expect(dayCell.locator('svg.fill-purple-400')).toHaveCount(0);
  await expect(dayCell.locator('svg.fill-red-400')).toHaveCount(0);
  await expect(dayCell.getByText('SENKAR', { exact: false })).toBeVisible();

  await dayCell.locator('svg.fill-amber-400').hover();
  const bothTip = page.locator('.fixed.px-2\\.5').filter({ hasText: 'Traveling' }).first();
  await expect(bothTip).toContainText('SENKAR');

  // Fresh hold day → empty-state hint, then "All Cast" when the All checkbox is used
  const day2 = page.locator('[data-date-key="2026-08-11"]');
  const header2 = day2.locator('[class*="flex items-center justify-between"]').first();
  await header2.click({ button: 'right' });
  await page.getByText('Hold', { exact: true }).click();
    await expect(day2.getByText('Double click to set up')).toBeVisible();

  await header2.dblclick({ force: true });
  await page.waitForTimeout(400);
  const holdInputs = page.locator('input.text-inherit');
  await page.getByText('On Hold', { exact: true }).click();
  await page.getByText('All', { exact: true }).last().click();
  await page.getByRole('button', { name: 'Save' }).click();
    await expect(day2.getByText('All Cast', { exact: true })).toBeVisible();

  await day2.locator('button', { has: page.locator('svg.fill-red-400') }).hover();
  const allTip = page.locator('.fixed.px-2\\.5').filter({ hasText: 'On Hold' }).first();
  await expect(allTip).toContainText('All Cast');

  // Star (travel+hold) on the left; conflict flag on the right of the header
  const headerBox = await header.boundingBox();
  const starBox = await dayCell.locator('svg.fill-amber-400').boundingBox();
  expect(starBox!.x + starBox!.width / 2).toBeLessThan(headerBox!.x + headerBox!.width / 2);
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
