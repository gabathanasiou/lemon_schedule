import { test, expect } from '@playwright/test';
import { openSeededProject } from './helpers';

test('reports designer lives in design tab; collection menu uses submenu', async ({ page }) => {
  await openSeededProject(page);

  const designTab = page.getByRole('button', { name: 'Design', exact: true });
  await designTab.click();
  const designerSubTab = page.getByRole('button', { name: 'Reports Designer', exact: true });
  await expect(designerSubTab).toBeVisible({ timeout: 5000 });
  await designerSubTab.click();
  await page.waitForSelector('text=Add Report', { timeout: 5000 }).catch(() => {});

  const reportsTab = page.getByRole('button', { name: 'Reports', exact: true });
  await reportsTab.click();
  await expect(page.getByRole('button', { name: 'Reports Designer', exact: true })).toHaveCount(0);
});

test('table over menu drops cast and nests categories in an elements submenu', async ({ page }) => {
  await openSeededProject(page);

  await page.getByRole('button', { name: 'Design', exact: true }).click();
  await page.getByRole('button', { name: 'Reports Designer', exact: true }).click();
  await page.waitForTimeout(500);

  await page.getByRole('button', { name: 'Table', exact: true }).click();
  await page.waitForTimeout(500);

  const tableOver = page.getByRole('button', { name: 'Scenes', exact: true });
  await tableOver.click();

  const menu = page.locator('.ui-menu');
  for (const label of ['Scenes', 'Days', 'Elements', 'Crew']) {
    await expect(menu.getByText(label, { exact: true })).toBeVisible({ timeout: 3000 });
  }
  await expect(menu.getByText('Cast', { exact: true })).toHaveCount(0);

  await menu.getByText('Elements', { exact: true }).click();
  await expect(page.locator('.ui-menu').getByText('Props', { exact: true })).toBeVisible({ timeout: 3000 });
  await expect(page.locator('.ui-menu').getByText('Cast', { exact: true })).toBeVisible({ timeout: 3000 });

  await page.locator('.ui-menu').getByText('Cast', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Elements · Cast', exact: true })).toBeVisible({ timeout: 3000 });
});
