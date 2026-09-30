import { test, expect } from '@playwright/test';
import { openSeededProject } from './helpers';

/* Geometry assertions for the shared positioning engine (roadmap 165):
   a panel near the viewport edge must stay FULLY visible — flip above the
   trigger when there is no room below, never overhang the visual viewport.
   These are silent-break guards (the panels used to hang 100+px off-screen),
   not visual tests. */

test.describe('dropdown positioning (roadmap 165)', () => {
  test('Call Times category menu stays inside the viewport near the bottom edge', async ({ page }) => {
    await openSeededProject(page);
    await page.setViewportSize({ width: 1100, height: 560 });
    await page.getByRole('button', { name: 'Production', exact: true }).click();
    const days = page.getByRole('button', { name: 'Days', exact: true });
    if (await days.count()) await days.first().click();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Call Times' }).click();

    const modal = page.getByRole('dialog').last();
    await expect(modal).toBeVisible({ timeout: 5000 });
    await modal.getByRole('button', { name: 'Category defaults' }).click();

    const addBtn = modal.getByRole('button', { name: 'Add category…' });
    await expect(addBtn).toBeVisible();
    await addBtn.click();

    const menu = page.locator('[data-radix-menu-content]').last();
    await expect(menu).toBeVisible({ timeout: 4000 });

    const vh = 560;
    // Poll until the geometry settles (the open morph ends at the final rect):
    // fully inside the viewport, cap held, flipped above the trigger.
    await expect.poll(async () => {
      const [mb, tb] = await Promise.all([menu.boundingBox(), addBtn.boundingBox()]);
      if (!mb || !tb) return false;
      return mb.y >= 0
        && mb.y + mb.height <= vh
        && mb.height <= 256.5
        && mb.y + mb.height <= tb.y + 1;
    }, { timeout: 4000 }).toBe(true);
  });

  test('Scene Sheet entity panel flips above and never towers over a short viewport', async ({ page }) => {
    await openSeededProject(page);
    await page.setViewportSize({ width: 1100, height: 360 });
    await page.getByRole('button', { name: 'Breakdown', exact: true }).click();
    await page.getByRole('button', { name: 'Sheet', exact: true }).click();

    const setField = page.locator('tr', { has: page.getByText('Set', { exact: true }) }).locator('textarea').first();
    await expect(setField).toBeVisible();
    await setField.click();

    const panel = page.locator('.click-outside-ignore').last();
    await expect(panel).toBeVisible({ timeout: 4000 });

    const vh = 360;
    // Never taller than the viewport, never sticking out on either edge.
    await expect.poll(async () => {
      const pb = await panel.boundingBox();
      if (!pb) return false;
      return pb.y >= 0 && pb.height <= vh && pb.y + pb.height <= vh;
    }, { timeout: 4000 }).toBe(true);
  });
});
