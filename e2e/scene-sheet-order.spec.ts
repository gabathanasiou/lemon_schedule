import { test, expect } from '@playwright/test';
import { openSeededProject } from './helpers';

// Scene sheet view order (roadmap 51): the sheet navigates by Sheet order
// (default), Scene Number order, or the current stripboard order. The order
// is a view-only preference — project.scenes is never reordered; the Sheet #
// column always shows the TRUE sheet number (array index + 1).

const project = (page: import('@playwright/test').Page) =>
  page.evaluate(() => (window as any).__lemonSchedule.getProject());

const sheetMarker = (page: import('@playwright/test').Page) =>
  page.locator('table tr').first().locator('td,th').nth(1).textContent();

const sceneNoInput = (page: import('@playwright/test').Page) =>
  page.locator('tr:has-text("Scene No.") input').first();

const sheetJumpInput = (page: import('@playwright/test').Page) =>
  page.getByLabel('Sheet number');

const stripboardSceneIds = async (page: import('@playwright/test').Page) => {
  const p = await project(page);
  const v = p.versions.find((x: any) => x.id === p.activeVersionId);
  return v.rows
    .filter((r: any) => r.type === 'SCENE' && r.containerId !== null)
    .map((r: any) => r.sceneId);
};

const switchOrder = async (page: import('@playwright/test').Page, label: string) => {
  await page.getByRole('button', { name: /Order$/ }).click();
  await page.getByRole('menuitem', { name: label }).click();
  await expect(page.getByRole('menu')).toHaveCount(0);
};

test.describe('scene sheet view order (roadmap 51)', () => {
  test('three orders render distinct sequences with true sheet numbers', async ({ page }) => {
    await openSeededProject(page);
    await page.getByRole('button', { name: 'Sheet' }).click();

    const p0 = await project(page);
    const firstScene = p0.scenes[0];

    // Default: Sheet order — sheet # = array index + 1, scene no = its number.
    expect((await sheetMarker(page))?.trim()).toBe('1');
    await expect(sceneNoInput(page)).toHaveValue(String(firstScene.sceneNumber));

    // Scene Number order: the natural-min sceneNumber comes first; the Sheet #
    // marker still shows the true array index + 1 of that scene.
    const minScene = [...p0.scenes].sort((a: any, b: any) => a.sceneNumber.localeCompare(b.sceneNumber, undefined, { numeric: true }))[0];
    await switchOrder(page, 'Scene Number Order');
    await sheetJumpInput(page).fill('1');
    await page.keyboard.press('Enter');
    await expect(sceneNoInput(page)).toHaveValue(String(minScene.sceneNumber));
    expect((await sheetMarker(page))?.trim()).toBe(String(p0.scenes.indexOf(minScene) + 1));

    // Stripboard order: the first stripboard row's scene comes first.
    const boardIds = await stripboardSceneIds(page);
    expect(boardIds.length).toBeGreaterThan(0);
    await switchOrder(page, 'Stripboard Order');
    await sheetJumpInput(page).fill('1');
    await page.keyboard.press('Enter');
    const boardFirst = p0.scenes.find((s: any) => s.id === boardIds[0]);
    await expect(sceneNoInput(page)).toHaveValue(String(boardFirst.sceneNumber));
    expect((await sheetMarker(page))?.trim()).toBe(String(p0.scenes.indexOf(boardFirst) + 1));

    // Boneyard scenes append after the board scenes: jumping to the last
    // position lands on a scene whose stripboard row has containerId null.
    await sheetJumpInput(page).fill(String(p0.scenes.length));
    await page.keyboard.press('Enter');
    await expect.poll(async () => {
      const p = await project(page);
      const v = p.versions.find((x: any) => x.id === p.activeVersionId);
      const boardIds = v.rows.filter((r: any) => r.type === 'SCENE' && r.containerId !== null).map((r: any) => r.sceneId);
      const onBoard = new Set(boardIds);
      const rest = p.scenes.filter((s: any) => !onBoard.has(s.id));
      // The true sheet # (marker) identifies the displayed scene exactly.
      const sheetIdx = parseInt((await sheetMarker(page))?.trim() ?? '', 10) - 1;
      const displayed = p.scenes[sheetIdx];
      if (!displayed) return null;
      const isExpected = displayed.id === rest[rest.length - 1].id;
      const row = v.rows.find((r: any) => r.type === 'SCENE' && r.sceneId === displayed.id);
      return isExpected && row && row.containerId === null ? 'ok' : 'no';
    }).toBe('ok');
  });

  test('switching order keeps the current scene; navigation follows the order; edits commit to the right scene', async ({ page }) => {
    await openSeededProject(page);
    await page.getByRole('button', { name: 'Sheet' }).click();

    // Jump to sheet 34 (a scene in the middle), then switch to Stripboard
    // order — the SAME scene must stay visible.
    await sheetJumpInput(page).fill('34');
    await page.keyboard.press('Enter');
    await expect(sceneNoInput(page)).toHaveValue('34');

    const sceneIdAt = async () => {
      const p = await project(page);
      const no = await sceneNoInput(page).inputValue();
      return p.scenes.find((s: any) => s.sceneNumber === no)?.id;
    };
    const beforeId = await sceneIdAt();

    await switchOrder(page, 'Stripboard Order');
    await expect.poll(async () => sceneIdAt()).toBe(beforeId);

    // Prev arrow follows the stripboard order (a different scene than sheet-34's neighbor).
    await page.locator('button:has(svg.lucide-chevron-left)').first().click();
    const prevId = await sceneIdAt();
    expect(prevId).not.toBe(beforeId);

    // An edit in stripboard order commits to the correct scene.
    await sceneNoInput(page).fill('999');
    await page.keyboard.press('Enter');
    await expect.poll(async () => {
      const p = await project(page);
      return p.scenes.find((s: any) => s.id === prevId)?.sceneNumber;
    }).toBe('999');
    // The sheet-order scene is untouched.
    expect((await project(page)).scenes.find((s: any) => s.id === beforeId)?.sceneNumber).toBe('34');

    // Undo restores the edit (bridge-driven, one undo entry).
    await page.evaluate(() => (window as any).__lemonSchedule.undo());
    await expect.poll(async () => {
      const p = await project(page);
      return p.scenes.find((s: any) => s.id === prevId)?.sceneNumber;
    }).not.toBe('999');
  });

  test('preference persists across reload', async ({ page }) => {
    await openSeededProject(page);
    await page.getByRole('button', { name: 'Sheet' }).click();
    await switchOrder(page, 'Scene Number Order');
    await expect(page.getByRole('button', { name: 'Scene Number Order' })).toBeVisible();

    await page.reload();
    await page.getByText('Town - Jason', { exact: true }).first().click();
    await page.getByRole('button', { name: 'Sheet' }).click();
    await expect(page.getByRole('button', { name: 'Scene Number Order' })).toBeVisible();
    const pref = await page.evaluate(() => JSON.parse(localStorage.getItem('lemon_schedule_breakdown_order') || '{}').order);
    expect(pref).toBe('sceneNumber');
  });
});
