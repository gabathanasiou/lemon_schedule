import { test, expect } from '@playwright/test';
import { loadSeedProject, seedProjectScript } from './helpers';

// Roadmap 22/28 verification:
//  - 22: Breakdown attributes (cast, props, …) are pickable inside DAY
//    repeaters and resolve per-day — the union of that day's scenes' values.
//  - 28: text/field border + background render WYSIWYG with auto text color
//    (black header cells → white text; light cells stay black).

const B = (n: string) => `gbl-${n}`;

function gapBreakdownLookDesign() {
  return {
    id: 'gbl-test-design',
    name: 'Gap Breakdown Look',
    createdAt: Date.now(),
    page: 'portrait' as const,
    blocks: [
      { id: B('g1'), type: 'text', text: 'Gap block one', fontSize: 12 },
      { id: B('g2'), type: 'text', text: 'Gap block two', fontSize: 12 },
      {
        id: B('d1'), type: 'repeat', collection: 'days', gap: 8,
        children: [
          { id: B('d1c1'), type: 'text', text: 'Day {{dayNumber}} — {{cast}}' },
          { id: B('d1c2'), type: 'text', text: 'Props: {{props}}' },
          // nested days→scenes must stay unchanged: scene-scope fields still
          // resolve per SCENE inside a scenes-of-day repeat
          {
            id: B('d1r2'), type: 'repeat', collection: 'scenesOfDay',
            children: [
              { id: B('d1r2c1'), type: 'text', text: 'SC {{sceneNumber}} — {{cast}}' },
            ],
          },
        ],
      },
      {
        id: B('c1'), type: 'columns',
        cols: [
          { id: B('cc1'), width: 50, blocks: [{ id: B('cellA'), type: 'text', text: 'BLACK HEADER', background: '#000000', border: true }] },
          { id: B('cc2'), width: 50, blocks: [{ id: B('cellB'), type: 'text', text: 'bordered cell', border: true }] },
        ],
      },
    ],
  };
}

/** Replicates the app's per-day Breakdown union (useDaybreakSections →
 *  buildReportCtx → dayBreakdownValue): stripboard rows only (containerId 1),
 *  distinct cast names / distinct raw values across the day's scenes in
 *  stripboard order, one entry per production day (the pinned daybreak section
 *  is skipped). */
function dayBreakdowns(seed: any) {
  const v = seed.versions.find((x: any) => x.id === seed.activeVersionId);
  const castNames = new Map((seed.castMembers || []).map((m: any) => [m.id, m.name]));
  // same container filter + order sort as useDaybreakSections; sections are
  // pushed at each DAYBREAK with the content BEFORE it (computeRowData)
  const containerRows = (v.rows || []).filter((r: any) => r.containerId != null && r.containerId !== -1)
    .sort((a: any, b: any) => ((a.containerId || 0) - (b.containerId || 0)) || (a.order - b.order));
  const sections: { pinned: boolean; sceneIds: string[] }[] = [];
  let pending: string[] = [];
  for (const r of containerRows) {
    if (r.type === 'DAYBREAK') { sections.push({ pinned: !!r.pinned, sceneIds: pending }); pending = []; }
    else if (r.type === 'SCENE' && r.sceneId) pending.push(r.sceneId);
  }
  const union = (sceneIds: string[], read: (sc: any) => string) => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const id of sceneIds) {
      const sc = seed.scenes.find((s: any) => s.id === id);
      if (!sc) continue;
      for (const part of read(sc).split(',').map((x: string) => x.trim()).filter(Boolean)) {
        const k = part.toLowerCase();
        if (!seen.has(k)) { seen.add(k); out.push(part); }
      }
    }
    return out.join(', ');
  };
  return sections.filter(s => !s.pinned).map(s => ({
    cast: union(s.sceneIds, sc => String(sc.cast || '').split(',').map((id: string) => castNames.get(id.trim()) || id.trim()).join(',')),
    props: union(s.sceneIds, sc => String(sc.props || '')),
  }));
}

async function openDesignerWithDesign(page: any, project: any) {
  await page.addInitScript(seedProjectScript({ raw: JSON.stringify(project) }));
  // Stub window.print (headless fires afterprint synchronously, the print view
  // stays mounted) and fail sun/weather + geocode fetches (they dangle
  // headless before the print view renders).
  await page.addInitScript(() => {
    window.print = () => {};
    const realFetch = window.fetch.bind(window);
    window.fetch = (input: any, init?: any) => {
      const url = String(typeof input === 'string' ? input : input?.url || input);
      if (url.includes('open-meteo') || url.includes('nominatim')) return Promise.reject(new Error('blocked for test'));
      return realFetch(input as any, init as any);
    };
  });
  await page.goto('http://localhost:3001/lemon_schedule/');
  await page.getByText(project.title, { exact: true }).first().click({ timeout: 8000 });
    await page.getByRole('button', { name: 'Design', exact: true }).click();
  await page.getByRole('button', { name: 'Reports Designer', exact: true }).click();
  }

