import { test, expect } from '@playwright/test';
import { openSeededProject, seedTitle } from './helpers';

async function openDesigner(page: any) {
  await openSeededProject(page);
  await page.getByRole('button', { name: 'Design', exact: true }).click();
  await page.getByRole('button', { name: 'Reports Designer', exact: true }).click();
  }

async function openTitleChrome(page: any) {
  await openDesigner(page);
  const title = page.getByText(`${seedTitle()} — One-Liner`).first();
  await expect(title).toBeVisible({ timeout: 5000 });
  await title.click();
    const chrome = page.locator('.block-chrome');
  await expect(chrome).toBeVisible({ timeout: 3000 });
  return chrome;
}

/** Inserts a fresh text block into the (empty) header zone — a block with no
 *  style and no direct formatting, so the format toggles are fully free. */
async function insertFreshTextBlock(page: any) {
  await openDesigner(page);
  const headerZone = page.locator('.report-zone[data-zone-list="header"]');
  await expect(headerZone).toBeVisible({ timeout: 5000 });
  await headerZone.getByText('Empty — click or drag palette items here').click();
    const chrome = page.locator('.block-chrome');
  await expect(chrome).toBeVisible({ timeout: 3000 });
  return { chrome, block: headerZone.locator('.report-text-block') };
}

const ON_CLS = 'bg-blue-900/50';

test('format toggles light up from the selection (bold, italic, underline)', async ({ page }) => {
  const { chrome, block } = await insertFreshTextBlock(page);
  const editor = chrome.locator('.richtext-editor');
  await editor.click();
  await page.keyboard.type('Hello world');

  // select all, hit B → button lights + canvas text wrapped bold
  await page.keyboard.press('Meta+a');
  await chrome.getByRole('button', { name: 'Bold' }).click();
  await expect(chrome.getByRole('button', { name: 'Bold' })).toHaveClass(new RegExp(ON_CLS), { timeout: 3000 });
  let canvasHtml = await block.evaluate(el => el.innerHTML);
  expect(canvasHtml).toContain('<b>');

  // U (previously dead — extension missing) → lights + canvas underlined
  await chrome.getByRole('button', { name: 'Underline' }).click();
  await expect(chrome.getByRole('button', { name: 'Underline' })).toHaveClass(new RegExp(ON_CLS), { timeout: 3000 });
  canvasHtml = await block.evaluate(el => el.innerHTML);
  expect(canvasHtml).toContain('<u>');

  // I → lights
  await chrome.getByRole('button', { name: 'Italic' }).click();
  await expect(chrome.getByRole('button', { name: 'Italic' })).toHaveClass(new RegExp(ON_CLS), { timeout: 3000 });
  canvasHtml = await block.evaluate(el => el.innerHTML);
  expect(canvasHtml).toContain('<i>');

  // caret placed inside the formatted text stays lit (Word behavior)
  await editor.click();
  await page.keyboard.press('Home');
  await expect(chrome.getByRole('button', { name: 'Bold' })).toHaveClass(new RegExp(ON_CLS), { timeout: 3000 });

  // toggling off with everything selected unlights the buttons
  await page.keyboard.press('Meta+a');
  await chrome.getByRole('button', { name: 'Bold' }).click();
  await expect(chrome.getByRole('button', { name: 'Bold' })).not.toHaveClass(new RegExp(ON_CLS), { timeout: 3000 });
  await chrome.getByRole('button', { name: 'Underline' }).click();
  await expect(chrome.getByRole('button', { name: 'Underline' })).not.toHaveClass(new RegExp(ON_CLS), { timeout: 3000 });
  await chrome.getByRole('button', { name: 'Italic' }).click();
  await expect(chrome.getByRole('button', { name: 'Italic' })).not.toHaveClass(new RegExp(ON_CLS), { timeout: 3000 });
});

test('bold with empty selection lights the button immediately', async ({ page }) => {
  const { chrome, block } = await insertFreshTextBlock(page);
  await chrome.locator('.richtext-editor').click();
  await page.keyboard.type('plus');

  // caret at end, empty selection → click Bold
  await chrome.getByRole('button', { name: 'Bold' }).click();
  await expect(chrome.getByRole('button', { name: 'Bold' })).toHaveClass(new RegExp(ON_CLS), { timeout: 3000 });

  // and the next keystroke really is bold
  await page.keyboard.type('x');
    const htmlAfter = await block.evaluate(el => el.innerHTML);
  expect(htmlAfter).toContain('<b>x</b>');
});

test('empty line from Enter renders in the canvas as a <br> paragraph', async ({ page }) => {
  const chrome = await openTitleChrome(page);
  const canvasBlock = page.locator('.report-text-block').first();
  const h1 = (await canvasBlock.boundingBox())!.height;

  await chrome.locator('.richtext-editor').click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('second line');
  
  // stored/render HTML keeps an empty paragraph with a <br> (not <p></p>)
  const html = await canvasBlock.evaluate(el => el.innerHTML);
  expect(html).toContain('<br></p>');
  expect(html).not.toContain('<p></p>');

  // and the block actually grew by a line height
  const h2 = (await canvasBlock.boundingBox())!.height;
  expect(h2).toBeGreaterThan(h1 + 10);
});

