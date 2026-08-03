import { test, Page, CDPSession } from '@playwright/test';
import { openSeededProject } from './helpers';

/**
 * Memory-leak / perf diagnosis harness (branch diagnosis/perf-memory-leaks).
 *
 * Measures, against the seeded Town project:
 *  - JS heap after forced GC (leak signature = growth after GC)
 *  - LIVE DOM node count (document.querySelectorAll('*').length) — unlike the
 *    CDP `Nodes` metric (a monotonic counter), this reflects real retained DOM
 *  - Main-thread cost deltas (Script / Task / Layout / RecalcStyle) per
 *    workload, from Performance.getMetrics counters
 *
 * Run: npx playwright test --config=playwright.perf.config.ts
 */

interface MemSample {
  jsHeapUsed: number;   // MB
  liveDom: number;      // live DOM nodes in document
}

interface CpuCounters {
  script: number;   // ms
  task: number;     // ms
  layout: number;   // ms
  recalc: number;   // ms
}

async function getCdp(page: Page): Promise<CDPSession> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  return cdp;
}

async function counters(cdp: CDPSession): Promise<CpuCounters> {
  const { metrics } = await cdp.send('Performance.getMetrics');
  const get = (name: string) => (metrics.find(m => m.name === name)?.value ?? 0) as number;
  return {
    script: get('ScriptDuration') * 1000,
    task: get('TaskDuration') * 1000,
    layout: get('LayoutDuration') * 1000,
    recalc: get('RecalcStyleDuration') * 1000,
  };
}

async function sample(page: Page, cdp: CDPSession): Promise<MemSample> {
  await cdp.send('HeapProfiler.collectGarbage');
  await page.waitForTimeout(400);
  const { metrics } = await cdp.send('Performance.getMetrics');
  const heap = (metrics.find(m => m.name === 'JSHeapUsedSize')?.value ?? 0) / 1048576;
  const liveDom = await page.evaluate(() => document.querySelectorAll('*').length);
  return { jsHeapUsed: Math.round(heap * 10) / 10, liveDom };
}

function fmt(s: MemSample): string {
  return `heap=${s.jsHeapUsed}MB liveDOM=${s.liveDom}`;
}

function fmtDelta(a: CpuCounters, b: CpuCounters, label: string): void {
  const d = (k: keyof CpuCounters) => Math.round(b[k] - a[k]);
  console.log(`[cpu] ${label}: script=${d('script')}ms task=${d('task')}ms layout=${d('layout')}ms recalc=${d('recalc')}ms`);
}

