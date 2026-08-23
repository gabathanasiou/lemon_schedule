import { test, expect } from '@playwright/test';
import { loadSeedProject, seedProjectScript } from './helpers';

// Table column-width resize (roadmap items 23 + 24). The resize bar is now the
// shared ribbon-style dragger (src/components/columnResize.tsx). Verifies:
//  - header + EVERY body cell of the dragged pair track the drag live,
//  - the commit lands in the design (only the dragged pair changes),
//  - unchanged columns KEEP their widths after the commit re-render — the
//    item-23 bug (direct-DOM width clearing left unchanged columns without
//    inline widths, so the flex row re-distributed and the table shifted).
//
// The design is injected into the seeded project before boot (same pattern as
// report-pagination.spec.ts) so localStorage holds the design from the start —
// no race with the app's debounced save.

const B = (n: string) => `rsz-${n}`;

function resizeTestDesign() {
  return {
    id: 'rsz-test-design',
    name: 'Resize Test',
    createdAt: Date.now(),
    page: 'portrait' as const,
    header: [],
    footer: [],
    blocks: [
      // multi-row table: the seeded project has 178 scenes
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
      // single-row table: an empty category → the canvas renders the hint
      // skeleton (header + one row)
      {
        id: B('t2'),
        type: 'table',
        collection: 'elements',
        category: 'zzz-no-such-category',
        showHeader: true,
        columns: [
          { id: B('d1'), field: 'elementName', width: 40 },
          { id: B('d2'), field: 'totalPages', width: 60 },
        ],
      } as any,
    ],
  };
}

function seedWithDesignScript() {
  const seed = loadSeedProject();
  const project = JSON.parse(seed.raw);
  project.reportDesigns = [resizeTestDesign(), ...(project.reportDesigns || [])];
  project.activeReportId = resizeTestDesign().id;
  return seedProjectScript({ raw: JSON.stringify(project) });
}

async function openDesigner(page: any) {
  await page.addInitScript(seedWithDesignScript());
  await page.goto('http://localhost:3001/lemon_schedule/');
  const seed = loadSeedProject();
  await page.getByText(seed.data.title, { exact: true }).first().click({ timeout: 8000 });
  await page.waitForTimeout(1000);
  await page.getByRole('button', { name: 'Design', exact: true }).click();
  await page.getByRole('button', { name: 'Reports Designer', exact: true }).click();
  await page.waitForTimeout(500);
}

/** Reads the test table's column widths from the active design. */
async function designWidths(page: any, tableId: string): Promise<number[]> {
  return page.evaluate((id) => {
    const key = Object.keys(localStorage).find(k => k.startsWith('lemon_schedule_project_v1'));
    const p = JSON.parse(localStorage.getItem(key)!);
    const d = p.reportDesigns.find((x: any) => x.id === p.activeReportId);
    const t = d.blocks.find((b: any) => b.id === id);
    return t.columns.map((c: any) => c.width);
  }, tableId);
}

test('table resize: multi-row table — header + all rows track live, commit lands, unchanged columns keep widths', async ({ page }) => {
  await openDesigner(page);

  // the multi-row scenes table is the first table on the canvas. The canvas
  // truncates tables at TABLE_PREVIEW_LIMIT (6) rows + a "+N more" bar
  // (roadmap 12 — preview/print render every row); the cap applies to the
  // canvas only.
  const table = page.locator('.report-table-cols').first();
  await expect(table).toBeVisible({ timeout: 5000 });
  const rowCount = await table.locator('.rm-row').count();
  expect(rowCount).toBe(6); // canvas truncation of the 174-row scenes table
  await expect(page.getByText(/^\+\d+ more$/)).toBeVisible(); // the truncation bar

  const card = table.locator('xpath=ancestor::*[@data-block-id]').first();
  await card.click({ position: { x: 5, y: 5 } });
  await page.waitForTimeout(400);

  const before = await designWidths(page, B('t1'));
  expect(before).toEqual([10, 30, 45, 15]);

  const handles = page.locator('[title^="Resize column"]');
  expect(await handles.count()).toBe(3);

  // drag the first boundary (col0/col1) right by 40px
  const h = handles.first();
  const box = await h.boundingBox();
  if (!box) throw new Error('no handle box');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2, { steps: 8 });

  // LIVE: header + every body row of col0 move together (one distinct width)
  const col0Live = await table.locator('[data-table-col-ci="0"]').evaluateAll(
    (els: Element[]) => els.map(el => Math.round(el.getBoundingClientRect().width)),
  );
  expect(col0Live.length).toBe(rowCount + 1); // header + all rows
  expect(new Set(col0Live).size).toBe(1);

  await page.mouse.up();
  await page.waitForTimeout(600);

  // COMMIT: only the dragged pair changed in the design
  const after = await designWidths(page, B('t1'));
  expect(after[0]).toBeGreaterThan(before[0]);
  expect(after[1]).toBeLessThan(before[1]);
  expect(after.slice(2)).toEqual(before.slice(2));

  // REGRESSION (item 23): unchanged columns keep their inline widths after
  // the commit re-render — every header cell must still have an explicit
  // width style and the header must still fill the table.
  const headerInfo = await table.evaluate((el) => {
    const cells = Array.from(el.querySelectorAll('.rm-header [data-table-col-ci]')) as HTMLElement[];
    const widths = cells.map(c => c.style.width);
    const headerW = Math.round((el.querySelector('.rm-header') as HTMLElement).getBoundingClientRect().width);
    const tableW = Math.round(el.getBoundingClientRect().width);
    return { widths, headerW, tableW };
  });
  expect(headerInfo.widths.every(w => w.endsWith('%'))).toBe(true);
  expect(headerInfo.headerW).toBeCloseTo(headerInfo.tableW, -1);
});

test('table resize: single-row (skeleton) table works too', async ({ page }) => {
  await openDesigner(page);

  // the second table (empty category) renders the hint skeleton — 1 data row.
  // Locate it by block id: the truncated scenes table above it ALSO emits a
  // ".report-table-cols" element (its "+N more" bar), so positional nth()
  // is unreliable.
  const table = page.locator('[data-block-id="rsz-t2"] .report-table-cols');
  await expect(table).toBeVisible({ timeout: 5000 });
  const rowCount = await table.locator('.rm-row').count();
  expect(rowCount).toBe(1);

  const card = table.locator('xpath=ancestor::*[@data-block-id]').first();
  await card.click({ position: { x: 5, y: 5 } });
  await page.waitForTimeout(400);

  const before = await designWidths(page, B('t2'));
  expect(before).toEqual([40, 60]);

  const handles = page.locator('[title^="Resize column"]');
  expect(await handles.count()).toBe(1);
  const h = handles.first(); // the second table's single boundary
  const box = await h.boundingBox();
  if (!box) throw new Error('no handle box');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 30, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(600);

  const after = await designWidths(page, B('t2'));
  expect(after[0]).toBeLessThan(before[0]);
  expect(after[1]).toBeGreaterThan(before[1]);

  // header + the skeleton row track the same width
  const col0 = await table.locator('[data-table-col-ci="0"]').evaluateAll(
    (els: Element[]) => els.map(el => Math.round(el.getBoundingClientRect().width)),
  );
  expect(col0.length).toBe(2);
  expect(new Set(col0).size).toBe(1);
});
