import { test, expect } from '@playwright/test';
import { openSeededProject } from './helpers';

test('debug draft typing', async ({ page }) => {
  await openSeededProject(page);
  await page.getByRole('button', { name: 'Design', exact: true }).click();
  await page.getByRole('button', { name: 'Reports Designer', exact: true }).click();
  await page.waitForTimeout(500);

  const title = page.getByText('Town - Jason — One-Liner').first();
  await expect(title).toBeVisible({ timeout: 5000 });
  await title.click();
  await page.waitForTimeout(300);

  const chrome = page.locator('.block-chrome');
  await expect(chrome).toBeVisible({ timeout: 3000 });
  const editor = chrome.locator('.richtext-editor');
  await expect(editor).toBeVisible({ timeout: 3000 });

  const box = await editor.boundingBox();
  console.log('editor box:', JSON.stringify(box));
  console.log('chrome box:', JSON.stringify(await chrome.boundingBox()));
  console.log('chrome scrollHeight/clientHeight:', await chrome.evaluate(el => el.scrollHeight + '/' + el.clientHeight));

  await editor.click();
  const focused = await editor.evaluate(el => document.activeElement === el);
  console.log('focused after click:', focused);

  const whoFocused = () => editor.evaluate(() => {
    const ae = document.activeElement;
    return ae ? `${ae.tagName}.${(ae as HTMLElement).className?.toString?.().slice(0, 40)}` : 'null';
  });

  await page.keyboard.press('End');
  console.log('after End focus:', await whoFocused());
  await page.keyboard.type(' ');
  await page.waitForTimeout(200);
  console.log('after space focus:', await whoFocused());
  console.log('editor html after space:', await editor.evaluate(el => el.innerHTML));
  await page.keyboard.type('— DRAFT');
  await page.waitForTimeout(500);

  console.log('editor html:', await editor.evaluate(el => el.innerHTML));
  console.log('editor text:', await editor.evaluate(el => el.textContent));
  const stillFocused = await editor.evaluate(el => document.activeElement === el);
  console.log('still focused:', stillFocused);
  console.log('canvas title count:', await page.getByText('Town - Jason — One-Liner — DRAFT').count());
});
