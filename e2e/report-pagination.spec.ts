import { test, expect } from '@playwright/test';
import { loadSeedProject, seedProjectScript } from './helpers';

// Measured pagination spec. Runs on every project in the config (Desktop
// Chrome + iPad WebKit via playwright.ipad.config.ts) so both engines must
// satisfy the SAME invariants:
//  - header/footer repeat on EVERY page div,
//  - the table's column header repeats on continuation pages,
//  - no page div overflows its content budget (a slice would break the
//    header/footer repetition — the original bug),
//  - Chromium additionally counts REAL PDF pages == page-div count.
//
// The design is injected into the seeded project before boot: a header and a
// footer block, a scenes table with enough rows to split across pages, and a
// top-level ribbon (full schedule) so strips continue between pages.

const B = (n: string) => `pg-${n}`;

function paginationTestDesign() {
  return {
    id: 'pg-test-design',
    name: 'Pagination Test',
    createdAt: Date.now(),
    page: 'portrait' as const,
    header: [
      { id: B('h1'), type: 'text', text: 'TEST HEADER — {{pageNumber}}/{{pageCount}}', fontSize: 12, bold: true } as any,
    ],
    footer: [
      { id: B('f1'), type: 'text', text: 'TEST FOOTER — {{pageNumber}}' } as any,
    ],
    blocks: [
      {
        id: B('t1'),
        type: 'table',
        collection: 'scenes',
        showHeader: true,
        columns: [
          { id: B('c1'), field: 'sceneNumber', width: 10 },
          { id: B('c2'), field: 'set', width: 30 },
          { id: B('c3'), field: 'description', width: 45 },
          { id: B('c4'), field: 'pageCount', width: 15 },
        ],
      } as any,
      {
        id: B('r1'),
        type: 'ribbon',
        ribbonDayBreaks: true,
        ribbonCallTimes: true,
        ribbonNotes: false,
      } as any,
    ],
  };
}

function seedWithDesignScript() {
  const seed = loadSeedProject();
  const project = JSON.parse(seed.raw);
  project.reportDesigns = [paginationTestDesign(), ...(project.reportDesigns || [])];
  project.activeReportId = paginationTestDesign().id;
  return seedProjectScript({ raw: JSON.stringify(project) });
}

async function openDesigner(page: any) {
  await page.addInitScript(() => {
    window.print = () => {};
    // Fail the sun/weather + geocode fetches immediately — handleReportPrint
    // awaits them before opening the print view and they dangle headless.
    const realFetch = window.fetch.bind(window);
    window.fetch = (input: any, init?: any) => {
      const url = String(typeof input === 'string' ? input : input?.url || input);
      if (url.includes('open-meteo') || url.includes('nominatim')) return Promise.reject(new Error('blocked for test'));
      return realFetch(input as any, init as any);
    };
  });
  await page.goto('http://localhost:3001/lemon_schedule/');
  const seed = loadSeedProject();
  const card = page.getByText(seed.data.title, { exact: true }).first();
  await card.click({ timeout: 8000 });
    await page.getByRole('button', { name: 'Design', exact: true }).click();
  await page.getByRole('button', { name: 'Reports Designer', exact: true }).click();
  }

async function openPrintView(page: any) {
  await openDesigner(page);
  // The designer's Print button opens the print-options dialog (custom report
  // print); confirm it to launch the print view.
  await page.getByRole('button', { name: 'Print', exact: true }).click();
  await page.getByRole('button', { name: /Print \/ Save PDF/ }).click();
  // ReportPrint renders, measures, then renders `.report-page` divs.
  const pages = page.locator('.report-root .report-page');
  await expect(pages.first()).toBeVisible({ timeout: 15000 });
  await page.waitForFunction(() => document.querySelectorAll('.report-root .report-page').length >= 2, null, { timeout: 15000 });
  return page.locator('.report-root .report-page');
}

