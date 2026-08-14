import { test, expect } from '@playwright/test';
import { openSeededProject } from './helpers';

async function openDesigner(page: any) {
  await openSeededProject(page);
  await page.getByRole('button', { name: 'Design', exact: true }).click();
  await page.getByRole('button', { name: 'Reports Designer', exact: true }).click();
  await page.waitForTimeout(500);
}

async function openTitleChrome(page: any) {
  await openDesigner(page);
  const title = page.getByText('Town - Jason — One-Liner').first();
  await expect(title).toBeVisible({ timeout: 5000 });
  await title.click();
  await page.waitForTimeout(300);
  const chrome = page.locator('.block-chrome');
  await expect(chrome).toBeVisible({ timeout: 3000 });
  return chrome;
}

const ON_CLS = 'bg-blue-900/50';

test('format toggles light up from the selection (bold, italic, underline)', async ({ page }) => {
  const chrome = await openTitleChrome(page);
  const editor = chrome.locator('.richtext-editor');
  await editor.click();

  // select all, hit B → button lights + canvas text wrapped bold
  await page.keyboard.press('Meta+a');
  await chrome.getByRole('button', { name: 'Bold' }).click();
  await expect(chrome.getByRole('button', { name: 'Bold' })).toHaveClass(new RegExp(ON_CLS), { timeout: 3000 });
  let canvasHtml = await page.locator('.report-text-block').first().evaluate(el => el.innerHTML);
  expect(canvasHtml).toContain('<b>');

  // U (previously dead — extension missing) → lights + canvas underlined
  await chrome.getByRole('button', { name: 'Underline' }).click();
  await expect(chrome.getByRole('button', { name: 'Underline' })).toHaveClass(new RegExp(ON_CLS), { timeout: 3000 });
  canvasHtml = await page.locator('.report-text-block').first().evaluate(el => el.innerHTML);
  expect(canvasHtml).toContain('<u>');

  // I → lights
  await chrome.getByRole('button', { name: 'Italic' }).click();
  await expect(chrome.getByRole('button', { name: 'Italic' })).toHaveClass(new RegExp(ON_CLS), { timeout: 3000 });
  canvasHtml = await page.locator('.report-text-block').first().evaluate(el => el.innerHTML);
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

test('empty line from Enter renders in the canvas as a <br> paragraph', async ({ page }) => {
  const chrome = await openTitleChrome(page);
  const canvasBlock = page.locator('.report-text-block').first();
  const h1 = (await canvasBlock.boundingBox())!.height;

  await chrome.locator('.richtext-editor').click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('second line');
  await page.waitForTimeout(300);

  // stored/render HTML keeps an empty paragraph with a <br> (not <p></p>)
  const html = await canvasBlock.evaluate(el => el.innerHTML);
  expect(html).toContain('<br></p>');
  expect(html).not.toContain('<p></p>');

  // and the block actually grew by a line height
  const h2 = (await canvasBlock.boundingBox())!.height;
  expect(h2).toBeGreaterThan(h1 + 10);
});
