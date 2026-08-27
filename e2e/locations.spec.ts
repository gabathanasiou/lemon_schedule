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
        await page.getByRole('button', { name: 'Locations', exact: true }).click();

    // Types sidebar with seeded types
    await expect(page.getByText('Types', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add Type' })).toBeVisible();

    // Add a location to the first type (buffered → save)
    await page.getByRole('button', { name: 'Add Location', exact: true }).click();
    await page.getByPlaceholder('Name').last().fill('Studio One');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
        await expect(page.locator('input[value="Studio One"]')).toBeVisible();

    // A second, different-named location saves cleanly (no merge dialog)
    await page.getByRole('button', { name: 'Add Location', exact: true }).click();
    await page.getByPlaceholder('Name').last().fill('Studio Two');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect.poll(async () => (await locationState(page))!.locations.length, { timeout: 8000 }).toBe(2);

    // Same-name duplicate in the same type → merge dialog on save
    await page.getByRole('button', { name: 'Add Location', exact: true }).click();
    await page.getByPlaceholder('Name').last().fill('Studio One');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Merge Locations', { exact: true })).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: 'Merge' }).click();
    await expect.poll(async () => (await locationState(page))!.locations.length, { timeout: 8000 }).toBe(2);

    // Switch to another type and add there — grouped by the sidebar
    await page.locator('button', { hasText: 'Unit Base' }).first().click();
    await page.getByRole('button', { name: 'Add Location', exact: true }).click();
    await page.getByPlaceholder('Name').last().fill('River Lot');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect.poll(async () => (await locationState(page))!.locations.length, { timeout: 8000 }).toBe(3);

    // ---- Glide ----
    await page.getByRole('button', { name: 'Locations Glide', exact: true }).click();
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
                await page.touchscreen.tap(x, y);
      } else {
        await page.mouse.dblclick(x, y);
      }
            await page.keyboard.type(text, { delay: 30 });
      await page.keyboard.press('Enter');
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
            await page.getByText('Sort A to Z', { exact: true }).click();
      // the context menu dismissed — the next tap targets row 2's fresh spot
      await expect(page.getByText('Sort A to Z', { exact: true })).not.toBeVisible({ timeout: 5000 });
    }

    // Right-click a row -> Go to Locations Manager → type
    {
      const g = await gridGeo();
      await tapAt(g.x + g.colX(1), g.y + g.headerH + g.rowH + g.rowH / 2, 'right');
      const item = page.getByText('Go to Locations Manager', { exact: false }).first();
      await expect(item).toBeVisible();
      await item.click();
    }
    await expect(page.getByText('Types', { exact: true })).toBeVisible();

    // ---- CSV export from the glide ----
    await page.getByRole('button', { name: 'Locations Glide', exact: true }).click();
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

  test('address picker re-edit starts at the pin; blank names fall back to the address; nearest-facility pickers use the kit dropdown', async ({ page }) => {
    await openSeededProject(page);
    await page.route('**://tile.openstreetmap.org/**', route => route.abort());

    // Seed typed locations + facilities through the bridge, incl. a blank-name
    // entry (name must resolve from the address) and a thinly-mapped address
    // ("Mikras Asias 92" survives via the editable street-number input).
    await page.evaluate(() => {
      const b = (window as any).__lemonSchedule;
      const project = b.getProject();
      const types = project.locationTypes || [];
      const ensure = (key: string, label: string) => {
        if (!types.some((t: any) => t.key === key)) b.dispatch({ type: 'ADD_LOCATION_TYPE', payload: { type: { key, label } } });
      };
      ensure('hospital', 'Hospital');
      ensure('policeStation', 'Police Station');
      const add = (location: any) => b.dispatch({ type: 'ADD_LOCATION', payload: { location } });
      add({ id: 'loc-pin', name: '', type: 'unitBase', address: '99 New Rd', place: '99 New Rd, London', lat: 51.5, lng: -0.12 });
      add({ id: 'loc-h1', name: 'St Mary', type: 'hospital', address: '1 Hospital Way' });
      add({ id: 'loc-h2', name: 'City Gen', type: 'hospital', address: '2 Gen Rd' });
      add({ id: 'loc-p1', name: 'Xanthi Precinct', type: 'policeStation', address: '3 Precinct St' });
      add({ id: 'loc-p2', name: '', type: 'policeStation', address: 'Mikras Asias 92, Xanthi' });
    });

    await page.getByRole('button', { name: 'Production', exact: true }).click();
    await page.getByRole('button', { name: 'Locations', exact: true }).click();
    await page.locator('button', { hasText: 'Unit Base' }).first().click();

    // ---- blank name resolves from the address in the manager ----
    await expect(page.locator('input[value="99 New Rd"]')).toBeVisible();

    // ---- address picker re-edit starts at the current pin + address ----
    await page.locator('tr', { has: page.locator('input[value="99 New Rd"]') }).getByTitle('Set address').click();
    const picker = page.getByRole('dialog');
    await expect(picker.getByText('51.5000, -0.1200')).toBeVisible();
    await expect(picker.getByPlaceholder('Street number / address')).toHaveValue('99 New Rd');
    await picker.getByRole('button', { name: 'Cancel' }).click();

    // ---- saving an untouched blank-name row persists the resolved name ----
    await page.getByPlaceholder('Phone').last().fill('555-1234');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect.poll(async () => {
      const p = await page.evaluate(() => (window as any).__lemonSchedule.getProject());
      return (p.locations || []).find((l: any) => l.id === 'loc-pin');
    }, { timeout: 8000 }).toEqual(expect.objectContaining({ name: '99 New Rd', phone: '555-1234' }));

    // ---- nearest-facility pickers are kit dropdowns (self-row excluded) ----
    await page.locator('button', { hasText: 'Hospital' }).first().click();
    await page.locator('tr', { has: page.locator('input[value="St Mary"]') }).getByTitle('Set nearest hospital').click();
    await page.getByRole('menuitem', { name: 'City Gen' }).click();
    await expect(page.locator('tr', { has: page.locator('input[value="St Mary"]') }).getByTitle('Set nearest hospital')).toContainText('City Gen');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect.poll(async () => {
      const p = await page.evaluate(() => (window as any).__lemonSchedule.getProject());
      return (p.locations || []).find((l: any) => l.id === 'loc-h1');
    }, { timeout: 8000 }).toEqual(expect.objectContaining({ nearby: { hospitalId: 'loc-h2' } }));

    // ---- blank-name police station resolves too; its dropdown lists peers ----
    await page.locator('button', { hasText: 'Police Station' }).first().click();
    await expect(page.locator('input[value="Mikras Asias 92, Xanthi"]')).toBeVisible();
    await page.locator('tr', { has: page.locator('input[value="Mikras Asias 92, Xanthi"]') }).getByTitle('Set nearest police station').click();
    await expect(page.getByRole('menuitem', { name: 'Xanthi Precinct' })).toBeVisible();
  });
});
