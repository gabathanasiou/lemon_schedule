import { test, expect, Page } from '@playwright/test';
import { loadSeedProject, openSeededProject, seedLeadCast } from './helpers';

// Reports designer — items 111/112: the day-scoped Call Times grid block and
// its crew sibling. Static print table in the designer/preview, live inline
// Glide editing in the Call Sheet → Edit canvas (daybreakMeta.elementCalls /
// crewCalls), offered only inside a days repeat.

const design = {
  id: 'grid-test', name: 'Grid Test', createdAt: Date.now(), page: 'portrait' as const,
  blocks: [
    {
      id: 'days', type: 'repeat', collection: 'days',
      children: [
        { id: 'ct', type: 'callTimes', collection: 'elementCallsOfDay' },
        { id: 'crew', type: 'crewTable', collection: 'crewOfDay' },
        { id: 'zone', type: 'callSheetEdit', children: [] },
      ],
    },
  ],
  header: [], footer: [],
};

async function seedGrid(page: Page) {
  const project = JSON.parse(loadSeedProject().raw);
  project.reportDesigns = [design];
  project.activeReportId = design.id;
  await page.addInitScript(({ projectJson, meta }) => {
    const p = JSON.parse(projectJson);
    localStorage.setItem('lemon_schedule_project_v1_' + p.id, JSON.stringify(p));
    localStorage.setItem('lemon_schedule_project_index', JSON.stringify([meta]));
  }, {
    projectJson: JSON.stringify(project),
    meta: { id: project.id, title: project.title, lastModified: Date.now(), createdAt: Date.now() },
  });
  await page.goto('http://localhost:3001/lemon_schedule/');
  await page.getByText(project.title, { exact: true }).first().click({ timeout: 8000 });
}

async function openCallSheetEdit(page: Page) {
  await page.getByRole('button', { name: 'Production' }).click();
  await page.getByRole('button', { name: 'Day Manager', exact: true }).click();
  await expect(page.locator('[data-day-manager]')).toBeVisible({ timeout: 8000 });
  await page.locator('[data-day-manager] header').getByRole('button', { name: /Call Sheet/ }).click();
  await expect(page.locator('[data-call-sheet-edit]')).toBeVisible({ timeout: 8000 });
}

/** First stage column header from the project's call-time settings. */
const firstStageLabel = (page: Page) =>
  page.evaluate(() => {
    const b: any = (window as any).__lemonSchedule;
    const p = b.getProject();
    const s = p.productionInfo?.callTimes;
    const stages = (s?.stages?.length ? s.stages : [
      { key: 'pickup', label: 'Pickup' }, { key: 'arrive', label: 'Arrive' },
      { key: 'hmua', label: 'HMU' }, { key: 'costume', label: 'Costume' }, { key: 'onSet', label: 'On Set' },
    ]);
    return stages[0]?.label || '';
  });

const callsFor = (page: Page, castId: string) =>
  page.evaluate((id) => {
    const b: any = (window as any).__lemonSchedule;
    const p = b.getProject();
    const v = p.versions.find((x: any) => x.id === p.activeVersionId);
    const gov = v.rows.find((r: any) => r.type === 'DAYBREAK' && r.pinned);
    return gov?.daybreakMeta?.elementCalls?.cast?.[id] || null;
  }, castId);

/** Center of a stage cell in the call-sheet page's first element grid. Mirrors
 *  DayTimesGlide's fit-to-card column math (ID 48 · Name 220 · SWF 48 · stages 88). */
