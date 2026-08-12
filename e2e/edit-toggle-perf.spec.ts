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

async function rowListeners(page: Page, label: string) {
  const cdp = await page.context().newCDPSession(page);
  const res: any = await cdp.send('Runtime.evaluate', {
    expression: `
      (() => {
        const row = document.querySelector('[data-row-id]');
        if (!row) return null;
        const l = getEventListeners(row);
        return {
          pointerdown: (l.pointerdown || []).map(x => x.listener ? x.listener.name : ''),
          pointermove: (l.pointermove || []).length,
          pointerup: (l.pointerup || []).length,
          touchstart: (l.touchstart || []).length,
        };
      })()
    `,
    includeCommandLineAPI: true,
    returnByValue: true,
  });
  console.log(`[listeners:${label}] ${JSON.stringify(res?.result?.value ?? res)}`);
}

async function scriptMs(cdp: CDPSession): Promise<number> {
  const { metrics } = await cdp.send('Performance.getMetrics');
  const v = metrics.find(m => m.name === 'ScriptDuration')?.value ?? 0;
  return v * 1000;
}

async function dragOnce(page: Page) {
  const row = page.locator('[data-row-id]:not([aria-disabled="true"])').nth(2);
  const box = await row.boundingBox();
  if (!box) return;
  await page.evaluate(() => {
    (window as any).__probePtr = { down: 0, onRow: 0, prevented: 0, defaultPrevented: 0, up: 0, move: 0, moveOnRow: 0, rootBubble: 0, rootCapture: 0, docBubble: 0 };
    if ((window as any).__probePtrHandler) {
      document.removeEventListener('pointerdown', (window as any).__probePtrHandler, true);
      document.removeEventListener('pointermove', (window as any).__probePtrMoveHandler, true);
      document.removeEventListener('pointerup', (window as any).__probePtrUpHandler, true);
      document.removeEventListener('pointerdown', (window as any).__probePtrBubbleHandler);
    }
    const root = document.getElementById('root');
    (window as any).__probePtrHandler = (e: PointerEvent) => {
      (window as any).__probePtr.down++;
      const rowEl = (e.target as HTMLElement).closest('[data-row-id]');
      if (rowEl) (window as any).__probePtr.onRow++;
      if (e.defaultPrevented) (window as any).__probePtr.defaultPrevented++;
      const t = e.target as HTMLElement;
      const cell = t.closest('[data-ribbon-field]');
      (window as any).__probePtr.targetInfo = {
        tag: t.tagName,
        cls: t.className?.toString?.().slice(0, 60) || '',
        field: cell?.getAttribute('data-ribbon-field') || null,
        readOnly: (t as HTMLInputElement).readOnly ?? null,
        pathEls: e.composedPath().slice(0, 8).map((el: any) => el.tagName || 'window'),
      };
    };
    (window as any).__probePtrMoveHandler = (e: PointerEvent) => {
      (window as any).__probePtr.move++;
      if ((e.target as HTMLElement).closest('[data-row-id]')) (window as any).__probePtr.moveOnRow++;
    };
    (window as any).__probePtrUpHandler = () => { (window as any).__probePtr.up++; };
    (window as any).__probePtrBubbleHandler = () => { (window as any).__probePtr.docBubble++; };
    const rootHandler = () => { (window as any).__probePtr.rootBubble++; };
    const rootCaptureHandler = () => { (window as any).__probePtr.rootCapture++; };
    document.addEventListener('pointerdown', (window as any).__probePtrHandler, true);
    document.addEventListener('pointermove', (window as any).__probePtrMoveHandler, true);
    document.addEventListener('pointerup', (window as any).__probePtrUpHandler, true);
    document.addEventListener('pointerdown', (window as any).__probePtrBubbleHandler);
    root?.addEventListener('pointerdown', rootHandler);
    root?.addEventListener('pointerdown', rootCaptureHandler, true);
    (window as any).__probePtrRootCleanup = () => {
      root?.removeEventListener('pointerdown', rootHandler);
      root?.removeEventListener('pointerdown', rootCaptureHandler, true);
    };
  });
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(120);
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 100, { steps: 10 });
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 180, { steps: 10 });
  await page.waitForTimeout(120);
  const ptr = await page.evaluate(() => {
    (window as any).__probePtrRootCleanup?.();
    return (window as any).__probePtr;
  });
  const engaged = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[data-row-id]'));
    const faded = rows.filter(r => parseFloat((r as HTMLElement).style.opacity || '1') < 0.5);
    const probe = (window as any).__probeDrag ?? {};
    return { faded: faded.length, start: probe.start ?? 0, over: probe.over ?? 0, end: probe.end ?? 0 };
  });
  const globals = await page.evaluate(() => {
    // These module functions aren't exported to window; approximate via DOM attrs
    const marqueeEl = document.querySelector('[data-marquee-active]');
    const dataEdit = document.querySelector('[data-edit-mode]');
    return { marqueeActive: !!marqueeEl, editMode: dataEdit?.getAttribute('data-edit-mode') ?? null };
  });
  console.log(`[dragOnce] ${JSON.stringify({ ...engaged, ptr, globals })}`);
  await page.mouse.up();
  await page.waitForTimeout(400);
}

