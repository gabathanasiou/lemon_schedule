import { test, expect } from '@playwright/test';
import { openSeededProject, seedTitle } from './helpers';

test('@perf probe: arrow navigation across multiple chips + text', async ({ page }) => {
  const logs: string[] = [];
  page.on('console', m => {
    const t = m.text();
    if (t.includes('[rt-struct]')) logs.push(t.slice(11));
    if (t.includes('[rt-commit]')) logs.push('COMMIT ' + t.slice(12));
    if (t.includes('[mutation]')) logs.push('MUT ' + t.slice(11));
    if (t.includes('[rt-sync]')) logs.push('SYNC ' + t.slice(9));
  });
  await openSeededProject(page);
  await page.getByRole('button', { name: 'Design', exact: true }).click();
  await page.getByRole('button', { name: 'Reports Designer', exact: true }).click();
  
  const title = page.getByText(`${seedTitle()} — One-Liner`).first();
  await expect(title).toBeVisible({ timeout: 5000 });
  await title.click();
    const editor = page.locator('.block-chrome .richtext-editor').first();
  await expect(editor).toBeVisible({ timeout: 3000 });

  const sel = () => editor.evaluate((el: HTMLElement) => {
    const s = window.getSelection();
    if (!s || s.rangeCount === 0) return 'none';
    const r = s.getRangeAt(0);
    const rects = r.getClientRects();
    const visible = r.collapsed && (rects.length > 0 || r.startContainer.nodeType === Node.TEXT_NODE);
    return `${r.collapsed ? 'caret' : 'sel'} ${r.startContainer.nodeName}:${JSON.stringify(r.startContainer.textContent?.slice(0, 25))}@${r.startOffset}${visible ? '' : ' INVISIBLE'}`;
  });
  const chips = () => editor.locator('span[data-rt-token]');

  // seed: 3 chips with text around them
  await editor.click();
  await page.keyboard.press('End');
    await editor.evaluate(el => {
    const obs = new MutationObserver(muts => {
      for (const m of muts) {
        if (m.type !== 'childList') continue;
        const added = Array.from(m.addedNodes).map(n => n.nodeType === Node.TEXT_NODE ? `t:${JSON.stringify(n.textContent)}` : `E:${(n as HTMLElement).tagName}`).join(',');
        const removed = Array.from(m.removedNodes).map(n => n.nodeType === Node.TEXT_NODE ? `t:${JSON.stringify(n.textContent)}` : `E:${(n as HTMLElement).tagName}`).join(',');
        if (added || removed) console.log('[mutation]', m.target === el ? 'editor' : m.target.nodeName, 'added:', added || '-', 'removed:', removed || '-');
      }
    });
    obs.observe(el, { childList: true, subtree: true });
  });
  await page.keyboard.type(' {{company}} x {{pageNumber}} y');
  const structNow = await editor.evaluate(el => el.textContent + ' ||| ' + Array.from(el.childNodes).map(c => c.nodeType === Node.TEXT_NODE ? `"${c.textContent}"` : `[${(c as HTMLElement).getAttribute('data-rt-raw')}]`).join(' '));
  console.log('STRUCT_NOW:', structNow);
    console.log('SEED chips=', await chips().count());
  const struct = await editor.evaluate(el => {
    const walk = (n: Node, d: number): string => {
      const ind = '  '.repeat(d);
      if (n.nodeType === Node.TEXT_NODE) return `${ind}text:${JSON.stringify(n.textContent)}\n`;
      if (n.nodeType === Node.ELEMENT_NODE) {
        const e = n as HTMLElement;
        return `${ind}${e.tagName}${e.hasAttribute('data-rt-token') ? '[chip ' + e.getAttribute('data-rt-raw') + ']' : ''}\n${Array.from(e.childNodes).map(c => walk(c, d + 1)).join('')}`;
      }
      return '';
    };
    return walk(el, 0);
  });
  console.log('STRUCTURE:\n' + struct);
  console.log('LAST_STRUCT_LOGS:\n' + logs.join('\n'));

  // walk LEFT from the end, printing every caret position
  await page.keyboard.press('End');
    console.log('END  :', await sel());
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press('ArrowLeft');
        const s = await sel();
    if (i % 2 === 0 || i > 14) console.log(`LEFT${String(i).padStart(2, '0')}:`, s);
  }

  // walk RIGHT back
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press('ArrowRight');
        const s = await sel();
    if (i % 2 === 0 || i > 14) console.log(`RGHT${String(i).padStart(2, '0')}:`, s);
  }

  // Home (intercepted) then arrow RIGHT across the leading chip
  await page.keyboard.press('Home');
    console.log('HOME :', await sel());
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('ArrowRight');
        console.log(`HOME>${i}:`, await sel());
  }
});
