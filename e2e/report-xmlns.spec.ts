import { test, expect } from '@playwright/test';
import { openSeededProject } from './helpers';

test('xmlns fix: editor round-trip, old polluted data, keys/values modes, preview', async ({ page }) => {
  await openSeededProject(page);
  page.on('pageerror', err => console.log('PAGE-ERR:', err.message.slice(0, 300)));

  // 1) simulate OLD polluted stored data in the active design
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find(k => k.startsWith('lemon_schedule_project_v1_'));
    if (!key) return;
    const p = JSON.parse(localStorage.getItem(key)!);
    const d = (p.reportDesigns || []).find((x: any) => x.name === 'Scene Breakdown');
    const walk = (blocks: any[]) => (blocks || []).forEach(b => {
      if (b.type === 'text' && b.text?.includes('Props')) {
        b.text = '<p xmlns="http://www.w3.org/1999/xhtml">Props: {{props}}</p>';
      }
      if (b.children) walk(b.children);
    });
    walk(d.blocks);
    localStorage.setItem(key, JSON.stringify(p));
  });

  await page.getByRole('button', { name: 'Design', exact: true }).click();
  await page.getByRole('button', { name: 'Reports Designer', exact: true }).click();
  await page.waitForTimeout(500);
  await page.getByText('Editing: One-Liner', { exact: true }).click();
  await page.getByRole('menuitem', { name: 'Scene Breakdown' }).click();
  await page.waitForTimeout(600);

  // 2) VALUES mode (default): no xmlns anywhere in the DOM
  const valuesDump = await page.evaluate(() => {
    const bad = Array.from(document.querySelectorAll('[xmlns]')).filter(el => el.tagName !== 'svg');
    const textWithXmlns = Array.from(document.querySelectorAll('.report-text-block')).filter(el => (el as HTMLElement).innerText.includes('xmlns')).length;
    return {
      count: bad.length,
      samples: bad.slice(0, 4).map(el => (el as HTMLElement).outerHTML?.slice(0, 160)),
      textWithXmlns,
    };
  });
  console.log('VALUES-MODE:', JSON.stringify(valuesDump, null, 1));
  expect(valuesDump.count).toBe(0);
  expect(valuesDump.textWithXmlns).toBe(0);

  // 3) KEYS mode: no literal tags in the template text
  await page.getByRole('button', { name: /A4 Portrait|A4 Landscape|Full Width/ }).click();
  await page.getByRole('menuitem', { name: 'Show field keys' }).click();
  await page.waitForTimeout(500);
  const keysText = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.block-card.block-type-text, .report-repeat .block-card')).map(el => (el as HTMLElement).innerText?.slice(0, 90)).filter(Boolean).slice(0, 10),
  );
  console.log('KEYS-MODE:', JSON.stringify(keysText, null, 1));
  expect(keysText.join('\n')).not.toContain('<p');
  expect(keysText.join('\n')).not.toContain('xmlns');

  // 4) back to VALUES + edit the polluted block → save must store CLEAN text
  await page.getByRole('button', { name: /A4 Portrait|A4 Landscape|Full Width/ }).click();
  await page.getByRole('menuitem', { name: 'Show field values' }).click();
  await page.waitForTimeout(400);
  const propsCard = page.locator('.block-card.block-type-text').filter({ hasText: 'Props' }).first();
  await propsCard.click();
  await page.waitForTimeout(400);
  const editor = page.locator('.block-chrome .richtext-editor');
  await editor.click();
  await page.keyboard.press('End');
  await page.keyboard.type('x');
  await page.waitForTimeout(900);
  const stored = await page.evaluate(() => {
    const key = Object.keys(localStorage).find(k => k.startsWith('lemon_schedule_project_v1_'));
    if (!key) return null;
    const p = JSON.parse(localStorage.getItem(key)!);
    const d = (p.reportDesigns || []).find((x: any) => x.name === 'Scene Breakdown');
    let found: string | null = null;
    const walk = (blocks: any[]) => (blocks || []).forEach(b => {
      if (b.type === 'text' && b.text?.includes('Props')) found = b.text;
      if (b.children) walk(b.children);
    });
    walk(d.blocks);
    return found;
  });
  console.log('STORED-AFTER-EDIT:', JSON.stringify(stored));
  expect(stored).not.toContain('xmlns');

  // 5) preview: no xmlns anywhere
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await page.waitForTimeout(2500);
  const previewDump = await page.evaluate(() => ({
    xmlnsEls: Array.from(document.querySelectorAll('[xmlns]')).filter(el => el.tagName !== 'svg').length,
    xmlnsText: Array.from(document.querySelectorAll('.report-text-block')).filter(el => (el as HTMLElement).innerText.includes('xmlns')).length,
  }));
  console.log('PREVIEW:', JSON.stringify(previewDump));
  expect(previewDump.xmlnsEls).toBe(0);
  expect(previewDump.xmlnsText).toBe(0);
});