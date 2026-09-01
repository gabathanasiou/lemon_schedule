import { test, expect } from '@playwright/test';
import { openSeededProject, nameCell } from './helpers';

type Project = any;

/** The live project straight from the store (sync post-dispatch) — faster and
 *  more correct than waiting for the debounced localStorage save. */
async function getProject(page: import('@playwright/test').Page): Promise<Project> {
  return page.evaluate(() => (window as any).__lemonSchedule?.getProject());
}

async function openElementManagerCategory(page: import('@playwright/test').Page, category: string) {
  await openSeededProject(page);
  await seedControlledData(page);
  await page.getByRole('button', { name: 'Breakdown', exact: true }).click();
  await page.getByRole('button', { name: 'Element Manager' }).click();
  await page.locator('aside').getByRole('button', { name: new RegExp(category) }).click();
}

async function renameRow(page: import('@playwright/test').Page, from: string, to: string) {
  const input = nameCell(page, from);
  await input.click();
  await page.keyboard.press('Meta+A');
  await page.keyboard.type(to, { delay: 20 });
  await page.keyboard.press('Enter');
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

/** Replaces the seed's vehicles/props with a CONTROLLED dataset so the merge
 *  behavior is deterministic regardless of the seed project: vehicle elements
 *  with known scene counts (fishing boat×3, boat×5, ship×1, car×2, CAR×1,
 *  FISHING BOAT×0) and a 'gun' prop in 15 scenes. Uses LOAD (which clears
 *  undo history) so the reset never pollutes the tests' undo assertions. */
async function seedControlledData(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    const b = (window as any).__lemonSchedule;
    const p = b.getProject();
    const vehicles = [
      { id: 'FISHING BOAT', name: 'FISHING BOAT' },
      { id: 'fishing boat', name: 'fishing boat' },
      { id: 'boat', name: 'boat' },
      { id: 'ship', name: 'ship' },
      { id: 'car', name: 'car' },
      { id: 'CAR', name: 'CAR' },
    ];
    const props = [
      { id: 'gun', name: 'gun' },
      ...(p.breakdownElements?.props || []).filter((e: any) => e.name !== 'cannon'),
    ];
    const next = {
      ...p,
      breakdownElements: { ...(p.breakdownElements || {}), vehicles, props },
      scenes: p.scenes.map((s: any, i: number) => {
        let v = '';
        if (i < 3) v = 'fishing boat';
        else if (i < 8) v = 'boat';
        else if (i === 8) v = 'ship';
        else if (i === 9) v = 'car';
        else if (i === 10) v = 'CAR';
        return { ...s, vehicles: v, props: i < 15 ? 'gun' : '' };
      }),
    };
    b.dispatch({ type: 'LOAD', payload: next });
  });
}