test('default color swatch removes the color (editor light, print black)', async ({ page }) => {
  const chrome = await openTitleChrome(page);
  const canvasBlock = page.locator('.report-text-block').first();
  await chrome.locator('.richtext-editor').click();
  await page.keyboard.press('Meta+a');

  // apply red → canvas stores the color (innerHTML normalizes hex → rgb)
  await chrome.getByRole('button', { name: 'Text color' }).click();
  await page.locator('.ui-menu').getByTitle('#b91c1c').click();
    expect(await canvasBlock.evaluate(el => el.innerHTML)).toContain('color: rgb(185, 28, 28)');

  // pick "Default" → color span gone, swatch back to the default glyph
  await chrome.getByRole('button', { name: 'Text color' }).click();
  await page.locator('.ui-menu').getByTitle('Default (black ink)').click();
    expect(await canvasBlock.evaluate(el => el.innerHTML)).not.toContain('color:');
});

test('named style locks redundant B/I but keeps per-word italic + underline', async ({ page }) => {
  const chrome = await openTitleChrome(page);
  const bold = chrome.getByRole('button', { name: 'Bold' });
  const italic = chrome.getByRole('button', { name: 'Italic' });

  // the seeded title block carries whole-block bold → Bold locked from the start
  await expect(bold).toBeDisabled();
  await expect(bold).toHaveClass(new RegExp(ON_CLS));
  await expect(italic).toBeEnabled();
  await expect(chrome.getByRole('button', { name: 'Underline' })).toBeEnabled();

  // apply Heading 1 (bold named style) → still locked
  await chrome.getByRole('button', { name: /Direct formatting/ }).click();
  await page.locator('.ui-menu').getByText('Heading 1', { exact: true }).click();
    await expect(bold).toBeDisabled();
  await expect(bold).toHaveClass(new RegExp(ON_CLS));
  await expect(italic).toBeEnabled();

  // per-word italic still works inside the heading
  await chrome.locator('.richtext-editor').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' one');
  for (let i = 0; i < 3; i++) await page.keyboard.press('Shift+ArrowLeft');
  await italic.click();
    expect(await page.locator('.report-text-block').first().evaluate(el => el.innerHTML)).toContain('<i>one</i>');
});

test('text styles modal: version-picker editing — create, rename, live preview, persist', async ({ page }) => {
  const chrome = await openTitleChrome(page);

  // open the styles modal from the chrome style menu
  await chrome.getByRole('button', { name: /Direct formatting/ }).click();
  await page.locator('.ui-menu').getByText('Edit styles…').click();
  const modal = page.getByRole('dialog');
  await expect(modal).toBeVisible({ timeout: 3000 });
  await expect(modal.getByText('TEXT STYLES')).toBeVisible();

  // the modal must be as compact as its controls — no horizontal overflow
  const overflow = await modal.evaluate(el => el.scrollWidth - el.clientWidth);
  expect(overflow).toBeLessThanOrEqual(2);

  // trigger shows the first registry style
  const trigger = modal.getByRole('button', { name: 'Heading 1' });
  await expect(trigger).toBeVisible({ timeout: 3000 });

  // the dropdown previews each style in its own typography
  await trigger.click();
  const menu = page.locator('.ui-menu');
  await expect(menu.getByText('Heading 1', { exact: true })).toHaveCSS('font-size', '20px');
  await expect(menu.getByText('Body', { exact: true })).toHaveCSS('font-size', '10px');
  await page.keyboard.press('Escape');

  // New Style → inline rename → Enter
  await trigger.click();
  await menu.getByText('New Style', { exact: true }).click();
  const renameInput = page.locator('.ui-menu input');
  await expect(renameInput).toBeVisible({ timeout: 3000 });
  await renameInput.fill('Test');
  await renameInput.press('Enter');

  // the new style is selected in the modal body and the preview follows edits
  await expect(modal.getByRole('button', { name: 'Test' })).toBeVisible({ timeout: 3000 });
  const sizeInput = modal.locator('input[type="number"]');
  await sizeInput.fill('30');
  const preview = modal.getByText('The quick brown fox jumps over the lazy dog');
  await expect(preview).toHaveCSS('font-size', '30px');

  // close the picker menu (stays open after the rename commit)
  await page.keyboard.press('Escape');

  // Done persists — the chrome style menu now offers the new style
  await modal.getByRole('button', { name: 'Done' }).click();
  await expect(modal).toHaveCount(0);
  await chrome.getByRole('button', { name: /Direct formatting/ }).click();
  await page.locator('.ui-menu').getByText('Test', { exact: true }).click();
  await expect(chrome.getByRole('button', { name: 'Test' })).toBeVisible({ timeout: 3000 });
  await expect(page.getByText(`${seedTitle()} — One-Liner`).first()).toHaveCSS('font-size', '30px');
});
