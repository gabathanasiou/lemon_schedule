import { test, expect } from '@playwright/test';
import { loadSeedProject, seedProjectScript } from './helpers';
const B = (n: string) => `pg-${n}`;
function tdesign() {
  return {
    id: 'pg-test-design', name: 'Pagination Test', createdAt: Date.now(), page: 'portrait' as const,
    header: [{ id: B('h1'), type: 'text', text: 'TEST HEADER — {{pageNumber}}/{{pageCount}}', fontSize: 12, bold: true } as any],
    footer: [{ id: B('f1'), type: 'text', text: 'TEST FOOTER — {{pageNumber}}' } as any],
    blocks: [
      { id: B('t1'), type: 'table', collection: 'scenes', showHeader: true, columns: [
        { id: B('c1'), field: 'sceneNumber', width: 10 }, { id: B('c2'), field: 'set', width: 30 },
        { id: B('c3'), field: 'description', width: 45 }, { id: B('c4'), field: 'pageCount', width: 15 },
      ] } as any,
      { id: B('r1'), type: 'ribbon', ribbonDayBreaks: true, ribbonCallTimes: true, ribbonNotes: false } as any,
    ],
  };
}
test('probe overflow', async ({ page }) => {
  const seed = loadSeedProject();
  const project = JSON.parse(seed.raw);
  project.reportDesigns = [tdesign(), ...(project.reportDesigns || [])];
  project.activeReportId = tdesign().id;
  await page.addInitScript(seedProjectScript({ raw: JSON.stringify(project) }));
  await page.addInitScript(() => {
    window.print = () => {};
    const rf = window.fetch.bind(window);
    window.fetch = (i: any, o?: any) => {
      const u = String(typeof i === 'string' ? i : i?.url || i);
      return (u.includes('open-meteo') || u.includes('nominatim')) ? Promise.reject(new Error('x')) : rf(i as any, o as any);
    };
  });
  await page.goto('http://localhost:3001/lemon_schedule/');
  const card = page.getByText(seed.data.title, { exact: true }).first();
  await card.click({ timeout: 8000 });
  await page.waitForTimeout(1000);
  await page.getByRole('button', { name: 'Design', exact: true }).click();
  await page.getByRole('button', { name: 'Reports Designer', exact: true }).click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Print', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.report-root .report-page').length >= 2, null, { timeout: 15000 });
  const pg = page.locator('.report-root .report-page');
  const count = await pg.count();
  for (let i = 0; i < count; i++) {
    await expect(pg.nth(i)).toContainText('TEST HEADER', { timeout: 5000 });
    await expect(pg.nth(i)).toContainText('TEST FOOTER', { timeout: 5000 });
  }
  await page.waitForTimeout(1500);
  const dump = await page.evaluate(() => Array.from(document.querySelectorAll('.report-root .report-page')).map((p, i) => {
    const el = p as HTMLElement;
    const units = p.querySelectorAll('.rm-ribbon-unit').length;
    const tcols = p.querySelectorAll('.report-table-cols').length;
    const rows = p.querySelectorAll('.rm-row').length;
    return { i, sh: el.scrollHeight, ch: el.clientHeight, units, tcols, rows };
  }));
  for (const d of dump) console.log(JSON.stringify(d));
});

test('probe budget math', async ({ page }) => {
  const seed = loadSeedProject();
  const project = JSON.parse(seed.raw);
  project.reportDesigns = [tdesign(), ...(project.reportDesigns || [])];
  project.activeReportId = tdesign().id;
  await page.addInitScript(seedProjectScript({ raw: JSON.stringify(project) }));
  await page.addInitScript(() => {
    window.print = () => {};
    const rf = window.fetch.bind(window);
    window.fetch = (i: any, o?: any) => {
      const u = String(typeof i === 'string' ? i : i?.url || i);
      return (u.includes('open-meteo') || u.includes('nominatim')) ? Promise.reject(new Error('x')) : rf(i as any, o as any);
    };
  });
  await page.goto('http://localhost:3001/lemon_schedule/');
  const card = page.getByText(seed.data.title, { exact: true }).first();
  await card.click({ timeout: 8000 });
  await page.waitForTimeout(1000);
  await page.getByRole('button', { name: 'Design', exact: true }).click();
  await page.getByRole('button', { name: 'Reports Designer', exact: true }).click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Print', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.report-root .report-page').length >= 1, null, { timeout: 15000 });
  await page.waitForTimeout(1200);
  const dump = await page.evaluate(() => {
    const pages = Array.from(document.querySelectorAll('.rm-page')) as HTMLElement[];
    const out: any[] = [];
    for (const p of pages) {
      const hz = p.querySelector('.rm-header-zone') as HTMLElement | null;
      const fz = p.querySelector('.rm-footer-zone') as HTMLElement | null;
      out.push({
        margin: hz ? getComputedStyle(hz).marginBottom : null,
        headerH: hz ? hz.offsetHeight : 0,
        footerH: fz ? fz.offsetHeight : 0,
        bodyChildren: (p.querySelector('.rm-body') as HTMLElement)?.children.length,
        pageEls: document.querySelectorAll('.report-root .report-page').length,
      });
    }
    const renderPages = Array.from(document.querySelectorAll('.report-root .report-page')) as HTMLElement[];
    return {
      budgetInputs: out,
      renderHeights: renderPages.map(p => ({ sh: p.scrollHeight, ch: p.clientHeight })),
    };
  });
  console.log(JSON.stringify(dump));
});
