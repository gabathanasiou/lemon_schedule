import { test, Page, CDPSession } from '@playwright/test';
import { loadSeedProject, seedProjectScript, openSeededProject } from './helpers';
import { buildPerfScript } from './perfScriptFixture';

async function openSeeded(page: Page) {
  const seed = loadSeedProject();
  await page.addInitScript(seedProjectScript(seed));
  await page.goto('/lemon_schedule/');
  const title = JSON.parse(seed.raw).title;
  await page.getByText(title, { exact: true }).first().click({ timeout: 8000 });
  await page.waitForTimeout(1000);
}

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

test('@perf diagnosis: memory + cpu over repeated workflows (Town project)', async ({ page }) => {
  test.setTimeout(600000);
  await openSeeded(page);
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
            await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      const row = page.locator('[data-row-id]:not([aria-disabled="true"])').first();
      await row.click({ button: 'right', timeout: 5000 });
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
        // key:'Z' — the real Shift payload (roadmap 238).
        await page.keyboard.press('Meta+Shift+Z');
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
            await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 160, { steps: 8 });
            await page.mouse.up();
      await page.waitForTimeout(300);
    }
  });

  await round('glide edits', async () => {
    await page.getByRole('button', { name: 'Breakdown' }).click({ timeout: 5000 });
    await page.waitForTimeout(1500);
    for (let i = 0; i < 3; i++) {
      await page.mouse.click(300 + i * 60, 220);
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

/**
 * Roadmap 263 — tab / sub-tab switching responsiveness.
 *
 * Measures, per switch, two user-facing numbers plus the main-thread stall:
 *  - `firstFrame`: click → first animation frame — the length of the click
 *    task itself, i.e. how long the pill feedback is stuck behind any
 *    synchronous render the click triggers (before roadmap 263 that included
 *    the whole new-surface mount).
 *  - `content`: click → the new surface's anchor is in the DOM + one frame.
 *  - `maxTask` / `blocking`: longest longtask (>50ms) and total blocking time
 *    (sum of the over-50ms parts) between the click and the content landing.
 *
 * Run against the prod preview with a heavy real project:
 *   LEMON_SEED_PATH="/path/Lair (perf test).lemon" \
 *     npx playwright test --config=playwright.perf-prod.config.ts --grep "tab switch"
 */
test('@perf tab switch: click feedback + content mount (roadmap 263)', async ({ page }) => {
  test.setTimeout(600000);
  // The bridge drives the project-change round; the perf configs don't preset
  // the prod agent flag the suite's storageState normally sets.
  await page.addInitScript(() => { try { localStorage.setItem('LEMON_AGENT', '1'); } catch { /* ignore */ } });
  // The pill trace must run with motion ON — the perf configs force
  // reducedMotion:'reduce' (matching the main suite), which disables the
  // pill's transition and would make every trace look like a jump.
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await openSeededProject(page);

  const size = await page.evaluate(() => {
    const b = (window as any).__lemonSchedule;
    const p = b.getProject();
    const rows = b.getRows();
    return {
      title: p.title,
      scenes: p.scenes.length,
      rows: rows.rows.length,
      sections: rows.sections.length,
      scriptScenes: p.scriptDocument?.scenes?.length ?? 0,
      annotations: (p.scriptAnnotations || []).length,
    };
  });
  console.log(`[tab-switch] project: ${size.title} — ${size.scenes} scenes / ${size.rows} rows / ${size.sections} sections / ${size.scriptScenes} script scenes / ${size.annotations} annotations`);

  interface SwitchSample {
    label: string;
    run: number;
    error?: string;
    firstFrame?: number;
    content?: number;
    maxTask?: number;
    blocking?: number;
  }

  const measure = async (label: string, run: number, target: { tab?: string; sub?: string; anchor: string }): Promise<SwitchSample> => {
    const r = await page.evaluate(async ({ tab, sub, anchor }) => {
      const raf = () => new Promise<void>((res) => requestAnimationFrame(() => res()));
      const findBtn = (name: string) =>
        Array.from(document.querySelectorAll<HTMLElement>('button'))
          .find((b) => (b.textContent || '').trim() === name && b.getBoundingClientRect().width > 0
            // skip the outgoing surface while it is inert (roadmap 263)
            && !b.closest('[inert]')) || null;
      const name = tab || sub || '';
      const btn = findBtn(name);
      if (!btn) return { error: `no visible button "${name}"` };
      const tasks: number[] = [];
      let po: PerformanceObserver | null = null;
      try {
        po = new PerformanceObserver((list) => { for (const e of list.getEntries()) tasks.push(e.duration); });
        po.observe({ type: 'longtask' });
      } catch { /* longtask unsupported */ }
      const t0 = performance.now();
      btn.click();
      // The click's task (incl. any synchronous React render it caused) is done
      // and the browser is about to paint — the pill's visible frame.
      await raf();
      const firstFrame = performance.now() - t0;
      const found = () => !!document.querySelector(anchor);
      if (!found()) {
        await new Promise<void>((resolve) => {
          const mo = new MutationObserver(() => { if (found()) { mo.disconnect(); resolve(); } });
          mo.observe(document.body, { childList: true, subtree: true });
          setTimeout(() => { mo.disconnect(); resolve(); }, 30000);
        });
      }
      await raf();
      const content = performance.now() - t0;
      po?.disconnect();
      const maxTask = tasks.length ? Math.max(...tasks) : 0;
      const blocking = tasks.filter((d) => d > 50).reduce((n, d) => n + (d - 50), 0);
      return { firstFrame: Math.round(firstFrame), content: Math.round(content), maxTask: Math.round(maxTask), blocking: Math.round(blocking) };
    }, target);
    return { label, run, ...(r as any) };
  };

  const samples: SwitchSample[] = [];
  const log = (s: SwitchSample) => {
    if (s.error) { console.log(`[tab-switch] ${s.label} #${s.run}: SKIPPED (${s.error})`); return; }
    console.log(
      `[tab-switch] ${s.label} #${s.run}: firstFrame=${s.firstFrame}ms content=${s.content}ms ` +
      `maxTask=${s.maxTask}ms blocking=${s.blocking}ms`,
    );
  };
  /** Samples the header pill's per-frame geometry across a tap so we can tell
   *  an actual glide (many intermediate positions) from a jump (the transition
   *  starved by the mount, first sample already at the destination). */
  const pillTrace = async (label: string, target: { tab?: string; sub?: string; anchor: string }) => {
    // `useSlidingPill` drops the transition for 250ms after any observed
    // resize (boot/observe counts) — wait until the pill actually carries one,
    // or the trace measures a motionless element on purpose.
    await page.waitForFunction(() => {
      const el = document.querySelector('header [aria-hidden="true"].absolute');
      return !!el && el.className.includes('transition-');
    }, null, { timeout: 5000 }).catch(() => {});
    const trace = await page.evaluate(async ({ tab, sub, anchor }) => {
      const pill = () => document.querySelector<HTMLElement>('header [aria-hidden="true"].absolute');
      const findBtn = (name: string) =>
        Array.from(document.querySelectorAll<HTMLElement>('button'))
          .find((b) => (b.textContent || '').trim() === name && b.getBoundingClientRect().width > 0
            // skip the outgoing surface while it is inert (roadmap 263)
            && !b.closest('[inert]')) || null;
      const btn = findBtn(tab || sub || '');
      if (!btn || !pill()) return { error: `pill or button missing (${tab || sub})` };
      const frames: { t: number; left: number; width: number }[] = [];
      let stop = false;
      const tick = () => {
        if (stop) return;
        const r = pill()!.getBoundingClientRect();
        frames.push({ t: performance.now(), left: r.left, width: r.width });
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      await new Promise((r) => setTimeout(r, 100));
      const contentFound = () => !!document.querySelector(anchor);
      const contentAt = new Promise<number>((resolve) => {
        if (contentFound()) return resolve(performance.now());
        const mo = new MutationObserver(() => { if (contentFound()) { mo.disconnect(); resolve(performance.now()); } });
        mo.observe(document.body, { childList: true, subtree: true });
        setTimeout(() => { mo.disconnect(); resolve(-1); }, 30000);
      });
      const clickAt = performance.now();
      btn.click();
      const content = await contentAt;
      await new Promise((r) => setTimeout(r, 600));
      stop = true;
      return { frames, clickAt, content };
    }, target);
    if ((trace as any).error) { console.log(`[tab-switch] pill trace ${label}: ${(trace as any).error}`); return; }
    const { frames, clickAt, content } = trace as { frames: { t: number; left: number; width: number }[]; clickAt: number; content: number };
    if (!frames.length) { console.log(`[tab-switch] pill trace ${label}: no frames sampled`); return; }
    const before = [...frames].reverse().find((f) => f.t < clickAt) ?? frames[0];
    const after = frames.filter((f) => f.t >= clickAt);
    // Distinct-position sequence with each move's arrival time (ms after click).
    const seq: { dt: number; left: number }[] = [];
    let lastLeft = Math.round(before.left);
    seq.push({ dt: Math.round((before.t - clickAt) * 10) / 10, left: lastLeft });
    for (const f of after) {
      const l = Math.round(f.left);
      if (l !== lastLeft) { seq.push({ dt: Math.round((f.t - clickAt) * 10) / 10, left: l }); lastLeft = l; }
    }
    const intermediates = Math.max(0, seq.length - 2);
    console.log(
      `[tab-switch] pill trace ${label}: ${seq.map((s) => `${s.dt}ms:${s.left}`).join(' → ')} ` +
      `(${intermediates} intermediate frame${intermediates === 1 ? '' : 's'}), content=${Math.round(content - clickAt)}ms`,
    );
  };

  /** First visit + repeat visit of `go`, with an unmeasured switch back in
   *  between so the second visit genuinely re-visits an already-mounted tab.
   *  Leaves the page on `go`'s target. */
  const measureVisitPair = async (
    label: string,
    go: { tab?: string; sub?: string; anchor: string },
    back: { tab?: string; sub?: string; anchor: string },
  ) => {
    const first = await measure(label, 1, go);
    samples.push(first);
    log(first);
    await page.waitForTimeout(400);
    const reset = await measure('(reset)', 0, back);
    if (reset.error) console.log(`[tab-switch] reset for ${label}: ${reset.error}`);
    await page.waitForTimeout(400);
    const repeat = await measure(label, 2, go);
    samples.push(repeat);
    log(repeat);
    await page.waitForTimeout(400);
  };

  // Reality check + pill trace on the FIRST visit to Schedule (the worst
  // case): the trace tells a real glide from a starved transition, the DOM
  // counts prove the heavy surface actually rendered.
  await pillTrace('Breakdown→Schedule', { tab: 'Schedule', anchor: '[data-presence-surface="schedule"]' });
  const settled = await page.evaluate(() => ({
    days: document.querySelectorAll('[data-testid="stripboard-day"]').length,
    rows: document.querySelectorAll('[data-row-id]').length,
    dom: document.querySelectorAll('*').length,
  }));
  console.log(`[tab-switch] schedule settled: ${settled.days} day blocks / ${settled.rows} row els / ${settled.dom} DOM nodes`);
  await page.getByRole('button', { name: 'Breakdown', exact: true }).click();
  await page.waitForSelector('[data-presence-grid="breakdown-glide"]');
  await page.waitForTimeout(300);

  // Breakdown (Glide) is the boot sub-tab; boot → Schedule is the first
  // "leaving the boot tab" switch the user ever sees.
  await measureVisitPair('Breakdown→Schedule',
    { tab: 'Schedule', anchor: '[data-presence-surface="schedule"]' },
    { tab: 'Breakdown', anchor: '[data-presence-grid="breakdown-glide"]' });
  await measureVisitPair('Schedule→Calendar',
    { tab: 'Calendar', anchor: '[data-cal-grid]' },
    { tab: 'Schedule', anchor: '[data-presence-surface="schedule"]' });
  await measureVisitPair('Calendar→Breakdown',
    { tab: 'Breakdown', anchor: '[data-presence-grid="breakdown-glide"]' },
    { tab: 'Calendar', anchor: '[data-cal-grid]' });

  // Sub-tabs within Breakdown: Glide → Sheet → Script → Glide.
  await measureVisitPair('Glide→Sheet',
    { sub: 'Sheet', anchor: '[data-sheet-sticky]' },
    { sub: 'Glide Breakdown', anchor: '[data-presence-grid="breakdown-glide"]' });
  if (size.scriptScenes > 0) {
    // Only meaningful with a retained screenplay (the demo seed has none —
    // point LEMON_SEED_PATH at a real project for the script numbers).
    await measureVisitPair('Sheet→Script',
      { sub: 'Script', anchor: '[data-testid="script-scene"]' },
      { sub: 'Sheet', anchor: '[data-sheet-sticky]' });
    await measureVisitPair('Script→Glide',
      { sub: 'Glide Breakdown', anchor: '[data-presence-grid="breakdown-glide"]' },
      { sub: 'Script', anchor: '[data-testid="script-scene"]' });
  } else {
    console.log('[tab-switch] no screenplay in this project — Script sub-tab pairs skipped');
  }

  console.log('\n=== TAB-SWITCH SUMMARY (first visit -> repeat) ===');
  const byLabel = new Map<string, SwitchSample[]>();
  for (const s of samples) {
    if (!byLabel.has(s.label)) byLabel.set(s.label, []);
    byLabel.get(s.label)!.push(s);
  }
  for (const [label, runs] of byLabel) {
    const fmt = (s: SwitchSample) => s.error ? 'n/a' : `${s.content}ms(blk ${s.blocking})`;
    console.log(`${label}: ${runs.map(fmt).join(' -> ')}`);
  }
});

test('@perf script tab: open + interactions with a full screenplay (roadmap 163)', async ({ page }) => {
  test.setTimeout(600000);
  // The bridge drives the project-change round; the perf configs don't preset
  // the prod agent flag the suite's storageState normally sets.
  await page.addInitScript(() => { try { localStorage.setItem('LEMON_AGENT', '1'); } catch { /* ignore */ } });
  const stats = { scenes: 0, blocks: 0, annotations: 0 };
  await openSeededProject(page, (p) => {
    // Prefer the project's OWN retained screenplay (a real production project
    // via LEMON_SEED_PATH — the honest heavy input); synthesize one only for
    // the committed demo seed, which has no script.
    if (!p.scriptDocument?.scenes?.length) {
      const { doc, annotations } = buildPerfScript(p);
      p.scriptDocument = doc;
      p.scriptAnnotations = annotations;
    }
    const doc = p.scriptDocument;
    stats.scenes = doc.scenes.length;
    stats.blocks = doc.scenes.reduce((n: number, s: any) => n + s.blocks.length, 0);
    stats.annotations = (p.scriptAnnotations || []).length;
  });
  console.log(`[script] fixture: ${stats.scenes} scenes / ${stats.blocks} blocks / ${stats.annotations} committed annotations`);

  await page.getByRole('button', { name: 'Breakdown', exact: true }).click();
  await page.waitForTimeout(500);
  const cdp = await getCdp(page);
  // Tablet-class CPU (the escalated report came from an iPad-class device);
  // on a fast desktop headless run the jank barely registers unthrottled.
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

  const openStart = Date.now();
  const beforeOpen = await counters(cdp);
  await page.getByRole('button', { name: 'Script', exact: true }).click();
  await page.locator('[data-testid="script-scene"]').last().waitFor({ state: 'attached', timeout: 180000 });
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))));
  const openWall = Date.now() - openStart;
  fmtDelta(beforeOpen, await counters(cdp), 'script open');
  console.log(`[script] open wall=${openWall}ms`);
  const afterOpenMem = await sample(page, cdp);
  console.log('[script] after open', fmt(afterOpenMem));

  const spans = await page.evaluate(() => {
    const scenes = document.querySelectorAll('[data-testid="script-scene"]');
    const last = scenes[scenes.length - 1] as HTMLElement | undefined;
    return {
      scenes: scenes.length,
      committed: document.querySelectorAll('[data-annotation-id]:not([data-annotation-id^="attached:"]):not([data-annotation-id^="suggest:"])').length,
      attached: document.querySelectorAll('[data-annotation-id^="attached:"]').length,
      suggestions: document.querySelectorAll('[data-annotation-id^="suggest:"]').length,
      dom: document.querySelectorAll('*').length,
      // Find-in-page / selection durability: offscreen content must stay in the DOM.
      lastSceneChars: last?.textContent?.length ?? 0,
    };
  });
  console.log('[script] rendered', JSON.stringify(spans));
  if (spans.committed === 0 || spans.attached === 0 || spans.suggestions === 0) {
    console.log('[script] WARNING: expected all three span kinds (committed / attached / suggestions) to render');
  }

  const round = async (label: string, fn: () => Promise<void>) => {
    const before = await counters(cdp);
    await fn();
    await page.waitForTimeout(400);
    fmtDelta(before, await counters(cdp), label);
  };

  await round('hover tags x24', async () => {
    // Pure hover cost: spans already inside the viewport, moved to by
    // coordinates — no actionability scroll (that would measure chunk reveal,
    // not hover).
    const points = await page.evaluate(() => {
      const out: { x: number; y: number }[] = [];
      for (const el of document.querySelectorAll<HTMLElement>('[data-annotation-id]')) {
        const r = el.getBoundingClientRect();
        if (r.top > 0 && r.bottom < window.innerHeight && r.width > 0) {
          out.push({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
          if (out.length >= 24) break;
        }
      }
      return out;
    });
    for (const p of points) {
      await page.mouse.move(p.x, p.y);
      await page.waitForTimeout(30);
    }
  });

  await round('select text x6', async () => {
    for (let i = 0; i < 6; i++) {
      await page.evaluate((n) => {
        const scenes = document.querySelectorAll('[data-testid="script-scene"]');
        const scene = scenes[n % scenes.length];
        const block = scene?.querySelectorAll('[data-script-block]')[3];
        if (!block) return;
        const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
        const node = walker.nextNode();
        if (!node) return;
        const range = document.createRange();
        range.setStart(node, 0);
        range.setEnd(node, Math.min(5, node.textContent?.length || 0));
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
        block.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      }, i);
      await page.getByPlaceholder('Search categories…').waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
      await page.keyboard.press('Escape');
      await page.waitForTimeout(25);
    }
  });

  // The header search is a morph field: expand its icon trigger once, then the
  // input stays mounted (collapsed only on Escape/outside click).
  const scriptSearchInput = page.locator('[data-morph-search-input]');
  if (!(await scriptSearchInput.isVisible())) {
    await page.locator('[data-morph-search-trigger]').click();
  }
  await round('search type 6 chars', async () => {
    const input = scriptSearchInput;
    await input.click();
    await input.pressSequentially('GEORGE', { delay: 60 });
    await page.waitForTimeout(250);
    await input.fill('');
  });

  await round('project change while open x10 + undo', async () => {
    const sceneId = await page.evaluate(() => (window as any).__lemonSchedule.getProject().scenes[0].id);
    for (let i = 0; i < 10; i++) {
      await page.evaluate(
        ({ id, n }) => (window as any).__lemonSchedule.dispatch({ type: 'UPDATE_SCENE', payload: { id, notes: `perf-${n}` } }),
        { id: sceneId, n: i },
      );
    }
    await page.evaluate(() => { for (let i = 0; i < 10; i++) (window as any).__lemonSchedule.undo(); });
  });

  // ---- tag add / remove: the flows that must feel instant ----
  const selectNeedle = (needle: string) => page.evaluate((n) => {
    const blocks = Array.from(document.querySelectorAll('[data-script-block]'));
    for (const block of blocks) {
      // Only live-matched scenes are taggable (they carry the scene id).
      if (!block.getAttribute('data-script-scene')) continue;
      const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        const text = node.textContent || '';
        const idx = text.toLowerCase().indexOf(n.toLowerCase());
        if (idx < 0) continue;
        const range = document.createRange();
        range.setStart(node, idx);
        range.setEnd(node, idx + n.length);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
        block.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        return true;
      }
    }
    return false;
  }, needle);

  const castName = await page.evaluate(() => {
    const cast = (window as any).__lemonSchedule.getProject().castMembers || [];
    return (cast.find((m: any) => (m.name || '').length > 2)?.name || '') as string;
  });

  /** A long word from a taggable block that matches NO element name — the
   *  deterministic "brand-new element" selection. */
  const unknownWord = await page.evaluate(() => {
    const p = (window as any).__lemonSchedule.getProject();
    const names = new Set<string>();
    for (const list of Object.values(p.breakdownElements || {}) as any[][]) {
      for (const e of list) names.add(String(e.name || '').toUpperCase());
    }
    for (const m of p.castMembers || []) names.add(String(m.name || '').toUpperCase());
    for (const block of Array.from(document.querySelectorAll('[data-script-block]'))) {
      if (!block.getAttribute('data-script-scene')) continue;
      for (const w of (block.textContent || '').split(/[^A-Za-z']+/)) {
        const up = w.toUpperCase();
        if (up.length >= 7 && !names.has(up)) return w;
      }
    }
    return null;
  });

  await round('tag add x5 → undo (existing cast element)', async () => {
    const times: number[] = [];
    for (let i = 0; i < 5; i++) {
      const t = Date.now();
      const ok = await selectNeedle(castName);
      if (!ok) { console.log('[script] WARNING: cast name not found in the body'); break; }
      // The menu anchors at the selection (possibly offscreen) — commit via the
      // real keyboard flow: the anchored Cast suggestion is highlighted, Enter
      // activates it.
      await page.getByPlaceholder('Search categories…').waitFor({ state: 'visible', timeout: 5000 });
      await page.keyboard.press('Enter');
      await page.waitForTimeout(25);
      times.push(Date.now() - t);
      await page.evaluate(() => (window as any).__lemonSchedule.undo());
      await page.waitForTimeout(25);
    }
    console.log(`[script] add-tag wall per op (ms): ${times.join(', ')}`);
  });

  await round('tag remove x5 → undo (committed tag)', async () => {
    const times: number[] = [];
    const annotationCount = await page.evaluate(() => ((window as any).__lemonSchedule.getProject().scriptAnnotations || []).length);
    for (let i = 0; i < 5; i++) {
      // Settle the previous undo before re-resolving the span.
      await page.waitForFunction((n) => ((window as any).__lemonSchedule.getProject().scriptAnnotations || []).length === n, annotationCount, { timeout: 5000 }).catch(() => {});
      const id = await page.evaluate(() => {
        const el = document.querySelector('[data-annotation-id]:not([data-annotation-id^="attached:"]):not([data-annotation-id^="suggest:"])');
        return el?.getAttribute('data-annotation-id') ?? null;
      });
      if (!id) { console.log('[script] WARNING: no committed tag span found'); break; }
      const t = Date.now();
      // Dispatch on the span itself — a real pointer click would race the
      // foveated chunk reveal's layout (hit-testing is covered by the e2e suite).
      await page.locator(`[data-annotation-id="${id}"]`).evaluate(el => (el as HTMLElement).click());
      await page.getByRole('menuitem', { name: 'Remove' }).click({ timeout: 5000 });
      await page.waitForTimeout(25);
      times.push(Date.now() - t);
      await page.evaluate(() => (window as any).__lemonSchedule.undo());
      await page.waitForTimeout(25);
    }
    console.log(`[script] remove-tag wall per op (ms): ${times.join(', ')}`);
  });

  await round('tag add x5 → undo (new element from selection)', async () => {
    const times: number[] = [];
    for (let i = 0; i < 5; i++) {
      const t = Date.now();
      const ok = unknownWord ? await selectNeedle(unknownWord) : false;
      if (!ok) { console.log('[script] WARNING: no unknown word found in a taggable block'); break; }
      // No anchor on a fresh word: filter the menu to Props and commit with Enter.
      const search = page.getByPlaceholder('Search categories…');
      await search.waitFor({ state: 'visible', timeout: 5000 });
      await search.fill('Props');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(25);
      times.push(Date.now() - t);
      await page.evaluate(() => (window as any).__lemonSchedule.undo());
      await page.waitForTimeout(25);
    }
    console.log(`[script] add-new-element wall per op (ms): ${times.join(', ')}`);
  });

  const checkJump = async (label: string, expectedIndex: number, opts: { allowEndOfDocument?: boolean } = {}) => {
    const check = await page.evaluate(({ idx, allowShort }) => {
      const scenes = document.querySelectorAll<HTMLElement>('[data-testid="script-scene"]');
      const target = scenes[idx];
      const scroller = scenes[0]?.closest('.overflow-auto') as HTMLElement | null;
      if (!target || !scroller) return null;
      const sr = scroller.getBoundingClientRect();
      const r = target.getBoundingClientRect();
      const visible = r.top < sr.bottom && r.bottom > sr.top;
      return {
        offsetFromTop: Math.round(r.top - sr.top),
        visible,
        chunkVisible: target.classList.contains('cv-visible'),
        blank: (target.textContent || '').length === 0,
        allowShort,
      };
    }, { idx: expectedIndex, allowShort: !!opts.allowEndOfDocument });
    console.log(`[script] ${label}`, JSON.stringify(check));
    const aligned = check ? (check.allowShort ? check.visible : check.offsetFromTop >= -2 && check.offsetFromTop <= 40) : false;
    if (!check || !aligned || !check.chunkVisible || check.blank) {
      console.log(`[script] WARNING: ${label} did not land cleanly`);
    }
  };

  await round('jump to a mid-document scene (sidebar)', async () => {
    const rows = page.locator('aside [data-sidebar-row]');
    const mid = Math.floor((await rows.count()) / 2);
    await rows.nth(mid).click({ timeout: 5000 });
    await page.waitForTimeout(600);
    await checkJump('mid-scene jump', mid);
  });

  await round('jump to last scene (sidebar)', async () => {
    // Foveated chunks make far jumps geometry-dependent — assert the target is
    // rendered (cv-visible, no blank chunk); the last scene can only align as
    // far as the document end allows.
    const rows = page.locator('aside [data-sidebar-row]');
    const last = (await rows.count()) - 1;
    await rows.last().click({ timeout: 5000 });
    await page.waitForTimeout(600);
    await checkJump('last-scene jump', last, { allowEndOfDocument: true });
  });

  await round('wheel scroll x40', async () => {
    // Back to the top first — the jump rounds left the scroller at the end.
    await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>('[data-testid="script-view"] .overflow-auto');
      if (el) el.scrollTop = 0;
    });
    await page.waitForTimeout(200);
    const viewBox = await page.getByTestId('script-view').boundingBox();
    const x = viewBox ? viewBox.x + viewBox.width * 0.6 : 600;
    const y = viewBox ? viewBox.y + viewBox.height * 0.5 : 400;
    await page.mouse.move(x, y);
    for (let i = 0; i < 40; i++) {
      await page.mouse.wheel(0, 700);
      await page.waitForTimeout(16);
    }
  });

  const endMem = await sample(page, cdp);
  console.log('\n=== SCRIPT TAB PERF SUMMARY ===');
  console.log(`fixture: ${stats.scenes} scenes / ${stats.blocks} blocks / ${stats.annotations} annotations`);
  console.log(`open wall: ${openWall}ms`);
  console.log(`after open: ${fmt(afterOpenMem)}`);
  console.log(`end: ${fmt(endMem)}`);
});
