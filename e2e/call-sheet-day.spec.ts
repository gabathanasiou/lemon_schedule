import { test, expect, Page } from '@playwright/test';
import { loadSeedProject, openSeededProject } from './helpers';

// Call Sheet Designer completion (roadmap 10): day-scoped per-day zone editing
// and rendering.

async function openDays(page: Page) {
  await openSeededProject(page);
  await page.getByRole('button', { name: 'Production' }).click();
  await page.getByRole('button', { name: 'Days', exact: true }).click();
  await expect(page.locator('[data-day-manager]')).toBeVisible({ timeout: 8000 });
}

async function openCallSheetEdit(page: Page) {
  const section = page.locator('[data-section="callSheet"]');
  if (!(await section.locator('button', { hasText: 'Edit' }).count())) {
    await section.getByRole('button').first().click();
  }
  await section.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.locator('[data-call-sheet-edit]')).toBeVisible({ timeout: 8000 });
}

const readPinnedMeta = (page: Page, designId: string) => page.evaluate((id) => {
  const b: any = (window as any).__lemonSchedule;
  const p = b.getProject();
  const v = p.versions.find((x: any) => x.id === p.activeVersionId);
  const gov = v.rows.find((r: any) => r.type === 'DAYBREAK' && r.pinned);
  return gov?.daybreakMeta?.callSheets?.[id] || null;
}, designId);

test.describe('Call Sheet Designer (roadmap 10)', () => {
  test('per-day zone edit writes daybreakMeta.callSheets and resets to template', async ({ page }) => {
    await openDays(page);
    await openCallSheetEdit(page);

    const designId = await page.evaluate(() => {
      const b: any = (window as any).__lemonSchedule;
      const p = b.getProject();
      const d = (p.reportDesigns || []).find((x: any) => /call\s*sheet/i.test(x.name)) || (p.reportDesigns || [])[0];
      return d?.id || '';
    });
    expect(designId).not.toBe('');

    // Add a text block into the zone via the palette → per-day storage.
    await page.getByRole('button', { name: 'Text', exact: true }).first().click();
    await expect.poll(async () => {
      const blocks = await readPinnedMeta(page, designId);
      return Array.isArray(blocks) && blocks.length > 0;
    }, { timeout: 5000 }).toBe(true);

    // Reset to template clears the override.
    await page.getByRole('button', { name: /Reset to template/ }).click();
    await expect.poll(async () => (await readPinnedMeta(page, designId)) === null, { timeout: 5000 }).toBe(true);
  });

  test('stored per-day zone content renders in the day-scoped preview', async ({ page }) => {
    const seed = loadSeedProject();
    const project = JSON.parse(seed.raw);
    const design = (project.reportDesigns || []).find((d: any) => /call\s*sheet/i.test(d.name));
    expect(design, 'seed has a Call Sheet design').toBeTruthy();

    design.blocks = [{
      id: 'days', type: 'repeat', collection: 'days', children: [
        { id: 'zone', type: 'callSheetEdit', children: [{ id: 'tpl', type: 'text', text: 'TEMPLATE ZONE' }] },
      ],
    }];
    const version = project.versions.find((v: any) => v.id === project.activeVersionId) || project.versions[0];
    const pinned = version.rows.find((r: any) => r.type === 'DAYBREAK' && r.pinned);
    pinned.daybreakMeta = { ...(pinned.daybreakMeta || {}), callSheets: { [design.id]: [{ id: 'day-t', type: 'text', text: 'PER-DAY CONTENT' }] } };

    await page.addInitScript(({ projectJson, meta }) => {
      const p = JSON.parse(projectJson);
      localStorage.setItem('lemon_schedule_project_v1_' + p.id, JSON.stringify(p));
      localStorage.setItem('lemon_schedule_project_index', JSON.stringify([meta]));
    }, {
      projectJson: JSON.stringify(project),
      meta: { id: project.id, title: project.title, lastModified: Date.now(), createdAt: Date.now() },
    });

    await page.goto('http://localhost:3001/lemon_schedule/');
    await page.getByText(project.title, { exact: true }).first().click({ timeout: 8000 });
    await page.getByRole('button', { name: 'Production' }).click();
    await page.getByRole('button', { name: 'Days', exact: true }).click();
    await expect(page.locator('[data-day-manager]')).toBeVisible({ timeout: 8000 });

    await expect(page.getByText('PER-DAY CONTENT', { exact: false }).first()).toBeVisible({ timeout: 8000 });
    await expect(page.getByText('TEMPLATE ZONE', { exact: false })).toHaveCount(0);
  });
});
