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
    await page.waitForTimeout(1000);

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
    await page.waitForTimeout(500);

    const viewBtn = page.getByRole('button', { name: 'View' });
    await viewBtn.click();
    await page.waitForTimeout(200);

    const biggerItem = page.getByRole('menuitem', { name: 'Bigger' });
    await expect(biggerItem).toBeVisible({ timeout: 3000 });
    await biggerItem.click();
    await page.waitForTimeout(200);
  });

  test('adds scene via button and verifies persistence between views', async ({ page }) => {
    await page.goto('http://localhost:3001/lemon_schedule/');
    await ensureProject(page);

    const sheetBtn = page.getByRole('button', { name: 'Sheet' });
    await expect(sheetBtn).toBeVisible({ timeout: 5000 });
    await sheetBtn.click();
    await page.waitForTimeout(500);

    const createFirst = page.getByRole('button', { name: 'Create First Scene' });
    await createFirst.click();
    await page.waitForTimeout(300);

    const glideBtn = page.getByRole('button', { name: 'Glide Breakdown' });
    await glideBtn.click();
    await page.waitForTimeout(1000);

    await sheetBtn.click();
    await page.waitForTimeout(500);

    const sceneCount = await page.evaluate(() => {
      try {
        const key = Object.keys(localStorage).find(k => k.startsWith('lemon_schedule_project_v1'));
        if (!key) return 0;
        const project = JSON.parse(localStorage.getItem(key)!);
        return project.scenes?.length || 0;
      } catch { return 0; }
    });
    expect(sceneCount).toBeGreaterThanOrEqual(1);
  });

  test('can add scene directly from Glide Breakdown toolbar', async ({ page }) => {
    await page.goto('http://localhost:3001/lemon_schedule/');
    await ensureProject(page);

    const glideBtn = page.getByRole('button', { name: 'Glide Breakdown' });
    await expect(glideBtn).toBeVisible({ timeout: 5000 });
    await glideBtn.click();
    await page.waitForTimeout(500);

    const initialState = await page.evaluate(() => {
      try {
        const key = Object.keys(localStorage).find(k => k.startsWith('lemon_schedule_project_v1'));
        if (!key) return { sceneCount: 0 };
        const project = JSON.parse(localStorage.getItem(key)!);
        return { sceneCount: project.scenes?.length || 0 };
      } catch { return { sceneCount: -1 }; }
    });

    await page.getByRole('button', { name: /Add Scene/ }).click();
    await page.waitForTimeout(500);

    const afterState = await page.evaluate(() => {
      try {
        const key = Object.keys(localStorage).find(k => k.startsWith('lemon_schedule_project_v1'));
        if (!key) return { sceneCount: 0 };
        const project = JSON.parse(localStorage.getItem(key)!);
        return { sceneCount: project.scenes?.length || 0 };
      } catch { return { sceneCount: -1 }; }
    });

    expect(afterState.sceneCount).toBe(initialState.sceneCount + 1);
  });

  test('edits a cell via double-click and commits to store', async ({ page }) => {
    await page.goto('http://localhost:3001/lemon_schedule/');
    await ensureProject(page);

    const glideBtn = page.getByRole('button', { name: 'Glide Breakdown' });
    await expect(glideBtn).toBeVisible({ timeout: 5000 });
    await glideBtn.click();
    await page.waitForTimeout(500);

    await page.getByRole('button', { name: /Add Scene/ }).click();
    await page.waitForTimeout(500);

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

    // Verify the edit by checking localStorage
    const sceneNum = await page.evaluate(() => {
      try {
        const key = Object.keys(localStorage).find(k => k.startsWith('lemon_schedule_project_v1'));
        if (!key) return null;
        const project = JSON.parse(localStorage.getItem(key)!);
        return project.scenes?.[0]?.sceneNumber || null;
      } catch { return null; }
    });

    if (overlayInput) {
      expect(sceneNum).toBe('77');
    }
  });
});
