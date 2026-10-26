import { test, expect } from '@playwright/test';
import { openDayManager, openCallSheetEdit, seedDayDates } from './helpers';

test.describe('Day Manager (roadmap 98)', () => {
  test('renders the sections and persists day notes on the governing daybreak', async ({ page }) => {
    await openDayManager(page);

    await expect(page.locator('[data-section="details"]')).toBeVisible();
    await expect(page.locator('[data-section="locations"]')).toBeVisible();
    await expect(page.locator('[data-section="scenes"]')).toBeVisible();
    await expect(page.locator('[data-section="callTimes"]')).toBeVisible();
    await expect(page.locator('[data-section="events"]')).toBeVisible();
    await expect(page.locator('[data-section="conflicts"]')).toBeVisible();

    const note = 'Parking behind the diner';
    const ta = page.locator('[data-section="details"] textarea');
    await ta.fill(note);
    await ta.blur();

    await expect.poll(async () => page.evaluate(() => {
      const b: any = (window as any).__lemonSchedule;
      const p = b.getProject();
      const v = p.versions.find((x: any) => x.id === p.activeVersionId);
      return v.rows.some((r: any) => r.type === 'DAYBREAK' && r.daybreakMeta?.note === 'Parking behind the diner');
    }), { timeout: 5000 }).toBe(true);
  });

  test('header opens the call-sheet editor and its Preview renders the day report', async ({ page }) => {
    await openDayManager(page);
    await openCallSheetEdit(page);
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    await expect(page.locator('[data-call-sheet-edit] .report-page').first()).toBeVisible({ timeout: 10000 });
  });

  test('master location flows into the call-sheet editor preview (report seam)', async ({ page }) => {
    await openDayManager(page);

    await page.evaluate(() => {
      const b: any = (window as any).__lemonSchedule;
      const p = b.getProject();
      const v = p.versions.find((x: any) => x.id === p.activeVersionId);
      const typeKey = (label: string) => p.locationTypes.find((t: any) => t.label === label)?.key;
      const loc = { id: 'loc-test-stage', name: 'Test Stage 7', type: typeKey('Set'), address: '7 Stage Way' };
      b.dispatch({ type: 'ADD_LOCATION', payload: { location: loc } });
      b.dispatch({ type: 'ADD_LOCATION', payload: { location: { id: 'loc-test-unit', name: 'Unit base 4', type: typeKey('Unit Base') } } });
      b.dispatch({ type: 'ADD_LOCATION', payload: { location: { id: 'loc-test-hospital', name: 'St. Mary\'s Hospital', type: typeKey('Hospital') } } });
    });

    /* The shared locations picker is the kit grouped searchable menu: headers
       follow the visible set and "set" matches the CATEGORY. */
    await page.getByRole('button', { name: 'No master location' }).click();
    const menu = page.locator('[role="menu"]');
    const groups = page.locator('[data-menu-group]');
    await expect(menu).toBeVisible();
    await expect(groups).toHaveText(['Set', 'Unit Base', 'Hospital']);
    await menu.locator('input').fill('set');
    await expect(menu.locator('[role="menuitem"]:visible')).toHaveCount(1);
    await expect(groups).toHaveText(['Set']);
    await menu.getByRole('menuitem', { name: 'Test Stage 7' }).click();
    await expect(page.locator('[data-section="locations"] button').filter({ hasText: 'Test Stage 7' }).first()).toBeVisible();

    /* Multi-select keeps the menu open and each pick lands in the trigger. */
    await page.getByRole('button', { name: 'Add key locations…' }).click();
    const keyMenu = page.locator('[role="menu"]');
    await expect(keyMenu).toBeVisible();
    await keyMenu.locator('input').fill('unit');
    await keyMenu.getByRole('menuitem', { name: 'Unit base 4' }).click();
    await expect(keyMenu).toBeVisible();
    await keyMenu.locator('input').fill('set');
    await keyMenu.getByRole('menuitem', { name: 'Test Stage 7' }).click();
    await expect(keyMenu).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-section="locations"] button').filter({ hasText: 'Unit base 4' }).first()).toContainText('Test Stage 7');

    await openCallSheetEdit(page);
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    await expect(page.locator('[data-call-sheet-edit]').getByText('Test Stage 7').first()).toBeVisible({ timeout: 12000 });
  });

  test('copy from day applies the source note in one undo entry', async ({ page }) => {
    await openDayManager(page);

    // Note on DAY 1.
    await page.evaluate(() => {
      const b: any = (window as any).__lemonSchedule;
      const p = b.getProject();
      const v = p.versions.find((x: any) => x.id === p.activeVersionId);
      const gov = v.rows.find((r: any) => r.type === 'DAYBREAK' && r.pinned) || v.rows.find((r: any) => r.type === 'DAYBREAK');
      b.dispatch({ type: 'UPDATE_ROW', payload: { versionId: v.id, rowId: gov.id, updates: { daybreakMeta: { note: 'Copy me over' } } } });
    });

    // Select DAY 2 via the toolbar day dropdown, then copy from day (Settings menu).
    await page.getByRole('main').getByRole('button', { name: /Select day/ }).first().click();
    await page.getByRole('menuitem', { name: /^DAY 2 / }).click();
    await page.getByRole('main').getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Copy from day' }).click();
    await page.getByText('Day Details', { exact: true }).last().click();
    await page.getByRole('button', { name: 'Copy to this day' }).click();

    // DAY 2's governing daybreak is the first non-pinned break.
    await expect.poll(async () => page.evaluate(() => {
      const b: any = (window as any).__lemonSchedule;
      const p = b.getProject();
      const v = p.versions.find((x: any) => x.id === p.activeVersionId);
      const nonPinned = v.rows.filter((r: any) => r.type === 'DAYBREAK' && !r.pinned);
      return nonPinned.some((r: any) => r.daybreakMeta?.note === 'Copy me over');
    }), { timeout: 5000 }).toBe(true);
  });

  test('deleting a daybreak with details warns first and cancel keeps it', async ({ page }) => {
    await openDayManager(page);
    const dates = await seedDayDates(page);
    expect(dates.length).toBeGreaterThan(1);

    // Put details on the FIRST non-pinned daybreak via the bridge.
    const withMeta = await page.evaluate(() => {
      const b: any = (window as any).__lemonSchedule;
      const p = b.getProject();
      const v = p.versions.find((x: any) => x.id === p.activeVersionId);
      const row = v.rows.find((r: any) => r.type === 'DAYBREAK' && !r.pinned);
      b.dispatch({ type: 'UPDATE_ROW', payload: { versionId: v.id, rowId: row.id, updates: { daybreakMeta: { note: 'Keep me' } } } });
      return row.id as string;
    });

    await page.getByRole('button', { name: 'Schedule' }).click();
    const row = page.locator(`[data-row-id="${withMeta}"]`).first();
    await expect(row).toBeVisible({ timeout: 8000 });
    await row.click({ button: 'right' });

    await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
    await expect(page.getByText('This day has details')).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: 'Cancel' }).click();

    const rows = await page.evaluate(() => {
      const b: any = (window as any).__lemonSchedule;
      const p = b.getProject();
      const v = p.versions.find((x: any) => x.id === p.activeVersionId);
      return v.rows.filter((r: any) => r.type === 'DAYBREAK');
    });
    expect(rows.some(r => r.id === withMeta)).toBe(true);
  });
});
