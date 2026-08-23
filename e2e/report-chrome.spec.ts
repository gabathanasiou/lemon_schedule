import { test, expect } from '@playwright/test';
import { openSeededProject } from './helpers';

async function openDesigner(page: any) {
  await openSeededProject(page);
  await page.getByRole('button', { name: 'Design', exact: true }).click();
  await page.getByRole('button', { name: 'Reports Designer', exact: true }).click();
  }

test('block chrome stays fully inside the viewport, also after scrolling', async ({ page }) => {
  await openDesigner(page);

  const title = page.getByText('Town - Jason — One-Liner').first();
  await expect(title).toBeVisible({ timeout: 5000 });
  await title.click();
  
  const chrome = page.locator('.block-chrome');
  await expect(chrome).toBeVisible({ timeout: 3000 });

  const assertInViewport = async () => {
    const box = await chrome.boundingBox();
    const vw = page.viewportSize()!.width;
    const vh = page.viewportSize()!.height;
    expect(box, 'chrome must be visible').not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(vw + 1);
    expect(box!.y + box!.height).toBeLessThanOrEqual(vh + 1);
  };
  await assertInViewport();

  // scroll the canvas far down — the chrome must follow and stay inside.
  // Wheel over blank canvas space: the floating chrome sits above the title
  // card and would otherwise intercept the hover/scroll.
  await page.mouse.move(400, 400);
  await page.mouse.wheel(0, 4000);
    await assertInViewport();
  await expect(chrome).toBeVisible({ timeout: 3000 });

  // scroll back up — still visible and positioned
  await page.mouse.wheel(0, -4000);
    await assertInViewport();
});

test('table column chrome stays inside the viewport and anchors to its column', async ({ page }) => {
  await openDesigner(page);

  const table = page.locator('.report-table-cols').first();
  await expect(table).toBeVisible({ timeout: 5000 });

  // select the LAST column so the header cell is far right
  const cols = await table.locator('[data-table-col-ci]').evaluateAll(
    els => new Set(els.map(el => el.getAttribute('data-table-col-ci'))).size,
  );
  await table.locator(`[data-table-col-ci="${cols - 1}"]`).nth(1).click({ position: { x: 5, y: 3 } });
  
  const colChrome = page.locator('.table-column-chrome');
  await expect(colChrome).toBeVisible({ timeout: 3000 });
  await expect(colChrome).toContainText(`Column ${cols} of ${cols}`);

  const box = await colChrome.boundingBox();
  const vw = page.viewportSize()!.width;
  const vh = page.viewportSize()!.height;
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(vw + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(vh + 1);

  // editing must not deselect the column (portal events must not leak to the card)
  await colChrome.getByLabel('Insert column before').click();
    await expect(colChrome).toBeVisible({ timeout: 3000 });
  await expect(colChrome).toContainText(`Column ${cols} of ${cols + 1}`);
  expect(await table.locator('[data-table-col-ci]').evaluateAll(
    els => new Set(els.map(el => el.getAttribute('data-table-col-ci'))).size,
  )).toBe(cols + 1);
});

test('token autocomplete anchors to the caret and stays inside the window', async ({ page }) => {
  await openDesigner(page);

  const title = page.getByText('Town - Jason — One-Liner').first();
  await expect(title).toBeVisible({ timeout: 5000 });
  await title.click();
  
  const editor = page.locator('.block-chrome .richtext-editor');
  await editor.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' @');

  const popover = page.locator('.ac-token-popover');
  await expect(popover).toBeVisible({ timeout: 3000 });

  const dump = await page.evaluate(() => {
    const pop = document.querySelector('.ac-token-popover') as HTMLElement;
    const chrome = document.querySelector('.block-chrome') as HTMLElement;
    const sel = window.getSelection();
    const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
    const caret = range ? range.getClientRects()[0] : null;
    const pb = pop.getBoundingClientRect();
    const cs = getComputedStyle(chrome);
    return {
      popBox: { x: pb.x, y: pb.y, right: pb.right, bottom: pb.bottom },
      caret: caret ? { left: caret.left, top: caret.top } : null,
      chromeTransform: cs.transform,
      vw: window.innerWidth, vh: window.innerHeight,
    };
  });
  expect(dump.popBox.x).toBeGreaterThanOrEqual(0);
  expect(dump.popBox.y).toBeGreaterThanOrEqual(0);
  expect(dump.popBox.right).toBeLessThanOrEqual(dump.vw);
  expect(dump.popBox.bottom).toBeLessThanOrEqual(dump.vh);
  if (dump.caret) expect(Math.abs(dump.popBox.x - dump.caret.left)).toBeLessThan(6);
  // the chrome must not use transform — it would hijack fixed descendants
  expect(dump.chromeTransform).toBe('none');

  // keyboard navigation + pick still works, and the caret can move afterwards
  const count = await popover.locator('button').count();
  expect(count).toBeGreaterThan(1);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
    await expect(popover).toHaveCount(0);
  await page.keyboard.type(' end');
  await expect(editor).toContainText('end', { timeout: 3000 });
});

test('columns block: clicking a column shows the chrome; move left/right and delete work', async ({ page }) => {
  await openDesigner(page);

  // add a Columns block from the palette
  await page.getByRole('button', { name: 'Columns' }).click();
    const columnsBlock = page.locator('.block-card.block-type-columns');
  await expect(columnsBlock).toBeVisible({ timeout: 3000 });

  // select the block → add two columns from its Content section
  await columnsBlock.click();
    const addCol = page.locator('.block-chrome').getByLabel('Add column');
  await expect(addCol).toBeVisible({ timeout: 3000 });
  // the Add-column button lives in the Content section, not the header bar
  // (the chrome panel is a flex column: wrapper's first child = header)
  const headerBar = page.locator('.block-chrome .flex.flex-col > div').first();
  await expect(headerBar.getByLabel('Add column')).toHaveCount(0);
  await expect(page.locator('.block-chrome')).toContainText('Content');
  await addCol.click();
  await addCol.click();
    await expect(columnsBlock.locator('.columns-col')).toHaveCount(2, { timeout: 3000 });

  // the header bar spans the full chrome width (only the panel's 8px padding
  // separates it from the chrome edges — no leftover min-width gap)
  const chromeBox = await page.locator('.block-chrome').boundingBox();
  const headerBox = await headerBar.boundingBox();
  expect(chromeBox!.width - headerBox!.width).toBeLessThanOrEqual(18);

  // click the empty area of the first column → column chrome appears
  const firstCol = columnsBlock.locator('.columns-col').first();
  await firstCol.click({ position: { x: 20, y: 20 } });
  
  const colChrome = page.locator('.column-chrome');
  await expect(colChrome).toBeVisible({ timeout: 3000 });
  await expect(colChrome).toContainText('Column 1 of 2');

  // move right → selection follows
  await colChrome.getByLabel('Move column right').click();
    await expect(colChrome).toContainText('Column 2 of 2', { timeout: 3000 });

  // move back left
  await colChrome.getByLabel('Move column left').click();
    await expect(colChrome).toContainText('Column 1 of 2', { timeout: 3000 });

  // insert before → 3 columns
  await colChrome.getByLabel('Insert column before').click();
    await expect(colChrome).toContainText('Column 1 of 3', { timeout: 3000 });

  // delete → back to 2, chrome closes
  await colChrome.getByLabel('Delete column').click();
    await expect(page.locator('.column-chrome')).toHaveCount(0);
  await expect(columnsBlock.locator('.columns-col')).toHaveCount(2);
});
