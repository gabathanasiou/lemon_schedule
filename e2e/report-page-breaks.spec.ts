import { test, expect } from '@playwright/test';
import { loadSeedProject, seedProjectScript } from './helpers';

// Universal page-break semantics (roadmap 30 + 32). A `pageBreak` block adds a
// page break AT ITS POSITION in the render — top level, or nested in
// repeat/relative children. There is NO "one page per item" expansion anymore:
// a repeat whose children end with a pageBreak produces one item per page
// naturally; without breaks, items fill pages contiguously. Items that render
// nothing produce no pages (no blank pages); consecutive TOP-LEVEL breaks
// still produce an explicit blank page; an unsplittable container (columns)
// with a break inside starts on a new page as a unit.
//
// Every test runs on Desktop Chrome + iPad WebKit (playwright.ipad.config.ts).

const B = (n: string) => `pb-${n}`;

const text = (id: string, t: string, extra: any = {}): any => ({ id, type: 'text', text: t, ...extra });
const field = (id: string, f: string, extra: any = {}): any => ({ id, type: 'field', field: f, ...extra });
const pageBreak = (id: string): any => ({ id, type: 'pageBreak' });
const spacer = (id: string, height: number): any => ({ id, type: 'spacer', height });
const repeat = (id: string, collection: string, children: any[], extra: any = {}): any => ({ id, type: 'repeat', collection, gap: 8, children, ...extra });

function design(name: string = 'Page Breaks Test', blocks: any[]): any {
  return { id: 'pb-test-design', name, createdAt: Date.now(), page: 'portrait', blocks };
}

function seedWithDesign(design: any, patch?: (project: any) => void) {
  const seed = loadSeedProject();
  const project = JSON.parse(seed.raw);
  project.reportDesigns = [design, ...(project.reportDesigns || [])];
  project.activeReportId = design.id;
  patch?.(project);
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
  await page.getByRole('button', { name: 'Print', exact: true }).click();
  await page.getByRole('button', { name: /Print \/ Save PDF/ }).click();
  const pages = page.locator('.report-root .report-page');
  await expect(pages.first()).toBeVisible({ timeout: 15000 });
  await page.waitForFunction(() => document.querySelector('.report-root')?.getAttribute('data-paginated') === 'true', null, { timeout: 15000 });
  return pages;
}

/** Production day count straight from the store's debug bridge (the
 *  authoritative `useDaybreakSections` computation — never re-derived). */
async function productionDayCount(page: any): Promise<number> {
  return page.evaluate(() => {
    const rows = (window as any).__lemonSchedule?.getRows?.();
    return (rows?.sections || []).filter((s: any) => !s.isPinned).length;
  });
}

async function pageTexts(pages: any): Promise<string[]> {
  return pages.evaluateAll((els) => (els as HTMLElement[]).map(el => el.innerText || ''));
}

test('repeat with a trailing pageBreak per item: one page per item, no trailing blank', async ({ page }) => {
  await page.addInitScript(seedWithDesign(design('PB Call Sheet', [
    repeat('pb-r', 'days', [text('pb-d', 'DAY {{dayNumber}} — {{dayDate}}'), pageBreak('pb-brk')]),
  ])));
  await openDesigner(page);
  const n = await productionDayCount(page);
  const pages = await openPrintView(page);
  const texts = await pageTexts(pages);
  expect(n).toBeGreaterThan(1);
  expect(texts.length).toBe(n); // one page per production day
  texts.forEach((t, i) => expect(t).toContain(`DAY ${i + 1}`));
});

test('repeat WITHOUT pageBreaks: items fill pages contiguously — never one page per item', async ({ page }) => {
  await page.addInitScript(seedWithDesign(design('PB No Breaks', [
    repeat('pb-r', 'days', [text('pb-a', 'D{{dayNumber}}'), text('pb-b', 'X{{dayNumber}}')]),
  ])));
  const pages = await openPrintView(page);
  const texts = await pageTexts(pages);
  // 64 small rows ≈ 2–3 pages — but never 32 (the old "auto page break" bug).
  expect(texts.length).toBeLessThan(6);
});

test('mid-item pageBreak splits the item: content after the break starts a new page', async ({ page }) => {
  await page.addInitScript(seedWithDesign(design('PB Mid Split', [
    repeat('pb-r', 'days', [
      spacer('pb-sp', 740),
      text('pb-a', '[[A{{dayNumber}}]]'),
      pageBreak('pb-brk'),
      text('pb-b', '[[B{{dayNumber}}]]'),
    ]),
  ])));
  await openDesigner(page);
  const n = await productionDayCount(page);
  const pages = await openPrintView(page);
  const texts = await pageTexts(pages);
  expect(texts.length).toBeGreaterThanOrEqual(2);
  for (let i = 1; i <= n; i++) {
    const idxA = texts.findIndex(t => t.includes(`[[A${i}]]`));
    const idxB = texts.findIndex(t => t.includes(`[[B${i}]]`));
    expect(idxA).toBeGreaterThanOrEqual(0);
    expect(idxB).toBeGreaterThan(idxA); // same item, but the break forces B to a later page
  }
});

