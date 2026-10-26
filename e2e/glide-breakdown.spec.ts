import { test, expect } from '@playwright/test';
import {
  ensureProject, openSeededProject, glideCellId, openGlideCellEditor, waitForGlideCellSelected,
} from './helpers';

test.describe('Glide Breakdown Tab', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
  });

  test('renders toolbar and grid container', async ({ page }) => {
    await page.goto('/lemon_schedule/');
    await ensureProject(page);

    const glideBtn = page.getByRole('button', { name: 'Glide Breakdown' });
    await expect(glideBtn).toBeVisible({ timeout: 5000 });
    await glideBtn.click();

    await expect(page.getByRole('button', { name: /Add Scene/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'View' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Info' })).toBeVisible();

    const scroller = page.locator('.dvn-scroller');
    await expect(scroller).toBeAttached();
    const box = await scroller.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(100);
  });

  test('View dropdown menu items are clickable', async ({ page }) => {
    await page.goto('/lemon_schedule/');
    await ensureProject(page);

    const glideBtn = page.getByRole('button', { name: 'Glide Breakdown' });
    await expect(glideBtn).toBeVisible({ timeout: 5000 });
    await glideBtn.click();

    const viewBtn = page.getByRole('button', { name: 'View' });
    await viewBtn.click();

    const biggerItem = page.getByRole('menuitem', { name: 'Bigger' });
    await expect(biggerItem).toBeVisible({ timeout: 3000 });
    await biggerItem.click();
  });

  test('adds scene via button and verifies persistence between views', async ({ page }) => {
    await page.goto('/lemon_schedule/');
    await ensureProject(page);

    const sheetBtn = page.getByRole('button', { name: 'Sheet', exact: true });
    await expect(sheetBtn).toBeVisible({ timeout: 5000 });
    await sheetBtn.click();

    const createFirst = page.getByRole('button', { name: 'Create First Scene' });
    await createFirst.click();

    const glideBtn = page.getByRole('button', { name: 'Glide Breakdown' });
    await glideBtn.click();
    await sheetBtn.click();

    const sceneCount = await page.evaluate(() => (window as any).__lemonSchedule?.getProject()?.scenes?.length ?? 0);
    expect(sceneCount).toBeGreaterThanOrEqual(1);
  });

  test('can add scene directly from Glide Breakdown toolbar', async ({ page }) => {
    await page.goto('/lemon_schedule/');
    await ensureProject(page);

    const glideBtn = page.getByRole('button', { name: 'Glide Breakdown' });
    await expect(glideBtn).toBeVisible({ timeout: 5000 });
    await glideBtn.click();

    const sceneCount = () => (window as any).__lemonSchedule?.getState()?.present?.scenes?.length ?? -1;
    const initialState = { sceneCount: await page.evaluate(sceneCount) };

    await page.getByRole('button', { name: /Add Scene/ }).click();

    await expect.poll(() => page.evaluate(sceneCount), { timeout: 5000 }).toBe(initialState.sceneCount + 1);
  });

  test('range fill: editing one cell writes the value down the selected column (roadmap 139)', async ({ page }) => {
    await openSeededProject(page);
    await page.getByRole('button', { name: 'Glide Breakdown' }).click();
    const scroller = page.locator('.dvn-scroller');
    await expect(scroller).toBeAttached({ timeout: 5000 });
    const sr = await scroller.boundingBox();
    expect(sr).not.toBeNull();

    // Script Day column: row marker 50 + actions 36 + sceneNumber 60 +
    // pageCount 80 = 226, width 80 → centre 266. Desktop font 11 → header 36, row 34.
    const scriptDayX = sr!.x + 226 + 40;
    const headerH = 36;
    const rowH = 34;
    const y0 = sr!.y + headerH + rowH / 2;
    const y2 = sr!.y + headerH + rowH * 2 + rowH / 2;

    // Drag a 3-row range down the column.
    await page.mouse.move(scriptDayX, y0);
    await page.mouse.down();
    await page.mouse.move(scriptDayX, y2, { steps: 8 });
    await page.mouse.up();

    // Type over the anchored cell; committing fills the whole selection.
    // Wait for the drag's selection commit before typing — `editOnType` reads
    // the committed selection and would drop the keystroke otherwise (§E).
    await waitForGlideCellSelected(page, glideCellId(4, 0)); // scriptDay = a11y col 4
    await page.keyboard.type('5');
    const input = page.locator('#portal textarea, #portal input').first();
    await expect(input).toBeAttached({ timeout: 4000 });
    await input.fill('5');
    await input.press('Enter');

    await expect.poll(() => page.evaluate(() =>
      (window as any).__lemonSchedule.getProject().scenes.slice(0, 3).map((s: any) => s.scriptDay),
    ), { timeout: 5000 }).toEqual(['5', '5', '5']);
    // One undo entry for the whole spread.
    expect(await page.evaluate(() => (window as any).__lemonSchedule.pastCount())).toBe(1);
  });

  test('range fill: a single-value entity column (Set) fills vertically with no confirm (roadmap 144)', async ({ page }) => {
    await openSeededProject(page);
    await page.getByRole('button', { name: 'Glide Breakdown' }).click();
    const scroller = page.locator('.dvn-scroller');
    await expect(scroller).toBeAttached({ timeout: 5000 });
    const sr = await scroller.boundingBox();
    expect(sr).not.toBeNull();

    // Set column: row marker 50 + actions 36 + sceneNumber 60 + pageCount 80 +
    // scriptDay 80 + intExt 80 = left 386, width 180 → centre 476.
    const setX = sr!.x + 386 + 90;
    const headerH = 36;
    const rowH = 34;
    const y0 = sr!.y + headerH + rowH / 2;
    const y2 = sr!.y + headerH + rowH * 2 + rowH / 2;

    await page.mouse.move(setX, y0);
    await page.mouse.down();
    await page.mouse.move(setX, y2, { steps: 8 });
    await page.mouse.up();
    // Double-click opens the Set entity dropdown directly (no typing needed).
    // select:false — the drag already made row 0 the current cell; wait for its
    // commit, then activate (§E). Set = a11y col 6 (marker + 5 columns).
    const input = await openGlideCellEditor(page, { x: setX, y: y0 }, glideCellId(6, 0), { select: false });
    await input.fill('MARS');
    await page.keyboard.press('Enter');

    // No confirm for a single-value column; all 3 rows fill.
    await expect.poll(() => page.evaluate(() =>
      (window as any).__lemonSchedule.getProject().scenes.slice(0, 3).map((s: any) => s.set),
    ), { timeout: 5000 }).toEqual(['MARS', 'MARS', 'MARS']);
  });

  test('range fill: a multi-value column (Cast) confirms before replacing the lists (roadmap 144)', async ({ page }) => {
    await openSeededProject(page);
    await page.getByRole('button', { name: 'Glide Breakdown' }).click();
    await expect(page.locator('.dvn-scroller')).toBeAttached({ timeout: 5000 });

    const castOf = () => page.evaluate(() =>
      (window as any).__lemonSchedule.getProject().scenes.slice(0, 3).map((s: any) => s.cast),
    );
    // Cast is Board-ID keyed: type existing members' Board IDs (typing a NAME
    // would create a brand-new blank member + the naming modal, by design).
    const ids: string[] = await page.evaluate(() =>
      ((window as any).__lemonSchedule.getProject().castMembers || []).map((m: any) => String(m.id)),
    );
    expect(ids.length).toBeGreaterThan(1);
    const castIdA = ids[0];
    const castIdB = ids[1];

    // Select 3 rows in the Cast column, double-click the first, type, commit.
    const selectAndEdit = async (value: string) => {
      const sr = (await page.locator('.dvn-scroller').boundingBox())!;
      const castX = sr.x + 956 + 60; // Cast column: 956 → 1076, centre 1016
      const y0 = sr.y + 36 + 17;
      const y2 = sr.y + 36 + 34 * 2 + 17;
      await page.mouse.move(castX, y0);
      await page.mouse.down();
      await page.mouse.move(castX, y2, { steps: 8 });
      await page.mouse.up();
      // select:false — the drag made row 0 the current cell; wait for its
      // commit, then activate (§E). Cast = a11y col 9.
      const input = await openGlideCellEditor(page, { x: castX, y: y0 }, glideCellId(9, 0), { select: false });
      await input.fill(value);
      await page.keyboard.press('Enter');
      await expect(input).toHaveCount(0, { timeout: 4000 });
    };
    const confirmBtn = page.locator('[data-modal-confirm]');

    // Cancel path: only the edited cell changes; the other rows keep their lists.
    const original = await castOf();
    await selectAndEdit(castIdA);
    await expect(confirmBtn).toBeVisible({ timeout: 4000 });
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(confirmBtn).toHaveCount(0, { timeout: 4000 });
    const afterCancel = await castOf();
    expect(afterCancel[1]).toBe(original[1]);
    expect(afterCancel[2]).toBe(original[2]);
    expect(afterCancel[0]).toBe(castIdA);

    // Confirm path, same session (roadmap 180: the second edit must survive
    // the first edit + dialog). The replace confirm folds in the
    // linked-elements cascade (one prompt) and applies the whole fill +
    // cascade as ONE undo entry.
    const before = await page.evaluate(() => (window as any).__lemonSchedule.pastCount());
    await selectAndEdit(castIdB);
    await expect(confirmBtn).toBeVisible({ timeout: 4000 });
    await confirmBtn.click();
    await expect(confirmBtn).toHaveCount(0, { timeout: 4000 });
    await expect.poll(castOf, { timeout: 5000 }).toEqual([castIdB, castIdB, castIdB]);
    expect(await page.evaluate(() => (window as any).__lemonSchedule.pastCount())).toBe(before + 1);
  });

  test('clicking a panel item in the canvas overlay editor commits (context matrix)', async ({ page }) => {
    await openSeededProject(page);
    await page.getByRole('button', { name: 'Glide Breakdown' }).click();
    await expect(page.locator('.dvn-scroller')).toBeAttached({ timeout: 5000 });

    const sr = (await page.locator('.dvn-scroller').boundingBox())!;
    const castX = sr.x + 956 + 60; // Cast column: 956 → 1076, centre 1016
    const y0 = sr.y + 36 + 17;

    // §E select-first open — Cast = a11y col 9, row 0 (fresh grid: no drag).
    const input = await openGlideCellEditor(page, { x: castX, y: y0 }, glideCellId(9, 0));
    await input.click(); // open the suggestions panel on the overlay editor
    await expect(page.locator('.click-outside-ignore')).toBeVisible({ timeout: 4000 });

    const item = page.locator('.click-outside-ignore button:not([data-checked="true"])').first();
    const pickId = (await item.innerText()).replace(/\n/g, '').match(/^(\d+)\./)?.[1];
    expect(pickId).toBeTruthy();
    await item.click();

    // Panel stays open (the pick must not leak into the canvas' handlers) …
    await expect(page.locator('.click-outside-ignore')).toBeVisible();
    // … and Enter on the refocused editor input commits the toggled Cast list.
    await input.click();
    await page.keyboard.press('Enter');
    await expect(page.locator('.click-outside-ignore')).toHaveCount(0, { timeout: 4000 });
    await expect.poll(() => page.evaluate(() =>
      (window as any).__lemonSchedule.getProject().scenes[0].cast,
    ), { timeout: 5000 }).toContain(pickId);
  });
});

test('row filter is display-only, survives collapsing, and restores every row (roadmap 172)', async ({ page }) => {
  await openSeededProject(page);
  await page.getByRole('button', { name: 'Glide Breakdown' }).click();

  const grid = page.locator('[data-presence-grid="breakdown-glide"]');
  const filter = page.locator('[data-glide-filter-root]');
  const trigger = filter.locator('[data-morph-search-trigger]');
  const input = filter.locator('[data-morph-search-input]');
  const total = Number(await grid.getAttribute('data-glide-total-rows'));
  expect(total).toBeGreaterThan(5);

  // Seed-agnostic term: the most common Set value (never hardcode seed content).
  const term = await page.evaluate(() => {
    const p = (window as any).__lemonSchedule.getProject();
    const counts = new Map<string, number>();
    for (const s of p.scenes || []) {
      const v = String(s.set || '').trim();
      if (v) counts.set(v, (counts.get(v) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  });
  test.skip(!term, 'seed has no named sets to filter by');
  const idsBefore = await page.evaluate(() =>
    (window as any).__lemonSchedule.getProject().scenes.map((s: any) => s.id));

  // The collapsed control is a button; clicking it morphs the field open.
  await expect(trigger).toBeVisible();
  await trigger.click();
  await expect(input).toBeFocused();
  await input.fill(term!);

  await expect.poll(async () => Number(await grid.getAttribute('data-glide-visible-rows')))
    .toBeLessThan(total);
  const shown = Number(await grid.getAttribute('data-glide-visible-rows'));
  expect(shown).toBeGreaterThan(0);
  await expect(filter.locator('[data-glide-filter-count]')).toHaveText(`${shown} / ${total}`);

  // Clicking away collapses to the button but KEEPS the filter applied.
  await page.getByRole('button', { name: 'Breakdown', exact: true }).click();
  await expect(trigger).toBeVisible();
  await expect(input).not.toBeFocused();
  await expect(filter.locator('[data-glide-filter-count]')).toHaveText(`${shown} / ${total}`);
  expect(Number(await grid.getAttribute('data-glide-visible-rows'))).toBe(shown);

  // Reopening restores the term; Escape clears it and brings every row back.
  await trigger.click();
  await expect(input).toHaveValue(term!);
  await input.press('Escape');
  await expect.poll(async () => Number(await grid.getAttribute('data-glide-visible-rows'))).toBe(total);
  await expect(filter.locator('[data-glide-filter-count]')).toHaveCount(0);

  // Display-only: filtering never touched or reordered the scenes.
  const idsAfter = await page.evaluate(() =>
    (window as any).__lemonSchedule.getProject().scenes.map((s: any) => s.id));
  expect(idsAfter).toEqual(idsBefore);
});
