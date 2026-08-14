import { test, expect } from '@playwright/test';
import { openSeededProject } from './helpers';

type AnyPage = any;

const locationState = (page: AnyPage) =>
  page.evaluate(() => {
    try {
      const key = Object.keys(localStorage).find(k => k.startsWith('lemon_schedule_project_v1'));
      if (!key) return null;
      const p = JSON.parse(localStorage.getItem(key)!);
      return {
        locations: p.locations || [],
        types: (p.locationTypes || []).map((t: any) => t.key),
      };
    } catch { return null; }
  });

test.describe('Locations', () => {
  test('manager buffers add/save/merge across types; glide adds, creates types, sorts, go-to-manager, CSV', async ({ page }) => {
    await openSeededProject(page);

    await page.getByRole('button', { name: 'Production', exact: true }).click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'Locations', exact: true }).click();
    await page.waitForTimeout(500);

    // Types sidebar with seeded types
    await expect(page.getByText('Types', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add Type' })).toBeVisible();

    // Add a location to the first type (buffered → save)
    await page.getByRole('button', { name: 'Add Location', exact: true }).click();
    await page.getByPlaceholder('Name').last().fill('Studio One');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForTimeout(400);
    await expect(page.locator('input[value="Studio One"]')).toBeVisible();

    // A second, different-named location saves cleanly (no merge dialog)
    await page.getByRole('button', { name: 'Add Location', exact: true }).click();
    await page.getByPlaceholder('Name').last().fill('Studio Two');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForTimeout(400);
    await expect.poll(async () => (await locationState(page))!.locations.length, { timeout: 8000 }).toBe(2);

    // Same-name duplicate in the same type → merge dialog on save
    await page.getByRole('button', { name: 'Add Location', exact: true }).click();
    await page.getByPlaceholder('Name').last().fill('Studio One');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Merge Locations', { exact: true })).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: 'Merge' }).click();
    await page.waitForTimeout(500);
    await expect.poll(async () => (await locationState(page))!.locations.length, { timeout: 8000 }).toBe(2);

    // Switch to another type and add there — grouped by the sidebar
    await page.locator('button', { hasText: 'Unit Base' }).first().click();
    await page.getByRole('button', { name: 'Add Location', exact: true }).click();
    await page.getByPlaceholder('Name').last().fill('River Lot');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForTimeout(500);
    await expect.poll(async () => (await locationState(page))!.locations.length, { timeout: 8000 }).toBe(3);

    // ---- Glide ----
    await page.getByRole('button', { name: 'Locations Glide', exact: true }).click();
    await page.waitForTimeout(1500);
    await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Info' })).toBeVisible();

    const isCoarse = () => page.evaluate(() => window.matchMedia('(pointer: coarse)').matches);
    const gridGeo = async () => {
      const scroller = page.locator('.dvn-scroller');
      const sr = await scroller.boundingBox();
      const coarse = await isCoarse();
      const fs = await page.evaluate(() => {
        const v = parseFloat(localStorage.getItem('lemon_schedule_glide_font_size') || '');
        return Number.isFinite(v) ? v : null;
      });
      const size = fs ?? (coarse ? 12.5 : 11);
      const headerH = Math.round((36 * size) / 11);
      const rowH = Math.round((34 * size) / 11);
      const markerW = coarse ? 72 : 50;
      const actionsW = Math.round(((coarse ? 48 : 36) * size) / 11);
      const widths = [actionsW, 200, 140, 220, 140, 120, 200].map(w => Math.round((w * size) / 11));
      const colX = (i: number) => markerW + widths.slice(0, i).reduce((a, b) => a + b, 0) + widths[i] / 2;
      return { x: sr!.x, y: sr!.y, headerH, rowH, colX };
    };
    const tapAt = async (x: number, y: number, button: 'left' | 'right' = 'left') => {
      if (await isCoarse()) await page.touchscreen.tap(x, y);
      else await page.mouse.click(x, y, { button });
    };
    const editCell = async (row: number, colIndex: number, text: string) => {
      const g = await gridGeo();
      const x = g.x + g.colX(colIndex);
      const y = g.y + g.headerH + row * g.rowH + g.rowH / 2;
      if (await isCoarse()) {
        await page.touchscreen.tap(x, y);
        await page.waitForTimeout(300);
        await page.touchscreen.tap(x, y);
      } else {
        await page.mouse.dblclick(x, y);
      }
      await page.waitForTimeout(400);
      await page.keyboard.type(text, { delay: 30 });
      await page.keyboard.press('Enter');
      await page.waitForTimeout(700);
    };

    // Add a location via the add-row Name cell (falls back to the first type)
    const base = (await locationState(page))!.locations.length;
    await editCell(base, 1, 'Backlot B');
    await expect.poll(async () => (await locationState(page))!.locations.length, { timeout: 8000 }).toBe(base + 1);

    // Create a brand-new type from the add-row Type cell
    await editCell(base + 1, 2, 'Studio');
    await expect.poll(async () => (await locationState(page))!.types.includes('studio'), { timeout: 8000 }).toBe(true);
    await expect.poll(async () => (await locationState(page))!.locations.length, { timeout: 8000 }).toBe(base + 2);

    // Header right-click sort: Name A to Z
    {
      const g = await gridGeo();
      await tapAt(g.x + g.colX(1), g.y + g.headerH / 2, 'right');
      await page.waitForTimeout(400);
      await page.getByText('Sort A to Z', { exact: true }).click();
      await page.waitForTimeout(700);
    }

    // Right-click a row -> Go to Locations Manager → type
    {
      const g = await gridGeo();
      await tapAt(g.x + g.colX(1), g.y + g.headerH + g.rowH + g.rowH / 2, 'right');
      await page.waitForTimeout(400);
      const item = page.getByText('Go to Locations Manager', { exact: false }).first();
      await expect(item).toBeVisible();
      await item.click();
      await page.waitForTimeout(700);
    }
    await expect(page.getByText('Types', { exact: true })).toBeVisible();

    // ---- CSV export from the glide ----
    await page.getByRole('button', { name: 'Locations Glide', exact: true }).click();
    await page.waitForTimeout(1200);
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Edit' }).click();
    await page.getByRole('menuitem', { name: 'Export Locations to CSV' }).click();
    const download = await downloadPromise;
    const csvText = (await import('node:fs')).readFileSync((await download.path())!, 'utf8');
    expect(csvText.split('\n')[0]).toBe('Name,Type,Address,Contact,Phone,Email');
    expect(csvText).toContain('Studio One');

    // ---- CSV import: new type + locations merge ----
    const importCsv = [
      'Name,Type,Address,Contact,Phone,Email',
      'Green Field,Set,12 Meadow Ln,,555-0001,',
      'Green Field,Set,99 New Rd,,,field@test.com',
      'Studio One,Unit Base,Old St,,,',
    ].join('\n');
    await page.setInputFiles('input[type="file"][accept=".csv"]', {
      name: 'locations-import.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(importCsv, 'utf8'),
    });
    await expect(page.getByText('Import Locations CSV')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('3 locations')).toBeVisible();
    await page.getByRole('button', { name: 'Import', exact: true }).click();
    await page.waitForTimeout(800);

    await expect.poll(async () => {
      const s = await locationState(page);
      const setLoc = s!.locations.filter((l: any) => l.name === 'Green Field');
      return setLoc.map((l: any) => l.type);
    }, { timeout: 8000 }).toEqual(['set']);
    // Merge: the second Green Field row updates (address/email filled, phone kept)
    await expect.poll(async () => {
      const s = await locationState(page);
      return s!.locations.find((l: any) => l.name === 'Green Field');
    }, { timeout: 8000 }).toEqual(expect.objectContaining({ phone: '555-0001', email: 'field@test.com' }));
  });
});
