import { test, expect } from '@playwright/test';
import { loadSeedProject, waitForPersistedProject } from './helpers';

type Project = any;

async function getProject(page: import('@playwright/test').Page): Promise<Project> {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find(k => k.startsWith('lemon_schedule_project_v1'));
    return key ? JSON.parse(localStorage.getItem(key)!) : null;
  });
}

async function seedProject(page: import('@playwright/test').Page, mutate: (p: Project) => void) {
  const seed = loadSeedProject().data;
  const project = JSON.parse(JSON.stringify(seed));
  mutate(project);
  const meta = JSON.stringify({ id: project.id, title: project.title, lastModified: Date.now(), createdAt: Date.now() });
  const projectJson = JSON.stringify(project);
  await page.addInitScript(({ projectJson, meta }) => {
    const project = JSON.parse(projectJson);
    localStorage.setItem('lemon_schedule_project_v1_' + project.id, JSON.stringify(project));
    localStorage.setItem('lemon_schedule_project_index', JSON.stringify([JSON.parse(meta)]));
  }, { projectJson, meta });
  await page.goto('http://localhost:3001/lemon_schedule/');
  await page.getByText(project.title, { exact: true }).first().click({ timeout: 8000 });
  await expect(page.getByRole('button', { name: 'Breakdown', exact: true })).toBeVisible({ timeout: 10000 });
}

async function openDesignTab(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Design' }).click();
}

test.describe('ribbon design default save', () => {
  test('no "save new design" prompt when the active design id is stale and nothing was edited', async ({ page }) => {
    // ALBOH - Real style: activeRibbonId points to a design that no longer exists
    await seedProject(page, p => { p.activeRibbonId = 'nonexistent-design-id'; });

    await openDesignTab(page);

    // no prompt on entering the tab either (StrictMode double-mount)
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // leave the design tab without touching anything
    await page.getByRole('button', { name: 'Reports', exact: true }).click();
    
    await expect(page.getByRole('dialog')).toHaveCount(0);
    // the stale active id was repaired to a real design on load
    await waitForPersistedProject(page, "p.activeRibbonId === p.ribbonDesigns[0].id");
    const project = await getProject(page);
    expect(project.activeRibbonId).toBe(project.ribbonDesigns[0].id);
  });

  test('edits on the repaired design save live to the store (no silent loss)', async ({ page }) => {
    await seedProject(page, p => { p.activeRibbonId = 'nonexistent-design-id'; });

    await openDesignTab(page);
    // select a cell, then assign the Wardrobe field from the palette
    await page.locator('[data-cell-id]').first().click();
    await page.getByRole('button', { name: /Wardrobe/ }).click();
    await waitForPersistedProject(page, "JSON.stringify(p.ribbonDesigns).includes('wardrobe')");

    await page.getByRole('button', { name: 'Reports', exact: true }).click();
        await expect(page.getByRole('dialog')).toHaveCount(0);

    const project = await getProject(page);
    const active = project.ribbonDesigns.find((d: any) => d.id === project.activeRibbonId);
    expect(active).toBeTruthy();
    const fields = active.rows.flatMap((r: any) => r.cells.map((c: any) => c.field));
    expect(fields).toContain('wardrobe');
  });
});
