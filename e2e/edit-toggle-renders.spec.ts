import { test, Page } from '@playwright/test';
import { loadSeedProject, seedProjectScript } from './helpers';

async function openSeeded(page: Page) {
  const seed = loadSeedProject();
  await page.addInitScript(seedProjectScript(seed));
  await page.goto('/lemon_schedule/');
  const title = JSON.parse(seed.raw).title;
  await page.getByText(title, { exact: true }).first().click({ timeout: 8000 });
  await page.waitForTimeout(1200);
}

test('row renders during edit toggle', async ({ page }) => {
  test.setTimeout(120000);
  await openSeeded(page);
  await page.getByRole('button', { name: 'Schedule', exact: true }).click();
  await page.waitForSelector('[data-row-id]', { timeout: 15000 });
  await page.waitForTimeout(1000);

  const editBtn = page.locator('button:has-text("Edit")').last();

  await page.evaluate(() => {
    (window as any).__probeRowRenders = 0;
    (window as any).__probeOuterRenders = 0;
    (window as any).__probeDnd = { combineActivators: 0 };
  });
  await editBtn.click({ timeout: 5000 });
  await page.waitForTimeout(500);
  let renders = await page.evaluate(() => (window as any).__probeRowRenders ?? -1);
  const outer = await page.evaluate(() => (window as any).__probeOuterRenders ?? -1);
  const sensorsOn = await page.evaluate(() => (window as any).__probeSensors);
  const dndOn = await page.evaluate(() => (window as any).__probeDnd);
  console.log(`[toggle-on] rowRenders=${renders} outerRenders=${outer} sensors=${JSON.stringify(sensorsOn)} dnd=${JSON.stringify(dndOn)}`);

  await page.evaluate(() => {
    (window as any).__probeRowRenders = 0;
    (window as any).__probeOuterRenders = 0;
    (window as any).__probeDnd = { combineActivators: 0 };
  });
  await editBtn.click({ timeout: 5000 });
  await page.waitForTimeout(500);
  renders = await page.evaluate(() => (window as any).__probeRowRenders ?? -1);
  const outerOff = await page.evaluate(() => (window as any).__probeOuterRenders ?? -1);
  const sensorsOff = await page.evaluate(() => (window as any).__probeSensors);
  const dndOff = await page.evaluate(() => (window as any).__probeDnd);
  console.log(`[toggle-off] rowRenders=${renders} outerRenders=${outerOff} sensors=${JSON.stringify(sensorsOff)} dnd=${JSON.stringify(dndOff)}`);

  // repeat once more to see if the second toggle pair behaves differently
  await page.evaluate(() => { (window as any).__probeRowRenders = 0; });
  await editBtn.click({ timeout: 5000 });
  await page.waitForTimeout(500);
  renders = await page.evaluate(() => (window as any).__probeRowRenders ?? -1);
  console.log(`[toggle-on-2] rowRenders=${renders}`);

  await page.evaluate(() => { (window as any).__probeRowRenders = 0; });
  await editBtn.click({ timeout: 5000 });
  await page.waitForTimeout(500);
  renders = await page.evaluate(() => (window as any).__probeRowRenders ?? -1);
  console.log(`[toggle-off-2] rowRenders=${renders}`);
});
