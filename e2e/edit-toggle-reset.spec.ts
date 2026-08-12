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

async function rowCellInfo(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const row = document.querySelector(sel);
    if (!row) return null;
    const info = { rowId: row.getAttribute('data-row-id'), editableInputs: 0, inputs: [] as any[] };
    row.querySelectorAll('input.cell-input, textarea.cell-input').forEach((el) => {
      const inp = el as HTMLInputElement;
      info.inputs.push({ readOnly: inp.readOnly, tag: inp.tagName });
      if (!inp.readOnly) info.editableInputs++;
    });
    return info;
  }, selector);
}

test('edit toggle reset check', async ({ page }) => {
  test.setTimeout(120000);
  await openSeeded(page);
  await page.getByRole('button', { name: 'Schedule', exact: true }).click();
  await page.waitForSelector('[data-row-id]', { timeout: 15000 });
  await page.waitForTimeout(1000);

  const sceneSel = '[data-row-id]:not([aria-disabled="true"])';
  const tapped = page.locator(sceneSel).nth(2);
  const tappedId = await tapped.getAttribute('data-row-id');
  const infoBefore = await rowCellInfo(page, `${sceneSel}[data-row-id="${tappedId}"]`);
  console.log('[before]', JSON.stringify(infoBefore));

  const editBtn = page.locator('button:has-text("Edit")').last();
  await editBtn.click({ timeout: 5000 });
  await page.waitForTimeout(400);
  await tapped.click({ timeout: 5000 });
  await page.waitForTimeout(400);
  const infoEdit = await rowCellInfo(page, `${sceneSel}[data-row-id="${tappedId}"]`);
  console.log('[edit-on-tapped]', JSON.stringify(infoEdit));

  await editBtn.click({ timeout: 5000 });
  await page.waitForTimeout(400);
  const infoOff = await rowCellInfo(page, `${sceneSel}[data-row-id="${tappedId}"]`);
  console.log('[edit-off]', JSON.stringify(infoOff));
});
