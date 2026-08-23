import { test, expect } from '@playwright/test';
import { openSeededProject } from './helpers';

type AnyPage = any;

const crewState = (page: AnyPage) =>
  page.evaluate(() => {
    try {
      const key = Object.keys(localStorage).find(k => k.startsWith('lemon_schedule_project_v1'));
      if (!key) return null;
      const p = JSON.parse(localStorage.getItem(key)!);
      return { crew: p.crew || {}, roles: (p.crewRoles || []).map((r: any) => r.key) };
    } catch { return null; }
  });

const memberCount = (page: AnyPage) => page.evaluate(() => {
  try {
    const key = Object.keys(localStorage).find(k => k.startsWith('lemon_schedule_project_v1'));
    if (!key) return 0;
    const p = JSON.parse(localStorage.getItem(key)!);
    return Object.values(p.crew || {}).reduce((n: number, list: any) => n + list.length, 0);
  } catch { return 0; }
});

test.describe('Crew Glide', () => {
  test('add via add-row, create roles in cells, sort, go-to-manager, CSV round trip', async ({ page }) => {
    await openSeededProject(page);

    await page.getByRole('button', { name: 'Production', exact: true }).click();
        await page.getByRole('button', { name: 'Crew Glide', exact: true }).click();
    
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
      const widths = [actionsW, 200, 160, 130, 220].map(w => Math.round((w * size) / 11));
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
      // editor mount settle — the first keystroke would otherwise land on the canvas
      await page.waitForTimeout(350);
      await page.keyboard.type(text, { delay: 30 });
      await page.keyboard.press('Enter');
    };

    // --- Add two members via the add-row Name cell (falls back to the first role) ---
    const base = await memberCount(page);
    await editCell(base, 1, 'Zed Zed');
    await expect.poll(() => memberCount(page), { timeout: 8000 }).toBe(base + 1);
    await editCell(base + 1, 1, 'Alice Smith');
    await expect.poll(() => memberCount(page), { timeout: 8000 }).toBe(base + 2);

    let st = await crewState(page);
    const firstRole = st!.roles[0];
    expect(st!.crew[firstRole].map((p: any) => p.name)).toEqual(['Zed Zed', 'Alice Smith']);

    // --- Create a brand-new role from the add-row Role cell ---
    await editCell(base + 2, 2, 'Grip');
    await expect.poll(async () => (await crewState(page))!.roles.includes('grip'), { timeout: 8000 }).toBe(true);
    await expect.poll(() => memberCount(page), { timeout: 8000 }).toBe(base + 3); // dedupe: exactly one member added

    // --- Move Alice to the new role via her Role cell ---
    await editCell(1, 2, 'Grip');
    await expect.poll(async () => {
      const s = await crewState(page);
      return s!.crew['grip']?.some((p: any) => p.name === 'Alice Smith') ?? false;
    }, { timeout: 8000 }).toBe(true);

    // --- Header right-click sort: Name A to Z sorts within each role ---
    {
      const g = await gridGeo();
      await tapAt(g.x + g.colX(1), g.y + g.headerH / 2, 'right');
            await page.getByText('Sort A to Z', { exact: true }).click();
      await page.waitForTimeout(700);
    }
    // Grip now holds Alice + the empty add-row member (empty sorts last)
    await expect.poll(async () => {
      const s = await crewState(page);
      return s!.crew['grip']?.map((p: any) => p.name) ?? [];
    }, { timeout: 8000 }).toEqual(['Alice Smith', '']);

    // New members always land at the bottom (unless manually sorted)
    await editCell(base + 3, 1, 'Bottom Person');
    await expect.poll(async () => {
      const s = await crewState(page);
      return s!.crew[firstRole]?.map((p: any) => p.name) ?? [];
    }, { timeout: 8000 }).toEqual(['Zed Zed', 'Bottom Person']);

    // --- Right-click a row -> Go to Crew Manager → role ---
    // Rows: 0=Zed, 1=Bottom Person (producer), 2=Alice (grip), 3=empty (grip)
    {
      const g = await gridGeo();
      await tapAt(g.x + g.colX(1), g.y + g.headerH + 2 * g.rowH + g.rowH / 2, 'right');
            const item = page.getByText('Go to Crew Manager → Grip', { exact: true });
      await expect(item).toBeVisible();
      await item.click();
      await page.waitForTimeout(700);
    }
    // Lands on the Crew manager with the Grip role selected
    await expect(page.getByText('Roles', { exact: true })).toBeVisible();
    await expect(page.locator('button.bg-zinc-900', { hasText: 'Grip' })).toBeVisible();
    await expect(page.locator('input[value="Alice Smith"]')).toBeVisible();

    // --- Back to the glide: CSV export ---
    await page.getByRole('button', { name: 'Crew Glide', exact: true }).click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Edit' }).click();
    await page.getByRole('menuitem', { name: 'Export Crew to CSV' }).click();
    const download = await downloadPromise;
    const csvPath = await download.path();
    const csvText = (await import('node:fs')).readFileSync(csvPath!, 'utf8');
    expect(csvText.split('\n')[0]).toBe('Role,Name,Phone,Email');
    expect(csvText).toContain('"Grip","Alice Smith"');

    // --- CSV import: new role + members merge ---
    const importCsv = [
      'Role,Name,Phone,Email',
      'Green Team,Stunt One,555-0001,stunt@test.com',
      'Green Team,Stunt Two,,stunt2@test.com',
      'Grip,Alice Smith,555-9999,alice@new.test',
    ].join('\n');
    await page.setInputFiles('input[type="file"][accept=".csv"]', {
      name: 'crew-import.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(importCsv, 'utf8'),
    });
    await expect(page.getByText('Import Crew CSV')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('3 crew members')).toBeVisible();
    await expect(page.getByText('Green Team', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Import', exact: true }).click();
    
    await expect.poll(async () => {
      const s = await crewState(page);
      return s!.roles.includes('greenteam');
    }, { timeout: 8000 }).toBe(true);
    await expect.poll(async () => {
      const s = await crewState(page);
      const stunt = s!.crew['greenteam'];
      return stunt?.map((p: any) => p.name) ?? [];
    }, { timeout: 8000 }).toEqual(['Stunt One', 'Stunt Two']);
    // Merge: Alice's phone/email updated from the import (non-empty values)
    await expect.poll(async () => {
      const s = await crewState(page);
      return s!.crew['grip']?.find((p: any) => p.name === 'Alice Smith');
    }, { timeout: 8000 }).toEqual(expect.objectContaining({ phone: '555-9999', email: 'alice@new.test' }));
  });
});
