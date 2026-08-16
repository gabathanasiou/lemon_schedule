import { test, expect } from '@playwright/test';
import { openSeededProject } from './helpers';

async function openDesigner(page: any) {
  await openSeededProject(page);
  await page.getByRole('button', { name: 'Design', exact: true }).click();
  await page.getByRole('button', { name: 'Reports Designer', exact: true }).click();
  await page.waitForTimeout(500);
}

test('chip affix editor: list-only section in the properties panel, no popover', async ({ page }) => {
  await openDesigner(page);

  // switch to the Scene Breakdown design (its repeat contains a Cast: {{cast}}
  // text block — a multi-value chip in scenes scope)
  await page.getByText('Editing: One-Liner', { exact: true }).click();
  await page.getByRole('menuitem', { name: 'Scene Breakdown' }).click();
  await page.waitForTimeout(500);

  const chrome = page.locator('.block-chrome');

  // click the first Cast: text block inside the repeat → chrome opens
  const castCard = page.locator('.block-card.block-type-text').filter({ hasText: 'Cast' }).first();
  await expect(castCard).toBeVisible({ timeout: 5000 });
  await castCard.click();
  await page.waitForTimeout(400);
  await expect(chrome).toBeVisible({ timeout: 3000 });

  // text blocks no longer have the Layout (padding) section
  await expect(chrome).not.toContainText('Pad V');

  const editor = chrome.locator('.richtext-editor');
  const chip = editor.locator('.rt-token').first();
  await expect(chip).toBeVisible({ timeout: 3000 });
  await expect(chip).toContainText('Cast Members List');

  // selecting the multi-value chip shows the affix section INSIDE the chrome —
  // no popover floating over the editor
  await chip.click();
  await page.waitForTimeout(300);
  await expect(chrome).toContainText('Item formatting — Cast Members List', { timeout: 3000 });
  await expect(chrome.getByText(/^Prefix$/)).toBeVisible();
  await expect(chrome.getByText(/^Suffix$/)).toBeVisible();
  await expect(chrome.getByText(/^Sep$/)).toBeVisible();

  // REAL keystrokes in the affix input must keep the input focused (the patch
  // must not steal focus into the editor) and patch the chip on EVERY
  // keystroke (target position is remapped, not one-shot)
  const prefixInput = chrome.getByLabel('Item prefix');
  await prefixInput.click();
  await page.keyboard.type('· ');
  await page.waitForTimeout(300);
  await expect(prefixInput).toHaveValue('· ', { timeout: 3000 });
  const focusedTag = await page.evaluate(() => (document.activeElement as HTMLElement)?.getAttribute('aria-label') ?? document.activeElement?.tagName);
  expect(focusedTag).toBe('Item prefix');
  await expect(chip).toContainText('*', { timeout: 3000 });
  await expect(chrome).toContainText('Item formatting — Cast Members List');

  // the canvas must resolve the affixed token live (the prefix is applied to
  // the sampled scene's cast items)
  const canvasCastCard = page.locator('.block-card.block-type-text').filter({ hasText: 'Cast' }).first();
  await expect(canvasCastCard).toContainText('Cast: · ', { timeout: 3000 });
  await expect(canvasCastCard).not.toContainText('{{cast}}');

  // the section shows only while the chip is SELECTED — clicking into the text
  // deselects the chip and hides it (no ✕ needed)
  await editor.click({ position: { x: 4, y: 4 } });
  await page.keyboard.press('Home');
  await page.waitForTimeout(300);
  await expect(chrome).not.toContainText('Item formatting');

  // a SINGLE-VALUE chip must NOT open the affix section
  const titleCard = page.locator('.block-card.block-type-text').filter({ hasText: 'Scene Breakdown' }).first();
  await expect(titleCard).toBeVisible({ timeout: 5000 });
  await titleCard.click();
  await page.waitForTimeout(400);
  await expect(chrome).toContainText('Scene Breakdown', { timeout: 3000 });
  const titleChip = chrome.locator('.richtext-editor .rt-token').first();
  await expect(titleChip).toBeVisible({ timeout: 3000 });
  await expect(titleChip).toContainText('Title');
  await titleChip.click();
  await page.waitForTimeout(300);
  await expect(chrome).not.toContainText('Item formatting');
});
