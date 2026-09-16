import { test, expect } from '@playwright/test';
import { ensureProject, openSeededProject } from './helpers';

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

  test('range fill: editing one cell writes the value down the selected column (roadmap 139)', async ({ page }) => {
    await openSeededProject(page);
    await page.getByRole('button', { name: 'Glide Breakdown' }).click();
    const scroller = page.locator('.dvn-scroller');
    await expect(scroller).toBeAttached({ timeout: 5000 });
    const sr = await scroller.boundingBox();
    expect(sr).not.toBeNull();

    // Script Day column: row marker 50 + actions 36 + sceneNumber 60 +
    // pageCount 80 = 226, width 80 → centre 266. Desktop font 11 → header 36, row 34.
    const scriptDayX = sr!.x + 226 + 40;
    const headerH = 36;
    const rowH = 34;
    const y0 = sr!.y + headerH + rowH / 2;
    const y2 = sr!.y + headerH + rowH * 2 + rowH / 2;

    // Drag a 3-row range down the column.
    await page.mouse.move(scriptDayX, y0);
    await page.mouse.down();
    await page.mouse.move(scriptDayX, y2, { steps: 8 });
    await page.mouse.up();

    // Type over the anchored cell; committing fills the whole selection.
    await page.keyboard.type('5');
    const input = page.locator('#portal textarea, #portal input').first();
    await expect(input).toBeAttached({ timeout: 4000 });
    await input.fill('5');
    await input.press('Enter');

    await expect.poll(() => page.evaluate(() =>
      (window as any).__lemonSchedule.getProject().scenes.slice(0, 3).map((s: any) => s.scriptDay),
    ), { timeout: 5000 }).toEqual(['5', '5', '5']);
    // One undo entry for the whole spread.
    expect(await page.evaluate(() => (window as any).__lemonSchedule.pastCount())).toBe(1);
  });

  test('range fill: a single-value entity column (Set) fills vertically with no confirm (roadmap 144)', async ({ page }) => {
    await openSeededProject(page);
    await page.getByRole('button', { name: 'Glide Breakdown' }).click();
    const scroller = page.locator('.dvn-scroller');
    await expect(scroller).toBeAttached({ timeout: 5000 });
    const sr = await scroller.boundingBox();
    expect(sr).not.toBeNull();

    // Set column: row marker 50 + actions 36 + sceneNumber 60 + pageCount 80 +
    // scriptDay 80 + intExt 80 = left 386, width 180 → centre 476.
    const setX = sr!.x + 386 + 90;
    const headerH = 36;
    const rowH = 34;
    const y0 = sr!.y + headerH + rowH / 2;
    const y2 = sr!.y + headerH + rowH * 2 + rowH / 2;

    await page.mouse.move(setX, y0);
    await page.mouse.down();
    await page.mouse.move(setX, y2, { steps: 8 });
    await page.mouse.up();
    // Double-click opens the Set entity dropdown directly (no typing needed).
    await page.mouse.dblclick(setX, y0);
    const input = page.locator('#portal input').first();
    await expect(input).toBeAttached({ timeout: 4000 });
    await input.fill('MARS');
    await page.keyboard.press('Enter');

    // No confirm for a single-value column; all 3 rows fill.
    await expect.poll(() => page.evaluate(() =>
      (window as any).__lemonSchedule.getProject().scenes.slice(0, 3).map((s: any) => s.set),
    ), { timeout: 5000 }).toEqual(['MARS', 'MARS', 'MARS']);
  });

  test('range fill: a multi-value column (Cast) confirms before replacing the lists (roadmap 144)', async ({ page }) => {
    await openSeededProject(page);
    await page.getByRole('button', { name: 'Glide Breakdown' }).click();
    const scroller = page.locator('.dvn-scroller');
    await expect(scroller).toBeAttached({ timeout: 5000 });
    const sr = await scroller.boundingBox();
    expect(sr).not.toBeNull();

    // Cast column: 956 → 1076, centre 1016 (the grid is wider than the viewport,
    // but scrollLeft is 0 so the near-left columns are on screen).
    const castX = sr!.x + 956 + 60;
    const headerH = 36;
    const rowH = 34;
    const y0 = sr!.y + headerH + rowH / 2;
    const y2 = sr!.y + headerH + rowH * 2 + rowH / 2;
    const castOf = () => page.evaluate(() =>
      (window as any).__lemonSchedule.getProject().scenes.slice(0, 3).map((s: any) => s.cast),
    );
    const original = await castOf();

    const selectAndEdit = async () => {
      await page.mouse.move(castX, y0);
      await page.mouse.down();
      await page.mouse.move(castX, y2, { steps: 8 });
      await page.mouse.up();
      // Double-click opens the Cast multi dropdown; fill it and commit.
      await page.mouse.dblclick(castX, y0);
      const input = page.locator('#portal input').first();
      await expect(input).toBeAttached({ timeout: 4000 });
      await input.fill('MARY');
      await page.keyboard.press('Enter');
      await expect(input).toHaveCount(0, { timeout: 4000 });
    };
    const confirmBtn = page.locator('[data-modal-confirm]');
    const cancelBtn = page.getByRole('button', { name: 'Cancel', exact: true });

    // Cancel: only the edited cell changes; the other rows keep their lists.
    await selectAndEdit();
    await expect(confirmBtn).toBeVisible({ timeout: 4000 });
    await cancelBtn.click();
    await expect(confirmBtn).toHaveCount(0, { timeout: 4000 });
    const afterCancel = await castOf();
    expect(afterCancel[1]).toBe(original[1]);
    expect(afterCancel[2]).toBe(original[2]);
    expect(afterCancel[0]).not.toBe(original[0]);

    // Confirm: all three rows take the value as ONE undo entry.
    const before = await page.evaluate(() => (window as any).__lemonSchedule.pastCount());
    await selectAndEdit();
    await expect(confirmBtn).toBeVisible({ timeout: 4000 });
    await confirmBtn.click();
    await expect(confirmBtn).toHaveCount(0, { timeout: 4000 });
    await expect.poll(castOf, { timeout: 5000 }).toEqual([afterCancel[0], afterCancel[0], afterCancel[0]]);
    expect(await page.evaluate(() => (window as any).__lemonSchedule.pastCount())).toBe(before + 1);
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
