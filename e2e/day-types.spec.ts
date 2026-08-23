import { test, expect } from '@playwright/test';
import { loadSeedProject, seedProjectScript } from './helpers';

// Custom day types (roadmap 39) live in the Calendar tab's Day Types sub-tab —
// an ElementManager-style sidebar (icon + label + usage count) with edit
// modals (name/icon/color/attachable). Days carry per-type attachment lists
// (cast/elements like travel/hold) that render as DOOD cell letters + count
// columns. Deleting a type in use prunes its statuses in every version.
//
// Invariant under test: sections never sit on statused dates, so a days-repeat
// in a report prints the dayType column EMPTY — the field's per-day seam is
// fine; the day collection only contains production sections.

const BUILTIN_ROW_ICONS: Record<string, string> = {
  Hold: 'lucide-pause',
  Travel: 'lucide-plane',
  'Day Off': 'lucide-sun',
};

test('day types: manager sub-tab CRUD, attachments, DOOD letters + counts, report field, delete-in-use', async ({ page }) => {
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

  await page.getByRole('banner').getByRole('button', { name: 'Calendar', exact: true }).click();

  // Last production section date — marking it statuses a real calendar day.
  const lastSectionDate = await page.evaluate(() => {
    const rows = (window as any).__lemonSchedule?.getRows?.();
    const secs = (rows?.sections || []).filter((s: any) => !s.isPinned);
    return secs[secs.length - 1]?.date ?? '';
  });
  expect(lastSectionDate).toBeTruthy();

  // ---- Day Types sub-tab: built-ins with icons, locked (no trash) -----------
  await page.getByRole('button', { name: 'Day Types', exact: true }).click();
  const sidebar = page.locator('aside');
  await expect(sidebar.getByText('Hold', { exact: true })).toBeVisible();
  await expect(sidebar.getByText('Travel', { exact: true })).toBeVisible();
  await expect(sidebar.getByText('Day Off', { exact: true })).toBeVisible();
  for (const [label, iconCls] of Object.entries({ Hold: 'lucide-pause', Travel: 'lucide-plane', 'Day Off': 'lucide-sun' })) {
    const row = sidebar.locator('button:has-text("' + label + '")').locator('..');
    await expect(row.locator('svg.' + iconCls).first()).toBeVisible();
  }
  const holdRow = sidebar.getByText('Hold', { exact: true }).locator('..');
  await expect(holdRow.locator('button[title*="Edit"]')).toBeVisible();
  await expect(holdRow.locator('button', { has: page.locator('svg.lucide-trash-2') })).toHaveCount(0);

  // ---- Add a custom type with icon + color + attachable ---------------------
  await page.getByRole('button', { name: 'Add Day Type', exact: true }).click();
  const modal = page.locator('[role="dialog"]').last();
  await modal.getByPlaceholder('e.g. Rehearsal, Wrap, Tech Scout...').fill('Rehearsal');
  await modal.locator('button', { has: page.locator('svg.lucide-music') }).click();
  await modal.getByPlaceholder('#000000').fill('#16a34a');
  await modal.getByPlaceholder('#000000').press('Enter');
  await modal.getByRole('button', { name: 'Create', exact: true }).click();

  let types = await page.evaluate(() => (window as any).__lemonSchedule.getProject().dayTypes);
  expect(types).toHaveLength(4);
  const reh = types.find((t: any) => t.label === 'Rehearsal');
  expect(reh).toMatchObject({ key: 'rehearsal', icon: 'Music', color: '#16A34A', attachable: true });
  await expect(sidebar.getByText('Rehearsal', { exact: true })).toBeVisible();

  // ---- Edit a built-in (label only — key stays locked) ----------------------
  const holdEditBtn = page.locator('button[title*="Edit (label, icon, color)"]').first();
  await holdEditBtn.click();
  await modal.getByPlaceholder('e.g. Rehearsal, Wrap, Tech Scout...').fill('Rest Day');
  await modal.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(sidebar.getByText('Rest Day', { exact: true })).toBeVisible();
  types = await page.evaluate(() => (window as any).__lemonSchedule.getProject().dayTypes);
  expect(types.find((t: any) => t.key === 'hold')?.label).toBe('Rest Day');

  // ---- Mark a day: context menu lists the custom type -----------------------
  await page.getByRole('main').getByRole('button', { name: 'Calendar', exact: true }).click();
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

  // ---- Attach a cast member to the Rehearsal day ----------------------------
  await header.dblclick({ force: true });
  await expect(page.getByText('Day Status —', { exact: false })).toBeVisible();
  await expect(page.getByText('Attached Rehearsal', { exact: true })).toBeVisible();
  await page.locator('input.text-inherit').nth(0).click();
  await page.getByText('FISHERMAN', { exact: true }).first().click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  const withLists = await page.evaluate((d) => {
    const p = (window as any).__lemonSchedule.getProject();
    const v = p.versions.find((x: any) => x.id === p.activeVersionId);
    return v.nonShootDates?.find((n: any) => n.date === d);
  }, lastSectionDate);
  expect(withLists?.lists?.rehearsal?.cast?.length).toBe(1);
  // Custom-type day marker: the code chip (R) shows on the day header.
  await expect(dayCell.getByText('R', { exact: true }).first()).toBeVisible();

  // ---- Day Types sub-tab: usage count + used-on list -------------------------
  await page.getByRole('button', { name: 'Day Types', exact: true }).click();
  const rehSide = sidebar.getByText('Rehearsal', { exact: true }).locator('..');
  await rehSide.click();
  await expect(rehSide).toContainText('1');
  await expect(page.getByText(lastSectionDate, { exact: false }).first()).toBeVisible();

  // ---- DOODs tab: cell letter + header label + count column -----------------
  await page.getByRole('banner').getByRole('button', { name: 'Reports', exact: true }).click();
  const doodTh = page.locator('thead tr').nth(2).locator('th', { hasText: 'Rehearsal' }).first();
  await expect(doodTh).toBeVisible();
  await expect(doodTh).toHaveCSS('background-color', 'rgb(22, 163, 74)');

  const fisherRow = page.locator('tr', { hasText: 'FISHERMAN' }).first();
  await expect(fisherRow).toContainText('R');
  // The Rehearsal count column appears in the totals strip (last matching th).
  const rehColHeader = page.locator('thead th', { hasText: /^Rehearsal$/ }).last();
  await expect(rehColHeader).toBeVisible();

  // ---- Report designer: dayType field (invariant: section days carry no
  // ---- status, so the column renders empty but the pipeline survives) ------
  await page.getByRole('banner').getByRole('button', { name: 'Design', exact: true }).click();
  await page.getByRole('button', { name: 'Reports Designer', exact: true }).click();
  await page.evaluate(() => { (window as any).print = () => {}; });
  await page.getByRole('button', { name: 'Print', exact: true }).click();
  await page.getByRole('button', { name: /Print \/ Save PDF/ }).click();
  const pages = page.locator('.report-root .report-page');
  await expect(pages.first()).toBeVisible({ timeout: 15000 });
  await page.waitForFunction(() => document.querySelector('.report-root')?.getAttribute('data-paginated') === 'true', null, { timeout: 15000 });
  const texts = await pages.evaluateAll(els => (els as HTMLElement[]).map(el => el.innerText || ''));
  const all = texts.join('\n');
  expect(all).not.toContain('Rehearsal');
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await expect(page.getByRole('button', { name: 'Design', exact: true })).toBeVisible();

  // ---- Delete the custom type → in-use status falls back to no status ------
  await page.getByRole('banner').getByRole('button', { name: 'Calendar', exact: true }).click();
  await page.getByRole('main').getByRole('button', { name: 'Calendar', exact: true }).click();
  await page.getByRole('button', { name: 'Day Types', exact: true }).click();
  const rehRow = sidebar.getByText('Rehearsal', { exact: true }).locator('..');
  await rehRow.locator('button', { has: page.locator('svg.lucide-trash-2') }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();

  const after = await page.evaluate(() => {
    const p = (window as any).__lemonSchedule.getProject();
    const v = p.versions.find((x: any) => x.id === p.activeVersionId);
    return {
      dayTypes: p.dayTypes.map((t: any) => t.key),
      statuses: (v.nonShootDates || []).map((n: any) => n.status).filter(Boolean),
    };
  });
  expect(after.dayTypes).toEqual(['hold', 'travel', 'holiday']);
  expect(after.statuses).not.toContain('rehearsal');

  await page.getByRole('main').getByRole('button', { name: 'Calendar', exact: true }).click();
  await expect(page.locator(`[data-date-key="${lastSectionDate}"]`).getByText('REHEARSAL', { exact: true })).toHaveCount(0);
});