test('diagnosis: memory + cpu over repeated workflows (Town project)', async ({ page }) => {
  test.setTimeout(600000);
  await openSeededProject(page);
  await page.getByRole('button', { name: 'Schedule' }).click();
  await page.waitForSelector('[data-row-id]', { timeout: 15000 });
  await page.waitForTimeout(1000);

  const cdp = await getCdp(page);
  const baseline = await sample(page, cdp);
  const results: string[] = [`baseline: ${fmt(baseline)}`];
  console.log('[step] baseline', fmt(baseline));

  const safe = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn();
      console.log(`[step] ${name}: ok`);
    } catch (e: any) {
      console.log(`[step] ${name}: SKIPPED (${e?.message?.split('\n')[0] || e})`);
    }
  };
  const round = async (label: string, fn: () => Promise<void>) => {
    const before = await counters(cdp);
    await safe(label, fn);
    await page.waitForTimeout(500);
    const after = await counters(cdp);
    fmtDelta(before, after, label);
    const s = await sample(page, cdp);
    results.push(`${label}: ${fmt(s)}`);
    console.log('[step]', label, fmt(s));
  };

  await round('tab-switch x3', async () => {
    for (let i = 0; i < 2; i++) {
      for (const tab of ['Breakdown', 'Calendar', 'Design', 'Rules', 'Reports', 'Schedule']) {
        await page.getByRole('button', { name: tab, exact: true }).click({ timeout: 5000 });
        await page.waitForTimeout(400);
      }
    }
  });

  await round('modals x3', async () => {
    for (let i = 0; i < 3; i++) {
      const printBtn = page.locator('button:has-text("Print")').last();
      await printBtn.click({ timeout: 5000 });
      await page.waitForTimeout(300);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      const row = page.locator('[data-row-id]:not([aria-disabled="true"])').first();
      await row.click({ button: 'right', timeout: 5000 });
      await page.waitForTimeout(300);
      await page.mouse.click(8, 8);
      await page.waitForTimeout(300);
    }
  });

  await round('edit+undo churn x2', async () => {
    const editBtn = page.locator('button:has-text("Edit")').last();
    await editBtn.click({ timeout: 5000 });
    await page.waitForTimeout(300);
    for (let i = 0; i < 2; i++) {
      const cellInput = page.locator('[data-row-id]:not([aria-disabled="true"]) input.cell-input, [data-row-id]:not([aria-disabled="true"]) textarea.cell-input').first();
      await cellInput.click({ timeout: 5000 });
      for (let k = 0; k < 8; k++) await page.keyboard.press('a');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(300);
      for (let u = 0; u < 8; u++) {
        await page.keyboard.press('Meta+z');
        await page.waitForTimeout(80);
      }
      for (let r = 0; r < 8; r++) {
        await page.keyboard.press('Meta+Shift+z');
        await page.waitForTimeout(80);
      }
    }
    await editBtn.click({ timeout: 5000 });
  });

  await round('undo-history x60', async () => {
    const cellInput = page.locator('[data-row-id] input.cell-input, [data-row-id] textarea.cell-input').first();
    await cellInput.click({ timeout: 5000 });
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press('a');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(25);
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1500);
  });

  await round('drags x5', async () => {
    for (let i = 0; i < 5; i++) {
      const row = page.locator('[data-row-id]:not([aria-disabled="true"])').nth(i % 10);
      const box = await row.boundingBox();
      if (!box) continue;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(120);
      await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 160, { steps: 8 });
      await page.waitForTimeout(120);
      await page.mouse.up();
      await page.waitForTimeout(300);
    }
  });

  await round('glide edits', async () => {
    await page.getByRole('button', { name: 'Breakdown' }).click({ timeout: 5000 });
    await page.waitForTimeout(1500);
    for (let i = 0; i < 3; i++) {
      await page.mouse.click(300 + i * 60, 220);
      await page.waitForTimeout(300);
      await page.keyboard.type('42');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(400);
    }
  });

  await round('stripboard navigation x40', async () => {
    await page.getByRole('button', { name: 'Schedule' }).click({ timeout: 5000 });
    await page.waitForTimeout(800);
    const row = page.locator('[data-row-id]').first();
    const box = await row.boundingBox();
    if (box) {
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      for (let k = 0; k < 40; k++) {
        await page.keyboard.press('ArrowDown');
        await page.waitForTimeout(40);
      }
    }
  });

  await round('8s idle', async () => {
    await page.waitForTimeout(8000);
  });

  console.log('\n=== MEMORY DIAGNOSIS SUMMARY ===');
  for (const line of results) console.log(line);

  const end = results.length;
  const lastLine = results[end - 1];
  const parse = (l: string) => ({ heap: parseFloat(l.match(/heap=([\d.]+)MB/)![1]), dom: parseInt(l.match(/liveDOM=(\d+)/)![1], 10) });
  const first = parse(results[0]);
  const last = parse(lastLine);
  const heapGrowth = last.heap - first.heap;
  const domGrowth = last.dom - first.dom;
  console.log(`\nnet heap growth (after GC): ${heapGrowth >= 0 ? '+' : ''}${heapGrowth.toFixed(1)}MB`);
  console.log(`net live-DOM growth: ${domGrowth >= 0 ? '+' : ''}${domGrowth} nodes`);
  const verdict =
    heapGrowth > 30 || domGrowth > 5000
      ? 'SIGNATURE: possible leak (heap or live DOM grows after forced GC)'
      : heapGrowth > 8
        ? 'SIGNATURE: mild growth, inspect'
        : 'SIGNATURE: flat - no obvious leak';
  console.log(verdict);
});
