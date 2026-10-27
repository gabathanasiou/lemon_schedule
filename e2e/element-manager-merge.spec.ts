import { test, expect } from '@playwright/test';
import { openSeededProject, nameCell, bridgeProject, seedLeadCast } from './helpers';

type Project = any;

const getProject = bridgeProject;

async function openElementManagerCategory(page: import('@playwright/test').Page, category: string) {
  await openSeededProject(page);
  await seedControlledData(page);
  await page.getByRole('button', { name: 'Breakdown', exact: true }).click();
  await page.getByRole('button', { name: 'Element Manager' }).click();
  await page.locator('aside').getByRole('button', { name: new RegExp(category) }).click();
}

/** Replace a row's name: Enter commits the field (commit-on-blur, roadmap 250). */
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
      // Drop the seed's case-variant 'Gun' too: two stored ids ('Gun'/'gun')
      // collapse case-insensitively on update and would fake a duplicate.
      ...(p.breakdownElements?.props || []).filter((e: any) => !['cannon', 'gun'].includes(e.name.toLowerCase())),
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

test.describe('Element Manager commit-on-blur', () => {
  test.describe.configure({ mode: 'serial' });

  test('there is no Save/Revert button anymore', async ({ page }) => {
    await openElementManagerCategory(page, 'Vehicles');
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Saved', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Revert', exact: true })).toHaveCount(0);
  });

  test('renaming an element to an existing name commits and asks to merge', async ({ page }) => {
    await openElementManagerCategory(page, 'Vehicles');

    // FISHING BOAT (element, 0 scenes) -> fishing boat (element, 3 scenes).
    // Enter blurs the field: the commit fires and the collision asks to merge.
    await renameRow(page, 'FISHING BOAT', 'fishing boat');

    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('dialog')).toContainText('Merge Elements');
    await expect(page.getByRole('dialog')).toContainText('fishing boat');

    await page.getByRole('button', { name: 'Merge', exact: true }).click();

    const project = await getProject(page);
    const ids = vehicleNames(project);
    expect(ids.some(i => i.toLowerCase() === 'fishing boat')).toBe(true);
    expect(ids.filter(i => i.toLowerCase() === 'fishing boat').length).toBe(1);
    const counts = sceneCounts(project);
    expect(counts['fishing boat']).toBe(3);
    expect(Object.keys(counts).some(k => k === 'fishing boat')).toBe(true);
  });

  test('a plain unique rename commits on Enter without the merge dialog', async ({ page }) => {
    // Props has no pre-existing duplicates — a unique rename commits directly
    await openElementManagerCategory(page, 'Props');

    await renameRow(page, 'gun', 'cannon');

    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(nameCell(page, 'cannon')).toBeVisible({ timeout: 5000 });

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

  test('tabbing out of the name field commits it too', async ({ page }) => {
    await openElementManagerCategory(page, 'Vehicles');

    const input = nameCell(page, 'ship');
    await input.click();
    await page.keyboard.press('Meta+A');
    await page.keyboard.type('schooner', { delay: 20 });
    await page.keyboard.press('Tab');

    const project = await getProject(page);
    expect(vehicleNames(project)).toContain('schooner');
    expect(vehicleNames(project)).not.toContain('ship');
    expect((project.scenes || []).some((s: any) => (s.vehicles || '').includes('schooner'))).toBe(true);
  });

  test('cancelling the merge restores the committed name', async ({ page }) => {
    await openElementManagerCategory(page, 'Vehicles');

    await renameRow(page, 'FISHING BOAT', 'fishing boat');
    await expect(page.getByRole('dialog')).toContainText('Merge Elements');
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();

    // The edit was never committed; the store and the field show the old name.
    const project = await getProject(page);
    expect(vehicleNames(project)).toContain('FISHING BOAT');
    await expect(nameCell(page, 'FISHING BOAT')).toBeVisible({ timeout: 5000 });
  });

  test('switching sub-tabs no longer prompts — the rename already committed', async ({ page }) => {
    await openElementManagerCategory(page, 'Vehicles');

    await renameRow(page, 'FISHING BOAT', 'ski boat');

    const project0 = await getProject(page);
    expect(vehicleNames(project0)).toContain('ski boat');

    await page.getByRole('button', { name: 'Sheet', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    // the Sheet sub-tab is showing (the rename left without a prompt)
    await expect(page.getByText('Sheet Order')).toBeVisible({ timeout: 5000 });

    // and the committed rename survived the round trip
    await page.getByRole('button', { name: 'Element Manager' }).click();
    await expect(nameCell(page, 'ski boat')).toBeVisible({ timeout: 5000 });
  });

  test('Cmd+Z / Cmd+Shift+Z undo and redo the committed rename (one step)', async ({ page }) => {
    await openElementManagerCategory(page, 'Vehicles');

    await renameRow(page, 'FISHING BOAT', 'ski boat');

    const undoBtn = page.getByRole('button', { name: 'Undo (Cmd+Z)' });
    const redoBtn = page.getByRole('button', { name: 'Redo (Cmd+Shift+Z)' });
    await expect(undoBtn).toBeEnabled();

    await page.keyboard.press('Meta+z');
    await expect(nameCell(page, 'FISHING BOAT')).toBeVisible({ timeout: 5000 });

    // Real keyboards report key:'Z' (uppercase) with Shift — press the real
    // payload so the handler's normalization is what is under test (roadmap 238).
    await page.keyboard.press('Meta+Shift+Z');
    await expect(nameCell(page, 'ski boat')).toBeVisible({ timeout: 5000 });
    // the redo consumed the future stack
    await expect(redoBtn).toBeDisabled();
    await expect(undoBtn).toBeEnabled();
  });

  test('adding and deleting rows commit immediately and undo as one step each', async ({ page }) => {
    await openElementManagerCategory(page, 'Props');

    const undoBtn = page.getByRole('button', { name: 'Undo (Cmd+Z)' });
    const beforeCount = await page.locator('tbody tr').count();

    // A new row is local until it gets a name — naming it commits it.
    await page.getByRole('button', { name: 'Add Props' }).click();
    const blank = page.locator('tbody textarea[data-manager-name]').last();
    await blank.fill('torch');
    await blank.press('Enter');
    await expect(nameCell(page, 'torch')).toBeVisible({ timeout: 5000 });
    expect((await getProject(page)).breakdownElements?.props?.some((e: any) => e.name === 'torch')).toBe(true);

    await undoBtn.click();
    await expect(nameCell(page, 'torch')).toHaveCount(0);
    expect((await getProject(page)).breakdownElements?.props?.some((e: any) => e.name === 'torch')).toBe(false);

    // delete the 'gun' row: the removal commits at once; undo brings it back
    const gunRow = page.locator('tr', { has: nameCell(page, 'gun') });
    await gunRow.locator('button').last().click();
    await expect(nameCell(page, 'gun')).toHaveCount(0);
    expect((await getProject(page)).breakdownElements?.props?.some((e: any) => e.name === 'gun')).toBe(false);

    await undoBtn.click();
    await expect(nameCell(page, 'gun')).toBeVisible({ timeout: 5000 });
    expect((await getProject(page)).breakdownElements?.props?.some((e: any) => e.name === 'gun')).toBe(true);

    await expect(page.locator('tbody tr')).toHaveCount(beforeCount);
  });

  test('sorting is a view-only op — no undo entry, order kept', async ({ page }) => {
    await openElementManagerCategory(page, 'Vehicles');

    const namesBefore = await page.locator('tbody textarea[data-manager-name]').evaluateAll(inputs => inputs.map(i => (i as HTMLTextAreaElement).value));
    const undoBtn = page.getByRole('button', { name: 'Undo (Cmd+Z)' });
    const firstValue = await page.locator('tbody textarea[data-manager-name]').first().inputValue();

    await page.getByRole('button', { name: 'Sort ▾' }).click();
    await page.getByRole('menuitem', { name: 'By Name' }).click();
    await expect(page.locator('tbody textarea[data-manager-name]').first()).not.toHaveValue(firstValue, { timeout: 5000 });
    const namesSorted = await page.locator('tbody textarea[data-manager-name]').evaluateAll(inputs => inputs.map(i => (i as HTMLTextAreaElement).value));
    expect(namesSorted).not.toEqual(namesBefore);

    // the seed LOAD cleared history and sorting dispatches nothing → no undo
    await expect(undoBtn).toBeDisabled();
    await expect(page.locator('tbody textarea[data-manager-name]').first()).not.toHaveValue(firstValue);
  });

  test('Board IDs: Auto-ID numbers the category; renumbering never touches scenes', async ({ page }) => {
    await openElementManagerCategory(page, 'Props');
    const before = await getProject(page);
    const scenesBefore = before.scenes.map((s: any) => ({ id: s.id, props: s.props || '' }));

    await page.getByRole('button', { name: 'Auto-ID', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();

    await expect.poll(async () => {
      const props = (await getProject(page)).breakdownElements?.props || [];
      return props.every((e: any) => /^\d+$/.test(e.boardId || ''));
    }).toBe(true);

    const numbered = (await getProject(page)).breakdownElements.props;
    expect(new Set(numbered.map((e: any) => e.boardId)).size).toBe(numbered.length);

    // Renumber one element to a fresh number: the registry changes, scenes don't.
    const gun = numbered.find((e: any) => e.name === 'gun');
    const nextFree = String(Math.max(...numbered.map((e: any) => parseInt(e.boardId, 10))) + 1);
    const input = page.locator(`input[data-manager-board-id="${gun.id}"]`);
    await input.click();
    await page.keyboard.press('Meta+A');
    await page.keyboard.type(nextFree, { delay: 20 });
    await page.keyboard.press('Enter');

    await expect.poll(async () => {
      const props = (await getProject(page)).breakdownElements?.props || [];
      return props.find((e: any) => e.id === gun.id)?.boardId;
    }).toBe(nextFree);

    const after = await getProject(page);
    expect(after.scenes.map((s: any) => ({ id: s.id, props: s.props || '' }))).toEqual(scenesBefore);
  });

  test('Board IDs: a duplicate number is rejected and the cell reverts', async ({ page }) => {
    await openElementManagerCategory(page, 'Props');
    await page.getByRole('button', { name: 'Auto-ID', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();

    let props: any[] = [];
    await expect.poll(async () => {
      props = (await getProject(page)).breakdownElements?.props || [];
      return props.every((e: any) => /^\d+$/.test(e.boardId || ''));
    }).toBe(true);

    // Pick ids that are valid CSS attribute values (some seed prop names carry quotes).
    const [first, second] = props.filter((e: any) => /^[A-Za-z0-9 ]+$/.test(e.id));
    const input = page.locator(`input[data-manager-board-id="${second.id}"]`);
    await input.click();
    await page.keyboard.press('Meta+A');
    await page.keyboard.type(first.boardId, { delay: 20 });
    await page.keyboard.press('Enter');

    // The edit never lands: the stored number and the cell both keep the old value.
    await expect.poll(async () => {
      const list = (await getProject(page)).breakdownElements?.props || [];
      return list.find((e: any) => e.id === second.id)?.boardId;
    }).toBe(second.boardId);
    await expect(input).toHaveValue(second.boardId);
  });

  test('cast Details: performer columns are hidden by default and edits commit (roadmap 157)', async ({ page }) => {
    await openSeededProject(page);
    const lead = await seedLeadCast(page);
    await page.getByRole('button', { name: 'Breakdown', exact: true }).click();
    await page.getByRole('button', { name: 'Element Manager' }).click();
    await page.locator('aside').getByRole('button', { name: /Cast/ }).click();

    const detail = page.locator('input[data-manager-cast-detail="performer"]');
    await expect(detail).toHaveCount(0);

    await page.getByRole('button', { name: 'Details', exact: true }).click();
    const input = page.locator('tr', { has: nameCell(page, lead.name) }).locator('input[data-manager-cast-detail="performer"]');
    await input.fill('James Stewart');
    await input.press('Enter');

    await expect.poll(async () => {
      const member = (await getProject(page)).castMembers.find((c: any) => c.id === lead.id);
      return member?.performer;
    }).toBe('James Stewart');
  });
});

/** Roadmap 306 — the Element View panel (manager-launched). */
test.describe('Element View', () => {
  test('picker navigation + property edits persist', async ({ page }) => {
    await openSeededProject(page);
    const lead = await seedLeadCast(page);
    await page.getByRole('button', { name: 'Breakdown', exact: true }).click();
    await page.getByRole('button', { name: 'Element Manager' }).click();
    await page.locator('aside').getByRole('button', { name: /Cast/ }).click();

    const row = page.locator('tr', { has: nameCell(page, lead.name) }).first();
    await row.locator('button[title^="Element view"]').click();
    const modal = page.getByRole('dialog');
    await expect(modal.getByRole('tab', { name: 'Properties' })).toHaveAttribute('aria-selected', 'true');
    await expect(modal.locator('input[data-element-view-field="name"]')).toHaveValue(lead.name);

    // Property edits go through the same UPDATE_CAST_MEMBER path as the table.
    const performer = modal.locator('input[data-element-view-field="performer"]');
    await performer.fill('Panel Artiste');
    await performer.press('Enter');
    await expect.poll(async () => {
      const member = (await getProject(page)).castMembers.find((c: any) => c.id === lead.id);
      return member?.performer;
    }).toBe('Panel Artiste');

    // Prev/next move the panel to another element and back.
    await modal.getByRole('button', { name: 'Next element' }).click();
    await expect(modal.locator('input[data-element-view-field="name"]')).not.toHaveValue(lead.name);
    await modal.getByRole('button', { name: 'Previous element' }).click();
    await expect(modal.locator('input[data-element-view-field="name"]')).toHaveValue(lead.name);
  });
});

test('manager search: a performer hit jumps to Cast and flashes the row', async ({ page }) => {
  await openSeededProject(page);
  const lead = await seedLeadCast(page);
  await page.evaluate(({ id, name }) => {
    (window as any).__lemonSchedule.dispatch({
      type: 'UPDATE_CAST_MEMBER',
      payload: { id, name, performer: 'ZZZ AUDIT' },
    });
  }, { id: lead.id, name: lead.name });

  await page.getByRole('button', { name: 'Breakdown', exact: true }).click();
  await page.getByRole('button', { name: 'Element Manager' }).click();
  const search = page.locator('[data-search-input]');
  await search.click();
  await search.fill('ZZZ AUDIT');

  const hit = page.locator(`[data-search-item="cast::${lead.id}"]`);
  await expect(hit).toContainText('Artiste: ZZZ AUDIT');

  // Field titles are not searchable: the old "Board ID: n" subtitle made
  // "board id" list every element (roadmap 305). The row face is the
  // board-numbered identity.
  await search.fill('board id');
  await expect(page.locator('[data-search-empty]')).toBeVisible();
  await expect(page.locator('[data-search-item]')).toHaveCount(0);
  await search.fill(lead.name.toUpperCase());
  const named = page.locator(`[data-search-item="cast::${lead.id}"]`);
  await expect(named).toContainText(`${lead.id}. ${lead.name.toUpperCase()}`);
  // …and the subtitle is the artiste, not "Board ID: n".
  await expect(named).toContainText('ZZZ AUDIT');

  await hit.click();

  // It opens the record's category and flashes the row (roadmap 172).
  const row = page.locator(`[data-manager-row="${lead.id}"]`);
  await expect(row).toBeVisible();
  await expect.poll(() => row.evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(254, 226, 226)');
});
