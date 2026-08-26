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

test('@perf idle render churn after edit toggle', async ({ page }) => {
  test.setTimeout(120000);
  await openSeeded(page);
  await page.getByRole('button', { name: 'Schedule', exact: true }).click();
  await page.waitForSelector('[data-row-id]', { timeout: 15000 });

  const editBtn = page.locator('button:has-text("Edit")').last();

  await page.evaluate(() => { (window as any).__probeRowRenders = 0; });
  await page.waitForTimeout(3000);
  console.log(`[idle-before] rowRenders=${await page.evaluate(() => (window as any).__probeRowRenders)}`);

  await editBtn.click({ timeout: 5000 });
  await page.waitForTimeout(300);
  await page.locator('[data-row-id]:not([aria-disabled="true"])').nth(2).click({ timeout: 5000 });
  await page.waitForTimeout(300);
  await editBtn.click({ timeout: 5000 });
  await page.waitForTimeout(300);

  await page.evaluate(() => {
    (window as any).__probeRowRenders = 0;
    (window as any).__probeTicks = 0;
    const start = performance.now();
    (window as any).__probeLoop = setInterval(() => { (window as any).__probeTicks++; }, 100);
  });
  await page.waitForTimeout(3000);
  const ticks = await page.evaluate(() => {
    clearInterval((window as any).__probeLoop);
    return (window as any).__probeTicks;
  });
  console.log(`[idle-after-toggle] rowRenders=${await page.evaluate(() => (window as any).__probeRowRenders)} eventLoopTicks=${ticks}`);

  const domInfo = await page.evaluate(() => ({
    heights: Array.from(document.querySelectorAll('[data-cal-day]')).slice(0, 5).map((el: any) => el.offsetHeight),
    bodyUserSelect: document.body.style.userSelect,
    bodyTouchAction: document.body.style.touchAction,
    containerTouchAction: document.querySelector('[data-marquee-container]')?.getAttribute('style')?.slice(0, 120),
    marqueeActive: !!document.querySelector('[data-marquee-active]'),
  }));
  console.log(`[dom-after] ${JSON.stringify(domInfo)}`);
});
