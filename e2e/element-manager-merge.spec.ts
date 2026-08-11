import { test, expect } from '@playwright/test';
import { openSeededProject } from './helpers';

type Project = any;

async function getProject(page: import('@playwright/test').Page): Promise<Project> {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find(k => k.startsWith('lemon_schedule_project_v1'));
    return key ? JSON.parse(localStorage.getItem(key)!) : null;
  });
}

async function openElementManagerCategory(page: import('@playwright/test').Page, category: string) {
  await openSeededProject(page);
  await page.getByRole('button', { name: 'Breakdown', exact: true }).click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Element Manager' }).click();
  await page.waitForTimeout(600);
  await page.locator('aside').getByRole('button', { name: new RegExp(category) }).click();
  await page.waitForTimeout(400);
}

async function renameRow(page: import('@playwright/test').Page, from: string, to: string) {
  const input = page.locator(`input[value="${from}"]`).first();
  await input.click();
  await page.keyboard.press('Meta+A');
  await page.keyboard.type(to, { delay: 20 });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
}

function sceneCounts(project: Project): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const s of project.scenes) {
    if (!s.vehicles) continue;
    for (const item of s.vehicles.split(',').map((x: string) => x.trim().toLowerCase()).filter(Boolean)) {
      counts[item] = (counts[item] || 0) + 1;
    }
  }
  return counts;
}

function vehicleNames(project: Project): string[] {
  return (project.breakdownElements?.vehicles || []).map((e: any) => e.name);
}

