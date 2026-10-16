import { test, expect } from '@playwright/test';
import { openSeededProject, loadSeedProject, reloadProject, waitForPersistedProject } from './helpers';

test('xmlns fix: editor round-trip, old polluted data, keys/values modes, preview', async ({ page }) => {
  const seed = loadSeedProject();
  await openSeededProject(page);
  page.on('pageerror', err => console.log('PAGE-ERR:', err.message.slice(0, 300)));

  // Open the designer once: the default designs (incl. Scene Breakdown) are
  // created here and persisted. Then pollute the STORED design and boot the
  // app from that data — the polluted markup enters via the load pipeline.
  await page.getByRole('button', { name: 'Design', exact: true }).click();
  await page.getByRole('button', { name: 'Reports Designer', exact: true }).click();
  await waitForPersistedProject(page, "(p.reportDesigns || []).some(d => d.name === 'Scene Breakdown')");
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find(k => k.startsWith('lemon_schedule_project_v1_'));
    if (!key) return;
    const p = (window as any).__lemonSchedule.decodeProject(localStorage.getItem(key)!);
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

  // Boot the app from the polluted storage, then re-enter the designer.
  await reloadProject(page);
  await expect(page.getByRole('button', { name: 'Breakdown', exact: true })).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: 'Design', exact: true }).click();
  await page.getByRole('button', { name: 'Reports Designer', exact: true }).click();
  await page.getByText('Editing: One-Liner', { exact: true }).click();
  await page.getByRole('menuitem', { name: 'Scene Breakdown' }).click();
  
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

  // 3) FIELDS mode (header toggle): no literal tags in the template text
  await page.getByRole('button', { name: 'Fields', exact: true }).click();
    const keysText = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.block-card.block-type-text, .report-repeat .block-card')).map(el => (el as HTMLElement).innerText?.slice(0, 90)).filter(Boolean).slice(0, 10),
  );
  console.log('KEYS-MODE:', JSON.stringify(keysText, null, 1));
  expect(keysText.join('\n')).not.toContain('<p');
  expect(keysText.join('\n')).not.toContain('xmlns');

  // 4) back to VALUES + edit the polluted block → save must store CLEAN text
  await page.getByRole('button', { name: 'Values', exact: true }).click();
    const propsCard = page.locator('.block-card.block-type-text').filter({ hasText: 'Props' }).first();
  await propsCard.click();
    // roadmap 191: double-click the card to edit it INLINE on the canvas
    await propsCard.dblclick();
  await expect(propsCard.locator('.tiptap')).toBeFocused({ timeout: 3000 });
  await page.keyboard.press('End');
  await page.keyboard.type('x');
  // roadmap 251: text commits when the edit finishes (Escape ends the edit
  // session) — the store write no longer happens per keystroke.
  await page.keyboard.press('Escape');
  await waitForPersistedProject(page, "(p.reportDesigns || []).some(d => JSON.stringify(d.blocks).includes('{{props}}x') && !JSON.stringify(d.blocks).includes('xmlns'))");
    const stored = await page.evaluate(() => {
    const key = Object.keys(localStorage).find(k => k.startsWith('lemon_schedule_project_v1_'));
    if (!key) return null;
    const p = (window as any).__lemonSchedule.decodeProject(localStorage.getItem(key)!);
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
    const previewDump = await page.evaluate(() => ({
    xmlnsEls: Array.from(document.querySelectorAll('[xmlns]')).filter(el => el.tagName !== 'svg').length,
    xmlnsText: Array.from(document.querySelectorAll('.report-text-block')).filter(el => (el as HTMLElement).innerText.includes('xmlns')).length,
  }));
  console.log('PREVIEW:', JSON.stringify(previewDump));
  expect(previewDump.xmlnsEls).toBe(0);
  expect(previewDump.xmlnsText).toBe(0);
});

