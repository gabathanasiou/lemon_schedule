import { test, expect } from '@playwright/test';
import { loadSeedProject, seedProjectScript } from './helpers';

// Custom day types (roadmap 39). The manager is the shared ManagerShell engine
// in a modal (calendar View → Day Types…); statuses are registry keys on
// NonShootDate. Calendar context menu marks days; DOODs tab + DOOD print and
// the report `dayType` field resolve labels/colors through lib/dayTypes.
//
// Invariant under test: sections never sit on statused dates (the date cursor
// skips them), so a days-repeat in a report prints the column EMPTY — the
// field's per-day seam resolves off the day's date and renders every value
// faithfully, but the day collection only contains production sections.

test('day types: manager CRUD, locked built-ins, calendar marking, DOOD label, report field', async ({ page }) => {
  const seed = loadSeedProject();
  const project = JSON.parse(seed.raw);
  project.reportDesigns = [{
    id: 'dt-design',
    name: 'Day Type Test',
    createdAt: Date.now(),
    page: 'landscape',
    blocks: [
      { id: 'rep-days', type: 'repeat', collection: 'days', gap: 8, children: [
        { id: 'f-num', type: 'field', field: 'dayNumber' },
        { id: 'f-date', type: 'field', field: 'dayDate' },
        { id: 'f-type', type: 'field', field: 'dayType' },
      ] },
    ],
  }];
  project.activeReportId = 'dt-design';
  await page.addInitScript(seedProjectScript({ raw: JSON.stringify(project) }));
  await page.goto('http://localhost:3001/lemon_schedule/');
  const card = page.getByText(seed.data.title, { exact: true }).first();
  await card.click({ timeout: 8000 });
  await expect(page.getByRole('button', { name: 'Breakdown', exact: true })).toBeVisible({ timeout: 10000 });

  await page.getByRole('button', { name: 'Calendar', exact: true }).click();

  // Last production section date — marking it statuses a real calendar day.
  const lastSectionDate = await page.evaluate(() => {
    const rows = (window as any).__lemonSchedule?.getRows?.();
    const secs = (rows?.sections || []).filter((s: any) => !s.isPinned);
    return secs[secs.length - 1]?.date ?? '';
  });
  expect(lastSectionDate).toBeTruthy();

  // ---- Manager: View → Day Types… → add "Rehearsal" with a color ------------
  await page.getByRole('button', { name: 'View', exact: true }).click();
  await page.getByText('Day Types…').click();
  await expect(page.locator('tbody tr')).toHaveCount(3);
  await expect(page.locator('tbody tr input[type="text"]').nth(0)).toHaveValue('Hold');
  await expect(page.locator('tbody tr input[type="text"]').nth(2)).toHaveValue('Travel');
  await expect(page.locator('tbody tr input[type="text"]').nth(4)).toHaveValue('Day Off');
  // Built-in rows are locked: delete disabled
  await expect(page.locator('tbody tr').nth(0).locator('button[title="Delete day type"]')).toBeDisabled();

  await page.getByRole('button', { name: 'Add Day Type', exact: true }).click();
  const newRow = page.locator('tbody tr').last();
  await newRow.locator('input[type="text"]').nth(0).fill('Rehearsal');
  const hexInput = newRow.locator('input[type="text"]').nth(1);
  await hexInput.fill('#16a34a');
  await hexInput.press('Enter');
  await page.getByRole('button', { name: 'Save Changes' }).click();

  const types = await page.evaluate(() => (window as any).__lemonSchedule.getProject().dayTypes);
  expect(types).toHaveLength(4);
  const reh = types.find((t: any) => t.label === 'Rehearsal');
  expect(reh).toBeTruthy();
  expect(reh.color).toBe('#16A34A');
  expect(reh.key).toBe('rehearsal');
  await page.waitForFunction(() => {
    const key = Object.keys(localStorage).find(k => k.startsWith('lemon_schedule_project_v1'));
    if (!key) return false;
    try {
      const p = JSON.parse(localStorage.getItem(key)!);
      return p.dayTypes?.some((t: any) => t.label === 'Rehearsal' && t.color === '#16A34A');
    } catch { return false; }
  });

  await page.getByRole('button', { name: 'Close', exact: true }).click();

  // ---- Calendar: mark the day via context menu → chip + color + saved key ---
  const dayCell = page.locator(`[data-date-key="${lastSectionDate}"]`);
  const header = dayCell.locator('[class*="flex items-center justify-between"]').first();
  await header.click({ button: 'right' });
  await page.getByText('Rehearsal', { exact: true }).click();
  await expect(dayCell.getByText('REHEARSAL', { exact: true })).toBeVisible();
  await expect(header).toHaveCSS('background-color', 'rgb(22, 163, 74)');

  const ns = await page.evaluate((d) => {
    const p = (window as any).__lemonSchedule.getProject();
    const v = p.versions.find((x: any) => x.id === p.activeVersionId);
    return v.nonShootDates?.find((n: any) => n.date === d);
  }, lastSectionDate);
  expect(ns?.status).toBe('rehearsal');

  // ---- DOODs tab: the statused day's header shows the label + color fill ----
  await page.getByRole('button', { name: 'Reports', exact: true }).click();
  const doodTh = page.locator('thead th', { hasText: 'Rehearsal' }).first();
  await expect(doodTh).toBeVisible();
  await expect(doodTh).toHaveCSS('background-color', 'rgb(22, 163, 74)');

  // ---- Report designer: dayType field prints per-day (invariant: section
  // ---- days carry no status, so the column renders empty but the pipeline
  // ---- survives and other day fields still resolve after the shift) --------
  await page.getByRole('button', { name: 'Design', exact: true }).click();
  await page.getByRole('button', { name: 'Reports Designer', exact: true }).click();
  await page.evaluate(() => { (window as any).print = () => {}; });
  await page.getByRole('button', { name: 'Print', exact: true }).click();
  await page.getByRole('button', { name: /Print \/ Save PDF/ }).click();
  const pages = page.locator('.report-root .report-page');
  await expect(pages.first()).toBeVisible({ timeout: 15000 });
  await page.waitForFunction(() => document.querySelector('.report-root')?.getAttribute('data-paginated') === 'true', null, { timeout: 15000 });
  const texts = await pages.evaluateAll(els => (els as HTMLElement[]).map(el => el.innerText || ''));
  const all = texts.join('\n');

  // The last section shifted off the statused date — its new date prints.
  const shiftedLastDate = await page.evaluate(() => {
    const rows = (window as any).__lemonSchedule?.getRows?.();
    const secs = (rows?.sections || []).filter((s: any) => !s.isPinned);
    return secs[secs.length - 1]?.date ?? '';
  });
  const expectedLabel = new Date(shiftedLastDate + 'T00:00:00')
    .toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  expect(all).toContain(expectedLabel);
  // Invariant: statused dates are not sections → the dayType column is empty.
  expect(all).not.toContain('Rehearsal');
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await expect(page.getByRole('button', { name: 'Design', exact: true })).toBeVisible();

  // ---- Delete the custom type → in-use status falls back to no status ------
  await page.getByRole('button', { name: 'Calendar', exact: true }).click();
  await page.getByRole('button', { name: 'View', exact: true }).click();
  await page.getByText('Day Types…').click();
  const rehIndex = await page.locator('tbody tr').evaluateAll(trs =>
    trs.findIndex(tr => (tr.querySelector('input[type="text"]') as HTMLInputElement)?.value === 'Rehearsal'));
  expect(rehIndex).toBeGreaterThanOrEqual(0);
  await page.locator('tbody tr').nth(rehIndex).locator('button[title="Delete day type"]').click();
  await page.getByRole('button', { name: 'Save Changes' }).click();

  const after = await page.evaluate(() => {
    const p = (window as any).__lemonSchedule.getProject();
    const v = p.versions.find((x: any) => x.id === p.activeVersionId);
    return {
      dayTypes: p.dayTypes.map((t: any) => t.key),
      statuses: (v.nonShootDates || []).map((n: any) => n.status).filter(Boolean),
    };
  });
  expect(after.dayTypes).toEqual(['hold', 'travel', 'holiday']);
  // Only the deleted type's statuses are pruned — other statuses survive.
  expect(after.statuses).not.toContain('rehearsal');

  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.locator(`[data-date-key="${lastSectionDate}"]`).getByText('REHEARSAL', { exact: true })).toHaveCount(0);
});