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

test('quick toggle leaves edit mode stuck', async ({ page }) => {
  test.setTimeout(120000);
  await openSeeded(page);
  await page.getByRole('button', { name: 'Schedule', exact: true }).click();
  await page.waitForSelector('[data-row-id]', { timeout: 15000 });

  const editBtn = page.locator('button:has-text("Edit")').last();

  // toggle on then off quickly (no waits)
  await editBtn.click({ timeout: 5000 });
  await editBtn.click({ timeout: 5000 });
  await page.waitForTimeout(600);

  const state = await page.evaluate(() => ({
    dragDisabled: (window as any).__probeDragDisabled,
    editMode: document.querySelector('[data-edit-mode]')?.getAttribute('data-edit-mode') ?? null,
  }));
  console.log(`[quick-toggle] ${JSON.stringify(state)}`);

  // now drag and see if it engages
  await page.evaluate(() => { (window as any).__probeDrag = { start: 0, over: 0, end: 0 }; });
  const row = page.locator('[data-row-id]:not([aria-disabled="true"])').nth(5);
  const box = await row.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 80, { steps: 8 });
    await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2 + 150, { steps: 8 });
    await page.waitForTimeout(100);
    const drag = await page.evaluate(() => (window as any).__probeDrag);
    console.log(`[quick-toggle-drag] ${JSON.stringify(drag)}`);
    await page.mouse.up();
    await page.waitForTimeout(400);
  }

  // normal-speed toggle off and check again
  await editBtn.click({ timeout: 5000 });
  await page.waitForTimeout(400);
  const state2 = await page.evaluate(() => ({
    dragDisabled: (window as any).__probeDragDisabled,
    editMode: document.querySelector('[data-edit-mode]')?.getAttribute('data-edit-mode') ?? null,
  }));
  console.log(`[after-normal-toggle-off] ${JSON.stringify(state2)}`);
});
