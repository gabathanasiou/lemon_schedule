import { test, expect } from '@playwright/test';
import { openSeededProject, loadSeedProject, seedProjectScript } from './helpers';

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

test('reports designer view toggle switches canvas width (portrait/landscape/full)', async ({ page }) => {
  const seed = loadSeedProject();
  await page.addInitScript(seedProjectScript(seed));
  await page.addInitScript(() => localStorage.setItem('lemon_schedule_view_mode', 'portrait'));
  await page.goto('http://localhost:3001/lemon_schedule/');
  await page.getByText(seed.data.title, { exact: true }).first().click({ timeout: 8000 });
  await page.waitForTimeout(1000);

  await page.getByRole('button', { name: 'Design', exact: true }).click();
  await page.getByRole('button', { name: 'Reports Designer', exact: true }).click();
  await page.waitForTimeout(500);

  const sheet = page.locator('div[style*="rgb(228, 228, 231)"]').first();
  const w0 = await sheet.evaluate(el => (el as HTMLElement).offsetWidth);

  await page.getByRole('button', { name: /View:/ }).click();
  await page.getByText('A4 Landscape', { exact: true }).click();
  await page.waitForTimeout(300);
  const w1 = await sheet.evaluate(el => (el as HTMLElement).offsetWidth);
  expect(w1).toBe(1060);
  expect(w1).toBeGreaterThan(w0);

  const canvas = page.locator('div.flex-1.overflow-auto.p-8');
  const maxScroll = await canvas.evaluate(el => el.scrollWidth - el.clientWidth);
  expect(maxScroll).toBeGreaterThan(0);
  await canvas.evaluate(el => { el.scrollLeft = 50; });
  const sl = await canvas.evaluate(el => el.scrollLeft);
  expect(sl).toBeGreaterThan(0);

  await page.getByRole('button', { name: /View:/ }).click();
  await page.getByText('Full Width', { exact: true }).click();
  await page.waitForTimeout(300);
  const w2 = await sheet.evaluate(el => (el as HTMLElement).offsetWidth);
  const cw = await sheet.evaluate(el => (el.parentElement as HTMLElement).clientWidth);
  expect(w2).toBe(cw - 64);

  await page.getByRole('button', { name: /View:/ }).click();
  await page.getByText('A4 Portrait', { exact: true }).click();
  await page.waitForTimeout(300);
  const w3 = await sheet.evaluate(el => (el as HTMLElement).offsetWidth);
  expect(w3).toBe(730);
});

test('keys/values toggle inside view menu switches text blocks; tables always show values', async ({ page }) => {
  await openSeededProject(page);

  await page.getByRole('button', { name: 'Design', exact: true }).click();
  await page.getByRole('button', { name: 'Reports Designer', exact: true }).click();
  await page.waitForTimeout(500);

  await expect(page.getByText('Town - Jason — One-Liner')).toBeVisible({ timeout: 5000 });
  await expect(page.getByText('FISHERMAN, BLACK')).toBeVisible({ timeout: 3000 });

  await page.getByRole('button', { name: /View:/ }).click();
  await page.locator('.ui-menu').getByText('Show field keys', { exact: true }).click();
  await page.waitForTimeout(300);

  await expect(page.getByText('{{title}} — One-Liner')).toBeVisible({ timeout: 3000 });
  await expect(page.getByText('FISHERMAN, BLACK')).toBeVisible({ timeout: 3000 });

  await page.getByRole('button', { name: /View:/ }).click();
  await page.locator('.ui-menu').getByText('Show field values', { exact: true }).click();
  await page.waitForTimeout(300);

  await expect(page.getByText('Town - Jason — One-Liner')).toBeVisible({ timeout: 3000 });
});

test('category breakdown template iterates categories; skip empty + exclude work', async ({ page }) => {
  await openSeededProject(page);

  await page.getByRole('button', { name: 'Design', exact: true }).click();
  await page.getByRole('button', { name: 'Reports Designer', exact: true }).click();
  await page.waitForTimeout(500);

  await page.getByText('Editing:', { exact: false }).click();
  await page.locator('.ui-menu').getByText('Category Breakdown', { exact: true }).click();
  await page.waitForTimeout(500);

  await page.getByRole('button', { name: 'Preview' }).click();
  await page.waitForTimeout(800);
  for (const label of ['Cast', 'Props', 'Wardrobe']) {
    await expect(page.getByText(label, { exact: true })).toBeVisible({ timeout: 3000 });
  }
  await expect(page.getByText('FISHERMAN', { exact: true })).toBeVisible({ timeout: 3000 });
  await expect(page.getByText('Set', { exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByText('Repeat: Categories').click();
  await page.waitForTimeout(300);

  const skipEmpty = page.getByText('Skip categories with no elements');
  await expect(skipEmpty).toBeVisible({ timeout: 3000 });

  await page.getByRole('button', { name: 'None' }).click();
  await page.locator('.ui-menu').getByText('Cast', { exact: true }).click();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  await page.getByRole('button', { name: 'Preview' }).click();
  await page.waitForTimeout(800);
  await expect(page.getByText('Props', { exact: true })).toBeVisible({ timeout: 3000 });
  await expect(page.getByText('Cast', { exact: true })).toHaveCount(0);
});
