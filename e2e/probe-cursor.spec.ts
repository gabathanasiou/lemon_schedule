import { test, expect } from '@playwright/test';
import { openSeededProject } from './helpers';

test('probe: cursor visibility + selection extents around chips', async ({ page }) => {
  await openSeededProject(page);
  await page.getByRole('button', { name: 'Design', exact: true }).click();
  await page.getByRole('button', { name: 'Reports Designer', exact: true }).click();
  await page.waitForTimeout(500);

  const title = page.getByText('Town - Jason — One-Liner').first();
  await expect(title).toBeVisible({ timeout: 5000 });
  await title.click();
  await page.waitForTimeout(300);
  const editor = page.locator('.block-chrome .richtext-editor').first();
  await expect(editor).toBeVisible({ timeout: 3000 });

  const sel = () => editor.evaluate((el: HTMLElement) => {
    const s = window.getSelection();
    if (!s || s.rangeCount === 0) return 'none';
    const r = s.getRangeAt(0);
    const rects = r.getClientRects();
    const rect = rects.length ? { l: rects[0].left, w: rects[0].width, h: rects[0].height } : null;
    const n = (x: Node | null) => x ? `${x.nodeName}:"${x.textContent?.slice(0, 20)}"` : '∅';
    const inEl = el.contains(r.startContainer) && el.contains(r.endContainer);
    return {
      collapsed: r.collapsed,
      start: `${n(r.startContainer)}@${r.startOffset}`,
      end: `${n(r.endContainer)}@${r.endOffset}`,
      rect,
      inEl,
    };
  });
  const chips = () => editor.locator('span[data-rt-token]');

  // seed 3 tokens
  await editor.click();
  await page.keyboard.press('End');
  await page.waitForTimeout(200);
  await page.keyboard.type(' {{company}} x {{pageNumber}}');
  await page.waitForTimeout(250);
  console.log('SEED chips=', await chips().count());

  // A) pick via @ + Enter → caret position/visibility after insert
  await page.keyboard.press('End');
  await page.keyboard.type('@pag');
  await page.waitForTimeout(150);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  console.log('A after pick:', JSON.stringify(await sel()));
  console.log('A html:', JSON.stringify((await editor.evaluate((e: HTMLElement) => e.innerHTML)).slice(0, 300)));

  // B) arrow right/left ACROSS chips from the end
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(120);
  console.log('B left1:', JSON.stringify(await sel()));
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(120);
  console.log('B left2:', JSON.stringify(await sel()));
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(120);
  console.log('B right1:', JSON.stringify(await sel()));

  // C) click each chip → selection covers ONLY the chip
  for (let i = 0; i < 4; i++) {
    await chips().nth(i).click();
    await page.waitForTimeout(120);
    const s = await sel();
    const chipText = await chips().nth(i).textContent();
    const chipSel = typeof s === 'object' && !s.collapsed && s.start.includes('@0') && s.start.includes(chipText);
    console.log(`C chip${i} ('${chipText}'):`, JSON.stringify(s), chipSel ? 'OK' : 'WRONG-SCOPE');
  }

  // D) Shift+Arrow across a chip (caret at line start, shift-right twice)
  await page.keyboard.press('Home');
  await page.waitForTimeout(100);
  await page.keyboard.press('Shift+ArrowRight');
  await page.waitForTimeout(120);
  console.log('D shift+right(1):', JSON.stringify(await sel()));
  await page.keyboard.press('Shift+ArrowRight');
  await page.waitForTimeout(120);
  console.log('D shift+right(2):', JSON.stringify(await sel()));
  await page.keyboard.press('Escape');
  await page.keyboard.press('Home');
  await page.waitForTimeout(100);

  // E) mouse drag across text and a chip
  const box = await editor.evaluate(el => {
    const cs = el.getBoundingClientRect();
    return { left: cs.left, top: cs.top + cs.height / 2, right: cs.right, bottom: cs.bottom };
  });
  await page.mouse.move(box.left + 10, box.top);
  await page.mouse.down();
  await page.mouse.move(box.right - 10, box.top, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  console.log('E drag-across:', JSON.stringify(await sel()));

  // F) plain click on text → caret visible?
  const textPt = await editor.evaluate(el => {
    const chipsEl = Array.from(el.querySelectorAll('span[data-rt-token]'));
    const r = chipsEl[1].getBoundingClientRect();
    return { x: r.left - 6, y: r.top + r.height / 2 };
  });
  await page.mouse.click(textPt.x, textPt.y);
  await page.waitForTimeout(200);
  console.log('F click-text:', JSON.stringify(await sel()));

  // G) double-click on text → line selection?
  await page.mouse.dblclick(textPt.x, textPt.y);
  await page.waitForTimeout(200);
  console.log('G dblclick-text:', JSON.stringify(await sel()));

  // H) double-click ON a chip → whole line??
  const chipPt = await editor.evaluate(el => {
    const r = el.querySelector('span[data-rt-token]')!.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.mouse.dblclick(chipPt.x, chipPt.y);
  await page.waitForTimeout(200);
  console.log('H dblclick-chip:', JSON.stringify(await sel()));

  // I) triple-click on text → line select
  await page.mouse.click(textPt.x, textPt.y);
  await page.mouse.click(textPt.x, textPt.y);
  await page.mouse.click(textPt.x, textPt.y);
  await page.waitForTimeout(200);
  console.log('I tripleclick-text:', JSON.stringify(await sel()));

  // J) Home then Shift+ArrowRight from the very start (leading chip)
  await page.keyboard.press('Home');
  await page.waitForTimeout(100);
  console.log('J home:', JSON.stringify(await sel()));
  await page.keyboard.press('Shift+ArrowRight');
  await page.waitForTimeout(150);
  console.log('J shift+right from start:', JSON.stringify(await sel()));

  // K) click past the last chip (trailing empty area) → caret position
  const endPt = await editor.evaluate(el => {
    const r = el.getBoundingClientRect();
    return { x: r.right - 4, y: r.top + r.height / 2 };
  });
  await page.mouse.click(endPt.x, endPt.y);
  await page.waitForTimeout(200);
  console.log('K click-end:', JSON.stringify(await sel()));
});
