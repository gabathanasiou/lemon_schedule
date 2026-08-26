import { test, expect, Page } from '@playwright/test';
import { loadSeedProject, seedProjectScript } from './helpers';

async function openSeeded(page: Page) {
  const seed = loadSeedProject();
  await page.addInitScript(seedProjectScript(seed));
  await page.goto('/lemon_schedule/');
  const title = JSON.parse(seed.raw).title;
  await page.getByText(title, { exact: true }).first().click({ timeout: 8000 });
  await expect(page.getByRole('button', { name: 'Breakdown', exact: true })).toBeVisible({ timeout: 10000 });
}

async function dragAt(page: Page, nth: number, xFrac: number, yFrac: number) {
  const row = page.locator('[data-row-id]:not([aria-disabled="true"])').nth(nth);
  const box = await row.boundingBox();
  if (!box) return null;
  const x = box.x + box.width * xFrac;
  const y = box.y + box.height * yFrac;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(100);
  await page.mouse.move(x + 40, y + 80, { steps: 8 });
  await page.mouse.move(x + 100, y + 150, { steps: 8 });
  await page.waitForTimeout(100);
  const engaged = await page.evaluate(() => (window as any).__probeDrag?.start ?? 0);
  const insertChanges = await page.evaluate(() => (window as any).__probeInsertChanges ?? 0);
  const overCount = await page.evaluate(() => (window as any).__probeDrag?.over ?? 0);
  await page.mouse.up();
  await page.waitForTimeout(400);
  return { engaged, insertChanges, overCount };
}

async function round(page: Page, label: string, nth: number, xFrac: number, yFrac: number) {
  await page.evaluate(() => {
    (window as any).__probeRowRenders = 0;
    (window as any).__probeDrag = { start: 0, over: 0, end: 0 };
    (window as any).__probeInsertChanges = 0;
  });
  let total: any = { engaged: 0, insertChanges: 0, overCount: 0 };
  for (let i = 0; i < 3; i++) {
    const r = await dragAt(page, nth, xFrac, yFrac);
    if (r) { total.engaged += r.engaged; total.insertChanges += r.insertChanges; total.overCount += r.overCount; }
  }
  const renders = await page.evaluate(() => (window as any).__probeRowRenders ?? -1);
  const drag = await page.evaluate(() => (window as any).__probeDrag);
  console.log(`[round] ${label}: renders=${renders} drag=${JSON.stringify(drag)} insertChanges=${total.insertChanges} overCalls=${total.overCount}`);
}

test('@perf user-flow drag perf', async ({ page }) => {
  test.setTimeout(300000);
  await openSeeded(page);
  await page.getByRole('button', { name: 'Schedule', exact: true }).click();
  await page.waitForSelector('[data-row-id]', { timeout: 15000 });

  await round(page, 'baseline', 5, 0.5, 0.5);

  const editBtn = page.locator('button:has-text("Edit")').last();
  await editBtn.click({ timeout: 5000 });
  await page.waitForTimeout(400);
  await page.locator('[data-row-id]:not([aria-disabled="true"])').nth(5).click({ timeout: 5000 });
  await page.waitForTimeout(400);
  await editBtn.click({ timeout: 5000 });
  await page.waitForTimeout(400);

  await round(page, 'after-edit-toggle', 5, 0.5, 0.5);
});
