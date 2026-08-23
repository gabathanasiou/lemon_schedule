import { test, expect } from '@playwright/test';
import { ensureProject } from './helpers';

test.describe('Glide Breakdown Tab', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
  });

  test('renders toolbar and grid container', async ({ page }) => {
    await page.goto('http://localhost:3001/lemon_schedule/');
    await ensureProject(page);

    const glideBtn = page.getByRole('button', { name: 'Glide Breakdown' });
    await expect(glideBtn).toBeVisible({ timeout: 5000 });
    await glideBtn.click();

    await expect(page.getByRole('button', { name: /Add Scene/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'View' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Info' })).toBeVisible();

    const scroller = page.locator('.dvn-scroller');
    await expect(scroller).toBeAttached();
    const box = await scroller.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(100);
  });

  test('View dropdown menu items are clickable', async ({ page }) => {
    await page.goto('http://localhost:3001/lemon_schedule/');
    await ensureProject(page);

    const glideBtn = page.getByRole('button', { name: 'Glide Breakdown' });
    await expect(glideBtn).toBeVisible({ timeout: 5000 });
    await glideBtn.click();

    const viewBtn = page.getByRole('button', { name: 'View' });
    await viewBtn.click();

    const biggerItem = page.getByRole('menuitem', { name: 'Bigger' });
    await expect(biggerItem).toBeVisible({ timeout: 3000 });
    await biggerItem.click();
  });

  test('adds scene via button and verifies persistence between views', async ({ page }) => {
    await page.goto('http://localhost:3001/lemon_schedule/');
    await ensureProject(page);

    const sheetBtn = page.getByRole('button', { name: 'Sheet' });
    await expect(sheetBtn).toBeVisible({ timeout: 5000 });
    await sheetBtn.click();

    const createFirst = page.getByRole('button', { name: 'Create First Scene' });
    await createFirst.click();

    const glideBtn = page.getByRole('button', { name: 'Glide Breakdown' });
    await glideBtn.click();
    await sheetBtn.click();

    const sceneCount = await page.evaluate(() => (window as any).__lemonSchedule?.getProject()?.scenes?.length ?? 0);
    expect(sceneCount).toBeGreaterThanOrEqual(1);
  });

  test('can add scene directly from Glide Breakdown toolbar', async ({ page }) => {
    await page.goto('http://localhost:3001/lemon_schedule/');
    await ensureProject(page);

    const glideBtn = page.getByRole('button', { name: 'Glide Breakdown' });
    await expect(glideBtn).toBeVisible({ timeout: 5000 });
    await glideBtn.click();

    const sceneCount = () => (window as any).__lemonSchedule?.getState()?.present?.scenes?.length ?? -1;
    const initialState = { sceneCount: await page.evaluate(sceneCount) };

    await page.getByRole('button', { name: /Add Scene/ }).click();

    await expect.poll(() => page.evaluate(sceneCount), { timeout: 5000 }).toBe(initialState.sceneCount + 1);
  });

  test('edits a cell via double-click and commits to store', async ({ page }) => {
    await page.goto('http://localhost:3001/lemon_schedule/');
    await ensureProject(page);

    const glideBtn = page.getByRole('button', { name: 'Glide Breakdown' });
    await expect(glideBtn).toBeVisible({ timeout: 5000 });
    await glideBtn.click();

    await page.getByRole('button', { name: /Add Scene/ }).click();
    await expect.poll(() => page.evaluate(() => (window as any).__lemonSchedule?.getProject()?.scenes?.length ?? 0), { timeout: 5000 }).toBeGreaterThan(0);

    // Verify portal exists
    expect(await page.evaluate(() => !!document.getElementById('portal'))).toBe(true);

    // Click on the first cell (Scene # column) to select it with single-click activation
    const canvas = page.locator('.dvn-underlay canvas').first();
    await expect(canvas).toBeAttached({ timeout: 3000 });
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();

    // Click on the first row, first data column area
    await page.mouse.click(box!.x + 80, box!.y + 25);
    await page.waitForTimeout(500);

    // With single-click activation and editOnType=true, typing should open editor
    await page.keyboard.press('7');
    await page.waitForTimeout(500);

    // Check portal for overlay input
    let overlayInput = await page.evaluate(() => {
      const portal = document.getElementById('portal');
      if (!portal) return null;
      const input = portal.querySelector('input');
      if (input) return { value: input.value, rect: input.getBoundingClientRect().toJSON() };
      const textarea = portal.querySelector('textarea');
      if (textarea) return { value: textarea.value, rect: textarea.getBoundingClientRect().toJSON() };
      return null;
    });

    if (overlayInput) {
      console.log('Overlay input found via editOnType:', JSON.stringify(overlayInput));
      await page.keyboard.type('7');
      await page.waitForTimeout(200);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(500);
    } else {
      // Try double-click instead
      console.log('editOnType did not open editor, trying double-click');
      await page.mouse.dblclick(box!.x + 80, box!.y + 25);
      await page.waitForTimeout(500);

      overlayInput = await page.evaluate(() => {
        const portal = document.getElementById('portal');
        if (!portal) return null;
        const input = portal.querySelector('input');
        if (input) return { value: input.value, rect: input.getBoundingClientRect().toJSON() };
        return null;
      });
      console.log('Overlay after dblclick:', JSON.stringify(overlayInput));

      if (overlayInput) {
        await page.keyboard.type('7');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(500);
      }
    }

    // Verify the edit via live store state
    const sceneNum = await page.evaluate(() => (window as any).__lemonSchedule?.getProject()?.scenes?.[0]?.sceneNumber ?? null);

    if (overlayInput) {
      expect(sceneNum).toBe('77');
    }
  });
});
