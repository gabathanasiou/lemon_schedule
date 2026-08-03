import { test, expect, type Page } from '@playwright/test';
import { openSeededProject } from './helpers';

async function penTapAt(page: Page, x: number, y: number) {
  await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y) as HTMLElement;
    if (!el) return;
    const opts = { pointerType: 'pen', button: 0, clientX: x, clientY: y, bubbles: true, cancelable: true };
    el.dispatchEvent(new PointerEvent('pointerdown', { ...opts, buttons: 1 }));
    el.dispatchEvent(new PointerEvent('pointerup', { ...opts, buttons: 0 }));
  }, { x, y });
}

async function openHelp(page: Page) {
  await page.getByTitle('Keyboard Shortcuts & Help').click();
  await page.waitForTimeout(400);
}

test('pen tap: neutral item keeps modal open, close button works', async ({ page }) => {
  await openSeededProject(page);
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: 'Schedule' }).click();
  await page.waitForTimeout(500);

  // 1. pen tap on a neutral modal item must NOT dismiss
  await openHelp(page);
  const table = page.locator('[role="dialog"] table').first();
  await expect(table).toBeVisible();
  const tb = await table.boundingBox();
  await penTapAt(page, tb!.x + 50, tb!.y + 20);
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => !!document.querySelector('[role="dialog"]'))).toBe(true);

  // 2. pen tap on the Close button must fire the click (synthetic shim)
  const closeBtn = page.getByRole('button', { name: 'Close' });
  const cb = await closeBtn.boundingBox();
  await penTapAt(page, cb!.x + cb!.width / 2, cb!.y + cb!.height / 2);
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => !!document.querySelector('[role="dialog"]'))).toBe(false);

  // 3. re-open, pen tap on a modal button (footer) works without dismissing twice
  await openHelp(page);
  await expect(table).toBeVisible();
  await penTapAt(page, tb!.x + 50, tb!.y + 20);
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => !!document.querySelector('[role="dialog"]'))).toBe(true);
});