test('days repeat resolves Breakdown attributes per-day; palette offers the Breakdown group', async ({ page }) => {
  const seed = loadSeedProject();
  const project = JSON.parse(seed.raw);
  project.reportDesigns = [gapBreakdownLookDesign(), ...(project.reportDesigns || [])];
  project.activeReportId = gapBreakdownLookDesign().id;
  await openDesignerWithDesign(page, project);

  const days = dayBreakdowns(project);
  const first = days[0];
  const second = days[1];
  expect(first.cast).not.toBe('');
  expect(second.cast).not.toBe('');
  expect(second.cast).not.toBe(first.cast); // distinct per-day unions

  // The canvas samples the first item that resolves the most ITEM data — for
  // this design, the first day whose cast AND props unions are both non-empty.
  const sampled = days.find(d => d.cast && d.props) || first;

  // The tokens resolve to the sampled day's union instead of staying raw
  // {{tokens}}. (.report-text-block only — the block-card wrapper repeats the
  // same text.)
  const canvasText = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.report-text-block'))
      .map(el => (el as HTMLElement).innerText?.trim())
      .filter(Boolean)
      .join('\n'),
  );
  expect(canvasText).toContain(`Day ${sampled.cast ? days.indexOf(sampled) + 1 : 1} — ${sampled.cast}`);
  expect(canvasText).toContain(`Props: ${sampled.props}`);
  expect(canvasText).not.toContain('{{cast}}');
  expect(canvasText).not.toContain('{{props}}');

  // Nested days→scenes unchanged: the scenes-of-day repeat resolves a real
  // scene's per-scene fields (scene-scope path, not the day union).
  const scLine = canvasText.split('\n').find(l => /^SC \d+ — /.test(l));
  expect(scLine).toBeTruthy();
  expect(scLine).not.toContain('{{sceneNumber}}');
  expect(scLine!.replace(/^SC \d+ — /, '')).not.toBe('');

  // Selecting a block inside the days repeat offers the Breakdown group in
  // the attribute palette.
  await page.locator(`[data-block-id="${B('d1c1')}"]`).click({ force: true });
    await expect(page.locator('aside').first().getByText('Breakdown', { exact: true })).toBeVisible();
});

test('preview renders a different Breakdown union for every day', async ({ page }) => {
  const seed = loadSeedProject();
  const project = JSON.parse(seed.raw);
  project.reportDesigns = [gapBreakdownLookDesign(), ...(project.reportDesigns || [])];
  project.activeReportId = gapBreakdownLookDesign().id;
  await openDesignerWithDesign(page, project);

  const days = dayBreakdowns(project);

  await page.getByRole('button', { name: 'Preview' }).click();
  await expect(page.locator('.report-page').first()).toBeVisible({ timeout: 15000 });
  await page.waitForFunction(() => document.querySelectorAll('[data-paginated="true"] .report-page').length >= 2, null, { timeout: 15000 });

  const text = await page.locator('.report-page').allInnerTexts();
  const joined = text.join('\n');
  expect(joined).toContain(`Day 1 — ${days[0].cast}`);
  expect(joined).toContain(`Day 2 — ${days[1].cast}`);
  expect(joined).toContain(`Props: ${days[1].props}`);
});

test('bordered cells with background render with auto text color (canvas + preview)', async ({ page }) => {
  const seed = loadSeedProject();
  const project = JSON.parse(seed.raw);
  project.reportDesigns = [gapBreakdownLookDesign(), ...(project.reportDesigns || [])];
  project.activeReportId = gapBreakdownLookDesign().id;
  await openDesignerWithDesign(page, project);

  const styleOf = (id: string) =>
    page.locator(`[data-block-id="${id}"] .report-text-block`).evaluate(el => {
      const s = getComputedStyle(el);
      return { bg: s.backgroundColor, color: s.color, borderTop: s.borderTopWidth };
    });

  const a = await styleOf(B('cellA'));
  expect(a.bg).toBe('rgb(0, 0, 0)');
  expect(a.color).toBe('rgb(255, 255, 255)'); // black fill → white text
  expect(a.borderTop).not.toBe('0px');

  const b = await styleOf(B('cellB'));
  expect(b.color).toBe('rgb(0, 0, 0)');        // no fill → black text
  expect(b.borderTop).not.toBe('0px');

  // Preview renders the same look (print shares the same ReportBlockView).
  await page.getByRole('button', { name: 'Preview' }).click();
  await expect(page.locator('.report-page').first()).toBeVisible({ timeout: 15000 });
  const cellA = page.locator('.report-page .report-text-block', { hasText: 'BLACK HEADER' }).first();
  await expect(cellA).toBeVisible({ timeout: 15000 });
  const previewStyle = await cellA.evaluate(el => {
    const s = getComputedStyle(el);
    return { bg: s.backgroundColor, color: s.color, borderTop: s.borderTopWidth };
  });
  expect(previewStyle.bg).toBe('rgb(0, 0, 0)');
  expect(previewStyle.color).toBe('rgb(255, 255, 255)');
  expect(previewStyle.borderTop).not.toBe('0px');
});