test('report print: header/footer repeat, table header repeats, no page overflows', async ({ page, browserName }) => {
  await page.addInitScript(seedWithDesignScript());
  
  const pages = await openPrintView(page);

  const count = await pages.count();
  expect(count).toBeGreaterThanOrEqual(2);

  // Header + footer text present on EVERY page div (the reported bug: footer
  // only on the last physical page).
  for (let i = 0; i < count; i++) {
    await expect(pages.nth(i)).toContainText('TEST HEADER', { timeout: 5000 });
    await expect(pages.nth(i)).toContainText('TEST FOOTER', { timeout: 5000 });
  }

  // The table's column header repeats on continuation pages: the 'Scene #'
  // header label must appear on at least two pages.
  let headerPages = 0;
  for (let i = 0; i < count; i++) {
    const text = (await pages.nth(i).innerText()) || '';
    if (text.includes('Scene #')) headerPages++;
  }
  expect(headerPages).toBeGreaterThanOrEqual(2);

  // No page's CONTENT may exceed the page budget (880px portrait + rounding
  // tolerance). Measure the real content extent — the page div itself is
  // min-height: 100vh, so scrollHeight includes the stretched div.
  const contentH = await pages.evaluateAll((els) =>
    (els as HTMLElement[]).map((el) => {
      const top = el.getBoundingClientRect().top;
      let max = 0;
      const consider = (c: Element) => {
        const b = (c as HTMLElement).getBoundingClientRect().bottom - top;
        if (b > max) max = b;
      };
      // The flex:1 content wrapper stretches to 100vh — measure only the
      // header/footer zones and the chunk outputs inside it.
      const body = el.querySelector('.report-page-body');
      if (body) {
        for (const c of Array.from(body.children)) {
          if (!c.classList.contains('report-page-content')) consider(c);
        }
        const content = body.querySelector(':scope > .report-page-content');
        if (content) for (const c of Array.from(content.children)) consider(c);
      }
      return max;
    }),
  );
  for (const h of contentH) {
    expect(h).toBeLessThanOrEqual(884);
  }

  // WebKit: forced breaks on structural page divs (rule 3: computed style).
  if (browserName === 'webkit') {
    const second = await pages.nth(1).evaluate((el) => getComputedStyle(el as HTMLElement).pageBreakBefore);
    expect(second).toBe('always');
  }

  // Chromium: count REAL printed pages via pdf() — must equal the page-div
  // count (measured pagination == what actually reaches paper).
  if (browserName === 'chromium') {
    await page.emulateMedia({ media: 'print' });
    const pdf = await page.pdf({ format: 'A4', printBackground: true });
    const pdfPages = (pdf.toString('binary').match(/\/Type\s*\/Page[^s]/g) || []).length;
    expect(pdfPages).toBe(count);
  }
});

test('report preview: same pagination, header/footer per card, exit works', async ({ page }) => {
  await page.addInitScript(seedWithDesignScript());
  
  await openDesigner(page);

  await page.getByRole('button', { name: 'Preview' }).click();
  const cards = page.locator('.report-page');
  await expect(cards.first()).toBeVisible({ timeout: 15000 });
  await page.waitForFunction(() => document.querySelectorAll('[data-paginated="true"] .report-page').length >= 2, null, { timeout: 15000 });

  const count = await cards.count();
  expect(count).toBeGreaterThanOrEqual(2);
  for (let i = 0; i < count; i++) {
    await expect(cards.nth(i)).toContainText('TEST HEADER', { timeout: 5000 });
    await expect(cards.nth(i)).toContainText('TEST FOOTER', { timeout: 5000 });
  }
  // Preview cards are fixed-height: content must fit (matches print). The
  // card's own 14mm top padding offsets content — subtract it.
  const contentH = await cards.evaluateAll((els) =>
    (els as HTMLElement[]).map((el) => {
      const top = el.getBoundingClientRect().top;
      const padTop = parseFloat(getComputedStyle(el).paddingTop) || 0;
      let max = 0;
      const consider = (c: Element) => {
        const b = (c as HTMLElement).getBoundingClientRect().bottom - top;
        if (b > max) max = b;
      };
      const body = el.querySelector('.report-page-body');
      if (body) {
        for (const c of Array.from(body.children)) {
          if (!c.classList.contains('report-page-content')) consider(c);
        }
        const content = body.querySelector(':scope > .report-page-content');
        if (content) for (const c of Array.from(content.children)) consider(c);
      }
      return max - padTop;
    }),
  );
  for (const h of contentH) {
    expect(h).toBeLessThanOrEqual(884);
  }

  await page.getByRole('button', { name: 'Exit Preview' }).click();
  await expect(cards).toHaveCount(0);
});