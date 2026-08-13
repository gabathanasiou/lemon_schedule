import { test, expect } from '@playwright/test';
import { openSeededProject } from './helpers';

async function openDesigner(page: any) {
  await openSeededProject(page);
  await page.getByRole('button', { name: 'Design', exact: true }).click();
  await page.getByRole('button', { name: 'Reports Designer', exact: true }).click();
  await page.waitForTimeout(500);
}

test('palette search finds out-of-scope attributes and marks them unavailable', async ({ page }) => {
  await openDesigner(page);

  const search = page.getByPlaceholder('Search blocks & attributes…');
  await expect(search).toBeVisible({ timeout: 5000 });
  await search.fill('Day #');

  // out of scope at top level → greyed with the unavailable tag, still listed
  await expect(page.getByText('Day #', { exact: true })).toBeVisible({ timeout: 3000 });
  await expect(page.getByText('Not available here').first()).toBeVisible({ timeout: 3000 });

  // search still finds block types too
  await search.fill('page');
  await expect(page.getByText('Page Break', { exact: true })).toBeVisible({ timeout: 3000 });

  // clear restores the scoped list
  await page.locator('button[title="Clear search"]').click();
  await expect(page.getByText('Day #', { exact: true })).toHaveCount(0);
});

test('floating block editor shows per-type controls on selection', async ({ page }) => {
  await openDesigner(page);

  // the one-liner title text block
  const title = page.getByText('Town - Jason — One-Liner').first();
  await expect(title).toBeVisible({ timeout: 5000 });
  await title.click();
  await page.waitForTimeout(300);

  const chrome = page.locator('.block-chrome');
  await expect(chrome).toBeVisible({ timeout: 3000 });
  // rich text editor + formatting toolbar + token picker
  await expect(chrome.locator('.richtext-editor')).toBeVisible({ timeout: 3000 });
  await expect(chrome.getByRole('button', { name: 'Insert attribute…' })).toBeVisible({ timeout: 3000 });
  // style + layout rows
  await expect(chrome.getByText('Style', { exact: true })).toBeVisible({ timeout: 3000 });
  await expect(chrome.getByText('Layout', { exact: true })).toBeVisible({ timeout: 3000 });

  // editing the editor updates the canvas render
  await chrome.locator('.richtext-editor').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' — DRAFT');
  await page.waitForTimeout(300);
  await expect(page.getByText('Town - Jason — One-Liner — DRAFT')).toBeVisible({ timeout: 3000 });
});

async function countColumns(page: any, table: any): Promise<number> {
  return table.locator('[data-table-col-ci]').evaluateAll(
    (els: Element[]) => new Set(els.map(el => el.getAttribute('data-table-col-ci'))).size,
  );
}

test('table columns edit on the canvas: select, insert, reorder', async ({ page }) => {
  await openDesigner(page);

  const table = page.locator('.report-table-cols').first();
  await expect(table).toBeVisible({ timeout: 5000 });
  expect(await countColumns(page, table)).toBe(8);

  // click the first data cell of column 1 → column chrome appears
  await table.locator('[data-table-col-ci="0"]').nth(1).click({ position: { x: 5, y: 3 } });
  await page.waitForTimeout(300);

  const colChrome = page.locator('.table-column-chrome');
  await expect(colChrome).toBeVisible({ timeout: 3000 });
  await expect(colChrome).toContainText('Column 1 of 8');

  // insert a column before → count grows, empty column lands at index 0
  await colChrome.getByLabel('Insert column before').click();
  await page.waitForTimeout(300);
  await expect(colChrome).toContainText('Column 1 of 9');
  expect(await countColumns(page, table)).toBe(9);

  // move the (empty) selected column right → the original column takes index 0
  await colChrome.getByLabel('Move column right').click();
  await page.waitForTimeout(300);
  await expect(colChrome).toContainText('Column 2 of 9');
  await expect(table.locator('[data-table-col-ci="0"]').first()).toContainText('Day', { timeout: 3000 });

  // delete the inserted column → back to 8
  await colChrome.getByLabel('Delete column').click();
  await page.waitForTimeout(300);
  expect(await countColumns(page, table)).toBe(8);
});

test('drag-reorder moves a table column via the header grip', async ({ page }) => {
  await openDesigner(page);

  const table = page.locator('.report-table-cols').first();
  await expect(table).toBeVisible({ timeout: 5000 });

  const c0 = table.locator('[data-table-col-ci="0"]').first();
  const c1 = table.locator('[data-table-col-ci="1"]').first();
  await expect(c0).toContainText('Day');
  await expect(c1).toContainText('Scene #');

  const box0 = await c0.boundingBox();
  const box1 = await c1.boundingBox();
  if (!box0 || !box1) throw new Error('no boxes');

  // drag from the middle of column 0 into the middle of column 1
  await page.mouse.move(box0.x + box0.width / 2, box0.y + box0.height / 2);
  await page.mouse.down();
  await page.mouse.move(box1.x + box1.width / 2, box1.y + box1.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(400);

  // column 0 is now the former column 1 (Scene #)
  await expect(table.locator('[data-table-col-ci="0"]').first()).toContainText('Scene #', { timeout: 3000 });
  await expect(table.locator('[data-table-col-ci="1"]').first()).toContainText('Day', { timeout: 3000 });
});
