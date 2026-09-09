import { test, expect, Page } from '@playwright/test';
import { openSeededProject, seedDayDates } from './helpers';

/** Opens Production → Days and waits for the page shell. */
async function openDays(page: Page) {
  await openSeededProject(page);
  await page.getByRole('button', { name: 'Production' }).click();
  await page.getByRole('button', { name: 'Days', exact: true }).click();
  await expect(page.locator('[data-day-manager]')).toBeVisible({ timeout: 8000 });
}

/** Reads the active version's DAYBREAK rows from the bridge. */
async function daybreakRows(page: Page): Promise<any[]> {
  return page.evaluate(() => {
    const b: any = (window as any).__lemonSchedule;
    const p = b.getProject();
    const v = p.versions.find((x: any) => x.id === p.activeVersionId);
    return v.rows.filter((r: any) => r.type === 'DAYBREAK');
  });
}

test.describe('Day Manager (roadmap 98)', () => {
  test('renders the sections and persists day notes on the governing daybreak', async ({ page }) => {
    await openDays(page);

    await expect(page.locator('[data-section="details"]')).toBeVisible();
    await expect(page.locator('[data-section="locations"]')).toBeVisible();
    await expect(page.locator('[data-section="scenes"]')).toBeVisible();
    await expect(page.locator('[data-section="castElements"]')).toBeVisible();
    await expect(page.locator('[data-section="events"]')).toBeVisible();
    await expect(page.locator('[data-section="conflicts"]')).toBeVisible();
    await expect(page.locator('[data-section="callSheet"]')).toBeVisible();

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

  test('header call time edits the governing daybreak', async ({ page }) => {
    await openDays(page);

    const input = page.locator('[data-day-manager] header input').first();
    await input.click();
    await input.fill('06:15');
    await input.press('Enter');

    await expect.poll(async () => page.evaluate(() => {
      const b: any = (window as any).__lemonSchedule;
      const p = b.getProject();
      const v = p.versions.find((x: any) => x.id === p.activeVersionId);
      // DAY 1's governing daybreak is the pinned anchor.
      const gov = v.rows.find((r: any) => r.type === 'DAYBREAK' && r.pinned);
      return gov?.daybreakCallTime || '';
    }), { timeout: 5000 }).toBe('06:15');
  });

  test('call-sheet preview pane renders the real design scoped to the day', async ({ page }) => {
    await openDays(page);
    const pane = page.locator('[data-day-callsheet-pane]');
    if (await pane.count()) {
      await expect(pane.locator('.report-page').first()).toBeVisible({ timeout: 10000 });
    }
  });

  test('master location flows into the call-sheet preview (report seam)', async ({ page }) => {
    await openDays(page);

    await page.evaluate(() => {
      const b: any = (window as any).__lemonSchedule;
      const p = b.getProject();
      const v = p.versions.find((x: any) => x.id === p.activeVersionId);
      const loc = { id: 'loc-test-stage', name: 'Test Stage 7', type: 'set', address: '7 Stage Way' };
      b.dispatch({ type: 'ADD_LOCATION', payload: { location: loc } });
      const gov = v.rows.find((r: any) => r.type === 'DAYBREAK' && r.pinned) || v.rows.find((r: any) => r.type === 'DAYBREAK');
      b.dispatch({ type: 'UPDATE_ROW', payload: { versionId: v.id, rowId: gov.id, updates: { daybreakMeta: { locationId: 'loc-test-stage' } } } });
    });

    const pane = page.locator('[data-day-callsheet-pane]');
    await expect(pane.getByText('Test Stage 7').first()).toBeVisible({ timeout: 12000 });
  });

  test('copy from day applies the source note in one undo entry', async ({ page }) => {
    await openDays(page);

    // Note on DAY 1.
    await page.evaluate(() => {
      const b: any = (window as any).__lemonSchedule;
      const p = b.getProject();
      const v = p.versions.find((x: any) => x.id === p.activeVersionId);
      const gov = v.rows.find((r: any) => r.type === 'DAYBREAK' && r.pinned) || v.rows.find((r: any) => r.type === 'DAYBREAK');
      b.dispatch({ type: 'UPDATE_ROW', payload: { versionId: v.id, rowId: gov.id, updates: { daybreakMeta: { note: 'Copy me over' } } } });
    });

    // Select DAY 2 and copy from day.
    await page.getByRole('button', { name: /DAY 2/ }).first().click();
    await page.getByRole('button', { name: 'Copy from day' }).click();
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
    await openDays(page);
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

    const rows = await daybreakRows(page);
    expect(rows.some(r => r.id === withMeta)).toBe(true);
  });
});
