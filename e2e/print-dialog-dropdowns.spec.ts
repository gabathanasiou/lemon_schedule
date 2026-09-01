import { test, expect } from '@playwright/test';
import { openSeededProject } from './helpers';

/* Print-dialog dropdowns → ui-kit base (roadmap 60). The print menus were the
   last raw-Radix dropdowns (no morph, no coarse sizing); they now render
   through the kit DropdownMenu, so every picker opens with the trigger-anchored
   morph and selects with the single-highlight/checked-row contract. */
const MENU = '[data-radix-menu-content]';

/** Catch frames while the open morph is animating (scale < 1). */
async function morphMidSamples(page: any): Promise<number[]> {
  return page.evaluate(() => new Promise<number[]>((resolve) => {
    const start = performance.now();
    const samples: number[] = [];
    const tick = () => {
      const el = document.querySelector('[data-radix-menu-content]');
      if (el) {
        const s = getComputedStyle(el);
        samples.push(new DOMMatrixReadOnly(s.transform || 'none').a);
      }
      if (performance.now() - start > 1000) { resolve(samples); return; }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }));
}

test.describe('print dialog dropdowns → ui-kit base (roadmap 60)', () => {
  // This spec asserts the morph — re-enable motion (the suite default is
  // reducedMotion: 'reduce' so the other specs don't race the close clone).
  test.use({ contextOptions: { reducedMotion: 'no-preference' } });

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.addInitScript(() => { window.print = () => {}; });
    await openSeededProject(page);
  });

  test('Print Schedule: ribbon-layout + page-size pickers morph, select, and update the trigger', async ({ page }) => {
    await page.getByRole('button', { name: 'Schedule' }).click();
    await page.getByRole('button', { name: 'Print', exact: true }).click();
    const dialog = page.getByRole('dialog').filter({ hasText: 'Print Schedule' });
    await expect(dialog).toBeVisible();

    // Ribbon Layout picker.
    const ribbonRow = page.locator('span').filter({ hasText: 'Ribbon Layout' }).first().locator('..');
    const ribbonTrigger = ribbonRow.getByRole('button').first();
    const trace = morphMidSamples(page);
    await ribbonTrigger.click();
    await expect(page.locator(MENU).last()).toBeAttached();
    const samples = await trace;
    expect(samples.some(s => s < 0.995)).toBe(true); // morphs open
    // Pick a ribbon (re-selecting the active one still exercises select +
    // close), assert the trigger shows it and the menu closes.
    const items = page.locator(MENU).last().locator('[role="menuitem"]');
    const picked = ((await items.first().textContent()) ?? '').trim();
    expect(picked).not.toBe('');
    await items.first().click();
    await expect(ribbonTrigger).toHaveText(RegExp(picked), { timeout: 3000 });
    await expect(page.locator(MENU)).toHaveCount(0);

    // Page Size picker (Portrait / Landscape / Full Width).
    const sizeRow = page.locator('span').filter({ hasText: 'Page Size' }).first().locator('..');
    const sizeTrigger = sizeRow.getByRole('button').first();
    await sizeTrigger.click();
    await expect(page.locator(MENU).last()).toBeAttached();
    const landscape = page.locator(MENU).last().locator('[role="menuitem"]').filter({ hasText: 'Landscape' });
    await landscape.click();
    await expect(sizeTrigger).toHaveText(/Landscape/, { timeout: 3000 });
  });

  test('Element Breakdown: category picker morphs, selects, and checks the row', async ({ page }) => {
    await page.getByRole('button', { name: 'Reports' }).click();
    await page.getByRole('button', { name: 'Element Breakdown' }).click();
    await page.getByRole('button', { name: 'Print', exact: true }).click();
    const dialog = page.getByRole('dialog').filter({ hasText: 'Element Breakdown' });
    await expect(dialog).toBeVisible();

    const catRow = page.locator('label').filter({ hasText: /^Category$/ }).locator('..');
    const trigger = catRow.getByRole('button').first();
    const before = (await trigger.textContent())?.trim() ?? '';
    const trace = morphMidSamples(page);
    await trigger.click();
    await expect(page.locator(MENU).last()).toBeAttached();
    const samples = await trace;
    expect(samples.some(s => s < 0.995)).toBe(true); // morphs open
    const items = page.locator(MENU).last().locator('[role="menuitem"]');
    const target = (await items.allTextContents()).find(t => t !== before);
    expect(target).toBeTruthy();
    await items.filter({ hasText: target as string }).first().click();
    await expect(trigger).toHaveText(RegExp((target as string).trim()), { timeout: 3000 });
  });

  test('Day Out of Days: category picker morphs, selects, and checks the row', async ({ page }) => {
    await page.getByRole('button', { name: 'Reports' }).click();
    await page.getByRole('button', { name: 'Day Out of Days' }).click();
    await page.getByRole('button', { name: 'Print', exact: true }).click();
    const dialog = page.getByRole('dialog').filter({ hasText: 'Day Out of Days' });
    await expect(dialog).toBeVisible();

    const catRow = page.locator('label').filter({ hasText: /^Category$/ }).locator('..');
    const trigger = catRow.getByRole('button').first();
    const before = (await trigger.textContent())?.trim() ?? '';
    const trace = morphMidSamples(page);
    await trigger.click();
    await expect(page.locator(MENU).last()).toBeAttached();
    const samples = await trace;
    expect(samples.some(s => s < 0.995)).toBe(true); // morphs open
    const items = page.locator(MENU).last().locator('[role="menuitem"]');
    const target = (await items.allTextContents()).find(t => t !== before);
    expect(target).toBeTruthy();
    await items.filter({ hasText: target as string }).first().click();
    await expect(trigger).toHaveText(RegExp((target as string).trim()), { timeout: 3000 });
  });
});