test('items that render nothing produce no page (no blank pages)', async ({ page }) => {
  // Two location types: one with an EMPTY label (its only child renders null),
  // one real. skipEmptyCategories is OFF so the empty type iterates — the
  // empty item's leading break is a no-op, so the print has exactly 1 page.
  await page.addInitScript(seedWithDesign(design('PB Empty Item', [
    repeat('pb-r', 'locationTypes', [
      field('pb-f', 'locationTypeLabel', { emptyBehavior: 'hideBlock' }),
      pageBreak('pb-brk'),
    ], { skipEmptyCategories: false }),
  ]), p => {
    p.locationTypes = [{ key: 'empty', label: '' }, { key: 'filled', label: 'Filled' }];
    p.locations = [{ id: 'pb-l1', name: 'Studio A', type: 'filled', address: '', place: '', lat: 0, lng: 0 }];
  }));
  const pages = await openPrintView(page);
  const texts = await pageTexts(pages);
  expect(texts.length).toBe(1); // no blank page for the empty type
  expect(texts[0]).toContain('Filled');
});

test('skip-empty: location types without locations are skipped by default; checkbox exists', async ({ page }) => {
  await page.addInitScript(seedWithDesign(design('PB Skip Empty', [
    repeat('pb-r', 'locationTypes', [field('pb-f', 'locationTypeLabel'), pageBreak('pb-brk')]),
  ]), p => {
    p.locationTypes = [{ key: 'filled', label: 'Filled' }, { key: 'other', label: 'Other' }];
    p.locations = [{ id: 'pb-l1', name: 'Studio A', type: 'filled', address: '', place: '', lat: 0, lng: 0 }];
  }));

  // The block chrome's Filters section exposes the shared skip-empty checkbox
  // for location types (mirroring the categories one). Click the repeat card's
  // own corner — a center click lands on the field child inside it.
  await openDesigner(page);
  const repeatCard = page.locator('.block-card.block-type-repeat').first();
  await repeatCard.click({ position: { x: 3, y: 3 } });
  await expect(page.getByText('Skip types with no locations', { exact: true })).toBeVisible({ timeout: 5000 });

  // Default ON: the empty type never iterates — 1 page, only 'Filled'.
  await page.getByRole('button', { name: 'Print', exact: true }).click();
  await page.getByRole('button', { name: /Print \/ Save PDF/ }).click();
  const pages = page.locator('.report-root .report-page');
  await expect(pages.first()).toBeVisible({ timeout: 15000 });
  await page.waitForFunction(() => document.querySelector('.report-root')?.getAttribute('data-paginated') === 'true', null, { timeout: 15000 });
  const texts = await pageTexts(pages);
  expect(texts.length).toBe(1);
  expect(texts[0]).toContain('Filled');
  expect(texts[0]).not.toContain('Other');
});

test('skip-empty opt-out (skipEmptyCategories: false): empty types iterate again', async ({ page }) => {
  await page.addInitScript(seedWithDesign(design('PB Skip Empty Off', [
    repeat('pb-r', 'locationTypes', [field('pb-f', 'locationTypeLabel'), pageBreak('pb-brk')], { skipEmptyCategories: false }),
  ]), p => {
    p.locationTypes = [{ key: 'filled', label: 'Filled' }, { key: 'other', label: 'Other' }];
    p.locations = [{ id: 'pb-l1', name: 'Studio A', type: 'filled', address: '', place: '', lat: 0, lng: 0 }];
  }));
  const pages = await openPrintView(page);
  const texts = await pageTexts(pages);
  expect(texts.length).toBe(2); // one page per type again
  expect(texts[0]).toContain('Filled');
  expect(texts[1]).toContain('Other');
});

test('consecutive TOP-LEVEL pageBreaks still produce an explicit blank page', async ({ page }) => {
  await page.addInitScript(seedWithDesign(design('PB Blank Top', [
    text('pb-t1', 'TOP1'),
    pageBreak('pb-b1'),
    pageBreak('pb-b2'),
    text('pb-t2', 'TOP2'),
  ])));
  const pages = await openPrintView(page);
  const texts = await pageTexts(pages);
  expect(texts.length).toBe(3);
  expect(texts[0]).toContain('TOP1');
  expect(texts[1].trim()).toBe(''); // the explicit blank page
  expect(texts[2]).toContain('TOP2');
});

test('pageBreak inside a columns block: the whole columns block starts a new page', async ({ page }) => {
  await page.addInitScript(seedWithDesign(design('PB Columns', [
    text('pb-pre', 'PRE'),
    {
      id: 'pb-col',
      type: 'columns',
      cols: [
        { id: 'pb-c1', width: 1, blocks: [text('pb-ca', 'COL-A'), pageBreak('pb-brk'), text('pb-cb', 'COL-B')] },
        { id: 'pb-c2', width: 1, blocks: [text('pb-cc', 'COL-C')] },
      ],
    },
  ])));
  const pages = await openPrintView(page);
  const texts = await pageTexts(pages);
  expect(texts.length).toBe(2); // PRE page, then the whole columns block
  expect(texts[0]).toContain('PRE');
  expect(texts[0]).not.toContain('COL');
  const colPage = texts[1];
  expect(colPage).toContain('COL-A');
  expect(colPage).toContain('COL-B');
  expect(colPage).toContain('COL-C');
});