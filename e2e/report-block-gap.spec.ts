import { test, expect } from '@playwright/test';
import { loadSeedProject, seedProjectScript } from './helpers';

// Roadmap 33 verification: every block gets a vertical gap in the PREVIEW and
// PRINT (matching the repeat item gap, 8px) while the designer CANVAS stays
// flush (item 26 veto). The paginator accounts the gaps, so page budgets hold.
// Stale-format spec: built for the design below — two top-level text blocks, a
// days repeat with two children, and a columns block whose per-column gap was
// replaced by the uniform margins.

const B = (n: string) => `bg-${n}`;

function gapDesign() {
  return {
    id: 'bg-test',
    name: 'Block Gap',
    createdAt: Date.now(),
    page: 'portrait' as const,
    blocks: [
      { id: B('t1'), type: 'text', text: 'Top one', fontSize: 12 },
      { id: B('t2'), type: 'text', text: 'Top two', fontSize: 12 },
      {
        id: B('d1'), type: 'repeat', collection: 'days', gap: 8,
        children: [
          { id: B('d1c1'), type: 'text', text: 'Child one {{dayNumber}}' },
          { id: B('d1c2'), type: 'text', text: 'Child two {{dayNumber}}' },
        ],
      },
      {
        id: B('c1'), type: 'columns',
        cols: [
          { id: B('cc1'), width: 50, blocks: [{ id: B('cellA'), type: 'text', text: 'Cell A' }] },
          { id: B('cc2'), width: 50, blocks: [{ id: B('cellB1'), type: 'text', text: 'Cell B1' }, { id: B('cellB2'), type: 'text', text: 'Cell B2' }] },
        ],
      },
    ],
    header: [], footer: [],
  };
}

async function openDesignerWithDesign(page: any, project: any) {
  await page.addInitScript(seedProjectScript({ raw: JSON.stringify(project) }));
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
  await page.waitForTimeout(1000);
  await page.getByRole('button', { name: 'Design', exact: true }).click();
  await page.getByRole('button', { name: 'Reports Designer', exact: true }).click();
  await page.waitForTimeout(800);
}

test('canvas stays flush; preview applies the 8px block gap to every stack', async ({ page }) => {
  const seed = loadSeedProject();
  const project = JSON.parse(seed.raw);
  project.reportDesigns = [gapDesign(), ...(project.reportDesigns || [])];
  project.activeReportId = 'bg-test';
  await openDesignerWithDesign(page, project);

  // ---- canvas: stacked block cards are FLUSH (no gap in the composer) ----
  const cardGaps = await page.$$eval('.block-card', (cards) =>
    cards.slice(0, 2).map(c => parseFloat(getComputedStyle(c).marginTop) || 0),
  );
  expect(cardGaps.every(g => g === 0)).toBe(true);

  await page.getByRole('button', { name: 'Preview' }).click();
  await expect(page.locator('.report-page').first()).toBeVisible({ timeout: 15000 });
  await page.waitForFunction(() => document.querySelectorAll('[data-paginated="true"] .report-page').length >= 1, null, { timeout: 15000 });

  // ---- preview: top-level body mounts get 8px (first child stays flush) ----
  const bodyMounts = page.locator('.report-page-content > div');
  await expect(bodyMounts.first()).toHaveCSS('margin-top', '0px');
  await expect(bodyMounts.nth(1)).toHaveCSS('margin-top', '8px');

  // ---- preview: repeat children get 8px between items' blocks ----
  const itemChildren = page.locator('.rm-item .rm-frag-child');
  await expect(itemChildren.first()).toHaveCSS('margin-top', '0px');
  await expect(itemChildren.nth(1)).toHaveCSS('margin-top', '8px');

  // ---- preview: columns children stack with the uniform margin (first child
  // of each column's own child list stays flush) ----
  const colCellMargins = await page.evaluate(() => {
    const blocks = Array.from(document.querySelectorAll('.report-page-content .report-text-block'));
    const wrap = (t: string) => {
      const el = blocks.find(x => (x as HTMLElement).innerText?.trim() === t)!;
      return parseFloat(getComputedStyle(el.parentElement!).marginTop) || 0;
    };
    return {
      a: wrap('Cell A'),
      b1: wrap('Cell B1'),
      b2: wrap('Cell B2'),
    };
  });
  expect(colCellMargins.a).toBe(0);
  expect(colCellMargins.b1).toBe(0);
  expect(colCellMargins.b2).toBe(8);
});