async function stageCellPoint(page: Page, row: number, stageIndex: number) {
  const scroller = page.locator('[data-report-grid="elementCalls"] [data-day-times-glide] .dvn-scroller').first();
  const box = (await scroller.boundingBox())!;
  const BASE_WIDTHS = [48, 220, 48, 88, 88, 88, 88, 88];
  const target = Math.max(120, Math.floor(box.width) - 1);
  const total = BASE_WIDTHS.reduce((s, w) => s + w, 0);
  const widths = BASE_WIDTHS.map(w => Math.max(40, Math.floor((w / total) * target)));
  const sum = widths.reduce((s, w) => s + w, 0);
  widths[1] += target - sum;
  const before = widths[0] + widths[1] + widths[2];
  const rowH = 28;
  const headerH = 30;
  return {
    x: box.x + before + stageIndex * widths[3] + widths[3] / 2,
    y: box.y + headerH + row * rowH + rowH / 2,
  };
}

test.describe('Report grid blocks (items 111/112)', () => {
  test('designer renders the fixed-column Call Times + Crew tables; palette is day-gated', async ({ page }) => {
    await seedGrid(page);
    await page.getByRole('button', { name: 'Design', exact: true }).click();
    await page.getByRole('button', { name: 'Reports Designer', exact: true }).click();

    // The days repeat samples day 1 → the real per-category tables render.
    await expect(page.locator('.report-table-cols').first()).toBeVisible({ timeout: 8000 });
    await expect(page.getByText('Cast ID', { exact: true }).first()).toBeVisible({ timeout: 8000 });
    await expect(page.getByText('SWF', { exact: true }).first()).toBeVisible({ timeout: 8000 });
    const stage = await firstStageLabel(page);
    if (stage) await expect(page.getByText(stage, { exact: true }).first()).toBeVisible({ timeout: 8000 });

    const lead = await seedLeadCast(page);
    if (lead.name) await expect(page.getByText(lead.name, { exact: false }).first()).toBeVisible({ timeout: 8000 });

    // Palette UX: the day-gated grid blocks stay ENABLED. At the top level a
    // click explains they only work inside a days repeat; selecting the days
    // repeat lets the same click insert.
    const palette = page.locator('aside').first();
    const callTimesBtn = palette.getByRole('button', { name: 'Call Times', exact: true }).first();
    await expect(callTimesBtn).toBeEnabled();
    await callTimesBtn.click();
    await expect(page.getByText('Can’t drop that here')).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: 'OK' }).click();
    await expect(page.getByText('Can’t drop that here')).toHaveCount(0);
    await page.locator('[data-block-id="days"]').click();
    await palette.getByRole('button', { name: 'Call Times', exact: true }).first().click();
    await expect(page.getByText('Can’t drop that here')).toHaveCount(0);
  });

  test('Call Sheet → Edit edits elementCalls live, one undo entry per op', async ({ page }) => {
    await seedGrid(page);
    await openCallSheetEdit(page);

    const grid = page.locator('[data-report-grid="elementCalls"]');
    await expect(grid).toBeVisible({ timeout: 8000 });
    await expect(grid.locator('[data-day-times-glide]').first()).toBeAttached({ timeout: 8000 });
    await grid.locator('.dvn-scroller').first().scrollIntoViewIfNeeded();
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-report-grid="elementCalls"] [data-day-times-glide] .dvn-scroller') as HTMLElement | null;
      if (!el) return false;
      const w = el.clientWidth;
      const prev = (window as any).__csgWidth;
      (window as any).__csgWidth = w;
      return w > 0 && prev === w;
    }, undefined, { timeout: 5000 });

    const lead = await seedLeadCast(page);
    expect(lead.id).not.toBe('');

    const before = await page.evaluate(() => (window as any).__lemonSchedule.pastCount());
    const pt = await stageCellPoint(page, 0, 0);
    await page.mouse.dblclick(pt.x, pt.y);
    const ta = page.locator('#portal textarea').first();
    await expect(ta).toBeAttached({ timeout: 4000 });
    await ta.click();
    await ta.fill('07:00');
    await expect(ta).toHaveValue('07:00', { timeout: 4000 });
    await ta.press('Enter');

    await expect.poll(() => callsFor(page, lead.id), { timeout: 5000 }).toEqual({ pickup: '07:00' });
    expect(await page.evaluate(() => (window as any).__lemonSchedule.pastCount())).toBe(before + 1);

    await page.evaluate(() => (window as any).__lemonSchedule.undo());
    await expect.poll(() => callsFor(page, lead.id), { timeout: 5000 }).toBeNull();

    // Preview renders the same data as a static table through the measured
    // paginator (the callTimes block flattens into `.report-table-cols` rows).
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    const preview = page.locator('[data-call-sheet-edit]');
    await expect(preview.locator('.report-page').first()).toBeAttached({ timeout: 8000 });
    const stage = await firstStageLabel(page);
    if (stage) await expect(preview.getByText(stage, { exact: true }).first()).toBeVisible({ timeout: 8000 });
  });

  test('crew table block renders and edits crewCalls in Call Sheet → Edit', async ({ page }) => {
    await seedGrid(page);
    await openCallSheetEdit(page);

    const grid = page.locator('[data-report-grid="crew"] [data-crew-table-glide]');
    await expect(grid).toBeAttached({ timeout: 8000 });

    const hasCrew = await page.evaluate(() => {
      const b: any = (window as any).__lemonSchedule;
      const p = b.getProject();
      const v = p.versions.find((x: any) => x.id === p.activeVersionId);
      const gov = v.rows.find((r: any) => r.type === 'DAYBREAK' && r.pinned);
      const crew = Object.values(p.crew || {}).flat() as any[];
      return crew.length > 0 && !!gov;
    });
    test.skip(!hasCrew, 'seed has no crew roster');

    const scroller = grid.locator('.dvn-scroller').first();
    await scroller.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-report-grid="crew"] [data-crew-table-glide] .dvn-scroller') as HTMLElement | null;
      return !!el && el.clientWidth > 0;
    }, undefined, { timeout: 5000 });

    const box = (await scroller.boundingBox())!;
    // Name 120 · Role 90 · Call 90 → the Call column center.
    const total = 300;
    const target = Math.max(120, Math.floor(box.width) - 1);
    const nameW = Math.max(40, Math.floor((120 / total) * target));
    const roleW = Math.max(40, Math.floor((90 / total) * target));
    const callW = Math.max(40, target - nameW - roleW);
    const x = box.x + nameW + roleW + callW / 2;
    const y = box.y + 30 + 14;

    await page.mouse.dblclick(x, y);
    const ta = page.locator('#portal textarea').first();
    await expect(ta).toBeAttached({ timeout: 4000 });
    await ta.click();
    await ta.fill('-30m');
    await expect(ta).toHaveValue('-30m', { timeout: 4000 });
    await ta.press('Enter');

    await expect.poll(() => page.evaluate(() => {
      const b: any = (window as any).__lemonSchedule;
      const p = b.getProject();
      const v = p.versions.find((x: any) => x.id === p.activeVersionId);
      const gov = v.rows.find((r: any) => r.type === 'DAYBREAK' && r.pinned);
      const calls = gov?.daybreakMeta?.crewCalls || [];
      return calls.length > 0 && calls[0].callTime === '-30m';
    }), { timeout: 5000 }).toBe(true);
  });

  test('Call Times block exposes a Table gap control (item 116)', async ({ page }) => {
    await seedGrid(page);
    await page.getByRole('button', { name: 'Design', exact: true }).click();
    await page.getByRole('button', { name: 'Reports Designer', exact: true }).click();
    await page.locator('[data-block-id="ct"]').click();

    const gap = page.getByText('Table gap (px)', { exact: true }).locator('..').locator('input');
    await expect(gap).toBeVisible({ timeout: 8000 });
    await gap.fill('16');
    await expect.poll(() => page.evaluate(() => {
      const b: any = (window as any).__lemonSchedule;
      const p = b.getProject();
      const d = (p.reportDesigns || []).find((x: any) => x.id === 'grid-test');
      const ct = (d?.blocks?.[0]?.children || []).find((c: any) => c.id === 'ct');
      return ct?.gap ?? null;
    }), { timeout: 5000 }).toBe(16);
  });
});
