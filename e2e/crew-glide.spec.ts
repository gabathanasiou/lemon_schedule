import { test, expect } from '@playwright/test';
import { openSeededProject, nameCell } from './helpers';

type AnyPage = any;

const crewState = (page: AnyPage) =>
  page.evaluate(() => {
    try {
      const key = Object.keys(localStorage).find(k => k.startsWith('lemon_schedule_project_v1'));
      if (!key) return null;
      const p = (window as any).__lemonSchedule.decodeProject(localStorage.getItem(key)!);
      return { crew: p.crew || {}, roles: (p.crewRoles || []).map((r: any) => r.key) };
    } catch { return null; }
  });

const memberCount = (page: AnyPage) => page.evaluate(() => {
  try {
    const key = Object.keys(localStorage).find(k => k.startsWith('lemon_schedule_project_v1'));
    if (!key) return 0;
    const p = (window as any).__lemonSchedule.decodeProject(localStorage.getItem(key)!);
    return Object.values(p.crew || {}).reduce((n: number, list: any) => n + list.length, 0);
  } catch { return 0; }
});

test.describe('Crew Glide', () => {
  test('range fill writes one value down the selected Name rows in one undo (roadmap 139)', async ({ page }) => {
    await openSeededProject(page);
    await page.evaluate(() => {
      const b = (window as any).__lemonSchedule;
      b.dispatch({ type: 'UPDATE_PROJECT', payload: { crew: {} } });
    });
    await expect.poll(() => memberCount(page)).toBe(0);

    await page.getByRole('button', { name: 'Production', exact: true }).click();
    await page.getByRole('button', { name: 'Crew Glide', exact: true }).click();

    const isCoarse = () => page.evaluate(() => window.matchMedia('(pointer: coarse)').matches);
    test.skip(await isCoarse(), 'range-fill drag is a desktop (mouse) interaction');

    // Name column: row marker 50 + actions → its centre (desktop font 11 → header 36, row 34).
    const namePoint = async (row: number) => {
      const sr = await page.locator('.dvn-scroller').boundingBox();
      const size = await page.evaluate(() => {
        const v = parseFloat(localStorage.getItem('lemon_schedule_glide_font_size') || '');
        return Number.isFinite(v) ? v : 11;
      });
      const headerH = Math.round((36 * size) / 11);
      const rowH = Math.round((34 * size) / 11);
      const actionsW = Math.round((36 * size) / 11);
      const nameW = Math.round((200 * size) / 11);
      return { x: sr!.x + 50 + actionsW + nameW / 2, y: sr!.y + headerH + row * rowH + rowH / 2 };
    };
    const addMember = async (row: number, text: string) => {
      const p = await namePoint(row);
      await page.mouse.dblclick(p.x, p.y);
      const input = page.locator('#portal textarea, #portal input').first();
      await expect(input).toBeAttached({ timeout: 4000 });
      await input.fill(text);
      await input.press('Enter');
    };

    await addMember(0, 'A One');
    await addMember(1, 'B Two');
    await addMember(2, 'C Three');
    await expect.poll(() => memberCount(page), { timeout: 8000 }).toBe(3);
    const before = await page.evaluate(() => (window as any).__lemonSchedule.pastCount());

    // Drag a 3-row range down the Name column, then overwrite with one value.
    const a = await namePoint(0);
    const c = await namePoint(2);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(c.x, c.y, { steps: 8 });
    await page.mouse.up();
    await page.keyboard.type('X');
    const input = page.locator('#portal textarea, #portal input').first();
    await expect(input).toBeAttached({ timeout: 4000 });
    await input.fill('X');
    await input.press('Enter');

    await expect.poll(async () => {
      const s: any = await crewState(page);
      return s!.crew[s!.roles[0]].map((p: any) => p.name);
    }, { timeout: 8000 }).toEqual(['X', 'X', 'X']);
    // The whole spread is ONE undo entry.
    expect(await page.evaluate(() => (window as any).__lemonSchedule.pastCount())).toBe(before + 1);
  });

  test('add via add-row, create roles in cells, sort, go-to-manager, CSV round trip', async ({ page }) => {
    await openSeededProject(page);

    // The seed ships crew members — start from an empty crew (persisted).
    await page.evaluate(() => {
      const b = (window as any).__lemonSchedule;
      b.dispatch({ type: 'UPDATE_PROJECT', payload: { crew: {} } });
    });
    await expect.poll(() => memberCount(page)).toBe(0);

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
    }
    // Lands on the Crew manager with the Grip role selected
    await expect(page.getByText('Roles', { exact: true })).toBeVisible();
    await expect(page.locator('button.bg-zinc-900', { hasText: 'Grip' })).toBeVisible();
    await expect(nameCell(page, 'Alice Smith')).toBeVisible();

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