async function dragRound(page: Page, cdp: CDPSession, label: string) {
  const before = await scriptMs(cdp);
  await page.evaluate(() => {
    (window as any).__probeRowRenders = 0;
    (window as any).__probeDrag = { start: 0, over: 0, end: 0 };
    (window as any).__probeDnd = { bails: 0, reasons: {}, handlerFalse: 0 };
  });
  for (let i = 0; i < 3; i++) await dragOnce(page);
  const after = await scriptMs(cdp);
  const renders = await page.evaluate(() => (window as any).__probeRowRenders ?? -1);
  const drag = await page.evaluate(() => (window as any).__probeDrag);
  const dnd = await page.evaluate(() => (window as any).__probeDnd);
  console.log(`[drag] ${label}: ${Math.round(after - before)}ms script, ${renders} row renders, drag=${JSON.stringify(drag)}, dnd=${JSON.stringify(dnd)} (3 drags)`);
}

async function snapshot(page: Page, label: string) {
  const s = await page.evaluate(() => {
    const probeRowProps = (el: Element | null) => {
      if (!el) return null;
      for (const k of Object.keys(el)) {
        if (k.startsWith('__reactProps$') || k === '__reactProps') {
          const p = (el as any)[k];
          return {
            hasPointerDown: typeof p.onPointerDown === 'function',
            hasPointerMove: typeof p.onPointerMove === 'function',
            hasClick: typeof p.onClick === 'function',
            ariaDisabled: (el as HTMLElement).getAttribute('aria-disabled'),
            keys: Object.keys(p).filter(x => /pointer|mouse|touch|key|click/.test(x)).slice(0, 20),
          };
        }
      }
      return null;
    };
    const firstRow = document.querySelector('[data-row-id]');
    const draggableRow = document.querySelector('[data-row-id]:not([aria-disabled="true"])');
    const firstProps = probeRowProps(firstRow);
    const draggableProps = probeRowProps(draggableRow);
    return {
      editMode: document.querySelector('[data-edit-mode]')?.getAttribute('data-edit-mode'),
      marqueeActive: document.querySelector('[data-marquee-active]') ? true : false,
      rowIds: document.querySelectorAll('[data-row-id]').length,
      dragDisabled: (window as any).__probeDragDisabled,
      firstProps,
      draggableProps,
    };
  });
  console.log(`[snap] ${label}: ${JSON.stringify(s)}`);
}

test('edit-toggle lag reproduction', async ({ page }) => {
  test.setTimeout(300000);
  await openSeeded(page);
  await page.getByRole('button', { name: 'Schedule', exact: true }).click();
  await page.waitForSelector('[data-row-id]', { timeout: 15000 });
  await page.waitForTimeout(1000);

  const cdp = await getCdp(page);
  await snapshot(page, 'initial');

  // Control: drag as the very first interaction (no tab switch yet)
  await dragRound(page, cdp, 'baseline-first-interaction');

  // Key test: does a tab switch alone (fresh ScheduleTab mount) keep drags working?
  await page.getByRole('button', { name: 'Breakdown', exact: true }).click({ timeout: 5000 });
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Schedule', exact: true }).click({ timeout: 5000 });
  await page.waitForTimeout(500);
  await snapshot(page, 'after-tabswitch');
  const selBefore = await page.evaluate(() => Array.from(document.querySelectorAll('[data-row-id]')).filter(r => r.classList.contains('z-10')).length);
  const row = page.locator('[data-row-id]:not([aria-disabled="true"])').nth(2);
  await row.click({ timeout: 5000 });
  await page.waitForTimeout(300);
  const selAfter = await page.evaluate(() => {
    const selected = Array.from(document.querySelectorAll('[data-row-id]')).filter(r => r.classList.contains('z-10')).length;
    const root = document.getElementById('root');
    return { selected };
  });
  console.log(`[click-test] selectedBefore=${selBefore}, after=${JSON.stringify(selAfter)}`);
  await dragRound(page, cdp, 'baseline-after-tabswitch');

  const editBtn = page.locator('button:has-text("Edit")').last();
  await editBtn.click({ timeout: 5000 });
  await page.waitForTimeout(400);
  await snapshot(page, 'edit-on');
  await editBtn.click({ timeout: 5000 });
  await page.waitForTimeout(400);
  await snapshot(page, 'edit-off');

  await dragRound(page, cdp, 'after-edit-toggle');

  await page.getByRole('button', { name: 'Breakdown', exact: true }).click({ timeout: 5000 });
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Schedule', exact: true }).click({ timeout: 5000 });
  await page.waitForTimeout(500);
  await dragRound(page, cdp, 'after-edit-toggle-then-tabswitch');
});
