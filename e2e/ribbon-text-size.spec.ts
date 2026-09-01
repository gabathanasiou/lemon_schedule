import { test, expect } from '@playwright/test';
import { openSeededProject } from './helpers';

// Ribbon text size (roadmap 48): a master px size per RibbonDesign (default
// 14 for new designs) + a per-cell offset (−8…+8). One seam —
// getRibbonCellBaseStyle — funnels every ribbon rendering (designer canvas,
// live preview, stripboard, print), so master + offset must show up in all
// of them; legacy designs without textSize keep rendering at 8pt.

const activeDesign = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const p: any = (window as any).__lemonSchedule.getProject();
    return p.ribbonDesigns.find((d: any) => d.id === p.activeRibbonId);
  });

const previewCellSize = (page: import('@playwright/test').Page) =>
  page.locator('[data-preview-grid] > div').first().evaluate(el => getComputedStyle(el).fontSize);

test.describe('ribbon text size (roadmap 48)', () => {
  test('master size + per-cell offset apply to the designer preview and the stripboard', async ({ page }) => {
    await openSeededProject(page);
    await page.getByRole('button', { name: 'Design' }).click();
    await page.getByRole('button', { name: 'Ribbon Designer' }).click();

    // Master size: 14 → 20. The live preview text must follow.
    await page.getByLabel('Master text size').fill('20');
    await expect.poll(async () => (await activeDesign(page))?.textSize).toBe(20);
    await expect.poll(() => previewCellSize(page)).toBe('20px');

    // Per-cell offset on a selected designer cell: -4 → 16px in the preview.
    await page.locator('[data-cell-id]').first().click();
    await page.getByLabel('Cell text size offset').fill('-4');
    const design = await activeDesign(page);
    const firstCell = design.rows.flatMap((r: any) => r.cells).find((c: any) => c.field);
    expect(firstCell.textSizeOffset).toBe(-4);
    await expect.poll(() => previewCellSize(page)).toBe('16px');

    // Reset-to-master (X) clears the offset.
    await page.getByRole('button', { name: 'Reset to design master size' }).click();
    await expect.poll(async () => (await activeDesign(page))!.rows.flatMap((r: any) => r.cells).find((c: any) => c.id === firstCell.id)?.textSizeOffset).toBeUndefined();
    await expect.poll(() => previewCellSize(page)).toBe('20px');

    // The stripboard honors the master size too.
    await page.getByRole('button', { name: 'Schedule' }).click();
    const stripCell = page.locator('[data-row-id] [data-ribbon-field="sceneNumber"]').first();
    await expect(stripCell).toBeAttached();
    await expect.poll(() => stripCell.evaluate(el => getComputedStyle(el).fontSize)).toBe('20px');
  });

  test('legacy designs (no textSize) stay at 8pt; new designs default to master 14', async ({ page }) => {
    await openSeededProject(page);

    // The seeded project's designs carry a textSize — force a legacy design
    // (no textSize field) so the 8pt fallback path is exercised.
    await page.evaluate(() => {
      const b = (window as any).__lemonSchedule;
      const p = b.getProject();
      b.dispatch({
        type: 'UPDATE_PROJECT',
        payload: { ribbonDesigns: (p.ribbonDesigns || []).map((d: any) => ({ ...d, textSize: undefined })) },
      });
    });

    // Legacy → the stripboard renders 8pt.
    await expect
      .poll(() => page.evaluate(() => {
        const p: any = (window as any).__lemonSchedule.getProject();
        return p.ribbonDesigns.every((d: any) => d.textSize === undefined);
      }))
      .toBe(true);
    await page.getByRole('button', { name: 'Schedule' }).click();
    const stripCell = page.locator('[data-row-id] [data-ribbon-field="sceneNumber"]').first();
    await expect(stripCell).toBeAttached();
    // 8pt resolves to 10.6667px in computed style.
    await expect.poll(() => stripCell.evaluate(el => getComputedStyle(el).fontSize)).toBe('10.6667px');

    // New design via the designs dropdown → textSize 14 by default.
    await page.getByRole('button', { name: 'Design' }).click();
    await page.getByRole('button', { name: 'Ribbon Designer' }).click();
    await page.getByRole('button', { name: /Editing:/ }).click();
    await page.getByRole('menuitem', { name: 'New Design' }).click();
    await expect.poll(async () => (await activeDesign(page))?.textSize).toBe(14);
  });
});