test.describe('Element Manager merge/save', () => {
  test.describe.configure({ mode: 'serial' });

  test('renaming an element to an existing name merges and replaces it in scenes', async ({ page }) => {
    await openElementManagerCategory(page, 'Vehicles');

    // FISHING BOAT (element, 0 scenes) -> fishing boat (element, 3 scenes)
    await renameRow(page, 'FISHING BOAT', 'fishing boat');

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForTimeout(400);

    // Warning dialog lists the merge with the affected scene count
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('dialog')).toContainText('Merge Elements');
    const block = page.getByRole('dialog').getByText('FISHING BOAT', { exact: true });
    await expect(block).toBeVisible();

    await page.getByRole('button', { name: 'Merge & Save' }).click();
    await page.waitForTimeout(1200);

    const project = await getProject(page);
    const ids = vehicleNames(project);
    expect(ids).toContain('fishing boat');
    expect(ids.filter(i => i.toLowerCase() === 'fishing boat').length).toBe(1);
    const counts = sceneCounts(project);
    expect(counts['fishing boat']).toBe(3);
    expect(counts['fishing boat']).toBe(counts['fishing boat']); // case-collapsed
    expect(Object.keys(counts).some(k => k === 'fishing boat')).toBe(true);

    // cast untouched
    expect((project.castMembers || []).length).toBe(23);
  });

  test('renaming into a scene-only name (no element) still merges and rewrites scenes', async ({ page }) => {
    await openElementManagerCategory(page, 'Vehicles');

    // fishing boat (3 scenes) -> boat (scene-only, 5 scenes, no element entry)
    await renameRow(page, 'fishing boat', 'boat');

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForTimeout(400);

    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('dialog')).toContainText('fishing boat');
    await expect(page.getByRole('dialog')).toContainText('boat');

    await page.getByRole('button', { name: 'Merge & Save' }).click();
    await page.waitForTimeout(1200);

    const project = await getProject(page);
    const counts = sceneCounts(project);
    expect(counts['boat']).toBe(8); // 5 original + 3 renamed
    expect(counts['fishing boat']).toBeUndefined();
  });

  test('renaming BOTH duplicates to the same new name merges into one entry', async ({ page }) => {
    await openElementManagerCategory(page, 'Vehicles');

    await renameRow(page, 'fishing boat', 'ski boat');
    await renameRow(page, 'FISHING BOAT', 'ski boat');

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForTimeout(400);

    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });
    const block = page.getByRole('dialog').getByText('fishing boat, FISHING BOAT', { exact: false });
    await expect(block).toBeVisible();

    await page.getByRole('button', { name: 'Merge & Save' }).click();
    await page.waitForTimeout(1200);

    const project = await getProject(page);
    const ids = vehicleNames(project);
    expect(ids.filter(i => i === 'ski boat').length).toBe(1);
    expect(ids.some(i => i.toLowerCase() === 'fishing boat')).toBe(false);
    const counts = sceneCounts(project);
    expect(counts['ski boat']).toBe(3);
    expect(counts['fishing boat']).toBeUndefined();
  });

  test('a plain unique rename saves without the merge dialog', async ({ page }) => {
    // Props has no pre-existing duplicates — a unique rename must save directly
    await openElementManagerCategory(page, 'Props');

    await renameRow(page, 'gun', 'cannon');

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForTimeout(800);

    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeVisible({ timeout: 5000 });

    const project = await getProject(page);
    const names = (project.breakdownElements?.props || []).map((e: any) => e.name);
    expect(names).toContain('cannon');
    expect(names).not.toContain('gun');
    const counts: Record<string, number> = {};
    for (const s of project.scenes) {
      if (!s.props) continue;
      for (const item of s.props.split(',').map((x: string) => x.trim().toLowerCase()).filter(Boolean)) {
        counts[item] = (counts[item] || 0) + 1;
      }
    }
    expect(counts['cannon']).toBe(15);
    expect(counts['gun']).toBeUndefined();
  });

  test('deleting a case-duplicate row absorbs it without touching the surviving scenes', async ({ page }) => {
    await openElementManagerCategory(page, 'Vehicles');

    // Delete the FISHING BOAT row (case-variant of fishing boat, used in 3 scenes)
    const row = page.locator('tr', { has: page.locator('input[value="FISHING BOAT"]') });
    await row.locator('button').last().click();
    await page.waitForTimeout(200);

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForTimeout(400);

    // The dialog reports the pending case-variant absorption (car/CAR pair) — confirm the save
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: 'Merge & Save' }).click();
    await page.waitForTimeout(1200);

    const project = await getProject(page);
    const ids = vehicleNames(project);
    expect(ids.includes('FISHING BOAT')).toBe(false);
    expect(ids).toContain('fishing boat');
    // scenes keep the real value untouched
    const counts = sceneCounts(project);
    expect(counts['fishing boat']).toBe(3);
    // absorbed merges are not trashed
    const trashed = (project.elementsTrash || []).filter((t: any) => t.category === 'vehicles');
    expect(trashed.length).toBe(0);
  });

  test('deleting a unique element removes it from scenes and pushes to trash', async ({ page }) => {
    await openElementManagerCategory(page, 'Vehicles');

    // ship is unique: 1 scene, 1 element
    const row = page.locator('tr', { has: page.locator('input[value="ship"]') });
    await row.locator('button').last().click();
    await page.waitForTimeout(200);

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForTimeout(400);

    // car/CAR absorption is reported — confirm the save
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: 'Merge & Save' }).click();
    await page.waitForTimeout(1200);

    const project = await getProject(page);
    expect(vehicleNames(project)).not.toContain('ship');
    const counts = sceneCounts(project);
    expect(counts['ship']).toBeUndefined();
    const trashed = (project.elementsTrash || []).filter((t: any) => t.category === 'vehicles' && t.element.id === 'ship');
    expect(trashed.length).toBe(1);
  });

  test('swapping two names keeps scene values distinct (atomic rename)', async ({ page }) => {
    await openElementManagerCategory(page, 'Vehicles');

    // boat -> fishing boat first, then fishing boat -> boat (swap)
    await renameRow(page, 'boat', 'fishing boat');
    await renameRow(page, 'fishing boat', 'boat');

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForTimeout(400);

    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: 'Merge & Save' }).click();
    await page.waitForTimeout(1200);

    const project = await getProject(page);
    const counts = sceneCounts(project);
    // values swapped, not collapsed: old "boat" scenes (5) became "fishing boat",
    // old "fishing boat" scenes (3) became "boat"
    expect(counts['boat']).toBe(3);
    expect(counts['fishing boat']).toBe(5);
  });

  test('undo after a merge restores the original elements and scenes', async ({ page }) => {
    await openElementManagerCategory(page, 'Vehicles');

    await renameRow(page, 'FISHING BOAT', 'fishing boat');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForTimeout(400);
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: 'Merge & Save' }).click();
    await page.waitForTimeout(1200);

    const afterMerge = await getProject(page);
    expect(afterMerge.breakdownElements.vehicles.some((e: any) => e.id === 'FISHING BOAT')).toBe(false);

    // lowercase 'z' — Playwright's Meta+Z yields key 'Z' which the app's handler misses
    await page.keyboard.press('Meta+z');

    // debounced localStorage write — poll until the restored state lands
    await expect.poll(async () => {
      const p = await getProject(page);
      return p ? p.breakdownElements?.vehicles?.some((e: any) => e.id === 'FISHING BOAT') : false;
    }, { timeout: 8000 }).toBe(true);

    const afterUndo = await getProject(page);
    const counts = sceneCounts(afterUndo);
    expect(counts['fishing boat']).toBe(3);
  });
});
