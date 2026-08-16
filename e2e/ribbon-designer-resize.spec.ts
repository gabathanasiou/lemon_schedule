import { test, expect } from '@playwright/test';
import { openSeededProject } from './helpers';

// Ribbon designer column-resize (roadmap item 24). The resize tabs now run on
// the shared ribbon-standard dragger (src/components/columnResize.tsx) — the
// same component the reports table resize bar uses. Verifies the ribbon
// behavior is unchanged: tabs present, dragging a boundary moves exactly the
// pair with MIN_PCT clamps (Shift semantics are the hook's, unchanged), the
// live grid template tracks the drag, and the committed design persists.

async function openRibbonDesigner(page: any) {
  await openSeededProject(page);
  await page.getByRole('button', { name: 'Design', exact: true }).click();
  await page.getByRole('button', { name: 'Ribbon Designer', exact: true }).click();
  await page.waitForTimeout(800);
}

async function ribbonColWidths(page: any): Promise<number[]> {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find(k => k.startsWith('lemon_schedule_project_v1'));
    const p = JSON.parse(localStorage.getItem(key)!);
    const d = p.ribbonDesigns.find((x: any) => x.id === p.activeRibbonId);
    return d ? d.colWidths : [];
  });
}

/** Polls localStorage until the ribbon design's colWidths differ from `before`. */
async function waitForWidthCommit(page: any, before: number[], timeoutMs = 8000): Promise<number[]> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const w = await ribbonColWidths(page);
    if (w.length && w.some((v: number, i: number) => v !== before[i])) return w;
    await page.waitForTimeout(200);
  }
  return ribbonColWidths(page);
}

test('ribbon designer: resize tabs drag a boundary with MIN_PCT clamps and commit to the design', async ({ page }) => {
  await openRibbonDesigner(page);

  // 7 default columns → 6 tabs
  const tabs = page.locator('.group\\/tab');
  await expect(tabs).toHaveCount(6, { timeout: 5000 });

  const before = await ribbonColWidths(page);
  expect(before).toEqual([10.22, 5.01, 6.18, 7.57, 40.59, 9.62, 20.85]);

  // live grid template before the drag
  const grid = page.locator('[data-cell-id]').first().locator('xpath=ancestor::div[contains(@style, "display: grid")]').first();
  const template0 = await grid.evaluate(el => el.style.gridTemplateColumns);

  // drag the first tab +60px → col0 grows, col1 clamps at MIN_PCT (2.5)
  const tab0 = tabs.first();
  const box = await tab0.boundingBox();
  if (!box) throw new Error('no tab box');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2, { steps: 10 });

  // LIVE: the grid template tracks the drag (col0 wider, col1 at the clamp)
  const template1 = await grid.evaluate(el => el.style.gridTemplateColumns);
  const mid = template1.split(' ').map(v => parseFloat(v));
  expect(mid[0]).toBeGreaterThan(parseFloat(template0.split(' ')[0]));
  expect(mid[1]).toBeCloseTo(2.5, 1); // MIN_PCT clamp

  await page.mouse.up();
  await page.waitForTimeout(300);

  // COMMIT: the design's colWidths updated (poll the debounced save)
  const after = await waitForWidthCommit(page, before);
  expect(after[0]).toBeGreaterThan(before[0]);
  expect(after[1]).toBeCloseTo(2.5, 1);
  // only the dragged pair moved; the sum stays 100
  expect(after.slice(2)).toEqual(before.slice(2));
  expect(after.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 1);
});