test.describe('Element Manager merge/save', () => {
  test.describe.configure({ mode: 'serial' });

  test('renaming an element to an existing name merges and replaces it in scenes', async ({ page }) => {
    await openElementManagerCategory(page, 'Vehicles');

    // FISHING BOAT (element, 0 scenes) -> fishing boat (element, 3 scenes)
    await renameRow(page, 'FISHING BOAT', 'fishing boat');

    await page.getByRole('button', { name: 'Save', exact: true }).click();

    // Warning dialog lists the merge with the affected scene count
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('dialog')).toContainText('Merge Elements');
    await expect(page.getByRole('dialog')).toContainText('fishing boat');

    await page.getByRole('button', { name: 'Merge & Save' }).click();

    const project = await getProject(page);
    const ids = vehicleNames(project);
    expect(ids.some(i => i.toLowerCase() === 'fishing boat')).toBe(true);
    expect(ids.filter(i => i.toLowerCase() === 'fishing boat').length).toBe(1);
    const counts = sceneCounts(project);
    expect(counts['fishing boat']).toBe(3);
    expect(counts['fishing boat']).toBe(counts['fishing boat']); // case-collapsed
    expect(Object.keys(counts).some(k => k === 'fishing boat')).toBe(true);
  });

  test('renaming into a scene-only name (no element) still merges and rewrites scenes', async ({ page }) => {
    await openElementManagerCategory(page, 'Vehicles');

    // fishing boat (3 scenes) -> boat (scene-only, 5 scenes, no element entry)
    await renameRow(page, 'fishing boat', 'boat');

    await page.getByRole('button', { name: 'Save', exact: true }).click();

    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('dialog')).toContainText('fishing boat');
    await expect(page.getByRole('dialog')).toContainText('boat');

    await page.getByRole('button', { name: 'Merge & Save' }).click();

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

    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('dialog')).toContainText('ski boat');

    await page.getByRole('button', { name: 'Merge & Save' }).click();

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
    const row = page.locator('tr', { has: nameCell(page, 'FISHING BOAT') });
    await row.locator('button').last().click();

    await page.getByRole('button', { name: 'Save', exact: true }).click();

    // The dialog reports the pending case-variant absorption (car/CAR pair) — confirm the save
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: 'Merge & Save' }).click();

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
    const row = page.locator('tr', { has: nameCell(page, 'ship') });
    await row.locator('button').last().click();

    await page.getByRole('button', { name: 'Save', exact: true }).click();

    // car/CAR absorption is reported — confirm the save
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: 'Merge & Save' }).click();

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

    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: 'Merge & Save' }).click();

    const project = await getProject(page);
    const counts = sceneCounts(project);
    // values swapped, not collapsed: old "boat" scenes (5) became "fishing boat",
    // old "fishing boat" scenes (3) became "boat"
    expect(counts['boat']).toBe(3);
    expect(counts['fishing boat']).toBe(5);
  });

  test('undo after a merge restores the original elements and scenes', async ({ page }) => {
    await openElementManagerCategory(page, 'Vehicles');

    const boatCount = (p: Project) => (p.breakdownElements?.vehicles || []).filter((e: any) => e.name.toLowerCase() === 'fishing boat').length;

    await renameRow(page, 'FISHING BOAT', 'fishing boat');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: 'Merge & Save' }).click();

    // The case-variants collapsed into a single element.
    const afterMerge = await getProject(page);
    expect(boatCount(afterMerge)).toBe(1);

    // lowercase 'z' — Playwright's Meta+Z yields key 'Z' which the app's handler misses
    await page.keyboard.press('Meta+z');

    // debounced localStorage write — poll until the restored state lands
    await expect.poll(async () => boatCount(await getProject(page)), { timeout: 8000 }).toBe(2);

    const afterUndo = await getProject(page);
    const counts = sceneCounts(afterUndo);
    expect(counts['fishing boat']).toBe(3);
  });

  test('switching tabs with unsaved changes prompts BEFORE leaving; merge modal completes and switches', async ({ page }) => {
    await openElementManagerCategory(page, 'Vehicles');

    await renameRow(page, 'FISHING BOAT', 'fishing boat');

    // click a top tab -> the prompt fires while the element manager is still mounted
    await page.getByRole('button', { name: 'Schedule' }).click();
    await expect(page.getByRole('dialog')).toContainText('Unsaved Changes', { timeout: 5000 });
    await expect(page.locator('main')).toContainText('Element Manager');

    // confirm -> the save runs in place, so the merge modal can appear
    await page.getByRole('button', { name: 'Confirm' }).click();
    await expect(page.getByRole('dialog')).toContainText('Merge Elements', { timeout: 5000 });

    // merge & save -> merge applies AND the pending tab switch completes
    await page.getByRole('button', { name: 'Merge & Save' }).click();
    await expect(page.locator('main')).toContainText('Day Breaks');

    const project = await getProject(page);
    const vehicles = (project.breakdownElements.vehicles || []).filter((e: any) => /fishing boat/i.test(e.name));
    expect(vehicles.length).toBe(1);
    expect(vehicles[0].name.toLowerCase()).toBe('fishing boat');
  });

  test('cancelling the unsaved-changes prompt discards and switches without a second prompt', async ({ page }) => {
    await openElementManagerCategory(page, 'Vehicles');

    await renameRow(page, 'FISHING BOAT', 'fishing boat');

    await page.getByRole('button', { name: 'Calendar' }).click();
    await expect(page.getByRole('dialog')).toContainText('Unsaved Changes');
    await page.getByRole('button', { name: 'Cancel' }).click();

    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.locator('main')).toContainText('Boneyard');
    const project = await getProject(page);
    expect(project.breakdownElements.vehicles.some((e: any) => e.name === 'FISHING BOAT')).toBe(true);
  });

  test('a clean save confirmed from the prompt switches to the tab immediately', async ({ page }) => {
    await openElementManagerCategory(page, 'Props');

    await renameRow(page, 'gun', 'cannon');

    await page.getByRole('button', { name: 'Schedule' }).click();
    await expect(page.getByRole('dialog')).toContainText('Unsaved Changes');
    await page.getByRole('button', { name: 'Confirm' }).click();

    await expect(page.locator('main')).toContainText('Day Breaks');
    const project = await getProject(page);
    const names = (project.breakdownElements?.props || []).map((e: any) => e.name);
    expect(names).toContain('cannon');
    expect(names).not.toContain('gun');
  });

  test('switching sub-tabs prompts before leaving the element manager', async ({ page }) => {
    await openElementManagerCategory(page, 'Vehicles');

    await renameRow(page, 'FISHING BOAT', 'fishing boat');

    await page.getByRole('button', { name: 'Sheet', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('Unsaved Changes');
    await expect(page.locator('main')).toContainText('Element Manager');
  });

  test('top Undo button undoes unsaved edits as one step per operation, Redo re-applies', async ({ page }) => {
    await openElementManagerCategory(page, 'Vehicles');

    // a multi-character rename is ONE undoable operation
    await renameRow(page, 'FISHING BOAT', 'ski boat');

    const undoBtn = page.getByRole('button', { name: 'Undo (Cmd+Z)' });
    const redoBtn = page.getByRole('button', { name: 'Redo (Cmd+Shift+Z)' });
    // enabled even though the store history is empty (local history exists)
    await expect(undoBtn).toBeEnabled();
    await expect(redoBtn).toBeDisabled();

    await undoBtn.click();
    await expect(nameCell(page, 'FISHING BOAT')).toBeVisible({ timeout: 5000 });
    await expect(nameCell(page, 'ski boat')).toHaveCount(0);
    await expect(undoBtn).toBeDisabled();
    await expect(redoBtn).toBeEnabled();

    await redoBtn.click();
    await expect(nameCell(page, 'ski boat')).toBeVisible({ timeout: 5000 });
    await expect(nameCell(page, 'FISHING BOAT')).toHaveCount(0);
    await expect(undoBtn).toBeEnabled();
  });

  test('Cmd+Z / Cmd+Shift+Z undo and redo unsaved element manager edits', async ({ page }) => {
    await openElementManagerCategory(page, 'Vehicles');

    await renameRow(page, 'FISHING BOAT', 'ski boat');

    await page.keyboard.press('Meta+z');
    await expect(nameCell(page, 'FISHING BOAT')).toBeVisible({ timeout: 5000 });

    await page.keyboard.press('Meta+Shift+z');
    await expect(nameCell(page, 'ski boat')).toBeVisible({ timeout: 5000 });
  });

  test('adding and deleting rows each undo as one step', async ({ page }) => {
    await openElementManagerCategory(page, 'Props');

    const undoBtn = page.getByRole('button', { name: 'Undo (Cmd+Z)' });
    const beforeCount = await page.locator('tbody tr').count();

    await page.getByRole('button', { name: 'Add Props' }).click();
    await expect(page.locator('tbody tr')).toHaveCount(beforeCount + 1);
    await undoBtn.click();
    await expect(page.locator('tbody tr')).toHaveCount(beforeCount);

    // delete the 'gun' row, then undo brings it back
    const gunRow = page.locator('tr', { has: nameCell(page, 'gun') });
    await gunRow.locator('button').last().click();
    await expect(nameCell(page, 'gun')).toHaveCount(0);
    await undoBtn.click();
    await expect(nameCell(page, 'gun')).toBeVisible({ timeout: 5000 });
  });

  test('sorting undoes as one step', async ({ page }) => {
    await openElementManagerCategory(page, 'Vehicles');

    const namesBefore = await page.locator('tbody textarea[data-manager-name]').evaluateAll(inputs => inputs.map(i => (i as HTMLTextAreaElement).value));
    const undoBtn = page.getByRole('button', { name: 'Undo (Cmd+Z)' });
    const firstValue = await page.locator('tbody textarea[data-manager-name]').first().inputValue();

    await page.getByRole('button', { name: 'Sort ▾' }).click();
    await page.getByRole('menuitem', { name: 'By Name' }).click();
    await expect(page.locator('tbody textarea[data-manager-name]').first()).not.toHaveValue(firstValue, { timeout: 5000 });
    const namesSorted = await page.locator('tbody textarea[data-manager-name]').evaluateAll(inputs => inputs.map(i => (i as HTMLTextAreaElement).value));
    expect(namesSorted).not.toEqual(namesBefore);

    await undoBtn.click();
    await expect(page.locator('tbody textarea[data-manager-name]').first()).toHaveValue(firstValue, { timeout: 5000 });
    const namesAfter = await page.locator('tbody textarea[data-manager-name]').evaluateAll(inputs => inputs.map(i => (i as HTMLTextAreaElement).value));
    expect(namesAfter).toEqual(namesBefore);
  });
});
