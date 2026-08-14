import { test, expect } from '@playwright/test';
import { openSeededProject } from './helpers';

test('debug token autocomplete position', async ({ page }) => {
  await openSeededProject(page);
  await page.getByRole('button', { name: 'Design', exact: true }).click();
  await page.getByRole('button', { name: 'Reports Designer', exact: true }).click();
  await page.waitForTimeout(500);

  const title = page.getByText('Town - Jason — One-Liner').first();
  await expect(title).toBeVisible({ timeout: 5000 });
  await title.click();
  await page.waitForTimeout(400);

  const chrome = page.locator('.block-chrome');
  await expect(chrome).toBeVisible({ timeout: 3000 });
  const editor = chrome.locator('.richtext-editor');
  await editor.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' {{');

  const popover = page.locator('.ac-token-popover');
  await expect(popover).toBeVisible({ timeout: 3000 });

  const dump = await page.evaluate(() => {
    const pop = document.querySelector('.ac-token-popover') as HTMLElement;
    const chrome = document.querySelector('.block-chrome') as HTMLElement;
    const editor = document.querySelector('.richtext-editor') as HTMLElement;
    const sel = window.getSelection();
    const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
    const carets: any[] = [];
    if (range) {
      const rects = range.getClientRects();
      for (const r of Array.from(rects)) carets.push({ left: r.left, top: r.top, w: r.width, h: r.height });
    }
    const cs = (el: HTMLElement) => {
      const s = getComputedStyle(el);
      return { position: s.position, left: s.left, top: s.top, transform: s.transform, overflowX: s.overflowX, overflowY: s.overflowY, maxH: s.maxHeight, maxW: s.maxWidth, display: s.display };
    };
    return {
      pop: pop ? { box: pop.getBoundingClientRect().toJSON(), style: cs(pop), parent: pop.parentElement?.className } : null,
      chrome: chrome ? { box: chrome.getBoundingClientRect().toJSON(), style: cs(chrome) } : null,
      editor: editor ? { box: editor.getBoundingClientRect().toJSON() } : null,
      carets,
      vw: window.innerWidth, vh: window.innerHeight,
    };
  });
  console.log('DUMP:', JSON.stringify(dump, null, 1));
});
