import { test, Page, CDPSession } from '@playwright/test';
import { loadSeedProject, seedProjectScript } from './helpers';

async function openSeeded(page: Page) {
  const seed = loadSeedProject();
  await page.addInitScript(seedProjectScript(seed));
  await page.goto('/lemon_schedule/');
  const title = JSON.parse(seed.raw).title;
  await page.getByText(title, { exact: true }).first().click({ timeout: 8000 });
  await page.waitForTimeout(1200);
}

async function getCdp(page: Page): Promise<CDPSession> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  return cdp;
}

async function scriptMs(cdp: CDPSession): Promise<number> {
  const { metrics } = await cdp.send('Performance.getMetrics');
  const v = metrics.find(m => m.name === 'ScriptDuration')?.value ?? 0;
  return v * 1000;
}

async function dragRow(page: Page, nth: number) {
  const row = page.locator('[data-row-id]:not([aria-disabled="true"])').nth(nth);
  const box = await row.boundingBox();
  if (!box) return -1;
  const x = box.x + box.width * 0.08;
  const y = box.y + box.height / 2;
  const elAt = await page.evaluate(([cx, cy]) => {
    const el = document.elementFromPoint(cx, cy);
    const input = el?.closest('input, textarea');
    return {
      tag: el?.tagName ?? null,
      cls: (el?.className?.toString?.() || '').slice(0, 50),
      inputReadOnly: input ? (input as HTMLInputElement).readOnly : null,
      isInput: !!input,
      rowId: el?.closest('[data-row-id]')?.getAttribute('data-row-id') ?? null,
    };
  }, [x, y]);
  if (elAt.isInput && elAt.inputReadOnly === false) { console.log(`[skip] nth=${nth} elAt=${JSON.stringify(elAt)}`); return -2; }
  await page.evaluate(() => { (window as any).__probeDrag = { start: 0, over: 0, end: 0 }; (window as any).__probeDnd = { bails: 0, reasons: {}, handlerFalse: 0, sensorMove: 0 }; });
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(100);
  // drag down 12 rows worth
  const stepY = box.height;
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(x, y + stepY * i, { steps: 4 });
    await page.waitForTimeout(30);
  }
  await page.waitForTimeout(100);
  const engaged = await page.evaluate(() => (window as any).__probeDrag?.start ?? 0);
  const over = await page.evaluate(() => (window as any).__probeDrag?.over ?? 0);
  const dnd = await page.evaluate(() => (window as any).__probeDnd);
  await page.mouse.up();
  await page.waitForTimeout(500);
  return { engaged, over, rowId: elAt.rowId, dnd: dnd && { bails: dnd.bails, handlerFalse: dnd.handlerFalse, reasons: dnd.reasons, sensorMove: dnd.sensorMove } };
}

async function round(page: Page, cdp: CDPSession, label: string, nth: number) {
  const before = await scriptMs(cdp);
  await page.evaluate(() => {
    (window as any).__probeRowRenders = 0;
    (window as any).__probeDrag = { start: 0, over: 0, end: 0 };
  });
  let engaged = 0;
  let overTotal = 0;
  let attempts = 0;
  const results: any[] = [];
  for (let i = 0; i < 3; i++) {
    let r = (await dragRow(page, nth)) as any;
    attempts++;
    while (r && r.engaged === 0 && attempts < 12) {
      nth += 1;
      r = (await dragRow(page, nth)) as any;
      attempts++;
    }
    results.push(r);
    if (r && r.engaged > 0) { engaged++; overTotal += r.over; }
  }
  const after = await scriptMs(cdp);
  const renders = await page.evaluate(() => (window as any).__probeRowRenders ?? -1);
  const drag = await page.evaluate(() => (window as any).__probeDrag);
  console.log(`[round] ${label}: script=${Math.round(after - before)}ms renders=${renders} engaged=${engaged}/3 overTotal=${overTotal} attempts=${attempts} results=${JSON.stringify(results.map(r => r && ({ e: r.engaged, o: r.over, d: r.dnd })))}`);
}

test('top vs bottom drag cost', async ({ page }) => {
  test.setTimeout(300000);
  await openSeeded(page);
  await page.getByRole('button', { name: 'Schedule', exact: true }).click();
  await page.waitForSelector('[data-row-id]', { timeout: 15000 });
  await page.waitForTimeout(1000);

  const cdp = await getCdp(page);
  // scroll to top first
  await page.evaluate(() => { const el = document.querySelector('[data-marquee-container]'); if (el) el.scrollTop = 0; });
  await page.waitForTimeout(500);
  await round(page, cdp, 'top-of-list', 3);

  await page.evaluate(() => { const el = document.querySelector('[data-marquee-container]'); if (el) el.scrollTop = 0; });
  await page.waitForTimeout(500);
  await round(page, cdp, 'top-of-list-2', 8);

  // scroll to bottom, drag a row near the list end (visible at bottom)
  await page.evaluate(() => { const el = document.querySelector('[data-marquee-container]'); if (el) el.scrollTop = el.scrollHeight; });
  await page.waitForTimeout(800);
  await round(page, cdp, 'bottom-of-list', -5);
});
