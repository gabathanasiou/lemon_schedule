import { test, expect, Page } from '@playwright/test';
import { openSeededProject } from './helpers';

/* EntityDropdown context matrix (regression guard).
 *
 * The primitive is hosted in very different places, each with its own
 * portal/layer setup: stripboard cells (edit mode — `seeded-smoke.spec.ts`),
 * the Glide canvas overlay editor (`glide-breakdown.spec.ts`), modals
 * (`day-types.spec.ts`, `calendar-travel-hold.spec.ts`), the Rules panel
 * (`rules-tab.spec.ts`), the Scene Sheet (here) and POP-OUT WINDOWS (here) —
 * where the panel portals into the popup's own document.
 *
 * The invariant every host shares: a click on a panel item must commit (or
 * toggle) the pick and must NEVER leak into the host surface's own handlers —
 * React events bubble through portals (panel → cell → row → the container
 * whose click clears the per-row editor), which silently dropped multi-select
 * toggles until `DropdownPanel`/`SelectDropdown` isolated their panel roots. */

/** Click the first unchecked item in the open panel; returns its Board ID. */
async function pickUncheckedItem(page: Page): Promise<string> {
  const item = page.locator('#search-menu-panel [data-search-item]:not([aria-selected="true"])').first();
  const id = (await item.innerText()).replace(/\n/g, '').match(/^(\d+)\./)?.[1];
  expect(id).toBeTruthy();
  await item.click();
  return id!;
}

/** The first board row's scene — what both the first Scene Sheet page and the
 *  first stripboard row show. */
function firstBoardScene(page: Page) {
  return page.evaluate(() => {
    const b = (window as any).__lemonSchedule;
    const st = b.getState();
    const version = st.present.versions.find((v: any) => v.id === st.present.activeVersionId);
    const row = version.rows.find((r: any) => r.type === 'SCENE' && r.sceneId && r.containerId !== null);
    return st.present.scenes.find((s: any) => s.id === row?.sceneId)?.id ?? null;
  });
}

function sceneCastOf(page: Page, sceneId: string | null) {
  return page.evaluate((sid) => {
    const b = (window as any).__lemonSchedule;
    const sc = b.getProject().scenes.find((s: any) => s.id === sid);
    return ((sc?.cast as string) || '').split(',').map((x: string) => x.trim());
  }, sceneId);
}

test.describe('entity dropdown contexts', () => {
  test('Scene Sheet: a cast pick from the panel commits to the scene', async ({ page }) => {
    await openSeededProject(page);
    await page.getByRole('button', { name: 'Breakdown', exact: true }).click();
    await page.getByRole('button', { name: 'Sheet', exact: true }).click();
    const navInput = page.getByLabel('Sheet number').first();
    await navInput.click();
    await page.keyboard.press('Meta+A');
    await page.keyboard.type('1');
    await page.keyboard.press('Enter');
    await expect(navInput).toHaveValue('1', { timeout: 5000 });

    const castInput = page.locator('[data-scene-field="cast"]').first().locator('textarea').first();
    await castInput.click();
    await expect(page.locator('#search-menu-panel')).toBeVisible({ timeout: 5000 });
    const id = await pickUncheckedItem(page);

    // Clicking the field moves the pointer off the row (a hover-driven
    // highlight would re-toggle it) and keeps the field focused; Enter commits.
    await castInput.click();
    await page.keyboard.press('Enter');
    await expect(page.locator('#search-menu-panel')).toBeHidden({ timeout: 5000 });
    // The sheet's own field shows the committed list, and the store accepted
    // it on the scene the sheet is showing (order prefs can reorder sheets,
    // so assert the field + a scene that now references the picked Board ID).
    await expect.poll(() => castInput.inputValue()).toContain(id);
    await expect.poll(() => page.evaluate((pid) => {
      const b = (window as any).__lemonSchedule;
      return b.getProject().scenes.some((s: any) =>
        ((s.cast as string) || '').split(',').map((x: string) => x.trim()).includes(pid));
    }, id)).toBe(true);
  });

  test('Popout window: the panel portals into the popup document and commits there', async ({ page, context }) => {
    await openSeededProject(page);
    const [popup] = await Promise.all([
      context.waitForEvent('page'),
      page.getByRole('button', { name: 'Schedule', exact: true }).click({ modifiers: ['Shift'] }),
    ]);
    await expect(popup.locator('button[aria-label="Edit"]')).toBeAttached({ timeout: 8000 });

    const sceneId = await firstBoardScene(page);
    expect(sceneId).toBeTruthy();
    await popup.locator('button[aria-label="Edit"]').click();
    const castCell = popup.locator('[data-ribbon-field="cast"]').first();
    await castCell.click();
    await expect(popup.locator('#search-menu-panel')).toBeVisible({ timeout: 5000 });
    // The floating panel must live in the POPUP document, never the opener's.
    await expect(page.locator('#search-menu-panel')).toHaveCount(0);

    const id = await pickUncheckedItem(popup);
    // The item click must keep the panel open (host clicks must not leak in).
    await expect(popup.locator('#search-menu-panel')).toBeVisible();

    await castCell.locator('input').click();
    await popup.keyboard.press('Enter');
    await expect(popup.locator('#search-menu-panel')).toHaveCount(0);
    await expect.poll(() => sceneCastOf(page, sceneId)).toContain(id);
    await popup.close();
  });
});