test('roadmap 274: hostile report markup is stripped at ingest and neutralized at render', async ({ page }) => {
  await openSeededProject(page);
  page.on('pageerror', err => console.log('PAGE-ERR:', err.message.slice(0, 300)));

  // Default designs exist once the designer has opened (they render there).
  await page.getByRole('button', { name: 'Design', exact: true }).click();
  await page.getByRole('button', { name: 'Reports Designer', exact: true }).click();
  await waitForPersistedProject(page, "(p.reportDesigns || []).some(d => d.name === 'Scene Breakdown')");

  const hostileBlocks = (marker: string) => [
    {
      id: 'xss-text',
      type: 'text',
      text: `<p>${marker} <b>bold</b> {{definitely_missing_token}}</p><img src="x" onerror="window.__xss=1"><script>window.__xss=2</script><a href="javascript:window.__xss=3">jump</a>`,
    },
    {
      id: 'xss-table',
      type: 'table',
      custom: true,
      columns: [{ id: 'c1', field: '', width: 100 }],
      customRows: [{ id: 'r1', cells: [`<p>Cell</p><img src="x" onerror="window.__xss=4"><svg onload="window.__xss=5"></svg>`] }],
    },
  ];

  // Leg B — INGEST: a bridge dispatch goes through the same reducers as the UI,
  // so the store strip must clean the design before it is ever stored.
  const ingest = await page.evaluate((blocks) => {
    const api = (window as any).__lemonSchedule;
    const design = api.getProject().reportDesigns[0];
    api.dispatch({ type: 'UPDATE_REPORT_DESIGN', payload: { id: design.id, blocks } });
    const stored = api.getProject().reportDesigns.find((d: any) => d.id === design.id);
    const json = JSON.stringify(stored.blocks);
    return {
      jsonHead: json.slice(0, 200),
      hasScriptTag: /<script/i.test(json),
      hasHandler: /onerror|onload/i.test(json),
      hasJsUrl: /javascript:/i.test(json),
      keepsBold: json.includes('<b>bold</b>'),
    };
  }, hostileBlocks('Ingest-hostile'));
  console.log('INGEST-STRIPPED:', ingest.jsonHead);
  expect(ingest.hasScriptTag).toBe(false);
  expect(ingest.hasHandler).toBe(false);
  expect(ingest.hasJsUrl).toBe(false);
  expect(ingest.keepsBold).toBe(true);

  // Leg A — RENDER: a raw LOAD bypasses the load seam (the debug bridge is the
  // agent path); the two render sinks must still neutralize the stored markup.
  await page.evaluate((blocks) => {
    const api = (window as any).__lemonSchedule;
    delete (window as any).__xss;
    const p = api.getProject();
    for (const d of p.reportDesigns) d.blocks = JSON.parse(JSON.stringify(blocks));
    api.dispatch({ type: 'LOAD', payload: p });
  }, hostileBlocks('Render-hostile'));

  // The paginator settles a beat after LOAD; wait for OUR marker to be on screen.
  await page.waitForFunction(() => (document.querySelector('.report-text-block')?.textContent || '').includes('Render-hostile'), null, { timeout: 5000 });
  // If a hostile <img> had survived, its error event fires asynchronously —
  // wait for images to settle before reading the execution flag.
  await page.waitForFunction(() => Array.from(document.images).every(img => img.complete), null, { timeout: 2000 });

  const dump = await page.evaluate(() => {
    const hostileSel = [
      '.report-text-block img', '.report-text-block script', '.report-text-block [onerror]', '.report-text-block [onload]', '.report-text-block svg',
      '[data-cell] img', '[data-cell] script', '[data-cell] [onerror]', '[data-cell] [onload]', '[data-cell] svg',
    ].join(', ');
    const hostile = Array.from(document.querySelectorAll(hostileSel));
    const jsLinks = Array.from(document.querySelectorAll('.report-text-block a, [data-cell] a'))
      .filter(a => (a.getAttribute('href') || '').toLowerCase().startsWith('javascript:'));
    const chip = document.querySelector('.report-text-block [data-ui-tooltip="No value"]') as HTMLElement | null;
    return {
      xss: (window as any).__xss ?? null,
      hostileCount: hostile.length,
      hostileSamples: hostile.slice(0, 4).map(el => (el as HTMLElement).outerHTML.slice(0, 140)),
      jsLinkCount: jsLinks.length,
      boldSurvives: !!document.querySelector('.report-text-block b'),
      chipBackground: chip ? chip.style.background : '',
      renderedTargets: document.querySelectorAll('.report-text-block, [data-cell]').length,
    };
  });
  console.log('RENDER-DUMP:', JSON.stringify(dump, null, 1));
  expect(dump.hostileCount).toBe(0);
  expect(dump.jsLinkCount).toBe(0);
  expect(dump.boldSurvives).toBe(true);
  // The unresolved-token chip's inline styles are injected by resolution — a
  // non-empty background proves sanitization ran BEFORE the resolver.
  expect(dump.chipBackground).not.toBe('');
  expect(dump.xss).toBe(null);
});