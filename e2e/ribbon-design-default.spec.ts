import { test, expect } from '@playwright/test';
import { loadSeedProject, openSeededProject, waitForPersistedProject } from './helpers';

type Project = any;

async function getProject(page: import('@playwright/test').Page): Promise<Project> {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find(k => k.startsWith('lemon_schedule_project_v1'));
    return key ? (window as any).__lemonSchedule.decodeProject(localStorage.getItem(key)!) : null;
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

// Roadmap 233: the designer's EDITING focus is a per-user pref; the stripboard
// DISPLAY layout stays the shared `activeRibbonId` (the split decided for 233).
// A designer pick must therefore never write the project — with two clients
// that write would move the other person's stripboard (silent without one).
test('picking a design in the designer is a per-user pref — the shared stripboard layout is untouched', async ({ page }) => {
  // A second layout whose only distinctive cell is a probe: it renders while
  // it is the EDITED design, never on the stripboard (which shows the shared
  // display layout).
  await openSeededProject(page, (project) => {
    project.ribbonDesigns.push({
      id: 'focus-probe-design',
      name: 'Focus Probe',
      createdAt: Date.now(),
      colWidths: [50, 50],
      rows: [{ id: 'focus-probe-row', name: 'Scene', cells: [{ id: 'focus-probe-a', field: 'sceneNumber' }, { id: 'focus-probe-b', field: 'text', textContent: 'RIBBON PROBE' }] }],
    });
  });
  const before = await page.evaluate(() => {
    const p = (window as any).__lemonSchedule.getProject();
    return {
      activeRibbonId: p.activeRibbonId,
      activeName: p.ribbonDesigns.find((d: any) => d.id === p.activeRibbonId)?.name || '',
    };
  });

  await openDesignTab(page);
  await page.getByRole('button', { name: 'Ribbon Designer', exact: true }).click();
  const editing = page.getByRole('button', { name: /Editing:/ });
  // First open edits the layout the stripboard displays (the fallback).
  await expect(editing).toContainText(before.activeName);

  await page.evaluate(() => {
    const b: any = (window as any).__lemonSchedule;
    (window as any).__seen = [];
    (window as any).__off = b.onAction((a: any) => (window as any).__seen.push(a.type));
  });
  await editing.click();
  await page.getByRole('menuitem', { name: 'Focus Probe' }).click();
  await expect(page.getByText('RIBBON PROBE').first()).toBeVisible();

  const after = await page.evaluate(() => {
    const b: any = (window as any).__lemonSchedule;
    const off = (window as any).__off;
    if (off) off();
    const p = b.getProject();
    return {
      pref: localStorage.getItem('lemon_schedule_ribbon_active_design'),
      activeRibbonId: p.activeRibbonId,
      seen: (window as any).__seen as string[],
    };
  });
  expect(after.pref).toBe('focus-probe-design');
  expect(after.activeRibbonId).toBe(before.activeRibbonId);
  expect(after.seen.filter(t => /RIBBON|REPORT/.test(t))).toEqual([]);

  // The stripboard keeps wearing the shared layout — no probe cell anywhere.
  await page.getByRole('button', { name: 'Schedule', exact: true }).click();
  await expect(page.locator('[data-ribbon-field]').first()).toBeVisible({ timeout: 8000 });
  await expect(page.getByText('RIBBON PROBE')).toHaveCount(0);
});
