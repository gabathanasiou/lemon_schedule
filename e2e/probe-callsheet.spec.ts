import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadSeedProject, seedProjectScript } from './helpers';

test('probe callsheet', async ({ page }) => {
  const design = JSON.parse(fs.readFileSync(path.join(os.homedir(), 'Downloads', 'Call Sheet.report'), 'utf8'));
  const seed = loadSeedProject();
  const project = JSON.parse(seed.raw);
  const full = { id: 'cs-test', name: design.name, createdAt: Date.now(), page: design.page || 'portrait', header: design.header || [], footer: design.footer || [], blocks: design.blocks || [] };
  project.reportDesigns = [full, ...(project.reportDesigns || [])];
  project.activeReportId = full.id;
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
  await page.getByRole('button', { name: 'Print / Save PDF' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.report-root .report-page').length >= 1, null, { timeout: 15000 });
  await page.waitForTimeout(800);
  const dump = await page.evaluate(() => {
    const pages = Array.from(document.querySelectorAll('.report-root .report-page')) as HTMLElement[];
    return {
      pageCount: pages.length,
      pages: pages.slice(0, 3).map((p, i) => ({
        i,
        text: (p.textContent || '').slice(0, 400),
        hasImage: !!p.querySelector('img'),
        stripCount: p.querySelectorAll('.rm-ribbon-unit').length,
        tableCount: p.querySelectorAll('.report-table-cols').length,
        sh: p.scrollHeight, ch: p.clientHeight,
      })),
      measurePages: document.querySelectorAll('.rm-page').length,
    };
  });
  console.log(JSON.stringify(dump));
});
