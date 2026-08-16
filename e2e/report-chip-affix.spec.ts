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

  // clicking the multi-value chip shows the affix section INSIDE the chrome —
  // no popover floating over the editor
  await chip.click();
  await page.waitForTimeout(300);
  await expect(chrome).toContainText('Item formatting — Cast Members List', { timeout: 3000 });
  await expect(chrome.getByText(/^Prefix$/)).toBeVisible();
  await expect(chrome.getByText(/^Suffix$/)).toBeVisible();
  await expect(chrome.getByText(/^Sep$/)).toBeVisible();

  // typing an item prefix patches ONLY that chip: the stored token gains pipes
  // and the chip renders the customized-* cue
  const prefixInput = chrome.getByLabel('Item prefix');
  await prefixInput.fill('· ');
  await page.waitForTimeout(300);
  await expect(chip).toContainText('*', { timeout: 3000 });
  await expect(chrome).toContainText('Item formatting — Cast Members List');
  await expect(prefixInput).toHaveValue('· ');

  // the section closes with ✕
  await chrome.getByText('✕').click();
  await page.waitForTimeout(200);
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
